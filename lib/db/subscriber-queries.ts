import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "./client";
import { subscriber } from "./schema";

/**
 * The only module that touches the `subscriber` table (AGENTS.md 7.5). The
 * action calls these; it never builds a query, and no SQL for this table exists
 * anywhere else.
 *
 * **Soft delete is applied on every read**, per the schema's own rule: a row
 * with `deleted_at` set is treated as no row for subscribing, and as an
 * already-settled one for unsubscribing (an erased person must not be told
 * their token is unknown, and must certainly not be resurrected onto the list
 * by a stray link).
 */

/**
 * How long a confirmation link is good for.
 *
 * **A judgement, not a measurement.** The `email-best-practices` skill's
 * `email-capture.md` gives a 24-48 hour band and nothing narrower; 48 is the
 * generous end of it, chosen because the failure mode of "too short" is a
 * person who read their mail the next morning being told to start again, and
 * the failure mode of "too long" is a token sitting in an inbox — which the
 * single-use guard and the rotation on resend already bound. Revisit it against
 * real confirmation timings rather than treating it as fitted.
 */
export const CONFIRMATION_TTL_HOURS = 48;

/** The same number in the words the email uses, so the template and the guard
    cannot drift apart. */
export const CONFIRMATION_TTL_WORDS = "48 hours";

/**
 * 32 bytes from the CSPRNG, base64url so it survives a query string without
 * escaping. Verified against `node:crypto` — `randomBytes` is synchronous and
 * throws rather than returning weak bytes if the pool is not seeded, and
 * `"base64url"` is a supported `BufferEncoding`.
 *
 * **Never a uuid derived from the row and never a hash of the address**
 * (AGENTS.md 8.3): possession of the confirmation token is the entire proof
 * that a person controls the inbox, so anything derivable from public data
 * would defeat the mechanism it exists to provide.
 */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export type SubscribeOutcome =
  /** A confirmation is owed. Fresh row or rotated token — the caller cannot
      tell, and does not need to. */
  | { state: "pending"; id: string; confirmationToken: string }
  /** Already on the list. **No token, no state change, no email**, and the
      action still reports success to the browser: see the enumeration note in
      `app/_actions/newsletter.ts`. */
  | { state: "already-confirmed" };

/**
 * One row per address, upserted on the unique email index.
 *
 * **`onConflictDoUpdate`, not a read followed by a write.** Two simultaneous
 * submissions of the same address would both find no row and both insert; the
 * unique index would reject one of them with an error the person did nothing to
 * deserve. Postgres settles it in one statement instead.
 *
 * **`setWhere` is what encodes "confirmed means leave it alone".** The update
 * is skipped for a live confirmed row, so `returning()` yields nothing — and
 * that is the *only* reason it can yield nothing, which is what makes the empty
 * result a reliable signal rather than an ambiguity. A soft-deleted row is
 * excluded from that guard by the `is not null` arm, so an erased address that
 * subscribes again starts a fresh lifecycle.
 *
 * The transition timestamps are cleared on the way back to `pending`: a
 * `confirmed_at` sitting on a pending row would read as "this address is
 * confirmed" to step 7's submissions view and to any later query that trusts
 * it. `created_at` keeps the audit trail of when the address first arrived.
 *
 * `unsubscribe_token` is deliberately **not** rotated — it is the stable one,
 * and rotating it would break the unsubscribe link in every message already
 * delivered to that person.
 */
export async function upsertSubscriber(email: string): Promise<SubscribeOutcome> {
  const [row] = await getDb()
    .insert(subscriber)
    .values({
      email,
      status: "pending",
      confirmationToken: newToken(),
      confirmationTokenSentAt: new Date(),
      unsubscribeToken: newToken(),
    })
    .onConflictDoUpdate({
      target: subscriber.email,
      set: {
        status: "pending",
        confirmationToken: sql`excluded.confirmation_token`,
        confirmationTokenSentAt: sql`excluded.confirmation_token_sent_at`,
        confirmedAt: null,
        unsubscribedAt: null,
        deletedAt: null,
      },
      /* The existing row, not the proposed one: unqualified column references
         on this side of ON CONFLICT resolve to the target table. */
      setWhere: or(
        ne(subscriber.status, "confirmed"),
        isNotNull(subscriber.deletedAt),
      ),
    })
    .returning({
      id: subscriber.id,
      confirmationToken: subscriber.confirmationToken,
    });

  if (!row) return { state: "already-confirmed" };
  return {
    state: "pending",
    id: row.id,
    confirmationToken: row.confirmationToken,
  };
}

export type ConfirmOutcome =
  | {
      state: "confirmed";
      id: string;
      email: string;
      unsubscribeToken: string;
    }
  | { state: "already-confirmed" }
  | { state: "expired" }
  | { state: "unsubscribed" }
  | { state: "unknown" };

/**
 * `pending` → `confirmed`, and **single-use by construction**: the status is
 * part of the `WHERE`, so a replayed link updates nothing rather than restamping
 * `confirmed_at` and sending a second welcome. Expiry is read from
 * `confirmation_token_sent_at` and never from `created_at`.
 *
 * When the conditional update matches nothing, one follow-up read classifies
 * why — and that read is not an oracle: it answers only to someone already
 * holding a 32-byte token, and it never sees an address.
 */
export async function confirmSubscriberByToken(
  token: string,
): Promise<ConfirmOutcome> {
  const db = getDb();
  const cutoff = new Date(Date.now() - CONFIRMATION_TTL_HOURS * 3_600_000);

  const [row] = await db
    .update(subscriber)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(
      and(
        eq(subscriber.confirmationToken, token),
        eq(subscriber.status, "pending"),
        isNull(subscriber.deletedAt),
        gt(subscriber.confirmationTokenSentAt, cutoff),
      ),
    )
    .returning({
      id: subscriber.id,
      email: subscriber.email,
      unsubscribeToken: subscriber.unsubscribeToken,
    });

  if (row) return { state: "confirmed", ...row };

  const [existing] = await db
    .select({
      status: subscriber.status,
      sentAt: subscriber.confirmationTokenSentAt,
      deletedAt: subscriber.deletedAt,
    })
    .from(subscriber)
    .where(eq(subscriber.confirmationToken, token))
    .limit(1);

  if (!existing || existing.deletedAt) return { state: "unknown" };
  if (existing.status === "confirmed") return { state: "already-confirmed" };
  if (existing.status === "unsubscribed") return { state: "unsubscribed" };
  /* Still pending, so the only remaining reason the update matched nothing is
     the age of the token. */
  if (!existing.sentAt || existing.sentAt <= cutoff) return { state: "expired" };
  return { state: "unknown" };
}

export type UnsubscribeOutcome =
  | { state: "unsubscribed" }
  | { state: "already-unsubscribed" }
  | { state: "unknown" };

/**
 * Any live status → `unsubscribed`, stamping `unsubscribed_at`.
 *
 * **Idempotent**: unsubscribing twice is a success. A mail provider's one-click
 * endpoint may retry, a person may click the link in two different issues, and
 * neither is an error to report. It also never reveals whether the token
 * belonged to a confirmed or a merely pending row — the two are the same
 * outcome from outside.
 *
 * A soft-deleted row reports `already-unsubscribed`: the person is gone, they
 * are certainly not receiving mail, and telling them their token is unknown
 * would be both alarming and false.
 */
export async function unsubscribeByToken(
  token: string,
): Promise<UnsubscribeOutcome> {
  const db = getDb();

  const [row] = await db
    .update(subscriber)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(
      and(
        eq(subscriber.unsubscribeToken, token),
        ne(subscriber.status, "unsubscribed"),
        isNull(subscriber.deletedAt),
      ),
    )
    .returning({ id: subscriber.id });

  if (row) return { state: "unsubscribed" };

  const [existing] = await db
    .select({ id: subscriber.id })
    .from(subscriber)
    .where(eq(subscriber.unsubscribeToken, token))
    .limit(1);

  return existing ? { state: "already-unsubscribed" } : { state: "unknown" };
}

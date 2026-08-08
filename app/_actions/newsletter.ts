"use server";

import { ipAddress, waitUntil } from "@vercel/functions";
import { checkBotId } from "botid/server";
import { headers } from "next/headers";
import * as z from "zod";

import {
  confirmSubscriberByToken,
  unsubscribeByToken,
  upsertSubscriber,
} from "../../lib/db/subscriber-queries";
import {
  sendNewsletterConfirmation,
  sendNewsletterWelcome,
} from "../../lib/email/newsletter";
import {
  checkNewsletterAddressLimit,
  checkNewsletterIpLimit,
  checkNewsletterTokenLimit,
  formatRetry,
} from "../../lib/rate-limit";
import {
  newsletterFieldsSchema,
  type NewsletterSubmitResult,
  type NewsletterTokenResult,
} from "../../lib/validation/newsletter";

/**
 * Newsletter signup, double opt-in — build step 4.
 *
 * **A copy of `app/_actions/demo-request.ts`, not an invention.** Step 2
 * established the write path AGENTS.md 10 specifies and said in terms that
 * steps 4 and 5 copy its shape; the stages below carry 10's own letters, in
 * 10's own order. Every deviation is named where it happens, and there are
 * three: an extra per-address limit after the parse, no field-level rejection
 * on the token paths, and an already-confirmed address that reports success.
 *
 * Lives in `app/_actions/` rather than `app/journal/actions.ts` because the
 * two token functions belong to `/newsletter/*` while the signup belongs to
 * `/journal` — three routes, one flow, no single owner (AGENTS.md 6.3).
 *
 * **Nothing personal is ever logged** (AGENTS.md 8.3 rule 2) — not the address,
 * not a token, not on the success path and not in a catch.
 */

const GENERIC_FAILURE =
  "We couldn't record that just now. Please try again in a moment.";

const TOKEN_FAILURE =
  "We couldn't process that link just now. Please try again in a moment.";

/* A token is validated by *lookup* and never by shape (AGENTS.md 12): it is
   either a row or it is nothing. This bound exists only so a megabyte of
   garbage never reaches a query — it is a guard, not a format check. */
const tokenSchema = z.string().trim().min(1).max(256);

export async function subscribeToNewsletter(
  input: unknown,
): Promise<NewsletterSubmitResult> {
  // -- a. BotID -----------------------------------------------------------
  // `instrumentation-client.ts` names the paths this covers, and a path missing
  // from that list makes this call fail rather than pass. `/journal` was added
  // there in the same change as this file.
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return { ok: false, error: GENERIC_FAILURE };
    }
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- b. Rate limit, keyed by IP -----------------------------------------
  /* Wrapped as `{ headers }` rather than passed bare — `ipAddress` does
     `"headers" in input ? input.headers : input`, and Next 16's headers object
     *has* a `headers` property that is not itself a `Headers`, so passing it
     directly throws `headers.get is not a function`. The trap is recorded in
     `docs/backend.md`, step 2. */
  const ip = ipAddress({ headers: await headers() }) ?? "unknown";
  try {
    const limit = await checkNewsletterIpLimit(ip);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many requests. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed, as step 2 does: an unlimited public write path is worse
    // than a form that is briefly unavailable, and 8.2 rule 4 requires the
    // failure be visible rather than a silent success.
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- c. Parse, with the same schema the leaf ran -------------------------
  const parsed = newsletterFieldsSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Check the marked field and try again.",
      fieldErrors: { email: fieldErrors.email?.[0] },
    };
  }
  const { email } = parsed.data;

  /* -- b again, per address ----------------------------------------------
     **The limit that actually matters, and it has to run here.** Stage b's IP
     limit bounds how often one client submits; it does nothing about *whose*
     inbox those five submissions point at. This one bounds confirmation sends
     per address, and it needs the canonical lowercased address that stage c
     produces — so it sits after the parse and before the write, which is still
     before anything expensive. The key is a sha256, never the address itself. */
  try {
    const limit = await checkNewsletterAddressLimit(email);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `A confirmation was already sent to that address. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- d. Authorise -------------------------------------------------------
  // Skipped: this path is public by design (AGENTS.md 11). Possession of the
  // confirmation token is the only capability this flow ever grants, and it is
  // proved by receiving the email rather than by a session.

  // -- e. Write -----------------------------------------------------------
  let outcome: Awaited<ReturnType<typeof upsertSubscriber>>;
  try {
    outcome = await upsertSubscriber(email);
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- f. Email -----------------------------------------------------------
  /* **A failed email never fails the write** (AGENTS.md 10 rule 4), and
     `waitUntil` for the reason step 3 recorded: the band swaps to its success
     state on this result, and making a person wait on a third party for
     best-effort work is backwards. Outside a Vercel request context `waitUntil`
     is a no-op and the already-started promise floats, which is why the send is
     still observable against `next dev`. */
  if (outcome.state === "pending") {
    waitUntil(
      sendNewsletterConfirmation({
        subscriberId: outcome.id,
        email,
        confirmationToken: outcome.confirmationToken,
      }),
    );
  }

  /* **An already-confirmed address returns the same success as a new one**, and
     that is a deliberate deviation from `email-capture.md`, which offers
     "You're already subscribed! [Manage preferences]". That copy is written for
     a signed-in preference centre, where the person has already proved who they
     are. On an anonymous public form it is a membership oracle: anyone could
     type an address and learn whether it is on the list. The cost is that a
     genuinely subscribed person re-subscribing gets no second email — which is
     the correct behaviour anyway. */
  return { ok: true };
}

export async function confirmSubscription(
  token: unknown,
): Promise<NewsletterTokenResult> {
  const guard = await guardTokenRequest(token);
  if (!guard.ok) return guard;

  let outcome: Awaited<ReturnType<typeof confirmSubscriberByToken>>;
  try {
    outcome = await confirmSubscriberByToken(guard.token);
  } catch {
    return { ok: false, error: TOKEN_FAILURE };
  }

  if (outcome.state === "confirmed") {
    waitUntil(
      sendNewsletterWelcome({
        subscriberId: outcome.id,
        email: outcome.email,
        unsubscribeToken: outcome.unsubscribeToken,
      }),
    );
  }

  return { ok: true, state: outcome.state };
}

export async function unsubscribe(
  token: unknown,
): Promise<NewsletterTokenResult> {
  const guard = await guardTokenRequest(token);
  if (!guard.ok) return guard;

  try {
    const outcome = await unsubscribeByToken(guard.token);
    return { ok: true, state: outcome.state };
  } catch {
    return { ok: false, error: TOKEN_FAILURE };
  }
}

/**
 * Stages a to c for the two token actions, which take a capability rather than
 * a form and so have no field to hang an error on.
 *
 * Stage d is skipped for the same reason as above: the token *is* the
 * authorisation, and re-checking it against a session would defeat the point of
 * a link that works from an inbox.
 */
async function guardTokenRequest(
  token: unknown,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const verification = await checkBotId();
    if (verification.isBot) return { ok: false, error: TOKEN_FAILURE };
  } catch {
    return { ok: false, error: TOKEN_FAILURE };
  }

  const ip = ipAddress({ headers: await headers() }) ?? "unknown";
  try {
    const limit = await checkNewsletterTokenLimit(ip);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many requests. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: TOKEN_FAILURE };
  }

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, error: TOKEN_FAILURE };

  return { ok: true, token: parsed.data };
}

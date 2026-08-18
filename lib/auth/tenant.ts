import "server-only";

import { checkLimit, formatRetry, type RateLimitPolicy } from "../rate-limit";
import { getCurrentMembership, type CurrentMembership } from "./organization";
import { getCurrentAccount } from "./server";

/**
 * Stages **b** and **d** of AGENTS.md 10, for every authenticated Server
 * Action: resolve the session, resolve the tenant, enforce the deletion lock,
 * run the caller's own authorisation, spend the caller's rate limit — and hand
 * back the membership and the two ids everything else is scoped by.
 *
 * **One gate, prompt 122** (architecture candidate 3, `docs/architecture.md`).
 * It replaces `resolveTenant` and `resolveMembershipForWrite`, which were cut
 * on *what they returned* rather than on *what they enforced*: the limiter half
 * was the security-relevant, fail-closed half, and it was re-implemented at
 * five sites outside the module that owns it. A hardening applied here now
 * reaches all 21 authenticated writes rather than the ten that happened to pick
 * the limiter-bearing sibling.
 *
 * ---
 *
 * **The organisation id never crosses the trust boundary.** It is resolved here
 * from the session's membership row, and no caller may accept one from a
 * request. A tenant id taken from a browser would be the whole multi-tenancy
 * failure in a single line.
 *
 * `getCurrentMembership()` is the primitive rather than
 * `authorizeOrganization(organizationId)` — the latter takes an id, and the only
 * way an action could obtain one is from the request, which is exactly what must
 * not happen. The two are the same check; this one takes no argument to get
 * wrong.
 *
 * **Aetherfield's own `staff` and `admin` roles grant nothing here**
 * (AGENTS.md 11.1). Nothing in this module reads `account.role`.
 *
 * **Nothing is logged**, on no path and in no catch (AGENTS.md 8.3 rule 2).
 */

export type TenantGate =
  | {
      ok: true;
      membership: CurrentMembership;
      userId: string;
      organizationId: string;
    }
  | { ok: false; error: string };

/**
 * The four sentences a caller owes its own user.
 *
 * They are a **parameter rather than constants here** because the copy is
 * flow-specific — "sign in again to import activity data" is the right sentence
 * on `/activity` and the wrong one on `/targets`. Passing them in is what let
 * every extraction into this module be behaviour-identical: each call site
 * passes the exact strings it already had.
 */
export type TenantMessages = {
  /** No session at all. */
  signedOut: string;
  /** A session, but no membership row. */
  noOrganization: string;
  /**
   * A membership row, but the organisation has an open deletion request —
   * prompt 73.
   *
   * **A fourth message rather than a reuse of `noOrganization`**, because that
   * sentence tells the person to create an organisation and they have one; it
   * is being erased. Passed per-flow like the other three, so each surface says
   * what it means on that surface.
   *
   * Required even under `lock: "allow-locked"`, where it is unreachable: one
   * sentence set is one type, and an optional-by-mode field would be a fifth
   * shape in the union below for no behavioural gain.
   */
  organizationLocked: string;
  /** The lookup, the limiter, or either failing. */
  failure: string;
};

/**
 * `TenantMessages` plus the one sentence only a limiter-bearing call can
 * produce.
 *
 * `throttled` is a builder rather than a string because the retry window is
 * only known here. **`formatRetry` is applied inside the gate**, so the
 * seconds-to-prose rule lives in one place and a call site can never format it
 * differently; the builder receives the finished phrase and decides only the
 * sentence around it ("too many changes" on a factor edit, "too many imports"
 * on a bulk upload).
 */
export type TenantWriteMessages = TenantMessages & {
  throttled: (retry: string) => string;
};

type TenantGateShared = {
  /**
   * `"enforce"` (the default) refuses a pending-deletion organisation before
   * the limiter is touched.
   *
   * `"allow-locked"` is `app/account/actions.ts`'s deletion pair and nothing
   * else: restoring a locked organisation is the one thing a locked
   * organisation may do, and without the exception the lock would be a state
   * with no exit. It is **spelled at the call site** rather than hidden in a
   * private helper, which is the point of making it a mode.
   */
  lock?: "enforce" | "allow-locked";
  /**
   * Stage **d**, run after the lock and **before** the limiter, so a refusal
   * spends no token. Returns the refusal sentence, or `null` to proceed.
   *
   * A non-owner probing a control must not consume the owner's budget for it,
   * which is why this hook exists rather than leaving the caller to check the
   * role after the gate returns.
   */
  authorize?: (membership: CurrentMembership) => string | null;
};

/**
 * **`throttled` is required exactly when `limiter` is passed, and the signature
 * is what enforces it** — a limiter with no sentence is a compile error rather
 * than a runtime surprise. `limiter?: undefined` on the first shape is what
 * makes `if (options.limiter)` narrow to the second.
 */
export type TenantGateOptions =
  | (TenantGateShared & {
      messages: TenantMessages;
      /** Omitted where the caller spends no token — today only the read-shaped
          stage b of `generateNarrative`, which spends its limiter later. */
      limiter?: undefined;
    })
  | (TenantGateShared & {
      messages: TenantWriteMessages;
      /** A policy key rather than a function — architecture candidate 5
          (`docs/architecture.md`, prompt 126). The call site still names the
          limiter it has always spent; it now does so by looking one up in
          `lib/rate-limit/`'s `POLICIES` table instead of importing a
          function. `RateLimitPolicy` is a closed string-literal union, so an
          unknown key is still a compile error — only a plausible-but-wrong one
          (`"target-write"` where `"report-write"` was meant) gets through,
          which was equally true of importing the wrong symbol.

          **`"cron-sweep"` is excluded**, not merely unused: this gate always
          supplies `membership.account.user.id` as the identifier, and
          `checkLimit`'s own overload (`lib/rate-limit/index.ts`) rejects an
          identifier on that one policy. Narrowing here is what makes passing
          it a compile error at this call site too, rather than one only
          `checkLimit` would catch. */
      limiter: Exclude<RateLimitPolicy, "cron-sweep">;
    });

/**
 * **The order is fixed here and cannot be got wrong at a call site:**
 * session → tenant → lock → `authorize` → limiter.
 *
 * `@upstash/ratelimit`'s `limit()` spends a token on the call, so every cheap
 * refusal precedes it. **Why the limiter comes after the session and not
 * before it** is the one documented departure from AGENTS.md 10's public-form
 * stage order: the limit is keyed by the user id, and there is no key without
 * the session. Every authenticated action in this repository already makes it.
 *
 * **It fails closed.** A limiter that throws returns `failure`, not a pass: an
 * unlimited write path is worse than a control that is briefly unavailable, and
 * AGENTS.md 8.2 rule 4 wants the failure visible rather than a silent success.
 *
 * A signed-out or organisation-less caller gets a handled `{ ok: false }` and
 * never a redirect and never a throw (AGENTS.md 10 rule 2). `proxy.ts`'s
 * redirect is optimistic and is not the enforcement (AGENTS.md 7.3, 11.2
 * rule 1); this is.
 *
 * **The membership and the two ids are both returned** because they are the
 * same value at two widths — the ids *are* `membership.account.user.id` and
 * `membership.organization.id`. Returning both costs nothing derived and leaves
 * every existing call-site body untouched.
 */
export async function resolveTenant(
  options: TenantGateOptions,
): Promise<TenantGate> {
  const { messages } = options;

  let membership: CurrentMembership | null;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: messages.failure };
  }

  if (!membership) {
    /* Two ordinary states, told apart so the message is honest: signed out, or
       signed in with no organisation. Neither says anything about another
       tenant. `getCurrentMembership` resolves the account itself, so reaching
       here means that lookup did not throw and this one will not either; the
       catch is belt and braces. */
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? messages.noOrganization : messages.signedOut,
    };
  }

  /* The lock — prompt 73. Every authenticated action that resolves its tenant
     here refuses while a deletion request is open, with no call-site edit
     beyond the fourth sentence above. It runs **before** the limit: a locked
     organisation is refused without spending a token. */
  if ((options.lock ?? "enforce") === "enforce" && membership.pendingDeletion) {
    return { ok: false, error: messages.organizationLocked };
  }

  /* Stage d, where a caller has one. The role it reads was re-read from
     Postgres by `getCurrentMembership` on this request rather than trusted from
     the session payload (AGENTS.md 11.2 rule 5). */
  const refusal = options.authorize?.(membership);
  if (refusal) return { ok: false, error: refusal };

  if (options.limiter) {
    try {
      const limit = await checkLimit(options.limiter, membership.account.user.id);
      if (!limit.allowed) {
        return {
          ok: false,
          error: options.messages.throttled(
            formatRetry(limit.retryAfterSeconds),
          ),
        };
      }
    } catch {
      return { ok: false, error: messages.failure };
    }
  }

  return {
    ok: true,
    membership,
    userId: membership.account.user.id,
    organizationId: membership.organization.id,
  };
}

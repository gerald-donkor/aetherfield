import "server-only";

import { formatRetry, type RateLimitOutcome } from "../rate-limit";
import { getCurrentMembership, type CurrentMembership } from "./organization";
import { getCurrentAccount } from "./server";

/**
 * Stages **b** and **d** of AGENTS.md 10, for every authenticated Server
 * Action: resolve the session, resolve the tenant, and hand back the two ids
 * everything else is scoped by.
 *
 * **Extracted from `app/activity/actions.ts` at build step 11**, behaviour
 * identical, because a second action file needing the same primitive is not a
 * reason to have two copies of an authorisation check. `app/targets/actions.ts`
 * is the second caller.
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

export type TenantResolution =
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; error: string };

/**
 * The three sentences a caller owes its own user.
 *
 * They are a **parameter rather than constants here** because the copy is
 * flow-specific — "sign in again to import activity data" is the right sentence
 * on `/activity` and the wrong one on `/targets`. Passing them in is what let
 * this extraction be behaviour-identical for step 9's file: it passes the exact
 * strings it already had.
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
   */
  organizationLocked: string;
  /** The lookup itself failed. */
  failure: string;
};

/**
 * A signed-out or organisation-less caller gets a handled `{ ok: false }` and
 * never a redirect and never a throw (AGENTS.md 10 rule 2). `proxy.ts`'s
 * redirect is optimistic and is not the enforcement (AGENTS.md 7.3, 11.2
 * rule 1); this is.
 */
export async function resolveTenant(
  messages: TenantMessages,
): Promise<TenantResolution> {
  let account: Awaited<ReturnType<typeof getCurrentAccount>>;
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    account = await getCurrentAccount();
    membership = account ? await getCurrentMembership() : null;
  } catch {
    return { ok: false, error: messages.failure };
  }

  /* Two states, told apart deliberately: a signed-out caller needs to sign in,
     and a signed-in caller with no organisation needs to create one. Neither
     message says anything about another tenant. */
  if (!account) return { ok: false, error: messages.signedOut };
  if (!membership) return { ok: false, error: messages.noOrganization };

  /* The lock. Every authenticated action that resolves its tenant here refuses
     while a deletion request is open, with no call-site edit beyond the fourth
     sentence above. `/account`'s restore control deliberately does not go
     through this path — it is the one thing a locked organisation may do. */
  if (membership.pendingDeletion) {
    return { ok: false, error: messages.organizationLocked };
  }

  return {
    ok: true,
    userId: membership.account.user.id,
    organizationId: membership.organization.id,
  };
}

/* -------------------------------------------------------------------------- */
/*  The same stage b, for the actions that need the role as well as the ids    */
/* -------------------------------------------------------------------------- */

/**
 * `resolveTenant`'s sibling, for a write whose stage **d** reads the tenant
 * role: it resolves the same session and the same tenant, enforces the same
 * deletion lock, then **spends a rate limit** and hands back the whole
 * membership rather than two ids.
 *
 * **Extracted at prompt 98 from seven copies**, behaviour-identical — six in
 * `app/activity/actions.ts` (`setFactorMapping`, `createCustomFactor`,
 * `importCustomFactors`, `retireCustomFactor`, `editFactorSet`,
 * `retireFactorSet`) and one private copy in `app/account/actions.ts`. The
 * preambles were diffed against each other before they were collapsed and
 * varied in exactly two things, both now parameters: which limiter is spent,
 * and which sentences are returned. That was the finding — security-relevant
 * code in seven copies is code where a hardening applied to one silently leaves
 * six behind.
 *
 * **Why the limiter comes after the session and not before it.** The limit is
 * keyed by the user id, and there is no key without the session. That is the
 * one ordering difference from AGENTS.md 10's public-form stage order, and it
 * is the same one every authenticated action in this repository already makes.
 *
 * **It fails closed.** A limiter that throws returns `failure`, not a pass: an
 * unlimited write path is worse than a control that is briefly unavailable, and
 * AGENTS.md 8.2 rule 4 wants the failure visible rather than a silent success.
 *
 * **Nothing is logged** — not the user id, not the organisation id, not the
 * input, and not in either catch (AGENTS.md 8.3 rule 2).
 */
export type MembershipResolution =
  | { ok: true; membership: CurrentMembership }
  | { ok: false; error: string };

/**
 * `TenantMessages` plus the one sentence this path can produce and
 * `resolveTenant` cannot.
 *
 * `throttled` is a builder rather than a string because the retry window is
 * only known here. **`formatRetry` is applied inside the helper**, so the
 * seconds-to-prose rule lives in one place and a call site can never format it
 * differently; the builder receives the finished phrase and decides only the
 * sentence around it ("too many changes" on a factor edit, "too many imports"
 * on a bulk upload).
 */
export type MembershipWriteMessages = TenantMessages & {
  throttled: (retry: string) => string;
};

export async function resolveMembershipForWrite(
  /** Passed as a function, not selected from a registry: the call site names
      the limiter it has always spent, and the set of limiters stays in
      `lib/rate-limit/`. */
  limiter: (identifier: string) => Promise<RateLimitOutcome>,
  messages: MembershipWriteMessages,
): Promise<MembershipResolution> {
  let membership: CurrentMembership | null;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: messages.failure };
  }

  if (!membership) {
    /* Two ordinary states, told apart so the message is honest: signed out, or
       signed in with no organisation. Neither says anything about another
       tenant. */
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? messages.noOrganization : messages.signedOut,
    };
  }

  /* The lock — prompt 73. These callers resolve their membership directly
     because stage d needs the role, so they do not pass through
     `resolveTenant`'s check and the marker is enforced here instead. It runs
     **before** the limit: a locked organisation is refused without spending a
     token. */
  if (membership.pendingDeletion) {
    return { ok: false, error: messages.organizationLocked };
  }

  try {
    const limit = await limiter(membership.account.user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: messages.throttled(formatRetry(limit.retryAfterSeconds)),
      };
    }
  } catch {
    return { ok: false, error: messages.failure };
  }

  return { ok: true, membership };
}

import "server-only";

import { getCurrentMembership } from "./organization";
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

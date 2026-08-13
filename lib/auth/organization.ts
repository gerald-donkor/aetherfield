import "server-only";

import { redirect } from "next/navigation";

import {
  getMembership,
  listMembershipsForUser,
  type Membership,
} from "../db/organization-queries";
import { isOrganizationRole, type OrganizationRole } from "../validation/organization";
import { getCurrentAccount } from "./server";

/**
 * Tenant resolution and tenant authorisation (AGENTS.md 11).
 *
 * `lib/auth/server.ts` answers "who is this?". This module answers "which
 * organisation is this request for, and may they read it?", and it is the only
 * module that answers it. Build step 9 onwards resolves the tenant here and
 * filters every query on the id it returns (AGENTS.md 9.2 rule 6).
 *
 * ---
 *
 * **The orthogonality invariant, and it is the load-bearing rule of this file.**
 *
 * An Aetherfield staff member is **not** thereby a member of any customer's
 * organisation, and must never be able to read a tenant's data by virtue of
 * being staff (AGENTS.md 11.1). `user.role` — Aetherfield's own `staff` and
 * `admin` — grants **nothing** here. The only thing that grants tenant access
 * is a row in `member` joining this user to this organisation.
 *
 * Nothing in this module reads `account.role`, and nothing added to it may.
 * The temptation arrives at build step 12, when a staff member cannot see a
 * customer's dashboard to debug it; the answer is an explicit, audited
 * impersonation path decided with the user, never a silent bypass here.
 *
 * ---
 *
 * **The role is re-read from Postgres on every call** rather than trusted from
 * Better Auth's session payload (AGENTS.md 11.2 rule 5). The session carries
 * `activeOrganizationId`, and that is used only to *choose* which organisation
 * to look up — never as evidence that the lookup will succeed. A forged or
 * stale value resolves to a membership row that does not exist, and the caller
 * gets `null`.
 */

export type ResolvedOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type CurrentMembership = {
  account: NonNullable<Awaited<ReturnType<typeof getCurrentAccount>>>;
  organization: ResolvedOrganization;
  /** The tenant role, narrowed. A row carrying anything else is treated as no
      membership — the same defensive narrowing `getStaffRole()` applies. */
  role: OrganizationRole;
  /**
   * Set when the organisation has an open deletion request — prompt 73.
   *
   * **The workspace is locked while this is non-null**: `requireOrganization`
   * redirects and `authorizeOrganization` refuses, so every phase-two page and
   * every action that resolves a tenant through them stops. It is carried on
   * the membership rather than checked separately so a caller cannot forget it.
   */
  pendingDeletion: { scheduledPurgeAt: Date } | null;
};

function toResolved(membership: Membership): ResolvedOrganization {
  return {
    id: membership.organizationId,
    name: membership.organizationName,
    slug: membership.organizationSlug,
  };
}

/**
 * The active organisation for the signed-in user, or `null`.
 *
 * Resolution order:
 *
 * 1. The session's `activeOrganizationId`, if it names an organisation this
 *    user is actually a member of. The membership row is what decides;
 *    the session value only picks which row to look for.
 * 2. Otherwise, the user's sole membership — because a user with exactly one
 *    organisation has no meaningful choice to make, and forcing an explicit
 *    "set active" step before their only workspace appears would be a state
 *    with one exit.
 * 3. Otherwise `null` — either no membership at all, or several with none
 *    active, which is a choice the UI must present rather than one this
 *    function should guess.
 */
export async function getCurrentMembership(): Promise<CurrentMembership | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const activeId = account.session.activeOrganizationId;

  const membership = activeId
    ? await getMembership(account.user.id, activeId)
    : await soleMembership(account.user.id);

  if (!membership) {
    /* An `activeOrganizationId` that resolved to nothing is a stale or forged
       session value, not an error: fall back to the sole membership rather
       than locking the user out of an organisation they do belong to. */
    const fallback = activeId ? await soleMembership(account.user.id) : null;
    if (!fallback) return null;
    return build(account, fallback);
  }

  return build(account, membership);
}

async function soleMembership(userId: string): Promise<Membership | null> {
  const memberships = await listMembershipsForUser(userId);
  return memberships.length === 1 ? memberships[0] : null;
}

function build(
  account: NonNullable<Awaited<ReturnType<typeof getCurrentAccount>>>,
  membership: Membership,
): CurrentMembership | null {
  if (!isOrganizationRole(membership.role)) return null;
  return {
    account,
    organization: toResolved(membership),
    role: membership.role,
    pendingDeletion: membership.pendingDeletion,
  };
}

/**
 * The gate every phase-two page and action sits behind.
 *
 * A signed-out caller goes to sign-in carrying the callback; a signed-in caller
 * with no organisation goes to `/account`, where the create flow is — not to an
 * error, because having no organisation yet is an ordinary state, not a fault.
 *
 * **A redirect from here is not the enforcement.** `proxy.ts` is optimistic and
 * checks only that a cookie exists (AGENTS.md 7.3); this function is the
 * database-backed check, and every *action* must call it too rather than
 * relying on the page having done so (AGENTS.md 11.2 rules 1 and 2).
 *
 * **A locked organisation goes to `/account` too** — prompt 73. One line here
 * locks all eight phase-two pages with no call-site edit, which is why the
 * marker is carried on the membership. `/account` is the destination rather
 * than an error because it is the one surface that must still render for a
 * locked organisation: it holds the restore control, and without it an owner
 * could never reverse the request.
 */
export async function requireOrganization(
  callbackURL: string,
): Promise<CurrentMembership> {
  const account = await getCurrentAccount();
  if (!account) {
    const query = new URLSearchParams({ callbackURL });
    redirect(`/sign-in?${query.toString()}`);
  }

  const membership = await getCurrentMembership();
  if (!membership) redirect("/account");
  if (membership.pendingDeletion) redirect("/account");

  return membership;
}

/**
 * The action-side counterpart: no redirect, just the answer.
 *
 * A Server Action returns a typed result and never throws to the client
 * (AGENTS.md 10 rule 2), so it cannot use `requireOrganization()`'s redirect.
 * It asks this instead and returns its own handled `{ ok: false }`.
 *
 * **A locked organisation is not authorised** — prompt 73. The caller cannot
 * tell the two refusals apart from the return value, which is deliberate: the
 * distinction that matters to a person is made by `resolveTenant`, which reads
 * the marker itself and picks the honest sentence.
 */
export async function authorizeOrganization(
  organizationId: string,
): Promise<CurrentMembership | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const membership = await getMembership(account.user.id, organizationId);
  if (!membership) return null;

  const built = build(account, membership);
  if (built?.pendingDeletion) return null;
  return built;
}

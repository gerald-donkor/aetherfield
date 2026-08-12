import "server-only";

import { and, asc, eq, gt } from "drizzle-orm";

import { invitation, member, organization, user } from "./auth-schema";
import { getDb } from "./client";

/**
 * The tenant-scope primitive (AGENTS.md 9.2 rule 6).
 *
 * **`getMembership()` below is the function every phase-two query filters on.**
 * There is no "add multi-tenancy later" that is not a rewrite, so every table
 * from build step 9 onwards carries an organisation reference and every read of
 * one resolves the caller's membership through this module first.
 *
 * Nothing outside `lib/db/` writes SQL or builds a query (AGENTS.md 6.2), and
 * extending this module is the way later organisation reads arrive — never a
 * parallel module against the same tables (AGENTS.md 9.2 rule 7).
 *
 * **Membership is authorisation data**, so it is read from Postgres on every
 * request rather than trusted from Better Auth's session payload — the same
 * rule `getStaffRole()` follows next door, and AGENTS.md 11.2 rule 5 states it.
 */

export type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  /** The stored role string. Narrowed to the tenant role union by
      `lib/auth/organization.ts`; this layer reports what is in the row. */
  role: string;
  createdAt: Date;
};

const membershipColumns = {
  organizationId: member.organizationId,
  organizationName: organization.name,
  organizationSlug: organization.slug,
  role: member.role,
  createdAt: member.createdAt,
} as const;

/**
 * One user's membership of one organisation, or `null` for a non-member.
 *
 * **This is the tenant check.** A `null` here means the caller has no business
 * reading anything scoped to `organizationId`, and no other condition — not a
 * staff role, not an admin role — substitutes for it (AGENTS.md 11).
 */
export async function getMembership(
  userId: string,
  organizationId: string,
): Promise<Membership | null> {
  const [record] = await getDb()
    .select(membershipColumns)
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);

  return record ?? null;
}

/**
 * Every organisation a user belongs to, oldest first.
 *
 * Ordered stably so a user with several organisations sees the same order on
 * every render, and so the single-membership fallback in
 * `lib/auth/organization.ts` is deterministic.
 */
export async function listMembershipsForUser(
  userId: string,
): Promise<Membership[]> {
  return getDb()
    .select(membershipColumns)
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(member.id));
}

/**
 * Every organisation's id, oldest first — build step 14's nightly sweep, and
 * the **only** read in this codebase that is not scoped to one tenant.
 *
 * **That is not a violation of AGENTS.md 9.2 rule 6; it is what makes obeying it
 * possible here.** Rule 6 requires every query on a tenant table to filter on an
 * organisation id. The sweep has no session and no request to derive one from,
 * so it derives the whole set server-side and then runs the ordinary
 * tenant-predicated queries once per id. The alternative — accepting an
 * organisation id from the request — is the failure the rule exists to prevent.
 *
 * **Its only caller is the cron handler**, which is authenticated by
 * `CRON_SECRET` and reachable by nothing else. Nothing in the authenticated UI
 * may call this: a person's access is always a membership row.
 *
 * Ordered stably so a sweep interrupted partway resumes over the same sequence
 * the next night rather than a reshuffled one.
 */
export async function listAllOrganizationIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: organization.id })
    .from(organization)
    .orderBy(asc(organization.createdAt), asc(organization.id));
  return rows.map((row) => row.id);
}

/* -------------------------------------------------------------------------- */
/*  Members and invitations — prompt 63, closing what step 8 deferred          */
/* -------------------------------------------------------------------------- */

export type OrganizationMember = {
  /** The `member` row's id, which is what `removeMember` takes. Not the user's
      id: the two are different keys and the endpoint wants this one. */
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
};

/**
 * Every member of one organisation, oldest first.
 *
 * **Tenant-predicated, and that is the whole point of it living here.** The
 * caller passes the organisation id it resolved from a membership row
 * (`lib/auth/organization.ts`), never one that arrived from a browser, and this
 * query filters on it — so there is no shape of this call that reads another
 * tenant's roster (AGENTS.md 9.2 rule 6).
 *
 * **Preferred over `auth.api.listMembers`** because AGENTS.md 6.3 says nothing
 * but this layer talks to the database, and both tables are already imported
 * here. The plugin endpoint would do the same join behind a second access path.
 *
 * Ordered stably so the roster does not reshuffle between renders.
 */
export async function listMembersForOrganization(
  organizationId: string,
): Promise<OrganizationMember[]> {
  return getDb()
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt), asc(member.id));
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * One organisation's still-open invitations, oldest first.
 *
 * **Pending and unexpired only.** A cancelled, rejected or accepted row is not
 * an open invitation, and an expired one is not either — showing them would
 * offer an owner a Cancel control over something already closed. The rows stay
 * in the table; this read is what decides they are no longer live.
 *
 * Tenant-predicated on the resolved organisation id, as
 * `listMembersForOrganization` above is and for the same reason.
 */
export async function listPendingInvitations(
  organizationId: string,
  now: Date = new Date(),
): Promise<PendingInvitation[]> {
  return getDb()
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .orderBy(asc(invitation.createdAt), asc(invitation.id));
}

export type InvitationForLink = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  /**
   * Whether the expiry has passed, decided **here** rather than by the page.
   *
   * The clock is a read of the world, and this layer is where a request's reads
   * happen. It also keeps the page a pure render — `react-hooks/purity` rejects
   * a `Date.now()` in a component body, and rightly: a component that re-renders
   * would answer differently.
   */
  expired: boolean;
  organizationId: string;
  organizationName: string;
  inviterName: string;
};

/**
 * One invitation by its id, for the page a link in an email lands on.
 *
 * **The one read in this module that is not predicated on an organisation, and
 * it is a deliberate, bounded exception.** `/invitation/[id]` exists precisely
 * for someone who is *not yet* a member and therefore has no membership row to
 * resolve a tenant from; requiring one would make the route unreachable by the
 * only people it is for. What stands in for the tenant predicate is the
 * invitation id itself — 32 random characters generated by Better Auth, shape
 * -checked by `invitationIdSchema` before this is called — plus the address
 * match the page and the plugin both enforce before anything is disclosed or
 * written.
 *
 * **It returns the row whatever its status**, including expired, cancelled,
 * rejected and already-accepted, because telling those four apart with honest
 * copy is the point (`auth.api.getInvitation` collapses all of them into one
 * "Invitation not found!" and additionally refuses a non-recipient outright,
 * which leaves a page with nothing true to say). Deciding what may be *shown*
 * from this row is the page's job, not this layer's.
 */
export async function getInvitationForLink(
  invitationId: string,
  now: Date = new Date(),
): Promise<InvitationForLink | null> {
  const [record] = await getDb()
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(eq(invitation.id, invitationId))
    .limit(1);

  if (!record) return null;
  return {
    ...record,
    expired: record.expiresAt.getTime() <= now.getTime(),
  };
}

/**
 * Slug lookup, for the create form's uniqueness feedback.
 *
 * The database's `organization_slug_unique` constraint is the actual guarantee;
 * this exists so the action can return a typed field error on `slug` rather
 * than letting a constraint violation surface as a generic failure. A race
 * between the two still ends at the constraint, which is why the action also
 * handles the violation.
 */
export async function getOrganizationBySlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const [record] = await getDb()
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);

  return record ?? null;
}

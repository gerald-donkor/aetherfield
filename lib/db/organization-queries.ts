import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { member, organization } from "./auth-schema";
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

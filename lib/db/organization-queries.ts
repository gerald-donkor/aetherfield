import "server-only";

import { and, asc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";

import { invitation, member, organization, user } from "./auth-schema";
import { getDb } from "./client";
import { activityImport, organizationDeletion } from "./schema";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("organization-queries");

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
  /**
   * The open deletion request, if the organisation has one — prompt 73.
   *
   * **Carried on the membership rather than fetched separately**, because every
   * gate that must refuse a locked workspace already resolves a membership, and
   * a second round trip per request is a second thing a caller can forget. A
   * `null` here is the ordinary state.
   */
  pendingDeletion: { scheduledPurgeAt: Date } | null;
};

const membershipColumns = {
  organizationId: member.organizationId,
  organizationName: organization.name,
  organizationSlug: organization.slug,
  role: member.role,
  createdAt: member.createdAt,
  /** `null` unless a `pending` row exists — the left join below is predicated
      on the status, so a cancelled or purged row never reads as a lock. */
  pendingPurgeAt: organizationDeletion.scheduledPurgeAt,
} as const;

/** The left join both membership reads share, so the two cannot disagree about
    what "locked" means. */
const pendingDeletionJoin = and(
  eq(organizationDeletion.organizationId, member.organizationId),
  eq(organizationDeletion.status, "pending"),
);

function toMembership(row: {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  createdAt: Date;
  pendingPurgeAt: Date | null;
}): Membership {
  const { pendingPurgeAt, ...rest } = row;
  return {
    ...rest,
    pendingDeletion: pendingPurgeAt
      ? { scheduledPurgeAt: pendingPurgeAt }
      : null,
  };
}

/**
 * One user's membership of one organisation, or `null` for a non-member.
 *
 * **This is the tenant check.** A `null` here means the caller has no business
 * reading anything scoped to `organizationId`, and no other condition — not a
 * staff role, not an admin role — substitutes for it (AGENTS.md 11).
 */
export const getMembership = safe("getMembership", getMembershipImpl);

async function getMembershipImpl(
  userId: string,
  organizationId: string,
): Promise<Membership | null> {
  const [record] = await getDb()
    .select(membershipColumns)
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .leftJoin(organizationDeletion, pendingDeletionJoin)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);

  return record ? toMembership(record) : null;
}

/**
 * Every organisation a user belongs to, oldest first.
 *
 * Ordered stably so a user with several organisations sees the same order on
 * every render, and so the single-membership fallback in
 * `lib/auth/organization.ts` is deterministic.
 */
export const listMembershipsForUser = safe("listMembershipsForUser", listMembershipsForUserImpl);

async function listMembershipsForUserImpl(
  userId: string,
): Promise<Membership[]> {
  const rows = await getDb()
    .select(membershipColumns)
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .leftJoin(organizationDeletion, pendingDeletionJoin)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(member.id));

  return rows.map(toMembership);
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
 *
 * **Organisations with an open deletion request are excluded** — prompt 73.
 * Recalculating a workspace that is being erased is wasted work, and step 14's
 * threshold alerts would otherwise email a customer about a target inside a
 * workspace they have asked to have removed. The exclusion is here rather than
 * in the sweep so it cannot be forgotten by a later caller.
 */
export const listAllOrganizationIds = safe("listAllOrganizationIds", listAllOrganizationIdsImpl);

async function listAllOrganizationIdsImpl(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: organization.id })
    .from(organization)
    .leftJoin(
      organizationDeletion,
      and(
        eq(organizationDeletion.organizationId, organization.id),
        eq(organizationDeletion.status, "pending"),
      ),
    )
    .where(isNull(organizationDeletion.id))
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
export const listMembersForOrganization = safe("listMembersForOrganization", listMembersForOrganizationImpl);

async function listMembersForOrganizationImpl(
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
export const listPendingInvitations = safe("listPendingInvitations", listPendingInvitationsImpl);

async function listPendingInvitationsImpl(
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
export const getInvitationForLink = safe("getInvitationForLink", getInvitationForLinkImpl);

async function getInvitationForLinkImpl(
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
export const getOrganizationBySlug = safe("getOrganizationBySlug", getOrganizationBySlugImpl);

async function getOrganizationBySlugImpl(
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

/* -------------------------------------------------------------------------- */
/*  Deletion and erasure — prompt 73                                          */
/* -------------------------------------------------------------------------- */

/**
 * The organisation's owners' addresses, for the deletion notice.
 *
 * **Not `listAlertRecipients`, deliberately.** That read filters on the
 * `alert_preference` opt-out, which is a preference about *target threshold*
 * email. A workspace being scheduled for erasure is not something an owner can
 * have opted out of hearing about, and reusing that predicate would silently
 * make a security-relevant notice suppressible by an unrelated switch.
 *
 * Tenant-predicated on the resolved organisation id, as every read here is.
 */
export const listOwnerEmails = safe("listOwnerEmails", listOwnerEmailsImpl);

async function listOwnerEmailsImpl(
  organizationId: string,
): Promise<{ email: string }[]> {
  return getDb()
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
    )
    .orderBy(asc(member.createdAt), asc(member.id));
}

export type PendingDeletionRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  requestedAt: Date;
  scheduledPurgeAt: Date;
};

const pendingColumns = {
  id: organizationDeletion.id,
  organizationId: organizationDeletion.organizationId,
  organizationName: organizationDeletion.organizationName,
  organizationSlug: organizationDeletion.organizationSlug,
  requestedAt: organizationDeletion.requestedAt,
  scheduledPurgeAt: organizationDeletion.scheduledPurgeAt,
} as const;

/** One organisation's open deletion request, or `null`. Tenant-predicated. */
export const getPendingDeletion = safe("getPendingDeletion", getPendingDeletionImpl);

async function getPendingDeletionImpl(
  organizationId: string,
): Promise<PendingDeletionRow | null> {
  const [row] = await getDb()
    .select(pendingColumns)
    .from(organizationDeletion)
    .where(
      and(
        eq(organizationDeletion.organizationId, organizationId),
        eq(organizationDeletion.status, "pending"),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Open a deletion request.
 *
 * **Returns `null` when one is already open**, rather than throwing: the
 * partial unique index is the guarantee, `onConflictDoNothing` is how a race
 * between two owners resolves without an exception reaching an action, and a
 * caller that reads `null` has its own typed sentence for the state
 * (AGENTS.md 10 rule 2).
 *
 * Every value written here was resolved server-side by the caller from a
 * membership row — nothing on this path comes from a request.
 */
export const createDeletionRequest = safe("createDeletionRequest", createDeletionRequestImpl);

async function createDeletionRequestImpl(input: {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  requestedBy: string;
  scheduledPurgeAt: Date;
}): Promise<PendingDeletionRow | null> {
  const [row] = await getDb()
    .insert(organizationDeletion)
    .values({
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      organizationSlug: input.organizationSlug,
      status: "pending",
      requestedBy: input.requestedBy,
      scheduledPurgeAt: input.scheduledPurgeAt,
    })
    .onConflictDoNothing()
    .returning(pendingColumns);

  return row ?? null;
}

/**
 * Reverse an open request.
 *
 * **Predicated on `status = 'pending'`**, so a second click cannot re-stamp a
 * row that is already cancelled, and a purged row can never be "restored" into
 * a workspace that no longer exists. Returns whether a row moved.
 */
export const cancelDeletionRequest = safe("cancelDeletionRequest", cancelDeletionRequestImpl);

async function cancelDeletionRequestImpl(
  organizationId: string,
  cancelledBy: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await getDb()
    .update(organizationDeletion)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy })
    .where(
      and(
        eq(organizationDeletion.organizationId, organizationId),
        eq(organizationDeletion.status, "pending"),
      ),
    )
    .returning({ id: organizationDeletion.id });

  return rows.length > 0;
}

/**
 * Every request whose window has elapsed — the purge sweep's read, and the
 * second read in this module that is not scoped to one tenant.
 *
 * **The justification `listAllOrganizationIds` records applies verbatim**: the
 * sweep has no session and no request to derive a tenant from, so it derives
 * the due set server-side and then runs tenant-predicated work once per row.
 * Its only caller is the cron handler, authenticated by `CRON_SECRET`; nothing
 * in the authenticated UI may call it.
 *
 * Ordered stably so an interrupted sweep resumes over the same sequence.
 */
export const listDueDeletions = safe("listDueDeletions", listDueDeletionsImpl);

async function listDueDeletionsImpl(
  now: Date = new Date(),
): Promise<PendingDeletionRow[]> {
  return getDb()
    .select(pendingColumns)
    .from(organizationDeletion)
    .where(
      and(
        eq(organizationDeletion.status, "pending"),
        lte(organizationDeletion.scheduledPurgeAt, now),
      ),
    )
    .orderBy(
      asc(organizationDeletion.scheduledPurgeAt),
      asc(organizationDeletion.id),
    );
}

/** The audit row's final state. It is not deleted: it is the only remaining
    evidence the organisation existed, which is the point of AGENTS.md 9.2
    rule 5's audit trail. */
export const markDeletionPurged = safe("markDeletionPurged", markDeletionPurgedImpl);

async function markDeletionPurgedImpl(
  deletionId: string,
  now: Date = new Date(),
): Promise<void> {
  await getDb()
    .update(organizationDeletion)
    .set({ status: "purged", purgedAt: now, purgeError: null })
    .where(eq(organizationDeletion.id, deletionId));
}

/**
 * Record why a purge failed, leaving the row `pending` so the next night
 * retries.
 *
 * **`reason` must come from a closed vocabulary**, never from an exception
 * message: a driver or provider error can quote a customer's data, and this
 * column is read by us (AGENTS.md 8.3 rule 2). The sweep passes a fixed string.
 */
export const recordDeletionPurgeError = safe("recordDeletionPurgeError", recordDeletionPurgeErrorImpl);

async function recordDeletionPurgeErrorImpl(
  deletionId: string,
  reason: string,
): Promise<void> {
  await getDb()
    .update(organizationDeletion)
    .set({ purgeError: reason })
    .where(eq(organizationDeletion.id, deletionId));
}

/**
 * The organisation's outstanding private blob references — the purge's first
 * stage.
 *
 * **It lives here rather than in `activity-queries.ts` because it is part of
 * the organisation's erasure**, not part of the import flow: its predicate is
 * an organisation, its caller is the purge sweep, and keeping the three purge
 * statements adjacent is what makes the order in `sweep.ts` reviewable. It
 * still writes SQL only inside `lib/db/` (AGENTS.md 6.2).
 *
 * Soft-deleted imports are **included**: a discarded import's blob is still a
 * customer's file in storage, and erasure means erasure.
 */
export const listImportBlobPathnames = safe("listImportBlobPathnames", listImportBlobPathnamesImpl);

async function listImportBlobPathnamesImpl(
  organizationId: string,
): Promise<{ id: string; blobPathname: string }[]> {
  const rows = await getDb()
    .select({
      id: activityImport.id,
      blobPathname: activityImport.blobPathname,
    })
    .from(activityImport)
    .where(
      and(
        eq(activityImport.organizationId, organizationId),
        isNotNull(activityImport.blobPathname),
      ),
    )
    .orderBy(asc(activityImport.createdAt), asc(activityImport.id));

  /* `isNotNull` has already excluded the nulls; the cast states for the type
     system what the predicate guarantees, rather than filtering a second time. */
  return rows as { id: string; blobPathname: string }[];
}

/**
 * Forget one blob pointer, once the object itself is gone.
 *
 * **Nulled as each delete succeeds**, so a sweep that dies partway is resumable
 * and never loses the pointer to an object it has not yet deleted. Predicated
 * on the organisation as well as the import id, so the statement cannot reach
 * another tenant's row even if a caller passed the wrong id.
 */
export const clearImportBlobPathname = safe("clearImportBlobPathname", clearImportBlobPathnameImpl);

async function clearImportBlobPathnameImpl(
  organizationId: string,
  importId: string,
): Promise<void> {
  await getDb()
    .update(activityImport)
    .set({ blobPathname: null })
    .where(
      and(
        eq(activityImport.id, importId),
        eq(activityImport.organizationId, organizationId),
      ),
    );
}

/**
 * The erasure itself: one statement, and the cascade does the rest.
 *
 * Every `organization_id` reference in `lib/db/schema.ts` is
 * `onDelete: "cascade"` — verified at execution time and enumerated in
 * `docs/backend.md`, prompt 73 — so members, invitations, sites, imports,
 * staged rows, activity records, mappings, computed emissions, targets,
 * reports, alerts, alert preferences and the tenant's own factor sets and
 * factor rows all go with it.
 *
 * **`organization_deletion` is not among them**, by construction: it carries no
 * foreign key, which is what lets the audit row outlive the row it describes.
 */
export const deleteOrganizationRow = safe("deleteOrganizationRow", deleteOrganizationRowImpl);

async function deleteOrganizationRowImpl(
  organizationId: string,
): Promise<void> {
  await getDb().delete(organization).where(eq(organization.id, organizationId));
}

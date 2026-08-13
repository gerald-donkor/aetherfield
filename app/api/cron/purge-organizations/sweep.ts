import "server-only";

import {
  clearImportBlobPathname,
  deleteOrganizationRow,
  listDueDeletions,
  listImportBlobPathnames,
  markDeletionPurged,
  recordDeletionPurgeError,
} from "../../../../lib/db/organization-queries";
import { deleteActivityImport } from "../../../../lib/storage/activity-import";

/**
 * The erasure sweep the purge handler calls — prompt 73.
 *
 * A separate module so the handler stays what AGENTS.md 6.2 requires of one:
 * authenticate, call, answer. Nothing here is reachable from a browser and
 * nothing here reads a request.
 *
 * ---
 *
 * ## What it does, per due request
 *
 * 1. **Blobs first**, and the order is the design. Vercel Blob is not in
 *    Postgres and no foreign-key cascade reaches it, so deleting the rows first
 *    would orphan a customer's uploaded CSVs in storage permanently — with the
 *    pointers to them gone. Each pathname is deleted and then nulled on its own
 *    row as it succeeds, so a sweep that dies partway is resumable and never
 *    loses a pointer to an object it has not yet deleted.
 * 2. **Then one statement**: delete the `organization` row. Every
 *    `organization_id` reference in `lib/db/schema.ts` is
 *    `onDelete: "cascade"` — enumerated in `docs/backend.md`, prompt 73 — so
 *    members, invitations, sites, imports, staged rows, activity records,
 *    mappings, computed emissions, targets, reports, alerts, alert preferences
 *    and the tenant's own factor sets and factor rows all go with it.
 * 3. `status = 'purged'`, `purged_at = now`. **The audit row remains**, which is
 *    what makes this an erasure with a trail rather than a disappearance
 *    (AGENTS.md 9.2 rule 5).
 *
 * **A failure at any stage records `purge_error`, leaves the row `pending`, and
 * the next night retries.** The reason written is from the closed vocabulary
 * below and never an exception message — a driver or provider error can quote a
 * customer's data (AGENTS.md 8.3 rule 2, extended to commercial data by 5.3).
 *
 * **One organisation's failure must not end the sweep.** Each is wrapped, the
 * error is counted, and the loop continues — the same stance the recalculation
 * sweep takes, and here it matters more: one tenant with an unreachable blob
 * must not hold up every other tenant's erasure.
 *
 * **One clock value for the whole run**, so two requests evaluated a second
 * apart cannot land on different sides of a boundary.
 *
 * **Nothing here logs an identifier, a name, an address or a pathname.**
 */

/** The closed vocabulary `purge_error` is written from. Never an exception. */
const PURGE_ERRORS = {
  BLOBS: "blob-delete-failed",
  CASCADE: "organization-delete-failed",
} as const;

export type PurgeSummary = {
  due: number;
  purged: number;
  blobsDeleted: number;
  failures: number;
};

export async function sweep(): Promise<PurgeSummary> {
  const now = new Date();
  const due = await listDueDeletions(now);

  const summary: PurgeSummary = {
    due: due.length,
    purged: 0,
    blobsDeleted: 0,
    failures: 0,
  };

  for (const request of due) {
    try {
      await purgeOne(request, summary);
    } catch {
      /* Counted, not logged and not rethrown. Nothing about which tenant failed
         reaches the response or the console. The row is still `pending`, so the
         next night tries again. */
      summary.failures += 1;
    }
  }

  return summary;
}

async function purgeOne(
  request: { id: string; organizationId: string },
  summary: PurgeSummary,
): Promise<void> {
  // -- 1. Blobs, one at a time, each pointer cleared as its object goes -----
  try {
    const blobs = await listImportBlobPathnames(request.organizationId);
    for (const blob of blobs) {
      /* `deleteActivityImport` is best-effort and throws nothing by contract,
         so a blob that is already gone does not stall the purge — the pointer
         is cleared either way and the object is not there to leak. */
      await deleteActivityImport(blob.blobPathname);
      await clearImportBlobPathname(request.organizationId, blob.id);
      summary.blobsDeleted += 1;
    }
  } catch {
    await recordDeletionPurgeError(request.id, PURGE_ERRORS.BLOBS);
    summary.failures += 1;
    return;
  }

  // -- 2. The cascade -------------------------------------------------------
  try {
    await deleteOrganizationRow(request.organizationId);
  } catch {
    await recordDeletionPurgeError(request.id, PURGE_ERRORS.CASCADE);
    summary.failures += 1;
    return;
  }

  // -- 3. The trail ---------------------------------------------------------
  await markDeletionPurged(request.id);
  summary.purged += 1;
}

import "server-only";

import { and, asc, eq, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb } from "./client";
import { withSafeQueryErrors } from "./query-error";
import { application, lead, retentionPurgeRun, subscriber } from "./schema";
import { retentionCutoffs } from "../domain/retention";
import type { RetentionPurgeError } from "../validation/retention";

/**
 * The phase-one retention sweep's data layer — prompt 81.
 *
 * **The boundary predicates live here, in SQL** (AGENTS.md 6.2: nothing outside
 * `lib/db/` builds a query), but the arithmetic that produces them does not:
 * every cut-off comes from `retentionCutoffs()` in `lib/domain/retention.ts`,
 * which is pure and pinned on both sides of every boundary by its own tests. A
 * window written twice is a window that will disagree with itself.
 *
 * **`now` is threaded in from the caller and the cut-offs are computed once**,
 * never `now()` inside the statements. Postgres' `now()` is the transaction's
 * start, so four separate statements would each carry their own instant and two
 * records written a second apart could land on opposite sides of the same
 * boundary — the rule prompt 73's sweep already states for the same reason.
 *
 * **These are hard deletes.** `deleted_at` is the *start* of the 30-day grace,
 * not the end of the record's life; stamping it again here would be the
 * permanent archive AGENTS.md 8.3 rule 5 forbids.
 *
 * Every export is wrapped in `withSafeQueryErrors` with a
 * `retention-queries.<name>` label (prompt 80's contract). An unwrapped export
 * would let a `DrizzleQueryError` escape carrying the bound parameters — here,
 * cut-off timestamps and a row id, but the contract is the contract and a later
 * predicate may not be so harmless.
 */

/** The soft-delete arm, shared by all three predicates so the three cannot
    drift on what the grace window means. */
function softDeleteDue(
  column: AnyPgColumn,
  cutoff: Date,
): SQL | undefined {
  return and(isNotNull(column), lte(column, cutoff));
}

/**
 * The applications whose window has elapsed — **id and `cv_pathname` only**.
 *
 * No name, no address, no filename. The sweep needs exactly two values: what to
 * delete from Blob storage, and which row to delete once that succeeded
 * (AGENTS.md 8.3 rule 1). Anything else selected here is personal data pulled
 * into a process that has no use for it and logs its failures.
 *
 * Ordered stably, so a run interrupted partway resumes over the same sequence.
 */
export const listDueApplications = withSafeQueryErrors(
  "retention-queries.listDueApplications",
  listDueApplicationsImpl,
);

async function listDueApplicationsImpl(
  now: Date,
): Promise<{ id: string; cvPathname: string }[]> {
  const cutoffs = retentionCutoffs(now);
  return getDb()
    .select({ id: application.id, cvPathname: application.cvPathname })
    .from(application)
    .where(
      or(
        lte(application.createdAt, cutoffs.application),
        softDeleteDue(application.deletedAt, cutoffs.softDelete),
      ),
    )
    .orderBy(asc(application.createdAt), asc(application.id));
}

/**
 * Delete one application row, by id. Returns the number of rows affected.
 *
 * **Called only after `deleteCvStrict()` returned `true`**, never before: the
 * pathname is `not null`, so deleting the row first would orphan a person's CV
 * in Blob storage with the only pointer to it gone. A row that survives is due
 * again tomorrow; an orphaned CV is forever.
 *
 * Deliberately not predicated on the window a second time — the id came from
 * `listDueApplications` in the same run, and re-deriving the predicate here
 * would be a second place for it to drift.
 */
export const deleteApplicationRow = withSafeQueryErrors(
  "retention-queries.deleteApplicationRow",
  deleteApplicationRowImpl,
);

async function deleteApplicationRowImpl(id: string): Promise<number> {
  const rows = await getDb()
    .delete(application)
    .where(eq(application.id, id))
    .returning({ id: application.id });
  return rows.length;
}

/**
 * Every lead past its window, in one statement. No blob is involved, so there
 * is nothing to sequence and nothing a partial failure can orphan.
 *
 * Returns the number of rows deleted, counted from `.returning()` rather than
 * the driver's `rowCount` — `PgDeleteBase.returning()` is the documented API in
 * drizzle-orm 0.45.2 (`pg-core/query-builders/delete.d.ts:98`) and it is what
 * `organization-queries.cancelDeletionRequest` already counts with.
 */
export const deleteDueLeads = withSafeQueryErrors(
  "retention-queries.deleteDueLeads",
  deleteDueLeadsImpl,
);

async function deleteDueLeadsImpl(now: Date): Promise<number> {
  const cutoffs = retentionCutoffs(now);
  const rows = await getDb()
    .delete(lead)
    .where(
      or(
        lte(lead.createdAt, cutoffs.lead),
        softDeleteDue(lead.deletedAt, cutoffs.softDelete),
      ),
    )
    .returning({ id: lead.id });
  return rows.length;
}

/**
 * Every subscriber past its window, in one statement.
 *
 * The three status arms are the SQL of `isSubscriberDue()`:
 *
 * - `pending` — 30 days from `created_at`;
 * - `unsubscribed` — 12 months from `unsubscribed_at`, `coalesce`-d to
 *   `created_at` so a row that never carried the stamp is not immortal;
 * - `confirmed` — **absent by construction.** Live consent does not age out,
 *   and the person holds a working one-click unsubscribe that starts the
 *   12-month clock above. Only the soft-delete arm can reach such a row.
 */
export const deleteDueSubscribers = withSafeQueryErrors(
  "retention-queries.deleteDueSubscribers",
  deleteDueSubscribersImpl,
);

async function deleteDueSubscribersImpl(now: Date): Promise<number> {
  const cutoffs = retentionCutoffs(now);
  const rows = await getDb()
    .delete(subscriber)
    .where(
      or(
        and(
          eq(subscriber.status, "pending"),
          lte(subscriber.createdAt, cutoffs.pendingSubscriber),
        ),
        and(
          eq(subscriber.status, "unsubscribed"),
          /* `coalesce`, not a second `or` arm: the fallback must apply only
             when the stamp is absent. Two arms would let a row unsubscribed
             yesterday be deleted on the strength of an old `created_at`. */
          sql`coalesce(${subscriber.unsubscribedAt}, ${subscriber.createdAt}) <= ${cutoffs.unsubscribedSubscriber}`,
        ),
        softDeleteDue(subscriber.deletedAt, cutoffs.softDelete),
      ),
    )
    .returning({ id: subscriber.id });
  return rows.length;
}

/**
 * Record what one run did. **Counts only** — see the table's docblock in
 * `schema.ts` for why an identifier may never appear here.
 */
export const recordPurgeRun = withSafeQueryErrors(
  "retention-queries.recordPurgeRun",
  recordPurgeRunImpl,
);

async function recordPurgeRunImpl(summary: {
  leads: number;
  subscribers: number;
  applications: number;
  blobsDeleted: number;
  failures: number;
  durationMs: number;
  error: RetentionPurgeError | null;
}): Promise<void> {
  await getDb().insert(retentionPurgeRun).values({
    leadsDeleted: summary.leads,
    subscribersDeleted: summary.subscribers,
    applicationsDeleted: summary.applications,
    blobsDeleted: summary.blobsDeleted,
    failures: summary.failures,
    durationMs: summary.durationMs,
    error: summary.error,
  });
}

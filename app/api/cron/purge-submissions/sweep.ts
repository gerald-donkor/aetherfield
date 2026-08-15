import "server-only";

import {
  deleteApplicationRow,
  deleteDueLeads,
  deleteDueSubscribers,
  listDueApplications,
  recordPurgeRun,
} from "../../../../lib/db/retention-queries";
import type { RetentionPurgeError } from "../../../../lib/validation/retention";
import { deleteCvStrict } from "../../../../lib/storage/cv";

/**
 * The nightly retention sweep the purge handler calls — prompt 81.
 *
 * A separate module so the handler stays what AGENTS.md 6.2 requires of one:
 * authenticate, call, answer. Nothing here is reachable from a browser and
 * nothing here reads a request.
 *
 * ---
 *
 * ## What it does
 *
 * 1. **Leads, then subscribers** — one statement each, no blobs involved. They
 *    run **first**, and the order is a decision rather than an accident: each is
 *    a single bounded `DELETE`, while the application loop is unbounded in the
 *    number of Blob round trips it makes. Running the cheap statements first
 *    means a run that hits the function's `maxDuration` partway through the
 *    applications still erased everything it could, instead of starving two
 *    whole entities behind one slow store.
 * 2. **Applications, blob first and then the row.** `application.cv_pathname` is
 *    `not null`, so prompt 73's "null the pointer as each blob succeeds" trick
 *    is unavailable here; instead the object is deleted with `deleteCvStrict`
 *    and the row is deleted **only** when that returned `true`.
 *
 *    **Deleting the row first would orphan a person's CV in Blob storage
 *    permanently, with the only pointer to it gone.** Nothing in Postgres
 *    cascades into Blob, so an object nobody can name is an object nobody can
 *    erase — the exact failure prompt 73 designed against, and here the orphan
 *    is a CV rather than a spreadsheet. A failed blob delete therefore counts a
 *    failure, leaves the row exactly as it was, and retries tomorrow: the row is
 *    still past its window, so it is still due.
 * 3. **The run is recorded** — counts, duration and a nullable error, never an
 *    identifier (AGENTS.md 8.3 rule 2). That is what makes this an erasure with
 *    a trail rather than a disappearance (AGENTS.md 9.2 rule 5).
 *
 * **One record's failure must not end the sweep.** Every stage and every row is
 * wrapped, the failure is counted, and the sweep continues. One unreachable
 * blob must not hold up every other person's erasure.
 *
 * **One clock value for the whole run**, threaded into every query, so two rows
 * evaluated a second apart cannot land on different sides of a boundary.
 *
 * **The recorded error comes from a closed vocabulary and is never an exception
 * message.** A driver or provider error can quote a row's contents, and on this
 * path those contents are a name, a work address or a CV pathname.
 *
 * **Nothing in this file logs anything, on any path.** There is no `console`
 * call here and there must not be one: every value in scope — an id, an
 * address, a pathname, a filename — is either personal data or points at it.
 * First failure wins for the recorded reason; later ones still count.
 */

/** The complete vocabulary is `RETENTION_PURGE_ERRORS` in
    `lib/validation/retention.ts`; these are the three this sweep can write. */
const PURGE_ERRORS = {
  BLOB: "blob-delete-failed",
  APPLICATION: "application-delete-failed",
  SWEEP: "sweep-failed",
} as const satisfies Record<string, RetentionPurgeError>;

export type PurgeSummary = {
  leads: number;
  subscribers: number;
  applications: number;
  blobsDeleted: number;
  failures: number;
};

export async function sweep(): Promise<PurgeSummary> {
  /* One clock for the run, and one wall-clock start for the recorded duration.
     `Date.now()` rather than a second `new Date()` so the two cannot drift. */
  const now = new Date();
  const startedAt = Date.now();

  const summary: PurgeSummary = {
    leads: 0,
    subscribers: 0,
    applications: 0,
    blobsDeleted: 0,
    failures: 0,
  };

  /* First failure wins the recorded reason. A run that failed on a blob and
     then on a row is recorded as the blob failure and counts two failures —
     the count is the signal that there was more than one. */
  let error: RetentionPurgeError | null = null;
  const fail = (reason: RetentionPurgeError): void => {
    summary.failures += 1;
    error ??= reason;
  };

  // -- 1. Leads: one statement -----------------------------------------------
  try {
    summary.leads = await deleteDueLeads(now);
  } catch {
    /* Counted, not logged and not rethrown. The rows are still past their
       window, so tomorrow's run is the retry. */
    fail(PURGE_ERRORS.SWEEP);
  }

  // -- 2. Subscribers: one statement -----------------------------------------
  try {
    summary.subscribers = await deleteDueSubscribers(now);
  } catch {
    fail(PURGE_ERRORS.SWEEP);
  }

  // -- 3. Applications: blob first, then the row, one at a time --------------
  try {
    const due = await listDueApplications(now);

    for (const row of due) {
      /* The blob. `deleteCvStrict` returns a boolean by contract and does not
         throw, but it is wrapped anyway: a contract this loop depends on for
         correctness is not a reason to let a future change end the sweep. */
      let blobDeleted = false;
      try {
        blobDeleted = await deleteCvStrict(row.cvPathname);
      } catch {
        blobDeleted = false;
      }

      if (!blobDeleted) {
        /* The row stays. It is still due tomorrow, and the pointer to the
           object is still here to try again with — which is the whole reason
           the blob goes first. */
        fail(PURGE_ERRORS.BLOB);
        continue;
      }
      summary.blobsDeleted += 1;

      try {
        summary.applications += await deleteApplicationRow(row.id);
      } catch {
        /* The object is gone and the row is not. That is the recoverable side
           of the pair: the row's `cv_pathname` now names nothing, the next run
           finds the same row due, and `deleteCvStrict` on an already-deleted
           object is the case that resolves it. The reverse — a deleted row and
           a surviving object — is not recoverable at all. */
        fail(PURGE_ERRORS.APPLICATION);
      }
    }
  } catch {
    /* `listDueApplications` itself failed: no row was touched. */
    fail(PURGE_ERRORS.SWEEP);
  }

  // -- 4. The trail ----------------------------------------------------------
  try {
    await recordPurgeRun({
      ...summary,
      durationMs: Date.now() - startedAt,
      error,
    });
  } catch {
    /* **A failed audit write must not throw out of the sweep.** The erasures
       above already happened and are irreversible; turning the record of them
       into a 500 would lose the counts as well as the row. Swallowed silently,
       because there is nothing loggable here that is not personal data or a
       driver message quoting it. */
  }

  return summary;
}

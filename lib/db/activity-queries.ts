import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { user } from "./auth-schema";
import { getDb, type Db } from "./client";
import {
  activityImport,
  activityImportRow,
  activityRecord,
  site,
} from "./schema";
import type { CoercedActivityRow } from "../domain/activity-import";
import type {
  ActivityImportRowStatus,
  ActivityImportStatus,
  ActivityMapping,
} from "../validation/activity";

/**
 * Every read and write of the four phase-two ingestion tables — build step 9.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so the actions in `app/activity/actions.ts` and the two pages under
 * `app/activity/` go through here and nowhere else.
 *
 * ---
 *
 * **Every function below takes `organizationId` and every predicate filters on
 * it** (AGENTS.md 9.2 rule 6). That is not a convention here, it is the shape
 * of the module: there is no exported function that can read or write an
 * activity row without naming a tenant, so a caller cannot forget to scope one.
 *
 * The id itself always comes from `lib/auth/organization.ts` — resolved
 * server-side from the session's membership row — and never from a form field.
 * `getMembership()` is the only thing that grants it, and no staff role
 * substitutes for it (AGENTS.md 11.1's orthogonality invariant).
 *
 * **Passing an id that belongs to another organisation is indistinguishable
 * from passing one that does not exist.** Every read returns `null` and every
 * write reports the same "not found" outcome, so there is no existence oracle
 * on any of these paths.
 *
 * ---
 *
 * **Nothing here logs.** Not a filename, not a blob pathname, not a cell value,
 * not an organisation name — on no path, in no catch (AGENTS.md 8.3 rule 2,
 * extended to a customer's commercial data by 5.3).
 */

/** Imports and rows are paged with the same page size the submissions view
    uses, so the two authenticated read views share one rhythm. */
export const ACTIVITY_PAGE_SIZE = 25;

/**
 * Rows per `INSERT`. Postgres caps a statement at 65,535 bound parameters and
 * a staged row binds thirteen columns, so 500 rows is ~6,500 parameters —
 * comfortably inside the cap with room for the column count to grow. **A
 * judgement, not a measurement**: it was not fitted against a timing.
 */
const INSERT_BATCH = 500;

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

export type ListedImport = {
  id: string;
  filename: string;
  status: ActivityImportStatus;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  createdAt: Date;
  committedAt: Date | null;
  discardedAt: Date | null;
  uploadedByName: string;
};

export type ImportDetail = ListedImport & {
  /** The header row as parsed, so a mapping index can be checked against the
      file rather than against whatever the browser claims the file was. */
  headerRow: string[];
  columnMapping: ActivityMapping;
  blobPathname: string | null;
  error: string | null;
};

const listedImportColumns = {
  id: activityImport.id,
  filename: activityImport.filename,
  status: activityImport.status,
  rowCount: activityImport.rowCount,
  validRowCount: activityImport.validRowCount,
  invalidRowCount: activityImport.invalidRowCount,
  createdAt: activityImport.createdAt,
  committedAt: activityImport.committedAt,
  discardedAt: activityImport.discardedAt,
  uploadedByName: user.name,
} as const;

export async function listImports(
  organizationId: string,
  page: number,
): Promise<ListedImport[]> {
  return getDb()
    .select(listedImportColumns)
    .from(activityImport)
    .innerJoin(user, eq(activityImport.uploadedBy, user.id))
    .where(
      and(
        eq(activityImport.organizationId, organizationId),
        isNull(activityImport.deletedAt),
      ),
    )
    .orderBy(desc(activityImport.createdAt), desc(activityImport.id))
    .limit(ACTIVITY_PAGE_SIZE)
    .offset((page - 1) * ACTIVITY_PAGE_SIZE);
}

export async function countImports(organizationId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(activityImport)
    .where(
      and(
        eq(activityImport.organizationId, organizationId),
        isNull(activityImport.deletedAt),
      ),
    );
  return row.count;
}

/**
 * One import, scoped to the organisation.
 *
 * `null` covers all three of "no such import", "an import belonging to another
 * organisation" and "an import that has been erased" — deliberately one answer,
 * so the caller has nothing to distinguish and cannot leak the difference.
 */
export async function getImport(
  importId: string,
  organizationId: string,
): Promise<ImportDetail | null> {
  const [row] = await getDb()
    .select({
      ...listedImportColumns,
      headerRow: activityImport.headerRow,
      columnMapping: activityImport.columnMapping,
      blobPathname: activityImport.blobPathname,
      error: activityImport.error,
    })
    .from(activityImport)
    .innerJoin(user, eq(activityImport.uploadedBy, user.id))
    .where(
      and(
        eq(activityImport.id, importId),
        eq(activityImport.organizationId, organizationId),
        isNull(activityImport.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    headerRow: parseJsonArray(row.headerRow),
    columnMapping: JSON.parse(row.columnMapping) as ActivityMapping,
  };
}

export type ListedImportRow = {
  id: string;
  rowNumber: number;
  raw: string[];
  status: ActivityImportRowStatus;
  error: string | null;
  siteName: string | null;
  activityDate: string | null;
  category: string | null;
  description: string | null;
  quantity: string | null;
  unit: string | null;
};

/** Staged rows of one status, scoped to both the import and the organisation.
    The second predicate is redundant given the first and is there anyway — see
    `activity_import_row.organization_id`'s docblock in `schema.ts`. */
export async function listImportRows(
  importId: string,
  organizationId: string,
  status: ActivityImportRowStatus,
  page: number,
): Promise<ListedImportRow[]> {
  const rows = await getDb()
    .select({
      id: activityImportRow.id,
      rowNumber: activityImportRow.rowNumber,
      raw: activityImportRow.raw,
      status: activityImportRow.status,
      error: activityImportRow.error,
      siteName: activityImportRow.siteName,
      activityDate: activityImportRow.activityDate,
      category: activityImportRow.category,
      description: activityImportRow.description,
      quantity: activityImportRow.quantity,
      unit: activityImportRow.unit,
    })
    .from(activityImportRow)
    .where(
      and(
        eq(activityImportRow.importId, importId),
        eq(activityImportRow.organizationId, organizationId),
        eq(activityImportRow.status, status),
      ),
    )
    .orderBy(activityImportRow.rowNumber)
    .limit(ACTIVITY_PAGE_SIZE)
    .offset((page - 1) * ACTIVITY_PAGE_SIZE);

  return rows.map((row) => ({ ...row, raw: parseJsonArray(row.raw) }));
}

/** Every staged row's number and source fields, for a mapping override to
    re-coerce without asking for the file again. */
export async function listRawImportRows(
  importId: string,
  organizationId: string,
): Promise<{ rowNumber: number; raw: string[] }[]> {
  const rows = await getDb()
    .select({
      rowNumber: activityImportRow.rowNumber,
      raw: activityImportRow.raw,
    })
    .from(activityImportRow)
    .where(
      and(
        eq(activityImportRow.importId, importId),
        eq(activityImportRow.organizationId, organizationId),
      ),
    )
    .orderBy(activityImportRow.rowNumber);

  return rows.map((row) => ({ ...row, raw: parseJsonArray(row.raw) }));
}

/** How many activity records this organisation holds. The index view's one
    figure, and the only read of `activity_record` step 9 needs. */
export async function countActivityRecords(
  organizationId: string,
): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(activityRecord)
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
      ),
    );
  return row.count;
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** One coerced-or-not staged row, as the action hands it over. */
export type StagedRow = {
  rowNumber: number;
  raw: string[];
} & (
  | { status: "valid"; value: CoercedActivityRow; error: null }
  | { status: "invalid"; value: null; error: string }
);

/**
 * Writes the import and every staged row **in one transaction**, and returns
 * the new import's id.
 *
 * The blob is already stored when this runs — `activity_import.blob_pathname`
 * holds it — so a failure here leaves an orphaned private object, which the
 * action compensates for with a best-effort delete exactly as the CV path does
 * (AGENTS.md 10 stage e).
 */
export async function createStagedImport(input: {
  organizationId: string;
  uploadedBy: string;
  filename: string;
  blobPathname: string;
  headerRow: string[];
  columnMapping: ActivityMapping;
  rows: StagedRow[];
}): Promise<string> {
  const validRowCount = input.rows.filter((row) => row.status === "valid").length;

  return getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(activityImport)
      .values({
        organizationId: input.organizationId,
        uploadedBy: input.uploadedBy,
        filename: input.filename,
        blobPathname: input.blobPathname,
        status: "staged",
        headerRow: JSON.stringify(input.headerRow),
        columnMapping: JSON.stringify(input.columnMapping),
        rowCount: input.rows.length,
        validRowCount,
        invalidRowCount: input.rows.length - validRowCount,
      })
      .returning({ id: activityImport.id });

    await insertStagedRows(tx, created.id, input.organizationId, input.rows);

    return created.id;
  });
}

/**
 * Re-stages every row under a new mapping and rewrites the counts, in one
 * transaction — the human override that stands in for AGENTS.md 5.3's AI
 * mapper.
 *
 * **Rows are deleted and re-inserted rather than updated one by one.** A
 * staged import's rows are referenced by nothing — `activity_record` only
 * points at them once the import is committed, and a committed import cannot
 * reach this path — so their ids are not yet meaningful, and one delete plus
 * batched inserts is a handful of statements where a per-row update is
 * thousands.
 *
 * Returns `false` when the import is not this organisation's, does not exist,
 * or is no longer `staged`. One answer for all three, as everywhere else here.
 */
export async function restageImport(input: {
  importId: string;
  organizationId: string;
  columnMapping: ActivityMapping;
  rows: StagedRow[];
}): Promise<boolean> {
  const validRowCount = input.rows.filter((row) => row.status === "valid").length;

  return getDb().transaction(async (tx) => {
    const [target] = await tx
      .update(activityImport)
      .set({
        columnMapping: JSON.stringify(input.columnMapping),
        rowCount: input.rows.length,
        validRowCount,
        invalidRowCount: input.rows.length - validRowCount,
      })
      .where(
        and(
          eq(activityImport.id, input.importId),
          eq(activityImport.organizationId, input.organizationId),
          eq(activityImport.status, "staged"),
          isNull(activityImport.deletedAt),
        ),
      )
      .returning({ id: activityImport.id });

    if (!target) return false;

    await tx
      .delete(activityImportRow)
      .where(
        and(
          eq(activityImportRow.importId, input.importId),
          eq(activityImportRow.organizationId, input.organizationId),
        ),
      );

    await insertStagedRows(
      tx,
      input.importId,
      input.organizationId,
      input.rows,
    );

    return true;
  });
}

export type CommitOutcome =
  | { status: "committed"; recordCount: number }
  | { status: "already-committed" }
  | { status: "not-staged" }
  | { status: "nothing-valid" }
  | { status: "not-found" };

/**
 * Turns every `valid` staged row into an `activity_record`, in one transaction.
 *
 * **Idempotent.** An already-committed import writes nothing and says so; the
 * discriminant is the import's own status, re-read inside the transaction under
 * the tenant predicate rather than trusted from the page that rendered the
 * button (AGENTS.md 11.2 rules 1 and 2).
 *
 * **Invalid rows are never committed and never silently dropped.** They keep
 * their `invalid` status and stay visible on the import, which is what makes
 * the outcome legible rather than a count that quietly disagrees with the file.
 *
 * Sites are upserted by `(organization_id, normalized_name)` on the way
 * through — the only way a `site` row is ever created (AGENTS.md 5.2, "do not
 * overbuild": step 9 ships no site management UI).
 */
export async function commitImport(
  importId: string,
  organizationId: string,
): Promise<CommitOutcome> {
  return getDb().transaction(async (tx) => {
    const [target] = await tx
      .select({ status: activityImport.status })
      .from(activityImport)
      .where(
        and(
          eq(activityImport.id, importId),
          eq(activityImport.organizationId, organizationId),
          isNull(activityImport.deletedAt),
        ),
      )
      .limit(1);

    if (!target) return { status: "not-found" } as const;
    if (target.status === "committed") {
      return { status: "already-committed" } as const;
    }
    if (target.status !== "staged") return { status: "not-staged" } as const;

    const rows = await tx
      .select({
        id: activityImportRow.id,
        siteName: activityImportRow.siteName,
        siteNormalizedName: activityImportRow.siteNormalizedName,
        activityDate: activityImportRow.activityDate,
        category: activityImportRow.category,
        description: activityImportRow.description,
        quantity: activityImportRow.quantity,
        unit: activityImportRow.unit,
      })
      .from(activityImportRow)
      .where(
        and(
          eq(activityImportRow.importId, importId),
          eq(activityImportRow.organizationId, organizationId),
          eq(activityImportRow.status, "valid"),
        ),
      )
      .orderBy(activityImportRow.rowNumber);

    if (rows.length === 0) return { status: "nothing-valid" } as const;

    /* One `site` row per distinct normalised name, upserted. The `set` on
       conflict restores a soft-deleted site and refreshes the display spelling
       to the one this file used, rather than forking a second identity for the
       same building (AGENTS.md 9.2 rule 4's reasoning applied to a name). */
    const distinctSites = new Map<string, string>();
    for (const row of rows) {
      if (row.siteNormalizedName && row.siteName) {
        distinctSites.set(row.siteNormalizedName, row.siteName);
      }
    }

    const siteIds = new Map<string, string>();
    for (const batch of chunk([...distinctSites], INSERT_BATCH)) {
      const upserted = await tx
        .insert(site)
        .values(
          batch.map(([normalizedName, name]) => ({
            organizationId,
            name,
            normalizedName,
          })),
        )
        .onConflictDoUpdate({
          target: [site.organizationId, site.normalizedName],
          set: { name: sql`excluded.name`, deletedAt: null },
        })
        .returning({ id: site.id, normalizedName: site.normalizedName });

      for (const row of upserted) siteIds.set(row.normalizedName, row.id);
    }

    const records = rows.map((row) => ({
      organizationId,
      siteId: siteIds.get(row.siteNormalizedName as string) as string,
      activityDate: row.activityDate as string,
      category: row.category as NonNullable<typeof row.category>,
      description: row.description,
      quantity: row.quantity as string,
      unit: row.unit as NonNullable<typeof row.unit>,
      importId,
      importRowId: row.id,
    }));

    for (const batch of chunk(records, INSERT_BATCH)) {
      await tx.insert(activityRecord).values(batch);
    }

    for (const batch of chunk(rows.map((row) => row.id), INSERT_BATCH)) {
      await tx
        .update(activityImportRow)
        .set({ status: "committed" })
        .where(inArray(activityImportRow.id, batch));
    }

    await tx
      .update(activityImport)
      .set({ status: "committed", committedAt: new Date() })
      .where(eq(activityImport.id, importId));

    return { status: "committed", recordCount: records.length } as const;
  });
}

export type DiscardOutcome =
  | { status: "discarded"; blobPathname: string | null }
  | { status: "not-staged" }
  | { status: "not-found" };

/**
 * Marks a staged import `discarded` and clears its blob reference, writing
 * nothing to `activity_record`.
 *
 * The pathname is returned so the caller can delete the object: **retention is
 * finite and stated** (AGENTS.md 8.3 rule 5), and a discarded file has no
 * reason to stay in the store. Clearing the column in the same statement means
 * a failed delete leaves an orphan rather than a row pointing at nothing.
 */
export async function discardImport(
  importId: string,
  organizationId: string,
): Promise<DiscardOutcome> {
  return getDb().transaction(async (tx) => {
    /* Read first, then clear. Postgres' `RETURNING` reports the row *after*
       the update, so the pathname has to be taken before the column is
       nulled — the whole point of the read is to hand the caller an object to
       delete. Both statements sit in one transaction under the same tenant
       predicate, so nothing can move between them. */
    const [target] = await tx
      .select({
        status: activityImport.status,
        blobPathname: activityImport.blobPathname,
      })
      .from(activityImport)
      .where(
        and(
          eq(activityImport.id, importId),
          eq(activityImport.organizationId, organizationId),
          isNull(activityImport.deletedAt),
        ),
      )
      .limit(1);

    if (!target) return { status: "not-found" } as const;
    if (target.status !== "staged") return { status: "not-staged" } as const;

    await tx
      .update(activityImport)
      .set({
        status: "discarded",
        discardedAt: new Date(),
        blobPathname: null,
      })
      .where(eq(activityImport.id, importId));

    return {
      status: "discarded",
      blobPathname: target.blobPathname,
    } as const;
  });
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function insertStagedRows(
  tx: Tx,
  importId: string,
  organizationId: string,
  rows: StagedRow[],
): Promise<void> {
  const values = rows.map((row) => ({
    importId,
    organizationId,
    rowNumber: row.rowNumber,
    raw: JSON.stringify(row.raw),
    status: row.status,
    error: row.error,
    siteName: row.value?.siteName ?? null,
    siteNormalizedName: row.value?.siteNormalizedName ?? null,
    activityDate: row.value?.activityDate ?? null,
    category: row.value?.category ?? null,
    description: row.value?.description ?? null,
    quantity: row.value?.quantity ?? null,
    unit: row.value?.unit ?? null,
  }));

  for (const batch of chunk(values, INSERT_BATCH)) {
    await tx.insert(activityImportRow).values(batch);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** The stored JSON is written by this module and never by a caller, so a
    malformed value is a bug rather than input — but a review page that throws
    on one row is worse than one that shows an empty source row, so the parse
    is defensive. */
function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

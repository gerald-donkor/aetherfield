import "server-only";

import { and, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";

import { getDb, type Db } from "./client";
import {
  activityEmission,
  activityFactorMapping,
  activityRecord,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import type { ActivityInput, FactorInput } from "../domain/emissions";

/**
 * Every read and write of the four factor and emission tables — build step 10.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so `app/activity/actions.ts` and the pages under `app/activity/` go
 * through here and nowhere else.
 *
 * ---
 *
 * ## The tenant predicate, and the one place it is not a plain equality
 *
 * `activity_factor_mapping` and `activity_emission` are strictly tenant-scoped
 * and every predicate on them is `organization_id = $1`, exactly as
 * `activity-queries.ts` records.
 *
 * `emission_factor_set` and `emission_factor` are **reference data**, and their
 * `organization_id` is nullable: `null` is published data shared by every
 * tenant, non-null is a set a customer supplied. Every read of them therefore
 * filters
 *
 * ```sql
 * organization_id is null or organization_id = $1
 * ```
 *
 * which is the approved deviation from AGENTS.md 9.2 rule 6 — approved by the
 * user on 10 Aug 2026, with the rule amended in the same change to name
 * reference tables as its exception. **No cross-tenant read is possible**,
 * which is what rule 6 exists to guarantee: a tenant sees published rows and
 * its own, and no others.
 *
 * The predicate is written once, in {@link visibleFactorScope}, so no query
 * below can be written that forgets half of it.
 *
 * ---
 *
 * **Nothing here logs.** Not an organisation name, not a figure, not a row
 * count — on no path and in no catch (AGENTS.md 8.3 rule 2, extended to a
 * customer's commercial data by 5.3).
 */

/** Rows per `INSERT`. Postgres caps a statement at 65,535 bound parameters and
    a computed emission binds thirteen columns, so 500 rows is ~6,500 — the
    same batch size and the same reasoning `activity-queries.ts` records. */
const INSERT_BATCH = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Published reference data, or this organisation's own. Written once so no
    query can filter on half of it — see the module docblock. */
function visibleFactorScope(organizationId: string) {
  return or(
    isNull(emissionFactor.organizationId),
    eq(emissionFactor.organizationId, organizationId),
  );
}

/* -------------------------------------------------------------------------- */
/*  Factor sets                                                                */
/* -------------------------------------------------------------------------- */

export type ListedFactorSet = {
  id: string;
  source: string;
  datasetVersion: string;
  publicationYear: number;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  factorCount: number;
};

/**
 * The factor sets an organisation can see, newest publication first.
 *
 * Read by the totals surface so the **attribution** can be rendered from the
 * data rather than hard-coded in a component — the Open Government Licence
 * requires it, and a second dataset would make a hard-coded line wrong.
 *
 * Superseded sets are excluded: a superseded set's rows stay readable through
 * an existing `activity_emission.factor_id`, so an old figure still re-derives,
 * but the set is no longer offered as current.
 */
export async function listFactorSets(
  organizationId: string,
): Promise<ListedFactorSet[]> {
  return getDb()
    .select({
      id: emissionFactorSet.id,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      publicationYear: emissionFactorSet.publicationYear,
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      factorCount: sql<number>`(
        select count(*)::int from ${emissionFactor}
        where ${emissionFactor.setId} = ${emissionFactorSet.id}
          and ${emissionFactor.deletedAt} is null
      )`,
    })
    .from(emissionFactorSet)
    .where(
      and(
        or(
          isNull(emissionFactorSet.organizationId),
          eq(emissionFactorSet.organizationId, organizationId),
        ),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
      ),
    )
    .orderBy(sql`${emissionFactorSet.publicationYear} desc`);
}

/* -------------------------------------------------------------------------- */
/*  The mapping                                                                */
/* -------------------------------------------------------------------------- */

export type ResolvedMapping = {
  category: ActivityCategory;
  unit: ActivityUnit;
  factor: FactorInput;
  /** The publisher's own description of the chosen row, for the surface. */
  factorLabel: string;
  source: string;
  datasetVersion: string;
};

/**
 * Every `(category, unit)` this organisation has a factor for.
 *
 * Returned as a list rather than a map so the caller decides the key shape;
 * {@link buildFactorResolver} turns it into the pure `FactorResolver` the
 * engine takes. The engine never sees a database handle — that boundary is
 * AGENTS.md 6.2's, and this function is the seam.
 */
export async function listFactorMappings(
  organizationId: string,
  db: Db = getDb(),
): Promise<ResolvedMapping[]> {
  const rows = await db
    .select({
      category: activityFactorMapping.category,
      unit: activityFactorMapping.unit,
      id: emissionFactor.id,
      scope: emissionFactor.scope,
      scope3Category: emissionFactor.scope3Category,
      scope2Method: emissionFactor.scope2Method,
      gas: emissionFactor.gas,
      ch4Variant: emissionFactor.ch4Variant,
      gwpSet: emissionFactor.gwpSet,
      value: emissionFactor.value,
      activityUnit: emissionFactor.activityUnit,
      resultUnit: emissionFactor.resultUnit,
      biogenic: emissionFactor.biogenic,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
    })
    .from(activityFactorMapping)
    .innerJoin(
      emissionFactor,
      eq(emissionFactor.id, activityFactorMapping.factorId),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        isNull(activityFactorMapping.deletedAt),
        isNull(emissionFactor.deletedAt),
        visibleFactorScope(organizationId),
      ),
    );

  return rows.map((row) => ({
    category: row.category,
    unit: row.unit,
    factorLabel: [row.level2, row.level3, row.columnText]
      .filter(Boolean)
      .join(" · "),
    source: row.source,
    datasetVersion: row.datasetVersion,
    factor: {
      id: row.id,
      scope: row.scope,
      scope3Category: row.scope3Category,
      scope2Method: row.scope2Method,
      gas: row.gas,
      ch4Variant: row.ch4Variant,
      gwpSet: row.gwpSet,
      value: row.value,
      activityUnit: row.activityUnit,
      resultUnit: row.resultUnit,
      biogenic: row.biogenic,
    },
  }));
}

/** Turns the mapping rows into the pure resolver `aggregate()` takes. Keeping
    this here rather than in `lib/domain/` is what lets the engine stay free of
    any notion of where a factor came from. */
export function buildFactorResolver(mappings: readonly ResolvedMapping[]) {
  const byPair = new Map<string, FactorInput>();
  for (const mapping of mappings) {
    byPair.set(`${mapping.category} ${mapping.unit}`, mapping.factor);
  }
  return (record: ActivityInput): FactorInput | null =>
    byPair.get(`${record.category} ${record.unit}`) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Activity records, as the engine needs them                                 */
/* -------------------------------------------------------------------------- */

/**
 * The committed records to calculate over — the whole organisation, or one
 * import.
 *
 * `importId` is an additional predicate, never a replacement for the tenant
 * one: an id belonging to another organisation matches no rows and returns an
 * empty list, which is the same answer a nonexistent id gets. No existence
 * oracle on this path.
 */
export async function listRecordsForCalculation(
  organizationId: string,
  importId: string | null,
  db: Db = getDb(),
): Promise<ActivityInput[]> {
  return db
    .select({
      id: activityRecord.id,
      activityDate: activityRecord.activityDate,
      category: activityRecord.category,
      unit: activityRecord.unit,
      quantity: activityRecord.quantity,
    })
    .from(activityRecord)
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        importId ? eq(activityRecord.importId, importId) : undefined,
      ),
    );
}

/* -------------------------------------------------------------------------- */
/*  Writing computed emissions                                                 */
/* -------------------------------------------------------------------------- */

export type StoredEmission = {
  activityRecordId: string;
  factorId: string;
  kgCo2e: string;
  scope: FactorInput["scope"];
  scope3Category: FactorInput["scope3Category"];
  scope2Method: FactorInput["scope2Method"];
  gwpSet: FactorInput["gwpSet"];
  biogenic: boolean;
  outsideOfScopes: boolean;
  engineVersion: string;
};

/**
 * Replaces the computed emissions for a scope of records, in one transaction.
 *
 * **Delete-then-insert, not upsert, and the delete is bounded by the same
 * record set the insert covers.** A recalculation must leave no stale row
 * behind: a record whose `(category, unit)` mapping was removed now produces no
 * figure, and an upsert would leave its previous emission in place to be summed
 * into the next total. Scoping the delete to `recordIds` rather than to the
 * whole organisation is what lets a single import be recalculated without
 * discarding every other import's figures.
 *
 * The unique index on `activity_record_id` is the backstop: a double-run cannot
 * append a second figure for one record even if this transaction were wrong.
 */
export async function replaceEmissions(
  organizationId: string,
  recordIds: readonly string[],
  emissions: readonly StoredEmission[],
): Promise<{ written: number }> {
  if (recordIds.length === 0) return { written: 0 };

  return getDb().transaction(async (tx) => {
    for (const batch of chunk(recordIds, INSERT_BATCH)) {
      await tx
        .delete(activityEmission)
        .where(
          and(
            eq(activityEmission.organizationId, organizationId),
            inArray(activityEmission.activityRecordId, batch),
          ),
        );
    }

    for (const batch of chunk(emissions, INSERT_BATCH)) {
      await tx.insert(activityEmission).values(
        batch.map((emission) => ({
          organizationId,
          activityRecordId: emission.activityRecordId,
          factorId: emission.factorId,
          kgCo2e: emission.kgCo2e,
          scope: emission.scope,
          scope3Category: emission.scope3Category,
          scope2Method: emission.scope2Method,
          gwpSet: emission.gwpSet,
          biogenic: emission.biogenic,
          outsideOfScopes: emission.outsideOfScopes,
          engineVersion: emission.engineVersion,
        })),
      );
    }

    return { written: emissions.length };
  });
}

/* -------------------------------------------------------------------------- */
/*  Reading computed emissions back                                            */
/* -------------------------------------------------------------------------- */

export type PersistedEmission = {
  recordId: string;
  activityDate: string;
  kgCo2e: string;
  scope: FactorInput["scope"];
  scope3Category: FactorInput["scope3Category"];
  scope2Method: FactorInput["scope2Method"];
  gwpSet: FactorInput["gwpSet"];
  biogenic: boolean;
  outsideOfScopes: boolean;
  calculatedAt: Date;
};

/**
 * The stored figures for an organisation, or for one import.
 *
 * The totals surface reads these rather than recalculating on render: a
 * disclosure figure is a thing that was computed at a moment, by a named engine
 * version, against a named factor row, and re-deriving it on every page view
 * would make "what did we file" unanswerable.
 */
export async function listEmissions(
  organizationId: string,
  importId: string | null,
): Promise<PersistedEmission[]> {
  return getDb()
    .select({
      recordId: activityEmission.activityRecordId,
      activityDate: activityRecord.activityDate,
      kgCo2e: activityEmission.kgCo2e,
      scope: activityEmission.scope,
      scope3Category: activityEmission.scope3Category,
      scope2Method: activityEmission.scope2Method,
      gwpSet: activityEmission.gwpSet,
      biogenic: activityEmission.biogenic,
      outsideOfScopes: activityEmission.outsideOfScopes,
      calculatedAt: activityEmission.calculatedAt,
    })
    .from(activityEmission)
    .innerJoin(
      activityRecord,
      eq(activityRecord.id, activityEmission.activityRecordId),
    )
    .where(
      and(
        eq(activityEmission.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        importId ? eq(activityRecord.importId, importId) : undefined,
      ),
    );
}

/**
 * How many committed records currently have no computed figure — the number the
 * surface needs to say "this total is not complete" without recalculating.
 */
export async function countUncalculatedRecords(
  organizationId: string,
  importId: string | null,
): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(activityRecord)
    .leftJoin(
      activityEmission,
      eq(activityEmission.activityRecordId, activityRecord.id),
    )
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        isNull(activityEmission.id),
        importId ? eq(activityRecord.importId, importId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

/**
 * Whether this organisation has any factor mapping at all.
 *
 * The surface uses it to tell the difference between "nothing is mapped yet",
 * which is the state a new organisation is in and needs explaining, and "these
 * particular records did not match", which is a gap in an otherwise working
 * setup. Both are honest failures; they are not the same message.
 */
export async function hasAnyFactorMapping(
  organizationId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: sql<number>`1` })
    .from(activityFactorMapping)
    .where(
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        isNull(activityFactorMapping.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Seeds an organisation's default `(category, unit)` mappings, if it has none.
 *
 * **Only if it has none.** Re-running must never overwrite a reporter's own
 * choice of factor — the defaults are a starting point, and a later
 * `ON CONFLICT DO UPDATE` would silently undo a deliberate override. Called
 * once, when an organisation first reaches the totals surface.
 *
 * `isNotNull` on the resolved factor is what keeps a default that names a
 * `source_row_id` the seeded set does not contain from inserting a broken row:
 * the join simply produces nothing for it.
 */
export async function seedDefaultMappings(
  organizationId: string,
  defaults: readonly { category: ActivityCategory; unit: ActivityUnit; sourceRowId: string }[],
): Promise<{ inserted: number }> {
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ n: sql<number>`1` })
      .from(activityFactorMapping)
      .where(eq(activityFactorMapping.organizationId, organizationId))
      .limit(1);
    if (existing) return { inserted: 0 };

    const wanted = defaults.map((d) => d.sourceRowId);
    if (wanted.length === 0) return { inserted: 0 };

    const factors = await tx
      .select({
        id: emissionFactor.id,
        sourceRowId: emissionFactor.sourceRowId,
      })
      .from(emissionFactor)
      .innerJoin(
        emissionFactorSet,
        eq(emissionFactorSet.id, emissionFactor.setId),
      )
      .where(
        and(
          inArray(emissionFactor.sourceRowId, wanted),
          isNull(emissionFactor.deletedAt),
          isNull(emissionFactorSet.supersededBySetId),
          visibleFactorScope(organizationId),
          isNotNull(emissionFactor.id),
        ),
      );

    const byRowId = new Map(factors.map((f) => [f.sourceRowId, f.id]));
    const values = defaults
      .map((d) => {
        const factorId = byRowId.get(d.sourceRowId);
        return factorId
          ? { organizationId, category: d.category, unit: d.unit, factorId }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (values.length === 0) return { inserted: 0 };

    await tx.insert(activityFactorMapping).values(values);
    return { inserted: values.length };
  });
}

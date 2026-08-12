import "server-only";

import { and, asc, eq, ilike, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";

import { user } from "./auth-schema";
import { getDb, type Db } from "./client";
import {
  activityEmission,
  activityFactorMapping,
  activityRecord,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import { DEFAULT_FACTOR_MAPPINGS } from "../domain/defra";
import {
  admissibleFactorUnits,
  aggregate,
  toStoredKgCo2e,
  type ActivityInput,
  type FactorInput,
} from "../domain/emissions";

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
    byPair.set(`${mapping.category}.${mapping.unit}`, mapping.factor);
  }
  return (record: ActivityInput): FactorInput | null =>
    byPair.get(`${record.category}.${record.unit}`) ?? null;
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
/*  The recalculation seam                                                     */
/* -------------------------------------------------------------------------- */

export type RecalculationOutcome = {
  /** Committed records the run covered. Zero means there was nothing to
      calculate — a state the caller describes, not a failure this reports. */
  records: number;
  /** Computed emissions written for them. */
  written: number;
};

/**
 * One recalculation, from seeding the default mappings to writing the figures —
 * **the definition of what a recalculation is, in one place.**
 *
 * Build step 10 inlined this orchestration in `app/activity/actions.ts`'s
 * `recalculate`; build step 14 added a second caller, the nightly sweep in
 * `app/api/cron/recalculate/route.ts`, and **two implementations would be two
 * definitions of a disclosure figure**. So the action calls this and the cron
 * calls this, and neither restates the chain.
 *
 * **A query module composing a pure domain function is the established idiom
 * here, not a new smear**: `target-queries.ts`'s `readTargetEvidence` and
 * `dashboard-queries.ts`'s `readDashboardEvidence` already compose a
 * tenant-predicated read with `totalsByPeriod`. `lib/domain/` stays free of
 * every database handle, which is the boundary AGENTS.md 6.2 actually names —
 * `aggregate()` below is handed pure values and hands back pure values.
 *
 * **The behaviour is step 10's, unchanged.** `replaceEmissions` keeps its
 * delete-then-insert semantics bounded by the covered record set, for the reason
 * its own docblock records: a record whose mapping was removed must lose its
 * figure rather than keep a stale one.
 *
 * @param importId `null` recalculates the whole organisation; an id scopes the
 * run to one import. It is an additional predicate, never a replacement for the
 * tenant one.
 */
export async function recalculateOrganization(
  organizationId: string,
  importId: string | null,
): Promise<RecalculationOutcome> {
  /* A new organisation starts with the default `(category, unit)` mappings so
     its first calculation produces a total rather than a blank screen. It runs
     only when the organisation has none — a reporter's own choice is never
     overwritten (see `seedDefaultMappings`). */
  await seedDefaultMappings(organizationId, DEFAULT_FACTOR_MAPPINGS);

  const [records, mappings] = await Promise.all([
    listRecordsForCalculation(organizationId, importId),
    listFactorMappings(organizationId),
  ]);

  if (records.length === 0) return { records: 0, written: 0 };

  const { emissions } = aggregate(records, buildFactorResolver(mappings));

  const { written } = await replaceEmissions(
    organizationId,
    records.map((record) => record.id),
    emissions.map((emission) => ({
      activityRecordId: emission.recordId,
      factorId: emission.factorId,
      kgCo2e: toStoredKgCo2e(emission.kgCo2e),
      scope: emission.scope,
      scope3Category: emission.scope3Category,
      scope2Method: emission.scope2Method,
      gwpSet: emission.gwpSet,
      biogenic: emission.biogenic,
      outsideOfScopes: emission.outsideOfScopes,
      engineVersion: emission.engineVersion,
    })),
  );

  return { records: records.length, written };
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
 * **It has no caller, and this docblock used to claim otherwise.** Build step 10
 * wrote that "the surface uses it to tell the difference between 'nothing is
 * mapped yet' … and 'these particular records did not match'". No surface ever
 * did, and prompt 65 — which built the surface that would have — does not
 * either: {@link listFactorCoverage} answers the same question *per pair* and
 * from the same round trip, which is strictly more than this can say. Corrected
 * rather than left predicting something that did not happen (AGENTS.md 12
 * rule 8).
 *
 * Kept rather than deleted because the question is a real one for a caller that
 * holds no coverage list — the nightly sweep would have to ask it to distinguish
 * an unseeded organisation from an idle one. It is not called today.
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

/* -------------------------------------------------------------------------- */
/*  The mapping surface — prompt 65                                            */
/* -------------------------------------------------------------------------- */

/** The publisher's own description of a factor row, assembled the one way
    `listFactorMappings` already assembles it, so the picker, the coverage list
    and the calculation seam all name a row identically. */
function factorLabelOf(
  parts: readonly (string | null)[],
): string {
  return parts.filter(Boolean).join(" · ");
}

export type FactorCoveragePair = {
  category: ActivityCategory;
  unit: ActivityUnit;
  /** Committed records sitting behind this pair. */
  recordCount: number;
  /** `null` is the gap the surface exists to close. */
  mapping: {
    factorId: string;
    factorLabel: string;
    publishedUom: string;
    source: string;
    datasetVersion: string;
    chosenAt: Date;
    /** The person who chose it, or `null` for a seeded default — which no
        person chose, exactly as the column's own docblock says. */
    chosenBy: string | null;
  } | null;
};

/**
 * Every `(category, unit)` the organisation's committed records actually use,
 * with the factor mapped to it or nothing.
 *
 * **The gap, without running the engine.** `aggregate()` already computes an
 * identical shape in `CoverageReport.unmatchedPairs`, but obtaining it means a
 * full recalculation, and a page render must not recompute a disclosure input
 * (`listEmissions`' docblock says why). This is the same question asked of the
 * rows themselves.
 *
 * **Pairs with no records are deliberately absent.** All 64 are possible and
 * eight are seeded by default; listing the 53 a tenant has never recorded
 * against would bury the handful that matter. What a reporter is owed is the
 * shape of their own data.
 *
 * Predicated on `organization_id = $1` throughout — on the records, and again on
 * the mapping join, so a pair can never pick up another tenant's choice.
 */
export async function listFactorCoverage(
  organizationId: string,
): Promise<FactorCoveragePair[]> {
  const rows = await getDb()
    .select({
      category: activityRecord.category,
      unit: activityRecord.unit,
      recordCount: sql<number>`count(*)::int`,
      factorId: activityFactorMapping.factorId,
      chosenAt: activityFactorMapping.updatedAt,
      chosenBy: user.name,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
    })
    .from(activityRecord)
    .leftJoin(
      activityFactorMapping,
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        eq(activityFactorMapping.category, activityRecord.category),
        eq(activityFactorMapping.unit, activityRecord.unit),
        isNull(activityFactorMapping.deletedAt),
      ),
    )
    .leftJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityFactorMapping.factorId),
        isNull(emissionFactor.deletedAt),
      ),
    )
    .leftJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .leftJoin(user, eq(user.id, activityFactorMapping.createdBy))
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
      ),
    )
    /* Every non-aggregated column, listed rather than leaning on Postgres's
       functional-dependency rule: that rule is stated for a grouped primary
       key, and three of these tables sit on the nullable side of an outer
       join. Explicit is one line longer and cannot surprise us. */
    .groupBy(
      activityRecord.category,
      activityRecord.unit,
      activityFactorMapping.factorId,
      activityFactorMapping.updatedAt,
      user.name,
      emissionFactor.level2,
      emissionFactor.level3,
      emissionFactor.columnText,
      emissionFactor.publishedUom,
      emissionFactorSet.source,
      emissionFactorSet.datasetVersion,
    )
    /* Unmapped first, then the biggest gap — the same reading order
       `aggregate()` sorts `unmatchedPairs` into, so the two agree on which gap
       is the one to look at. */
    .orderBy(
      sql`(${activityFactorMapping.factorId} is not null)`,
      sql`count(*) desc`,
      asc(activityRecord.category),
      asc(activityRecord.unit),
    );

  return rows.map((row) => ({
    category: row.category,
    unit: row.unit,
    recordCount: row.recordCount,
    mapping:
      row.factorId && row.source && row.datasetVersion
        ? {
            factorId: row.factorId,
            factorLabel: factorLabelOf([
              row.level2,
              row.level3,
              row.columnText,
            ]),
            publishedUom: row.publishedUom ?? "",
            source: row.source,
            datasetVersion: row.datasetVersion,
            chosenAt: row.chosenAt ?? new Date(0),
            chosenBy: row.chosenBy,
          }
        : null,
  }));
}

/**
 * How many rows a search returns.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). The 2026 set holds
 * 7,035 rows and a reporter scanning a list to choose one factor is doing
 * careful work, not browsing: 50 is more than a screen and far short of a page
 * nobody reads to the end of. Narrowing the search is the way to see a
 * different fifty.
 */
export const FACTOR_SEARCH_LIMIT = 50;

export type FactorSearchRow = {
  id: string;
  label: string;
  publishedUom: string;
  scope: FactorInput["scope"];
  gas: FactorInput["gas"];
  value: string;
  source: string;
  datasetVersion: string;
};

/** Postgres reads `%` and `_` as wildcards and `\` as the default escape, so a
    reporter typing "Diesel_100%" would otherwise run a much broader search than
    they asked for. Escaping is a correctness fix, not a safety one — the
    pattern is a bound parameter either way. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The factors that can be offered for one `(category, unit)` pair.
 *
 * **Narrowed by the engine's own rule, not by a second copy of it.**
 * `admissibleFactorUnits` derives the admissible denominators from
 * `factorEligibility`, and `result_unit = 'kg_co2e'` is the same check
 * `calculateRecordEmission` performs first. Offering a row the engine would
 * refuse lets an owner "fix" a gap and change nothing but the refusal reason.
 *
 * Visible reference data only (`organization_id is null or = $1`), non-deleted,
 * and from a set that has not been superseded — the same three predicates
 * `seedDefaultMappings` applies, so nothing can be chosen here that the seeder
 * would not have chosen.
 *
 * The match is over the publisher's own description columns, which are the three
 * `listFactorMappings` already joins into `factorLabel`.
 */
export async function searchFactorsForPair(
  organizationId: string,
  unit: ActivityUnit,
  query: string,
): Promise<FactorSearchRow[]> {
  const admissible = admissibleFactorUnits(unit);
  if (admissible.length === 0) return [];

  const trimmed = query.trim();
  const pattern = trimmed === "" ? null : `%${escapeLike(trimmed)}%`;

  const rows = await getDb()
    .select({
      id: emissionFactor.id,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      scope: emissionFactor.scope,
      gas: emissionFactor.gas,
      value: emissionFactor.value,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
        eq(emissionFactor.resultUnit, "kg_co2e"),
        inArray(emissionFactor.activityUnit, admissible),
        pattern
          ? or(
              ilike(emissionFactor.level2, pattern),
              ilike(emissionFactor.level3, pattern),
              ilike(emissionFactor.columnText, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(emissionFactor.level2),
      asc(emissionFactor.level3),
      asc(emissionFactor.columnText),
    )
    .limit(FACTOR_SEARCH_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    label: factorLabelOf([row.level2, row.level3, row.columnText]),
    publishedUom: row.publishedUom,
    scope: row.scope,
    gas: row.gas,
    value: row.value,
    source: row.source,
    datasetVersion: row.datasetVersion,
  }));
}

export type VisibleFactor = {
  id: string;
  label: string;
  activityUnit: FactorInput["activityUnit"];
  resultUnit: FactorInput["resultUnit"];
};

/**
 * One factor, re-resolved under the tenant's own visibility.
 *
 * **A factor id arriving from the browser is a claim, not a capability.** One
 * belonging to another tenant's private set answers `null`, which is
 * indistinguishable from one that does not exist — the same stance `getImport`
 * takes on a foreign `importId`. No existence oracle.
 */
export async function getVisibleFactor(
  organizationId: string,
  factorId: string,
): Promise<VisibleFactor | null> {
  const [row] = await getDb()
    .select({
      id: emissionFactor.id,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      activityUnit: emissionFactor.activityUnit,
      resultUnit: emissionFactor.resultUnit,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(emissionFactor.id, factorId),
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    label: factorLabelOf([row.level2, row.level3, row.columnText]),
    activityUnit: row.activityUnit,
    resultUnit: row.resultUnit,
  };
}

/**
 * Sets the organisation's factor for one `(category, unit)` pair.
 *
 * **`deleted_at` is cleared, and that is required for correctness rather than
 * tidiness.** `activity_factor_mapping_key` is a plain unique index, not a
 * partial one (`lib/db/schema.ts`), so a soft-deleted row still occupies its
 * `(organization_id, category, unit)` slot: an upsert that left `deleted_at`
 * set would resurrect nothing and re-mapping the pair would keep failing the
 * conflict silently. Prompt 65 sets and changes a mapping and deliberately
 * offers no unmap — what a removed mapping means is a decision of its own.
 *
 * **This is a `set`, not a `seed`.** `seedDefaultMappings` refuses to overwrite
 * a reporter's own choice, for the reason its docblock records; this *is* the
 * reporter's own choice, made deliberately, so it overwrites.
 */
export async function setFactorMapping(input: {
  organizationId: string;
  category: ActivityCategory;
  unit: ActivityUnit;
  factorId: string;
  /** The person who chose it, for the provenance line. */
  userId: string;
}): Promise<void> {
  await getDb()
    .insert(activityFactorMapping)
    .values({
      organizationId: input.organizationId,
      category: input.category,
      unit: input.unit,
      factorId: input.factorId,
      createdBy: input.userId,
    })
    .onConflictDoUpdate({
      target: [
        activityFactorMapping.organizationId,
        activityFactorMapping.category,
        activityFactorMapping.unit,
      ],
      set: {
        factorId: input.factorId,
        createdBy: input.userId,
        updatedAt: new Date(),
        deletedAt: null,
      },
    });
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

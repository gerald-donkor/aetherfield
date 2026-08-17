import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { user } from "./auth-schema";
import { getDb } from "./client";
import {
  activityEmission,
  activityFactorMapping,
  activityRecord,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import { factorLabelOf, visibleFactorScope } from "./factor-scope";
import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import type { Scope2MarketBasis } from "../validation/emissions";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("coverage-queries");

/**
 * What is mapped, and what has no figure — **answered from the rows, without
 * running the engine.**
 *
 * One of the eight edit reasons prompt 119 split `emission-queries.ts` along.
 * `aggregate()` computes an identical shape in `CoverageReport`, but obtaining
 * it means a full recalculation, and a page render must not recompute a
 * disclosure input. Every predicate here therefore has to answer as the resolver
 * in `emission-queries.ts` would, which is why
 * {@link outOfPeriodPredicate} is written once and used by both reads below.
 * The visibility predicate and the no-logging rule are `factor-scope.ts`'s.
 */

/**
 * How many committed records currently have no computed figure — the number the
 * surface needs to say "this total is not complete" without recalculating.
 */
export const countUncalculatedRecords = safe("countUncalculatedRecords", countUncalculatedRecordsImpl);

async function countUncalculatedRecordsImpl(
  organizationId: string,
  importId: string | null,
): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(activityRecord)
    .leftJoin(
      activityEmission,
      and(
        eq(activityEmission.activityRecordId, activityRecord.id),
        /* The primary lane only. This count is of the null side, which a second
           market-based row cannot inflate — but a reader should not have to
           work that out, and the predicate makes the question this asks
           ("which records have no primary figure") explicit. */
        sql`${activityEmission.scope2Method} is distinct from 'market_based'`,
      ),
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
 * How many committed records are mapped but dated outside every visible factor
 * set's window — **the part of the uncalculated figure that has a specific
 * answer.**
 *
 * `countUncalculatedRecords` is honest but undifferentiated: it counts records
 * with no computed figure, whatever the reason. This names the one reason a
 * reporter resolves by loading a year's factor set rather than by mapping a
 * pair, which is why the coverage line prints it separately.
 *
 * Answered from the rows themselves rather than by running the engine — the
 * reason {@link listFactorCoverage} exists, applied to the same question. The
 * predicate is the shared one, so this and the pair list agree by construction.
 */
export const countOutOfPeriodRecords = safe("countOutOfPeriodRecords", countOutOfPeriodRecordsImpl);

async function countOutOfPeriodRecordsImpl(
  organizationId: string,
  importId: string | null,
): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(activityRecord)
    .innerJoin(
      activityFactorMapping,
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        eq(activityFactorMapping.category, activityRecord.category),
        eq(activityFactorMapping.unit, activityRecord.unit),
        isNull(activityFactorMapping.deletedAt),
        /* The default lane only, for the reason `listFactorCoverage`'s join
           records: a second lane would count every record twice. */
        isNull(activityFactorMapping.scope2Method),
      ),
    )
    .innerJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityFactorMapping.factorId),
        isNull(emissionFactor.deletedAt),
        /* Redundant today and stated anyway — prompt 99. The scope arrives
           transitively from `activityFactorMapping`, which is strictly
           tenant-scoped and already filtered above; but that is a property of
           this join graph, and a future edit to the mapping's filter would
           remove the guarantee silently. */
        visibleFactorScope(organizationId),
      ),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        importId ? eq(activityRecord.importId, importId) : undefined,
        outOfPeriodPredicate(organizationId),
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
export const hasAnyFactorMapping = safe("hasAnyFactorMapping", hasAnyFactorMappingImpl);

async function hasAnyFactorMappingImpl(
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
 * "This record is mapped, and no visible set's window contains its date" — in
 * SQL, **as one expression, written once**.
 *
 * It mirrors {@link buildFactorResolver} stage for stage, and it has to: this is
 * what the two coverage surfaces render, and the resolver is what actually
 * decides the figure. A predicate that answered differently would tell a
 * reporter a gap was closed while the engine still refused the record.
 *
 * - the mapped row's **own** set window first, exactly as the resolver's fast
 *   path — which is why a superseded mapped set still counts as covering, there
 *   and here;
 * - then the `(source, source_row_id)` siblings, under the tenant predicate and
 *   the same three `deleted` / `superseded` filters `listFactorSiblings` and
 *   `searchFactorsForPair` apply.
 *
 * The subquery's two tables are aliased in literal SQL because they are the same
 * two tables the outer query already joins; the interpolations are the outer
 * columns and the bound organisation id.
 *
 * It reads `activityRecord`, `emissionFactor` and `emissionFactorSet` from the
 * enclosing query, so it is only valid where all three are in scope.
 */
function outOfPeriodPredicate(organizationId: string) {
  return sql`${activityRecord.activityDate} not between ${emissionFactorSet.effectiveFrom} and ${emissionFactorSet.effectiveTo}
    and not exists (
      select 1
      from emission_factor sibling_factor
      join emission_factor_set sibling_set
        on sibling_set.id = sibling_factor.set_id
      where sibling_factor.source_row_id = ${emissionFactor.sourceRowId}
        and sibling_set.source = ${emissionFactorSet.source}
        and (
          sibling_factor.organization_id is null
          or sibling_factor.organization_id = ${organizationId}
        )
        and sibling_factor.deleted_at is null
        and sibling_set.deleted_at is null
        and sibling_set.superseded_by_set_id is null
        and ${activityRecord.activityDate}
          between sibling_set.effective_from and sibling_set.effective_to
    )`;
}

export type FactorCoveragePair = {
  category: ActivityCategory;
  unit: ActivityUnit;
  /** Committed records sitting behind this pair. */
  recordCount: number;
  /** Of those, how many are dated outside every window the mapped factor's
      `(source, source_row_id)` is published in — mapped, and still contributing
      nothing. Always `0` for an unmapped pair, whose records are counted by the
      `mapping === null` gap instead. */
  outOfPeriodRecords: number;
  /** `null` is the gap the surface exists to close. */
  mapping: {
    factorId: string;
    factorLabel: string;
    publishedUom: string;
    source: string;
    datasetVersion: string;
    customerSupplied: boolean;
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
 *
 * **Two questions since prompt 68, not one.** "Is there a mapping" was the whole
 * of it, and a mapped pair whose records all fell outside every published window
 * read as fully covered while contributing nothing. `outOfPeriodRecords` answers
 * the second, through {@link outOfPeriodPredicate} — the same expression
 * {@link countOutOfPeriodRecords} uses, so the pair list and the coverage line
 * cannot disagree.
 */
export const listFactorCoverage = safe("listFactorCoverage", listFactorCoverageImpl);

async function listFactorCoverageImpl(
  organizationId: string,
): Promise<FactorCoveragePair[]> {
  const rows = await getDb()
    .select({
      category: activityRecord.category,
      unit: activityRecord.unit,
      recordCount: sql<number>`count(*)::int`,
      /* A `FILTER` rather than a second query: its expression is evaluated per
         input row, like an aggregate's argument, so the ungrouped columns it
         reads need no `GROUP BY` entry. */
      outOfPeriodRecords: sql<number>`count(*) filter (
        where ${activityFactorMapping.factorId} is not null
          and ${outOfPeriodPredicate(organizationId)}
      )::int`,
      factorId: activityFactorMapping.factorId,
      chosenAt: activityFactorMapping.updatedAt,
      chosenBy: user.name,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      setOrganizationId: emissionFactorSet.organizationId,
    })
    .from(activityRecord)
    .leftJoin(
      activityFactorMapping,
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        eq(activityFactorMapping.category, activityRecord.category),
        eq(activityFactorMapping.unit, activityRecord.unit),
        isNull(activityFactorMapping.deletedAt),
        /* **The default lane only** — prompt 85. Without this predicate a pair
           carrying a market-based mapping as well would join twice and every
           count in this grouped read would double. The market lane is read
           separately by {@link listMarketBasedMappings}. */
        isNull(activityFactorMapping.scope2Method),
      ),
    )
    .leftJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityFactorMapping.factorId),
        isNull(emissionFactor.deletedAt),
        /* Stated here too — prompt 99, and see the same note on
           {@link countOutOfPeriodRecords}. On this **outer** join a scope miss
           would null the factor columns rather than drop the row, which is the
           coverage surface's "unmapped" state; no reachable row can miss it
           today, and the predicate is what keeps that locally checkable. */
        visibleFactorScope(organizationId),
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
      emissionFactorSet.organizationId,
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
    outOfPeriodRecords: row.outOfPeriodRecords,
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
            customerSupplied: row.setOrganizationId !== null,
            chosenAt: row.chosenAt ?? new Date(0),
            chosenBy: row.chosenBy,
          }
        : null,
  }));
}

export type MarketBasedMapping = {
  category: ActivityCategory;
  unit: ActivityUnit;
  /** Which rung the reporter asserted — prompt 86. A row written before the
      column existed reads as `contractual_instrument`, which is what the lane
      check permitted at the time it was written. */
  basis: Scope2MarketBasis;
  factorId: string;
  factorLabel: string;
  source: string;
  datasetVersion: string;
  customerSupplied: boolean;
  chosenAt: Date;
  chosenBy: string | null;
};

/**
 * The organisation's market-based scope 2 mappings — prompt 85.
 *
 * **A separate read rather than a second join into {@link listFactorCoverage}.**
 * That query groups over the record scan to count records per pair, and a
 * second mapping row per pair would double every count in it; the lane is
 * therefore excluded there and asked for here, over the mapping table alone.
 * There is at most one row per pair by
 * `activity_factor_mapping_method_key`, so no grouping is needed.
 *
 * Predicated on `organization_id = $1` on the mapping, and on the shared
 * visibility predicate for the factor, so a lane can never pick up another
 * tenant's row.
 */
export const listMarketBasedMappings = safe("listMarketBasedMappings", listMarketBasedMappingsImpl);

async function listMarketBasedMappingsImpl(
  organizationId: string,
): Promise<MarketBasedMapping[]> {
  const rows = await getDb()
    .select({
      category: activityFactorMapping.category,
      unit: activityFactorMapping.unit,
      basis: activityFactorMapping.scope2MarketBasis,
      factorId: activityFactorMapping.factorId,
      chosenAt: activityFactorMapping.updatedAt,
      chosenBy: user.name,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      setOrganizationId: emissionFactorSet.organizationId,
    })
    .from(activityFactorMapping)
    .innerJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityFactorMapping.factorId),
        isNull(emissionFactor.deletedAt),
        visibleFactorScope(organizationId),
      ),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .leftJoin(user, eq(user.id, activityFactorMapping.createdBy))
    .where(
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        isNull(activityFactorMapping.deletedAt),
        eq(activityFactorMapping.scope2Method, "market_based"),
      ),
    )
    .orderBy(asc(activityFactorMapping.category), asc(activityFactorMapping.unit));

  return rows.map((row) => ({
    category: row.category,
    unit: row.unit,
    basis: row.basis ?? "contractual_instrument",
    factorId: row.factorId,
    factorLabel: factorLabelOf([row.level2, row.level3, row.columnText]),
    source: row.source,
    datasetVersion: row.datasetVersion,
    customerSupplied: row.setOrganizationId !== null,
    chosenAt: row.chosenAt,
    chosenBy: row.chosenBy,
  }));
}

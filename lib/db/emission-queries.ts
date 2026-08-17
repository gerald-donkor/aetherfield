import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { getDb, type Db } from "./client";
import {
  activityEmission,
  activityFactorMapping,
  activityRecord,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import { visibleFactorScope } from "./factor-scope";
import { chunk, INSERT_BATCH } from "./insert-batch";
import { seedDefaultMappings } from "./factor-mapping-queries";
import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import { DEFAULT_FACTOR_MAPPINGS } from "../domain/defra";
import {
  aggregate,
  toStoredKgCo2e,
  type ActivityInput,
  type FactorInput,
  type FactorResolution,
  type FactorResolver,
} from "../domain/emissions";
import {
  factorSiblingKeys,
  selectFactorForDate,
  type FactorCandidate,
  type FactorRowIdentity,
} from "../domain/factor-selection";
import type {
  Scope2MarketBasis,
  Scope2Method,
} from "../validation/emissions";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("emission-queries");

/**
 * `activity_emission` — the recalculation seam, and reading the stored figures
 * back.
 *
 * Two of the eight edit reasons prompt 119 split this module along; it keeps its
 * name because it keeps the emission table. Everything about factors, sets,
 * mappings and coverage moved to the six siblings named in `docs/backend.md`,
 * build step 10.
 *
 * **{@link recalculateOrganization} is the definition of what a recalculation
 * is, in one place** — the action and the nightly cron both call it, and two
 * implementations would be two definitions of a disclosure figure. The
 * visibility predicate and the no-logging rule are `factor-scope.ts`'s.
 */

/* -------------------------------------------------------------------------- */
/*  The mapping                                                                */
/* -------------------------------------------------------------------------- */

export type ResolvedMapping = {
  category: ActivityCategory;
  unit: ActivityUnit;
  /** Which reporting lane this mapping feeds — the `activity_factor_mapping`
      column, **not** the factor's own `scope2Method`. `null` is the default
      lane; `"market_based"` is prompt 85's second scope 2 lane. */
  lane: Scope2Method | null;
  /** What the reporter asserted the market-lane figure rests on — prompt 86.
      Null on the default lane; non-null on every market-lane mapping. */
  marketBasis: Scope2MarketBasis | null;
  factor: FactorInput;
  /** The publisher's own description of the chosen row, for the surface. */
  factorLabel: string;
  source: string;
  datasetVersion: string;
  /** The publisher's stable row id. **How a mapping travels to another year's
      set** (prompt 68): DEFRA republishes the same row under the same id each
      year, so "the factor this tenant chose, in the year the activity happened"
      is `(source, source_row_id)` looked up in that year's set. No schema change
      and no per-period mapping table. */
  sourceRowId: string;
  /** The chosen row's own set window, so {@link buildFactorResolver}'s fast
      path can answer without consulting a sibling. */
  effectiveFrom: string;
  effectiveTo: string;
};

/**
 * One visible factor row that shares a mapping's `(source, source_row_id)`.
 * **Loaded once per recalculation**, never per record.
 *
 * A `FactorCandidate` — the pure shape `lib/domain/factor-selection.ts` decides
 * over — plus the columns that say which mapping it belongs to: its own row
 * identity, and the published one a customer-supplied row declares it restates
 * (prompt 71). `factorSiblingKeys` turns the four into the keys the resolver
 * files it under.
 */
export type FactorSibling = FactorCandidate & FactorRowIdentity;

/**
 * Every `(category, unit)` this organisation has a factor for.
 *
 * Returned as a list rather than a map so the caller decides the key shape;
 * {@link buildFactorResolver} turns it into the pure `FactorResolver` the
 * engine takes. The engine never sees a database handle — that boundary is
 * AGENTS.md 6.2's, and this function is the seam.
 */
export const listFactorMappings = safe("listFactorMappings", listFactorMappingsImpl);

async function listFactorMappingsImpl(
  organizationId: string,
  db: Db = getDb(),
): Promise<ResolvedMapping[]> {
  const rows = await db
    .select({
      category: activityFactorMapping.category,
      unit: activityFactorMapping.unit,
      /* The mapping's lane, aliased so it cannot be confused with the factor
         row's own `scope2Method` two lines below. They are different facts: a
         lane says which figure this mapping feeds, the factor's method says
         what the published row is. */
      lane: activityFactorMapping.scope2Method,
      marketBasis: activityFactorMapping.scope2MarketBasis,
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
      sourceRowId: emissionFactor.sourceRowId,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      effectiveFrom: emissionFactorSet.effectiveFrom,
      effectiveTo: emissionFactorSet.effectiveTo,
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
    lane: row.lane,
    marketBasis: row.marketBasis,
    factorLabel: [row.level2, row.level3, row.columnText]
      .filter(Boolean)
      .join(" · "),
    source: row.source,
    datasetVersion: row.datasetVersion,
    sourceRowId: row.sourceRowId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
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

/**
 * Every visible factor row sharing a `(source, source_row_id)` with one of these
 * mappings — **one query, for the whole recalculation**.
 *
 * `recalculateOrganization` runs over an entire organisation and the nightly
 * sweep runs it for every organisation, so a per-record lookup here would be a
 * production problem rather than a style note. The rows come back once and
 * {@link buildFactorResolver} does all the interval matching in memory.
 *
 * **The same three predicates `searchFactorsForPair` applies**, plus the tenant
 * scope: nothing can be selected here that the picker would not have offered,
 * and a sibling resolved across the tenant boundary would be a cross-tenant leak
 * into a filed number, which is why the predicate is the shared helper rather
 * than a restatement of it.
 */
export const listFactorSiblings = safe("listFactorSiblings", listFactorSiblingsImpl);

async function listFactorSiblingsImpl(
  organizationId: string,
  mappings: readonly ResolvedMapping[],
  db: Db = getDb(),
): Promise<FactorSibling[]> {
  /* Distinct pairs — eight seeded mappings routinely share four factor rows,
     and `(category, unit)` is capped at 64 by the two enums, so the OR list is
     bounded and fully parameterised. */
  const pairs = new Map<string, { source: string; sourceRowId: string }>();
  for (const mapping of mappings) {
    pairs.set(`${mapping.source}${mapping.sourceRowId}`, {
      source: mapping.source,
      sourceRowId: mapping.sourceRowId,
    });
  }
  if (pairs.size === 0) return [];

  const rows = await db
    .select({
      source: emissionFactorSet.source,
      sourceRowId: emissionFactor.sourceRowId,
      supersedesSource: emissionFactor.supersedesSource,
      supersedesSourceRowId: emissionFactor.supersedesSourceRowId,
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
      effectiveFrom: emissionFactorSet.effectiveFrom,
      effectiveTo: emissionFactorSet.effectiveTo,
      setId: emissionFactorSet.id,
      setOrganizationId: emissionFactorSet.organizationId,
      publicationYear: emissionFactorSet.publicationYear,
      setCreatedAt: emissionFactorSet.createdAt,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
        /* **Either key** (prompt 71): the row's own published identity, or the
           published row a customer-supplied row declares it restates.
           `visibleFactorScope` stays an outer `AND` over the whole `where` and
           is deliberately not folded in here — it is what stops one tenant's
           superseding row entering another tenant's sibling set. */
        or(
          ...[...pairs.values()].flatMap((pair) => [
            and(
              eq(emissionFactorSet.source, pair.source),
              eq(emissionFactor.sourceRowId, pair.sourceRowId),
            ),
            and(
              eq(emissionFactor.supersedesSource, pair.source),
              eq(emissionFactor.supersedesSourceRowId, pair.sourceRowId),
            ),
          ]),
        ),
      ),
    );

  return rows.map((row) => ({
    source: row.source,
    sourceRowId: row.sourceRowId,
    supersedesSource: row.supersedesSource,
    supersedesSourceRowId: row.supersedesSourceRowId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    setId: row.setId,
    setOrganizationId: row.setOrganizationId,
    publicationYear: row.publicationYear,
    setCreatedAt: row.setCreatedAt,
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

/**
 * Turns the mapping rows into the pure resolver `aggregate()` takes — **now
 * selecting by the record's own date** (prompt 68).
 *
 * Keeping this here rather than in `lib/domain/` is what lets the engine stay
 * free of any notion of where a factor came from. It is **pure and synchronous**
 * and issues no query: every candidate it can return is already in `siblings`.
 *
 * **The rule it applies is not written here.** Which set wins for a date is
 * `selectFactorForDate` in `lib/domain/factor-selection.ts` — pure, and under
 * test, because it decides which published value multiplies a customer's
 * activity. This function does the two things that are genuinely about storage:
 * index the mappings by pair, and index the siblings by the publisher's row
 * identity. `no_mapping` is decided here because only this layer knows what a
 * mapping is.
 *
 * **One lane per resolver** (prompt 85). The resolver is a
 * `record → factor` function and a record now has up to two factors, so the
 * lane is chosen when the resolver is built rather than smuggled into its key:
 * `recalculateOrganization` builds one for the default lane and one for the
 * market lane, and each is the same rule over a different subset of the same
 * mapping rows. The date-selection rule itself lives in
 * `lib/domain/factor-selection.ts` and is not duplicated.
 *
 * @param lane `null` is the default lane — the location-based figure and every
 * scope 1 and 3 figure. `"market_based"` resolves only the pairs the reporter
 * has mapped a contractual rate for; every other pair answers `no_mapping`,
 * which the market pass discards rather than reporting as a coverage gap.
 */
export function buildFactorResolver(
  mappings: readonly ResolvedMapping[],
  siblings: readonly FactorSibling[] = [],
  lane: Scope2Method | null = null,
): FactorResolver {
  const byPair = new Map<string, ResolvedMapping>();
  for (const mapping of mappings) {
    if ((mapping.lane ?? null) !== lane) continue;
    byPair.set(`${mapping.category}.${mapping.unit}`, mapping);
  }

  /* Nested rather than a composite string key, so no separator has to be
     chosen and no source or row id can collide with one.

     **Filed under every key `factorSiblingKeys` returns**, which for a
     customer-supplied row that declares a supersession is two (prompt 71). The
     rule is in `lib/domain/` rather than here because it decides which value
     multiplies a customer's activity. */
  const bySourceRow = new Map<string, Map<string, FactorSibling[]>>();
  for (const sibling of siblings) {
    for (const key of factorSiblingKeys(sibling)) {
      let bySource = bySourceRow.get(key.source);
      if (!bySource) {
        bySource = new Map();
        bySourceRow.set(key.source, bySource);
      }
      const existing = bySource.get(key.sourceRowId);
      if (existing) existing.push(sibling);
      else bySource.set(key.sourceRowId, [sibling]);
    }
  }

  return (record: ActivityInput): FactorResolution => {
    const mapping = byPair.get(`${record.category}.${record.unit}`);
    if (!mapping) return { ok: false, gap: "no_mapping" };

    const factor = selectFactorForDate(
      mapping,
      bySourceRow.get(mapping.source)?.get(mapping.sourceRowId) ?? [],
      record.activityDate,
    );

    if (!factor) return { ok: false, gap: "out_of_period" };

    /* **The lane's assertion travels with the figure** — prompt 86. On the
       market lane the basis is what labels the result, because on the
       `grid_average` basis the chosen row is a grid average whose own method
       says `location_based`. A market-lane mapping with no basis is a row from
       before the column existed; the backfill gave every one of them
       `contractual_instrument`, which is what they were by construction, and
       the fallback here says the same thing rather than producing an
       unlabelled market figure. */
    return lane === "market_based"
      ? {
          ok: true,
          factor,
          marketBasis: mapping.marketBasis ?? "contractual_instrument",
        }
      : { ok: true, factor };
  };
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
export const listRecordsForCalculation = safe("listRecordsForCalculation", listRecordsForCalculationImpl);

async function listRecordsForCalculationImpl(
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
  scope2MarketBasis: Scope2MarketBasis | null;
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
export const replaceEmissions = safe("replaceEmissions", replaceEmissionsImpl);

async function replaceEmissionsImpl(
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
          scope2MarketBasis: emission.scope2MarketBasis,
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
 * **The factor is selected by the record's own date** (prompt 68), not by
 * whichever row the mapping happens to point at: `listFactorSiblings` loads the
 * mapped rows' `(source, source_row_id)` siblings once, and the resolver picks
 * the set whose window contains the activity date. A record no visible set
 * covers produces no figure and is reported in the coverage report's
 * `outOfPeriodYears`.
 *
 * **The behaviour is otherwise step 10's, unchanged.** `replaceEmissions` keeps its
 * delete-then-insert semantics bounded by the covered record set, for the reason
 * its own docblock records: a record whose mapping was removed must lose its
 * figure rather than keep a stale one.
 *
 * @param importId `null` recalculates the whole organisation; an id scopes the
 * run to one import. It is an additional predicate, never a replacement for the
 * tenant one.
 */
export const recalculateOrganization = safe("recalculateOrganization", recalculateOrganizationImpl);

async function recalculateOrganizationImpl(
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

  /* Sequential, and only once there is something to calculate: the sibling
     lookup is keyed by the mappings, and an organisation with no records pays
     for neither. Still a constant number of queries in the record count — the
     resolver below never issues one. */
  const siblings = await listFactorSiblings(organizationId, mappings);

  const { emissions } = aggregate(
    records,
    buildFactorResolver(mappings, siblings, null),
  );

  /* **The market pass** — prompt 85, and the second half of the Scope 2
     Guidance's dual reporting.

     It runs over the subset of records whose `(category, unit)` carries a
     market-based mapping, and its own coverage report is discarded: a pair with
     no market-lane mapping is not a gap, it is the expected state, and nothing
     is substituted for it. What is *not* discarded is the figure — and
     `outOfPeriodYears` on this lane is the same gap the default lane already
     reports, through the same predicate.

     **Which rung the figure rests on is the mapping's, not the factor's** —
     prompt 86. `buildFactorResolver` reads `marketBasis` off the market-lane
     mapping and hands it to the engine, so a pair mapped on the `grid_average`
     basis produces a market-based figure from a grid-average row and carries
     the basis that says so onto the stored row. That is still no extra query.

     No extra query: the mappings and the siblings are already loaded, the
     resolver issues none, and both lanes' figures go to `replaceEmissions` in
     one transaction. */
  const marketPairs = new Set(
    mappings
      .filter((mapping) => mapping.lane === "market_based")
      .map((mapping) => `${mapping.category}.${mapping.unit}`),
  );
  const marketEmissions =
    marketPairs.size === 0
      ? []
      : aggregate(
          records.filter((record) =>
            marketPairs.has(`${record.category}.${record.unit}`),
          ),
          buildFactorResolver(mappings, siblings, "market_based"),
        ).emissions;

  const { written } = await replaceEmissions(
    organizationId,
    records.map((record) => record.id),
    [...emissions, ...marketEmissions].map((emission) => ({
      activityRecordId: emission.recordId,
      factorId: emission.factorId,
      kgCo2e: toStoredKgCo2e(emission.kgCo2e),
      scope: emission.scope,
      scope3Category: emission.scope3Category,
      scope2Method: emission.scope2Method,
      scope2MarketBasis: emission.scope2MarketBasis,
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
  /** The rung the stored market-based figure was computed under — prompt 86.
      Null on every other figure, and null on a market-based row written before
      the column existed. */
  scope2MarketBasis: Scope2MarketBasis | null;
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
export const listEmissions = safe("listEmissions", listEmissionsImpl);

async function listEmissionsImpl(
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
      scope2MarketBasis: activityEmission.scope2MarketBasis,
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

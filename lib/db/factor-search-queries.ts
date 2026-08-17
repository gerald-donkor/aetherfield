import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "./client";
import {
  emissionFactor,
  emissionFactorLabelSql,
  emissionFactorSet,
} from "./schema";
import { factorLabelOf, visibleFactorScope } from "./factor-scope";
import type { ActivityUnit } from "../validation/activity";
import { admissibleFactorUnits, type FactorInput } from "../domain/emissions";
import type {
  Scope2MarketBasis,
  Scope2Method,
} from "../validation/emissions";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("factor-search-queries");

/**
 * The factor picker: what may be offered for a `(category, unit)` pair, by
 * label and by close wording, and re-resolving one chosen id.
 *
 * One of the eight edit reasons prompt 119 split `emission-queries.ts` along.
 * Every read here applies the same five eligibility predicates, so nothing can
 * be offered that `factor-mapping-queries.ts`'s seeder would not have chosen or
 * that the engine would refuse. The visibility predicate and the no-logging rule
 * are `factor-scope.ts`'s.
 */

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
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  customerSupplied: boolean;
};

/** Postgres reads `%` and `_` as wildcards and `\` as the default escape, so a
    reporter typing "Diesel_100%" would otherwise run a much broader search than
    they asked for. Escaping is a correctness fix, not a safety one — the
    pattern is a bound parameter either way. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * What the market lane may offer, per basis — prompt 86, and **stated once** so
 * the lexical and the close-wording picker cannot narrow differently.
 *
 * `is distinct from` rather than `<>` on the fallback half: the column is null
 * on every row that is not scope 2, and `null <> 'market_based'` is null rather
 * than true. The scope predicate already excludes those rows, and the idiom is
 * kept because the two predicates should not depend on each other to be safe.
 */
function marketLaneScope(
  lane: Scope2Method | null,
  basis: Scope2MarketBasis | null,
) {
  if (lane !== "market_based") return undefined;
  return and(
    eq(emissionFactor.scope, "scope_2"),
    basis === "grid_average"
      ? sql`${emissionFactor.scope2Method} is distinct from 'market_based'`
      : eq(emissionFactor.scope2Method, "market_based"),
  );
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
 * would not have chosen. That sentence was **false** between prompts 68 and 70:
 * the seeder omitted `emission_factor_set.deleted_at is null`. Prompt 70 added
 * it there rather than removing it here, which is the direction that cannot
 * widen what a default may name.
 *
 * The match is over the publisher's own description columns, which are the three
 * `listFactorMappings` already joins into `factorLabel`.
 *
 * **The ordering carries a deterministic tail.** Two published sets hold rows
 * with identical labels, so the three label columns alone leave the pair's
 * sequence — and therefore which of them survives `FACTOR_SEARCH_LIMIT` — to
 * Postgres. The tail is `preferCandidate`'s own reading order: customer-supplied
 * ahead of published, then the later publication year, then the set id. The
 * label columns keep their precedence, so the list a reporter reads does not
 * re-sequence.
 */
export const searchFactorsForPair = safe("searchFactorsForPair", searchFactorsForPairImpl);

async function searchFactorsForPairImpl(
  organizationId: string,
  unit: ActivityUnit,
  query: string,
  /** The lane the result will be mapped on — prompt 85. */
  lane: Scope2Method | null = null,
  /** And, on the market lane, which rung it will be mapped under — prompt 86.
      The two bases narrow to disjoint halves of scope 2, so the picker cannot
      offer a grid average for a contractual claim or a contractual rate for a
      stated fallback. The action re-checks both; this is the courtesy half. */
  basis: Scope2MarketBasis | null = null,
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
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
      setOrganizationId: emissionFactorSet.organizationId,
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
        marketLaneScope(lane, basis),
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
      asc(sql`${emissionFactorSet.organizationId} is null`),
      desc(emissionFactorSet.publicationYear),
      asc(emissionFactorSet.id),
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
    licence: row.licence,
    licenceUrl: row.licenceUrl,
    sourceUrl: row.sourceUrl,
    sourceReference: row.sourceReference,
    customerSupplied: row.setOrganizationId !== null,
  }));
}

export type FuzzyFactorSearchRow = FactorSearchRow & {
  similarity: number;
};

/**
 * Character-trigram wording search for one admissible activity pair. It keeps
 * the lexical picker's five eligibility rules and includes visible customer
 * rows: all ranking happens inside the tenant-scoped Postgres query.
 *
 * **It now takes the lane and the basis too** — prompt 86. It had no lane
 * predicate at all, and prompt 85 recorded that as one of the two reasons the
 * market lane was lexical-only: running it would have offered rows the action
 * then refuses. That reason is removed here rather than worked around, because
 * the *other* reason does not hold on the fallback basis: rung 5's candidates
 * are not the handful of rates a tenant entered itself, they are the same
 * thousands of published scope 2 rows the default lane searches, which is
 * precisely the haystack close-wording ranking exists for.
 */
export const searchFactorsByWording = safe("searchFactorsByWording", searchFactorsByWordingImpl);

async function searchFactorsByWordingImpl(
  organizationId: string,
  unit: ActivityUnit,
  query: string,
  lane: Scope2Method | null = null,
  basis: Scope2MarketBasis | null = null,
): Promise<FuzzyFactorSearchRow[]> {
  const admissible = admissibleFactorUnits(unit);
  if (admissible.length === 0) return [];

  const label = emissionFactorLabelSql(emissionFactor);
  const similarity = sql<number>`similarity(${label}, ${query.trim()})`;

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
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
      setOrganizationId: emissionFactorSet.organizationId,
      similarity,
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
        marketLaneScope(lane, basis),
      ),
    )
    .orderBy(desc(similarity), asc(emissionFactor.id))
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
    licence: row.licence,
    licenceUrl: row.licenceUrl,
    sourceUrl: row.sourceUrl,
    sourceReference: row.sourceReference,
    customerSupplied: row.setOrganizationId !== null,
    similarity: row.similarity,
  }));
}

export type VisibleFactor = {
  id: string;
  label: string;
  activityUnit: FactorInput["activityUnit"];
  resultUnit: FactorInput["resultUnit"];
  /** The two the lane check needs (prompt 85): a market-lane mapping takes a
      scope 2 row whose own method is `market_based`, and nothing else. */
  scope: FactorInput["scope"];
  scope2Method: FactorInput["scope2Method"];
};

/**
 * One factor, re-resolved under the tenant's own visibility.
 *
 * **A factor id arriving from the browser is a claim, not a capability.** One
 * belonging to another tenant's private set answers `null`, which is
 * indistinguishable from one that does not exist — the same stance `getImport`
 * takes on a foreign `importId`. No existence oracle.
 */
export const getVisibleFactor = safe("getVisibleFactor", getVisibleFactorImpl);

async function getVisibleFactorImpl(
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
      scope: emissionFactor.scope,
      scope2Method: emissionFactor.scope2Method,
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
    scope: row.scope,
    scope2Method: row.scope2Method,
  };
}

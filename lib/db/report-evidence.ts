import "server-only";

import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "./client";
import {
  countUncalculatedRecords,
  listEmissions,
  visibleFactorScope,
} from "./emission-queries";
import { listTargets } from "./target-queries";
import {
  activityEmission,
  activityRecord,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import { parseDecimal } from "../domain/decimal";
import { selectDashboardTarget } from "../domain/dashboard";
import type { RecordEmission } from "../domain/emissions";
import type { ReportTargetInput } from "../domain/reports";
import type { ReportEvidence, ReportPeriod } from "../validation/reports";
import { withSafeQueryErrors } from "./query-error";

/**
 * The report snapshot's **named evidence seam** — build step 13.
 *
 * It sits in its own module rather than inside `report-queries.ts` because the
 * two answer different questions: that file owns the `report` table, this one
 * owns *what a report is a snapshot of*. Making the definition explicit and
 * findable is the point — a disclosure whose inputs are assembled ad hoc in a
 * page component is a disclosure nobody can audit.
 *
 * It **composes** the existing reads (`listEmissions`, `countUncalculatedRecords`,
 * `listTargets`) rather than re-deriving them: a second SQL definition of a
 * scope total would be a second answer to what a scope total is, which is the
 * mistake `target-queries.ts` already records avoiding.
 *
 * Two reads are genuinely new, and both are report-specific:
 *
 * - the **period record counts**, because a report is period-scoped and the
 *   organisation-wide gap figure `/dashboard` shows would overstate or
 *   understate the gap inside a particular twelve months;
 * - the **factor sets the period's stored emissions actually used**, because
 *   attribution is a licence condition and "every set this tenant can see" is
 *   not the same claim as "the sets behind these numbers".
 *
 * **Every customer-data query predicates on `organizationId`**, soft-deleted
 * activity is excluded, and numeric values leave Postgres as strings.
 * **Nothing here logs.**
 */

export type ReportEvidenceRead = {
  emissions: RecordEmission[];
  committedRecords: number;
  uncalculatedRecords: number;
  /** Organisation-wide, not period-scoped — used only to tell a reporter that
      the engine has not been run at all, never as a figure in the report. */
  organizationUncalculatedRecords: number;
  factorSets: ReportEvidence["factorSets"];
  target: ReportTargetInput | null;
};

/**
 * Everything `buildReportEvidence` needs, for one organisation and one period.
 *
 * Independent reads run in one `Promise.all`. The emissions read is the whole
 * organisation's, deliberately: the period is applied in the pure layer, and the
 * target projection's two rolling twelve-month windows reach back beyond the
 * report's own period. That remains the step-11 **judgement** about in-memory
 * scale, not a measured production limit.
 */
export const readReportEvidence = withSafeQueryErrors(
  "report-evidence.readReportEvidence",
  readReportEvidenceImpl,
);

async function readReportEvidenceImpl(
  organizationId: string,
  period: ReportPeriod,
  asOf: string,
): Promise<ReportEvidenceRead> {
  const [
    rows,
    periodCounts,
    organizationUncalculatedRecords,
    factorSets,
    targets,
  ] = await Promise.all([
    listEmissions(organizationId, null),
    countPeriodRecords(organizationId, period),
    countUncalculatedRecords(organizationId, null),
    listPeriodFactorSets(organizationId, period),
    listTargets(organizationId),
  ]);

  const emissions: RecordEmission[] = rows.map((row) => {
    const parsed = parseDecimal(row.kgCo2e);
    if (!parsed.ok) {
      /* A numeric column should make this unreachable. Refusing the whole read
         is safer than silently dropping a stored disclosure figure from a
         document that will be filed. */
      throw new Error("A stored emission could not be read as a decimal.");
    }
    return {
      recordId: row.recordId,
      activityDate: row.activityDate,
      kgCo2e: parsed.value,
      factorId: "",
      scope: row.scope,
      scope3Category: row.scope3Category,
      scope2Method: row.scope2Method,
      scope2MarketBasis: row.scope2MarketBasis,
      gwpSet: row.gwpSet,
      biogenic: row.biogenic,
      outsideOfScopes: row.outsideOfScopes,
      engineVersion: "",
    };
  });

  return {
    emissions,
    committedRecords: periodCounts.committed,
    uncalculatedRecords: periodCounts.uncalculated,
    organizationUncalculatedRecords,
    factorSets,
    target: toTargetInput(selectDashboardTarget(targets, asOf)),
  };
}

/**
 * Committed records dated inside the period, and how many of those carry no
 * computed figure — **in one statement**, because they are two counts over the
 * same scan and asking twice invites the two to disagree under a concurrent
 * recalculation.
 */
async function countPeriodRecords(
  organizationId: string,
  period: ReportPeriod,
): Promise<{ committed: number; uncalculated: number }> {
  const [row] = await getDb()
    .select({
      committed: sql<number>`count(*)::int`,
      uncalculated: sql<number>`count(*) filter (where ${activityEmission.id} is null)::int`,
    })
    .from(activityRecord)
    .leftJoin(
      activityEmission,
      and(
        eq(activityEmission.activityRecordId, activityRecord.id),
        /* **The primary lane only** — prompt 85. A record can carry a second,
           market-based figure, and `count(*)` over an unfiltered join would
           count that record twice as *committed*. `is distinct from` rather
           than `<>`, because the column is null on every scope 1 and 3 row. */
        sql`${activityEmission.scope2Method} is distinct from 'market_based'`,
      ),
    )
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        gte(activityRecord.activityDate, period.startDate),
        lte(activityRecord.activityDate, period.endDate),
      ),
    );

  return { committed: row?.committed ?? 0, uncalculated: row?.uncalculated ?? 0 };
}

/**
 * The distinct factor sets behind the period's stored emissions.
 *
 * Reached through `activity_emission.factor_id`, which is the row the figure was
 * actually computed against — not through the organisation's current mapping,
 * which may have moved since, and not through `listFactorSets`, which answers
 * "what can this tenant see". A superseded set still appears here, correctly: a
 * figure computed against it was computed against it.
 *
 * The join runs from a strictly tenant-scoped table, so the reference tables'
 * nullable-organisation predicate is not *needed* to keep this read inside the
 * tenant — `activity_emission.organization_id` already has.
 *
 * **It states the predicate anyway, from prompt 99.** The sentence above is
 * still true and the rows are unchanged; what it describes is a property of
 * today's join graph, and an edit to `activity_emission`'s filter would remove
 * the guarantee with nothing here to notice. `emission-queries.ts`'s module
 * docblock claims the scope is written once so no query can filter on half of
 * it, and this was one of three joins that made the claim untrue.
 */
async function listPeriodFactorSets(
  organizationId: string,
  period: ReportPeriod,
): Promise<ReportEvidence["factorSets"]> {
  return getDb()
    .selectDistinct({
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      publicationYear: emissionFactorSet.publicationYear,
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
    })
    .from(activityEmission)
    .innerJoin(
      activityRecord,
      eq(activityRecord.id, activityEmission.activityRecordId),
    )
    .innerJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityEmission.factorId),
        visibleFactorScope(organizationId),
      ),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(activityEmission.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        gte(activityRecord.activityDate, period.startDate),
        lte(activityRecord.activityDate, period.endDate),
      ),
    )
    .orderBy(emissionFactorSet.source, emissionFactorSet.datasetVersion);
}

/** The selected target as the pure layer needs it. A stored `numeric` that
    cannot be read is a refusal to include the target section, never a zero. */
function toTargetInput(
  target: Awaited<ReturnType<typeof listTargets>>[number] | null,
): ReportTargetInput | null {
  if (!target) return null;
  const baseline = parseDecimal(target.baselineKgCo2e);
  const reduction = parseDecimal(target.reductionPercent);
  if (!baseline.ok || !reduction.ok) return null;
  return {
    name: target.name,
    coverage: target.coverage,
    baseYear: target.baseYear,
    targetYear: target.targetYear,
    reductionPercent: reduction.value,
    baselineKgCo2e: baseline.value,
  };
}

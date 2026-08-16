import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./client";
import { tenantVisible } from "./tenant-scope";
import { countUncalculatedRecords, listEmissions } from "./emission-queries";
import { emissionTarget } from "./schema";
import { parseDecimal } from "../domain/decimal";
import {
  monthOf,
  totalsByPeriod,
  type RecordEmission,
} from "../domain/emissions";
import { yearOf } from "../domain/targets";
import type {
  TargetBaselineSource,
  TargetCoverage,
  TargetStatus,
} from "../validation/targets";
import { withSafeQueryErrors } from "./query-error";

/**
 * Every read and write of `emission_target` — build step 11.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so `app/targets/actions.ts` and the pages under `app/targets/` go
 * through here and nowhere else.
 *
 * ---
 *
 * **Every function takes `organizationId` and predicates on it.** A target is a
 * customer's own commitment, so §9.2 rule 6 applies unchanged and the
 * reference-data exception that `emission-queries.ts` records does *not* reach
 * this table: there is no `IS NULL OR` anywhere below.
 *
 * **A target id belonging to another organisation answers exactly what a
 * nonexistent one answers.** `getTarget` returns `null` and `retireTarget`
 * returns `not-found` for both, so there is no existence oracle — the same
 * contract `getImport` holds.
 *
 * **The emissions a target is read against are not queried here.** They come
 * from the existing `listEmissions()` in `emission-queries.ts`, grouped with the
 * existing `totalsByPeriod`; a second aggregation in SQL would be a second
 * definition of what a scope total is.
 *
 * **Nothing here logs.** Not an organisation, not a target name, not a figure —
 * on no path and in no catch (AGENTS.md 8.3 rule 2, extended to a customer's
 * commercial data by 5.3).
 */

export type NewTarget = {
  organizationId: string;
  createdBy: string;
  name: string;
  coverage: TargetCoverage;
  baseYear: number;
  targetYear: number;
  /** The decimal string the schema validated, never a `Number`. */
  reductionPercent: string;
  /** kgCO2e, as a decimal string. */
  baselineKgCo2e: string;
  baselineSource: TargetBaselineSource;
  /** kgCO2e at creation, as a decimal string, or `null` when the organisation
      had no calculated emissions for the base year. */
  computedBaselineKgCo2e: string | null;
};

export type ListedTarget = {
  id: string;
  name: string;
  coverage: TargetCoverage;
  baseYear: number;
  targetYear: number;
  reductionPercent: string;
  baselineKgCo2e: string;
  baselineSource: TargetBaselineSource;
  computedBaselineKgCo2e: string | null;
  status: TargetStatus;
  createdAt: Date;
  retiredAt: Date | null;
};

export type TargetEvidence = {
  emissions: RecordEmission[];
  monthly: ReturnType<typeof totalsByPeriod>;
  yearly: ReturnType<typeof totalsByPeriod>;
  uncalculatedRecords: number;
};

const COLUMNS = {
  id: emissionTarget.id,
  name: emissionTarget.name,
  coverage: emissionTarget.coverage,
  baseYear: emissionTarget.baseYear,
  targetYear: emissionTarget.targetYear,
  reductionPercent: emissionTarget.reductionPercent,
  baselineKgCo2e: emissionTarget.baselineKgCo2e,
  baselineSource: emissionTarget.baselineSource,
  computedBaselineKgCo2e: emissionTarget.computedBaselineKgCo2e,
  status: emissionTarget.status,
  createdAt: emissionTarget.createdAt,
  retiredAt: emissionTarget.retiredAt,
} as const;

/** The tenant predicate every read below shares, written once so no query can
    be added that filters on half of it. The predicate itself is
    {@link tenantVisible} from prompt 100 — **not** `visibleFactorScope`, which
    is the published-reference-data exception and admits a null organisation. */
function visible(organizationId: string) {
  return tenantVisible(emissionTarget, organizationId);
}

export const createTarget = withSafeQueryErrors(
  "target-queries.createTarget",
  createTargetImpl,
);

async function createTargetImpl(target: NewTarget): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(emissionTarget)
    .values(target)
    .returning({ id: emissionTarget.id });
  return { id: row.id };
}

/**
 * Every target this organisation holds, newest first.
 *
 * **Retired targets are returned too**, and the surface renders them under
 * their status. A retired commitment is part of the record of what a company
 * said it would do, and hiding it from the workspace that produced it would be
 * a quieter kind of deletion than the one `deleted_at` is for.
 */
export const listTargets = withSafeQueryErrors(
  "target-queries.listTargets",
  listTargetsImpl,
);

async function listTargetsImpl(
  organizationId: string,
): Promise<ListedTarget[]> {
  return getDb()
    .select(COLUMNS)
    .from(emissionTarget)
    .where(visible(organizationId))
    .orderBy(desc(emissionTarget.createdAt));
}

/** One target, or `null` — which is also the answer for another tenant's id. */
export const getTarget = withSafeQueryErrors(
  "target-queries.getTarget",
  getTargetImpl,
);

async function getTargetImpl(
  id: string,
  organizationId: string,
): Promise<ListedTarget | null> {
  const [row] = await getDb()
    .select(COLUMNS)
    .from(emissionTarget)
    .where(and(visible(organizationId), eq(emissionTarget.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Moves a target to `retired`, stamping the transition.
 *
 * **The status predicate is in the `WHERE`, not read first and written after**,
 * so two concurrent retires cannot both stamp `retired_at`: the second matches
 * no row and is told the target is already retired. `getTarget` afterwards is
 * what tells "already retired" apart from "not yours" without either answer
 * leaking the other.
 */
export const retireTarget = withSafeQueryErrors(
  "target-queries.retireTarget",
  retireTargetImpl,
);

async function retireTargetImpl(
  id: string,
  organizationId: string,
): Promise<{ status: "retired" | "already-retired" | "not-found" }> {
  const updated = await getDb()
    .update(emissionTarget)
    .set({ status: "retired", retiredAt: new Date() })
    .where(
      and(
        visible(organizationId),
        eq(emissionTarget.id, id),
        eq(emissionTarget.status, "active"),
      ),
    )
    .returning({ id: emissionTarget.id });

  if (updated.length > 0) return { status: "retired" };

  const existing = await getTarget(id, organizationId);
  return { status: existing ? "already-retired" : "not-found" };
}

/**
 * The already-calculated evidence targets are read against.
 *
 * This deliberately composes the existing persisted-emission read with the
 * existing pure period aggregation. It is not a second SQL definition of a
 * scope total. Reading all of an organisation's calculated rows into memory is
 * acceptable at the present measured volume (zero committed rows at prompt
 * approval); revisiting that boundary against real tenant volume is a future
 * scale judgement, not something to pre-optimise here.
 */
export const readTargetEvidence = withSafeQueryErrors(
  "target-queries.readTargetEvidence",
  readTargetEvidenceImpl,
);

async function readTargetEvidenceImpl(
  organizationId: string,
): Promise<TargetEvidence> {
  const [rows, uncalculatedRecords] = await Promise.all([
    listEmissions(organizationId, null),
    countUncalculatedRecords(organizationId, null),
  ]);

  const emissions: RecordEmission[] = rows.map((row) => {
    const parsed = parseDecimal(row.kgCo2e);
    if (!parsed.ok) {
      /* A numeric column should make this unreachable. Refusing the whole read
         is safer than silently dropping a stored disclosure figure. */
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
    monthly: totalsByPeriod(emissions, monthOf),
    yearly: totalsByPeriod(emissions, yearOf),
    uncalculatedRecords,
  };
}

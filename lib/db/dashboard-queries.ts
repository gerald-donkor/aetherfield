import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { countActivityRecords } from "./activity-queries";
import { countUncalculatedRecords } from "./coverage-queries";
import { listEmissions } from "./emission-queries";
import { listFactorSets } from "./factor-set-queries";
import { activityRecord } from "./schema";
import { listTargets } from "./target-queries";
import { getDb } from "./client";
import type { EnergyInput } from "../domain/dashboard";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("dashboard-queries");

/**
 * The complete read-only evidence set for `/dashboard`.
 *
 * Every customer-data query is tenant-predicated, soft-deleted activity is
 * excluded, and numeric quantities leave Postgres as strings. The existing
 * all-emissions read remains an in-memory scale judgement until real tenant
 * volume supplies a measured reason to replace it.
 */
export const readDashboardEvidence = safe("readDashboardEvidence", readDashboardEvidenceImpl);

async function readDashboardEvidenceImpl(organizationId: string) {
  const [
    emissions,
    uncalculatedRecords,
    targets,
    activityRecords,
    factorSets,
    energy,
  ] = await Promise.all([
    listEmissions(organizationId, null),
    countUncalculatedRecords(organizationId, null),
    listTargets(organizationId),
    countActivityRecords(organizationId),
    listFactorSets(organizationId),
    listRecordedEnergy(organizationId),
  ]);

  return {
    emissions,
    uncalculatedRecords,
    targets,
    activityRecords,
    factorSets,
    energy,
  };
}

async function listRecordedEnergy(
  organizationId: string,
): Promise<EnergyInput[]> {
  return getDb()
    .select({
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
        inArray(activityRecord.category, ["electricity", "heat"]),
        inArray(activityRecord.unit, ["kWh", "MWh"]),
      ),
    );
}

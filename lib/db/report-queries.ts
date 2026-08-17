import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./client";
import { tenantVisible } from "./tenant-scope";
import { report } from "./schema";
import type { ReportNarrativeStatus } from "../validation/reports";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("report-queries");

/**
 * Every read and write of `report` — build step 13.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so `app/reports/actions.ts`, the pages under `app/reports/` and the
 * export route handler go through here and nowhere else.
 *
 * ---
 *
 * **Every function takes `organizationId` and predicates on it.** A report is a
 * customer's own disclosure, so §9.2 rule 6 applies unchanged and the
 * reference-data exception `factor-scope.ts` records does *not* reach this
 * table: there is no `IS NULL OR` anywhere below.
 *
 * **A report id belonging to another organisation answers exactly what a
 * nonexistent one answers.** {@link getReport} returns `null` and the two
 * updates return `not-found` for both, so there is no existence oracle — the
 * contract `getTarget` and `getImport` already hold.
 *
 * **Nothing here logs.** Not an organisation, not a report title, not a figure,
 * not a line of generated prose — on no path and in no catch (AGENTS.md 8.3
 * rule 2, extended to a customer's commercial data by 5.3).
 */

export type NewReportRow = {
  organizationId: string;
  createdBy: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  generatedAsOf: string;
  /** The serialised deterministic snapshot. Built server-side; never a value
      the browser supplied. */
  evidence: string;
  engineVersion: string;
  formatVersion: string;
};

export type ListedReport = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  generatedAsOf: string;
  narrativeStatus: ReportNarrativeStatus;
  createdAt: Date;
};

export type StoredReport = ListedReport & {
  evidence: string;
  engineVersion: string;
  formatVersion: string;
  narrative: string | null;
  narrativeModel: string | null;
  narrativeError: string | null;
  narrativeGeneratedAt: Date | null;
};

const LIST_COLUMNS = {
  id: report.id,
  title: report.title,
  periodStart: report.periodStart,
  periodEnd: report.periodEnd,
  generatedAsOf: report.generatedAsOf,
  narrativeStatus: report.narrativeStatus,
  createdAt: report.createdAt,
} as const;

const FULL_COLUMNS = {
  ...LIST_COLUMNS,
  evidence: report.evidence,
  engineVersion: report.engineVersion,
  formatVersion: report.formatVersion,
  narrative: report.narrative,
  narrativeModel: report.narrativeModel,
  narrativeError: report.narrativeError,
  narrativeGeneratedAt: report.narrativeGeneratedAt,
} as const;

/** The tenant predicate every statement below shares, written once so no query
    can be added that filters on half of it. The predicate itself moved to
    {@link tenantVisible} at prompt 100, where three identical copies met; this
    line names the table and nothing else. */
function visible(organizationId: string) {
  return tenantVisible(report, organizationId);
}

export const createReport = safe("createReport", createReportImpl);

async function createReportImpl(row: NewReportRow): Promise<{ id: string }> {
  const [created] = await getDb()
    .insert(report)
    .values(row)
    .returning({ id: report.id });
  return { id: created.id };
}

/** Every report this organisation holds, newest first. */
export const listReports = safe("listReports", listReportsImpl);

async function listReportsImpl(
  organizationId: string,
): Promise<ListedReport[]> {
  return getDb()
    .select(LIST_COLUMNS)
    .from(report)
    .where(visible(organizationId))
    .orderBy(desc(report.createdAt));
}

/** One report, or `null` — which is also the answer for another tenant's id. */
export const getReport = safe("getReport", getReportImpl);

async function getReportImpl(
  id: string,
  organizationId: string,
): Promise<StoredReport | null> {
  const [row] = await getDb()
    .select(FULL_COLUMNS)
    .from(report)
    .where(and(visible(organizationId), eq(report.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Stores an accepted draft, or records why one was not accepted.
 *
 * **One function for all four outcomes, because they are one transition.** A
 * `rejected` or `failed` attempt clears `narrative` and `narrative_generated_at`
 * rather than leaving the previous accepted draft in place under a failing
 * status — a report showing last week's prose beside "draft rejected" would be
 * two claims at once, and the older one is the dangerous half.
 *
 * The `WHERE` carries the tenant and the id, so a cross-tenant id matches no row
 * and is reported as not-found.
 */
export const setReportNarrative = safe("setReportNarrative", setReportNarrativeImpl);

async function setReportNarrativeImpl(
  id: string,
  organizationId: string,
  outcome:
    | { status: "generated"; narrative: string; model: string }
    | { status: Exclude<ReportNarrativeStatus, "generated">; error: string },
): Promise<{ status: "updated" | "not-found" }> {
  const now = new Date();
  const updated = await getDb()
    .update(report)
    .set(
      outcome.status === "generated"
        ? {
            narrativeStatus: "generated",
            narrative: outcome.narrative,
            narrativeModel: outcome.model,
            narrativeError: null,
            narrativeGeneratedAt: now,
            narrativeAttemptedAt: now,
          }
        : {
            narrativeStatus: outcome.status,
            narrative: null,
            narrativeError: outcome.error,
            narrativeGeneratedAt: null,
            narrativeAttemptedAt: now,
          },
    )
    .where(and(visible(organizationId), eq(report.id, id)))
    .returning({ id: report.id });

  return updated.length > 0 ? { status: "updated" } : { status: "not-found" };
}

/**
 * Soft-deletes a report (AGENTS.md 9.2 rule 5).
 *
 * A disclosure a company built is a record of what it said about itself, so
 * removal is one `deleted_at` write with an audit trail rather than a cascade —
 * and every read above already filters on it.
 */
export const deleteReport = safe("deleteReport", deleteReportImpl);

async function deleteReportImpl(
  id: string,
  organizationId: string,
): Promise<{ status: "deleted" | "not-found" }> {
  const updated = await getDb()
    .update(report)
    .set({ deletedAt: new Date() })
    .where(and(visible(organizationId), eq(report.id, id)))
    .returning({ id: report.id });

  return updated.length > 0 ? { status: "deleted" } : { status: "not-found" };
}

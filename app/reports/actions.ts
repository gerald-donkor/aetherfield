"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { resolveTenant as resolveTenantFor } from "../../lib/auth/tenant";
import { readReportEvidence } from "../../lib/db/report-evidence";
import {
  createReport as createReportRow,
  deleteReport as deleteReportRow,
  getReport,
  setReportNarrative,
} from "../../lib/db/report-queries";
import { ENGINE_VERSION } from "../../lib/domain/emissions";
import {
  buildReportEvidence,
  reportPeriod,
  validateNarrative,
} from "../../lib/domain/reports";
import {
  checkReportNarrativeLimit,
  checkReportWriteLimit,
  formatRetry,
  type RateLimitOutcome,
} from "../../lib/rate-limit";
import { draftNarrative } from "../../lib/reporting/narrative";
import {
  createReportSchema,
  parseReportEvidence,
  reportIdSchema,
  NARRATIVE_MAX_CHARS,
  REPORT_ERRORS,
  REPORT_FORMAT_VERSION,
  type CreateReportResult,
  type DeleteReportResult,
  type GenerateNarrativeResult,
} from "../../lib/validation/reports";

/**
 * The report workspace's three mutations — build step 13, in AGENTS.md §10's
 * stage order.
 *
 * **The one AI path in the product runs here, and it runs last.** Stage e writes
 * the deterministic snapshot; only then, and only on a separate explicit
 * request, does stage e-bis ask a model for prose over it — and stage f
 * validates that prose against the snapshot's closed allowlist before anything
 * is stored. A model never reaches the arithmetic, and a rejected or failed
 * draft leaves the report's figures untouched and still exportable
 * (AGENTS.md 5.3).
 */

const TOO_MANY_WRITES = "That's a few too many report changes. Try again in";
const TOO_MANY_DRAFTS = "That's a few too many narrative drafts. Try again in";

function resolveTenant() {
  return resolveTenantFor({
    signedOut: REPORT_ERRORS.signedOut,
    noOrganization: REPORT_ERRORS.noOrganization,
    organizationLocked: REPORT_ERRORS.organizationLocked,
    failure: REPORT_ERRORS.failure,
  });
}

async function consumeLimit(
  check: (userId: string) => Promise<RateLimitOutcome>,
  userId: string,
  prefix: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const limit = await check(userId);
    if (limit.allowed) return { ok: true };
    return {
      ok: false,
      error: `${prefix} ${formatRetry(limit.retryAfterSeconds)}.`,
    };
  } catch {
    // Fail closed: an unavailable limiter must not create an unlimited path.
    return { ok: false, error: REPORT_ERRORS.failure };
  }
}

/**
 * Builds a report snapshot for the latest 12 complete months.
 *
 * **The browser supplies a title and nothing else.** The period comes from one
 * clock value captured here and passed into the pure layer; the tenant comes
 * from the session's membership row; every figure comes from stored
 * `activity_emission` rows through the named evidence seam. No period, no
 * organisation id, no total and no target id crosses the trust boundary.
 */
export async function createReport(input: unknown): Promise<CreateReportResult> {
  // -- a. BotID -------------------------------------------------------------
  /* Deliberately absent. This path requires a live session and a tenant
     membership; AGENTS.md §8.2's BotID rule governs public write paths. */

  // -- b. Session, tenant, then user-keyed rate limit ----------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;
  const limit = await consumeLimit(
    checkReportWriteLimit,
    tenant.userId,
    TOO_MANY_WRITES,
  );
  if (!limit.ok) return limit;

  // -- c. The shared schema is the server-side check -----------------------
  const parsed = createReportSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: REPORT_ERRORS.fields,
      fieldErrors: { title: fieldErrors.title?.[0] },
    };
  }

  // -- d. Authorisation ----------------------------------------------------
  /* Completed at stage b. The organisation id below came from the membership
     row; no request field names a tenant. */

  // -- e. Tenant-predicated read, deterministic build, then write ----------
  try {
    const asOf = new Date().toISOString().slice(0, 10);
    const period = reportPeriod(asOf);
    const read = await readReportEvidence(tenant.organizationId, period, asOf);

    const evidence = buildReportEvidence({
      asOf,
      period,
      emissions: read.emissions,
      committedRecords: read.committedRecords,
      uncalculatedRecords: read.uncalculatedRecords,
      factorSets: read.factorSets,
      target: read.target,
    });

    /* A report of zero is not a report. Missing evidence is a refusal, never a
       zero (AGENTS.md 5.3): an organisation with nothing calculated in the
       period is told what to do, not handed a document full of 0.000. */
    if (evidence.coverage.calculatedRecords === 0) {
      return {
        ok: false,
        error: REPORT_ERRORS.fields,
        fieldErrors: { title: REPORT_ERRORS.noEvidence },
      };
    }

    await createReportRow({
      organizationId: tenant.organizationId,
      createdBy: tenant.userId,
      title: parsed.data.title,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      generatedAsOf: asOf,
      evidence: JSON.stringify(evidence),
      engineVersion: ENGINE_VERSION,
      formatVersion: REPORT_FORMAT_VERSION,
    });
  } catch {
    return { ok: false, error: REPORT_ERRORS.failure };
  }

  // -- f. Email ------------------------------------------------------------
  // Deliberately absent. Nothing about a report is filed, published or emailed.

  revalidatePath("/reports");
  return { ok: true };
}

/**
 * Drafts, validates and stores a narrative for an existing report.
 *
 * **Every figure the model may write is already in the snapshot**, and
 * `validateNarrative` rejects any numeric token that is not. A rejected draft is
 * discarded — the row records that it happened and why, never the prose.
 */
export async function generateNarrative(
  id: unknown,
): Promise<GenerateNarrativeResult> {
  // -- a. BotID deliberately absent; see createReport ----------------------
  // -- b. Session, tenant, then user-keyed rate limit ----------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;

  // -- c. Validate the only value that crossed -----------------------------
  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: REPORT_ERRORS.notFound };

  // -- d. Authorisation was resolved at stage b ----------------------------
  // -- e. The read predicates on both tenant and report id -----------------
  let evidence;
  let title: string;
  try {
    const stored = await getReport(parsed.data, tenant.organizationId);
    if (!stored) return { ok: false, error: REPORT_ERRORS.notFound };

    /* The schema-owned parser stands between a `text` column and a disclosure.
       A snapshot that cannot be read is a report that cannot be narrated. */
    const read = parseReportEvidence(stored.evidence);
    if (!read) return { ok: false, error: REPORT_ERRORS.unreadable };
    evidence = read;
    title = stored.title;
  } catch {
    return { ok: false, error: REPORT_ERRORS.failure };
  }

  /* The narrative limiter is consumed here — after the report is known to exist
     and to be this tenant's, and before a single token is paid for. */
  const limit = await consumeLimit(
    checkReportNarrativeLimit,
    tenant.userId,
    TOO_MANY_DRAFTS,
  );
  if (!limit.ok) return limit;

  // -- e-bis. The model call, over the deterministic snapshot only ---------
  const draft = await draftNarrative(title, evidence);

  // -- f. Validate the model's output before it is stored ------------------
  const outcome = draft.ok
    ? validateNarrative(draft.text, evidence, NARRATIVE_MAX_CHARS)
    : null;

  try {
    if (draft.ok && outcome?.ok) {
      const written = await setReportNarrative(
        parsed.data,
        tenant.organizationId,
        { status: "generated", narrative: draft.text, model: draft.model },
      );
      if (written.status === "not-found") {
        return { ok: false, error: REPORT_ERRORS.notFound };
      }
    } else if (draft.ok && outcome && !outcome.ok) {
      await setReportNarrative(parsed.data, tenant.organizationId, {
        status: "rejected",
        error: outcome.reason,
      });
      revalidatePath(`/reports/${parsed.data}`);
      return { ok: false, error: REPORT_ERRORS.narrativeRejected };
    } else {
      await setReportNarrative(parsed.data, tenant.organizationId, {
        status: "failed",
        error: draft.ok ? REPORT_ERRORS.narrativeFailed : draft.reason,
      });
      revalidatePath(`/reports/${parsed.data}`);
      return { ok: false, error: REPORT_ERRORS.narrativeFailed };
    }
  } catch {
    return { ok: false, error: REPORT_ERRORS.failure };
  }

  revalidatePath("/reports");
  revalidatePath(`/reports/${parsed.data}`);
  return { ok: true };
}

/** Soft-deletes a report. The same shape `retireTarget` holds, for the same
    reasons — a uuid is the only thing that crosses, and a cross-tenant id gets
    the answer a nonexistent one gets. */
export async function deleteReport(id: unknown): Promise<DeleteReportResult> {
  // -- a. BotID deliberately absent; see createReport ----------------------
  // -- b. Session, tenant, then user-keyed rate limit ----------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;
  const limit = await consumeLimit(
    checkReportWriteLimit,
    tenant.userId,
    TOO_MANY_WRITES,
  );
  if (!limit.ok) return limit;

  // -- c. Validate the only value that crossed -----------------------------
  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: REPORT_ERRORS.notFound };

  // -- d. Authorisation was resolved at stage b ----------------------------
  // -- e. The update predicates on both tenant and report id ---------------
  try {
    const result = await deleteReportRow(parsed.data, tenant.organizationId);
    if (result.status === "not-found") {
      return { ok: false, error: REPORT_ERRORS.notFound };
    }
  } catch {
    return { ok: false, error: REPORT_ERRORS.failure };
  }

  // -- f. No email ---------------------------------------------------------
  revalidatePath("/reports");
  return { ok: true };
}

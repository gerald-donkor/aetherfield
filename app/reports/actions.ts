"use server";

import { revalidatePath } from "next/cache";

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
import { draftNarrative } from "../../lib/reporting/narrative";
import {
  createReportSchema,
  parseReportEvidence,
  reportIdSchema,
  NARRATIVE_MAX_CHARS,
  REPORT_ERRORS,
  REPORT_FIELDS,
  REPORT_FORMAT_VERSION,
  type CreateReportResult,
  type DeleteReportResult,
  type GenerateNarrativeResult,
} from "../../lib/validation/reports";
import { fieldErrorsFrom } from "../../lib/validation/result";

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

/**
 * The four sentences all three mutations owe their user, shared by the three
 * gate builders below.
 */
const TENANT_MESSAGES = {
  signedOut: REPORT_ERRORS.signedOut,
  noOrganization: REPORT_ERRORS.noOrganization,
  organizationLocked: REPORT_ERRORS.organizationLocked,
  failure: REPORT_ERRORS.failure,
};

/**
 * Stage **b** for `createReport` and `deleteReport`: session, tenant, deletion
 * lock, then the report write limiter, in `lib/auth/tenant.ts`'s one gate.
 *
 * **Prompt 122 deleted the local `consumeLimit` these used to call.** The gate
 * fails closed on a limiter error exactly as it did.
 */
function resolveWriteTenant() {
  return resolveTenantFor({
    messages: {
      ...TENANT_MESSAGES,
      throttled: (retry) => `${TOO_MANY_WRITES} ${retry}.`,
    },
    limiter: "report-write",
  });
}

/**
 * Stage **b** for `generateNarrative`, which spends **no** token here.
 *
 * Its limiter is deliberately spent later — after the report is known to exist
 * and to be this tenant's — so a probe for a report that does not exist cannot
 * consume the narrative budget. That ordering is behaviour, not tidiness, so
 * this is the one gate call in the four action modules that passes no limiter.
 */
function resolveReadTenant() {
  return resolveTenantFor({ messages: TENANT_MESSAGES });
}

/**
 * The narrative limiter, spent at the point in `generateNarrative` where it has
 * always been spent.
 *
 * **The cost of routing it through the gate is one extra session and membership
 * resolution on that path**, since stage b already resolved the tenant. It is
 * paid deliberately: the alternative is a second inline fail-closed limiter
 * block in this file, which is the thing prompt 122 exists to remove, and the
 * path it sits on then makes a model call.
 */
function resolveNarrativeTenant() {
  return resolveTenantFor({
    messages: {
      ...TENANT_MESSAGES,
      throttled: (retry) => `${TOO_MANY_DRAFTS} ${retry}.`,
    },
    limiter: "report-narrative",
  });
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
  const tenant = await resolveWriteTenant();
  if (!tenant.ok) return tenant;

  // -- c. The shared schema is the server-side check -----------------------
  const parsed = createReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: REPORT_ERRORS.fields,
      fieldErrors: fieldErrorsFrom(parsed.error, REPORT_FIELDS),
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
  const tenant = await resolveReadTenant();
  if (!tenant.ok) return tenant;

  // -- c. Validate the only value that crossed -----------------------------
  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: REPORT_ERRORS.notFound };

  // -- d. Authorisation was resolved at stage b ----------------------------
  // -- e. The read predicates on both tenant and report id -----------------
  let evidence;
  try {
    const stored = await getReport(parsed.data, tenant.organizationId);
    if (!stored) return { ok: false, error: REPORT_ERRORS.notFound };

    /* The schema-owned parser stands between a `text` column and a disclosure.
       A snapshot that cannot be read is a report that cannot be narrated. */
    const read = parseReportEvidence(stored.evidence);
    if (!read) return { ok: false, error: REPORT_ERRORS.unreadable };
    evidence = read;
  } catch {
    return { ok: false, error: REPORT_ERRORS.failure };
  }

  /* The narrative limiter is consumed here — after the report is known to exist
     and to be this tenant's, and before a single token is paid for. */
  const limit = await resolveNarrativeTenant();
  if (!limit.ok) return { ok: false, error: limit.error };

  // -- e-bis. The model call, over the deterministic snapshot only ---------
  const draft = await draftNarrative(evidence);

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
  const tenant = await resolveWriteTenant();
  if (!tenant.ok) return tenant;

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

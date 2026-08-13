"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { resolveTenant as resolveTenantFor } from "../../lib/auth/tenant";
import {
  createTarget as createTargetRow,
  readTargetEvidence,
  retireTarget as retireTargetRow,
} from "../../lib/db/target-queries";
import {
  ZERO,
  compare,
  parseDecimal,
  rescale,
  toDecimalString,
} from "../../lib/domain/decimal";
import {
  tonnesToKg,
  totalsForCoverage,
} from "../../lib/domain/targets";
import {
  checkTargetWriteLimit,
  formatRetry,
} from "../../lib/rate-limit";
import {
  createTargetSchema,
  targetIdSchema,
  TARGET_ERRORS,
  type CreateTargetResult,
  type RetireTargetResult,
} from "../../lib/validation/targets";

/** Targets' two mutations — build step 11, in AGENTS.md §10's stage order. */

const TOO_MANY_WRITES =
  "That's a few too many target changes. Try again in";

function resolveTenant() {
  return resolveTenantFor({
    signedOut: TARGET_ERRORS.signedOut,
    noOrganization: TARGET_ERRORS.noOrganization,
    organizationLocked: TARGET_ERRORS.organizationLocked,
    failure: TARGET_ERRORS.failure,
  });
}

async function consumeWriteLimit(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const limit = await checkTargetWriteLimit(userId);
    if (limit.allowed) return { ok: true };
    return {
      ok: false,
      error: `${TOO_MANY_WRITES} ${formatRetry(limit.retryAfterSeconds)}.`,
    };
  } catch {
    // Fail closed: an unavailable limiter must not create an unlimited path.
    return { ok: false, error: TARGET_ERRORS.failure };
  }
}

export async function createTarget(input: unknown): Promise<CreateTargetResult> {
  // -- a. BotID -------------------------------------------------------------
  /* Deliberately absent. This path requires a live session and a tenant
     membership; AGENTS.md §8.2's BotID rule governs public write paths. */

  // -- b. Session, tenant, then user-keyed rate limit ----------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;
  const limit = await consumeWriteLimit(tenant.userId);
  if (!limit.ok) return limit;

  // -- c. The shared schema is the server-side check -----------------------
  const parsed = createTargetSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: TARGET_ERRORS.fields,
      fieldErrors: {
        name: fieldErrors.name?.[0],
        coverage: fieldErrors.coverage?.[0],
        baseYear: fieldErrors.baseYear?.[0],
        targetYear: fieldErrors.targetYear?.[0],
        reductionPercent: fieldErrors.reductionPercent?.[0],
        baseline: fieldErrors.baseline?.[0],
      },
    };
  }

  const baselineTonnes = parseDecimal(parsed.data.baseline);
  const reduction = parseDecimal(parsed.data.reductionPercent);
  if (!baselineTonnes.ok || !reduction.ok) {
    return { ok: false, error: TARGET_ERRORS.fields };
  }

  // -- d. Authorisation -----------------------------------------------------
  /* Completed at stage b. The organisation id below came from the membership
     row; no request field names a tenant. */

  // -- e. Tenant-predicated read and write ---------------------------------
  try {
    const evidence = await readTargetEvidence(tenant.organizationId);
    const baseYear = evidence.yearly.find(
      (period) => period.period === String(parsed.data.baseYear),
    );
    const computedSnapshot = baseYear
      ? rescale(
          totalsForCoverage(baseYear.totals, parsed.data.coverage),
          3,
          "half-even",
        )
      : null;

    if (
      parsed.data.baselineSource === "computed_at_creation" &&
      (evidence.uncalculatedRecords > 0 ||
        !computedSnapshot ||
        compare(computedSnapshot, ZERO) <= 0)
    ) {
      return {
        ok: false,
        error: TARGET_ERRORS.fields,
        fieldErrors: {
          baseline:
            evidence.uncalculatedRecords > 0
              ? "The calculated baseline is incomplete. Calculate every committed record or enter the filed baseline instead."
              : "No calculated emissions are available for that year and coverage. Enter the filed baseline instead.",
        },
      };
    }

    const statedKg = tonnesToKg(baselineTonnes.value);
    const filedKg =
      parsed.data.baselineSource === "computed_at_creation" && computedSnapshot
        ? rescale(computedSnapshot, 0, "half-even")
        : statedKg;

    await createTargetRow({
      organizationId: tenant.organizationId,
      createdBy: tenant.userId,
      name: parsed.data.name,
      coverage: parsed.data.coverage,
      baseYear: parsed.data.baseYear,
      targetYear: parsed.data.targetYear,
      reductionPercent: toDecimalString(reduction.value),
      baselineKgCo2e: toDecimalString(rescale(filedKg, 3, "half-even")),
      baselineSource: parsed.data.baselineSource,
      computedBaselineKgCo2e: computedSnapshot
        ? toDecimalString(computedSnapshot)
        : null,
    });
  } catch {
    return { ok: false, error: TARGET_ERRORS.failure };
  }

  // -- f. Email -------------------------------------------------------------
  // Deliberately absent. Setting a target sends no notification in this step.

  revalidatePath("/targets");
  return { ok: true };
}

export async function retireTarget(id: unknown): Promise<RetireTargetResult> {
  // -- a. BotID deliberately absent; see createTarget ----------------------
  // -- b. Session, tenant, then user-keyed rate limit ----------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;
  const limit = await consumeWriteLimit(tenant.userId);
  if (!limit.ok) return limit;

  // -- c. Validate the only value that crossed -----------------------------
  const parsed = targetIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: TARGET_ERRORS.notFound };

  // -- d. Authorisation was resolved at stage b ----------------------------
  // -- e. The update predicates on both tenant and target id ----------------
  try {
    const result = await retireTargetRow(parsed.data, tenant.organizationId);
    if (result.status === "not-found") {
      return { ok: false, error: TARGET_ERRORS.notFound };
    }
    if (result.status === "already-retired") {
      return { ok: false, error: TARGET_ERRORS.alreadyRetired };
    }
  } catch {
    return { ok: false, error: TARGET_ERRORS.failure };
  }

  // -- f. No email ----------------------------------------------------------
  revalidatePath("/targets");
  return { ok: true };
}

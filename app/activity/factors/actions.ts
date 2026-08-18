"use server";

import { revalidatePath } from "next/cache";

import {
  resolveTenant as resolveTenantFor,
  type TenantWriteMessages,
} from "../../../lib/auth/tenant";
import {
  createTenantFactor,
  importTenantFactors,
  retireTenantFactor,
} from "../../../lib/db/factor-queries";
import {
  retireTenantFactorSet,
  updateTenantFactorSet,
} from "../../../lib/db/factor-set-queries";
import { decodeUtf8, parseCsv } from "../../../lib/domain/csv";
import {
  describeRowIssue,
  duplicateRowErrors,
  mixedGasBasisError,
  readFactorImport,
} from "../../../lib/domain/factor-import";
import {
  createCustomFactorSchema,
  customFactorSchema,
  CUSTOM_FACTOR_ERRORS,
  CUSTOM_FACTOR_FIELDS,
  editFactorSetSchema,
  EDIT_FACTOR_SET_FIELDS,
  type EditFactorSetResult,
  retireFactorSetSchema,
  type RetireFactorSetResult,
  FACTOR_IMPORT_ERRORS,
  FACTOR_IMPORT_FIELDS,
  FACTOR_IMPORT_MAX_ROW_ERRORS,
  formatFactorImportRowFailure,
  importCustomFactorsSchema,
  retireCustomFactorSchema,
  type CreateCustomFactorInput,
  type CustomFactorResult,
  type FactorImportRowError,
  type ImportCustomFactorsResult,
  type RetireCustomFactorResult,
} from "../../../lib/validation/emissions";
import {
  checkFactorImportLimit,
  checkFactorMappingLimit,
} from "../../../lib/rate-limit";
import {
  CSV_ERRORS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
} from "../../../lib/validation/activity";
import { fieldErrorsFrom } from "../../../lib/validation/result";

/**
 * `/activity/factors`'s five mutations — creating, bulk-importing and
 * retiring customer-supplied factors, and correcting or retiring a
 * customer-supplied factor set — split out from `app/activity/actions.ts` at
 * prompt 125, per `docs/architecture.md` candidate 4.
 *
 * **The same shape as the import flow's actions**, in AGENTS.md 10's own
 * letters: no BotID (every path here is authenticated, for the reason
 * `stageImport` in `app/activity/actions.ts` records at length), session and
 * tenant, then the rate limit keyed by user id and failing closed, then
 * `safeParse`, then a tenant-predicated write, then `revalidatePath`, then a
 * typed result. **No redirect on success** (AGENTS.md 10 rule 5).
 *
 * ---
 *
 * **The organisation id never crosses the trust boundary.** It is resolved
 * server-side from the session's membership row on every one of the five
 * calls, and there is no form field carrying one anywhere in this file.
 * Aetherfield's own `staff` and `admin` roles grant nothing here (AGENTS.md
 * 11.1) — nothing in this file reads `account.role`.
 *
 * **Nothing is ever logged** — not a filename, not a cell value, not an
 * organisation name, not a row body, and not on a catch. There is no
 * `console` call in this file (AGENTS.md 8.3 rule 2, extended to a customer's
 * commercial data by 5.3).
 */

const CUSTOM_FACTOR_FAILURE =
  "We couldn't save that customer-supplied factor just now. Please try again in a moment.";

const CUSTOM_FACTOR_SIGNED_OUT =
  "Your session has expired. Sign in again to manage customer-supplied factors.";

const CUSTOM_FACTOR_NO_ORGANIZATION =
  "This account belongs to no organisation. Create one before adding customer-supplied factors.";

/* Prompt 73's fourth tenant state. Not a `NO_ORGANIZATION`: this account has
   an organisation and it is scheduled for deletion, so the honest sentence
   names the lock and the way out of it rather than telling somebody to create
   what they already have. Since prompt 122 this goes through the one gate,
   which enforces the marker. */
const CUSTOM_FACTOR_ORGANIZATION_LOCKED =
  "This organisation is scheduled for deletion, so customer-supplied factors are locked. Restore it from your account page to make changes.";

/** Kept verbatim from the file this was split out of. Not shared as a helper
    with `app/activity/mappings/actions.ts`, which restates the identical
    function for the identical reason: three files this small don't earn a
    shared module. */
const tooManyChanges = (retry: string) =>
  `That's a few too many changes. Try again in ${retry}.`;

/** The bulk upload's own noun. `importCustomFactors` is the only one of the
    five factor actions that says "imports", and it is the only one that
    spends `checkFactorImportLimit`. */
const tooManyImports = (retry: string) =>
  `That's a few too many imports. Try again in ${retry}.`;

const CUSTOM_FACTOR_MESSAGES: TenantWriteMessages = {
  signedOut: CUSTOM_FACTOR_SIGNED_OUT,
  noOrganization: CUSTOM_FACTOR_NO_ORGANIZATION,
  organizationLocked: CUSTOM_FACTOR_ORGANIZATION_LOCKED,
  failure: CUSTOM_FACTOR_FAILURE,
  throttled: tooManyChanges,
};

const CUSTOM_FACTOR_IMPORT_MESSAGES: TenantWriteMessages = {
  ...CUSTOM_FACTOR_MESSAGES,
  throttled: tooManyImports,
};

/* -------------------------------------------------------------------------- */
/*  createCustomFactor                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Creates one tenant-owned factor row inside one tenant-owned factor set —
 * prompt 66.
 *
 * It deliberately does **not** map the new factor or recalculate. A
 * customer-supplied value becomes visible to `/activity/mappings`, where the
 * owner makes the explicit pair-level choice that already recalculates.
 */
export async function createCustomFactor(
  input: unknown,
): Promise<CustomFactorResult> {
  // -- a. BotID: absent on an authenticated path. See `app/activity/
  //      actions.ts`'s `stageImport`. -------------------------------------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* See `setFactorMapping` in `app/activity/mappings/actions.ts` for how the
     role and the lock are resolved (prompt 73, prompt 98, prompt 122). */
  const resolved = await resolveTenantFor({
    messages: CUSTOM_FACTOR_MESSAGES,
    limiter: checkFactorMappingLimit,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const organizationId = membership.organization.id;

  // -- c. Parse, with the shared schema -----------------------------------
  const parsed = createCustomFactorSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: fieldErrorsFrom(parsed.error, CUSTOM_FACTOR_FIELDS),
    };
  }

  // -- d. Authorise --------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: CUSTOM_FACTOR_ERRORS.notOwner };
  }

  // -- e. Write ------------------------------------------------------------
  /* The three refusals below are expected outcomes, not exceptions. A throw
     from `createTenantFactor` is now a bug, and keeps the generic failure. */
  let outcome: Awaited<ReturnType<typeof createTenantFactor>>;
  try {
    outcome = await createTenantFactor({ organizationId, data: parsed.data });
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  if (!outcome.ok) {
    if (outcome.reason === "set_exists") {
      return {
        ok: false,
        error: CUSTOM_FACTOR_ERRORS.invalid,
        fieldErrors: { "set.datasetVersion": CUSTOM_FACTOR_ERRORS.setExists },
      };
    }
    if (outcome.reason === "set_not_found") {
      return {
        ok: false,
        error: CUSTOM_FACTOR_ERRORS.invalid,
        fieldErrors: { "set.setId": CUSTOM_FACTOR_ERRORS.setNotFound },
      };
    }
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: {
        "factor.gas":
          outcome.setGasBasis === "combined_co2e"
            ? CUSTOM_FACTOR_ERRORS.gasBasisCombined
            : CUSTOM_FACTOR_ERRORS.gasBasisPerGas,
      },
    };
  }

  // -- f. No email. Make the row visible on factor surfaces. ---------------
  revalidatePath("/activity/factors");
  revalidatePath("/activity/mappings");
  revalidatePath("/activity");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  importCustomFactors                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Imports many customer-supplied factor rows from one CSV — prompt 82.
 *
 * **Atomic: all rows or none.** A file whose rows all pass is written in one
 * transaction; a file with any failing row writes nothing and comes back with
 * the failing lines. The alternative — step 9's staged review — is right for
 * activity data, where a partial commit is still a usable dataset, and wrong
 * here: a partly-imported set is a set whose licence and provenance describe
 * rows that are not all present, and that provenance is rendered as disclosure
 * evidence.
 *
 * Like `createCustomFactor`, it **maps nothing and recalculates nothing**
 * (prompt 66's decision). An imported row changes no figure until an owner maps
 * a `(category, unit)` pair to it at `/activity/mappings`, which is the surface
 * that already recalculates.
 */
export async function importCustomFactors(
  formData: FormData,
): Promise<ImportCustomFactorsResult> {
  // -- a. BotID: absent on an authenticated path. See `app/activity/
  //      actions.ts`'s `stageImport`. -------------------------------------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* The one of the five that spends `checkFactorImportLimit` and says
     "imports" rather than "changes" — the two things prompt 98's extraction
     is parameterised by. */
  const resolved = await resolveTenantFor({
    messages: CUSTOM_FACTOR_IMPORT_MESSAGES,
    limiter: checkFactorImportLimit,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const organizationId = membership.organization.id;

  // -- c. The set choice, then the file, then the rows ---------------------
  const choice = importCustomFactorsSchema.safeParse({
    set: setChoiceFrom(formData),
  });
  if (!choice.success) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: fieldErrorsFrom(choice.error, FACTOR_IMPORT_FIELDS),
    };
  }

  /* The declared `type` is deliberately not a gate — see `stageImport` in
     `app/activity/actions.ts` for why. The parse below is the real check
     (AGENTS.md 8.2 rule 3). */
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: { file: FACTOR_IMPORT_ERRORS.file },
    };
  }
  if (file.size > CSV_MAX_BYTES) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: { file: CSV_ERRORS.size },
    };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  const decoded = decodeUtf8(bytes);
  if (!decoded.ok) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: { file: decoded.error },
    };
  }

  const parsed = parseCsv(decoded.text, CSV_MAX_ROWS);
  if (!parsed.ok) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: { file: parsed.error },
    };
  }

  /* Whole-file failures first — a mis-typed header is one legible sentence,
     never ten thousand row errors. */
  const read = readFactorImport(parsed.header, parsed.records);
  if (!read.ok) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: { file: read.error },
    };
  }

  /* **The same schema the single-row form runs**, per row (AGENTS.md 10
     rule 1). The rules exist once and run twice; nothing about a row is
     restated for the bulk path. */
  const rowErrors: FactorImportRowError[] = [...read.rowErrors];
  const factors: { line: number; factor: CreateCustomFactorInput["factor"] }[] =
    [];
  for (const row of read.rows) {
    const checked = customFactorSchema.safeParse(row.input);
    if (checked.success) {
      factors.push({ line: row.line, factor: checked.data });
      continue;
    }
    const issue = checked.error.issues[0];
    rowErrors.push({
      line: row.line,
      message: describeRowIssue(issue.path.join("."), issue.message),
    });
  }

  if (rowErrors.length === 0) {
    /* Two rows that would become one row in the set, and a file with no honest
       destination. Both are cross-row and neither can exist on the single-row
       path, which is why they live in `lib/domain/` rather than in the
       schema. */
    rowErrors.push(...duplicateRowErrors(factors));
    const mixed = mixedGasBasisError(factors);
    if (mixed) rowErrors.push(mixed);
  }

  if (rowErrors.length > 0) {
    rowErrors.sort((a, b) => a.line - b.line);
    return {
      ok: false,
      error: formatFactorImportRowFailure(rowErrors.length),
      rowErrors: rowErrors.slice(0, FACTOR_IMPORT_MAX_ROW_ERRORS),
    };
  }

  // -- d. Authorise --------------------------------------------------------
  /* A factor moves every figure in a disclosure, so AGENTS.md 11.2 rule 2 puts
     the check here rather than in the component that renders the control. */
  if (membership.role !== "owner") {
    return { ok: false, error: CUSTOM_FACTOR_ERRORS.notOwner };
  }

  // -- e. Write ------------------------------------------------------------
  let outcome: Awaited<ReturnType<typeof importTenantFactors>>;
  try {
    outcome = await importTenantFactors({
      organizationId,
      set: choice.data.set,
      factors: factors.map((row) => row.factor),
    });
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  if (!outcome.ok) {
    if (outcome.reason === "set_exists") {
      return {
        ok: false,
        error: FACTOR_IMPORT_ERRORS.invalid,
        fieldErrors: { "set.datasetVersion": CUSTOM_FACTOR_ERRORS.setExists },
      };
    }
    if (outcome.reason === "set_not_found") {
      return {
        ok: false,
        error: FACTOR_IMPORT_ERRORS.invalid,
        fieldErrors: { "set.setId": CUSTOM_FACTOR_ERRORS.setNotFound },
      };
    }
    if (outcome.reason === "mixed_gas_basis") {
      /* Refused above, so this is a bug rather than a submission. */
      return { ok: false, error: CUSTOM_FACTOR_FAILURE };
    }
    return {
      ok: false,
      error:
        outcome.setGasBasis === "combined_co2e"
          ? CUSTOM_FACTOR_ERRORS.gasBasisCombined
          : CUSTOM_FACTOR_ERRORS.gasBasisPerGas,
    };
  }

  // -- f. No email. Make the rows visible on the factor surfaces. ----------
  revalidatePath("/activity/factors");
  revalidatePath("/activity/mappings");
  revalidatePath("/activity");
  return { ok: true, imported: outcome.imported, skipped: outcome.skipped };
}

/** The set chooser's fields, as they cross from the browser. Shaped for
    `factorSetChoiceSchema` and judged by it — nothing here decides anything. */
function setChoiceFrom(formData: FormData): unknown {
  const text = (name: string) => String(formData.get(name) ?? "");
  if (text("mode") !== "new") {
    return { mode: "existing", setId: text("setId") };
  }
  return {
    mode: "new",
    source: text("source"),
    datasetVersion: text("datasetVersion"),
    publicationYear: Number(formData.get("publicationYear")),
    effectiveFrom: text("effectiveFrom"),
    effectiveTo: text("effectiveTo"),
    licence: text("licence"),
    licenceUrl: text("licenceUrl"),
    sourceUrl: text("sourceUrl"),
    sourceReference: text("sourceReference"),
    notes: text("notes"),
  };
}

/* -------------------------------------------------------------------------- */
/*  retireCustomFactor                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Soft-retires one tenant-owned factor row, and answers with the consequence:
 * how many active `(category, unit)` mappings pointed at it and are now
 * unmapped. The count comes from the server's own read inside the retiring
 * transaction, so the announced number is the number that was true at the
 * write.
 */
export async function retireCustomFactor(
  input: unknown,
): Promise<RetireCustomFactorResult> {
  // -- a. BotID: absent on an authenticated path. See `app/activity/
  //      actions.ts`'s `stageImport`. -------------------------------------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* See `setFactorMapping` in `app/activity/mappings/actions.ts` for how the
     role and the lock are resolved (prompt 73, prompt 98, prompt 122). */
  const resolved = await resolveTenantFor({
    messages: CUSTOM_FACTOR_MESSAGES,
    limiter: checkFactorMappingLimit,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const organizationId = membership.organization.id;

  // -- c. Parse, with the shared schema -----------------------------------
  const parsed = retireCustomFactorSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: { factorId: "Choose a customer-supplied factor." },
    };
  }

  // -- d. Authorise --------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: CUSTOM_FACTOR_ERRORS.notOwner };
  }

  // -- e. Tenant-owned soft retirement ------------------------------------
  let outcome: Awaited<ReturnType<typeof retireTenantFactor>>;
  try {
    outcome = await retireTenantFactor({
      organizationId,
      factorId: parsed.data.factorId,
    });
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  if (!outcome.retired) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: { factorId: CUSTOM_FACTOR_ERRORS.notFound },
    };
  }

  // -- f. No email. Existing calculated emissions remain reproducible. -----
  revalidatePath("/activity/factors");
  revalidatePath("/activity/mappings");
  revalidatePath("/activity");
  return { ok: true, mappingCount: outcome.mappingCount };
}

/* -------------------------------------------------------------------------- */
/*  editFactorSet                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Corrects one tenant-owned factor set's provenance and applicability —
 * prompt 84.
 *
 * **The correction is the whole point.** `licence`, `sourceUrl` and
 * `sourceReference` are rendered as disclosure evidence beside every figure the
 * set's rows produce, and before this the only way out of a typo was to create a
 * second set and import every row into it again.
 *
 * It **recalculates nothing** (prompt 66's decision, prompt 70's refusal, both
 * unchanged). A corrected effective window changes which factor applies at the
 * next recalculation and nothing before it, and it changes no filed report:
 * `report.evidence` is an immutable stored snapshot. The surface says both.
 */
export async function editFactorSet(
  input: unknown,
): Promise<EditFactorSetResult> {
  // -- a. BotID: absent on an authenticated path. See `app/activity/
  //      actions.ts`'s `stageImport`. -------------------------------------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* See `setFactorMapping` in `app/activity/mappings/actions.ts` for how the
     role and the lock are resolved (prompt 73, prompt 98, prompt 122). */
  const resolved = await resolveTenantFor({
    messages: CUSTOM_FACTOR_MESSAGES,
    limiter: checkFactorMappingLimit,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const organizationId = membership.organization.id;

  // -- c. Parse, with the shared schema -----------------------------------
  const parsed = editFactorSetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: fieldErrorsFrom(parsed.error, EDIT_FACTOR_SET_FIELDS),
    };
  }

  // -- d. Authorise --------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: CUSTOM_FACTOR_ERRORS.notOwnerSet };
  }

  // -- e. Write ------------------------------------------------------------
  let outcome: Awaited<ReturnType<typeof updateTenantFactorSet>>;
  try {
    outcome = await updateTenantFactorSet({
      organizationId,
      data: parsed.data,
    });
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  if (!outcome.ok) {
    if (outcome.reason === "set_exists") {
      return {
        ok: false,
        error: CUSTOM_FACTOR_ERRORS.invalid,
        fieldErrors: { datasetVersion: CUSTOM_FACTOR_ERRORS.setRenameExists },
      };
    }
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: { setId: CUSTOM_FACTOR_ERRORS.setNotFound },
    };
  }

  // -- f. No email. Make the correction visible on the factor surfaces. -----
  /* The same three `retireCustomFactor` revalidates. **`/reports` is not a
     fourth**, and that is checked rather than assumed: `app/reports/page.tsx`
     renders `listReports`, which reads stored report rows, and a filed report's
     provenance is the immutable `report.evidence` snapshot it was built with.
     The live read of the set — `listPeriodFactorSets` in
     `lib/db/report-evidence.ts` — runs at generation time, so the next report
     built picks the correction up with no cached page to invalidate. */
  revalidatePath("/activity/factors");
  revalidatePath("/activity/mappings");
  revalidatePath("/activity");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  retireFactorSet                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Soft-retires one tenant-owned factor set, and answers with what it cost: the
 * live rows it takes out of use, and the active `(category, unit)` mappings that
 * pointed at them. Both counts are the server's own, read inside the retiring
 * transaction.
 *
 * **`emission_factor_set.deleted_at` had nine readers and no writer** before
 * this. Retirement was designed for, filtered for, and unreachable.
 */
export async function retireFactorSet(
  input: unknown,
): Promise<RetireFactorSetResult> {
  // -- a. BotID: absent on an authenticated path. See `app/activity/
  //      actions.ts`'s `stageImport`. -------------------------------------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* See `setFactorMapping` in `app/activity/mappings/actions.ts` for how the
     role and the lock are resolved (prompt 73, prompt 98, prompt 122). */
  const resolved = await resolveTenantFor({
    messages: CUSTOM_FACTOR_MESSAGES,
    limiter: checkFactorMappingLimit,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const organizationId = membership.organization.id;

  // -- c. Parse, with the shared schema -----------------------------------
  const parsed = retireFactorSetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: { setId: "Choose a factor set." },
    };
  }

  // -- d. Authorise --------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: CUSTOM_FACTOR_ERRORS.notOwnerSet };
  }

  // -- e. Tenant-owned soft retirement ------------------------------------
  let outcome: Awaited<ReturnType<typeof retireTenantFactorSet>>;
  try {
    outcome = await retireTenantFactorSet({
      organizationId,
      setId: parsed.data.setId,
    });
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  if (!outcome.retired) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: { setId: CUSTOM_FACTOR_ERRORS.setNotFound },
    };
  }

  // -- f. No email. Existing calculated emissions remain reproducible. -----
  /* `/reports` is not revalidated here either, and for the same reason
     `editFactorSet` records. */
  revalidatePath("/activity/factors");
  revalidatePath("/activity/mappings");
  revalidatePath("/activity");
  return {
    ok: true,
    mappingCount: outcome.mappingCount,
    factorCount: outcome.factorCount,
  };
}

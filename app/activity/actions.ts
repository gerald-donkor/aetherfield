"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { getCurrentMembership } from "../../lib/auth/organization";
import { getCurrentAccount } from "../../lib/auth/server";
import { resolveTenant as resolveTenantFor } from "../../lib/auth/tenant";
import {
  commitImport as commitImportRows,
  createStagedImport,
  discardImport as discardImportRow,
  getImport,
  listRawImportRows,
  restageImport,
  type StagedRow,
} from "../../lib/db/activity-queries";
import {
  createTenantFactor,
  getVisibleFactor,
  importTenantFactors,
  recalculateOrganization,
  retireTenantFactor,
  retireTenantFactorSet,
  setFactorMapping as setFactorMappingRow,
  updateTenantFactorSet,
} from "../../lib/db/emission-queries";
import { coerceRow, proposeMapping } from "../../lib/domain/activity-import";
import { decodeUtf8, parseCsv } from "../../lib/domain/csv";
import { factorEligibility } from "../../lib/domain/emissions";
import {
  describeRowIssue,
  duplicateRowErrors,
  mixedGasBasisError,
  readFactorImport,
} from "../../lib/domain/factor-import";
import {
  createCustomFactorSchema,
  customFactorSchema,
  CUSTOM_FACTOR_ERRORS,
  editFactorSetSchema,
  type EditFactorSetField,
  type EditFactorSetResult,
  retireFactorSetSchema,
  type RetireFactorSetResult,
  FACTOR_IMPORT_ERRORS,
  FACTOR_IMPORT_MAX_ROW_ERRORS,
  formatFactorImportRowFailure,
  importCustomFactorsSchema,
  retireCustomFactorSchema,
  type CreateCustomFactorInput,
  type CustomFactorField,
  type CustomFactorResult,
  type FactorImportField,
  type FactorImportRowError,
  type ImportCustomFactorsResult,
  recalculateInputSchema,
  type RecalculateResult,
  type RetireCustomFactorResult,
} from "../../lib/validation/emissions";
import {
  checkActivityCommitLimit,
  checkActivityImportLimit,
  checkFactorImportLimit,
  checkFactorMappingLimit,
  formatRetry,
} from "../../lib/rate-limit";
import {
  deleteActivityImport,
  putActivityImport,
  sanitiseImportFilename,
} from "../../lib/storage/activity-import";
import {
  activityMappingSchema,
  ACTIVITY_FIELDS,
  FACTOR_MAPPING_ERRORS,
  type ActivityImportActionResult,
  type ActivityMapping,
  type ActivityMappingResult,
  CSV_ERRORS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  type FactorMappingResult,
  factorMappingSchema,
  importIdSchema,
  type StageImportResult,
} from "../../lib/validation/activity";

/**
 * Activity-data ingestion's four mutations — build step 9.
 *
 * **The shape is step 2's, copied rather than invented.** Every stage below
 * carries AGENTS.md 10's own letters in 10's own order, exactly as
 * `app/_actions/application.ts` and `app/account/actions.ts` do. Four things
 * differ from the public forms and each is named where it happens: there is no
 * BotID check, the rate limit is keyed by user id rather than IP, the session
 * is resolved *before* the limit because the limit needs the id, and stage d
 * does real work.
 *
 * Colocated at `app/activity/actions.ts` rather than in `app/_actions/`
 * because 6.3's colocation rule assumes one owning route and this area is the
 * single owner — unlike the apply dialog, which has four trigger sites across
 * two route trees.
 *
 * ---
 *
 * **The organisation id never crosses the trust boundary.** It is resolved
 * server-side from the session's membership row on every one of the four calls,
 * and there is no form field carrying one anywhere in this change. A tenant id
 * accepted from a browser would be the whole multi-tenancy failure in a single
 * line.
 *
 * `getCurrentMembership()` is the primitive rather than
 * `authorizeOrganization(organizationId)` — the latter takes an id, and the
 * only way an action could obtain one is from the request, which is exactly
 * what must not happen. The two are the same check; this one takes no argument
 * to get it wrong.
 *
 * **Passing an `importId` that belongs to another organisation is
 * indistinguishable from passing one that does not exist.** Every path below
 * re-reads the import under the resolved tenant and answers `NOT_FOUND` for
 * both, so there is no existence oracle.
 *
 * **Aetherfield's own `staff` and `admin` roles grant nothing here**
 * (AGENTS.md 11.1). Nothing in this file reads `account.role`.
 *
 * ---
 *
 * **Nothing is ever logged** — not a filename, not a blob pathname, not a cell
 * value, not an organisation name, not a row body, and not on a catch. There is
 * no `console` call in this file (AGENTS.md 8.3 rule 2, extended to a
 * customer's commercial data by 5.3). Nothing here reaches a third party
 * either: no AI provider is involved in this step at all.
 */

const GENERIC_FAILURE =
  "We couldn't process that import just now. Please try again in a moment.";

const FACTOR_MAPPING_FAILURE =
  "We couldn't change that factor just now. Please try again in a moment.";

const CUSTOM_FACTOR_FAILURE =
  "We couldn't save that customer-supplied factor just now. Please try again in a moment.";

const SIGNED_OUT =
  "Your session has expired. Sign in again to import activity data.";

const FACTOR_MAPPING_SIGNED_OUT =
  "Your session has expired. Sign in again to change emission factors.";

const CUSTOM_FACTOR_SIGNED_OUT =
  "Your session has expired. Sign in again to manage customer-supplied factors.";

const NO_ORGANIZATION =
  "This account belongs to no organisation. Create one before importing data.";

const FACTOR_MAPPING_NO_ORGANIZATION =
  "This account belongs to no organisation. Create one before changing emission factors.";

const CUSTOM_FACTOR_NO_ORGANIZATION =
  "This account belongs to no organisation. Create one before adding customer-supplied factors.";

/* Prompt 73's fourth tenant state, per flow. Not a `NO_ORGANIZATION`: this
   account has an organisation and it is scheduled for deletion, so the honest
   sentence names the lock and the way out of it rather than telling somebody to
   create what they already have. `resolveTenant` below carries the first;
   the two factor paths resolve their membership directly (they need the role),
   so they check the marker themselves. */
const ORGANIZATION_LOCKED =
  "This organisation is scheduled for deletion, so importing is locked. Restore it from your account page to make changes.";

const FACTOR_MAPPING_ORGANIZATION_LOCKED =
  "This organisation is scheduled for deletion, so its emission factors are locked. Restore it from your account page to make changes.";

const CUSTOM_FACTOR_ORGANIZATION_LOCKED =
  "This organisation is scheduled for deletion, so customer-supplied factors are locked. Restore it from your account page to make changes.";

const NOT_FOUND =
  "That import is not available. It may have been discarded or removed.";

const NOT_STAGED =
  "That import is no longer staged, so it can't be changed.";

const FIELD_FAILURE = "Check the marked fields and try again.";

/** Step 10. A recalculation with no committed records is not a failure of the
    engine — it says there is nothing to calculate over yet, which is a
    different thing from a total of zero. */
const NOTHING_TO_CALCULATE =
  "There are no committed activity records to calculate. Commit an import first.";

/* -------------------------------------------------------------------------- */
/*  Shared stages b and d                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Stages **b** and **d** for all four actions: resolve the session, resolve the
 * tenant, and hand back the two ids everything else is scoped by.
 *
 * **The primitive moved to `lib/auth/tenant.ts` at build step 11**, when
 * `app/targets/actions.ts` needed the identical check — duplicating an
 * authorisation primitive across two action files is the worse outcome. The
 * extraction is behaviour-identical: the three sentences below are this file's
 * own, passed in verbatim, because the copy is flow-specific and the check is
 * not.
 */
function resolveTenant() {
  return resolveTenantFor({
    signedOut: SIGNED_OUT,
    noOrganization: NO_ORGANIZATION,
    organizationLocked: ORGANIZATION_LOCKED,
    failure: GENERIC_FAILURE,
  });
}

/* -------------------------------------------------------------------------- */
/*  stageImport                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The upload.
 *
 * **Returns the new import's id, and the leaf navigates to it.** That is the
 * one sanctioned navigation on a write path in this repository: AGENTS.md 10
 * rule 5 forbids a redirect because the phase-one forms sit inside settled,
 * measured marketing pages whose scroll and motion state a navigation would
 * discard. `/activity` is neither of those things, and moving to the staged
 * import *is* the outcome — there is nothing else for the form to swap to.
 * This is not licence to redirect a marketing form.
 */
export async function stageImport(
  formData: FormData,
): Promise<StageImportResult> {
  // -- a. BotID -----------------------------------------------------------
  /* **Deliberately absent, and this is the decision rather than an omission.**
     AGENTS.md 8.2's BotID rule governs *public* write paths — the three
     phase-one forms are unauthenticated POSTs any visitor can reach. This one
     requires a live session on a verified account **and** a `member` row for
     the target organisation, which is a strictly stronger gate than a bot
     heuristic. Adding it would also mean listing `/activity` in
     `instrumentation-client.ts`, and AGENTS.md 7.3 records that as a two-file
     commitment whose half-application makes the server call **fail** rather
     than pass. Recorded in `docs/backend.md`, step 9. */

  // -- b. Session and tenant, then the rate limit -------------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;

  try {
    const limit = await checkActivityImportLimit(tenant.userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many uploads. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    /* Fails closed, as every earlier path does: an unlimited upload path is a
       worse outcome than a form that is briefly unavailable, and 8.2 rule 4
       requires the failure be visible rather than a silent success. */
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- c. The file, checked server-side ------------------------------------
  /* Cheapest first: presence, then size, then the bytes.

     **The declared `type` is deliberately not a gate here**, and that is a
     considered difference from the CV path rather than a gap. Browsers report
     CSV as `text/csv`, `application/vnd.ms-excel`, `application/octet-stream`
     or an empty string for the same file, so an equality check would reject
     honest uploads. The parse below is the real check (8.2 rule 3): a file
     that does not decode as UTF-8 and yield a header row is rejected whatever
     it claims to be, and no declared type can fake that. */
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: { file: CSV_ERRORS.missing },
    };
  }
  if (file.size > CSV_MAX_BYTES) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: { file: CSV_ERRORS.size },
    };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  const decoded = decodeUtf8(bytes);
  if (!decoded.ok) {
    return { ok: false, error: FIELD_FAILURE, fieldErrors: { file: decoded.error } };
  }

  const parsed = parseCsv(decoded.text, CSV_MAX_ROWS);
  if (!parsed.ok) {
    /* An honest failure is a visible state naming the line to fix — never a
       silent success, and never a swallowed error (8.2 rule 4). */
    return { ok: false, error: FIELD_FAILURE, fieldErrors: { file: parsed.error } };
  }

  // -- d. Authorise --------------------------------------------------------
  /* Done at stage b: `tenant.organizationId` is the membership row's, resolved
     from the session. Nothing in `formData` names an organisation, and nothing
     may. This is stage d doing real work (AGENTS.md 10 rule 6). */

  const mapping = proposeMapping(parsed.header);
  const rows = stageRows(mapping, parsed.records);

  // -- e. Write ------------------------------------------------------------
  /* **Put, then insert, and the order is forced**: the import row records the
     blob's pathname, so the object has to exist first. That makes the blob the
     uncommitted half for the length of one transaction, so a failed write
     deletes it — `deleteActivityImport` is best-effort and throws nothing, so
     the worst case is an orphaned private object rather than a masked error.
     The same compensation the CV path uses (10 stage e). */
  let pathname: string;
  try {
    pathname = await putActivityImport(file);
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  let importId: string;
  try {
    importId = await createStagedImport({
      organizationId: tenant.organizationId,
      uploadedBy: tenant.userId,
      filename: sanitiseImportFilename(file.name),
      blobPathname: pathname,
      headerRow: parsed.header,
      columnMapping: mapping,
      rows,
    });
  } catch {
    await deleteActivityImport(pathname);
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- f. Email ------------------------------------------------------------
  // None. Nothing on this path notifies anyone.

  revalidatePath("/activity");
  return { ok: true, importId };
}

/* -------------------------------------------------------------------------- */
/*  updateImportMapping                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The human override that stands in for AGENTS.md 5.3's AI mapper.
 *
 * Re-validates every staged row under the new mapping and rewrites the row
 * statuses and the three counts. Rejected once an import is committed — the
 * check is the import's own status, re-read under the tenant predicate inside
 * the transaction.
 */
export async function updateImportMapping(
  rawImportId: unknown,
  rawMapping: unknown,
): Promise<ActivityMappingResult> {
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;

  const limited = await consumeCommitLimit(tenant.userId);
  if (limited) return limited;

  const id = importIdSchema.safeParse(rawImportId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const mappingResult = activityMappingSchema.safeParse(rawMapping);
  if (!mappingResult.success) {
    const { fieldErrors } = z.flattenError(mappingResult.error);
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: Object.fromEntries(
        ACTIVITY_FIELDS.map((field) => [field, fieldErrors[field]?.[0]]),
      ),
    };
  }
  const mapping: ActivityMapping = mappingResult.data;

  let target: Awaited<ReturnType<typeof getImport>>;
  try {
    target = await getImport(id.data, tenant.organizationId);
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
  if (!target) return { ok: false, error: NOT_FOUND };
  if (target.status !== "staged") return { ok: false, error: NOT_STAGED };

  /* **Every index is checked against the stored header row**, not against
     whatever the browser believes the file looked like. A forged index past
     the end of the file would otherwise coerce every row against `undefined`
     and quietly invalidate the whole import. */
  const width = target.headerRow.length;
  const outOfRange = ACTIVITY_FIELDS.filter((field) => {
    const index = mapping[field];
    return index !== null && index >= width;
  });
  if (outOfRange.length > 0) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: Object.fromEntries(
        outOfRange.map((field) => [
          field,
          `That column is not in ${target.filename}. Choose one of its ${width} columns.`,
        ]),
      ),
    };
  }

  try {
    const raw = await listRawImportRows(id.data, tenant.organizationId);
    const rows = stageRows(
      mapping,
      raw.map((row) => ({ line: row.rowNumber, fields: row.raw })),
    );

    const restaged = await restageImport({
      importId: id.data,
      organizationId: tenant.organizationId,
      columnMapping: mapping,
      rows,
    });
    if (!restaged) return { ok: false, error: NOT_STAGED };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath(`/activity/${id.data}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  commitImport                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Turns every `valid` staged row into an `activity_record`.
 *
 * **Idempotent**: an already-committed import returns a handled result and
 * writes nothing. Invalid rows are never committed and never silently dropped.
 *
 * **The control is hidden on a non-staged import and this authorises anyway** —
 * hiding a button is presentation and never enforcement (AGENTS.md 6.2, 11.2
 * rule 2).
 */
export async function commitImport(
  rawImportId: unknown,
): Promise<ActivityImportActionResult> {
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;

  const limited = await consumeCommitLimit(tenant.userId);
  if (limited) return limited;

  const id = importIdSchema.safeParse(rawImportId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  let outcome: Awaited<ReturnType<typeof commitImportRows>>;
  try {
    outcome = await commitImportRows(id.data, tenant.organizationId);
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  switch (outcome.status) {
    case "not-found":
      return { ok: false, error: NOT_FOUND };
    case "already-committed":
      return { ok: false, error: "That import is already committed." };
    case "not-staged":
      return { ok: false, error: NOT_STAGED };
    case "nothing-valid":
      return {
        ok: false,
        error:
          "No rows in this import are ready to commit. Adjust the column mapping or correct the file and upload it again.",
      };
    case "committed":
      revalidatePath("/activity");
      revalidatePath(`/activity/${id.data}`);
      return { ok: true };
  }
}

/* -------------------------------------------------------------------------- */
/*  discardImport                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Marks a staged import `discarded`, deletes the raw file from the store and
 * writes nothing to `activity_record`.
 *
 * **Deleting the blob is what makes retention finite** (AGENTS.md 8.3 rule 5):
 * a discarded file has no reason to stay in the store, and this flow does not
 * build a permanent archive by default.
 */
export async function discardImport(
  rawImportId: unknown,
): Promise<ActivityImportActionResult> {
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;

  const limited = await consumeCommitLimit(tenant.userId);
  if (limited) return limited;

  const id = importIdSchema.safeParse(rawImportId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  let outcome: Awaited<ReturnType<typeof discardImportRow>>;
  try {
    outcome = await discardImportRow(id.data, tenant.organizationId);
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  if (outcome.status === "not-found") return { ok: false, error: NOT_FOUND };
  if (outcome.status === "not-staged") return { ok: false, error: NOT_STAGED };

  /* The row is already discarded; the object is best-effort. An orphaned
     private blob is a tidiness problem, and a delete failure that undid a
     discard the person just confirmed would be worse. */
  if (outcome.blobPathname) await deleteActivityImport(outcome.blobPathname);

  revalidatePath("/activity");
  revalidatePath(`/activity/${id.data}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  recalculate                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Recomputes emissions for the organisation, or for one import — build
 * step 10.
 *
 * **The same stage order as every action above it**, in AGENTS.md 10's letters:
 * no BotID (stage a is deliberately absent on an authenticated path, for the
 * reason `stageImport` records at length), session and tenant, then the rate
 * limit keyed by user id and **failing closed**, then `safeParse`, then a
 * tenant-predicated write, then `revalidatePath`, then a typed `SubmitResult`.
 * **No redirect on success** (AGENTS.md 10 rule 5).
 *
 * **All the arithmetic is in `lib/domain/`, which has no database handle.**
 * `recalculateOrganization` in `lib/db/emission-queries.ts` is the seam: it
 * reads, hands pure values to `aggregate()`, and writes the result back. Build
 * step 14 gave that seam a second caller — the nightly sweep — which is why it
 * lives there rather than inline here. No figure is computed in this file and no
 * SQL is written in `lib/domain/`.
 *
 * **Recalculating is not the same as reporting a total.** It replaces the
 * stored figures for exactly the records it covered, so a record whose mapping
 * was removed loses its emission rather than keeping a stale one — see
 * `replaceEmissions`. The coverage figure the surface renders is derived from
 * the same run, which is why a caller cannot obtain a total without it.
 */
export async function recalculate(
  rawImportId: unknown,
): Promise<RecalculateResult> {
  // -- a. BotID: absent on an authenticated path. See `stageImport`. ------

  // -- b. Session and tenant, then the rate limit ------------------------
  const tenant = await resolveTenant();
  if (!tenant.ok) return tenant;

  const limited = await consumeCommitLimit(tenant.userId);
  if (limited) return limited;

  // -- c. Parse, with the shared schema ----------------------------------
  const parsed = recalculateInputSchema.safeParse({
    importId: rawImportId ?? null,
  });
  if (!parsed.success) return { ok: false, error: NOT_FOUND };

  const importId = parsed.data.importId;

  // -- d/e/f. Authorise, calculate and write -----------------------------
  /* **The orchestration lives in `recalculateOrganization`**, and this action is
     one of its two callers — build step 14's nightly sweep is the other. Two
     implementations of what a recalculation is would be two definitions of a
     disclosure figure, so the chain is stated once, in `lib/db/`, and both
     callers share it. Every query inside it is predicated on the organisation
     id resolved above; no figure is computed here and no SQL is written in
     `lib/domain/`.

     The `NOTHING_TO_CALCULATE` branch stays here, keyed off a zero record
     count: what to say to a person is this surface's business, not the seam's. */
  try {
    const outcome = await recalculateOrganization(
      tenant.organizationId,
      importId,
    );
    if (outcome.records === 0) {
      return { ok: false, error: NOTHING_TO_CALCULATE };
    }
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath("/activity");
  if (importId) revalidatePath(`/activity/${importId}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  setFactorMapping                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Choose the emission factor for one `(category, unit)` pair — prompt 65, and
 * the action that closes the loop `EmissionsSummary`'s coverage line opens.
 *
 * **The same stage order as every action above it**, in AGENTS.md 10's letters,
 * with two differences from its neighbours and both are named where they happen:
 * stage **d** refuses a non-owner, and stage **f** recalculates.
 *
 * **Owner-only, and this is where it is enforced.** Hiding the picker from a
 * member is presentation and never enforcement (AGENTS.md 6.2, 11.2 rule 2). The
 * choice is owner-only because a factor moves every figure in a disclosure,
 * which puts it with `inviteMember` rather than with importing data —
 * `app/account/actions.ts` performs the identical check at the identical stage.
 * Aetherfield's own `staff` and `admin` grant nothing here (AGENTS.md 11.1).
 *
 * **A factor id from the browser is a claim, not a capability.** Stage e
 * re-resolves it under the tenant's own visibility and re-asks the engine's
 * eligibility rule; one belonging to another tenant's private set answers
 * exactly as one that does not exist. No existence oracle.
 *
 * **It recalculates inline rather than leaving a "your figures are stale"
 * notice.** The alternative leaves an already-calculated record showing a figure
 * derived from a factor that is no longer mapped, with nothing on screen saying
 * so — and a stale disclosure figure that looks current is the failure this
 * whole area is shaped against. The cost is a slower action on a large tenant;
 * it is bounded by `checkFactorMappingLimit` and by the platform's function
 * timeout. `recalculateOrganization` is called rather than restated: it is **the
 * one definition of what a recalculation is**, and this is now its third caller.
 */
export async function setFactorMapping(
  input: unknown,
): Promise<FactorMappingResult> {
  // -- a. BotID: absent on an authenticated path. See `stageImport`. --------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* `getCurrentMembership()` rather than `resolveTenant()`, which returns ids
     only: stage d needs the role, and the role is re-read from Postgres on
     every call rather than trusted from the session payload (AGENTS.md 11.2
     rule 5). No argument is taken, so no organisation id can be supplied. */
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: FACTOR_MAPPING_FAILURE };
  }
  if (!membership) {
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account
        ? FACTOR_MAPPING_NO_ORGANIZATION
        : FACTOR_MAPPING_SIGNED_OUT,
    };
  }
  /* The lock, checked here rather than inherited: this path resolves its
     membership directly because stage d needs the role, so it does not pass
     through `resolveTenant`'s check (prompt 73). */
  if (membership.pendingDeletion) {
    return { ok: false, error: FACTOR_MAPPING_ORGANIZATION_LOCKED };
  }

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  try {
    const limit = await checkFactorMappingLimit(userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed, as every path beside it does.
    return { ok: false, error: FACTOR_MAPPING_FAILURE };
  }

  // -- c. Parse, with the same schema the leaf ran -------------------------
  const parsed = factorMappingSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: FACTOR_MAPPING_ERRORS.invalid,
      fieldErrors: {
        category: fieldErrors.category?.[0],
        unit: fieldErrors.unit?.[0],
        factorId: fieldErrors.factorId?.[0],
        scope2Method: fieldErrors.scope2Method?.[0],
      },
    };
  }
  const { category, unit, factorId, scope2Method: lane } = parsed.data;

  // -- d. Authorise --------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: FACTOR_MAPPING_ERRORS.notOwner };
  }

  // -- e. Re-resolve the factor, re-check the engine's rule, then write ----
  try {
    const factor = await getVisibleFactor(organizationId, factorId);
    if (!factor) {
      return {
        ok: false,
        error: FACTOR_MAPPING_ERRORS.invalid,
        fieldErrors: { factorId: FACTOR_MAPPING_ERRORS.notFound },
      };
    }

    /* The picker only offers eligible rows, and this asks again anyway: the
       list the browser rendered is a claim about what was offered, not a check.
       The refusal is the engine's own sentence, so a person is told the same
       thing here that the coverage surface would have told them later. */
    const eligibility = factorEligibility(factor, unit);
    if (!eligibility.ok) {
      return {
        ok: false,
        error: FACTOR_MAPPING_ERRORS.invalid,
        fieldErrors: { factorId: eligibility.reason },
      };
    }

    /* **The lane and the factor's own method have to agree** — prompt 85, and
       this is the check that keeps a grid average out of a market-based
       disclosure figure. Both directions are refused:

       - a factor that is not a market-based scope 2 row cannot be mapped on the
         market lane, because the market-based figure would then be a rate the
         reporter never contracted for;
       - a market-based row cannot be mapped on the default lane, because
         `totalsOf` partitions market-based figures out of `scope2` and `total`
         and the pair's contribution would silently vanish from the
         location-based reading.

       The picker's list is narrowed the same way, and that narrowing is a
       courtesy: this is the check. */
    const factorIsMarketBased =
      factor.scope === "scope_2" && factor.scope2Method === "market_based";
    if (factorIsMarketBased !== (lane === "market_based")) {
      return {
        ok: false,
        error: FACTOR_MAPPING_ERRORS.invalid,
        fieldErrors: {
          factorId:
            lane === "market_based"
              ? FACTOR_MAPPING_ERRORS.notMarketBased
              : FACTOR_MAPPING_ERRORS.marketBasedOnDefaultLane,
        },
      };
    }

    await setFactorMappingRow({
      organizationId,
      category,
      unit,
      factorId: factor.id,
      lane,
      userId,
    });
  } catch {
    return { ok: false, error: FACTOR_MAPPING_FAILURE };
  }

  // -- f. No email. Recalculate, so no stale figure survives the change. ---
  try {
    await recalculateOrganization(organizationId, null);
  } catch {
    /* **The mapping is already written and stays written.** A failed
       recalculation is the same shape as AGENTS.md 10 rule 4's failed email:
       the durable write succeeded, and reporting the whole thing as a failure
       would invite a retry of a change that already landed. The figures are
       stale until the next run, and the sentence below says so rather than
       claiming a clean success. Nothing is logged (8.3 rule 2). */
    revalidatePath("/activity");
    revalidatePath("/activity/mappings");
    return {
      ok: false,
      error:
        "The factor was saved, but the figures could not be recalculated just now. Run a recalculation from the activity page.",
    };
  }

  revalidatePath("/activity");
  revalidatePath("/activity/mappings");
  return { ok: true };
}

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
  // -- a. BotID: absent on an authenticated path. See `stageImport`. --------

  // -- b. Session, tenant and role, then the rate limit --------------------
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }
  if (!membership) {
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? CUSTOM_FACTOR_NO_ORGANIZATION : CUSTOM_FACTOR_SIGNED_OUT,
    };
  }
  /* The lock — see `setFactorMapping` for why it is checked here (prompt 73). */
  if (membership.pendingDeletion) {
    return { ok: false, error: CUSTOM_FACTOR_ORGANIZATION_LOCKED };
  }

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  try {
    const limit = await checkFactorMappingLimit(userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  // -- c. Parse, with the shared schema -----------------------------------
  const parsed = createCustomFactorSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: customFactorFieldErrors(parsed.error),
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
  // -- a. BotID: absent on an authenticated path. See `stageImport`. --------

  // -- b. Session, tenant and role, then the rate limit --------------------
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }
  if (!membership) {
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? CUSTOM_FACTOR_NO_ORGANIZATION : CUSTOM_FACTOR_SIGNED_OUT,
    };
  }
  if (membership.pendingDeletion) {
    return { ok: false, error: CUSTOM_FACTOR_ORGANIZATION_LOCKED };
  }

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  try {
    const limit = await checkFactorImportLimit(userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many imports. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    /* Fails closed, as every path beside it does. */
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  // -- c. The set choice, then the file, then the rows ---------------------
  const choice = importCustomFactorsSchema.safeParse({
    set: setChoiceFrom(formData),
  });
  if (!choice.success) {
    return {
      ok: false,
      error: FACTOR_IMPORT_ERRORS.invalid,
      fieldErrors: factorImportFieldErrors(choice.error),
    };
  }

  /* The declared `type` is deliberately not a gate — see `stageImport` for
     why. The parse below is the real check (AGENTS.md 8.2 rule 3). */
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

/** The set chooser's field errors, on the two-segment paths the factor form's
    mapping already reads. */
function factorImportFieldErrors(
  error: z.ZodError,
): Partial<Record<FactorImportField, string>> {
  const fieldErrors: Partial<Record<FactorImportField, string>> = {};
  for (const issue of error.issues) {
    if (issue.path.length < 2) continue;
    if (String(issue.path[0]) !== "set") continue;
    const field = `set.${String(issue.path[1])}` as FactorImportField;
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
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
  // -- a. BotID: absent on an authenticated path. See `stageImport`. --------

  // -- b. Session, tenant and role, then the rate limit --------------------
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }
  if (!membership) {
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? CUSTOM_FACTOR_NO_ORGANIZATION : CUSTOM_FACTOR_SIGNED_OUT,
    };
  }
  /* The lock — see `setFactorMapping` for why it is checked here (prompt 73). */
  if (membership.pendingDeletion) {
    return { ok: false, error: CUSTOM_FACTOR_ORGANIZATION_LOCKED };
  }

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  try {
    const limit = await checkFactorMappingLimit(userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

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
  // -- a. BotID: absent on an authenticated path. See `stageImport`. --------

  // -- b. Session, tenant and role, then the rate limit --------------------
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }
  if (!membership) {
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? CUSTOM_FACTOR_NO_ORGANIZATION : CUSTOM_FACTOR_SIGNED_OUT,
    };
  }
  /* The lock — see `setFactorMapping` for why it is checked here (prompt 73). */
  if (membership.pendingDeletion) {
    return { ok: false, error: CUSTOM_FACTOR_ORGANIZATION_LOCKED };
  }

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  try {
    const limit = await checkFactorMappingLimit(userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

  // -- c. Parse, with the shared schema -----------------------------------
  const parsed = editFactorSetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: CUSTOM_FACTOR_ERRORS.invalid,
      fieldErrors: editFactorSetFieldErrors(parsed.error),
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
  // -- a. BotID: absent on an authenticated path. See `stageImport`. --------

  // -- b. Session, tenant and role, then the rate limit --------------------
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }
  if (!membership) {
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account ? CUSTOM_FACTOR_NO_ORGANIZATION : CUSTOM_FACTOR_SIGNED_OUT,
    };
  }
  if (membership.pendingDeletion) {
    return { ok: false, error: CUSTOM_FACTOR_ORGANIZATION_LOCKED };
  }

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  try {
    const limit = await checkFactorMappingLimit(userId);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: CUSTOM_FACTOR_FAILURE };
  }

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

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The set-edit form's field errors.
 *
 * **Single-segment paths, which is why this exists** rather than reusing
 * `customFactorFieldErrors`: that one skips any issue with `path.length < 2`,
 * because its form nests every field under `set` or `factor`. This form has no
 * wrapper, so its issue paths are one segment and that reader would drop all of
 * them.
 */
function editFactorSetFieldErrors(
  error: z.ZodError,
): Partial<Record<EditFactorSetField, string>> {
  const fieldErrors: Partial<Record<EditFactorSetField, string>> = {};
  for (const issue of error.issues) {
    if (issue.path.length !== 1) continue;
    const field = String(issue.path[0]) as EditFactorSetField;
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

function customFactorFieldErrors(
  error: z.ZodError,
): Partial<Record<CustomFactorField, string>> {
  const fieldErrors: Partial<Record<CustomFactorField, string>> = {};
  for (const issue of error.issues) {
    if (issue.path.length < 2) continue;
    const field = `${String(issue.path[0])}.${String(
      issue.path[1],
    )}` as CustomFactorField;
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

/** Stage b for the three actions that act on an already-staged import.
    Returns the rejection, or `null` when the caller may proceed. */
async function consumeCommitLimit(
  userId: string,
): Promise<{ ok: false; error: string } | null> {
  try {
    const limit = await checkActivityCommitLimit(userId);
    if (limit.allowed) return null;
    return {
      ok: false,
      error: `That's a few too many requests. Try again in ${formatRetry(
        limit.retryAfterSeconds,
      )}.`,
    };
  } catch {
    // Fails closed, as every path beside it does.
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Coerces every parsed record under one mapping. Pure apart from its call
    into `lib/domain/`, which is itself pure. */
function stageRows(
  mapping: ActivityMapping,
  records: readonly { line: number; fields: string[] }[],
): StagedRow[] {
  return records.map((record) => {
    const coerced = coerceRow(mapping, record.fields);
    if (coerced.ok) {
      return {
        rowNumber: record.line,
        raw: record.fields,
        status: "valid",
        value: coerced.value,
        error: null,
      };
    }
    return {
      rowNumber: record.line,
      raw: record.fields,
      status: "invalid",
      value: null,
      error: coerced.error,
    };
  });
}

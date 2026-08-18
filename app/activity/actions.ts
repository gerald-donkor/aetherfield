"use server";

import { revalidatePath } from "next/cache";

import {
  resolveTenant as resolveTenantFor,
  type TenantWriteMessages,
} from "../../lib/auth/tenant";
import {
  commitImport as commitImportRows,
  createStagedImport,
  discardImport as discardImportRow,
  getImport,
  listRawImportRows,
  restageImport,
  type StagedRow,
} from "../../lib/db/activity-queries";
import { recalculateOrganization } from "../../lib/db/emission-queries";
import { coerceRow, proposeMapping } from "../../lib/domain/activity-import";
import { decodeUtf8, parseCsv } from "../../lib/domain/csv";
import {
  recalculateInputSchema,
  type RecalculateResult,
} from "../../lib/validation/emissions";
import {
  checkActivityCommitLimit,
  checkActivityImportLimit,
} from "../../lib/rate-limit";
import {
  deleteActivityImport,
  putActivityImport,
  sanitiseImportFilename,
} from "../../lib/storage/activity-import";
import {
  activityMappingSchema,
  ACTIVITY_FIELDS,
  type ActivityImportActionResult,
  type ActivityMapping,
  type ActivityMappingResult,
  CSV_ERRORS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  importIdSchema,
  type StageImportResult,
} from "../../lib/validation/activity";
import { fieldErrorsFrom } from "../../lib/validation/result";

/**
 * The import flow's own mutations — build steps 9 and 10 — for `/activity`
 * and its nested `/activity/[importId]`.
 *
 * **The shape is step 2's, copied rather than invented.** Every stage below
 * carries AGENTS.md 10's own letters in 10's own order, exactly as
 * `app/_actions/application.ts` and `app/account/actions.ts` do. Four things
 * differ from the public forms and each is named where it happens: there is no
 * BotID check, the rate limit is keyed by user id rather than IP, the session
 * is resolved *before* the limit because the limit needs the id, and stage d
 * does real work.
 *
 * Colocated at `app/activity/actions.ts` because this flow — `/activity` and
 * its nested `/activity/[importId]` — is a single owning route tree; the
 * factor-mapping and factor-management flows were split out to their own
 * routes' `actions.ts` at prompt 125, per `docs/architecture.md` candidate 4.
 *
 * ---
 *
 * **The organisation id never crosses the trust boundary.** It is resolved
 * server-side from the session's membership row on every one of the five
 * calls, and there is no form field carrying one anywhere in this change. A
 * tenant id accepted from a browser would be the whole multi-tenancy failure
 * in a single line.
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

const SIGNED_OUT =
  "Your session has expired. Sign in again to import activity data.";

const NO_ORGANIZATION =
  "This account belongs to no organisation. Create one before importing data.";

/* Prompt 73's fourth tenant state. Not a `NO_ORGANIZATION`: this account has
   an organisation and it is scheduled for deletion, so the honest sentence
   names the lock and the way out of it rather than telling somebody to create
   what they already have. Since prompt 122 this goes through the one gate,
   which enforces the marker. */
const ORGANIZATION_LOCKED =
  "This organisation is scheduled for deletion, so importing is locked. Restore it from your account page to make changes.";

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
 * Stage **b** for all five actions in this file, in `lib/auth/tenant.ts`'s one
 * gate: session, tenant, deletion lock, then the limiter this flow spends.
 *
 * **The primitive moved to `lib/auth/tenant.ts` at build step 11**, when
 * `app/targets/actions.ts` needed the identical check — duplicating an
 * authorisation primitive across two action files is the worse outcome.
 * **Prompt 122 moved the limiter with it**: this file's `consumeCommitLimit`
 * helper and `stageImport`'s inline limiter block are both gone, and the two
 * message sets they used are the two below. Nothing about a sentence, a window
 * or a key changed.
 *
 * The strings stay here rather than moving into `lib/auth/` because the copy is
 * flow-specific — the wording below is the right sentence on this surface and
 * the wrong one everywhere else.
 */
const tooManyUploads = (retry: string) =>
  `That's a few too many uploads. Try again in ${retry}.`;

/** The three already-staged-import actions' noun, and `recalculate`'s, kept
    verbatim from the deleted `consumeCommitLimit`. */
const tooManyRequests = (retry: string) =>
  `That's a few too many requests. Try again in ${retry}.`;

const IMPORT_MESSAGES: TenantWriteMessages = {
  signedOut: SIGNED_OUT,
  noOrganization: NO_ORGANIZATION,
  organizationLocked: ORGANIZATION_LOCKED,
  failure: GENERIC_FAILURE,
  throttled: tooManyUploads,
};

const COMMIT_MESSAGES: TenantWriteMessages = {
  ...IMPORT_MESSAGES,
  throttled: tooManyRequests,
};

/** The upload's gate. Not exported: a `"use server"` module's runtime exports
    must all be async entry points. */
function resolveImportTenant() {
  return resolveTenantFor({
    messages: IMPORT_MESSAGES,
    limiter: checkActivityImportLimit,
  });
}

/** The gate for the four actions that act on an already-staged import, and for
    `recalculate`. */
function resolveCommitTenant() {
  return resolveTenantFor({
    messages: COMMIT_MESSAGES,
    limiter: checkActivityCommitLimit,
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
  /* The gate fails closed on a limiter error, as every path here does: an
     unlimited upload path is a worse outcome than a form that is briefly
     unavailable, and 8.2 rule 4 requires the failure be visible rather than a
     silent success. */
  const tenant = await resolveImportTenant();
  if (!tenant.ok) return tenant;

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
  const tenant = await resolveCommitTenant();
  if (!tenant.ok) return tenant;

  const id = importIdSchema.safeParse(rawImportId);
  if (!id.success) return { ok: false, error: NOT_FOUND };

  const mappingResult = activityMappingSchema.safeParse(rawMapping);
  if (!mappingResult.success) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: fieldErrorsFrom(mappingResult.error, ACTIVITY_FIELDS),
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
  const tenant = await resolveCommitTenant();
  if (!tenant.ok) return tenant;

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
  const tenant = await resolveCommitTenant();
  if (!tenant.ok) return tenant;

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
 *
 * `setFactorMapping` in `app/activity/mappings/actions.ts` is
 * `recalculateOrganization`'s other in-request caller — it is stated once, in
 * `lib/db/`, and both share it.
 */
export async function recalculate(
  rawImportId: unknown,
): Promise<RecalculateResult> {
  // -- a. BotID: absent on an authenticated path. See `stageImport`. ------

  // -- b. Session and tenant, then the rate limit ------------------------
  const tenant = await resolveCommitTenant();
  if (!tenant.ok) return tenant;

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
/*  Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

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

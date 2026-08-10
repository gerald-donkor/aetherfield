import * as z from "zod";

import type { SubmitResult } from "./result";

/**
 * Activity-data ingestion's input contract and its vocabularies — build step 9.
 *
 * **Not `server-only`, and it must stay that way** (AGENTS.md 6.3). The client
 * leaves under `app/_components/activity/` and the Server Actions in
 * `app/activity/actions.ts` both import this module: the client copy is a
 * courtesy to the person at the keyboard, the server copy inside the action is
 * the check (AGENTS.md 10 rule 1).
 *
 * **It imports nothing from `lib/db/`.** `lib/db/schema.ts` calls `pgEnum` at
 * module scope, so an import there would put `drizzle-orm/pg-core` into a
 * browser bundle. The enum *members* therefore live here and `schema.ts` builds
 * its `pgEnum`s from these constants — the arrangement `ORGANIZATION_ROLES` and
 * `lib/auth/organization-access.ts` already use, so each union is declared
 * exactly once (AGENTS.md 9.2 rule 2).
 *
 * It also imports nothing from `lib/domain/`: the pure layer imports *this*,
 * never the reverse.
 */

/* -------------------------------------------------------------------------- */
/*  The four enums, declared once                                              */
/* -------------------------------------------------------------------------- */

/**
 * An import's lifecycle. A state, not a boolean (AGENTS.md 9.2 rule 2).
 *
 * `failed` exists because a file that cannot be parsed at all still deserves a
 * row a person can see — an honest failure is a visible state, never a silent
 * success (AGENTS.md 8.2 rule 4).
 */
export const ACTIVITY_IMPORT_STATUSES = [
  "staged",
  "committed",
  "discarded",
  "failed",
] as const;

export type ActivityImportStatus = (typeof ACTIVITY_IMPORT_STATUSES)[number];

/** A staged row's state. `committed` is the third state a boolean could not
    hold, and it is what stops a second commit re-inserting the same rows. */
export const ACTIVITY_IMPORT_ROW_STATUSES = [
  "valid",
  "invalid",
  "committed",
] as const;

export type ActivityImportRowStatus =
  (typeof ACTIVITY_IMPORT_ROW_STATUSES)[number];

/**
 * The activity kinds the four-verb loop names — emissions, energy and waste
 * across the value chain.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). There is no comp
 * and no customer file to fit against; this is the smallest set that covers the
 * scope 1 / 2 / 3 sources step 10 will need factors for. Step 10 may extend it,
 * and extending an enum is cheap where forking a parallel column is not
 * (AGENTS.md 9.2 rule 7).
 */
export const ACTIVITY_CATEGORIES = [
  "electricity",
  "fuel",
  "heat",
  "waste",
  "water",
  "travel",
  "freight",
  "other",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/**
 * The units an activity is *measured* in. Also a judgement.
 *
 * **No emission factor, coefficient or tCO2e value appears anywhere in this
 * step.** These are what a customer's meter, invoice or waste ticket recorded;
 * turning them into an emission is step 10's work, and AGENTS.md 5.3's hard
 * rule keeps that arithmetic deterministic and out of this file entirely.
 */
export const ACTIVITY_UNITS = [
  "kWh",
  "MWh",
  "L",
  "m3",
  "kg",
  "t",
  "km",
  "tkm",
] as const;

export type ActivityUnit = (typeof ACTIVITY_UNITS)[number];

/* -------------------------------------------------------------------------- */
/*  The canonical fields a CSV column can be mapped onto                       */
/* -------------------------------------------------------------------------- */

/** The six things an activity row has to say. Order is the order the review
    view renders them in, so the mapping table reads like the file does. */
export const ACTIVITY_FIELDS = [
  "site",
  "date",
  "category",
  "description",
  "quantity",
  "unit",
] as const;

export type ActivityField = (typeof ACTIVITY_FIELDS)[number];

/** Everything but `description`. A row without a site, a date, a category, a
    quantity or a unit is not an activity record; a row without a note is. */
export const REQUIRED_ACTIVITY_FIELDS = ACTIVITY_FIELDS.filter(
  (field) => field !== "description",
) as readonly ActivityField[];

/** The label each canonical field is rendered under. Written once so the
    mapping table, the row errors and the upload guidance cannot drift. */
export const ACTIVITY_FIELD_LABELS: Record<ActivityField, string> = {
  site: "Site",
  date: "Date",
  category: "Category",
  description: "Description",
  quantity: "Quantity",
  unit: "Unit",
};

/**
 * A resolved mapping: one source column index per canonical field, or `null`
 * for unmapped.
 *
 * Indices are into the header row the file was parsed with, which is why
 * `updateImportMapping` must re-check every index against the *stored* header
 * rather than trusting the browser's idea of how wide the file is.
 */
export type ActivityMapping = Record<ActivityField, number | null>;

export const NO_ACTIVITY_MAPPING: ActivityMapping = {
  site: null,
  date: null,
  category: null,
  description: null,
  quantity: null,
  unit: null,
};

/** A column index. Bounded so a forged value cannot ask the coercer to walk a
    million-element sparse array; the real check is against the stored header. */
const columnIndex = z
  .number()
  .int({ error: "Choose a column from the file." })
  .min(0, { error: "Choose a column from the file." })
  .max(511, { error: "Choose a column from the file." })
  .nullable();

export const activityMappingSchema = z.object({
  site: columnIndex,
  date: columnIndex,
  category: columnIndex,
  description: columnIndex,
  quantity: columnIndex,
  unit: columnIndex,
});

/** The import's id, as it crosses from the browser. A non-uuid is a forged
    request, not a typo, and gets the same handled failure a missing import
    gets — there is no existence oracle on this path. */
export const importIdSchema = z.uuid();

/* -------------------------------------------------------------------------- */
/*  The upload's constraints                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **Every number here is a judgement, not a measurement** — nothing has
 * shipped, so there is no file and no traffic to fit against, and AGENTS.md 12
 * rule 4 means saying which rather than implying a fit.
 *
 * 2 MB of CSV is roughly 20,000 rows of six short columns, comfortably above a
 * year of monthly meter readings for a large estate and far below what would
 * make one function invocation expensive. It sits under `next.config.ts`'s
 * 6 MB Server Action body limit with room for the multipart envelope, so the
 * framework never rejects a request before the action can render an error.
 *
 * `CSV_MAX_ROWS` bounds the *parse*, not the file: a 2 MB file of one-byte
 * rows is still a million records, and the staging insert is one row per
 * record. 10,000 is the ceiling a person is told about up front rather than
 * discovering after an upload.
 */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;

/** The size in the register a person reads, so `CSV_MAX_BYTES` is never
    hand-converted into a sentence. */
export const CSV_MAX_LABEL = "2 MB";

export const CSV_MAX_ROWS = 10_000;

/**
 * The `accept` attribute, and deliberately *not* a server-side allowlist.
 *
 * Browsers report CSV inconsistently — `text/csv`, `application/vnd.ms-excel`,
 * `application/octet-stream` and an empty string are all observed for the same
 * file, so a server-side `type` equality check like the CV path's would reject
 * honest uploads. **The parse is the real check** (AGENTS.md 8.2 rule 3): the
 * action decodes the bytes as UTF-8 and requires a header row, which no
 * declared type can fake.
 */
export const CSV_ACCEPT_ATTR = ".csv,text/csv";

/**
 * The upload's error copy, in the site's measured, operational register
 * (AGENTS.md 5): what is wrong and what to do. No apology, no exclamation.
 */
export const CSV_ERRORS = {
  missing: "Attach a CSV file.",
  size: `That file is over ${CSV_MAX_LABEL}. Attach a smaller CSV.`,
  empty: "That file is empty.",
} as const;

/* -------------------------------------------------------------------------- */
/*  The results the three actions return                                       */
/* -------------------------------------------------------------------------- */

/** The upload form's one field. */
export type ActivityUploadField = "file";

export type ActivityUploadFieldErrors = Record<ActivityUploadField, string>;

export const NO_ACTIVITY_UPLOAD_FIELD_ERRORS: ActivityUploadFieldErrors = {
  file: "",
};

/**
 * `stageImport`'s result.
 *
 * **The one shape in this repository that carries a value on success**, and it
 * is a deliberate extension of `SubmitResult` rather than a second vocabulary:
 * the leaf navigates to the staged import, which needs its id. The failure half
 * is `SubmitResult`'s verbatim.
 */
export type StageImportResult =
  | { ok: true; importId: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<ActivityUploadField, string>> };

/** The commit, discard and mapping actions all answer in the shared
    vocabulary (AGENTS.md 10 rule 2). Field errors are keyed by canonical field
    for the mapping form; the other two have no fields. */
export type ActivityMappingResult = SubmitResult<ActivityField>;

export type ActivityImportActionResult = SubmitResult;

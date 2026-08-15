import * as z from "zod";

import { SCOPE2_MARKET_BASES } from "./emissions";
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
 * The categories a market-based scope 2 lane is offered on — prompt 85.
 *
 * **A decision, not a measurement** (AGENTS.md 12 rule 4), and it follows the
 * Scope 2 Guidance's own boundary: scope 2 covers purchased electricity, steam,
 * heat and cooling, and Appendix A extends dual reporting to the latter three
 * ("Companies shall report emissions from the purchase and use of these energy
 * products the same as for electricity: according to a location-based and
 * market-based method"). `fuel` is combusted on site and is scope 1; nothing
 * else in this list is scope 2 at all.
 *
 * It bounds where the *lane* is offered. It does not decide whether a factor is
 * market-based — `emission_factor.scope2_method` does, and the action checks it.
 */
export const SCOPE2_MARKET_LANE_CATEGORIES = ["electricity", "heat"] as const;

export function offersMarketLane(category: ActivityCategory): boolean {
  return (SCOPE2_MARKET_LANE_CATEGORIES as readonly string[]).includes(category);
}

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

/* -------------------------------------------------------------------------- */
/*  The factor mapping — prompt 65                                             */
/* -------------------------------------------------------------------------- */

/**
 * Choosing the emission factor for one `(category, unit)` pair.
 *
 * **The category and the unit parse against the unions above, never as free
 * strings.** They are the two halves of `activity_factor_mapping_key`, so a
 * value outside the vocabulary would either fail the enum cast at the database
 * or, worse, write a mapping no record can ever match.
 *
 * **The factor id is a uuid here and a *claim* everywhere else.** Shape is all
 * this schema can check; whether the row exists, whether this tenant may see it,
 * and whether the engine can calculate with it are three server-side checks the
 * action performs afterwards, at stage e. A non-uuid is a forged request rather
 * than a typo and gets the same handled failure a missing factor gets.
 *
 * **The lane is a third key column, and it accepts exactly two values** —
 * prompt 85. `null` is the reporting lane that has always existed and keeps its
 * meaning for every scope; `"market_based"` is the second scope 2 lane the
 * Scope 2 Guidance's dual-reporting requirement needs. `"location_based"` is
 * deliberately *not* accepted here even though it is in `SCOPE2_METHODS`: the
 * default lane already carries the location-based figure, and admitting the
 * string would create a third lane that means the same thing as `null` and
 * silently split one pair's mapping in two.
 *
 * **The basis is a fourth field and the market lane has no default one** —
 * prompt 86. It says which rung of the Scope 2 Guidance's market-based data
 * hierarchy the reporter is asserting: a contractual instrument (rungs 1–3) or
 * the grid-average fallback (rung 5). The two cross-field rules below are the
 * same idiom `lib/validation/emissions.ts`'s custom-factor schema already uses
 * for `scope`/`scope2Method`:
 *
 * - a basis on the **default** lane is refused. That lane has one meaning and a
 *   basis on it would create a fourth lane;
 * - a **missing** basis on the market lane is refused rather than defaulted.
 *   The whole point of rung 5 is that the reporter chose it, and a default
 *   would make the product choose.
 */
export const factorMappingSchema = z
  .object({
    category: z.enum(ACTIVITY_CATEGORIES, {
      error: "Choose a category.",
    }),
    unit: z.enum(ACTIVITY_UNITS, { error: "Choose a unit." }),
    factorId: z.uuid({ error: "Choose a factor from the list." }),
    scope2Method: z
      .literal("market_based", { error: "Choose a reporting lane." })
      .nullish()
      .transform((value) => value ?? null),
    scope2MarketBasis: z
      .enum(SCOPE2_MARKET_BASES, { error: "Choose what this rate rests on." })
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine((value, context) => {
    if (value.scope2Method === "market_based" && !value.scope2MarketBasis) {
      context.addIssue({
        code: "custom",
        message: FACTOR_MAPPING_ERRORS.basisMissing,
        path: ["scope2MarketBasis"],
      });
    }
    if (value.scope2Method !== "market_based" && value.scope2MarketBasis) {
      context.addIssue({
        code: "custom",
        message: FACTOR_MAPPING_ERRORS.basisOnDefaultLane,
        path: ["scope2MarketBasis"],
      });
    }
  });

export type FactorMappingInput = z.infer<typeof factorMappingSchema>;

export type FactorMappingField = keyof FactorMappingInput;

export type FactorMappingResult = SubmitResult<FactorMappingField>;

/**
 * The mapping surface's copy, in the site's measured, operational register
 * (AGENTS.md 5): what is wrong and what to do about it. Written here rather than
 * in the action because the client leaf renders the same sentences for its own
 * courtesy check (AGENTS.md 10 rule 1).
 */
export const FACTOR_MAPPING_ERRORS = {
  invalid: "Check the marked fields and try again.",
  notFound:
    "That factor is not available. It may have been superseded since the list was loaded.",
  notOwner:
    "Only an owner can change an emission factor. A factor choice moves every figure in a disclosure.",
  /* The market lane's own refusals — prompt 85, rewritten by prompt 86.

     **`notMarketBased` used to say the reporter's only option was to add a
     contractual rate.** That was true while the market lane had one basis; the
     lane now has two, and a sentence naming one of them is incomplete
     (AGENTS.md 12 rule 8). It names both. */
  notMarketBased:
    "That factor is not a market-based scope 2 rate. Add the contractual rate you hold under Add customer factor, with its method set to market-based — or, if you hold no better instrument for this consumption, map this pair on the grid-average fallback instead and it will be labelled as one.",
  marketBasedOnDefaultLane:
    "That is a market-based scope 2 rate. It belongs on the market-based lane for this pair, beside the grid-average factor, not in place of it.",
  /* The fallback's own refusal — prompt 86. The substitution is permitted only
     on the basis the reporter chose, and only with the kind of factor that
     basis names. */
  notGridAverage:
    "The grid-average fallback takes a scope 2 grid-average factor — the same kind of factor the location-based lane uses. A market-based rate is a contractual instrument: map it on this lane as one instead.",
  /* The two the shared schema raises before any of the above — prompt 86. */
  basisMissing:
    "Say what this market-based rate rests on: a contractual instrument you hold, or the grid average as a stated fallback. There is no default.",
  basisOnDefaultLane:
    "A market-based basis does not apply to the location-based lane. That lane carries the grid-average figure already.",
} as const;

export const FACTOR_SEARCH_MODES = ["lexical", "fuzzy"] as const;

/** A request-time GET still crosses the browser/server boundary. It is parsed
    before it reaches the database, and 120 characters remains the cap the
    mapping page had before close-wording search existed. */
export const factorSearchSchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(120, { error: "Use 120 characters or fewer." }),
    mode: z.enum(FACTOR_SEARCH_MODES).catch("lexical"),
  })
  .superRefine((value, context) => {
    if (value.mode === "fuzzy" && value.q === "") {
      context.addIssue({
        code: "custom",
        path: ["q"],
        message: "Enter a description before finding close wording.",
      });
    }
  });

export type FactorSearchInput = z.infer<typeof factorSearchSchema>;

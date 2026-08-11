import * as z from "zod";

import type { SubmitResult } from "./result";

/**
 * Targets and forecasting's input contract and its vocabularies — build
 * step 11.
 *
 * **Not `server-only`, and it must stay that way** (AGENTS.md 6.3), on exactly
 * the footing `lib/validation/activity.ts` and `lib/validation/emissions.ts`
 * record: the `/targets` client leaf and the Server Actions in
 * `app/targets/actions.ts` both import it, so the rules exist once and run
 * twice (AGENTS.md 10 rule 1).
 *
 * **It imports nothing from `lib/db/`.** `lib/db/schema.ts` calls `pgEnum` at
 * module scope, so an import in that direction would put `drizzle-orm/pg-core`
 * into a browser bundle. The enum *members* live here and `schema.ts` builds
 * its `pgEnum`s from these constants, so each union is declared exactly once
 * (AGENTS.md 9.2 rule 2).
 *
 * It imports nothing from `lib/domain/` either: the pure layer imports *this*,
 * never the reverse.
 *
 * ---
 *
 * ## Every figure crosses as a string, and that is the design
 *
 * `baseline` and `reductionPercent` arrive as **decimal strings**, bounded by a
 * pattern, and are never `z.number()`. A target's baseline is multiplied by a
 * percentage and compared against a computed total, and AGENTS.md 5.3's hard
 * rule puts that arithmetic in `lib/domain/`'s exact fixed-point layer where no
 * `Number` appears on the value path. Coercing the input to a double at the
 * boundary would throw the precision away before the exact layer ever saw it.
 *
 * The range checks are therefore **structural, in the pattern**, rather than a
 * numeric comparison — which is what keeps this module free of `Number` too.
 */

/* -------------------------------------------------------------------------- */
/*  The three enums, declared once                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a target covers.
 *
 * **Deliberately coarse.** These are the groupings a company actually commits
 * to publicly — a scope 1+2 operational target, or a 1+2+3 net figure — not an
 * arbitrary scope selection. A per-category or per-site target is a finer
 * vocabulary with a real UI behind it and is not this step's (§5.2, "do not
 * overbuild").
 *
 * **Biogenic and outside-of-scopes are in none of them**, whatever is chosen:
 * the Corporate Standard requires biomass CO2 to be reported separately, and
 * `lib/domain/targets.ts`'s `totalsForCoverage` has no code path that adds
 * either to a covered figure.
 */
export const TARGET_COVERAGES = [
  "scope_1",
  "scope_2",
  "scope_3",
  "scope_1_2",
  "scope_1_2_3",
] as const;

export type TargetCoverage = (typeof TARGET_COVERAGES)[number];

export const TARGET_COVERAGE_LABELS: Record<TargetCoverage, string> = {
  scope_1: "Scope 1",
  scope_2: "Scope 2",
  scope_3: "Scope 3",
  scope_1_2: "Scopes 1 and 2",
  scope_1_2_3: "Scopes 1, 2 and 3",
};

/**
 * A target's lifecycle — and it holds only what a person decided.
 *
 * **Whether a target has been *met* is not stored.** It is computed from the
 * current data every time, because a stored `achieved` would be a derivation
 * that goes stale the moment a new import is committed or the engine is
 * re-run — a filed claim that the database no longer supports. `retired` is a
 * human decision and therefore is stored, with `retired_at` as its transition
 * timestamp (AGENTS.md 9.2 rule 3).
 */
export const TARGET_STATUSES = ["active", "retired"] as const;

export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  active: "Active",
  retired: "Retired",
};

/**
 * Where the filed baseline figure came from.
 *
 * `stated` — the reporter typed it, usually from a previously published
 * inventory. `computed_at_creation` — they accepted the figure this product
 * computed for the base year at the moment the target was created.
 *
 * **Either way the number is stored on the target row and never re-derived.** A
 * later recalculation, a newly committed import or a changed factor mapping
 * must not silently move a baseline a company has already published against.
 */
export const TARGET_BASELINE_SOURCES = ["stated", "computed_at_creation"] as const;

export type TargetBaselineSource = (typeof TARGET_BASELINE_SOURCES)[number];

export const TARGET_BASELINE_SOURCE_LABELS: Record<
  TargetBaselineSource,
  string
> = {
  stated: "Stated by the reporter",
  computed_at_creation: "Computed from activity data when the target was set",
};

/**
 * What a run-rate projection stands on — build step 11's concept, moved here at
 * step 14 because a column now stores it.
 *
 * `trend` — two 12-month windows, so the projection carries a direction.
 * `flat` — 12 to 23 complete months, so the latest window is carried forward
 * with no trend claimed.
 *
 * **It travels with the figure and every surface must render it**, which is the
 * whole reason it is a stored column on `target_alert` rather than something the
 * email recomputes: a flat projection and a trending one are different claims
 * about the future, and showing them identically presents the weaker as the
 * stronger. `lib/domain/targets.ts` derives its `ProjectionBasis` from this
 * constant, so the union is declared exactly once (AGENTS.md 9.2 rule 2).
 */
export const PROJECTION_BASES = ["trend", "flat"] as const;

export const PROJECTION_BASIS_LABELS: Record<
  (typeof PROJECTION_BASES)[number],
  string
> = {
  trend: "Trend of the last two 12-month windows",
  flat: "Latest 12 months carried forward flat",
};

/* -------------------------------------------------------------------------- */
/*  Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The plausible range for a base or target year.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). 1990 is the
 * Kyoto reference year and the earliest baseline a corporate target realistically
 * names; 2100 is past every net-zero commitment in circulation. The bound exists
 * so a mistyped year is a legible field error rather than a trajectory with four
 * thousand rows in it.
 */
export const TARGET_MIN_YEAR = 1990;
export const TARGET_MAX_YEAR = 2100;

/** At most three decimal places on a percentage — a tenth of a percent is
    already finer than any published corporate target, and the third place is
    headroom. It is what `emission_target.reduction_percent`'s scale is derived
    from. */
export const TARGET_PERCENT_DECIMALS = 3;

/**
 * At most twelve integer digits and three decimal places, in tCO2e.
 *
 * Twelve integer digits is a trillion tonnes — roughly thirty times the world's
 * annual emissions — so nothing a company files can exceed it, and three decimal
 * places is a kilogram. **It is what `emission_target.baseline_kg_co2e`'s
 * precision is derived from**; the derivation is recorded on the column.
 */
export const TARGET_BASELINE_INTEGER_DIGITS = 12;
export const TARGET_BASELINE_DECIMALS = 3;

/**
 * `(0, 100]`, to three decimal places, enforced **structurally**.
 *
 * The alternative — parse and compare — would need a `Number` on a value that
 * goes on to be multiplied by a baseline, which is the thing this module
 * refuses to do. The pattern admits `100`, `100.0`, `100.000` and anything from
 * `0.001` to `99.999`; it also admits `0` and `0.000`, which the refinement
 * below rejects, because a zero-reduction target is not a target.
 */
const PERCENT_PATTERN = /^(?:100(?:\.0{1,3})?|\d{1,2}(?:\.\d{1,3})?)$/;

/** Twelve integer digits, up to three decimals, no sign. Zero is admitted by
    the pattern and rejected by the refinement: a baseline of nothing has no
    reduction to express and no percentage reading against it. */
const BASELINE_PATTERN = /^\d{1,12}(?:\.\d{1,3})?$/;

/** True when every digit is a zero — the one check both patterns above leave to
    a refinement. String-only, so no `Number` reaches a figure. */
function isZeroString(value: string): boolean {
  return /^0*(?:\.0*)?$/.test(value);
}

const year = z
  .number()
  .int({ error: "Enter a four-digit year." })
  .min(TARGET_MIN_YEAR, { error: `Use ${TARGET_MIN_YEAR} or later.` })
  .max(TARGET_MAX_YEAR, { error: `Use ${TARGET_MAX_YEAR} or earlier.` });

/**
 * The create form's contract.
 *
 * **`targetYear` must be strictly greater than `baseYear`.** A zero span is the
 * divide-by-zero case in the trajectory, and it is rejected here at the
 * boundary rather than refused downstream: a target that ends in the year it
 * starts is not a target, so this is a validation failure and not an
 * engine refusal.
 *
 * Nothing here names an organisation, and nothing may — the tenant is resolved
 * server-side from the membership row on every call.
 */
export const createTargetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Name this target." })
      .max(120, { error: "Use 120 characters or fewer." }),
    coverage: z.enum(TARGET_COVERAGES, {
      error: "Choose what this target covers.",
    }),
    baseYear: year,
    targetYear: year,
    reductionPercent: z
      .string()
      .trim()
      .regex(PERCENT_PATTERN, {
        error: `Enter a percentage above 0 and up to 100, with at most ${TARGET_PERCENT_DECIMALS} decimal places.`,
      })
      .refine((value) => !isZeroString(value), {
        error: "A reduction of 0% is not a target.",
      }),
    baseline: z
      .string()
      .trim()
      .regex(BASELINE_PATTERN, {
        error: `Enter the base-year figure in tCO2e, with at most ${TARGET_BASELINE_DECIMALS} decimal places.`,
      })
      .refine((value) => !isZeroString(value), {
        error: "A baseline of 0 tCO2e has no reduction to measure.",
      }),
    baselineSource: z.enum(TARGET_BASELINE_SOURCES),
  })
  .refine((data) => data.targetYear > data.baseYear, {
    error: "The target year must be later than the base year.",
    path: ["targetYear"],
  });

export type CreateTargetInput = z.infer<typeof createTargetSchema>;

/** A target's id, as it crosses from the browser. A non-uuid is a forged
    request, not a typo, and gets the same handled failure a missing target
    gets — there is no existence oracle on this path. */
export const targetIdSchema = z.uuid();

/* -------------------------------------------------------------------------- */
/*  The results the two actions return                                         */
/* -------------------------------------------------------------------------- */

/** The create form's fields, in the order it renders them. */
export const TARGET_FIELDS = [
  "name",
  "coverage",
  "baseYear",
  "targetYear",
  "reductionPercent",
  "baseline",
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

export const TARGET_FIELD_LABELS: Record<TargetField, string> = {
  name: "Name",
  coverage: "Coverage",
  baseYear: "Base year",
  targetYear: "Target year",
  reductionPercent: "Reduction",
  baseline: "Base-year emissions (tCO2e)",
};

export type TargetFieldErrors = Partial<Record<TargetField, string>>;

/** Both actions answer in the shared vocabulary (AGENTS.md 10 rule 2).
    `retireTarget` has no fields, so it carries no field errors. */
export type CreateTargetResult = SubmitResult<TargetField>;

export type RetireTargetResult = SubmitResult;

/**
 * The register the target surface's failures are written in — measured and
 * operational (AGENTS.md 5): what is wrong, and what it means for the reading.
 * Never an apology, never an exclamation, never alarmist about the number.
 */
export const TARGET_ERRORS = {
  fields: "Check the marked fields and try again.",
  notFound: "That target is not available. It may have been removed.",
  alreadyRetired: "That target is already retired.",
  signedOut: "Your session has expired. Sign in again to manage targets.",
  noOrganization:
    "This account belongs to no organisation. Create one before setting a target.",
  failure:
    "We couldn't save that target just now. Please try again in a moment.",
} as const;

import * as z from "zod";

import { SCOPE2_METHODS, SCOPE3_CATEGORIES } from "./emissions";
import type { SubmitResult } from "./result";
import { TARGET_COVERAGES } from "./targets";

/**
 * ESG report generation and export — build step 13's input contract, its
 * vocabularies, and the **schema-owned parser** for the stored evidence
 * snapshot.
 *
 * **Not `server-only`, and it must stay that way** (AGENTS.md 6.3), on exactly
 * the footing `lib/validation/targets.ts` records: the `/reports` client leaves
 * and the Server Actions in `app/reports/actions.ts` both import it, so the
 * rules exist once and run twice (AGENTS.md 10 rule 1).
 *
 * **It imports nothing from `lib/db/`** — `schema.ts` calls `pgEnum` at module
 * scope, so an import in that direction would put `drizzle-orm/pg-core` into a
 * browser bundle. `REPORT_NARRATIVE_STATUSES` lives here and `schema.ts` builds
 * its `pgEnum` from it, so the union is declared exactly once (AGENTS.md 9.2
 * rule 2). It imports nothing from `lib/domain/` either: the pure layer imports
 * *this*, never the reverse.
 *
 * ---
 *
 * ## Every figure in the snapshot is a string, and that is the design
 *
 * {@link reportEvidenceSchema} carries no `z.number()` on any value path — only
 * on counts and years, which are cardinalities and calendar labels rather than
 * figures. Every tCO2e value is a **decimal string, already rounded once** by
 * `lib/domain/reports.ts` at the presentation boundary, because AGENTS.md 5.3's
 * hard rule puts disclosure arithmetic in the exact fixed-point layer where no
 * `Number` appears. A snapshot that stored a double would throw precision away
 * between the engine and the filing.
 *
 * The consequence is the useful one: the strings in a stored snapshot are
 * **exactly** the strings a narrative is allowed to contain, which is what makes
 * `validateNarrative` a closed-set check rather than a plausibility judgement.
 */

/* -------------------------------------------------------------------------- */
/*  Versions and bounds                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The evidence snapshot's shape version, stored on every report row.
 *
 * **Provenance, not decoration** — the same contract `ENGINE_VERSION` holds in
 * `lib/domain/emissions.ts`. A stored snapshot is rendered by whatever code is
 * deployed years later, so the row has to say which shape it was written in.
 * Bump it whenever a change here would make an existing snapshot render
 * differently or fail to parse.
 */
export const REPORT_FORMAT_VERSION = "1.0.0";

/**
 * Three decimal places on every tCO2e figure in a report — a kilogram.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). `/dashboard` reads
 * at one place because it is a glance; a report is a document a company files
 * against, and dropping to the kilogram is the finest granularity the underlying
 * `activity_record.quantity` (`numeric(18, 6)`) can honestly support once it has
 * been multiplied by a factor. It is the same place count `/targets` already
 * shows a target figure at.
 */
export const REPORT_TONNES_DECIMALS = 3;

/** The length the narrative prompt and the model's answer are capped at.
    Judgements: the evidence package is bounded by construction (fixed fields,
    at most fifteen scope 3 categories, a handful of factor sets), and the cap
    exists so a pathological snapshot cannot become an unbounded model bill. */
export const NARRATIVE_MAX_PROMPT_CHARS = 12_000;
export const NARRATIVE_MAX_CHARS = 6_000;

/* -------------------------------------------------------------------------- */
/*  The one enum, declared once                                                */
/* -------------------------------------------------------------------------- */

/**
 * The narrative's lifecycle — **a state, not a boolean**, because four of them
 * exist and three of those are failures that read differently to a person
 * (AGENTS.md 9.2 rule 2).
 *
 * - `not_generated` — the deterministic snapshot exists and no draft has been
 *   asked for. The ordinary state of a new report, and a complete one: the
 *   report exports without any model output at all.
 * - `generated` — a draft passed {@link validateNarrative} and is stored.
 * - `rejected` — the model returned prose containing a figure that is not in the
 *   snapshot. **The report is untouched**; the draft is discarded, never stored.
 * - `failed` — the model could not be reached, timed out, or returned nothing.
 *
 * **There is deliberately no second `report_status` column.** The deterministic
 * snapshot is immutable once written — it is what the report *is* — and the only
 * other lifecycle a report has is removal, which `deleted_at` already carries
 * (AGENTS.md 9.2 rule 5). A `draft` / `final` pair would be a publishing state
 * for a step whose whole contract is that nothing auto-publishes.
 */
export const REPORT_NARRATIVE_STATUSES = [
  "not_generated",
  "generated",
  "rejected",
  "failed",
] as const;

export type ReportNarrativeStatus = (typeof REPORT_NARRATIVE_STATUSES)[number];

/** Plain language, in the site's measured register — what the state is, never an
    apology and never a status code a person has to decode. */
export const REPORT_NARRATIVE_STATUS_LABELS: Record<
  ReportNarrativeStatus,
  string
> = {
  not_generated: "No narrative drafted",
  generated: "Draft narrative generated",
  rejected: "Draft rejected — it contained a figure not in this report",
  failed: "Draft could not be generated",
};

/* -------------------------------------------------------------------------- */
/*  The stored evidence snapshot                                               */
/* -------------------------------------------------------------------------- */

/** A plain decimal, as `lib/domain/decimal.ts` renders one. No exponent, no
    thousands separator — the grammar `parseDecimal` accepts, so a snapshot can
    always be read back into the exact layer. */
const figure = z.string().regex(/^-?\d+(?:\.\d+)?$/);

/** `YYYY-MM-DD`, structurally. Calendar validity is guaranteed by the producer:
    every date here is derived from a `date` column or from the caller's `asOf`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `YYYY-MM`. */
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/);

const count = z.number().int().nonnegative();
const year = z.number().int();

export const reportPeriodSchema = z.object({
  startMonth: isoMonth,
  endMonth: isoMonth,
  startDate: isoDate,
  endDate: isoDate,
});

export const reportTargetSchema = z.object({
  name: z.string(),
  coverage: z.enum(TARGET_COVERAGES),
  baseYear: year,
  targetYear: year,
  reductionPercent: figure,
  baselineTonnes: figure,
  targetTonnes: figure,
  /** Null when the projection refused — the refusal is carried in
      `projectionRefusal` and the surface prints that instead of a number. */
  projection: z
    .object({
      tonnes: figure,
      basis: z.enum(["trend", "flat"]),
      windowEnd: isoMonth,
      completeMonths: count,
    })
    .nullable(),
  projectionRefusal: z.string().nullable(),
  /** Signed: positive is above the target, negative is below it. */
  readingPercent: figure.nullable(),
  readingRefusal: z.string().nullable(),
});

/**
 * Everything a report renders, and everything a narrative may mention.
 *
 * **This is the whole disclosure.** The export route and the detail page read
 * this and nothing else — neither recalculates an emission, re-selects a factor
 * or re-reads a target. A report is a thing that was computed at a moment
 * against a named factor set, and re-deriving it on every view would make "what
 * did we file" unanswerable, which is the reasoning `listEmissions` already
 * records for stored figures.
 */
export const reportEvidenceSchema = z.object({
  formatVersion: z.string(),
  /** The single clock value the Server Action captured, passed into the pure
      layer. No domain module read it (AGENTS.md 6.2). */
  generatedAsOf: isoDate,
  engineVersion: z.string(),
  period: reportPeriodSchema,
  /** tCO2e, rounded once at {@link REPORT_TONNES_DECIMALS}. Biogenic and
      outside-of-scopes are carried separately and are in no total. */
  totals: z.object({
    total: figure,
    scope1: figure,
    scope2: figure,
    scope3: figure,
    biogenic: figure,
    outsideOfScopes: figure,
  }),
  scope3ByCategory: z.array(
    z.object({ category: z.enum(SCOPE3_CATEGORIES), tonnes: figure }),
  ),
  scope2Methods: z.array(z.enum(SCOPE2_METHODS)),
  coverage: z.object({
    /** Committed records in the period carrying a stored emission. */
    calculatedRecords: count,
    /** Committed records in the period, calculated or not. */
    committedRecords: count,
    /** The difference — records that contribute nothing to any figure above. */
    uncalculatedRecords: count,
  }),
  /** The sets the stored emissions in this period actually used, not every set
      the organisation can see. Attribution is a licence condition. */
  factorSets: z.array(
    z.object({
      source: z.string(),
      datasetVersion: z.string(),
      publicationYear: year,
      licence: z.string(),
      licenceUrl: z.string().nullable(),
      sourceUrl: z.string().nullable(),
      sourceReference: z.string().nullable(),
    }),
  ),
  target: reportTargetSchema.nullable(),
  /** Every reason this report is not a complete picture, in plain sentences.
      Missing evidence is a caveat, never a zero (AGENTS.md 5.3). */
  caveats: z.array(z.string()),
});

export type ReportEvidence = z.infer<typeof reportEvidenceSchema>;
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type ReportTargetEvidence = z.infer<typeof reportTargetSchema>;

/**
 * Reads a stored snapshot back, or `null`.
 *
 * **A typed refusal rather than a throw**, and rather than a cast: the column is
 * `text`, so nothing but this function stands between a malformed or
 * older-format row and a page rendering a figure it did not verify. A `null`
 * here makes the report unavailable, which is the honest outcome — the
 * alternative is showing a partial disclosure.
 */
export function parseReportEvidence(json: string): ReportEvidence | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = reportEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/*  What crosses from the browser                                              */
/* -------------------------------------------------------------------------- */

/**
 * The create form's contract — **and it names no period and no organisation.**
 *
 * The reporting period is derived server-side from one captured clock value, and
 * the tenant comes from the session's membership row. A browser-supplied period
 * would let a caller frame a disclosure over a window of its choosing; a
 * browser-supplied organisation id would be the whole multi-tenancy failure in
 * one line. Neither is accepted, so neither can be forged.
 */
export const createReportSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "Name this report." })
    .max(120, { error: "Use 120 characters or fewer." }),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

/** A report's id, as it crosses from the browser. A non-uuid is a forged
    request, not a typo, and gets the same handled failure a missing report
    gets — there is no existence oracle on this path. */
export const reportIdSchema = z.uuid();

/* -------------------------------------------------------------------------- */
/*  The results the actions return                                             */
/* -------------------------------------------------------------------------- */

export const REPORT_FIELDS = ["title"] as const;

export type ReportField = (typeof REPORT_FIELDS)[number];

export const REPORT_FIELD_LABELS: Record<ReportField, string> = {
  title: "Report name",
};

export type CreateReportResult = SubmitResult<ReportField>;
export type GenerateNarrativeResult = SubmitResult;
export type DeleteReportResult = SubmitResult;

/**
 * The register the report surface's failures are written in — measured and
 * operational (AGENTS.md 5): what is wrong, and what it means for the reading.
 * Never an apology, never an exclamation, never alarmist about the number.
 */
export const REPORT_ERRORS = {
  fields: "Check the marked fields and try again.",
  notFound: "That report is not available. It may have been removed.",
  noEvidence:
    "No calculated emissions exist in the latest 12 complete months, so there is nothing to report on yet. Import activity data and calculate it first.",
  unreadable:
    "This report's stored figures could not be read, so no narrative was drafted.",
  narrativeRejected:
    "The drafted narrative contained a figure that is not in this report, so it was discarded. The report's own figures are unchanged.",
  narrativeFailed:
    "The narrative service could not be reached. The report's own figures are unchanged and it still exports without one.",
  signedOut: "Your session has expired. Sign in again to manage reports.",
  noOrganization:
    "This account belongs to no organisation. Create one before building a report.",
  failure:
    "We couldn't complete that just now. Please try again in a moment.",
} as const;

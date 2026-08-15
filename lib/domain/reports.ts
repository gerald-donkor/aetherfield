/**
 * ESG report evidence, presentation strings and narrative validation — build
 * step 13, and the module AGENTS.md 5.3's hard rule is written about a second
 * time.
 *
 * **Pure** (AGENTS.md 6.2): no database handle, no `fetch`, no model SDK import,
 * no implicit `Date.now()`. The clock is a parameter, exactly as it is in
 * `lib/domain/targets.ts` and `lib/domain/dashboard.ts`, so the same inputs
 * produce the same snapshot tomorrow.
 *
 * ---
 *
 * ## The rule this module exists to enforce
 *
 * **An LLM never produces a number that appears in a disclosure.**
 *
 * Every figure in a report is computed here, by the existing deterministic
 * engine, from stored `activity_emission` rows — and then **rounded once** into
 * a string. {@link buildReportEvidence} produces that set of strings;
 * {@link allowedNumberTokens} is exactly the closed set of numeric tokens those
 * strings contain, plus the calendar labels and small structural integers the
 * prose legitimately needs; and {@link validateNarrative} rejects any generated
 * sentence containing a numeric token outside it.
 *
 * That is a **closed-set check, not a plausibility judgement.** A model asked to
 * copy figures will copy them; a model that invents `4,200 tCO2e`, `18%` or
 * `2031` produces a token the snapshot does not contain, and the draft is
 * discarded rather than stored. The report's own figures are never touched by
 * the outcome, which is why a rejected generation still leaves an exportable
 * deterministic document.
 *
 * ## Where the rounding is
 *
 * Once, here, at the presentation boundary — `REPORT_TONNES_DECIMALS` places,
 * `half-even`. `lib/domain/emissions.ts` sums exactly and unrounded; this module
 * is the first and only place a report figure loses a digit, which is what makes
 * "round once, at presentation" enforceable rather than aspirational.
 */

import {
  REPORT_FORMAT_VERSION,
  REPORT_TONNES_DECIMALS,
  type ReportEvidence,
  type ReportPeriod,
  type ReportTargetEvidence,
} from "../validation/reports";
import {
  SCOPE2_METHOD_LABELS,
  SCOPE3_CATEGORY_LABELS,
} from "../validation/emissions";
import {
  TARGET_COVERAGE_LABELS,
  type TargetCoverage,
} from "../validation/targets";
import { toFixed, type Decimal } from "./decimal";
import { dashboardWindows } from "./dashboard";
import {
  ENGINE_VERSION,
  toTonnes,
  totalsOf,
  type RecordEmission,
  type ScopeTotals,
} from "./emissions";
import { assessTarget } from "./targets";

/* -------------------------------------------------------------------------- */
/*  The period                                                                 */
/* -------------------------------------------------------------------------- */

/** How many complete months a report covers. Used as a structural integer in
    the prose ("the latest 12 complete months"), so it is on the allowlist. */
export const REPORT_WINDOW_MONTHS = 12;

/**
 * The latest 12 complete UTC calendar months, ending before the month
 * containing `asOf`.
 *
 * **The same derivation `/dashboard` uses, reused rather than restated** — a
 * report and the overview disagreeing about what "the latest complete year"
 * means would be two definitions of the reporting period, and the one that
 * reached a filing would be whichever the reporter happened to open. The current
 * partial month is excluded: averaging a partial month into an annual figure
 * understates it, which for an emissions total is the flattering direction.
 *
 * The window is stored on the report row as explicit start and end dates, so a
 * later recalculation cannot silently move an existing report's period.
 */
export function reportPeriod(asOf: string): ReportPeriod {
  const { primary } = dashboardWindows(asOf);
  return {
    startMonth: primary.startMonth,
    endMonth: primary.endMonth,
    startDate: primary.startDate,
    endDate: primary.endDate,
  };
}

/** Rounds once, at the report's declared place count, and renders. The single
    presentation boundary — nothing above this line has rounded anything. */
export function reportTonnes(kgCo2e: Decimal): string {
  return toFixed(toTonnes(kgCo2e), REPORT_TONNES_DECIMALS, "half-even");
}

/* -------------------------------------------------------------------------- */
/*  Building the snapshot                                                      */
/* -------------------------------------------------------------------------- */

export type ReportTargetInput = {
  name: string;
  coverage: TargetCoverage;
  baseYear: number;
  targetYear: number;
  /** The stored `numeric` values, as the strings Postgres reads back. */
  reductionPercent: Decimal;
  baselineKgCo2e: Decimal;
};

export type BuildReportEvidenceInput = {
  /** One `YYYY-MM-DD` clock value, captured by the caller. */
  asOf: string;
  period: ReportPeriod;
  /** The organisation's stored emissions — **all of them**, not only the
      period's. The period is applied here, and the full history is what the
      target projection's two 12-month windows need. */
  emissions: readonly RecordEmission[];
  /** Committed records dated inside the period, calculated or not. */
  committedRecords: number;
  /** Of those, the ones carrying no stored emission. */
  uncalculatedRecords: number;
  factorSets: readonly ReportEvidence["factorSets"][number][];
  target: ReportTargetInput | null;
};

function inPeriod(date: string, period: ReportPeriod): boolean {
  return date >= period.startDate && date <= period.endDate;
}

/**
 * The whole disclosure, as strings, from stored figures only.
 *
 * Deterministic end to end: given the same emissions, counts, factor sets and
 * `asOf`, this returns byte-identical output. Nothing here consults a model,
 * and the only rounding is {@link reportTonnes}.
 */
export function buildReportEvidence(
  input: BuildReportEvidenceInput,
): ReportEvidence {
  const periodEmissions = input.emissions.filter((row) =>
    inPeriod(row.activityDate, input.period),
  );
  const totals = totalsOf(periodEmissions);

  return {
    formatVersion: REPORT_FORMAT_VERSION,
    generatedAsOf: input.asOf,
    engineVersion: ENGINE_VERSION,
    period: input.period,
    totals: {
      total: reportTonnes(totals.total),
      scope1: reportTonnes(totals.scope1),
      scope2: reportTonnes(totals.scope2),
      scope3: reportTonnes(totals.scope3),
      biogenic: reportTonnes(totals.biogenic),
      outsideOfScopes: reportTonnes(totals.outsideOfScopes),
    },
    /* Present only where the period actually carries a market-based figure.
       Absent is the honest reading of "no contractual rate covers this
       period" — a zero would assert a market-based inventory of nothing. */
    marketBased:
      totals.scope2MarketBasedRecords > 0
        ? {
            scope2: reportTonnes(totals.scope2MarketBased),
            total: reportTonnes(totals.totalMarketBased),
            scope2Records: totals.scope2Records,
            scope2MarketBasedRecords: totals.scope2MarketBasedRecords,
            /* Rung 5's share — prompt 86. Always written on a snapshot
               generated by this engine, including as `"0.000"` where the
               reporter chose no fallback: on a new snapshot absent would be
               indistinguishable from "generated before the fallback existed",
               and the schema's two optionals exist to keep exactly that
               distinction readable on an old one. */
            fallbackScope2: reportTonnes(totals.scope2MarketBasedFallback),
            fallbackRecords: totals.scope2MarketBasedFallbackRecords,
          }
        : undefined,
    scope3ByCategory: totals.byScope3Category.map((entry) => ({
      category: entry.category,
      tonnes: reportTonnes(entry.kgCo2e),
    })),
    scope2Methods: [...totals.scope2Methods],
    coverage: {
      /* **Records, not rows.** A record carrying a market-based figure as well
         holds two rows and is one calculated record (prompt 85). */
      calculatedRecords: periodEmissions.filter(
        (row) => row.scope2Method !== "market_based",
      ).length,
      committedRecords: input.committedRecords,
      uncalculatedRecords: input.uncalculatedRecords,
    },
    factorSets: input.factorSets.map((set) => ({ ...set })),
    target: input.target
      ? buildTargetEvidence(input.target, input.emissions, input.asOf)
      : null,
    caveats: buildCaveats(input, periodEmissions.length, totals),
  };
}

/**
 * The target section — the filed commitment, its target figure, and the
 * run-rate projection against it.
 *
 * **Every refusal the step-11 module can return is carried through as a
 * sentence**, never as an absent field and never as a zero: a report that
 * silently omitted "a run rate needs 12 complete months" would read as though
 * the projection had been made and had come out flat.
 */
function buildTargetEvidence(
  target: ReportTargetInput,
  emissions: readonly RecordEmission[],
  asOf: string,
): ReportTargetEvidence {
  /* **The composition lives in `lib/domain/targets.ts` and is shared with build
     step 14's alert evaluator** — including the scales, which are named
     constants there rather than the bare `3` and `1` this call used to restate.
     A report and an alert disagreeing about the same target's reading is the
     failure that arrangement exists to make impossible. */
  const { figure, projection, reading } = assessTarget({
    coverage: target.coverage,
    targetYear: target.targetYear,
    baselineKgCo2e: target.baselineKgCo2e,
    reductionPercent: target.reductionPercent,
    emissions,
    asOf,
  });

  return {
    name: target.name,
    coverage: target.coverage,
    baseYear: target.baseYear,
    targetYear: target.targetYear,
    reductionPercent: toFixed(target.reductionPercent, 3, "half-even"),
    baselineTonnes: reportTonnes(target.baselineKgCo2e),
    targetTonnes: reportTonnes(figure),
    projection: projection.ok
      ? {
          tonnes: reportTonnes(projection.projection.kgCo2e),
          basis: projection.projection.basis,
          windowEnd: projection.projection.windowEnd,
          completeMonths: projection.projection.completeMonths,
        }
      : null,
    projectionRefusal: projection.ok ? null : projection.reason,
    readingPercent:
      reading && reading.ok ? toFixed(reading.percent, 1, "half-even") : null,
    readingRefusal: reading && !reading.ok ? reading.reason : null,
  };
}

/**
 * Why this report is not a complete picture.
 *
 * **Ordered, deduplicated and deterministic**, so two runs over the same data
 * produce the same document. Each sentence states a gap in the evidence; none
 * of them apologises, and none of them is generated.
 */
function buildCaveats(
  input: BuildReportEvidenceInput,
  calculatedRecords: number,
  totals: ScopeTotals,
): string[] {
  const caveats: string[] = [];

  if (calculatedRecords === 0) {
    caveats.push(
      "No committed activity record in this period carries a calculated emission, so every figure above is an absence of evidence rather than a measured zero.",
    );
  }
  if (input.uncalculatedRecords > 0) {
    caveats.push(
      `${input.uncalculatedRecords} committed ${
        input.uncalculatedRecords === 1 ? "record has" : "records have"
      } no calculated emission and contribute nothing to any figure in this report.`,
    );
  }
  if (input.factorSets.length === 0) {
    caveats.push(
      "No emission factor set is attributed to the stored figures in this period.",
    );
  }
  if (!input.target) {
    caveats.push(
      "No active future target was set when this report was generated, so no performance reading is included.",
    );
  }
  caveats.push(
    "Biogenic carbon dioxide and emissions outside the scopes are reported separately and are included in no scope total.",
  );
  /* **Dual reporting, stated as a caveat rather than assumed** — prompt 85.
     Which of these three sentences applies is decided by the evidence, and each
     of them is true of the report it appears in. */
  if (totals.scope2MarketBasedRecords === 0) {
    caveats.push(
      "Scope 2 figures in this report are location-based. No market-based figure is reported, because no market-based rate is mapped for this period.",
    );
  } else {
    caveats.push(
      "Scope 2 is dual reported. The location-based and market-based figures are two readings of the same electricity consumption; neither is added to the other, and every total in this report that is not labelled market-based is location-based.",
    );
    if (totals.scope2MarketBasedRecords < totals.scope2Records) {
      /* **This sentence used to end "and no residual mix or grid average has
         been substituted for them".** Since prompt 86 that is false whenever
         the reporter has chosen the fallback, so the clause is conditional
         rather than asserted (AGENTS.md 12 rule 8). The unqualified claim is
         still made — and is still true — where no fallback exists. */
      caveats.push(
        `The market-based figure covers ${totals.scope2MarketBasedRecords} of ${totals.scope2Records} scope 2 records in this period. The remainder carry no market-based rate${
          totals.scope2MarketBasedFallbackRecords === 0
            ? ", and no residual mix or grid average has been substituted for them"
            : ""
        }, so the market-based total is not comparable to the location-based total.`,
      );
    }
    /* **Rung 5, stated as a reporter's choice with a count** — prompt 86. It is
       named whenever any of the market-based figure rests on it, including
       where the lane is otherwise complete, because a grid average wearing an
       unqualified market-based label is the one thing the Guidance's
       label-by-method requirement exists to prevent. */
    if (totals.scope2MarketBasedFallbackRecords > 0) {
      caveats.push(
        `${totals.scope2MarketBasedFallbackRecords} of the ${totals.scope2MarketBasedRecords} scope 2 records with a market-based figure rest on a grid-average emission factor, chosen by this organisation as the market-based data hierarchy's rung 5 where no contractual instrument was available. Those figures are grid averages reported on the market lane, not rates procured under a contract, and to that extent the market-based total restates the location-based one.`,
      );
    }
  }
  caveats.push(
    "This report covers the latest 12 complete calendar months. The current partial month is excluded.",
  );

  return caveats;
}

/* -------------------------------------------------------------------------- */
/*  The narrative allowlist                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Numeric tokens in prose.
 *
 * The lookaround is what stops `tCO2e`, `kgCO2e` and `AR5` from reading as the
 * numbers 2 and 5: a digit touching a letter on either side is part of a word,
 * not a figure. A leading `.` is excluded from the lookbehind so `1.5` matches
 * whole rather than as `1` and `5`.
 */
const NUMBER_TOKEN = /(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?%?(?![A-Za-z0-9])/g;

/** Thousands separators are a presentation choice the model may make; the value
    underneath is what must match. A trailing `%` is kept — a percentage and a
    count are different claims and must not satisfy each other. */
function normaliseToken(token: string): string {
  return token.replace(/,/g, "");
}

function addFigure(into: Set<string>, value: string): void {
  into.add(value);
  into.add(`${value}%`);
  /* A figure written without its trailing zeroes is the same figure. `12.500`
     and `12.5` are equal under `compare` in `lib/domain/decimal.ts`, and
     rejecting the shorter spelling would reject a correct sentence. */
  if (value.includes(".")) {
    const trimmed = value.replace(/\.?0+$/, "");
    if (trimmed !== "" && trimmed !== "-") {
      into.add(trimmed);
      into.add(`${trimmed}%`);
    }
  }
}

function addDate(into: Set<string>, date: string): void {
  for (const part of date.split("-")) {
    into.add(part);
    into.add(String(Number.parseInt(part, 10)));
  }
}

/**
 * Every numeric token a narrative over this snapshot may contain.
 *
 * **A closed set, built only from the snapshot** plus two structural additions
 * that are stated rather than smuggled:
 *
 * - `1`, `2` and `3`, because "Scope 1" is not a figure and prose that cannot
 *   name a scope is unusable;
 * - `REPORT_WINDOW_MONTHS`, because "the latest 12 complete months" is the
 *   period's own definition.
 *
 * Nothing else is admitted. A percentage, a year, a currency amount or a tonnage
 * the snapshot does not carry is not in this set, which is the whole mechanism.
 */
export function allowedNumberTokens(evidence: ReportEvidence): Set<string> {
  const allowed = new Set<string>();

  /* Scope labels and the window length — structural, not figures. */
  allowed.add("1");
  allowed.add("2");
  allowed.add("3");
  allowed.add(String(REPORT_WINDOW_MONTHS));

  for (const value of Object.values(evidence.totals)) addFigure(allowed, value);

  /* **The market-based figures, or the narrative validator rejects a report
     that quotes a number the engine computed** (prompt 85). The two record
     counts are admitted for the same reason: the coverage caveat prints them,
     so prose that repeats the caveat is naming a figure this snapshot carries.
     Absent on a snapshot filed before the second lane existed, and nothing is
     added for it then. */
  if (evidence.marketBased) {
    addFigure(allowed, evidence.marketBased.scope2);
    addFigure(allowed, evidence.marketBased.total);
    allowed.add(String(evidence.marketBased.scope2Records));
    allowed.add(String(evidence.marketBased.scope2MarketBasedRecords));
    /* And rung 5's share — prompt 86, for the same reason: the fallback caveat
       and the market-based section both print these, so prose repeating them
       is naming a figure this snapshot carries. A validator that did not know
       them would make a correct report unfileable. */
    if (evidence.marketBased.fallbackScope2 !== undefined) {
      addFigure(allowed, evidence.marketBased.fallbackScope2);
    }
    if (evidence.marketBased.fallbackRecords !== undefined) {
      allowed.add(String(evidence.marketBased.fallbackRecords));
    }
  }
  for (const entry of evidence.scope3ByCategory) {
    addFigure(allowed, entry.tonnes);
    /* The standard numbers its own categories and `SCOPE3_CATEGORY_LABELS`
       prints that number — "6. Business travel". Prose naming a category the
       report contains is naming a label, not asserting a figure, so the number
       of each *present* category is admitted and no other.

       (The word this comment wants for that number is a Tailwind v4 utility
       name, and the scanner reads comments — `docs/automation.md` records the
       trap. Saying "number" keeps a dead rule out of every page's CSS.) */
    const categoryNumber = /^c(\d+)_/.exec(entry.category);
    if (categoryNumber) allowed.add(categoryNumber[1]);
  }

  allowed.add(String(evidence.coverage.calculatedRecords));
  allowed.add(String(evidence.coverage.committedRecords));
  allowed.add(String(evidence.coverage.uncalculatedRecords));

  addDate(allowed, evidence.generatedAsOf);
  addDate(allowed, evidence.period.startDate);
  addDate(allowed, evidence.period.endDate);
  addDate(allowed, evidence.period.startMonth);
  addDate(allowed, evidence.period.endMonth);

  for (const set of evidence.factorSets) {
    allowed.add(String(set.publicationYear));
    /* A dataset version is an identifier the report prints verbatim — "1.2" is
       not a figure, but it reads as one to the tokeniser. */
    addFigure(allowed, set.datasetVersion);
  }

  const target = evidence.target;
  if (target) {
    allowed.add(String(target.baseYear));
    allowed.add(String(target.targetYear));
    addFigure(allowed, target.reductionPercent);
    addFigure(allowed, target.baselineTonnes);
    addFigure(allowed, target.targetTonnes);
    if (target.projection) {
      addFigure(allowed, target.projection.tonnes);
      allowed.add(String(target.projection.completeMonths));
      addDate(allowed, target.projection.windowEnd);
    }
    if (target.readingPercent) {
      addFigure(allowed, target.readingPercent);
      /* The surface prints the magnitude and the direction as words, so the
         unsigned spelling of a signed reading is the same claim. */
      addFigure(allowed, target.readingPercent.replace(/^-/, ""));
    }
  }

  return allowed;
}

export type NarrativeValidation =
  | { ok: true }
  | {
      ok: false;
      refusal: "empty" | "too_long" | "unsupported_figure";
      reason: string;
    };

/**
 * Accepts a generated narrative, or refuses it with the token that failed.
 *
 * **The default is refusal.** A token that cannot be matched is not given the
 * benefit of the doubt, because the failure this guards against — a plausible
 * invented number reaching a regulatory filing — is the single worst failure
 * this product can have (AGENTS.md 5.3).
 *
 * The offending token is returned so the reporter is told what went wrong rather
 * than being handed a bare failure. It is a number the model produced, not
 * personal data, and it is shown to the tenant that owns the report and to
 * nobody else — nothing on this path is logged.
 */
export function validateNarrative(
  narrative: string,
  evidence: ReportEvidence,
  maxChars: number,
): NarrativeValidation {
  const text = narrative.trim();
  if (text === "") {
    return {
      ok: false,
      refusal: "empty",
      reason: "The narrative service returned no prose.",
    };
  }
  if (text.length > maxChars) {
    return {
      ok: false,
      refusal: "too_long",
      reason: `The drafted narrative exceeded ${maxChars} characters.`,
    };
  }

  const allowed = allowedNumberTokens(evidence);
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = normaliseToken(match[0]);
    if (!allowed.has(token)) {
      return {
        ok: false,
        refusal: "unsupported_figure",
        reason: `The drafted narrative contained "${match[0]}", which is not a figure in this report.`,
      };
    }
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Deterministic rendering                                                    */
/* -------------------------------------------------------------------------- */

export type ReportRow = { label: string; value: string };

export type ReportSection = {
  key: string;
  title: string;
  rows: ReportRow[];
  notes: string[];
};

/**
 * The report's deterministic body, section by section.
 *
 * **One definition, rendered twice** — the detail page composes JSX from it and
 * the export route composes HTML from it, so the document a reporter reviews on
 * screen and the document they hand to an auditor cannot drift into two
 * different disclosures. It takes no narrative and needs none: a report with
 * `narrative_status = not_generated` renders and exports completely.
 */
export function reportSections(evidence: ReportEvidence): ReportSection[] {
  const t = evidence.totals;
  const sections: ReportSection[] = [
    {
      key: "period",
      title: "Reporting period",
      rows: [
        { label: "Period", value: `${evidence.period.startDate} to ${evidence.period.endDate}` },
        { label: "Complete months", value: String(REPORT_WINDOW_MONTHS) },
        { label: "Generated", value: evidence.generatedAsOf },
        { label: "Calculation engine", value: evidence.engineVersion },
        { label: "Report format", value: evidence.formatVersion },
      ],
      notes: [],
    },
    {
      key: "totals",
      title: "Greenhouse gas emissions, tCO2e",
      rows: [
        { label: "Scopes 1, 2 and 3", value: t.total },
        { label: "Scope 1", value: t.scope1 },
        {
          /* **Always the location-based label on this row.** It used to join
             every method present in the period, which was right when only one
             could be; since prompt 85 two can, and joining them would label a
             location-based figure as though it were both. The market-based
             figure has its own section below. */
          label:
            evidence.scope2Methods.length > 0
              ? `Scope 2 (${SCOPE2_METHOD_LABELS.location_based})`
              : "Scope 2",
          value: t.scope2,
        },
        { label: "Scope 3", value: t.scope3 },
        { label: "Biogenic carbon dioxide, reported separately", value: t.biogenic },
        { label: "Outside of scopes, reported separately", value: t.outsideOfScopes },
      ],
      notes: [],
    },
  ];

  /* **The second reporting lane, as its own section** — prompt 85. Dual
     reporting is two labelled figures for the same consumption, so the
     market-based reading sits beside the totals rather than inside them, and
     its coverage is a note on the section rather than a footnote elsewhere. */
  if (evidence.marketBased) {
    const m = evidence.marketBased;
    sections.push({
      key: "market-based",
      title: "Market-based scope 2, tCO2e",
      rows: [
        {
          label: `Scope 2 (${SCOPE2_METHOD_LABELS.market_based})`,
          value: m.scope2,
        },
        { label: "Scopes 1, 2 and 3 on the market lane", value: m.total },
        {
          label: "Scope 2 records carrying a market-based rate",
          value: `${m.scope2MarketBasedRecords} of ${m.scope2Records}`,
        },
        /* Rung 5's share as its own row — prompt 86. Omitted entirely on a
           snapshot filed before the fallback existed, where the field is
           absent and a zero would be an assertion the evidence cannot make. */
        ...(m.fallbackRecords !== undefined && m.fallbackScope2 !== undefined
          ? [
              {
                label: "Of which rest on a grid-average factor (rung 5)",
                value: `${m.fallbackScope2} over ${m.fallbackRecords} ${
                  m.fallbackRecords === 1 ? "record" : "records"
                }`,
              },
            ]
          : []),
      ],
      notes: [
        "Reported alongside the location-based figures above, not in place of them. Neither figure is an addend of the other.",
        /* **This note used to assert that no grid average had been substituted,
           whenever the lane was incomplete.** Prompt 86 makes that false where
           the reporter chose the fallback, so the claim is now made only when
           it is true, and the fallback gets a sentence of its own. */
        m.scope2MarketBasedRecords < m.scope2Records
          ? m.fallbackRecords
            ? "Scope 2 records with no market-based rate mapped produce no market-based figure."
            : "Scope 2 records with no market-based rate mapped produce no market-based figure. No residual mix or grid average has been substituted for them."
          : "Every scope 2 record in this period carries a market-based rate.",
        ...(m.fallbackRecords
          ? [
              "Some of this figure rests on grid-average emission factors, chosen by this organisation as the market-based data hierarchy's rung 5 where no contractual instrument was available. Those are grid averages reported on the market lane, not rates procured under a contract.",
            ]
          : []),
      ],
    });
  }

  if (evidence.scope3ByCategory.length > 0) {
    sections.push({
      key: "scope3",
      title: "Scope 3 by category, tCO2e",
      rows: evidence.scope3ByCategory.map((entry) => ({
        label: SCOPE3_CATEGORY_LABELS[entry.category],
        value: entry.tonnes,
      })),
      notes: [],
    });
  }

  sections.push({
    key: "coverage",
    title: "Coverage",
    rows: [
      {
        label: "Committed activity records in the period",
        value: String(evidence.coverage.committedRecords),
      },
      {
        label: "Records carrying a calculated emission",
        value: String(evidence.coverage.calculatedRecords),
      },
      {
        label: "Records with no calculated emission",
        value: String(evidence.coverage.uncalculatedRecords),
      },
    ],
    notes: [],
  });

  if (evidence.target) {
    const target = evidence.target;
    const rows: ReportRow[] = [
      { label: "Target", value: target.name },
      { label: "Coverage", value: TARGET_COVERAGE_LABELS[target.coverage] },
      { label: "Base year", value: String(target.baseYear) },
      { label: "Target year", value: String(target.targetYear) },
      { label: "Reduction against baseline, per cent", value: target.reductionPercent },
      { label: "Filed baseline, tCO2e", value: target.baselineTonnes },
      { label: "Target figure, tCO2e", value: target.targetTonnes },
    ];
    const notes: string[] = [];
    if (target.projection) {
      rows.push({
        label: `Projected ${target.targetYear} figure, tCO2e`,
        value: target.projection.tonnes,
      });
      notes.push(
        `${
          target.projection.basis === "trend" ? "Linear run-rate" : "Flat run-rate"
        } projection over ${target.projection.completeMonths} complete months, ending ${target.projection.windowEnd}. A projection is not a measured figure.`,
      );
    }
    if (target.projectionRefusal) notes.push(target.projectionRefusal);
    if (target.readingPercent) {
      rows.push({
        label: "Projection against target, per cent",
        value: target.readingPercent,
      });
      notes.push(
        "A positive reading is above the target; a negative reading is below it.",
      );
    }
    if (target.readingRefusal) notes.push(target.readingRefusal);
    sections.push({ key: "target", title: "Target performance", rows, notes });
  }

  sections.push({
    key: "provenance",
    title: "Emission factors and provenance",
    rows: evidence.factorSets.map((set) => ({
      label: `${set.source} ${set.datasetVersion} (${set.publicationYear})`,
      value: set.licence,
    })),
    notes: evidence.factorSets.map((set) => {
      const source = set.sourceUrl ?? set.sourceReference ?? "source on file";
      const licence = set.licenceUrl
        ? `${set.licence}, ${set.licenceUrl}`
        : set.licence;
      return `${set.source} ${set.datasetVersion}: ${source} — ${licence}`;
    }),
  });

  sections.push({
    key: "caveats",
    title: "Caveats and basis of preparation",
    rows: [],
    notes: evidence.caveats,
  });

  return sections;
}

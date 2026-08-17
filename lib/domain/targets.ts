/**
 * Targets, trajectories and the run-rate projection — build step 11, and the
 * module behind the "16% off your 2027 emissions goal" reading that
 * `app/_components/home/dashboard.tsx` mocks up.
 *
 * **Pure** (AGENTS.md 6.2): no database handle, no `fetch`, no implicit
 * `Date.now()`. The clock is a **parameter** — `projectTargetYear` takes the
 * caller's `asOf` — exactly as `totalsByPeriod` takes `periodOf` rather than
 * reading one, so the same inputs produce the same output tomorrow.
 *
 * **All arithmetic is deterministic and exact until a declared rounding.**
 * Nothing here is a model and nothing here is heuristic (AGENTS.md 5.3). No
 * `Number` appears on the value path; the only integers converted to and from
 * `number` are **calendar indices and month counts**, which are not figures.
 *
 * ---
 *
 * ## Where the rounding is, and why there is any at all
 *
 * `lib/domain/emissions.ts` never divides: every unit ratio it needs is an
 * exact power of ten, so a disclosure figure stays exact and unrounded until
 * presentation. This module is different, and deliberately so — a linear
 * allowance divides a gap by an arbitrary year span, and a percentage reading
 * divides one figure by another. Both are genuinely inexact.
 *
 * So every function here that divides takes a **`scale` and a `RoundingMode` as
 * parameters, with no defaults**, and the call site states them. That is what
 * keeps the inexactness visible rather than absorbed.
 *
 * `targetFigure` is the exception that proves it: `× (100 − p) ÷ 100` is a
 * scale shift by two, not a division, so a target figure is **exact**. It is
 * the number a company files, and it does not round.
 *
 * ## The four ways this module refuses
 *
 * Every one is a typed refusal that keeps the number **out of the output**,
 * surfaced rather than defaulted, and never a zero (AGENTS.md 5.3).
 *
 * 1. **Fewer than 12 complete months** of history — no projection at all. A
 *    run rate from four months of data is a number with nothing behind it.
 * 2. **12 to 23 complete months** — a flat run-rate carried forward, labelled
 *    `basis: "flat"`. There is no second window to compare against, so there is
 *    no trend; carrying a *trend of zero* forward and calling it a trend would
 *    be the invention this rule exists to prevent.
 * 3. **The target year has already elapsed** relative to `asOf` — there is
 *    nothing left to project into.
 * 4. **The target figure is zero** — no percentage reading exists against it,
 *    and `Infinity` is not an answer.
 */

import {
  type Decimal,
  type RoundingMode,
  ZERO,
  add,
  decimal,
  divide,
  fromUnits,
  multiply,
  multiplyByInteger,
  rescale,
  subtract,
  sum,
} from "./decimal";
import {
  REPORTING_WINDOW_MONTHS,
  monthIndex,
  monthLabel,
  monthOf,
  totalsByPeriod,
  type RecordEmission,
  type ScopeTotals,
} from "./emissions";
import {
  PROJECTION_BASES,
  type TargetCoverage,
} from "../validation/targets";

const ONE_HUNDRED = decimal("100");
const TWELVE = decimal("12");

/* -------------------------------------------------------------------------- */
/*  Coverage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The covered figure for one target, from a full scope breakdown.
 *
 * **Biogenic and outside-of-scopes are never included, whatever the coverage.**
 * `totalsOf` already partitions them out of `scope1`, `scope2` and `scope3`,
 * and there is no branch below that reaches for either field — a target read
 * against a figure that included biomass CO2 would not be the figure the
 * Corporate Standard asks a company to report.
 */
export function totalsForCoverage(
  totals: ScopeTotals,
  coverage: TargetCoverage,
): Decimal {
  switch (coverage) {
    case "scope_1":
      return totals.scope1;
    case "scope_2":
      return totals.scope2;
    case "scope_3":
      return totals.scope3;
    case "scope_1_2":
      return sum([totals.scope1, totals.scope2]);
    case "scope_1_2_3":
      return sum([totals.scope1, totals.scope2, totals.scope3]);
  }
}

/* -------------------------------------------------------------------------- */
/*  The target figure                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `baseline × (100 − reduction%) ÷ 100` — **exact**.
 *
 * The `÷ 100` is a power of ten and is therefore a scale shift, in the manner
 * of `toTonnes`: `fromUnits` moves the point without touching a digit, so no
 * rounding mode is needed and none is taken. This is the figure a company
 * commits to publicly, and it keeps every digit its inputs carried.
 */
export function targetFigure(
  baselineKgCo2e: Decimal,
  reductionPercent: Decimal,
): Decimal {
  const remaining = multiply(
    baselineKgCo2e,
    subtract(ONE_HUNDRED, reductionPercent),
  );
  return fromUnits(remaining.units, remaining.scale + 2);
}

/* -------------------------------------------------------------------------- */
/*  The trajectory                                                             */
/* -------------------------------------------------------------------------- */

export type TrajectoryPoint = {
  year: number;
  /** The linear allowance for this year, at the caller's declared scale. */
  allowanceKgCo2e: Decimal;
};

export type TrajectoryResult =
  | { ok: true; points: TrajectoryPoint[] }
  | { ok: false; refusal: "invalid_span"; reason: string };

/**
 * The straight line from the baseline in `baseYear` to the target figure in
 * `targetYear`, one point per year inclusive.
 *
 * **This is the plan, not a forecast.** It says what a company allowed itself
 * for each year when it set the target; the projection below says where the
 * observed rate actually lands, and the reading is the gap between them.
 *
 * Each year's allowance is one division of an exact numerator, so **every point
 * is a single rounding of the true value** rather than an accumulation of a
 * rounded per-year step. Both endpoints come out exact: year 0 divides zero,
 * and the final year divides `delta × span` by `span`.
 *
 * A span of zero or less is a refusal rather than a throw — though the schema in
 * `lib/validation/targets.ts` already rejects it at the boundary, this module
 * assumes nothing about its caller.
 */
export function trajectory({
  baseYear,
  baselineKgCo2e,
  targetYear,
  targetKgCo2e,
  scale,
  mode,
}: {
  baseYear: number;
  baselineKgCo2e: Decimal;
  targetYear: number;
  targetKgCo2e: Decimal;
  scale: number;
  mode: RoundingMode;
}): TrajectoryResult {
  const span = targetYear - baseYear;
  if (!Number.isInteger(span) || span <= 0) {
    return {
      ok: false,
      refusal: "invalid_span",
      reason: "The target year must be later than the base year.",
    };
  }

  const delta = subtract(targetKgCo2e, baselineKgCo2e);
  const divisor = fromUnits(BigInt(span), 0);
  const points: TrajectoryPoint[] = [];

  for (let step = 0; step <= span; step += 1) {
    const travelled = multiplyByInteger(delta, BigInt(step));
    const share = divide(travelled, divisor, scale, mode);
    if (!share.ok) {
      return { ok: false, refusal: "invalid_span", reason: share.error };
    }
    points.push({
      year: baseYear + step,
      allowanceKgCo2e: add(baselineKgCo2e, share.value),
    });
  }

  return { ok: true, points };
}

/* -------------------------------------------------------------------------- */
/*  The run-rate projection                                                    */
/* -------------------------------------------------------------------------- */

/** One month's covered emissions. `month` is `"YYYY-MM"`, as `monthOf`
    produces. */
export type MonthlyTotal = {
  month: string;
  kgCo2e: Decimal;
};

/**
 * Whether the projection carries a trend or is a flat run rate.
 *
 * **It travels with the figure and the surface must render it.** A flat
 * projection and a trending one are different claims about the future, and
 * showing them identically would present the weaker one as the stronger.
 */
export type ProjectionBasis = (typeof PROJECTION_BASES)[number];

export type Projection = {
  /** The projected figure for the target year, at the declared scale. */
  kgCo2e: Decimal;
  basis: ProjectionBasis;
  /** How many complete months of history stand behind it. */
  completeMonths: number;
  /** The last complete month, `"YYYY-MM"` — the end of `latest12KgCo2e`. */
  windowEnd: string;
  /** `W1`: the latest 12 complete months. */
  latest12KgCo2e: Decimal;
  /** `W0`: the 12 before those. `null` on a flat basis, where there is none. */
  previous12KgCo2e: Decimal | null;
  /** Months from `windowEnd` to the end of the target year. */
  monthsAhead: number;
};

export type ProjectionRefusal = "insufficient_history" | "target_year_elapsed";

export type ProjectionResult =
  | { ok: true; projection: Projection }
  | { ok: false; refusal: ProjectionRefusal; reason: string };

/** The minimum history a projection is willing to stand on, and the point at
    which a second window exists to compare against. */
const WINDOW_MONTHS = REPORTING_WINDOW_MONTHS;
const TREND_MONTHS = WINDOW_MONTHS * 2;

/**
 * Where the observed rate lands in the target year.
 *
 * **A complete month is a calendar month strictly earlier than the month
 * containing `asOf`.** The current month is always partial, and averaging a
 * partial month into a run rate understates it — which for an emissions figure
 * is the flattering direction, so it is the one to be careful about.
 *
 * - `W1` is the latest 12 complete months, `W0` the 12 before those.
 * - The projection is `W1 + (W1 − W0) × monthsAhead ÷ 12`.
 *
 * **Linear, and deliberately not compounding.** A compounded rate derived from
 * two windows implies a confidence two windows cannot support; the difference
 * compounds over a decade into a number nobody measured.
 *
 * It is computed as **one division of an exact numerator** —
 * `(W1 × 12 + (W1 − W0) × monthsAhead) ÷ 12` — so the whole projection carries
 * a single rounding at the declared scale rather than one per term.
 *
 * `completeMonths` counts from the earliest month present in `monthly` to the
 * last complete month inclusive, so a gap inside the history counts as a month
 * of history with nothing recorded in it — which is what the committed data
 * says. Months at or after `asOf`'s month are ignored entirely.
 *
 * @param asOf an ISO date, `"YYYY-MM-DD"`. Supplied by the caller; this module
 * reads no clock.
 */
export function projectTargetYear({
  monthly,
  asOf,
  targetYear,
  scale,
  mode,
}: {
  monthly: readonly MonthlyTotal[];
  asOf: string;
  targetYear: number;
  scale: number;
  mode: RoundingMode;
}): ProjectionResult {
  const currentMonth = monthIndex(asOf.slice(0, 7));
  const windowEnd = currentMonth - 1;

  /* December of the target year is the end of the period being projected: a
     target is stated for a calendar year, not for a rolling window. This check
     is independent of history and comes first so an elapsed target is never
     misreported as merely lacking data. */
  const monthsAhead = monthIndex(`${targetYear}-12`) - windowEnd;
  if (monthsAhead <= 0) {
    return {
      ok: false,
      refusal: "target_year_elapsed",
      reason: `${targetYear} has already ended, so there is nothing left to project.`,
    };
  }

  const complete = monthly
    .map((entry) => ({ index: monthIndex(entry.month), kgCo2e: entry.kgCo2e }))
    .filter((entry) => entry.index <= windowEnd);

  const earliest = complete.reduce(
    (lowest, entry) => (entry.index < lowest ? entry.index : lowest),
    Number.POSITIVE_INFINITY,
  );
  const completeMonths = complete.length === 0 ? 0 : windowEnd - earliest + 1;

  if (completeMonths < WINDOW_MONTHS) {
    return {
      ok: false,
      refusal: "insufficient_history",
      reason: `A run rate needs ${WINDOW_MONTHS} complete months of activity data. There ${
        completeMonths === 1 ? "is" : "are"
      } ${completeMonths}.`,
    };
  }

  const inRange = (from: number, to: number) =>
    sum(
      complete
        .filter((entry) => entry.index >= from && entry.index <= to)
        .map((entry) => entry.kgCo2e),
    );

  const latest12 = inRange(windowEnd - (WINDOW_MONTHS - 1), windowEnd);
  const label = monthLabel(windowEnd);

  if (completeMonths < TREND_MONTHS) {
    /* Refusal 2: no second window, so no trend. The figure is the run rate
       carried forward flat and it is labelled as such — never a trend of zero
       dressed as a trend. */
    return {
      ok: true,
      projection: {
        kgCo2e: rescale(latest12, scale, mode),
        basis: "flat",
        completeMonths,
        windowEnd: label,
        latest12KgCo2e: latest12,
        previous12KgCo2e: null,
        monthsAhead,
      },
    };
  }

  const previous12 = inRange(
    windowEnd - (TREND_MONTHS - 1),
    windowEnd - WINDOW_MONTHS,
  );

  const numerator = add(
    multiplyByInteger(latest12, 12n),
    multiplyByInteger(subtract(latest12, previous12), BigInt(monthsAhead)),
  );
  const projected = divide(numerator, TWELVE, scale, mode);
  if (!projected.ok) {
    /* Unreachable — the divisor is the literal 12 — and handled rather than
       asserted away, because a thrown error where a typed refusal belongs is
       the failure this module is shaped against. */
    return {
      ok: false,
      refusal: "insufficient_history",
      reason: projected.error,
    };
  }

  return {
    ok: true,
    projection: {
      kgCo2e: projected.value,
      basis: "trend",
      completeMonths,
      windowEnd: label,
      latest12KgCo2e: latest12,
      previous12KgCo2e: previous12,
      monthsAhead,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  The reading                                                                */
/* -------------------------------------------------------------------------- */

export type ReadingResult =
  | { ok: true; percent: Decimal }
  | { ok: false; refusal: "target_is_zero"; reason: string };

/**
 * `(projection − target) ÷ target × 100`, **signed** — the input to the "16%
 * off your 2027 emissions goal" sentence.
 *
 * **The sign is what separates "off" from "ahead of", and the copy must read
 * it** rather than assuming a direction. Positive means the projection sits
 * above the target and the company is short of its goal; negative means it
 * lands below and is ahead of it.
 *
 * The `× 100` happens before the division, so the whole reading carries one
 * rounding at the declared scale.
 *
 * A target figure of zero is a refusal, not an `Infinity`: an absolute
 * zero-emissions target has no percentage gap to express, and the surface says
 * so instead of showing a number.
 */
export function readingAgainstTarget(
  projectionKgCo2e: Decimal,
  targetKgCo2e: Decimal,
  scale: number,
  mode: RoundingMode,
): ReadingResult {
  const gap = multiply(subtract(projectionKgCo2e, targetKgCo2e), ONE_HUNDRED);
  const percent = divide(gap, targetKgCo2e, scale, mode);
  if (!percent.ok) {
    return {
      ok: false,
      refusal: "target_is_zero",
      reason:
        "This target is zero emissions, so there is no percentage to read against it.",
    };
  }
  return { ok: true, percent: percent.value };
}

/* -------------------------------------------------------------------------- */
/*  The whole assessment, composed once                                        */
/* -------------------------------------------------------------------------- */

/**
 * The scales the projection and the reading are declared at, **in one place**.
 *
 * Every function above takes its `scale` and `mode` as parameters with no
 * defaults, deliberately, so the inexactness is visible at the call site. These
 * constants do not weaken that: they are the *project's* declared answer for the
 * one composition two modules share, named so the two cannot drift apart.
 *
 * **A report and an alert disagreeing about the same target's reading would be
 * the worst failure either can have** — one number in a filed disclosure and a
 * different one in the email telling a company it has drifted. Restating a bare
 * `3` or a bare `1` in a second module is exactly how that happens, so the
 * literals live here and nowhere else.
 */
export const PROJECTION_SCALE = 3;
export const READING_SCALE = 1;
export const ASSESSMENT_MODE: RoundingMode = "half-even";

export type TargetAssessmentInput = {
  coverage: TargetCoverage;
  targetYear: number;
  /** The stored `numeric` values, already parsed. Never a `Number`. */
  baselineKgCo2e: Decimal;
  reductionPercent: Decimal;
  /** The organisation's stored emissions — **all of them**. The projection's
      two 12-month windows need the full history, not one period's slice. */
  emissions: readonly RecordEmission[];
  /** One `YYYY-MM-DD` clock value, captured by the caller. This module reads
      no clock. */
  asOf: string;
};

export type TargetAssessment = {
  /** `baseline × (100 − reduction%) ÷ 100` — exact, and never rounded. */
  figure: Decimal;
  projection: ProjectionResult;
  /** `null` when the projection refused: there is nothing to read against the
      target, and a reading of zero would be an invention. */
  reading: ReadingResult | null;
};

/**
 * `targetFigure` → `projectTargetYear` → `readingAgainstTarget`, at the declared
 * scales, over one target's covered monthly totals.
 *
 * **This is the composition, and both callers use this function** — build
 * step 13's `buildReportEvidence` and build step 14's alert evaluator. Neither
 * restates the chain and neither restates a scale.
 *
 * Every refusal the three functions can return travels out untouched, as a
 * typed value: a refusal is **not** a crossing, **not** a zero, and **not** an
 * absent field. The caller decides how to say so — a report renders the
 * sentence, an alert declines to raise — but neither may turn one into a
 * number.
 */
export function assessTarget(input: TargetAssessmentInput): TargetAssessment {
  const figure = targetFigure(input.baselineKgCo2e, input.reductionPercent);

  const projection = projectTargetYear({
    monthly: totalsByPeriod(input.emissions, monthOf).map((period) => ({
      month: period.period,
      kgCo2e: totalsForCoverage(period.totals, input.coverage),
    })),
    asOf: input.asOf,
    targetYear: input.targetYear,
    scale: PROJECTION_SCALE,
    mode: ASSESSMENT_MODE,
  });

  const reading = projection.ok
    ? readingAgainstTarget(
        projection.projection.kgCo2e,
        figure,
        READING_SCALE,
        ASSESSMENT_MODE,
      )
    : null;

  return { figure, projection, reading };
}

/* -------------------------------------------------------------------------- */
/*  Calendar helpers                                                           */
/* -------------------------------------------------------------------------- */

/** `"2026-03-14"` to `"2026"`. The year counterpart of `monthOf`, for the
    period grouping a baseline suggestion needs. A string slice, for the same
    reason. */
export function yearOf(activityDate: string): string {
  return activityDate.slice(0, 4);
}

/** kgCO2e to tCO2e for a *stated* baseline that arrived in tonnes — ×1000, an
    exact scale-preserving shift, never a division. The inverse of `toTonnes`. */
export function tonnesToKg(tonnes: Decimal): Decimal {
  return multiplyByInteger(tonnes, 1000n);
}

/** The zero a caller needs when an organisation has no emissions in a year at
    all. Re-exported so a caller never hand-builds a `Decimal`. */
export const NO_EMISSIONS = ZERO;

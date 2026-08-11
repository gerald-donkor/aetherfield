/**
 * Threshold alerts — build step 14, and the last row of AGENTS.md §5.2.
 *
 * **Pure** (AGENTS.md 6.2): no database handle, no `fetch`, no implicit
 * `Date.now()`. The clock is a **parameter** — `asOf` travels in exactly as it
 * does through `projectTargetYear` and `buildReportEvidence` — so the same
 * inputs produce the same alerts tomorrow.
 *
 * **No model is involved and nothing here is heuristic** (AGENTS.md 5.3). Step
 * 14 has no sanctioned AI surface at all: every figure below is computed by the
 * deterministic engine and compared with exact fixed-point arithmetic.
 *
 * ---
 *
 * ## What raises an alert, and what deliberately does not
 *
 * **Target drift only** (settled with the user before the prompt was written):
 * the signed `readingAgainstTarget` for an `active` target, against the run-rate
 * projection. A month-over-month spike is not an alert here — a single month is
 * noisy and seasonal, and a product that emailed a company about January would
 * teach it to ignore the channel.
 *
 * ## The composition is shared with the report, deliberately
 *
 * {@link evaluateAlerts} calls `assessTarget` in `./targets.ts` — the same
 * function `lib/domain/reports.ts` calls, at the same declared scales. **An
 * alert and a report disagreeing about the same target's reading would be the
 * worst failure this pair can have**, so neither module restates the chain and
 * neither restates a scale.
 *
 * ## Every refusal produces no alert — never a zero, never an alert
 *
 * All four of step 11's refusals pass through untouched. Fewer than 12 complete
 * months, an elapsed target year and a zero target figure each mean there is no
 * reading, and **a refusal is not a crossing**. A non-`active` target is not
 * evaluated at all.
 *
 * A refusal is also **not a resolution**. An open alert whose target can no
 * longer be read is left open rather than resolved: resolving it would assert
 * that the gap closed, and nothing here knows that. Resolution requires a
 * computed reading that has actually returned to at-or-below the threshold.
 *
 * ## A flat-basis projection does raise an alert, and the basis travels with it
 *
 * `ProjectionBasis`'s own docblock states that a flat projection and a trending
 * one are different claims about the future, and that showing them identically
 * presents the weaker one as the stronger. So the raised alert carries `basis`
 * and `completeMonths`, the row stores both, and the email renders both.
 */

import { compare, decimal, type Decimal } from "./decimal";
import type { RecordEmission } from "./emissions";
import { assessTarget, type ProjectionBasis } from "./targets";
import type { TargetCoverage, TargetStatus } from "../validation/targets";

/* -------------------------------------------------------------------------- */
/*  The threshold                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How far past its target a projection must land before anyone is emailed, as a
 * signed percentage.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), and it is recorded
 * as one in `docs/backend.md`. No recording, comp or dataset was fit to produce
 * it, and nothing may describe it as measured.
 *
 * The reasoning: the projection is a linear two-window run rate whose own
 * uncertainty is not quantified anywhere in this codebase, so a threshold below
 * roughly ten per cent would alert on movement the method cannot distinguish
 * from noise. `app/_components/home/dashboard.tsx`'s illustrative "16% off your
 * 2027 emissions goal" sits above it, which is the intent the marketing mock
 * states.
 *
 * A `Decimal`, not a `Number`: it is compared against a figure on the value
 * path, and no `Number` appears there (`./decimal.ts`).
 */
export const ALERT_THRESHOLD_PERCENT: Decimal = decimal("10");

/* -------------------------------------------------------------------------- */
/*  Inputs and outputs                                                         */
/* -------------------------------------------------------------------------- */

/** One target, as the evaluator needs it. The stored `numeric` values arrive
    already parsed — this module never parses a string into a figure. */
export type AlertTargetInput = {
  id: string;
  name: string;
  coverage: TargetCoverage;
  targetYear: number;
  baselineKgCo2e: Decimal;
  reductionPercent: Decimal;
  status: TargetStatus;
};

/** An alert already open against a target, as the evaluator needs it. */
export type OpenAlertInput = {
  id: string;
  targetId: string;
};

/**
 * A crossing to record.
 *
 * **The figures travel with it**, and the row stores every one of them, so a
 * later change to {@link ALERT_THRESHOLD_PERCENT} cannot rewrite what a company
 * was told and when.
 */
export type RaisedAlert = {
  targetId: string;
  /** Signed, at `READING_SCALE`. Positive means the projection sits above the
      target — the only sign that raises an alert. */
  readingPercent: Decimal;
  projectedKgCo2e: Decimal;
  targetKgCo2e: Decimal;
  /** The threshold in force at this moment, stored on the row. */
  thresholdPercent: Decimal;
  basis: ProjectionBasis;
  completeMonths: number;
  /** The last complete month behind the projection, `"YYYY-MM"`. */
  windowEnd: string;
};

export type AlertEvaluation = {
  raise: RaisedAlert[];
  /** The ids of open alerts whose reading has returned to at-or-below the
      threshold. Ids, not targets, because that is what the writer updates. */
  resolve: string[];
};

/* -------------------------------------------------------------------------- */
/*  The evaluation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One organisation's active targets, read against its emissions.
 *
 * **The comparison is strictly greater than.** A reading of exactly the
 * threshold is not a crossing, and an open alert resolves when the reading
 * returns to at-or-below it.
 *
 * **No hysteresis band, and the reason is stated rather than left implicit:**
 * the underlying data changes on import, not continuously, and the sweep runs
 * once a day, so flapping needs a committed import in each direction on
 * successive days. If flapping is ever observed, that is a measured reason to
 * add a band — it is not a reason to guess at one now.
 *
 * **A target with an alert already open raises nothing.** One open alert per
 * target is the contract; the database's partial unique index is what enforces
 * it against two concurrent sweeps, and this check is what keeps the ordinary
 * path from attempting the write at all.
 */
export function evaluateAlerts(input: {
  targets: readonly AlertTargetInput[];
  /** The organisation's stored emissions — **all of them**. The projection's
      two 12-month windows need the full history. */
  emissions: readonly RecordEmission[];
  openAlerts: readonly OpenAlertInput[];
  /** One `YYYY-MM-DD` clock value, captured by the caller. */
  asOf: string;
}): AlertEvaluation {
  const openByTarget = new Map(
    input.openAlerts.map((alert) => [alert.targetId, alert.id]),
  );

  const raise: RaisedAlert[] = [];
  const resolve: string[] = [];

  for (const target of input.targets) {
    /* A retired target is not evaluated, and its open alert is deliberately
       left open: retiring is a human decision about a commitment, not evidence
       that the projected gap closed, and the row is the record of a crossing
       that did happen. */
    if (target.status !== "active") continue;

    const { figure, projection, reading } = assessTarget({
      coverage: target.coverage,
      targetYear: target.targetYear,
      baselineKgCo2e: target.baselineKgCo2e,
      reductionPercent: target.reductionPercent,
      emissions: input.emissions,
      asOf: input.asOf,
    });

    /* Refusals: no alert, and no resolution either. See the module docblock. */
    if (!projection.ok || !reading || !reading.ok) continue;

    const crossed =
      compare(reading.percent, ALERT_THRESHOLD_PERCENT) > 0;
    const openId = openByTarget.get(target.id);

    if (crossed) {
      if (openId) continue;
      raise.push({
        targetId: target.id,
        readingPercent: reading.percent,
        projectedKgCo2e: projection.projection.kgCo2e,
        targetKgCo2e: figure,
        thresholdPercent: ALERT_THRESHOLD_PERCENT,
        basis: projection.projection.basis,
        completeMonths: projection.projection.completeMonths,
        windowEnd: projection.projection.windowEnd,
      });
    } else if (openId) {
      resolve.push(openId);
    }
  }

  return { raise, resolve };
}

/**
 * Pure dashboard evidence derivations — build step 12.
 *
 * The caller supplies the clock and plain data. This module performs no I/O,
 * reads no environment variable, and keeps every measured value as a Decimal.
 */

import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import type { TargetStatus } from "../validation/targets";
import {
  ZERO,
  add,
  compare,
  divide,
  multiplyByInteger,
  parseDecimal,
  subtract,
  sum,
  type Decimal,
  type RoundingMode,
} from "./decimal";
import {
  REPORTING_WINDOW_MONTHS,
  energyToMWh,
  monthIndex,
  monthLabel,
  monthOf,
  totalsByPeriod,
  totalsOf,
  type RecordEmission,
  type ScopeTotals,
} from "./emissions";

const WINDOW_MONTHS = REPORTING_WINDOW_MONTHS;
const ENERGY_CATEGORIES = new Set<ActivityCategory>(["electricity", "heat"]);
const ENERGY_UNITS = new Set<ActivityUnit>(["kWh", "MWh"]);

export type ReportingWindow = {
  startMonth: string;
  endMonth: string;
  startDate: string;
  endDate: string;
};

export type DashboardWindows = {
  primary: ReportingWindow;
  comparison: ReportingWindow;
};

export type TrendMonth = {
  month: string;
  totals: ScopeTotals | null;
};

export type EnergyInput = {
  activityDate: string;
  category: ActivityCategory;
  unit: ActivityUnit;
  quantity: string;
};

export type EnergyComparison =
  | { ok: true; percent: Decimal }
  | {
      ok: false;
      refusal:
        | "no_current_readings"
        | "no_comparison_readings"
        | "zero_comparison"
        | "unreadable_quantity";
      reason: string;
    };

export type RecordedEnergy = {
  currentMWh: Decimal;
  comparisonMWh: Decimal;
  currentReadings: number;
  comparisonReadings: number;
  change: EnergyComparison;
};

export type DashboardAction = {
  key:
    | "import_activity"
    | "review_calculations"
    | "set_target"
    | "review_target"
    | "review_evidence";
  label: string;
  href: "/activity" | "/targets";
};

export type DashboardTarget = {
  id: string;
  status: TargetStatus;
  targetYear: number;
  createdAt: Date;
};

function lastDateOfMonth(index: number): string {
  const next = new Date(
    Date.UTC(Math.floor((index + 1) / 12), (index + 1) % 12, 1),
  );
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

function windowEnding(endIndex: number): ReportingWindow {
  const startIndex = endIndex - (WINDOW_MONTHS - 1);
  return {
    startMonth: monthLabel(startIndex),
    endMonth: monthLabel(endIndex),
    startDate: `${monthLabel(startIndex)}-01`,
    endDate: lastDateOfMonth(endIndex),
  };
}

/** The latest 12 complete UTC calendar months and the 12 immediately before. */
export function dashboardWindows(asOf: string): DashboardWindows {
  const primaryEnd = monthIndex(asOf.slice(0, 7)) - 1;
  return {
    primary: windowEnding(primaryEnd),
    comparison: windowEnding(primaryEnd - WINDOW_MONTHS),
  };
}

function inWindow(date: string, window: ReportingWindow): boolean {
  return date >= window.startDate && date <= window.endDate;
}

export function emissionsForWindow(
  emissions: readonly RecordEmission[],
  window: ReportingWindow,
): ScopeTotals {
  return totalsOf(
    emissions.filter((row) => inWindow(row.activityDate, window)),
  );
}

/** Twelve fixed slots. A missing month remains null; a stored zero remains data. */
export function emissionsTrend(
  emissions: readonly RecordEmission[],
  window: ReportingWindow,
): TrendMonth[] {
  const byMonth = new Map(
    totalsByPeriod(
      emissions.filter((row) => inWindow(row.activityDate, window)),
      monthOf,
    ).map((entry) => [entry.period, entry.totals]),
  );
  const start = monthIndex(window.startMonth);
  return Array.from({ length: WINDOW_MONTHS }, (_, offset) => {
    const month = monthLabel(start + offset);
    return { month, totals: byMonth.get(month) ?? null };
  });
}

/** `ok: false, unreadable: false` for a row outside the energy categories or
    units — silently excluded, as before. `unreadable: true` for a row that
    *is* in scope but whose stored quantity will not parse, which is data
    corruption rather than an ineligible reading and must not be swallowed the
    same way (AGENTS.md 5.3 / decimal.ts's parseDecimal contract). */
type AsMWhResult =
  | { ok: true; value: Decimal }
  | { ok: false; unreadable: false }
  | { ok: false; unreadable: true; reason: string };

function asMWh(row: EnergyInput): AsMWhResult {
  if (!ENERGY_CATEGORIES.has(row.category) || !ENERGY_UNITS.has(row.unit)) {
    return { ok: false, unreadable: false };
  }
  const quantity = parseDecimal(row.quantity);
  if (!quantity.ok) {
    return { ok: false, unreadable: true, reason: quantity.error };
  }
  return { ok: true, value: energyToMWh(quantity.value, row.unit as "kWh" | "MWh") };
}

export function recordedEnergy(
  rows: readonly EnergyInput[],
  windows: DashboardWindows,
  scale: number,
  mode: RoundingMode,
): RecordedEnergy {
  const current: Decimal[] = [];
  const comparison: Decimal[] = [];
  for (const row of rows) {
    const result = asMWh(row);
    if (!result.ok) {
      if (!result.unreadable) continue;
      return {
        currentMWh: ZERO,
        comparisonMWh: ZERO,
        currentReadings: 0,
        comparisonReadings: 0,
        change: {
          ok: false,
          refusal: "unreadable_quantity",
          reason: `A stored energy reading could not be read as a decimal: ${result.reason}`,
        },
      };
    }
    if (inWindow(row.activityDate, windows.primary)) current.push(result.value);
    if (inWindow(row.activityDate, windows.comparison)) comparison.push(result.value);
  }

  const currentMWh = sum(current);
  const comparisonMWh = sum(comparison);
  let change: EnergyComparison;
  if (current.length === 0) {
    change = {
      ok: false,
      refusal: "no_current_readings",
      reason:
        "No eligible recorded-energy readings exist in the current window.",
    };
  } else if (comparison.length === 0) {
    change = {
      ok: false,
      refusal: "no_comparison_readings",
      reason:
        "No eligible recorded-energy readings exist in the comparison window.",
    };
  } else if (compare(comparisonMWh, ZERO) === 0) {
    change = {
      ok: false,
      refusal: "zero_comparison",
      reason:
        "The comparison-window total is zero, so no percentage change exists.",
    };
  } else {
    const difference = subtract(currentMWh, comparisonMWh);
    const numerator = multiplyByInteger(difference, 100n);
    const divided = divide(numerator, comparisonMWh, scale, mode);
    change = divided.ok
      ? { ok: true, percent: divided.value }
      : {
          ok: false,
          refusal: "zero_comparison",
          reason:
            "The comparison-window total is zero, so no percentage change exists.",
        };
  }

  return {
    currentMWh,
    comparisonMWh,
    currentReadings: current.length,
    comparisonReadings: comparison.length,
    change,
  };
}

/** Active, not elapsed, earliest year, newest creation, then stable id. */
export function selectDashboardTarget<T extends DashboardTarget>(
  targets: readonly T[],
  asOf: string,
): T | null {
  const currentYear = Number.parseInt(asOf.slice(0, 4), 10);
  return (
    targets
      .filter(
        (target) =>
          target.status === "active" && target.targetYear >= currentYear,
      )
      .toSorted((a, b) => {
        if (a.targetYear !== b.targetYear) return a.targetYear - b.targetYear;
        const created = b.createdAt.getTime() - a.createdAt.getTime();
        return created || a.id.localeCompare(b.id);
      })[0] ?? null
  );
}

export function dashboardActions(input: {
  activityRecords: number;
  uncalculatedRecords: number;
  hasTarget: boolean;
  targetOffTrack: boolean;
}): DashboardAction[] {
  const actions: DashboardAction[] = [];
  if (input.activityRecords === 0) {
    actions.push({
      key: "import_activity",
      label: "Import activity data",
      href: "/activity",
    });
  }
  if (input.uncalculatedRecords > 0) {
    actions.push({
      key: "review_calculations",
      label: "Review activity calculations and mappings",
      href: "/activity",
    });
  }
  if (!input.hasTarget) {
    actions.push({
      key: "set_target",
      label: "Set an emissions target",
      href: "/targets",
    });
  }
  if (input.hasTarget && input.targetOffTrack) {
    actions.push({
      key: "review_target",
      label: "Review the target and its activity trend",
      href: "/targets",
    });
  }
  return actions.length > 0
    ? actions
    : [
        {
          key: "review_evidence",
          label: "Continue reviewing current evidence",
          href: "/activity",
        },
      ];
}

/** Exact addition helper for a chart total without exposing arithmetic in UI. */
export function trendTotal(month: TrendMonth): Decimal | null {
  if (!month.totals) return null;
  return add(
    add(month.totals.scope1, month.totals.scope2),
    month.totals.scope3,
  );
}

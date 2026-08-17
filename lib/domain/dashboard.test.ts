import { describe, expect, it } from "vitest";

import { decimal, toDecimalString } from "./decimal";
import {
  dashboardActions,
  dashboardWindows,
  emissionsTrend,
  recordedEnergy,
  selectDashboardTarget,
  trendTotal,
  type DashboardTarget,
  type EnergyInput,
} from "./dashboard";
import type { RecordEmission } from "./emissions";

const str = toDecimalString;

function emission(date: string, kg = "1"): RecordEmission {
  return {
    recordId: date,
    activityDate: date,
    kgCo2e: decimal(kg),
    factorId: "factor",
    scope: "scope_1",
    scope3Category: null,
    scope2Method: null,
    scope2MarketBasis: null,
    gwpSet: "AR5",
    biogenic: false,
    outsideOfScopes: false,
    engineVersion: "test",
  };
}

describe("dashboard reporting windows", () => {
  it("rolls January into the previous December and excludes the current month", () => {
    expect(dashboardWindows("2026-01-01")).toEqual({
      primary: {
        startMonth: "2025-01",
        endMonth: "2025-12",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      },
      comparison: {
        startMonth: "2024-01",
        endMonth: "2024-12",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      },
    });
  });

  it("uses the real final day of leap-year February", () => {
    const windows = dashboardWindows("2024-03-31");
    expect(windows.primary.endDate).toBe("2024-02-29");
    expect(windows.primary.startDate).toBe("2023-03-01");
  });
});

describe("emissions trend", () => {
  it("keeps a missing month distinct from a present zero month", () => {
    const window = dashboardWindows("2026-01-15").primary;
    const trend = emissionsTrend(
      [emission("2025-02-12", "0"), emission("2026-01-01", "999")],
      window,
    );
    expect(trend).toHaveLength(12);
    expect(trend[0]).toMatchObject({ month: "2025-01", totals: null });
    expect(str(trendTotal(trend[1])!)).toBe("0");
    expect(trend.some((month) => month.month === "2026-01")).toBe(false);
  });

  it("preserves all-missing, all-zero, one-month and very-large series honestly", () => {
    const window = dashboardWindows("2026-01-15").primary;
    expect(
      emissionsTrend([], window).every((month) => month.totals === null),
    ).toBe(true);

    const zeroSeries = emissionsTrend(
      Array.from({ length: 12 }, (_, offset) => {
        const month = String(offset + 1).padStart(2, "0");
        return emission(`2025-${month}-01`, "0");
      }),
      window,
    );
    expect(zeroSeries.every((month) => month.totals !== null)).toBe(true);
    expect(zeroSeries.every((month) => str(trendTotal(month)!) === "0")).toBe(
      true,
    );

    const oneMonth = emissionsTrend(
      [emission("2025-07-01", "900719925474099300000000.001")],
      window,
    );
    expect(oneMonth.filter((month) => month.totals !== null)).toHaveLength(1);
    expect(str(trendTotal(oneMonth[6])!)).toBe("900719925474099300000000.001");
  });
});

describe("recorded energy", () => {
  const windows = dashboardWindows("2026-01-10");
  const row = (over: Partial<EnergyInput>): EnergyInput => ({
    activityDate: "2025-06-01",
    category: "electricity",
    unit: "MWh",
    quantity: "1",
    ...over,
  });

  it("converts kWh and MWh exactly and excludes other categories and units", () => {
    const result = recordedEnergy(
      [
        row({ quantity: "1.250" }),
        row({ unit: "kWh", quantity: "750" }),
        row({ category: "fuel", unit: "kWh", quantity: "9000" }),
        row({ category: "heat", unit: "L", quantity: "9000" }),
        row({ activityDate: "2024-06-01", quantity: "1" }),
      ],
      windows,
      1,
      "half-even",
    );
    expect(str(result.currentMWh)).toBe("2.000");
    expect(str(result.comparisonMWh)).toBe("1");
    expect(result.currentReadings).toBe(2);
    expect(result.change.ok && str(result.change.percent)).toBe("100.0");
  });

  it("returns positive, negative and zero changes", () => {
    const compare = (current: string) =>
      recordedEnergy(
        [
          row({ quantity: current }),
          row({ activityDate: "2024-06-01", quantity: "10" }),
        ],
        windows,
        1,
        "half-even",
      );
    const positive = compare("15");
    const negative = compare("5");
    const zero = compare("10");
    expect(positive.change.ok && str(positive.change.percent)).toBe("50.0");
    expect(negative.change.ok && str(negative.change.percent)).toBe("-50.0");
    expect(zero.change.ok && str(zero.change.percent)).toBe("0.0");
  });

  it("returns each unavailable reason, including a zero denominator", () => {
    const noCurrent = recordedEnergy(
      [row({ activityDate: "2024-06-01" })],
      windows,
      1,
      "half-even",
    );
    const noPrevious = recordedEnergy([row({})], windows, 1, "half-even");
    const zeroPrevious = recordedEnergy(
      [row({}), row({ activityDate: "2024-06-01", quantity: "0" })],
      windows,
      1,
      "half-even",
    );
    expect(!noCurrent.change.ok && noCurrent.change.refusal).toBe(
      "no_current_readings",
    );
    expect(!noPrevious.change.ok && noPrevious.change.refusal).toBe(
      "no_comparison_readings",
    );
    expect(!zeroPrevious.change.ok && zeroPrevious.change.refusal).toBe(
      "zero_comparison",
    );
  });

  it("refuses rather than throws on a stored quantity that will not parse", () => {
    const result = recordedEnergy(
      [row({ quantity: "not-a-number" })],
      windows,
      1,
      "half-even",
    );
    expect(!result.change.ok && result.change.refusal).toBe(
      "unreadable_quantity",
    );
    expect(str(result.currentMWh)).toBe("0");
  });

  it("does not coerce arithmetic inputs through Number", () => {
    const result = recordedEnergy(
      [
        row({ quantity: "9007199254740993.001" }),
        row({ activityDate: "2024-06-01", quantity: "9007199254740993.000" }),
      ],
      windows,
      3,
      "half-even",
    );
    expect(str(result.currentMWh)).toBe("9007199254740993.001");
    expect(result.change.ok && str(result.change.percent)).toBe("0.000");
  });
});

describe("dashboard target and action priority", () => {
  const target = (over: Partial<DashboardTarget>): DashboardTarget => ({
    id: "b",
    status: "active",
    targetYear: 2030,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });

  it("orders active future targets by year, newest creation and stable id", () => {
    const selected = selectDashboardTarget(
      [
        target({ id: "retired", status: "retired", targetYear: 2027 }),
        target({ id: "elapsed", targetYear: 2025 }),
        target({ id: "late", targetYear: 2035 }),
        target({
          id: "c",
          targetYear: 2028,
          createdAt: new Date("2026-02-01T00:00:00Z"),
        }),
        target({
          id: "a",
          targetYear: 2028,
          createdAt: new Date("2026-02-01T00:00:00Z"),
        }),
      ],
      "2026-08-10",
    );
    expect(selected?.id).toBe("a");
    expect(
      selectDashboardTarget([target({ targetYear: 2025 })], "2026-01-01"),
    ).toBeNull();
  });

  it("emits issues in deterministic priority and otherwise the evidence action", () => {
    expect(
      dashboardActions({
        activityRecords: 0,
        uncalculatedRecords: 2,
        hasTarget: false,
        targetOffTrack: false,
      }).map((action) => action.key),
    ).toEqual(["import_activity", "review_calculations", "set_target"]);
    expect(
      dashboardActions({
        activityRecords: 1,
        uncalculatedRecords: 0,
        hasTarget: true,
        targetOffTrack: true,
      })[0].key,
    ).toBe("review_target");
    expect(
      dashboardActions({
        activityRecords: 1,
        uncalculatedRecords: 0,
        hasTarget: true,
        targetOffTrack: false,
      })[0].key,
    ).toBe("review_evidence");
  });
});

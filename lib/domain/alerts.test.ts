import { describe, expect, it } from "vitest";

import {
  ALERT_THRESHOLD_PERCENT,
  evaluateAlerts,
  type AlertTargetInput,
} from "./alerts";
import { decimal, toDecimalString } from "./decimal";
import type { RecordEmission } from "./emissions";

/**
 * The alert evaluator's behaviour — build step 14.
 *
 * Every case here is arithmetic over fixed inputs with the clock supplied as a
 * parameter, which is what `lib/domain/` being pure buys: no database, no
 * browser, no mock (AGENTS.md §2's note on what `npm test` is scoped to).
 */

const str = toDecimalString;

/** One month of emissions, all in scope 1 so `scope_1` coverage sees them. */
function months(
  fromYear: number,
  fromMonth: number,
  count: number,
  kg: string,
): RecordEmission[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = fromYear * 12 + (fromMonth - 1) + offset;
    const year = Math.floor(index / 12);
    const month = String((index % 12) + 1).padStart(2, "0");
    return {
      recordId: `r-${index}`,
      activityDate: `${year}-${month}-15`,
      kgCo2e: decimal(kg),
      factorId: "f",
      scope: "scope_1" as const,
      scope3Category: null,
      scope2Method: null,
      scope2MarketBasis: null,
      gwpSet: "AR5" as const,
      biogenic: false,
      outsideOfScopes: false,
      engineVersion: "test",
    };
  });
}

function target(over: Partial<AlertTargetInput> = {}): AlertTargetInput {
  return {
    id: "t-1",
    name: "Operational 2030",
    coverage: "scope_1",
    targetYear: 2030,
    /* 1,200,000 kg baseline, 50% reduction — a target figure of 600,000 kg. */
    baselineKgCo2e: decimal("1200000"),
    reductionPercent: decimal("50"),
    status: "active",
    ...over,
  };
}

const ASOF = "2026-08-11";

describe("the threshold", () => {
  it("is ten per cent, and is a judgement rather than a measurement", () => {
    expect(str(ALERT_THRESHOLD_PERCENT)).toBe("10");
  });
});

describe("crossings", () => {
  it("raises on a trend basis, carrying the figures that produced it", () => {
    /* 24 complete months, the later 12 higher than the earlier 12, so the
       projection carries an upward trend and lands well past 600,000 kg. */
    const emissions = [
      ...months(2024, 8, 12, "50000"),
      ...months(2025, 8, 12, "70000"),
    ];

    const { raise, resolve } = evaluateAlerts({
      targets: [target()],
      emissions,
      openAlerts: [],
      asOf: ASOF,
    });

    expect(resolve).toEqual([]);
    expect(raise).toHaveLength(1);
    expect(raise[0].targetId).toBe("t-1");
    expect(raise[0].basis).toBe("trend");
    expect(raise[0].completeMonths).toBe(24);
    expect(raise[0].windowEnd).toBe("2026-07");
    /* `targetFigure` is exact and never rounds, so the figure keeps the scale
       its inputs carried — two places, not none. */
    expect(str(raise[0].targetKgCo2e)).toBe("600000.00");
    expect(str(raise[0].thresholdPercent)).toBe("10");
    /* The reading is signed and positive — the projection sits above the
       target, which is the only sign that raises. */
    expect(raise[0].readingPercent.units > 0n).toBe(true);
  });

  it("raises on a flat basis, and says the basis is flat", () => {
    /* Exactly 12 complete months: no second window, so no trend is claimed. */
    const emissions = months(2025, 8, 12, "70000");

    const { raise } = evaluateAlerts({
      targets: [target()],
      emissions,
      openAlerts: [],
      asOf: ASOF,
    });

    expect(raise).toHaveLength(1);
    expect(raise[0].basis).toBe("flat");
    expect(raise[0].completeMonths).toBe(12);
    /* 840,000 projected against 600,000 target — exactly 40% over. */
    expect(str(raise[0].projectedKgCo2e)).toBe("840000.000");
    expect(str(raise[0].readingPercent)).toBe("40.0");
  });

  it("does not raise at exactly the threshold — the comparison is strict", () => {
    /* 55,000 × 12 = 660,000 flat, against a 600,000 target: exactly +10.0%. */
    const emissions = months(2025, 8, 12, "55000");

    const { raise, resolve } = evaluateAlerts({
      targets: [target()],
      emissions,
      openAlerts: [],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
    expect(resolve).toEqual([]);
  });

  it("never raises on a negative reading — ahead of target is not a crossing", () => {
    const emissions = months(2025, 8, 12, "40000");

    const { raise } = evaluateAlerts({
      targets: [target()],
      emissions,
      openAlerts: [],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
  });

  it("raises nothing for a target that already has an alert open", () => {
    const emissions = months(2025, 8, 12, "70000");

    const { raise, resolve } = evaluateAlerts({
      targets: [target()],
      emissions,
      openAlerts: [{ id: "a-1", targetId: "t-1" }],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
    expect(resolve).toEqual([]);
  });
});

describe("refusals produce no alert, never a zero and never an alert", () => {
  it("refuses on fewer than 12 complete months", () => {
    const { raise, resolve } = evaluateAlerts({
      targets: [target()],
      emissions: months(2026, 1, 4, "500000"),
      openAlerts: [],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
    expect(resolve).toEqual([]);
  });

  it("refuses once the target year has elapsed", () => {
    const { raise } = evaluateAlerts({
      targets: [target({ targetYear: 2025 })],
      emissions: months(2025, 8, 12, "70000"),
      openAlerts: [],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
  });

  it("refuses against a zero target figure", () => {
    const { raise } = evaluateAlerts({
      targets: [target({ reductionPercent: decimal("100") })],
      emissions: months(2025, 8, 12, "70000"),
      openAlerts: [],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
  });

  it("leaves an open alert open when the reading can no longer be computed", () => {
    /* A refusal is not a resolution: resolving here would assert that the gap
       closed, and nothing knows that. */
    const { raise, resolve } = evaluateAlerts({
      targets: [target()],
      emissions: months(2026, 1, 4, "500000"),
      openAlerts: [{ id: "a-1", targetId: "t-1" }],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
    expect(resolve).toEqual([]);
  });
});

describe("targets that are not active", () => {
  it("does not evaluate a retired target, and leaves its alert open", () => {
    const { raise, resolve } = evaluateAlerts({
      targets: [target({ status: "retired" })],
      emissions: months(2025, 8, 12, "70000"),
      openAlerts: [{ id: "a-1", targetId: "t-1" }],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
    expect(resolve).toEqual([]);
  });
});

describe("resolution", () => {
  it("resolves an open alert when the reading falls back to at-or-below", () => {
    const { raise, resolve } = evaluateAlerts({
      targets: [target()],
      emissions: months(2025, 8, 12, "40000"),
      openAlerts: [{ id: "a-1", targetId: "t-1" }],
      asOf: ASOF,
    });

    expect(raise).toEqual([]);
    expect(resolve).toEqual(["a-1"]);
  });

  it("resolves at exactly the threshold, since a crossing is strictly past it", () => {
    const { resolve } = evaluateAlerts({
      targets: [target()],
      emissions: months(2025, 8, 12, "55000"),
      openAlerts: [{ id: "a-1", targetId: "t-1" }],
      asOf: ASOF,
    });

    expect(resolve).toEqual(["a-1"]);
  });
});

describe("several targets in one organisation", () => {
  it("raises, resolves and refuses independently within one evaluation", () => {
    const emissions = months(2025, 8, 12, "70000");

    const { raise, resolve } = evaluateAlerts({
      targets: [
        /* Over its target: raises. */
        target({ id: "t-over" }),
        /* A far looser target the same emissions sit under: resolves. */
        target({ id: "t-under", reductionPercent: decimal("1") }),
        /* Elapsed: refuses, and its open alert stays open. */
        target({ id: "t-elapsed", targetYear: 2025 }),
      ],
      emissions,
      openAlerts: [
        { id: "a-under", targetId: "t-under" },
        { id: "a-elapsed", targetId: "t-elapsed" },
      ],
      asOf: ASOF,
    });

    expect(raise.map((alert) => alert.targetId)).toEqual(["t-over"]);
    expect(resolve).toEqual(["a-under"]);
  });
});

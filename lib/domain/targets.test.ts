import { describe, expect, it } from "vitest";

import { decimal, toDecimalString } from "./decimal";
import { totalsOf, type RecordEmission } from "./emissions";
import {
  projectTargetYear,
  readingAgainstTarget,
  targetFigure,
  totalsForCoverage,
  trajectory,
} from "./targets";
import { createTargetSchema } from "../validation/targets";

const str = toDecimalString;

describe("target input boundary", () => {
  const valid = {
    name: "Operational 2030",
    coverage: "scope_1_2" as const,
    baseYear: 2024,
    targetYear: 2030,
    reductionPercent: "42.500",
    baseline: "123456.789",
    baselineSource: "stated" as const,
  };

  it("accepts the bounded decimal strings without coercing them to Number", () => {
    const result = createTargetSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reductionPercent).toBe("42.500");
      expect(result.data.baseline).toBe("123456.789");
    }
  });

  it("requires the target year to be strictly later", () => {
    const result = createTargetSchema.safeParse({
      ...valid,
      targetYear: valid.baseYear,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["targetYear"]);
    }
  });

  it("rejects zero, excess decimal places and an oversized baseline", () => {
    expect(
      createTargetSchema.safeParse({ ...valid, reductionPercent: "0.000" })
        .success,
    ).toBe(false);
    expect(
      createTargetSchema.safeParse({ ...valid, reductionPercent: "10.0001" })
        .success,
    ).toBe(false);
    expect(
      createTargetSchema.safeParse({ ...valid, baseline: "1000000000000.000" })
        .success,
    ).toBe(false);
  });
});

function monthly(
  fromYear: number,
  fromMonth: number,
  count: number,
  kg: string,
) {
  return Array.from({ length: count }, (_, offset) => {
    const index = fromYear * 12 + (fromMonth - 1) + offset;
    return {
      month: `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`,
      kgCo2e: decimal(kg),
    };
  });
}

describe("target coverage", () => {
  const emission = (over: Partial<RecordEmission>): RecordEmission => ({
    recordId: "r",
    activityDate: "2025-01-01",
    kgCo2e: decimal("10"),
    factorId: "f",
    scope: "scope_1",
    scope3Category: null,
    scope2Method: null,
    gwpSet: "AR5",
    biogenic: false,
    outsideOfScopes: false,
    engineVersion: "test",
    ...over,
  });

  it("sums only the scopes named by the coverage", () => {
    const totals = totalsOf([
      emission({ scope: "scope_1", kgCo2e: decimal("10") }),
      emission({ scope: "scope_2", kgCo2e: decimal("20") }),
      emission({ scope: "scope_3", kgCo2e: decimal("30") }),
      emission({ scope: "scope_1", kgCo2e: decimal("40"), biogenic: true }),
      emission({
        scope: "outside_of_scopes",
        kgCo2e: decimal("50"),
        outsideOfScopes: true,
      }),
    ]);

    expect(str(totalsForCoverage(totals, "scope_1_2"))).toBe("30");
    expect(str(totalsForCoverage(totals, "scope_1_2_3"))).toBe("60");
  });
});

describe("target figure and trajectory", () => {
  it("computes the filed target exactly by a scale shift", () => {
    expect(str(targetFigure(decimal("100000"), decimal("20")))).toBe(
      "80000.00",
    );
  });

  it("produces one rounded allowance per year, inclusive", () => {
    const result = trajectory({
      baseYear: 2024,
      baselineKgCo2e: decimal("100000"),
      targetYear: 2028,
      targetKgCo2e: decimal("80000"),
      scale: 3,
      mode: "half-even",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points.map((point) => [point.year, str(point.allowanceKgCo2e)])).toEqual([
      [2024, "100000.000"],
      [2025, "95000.000"],
      [2026, "90000.000"],
      [2027, "85000.000"],
      [2028, "80000.000"],
    ]);
  });

  it("refuses a zero or negative span", () => {
    const result = trajectory({
      baseYear: 2028,
      baselineKgCo2e: decimal("1"),
      targetYear: 2028,
      targetKgCo2e: decimal("0"),
      scale: 3,
      mode: "half-even",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("invalid_span");
  });
});

describe("run-rate projection", () => {
  it("matches the worked two-window example", () => {
    const result = projectTargetYear({
      monthly: [
        ...monthly(2024, 1, 12, "10000"),
        ...monthly(2025, 1, 12, "9000"),
      ],
      asOf: "2026-01-15",
      targetYear: 2028,
      scale: 3,
      mode: "half-even",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.basis).toBe("trend");
    expect(str(result.projection.previous12KgCo2e!)).toBe("120000");
    expect(str(result.projection.latest12KgCo2e)).toBe("108000");
    expect(result.projection.monthsAhead).toBe(36);
    expect(str(result.projection.kgCo2e)).toBe("72000.000");

    const reading = readingAgainstTarget(
      result.projection.kgCo2e,
      decimal("80000"),
      1,
      "half-even",
    );
    expect(reading.ok).toBe(true);
    if (reading.ok) expect(str(reading.percent)).toBe("-10.0");
  });

  it("carries 12 to 23 complete months flat and labels the basis", () => {
    const result = projectTargetYear({
      monthly: monthly(2025, 1, 12, "10"),
      asOf: "2026-01-02",
      targetYear: 2027,
      scale: 3,
      mode: "half-even",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projection.basis).toBe("flat");
    expect(result.projection.previous12KgCo2e).toBeNull();
    expect(str(result.projection.kgCo2e)).toBe("120.000");
  });

  it("refuses fewer than 12 complete months", () => {
    const result = projectTargetYear({
      monthly: monthly(2025, 2, 11, "10"),
      asOf: "2026-01-02",
      targetYear: 2027,
      scale: 3,
      mode: "half-even",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("insufficient_history");
  });

  it("refuses an elapsed target year even when history is absent", () => {
    const result = projectTargetYear({
      monthly: [],
      asOf: "2026-01-02",
      targetYear: 2025,
      scale: 3,
      mode: "half-even",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("target_year_elapsed");
  });
});

describe("reading against target", () => {
  it("keeps direction in the sign", () => {
    const behind = readingAgainstTarget(
      decimal("90000"),
      decimal("80000"),
      1,
      "half-even",
    );
    const ahead = readingAgainstTarget(
      decimal("72000"),
      decimal("80000"),
      1,
      "half-even",
    );
    expect(behind.ok && str(behind.percent)).toBe("12.5");
    expect(ahead.ok && str(ahead.percent)).toBe("-10.0");
  });

  it("refuses a zero target instead of returning infinity", () => {
    const result = readingAgainstTarget(
      decimal("1"),
      decimal("0"),
      1,
      "half-even",
    );
    expect(result.ok).toBe(false);
    expect("percent" in result).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("target_is_zero");
  });
});

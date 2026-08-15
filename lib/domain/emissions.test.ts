import { describe, expect, it } from "vitest";

import { decimal, toDecimalString } from "./decimal";
import { ACTIVITY_UNITS } from "../validation/activity";
import { FACTOR_ACTIVITY_UNITS } from "../validation/emissions";
import {
  ENGINE_VERSION,
  admissibleFactorUnits,
  aggregate,
  calculateRecordEmission,
  convertQuantity,
  factorEligibility,
  monthOf,
  toTonnes,
  totalsByPeriod,
  totalsOf,
  type ActivityInput,
  type FactorInput,
  type RecordEmission,
} from "./emissions";

/**
 * The engine's behaviour, written against the failures that would reach a
 * disclosure: an approximated unit conversion, a kWh factor summed as carbon,
 * a biogenic figure folded into scope 1, and a total presented without its
 * coverage.
 */

const factor = (over: Partial<FactorInput> = {}): FactorInput => ({
  id: "factor-1",
  scope: "scope_1",
  scope3Category: null,
  scope2Method: null,
  gas: "co2e",
  ch4Variant: null,
  gwpSet: "AR5",
  value: "2.5",
  activityUnit: "kwh",
  resultUnit: "kg_co2e",
  biogenic: false,
  ...over,
});

const record = (over: Partial<ActivityInput> = {}): ActivityInput => ({
  id: "record-1",
  activityDate: "2026-03-14",
  category: "electricity",
  unit: "kWh",
  quantity: "100.000000",
  ...over,
});

const kg = (result: ReturnType<typeof calculateRecordEmission>) => {
  expect(result.ok).toBe(true);
  return result.ok ? toDecimalString(result.emission.kgCo2e) : "";
};

describe("convertQuantity", () => {
  it("widens by an exact power of ten", () => {
    const result = convertQuantity(decimal("5"), "MWh", "kwh");
    expect(result.ok).toBe(true);
    if (result.ok) expect(toDecimalString(result.value)).toBe("5000");
  });

  it("narrows by a scale shift, keeping every digit", () => {
    const result = convertQuantity(decimal("5000"), "kg", "tonnes");
    expect(result.ok).toBe(true);
    if (result.ok) expect(toDecimalString(result.value)).toBe("5.000");
  });

  it("passes a matching unit through untouched", () => {
    const result = convertQuantity(decimal("1.5"), "kWh", "kwh_gross_cv");
    expect(result.ok).toBe(true);
    if (result.ok) expect(toDecimalString(result.value)).toBe("1.5");
  });

  it("refuses a cross-dimensional pair rather than converting", () => {
    const result = convertQuantity(decimal("100"), "km", "tonne_km");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/different quantities/i);
  });

  it("refuses a unit the activity model cannot measure", () => {
    // `miles` and `GJ` normalise to `unknown_unit`: neither is a power of ten
    // from anything recorded, and approximating 1.609 would fabricate a number.
    const result = convertQuantity(decimal("100"), "km", "unknown_unit");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot measure/i);
  });

  it("never returns a value alongside a refusal", () => {
    const result = convertQuantity(decimal("1"), "kWh", "kg");
    expect(result.ok).toBe(false);
    expect("value" in result).toBe(false);
  });
});

describe("calculateRecordEmission", () => {
  it("multiplies quantity by factor, exactly and unrounded", () => {
    expect(kg(calculateRecordEmission(record(), factor()))).toBe("250.0000000");
  });

  it("converts the quantity into the factor's own denominator first", () => {
    // 2 MWh against a per-kWh factor is 2000 kWh, not 2.
    expect(
      kg(calculateRecordEmission(record({ unit: "MWh", quantity: "2" }), factor())),
    ).toBe("5000.0");
  });

  it("applies a GWP when the factor states a gas, and not when it is CO2e", () => {
    const asCo2e = kg(calculateRecordEmission(record(), factor()));
    const asMethane = kg(
      calculateRecordEmission(
        record(),
        factor({ gas: "ch4", ch4Variant: "combustion" }),
      ),
    );
    expect(asCo2e).toBe("250.0000000");
    // The same product, times AR5's combustion methane GWP of 28.
    expect(asMethane).toBe("7000.0000000");
  });

  it("refuses a factor that produces kWh rather than emissions", () => {
    const result = calculateRecordEmission(record(), factor({ resultUnit: "kwh" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toBe("factor_is_not_an_emission");
      expect(result.reason).toMatch(/kWh/);
    }
  });

  it("refuses a gas it cannot price rather than defaulting the GWP", () => {
    const result = calculateRecordEmission(
      record(),
      factor({ gas: "ch4", ch4Variant: "fugitive", gwpSet: "AR4" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("gas_not_priceable");
  });

  it("refuses an unreadable quantity or factor", () => {
    expect(
      calculateRecordEmission(record({ quantity: "" }), factor()).ok,
    ).toBe(false);
    expect(
      calculateRecordEmission(record(), factor({ value: "n/a" })).ok,
    ).toBe(false);
  });

  it("stamps the provenance a filed figure has to be re-derivable from", () => {
    const result = calculateRecordEmission(record(), factor({ id: "f-42" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emission.factorId).toBe("f-42");
    expect(result.emission.gwpSet).toBe("AR5");
    expect(result.emission.engineVersion).toBe(ENGINE_VERSION);
  });

  it("marks an outside-of-scopes factor on the computed row", () => {
    const result = calculateRecordEmission(
      record(),
      factor({ scope: "outside_of_scopes" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emission.outsideOfScopes).toBe(true);
  });
});

describe("factorEligibility", () => {
  /* The rule the mapping surface offers factors under. It has to agree with
     `calculateRecordEmission` exactly, or an owner can choose a row that
     "fixes" a gap and changes nothing but the refusal reason. */

  it("admits a factor whose denominator converts from the pair's unit", () => {
    expect(factorEligibility(factor({ activityUnit: "kwh" }), "MWh").ok).toBe(
      true,
    );
  });

  it("admits a matching denominator unchanged", () => {
    expect(
      factorEligibility(factor({ activityUnit: "tonnes" }), "kg").ok,
    ).toBe(true);
  });

  it("refuses a cross-dimensional pair", () => {
    // `km` measures distance and `tonne.km` measures freight — a different
    // physical quantity, not a unit mismatch to paper over.
    const result = factorEligibility(factor({ activityUnit: "tonne_km" }), "km");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toBe("unit_mismatch");
      expect(result.reason).toMatch(/different quantities/i);
    }
  });

  it("refuses a factor that produces kWh rather than emissions", () => {
    const result = factorEligibility(
      factor({ activityUnit: "km", resultUnit: "kwh" }),
      "km",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("factor_is_not_an_emission");
  });

  it("refuses a denominator the activity model cannot measure", () => {
    const result = factorEligibility(
      factor({ activityUnit: "unknown_unit" }),
      "km",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("unit_mismatch");
  });

  it("agrees with the engine on every unit pair it admits", () => {
    /* The property that matters: a factor this predicate offers must never be
       one `calculateRecordEmission` then refuses for a unit reason. Checked
       across the whole cross product rather than on a sampled pair. */
    for (const unit of ACTIVITY_UNITS) {
      for (const activityUnit of FACTOR_ACTIVITY_UNITS) {
        const eligible = factorEligibility({ activityUnit, resultUnit: "kg_co2e" }, unit);
        const computed = calculateRecordEmission(
          record({ unit, quantity: "1.000000" }),
          factor({ activityUnit }),
        );
        expect(computed.ok).toBe(eligible.ok);
      }
    }
  });
});

describe("admissibleFactorUnits", () => {
  it("lists exactly the denominators the predicate admits", () => {
    for (const unit of ACTIVITY_UNITS) {
      const admissible = admissibleFactorUnits(unit);
      for (const activityUnit of FACTOR_ACTIVITY_UNITS) {
        expect(admissible.includes(activityUnit)).toBe(
          factorEligibility({ activityUnit, resultUnit: "kg_co2e" }, unit).ok,
        );
      }
    }
  });

  it("never offers the unmeasurable denominator for any unit", () => {
    for (const unit of ACTIVITY_UNITS) {
      expect(admissibleFactorUnits(unit)).not.toContain("unknown_unit");
    }
  });
});

describe("totalsOf", () => {
  const emission = (over: Partial<RecordEmission>): RecordEmission => ({
    recordId: "r",
    activityDate: "2026-01-01",
    kgCo2e: decimal("100"),
    factorId: "f",
    scope: "scope_1",
    scope3Category: null,
    scope2Method: null,
    gwpSet: "AR5",
    biogenic: false,
    outsideOfScopes: false,
    engineVersion: ENGINE_VERSION,
    ...over,
  });

  it("splits by scope and totals only scopes 1 to 3", () => {
    const totals = totalsOf([
      emission({ scope: "scope_1" }),
      emission({ scope: "scope_2", scope2Method: "location_based" }),
      emission({ scope: "scope_3", scope3Category: "c6_business_travel" }),
    ]);
    expect(toDecimalString(totals.scope1)).toBe("100");
    expect(toDecimalString(totals.scope2)).toBe("100");
    expect(toDecimalString(totals.scope3)).toBe("100");
    expect(toDecimalString(totals.total)).toBe("300");
  });

  it("keeps outside-of-scopes out of every scope and out of the total", () => {
    const totals = totalsOf([
      emission({ scope: "scope_1" }),
      emission({ scope: "outside_of_scopes", outsideOfScopes: true }),
    ]);
    expect(toDecimalString(totals.total)).toBe("100");
    expect(toDecimalString(totals.scope1)).toBe("100");
    expect(toDecimalString(totals.outsideOfScopes)).toBe("100");
  });

  it("keeps biogenic out of every scope and out of the total", () => {
    const totals = totalsOf([
      emission({ scope: "scope_1" }),
      emission({ scope: "scope_1", biogenic: true }),
    ]);
    expect(toDecimalString(totals.total)).toBe("100");
    expect(toDecimalString(totals.scope1)).toBe("100");
    expect(toDecimalString(totals.biogenic)).toBe("100");
  });

  it("groups scope 3 by category", () => {
    const totals = totalsOf([
      emission({ scope: "scope_3", scope3Category: "c6_business_travel" }),
      emission({ scope: "scope_3", scope3Category: "c6_business_travel" }),
      emission({
        scope: "scope_3",
        scope3Category: "c5_waste_generated_in_operations",
      }),
    ]);
    expect(totals.byScope3Category).toHaveLength(2);
    const travel = totals.byScope3Category.find(
      (entry) => entry.category === "c6_business_travel",
    );
    expect(toDecimalString(travel!.kgCo2e)).toBe("200");
  });

  it("reports every scope 2 method present, so the label cannot be assumed", () => {
    const totals = totalsOf([
      emission({ scope: "scope_2", scope2Method: "location_based" }),
    ]);
    expect(totals.scope2Methods).toEqual(["location_based"]);
  });

  it("totals nothing as zero", () => {
    const totals = totalsOf([]);
    expect(toDecimalString(totals.total)).toBe("0");
  });

  /* Prompt 85 — dual reporting. The failure each of these guards against is a
     market-based figure reaching a total that is filed as location-based, or a
     record being counted twice because it carries two figures. */
  describe("market-based scope 2", () => {
    const dual = () => [
      emission({ scope: "scope_1", kgCo2e: decimal("40") }),
      emission({
        scope: "scope_2",
        scope2Method: "location_based",
        kgCo2e: decimal("100"),
      }),
      emission({
        scope: "scope_2",
        scope2Method: "market_based",
        kgCo2e: decimal("25"),
      }),
      emission({
        scope: "scope_3",
        scope3Category: "c6_business_travel",
        kgCo2e: decimal("10"),
      }),
    ];

    it("keeps the market-based figure out of scope 2 and out of the total", () => {
      const totals = totalsOf(dual());
      expect(toDecimalString(totals.scope2)).toBe("100");
      expect(toDecimalString(totals.total)).toBe("150");
      expect(toDecimalString(totals.scope2MarketBased)).toBe("25");
    });

    it("reads the same inventory on the market lane", () => {
      const totals = totalsOf(dual());
      expect(toDecimalString(totals.totalMarketBased)).toBe("75");
    });

    it("holds two genuinely independent figures", () => {
      const totals = totalsOf(dual());
      expect(toDecimalString(totals.scope2)).not.toBe(
        toDecimalString(totals.scope2MarketBased),
      );
    });

    it("counts one record per lane rather than one record twice", () => {
      const totals = totalsOf(dual());
      expect(totals.scope2Records).toBe(1);
      expect(totals.scope2MarketBasedRecords).toBe(1);
    });

    it("reports both methods so neither figure can be labelled by assumption", () => {
      expect(totalsOf(dual()).scope2Methods).toEqual([
        "location_based",
        "market_based",
      ]);
    });

    it("produces no market-based figure where no contractual rate is mapped", () => {
      const totals = totalsOf([
        emission({
          scope: "scope_2",
          scope2Method: "location_based",
          kgCo2e: decimal("100"),
        }),
      ]);
      expect(toDecimalString(totals.scope2MarketBased)).toBe("0");
      expect(totals.scope2MarketBasedRecords).toBe(0);
      /* And the location-based figure is not quietly reused as one: the two
         totals differ, so a reader cannot mistake the market lane for
         complete. */
      expect(toDecimalString(totals.totalMarketBased)).toBe("0");
      expect(toDecimalString(totals.total)).toBe("100");
    });

    it("keeps the market lane out of the scope 3 category split", () => {
      const totals = totalsOf(dual());
      expect(totals.byScope3Category).toHaveLength(1);
      expect(toDecimalString(totals.byScope3Category[0]!.kgCo2e)).toBe("10");
    });

    it("carries both lanes through a period grouping", () => {
      const periods = totalsByPeriod(dual(), monthOf);
      expect(periods).toHaveLength(1);
      expect(toDecimalString(periods[0]!.totals.total)).toBe("150");
      expect(toDecimalString(periods[0]!.totals.scope2MarketBased)).toBe("25");
    });
  });
});

describe("aggregate", () => {
  it("reports unmatched pairs and keeps them out of the total", () => {
    const records = [
      record({ id: "a", category: "electricity", unit: "kWh" }),
      record({ id: "b", category: "waste", unit: "t" }),
      record({ id: "c", category: "waste", unit: "t" }),
    ];
    const result = aggregate(records, (r) =>
      r.category === "electricity"
        ? { ok: true, factor: factor() }
        : { ok: false, gap: "no_mapping" },
    );

    expect(result.coverage.totalRecords).toBe(3);
    expect(result.coverage.matchedRecords).toBe(1);
    expect(result.coverage.unmatchedRecords).toBe(2);
    expect(result.coverage.unmatchedPairs).toEqual([
      { category: "waste", unit: "t", recordCount: 2 },
    ]);
    expect(toDecimalString(result.totals.total)).toBe("250.0000000");
  });

  it("counts a refused factor as unmatched, grouped by reason", () => {
    const result = aggregate(
      [record({ id: "a" }), record({ id: "b" })],
      () => ({ ok: true, factor: factor({ resultUnit: "kwh" }) }),
    );
    expect(result.coverage.matchedRecords).toBe(0);
    expect(result.coverage.unmatchedRecords).toBe(2);
    expect(result.coverage.refusals).toEqual([
      {
        refusal: "factor_is_not_an_emission",
        reason: expect.any(String),
        recordCount: 2,
      },
    ]);
  });

  it("sorts unmatched pairs by record count, descending and stably", () => {
    const records = [
      record({ id: "1", category: "waste", unit: "t" }),
      record({ id: "2", category: "travel", unit: "km" }),
      record({ id: "3", category: "travel", unit: "km" }),
    ];
    const result = aggregate(records, () => ({
      ok: false,
      gap: "no_mapping",
    }));
    expect(result.coverage.unmatchedPairs.map((p) => p.category)).toEqual([
      "travel",
      "waste",
    ]);
  });

  it("never reports a total without its coverage", () => {
    const result = aggregate([record()], () => ({
      ok: false,
      gap: "no_mapping",
    }));
    expect(result).toHaveProperty("totals");
    expect(result).toHaveProperty("coverage");
    // Nothing matched, so the total is zero and the coverage says why — the
    // two must not be readable apart.
    expect(toDecimalString(result.totals.total)).toBe("0");
    expect(result.coverage.matchedRecords).toBe(0);
  });

  it("sums the unrounded records, not rounded ones", () => {
    // Three records that each round to zero at one decimal place but together
    // carry a tenth of a kilogram.
    const records = ["0.04", "0.04", "0.04"].map((quantity, i) =>
      record({ id: `r${i}`, quantity }),
    );
    const result = aggregate(records, () => ({
      ok: true,
      factor: factor({ value: "1" }),
    }));
    expect(toDecimalString(result.totals.total)).toBe("0.12");
  });
});

/**
 * Prompt 68. The failure these are written against is a 2025 record silently
 * costed at the 2026 factor — a wrong number in a disclosure rather than a
 * missing one.
 */
describe("aggregate, out of period", () => {
  const outOfPeriod = (): ReturnType<typeof aggregate> =>
    aggregate(
      [
        record({ id: "a", activityDate: "2025-06-01" }),
        record({ id: "b", activityDate: "2025-11-30" }),
        record({ id: "c", activityDate: "2024-02-02" }),
        record({ id: "d", activityDate: "2026-03-14" }),
      ],
      (r) =>
        r.activityDate.startsWith("2026")
          ? { ok: true, factor: factor() }
          : { ok: false, gap: "out_of_period" },
    );

  it("keeps an out-of-period record out of the total entirely", () => {
    const result = outOfPeriod();
    expect(result.coverage.matchedRecords).toBe(1);
    expect(result.coverage.unmatchedRecords).toBe(3);
    // One record at 100 kWh x 2.5, and nothing from the other three.
    expect(toDecimalString(result.totals.total)).toBe("250.0000000");
  });

  it("reports the year, because loading that year's set is the fix", () => {
    expect(outOfPeriod().coverage.outOfPeriodYears).toEqual([
      { year: "2025", recordCount: 2 },
      { year: "2024", recordCount: 1 },
    ]);
  });

  it("never counts an out-of-period record as an unmapped pair", () => {
    // `listFactorCoverage` mirrors `unmatchedPairs` in SQL and answers "is
    // there a mapping". A mapped record must not appear in it.
    expect(outOfPeriod().coverage.unmatchedPairs).toEqual([]);
  });

  it("still balances: matched plus unmatched is every record", () => {
    const result = aggregate(
      [
        record({ id: "a", activityDate: "2025-01-01" }),
        record({ id: "b", category: "waste", unit: "t" }),
        record({ id: "c" }),
        record({ id: "d", quantity: "nonsense" }),
      ],
      (r) => {
        if (r.category === "waste") return { ok: false, gap: "no_mapping" };
        if (r.activityDate.startsWith("2025")) {
          return { ok: false, gap: "out_of_period" };
        }
        return { ok: true, factor: factor() };
      },
    );
    expect(result.coverage.totalRecords).toBe(4);
    expect(result.coverage.matchedRecords).toBe(1);
    expect(result.coverage.unmatchedRecords).toBe(3);
    expect(result.coverage.unmatchedPairs).toHaveLength(1);
    expect(result.coverage.outOfPeriodYears).toHaveLength(1);
    expect(result.coverage.refusals).toHaveLength(1);
  });

  it("sorts years by record count, then by the year, stably", () => {
    const result = aggregate(
      [
        record({ id: "1", activityDate: "2024-05-05" }),
        record({ id: "2", activityDate: "2023-05-05" }),
        record({ id: "3", activityDate: "2023-06-06" }),
      ],
      () => ({ ok: false, gap: "out_of_period" }),
    );
    expect(result.coverage.outOfPeriodYears.map((y) => y.year)).toEqual([
      "2023",
      "2024",
    ]);
  });
});

describe("periods", () => {
  it("groups by whatever the period function returns, and reads no clock", () => {
    const base: RecordEmission = {
      recordId: "r",
      activityDate: "2026-01-15",
      kgCo2e: decimal("10"),
      factorId: "f",
      scope: "scope_1",
      scope3Category: null,
      scope2Method: null,
      gwpSet: "AR5",
      biogenic: false,
      outsideOfScopes: false,
      engineVersion: ENGINE_VERSION,
    };
    const periods = totalsByPeriod(
      [base, { ...base, activityDate: "2026-02-02" }, base],
      monthOf,
    );
    expect(periods.map((p) => p.period)).toEqual(["2026-01", "2026-02"]);
    expect(toDecimalString(periods[0].totals.total)).toBe("20");
  });

  it("monthOf slices the date string rather than parsing a Date", () => {
    expect(monthOf("2026-03-14")).toBe("2026-03");
  });
});

describe("toTonnes", () => {
  it("shifts the scale rather than dividing, so nothing rounds", () => {
    expect(toDecimalString(toTonnes(decimal("1234.5")))).toBe("1.2345");
    expect(toDecimalString(toTonnes(decimal("1")))).toBe("0.001");
  });
});

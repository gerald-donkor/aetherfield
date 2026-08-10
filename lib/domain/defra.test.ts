import { describe, expect, it } from "vitest";

import {
  DEFAULT_FACTOR_MAPPINGS,
  normaliseDefraRow,
  type DefraRow,
} from "./defra";

/**
 * The reading of the publisher's file.
 *
 * The first test is the one that matters most: **every DEFRA value is already a
 * CO2 equivalent, including the per-gas rows**, and normalising one to its
 * named gas would multiply it by a GWP the publisher has already applied. That
 * is a 28-fold error on a methane row, and it would be invisible.
 */

const row = (over: Partial<DefraRow> = {}): DefraRow => ({
  id: "1_100_1000_15_1",
  scope: "Scope 1",
  level_1: "Fuels",
  level_2: "Gaseous fuels",
  level_3: "Butane",
  level_4: "",
  column_text: "",
  uom: "tonnes",
  ghg_unit: "kg CO2e",
  value: "3033.38067",
  ...over,
});

const ok = (result: ReturnType<typeof normaliseDefraRow>) => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.factor;
};

describe("the CO2e finding", () => {
  it("normalises every GHG/Unit spelling to the co2e gas", () => {
    for (const ghgUnit of [
      "kg CO2e",
      "kg CO2e of CO2 per unit",
      "kg CO2e of CH4 per unit",
      "kg CO2e of N2O per unit",
    ]) {
      expect(ok(normaliseDefraRow(row({ ghg_unit: ghgUnit }))).gas).toBe("co2e");
    }
  });

  it("keeps the publisher's own wording verbatim, so nothing is lost", () => {
    const factor = ok(
      normaliseDefraRow(row({ ghg_unit: "kg CO2e of CH4 per unit" })),
    );
    expect(factor.publishedGhgUnit).toBe("kg CO2e of CH4 per unit");
    expect(factor.gas).toBe("co2e");
  });
});

describe("scope and result unit", () => {
  it("maps the four scope labels", () => {
    expect(ok(normaliseDefraRow(row({ scope: "Scope 1" }))).scope).toBe("scope_1");
    expect(ok(normaliseDefraRow(row({ scope: "Scope 2" }))).scope).toBe("scope_2");
    expect(ok(normaliseDefraRow(row({ scope: "Scope 3" }))).scope).toBe("scope_3");
    expect(
      ok(normaliseDefraRow(row({ scope: "Outside of Scopes" }))).scope,
    ).toBe("outside_of_scopes");
  });

  it("marks the SECR kWh rows as producing energy, not emissions", () => {
    for (const ghgUnit of ["kWh (Net CV)", "kWh (net)"]) {
      expect(ok(normaliseDefraRow(row({ ghg_unit: ghgUnit }))).resultUnit).toBe(
        "kwh",
      );
    }
    expect(ok(normaliseDefraRow(row())).resultUnit).toBe("kg_co2e");
  });

  it("labels scope 2 rows location-based and leaves the rest null", () => {
    expect(
      ok(normaliseDefraRow(row({ scope: "Scope 2" }))).scope2Method,
    ).toBe("location_based");
    expect(ok(normaliseDefraRow(row())).scope2Method).toBeNull();
  });
});

describe("units of measure", () => {
  it("distinguishes Net CV from Gross CV, which are different factors", () => {
    expect(ok(normaliseDefraRow(row({ uom: "kWh (Net CV)" }))).activityUnit).toBe(
      "kwh_net_cv",
    );
    expect(
      ok(normaliseDefraRow(row({ uom: "kWh (Gross CV)" }))).activityUnit,
    ).toBe("kwh_gross_cv");
  });

  it("normalises the units the activity model cannot measure to unknown_unit", () => {
    for (const uom of [
      "miles",
      "GJ",
      "passenger.km",
      "Room per night",
      "per FTE Working Hour",
    ]) {
      expect(ok(normaliseDefraRow(row({ uom }))).activityUnit).toBe(
        "unknown_unit",
      );
    }
  });

  it("maps the convertible denominators", () => {
    expect(ok(normaliseDefraRow(row({ uom: "tonnes" }))).activityUnit).toBe("tonnes");
    expect(ok(normaliseDefraRow(row({ uom: "litres" }))).activityUnit).toBe("litres");
    expect(ok(normaliseDefraRow(row({ uom: "cubic metres" }))).activityUnit).toBe(
      "cubic_metres",
    );
    expect(ok(normaliseDefraRow(row({ uom: "tonne.km" }))).activityUnit).toBe(
      "tonne_km",
    );
  });
});

describe("GWP basis and biogenic", () => {
  it("puts the three AR4 families on AR4 and everything else on AR5", () => {
    for (const family of ["Bioenergy", "WTT- bioenergy", "Material use"]) {
      expect(ok(normaliseDefraRow(row({ level_1: family }))).gwpSet).toBe("AR4");
    }
    expect(ok(normaliseDefraRow(row({ level_1: "Fuels" }))).gwpSet).toBe("AR5");
    expect(
      ok(normaliseDefraRow(row({ level_1: "Refrigerant & other" }))).gwpSet,
    ).toBe("AR5");
  });

  it("flags the bioenergy families as biogenic", () => {
    expect(ok(normaliseDefraRow(row({ level_1: "Bioenergy" }))).biogenic).toBe(true);
    expect(ok(normaliseDefraRow(row({ level_1: "Fuels" }))).biogenic).toBe(false);
  });
});

describe("scope 3 categories", () => {
  it("assigns a category only on scope 3 rows", () => {
    expect(
      ok(
        normaliseDefraRow(
          row({ scope: "Scope 3", level_1: "Waste disposal" }),
        ),
      ).scope3Category,
    ).toBe("c5_waste_generated_in_operations");

    // The same family under scope 1 carries no scope 3 category.
    expect(
      ok(normaliseDefraRow(row({ scope: "Scope 1", level_1: "Waste disposal" })))
        .scope3Category,
    ).toBeNull();
  });

  it("leaves an ambiguous family unassigned rather than guessing", () => {
    expect(
      ok(
        normaliseDefraRow(
          row({ scope: "Scope 3", level_1: "Managed assets- vehicles" }),
        ),
      ).scope3Category,
    ).toBeNull();
  });

  it("puts every well-to-tank family in category 3", () => {
    for (const family of [
      "WTT- fuels",
      "WTT- UK electricity",
      "WTT- heat and steam",
      "Transmission and distribution",
    ]) {
      expect(
        ok(normaliseDefraRow(row({ scope: "Scope 3", level_1: family })))
          .scope3Category,
      ).toBe("c3_fuel_and_energy_related_activities");
    }
  });
});

describe("refusals", () => {
  it("refuses a row with no published value", () => {
    const result = normaliseDefraRow(row({ value: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no factor value/i);
  });

  it("refuses an unrecognised scope, unit or numerator rather than defaulting", () => {
    expect(normaliseDefraRow(row({ scope: "Scope 4" })).ok).toBe(false);
    expect(normaliseDefraRow(row({ uom: "furlongs" })).ok).toBe(false);
    expect(normaliseDefraRow(row({ ghg_unit: "kg CO2" })).ok).toBe(false);
  });
});

describe("the default mappings", () => {
  it("names one factor per (category, unit) pair", () => {
    const keys = DEFAULT_FACTOR_MAPPINGS.map((m) => `${m.category} ${m.unit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("selects the Gross CV natural-gas row for fuel in kWh", () => {
    // The methodology report's paragraph 2.9: UK suppliers quote kWh on a Gross
    // CV basis, so Gross CV is the default — not Net CV.
    const fuelKwh = DEFAULT_FACTOR_MAPPINGS.find(
      (m) => m.category === "fuel" && m.unit === "kWh",
    );
    expect(fuelKwh?.sourceRowId).toBe("1_100_1004_6_1");
    expect(fuelKwh?.description).toMatch(/Gross CV/);
  });

  it("leaves the 'other' category unmapped in every unit", () => {
    expect(DEFAULT_FACTOR_MAPPINGS.some((m) => m.category === "other")).toBe(false);
  });
});

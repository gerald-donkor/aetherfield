import { describe, expect, it } from "vitest";

import { toDecimalString } from "./decimal";
import { isCh4Variant, isGhgGas, isGwpSet, lookupGwp } from "./gwp";
import { GWP_SETS } from "../validation/emissions";

/**
 * The published values, and the four refusals.
 *
 * The refusals matter more than the values here: a GWP table that returns a
 * plausible number for a gas it does not hold is exactly the fabrication
 * AGENTS.md 5.3 and 12 rule 7 forbid, and these tests are what stop a later
 * session "helpfully" adding a fallback.
 */

const value = (result: ReturnType<typeof lookupGwp>) => {
  expect(result.ok).toBe(true);
  return result.ok ? toDecimalString(result.value) : "";
};

describe("the published tables", () => {
  it("prices CO2 at 1 in every set", () => {
    for (const set of GWP_SETS) {
      expect(value(lookupGwp(set, "co2"))).toBe("1");
    }
  });

  it("carries the AR4, AR5 and AR6 values for combustion methane", () => {
    expect(value(lookupGwp("AR4", "ch4", "combustion"))).toBe("25");
    expect(value(lookupGwp("AR5", "ch4", "combustion"))).toBe("28");
    // The trailing zero is how the publication prints it and it survives.
    expect(value(lookupGwp("AR6", "ch4", "combustion"))).toBe("27.0");
  });

  it("carries the fossil methane values where the set publishes one", () => {
    expect(value(lookupGwp("AR5", "ch4", "fugitive"))).toBe("30");
    expect(value(lookupGwp("AR6", "ch4", "fugitive"))).toBe("29.8");
  });

  it("carries N2O, SF6 and NF3", () => {
    expect(value(lookupGwp("AR4", "n2o"))).toBe("298");
    expect(value(lookupGwp("AR5", "n2o"))).toBe("265");
    expect(value(lookupGwp("AR6", "n2o"))).toBe("273");

    expect(value(lookupGwp("AR4", "sf6"))).toBe("22800");
    expect(value(lookupGwp("AR5", "sf6"))).toBe("23500");
    expect(value(lookupGwp("AR6", "sf6"))).toBe("24300");

    expect(value(lookupGwp("AR4", "nf3"))).toBe("17200");
    expect(value(lookupGwp("AR5", "nf3"))).toBe("16100");
    expect(value(lookupGwp("AR6", "nf3"))).toBe("17400");
  });

  it("distinguishes combustion from fugitive methane", () => {
    expect(value(lookupGwp("AR5", "ch4", "combustion"))).not.toBe(
      value(lookupGwp("AR5", "ch4", "fugitive")),
    );
  });
});

describe("the refusals", () => {
  it("refuses a CO2e factor rather than returning 1", () => {
    const result = lookupGwp("AR5", "co2e");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/already carries/i);
  });

  it("refuses methane with no variant named", () => {
    const result = lookupGwp("AR5", "ch4");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/variant/i);
  });

  it("refuses fossil methane under AR4, which publishes none", () => {
    const result = lookupGwp("AR4", "ch4", "fugitive");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/AR4/);
  });

  it("never returns a value alongside a refusal", () => {
    for (const result of [
      lookupGwp("AR5", "co2e"),
      lookupGwp("AR5", "ch4"),
      lookupGwp("AR4", "ch4", "fugitive"),
    ]) {
      expect(result.ok).toBe(false);
      expect("value" in result).toBe(false);
    }
  });
});

describe("the guards", () => {
  it("recognises only the gases, sets and variants it holds", () => {
    expect(isGhgGas("co2")).toBe(true);
    expect(isGhgGas("hfc-134a")).toBe(false);
    expect(isGwpSet("AR6")).toBe(true);
    expect(isGwpSet("AR3")).toBe(false);
    expect(isCh4Variant("fugitive")).toBe(true);
    expect(isCh4Variant("vented")).toBe(false);
  });
});

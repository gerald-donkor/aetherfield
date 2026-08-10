import { describe, expect, it } from "vitest";

import {
  ZERO,
  add,
  compare,
  decimal,
  divide,
  fromUnits,
  isZero,
  multiply,
  multiplyByInteger,
  negate,
  parseDecimal,
  rescale,
  subtract,
  sum,
  toDecimalString,
  toFixed,
} from "./decimal";

/**
 * The arithmetic these tests protect ends up in regulatory disclosures
 * (AGENTS.md 5.3), so they are written against the failure modes that matter
 * rather than for coverage: values `Number` cannot hold, sums that must not
 * round early, and rounding that must go the direction it says it does.
 */

const str = toDecimalString;

describe("parseDecimal", () => {
  it("reads a plain decimal and keeps its scale", () => {
    const result = parseDecimal("1.500");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.units).toBe(1500n);
    expect(result.value.scale).toBe(3);
    // Trailing zeroes are significant to a published factor and survive.
    expect(str(result.value)).toBe("1.500");
  });

  it("reads negatives and zero", () => {
    expect(str(decimal("-0.001"))).toBe("-0.001");
    expect(str(decimal("0"))).toBe("0");
    expect(isZero(decimal("0.000"))).toBe(true);
  });

  it("refuses anything outside the stated grammar, with a reason", () => {
    for (const bad of ["", "  ", "1e5", "+1", "1,000", "1.", ".5", "01", "abc", "1.2.3"]) {
      const result = parseDecimal(bad);
      expect(result.ok, `"${bad}" should not parse`).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("never falls back to a value on failure", () => {
    const result = parseDecimal("not a number");
    expect(result.ok).toBe(false);
    expect("value" in result).toBe(false);
  });

  it("holds a value with more precision than a double can represent", () => {
    // 25 significant digits: Number would silently lose everything past 17.
    const text = "1234567890123456789.012345";
    expect(str(decimal(text))).toBe(text);
    expect(Number(text).toString()).not.toBe(text);
  });
});

describe("add and sum", () => {
  it("is exact where floating point is not", () => {
    expect(str(add(decimal("0.1"), decimal("0.2")))).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("aligns to the wider scale", () => {
    expect(str(add(decimal("1.5"), decimal("2.25")))).toBe("3.75");
    expect(str(add(decimal("1"), decimal("0.000001")))).toBe("1.000001");
  });

  it("sums a long list without accumulating error", () => {
    // A tenth, ten thousand times, is exactly a thousand.
    const values = Array.from({ length: 10_000 }, () => decimal("0.1"));
    expect(str(sum(values))).toBe("1000.0");

    let float = 0;
    for (let i = 0; i < 10_000; i += 1) float += 0.1;
    expect(float).not.toBe(1000);
  });

  it("treats an empty list as zero", () => {
    expect(isZero(sum([]))).toBe(true);
    expect(sum([])).toEqual(ZERO);
  });

  it("subtracts exactly", () => {
    expect(str(subtract(decimal("1.1"), decimal("1.1")))).toBe("0.0");
    expect(str(subtract(decimal("0.3"), decimal("0.1")))).toBe("0.2");
  });
});

describe("multiply", () => {
  it("adds scales and stays exact", () => {
    expect(str(multiply(decimal("0.5"), decimal("0.25")))).toBe("0.125");
    // The shape the engine actually produces: a 6-place quantity against a
    // 17-place factor is a 23-place product, carried whole.
    const product = multiply(decimal("1.000001"), decimal("0.00000000000000001"));
    expect(product.scale).toBe(23);
    expect(str(product)).toBe("0.00000000000000001000001");
  });

  it("is exact for a product no double can hold", () => {
    expect(str(multiply(decimal("1.1"), decimal("1.1")))).toBe("1.21");
    expect(1.1 * 1.1).not.toBe(1.21);
  });

  it("multiplies by an integer without changing scale", () => {
    expect(str(multiplyByInteger(decimal("1.234"), 1000n))).toBe("1234.000");
  });

  it("handles signs", () => {
    expect(str(multiply(decimal("-2.5"), decimal("4")))).toBe("-10.0");
    expect(str(negate(decimal("3.14")))).toBe("-3.14");
  });
});

describe("compare", () => {
  it("ignores trailing zeroes", () => {
    expect(compare(decimal("1.5"), decimal("1.500"))).toBe(0);
  });

  it("orders across scales and signs", () => {
    expect(compare(decimal("1.5"), decimal("1.51"))).toBe(-1);
    expect(compare(decimal("2"), decimal("1.999999"))).toBe(1);
    expect(compare(decimal("-1"), decimal("0"))).toBe(-1);
  });
});

describe("rescale", () => {
  it("widens exactly and ignores the rounding mode", () => {
    expect(str(rescale(decimal("1.5"), 4, "down"))).toBe("1.5000");
  });

  it("rounds half away from zero under half-up", () => {
    expect(str(rescale(decimal("1.25"), 1, "half-up"))).toBe("1.3");
    expect(str(rescale(decimal("1.35"), 1, "half-up"))).toBe("1.4");
    expect(str(rescale(decimal("-1.25"), 1, "half-up"))).toBe("-1.3");
  });

  it("rounds half to even under half-even", () => {
    expect(str(rescale(decimal("1.25"), 1, "half-even"))).toBe("1.2");
    expect(str(rescale(decimal("1.35"), 1, "half-even"))).toBe("1.4");
    expect(str(rescale(decimal("-1.25"), 1, "half-even"))).toBe("-1.2");
  });

  it("truncates toward zero under down", () => {
    expect(str(rescale(decimal("1.29"), 1, "down"))).toBe("1.2");
    expect(str(rescale(decimal("-1.29"), 1, "down"))).toBe("-1.2");
  });

  it("rounds on the discarded tail, not on the first discarded digit alone", () => {
    // 1.4999 to one place is 1.5 only if the whole tail is weighed; a
    // digit-at-a-time rounder would produce 1.5 from 1.45 upward and get this
    // wrong in the other direction.
    expect(str(rescale(decimal("1.4999"), 1, "half-up"))).toBe("1.5");
    expect(str(rescale(decimal("1.4499"), 1, "half-up"))).toBe("1.4");
  });

  it("carries across a digit boundary", () => {
    expect(str(rescale(decimal("9.99"), 1, "half-up"))).toBe("10.0");
    expect(str(rescale(decimal("0.996"), 2, "half-up"))).toBe("1.00");
  });

  it("rejects a negative or fractional scale", () => {
    expect(() => rescale(decimal("1"), -1, "half-up")).toThrow();
    expect(() => rescale(decimal("1"), 1.5, "half-up")).toThrow();
    expect(() => fromUnits(1n, -1)).toThrow();
  });
});

describe("divide", () => {
  const quotient = (
    a: string,
    b: string,
    scale: number,
    mode: "half-up" | "half-even" | "down",
  ) => {
    const result = divide(decimal(a), decimal(b), scale, mode);
    expect(result.ok).toBe(true);
    return result.ok ? str(result.value) : "";
  };

  it("keeps exact quotients exact at the declared scale", () => {
    expect(quotient("10", "4", 3, "half-even")).toBe("2.500");
  });

  it("resolves an exact half under every rounding mode", () => {
    expect(quotient("5", "2", 0, "half-up")).toBe("3");
    expect(quotient("5", "2", 0, "half-even")).toBe("2");
    expect(quotient("5", "2", 0, "down")).toBe("2");
    expect(quotient("7", "2", 0, "half-even")).toBe("4");
  });

  it("applies half-up away from zero for negative operands", () => {
    expect(quotient("-5", "2", 0, "half-up")).toBe("-3");
    expect(quotient("5", "-2", 0, "half-up")).toBe("-3");
    expect(quotient("-5", "-2", 0, "half-up")).toBe("3");
  });

  it("truncates a repeating quotient at the declared scale", () => {
    expect(quotient("1", "3", 6, "down")).toBe("0.333333");
  });

  it("refuses division by zero without a value", () => {
    const result = divide(decimal("1"), decimal("0.00"), 2, "half-even");
    expect(result.ok).toBe(false);
    expect("value" in result).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/zero/i);
  });

  it("requires a non-negative integer scale", () => {
    expect(() => divide(decimal("1"), decimal("2"), -1, "down")).toThrow();
    expect(() => divide(decimal("1"), decimal("2"), 1.5, "down")).toThrow();
  });
});

describe("round once, at presentation", () => {
  it("a sum of unrounded values differs from a sum of rounded ones", () => {
    // Three records that each round down alone but carry a full unit together:
    // this is the failure the no-intermediate-rounding rule exists to prevent.
    const values = [decimal("0.4"), decimal("0.4"), decimal("0.4")];

    const roundedLate = toFixed(sum(values), 0);
    const roundedEarly = toFixed(
      sum(values.map((v) => rescale(v, 0, "half-up"))),
      0,
    );

    expect(roundedLate).toBe("1");
    expect(roundedEarly).toBe("0");
    expect(roundedLate).not.toBe(roundedEarly);
  });

  it("toFixed defaults to half-up", () => {
    expect(toFixed(decimal("2.345"), 2)).toBe("2.35");
    expect(toFixed(decimal("2.345"), 2, "down")).toBe("2.34");
  });
});

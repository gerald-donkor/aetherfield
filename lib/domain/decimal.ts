/**
 * Exact decimal arithmetic over `BigInt` — build step 10's foundation.
 *
 * **`lib/domain/` is pure** (AGENTS.md 6.2): no database handle, no `fetch`, no
 * implicit `Date.now()`. Nothing here reads a secret, so there is no
 * `server-only` import, and every call is reproducible from its arguments
 * alone.
 *
 * ---
 *
 * ## Why this exists rather than `Number`
 *
 * `activity_record.quantity` is `numeric(18, 6)` read back as a **string**, by
 * the deliberate decision recorded at `lib/db/schema.ts`'s `activityRecord`
 * docblock. Emission factors carry up to 17 decimal places (measured — see
 * `docs/backend.md`). The product of the two lands in a regulatory disclosure,
 * and AGENTS.md 5.3's hard rule is that "a plausible invented number is the
 * single worst failure this product can have".
 *
 * IEEE 754 doubles cannot represent most of these values, let alone their
 * product: `0.1 + 0.2 !== 0.3` is the whole argument, and a 15-significant-digit
 * mantissa is exhausted well before `numeric(18, 6)` is. **No `Number` appears
 * anywhere on the value path in this module or its callers** — not as an
 * intermediate, not as a shortcut for a small integer. `BigInt` is native, so
 * this costs no dependency.
 *
 * ## The representation
 *
 * A `Decimal` is an arbitrary-precision integer `units` and a non-negative
 * `scale`, together meaning `units / 10^scale`. It is opaque on purpose: the
 * fields are `readonly` and callers move values through this module's own
 * functions rather than reaching in, so no caller can produce a value with a
 * negative scale or a fractional one.
 *
 * `1.500` and `1.5` are **distinct values here** and equal under {@link compare}.
 * Trailing zeroes are significant to a published factor, so parsing preserves
 * them and only {@link rescale} and {@link toFixed} ever change a scale.
 *
 * ## The rule that matters most
 *
 * **No intermediate rounding. Round once, at presentation.**
 *
 * {@link multiply} adds scales and is therefore always exact; {@link add} and
 * {@link sum} align to the wider scale and are therefore always exact. Nothing
 * in this module rounds unless the caller names a rounding mode, which only
 * {@link rescale} and {@link toFixed} take. An engine that rounded each record
 * before summing would produce a different total from one that rounded the
 * total, and only the second is defensible in a disclosure.
 */

/**
 * `units / 10^scale`, exactly.
 *
 * Construct one with {@link parseDecimal} or {@link fromUnits}; read one back
 * with {@link toDecimalString}. The shape is exported for typing, not for
 * literal construction — a hand-built object can carry a negative or fractional
 * scale, which every function here assumes cannot happen.
 */
export type Decimal = {
  readonly units: bigint;
  readonly scale: number;
};

/**
 * How to resolve a digit that a narrowing {@link rescale} would discard.
 *
 * - `half-up` — ties away from zero. What a person means by "round to 2 dp",
 *   and what published emission-factor tables use.
 * - `half-even` — banker's rounding: ties to the even neighbour. Unbiased over
 *   many roundings, which matters when a rounded figure is summed.
 * - `down` — truncates toward zero. Never a default; it exists so a caller that
 *   must not overstate a figure can say so.
 */
export type RoundingMode = "half-up" | "half-even" | "down";

export type DecimalParseResult =
  | { ok: true; value: Decimal }
  | { ok: false; error: string };

/** The whole accepted grammar. No exponent, no thousands separator, no
    leading `+`: this parses values that came from `numeric` or from the seed
    CSV, both of which are plain decimals, and anything else is a caller bug
    worth surfacing rather than a format to guess at. */
const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export const ZERO: Decimal = { units: 0n, scale: 0 };

const TEN = 10n;

/** `10n ** n`, memoised — every alignment and every multiply needs one, and the
    exponentiation is otherwise repeated across thousands of records. */
const powers: bigint[] = [1n];

function pow10(n: number): bigint {
  for (let i = powers.length; i <= n; i += 1) {
    powers[i] = powers[i - 1] * TEN;
  }
  return powers[n];
}

/**
 * Parses a plain decimal string.
 *
 * Returns a typed failure rather than throwing, and never a fallback value: a
 * factor or a quantity that cannot be read is a reason not to produce a figure,
 * not a reason to produce zero (AGENTS.md 5.3).
 */
export function parseDecimal(text: string): DecimalParseResult {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "An empty string is not a number." };
  }
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: `"${trimmed}" is not a plain decimal number. Expected digits with an optional leading "-" and an optional fractional part.`,
    };
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const negative = whole.startsWith("-");
  const digits = (negative ? whole.slice(1) : whole) + fraction;
  const units = BigInt(digits);

  return {
    ok: true,
    value: { units: negative ? -units : units, scale: fraction.length },
  };
}

/**
 * Parses, or throws.
 *
 * **For literals written in this repository only** — a constant in
 * `lib/domain/gwp.ts`, a value in a test. Never for a factor read from the
 * database or a quantity read from a customer's file: those take
 * {@link parseDecimal} and handle the failure, because a throw on that path is
 * a crash where a typed refusal belongs.
 */
export function decimal(text: string): Decimal {
  const parsed = parseDecimal(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

/** Builds a value from an integer count of units at a given scale. `scale` must
    be a non-negative integer; it is the caller's contract, and the assertion is
    here because a fractional scale would corrupt every later alignment. */
export function fromUnits(units: bigint, scale: number): Decimal {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error(`scale must be a non-negative integer, got ${scale}`);
  }
  return { units, scale };
}

/** Widens a value to `scale`. Exact — widening only ever appends zeroes, so it
    takes no rounding mode and cannot lose a digit. */
function widen(value: Decimal, scale: number): bigint {
  return value.units * pow10(scale - value.scale);
}

/** Exact. The result carries the wider of the two scales. */
export function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return { units: widen(a, scale) + widen(b, scale), scale };
}

/** Exact, and defined as `a + (-b)` so the two share one alignment rule. */
export function subtract(a: Decimal, b: Decimal): Decimal {
  return add(a, negate(b));
}

export function negate(value: Decimal): Decimal {
  return { units: -value.units, scale: value.scale };
}

export function abs(value: Decimal): Decimal {
  return value.units < 0n ? negate(value) : value;
}

/**
 * Exact. Scales add, so `0.5 × 0.25` is `0.125` at scale 3 — the product of a
 * `numeric(18, 6)` quantity and a 17-place factor is a 23-place value, and it
 * is carried at 23 places until something asks for it rounded.
 */
export function multiply(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** Exact, for the integer unit ratios in `lib/domain/emissions.ts` (`MWh` to
    `kWh` is ×1000). Deliberately not a general division: **there is no
    `divide` in this module.** Division is where an inexact result would have to
    be rounded silently, and nothing in the calculation path needs one. */
export function multiplyByInteger(value: Decimal, factor: bigint): Decimal {
  return { units: value.units * factor, scale: value.scale };
}

/** `-1`, `0` or `1`. `1.5` and `1.500` compare equal — see the module docblock. */
export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale);
  const left = widen(a, scale);
  const right = widen(b, scale);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isZero(value: Decimal): boolean {
  return value.units === 0n;
}

export function isNegative(value: Decimal): boolean {
  return value.units < 0n;
}

/**
 * Sums exactly, at the widest scale present.
 *
 * **The aggregation path uses this and never a rounded running total.** An
 * empty list is {@link ZERO}, which is the correct total of no records — the
 * caller reports coverage separately, so "nothing matched" is never confused
 * with "the total is zero" (AGENTS.md 5.3).
 */
export function sum(values: readonly Decimal[]): Decimal {
  if (values.length === 0) return ZERO;
  let scale = 0;
  for (const value of values) {
    if (value.scale > scale) scale = value.scale;
  }
  let units = 0n;
  for (const value of values) {
    units += widen(value, scale);
  }
  return { units, scale };
}

/**
 * Re-scales to exactly `scale` places, rounding as named.
 *
 * Widening is exact and ignores `mode`. Narrowing is the **only** place in this
 * module where a digit is discarded, and it never happens implicitly — which is
 * what makes "round once, at presentation" enforceable rather than aspirational.
 */
export function rescale(
  value: Decimal,
  scale: number,
  mode: RoundingMode,
): Decimal {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error(`scale must be a non-negative integer, got ${scale}`);
  }
  if (scale >= value.scale) {
    return { units: widen(value, scale), scale };
  }

  const divisor = pow10(value.scale - scale);
  const negative = value.units < 0n;
  const magnitude = negative ? -value.units : value.units;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;

  let rounded = quotient;
  if (remainder !== 0n && mode !== "down") {
    // Compare the discarded tail with half the divisor without leaving BigInt:
    // `remainder * 2` against `divisor` is the same test and stays exact.
    const twice = remainder * 2n;
    if (twice > divisor) {
      rounded += 1n;
    } else if (twice === divisor) {
      const roundUp = mode === "half-up" || quotient % 2n !== 0n;
      if (roundUp) rounded += 1n;
    }
  }

  return { units: negative ? -rounded : rounded, scale };
}

/**
 * The exact decimal string — every digit the value holds, trailing zeroes
 * included.
 *
 * This is what goes into a `numeric` column, and it is why the value path never
 * touches `Number`: the string that arrives from Postgres becomes a `Decimal`
 * and the string that returns to Postgres came from one, with no lossy
 * representation in between.
 */
export function toDecimalString(value: Decimal): string {
  const negative = value.units < 0n;
  const digits = (negative ? -value.units : value.units).toString();

  if (value.scale === 0) return negative ? `-${digits}` : digits;

  const padded = digits.padStart(value.scale + 1, "0");
  const whole = padded.slice(0, padded.length - value.scale);
  const fraction = padded.slice(padded.length - value.scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Rounds to `places` and renders. The presentation step, and the one place a
    figure a person reads is allowed to lose a digit. */
export function toFixed(
  value: Decimal,
  places: number,
  mode: RoundingMode = "half-up",
): string {
  return toDecimalString(rescale(value, places, mode));
}

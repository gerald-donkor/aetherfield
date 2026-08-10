/**
 * The calculation engine — build step 10, and the module AGENTS.md 5.3's hard
 * rule is written about.
 *
 * **Pure** (AGENTS.md 6.2): no database handle, no `fetch`, no implicit
 * `Date.now()`. Every input is a parameter and every call is reproducible from
 * its arguments alone, which is what makes it independently testable — see
 * `lib/domain/__tests__/emissions.test.ts`.
 *
 * **All arithmetic is deterministic and exact.** Nothing here is a model,
 * nothing here is heuristic, and no `Number` appears on the value path:
 * `lib/domain/decimal.ts` carries every figure as an arbitrary-precision
 * integer and a scale. A model may one day *select* a factor (AGENTS.md 5.3
 * sanctions embeddings and rerank at this step, "sanctioned, not scheduled");
 * it will never multiply by one, and the seam is `resolveFactor` being the
 * caller's job rather than this module's.
 *
 * ---
 *
 * ## The four ways this module refuses
 *
 * Every one of them is a **typed refusal that keeps the record out of the
 * total**, never a fallback, a zero or a guess. A record that cannot be
 * calculated is surfaced in the coverage report and contributes nothing —
 * AGENTS.md 5.3's "surfaced, never silently accepted", applied to a
 * deterministic matcher rather than to a model.
 *
 * 1. **No factor is mapped** to the record's `(category, unit)` pair. The
 *    mapping is organisation-scoped and seeded small; most pairs start empty.
 * 2. **The factor does not produce an emission.** 514 rows of the 2026 DEFRA
 *    set convert an activity into `kWh`, not into kgCO2e. Summing one into a
 *    tCO2e total would inflate it silently.
 * 3. **The units do not convert.** `km` against `tonne.km` is not a unit
 *    mismatch to paper over, it is a different physical quantity. `miles` and
 *    `GJ` are refused too — see {@link convertQuantity}.
 * 4. **The gas cannot be priced** under the factor's own GWP set — AR4
 *    publishes no fossil-methane value, and this repository's GWP tables carry
 *    no halocarbons.
 *
 * ## What is never summed into a scope total
 *
 * `outside_of_scopes` — direct CO2 from biomass combustion, which the Corporate
 * Standard says "shall not be included in scope 1 but reported separately" —
 * and any factor flagged `biogenic`. {@link aggregate} carries both in their own
 * fields, and there is no code path here that adds either to `scope1`,
 * `scope2`, `scope3` or `total`.
 */

import type {
  ActivityCategory,
  ActivityUnit,
} from "../validation/activity";
import {
  type Ch4Variant,
  type EmissionScope,
  type FactorActivityUnit,
  type FactorResultUnit,
  type GhgGas,
  type GwpSet,
  type Scope2Method,
  type Scope3Category,
} from "../validation/emissions";
import {
  ZERO,
  add,
  fromUnits,
  multiply,
  parseDecimal,
  sum,
  toDecimalString,
  type Decimal,
} from "./decimal";
import { lookupGwp } from "./gwp";

/**
 * The engine's version, persisted on every computed row.
 *
 * **It is provenance, not decoration.** `activity_emission` stores the factor
 * row it used, the GWP set applied and this string, so a figure filed last year
 * can be re-derived and a change in method is visible as a change in this
 * value. Bump it whenever a change here would move a number that a previous run
 * produced — not for a comment, a rename or a new refusal reason.
 */
export const ENGINE_VERSION = "1.0.0";

/* -------------------------------------------------------------------------- */
/*  Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** One committed `activity_record`, as the engine needs it. Decimal figures
    arrive as the strings `numeric` reads back — never as `Number`. */
export type ActivityInput = {
  id: string;
  activityDate: string;
  category: ActivityCategory;
  unit: ActivityUnit;
  /** The `numeric(18, 6)` value, as a string. */
  quantity: string;
};

/** One `emission_factor` row, as the engine needs it. */
export type FactorInput = {
  id: string;
  scope: EmissionScope;
  scope3Category: Scope3Category | null;
  scope2Method: Scope2Method | null;
  gas: GhgGas;
  ch4Variant: Ch4Variant | null;
  gwpSet: GwpSet;
  /** The published value, as a string. */
  value: string;
  activityUnit: FactorActivityUnit;
  resultUnit: FactorResultUnit;
  biogenic: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Unit conversion                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The physical quantity a unit measures. Two units convert only within one
 * dimension; across dimensions there is no conversion to get wrong, only a
 * refusal to make.
 */
type Dimension = "energy" | "volume" | "mass" | "distance" | "freight";

/**
 * Every convertible unit as a dimension and a **power of ten** relative to that
 * dimension's base.
 *
 * **The power-of-ten restriction is the design, not a limitation to lift.** A
 * decimal scaled by a power of ten is exact in both directions — multiplying
 * appends zeroes, dividing shifts the scale — so no conversion in this module
 * can round, and `lib/domain/decimal.ts` needs no division at all. Every ratio
 * the activity model actually requires happens to be one: `MWh` to `kWh`, `t`
 * to `kg`, `m3` to `L` are all ×1000.
 *
 * The units that are *not* a power of ten away are the ones this module
 * refuses: `miles` (1.609344 km) and `GJ` (277.7… kWh). Approximating either
 * would put a fabricated number in a disclosure, and DEFRA publishes a `km` row
 * beside almost every `miles` row, so the correct fix is to map the other row —
 * not to convert.
 */
const UNIT_DIMENSIONS: Record<
  ActivityUnit | FactorActivityUnit,
  { dimension: Dimension; exponent: number } | null
> = {
  /* The activity model's eight units — what a meter, invoice or waste ticket
     recorded (`lib/validation/activity.ts`). */
  kWh: { dimension: "energy", exponent: 0 },
  MWh: { dimension: "energy", exponent: 3 },
  L: { dimension: "volume", exponent: 0 },
  m3: { dimension: "volume", exponent: 3 },
  kg: { dimension: "mass", exponent: 0 },
  t: { dimension: "mass", exponent: 3 },
  km: { dimension: "distance", exponent: 0 },
  tkm: { dimension: "freight", exponent: 0 },

  /* The published denominators. The three calorific-value spellings share the
     energy dimension: a kWh is a kWh, and Net versus Gross is a property of
     *which factor was chosen*, carried by `FactorActivityUnit` so the mapping
     records it, not a conversion to perform. */
  kwh: { dimension: "energy", exponent: 0 },
  kwh_net_cv: { dimension: "energy", exponent: 0 },
  kwh_gross_cv: { dimension: "energy", exponent: 0 },
  litres: { dimension: "volume", exponent: 0 },
  cubic_metres: { dimension: "volume", exponent: 3 },
  million_litres: { dimension: "volume", exponent: 6 },
  tonnes: { dimension: "mass", exponent: 3 },
  tonne_km: { dimension: "freight", exponent: 0 },

  /* Not addressable: `miles`, `GJ`, `passenger.km`, `Room per night` and
     `per FTE Working Hour` all normalise to this. */
  unknown_unit: null,
};

export type ConversionResult =
  | { ok: true; value: Decimal }
  | { ok: false; reason: string };

/**
 * Restates `quantity`, measured in `from`, in terms of `to`. Exact, always.
 *
 * Returns a typed refusal for a cross-dimensional pair or an unrepresentable
 * unit, and **never a converted-anyway value**.
 */
export function convertQuantity(
  quantity: Decimal,
  from: ActivityUnit,
  to: FactorActivityUnit,
): ConversionResult {
  const source = UNIT_DIMENSIONS[from];
  const target = UNIT_DIMENSIONS[to];

  if (!source) {
    return { ok: false, reason: `"${from}" is not a convertible unit.` };
  }
  if (!target) {
    return {
      ok: false,
      reason:
        "This factor is published against a unit the activity model cannot measure — miles, GJ, passenger.km, room-nights or FTE hours. Map a factor published against the unit the records use.",
    };
  }
  if (source.dimension !== target.dimension) {
    return {
      ok: false,
      reason: `"${from}" measures ${source.dimension} and this factor is published per ${target.dimension}. These are different quantities, not a unit mismatch.`,
    };
  }

  const exponent = source.exponent - target.exponent;
  if (exponent === 0) return { ok: true, value: quantity };
  if (exponent > 0) {
    // Widening: 5 MWh at exponent 3 is 5000 kWh. Exact.
    return { ok: true, value: multiply(quantity, fromUnits(10n ** BigInt(exponent), 0)) };
  }
  // Narrowing by a power of ten is a scale shift, not a division: 5000 kg
  // becomes 5.000 tonnes with every digit intact.
  return { ok: true, value: fromUnits(quantity.units, quantity.scale - exponent) };
}

/* -------------------------------------------------------------------------- */
/*  One record                                                                 */
/* -------------------------------------------------------------------------- */

/** Why a record produced no figure. The set is closed so the coverage surface
    can group by it rather than by a free-text string. */
export type EmissionRefusal =
  | "unreadable_quantity"
  | "unreadable_factor"
  | "factor_is_not_an_emission"
  | "unit_mismatch"
  | "gas_not_priceable";

export type RecordEmission = {
  recordId: string;
  activityDate: string;
  /** kgCO2e, exact and unrounded. Rounding happens once, at presentation. */
  kgCo2e: Decimal;
  factorId: string;
  scope: EmissionScope;
  scope3Category: Scope3Category | null;
  scope2Method: Scope2Method | null;
  gwpSet: GwpSet;
  biogenic: boolean;
  outsideOfScopes: boolean;
  engineVersion: string;
};

export type RecordEmissionResult =
  | { ok: true; emission: RecordEmission }
  | { ok: false; refusal: EmissionRefusal; reason: string };

/**
 * `quantity × factor × GWP`, exactly, or a typed reason it could not be done.
 *
 * The GWP step is skipped — not defaulted to 1 — when the factor is already a
 * CO2e value, which is what DEFRA's combined `kg CO2e` rows are. Multiplying a
 * CO2e factor by a GWP would double-convert it, and `lookupGwp` refuses the
 * `co2e` gas explicitly so that mistake cannot be made silently.
 *
 * **No intermediate rounding.** The product of a `numeric(18, 6)` quantity, a
 * 17-place factor and a one-place GWP is carried at 24 places until something
 * asks for it rounded.
 */
export function calculateRecordEmission(
  record: ActivityInput,
  factor: FactorInput,
): RecordEmissionResult {
  if (factor.resultUnit !== "kg_co2e") {
    return {
      ok: false,
      refusal: "factor_is_not_an_emission",
      reason:
        "This factor converts an activity into kWh, not into emissions. It cannot contribute to a tCO2e total.",
    };
  }

  const quantity = parseDecimal(record.quantity);
  if (!quantity.ok) {
    return { ok: false, refusal: "unreadable_quantity", reason: quantity.error };
  }

  const value = parseDecimal(factor.value);
  if (!value.ok) {
    return { ok: false, refusal: "unreadable_factor", reason: value.error };
  }

  const converted = convertQuantity(quantity.value, record.unit, factor.activityUnit);
  if (!converted.ok) {
    return { ok: false, refusal: "unit_mismatch", reason: converted.reason };
  }

  let kgCo2e = multiply(converted.value, value.value);

  if (factor.gas !== "co2e") {
    const gwp = lookupGwp(factor.gwpSet, factor.gas, factor.ch4Variant ?? undefined);
    if (!gwp.ok) {
      return { ok: false, refusal: "gas_not_priceable", reason: gwp.reason };
    }
    kgCo2e = multiply(kgCo2e, gwp.value);
  }

  return {
    ok: true,
    emission: {
      recordId: record.id,
      activityDate: record.activityDate,
      kgCo2e,
      factorId: factor.id,
      scope: factor.scope,
      scope3Category: factor.scope3Category,
      scope2Method: factor.scope2Method,
      gwpSet: factor.gwpSet,
      biogenic: factor.biogenic,
      outsideOfScopes: factor.scope === "outside_of_scopes",
      engineVersion: ENGINE_VERSION,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Many records                                                               */
/* -------------------------------------------------------------------------- */

/** A `(category, unit)` pair no factor is mapped to, with how many records sit
    behind it. What the coverage surface lists, so a person sees the *shape* of
    the gap rather than a thousand identical row errors. */
export type UnmatchedPair = {
  category: ActivityCategory;
  unit: ActivityUnit;
  recordCount: number;
};

export type CoverageReport = {
  totalRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
  /** Sorted by `recordCount` descending, then by category and unit, so the
      list is stable across runs and the biggest gap reads first. */
  unmatchedPairs: UnmatchedPair[];
  /** Records that had a factor but still produced no figure, by reason. */
  refusals: { refusal: EmissionRefusal; reason: string; recordCount: number }[];
};

export type ScopeTotals = {
  /** Scopes 1, 2 and 3 only. **Biogenic and outside-of-scopes are excluded**,
      by the Corporate Standard's own instruction. */
  total: Decimal;
  scope1: Decimal;
  scope2: Decimal;
  scope3: Decimal;
  /** Reported separately, never added to `total` above. */
  outsideOfScopes: Decimal;
  biogenic: Decimal;
  byScope3Category: { category: Scope3Category; kgCo2e: Decimal }[];
  /** Every scope 2 method present in the inputs. Whatever is shown must be
      labelled with it — the Scope 2 Guidance requires the method to travel with
      the figure, and this step produces `location_based` only. */
  scope2Methods: Scope2Method[];
};

export type AggregateResult = {
  totals: ScopeTotals;
  coverage: CoverageReport;
  emissions: RecordEmission[];
};

/**
 * How a caller resolves a record to a factor. **Deterministic in this step**:
 * `lib/db/emission-queries.ts` passes a lookup over the organisation's
 * `activity_factor_mapping`, keyed on `(category, unit)`.
 *
 * It is a parameter rather than a table inside this module so the engine stays
 * pure and so the seam a model would one day occupy is explicit — AGENTS.md 5.3
 * sanctions embeddings plus rerank *here*, selecting a factor, and nowhere near
 * the arithmetic below.
 */
export type FactorResolver = (record: ActivityInput) => FactorInput | null;

/**
 * Runs the engine over many records and reports totals **and coverage
 * together**.
 *
 * The two are returned as one value on purpose. AGENTS.md's step-10 constraint
 * is that "no total is ever presented as complete while unmatched rows exist",
 * and a function that returned only a total would let a caller show one without
 * ever having held the coverage figure.
 */
export function aggregate(
  records: readonly ActivityInput[],
  resolve: FactorResolver,
): AggregateResult {
  const emissions: RecordEmission[] = [];
  const unmatched = new Map<string, UnmatchedPair>();
  const refusals = new Map<string, { refusal: EmissionRefusal; reason: string; recordCount: number }>();

  for (const record of records) {
    const factor = resolve(record);
    if (!factor) {
      const key = `${record.category} ${record.unit}`;
      const existing = unmatched.get(key);
      if (existing) {
        existing.recordCount += 1;
      } else {
        unmatched.set(key, {
          category: record.category,
          unit: record.unit,
          recordCount: 1,
        });
      }
      continue;
    }

    const result = calculateRecordEmission(record, factor);
    if (!result.ok) {
      const existing = refusals.get(result.refusal);
      if (existing) {
        existing.recordCount += 1;
      } else {
        refusals.set(result.refusal, {
          refusal: result.refusal,
          reason: result.reason,
          recordCount: 1,
        });
      }
      continue;
    }

    emissions.push(result.emission);
  }

  const unmatchedPairs = [...unmatched.values()].sort(
    (a, b) =>
      b.recordCount - a.recordCount ||
      a.category.localeCompare(b.category) ||
      a.unit.localeCompare(b.unit),
  );

  const unmatchedRecords =
    unmatchedPairs.reduce((n, pair) => n + pair.recordCount, 0) +
    [...refusals.values()].reduce((n, entry) => n + entry.recordCount, 0);

  return {
    totals: totalsOf(emissions),
    coverage: {
      totalRecords: records.length,
      matchedRecords: emissions.length,
      unmatchedRecords,
      unmatchedPairs,
      refusals: [...refusals.values()].sort(
        (a, b) => b.recordCount - a.recordCount || a.refusal.localeCompare(b.refusal),
      ),
    },
    emissions,
  };
}

/**
 * Sums computed emissions by scope.
 *
 * **Biogenic and outside-of-scopes are partitioned out first**, so no bucket
 * they feed is ever an addend of `total`. `sum` is exact at the widest scale
 * present, so the total is the sum of the unrounded records — never a sum of
 * rounded ones.
 */
export function totalsOf(emissions: readonly RecordEmission[]): ScopeTotals {
  const inScope: RecordEmission[] = [];
  const outside: Decimal[] = [];
  const biogenic: Decimal[] = [];

  for (const emission of emissions) {
    if (emission.outsideOfScopes) {
      outside.push(emission.kgCo2e);
    } else if (emission.biogenic) {
      biogenic.push(emission.kgCo2e);
    } else {
      inScope.push(emission);
    }
  }

  const byScope = (scope: EmissionScope) =>
    sum(inScope.filter((e) => e.scope === scope).map((e) => e.kgCo2e));

  const scope1 = byScope("scope_1");
  const scope2 = byScope("scope_2");
  const scope3 = byScope("scope_3");

  const categories = new Map<Scope3Category, Decimal>();
  for (const emission of inScope) {
    if (emission.scope !== "scope_3" || !emission.scope3Category) continue;
    const running = categories.get(emission.scope3Category) ?? ZERO;
    categories.set(emission.scope3Category, add(running, emission.kgCo2e));
  }

  const methods = new Set<Scope2Method>();
  for (const emission of inScope) {
    if (emission.scope === "scope_2" && emission.scope2Method) {
      methods.add(emission.scope2Method);
    }
  }

  return {
    total: sum([scope1, scope2, scope3]),
    scope1,
    scope2,
    scope3,
    outsideOfScopes: sum(outside),
    biogenic: sum(biogenic),
    byScope3Category: [...categories.entries()]
      .map(([category, kgCo2e]) => ({ category, kgCo2e }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    scope2Methods: [...methods].sort(),
  };
}

/**
 * Groups computed emissions into periods, keyed by whatever `periodOf` returns
 * — `"2026-03"` for a month, `"2026"` for a year.
 *
 * **The period function is a parameter and reads no clock.** A period derived
 * from `Date.now()` inside a pure module would make the same inputs produce
 * different output tomorrow, which is the implicit-clock dependency AGENTS.md
 * 6.2 names.
 */
export function totalsByPeriod(
  emissions: readonly RecordEmission[],
  periodOf: (activityDate: string) => string,
): { period: string; totals: ScopeTotals }[] {
  const groups = new Map<string, RecordEmission[]>();
  for (const emission of emissions) {
    const period = periodOf(emission.activityDate);
    const existing = groups.get(period);
    if (existing) existing.push(emission);
    else groups.set(period, [emission]);
  }
  return [...groups.entries()]
    .map(([period, group]) => ({ period, totals: totalsOf(group) }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/** `"2026-03-14"` to `"2026-03"`. A string slice, not a `Date`: the column is
    `date(..., { mode: "string" })` and parsing it into a `Date` would introduce
    a timezone where the data has none. */
export function monthOf(activityDate: string): string {
  return activityDate.slice(0, 7);
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                               */
/* -------------------------------------------------------------------------- */

/** kgCO2e as a decimal string, for a `numeric` column. Exact and unrounded —
    the persisted figure keeps every digit the arithmetic produced. */
export function toStoredKgCo2e(value: Decimal): string {
  return toDecimalString(value);
}

/**
 * kgCO2e to tCO2e, exactly — a scale shift by three, not a division, so the
 * conversion cannot round.
 *
 * The dashboard reads in tonnes and the engine works in kilograms because that
 * is the unit DEFRA publishes in. Converting at the presentation boundary and
 * nowhere else means every stored figure stays in the publisher's own unit.
 */
export function toTonnes(kgCo2e: Decimal): Decimal {
  return fromUnits(kgCo2e.units, kgCo2e.scale + 3);
}

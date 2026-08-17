/**
 * The calculation engine — build step 10, and the module AGENTS.md 5.3's hard
 * rule is written about.
 *
 * **Pure** (AGENTS.md 6.2): no database handle, no `fetch`, no implicit
 * `Date.now()`. Every input is a parameter and every call is reproducible from
 * its arguments alone, which is what makes it independently testable — see
 * `lib/domain/emissions.test.ts`, beside this file. (This line named
 * `lib/domain/__tests__/emissions.test.ts` from build step 10 until prompt 65;
 * there is no such directory, so it is corrected rather than left pointing at
 * nothing — AGENTS.md 12 rules 1 and 8.)
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
 * ## The five ways this module refuses
 *
 * Every one of them is a **typed refusal that keeps the record out of the
 * total**, never a fallback, a zero or a guess. A record that cannot be
 * calculated is surfaced in the coverage report and contributes nothing —
 * AGENTS.md 5.3's "surfaced, never silently accepted", applied to a
 * deterministic matcher rather than to a model.
 *
 * 1. **No factor is mapped** to the record's `(category, unit)` pair. The
 *    mapping is organisation-scoped and seeded small; most pairs start empty.
 * 2. **No visible factor set covers the record's own date.** The pair is
 *    mapped, but the activity falls outside every `effective_from` /
 *    `effective_to` window the tenant can see — a 2025 restatement against a
 *    2026-only library. Costing it at the wrong year's factor would be a wrong
 *    number rather than a missing one, so the record is refused and the *year*
 *    is reported, which is the thing a reporter can act on: load that year's
 *    set. See {@link FactorResolution}.
 * 3. **The factor does not produce an emission.** 514 rows of the 2026 DEFRA
 *    set convert an activity into `kWh`, not into kgCO2e. Summing one into a
 *    tCO2e total would inflate it silently.
 * 4. **The units do not convert.** `km` against `tonne.km` is not a unit
 *    mismatch to paper over, it is a different physical quantity. `miles` and
 *    `GJ` are refused too — see {@link convertQuantity}.
 * 5. **The gas cannot be priced** under the factor's own GWP set — AR4
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
  FACTOR_ACTIVITY_UNITS,
  type Ch4Variant,
  type EmissionScope,
  type FactorActivityUnit,
  type FactorResultUnit,
  type GhgGas,
  type GwpSet,
  type Scope2MarketBasis,
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
 *
 * **`1.1.0` — prompt 68, date-effective factor selection.** A record whose date
 * no visible factor set covers now produces no figure, where 1.0.0 costed it at
 * whichever factor the mapping happened to point at. That removes figures a
 * previous run produced, and re-points others at a different year's factor row,
 * so it moves numbers by construction — exactly the case this field exists for.
 *
 * **`1.2.0` — prompt 85, market-based scope 2.** A record can now carry a
 * second computed figure on the market lane, and `totalsOf` partitions
 * market-based scope 2 out of `scope2` and `total`. No location-based figure a
 * previous run produced changes value, but what a run *produces* does, and the
 * label on a stored row is what says which engine produced it. Existing rows
 * are not rewritten: they were produced by 1.1.0 and stay labelled as such
 * until the next recalculation restates them.
 *
 * **`1.3.0` — prompt 86, the reporter-chosen grid-average fallback.** A pair
 * mapped on the market lane with the `grid_average` basis now produces a
 * market-based figure from a grid-average factor, where 1.2.0 produced none for
 * it. That adds figures a previous run did not produce and moves
 * `scope2MarketBased` and `totalMarketBased` for any organisation that chooses
 * it — which is exactly what this field exists to label. No location-based
 * figure changes value. Existing rows keep 1.2.0 until the next recalculation
 * restates them, as D8 established.
 */
export const ENGINE_VERSION = "1.3.0";

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

/**
 * Restates a `kWh` or `MWh` energy quantity in `MWh`. Exact, and the one place
 * that ×1000 ratio is written — `lib/domain/dashboard.ts`'s recorded-energy
 * comparison calls this rather than repeating the exponent {@link
 * UNIT_DIMENSIONS} already carries for `MWh`.
 */
export function energyToMWh(quantity: Decimal, unit: "kWh" | "MWh"): Decimal {
  return unit === "MWh"
    ? quantity
    : fromUnits(quantity.units, quantity.scale + 3);
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
  | "gas_not_priceable"
  /** A market-based basis was asserted for a factor that is not a scope 2 row —
      prompt 86. The action refuses this at the boundary, so reaching it means
      a mapping written before the check existed or around it; the engine
      refuses rather than mislabelling a scope 1 or 3 figure as market-based. */
  | "basis_off_scope_2";

/** Stated once and read by both {@link calculateRecordEmission} and
    {@link factorEligibility}, so the picker's rejection and the engine's are
    literally the same sentence rather than two that can drift apart. */
const NOT_AN_EMISSION =
  "This factor converts an activity into kWh, not into emissions. It cannot contribute to a tCO2e total.";

export type RecordEmission = {
  recordId: string;
  activityDate: string;
  /** kgCO2e, exact and unrounded. Rounding happens once, at presentation. */
  kgCo2e: Decimal;
  factorId: string;
  scope: EmissionScope;
  scope3Category: Scope3Category | null;
  scope2Method: Scope2Method | null;
  /** Which rung of the market-based hierarchy this figure rests on — prompt 86.
      Non-null exactly when `scope2Method` is `"market_based"`. */
  scope2MarketBasis: Scope2MarketBasis | null;
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
 *
 * @param marketBasis Present only on the market lane — prompt 86. It is the
 * rung of the Scope 2 Guidance's market-based hierarchy the *reporter* asserted
 * for this pair, and it is what labels the figure, because the factor row alone
 * cannot: on the `grid_average` basis the factor is a grid average whose own
 * `scope2Method` says `location_based`, and the figure it produces is
 * nevertheless the market-based reading of that consumption. **Nothing is
 * inferred here** — a caller that passes nothing gets the factor's own method,
 * exactly as before this parameter existed.
 */
export function calculateRecordEmission(
  record: ActivityInput,
  factor: FactorInput,
  marketBasis: Scope2MarketBasis | null = null,
): RecordEmissionResult {
  if (marketBasis && factor.scope !== "scope_2") {
    return {
      ok: false,
      refusal: "basis_off_scope_2",
      reason:
        "A market-based basis applies to scope 2 only. This factor is not a scope 2 row, so no market-based figure is produced for it.",
    };
  }

  if (factor.resultUnit !== "kg_co2e") {
    return {
      ok: false,
      refusal: "factor_is_not_an_emission",
      reason: NOT_AN_EMISSION,
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
      /* On the market lane the lane labels the figure, not the factor row. That
         is a no-op on the contractual basis — the row is already
         `market_based` — and it is the whole point on the grid-average one. */
      scope2Method: marketBasis ? "market_based" : factor.scope2Method,
      scope2MarketBasis: marketBasis,
      gwpSet: factor.gwpSet,
      biogenic: factor.biogenic,
      outsideOfScopes: factor.scope === "outside_of_scopes",
      engineVersion: ENGINE_VERSION,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Which factors may be offered for a pair                                    */
/* -------------------------------------------------------------------------- */

/** The two ways a factor can be ineligible for a `(category, unit)` pair
    *before* any quantity exists. Both are members of {@link EmissionRefusal}
    rather than a second vocabulary — they are the same two refusals
    {@link calculateRecordEmission} would produce, asked in advance. */
export type FactorIneligibility = Extract<
  EmissionRefusal,
  "factor_is_not_an_emission" | "unit_mismatch"
>;

export type FactorEligibility =
  | { ok: true }
  | { ok: false; refusal: FactorIneligibility; reason: string };

/**
 * Can this factor produce a figure for activity measured in `unit`?
 *
 * **The engine's own rule, asked before a record exists**, so the mapping
 * surface can offer a reporter only the rows that would actually calculate.
 * Without it an owner can "fix" an unmapped pair and change nothing but the
 * refusal reason: the records stay outside the total, and the coverage line
 * still says the total is incomplete — a dead end that looks like an action.
 *
 * **Built on `convertQuantity` and the same `result_unit` check, not a second
 * copy of either.** The two checks below are the first two
 * {@link calculateRecordEmission} performs, in its order, reading the same
 * table and returning the same sentences. A third copy of the unit rule is
 * exactly how a picker starts offering rows the engine refuses.
 *
 * The quantity is `ZERO` because a conversion's *possibility* is a property of
 * the two units and nothing else — `convertQuantity` refuses on dimension and
 * on representability, never on a value. The three refusals
 * {@link calculateRecordEmission} can still produce afterwards
 * (`unreadable_quantity`, `unreadable_factor`, `gas_not_priceable`) depend on
 * data this function is not given, and are deliberately not guessed at here.
 */
export function factorEligibility(
  factor: Pick<FactorInput, "activityUnit" | "resultUnit">,
  unit: ActivityUnit,
): FactorEligibility {
  if (factor.resultUnit !== "kg_co2e") {
    return {
      ok: false,
      refusal: "factor_is_not_an_emission",
      reason: NOT_AN_EMISSION,
    };
  }

  const converted = convertQuantity(ZERO, unit, factor.activityUnit);
  if (!converted.ok) {
    return { ok: false, refusal: "unit_mismatch", reason: converted.reason };
  }

  return { ok: true };
}

/**
 * Every published denominator an activity in `unit` can be calculated against.
 *
 * **Derived from {@link factorEligibility}, never enumerated by hand.** It is
 * what lets `lib/db/factor-search-queries.ts` narrow a factor search in SQL without
 * restating the engine's unit rule: the query filters `activity_unit` to this
 * list, and the action re-checks the chosen row against the predicate itself.
 * A hand-written list here would be a second definition of the same rule and
 * would drift the first time a unit is added.
 */
export function admissibleFactorUnits(
  unit: ActivityUnit,
): FactorActivityUnit[] {
  return FACTOR_ACTIVITY_UNITS.filter(
    (activityUnit) =>
      factorEligibility({ activityUnit, resultUnit: "kg_co2e" }, unit).ok,
  );
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

/** A year whose records are mapped but fall outside every visible factor set's
    window, with how many records sit in it.

    **Keyed by year, not by pair, and that is the point.** The action a reporter
    can take is to load that year's factor set; grouping by `(category, unit)`
    would name the pairs and hide the one fact that resolves all of them. */
export type OutOfPeriodYear = {
  /** `"2025"` — the first four characters of the record's own `activityDate`,
      sliced rather than parsed, for the reason {@link monthOf} records. */
  year: string;
  recordCount: number;
};

export type CoverageReport = {
  totalRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
  /** Sorted by `recordCount` descending, then by category and unit, so the
      list is stable across runs and the biggest gap reads first.

      **Only `no_mapping`.** A record refused as `out_of_period` is mapped, and
      putting it here would make this list disagree with `listFactorCoverage`,
      which mirrors the same question in SQL. */
  unmatchedPairs: UnmatchedPair[];
  /** Mapped records no visible set's window covers, by year. Sorted the same
      way `unmatchedPairs` is: `recordCount` descending, then the key. */
  outOfPeriodYears: OutOfPeriodYear[];
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
      the figure. Since prompt 85 both methods can appear. */
  scope2Methods: Scope2Method[];
  /**
   * The market-based scope 2 figure — prompt 85, and **an addend of nothing
   * above**.
   *
   * The Scope 2 Guidance requires dual reporting: "Companies with any
   * operations in markets providing product or supplier-specific data in the
   * form of contractual instruments shall report scope 2 emissions in two ways
   * and label each result according to the method". Two figures for the same
   * consumption is the point, and adding them would be double counting.
   *
   * `scope2` and `total` therefore keep meaning the location-based reading
   * exactly as they did before this field existed, which is what stops a stored
   * report snapshot, a filed target or an alert from silently restating.
   */
  scope2MarketBased: Decimal;
  /** `scope1 + scope2MarketBased + scope3` — the same inventory read on the
      market lane. **Comparable to `total` only where the market lane covers
      every scope 2 record**; the count is carried by
      {@link scope2MarketBasedRecords} and stated beside the figure on every
      surface. **A record with no market-lane mapping is still substituted for
      by nothing** — since prompt 86 a reporter may map the grid average as an
      explicit rung-5 fallback, and where they have,
      {@link scope2MarketBasedFallback} says how much of this figure rests on
      it. Nothing is ever substituted on their behalf. */
  totalMarketBased: Decimal;
  /** How many scope 2 figures each lane holds, so a surface can state the
      market lane's coverage rather than implying it is complete. */
  scope2Records: number;
  scope2MarketBasedRecords: number;
  /**
   * How much of {@link scope2MarketBased} rests on the Guidance's rung 5 — the
   * reporter-chosen grid-average fallback (prompt 86). **An addend of
   * `scope2MarketBased`, not a third lane**: the hierarchy's rungs are all
   * market-based data, and a figure resting on rung 5 is still the market-based
   * reading of that consumption. It is carried separately so a surface can say
   * *how much* of the market-based total is a fallback rather than only how
   * many records are.
   */
  scope2MarketBasedFallback: Decimal;
  scope2MarketBasedFallbackRecords: number;
};

export type AggregateResult = {
  totals: ScopeTotals;
  coverage: CoverageReport;
  emissions: RecordEmission[];
};

/** Why a resolver produced no factor. **Two facts, not one.** Until prompt 68
    the resolver returned `FactorInput | null` and `null` collapsed "this pair is
    unmapped" into the same bucket as "this pair is mapped, but no visible set
    covers the record's date" — two different gaps with two different fixes. */
export type FactorGap = "no_mapping" | "out_of_period";

export type FactorResolution =
  | {
      ok: true;
      factor: FactorInput;
      /** The lane's own assertion, when the resolver is a market-lane one —
          prompt 86. Absent on the default lane, and absent is not a default:
          it means "this figure is whatever the factor row says it is". */
      marketBasis?: Scope2MarketBasis | null;
    }
  | { ok: false; gap: FactorGap };

/**
 * How a caller resolves a record to a factor. **Deterministic in this step**:
 * `lib/db/emission-queries.ts` passes a lookup over the organisation's
 * `activity_factor_mapping`, keyed on `(category, unit)`, which then selects
 * among that mapping's siblings by the record's own `activityDate`.
 *
 * **The whole record is the input, and always was** — which is what let date
 * selection arrive without changing this signature's input side. The engine
 * hands over everything it knows and takes back a tagged answer.
 *
 * It is a parameter rather than a table inside this module so the engine stays
 * pure and so the seam a model would one day occupy is explicit — AGENTS.md 5.3
 * sanctions embeddings plus rerank *here*, selecting a factor, and nowhere near
 * the arithmetic below.
 */
export type FactorResolver = (record: ActivityInput) => FactorResolution;

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
  const outOfPeriod = new Map<string, OutOfPeriodYear>();
  const refusals = new Map<string, { refusal: EmissionRefusal; reason: string; recordCount: number }>();

  for (const record of records) {
    const resolution = resolve(record);
    if (!resolution.ok) {
      if (resolution.gap === "out_of_period") {
        const year = record.activityDate.slice(0, 4);
        const seen = outOfPeriod.get(year);
        if (seen) seen.recordCount += 1;
        else outOfPeriod.set(year, { year, recordCount: 1 });
        continue;
      }

      /* A `.` separator, the one `buildFactorResolver` already keys on. It was
         a NUL byte until prompt 68, which made `file` report this module as
         `data` and made `grep` return nothing for the whole file — a session
         grepping the engine got an empty result and a wrong conclusion. Neither
         enum vocabulary contains a dot, so the key is as unambiguous as it was.
         This moves no number. */
      const key = `${record.category}.${record.unit}`;
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

    const result = calculateRecordEmission(
      record,
      resolution.factor,
      resolution.marketBasis ?? null,
    );
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

  const outOfPeriodYears = [...outOfPeriod.values()].sort(
    (a, b) => b.recordCount - a.recordCount || a.year.localeCompare(b.year),
  );

  /* Every record that produced no figure, whichever of the five refusals it
     hit. `matchedRecords + unmatchedRecords === totalRecords` is what makes the
     coverage line honest, so a new refusal channel has to be added here too. */
  const unmatchedRecords =
    unmatchedPairs.reduce((n, pair) => n + pair.recordCount, 0) +
    outOfPeriodYears.reduce((n, entry) => n + entry.recordCount, 0) +
    [...refusals.values()].reduce((n, entry) => n + entry.recordCount, 0);

  return {
    totals: totalsOf(emissions),
    coverage: {
      totalRecords: records.length,
      matchedRecords: emissions.length,
      unmatchedRecords,
      unmatchedPairs,
      outOfPeriodYears,
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

  /* **The market lane is partitioned out before anything is summed** — prompt
     85. A market-based figure is a second reading of electricity the
     location-based figure has already counted, so a `scope_2` sum that
     included it would double-count that consumption in `scope2` and in
     `total`. Every existing field below is therefore computed over
     `primary` and the market figure is computed separately. */
  const primary = inScope.filter((e) => e.scope2Method !== "market_based");
  const marketBased = inScope.filter((e) => e.scope2Method === "market_based");

  const byScope = (scope: EmissionScope) =>
    sum(primary.filter((e) => e.scope === scope).map((e) => e.kgCo2e));

  const scope1 = byScope("scope_1");
  const scope2 = byScope("scope_2");
  const scope3 = byScope("scope_3");
  const scope2MarketBased = sum(marketBased.map((e) => e.kgCo2e));
  /* Rung 5's own share of that figure — prompt 86. Inside the market total,
     never beside it. */
  const fallback = marketBased.filter(
    (e) => e.scope2MarketBasis === "grid_average",
  );

  const categories = new Map<Scope3Category, Decimal>();
  for (const emission of primary) {
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
    scope2MarketBased,
    totalMarketBased: sum([scope1, scope2MarketBased, scope3]),
    scope2Records: primary.filter((e) => e.scope === "scope_2").length,
    scope2MarketBasedRecords: marketBased.length,
    scope2MarketBasedFallback: sum(fallback.map((e) => e.kgCo2e)),
    scope2MarketBasedFallbackRecords: fallback.length,
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

/**
 * A `"YYYY-MM"` month as a single ordinal, so two months compare and subtract
 * as integers rather than as strings. {@link monthLabel} is its inverse.
 *
 * Shared by `lib/domain/dashboard.ts` and `lib/domain/targets.ts` — both walk
 * fixed month windows, and a month-arithmetic bug fixed in one used to have to
 * be remembered in the other.
 */
export function monthIndex(month: string): number {
  const year = Number.parseInt(month.slice(0, 4), 10);
  const monthNumber = Number.parseInt(month.slice(5, 7), 10);
  return year * 12 + monthNumber - 1;
}

/** {@link monthIndex}'s inverse. */
export function monthLabel(index: number): string {
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

/**
 * The one 12 behind "the latest 12 complete months" everywhere that phrase is
 * true: `/dashboard`'s trailing window, a projection's minimum history, and a
 * report's covered period. `lib/domain/dashboard.ts`, `targets.ts` and
 * `reports.ts` each read this rather than restating `12`, so the number
 * driving the windowing and the number printed in report prose cannot drift
 * apart from each other.
 */
export const REPORTING_WINDOW_MONTHS = 12;

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

/**
 * Normalising a DESNZ ("DEFRA") flat-file row into this codebase's vocabulary —
 * build step 10.
 *
 * Pure, like the rest of `lib/domain/` (AGENTS.md 6.2): the seeder reads the
 * CSV and writes the database, and everything between those two acts is here,
 * so the reading of the publisher's file is independently testable without one.
 *
 * ---
 *
 * ## The finding that shapes this module
 *
 * **Every value DEFRA publishes is already a CO2 equivalent, including the
 * per-gas rows**, and treating them otherwise would double-count by a factor of
 * 28 or 265.
 *
 * The flat file's `GHG/Unit` column reads `kg CO2e`, `kg CO2e of CO2 per unit`,
 * `kg CO2e of CH4 per unit` and `kg CO2e of N2O per unit`. The natural reading
 * of the third is "the CH4 emitted", and it is wrong. The 2026 methodology
 * report is explicit (paragraph 1.9):
 *
 * > Values for the non-carbon dioxide (CO2) GHGs, methane (CH4) and nitrous
 * > oxide (N2O), are presented as CO2 equivalents (CO2e), using Global Warming
 * > Potential (GWP) factors from the [IPCC's] fifth assessment report (IPCC,
 * > 2014) (GWP for CH4 = 28, GWP for N2O = 265).
 *
 * So the per-gas rows say *which gas contributed* how much CO2e — the GWP is
 * already inside the number. Every row therefore normalises to `gas: "co2e"`,
 * which is exactly the value `lib/domain/gwp.ts` refuses to apply a second GWP
 * to. The publisher's own wording survives verbatim in
 * `emission_factor.published_ghg_unit`, so nothing is lost by normalising.
 *
 * A consequence worth stating: **`gwp_set` never enters the arithmetic for a
 * DEFRA row.** It is provenance — a record of the basis the publisher used —
 * and the `gas: "co2e"` refusal is what guarantees it stays that way.
 *
 * ## Sourcing
 *
 * Everything below is read from the 2026 methodology report, downloaded and
 * searched on 10 Aug 2026:
 * <https://assets.publishing.service.gov.uk/media/6a2940543b15d05a7ce3202e/2026-GHG-conversion-factors-methodology-report.pdf>
 *
 * Judgements are labelled as judgements where they appear (AGENTS.md 12
 * rule 4). The GWP-basis table is measured from the publication; the scope 3
 * category assignment is not, and says so.
 */

import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import type {
  EmissionScope,
  FactorActivityUnit,
  FactorResultUnit,
  GhgGas,
  GwpSet,
  Scope2Method,
  Scope3Category,
} from "../validation/emissions";

/** One row of the committed seed CSV, by its header names. */
export type DefraRow = {
  id: string;
  scope: string;
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
  column_text: string;
  uom: string;
  ghg_unit: string;
  value: string;
};

export type NormalisedFactor = {
  sourceRowId: string;
  level1: string | null;
  level2: string | null;
  level3: string | null;
  level4: string | null;
  columnText: string | null;
  publishedUom: string;
  publishedGhgUnit: string;
  scope: EmissionScope;
  scope3Category: Scope3Category | null;
  scope2Method: Scope2Method | null;
  activityUnit: FactorActivityUnit;
  resultUnit: FactorResultUnit;
  gas: GhgGas;
  gwpSet: GwpSet;
  region: string | null;
  biogenic: boolean;
  value: string;
};

export type NormaliseResult =
  | { ok: true; factor: NormalisedFactor }
  | { ok: false; reason: string };

/* -------------------------------------------------------------------------- */
/*  Scope                                                                      */
/* -------------------------------------------------------------------------- */

const SCOPES: Record<string, EmissionScope> = {
  "Scope 1": "scope_1",
  "Scope 2": "scope_2",
  "Scope 3": "scope_3",
  "Outside of Scopes": "outside_of_scopes",
};

/* -------------------------------------------------------------------------- */
/*  Units                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The fifteen denominators the 2026 flat file uses, normalised.
 *
 * The five that map to `unknown_unit` are not oversights. `miles` and `GJ` are
 * real quantities that the activity model simply has no exact conversion to —
 * neither is a power of ten from any unit it records, and
 * `lib/domain/emissions.ts` refuses rather than multiplying by an approximate
 * 1.609. DEFRA publishes a `km` row beside almost every `miles` row, so the
 * remedy is to map the other row. `passenger.km`, `Room per night` and
 * `per FTE Working Hour` are quantities the activity model does not capture at
 * all.
 */
const ACTIVITY_UNITS: Record<string, FactorActivityUnit> = {
  kWh: "kwh",
  "kWh (Net CV)": "kwh_net_cv",
  "kWh (Gross CV)": "kwh_gross_cv",
  litres: "litres",
  "cubic metres": "cubic_metres",
  "million litres": "million_litres",
  kg: "kg",
  tonnes: "tonnes",
  km: "km",
  "tonne.km": "tonne_km",
  miles: "unknown_unit",
  GJ: "unknown_unit",
  "passenger.km": "unknown_unit",
  "Room per night": "unknown_unit",
  "per FTE Working Hour": "unknown_unit",
};

/**
 * What a row produces.
 *
 * **514 rows of the 2026 set produce kWh, not emissions** — the `SECR kWh`
 * families, which exist so a reporter can derive energy consumption from a
 * distance travelled. They are seeded because the set is stored as published,
 * and the engine refuses them by `result_unit` rather than letting energy be
 * summed into a carbon total.
 */
const RESULT_UNITS: Record<string, FactorResultUnit> = {
  "kg CO2e": "kg_co2e",
  "kg CO2e of CO2 per unit": "kg_co2e",
  "kg CO2e of CH4 per unit": "kg_co2e",
  "kg CO2e of N2O per unit": "kg_co2e",
  "kWh (Net CV)": "kwh",
  "kWh (net)": "kwh",
};

/** The combined row, as opposed to its three per-gas siblings. The default
    mappings select these — see `gas_basis` on the set. */
export const COMBINED_GHG_UNIT = "kg CO2e";

/* -------------------------------------------------------------------------- */
/*  GWP basis                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which assessment report each family's GWPs are stated under.
 *
 * **Measured from the publication, not judged.** Table 1 of the 2026
 * methodology report ("Summary of conversion factors that are in AR4 or/and AR5
 * basis GWPs") lists every family in one column or the other. The table's tick
 * glyphs do not survive text extraction, but their *column position* does, and
 * reading the ticks by position gives: **AR4 for Bioenergy, WTT Bioenergy and
 * Material Use; AR5 for every other family in the table.**
 *
 * Two qualifications the publication itself states, recorded rather than
 * papered over:
 *
 * - **Hotel Stay is ticked in both columns.** Footnote 6 explains why —
 *   "different countries could be in either AR4 or AR5 basis" — and the file
 *   carries nothing that resolves it per row. It is assigned AR5 here, which
 *   is the set's headline basis (paragraph 1.9), and the ambiguity is recorded
 *   in `docs/backend.md` rather than hidden.
 * - **Refrigerants are AR5 "where AR5 values were available, and AR6
 *   otherwise"** (footnote 3). Which rows fell to AR6 is not stated per row, so
 *   they are assigned AR5 and the caveat is recorded.
 *
 * Neither qualification moves a number: every DEFRA value is already CO2e, so
 * `gwp_set` is provenance and is never multiplied by anything.
 */
const AR4_FAMILIES = new Set([
  "Bioenergy",
  "WTT- bioenergy",
  "Material use",
]);

/* -------------------------------------------------------------------------- */
/*  Scope 3 categories                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `Level 1` to a Table 5.3 category.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). DEFRA's flat file
 * carries no scope 3 category column — its hierarchy is organised by activity
 * type, not by the Corporate Value Chain Standard — so this is this
 * codebase's reading of which category each family reports under, and a
 * reporter with a different value-chain boundary may legitimately disagree.
 *
 * A family that is genuinely ambiguous is left **unassigned** rather than
 * guessed. `Freighting goods` is the clearest case: the same tonne-kilometre is
 * category 4 when it is inbound and category 9 when it is outbound, and nothing
 * in the row says which. It is assigned category 4 because the activity model
 * records a company's own purchased freight, and that reading is recorded here
 * rather than presented as the standard's.
 */
const SCOPE3_CATEGORIES: Record<string, Scope3Category> = {
  /* Category 3 — fuel- and energy-related activities not in scope 1 or 2.
     Every well-to-tank family belongs here, as do grid T&D losses: the Scope 2
     Guidance puts generation in scope 2 and the losses in scope 3. */
  "WTT- fuels": "c3_fuel_and_energy_related_activities",
  "WTT- UK electricity": "c3_fuel_and_energy_related_activities",
  "WTT- heat and steam": "c3_fuel_and_energy_related_activities",
  "WTT- bioenergy": "c3_fuel_and_energy_related_activities",
  "Transmission and distribution": "c3_fuel_and_energy_related_activities",
  "UK electricity T&D for EVs": "c3_fuel_and_energy_related_activities",

  /* Category 4 — upstream transportation and distribution. See the docblock on
     why freighting is read as upstream. */
  "Freighting goods": "c4_upstream_transportation_and_distribution",
  "Delivery vehicles": "c4_upstream_transportation_and_distribution",
  "WTT- delivery vehs & freight": "c4_upstream_transportation_and_distribution",

  /* Category 5 — waste generated in operations. */
  "Waste disposal": "c5_waste_generated_in_operations",

  /* Category 6 — business travel, including the hotel nights that go with it. */
  "Business travel- air": "c6_business_travel",
  "Business travel- land": "c6_business_travel",
  "Business travel- sea": "c6_business_travel",
  "Hotel stay": "c6_business_travel",
  "WTT- business travel- air": "c6_business_travel",
  "WTT- business travel- sea": "c6_business_travel",
  "WTT- pass vehs & travel- land": "c6_business_travel",

  /* Category 7 — employee commuting, which the standard's guidance extends to
     teleworking. */
  Homeworking: "c7_employee_commuting",

  /* Category 1 — purchased goods and services. */
  "Material use": "c1_purchased_goods_and_services",
  "Water supply": "c1_purchased_goods_and_services",
  "Water treatment": "c1_purchased_goods_and_services",
};

/* -------------------------------------------------------------------------- */
/*  Biogenic                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether a row is biomass carbon, which "shall not be included in scope 1 but
 * reported separately".
 *
 * `Outside of Scopes` is the publisher's own bucket for it and is handled by
 * the scope alone. The `Bioenergy` family is flagged here as well: its rows
 * sit in scope 1 and scope 3 and are the combustion of biomass, which the
 * aggregation carries out of every scope total.
 */
const BIOGENIC_FAMILIES = new Set(["Bioenergy", "WTT- bioenergy"]);

/* -------------------------------------------------------------------------- */
/*  Normalisation                                                              */
/* -------------------------------------------------------------------------- */

const blankToNull = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

/**
 * Reads one published row into the schema's vocabulary, or reports why it
 * cannot.
 *
 * A refusal is never a fallback row: an unrecognised scope, denominator or
 * numerator means the publisher changed something, and a seeder that guessed
 * would put an unnoticed wrong factor in front of a disclosure.
 */
export function normaliseDefraRow(row: DefraRow): NormaliseResult {
  const value = row.value.trim();
  if (value === "") {
    return {
      ok: false,
      reason:
        "The row carries no factor value. DEFRA publishes the hierarchy for some rows without a number; 1,705 of the 2026 set are like this.",
    };
  }

  const scope = SCOPES[row.scope];
  if (!scope) {
    return { ok: false, reason: `Unrecognised scope "${row.scope}".` };
  }

  const activityUnit = ACTIVITY_UNITS[row.uom];
  if (!activityUnit) {
    return { ok: false, reason: `Unrecognised unit of measure "${row.uom}".` };
  }

  const resultUnit = RESULT_UNITS[row.ghg_unit];
  if (!resultUnit) {
    return { ok: false, reason: `Unrecognised GHG/Unit "${row.ghg_unit}".` };
  }

  const family = row.level_1.trim();

  return {
    ok: true,
    factor: {
      sourceRowId: row.id.trim(),
      level1: blankToNull(row.level_1),
      level2: blankToNull(row.level_2),
      level3: blankToNull(row.level_3),
      level4: blankToNull(row.level_4),
      columnText: blankToNull(row.column_text),
      publishedUom: row.uom.trim(),
      publishedGhgUnit: row.ghg_unit.trim(),
      scope,
      scope3Category: scope === "scope_3" ? SCOPE3_CATEGORIES[family] ?? null : null,
      /* This step produces location-based scope 2 only, and the label travels
         with every figure that comes from one of these rows. */
      scope2Method: scope === "scope_2" ? "location_based" : null,
      activityUnit,
      resultUnit,
      /* Already a CO2 equivalent — every row, including the per-gas siblings.
         See the module docblock; this is the finding the module exists for. */
      gas: "co2e",
      gwpSet: AR4_FAMILIES.has(family) ? "AR4" : "AR5",
      /* DESNZ publishes UK factors. The few families that name another country
         do so in their hierarchy, which is kept verbatim. */
      region: "UK",
      biogenic: BIOGENIC_FAMILIES.has(family),
      value,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  The default mappings                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The `(category, unit)` pairs a new organisation starts with.
 *
 * **Every one of these is a judgement, not a measurement** (AGENTS.md 12
 * rule 4). There is no customer file to fit against; each is the most
 * defensible general-purpose row for a pair, and each is meant to be overridden
 * by a reporter who knows their own fuel, grid or waste stream. Eleven of the
 * sixty-four possible pairs are seeded and the rest are deliberately empty —
 * an unmapped pair is surfaced as unmatched, which is a legible gap, where a
 * wrong default is an invisible error.
 *
 * Two choices are worth their reasoning:
 *
 * - **`fuel` + `kWh` selects the Gross CV natural-gas row, not Net CV.** The
 *   2026 methodology report, paragraph 2.9: "Natural gas consumption figures
 *   quoted in kilowatt hours (kWh) by suppliers in the UK are generally
 *   calculated (from the volume of gas used) on a Gross CV basis. Therefore,
 *   the emission factor for energy consumption on a Gross CV basis should be
 *   used by default ... unless your supplier specifically states they have used
 *   Net CV basis". **This corrects `prompts/58`**, which recorded Net CV as
 *   DEFRA's default and instructed that it be confirmed against the
 *   methodology report rather than trusted — it was, and it was wrong.
 * - **`waste` + `kg` and `waste` + `t` both select the tonnes-denominated
 *   row.** The engine converts kg to tonnes exactly, so one factor serves both
 *   and no second choice has to be kept consistent with the first.
 *
 * `other` is deliberately unmapped in every unit: it is the category a person
 * chooses when none of the seven fits, and no factor is defensible for it.
 */
export const DEFAULT_FACTOR_MAPPINGS: {
  category: ActivityCategory;
  unit: ActivityUnit;
  sourceRowId: string;
  /** What the row is, for the record and for a reviewer reading the seed. */
  description: string;
}[] = [
  {
    category: "electricity",
    unit: "kWh",
    sourceRowId: "7_400_4000_5_1",
    description: "UK electricity generated — scope 2, location-based",
  },
  {
    category: "electricity",
    unit: "MWh",
    sourceRowId: "7_400_4000_5_1",
    description: "UK electricity generated — scope 2, location-based",
  },
  {
    category: "fuel",
    unit: "kWh",
    sourceRowId: "1_100_1004_6_1",
    description: "Natural gas, Gross CV — the UK supplier default",
  },
  {
    category: "fuel",
    unit: "m3",
    sourceRowId: "1_100_1004_1_1",
    description: "Natural gas, per cubic metre",
  },
  {
    category: "fuel",
    unit: "L",
    sourceRowId: "1_101_1011_8_1",
    description: "Diesel, average biofuel blend — forecourt diesel",
  },
  {
    category: "heat",
    unit: "kWh",
    sourceRowId: "10_401_4003_5_1",
    description: "District heat and steam — scope 2, location-based",
  },
  {
    category: "water",
    unit: "m3",
    sourceRowId: "17_404_4005_1_1",
    description: "Water supply",
  },
  {
    category: "waste",
    unit: "t",
    sourceRowId: "20_507_5313_15_1",
    description: "Commercial and industrial waste to landfill",
  },
  {
    category: "waste",
    unit: "kg",
    sourceRowId: "20_507_5313_15_1",
    description: "Commercial and industrial waste to landfill",
  },
  {
    category: "travel",
    unit: "km",
    sourceRowId: "25_301_3074_4_1",
    description: "Average car, unknown fuel",
  },
  {
    category: "freight",
    unit: "tkm",
    sourceRowId: "27_304_3140_14_1",
    description: "Average non-refrigerated HGV, average laden",
  },
];

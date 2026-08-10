/**
 * Global warming potentials, as versioned tables — build step 10.
 *
 * Pure, like the rest of `lib/domain/` (AGENTS.md 6.2). No I/O, no clock.
 *
 * ---
 *
 * ## The GWP set is a property of a factor row, not of the dataset
 *
 * This is the trap the whole module exists to make un-hittable. DEFRA's own
 * 2026 methodology puts some fuel families on AR4 and most on AR5, and prices
 * refrigerants that have no AR5 value on AR6 or on the EU F-gas Annex IV list.
 * A single global `GWP_SET` constant would therefore be wrong for part of any
 * real dataset, which is why `emission_factor.gwp_set` is a column and why
 * every computed figure records the set it was produced under.
 *
 * ## The values
 *
 * From **GHG Protocol's "Global Warming Potential Values", August 2024**, the
 * 100-year values:
 *
 * | gas | AR4 | AR5 | AR6 |
 * | --- | --- | --- | --- |
 * | CO2 | 1 | 1 | 1 |
 * | CH4, non-fossil | 25 | 28 | 27.0 |
 * | CH4, fossil | — | 30 | 29.8 |
 * | N2O | 298 | 265 | 273 |
 * | SF6 | 22,800 | 23,500 | 24,300 |
 * | NF3 | 17,200 | 16,100 | 17,400 |
 *
 * **Provenance, stated plainly** (AGENTS.md 12 rules 1, 2): these were fetched
 * from the publication on 10 Aug 2026 while `prompts/58-emission-factors-and-
 * calculation-engine.md` was written, and are reproduced here from that file.
 * They could **not** be re-verified at execution time — `ghgprotocol.org` is
 * unreachable from the build environment — so they are recorded as sourced then,
 * not as re-checked now. `docs/backend.md` says the same.
 *
 * **AR4 has no fossil/non-fossil CH4 split**, and this table does not invent
 * one. Asking for it returns a typed refusal, which is the point of
 * {@link lookupGwp} returning a result rather than a number.
 *
 * **The halocarbons are deliberately absent.** DEFRA's `Refrigerant & other`
 * category alone names ~170 species, and none of their GWPs was verified this
 * session. A missing gas is a legible refusal; a remembered GWP for HFC-134a in
 * a disclosure is exactly the fabrication AGENTS.md 12 rule 7 forbids. They are
 * added when a session can read them from the publication — until then, the
 * refrigerant rows are usable only through their combined `kg CO2e` factor,
 * which carries the publisher's own GWP already applied and needs no lookup.
 *
 * ## Which CH4 variant to use
 *
 * Per GHG Protocol's own instruction in that publication: use the
 * **non-fossil** value for all *combustion* emissions, **including fossil-fuel
 * combustion**. The fossil value carries an extra term for the CO2 produced
 * when atmospheric methane oxidises, which for a combustion source is already
 * counted as the fuel's own CO2 — applying it there double-counts. The fossil
 * value is for **fugitive** fossil methane: venting, leakage, unburnt release.
 *
 * `emission_factor.ch4_variant` records which applies to a row, so the choice
 * is made once at seed time by someone reading the source, and never inferred
 * at calculation time.
 */

import {
  CH4_VARIANTS,
  GHG_GASES,
  GWP_SETS,
  type Ch4Variant,
  type GhgGas,
  type GwpSet,
} from "../validation/emissions";
import { decimal, type Decimal } from "./decimal";

export type GwpLookupResult =
  | { ok: true; value: Decimal; set: GwpSet }
  /** Never a fallback number. A caller that cannot price a gas must decline to
      produce a figure, not produce a plausible one (AGENTS.md 5.3). */
  | { ok: false; reason: string };

/**
 * The tables, as decimal strings so the values enter the arithmetic exactly.
 *
 * `27.0` is written with its trailing zero because the publication prints it
 * that way; `Decimal` preserves the scale and {@link compare} treats it as
 * equal to `27`, so the fidelity costs nothing.
 *
 * `null` means the assessment report does not publish that value — AR4's
 * fossil-CH4 cell. It is not zero and it is not the non-fossil value.
 */
const TABLES: Record<
  GwpSet,
  {
    co2: string;
    ch4Combustion: string;
    ch4Fugitive: string | null;
    n2o: string;
    sf6: string;
    nf3: string;
  }
> = {
  AR4: {
    co2: "1",
    ch4Combustion: "25",
    ch4Fugitive: null,
    n2o: "298",
    sf6: "22800",
    nf3: "17200",
  },
  AR5: {
    co2: "1",
    ch4Combustion: "28",
    ch4Fugitive: "30",
    n2o: "265",
    sf6: "23500",
    nf3: "16100",
  },
  AR6: {
    co2: "1",
    ch4Combustion: "27.0",
    ch4Fugitive: "29.8",
    n2o: "273",
    sf6: "24300",
    nf3: "17400",
  },
};

/**
 * The 100-year GWP for one gas under one assessment report.
 *
 * @param set which assessment report the factor row is stated under —
 * `emission_factor.gwp_set`, never a global default.
 * @param gas the gas the factor row prices.
 * @param ch4Variant required when `gas` is `ch4`, ignored otherwise. See the
 * module docblock for which to pass.
 */
export function lookupGwp(
  set: GwpSet,
  gas: GhgGas,
  ch4Variant?: Ch4Variant,
): GwpLookupResult {
  const table = TABLES[set];

  switch (gas) {
    case "co2e":
      return {
        ok: false,
        reason:
          "A CO2e factor already carries its publisher's GWP. Applying another one would double-convert it.",
      };
    case "co2":
      return { ok: true, value: decimal(table.co2), set };
    case "n2o":
      return { ok: true, value: decimal(table.n2o), set };
    case "sf6":
      return { ok: true, value: decimal(table.sf6), set };
    case "nf3":
      return { ok: true, value: decimal(table.nf3), set };
    case "ch4": {
      if (!ch4Variant) {
        return {
          ok: false,
          reason:
            "CH4 needs a variant: 'combustion' for anything burnt, 'fugitive' for vented or leaked methane.",
        };
      }
      if (ch4Variant === "combustion") {
        return { ok: true, value: decimal(table.ch4Combustion), set };
      }
      if (table.ch4Fugitive === null) {
        return {
          ok: false,
          reason: `${set} publishes no separate fossil-methane GWP. Use AR5 or AR6 for a fugitive fossil source, or state the row under a set that has one.`,
        };
      }
      return { ok: true, value: decimal(table.ch4Fugitive), set };
    }
  }
}

/** Whether a string names a gas this module can price. For the seeder, which
    reads a publisher's own label and must reject anything it does not know
    rather than defaulting it. */
export function isGhgGas(value: string): value is GhgGas {
  return (GHG_GASES as readonly string[]).includes(value);
}

export function isGwpSet(value: string): value is GwpSet {
  return (GWP_SETS as readonly string[]).includes(value);
}

export function isCh4Variant(value: string): value is Ch4Variant {
  return (CH4_VARIANTS as readonly string[]).includes(value);
}

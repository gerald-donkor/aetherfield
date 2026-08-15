import * as z from "zod";

import type { SubmitResult } from "./result";

/**
 * The calculation engine's vocabularies and its one input contract — build
 * step 10.
 *
 * **Not `server-only`, and it must stay that way** (AGENTS.md 6.3), on exactly
 * the footing `lib/validation/activity.ts` records: the `/activity` client
 * leaves and the Server Actions in `app/activity/actions.ts` both import it, so
 * the rules exist once and run twice (AGENTS.md 10 rule 1).
 *
 * **It imports nothing from `lib/db/`.** `lib/db/schema.ts` calls `pgEnum` at
 * module scope, so an import in that direction would put `drizzle-orm/pg-core`
 * into a browser bundle. The enum *members* therefore live here and `schema.ts`
 * builds its `pgEnum`s from these constants — the arrangement
 * `ACTIVITY_CATEGORIES` and `ORGANIZATION_ROLES` already use, so each union is
 * declared exactly once (AGENTS.md 9.2 rule 2).
 *
 * `lib/domain/gwp.ts` and `lib/domain/emissions.ts` import *this*, never the
 * reverse: the pure layer depends on the vocabulary, and the vocabulary depends
 * on nothing.
 */

/* -------------------------------------------------------------------------- */
/*  Scopes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The GHG Protocol Corporate Standard's three scopes, plus the bucket that is
 * **not** a scope and must never be summed into one.
 *
 * - **`scope_1`** — direct emissions from owned or controlled sources.
 * - **`scope_2`** — purchased electricity, steam, heat or cooling, as widened
 *   by the 2015 Scope 2 Guidance. **Generation only**: transmission and
 *   distribution losses are scope 3 category 3, and DEFRA ships them as
 *   separate rows for exactly that reason.
 * - **`scope_3`** — all other indirect emissions, in the fifteen categories of
 *   the Corporate Value Chain Standard's Table 5.3.
 * - **`outside_of_scopes`** — direct CO2 from biomass combustion, which the
 *   Corporate Standard says "shall not be included in scope 1 but reported
 *   separately". DEFRA ships an explicit `Outside of Scopes` bucket for it: 58
 *   rows in the 2026 set.
 *
 * **A fourth member rather than a boolean beside three**, because it is a
 * genuine fourth state of one column and AGENTS.md 9.2 rule 2 says so. The
 * aggregation in `lib/domain/emissions.ts` carries it separately and there is
 * no code path that adds it to a scope total.
 */
export const EMISSION_SCOPES = [
  "scope_1",
  "scope_2",
  "scope_3",
  "outside_of_scopes",
] as const;

export type EmissionScope = (typeof EMISSION_SCOPES)[number];

/**
 * The fifteen scope 3 categories of Table 5.3, upstream first then downstream,
 * in the standard's own numbering — which the slug carries so a person reading
 * a row does not have to hold the mapping in their head.
 */
export const SCOPE3_CATEGORIES = [
  "c1_purchased_goods_and_services",
  "c2_capital_goods",
  "c3_fuel_and_energy_related_activities",
  "c4_upstream_transportation_and_distribution",
  "c5_waste_generated_in_operations",
  "c6_business_travel",
  "c7_employee_commuting",
  "c8_upstream_leased_assets",
  "c9_downstream_transportation_and_distribution",
  "c10_processing_of_sold_products",
  "c11_use_of_sold_products",
  "c12_end_of_life_treatment_of_sold_products",
  "c13_downstream_leased_assets",
  "c14_franchises",
  "c15_investments",
] as const;

export type Scope3Category = (typeof SCOPE3_CATEGORIES)[number];

/** The label each category is rendered under. Written once so the totals
    surface and any later report cannot drift from the standard's wording. */
export const SCOPE3_CATEGORY_LABELS: Record<Scope3Category, string> = {
  c1_purchased_goods_and_services: "1. Purchased goods and services",
  c2_capital_goods: "2. Capital goods",
  c3_fuel_and_energy_related_activities:
    "3. Fuel- and energy-related activities",
  c4_upstream_transportation_and_distribution:
    "4. Upstream transportation and distribution",
  c5_waste_generated_in_operations: "5. Waste generated in operations",
  c6_business_travel: "6. Business travel",
  c7_employee_commuting: "7. Employee commuting",
  c8_upstream_leased_assets: "8. Upstream leased assets",
  c9_downstream_transportation_and_distribution:
    "9. Downstream transportation and distribution",
  c10_processing_of_sold_products: "10. Processing of sold products",
  c11_use_of_sold_products: "11. Use of sold products",
  c12_end_of_life_treatment_of_sold_products:
    "12. End-of-life treatment of sold products",
  c13_downstream_leased_assets: "13. Downstream leased assets",
  c14_franchises: "14. Franchises",
  c15_investments: "15. Investments",
};

export const EMISSION_SCOPE_LABELS: Record<EmissionScope, string> = {
  scope_1: "Scope 1",
  scope_2: "Scope 2",
  scope_3: "Scope 3",
  outside_of_scopes: "Outside of scopes",
};

/**
 * The two scope 2 accounting methods.
 *
 * **Both are produced since prompt 85**, and every scope 2 figure is labelled
 * with its method wherever it is shown — the Scope 2 Guidance requires the
 * method to travel with the number, and requires *both* figures where
 * contractual instruments exist: "Companies with any operations in markets
 * providing product or supplier-specific data in the form of contractual
 * instruments shall report scope 2 emissions in two ways and label each result
 * according to the method". `docs/backend.md` carries the quotations and their
 * retrieval date.
 *
 * **This docblock previously said that `market_based` "needs REC and GO
 * capture, supplier-specific rates and a residual-mix fallback, none of which
 * the product models yet".** One of those three now exists and two do not, so
 * the sentence is corrected here rather than left standing (AGENTS.md 12
 * rule 8):
 *
 * - **supplier-specific rates — built.** A contractual rate is entered as a
 *   customer-supplied factor through `/activity/factors`, and mapped on the
 *   market lane of `activity_factor_mapping`;
 * - **REC / GO document capture — still absent.** The instrument's *rate* is
 *   what multiplies, and that is captured; the certificate itself is not
 *   stored, so nothing in this product evidences a claim;
 * - **a residual-mix fallback — deliberately absent, not merely unbuilt.** No
 *   residual mix (rung 4) is shipped, and no grid average is ever substituted
 *   into a market-based figure *silently*. Since prompt 86 a reporter may
 *   choose the Guidance's rung 5 for a pair explicitly, and that choice is
 *   recorded as {@link SCOPE2_MARKET_BASES}' `grid_average`. **This sentence
 *   previously said "no grid average is ever substituted", full stop.** That is
 *   no longer true and is corrected here rather than left standing (AGENTS.md
 *   12 rule 8): what remains true is that nothing substitutes one on the
 *   reporter's behalf, and that a figure resting on one is labelled as such
 *   everywhere it is shown.
 */
export const SCOPE2_METHODS = ["location_based", "market_based"] as const;

export type Scope2Method = (typeof SCOPE2_METHODS)[number];

export const SCOPE2_METHOD_LABELS: Record<Scope2Method, string> = {
  location_based: "location-based",
  market_based: "market-based",
};

/**
 * What a market-based figure rests on — the rung of the Scope 2 Guidance's own
 * market-based data hierarchy the reporter asserted for that pair (prompt 86).
 *
 * **Named from the Guidance's vocabulary, not invented here.** Table 6.3,
 * "Market-based scope 2 data hierarchy examples", is quoted in full in
 * `docs/backend.md`; rungs 1–3 are energy attribute certificates, contracts for
 * electricity and supplier/utility rates, which §1.5.1 collectively calls
 * "contractual instruments" ("markets providing product or supplier-specific
 * data in the form of contractual instruments"), and **rung 5 is "Other
 * grid-average emission factors (subnational or national) — see location-based
 * data"**. Hence the two members below.
 *
 * **Rung 4, residual mix, is deliberately not a member.** Its dataset — the AIB
 * European Residual Mixes — is separately licensed and is not shipped, so a
 * value here would be a name with no way to be populated. Add it with the
 * dataset, never before it.
 *
 * **This is a reporter's assertion and is stored as one**, on the mapping and
 * on every figure computed from it, rather than derived at read time from
 * `emission_factor.scope2_method`. `lib/db/schema.ts` records the two reasons.
 */
export const SCOPE2_MARKET_BASES = [
  "contractual_instrument",
  "grid_average",
] as const;

export type Scope2MarketBasis = (typeof SCOPE2_MARKET_BASES)[number];

export const SCOPE2_MARKET_BASIS_LABELS: Record<Scope2MarketBasis, string> = {
  contractual_instrument: "contractual instrument",
  grid_average: "grid average",
};

/* -------------------------------------------------------------------------- */
/*  Gases and warming potentials                                               */
/* -------------------------------------------------------------------------- */

/** The assessment report a factor row's GWP comes from. **Per row, never per
    dataset** — `lib/domain/gwp.ts`'s docblock records why. */
export const GWP_SETS = ["AR4", "AR5", "AR6"] as const;

export type GwpSet = (typeof GWP_SETS)[number];

/**
 * The gases a factor row can be stated in.
 *
 * `co2e` is not a gas: it marks a row that is **already** a carbon-dioxide
 * equivalent, which is what DEFRA's combined `kg CO2e` rows are. Such a row
 * carries its publisher's GWP already applied and must never have another one
 * multiplied into it.
 */
export const GHG_GASES = ["co2", "ch4", "n2o", "sf6", "nf3", "co2e"] as const;

export type GhgGas = (typeof GHG_GASES)[number];

/** Which CH4 GWP applies — `combustion` for anything burnt, `fugitive` for
    vented or leaked fossil methane. `lib/domain/gwp.ts` records why the two
    differ and why combustion takes the non-fossil value. */
export const CH4_VARIANTS = ["combustion", "fugitive"] as const;

export type Ch4Variant = (typeof CH4_VARIANTS)[number];

/* -------------------------------------------------------------------------- */
/*  What a factor produces                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The numerator of a factor row — **what one unit of activity converts *into*,
 * which is not always an emission.**
 *
 * 514 of the 2026 set's rows convert an activity into `kWh` rather than into
 * kgCO2e: DEFRA's `SECR kWh` families exist so a reporter can derive energy
 * consumption from a distance travelled. They are real rows with real values
 * and they are **not** emissions; summing them into a tCO2e total would inflate
 * it silently, which is precisely the failure AGENTS.md 5.3 is about.
 *
 * Storing the numerator as an enum rather than trusting the publisher's free
 * text is what makes that un-hittable: the engine refuses any factor whose
 * `result_unit` is not `kg_co2e`.
 */
export const FACTOR_RESULT_UNITS = ["kg_co2e", "kwh"] as const;

export type FactorResultUnit = (typeof FACTOR_RESULT_UNITS)[number];

/**
 * The denominator of a factor row, normalised.
 *
 * **`unknown_unit` is a real member and carries its weight.** DEFRA publishes
 * denominators the activity model has no way to measure — `passenger.km`,
 * `Room per night`, `per FTE Working Hour` — and denominators that are not an
 * exact power-of-ten multiple of any unit it does have: `miles` and `GJ`.
 * Those rows are seeded (the set is stored as published) but can never be
 * selected, and `lib/domain/emissions.ts` refuses them by name rather than
 * approximating a conversion. A guessed 1.609 in a disclosure is a fabricated
 * number.
 *
 * The calorific-value split is part of the identity, not a note on it: DEFRA
 * publishes a Net CV and a Gross CV factor for the same fuel and the same
 * quantity of kWh, and confusing them is a silent error (the methodology
 * report's own warning).
 */
export const FACTOR_ACTIVITY_UNITS = [
  "kwh",
  "kwh_net_cv",
  "kwh_gross_cv",
  "litres",
  "cubic_metres",
  "million_litres",
  "kg",
  "tonnes",
  "km",
  "tonne_km",
  "unknown_unit",
] as const;

export type FactorActivityUnit = (typeof FACTOR_ACTIVITY_UNITS)[number];

/* -------------------------------------------------------------------------- */
/*  The recalculate action's contract                                          */
/* -------------------------------------------------------------------------- */

/**
 * `recalculate`'s one input. An import id, or nothing for the whole
 * organisation.
 *
 * A non-uuid is a forged request, not a typo, and gets the same handled failure
 * a missing import gets — every `lib/db/` call takes `organizationId` as a
 * predicate, so a cross-tenant id answers not-found rather than acting as an
 * existence oracle.
 */
export const recalculateInputSchema = z.object({
  importId: z.uuid().nullable(),
});

export type RecalculateInput = z.infer<typeof recalculateInputSchema>;

/** The recalculate action answers in the shared vocabulary (AGENTS.md 10
    rule 2). It has no form fields, so no field errors. */
export type RecalculateResult = SubmitResult;

/* -------------------------------------------------------------------------- */
/*  Customer-supplied factors                                                  */
/* -------------------------------------------------------------------------- */

const REQUIRED_TEXT = "Enter a value.";

const boundedText = (max: number, error = REQUIRED_TEXT) =>
  z.string().trim().min(1, { error }).max(max, {
    error: `Keep this to ${max.toLocaleString("en-GB")} characters or fewer.`,
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, {
      error: `Keep this to ${max.toLocaleString("en-GB")} characters or fewer.`,
    })
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .pipe(z.url({ error: "Enter a full URL, including https://." }).optional());

const dateText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: "Use an ISO date, for example 2026-01-01.",
  });

const factorDecimal = z
  .string()
  .trim()
  .regex(/^(?=.+)(?!0+(?:\.0+)?$)\d{1,5}(?:\.\d{1,17})?$/, {
    error:
      "Enter a positive decimal with at most 5 digits before the point and 17 after it.",
  });

/**
 * Which set a new factor row goes into — **an explicit choice, never an
 * inferred one** (prompt 67 decision 1).
 *
 * Prompt 66 inferred the set from the `(source, dataset_version)` typed beside
 * every row and inserted it with `onConflictDoNothing`, which silently threw
 * away the licence, effective range, source URL, reference and notes of every
 * row after the first. That licence is rendered as disclosure evidence, so a
 * correction never landed and a wrong one persisted.
 *
 * The two members are **plain object schemas** because
 * `z.discriminatedUnion` requires it — a `superRefine` produces a
 * `ZodEffects`-like wrapper and cannot be a member, so the cross-field rules
 * that belonged to the set moved onto {@link createCustomFactorSchema}'s
 * wrapper, guarded by `mode` and emitting two-segment `["set", …]` paths so the
 * existing field-error mapping is unchanged.
 */
export const newFactorSetSchema = z.object({
  mode: z.literal("new"),
  source: boundedText(120),
  datasetVersion: boundedText(120),
  publicationYear: z
    .number({ error: "Enter a publication year." })
    .int({ error: "Enter a whole year." })
    .min(1990, { error: "Enter a year from 1990 onward." })
    .max(2100, { error: "Enter a year no later than 2100." }),
  effectiveFrom: dateText,
  effectiveTo: dateText,
  licence: boundedText(240),
  licenceUrl: optionalUrl,
  sourceUrl: optionalUrl,
  sourceReference: optionalText(240),
  notes: optionalText(1000),
});

/** A set the organisation already owns. **The id is a claim, not a
    capability** — `lib/db/emission-queries.ts` re-reads it under the tenant
    predicate before a row is written into it. */
export const existingFactorSetSchema = z.object({
  mode: z.literal("existing"),
  setId: z.uuid({ error: "Choose a factor set." }),
});

export const factorSetChoiceSchema = z.discriminatedUnion("mode", [
  newFactorSetSchema,
  existingFactorSetSchema,
]);

export const customFactorSchema = z
  .object({
    level1: optionalText(160),
    level2: optionalText(160),
    level3: optionalText(160),
    level4: optionalText(160),
    columnText: optionalText(240),
    publishedUom: boundedText(120),
    publishedGhgUnit: boundedText(120),
    scope: z.enum(EMISSION_SCOPES, { error: "Choose a scope." }),
    scope3Category: z.enum(SCOPE3_CATEGORIES).optional(),
    scope2Method: z.enum(SCOPE2_METHODS).optional(),
    activityUnit: z.enum(FACTOR_ACTIVITY_UNITS, {
      error: "Choose the activity unit this factor applies to.",
    }),
    gas: z.enum(GHG_GASES, { error: "Choose a gas." }),
    ch4Variant: z.enum(CH4_VARIANTS).optional(),
    gwpSet: z.enum(GWP_SETS, { error: "Choose a GWP set." }),
    region: optionalText(120),
    biogenic: z.boolean(),
    value: factorDecimal,
    /**
     * The published row this row restates — prompt 71, and optional.
     *
     * **An object, so both halves arrive together or neither does**, mirroring
     * the database's `emission_factor_supersedes_pair` check: a half-declared
     * supersession is a row that silently supersedes nothing. Both fields are
     * required inside it, so the object itself is what carries the "together"
     * rule and no `superRefine` restates it.
     *
     * The candidate rows are passed into the form as props by the Server
     * Component that renders it. **`lib/validation/` imports nothing from
     * `lib/db/`** (AGENTS.md 6.3), so the pair is validated as text here and
     * re-read under the tenant predicate on the way in.
     */
    supersedes: z
      .object({
        source: boundedText(120),
        sourceRowId: boundedText(240),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "scope_3" && !value.scope3Category) {
      ctx.addIssue({
        code: "custom",
        path: ["scope3Category"],
        message: "Choose a scope 3 category.",
      });
    }
    if (value.scope !== "scope_3" && value.scope3Category) {
      ctx.addIssue({
        code: "custom",
        path: ["scope3Category"],
        message: "Scope 3 category only applies to scope 3.",
      });
    }

    if (value.scope === "scope_2" && !value.scope2Method) {
      ctx.addIssue({
        code: "custom",
        path: ["scope2Method"],
        message: "Choose a scope 2 method.",
      });
    }
    if (value.scope !== "scope_2" && value.scope2Method) {
      ctx.addIssue({
        code: "custom",
        path: ["scope2Method"],
        message: "Scope 2 method only applies to scope 2.",
      });
    }

    if (value.gas === "ch4" && !value.ch4Variant) {
      ctx.addIssue({
        code: "custom",
        path: ["ch4Variant"],
        message: "Choose which methane GWP applies.",
      });
    }
    if (value.gas !== "ch4" && value.ch4Variant) {
      ctx.addIssue({
        code: "custom",
        path: ["ch4Variant"],
        message: "Methane variant only applies to CH4.",
      });
    }
  });

export const createCustomFactorSchema = z
  .object({
    set: factorSetChoiceSchema,
    factor: customFactorSchema,
  })
  .superRefine((value, ctx) => {
    if (value.set.mode !== "new") return;

    if (value.set.effectiveTo < value.set.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["set", "effectiveTo"],
        message: "The end date cannot be before the start date.",
      });
    }

    if (!value.set.sourceUrl && !value.set.sourceReference) {
      ctx.addIssue({
        code: "custom",
        path: ["set", "sourceReference"],
        message: "Enter a source URL or an internal source reference.",
      });
    }
  });

/**
 * The bulk import's one validated input — **the set choice, and nothing
 * else** (prompt 82).
 *
 * The file itself travels as `FormData` and is checked the way `stageImport`
 * checks its upload: presence, size, UTF-8, then the parse. No schema can
 * usefully describe a `File`, and the parse is the real check (AGENTS.md 8.2
 * rule 3).
 *
 * The two cross-field rules are {@link createCustomFactorSchema}'s verbatim,
 * emitting the same two-segment `["set", …]` paths, so the field-error mapping
 * the factor form already uses is unchanged.
 */
export const importCustomFactorsSchema = z
  .object({ set: factorSetChoiceSchema })
  .superRefine((value, ctx) => {
    if (value.set.mode !== "new") return;

    if (value.set.effectiveTo < value.set.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["set", "effectiveTo"],
        message: "The end date cannot be before the start date.",
      });
    }

    if (!value.set.sourceUrl && !value.set.sourceReference) {
      ctx.addIssue({
        code: "custom",
        path: ["set", "sourceReference"],
        message: "Enter a source URL or an internal source reference.",
      });
    }
  });

export type ImportCustomFactorsInput = z.infer<
  typeof importCustomFactorsSchema
>;

/** One refused line of an imported file, and the reason. The line is the
    physical line the CSV parser reported, so it matches what a text editor
    shows. */
export type FactorImportRowError = { line: number; message: string };

/** The set chooser's fields, plus the file. The `set.*` half is
    {@link CustomFactorField}'s own, so the import form and the single-row form
    map errors identically. */
export type FactorImportField =
  | Extract<CustomFactorField, `set.${string}`>
  | "file";

/**
 * `importCustomFactors`'s result — a typed result like every other action's
 * (AGENTS.md 10 rule 2), widened by the two counts a bulk write has and a
 * single-row write does not.
 *
 * **`imported + skipped` is the whole file**, because the import is atomic: a
 * file with one bad row writes nothing at all and comes back with `rowErrors`.
 * `skipped` is rows the set already held — re-running the same file imports
 * nothing and says so.
 */
export type ImportCustomFactorsResult =
  | { ok: true; imported: number; skipped: number }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<FactorImportField, string>>;
      rowErrors?: FactorImportRowError[];
    };

/**
 * How many refused lines travel back to the browser.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). A file whose header
 * is right but whose values are wrong fails every row, and 8,740 sentences is
 * not an answer a person can act on — twenty is enough to see the pattern, and
 * the total is stated beside them so nothing is hidden.
 */
export const FACTOR_IMPORT_MAX_ROW_ERRORS = 20;

/** The whole-file sentence for a file that has failing rows: how many, and how
    many are shown. Written once so the action and the leaf cannot disagree. */
export function formatFactorImportRowFailure(total: number): string {
  const shown = Math.min(total, FACTOR_IMPORT_MAX_ROW_ERRORS);
  const rows = `${total.toLocaleString("en-GB")} ${total === 1 ? "row" : "rows"}`;
  return total > shown
    ? `Nothing was imported. ${rows} could not be read; the first ${shown} are listed below. Fix them and import the file again.`
    : `Nothing was imported. ${rows} could not be read. Fix ${total === 1 ? "it" : "them"} and import the file again.`;
}

/**
 * The import's own error copy, in the site's measured, operational register
 * (AGENTS.md 5): what is wrong and what to do. No apology, no exclamation.
 * The refusals it shares with the single-row path stay in
 * {@link CUSTOM_FACTOR_ERRORS} rather than being restated here.
 */
export const FACTOR_IMPORT_ERRORS = {
  invalid: "Check the marked fields and try again.",
  file: "Attach a CSV file of factor rows.",
} as const;

export const retireCustomFactorSchema = z.object({
  factorId: z.uuid({ error: "Choose a customer-supplied factor." }),
});

/* -------------------------------------------------------------------------- */
/*  A set's lifecycle — correcting its provenance, and retiring it             */
/* -------------------------------------------------------------------------- */

/**
 * The ten provenance and applicability fields of a set an owner may correct —
 * prompt 84 decision 1.
 *
 * **Derived from {@link newFactorSetSchema}, never restated.** The editable
 * field list is exactly that schema minus `mode`, so the rules a set was created
 * under are the rules it is corrected under, and a field added to one is a field
 * added to both. The Zod docs prefer the `.shape` spread over `.extend()`, and
 * spreading also puts `setId` first, which is the order the form reads in.
 *
 * **`gasBasis` is absent, and that is decision 2.** The basis is derived from
 * the rows themselves (`co2e` is combined, any other gas is per-gas) and
 * `resolveWritableSet` refuses a row whose derived basis differs from its set's.
 * Editing it here would relabel the meaning of every stored row without touching
 * one. `organizationId`, `supersededBySetId`, `createdAt` and `retrievedAt` are
 * absent for the same reason in a different direction: none of them is the
 * owner's to state.
 *
 * The two cross-field rules are {@link createCustomFactorSchema}'s verbatim.
 * **Their paths are single-segment here** — this form has no `set` wrapper — so
 * the action maps them with its own reader rather than
 * `customFactorFieldErrors`, which skips any issue with `path.length < 2`.
 */
export const editFactorSetSchema = z
  .object({
    /** A claim, not a capability — `lib/db/emission-queries.ts` re-reads it
        under the tenant predicate inside the updating transaction. */
    setId: z.uuid({ error: "Choose a factor set." }),
    ...newFactorSetSchema.omit({ mode: true }).shape,
  })
  .superRefine((value, ctx) => {
    if (value.effectiveTo < value.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "The end date cannot be before the start date.",
      });
    }

    if (!value.sourceUrl && !value.sourceReference) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceReference"],
        message: "Enter a source URL or an internal source reference.",
      });
    }
  });

export type EditFactorSetInput = z.infer<typeof editFactorSetSchema>;

/** The edit form's field names, taken from the schema so a field cannot be
    named here that the schema does not carry. */
export type EditFactorSetField = keyof EditFactorSetInput & string;

export type EditFactorSetResult = SubmitResult<EditFactorSetField>;

export const retireFactorSetSchema = z.object({
  setId: z.uuid({ error: "Choose a factor set." }),
});

/**
 * Retiring a set answers with the consequence it caused, the way
 * {@link RetireCustomFactorResult} does — and with one number more.
 *
 * `factorCount` is the set's live rows, which stay live: retirement is the set's
 * `deleted_at` and **does not cascade** (prompt 84 decision 4). Every read path
 * already excludes them through the set join, so cascading would be a second
 * source of truth for one fact. `mappingCount` is the active `(category, unit)`
 * mappings pointing at any of those rows, counted inside the retiring
 * transaction so the announced number is the number that was true at the write.
 */
export type RetireFactorSetResult =
  | { ok: true; mappingCount: number; factorCount: number }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"setId", string>>;
    };

export type CreateCustomFactorInput = z.infer<typeof createCustomFactorSchema>;

/** Distributes over the union, so `set.setId` and `set.mode` are covered
    alongside a new set's fields without restating a field list. */
type UnionKeys<T> = T extends unknown ? keyof T : never;

export type CustomFactorField =
  | `set.${UnionKeys<z.infer<typeof factorSetChoiceSchema>> & string}`
  | `factor.${keyof z.infer<typeof customFactorSchema> & string}`;

export type CustomFactorResult = SubmitResult<CustomFactorField | "factorId">;

/**
 * Retirement answers with the consequence it caused — the number of active
 * `(category, unit)` mappings that pointed at the row and are now unmapped.
 * A sibling of {@link SubmitResult } rather than a widening of it, because it is
 * the only success in phase two that carries a payload (AGENTS.md 10 rule 2:
 * still a typed result, never a thrown string).
 */
export type RetireCustomFactorResult =
  | { ok: true; mappingCount: number }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"factorId", string>>;
    };

export const CUSTOM_FACTOR_ERRORS = {
  invalid: "Check the marked fields and try again.",
  notOwner:
    "Only an owner can create or retire customer-supplied factors. A factor can move every figure in a disclosure.",
  notFound:
    "That customer-supplied factor is not available. It may already have been retired.",
  setExists:
    "Your organisation already has a set with this source and version. Choose it above instead of creating a second one.",
  /* The same collision reached from the edit form, where "choose it above" is
     not the way out — this set already exists and it is the source or the
     version that has to move (prompt 84). */
  setRenameExists:
    "Your organisation already has another set with this source and version. Give this one a different source or version.",
  notOwnerSet:
    "Only an owner can correct or retire a factor set. Its licence and effective dates are rendered as evidence beside every figure its rows produce.",
  setNotFound:
    "That factor set is not available. It may have been retired. Choose another, or create a new set.",
  gasBasisCombined:
    "This set holds combined CO2e rows. Choose CO2e, or create a new set for per-gas rows.",
  gasBasisPerGas:
    "This set holds per-gas rows. Choose a single gas, or create a new set for combined CO2e rows.",
} as const;

/**
 * The register the engine's refusals are written in — measured and
 * operational (AGENTS.md 5): what is wrong, and what it means for the total.
 * Never an apology, never an exclamation.
 */
export const EMISSION_ERRORS = {
  noMapping:
    "No emission factor is mapped to this category and unit, so these records are outside the total.",
  notCalculable:
    "These records could not be calculated. They are outside the total.",
} as const;

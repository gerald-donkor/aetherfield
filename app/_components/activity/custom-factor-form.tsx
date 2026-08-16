"use client";

import { type FormEvent, useRef, useState } from "react";

import { createCustomFactor } from "../../activity/actions";
import {
  CH4_VARIANTS,
  CUSTOM_FACTOR_ERRORS,
  EMISSION_SCOPE_LABELS,
  EMISSION_SCOPES,
  FACTOR_ACTIVITY_UNITS,
  GHG_GASES,
  GWP_SETS,
  SCOPE2_METHODS,
  SCOPE2_METHOD_LABELS,
  SCOPE3_CATEGORIES,
  SCOPE3_CATEGORY_LABELS,
  createCustomFactorSchema,
  type CustomFactorField,
  type EmissionScope,
  type GhgGas,
} from "../../../lib/validation/emissions";
import { Button, Field, SelectField, TextareaField } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * Adds one customer-supplied factor row — prompt 66, corrected by prompt 67.
 *
 * **The set is chosen, not inferred** (prompt 67 decision 1). Prompt 66 typed
 * the source and version beside every row and found-or-created the set from
 * them, which silently discarded the licence, effective range and references of
 * every row after the first — and that licence is rendered as disclosure
 * evidence. Here an owner picks an existing set or explicitly creates one, and
 * the metadata fields appear only in the second case.
 *
 * **Component-only** (the bundle rule, AGENTS.md front matter): no exported
 * constant, no exported type, no data fetching. The row list this component
 * used to render moved to the Server Component that renders it, and retirement
 * is its own leaf.
 */

/** A set this organisation already owns, as far as the form needs it. Only
    the fields rendered here cross the boundary (minimal serialized props). */
type FormFactorSet = {
  id: string;
  source: string;
  datasetVersion: string;
  publicationYear: number;
  effectiveFrom: string;
  effectiveTo: string;
  licence: string;
  gasBasis: "combined_co2e" | "per_gas";
};

/** A published row this organisation's mappings already point at, and which a
    new row may therefore declare it restates (prompt 71). */
type FormSupersedableRow = {
  source: string;
  sourceRowId: string;
  label: string;
  datasetVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
};

/** The `<option>` value, and the way back to the pair. A single string keeps
    the control a plain `<select>`; the newline cannot occur in either half,
    which come from a publisher's row id and a set's source. */
const PAIR_SEPARATOR = "\n";

const GAS_BASIS_LABEL = {
  combined_co2e: "combined CO2e rows",
  per_gas: "per-gas rows",
} as const;

/* Bottom-aligns a field's label/hint/control stack inside its grid item. A grid
   item stretches to its row's height, so a field carrying a hint used to start
   its control one hint-height below the field beside it; hanging the stack off
   the item's bottom edge puts every 52px control in a row on the same line.
   Local to this form on purpose: `FieldFrame` is shared with nine prerendered
   routes (AGENTS.md 8.1) and `/activity/factors` is the only dynamic one. */
const FIELD_ALIGN = "md:flex md:flex-col md:justify-end";

function fieldErrorsFromIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  const errors: Partial<Record<CustomFactorField, string>> = {};
  for (const issue of error.issues) {
    if (issue.path.length < 2) continue;
    const field = `${String(issue.path[0])}.${String(
      issue.path[1],
    )}` as CustomFactorField;
    errors[field] ??= issue.message;
  }
  return errors;
}

function optionLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function CustomFactorForm({
  sets,
  supersedableRows,
}: {
  sets: FormFactorSet[];
  supersedableRows: FormSupersedableRow[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /* "new", or the id of a set this organisation already owns. */
  const [setChoice, setSetChoice] = useState<string>(
    sets.length > 0 ? sets[0].id : "new",
  );
  const [scope, setScope] = useState<EmissionScope>("scope_1");
  const [gas, setGas] = useState<GhgGas>("co2e");
  const [biogenic, setBiogenic] = useState(false);
  /* "" is "restates nothing", which is the default and the common case. */
  const [supersedes, setSupersedes] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<CustomFactorField, string>>
  >({});

  const creatingSet = setChoice === "new";
  const chosenSet = creatingSet
    ? undefined
    : sets.find((set) => set.id === setChoice);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrors({});

    const body = new FormData(event.currentTarget);
    const input = {
      set: creatingSet
        ? {
            mode: "new" as const,
            source: String(body.get("source") ?? ""),
            datasetVersion: String(body.get("datasetVersion") ?? ""),
            publicationYear: Number(body.get("publicationYear")),
            effectiveFrom: String(body.get("effectiveFrom") ?? ""),
            effectiveTo: String(body.get("effectiveTo") ?? ""),
            licence: String(body.get("licence") ?? ""),
            licenceUrl: String(body.get("licenceUrl") ?? ""),
            sourceUrl: String(body.get("sourceUrl") ?? ""),
            sourceReference: String(body.get("sourceReference") ?? ""),
            notes: String(body.get("notes") ?? ""),
          }
        : { mode: "existing" as const, setId: setChoice },
      factor: {
        level1: String(body.get("level1") ?? ""),
        level2: String(body.get("level2") ?? ""),
        level3: String(body.get("level3") ?? ""),
        level4: String(body.get("level4") ?? ""),
        columnText: String(body.get("columnText") ?? ""),
        publishedUom: String(body.get("publishedUom") ?? ""),
        publishedGhgUnit: String(body.get("publishedGhgUnit") ?? ""),
        scope,
        scope3Category:
          scope === "scope_3"
            ? String(body.get("scope3Category") ?? "")
            : undefined,
        scope2Method:
          scope === "scope_2"
            ? String(body.get("scope2Method") ?? "")
            : undefined,
        activityUnit: String(body.get("activityUnit") ?? ""),
        gas,
        ch4Variant:
          gas === "ch4" ? String(body.get("ch4Variant") ?? "") : undefined,
        gwpSet: String(body.get("gwpSet") ?? ""),
        region: String(body.get("region") ?? ""),
        biogenic,
        value: String(body.get("value") ?? ""),
        supersedes: supersedes
          ? {
              source: supersedes.slice(0, supersedes.indexOf(PAIR_SEPARATOR)),
              sourceRowId: supersedes.slice(
                supersedes.indexOf(PAIR_SEPARATOR) + 1,
              ),
            }
          : undefined,
      },
    };

    const checked = createCustomFactorSchema.safeParse(input);
    if (!checked.success) {
      setErrors(fieldErrorsFromIssues(checked.error));
      setMessage(CUSTOM_FACTOR_ERRORS.invalid);
      return;
    }

    setPending(true);
    try {
      const result = await createCustomFactor(checked.data);
      if (result.ok) {
        formRef.current?.reset();
        setScope("scope_1");
        setGas("co2e");
        setBiogenic(false);
        setSupersedes("");
        setMessage(
          "Customer-supplied factor saved. It is available in factor mapping.",
        );
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
      }
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <FormStatus message={message} shown="mb-8 block" />

      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="grid max-w-[980px] gap-6 md:grid-cols-2">
          <SelectField
            id="custom-factor-set"
            label="Factor set"
            error={errors["set.setId"]}
            value={setChoice}
            onChange={(event) => setSetChoice(event.target.value)}
            disabled={pending}
          >
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.source} — {set.datasetVersion}
              </option>
            ))}
            <option value="new">Create a new set</option>
          </SelectField>

          {/* 38px = the control's own top (16px label + 8px gap) plus half the
              slack between a 52px control and this 24px line box, so the note's
              first line sits on the control's text line rather than above it.
              The checkbox below is the same rule read from the row's bottom. */}
          {chosenSet ? (
            <div className="font-serif text-[15px] leading-6 text-muted md:mt-[38px]">
              {chosenSet.licence}. Effective {chosenSet.effectiveFrom} to{" "}
              {chosenSet.effectiveTo}, published {chosenSet.publicationYear}.
              This set holds {GAS_BASIS_LABEL[chosenSet.gasBasis]}.
            </div>
          ) : (
            <p className="font-serif text-[15px] leading-6 text-muted md:mt-[38px]">
              A new set records where these factors came from and under what
              licence. That provenance is rendered as evidence beside the
              figures they produce.
            </p>
          )}
        </div>

        {creatingSet ? (
          <div className="mt-12 grid max-w-[980px] gap-6 md:grid-cols-2">
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-source"
              name="source"
              label="Source"
              hint="For example, Supplier tariff."
              error={errors["set.source"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-version"
              name="datasetVersion"
              label="Dataset/version"
              hint="For example, 2026 contract."
              error={errors["set.datasetVersion"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-year"
              name="publicationYear"
              type="number"
              inputMode="numeric"
              label="Publication year"
              error={errors["set.publicationYear"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-licence"
              name="licence"
              label="Licence or basis"
              hint="Name the licence, contract or permission basis."
              error={errors["set.licence"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-effective-from"
              name="effectiveFrom"
              type="date"
              label="Effective from"
              error={errors["set.effectiveFrom"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-effective-to"
              name="effectiveTo"
              type="date"
              label="Effective to"
              error={errors["set.effectiveTo"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-licence-url"
              name="licenceUrl"
              label="Licence URL"
              hint="Leave blank when the basis is private or contractual."
              error={errors["set.licenceUrl"]}
              disabled={pending}
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-source-url"
              name="sourceUrl"
              label="Source URL"
              hint="Use a public source URL when one exists."
              error={errors["set.sourceUrl"]}
              disabled={pending}
            />
            <Field
              className={FIELD_ALIGN}
              id="custom-factor-source-reference"
              name="sourceReference"
              label="Internal source reference"
              hint="Required when there is no public source URL."
              error={errors["set.sourceReference"]}
              disabled={pending}
            />
            <TextareaField
              className={FIELD_ALIGN}
              id="custom-factor-notes"
              name="notes"
              label="Notes"
              error={errors["set.notes"]}
              disabled={pending}
              rows={3}
            />
          </div>
        ) : null}

        <div className="mt-12 grid max-w-[980px] gap-6 md:grid-cols-2">
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-level-1"
            name="level1"
            label="Level 1"
            error={errors["factor.level1"]}
            disabled={pending}
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-level-2"
            name="level2"
            label="Level 2"
            error={errors["factor.level2"]}
            disabled={pending}
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-level-3"
            name="level3"
            label="Level 3"
            error={errors["factor.level3"]}
            disabled={pending}
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-level-4"
            name="level4"
            label="Level 4"
            error={errors["factor.level4"]}
            disabled={pending}
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-column"
            name="columnText"
            label="Column text"
            hint="The row description shown in the factor picker."
            error={errors["factor.columnText"]}
            disabled={pending}
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-uom"
            name="publishedUom"
            label="Published unit"
            error={errors["factor.publishedUom"]}
            disabled={pending}
            required
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-ghg-unit"
            name="publishedGhgUnit"
            label="Published GHG unit"
            error={errors["factor.publishedGhgUnit"]}
            disabled={pending}
            required
          />
          <Field
            className={FIELD_ALIGN}
            id="custom-factor-value"
            name="value"
            inputMode="decimal"
            label="Value"
            hint="Positive decimal. Stored as kgCO2e per activity unit."
            error={errors["factor.value"]}
            disabled={pending}
            required
          />

          <SelectField
            id="custom-factor-scope"
            label="Scope"
            error={errors["factor.scope"]}
            value={scope}
            onChange={(event) => setScope(event.target.value as EmissionScope)}
            disabled={pending}
          >
            {EMISSION_SCOPES.map((value) => (
              <option key={value} value={value}>
                {EMISSION_SCOPE_LABELS[value]}
              </option>
            ))}
          </SelectField>

          {scope === "scope_3" ? (
            <SelectField
              id="custom-factor-scope-3"
              label="Scope 3 category"
              error={errors["factor.scope3Category"]}
              name="scope3Category"
              disabled={pending}
            >
              <option value="">Choose category</option>
              {SCOPE3_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {SCOPE3_CATEGORY_LABELS[value]}
                </option>
              ))}
            </SelectField>
          ) : null}

          {scope === "scope_2" ? (
            <SelectField
              id="custom-factor-scope-2"
              label="Scope 2 method"
              error={errors["factor.scope2Method"]}
              name="scope2Method"
              disabled={pending}
            >
              <option value="">Choose method</option>
              {SCOPE2_METHODS.map((value) => (
                <option key={value} value={value}>
                  {SCOPE2_METHOD_LABELS[value]}
                </option>
              ))}
            </SelectField>
          ) : null}

          <SelectField
            id="custom-factor-activity-unit"
            label="Activity unit"
            error={errors["factor.activityUnit"]}
            name="activityUnit"
            disabled={pending}
            defaultValue=""
          >
            <option value="">Choose unit</option>
            {FACTOR_ACTIVITY_UNITS.map((value) => (
              <option key={value} value={value}>
                {optionLabel(value)}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="custom-factor-gas"
            label="Gas"
            error={errors["factor.gas"]}
            value={gas}
            onChange={(event) => setGas(event.target.value as GhgGas)}
            disabled={pending}
          >
            {GHG_GASES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>

          {gas === "ch4" ? (
            <SelectField
              id="custom-factor-ch4"
              label="Methane variant"
              error={errors["factor.ch4Variant"]}
              name="ch4Variant"
              disabled={pending}
            >
              <option value="">Choose variant</option>
              {CH4_VARIANTS.map((value) => (
                <option key={value} value={value}>
                  {optionLabel(value)}
                </option>
              ))}
            </SelectField>
          ) : null}

          <SelectField
            id="custom-factor-gwp"
            label="GWP set"
            error={errors["factor.gwpSet"]}
            name="gwpSet"
            disabled={pending}
            defaultValue=""
          >
            <option value="">Choose set</option>
            {GWP_SETS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>

          <Field
            className={FIELD_ALIGN}
            id="custom-factor-region"
            name="region"
            label="Region"
            error={errors["factor.region"]}
            disabled={pending}
          />

          {/* Hung off the row's bottom edge, 14px = (52 - 24) / 2 clear of it,
              so this line centres on whichever control it lands beside — the
              old top offset assumed a partner with no hint, and the scope and
              gas selects change which field that is. */}
          <label className="mt-8 flex items-start gap-3 font-serif text-[16px] leading-6 text-ink md:mt-0 md:mb-[14px] md:self-end">
            <input
              type="checkbox"
              checked={biogenic}
              onChange={(event) => setBiogenic(event.target.checked)}
              disabled={pending}
              className="mt-1 size-4 border-border accent-[var(--color-ink)]"
            />
            Biogenic or outside-of-scopes component
          </label>
        </div>

        {supersedableRows.length > 0 ? (
          <div className="mt-12 grid max-w-[980px] gap-6 md:grid-cols-2">
            <SelectField
              id="custom-factor-supersedes"
              label="Restates a published row"
              error={errors["factor.supersedes"]}
              value={supersedes}
              onChange={(event) => setSupersedes(event.target.value)}
              disabled={pending}
            >
              <option value="">Restates nothing</option>
              {supersedableRows.map((row) => (
                <option
                  key={`${row.source}${PAIR_SEPARATOR}${row.sourceRowId}`}
                  value={`${row.source}${PAIR_SEPARATOR}${row.sourceRowId}`}
                >
                  {row.source} {row.datasetVersion} — {row.label}
                </option>
              ))}
            </SelectField>
            <p className="font-serif text-[15px] leading-6 text-muted md:mt-[38px]">
              A restating row is used wherever that published row is mapped, for
              the dates this set covers. It takes effect at the next
              recalculation without a mapping change — the rest of this form
              does not.
            </p>
          </div>
        ) : null}

        <Button type="submit" className="mt-10" disabled={pending}>
          {pending ? "Saving..." : "Save factor"}
        </Button>
      </form>
    </>
  );
}

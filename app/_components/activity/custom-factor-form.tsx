"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createCustomFactor,
  retireCustomFactor,
} from "../../activity/actions";
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
import { Button, Field, TextareaField } from "../primitives";

type ExistingFactor = {
  id: string;
  setId: string;
  label: string;
  publishedUom: string;
  publishedGhgUnit: string;
  scope: string;
  scope3Category: string | null;
  scope2Method: string | null;
  activityUnit: string;
  gas: string;
  ch4Variant: string | null;
  gwpSet: string;
  region: string | null;
  biogenic: boolean;
  value: string;
  deletedAt: Date | null;
};

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

const SELECT_CLASS =
  "mt-2 h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:bg-surface";

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
  factors,
}: {
  factors: ExistingFactor[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [scope, setScope] = useState<EmissionScope>("scope_1");
  const [gas, setGas] = useState<GhgGas>("co2e");
  const [biogenic, setBiogenic] = useState(false);
  const [pending, setPending] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<CustomFactorField | "factorId", string>>
  >({});

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrors({});

    const body = new FormData(event.currentTarget);
    const input = {
      set: {
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
      },
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
        setMessage("Customer-supplied factor saved. It is available in factor mapping.");
        router.refresh();
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

  async function retire(factorId: string) {
    setMessage("");
    setErrors({});
    setRetiringId(factorId);
    try {
      const result = await retireCustomFactor({ factorId });
      if (result.ok) {
        setMessage("Customer-supplied factor retired.");
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
      }
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setRetiringId(null);
    }
  }

  return (
    <>
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "mb-8 block" : "hidden"
        }`}
      >
        {message}
        {errors.factorId ? <span className="mt-2 block">{errors.factorId}</span> : null}
      </p>

      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="grid max-w-[980px] gap-6 md:grid-cols-2">
          <Field
            id="custom-factor-source"
            name="source"
            label="Source"
            hint="For example, Supplier tariff."
            error={errors["set.source"]}
            disabled={pending}
            required
          />
          <Field
            id="custom-factor-version"
            name="datasetVersion"
            label="Dataset/version"
            hint="For example, 2026 contract."
            error={errors["set.datasetVersion"]}
            disabled={pending}
            required
          />
          <Field
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
            id="custom-factor-licence"
            name="licence"
            label="Licence or basis"
            hint="Name the licence, contract or permission basis."
            error={errors["set.licence"]}
            disabled={pending}
            required
          />
          <Field
            id="custom-factor-effective-from"
            name="effectiveFrom"
            type="date"
            label="Effective from"
            error={errors["set.effectiveFrom"]}
            disabled={pending}
            required
          />
          <Field
            id="custom-factor-effective-to"
            name="effectiveTo"
            type="date"
            label="Effective to"
            error={errors["set.effectiveTo"]}
            disabled={pending}
            required
          />
          <Field
            id="custom-factor-licence-url"
            name="licenceUrl"
            label="Licence URL"
            hint="Leave blank when the basis is private or contractual."
            error={errors["set.licenceUrl"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-source-url"
            name="sourceUrl"
            label="Source URL"
            hint="Use a public source URL when one exists."
            error={errors["set.sourceUrl"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-source-reference"
            name="sourceReference"
            label="Internal source reference"
            hint="Required when there is no public source URL."
            error={errors["set.sourceReference"]}
            disabled={pending}
          />
          <TextareaField
            id="custom-factor-notes"
            name="notes"
            label="Notes"
            error={errors["set.notes"]}
            disabled={pending}
            rows={3}
          />
        </div>

        <div className="mt-12 grid max-w-[980px] gap-6 md:grid-cols-2">
          <Field
            id="custom-factor-level-1"
            name="level1"
            label="Level 1"
            error={errors["factor.level1"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-level-2"
            name="level2"
            label="Level 2"
            error={errors["factor.level2"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-level-3"
            name="level3"
            label="Level 3"
            error={errors["factor.level3"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-level-4"
            name="level4"
            label="Level 4"
            error={errors["factor.level4"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-column"
            name="columnText"
            label="Column text"
            hint="The row description shown in the factor picker."
            error={errors["factor.columnText"]}
            disabled={pending}
          />
          <Field
            id="custom-factor-uom"
            name="publishedUom"
            label="Published unit"
            error={errors["factor.publishedUom"]}
            disabled={pending}
            required
          />
          <Field
            id="custom-factor-ghg-unit"
            name="publishedGhgUnit"
            label="Published GHG unit"
            error={errors["factor.publishedGhgUnit"]}
            disabled={pending}
            required
          />
          <Field
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
          >
            <select
              id="custom-factor-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as EmissionScope)}
              disabled={pending}
              className={SELECT_CLASS}
            >
              {EMISSION_SCOPES.map((value) => (
                <option key={value} value={value}>
                  {EMISSION_SCOPE_LABELS[value]}
                </option>
              ))}
            </select>
          </SelectField>

          {scope === "scope_3" ? (
            <SelectField
              id="custom-factor-scope-3"
              label="Scope 3 category"
              error={errors["factor.scope3Category"]}
            >
              <select
                id="custom-factor-scope-3"
                name="scope3Category"
                disabled={pending}
                className={SELECT_CLASS}
              >
                <option value="">Choose category</option>
                {SCOPE3_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {SCOPE3_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </SelectField>
          ) : null}

          {scope === "scope_2" ? (
            <SelectField
              id="custom-factor-scope-2"
              label="Scope 2 method"
              error={errors["factor.scope2Method"]}
            >
              <select
                id="custom-factor-scope-2"
                name="scope2Method"
                disabled={pending}
                className={SELECT_CLASS}
              >
                <option value="">Choose method</option>
                {SCOPE2_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {SCOPE2_METHOD_LABELS[value]}
                  </option>
                ))}
              </select>
            </SelectField>
          ) : null}

          <SelectField
            id="custom-factor-activity-unit"
            label="Activity unit"
            error={errors["factor.activityUnit"]}
          >
            <select
              id="custom-factor-activity-unit"
              name="activityUnit"
              disabled={pending}
              className={SELECT_CLASS}
              defaultValue=""
            >
              <option value="">Choose unit</option>
              {FACTOR_ACTIVITY_UNITS.map((value) => (
                <option key={value} value={value}>
                  {optionLabel(value)}
                </option>
              ))}
            </select>
          </SelectField>

          <SelectField id="custom-factor-gas" label="Gas" error={errors["factor.gas"]}>
            <select
              id="custom-factor-gas"
              value={gas}
              onChange={(event) => setGas(event.target.value as GhgGas)}
              disabled={pending}
              className={SELECT_CLASS}
            >
              {GHG_GASES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SelectField>

          {gas === "ch4" ? (
            <SelectField
              id="custom-factor-ch4"
              label="Methane variant"
              error={errors["factor.ch4Variant"]}
            >
              <select
                id="custom-factor-ch4"
                name="ch4Variant"
                disabled={pending}
                className={SELECT_CLASS}
              >
                <option value="">Choose variant</option>
                {CH4_VARIANTS.map((value) => (
                  <option key={value} value={value}>
                    {optionLabel(value)}
                  </option>
                ))}
              </select>
            </SelectField>
          ) : null}

          <SelectField
            id="custom-factor-gwp"
            label="GWP set"
            error={errors["factor.gwpSet"]}
          >
            <select
              id="custom-factor-gwp"
              name="gwpSet"
              disabled={pending}
              className={SELECT_CLASS}
              defaultValue=""
            >
              <option value="">Choose set</option>
              {GWP_SETS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SelectField>

          <Field
            id="custom-factor-region"
            name="region"
            label="Region"
            error={errors["factor.region"]}
            disabled={pending}
          />

          <label className="mt-8 flex items-start gap-3 font-serif text-[16px] leading-6 text-ink md:mt-[34px]">
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

        <Button type="submit" className="mt-10" disabled={pending}>
          {pending ? "Saving..." : "Save factor"}
        </Button>
      </form>

      {factors.length > 0 ? (
        <ul className="mt-12" aria-label="Customer-supplied factor rows">
          {factors.map((factor) => {
            const retired = factor.deletedAt !== null;
            return (
              <li
                key={factor.id}
                className="grid gap-5 border-b border-border py-5 first:border-t lg:grid-cols-[1fr_auto] lg:items-start"
              >
                <div className="min-w-0">
                  <p className="wrap-anywhere font-sans text-[17px] leading-6 font-bold text-ink">
                    {factor.label || "Untitled factor"}
                  </p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <MiniDetail label="Unit">{factor.publishedUom}</MiniDetail>
                    <MiniDetail label="Value">{factor.value}</MiniDetail>
                    <MiniDetail label="Scope">{factor.scope}</MiniDetail>
                    <MiniDetail label="Gas">{factor.gas}</MiniDetail>
                    <MiniDetail label="State">
                      {retired ? "Retired" : "Active"}
                    </MiniDetail>
                  </dl>
                </div>
                <Button
                  type="button"
                  size="secondary"
                  bullet={false}
                  disabled={pending || retiringId !== null || retired}
                  onClick={() => void retire(factor.id)}
                >
                  {retiringId === factor.id ? "Retiring..." : "Retire"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function SelectField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-sans text-nav font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-2 flex items-start gap-2 font-mono text-[12px] leading-[18px] text-ink">
          <span aria-hidden className="mt-[7px] size-1 shrink-0 bg-ink" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MiniDetail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 wrap-anywhere font-serif text-[15px] leading-5 text-ink">
        {children}
      </dd>
    </div>
  );
}

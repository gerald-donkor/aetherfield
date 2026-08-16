"use client";

import { type FormEvent, useRef, useState } from "react";
import * as z from "zod";

import { createTarget } from "../../targets/actions";
import {
  createTargetSchema,
  TARGET_BASELINE_SOURCE_LABELS,
  TARGET_COVERAGE_LABELS,
  TARGET_COVERAGES,
  TARGET_MAX_YEAR,
  TARGET_MIN_YEAR,
  type TargetCoverage,
  type TargetFieldErrors,
} from "../../../lib/validation/targets";
import { Button, Field } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

const SELECT_CLASS =
  "mt-2 h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:bg-surface";

export function CreateTargetForm({
  suggestions,
  calculationsComplete,
}: {
  suggestions: { year: number; coverage: TargetCoverage; tonnes: string }[];
  calculationsComplete: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coverage, setCoverage] = useState<TargetCoverage>("scope_1_2");
  const [baseYear, setBaseYear] = useState("");
  const [baseline, setBaseline] = useState("");
  const [baselineSource, setBaselineSource] = useState<
    "stated" | "computed_at_creation"
  >("stated");
  const [errors, setErrors] = useState<TargetFieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const suggestion = suggestions.find(
    (entry) => entry.year === Number(baseYear) && entry.coverage === coverage,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrors({});

    const body = new FormData(event.currentTarget);
    const input = {
      name: String(body.get("name") ?? ""),
      coverage,
      baseYear: Number(baseYear),
      targetYear: Number(body.get("targetYear")),
      reductionPercent: String(body.get("reductionPercent") ?? ""),
      baseline,
      baselineSource,
    };

    const checked = createTargetSchema.safeParse(input);
    if (!checked.success) {
      const flattened = z.flattenError(checked.error);
      setErrors(
        Object.fromEntries(
          Object.entries(flattened.fieldErrors)
            .filter(([, values]) => values?.[0])
            .map(([field, values]) => [field, values![0]]),
        ) as TargetFieldErrors,
      );
      setMessage("Check the marked fields and try again.");
      return;
    }

    setPending(true);
    try {
      const result = await createTarget(checked.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        setPending(false);
        return;
      }

      formRef.current?.reset();
      setCoverage("scope_1_2");
      setBaseYear("");
      setBaseline("");
      setBaselineSource("stated");
      setMessage(
        "Target saved. Its trajectory and projection are shown below.",
      );
      setPending(false);
    } catch {
      setMessage(NETWORK_ERROR);
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <FormStatus message={message} as="div" role="alert" className="mb-6" />

      <div className="grid max-w-[900px] gap-6 md:grid-cols-2">
        <Field
          id="target-name"
          name="name"
          label="Target name"
          hint="For example, Operational 2030."
          error={errors.name}
          disabled={pending}
          required
        />

        <div>
          <label
            htmlFor="target-coverage"
            className="block font-sans text-nav font-bold text-ink"
          >
            Coverage
          </label>
          <p className="mt-1.5 font-serif text-[16px] text-muted">
            Biogenic and outside-of-scopes figures are always separate.
          </p>
          <select
            id="target-coverage"
            name="coverage"
            value={coverage}
            onChange={(event) => {
              setCoverage(event.target.value as TargetCoverage);
              setBaselineSource("stated");
            }}
            disabled={pending}
            className={SELECT_CLASS}
          >
            {TARGET_COVERAGES.map((value) => (
              <option key={value} value={value}>
                {TARGET_COVERAGE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <Field
          id="target-base-year"
          name="baseYear"
          type="number"
          inputMode="numeric"
          min={TARGET_MIN_YEAR}
          max={TARGET_MAX_YEAR}
          label="Base year"
          error={errors.baseYear}
          value={baseYear}
          onChange={(event) => {
            setBaseYear(event.target.value);
            setBaselineSource("stated");
          }}
          disabled={pending}
          required
        />

        <Field
          id="target-year"
          name="targetYear"
          type="number"
          inputMode="numeric"
          min={TARGET_MIN_YEAR}
          max={TARGET_MAX_YEAR}
          label="Target year"
          error={errors.targetYear}
          disabled={pending}
          required
        />

        <Field
          id="target-reduction"
          name="reductionPercent"
          inputMode="decimal"
          label="Reduction"
          hint="Percentage from the filed baseline, above 0 and up to 100."
          error={errors.reductionPercent}
          disabled={pending}
          required
        />

        <div>
          <Field
            id="target-baseline"
            name="baseline"
            inputMode="decimal"
            label="Base-year emissions (tCO2e)"
            hint={`Source: ${TARGET_BASELINE_SOURCE_LABELS[baselineSource]}.`}
            error={errors.baseline}
            value={baseline}
            onChange={(event) => {
              setBaseline(event.target.value);
              setBaselineSource("stated");
            }}
            disabled={pending}
            required
          />
          {suggestion ? (
            <button
              type="button"
              className="mt-3 font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => {
                setBaseline(suggestion.tonnes);
                setBaselineSource("computed_at_creation");
                setErrors((current) => ({ ...current, baseline: undefined }));
              }}
              disabled={pending}
            >
              Use calculated figure: {suggestion.tonnes} tCO2e
            </button>
          ) : (
            <p className="mt-3 font-mono text-[11px] leading-[18px] text-muted">
              {calculationsComplete
                ? "No calculated figure is available for this year and coverage."
                : "Calculated suggestions stay unavailable until every committed record has a calculated emission."}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" className="mt-8" disabled={pending}>
        {pending ? "Saving target..." : "Set target"}
      </Button>
    </form>
  );
}

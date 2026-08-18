"use client";

import { type FormEvent } from "react";

import { editFactorSet } from "../../activity/actions";
import type { EditFactorSetField } from "../../../lib/validation/emissions";
import { Button, Field, TextareaField } from "../primitives";
import { FormStatus } from "../form-status";
import { useWrite } from "../use-write";

/**
 * Corrects one customer-supplied factor set's provenance — prompt 84.
 *
 * **Component-only, and one instance per set**: the set list itself is rendered
 * by `app/activity/factors/page.tsx` in the Server Component, so nothing here
 * fetches, and no constant or type is exported (the bundle rule, AGENTS.md front
 * matter). Same primitives, same live region taking focus when the outcome
 * settles, same typed-result handling as the two factor forms beside it. **No
 * GSAP** (AGENTS.md 7.5).
 *
 * **The client checks are a courtesy, not a check** (AGENTS.md 6.2). The action
 * re-runs the identical schema, re-resolves the tenant and re-reads the set
 * under it, and that is the check.
 *
 * **`gas_basis` is not here, and the copy says why** rather than rendering a
 * disabled control that implies it might be (decision 2): the basis is derived
 * from the rows themselves, so editing it would relabel every stored row's
 * meaning without touching a row.
 */

/** The editable half of a set, as the Server Component hands it over. Only the
    fields this form writes cross the boundary, plus the two it states. */
type EditableFactorSet = {
  id: string;
  source: string;
  datasetVersion: string;
  publicationYear: number;
  effectiveFrom: string;
  effectiveTo: string;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  notes: string | null;
  gasBasis: "combined_co2e" | "per_gas";
};

/* Local to this form for the reason `factor-import-form.tsx` records:
   `FieldFrame` is shared with nine prerendered routes (AGENTS.md 8.1), and the
   factor surfaces are the only dynamic ones. */
const FIELD_ALIGN = "md:flex md:flex-col md:justify-end";

const GAS_BASIS_LABEL = {
  combined_co2e: "combined CO2e rows",
  per_gas: "per-gas rows",
} as const;

export function FactorSetForm({ set }: { set: EditableFactorSet }) {
  const write = useWrite<EditFactorSetField>();
  const { pending, message, errors } = write;

  /* The outcome takes focus whenever it settles, so a screen reader lands on it
     rather than being told about it from wherever the caret was
     (AGENTS.md 8.2 rule 5). */

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");

    await write.submit({
      // An honest failure is a visible state, never a silent success
      // (AGENTS.md 8.2 rule 4). `editFactorSet`'s generic `error` is not what
      // this form has always shown on a `setId` refusal — the specific
      // `fieldErrors.setId` is, when one exists.
      call: async () => {
        const result = await editFactorSet({
          setId: set.id,
          source: text("source"),
          datasetVersion: text("datasetVersion"),
          publicationYear: Number(form.get("publicationYear")),
          effectiveFrom: text("effectiveFrom"),
          effectiveTo: text("effectiveTo"),
          licence: text("licence"),
          licenceUrl: text("licenceUrl"),
          sourceUrl: text("sourceUrl"),
          sourceReference: text("sourceReference"),
          notes: text("notes"),
        });
        return result.ok
          ? result
          : { ...result, error: result.fieldErrors?.setId ?? result.error };
      },
      onSuccess: () =>
        "Set updated. The corrected provenance is rendered beside every figure its rows produce from now on. Reports already built keep the evidence they were built with, and a changed effective range applies at the next recalculation.",
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      {/* Kept mounted so the live region exists before the text arrives, and
          marked with the left rule the other workspace forms use — legible
          without colour (AGENTS.md 8.2 rule 5). */}
      <FormStatus message={message} shown="mb-8 block max-w-[720px]" />

      <p className="max-w-[720px] font-serif text-[15px] leading-6 text-muted">
        These fields are evidence: the licence and references are rendered
        beside every figure the set&apos;s rows produce. A corrected effective
        range changes which factor applies at the next recalculation and nothing
        before it, and reports already built keep the evidence they were built
        with. This set holds {GAS_BASIS_LABEL[set.gasBasis]}; that is derived
        from the rows themselves and is not editable.
      </p>

      <div className="mt-8 grid max-w-[980px] gap-6 md:grid-cols-2">
        <Field
          className={FIELD_ALIGN}
          id={`set-source-${set.id}`}
          name="source"
          label="Source"
          hint="For example, Supplier tariff."
          defaultValue={set.source}
          error={errors.source}
          disabled={pending}
          required
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-version-${set.id}`}
          name="datasetVersion"
          label="Dataset/version"
          hint="For example, 2026 contract."
          defaultValue={set.datasetVersion}
          error={errors.datasetVersion}
          disabled={pending}
          required
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-year-${set.id}`}
          name="publicationYear"
          type="number"
          inputMode="numeric"
          label="Publication year"
          defaultValue={set.publicationYear}
          error={errors.publicationYear}
          disabled={pending}
          required
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-licence-${set.id}`}
          name="licence"
          label="Licence or basis"
          hint="Name the licence, contract or permission basis."
          defaultValue={set.licence}
          error={errors.licence}
          disabled={pending}
          required
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-effective-from-${set.id}`}
          name="effectiveFrom"
          type="date"
          label="Effective from"
          defaultValue={set.effectiveFrom}
          error={errors.effectiveFrom}
          disabled={pending}
          required
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-effective-to-${set.id}`}
          name="effectiveTo"
          type="date"
          label="Effective to"
          defaultValue={set.effectiveTo}
          error={errors.effectiveTo}
          disabled={pending}
          required
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-licence-url-${set.id}`}
          name="licenceUrl"
          type="url"
          label="Licence URL"
          hint="Optional."
          defaultValue={set.licenceUrl ?? ""}
          error={errors.licenceUrl}
          disabled={pending}
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-source-url-${set.id}`}
          name="sourceUrl"
          type="url"
          label="Source URL"
          hint="A URL or an internal reference is required."
          defaultValue={set.sourceUrl ?? ""}
          error={errors.sourceUrl}
          disabled={pending}
        />
        <Field
          className={FIELD_ALIGN}
          id={`set-source-reference-${set.id}`}
          name="sourceReference"
          label="Internal source reference"
          hint="For example, a contract number."
          defaultValue={set.sourceReference ?? ""}
          error={errors.sourceReference}
          disabled={pending}
        />
        <TextareaField
          id={`set-notes-${set.id}`}
          name="notes"
          label="Notes"
          hint="Optional. Anything a reader of the disclosure should know."
          defaultValue={set.notes ?? ""}
          error={errors.notes}
          disabled={pending}
        />
      </div>

      {/* A `setId` refusal — a set retired from another session, say — is the
          whole form's outcome rather than one field's, so it is announced in
          the live region above and has no control to sit beside. */}
      <Button type="submit" className="mt-10" disabled={pending}>
        {pending ? "Saving..." : "Save corrections"}
      </Button>
    </form>
  );
}

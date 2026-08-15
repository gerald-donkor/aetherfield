"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { importCustomFactors } from "../../activity/actions";
import { FACTOR_IMPORT_HEADER } from "../../../lib/domain/factor-import";
import {
  CSV_ACCEPT_ATTR,
  CSV_ERRORS,
  CSV_MAX_BYTES,
  CSV_MAX_LABEL,
  CSV_MAX_ROWS,
} from "../../../lib/validation/activity";
import {
  FACTOR_IMPORT_ERRORS,
  type FactorImportField,
  type FactorImportRowError,
} from "../../../lib/validation/emissions";
import { Button, Field, FileField, TextareaField } from "../primitives";

/**
 * Imports a CSV of customer-supplied factor rows — prompt 82.
 *
 * **A copy of `upload-form.tsx`'s shape and `custom-factor-form.tsx`'s set
 * chooser, not a third form vocabulary.** Same primitives, same live region
 * taking focus when the outcome settles, same typed-result handling, same
 * component-only export rule (AGENTS.md front matter, bundle rule). **No GSAP**
 * (AGENTS.md 7.5) — the only movement here is the CSS transition the primitives
 * already carry.
 *
 * **The client checks are a courtesy, not a check** (AGENTS.md 6.2). The size
 * test saves a round trip on an obviously wrong file; the action re-runs it,
 * decodes the bytes, parses the file, judges every row with the shared schema
 * and re-resolves the tenant, and that is the check.
 *
 * **The import is atomic**, so the outcome is one of two states and the copy
 * says which: counts on success, or the refused lines with nothing written.
 */

/** A set this organisation already owns, as far as this form needs it. Only
    the fields rendered here cross the boundary. */
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

const GAS_BASIS_LABEL = {
  combined_co2e: "combined CO2e rows",
  per_gas: "per-gas rows",
} as const;

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

/* Both local to this form for the reason `custom-factor-form.tsx` records:
   `FieldFrame` is shared with nine prerendered routes (AGENTS.md 8.1), and the
   factor surfaces are the only dynamic ones. */
const FIELD_ALIGN = "md:flex md:flex-col md:justify-end";

const SELECT_CLASS =
  "mt-2 h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:bg-surface";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function FactorImportForm({ sets }: { sets: FormFactorSet[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const [setChoice, setSetChoice] = useState<string>(
    sets.length > 0 ? sets[0].id : "new",
  );
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [rowErrors, setRowErrors] = useState<FactorImportRowError[]>([]);
  const [errors, setErrors] = useState<
    Partial<Record<FactorImportField, string>>
  >({});

  const creatingSet = setChoice === "new";
  const chosenSet = creatingSet
    ? undefined
    : sets.find((set) => set.id === setChoice);

  /* The outcome takes focus whenever it settles, so a screen reader lands on
     it rather than being told about it from wherever the caret was
     (AGENTS.md 8.2 rule 5). */
  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setRowErrors([]);
    setErrors({});

    if (!file || file.size === 0) {
      setErrors({ file: FACTOR_IMPORT_ERRORS.file });
      setMessage(FACTOR_IMPORT_ERRORS.invalid);
      return;
    }
    if (file.size > CSV_MAX_BYTES) {
      setErrors({ file: CSV_ERRORS.size });
      setMessage(FACTOR_IMPORT_ERRORS.invalid);
      return;
    }

    const body = new FormData(event.currentTarget);
    body.set("mode", creatingSet ? "new" : "existing");
    body.set("setId", creatingSet ? "" : setChoice);
    body.set("file", file);

    setPending(true);
    try {
      const result = await importCustomFactors(body);
      if (result.ok) {
        formRef.current?.reset();
        setFile(null);
        setMessage(
          `Imported ${result.imported.toLocaleString("en-GB")} ${
            result.imported === 1 ? "row" : "rows"
          }${
            result.skipped > 0
              ? `, and skipped ${result.skipped.toLocaleString("en-GB")} the set already held`
              : ""
          }. New rows are available in factor mapping and change no figure until a category and unit is mapped to them.`,
        );
        router.refresh();
      } else {
        // An honest failure is a visible state, never a silent success
        // (AGENTS.md 8.2 rule 4).
        setErrors(result.fieldErrors ?? {});
        setRowErrors(result.rowErrors ?? []);
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
      {/* Kept mounted so the live region exists before the text arrives, and
          marked with the left rule the other workspace forms use — legible
          without colour (AGENTS.md 8.2 rule 5). */}
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "mb-8 block" : "hidden"
        }`}
      >
        {message}
        {rowErrors.length > 0 ? (
          <ol className="mt-3 grid gap-1">
            {rowErrors.map((row) => (
              <li key={`${row.line}-${row.message}`}>
                Line {row.line}: {row.message}
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="grid max-w-[980px] gap-6 md:grid-cols-2">
          <SelectField
            id="factor-import-set"
            label="Factor set"
            error={errors["set.setId"]}
          >
            <select
              id="factor-import-set"
              value={setChoice}
              onChange={(event) => setSetChoice(event.target.value)}
              disabled={pending}
              className={SELECT_CLASS}
            >
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.source} — {set.datasetVersion}
                </option>
              ))}
              <option value="new">Create a new set</option>
            </select>
          </SelectField>

          {chosenSet ? (
            <div className="font-serif text-[15px] leading-6 text-muted md:mt-[38px]">
              {chosenSet.licence}. Effective {chosenSet.effectiveFrom} to{" "}
              {chosenSet.effectiveTo}, published {chosenSet.publicationYear}.
              This set holds {GAS_BASIS_LABEL[chosenSet.gasBasis]}, so every row
              in the file must be of that kind.
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
              id="factor-import-source"
              name="source"
              label="Source"
              hint="For example, Supplier tariff."
              error={errors["set.source"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-version"
              name="datasetVersion"
              label="Dataset/version"
              hint="For example, 2026 contract."
              error={errors["set.datasetVersion"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-year"
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
              id="factor-import-licence"
              name="licence"
              label="Licence or basis"
              hint="Name the licence, contract or permission basis."
              error={errors["set.licence"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-effective-from"
              name="effectiveFrom"
              type="date"
              label="Effective from"
              error={errors["set.effectiveFrom"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-effective-to"
              name="effectiveTo"
              type="date"
              label="Effective to"
              error={errors["set.effectiveTo"]}
              disabled={pending}
              required
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-licence-url"
              name="licenceUrl"
              type="url"
              label="Licence URL"
              hint="Optional."
              error={errors["set.licenceUrl"]}
              disabled={pending}
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-source-url"
              name="sourceUrl"
              type="url"
              label="Source URL"
              hint="A URL or an internal reference is required."
              error={errors["set.sourceUrl"]}
              disabled={pending}
            />
            <Field
              className={FIELD_ALIGN}
              id="factor-import-source-reference"
              name="sourceReference"
              label="Internal source reference"
              hint="For example, a contract number."
              error={errors["set.sourceReference"]}
              disabled={pending}
            />
            <TextareaField
              id="factor-import-notes"
              name="notes"
              label="Notes"
              hint="Optional. Anything a reader of the disclosure should know."
              error={errors["set.notes"]}
              disabled={pending}
            />
          </div>
        ) : null}

        <div className="mt-12">
          <FileField
            id="factor-import-file"
            name="file"
            label="Factor file"
            hint={`CSV, up to ${CSV_MAX_LABEL} and ${CSV_MAX_ROWS.toLocaleString("en-GB")} rows. The first row must name the columns.`}
            accept={CSV_ACCEPT_ATTR}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setErrors((current) => ({ ...current, file: undefined }));
            }}
            error={errors.file}
            disabled={pending}
            fileName={file?.name}
            fileSize={file ? formatSize(file.size) : undefined}
            required
            className="max-w-[560px]"
          />

          {/* The contract a person needs, on the page, rather than a template
              asset to download and keep in sync. */}
          <p className="mt-6 max-w-[720px] font-serif text-[15px] leading-6 text-muted">
            The header row, in any order:
          </p>
          <code className="mt-2 block max-w-[720px] overflow-x-auto border border-border bg-surface px-4 py-3 font-mono text-[12px] leading-[20px] text-ink">
            {FACTOR_IMPORT_HEADER}
          </code>
          <p className="mt-3 max-w-[720px] font-serif text-[15px] leading-6 text-muted">
            Values are taken exactly as written — scope_1, not Scope 1. Rows all
            import or none do: a file with a bad row writes nothing and comes
            back with the lines to fix.
          </p>
        </div>

        <Button type="submit" className="mt-10" disabled={pending}>
          {pending ? "Importing..." : "Import factors"}
        </Button>
      </form>
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

"use client";

import { type FormEvent, useState } from "react";

import { updateImportMapping } from "../../activity/actions";
import {
  ACTIVITY_FIELD_LABELS,
  ACTIVITY_FIELDS,
  type ActivityField,
  type ActivityMapping,
  REQUIRED_ACTIVITY_FIELDS,
} from "../../../lib/validation/activity";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { useWrite } from "../use-write";

/**
 * The column-mapping override — build step 9, and **the review step AGENTS.md
 * 5.3 requires of a mapping that was proposed rather than stated.**
 *
 * The proposal comes from a fixed alias table in `lib/domain/activity-import.ts`
 * today. When step 9's sanctioned AI mapper lands it drops in behind this exact
 * control with no rework: the model would produce the proposal, and a person
 * would still confirm or change it here. A low-confidence match is surfaced,
 * never silently accepted.
 *
 * **Component-only** (AGENTS.md front matter, bundle rule), built from the
 * existing primitives, and **no GSAP** (7.5).
 *
 * The `<select>` is styled here rather than promoted to a primitive: it is the
 * only one on the site, and a primitive with one caller is a vocabulary
 * entry nobody asked for. Its classes are `Field`'s control classes verbatim,
 * so it cannot drift from the fields beside it.
 */

const SELECT_CLASS =
  "mt-2 h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:bg-surface";

export function ActivityMappingForm({
  importId,
  headerRow,
  mapping,
  disabled = false,
  className = "",
}: {
  importId: string;
  headerRow: string[];
  mapping: ActivityMapping;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<ActivityMapping>(mapping);
  const write = useWrite<ActivityField>();
  const { pending, message, errors } = write;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /* The courtesy check: every required field needs a column. The action
       re-checks this against the *stored* header row, which is the check
       (AGENTS.md 6.2). */
    const missing = REQUIRED_ACTIVITY_FIELDS.filter(
      (field) => draft[field] === null,
    );
    if (missing.length > 0) {
      write.invalid(
        Object.fromEntries(
          missing.map((field) => [field, "Choose the column this comes from."]),
        ),
        "Check the marked fields and try again.",
      );
      return;
    }

    await write.submit({
      call: () => updateImportMapping(importId, draft),
      onSuccess: () => "Mapping saved. Every row has been re-checked.",
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      <FormStatus message={message} as="div" className="mb-6" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {ACTIVITY_FIELDS.map((field) => {
          const id = `activity-mapping-${field}`;
          const error = errors[field];
          const optional = !REQUIRED_ACTIVITY_FIELDS.includes(field);
          return (
            <div key={field} className="min-w-0">
              <label
                htmlFor={id}
                className="block font-sans text-nav font-bold text-ink"
              >
                {ACTIVITY_FIELD_LABELS[field]}
                {optional ? (
                  <span className="ml-2 font-mono text-[11px] font-medium text-muted uppercase">
                    Optional
                  </span>
                ) : null}
              </label>
              <select
                id={id}
                name={field}
                disabled={disabled || pending}
                value={draft[field] === null ? "" : String(draft[field])}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  }))
                }
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={`${SELECT_CLASS} ${error ? "border-ink" : ""}`}
              >
                <option value="">Not mapped</option>
                {headerRow.map((header, index) => (
                  <option key={`${header}-${index}`} value={index}>
                    {header.trim() === ""
                      ? `Column ${index + 1}`
                      : `${index + 1}. ${header}`}
                  </option>
                ))}
              </select>
              {error ? (
                <p
                  id={`${id}-error`}
                  className="mt-2 flex items-start gap-2 font-mono text-[12px] leading-[18px] text-ink"
                >
                  <span
                    aria-hidden
                    className="mt-[7px] size-1 shrink-0 bg-ink"
                  />
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button
        type="submit"
        size="secondary"
        className="mt-8"
        disabled={disabled || pending}
      >
        {pending ? "Re-checking rows..." : "Save mapping and re-check rows"}
      </Button>
    </form>
  );
}

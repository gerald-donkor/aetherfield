"use client";

import { useState } from "react";

import { createReport } from "../../reports/actions";
import { Button, Field } from "../primitives";
import {
  createReportSchema,
  REPORT_ERRORS,
  REPORT_FIELDS,
  type ReportField,
} from "../../../lib/validation/reports";
import { FormStatus } from "../form-status";
import { useWrite } from "../use-write";

/**
 * The create-report leaf — build step 13.
 *
 * **Component-only, no GSAP, no box of its own** (AGENTS.md 7.5 and the front
 * matter's bundle rule). Its shape is `CreateTargetForm`'s deliberately: the
 * same `role="status"` result line, the same focus management, the same
 * primitives — so the two create surfaces in this workspace behave identically.
 *
 * **The schema runs here for the user's benefit and again on the server as the
 * check** (AGENTS.md 10 rule 1). It is the same module, imported by both.
 *
 * **The form supplies a title and nothing else.** The reporting period, the
 * organisation and every figure are resolved server-side; there is no hidden
 * field here to forge.
 */

export function CreateReportForm() {
  const [title, setTitle] = useState("");
  const write = useWrite<ReportField>({
    fields: REPORT_FIELDS,
    fieldsMessage: REPORT_ERRORS.fields,
  });
  const { pending, message, errors: fieldErrors } = write;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await write.submit({
      parse: () => createReportSchema.safeParse({ title }),
      call: (data) => createReport(data),
      onSuccess: () => {
        setTitle("");
        return "Report built. It appears below with its figures.";
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-[34rem]">
      <Field
        id="report-title"
        label="Report name"
        hint="The reporting period is the latest 12 complete months and is set for you."
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldErrors.title}
        maxLength={120}
        autoComplete="off"
      />
      <Button type="submit" className="mt-8" disabled={pending}>
        {pending ? "Building..." : "Build report"}
      </Button>
      <FormStatus message={message} shown="mt-6 block" />
    </form>
  );
}

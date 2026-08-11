"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createReport } from "../../reports/actions";
import { Button, Field } from "../primitives";
import {
  createReportSchema,
  REPORT_ERRORS,
  type ReportField,
} from "../../../lib/validation/reports";

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

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

export function CreateReportForm() {
  const router = useRouter();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ReportField, string>>
  >({});

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});

    const parsed = createReportSchema.safeParse({ title });
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "title");
      setFieldErrors({ title: issue?.message });
      setMessage(REPORT_ERRORS.fields);
      return;
    }

    setPending(true);
    try {
      const result = await createReport(parsed.data);
      if (result.ok) {
        setTitle("");
        setMessage("Report built. It appears below with its figures.");
        router.refresh();
      } else {
        // An honest failure is a visible state (AGENTS.md 8.2 rule 4).
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
      }
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
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
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "mt-6 block" : "hidden"
        }`}
      >
        {message}
      </p>
    </form>
  );
}

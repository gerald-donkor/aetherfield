"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { stageImport } from "../../activity/actions";
import {
  CSV_ACCEPT_ATTR,
  CSV_ERRORS,
  CSV_MAX_BYTES,
  CSV_MAX_LABEL,
  CSV_MAX_ROWS,
} from "../../../lib/validation/activity";
import { Button, FileField } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * The activity-file upload leaf — build step 9.
 *
 * **A copy of the apply dialog's form shape, not a second form vocabulary.**
 * Same `FileField` / `Button` primitives, same focused announcement region,
 * same typed-result handling, same component-only export rule (AGENTS.md front
 * matter, bundle rule). **No GSAP** (AGENTS.md 7.5) — the only movement here is
 * the CSS transition the primitives already carry.
 *
 * **The client checks are a courtesy, not a check.** The size test below saves
 * a round trip on an obviously wrong file; the action re-runs it, decodes the
 * bytes and parses the file, and that is the check (AGENTS.md 6.2).
 *
 * **Navigation on success is deliberate and is the exception AGENTS.md 10
 * rule 5 does not cover.** That rule protects the settled marketing pages,
 * whose scroll and motion state a navigation would discard. `/activity` is an
 * authenticated workspace, and moving to the staged import is the outcome —
 * there is nothing else for this form to swap to.
 */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function ActivityUploadForm({ className = "" }: { className?: string }) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");

  /* The outcome takes focus whenever it settles, so a screen reader lands on
     it rather than being told about it from wherever the caret was
     (AGENTS.md 8.2 rule 5). */

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldError("");

    if (!file || file.size === 0) {
      setFieldError(CSV_ERRORS.missing);
      setMessage("Check the marked field and try again.");
      return;
    }
    if (file.size > CSV_MAX_BYTES) {
      setFieldError(CSV_ERRORS.size);
      setMessage("Check the marked field and try again.");
      return;
    }

    const body = new FormData();
    body.set("file", file);

    setPending(true);
    try {
      const result = await stageImport(body);
      if (result.ok) {
        /* Kept pending across the navigation: the form is about to be
           replaced, and re-enabling the button first invites a second upload
           of the same file. */
        setMessage("Import staged. Opening it for review.");
        router.push(`/activity/${result.importId}`);
        return;
      }

      // An honest failure is a visible state, never a silent success
      // (AGENTS.md 8.2 rule 4).
      setFieldError(result.fieldErrors?.file ?? "");
      setMessage(result.error);
      setPending(false);
    } catch {
      setMessage(NETWORK_ERROR);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      {/* Kept mounted so the live region exists before the text arrives, and
          marked with the left rule the auth screens use — legible without
          colour (AGENTS.md 8.2 rule 5). */}
      <FormStatus message={message} as="div" className="mb-6" />

      <FileField
        id="activity-import-file"
        name="file"
        label="Activity data file"
        hint={`CSV, up to ${CSV_MAX_LABEL} and ${CSV_MAX_ROWS.toLocaleString("en-GB")} rows. The first row must name the columns.`}
        accept={CSV_ACCEPT_ATTR}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setFieldError("");
        }}
        error={fieldError || undefined}
        disabled={pending}
        fileName={file?.name}
        fileSize={file ? formatSize(file.size) : undefined}
        required
        className="max-w-[560px]"
      />

      <Button type="submit" className="mt-8" disabled={pending}>
        {pending ? "Staging import..." : "Stage import"}
      </Button>
    </form>
  );
}

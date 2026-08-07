"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { submitDemoRequest } from "../../_actions/demo-request";
import {
  demoRequestFieldsSchema,
  NO_FIELD_ERRORS,
  type DemoRequestFieldErrors,
} from "../../../lib/validation/lead";
import { Button, Field, TextareaField } from "../primitives";

/**
 * The demo-request dialog — build step 2's client leaf, and the shape steps 4
 * and 5 copy (AGENTS.md 10).
 *
 * **It takes the settled button over and adds no box.** Like `NavDrop` and
 * `FooterMotion`, the leaf renders the element being replaced rather than
 * wrapping it, so the trigger's class string is unchanged and no element enters
 * the measured layout. The `<dialog>` is a sibling in a fragment; closed, it
 * renders nothing.
 *
 * **Native `<dialog>` + `showModal()` is deliberate.** It gives the focus trap,
 * the inert background, the top layer and the Escape key from the platform, so
 * this file adds none of them by hand — and no GSAP, per AGENTS.md 7.5. The
 * open and close are CSS.
 *
 * The client-side parse below is a courtesy to the person filling the form and
 * is **not** a check: the same schema runs again inside the action, which is
 * the only validation that counts (AGENTS.md 6.2).
 */

/* A constant rather than JSX text: the site ships straight apostrophes
   (AGENTS.md), and `react/no-unescaped-entities` rejects one written inline. */
const INTRO = "Tell us where to reach you and we'll arrange a walkthrough.";

type DemoRequestDialogProps = {
  /** Which CTA this is, for `lead.source`. Validated server-side against the
      database enum like any other browser-supplied value. */
  source: "hero" | "cta_band";
  /** Taken over from the `<Button>` being replaced, so nothing is added. */
  className?: string;
  children: React.ReactNode;
};

export function DemoRequestDialog({
  source,
  className,
  children,
}: DemoRequestDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] =
    useState<DemoRequestFieldErrors>(NO_FIELD_ERRORS);

  // The announcement takes focus whenever it changes, so a screen reader lands
  // on the outcome rather than being told about it from wherever it was.
  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  /* The heading rather than the first input: the person should hear what the
     dialog is before being dropped into a text box. It has to run in an effect
     — the body renders only once `open` is true, so `headingRef` is still null
     inside the click handler, and `showModal()` would leave focus on the
     <dialog> itself. */
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  function openDialog() {
    setMessage("");
    setErrors(NO_FIELD_ERRORS);
    setDone(false);
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  /* Fires for the close button, an Escape press and a backdrop click alike, so
     focus returns to the trigger by every route out. */
  function onClose() {
    setOpen(false);
    setPending(false);
    triggerRef.current?.focus();
  }

  /* The platform gives a modal dialog no backdrop click-to-close, and the
     backdrop is not a child, so a click landing on the <dialog> itself — i.e.
     outside its content box — is the signal. */
  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) closeDialog();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const data = new FormData(event.currentTarget);
    const raw = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      message: String(data.get("message") ?? ""),
    };

    const parsed = demoRequestFieldsSchema.safeParse(raw);
    if (!parsed.success) {
      const next = { ...NO_FIELD_ERRORS };
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in next) {
          next[field as keyof DemoRequestFieldErrors] ||= issue.message;
        }
      }
      setErrors(next);
      setMessage("Check the marked fields and try again.");
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    setPending(true);
    try {
      const result = await submitDemoRequest({ ...parsed.data, source });
      if (result.ok) {
        setDone(true);
        setMessage("Request received.");
        return;
      }

      // An honest failure is a visible state, never a silent success
      // (AGENTS.md 8.2 rule 4).
      setErrors({ ...NO_FIELD_ERRORS, ...result.fieldErrors });
      setMessage(result.error);
    } catch {
      setMessage(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button ref={triggerRef} className={className} onClick={openDialog}>
        {children}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={onDialogClick}
        aria-labelledby="demo-request-heading"
        className="m-auto w-[min(560px,calc(100vw-32px))] bg-white p-0 text-ink backdrop:bg-ink/40"
      >
        {/* Rendered only while open, so the closed dialog contributes an empty
            element to every page it sits on and nothing more. */}
        {open ? (
          <div className="border border-border p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <h2
                id="demo-request-heading"
                ref={headingRef}
                tabIndex={-1}
                className="font-sans text-[28px] leading-[32px] font-bold text-balance outline-none"
              >
                {done ? "Request received" : "Request a demo"}
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close"
                className="-mr-2 -mt-2 shrink-0 p-2 font-mono text-[16px] leading-none text-muted outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                ✕
              </button>
            </div>

            <div
              ref={statusRef}
              role="status"
              aria-live="polite"
              tabIndex={-1}
              className={`mt-6 border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
                message ? "block" : "hidden"
              }`}
            >
              {message}
            </div>

            {done ? (
              // Success swaps the body in place — no redirect, so the page keeps
              // its scroll position and its motion state (AGENTS.md 10 rule 5).
              <>
                <p className="mt-6 font-serif text-[18px] leading-[26px] text-muted">
                  Thank you. Someone from the team will be in touch to arrange a
                  walkthrough of how Aetherfield fits your reporting.
                </p>
                <Button className="mt-8 w-full" onClick={closeDialog}>
                  Close
                </Button>
              </>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <p className="mt-4 font-serif text-[18px] leading-[26px] text-muted">
                  {INTRO}
                </p>
                <Field
                  id="demo-request-name"
                  name="name"
                  label="Name"
                  autoComplete="name"
                  error={errors.name || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <Field
                  id="demo-request-email"
                  name="email"
                  label="Work email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  error={errors.email || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <Field
                  id="demo-request-company"
                  name="company"
                  label="Company"
                  autoComplete="organization"
                  error={errors.company || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <TextareaField
                  id="demo-request-message"
                  name="message"
                  label="What are you trying to measure?"
                  hint="Optional."
                  rows={4}
                  error={errors.message || undefined}
                  disabled={pending}
                  className="mt-6"
                />
                <Button type="submit" className="mt-8 w-full" disabled={pending}>
                  {pending ? "Sending request..." : "Request a demo"}
                </Button>
              </form>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}

"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { subscribeToNewsletter } from "../../_actions/newsletter";
import {
  newsletterFieldsSchema,
  NO_FIELD_ERRORS,
  type NewsletterFieldErrors,
} from "../../../lib/validation/newsletter";
import { Button, Field } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * The newsletter's client leaf — build step 4, and a copy of
 * `lead/demo-request-dialog.tsx` rather than a second dialog vocabulary.
 *
 * **It takes the settled button over and adds no box.** Like `NavDrop`,
 * `FooterMotion` and the demo dialog, the leaf renders the element being
 * replaced rather than wrapping it, so `/journal`'s band keeps its geometry and
 * its class string. The `<dialog>` is a sibling in a fragment; closed, it
 * contributes one empty element and nothing else to the prerender.
 *
 * **Native `<dialog>` + `showModal()`**, for the focus trap, the inert
 * background, the top layer and the Escape key — none of which are rebuilt
 * here.
 *
 * **No GSAP, and that is the point.** The close button's magnify-spin-and-tone
 * on the demo dialog is an explicit, user-granted exception to AGENTS.md 7.5
 * (7 Aug 2026, after the rule was shown and a CSS-only alternative offered).
 * A grant for one surface is not a licence to spread GSAP into the next piece
 * of backend UI, so this button is the same markup with the same
 * `transition-colors` and no tween.
 *
 * The client-side parse is a courtesy to the person filling the form and is
 * **not** a check: the same schema runs again inside the action (AGENTS.md 6.2).
 */

/* Constants rather than JSX text: the site ships straight apostrophes, and
   `react/no-unescaped-entities` rejects one written inline. */
const INTRO =
  "Field notes on climate data, sustainability strategy, and the tools that turn measurement into action.";

/** **The success copy says what actually happened.** The subscription is not
    active until the link is used, and copy implying otherwise would make the
    double opt-in a silent failure — the person would wait for a journal that
    never comes, believing they had subscribed (AGENTS.md 8.2 rule 4). */
const SUCCESS_BODY =
  "Check your inbox and use the link we just sent to confirm the address. Nothing is sent to it until you do.";

export function NewsletterSubscribeDialog({
  className,
  children,
}: {
  /** Taken over from the `<Button>` being replaced, so nothing is added. */
  className?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<NewsletterFieldErrors>(NO_FIELD_ERRORS);

  // The announcement takes focus whenever it changes, so a screen reader lands
  // on the outcome rather than being told about it from wherever it was.

  /* The heading rather than the input: the person should hear what the dialog
     is before being dropped into a text box. It has to run in an effect — the
     body renders only once `open` is true, so `headingRef` is still null inside
     the click handler, and `showModal()` would leave focus on the <dialog>. */
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
    const raw = { email: String(data.get("email") ?? "") };

    const parsed = newsletterFieldsSchema.safeParse(raw);
    if (!parsed.success) {
      const next = { ...NO_FIELD_ERRORS };
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in next) {
          next[field as keyof NewsletterFieldErrors] ||= issue.message;
        }
      }
      setErrors(next);
      setMessage("Check the marked field and try again.");
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    setPending(true);
    try {
      const result = await subscribeToNewsletter(parsed.data);
      if (result.ok) {
        setDone(true);
        setMessage("Confirmation sent.");
        return;
      }

      // An honest failure is a visible state, never a silent success
      // (AGENTS.md 8.2 rule 4).
      setErrors({ ...NO_FIELD_ERRORS, ...result.fieldErrors });
      setMessage(result.error);
    } catch {
      setMessage(NETWORK_ERROR);
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
        aria-labelledby="newsletter-subscribe-heading"
        className="m-auto w-[min(560px,calc(100vw-32px))] bg-white p-0 text-ink backdrop:bg-ink/25 backdrop:backdrop-blur-md"
      >
        {/* Rendered only while open, so the closed dialog contributes an empty
            element to `/journal` and nothing more. */}
        {open ? (
          <div className="border border-border p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <h2
                id="newsletter-subscribe-heading"
                ref={headingRef}
                tabIndex={-1}
                className="font-sans text-[28px] leading-[32px] font-bold text-balance outline-none"
              >
                {done ? "Confirm your address" : "Subscribe to the journal"}
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

            <FormStatus message={message} as="div" className="mt-6" />

            {done ? (
              // Success swaps the body in place — no redirect, so the page keeps
              // its scroll position and its motion state (AGENTS.md 10 rule 5).
              <>
                <p className="mt-6 font-serif text-[18px] leading-[26px] text-muted">
                  {SUCCESS_BODY}
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
                  id="newsletter-email"
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  hint="We send a confirmation link first. You can stop at any time."
                  error={errors.email || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <Button
                  type="submit"
                  className="mt-8 w-full"
                  disabled={pending}
                >
                  {pending
                    ? "Sending confirmation..."
                    : "Sign up to newsletter"}
                </Button>
              </form>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}

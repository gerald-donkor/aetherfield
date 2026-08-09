"use client";

import {
  type ChangeEvent,
  type ComponentProps,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { submitApplication } from "../../_actions/application";
import {
  applicationFieldsSchema,
  CV_ACCEPT,
  CV_ACCEPT_ATTR,
  CV_ERRORS,
  CV_MAX_BYTES,
  CV_MAX_LABEL,
  NO_FIELD_ERRORS,
  type ApplicationFieldErrors,
} from "../../../lib/validation/application";
import { Button, Field, FileField, TextareaField } from "../primitives";

/**
 * The apply dialog — build step 5's client leaf, and a copy of
 * `lead/demo-request-dialog.tsx` rather than a third dialog vocabulary. Step 4's
 * `newsletter/subscribe-dialog.tsx` is the same copy; where the three agree,
 * they agree deliberately.
 *
 * **It takes the settled button over and adds no box.** Like `NavDrop`,
 * `FooterMotion` and the other two dialogs, the leaf renders the element being
 * replaced rather than wrapping it, so `/careers`'s open-application card and
 * `/job-listing/[slug]`'s closing call to action keep their geometry and their
 * class strings. The `<dialog>` is a sibling in a fragment; closed, it
 * contributes one empty element to the prerender and nothing else.
 *
 * **Native `<dialog>` + `showModal()`**, for the focus trap, the inert
 * background, the top layer and the Escape key — none of which are rebuilt here.
 *
 * **No GSAP, and no tone.** The demo dialog's close button magnifies, spins and
 * whines; that is an explicit, user-granted exception to AGENTS.md 7.5 for one
 * surface (7 Aug 2026, after the rule was shown and a CSS-only alternative
 * offered), and a grant for one surface is not a licence to spread GSAP into the
 * next piece of backend UI. This close button is the same markup with the same
 * `transition-colors` and no tween. Nothing here imports `../motion/register`.
 *
 * **The client-side checks are a courtesy to the person filling the form and are
 * not checks.** The same schema runs again inside `submitApplication`, which
 * additionally validates the slug against `JOBS` and reads the CV's leading
 * `%PDF-` bytes — a browser-declared `File.type` is attacker-controlled, so the
 * server's read is the only validation that counts (AGENTS.md 6.2, 8.2 rule 3).
 * The point of running the rules here is a faster no, not a safer one.
 *
 * The file travels in a `FormData` because a `File` cannot cross a Server Action
 * boundary in a plain object; `submitApplication` takes `FormData` for that
 * reason and the payload is assembled below rather than lifted off the form, so
 * what is sent is exactly what was parsed.
 */

/* Constants rather than JSX text: the site ships straight apostrophes, and
   `react/no-unescaped-entities` rejects one written inline. */
const INTRO = "Tell us how to reach you and attach your CV.";

/** **The success copy promises only what has happened.** A reply-by date is a
    commitment nobody at the company has made, and the site's register is
    measured and operational (AGENTS.md 5) — so this says the application and the
    CV arrived, and stops. */
const SUCCESS_BODY =
  "Thank you. Your application and CV are with the team. If your experience matches what the role needs, someone will be in touch.";

/** Rounded for reading, not for arithmetic — the size that decides anything is
    `CV_MAX_BYTES`, compared below in bytes. KB up to a megabyte and one decimal
    above it is the register a person recognises from their own file manager. */
function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The courtesy file check, in the order a person would notice the problems:
 * nothing attached, then the wrong kind of thing, then one that is too big.
 *
 * `File.type` is what the browser guessed from the extension and some platforms
 * hand back an empty string for a perfectly good PDF, so an empty type is not
 * treated as a failure — the filename is consulted instead, and the action reads
 * the bytes regardless. Erring towards letting a file through is right here: a
 * false positive would block a real applicant on the client, where nothing is
 * being protected.
 */
function checkCv(file: File | null) {
  if (!file) return CV_ERRORS.missing;
  const declaredPdf = file.type === CV_ACCEPT;
  const namedPdf = file.name.toLowerCase().endsWith(".pdf");
  if (!declaredPdf && !(file.type === "" && namedPdf)) return CV_ERRORS.type;
  if (file.size > CV_MAX_BYTES) return CV_ERRORS.size;
  return "";
}

export function ApplyDialog({
  jobSlug,
  role,
  size,
  className,
  children,
}: {
  /** Which listing this is. Sent as a field and validated server-side against
      `JOBS` — a reference, not a foreign key (AGENTS.md 9.2 rule 1). */
  jobSlug: string;
  /** The role's name, for the dialog's own heading line. Display only: the
      server reads the role from `JOBS` by slug and never from this. */
  role: string;
  /** Taken over from the `<Button>` being replaced, along with `className`.
      **Both halves are needed or the replacement is not a replacement:** the
      two trigger sites are different sizes — `/careers`'s card action is
      `compact` (38px, no bullet) and `/job-listing`'s closing action is the
      default `primary` (46px, bullet) — so a leaf that only forwarded
      `className` would silently resize a measured card. */
  size?: ComponentProps<typeof Button>["size"];
  /** Taken over from the `<Button>` being replaced, so nothing is added. */
  className?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ApplicationFieldErrors>(NO_FIELD_ERRORS);

  /* Ids are namespaced by slug rather than fixed. Only one apply dialog appears
     on a page today, but `/` already ships two demo dialogs with one heading id
     between them, and a second trigger on `/careers` would repeat that here for
     free. */
  const idBase = `apply-${jobSlug}`;

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
    setFile(null);
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

  /* Choosing a file clears the file's error: the person has answered the
     complaint, and leaving the marker up would have them re-reading a sentence
     about the file they just replaced. */
  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setErrors((current) => (current.cv ? { ...current, cv: "" } : current));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const data = new FormData(event.currentTarget);
    const raw = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
    };

    const parsed = applicationFieldsSchema.safeParse(raw);
    const cvError = checkCv(file);

    /* `|| !file` is logically redundant — `checkCv` already returns
       `CV_ERRORS.missing` for a null file — and is there so the narrowing below
       is the compiler's rather than a cast's. */
    if (!parsed.success || cvError || !file) {
      const next = { ...NO_FIELD_ERRORS, cv: cvError };
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string" && field in next) {
            next[field as keyof ApplicationFieldErrors] ||= issue.message;
          }
        }
      }
      setErrors(next);
      setMessage("Check the marked fields and try again.");
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    setPending(true);
    try {
      /* Assembled rather than reusing the form's own `FormData`: the values
         posted are then the parsed ones — trimmed name, lowercased address —
         and an absent message is absent rather than an empty string, which is
         what `application.message` being nullable means. */
      const payload = new FormData();
      payload.set("name", parsed.data.name);
      payload.set("email", parsed.data.email);
      if (parsed.data.message) payload.set("message", parsed.data.message);
      payload.set("jobSlug", jobSlug);
      payload.set("cv", file);

      const result = await submitApplication(payload);
      if (result.ok) {
        setDone(true);
        setMessage("Application received.");
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
      <Button
        ref={triggerRef}
        size={size}
        className={className}
        onClick={openDialog}
      >
        {children}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={onDialogClick}
        aria-labelledby={`${idBase}-heading`}
        className="m-auto w-[min(560px,calc(100vw-32px))] bg-white p-0 text-ink backdrop:bg-ink/25 backdrop:backdrop-blur-md"
      >
        {/* Rendered only while open, so the closed dialog contributes an empty
            element to `/careers` and the three listings, and nothing more. */}
        {open ? (
          <div className="border border-border p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2
                  id={`${idBase}-heading`}
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-sans text-[28px] leading-[32px] font-bold text-balance outline-none"
                >
                  {done ? "Application received" : "Apply"}
                </h2>
                {/* The role names itself on a line of its own rather than
                    inside the heading. "Apply for Open application" is what a
                    templated heading would read on `/careers`'s fourth card,
                    and the mono caption is the vocabulary the job cards already
                    use for a role's particulars. */}
                <p className="mt-2 font-mono text-caption text-muted">{role}</p>
              </div>
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
                  id={`${idBase}-name`}
                  name="name"
                  label="Name"
                  autoComplete="name"
                  error={errors.name || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <Field
                  id={`${idBase}-email`}
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  error={errors.email || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <FileField
                  id={`${idBase}-cv`}
                  name="cv"
                  label="CV"
                  /* The cap is read from the shared constant, so the sentence
                     and the check can never disagree. */
                  hint={`PDF, up to ${CV_MAX_LABEL}.`}
                  accept={CV_ACCEPT_ATTR}
                  onChange={onFileChange}
                  fileName={file?.name}
                  fileSize={file ? formatSize(file.size) : undefined}
                  error={errors.cv || undefined}
                  disabled={pending}
                  required
                  className="mt-6"
                />
                <TextareaField
                  id={`${idBase}-message`}
                  name="message"
                  label="Anything you want us to know?"
                  hint="Optional."
                  rows={4}
                  error={errors.message || undefined}
                  disabled={pending}
                  className="mt-6"
                />
                <Button type="submit" className="mt-8 w-full" disabled={pending}>
                  {pending ? "Sending application..." : "Send application"}
                </Button>
              </form>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}

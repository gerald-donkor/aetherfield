"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { submitDemoRequest } from "../../_actions/demo-request";
import {
  demoRequestFieldsSchema,
  NO_FIELD_ERRORS,
  type DemoRequestFieldErrors,
} from "../../../lib/validation/lead";
import { EASE, gsap, useGSAP } from "../motion/register";
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
 * this file adds none of them by hand. The dialog's own open and close remain
 * CSS, and its `::backdrop` blurs the page behind rather than transitioning.
 *
 * **The one GSAP in this file is the close button's hover, and it is an
 * explicit deviation from AGENTS.md 7.5** ("no GSAP for backend UI"), granted
 * by the user on 7 Aug 2026 after being shown the conflict and offered a
 * CSS-only alternative. The 7.5 bullet records the grant; `docs/backend.md`
 * records what the animation does and which of its numbers are judged rather
 * than measured. It costs no bundle: `chrome.tsx` already pulls `NavDrop` and
 * `FooterMotion`, so GSAP is in every route this dialog appears on.
 *
 * The client-side parse below is a courtesy to the person filling the form and
 * is **not** a check: the same schema runs again inside the action, which is
 * the only validation that counts (AGENTS.md 6.2).
 */

/* A constant rather than JSX text: the site ships straight apostrophes
   (AGENTS.md), and `react/no-unescaped-entities` rejects one written inline. */
const INTRO = "Tell us where to reach you and we'll arrange a walkthrough.";

/* A local duration rather than `register.ts`'s `DUR`, on the `FOOTER_DUR`
   precedent: 0.5 is the page-reveal vocabulary and is sluggish under a cursor,
   where the response has to feel attached to the pointer. `EASE` is still
   imported rather than restated — only the pace changes, not the curve.
   **Judged, not measured**: there is no recording of this interaction to fit
   against, and 90 degrees is chosen because the glyph is a `✕`, which lands
   back on itself and never rests crooked. */
const HOVER_DUR = 0.22;
const HOVER_SCALE = 1.35;
const HOVER_ROTATION = 90;

/* The whine, also judged: a servo spinning up, not a notification chime. The
   site's register is measured and operational and a cheerful ding would be
   off-voice, so this is quiet (peak gain 0.05), brief, and mechanical. */
const TONE_FROM_HZ = 420;
const TONE_TO_HZ = 1080;
const TONE_SECONDS = 0.18;
const TONE_PEAK_GAIN = 0.05;

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
  const closeRef = useRef<HTMLButtonElement>(null);

  /* The paused hover tween, or null. **Null is the reduced-motion state and
     the not-yet-mounted state alike**, and both handlers below no-op on it —
     someone who asked for less motion gets no tween and no tone, rather than a
     zero-duration tween. */
  const hoverRef = useRef<gsap.core.Tween | null>(null);

  const audioRef = useRef<AudioContext | null>(null);
  const toneRef = useRef<OscillatorNode | null>(null);

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

  /* The close button's magnify-and-spin.
     `dependencies: [open]` with `revertOnUpdate` because the button mounts
     *after* this hook first runs — the dialog body renders only while `open`
     is true, so the ref is null on mount and the body below no-ops. The tweens
     tween is created here, inside the context, so `mm.revert()` owns it;
     nothing is wrapped in `contextSafe`, which is banned in this codebase and
     has no use here (the handlers are React props, not `addEventListener`
     calls). */
  useGSAP(
    () => {
      hoverRef.current = null;
      const button = closeRef.current;
      if (!button) return;

      const mm = gsap.matchMedia();

      mm.add(
        {
          // Both conditions are named: a lone `reduce` query never fires for
          // anyone else, so the tween would never be created at all.
          fullMotion: "(prefers-reduced-motion: no-preference)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { fullMotion } = context.conditions as { fullMotion: boolean };
          if (!fullMotion) return;

          // `scale` and `rotation` — transform aliases, so the hover stays on
          // the compositor and triggers no layout. GSAP folds Tailwind v4's
          // independent `rotate`/`scale` into one `transform`, so the resting
          // values are authored explicitly in the `from` rather than left to
          // CSS. No `clearProps`: nothing here has a hidden CSS start state,
          // and clearing a transform is how an element vanishes elsewhere on
          // this site.
          //
          // **One paused tween played and reversed, not two `gsap.quickTo`
          // setters.** The setter pair was tried first and measured wrong:
          // `scale` is a shorthand over `scaleX`/`scaleY`, and a `quickTo` on
          // it alongside a second `quickTo` on `rotation` left the button at
          // `matrix(0, 1, -1, 0, 0, 0)` on hover — the 90 degrees landed and
          // the magnify was silently dropped. `quickTo`'s reason to exist is a
          // stream of new target values per frame; a hover has exactly two
          // states, so a paused tween is both correct and the smaller thing.
          hoverRef.current = gsap.fromTo(
            button,
            { scale: 1, rotation: 0 },
            {
              scale: HOVER_SCALE,
              rotation: HOVER_ROTATION,
              duration: HOVER_DUR,
              ease: EASE,
              paused: true,
            },
          );

          return () => {
            hoverRef.current = null;
          };
        },
      );

      return () => mm.revert();
    },
    { dependencies: [open], revertOnUpdate: true, scope: dialogRef },
  );

  // Output only — no input device is opened and no permission is requested.
  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    },
    [],
  );

  /* A short synthesized tone, on pointer enter only. Never on focus — a
     keyboard user tabbing through the dialog should not be blasted — and never
     on mount. The dialog is only ever reached through a click, so the gesture
     that unlocks audio has already happened; `resume()` is defensive. */
  function whine() {
    if (typeof window.AudioContext !== "function") return;
    try {
      const ctx = (audioRef.current ??= new AudioContext());
      void ctx.resume().catch(() => {});

      // Re-entering before the previous tone finishes must not stack.
      toneRef.current?.stop();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(TONE_FROM_HZ, now);
      osc.frequency.exponentialRampToValueAtTime(TONE_TO_HZ, now + TONE_SECONDS);
      gain.gain.setValueAtTime(TONE_PEAK_GAIN, now);
      // Exponential, and to a floor rather than 0 — WebAudio rejects 0 as an
      // exponential ramp target.
      gain.gain.exponentialRampToValueAtTime(0.0001, now + TONE_SECONDS);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + TONE_SECONDS);
      osc.onended = () => {
        if (toneRef.current === osc) toneRef.current = null;
      };
      toneRef.current = osc;
    } catch {
      // The tone is an embellishment; it may never break the dialog.
    }
  }

  function magnify() {
    hoverRef.current?.play();
  }

  function settle() {
    hoverRef.current?.reverse();
  }

  function onCloseEnter() {
    magnify();
    // Gated on the same preference as the tween: no tween, no tone.
    if (hoverRef.current) whine();
  }

  function onCloseLeave() {
    // A focused button keeps the affordance when the pointer leaves it,
    // otherwise the pointer would undo the keyboard's state.
    if (closeRef.current && document.activeElement === closeRef.current) return;
    settle();
  }

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
        /* The `::backdrop` blurs the page behind rather than only darkening it,
           and the tint drops from 40% to 25% because the blur is now doing the
           separation work: keeping both makes the page unreadable rather than
           deferred. `backdrop-blur-md` is 12px. Both values are **judgements**
           — the reference screenshot shows the state before the blur and only
           marks where it belongs. No transition: animating a `::backdrop`
           needs `@starting-style` and `allow-discrete`, and the dialog has no
           open/close transition to hang one on. */
        className="m-auto w-[min(560px,calc(100vw-32px))] bg-white p-0 text-ink backdrop:bg-ink/25 backdrop:backdrop-blur-md"
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
                ref={closeRef}
                type="button"
                onClick={closeDialog}
                onPointerEnter={onCloseEnter}
                onPointerLeave={onCloseLeave}
                // Keyboard parity: the affordance is not pointer-only. Focus
                // magnifies and spins but stays silent.
                onFocus={magnify}
                onBlur={settle}
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

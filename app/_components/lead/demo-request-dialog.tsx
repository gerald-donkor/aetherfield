"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { submitDemoRequest } from "../../_actions/demo-request";
import {
  demoRequestFieldsSchema,
  NO_FIELD_ERRORS,
  type DemoRequestField,
} from "../../../lib/validation/lead";
import { EASE, gsap, useGSAP } from "../motion/register";
import { Button, Field, TextareaField } from "../primitives";
import { FormStatus } from "../form-status";
import { useWrite } from "../use-write";

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

/* The magnify — the hover *affordance*, and still a **judgement**. A local
   duration rather than `register.ts`'s `DUR`, on the `FOOTER_DUR` precedent:
   0.5 is the page-reveal vocabulary and is sluggish under a cursor, where the
   response has to feel attached to the pointer. `EASE` is still imported rather
   than restated — only the pace changes, not the curve. It is kept, and kept
   separate from the spin, because it holds for as long as the pointer is on the
   button and so says "this target is live", which a 0.45 s turn that ends back
   at rest cannot. */
const HOVER_DUR = 0.22;
const HOVER_SCALE = 1.35;

/* The spin, and unlike everything above it this is **measured**, fitted to
   `Screencast_20260809_172923.webm` by template-matching the glyph frame by
   frame (procedure in `docs/automation.md`, result in `docs/backend.md`): one
   continuous **360 degree clockwise** turn over **0.450 s**, scale flat at 1.0
   throughout. 360 lands on 0, so nothing has to reverse it and the button never
   rests crooked. */
const SPIN_DUR = 0.45;
const SPIN_ROTATION = 360;

/* The reference's ease is symmetric — p(0.5) = 0.500 to within a frame — which
   is why `EASE` is *not* imported here: `power3.out` is an out ease and would
   contradict the measurement. The fit cannot separate `sine.inOut`,
   `power1.5.inOut` and `power2.inOut` (each wins one of the three clean
   windows, and the spread between them is the noise floor), so the floor is the
   measurement and this curve is a **judgement on it** — the only candidate that
   never loses badly in any window.

   It is written out as a function because **GSAP has no `power1.5` string**:
   `gsap.parseEase("power1.5.inOut")` returns `undefined`, and an unparseable
   ease silently falls back to the default `power1.out`, which is the exact out
   ease the measurement rules out. A function ease needs no plugin, so this
   costs no bundle and adds no `registerPlugin` call. */
const SPIN_POWER = 1.5;
const SPIN_EASE = (p: number) =>
  p < 0.5
    ? Math.pow(2 * p, SPIN_POWER) / 2
    : 1 - Math.pow(2 - 2 * p, SPIN_POWER) / 2;

/* The fan. **Every number here is a judgement, not a measurement** — the
   reference recording carries a video stream only, so there is nothing to fit
   and the brief is the user's own four words: "a spinning or whinning sound
   like a fanning sound". It replaces prompt 45's 420 → 1080 Hz triangle sweep,
   which read as a chime.

   A fan is broadband, so the source is white noise through a bandpass rather
   than an oscillator; the band's centre rises and falls across the spin, which
   is the blade note spinning up and coasting down, and a low-frequency
   oscillator into the gain gives the chop that separates a fan from a whoosh.
   Peak gain stays at prompt 45's 0.05: the site's register is measured and
   operational, and this is meant to be barely there. */
const FAN_SECONDS = SPIN_DUR;
const FAN_PEAK_GAIN = 0.05;
const FAN_GAIN_FLOOR = 0.0001;
const FAN_ATTACK = 0.06;
const FAN_HZ_REST = 320;
const FAN_HZ_PEAK = 1500;
const FAN_Q = 1.8;
const FAN_BLADE_HZ_REST = 18;
const FAN_BLADE_HZ_PEAK = 72;
const FAN_BLADE_DEPTH = 0.35;
/* One second of noise, generated once and reused: comfortably longer than the
   0.45 s burst, so the source never has to loop. */
const FAN_NOISE_SECONDS = 1;

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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /* The two paused hover tweens, or null. **Null is the reduced-motion state
     and the not-yet-mounted state alike**, and every handler below no-ops on it
     — someone who asked for less motion gets no tween and no sound, rather than
     a zero-duration tween. They are kept apart because they answer to different
     gestures: the magnify holds while the pointer is on the button, the spin is
     a one-shot fired on entry. */
  const magnifyRef = useRef<gsap.core.Tween | null>(null);
  const spinRef = useRef<gsap.core.Tween | null>(null);

  const audioRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const fanRef = useRef<AudioBufferSourceNode | null>(null);

  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const write = useWrite<DemoRequestField>({
    fields: NO_FIELD_ERRORS,
    fieldsMessage: "Check the marked fields and try again.",
  });
  const { pending, message, errors } = write;

  // The announcement takes focus whenever it changes, so a screen reader lands
  // on the outcome rather than being told about it from wherever it was.

  /* The heading rather than the first input: the person should hear what the
     dialog is before being dropped into a text box. It has to run in an effect
     — the body renders only once `open` is true, so `headingRef` is still null
     inside the click handler, and `showModal()` would leave focus on the
     <dialog> itself. */
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  /* The close button's magnify and spin.
     `dependencies: [open]` with `revertOnUpdate` because the button mounts
     *after* this hook first runs — the dialog body renders only while `open`
     is true, so the ref is null on mount and the body below no-ops. Both tweens
     are created here, inside the context, so `mm.revert()` owns them; nothing
     is wrapped in `contextSafe`, which is banned in this codebase and has no
     use here (the handlers are React props, not `addEventListener` calls). */
  useGSAP(
    () => {
      magnifyRef.current = null;
      spinRef.current = null;
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

          // `scale` and `rotation` — transform aliases, so both stay on the
          // compositor and trigger no layout. GSAP folds Tailwind v4's
          // independent `rotate`/`scale` into one `transform`, so the resting
          // values are authored explicitly in the `from` rather than left to
          // CSS. No `clearProps`: nothing here has a hidden CSS start state,
          // and clearing a transform is how an element vanishes elsewhere on
          // this site.
          //
          // **Two paused tweens on one element, not one tween doing both, and
          // not `gsap.quickTo`.** They have to be separate because the gestures
          // are: the magnify is played and reversed by the pointer and by
          // focus, while the spin is restarted on entry and runs to completion.
          // GSAP composes `scale` and `rotation` onto a single matrix, so
          // concurrent tweens on the two aliases are safe — but prompt 45 lost
          // a magnify to exactly this class of mistake (a `quickTo` on `scale`,
          // which is a shorthand over `scaleX`/`scaleY`, alongside one on
          // `rotation`, left the button at `matrix(0, 1, -1, 0, 0, 0)`), so the
          // composed matrix is read back in the browser and recorded in
          // `docs/backend.md` rather than assumed.
          magnifyRef.current = gsap.fromTo(
            button,
            { scale: 1 },
            {
              scale: HOVER_SCALE,
              duration: HOVER_DUR,
              ease: EASE,
              paused: true,
            },
          );

          // `fromTo`, never `from` — the front-matter rule, and here it also
          // means a re-entry mid-turn restarts from 0 rather than from
          // wherever the glyph had got to. Nothing reverses this one: 360
          // degrees lands back on 0.
          spinRef.current = gsap.fromTo(
            button,
            { rotation: 0 },
            {
              rotation: SPIN_ROTATION,
              duration: SPIN_DUR,
              ease: SPIN_EASE,
              paused: true,
            },
          );

          return () => {
            magnifyRef.current = null;
            spinRef.current = null;
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
      // The buffer belongs to the closed context; a later mount regenerates it.
      noiseRef.current = null;
      fanRef.current = null;
    },
    [],
  );

  /* A short burst of fan, on pointer enter only. Never on focus — a keyboard
     user tabbing through the dialog should not be blasted — and never on mount.
     The dialog is only ever reached through a click, so the gesture that
     unlocks audio has already happened; `resume()` is defensive.

     Signal path:

       noise ─▶ bandpass ─▶ chop ─▶ envelope ─▶ destination
                             ▲
             blade LFO ─▶ depth

     The blade oscillator is connected to the chop gain's *AudioParam*, where it
     sums with that param's intrinsic value, so the intrinsic sits at
     `1 - depth` and the LFO swings it between `1 - 2·depth` and `1`. */
  function fan() {
    if (typeof window.AudioContext !== "function") return;
    try {
      const ctx = (audioRef.current ??= new AudioContext());
      void ctx.resume().catch(() => {});

      // Re-entering before the previous burst finishes must not stack.
      fanRef.current?.stop();

      // Generated once and cached. The sample rate is checked because a
      // buffer belongs to the rate it was made at, and a context that was
      // closed and remade may not come back at the same one.
      let noise = noiseRef.current;
      if (!noise || noise.sampleRate !== ctx.sampleRate) {
        const frames = Math.ceil(ctx.sampleRate * FAN_NOISE_SECONDS);
        noise = ctx.createBuffer(1, frames, ctx.sampleRate);
        const channel = noise.getChannelData(0);
        for (let i = 0; i < frames; i += 1) channel[i] = Math.random() * 2 - 1;
        noiseRef.current = noise;
      }

      const now = ctx.currentTime;
      const half = now + FAN_SECONDS / 2;
      const end = now + FAN_SECONDS;

      const source = ctx.createBufferSource();
      source.buffer = noise;

      // The band's centre follows the spin: up over the first half, back down
      // over the second. Authored as an explicit up-ramp and down-ramp rather
      // than an attempt to reproduce `SPIN_EASE` in WebAudio.
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = FAN_Q;
      band.frequency.setValueAtTime(FAN_HZ_REST, now);
      band.frequency.exponentialRampToValueAtTime(FAN_HZ_PEAK, half);
      band.frequency.exponentialRampToValueAtTime(FAN_HZ_REST, end);

      const blade = ctx.createOscillator();
      blade.type = "sine";
      blade.frequency.setValueAtTime(FAN_BLADE_HZ_REST, now);
      blade.frequency.exponentialRampToValueAtTime(FAN_BLADE_HZ_PEAK, half);
      blade.frequency.exponentialRampToValueAtTime(FAN_BLADE_HZ_REST, end);

      const depth = ctx.createGain();
      depth.gain.value = FAN_BLADE_DEPTH;

      const chop = ctx.createGain();
      chop.gain.value = 1 - FAN_BLADE_DEPTH;

      // Exponential ramps to a floor rather than 0 — WebAudio rejects 0 as an
      // exponential target — and starting from the floor rather than the peak
      // so the burst spins up instead of clicking in at full level.
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(FAN_GAIN_FLOOR, now);
      envelope.gain.exponentialRampToValueAtTime(
        FAN_PEAK_GAIN,
        now + FAN_ATTACK,
      );
      envelope.gain.exponentialRampToValueAtTime(FAN_GAIN_FLOOR, end);

      source
        .connect(band)
        .connect(chop)
        .connect(envelope)
        .connect(ctx.destination);
      blade.connect(depth).connect(chop.gain);

      source.start(now);
      source.stop(end);
      blade.start(now);
      blade.stop(end);
      source.onended = () => {
        // Fires on an early `stop()` too, which is what takes the blade
        // oscillator down with the burst it belongs to.
        blade.stop();
        if (fanRef.current === source) fanRef.current = null;
      };
      fanRef.current = source;
    } catch {
      // The sound is an embellishment; it may never break the dialog.
    }
  }

  function magnify() {
    magnifyRef.current?.play();
  }

  function settle() {
    magnifyRef.current?.reverse();
  }

  function onCloseEnter() {
    magnify();
    // Both gated on the same preference as the tweens: no tween, no sound.
    if (spinRef.current) {
      spinRef.current.restart();
      fan();
    }
  }

  function onCloseLeave() {
    // A focused button keeps the affordance when the pointer leaves it,
    // otherwise the pointer would undo the keyboard's state.
    if (closeRef.current && document.activeElement === closeRef.current) return;
    settle();
  }

  function openDialog() {
    write.reset();
    setDone(false);
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  /* Fires for the close button, an Escape press and a backdrop click alike, so
     focus returns to the trigger by every route out. `write.reset()` replaces
     the bare `setPending(false)` this used to be — it also clears `message`
     and `errors`, but `openDialog` was already about to on the next open, so
     the substitution is behaviourally identical. */
  function onClose() {
    setOpen(false);
    write.reset();
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

    const data = new FormData(event.currentTarget);
    const raw = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      message: String(data.get("message") ?? ""),
    };

    await write.submit({
      parse: () => demoRequestFieldsSchema.safeParse(raw),
      call: (parsedData) => submitDemoRequest({ ...parsedData, source }),
      onSuccess: () => {
        setDone(true);
        return "Request received.";
      },
    });
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
                // magnifies, but does not spin and stays silent — the spin and
                // the fan are one gesture, tied to the pointer arriving.
                onFocus={magnify}
                onBlur={settle}
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
                <Button
                  type="submit"
                  className="mt-8 w-full"
                  disabled={pending}
                >
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

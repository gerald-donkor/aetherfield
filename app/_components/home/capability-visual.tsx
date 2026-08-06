"use client";

import { useRef } from "react";
import { DUR, EASE, ScrollTrigger, gsap, useGSAP } from "../motion/register";

/* The metric card's readings, in loop order.

   The sequence starts *and* ends on 583.7 so `repeat: -1` is seamless and the
   loop's resting point is the value the comps draw. The final step
   666.3 → 583.7 is −12.39%, which reproduces the comp's `↓12.4%` exactly —
   that is why 666.3 is the fifth reading and not a rounder number. All six are
   three digits plus one decimal, so the advance width never changes step. */
const READINGS = [583.7, 611.2, 548.9, 604.5, 666.3, 583.7];

/** Seconds per reading change — fast, the speedometer sweep the brief asks for. */
const STEP = 0.7;
/** Seconds the card holds a settled reading before the next sweep. */
const HOLD = 1.2;

/* The delta's colour ramp. `#2683EB` is exactly `--color-accent`, the same
   inline-hex-with-a-note precedent `Seal` sets in primitives.tsx. The red end
   deliberately gets no design-system token: it exists for this one element and
   a token would invite it being reused as a semantic colour it has never been
   fitted for. Blue at or below zero, fully red at +12%. */
const BLUE = "#2683EB";
const RED = "#D7263D";
const RED_AT = 12;

/** One turn of the asterisk, in seconds. "Not so fast." */
const SPIN = 9;

/** How far the card leans on hover, in degrees of rotationY. */
const LEAN = 20;

/**
 * The Capabilities section's photograph and the metric card floating on it.
 *
 * Split out of `capabilities.tsx` as its **only** client module: the `<Image>`
 * arrives as `children`, so that file stays a server component and `next/image`
 * never reaches the client bundle — the device `Reveal` and `HeroText` already
 * use. Keep this file **component-only**: a constant or type exported from here
 * and imported elsewhere drags GSAP into that page's bundle, the rule that
 * forced `PRINCIPLES` out into `principles-data.tsx`.
 *
 * Four behaviours, one `matchMedia`:
 *
 * 1. the cloth drifts downward as the section scrolls through — scrubbed;
 * 2. the card leans right on hover and unwinds on leave;
 * 3. the asterisk turns clockwise, slowly, forever;
 * 4. the reading counts between `READINGS`, with the delta and its colour
 *    derived from the direction it is travelling.
 *
 * **This section is a deliberate exception to the homepage's recorded
 * vocabulary** ("nothing is scrubbed… no parallax", "once, on enter"), at the
 * user's explicit request. See AGENTS.md.
 */
export function CapabilityVisual({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const drift = useRef<HTMLDivElement>(null);
  const float = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const star = useRef<SVGSVGElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const delta = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          // Both motion halves are named on purpose: a `matchMedia` handler
          // only runs while at least one of its conditions matches, so a lone
          // `reduce` query would never fire for everybody else.
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
          // Nothing may stick on a touch device. Tailwind v4 wraps its own
          // `hover:` rules in this query for free; a JS pointer handler gets no
          // such wrapper, so it is authored here explicitly.
          hasHover: "(hover: hover)",
        },
        (context) => {
          const { reduceMotion, hasHover } = context.conditions as {
            reduceMotion: boolean;
            hasHover: boolean;
          };

          // Reduced motion gets nothing at all — no tween, no timeline, no
          // listener, no ScrollTrigger. Every element here is visible and
          // correct at rest, so the section is exactly what the server sent:
          // 583.7, ↓12.4%, the asterisk upright, the cloth still. Nothing needs
          // restoring because nothing was ever hidden.
          if (reduceMotion) return;

          /* 1 — the cloth, on two nested wrappers.

             The scrub alone is not enough: it only moves while the reader is
             actively scrolling, so a reader who has stopped to look at the card
             sees a still photograph. The falling has to be autonomous. So the
             outer wrapper takes the scroll parallax and an inner one carries a
             continuous drift, and the two compose without fighting over one
             element's transform.

             Neither may sit on the `data-reveal-item` box: `Reveal`'s stagger
             tween writes `y` on that box. */

          /* The overscan is authored as *asymmetric insets in CSS*, not as a
             uniform `scale` here — see the wrapper's class for why. Nothing is
             scaled, so this tween is the element's only transform. */
          gsap.fromTo(
            drift.current,
            { yPercent: -4 },
            {
              yPercent: 4,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.6,
              },
            },
          );

          /* The fall itself: three yoyoing tweens on *deliberately coprime-ish
             periods* — 3.5 / 5.5 / 6.5 s, i.e. the same 7 : 11 : 13 ratio at
             half the duration. That ratio is what keeps the compound period
             minutes long, so the cloth never visibly repeats and never lines up
             into an obvious bounce; a round "make everything 2 s" would destroy
             it. Sine easing because a falling cloth decelerates into each turn
             rather than snapping out of it. `y` leads; `x` and the rotation are
             the sway around it. Transform-only, so this composites on the GPU
             and never touches layout.

             **The amplitudes are solved against the wrapper's overscan budget,
             not chosen.** At 6 / 1.8 / 1.1 the worst-case vertical consumption
             is 0.1347H against the 0.16H the inset gives, and the horizontal
             0.0290W against 0.04W. The horizontal figure is the binding one:
             the x inset cannot grow without re-softening a 768x768 source, so
             x-sway and rotation are held small. See the wrapper's class below,
             and AGENTS.md, for why the two insets are not the same kind of
             number. */
          const fall = gsap
            .timeline({ paused: true })
            .to(
              float.current,
              {
                yPercent: 6,
                duration: 3.5,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
              },
              0,
            )
            .to(
              float.current,
              {
                xPercent: 1.8,
                duration: 5.5,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
              },
              0,
            )
            .to(
              float.current,
              {
                rotation: 1.1,
                duration: 6.5,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true,
              },
              0,
            );
          // Start mid-sway rather than at a dead stop, so the cloth is already
          // in motion the first time the section is scrolled into view. Halved
          // with the periods, so the entry phase is unchanged.
          fall.seek(1.75);

          /* 2 — the card's lean. A paused tween driven by play()/reverse(),
             not a `gsap.to` per event: a mouse-out mid-flight then unwinds
             along the same curve from wherever it is. The idiom
             `journal-mark.tsx` already justifies.

             `transformPerspective` is required, not decorative — without it
             `rotateY` is an orthographic squash with no foreshortening and does
             not read as a flip. "To the right" is read as the right edge
             receding, i.e. a positive rotationY. */
          const cardEl = card.current as HTMLDivElement;
          let lean: gsap.core.Tween | null = null;
          const onPointerEnter = () => lean?.play();
          const onPointerLeave = () => lean?.reverse();

          if (hasHover) {
            /* **Built directly, NOT through `contextSafe`.** This runs
               synchronously inside the `matchMedia` handler, so a gsap Context
               is already active and the tween is already registered with it —
               `mm.revert()` reverts it.

               Routing it through `contextSafe` instead is an actual bug, not a
               harmless belt-and-braces: `contextSafe` is bound to the *outer*
               `useGSAP` context, and `Context.add`'s wrapper does
               `prev && prev !== self && prev.data.push(self)`
               (`gsap-core.js:3925`). With the matchMedia context live as
               `prev`, that pushes the outer context into the inner one's
               `data` — while the inner is already in the outer's, from the
               same line when `mm.add` first matched. The two contexts then
               reference each other, and `Context.getTweens` recurses over
               `data` unconditionally (`:3949`), so the next `revert()` — i.e.
               the next unmount, which on `/` means any client-side navigation
               away — throws `RangeError: Maximum call stack size exceeded`.

               `journal-mark.tsx` was originally exempted here on the grounds
               that it called `contextSafe` from the entrance tween's
               `onComplete`, "on a later tick, with no context active". That is
               wrong, and it crashed `/journal` the same way: `_callback`
               restores the tween's *creating* context before invoking any
               callback (`gsap-core.js:981`), so `prev` is the matchMedia
               context there too. The corrected rule is: **`contextSafe` is only
               safe where no gsap Context is active** — which a tween callback
               is not, and neither is anything synchronous inside an `mm.add`
               handler. It appears nowhere in `app/` today. */
            lean = gsap.fromTo(
              cardEl,
              { rotationY: 0, transformPerspective: 900 },
              {
                rotationY: LEAN,
                transformPerspective: 900,
                transformOrigin: "50% 50%",
                duration: DUR * 0.7,
                ease: EASE,
                paused: true,
              },
            );
            cardEl.addEventListener("pointerenter", onPointerEnter);
            cardEl.addEventListener("pointerleave", onPointerLeave);
          }

          /* 3 — the asterisk. GSAP resolves an SVG element's transformOrigin
             itself; do not hand-author a `transform-box`. */
          const spin = gsap.to(star.current, {
            rotation: 360,
            duration: SPIN,
            ease: "none",
            repeat: -1,
            transformOrigin: "50% 50%",
            paused: true,
          });

          /* 4 — the reading and its delta, off one proxy. Deriving the delta
             from the tween rather than authoring it per step is what makes the
             arrow incapable of disagreeing with the number: it *is* the
             direction the value is travelling. The tween is monotonic within a
             step, so the sign is constant and the arrow cannot flicker. */
          const proxy = { n: READINGS[0] };
          const valueEl = value.current as HTMLSpanElement;
          const deltaEl = delta.current as HTMLSpanElement;
          const ramp = gsap.utils.interpolate(BLUE, RED);
          const toRed = gsap.utils.pipe(
            gsap.utils.mapRange(0, RED_AT, 0, 1),
            gsap.utils.clamp(0, 1),
          );

          const numbers = gsap.timeline({ repeat: -1, paused: true });
          READINGS.slice(1).forEach((next, i) => {
            const prev = READINGS[i];
            numbers.to(proxy, {
              n: next,
              duration: STEP,
              // power2.inOut, deliberately not EASE: a speedometer needle
              // accelerates off its mark, and power3.out never does.
              ease: "power2.inOut",
              onUpdate: () => {
                const pct = ((proxy.n - prev) / prev) * 100;
                valueEl.textContent = proxy.n.toFixed(1);
                deltaEl.textContent = `${pct >= 0 ? "↑" : "↓"}${Math.abs(
                  pct,
                ).toFixed(1)}%`;
                // Blue at or below zero, redder the further the reading climbs.
                deltaEl.style.color = ramp(toRed(pct));
              },
            });
            numbers.to({}, { duration: HOLD });
          });

          /* Both loops start paused and only run while the section is on
             screen — the whole reason a continuous loop is affordable here. */
          const gate = ScrollTrigger.create({
            trigger: root.current,
            start: "top bottom",
            end: "bottom top",
            onToggle: (self) => {
              if (self.isActive) {
                spin.play();
                numbers.play();
                fall.play();
              } else {
                spin.pause();
                numbers.pause();
                fall.pause();
              }
            },
          });

          return () => {
            cardEl.removeEventListener("pointerenter", onPointerEnter);
            cardEl.removeEventListener("pointerleave", onPointerLeave);
            lean?.kill();
            spin.kill();
            numbers.kill();
            fall.kill();
            gate.kill();
          };
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    // `overflow-hidden` clips the drift. It is safe here: the recorded "nothing
    // in this chain may become overflow-hidden" warnings are about the `Seal`'s
    // and the journal mark's ancestors, both in other sections.
    <div
      ref={root}
      className="relative aspect-[692/566] w-full overflow-hidden"
      data-reveal-item
    >
      {/* Two wrappers, not one: the outer takes the scroll parallax and the
          overscan, the inner the autonomous fall. Sharing one element would
          make the two tweens fight over its transform.

          **The overscan is asymmetric insets, not `scale`, and that is a
          resolution decision.** A uniform `scale: 1.16` makes the photograph
          paint 16% wider than its box, and `Image-3.png` is only 768x768 — at
          800 that pushed the required source width to 884 and visibly softened
          it. The motion is mostly vertical, and a square source cropped into
          this 692:566 box already has vertical pixels to spare, so the vertical
          overscan is free while the horizontal one is not. Rendered width drops
          from 1.16x the box to 1.08x, which is what puts desktop back inside
          the 750w candidate.

          **The 4% is a hard resolution ceiling; the 16% is a different kind of
          number and the two must not be reasoned about together.** `object-fit:
          cover` *clips* to this box, so the only coverage the fall can spend is
          the inset itself — there is no bonus from the source's overhang. But
          while the box is wider than it is tall, cover scales by *width*, so
          the rendered width — and therefore the srcset candidate — depends on
          the x inset alone. The box is 1.08W = 1.3204H wide, so vertical
          overscan is free right up to 16.02% and costs sharpness past it. 16%
          sits on that ceiling, which is what buys the fall its 6% of travel.
          Raising the x inset by even a point re-softens a 768x768 source.

          The budget, per side: vertical 0.16H available against 0.0488H of
          parallax + 0.0732H of fall + 0.0127H of rotation sweep = 0.1347H;
          horizontal 0.04W against 0.0194W + 0.0096W = 0.0290W. */}
      <div ref={drift} className="absolute -inset-x-[4%] -inset-y-[16%]">
        <div ref={float} className="absolute inset-0">
          {children}
        </div>
      </div>
      <div className="@container absolute inset-x-[8%] top-1/2 -translate-y-1/2 lg:inset-x-[16%]">
        <div ref={card} className="bg-white p-[4.5cqw] text-[2.6cqw]">
          <div className="flex items-start justify-between">
            <span className="font-mono text-[1em]">Energy consumption</span>
            <svg
              ref={star}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              className="size-[2.4em]"
              aria-hidden
            >
              <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
            </svg>
          </div>
          <div className="mt-[3em] flex items-baseline justify-between">
            {/* tabular-nums on both readouts: without it the value shifts
                horizontally as its digits change. The `MWh` span is a sibling
                of the number, so the tween writes the number's node only. */}
            <p className="font-sans text-[2.6em] leading-none font-bold tabular-nums">
              <span ref={value}>583.7</span>
              <span className="ml-[0.3em] text-[0.42em]">MWh</span>
            </p>
            <span
              ref={delta}
              className="font-mono text-[1em] text-accent tabular-nums"
            >
              ↓12.4%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

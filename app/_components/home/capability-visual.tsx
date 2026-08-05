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
  const card = useRef<HTMLDivElement>(null);
  const star = useRef<SVGSVGElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const delta = useRef<HTMLSpanElement>(null);

  useGSAP(
    (_context, contextSafe) => {
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

          /* 1 — the cloth. The only scrubbed animation on the site. It sits on
             an inner wrapper, never on the `data-reveal-item` box: `Reveal`'s
             stagger tween writes `y` on that box and the two would fight. The
             constant scale is the overscan that keeps an edge from entering the
             frame at either extreme of the ±5% travel: 1.16 puts 8% of the box
             beyond each edge against 5% of travel, so 3% of margin. 1.12 also
             covers it on paper (6% against 5%) but leaves only ~2.7px at 375,
             which is inside sub-pixel rounding. */
          gsap.set(drift.current, { scale: 1.16 });
          gsap.fromTo(
            drift.current,
            { yPercent: -5 },
            {
              yPercent: 5,
              ease: "none",
              scrollTrigger: {
                trigger: root.current,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.6,
              },
            },
          );

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
            // contextSafe because this is created after useGSAP has run; a
            // tween built outside the context would never be reverted.
            const buildLean = contextSafe?.(() => {
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
            });
            buildLean?.();
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
              } else {
                spin.pause();
                numbers.pause();
              }
            },
          });

          return () => {
            cardEl.removeEventListener("pointerenter", onPointerEnter);
            cardEl.removeEventListener("pointerleave", onPointerLeave);
            lean?.kill();
            spin.kill();
            numbers.kill();
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
      <div ref={drift} className="absolute inset-0">
        {children}
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

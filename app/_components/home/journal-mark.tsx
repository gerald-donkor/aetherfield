"use client";

import { useRef } from "react";
import { DUR, EASE, gsap, useGSAP } from "../motion/register";

/** The `md:-rotate-[8deg]` class, restated for the tween's terminus. */
const REST_ROTATION = -8;

/* Hover: the enter pose, revisited. "45 degrees above" is read the way prompt
   20 read "45 degrees" — as an *on-screen* angle — so hovering tilts the mark
   back out to the −45° it entered from, lifting its right-hand tip above the
   resting line, with a reduced slice of the same rotationY so it leans rather
   than replays the flip. See AGENTS.md for the two rejected readings. */
const HOVER_ROTATION = -45;
const HOVER_ROTATION_Y = 12;

/**
 * The Journal mark: a flattened diamond with the masthead set inside it.
 *
 * It is the one element on the homepage with a treatment of its own — it flips
 * and unwinds from a net −45° on screen onto its resting tilt, rather than
 * joining the section's shared fade-and-rise. So it owns its wrapper, its ref
 * and its tween, and it is a client leaf reached only from `journal.tsx`, the
 * shape `emissions-chart.tsx` already follows. Keep this file component-only:
 * a constant or a type exported from here and imported elsewhere would drag
 * GSAP into that page's bundle.
 *
 * **The resting −8° is authored twice, and that is deliberate.** Tailwind v4
 * emits `-rotate-[8deg]` as the independent `rotate` property, which is what
 * holds the tilt with JavaScript off or reduced motion requested. But GSAP does
 * not leave that property alone: `_parseTransform` folds `translate` / `rotate`
 * / `scale` into one `transform` and sets them to `none`
 * (`node_modules/gsap/CSSPlugin.js:859-866`) — unconditionally, not only when an
 * inline `translate` exists. So once the tween parses, the −8 lives inside
 * `transform` and the tween must land on it explicitly. Hence `REST_ROTATION`.
 * (`rotate` in a vars object is an alias for `rotation` and writes `transform`
 * — it is never the CSS property.)
 *
 * `transformPerspective` is required, not decorative: without it `rotateY(45)`
 * is an orthographic squash with no foreshortening and does not read as a flip.
 */
export function JournalMark() {
  const root = useRef<HTMLDivElement>(null);

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
          // The mark is `display: none` below `md`, so this is a tablet-and-up
          // effect and nothing should be tweened at 375.
          isTabletUp: "(min-width: 768px)",
          // Nothing may stick on a touch device. Tailwind v4 wraps its own
          // `hover:` rules in this query for free; a JS pointer handler gets no
          // such wrapper, so the query is authored here explicitly.
          hasHover: "(hover: hover)",
        },
        (context) => {
          const { reduceMotion, isTabletUp, hasHover } = context.conditions as {
            reduceMotion: boolean;
            isTabletUp: boolean;
            hasHover: boolean;
          };

          // The hidden start state lives in globals.css so the prerendered page
          // never paints the mark first. Reduced motion never gets that rule,
          // so only the opacity needs restoring — and only the opacity is
          // touched, so GSAP never parses the transform and the authored
          // `rotate: -8deg` survives untouched.
          if (reduceMotion) {
            gsap.set(root.current, { opacity: 1 });
            return;
          }
          if (!isTabletUp) return;

          // "45 degrees" is read off the screen, so the mark starts at a net
          // −45° and unwinds in one continuous direction onto its resting −8°.
          // See AGENTS.md for the two readings rejected. DUR * 1.5 because the
          // flip travels much further than a 36px rise and reads rushed at DUR.
          const el = root.current as HTMLDivElement;

          // The hover tween writes `rotation` on the same element as the enter
          // flip, so it is not built — and no listener is bound — until the
          // flip has landed. Hovering mid-flip therefore cannot leave the mark
          // off its resting angle; there is nothing to hover yet.
          let hover: gsap.core.Tween | null = null;

          const buildHover = contextSafe?.(() => {
            // Paused, and driven with play()/reverse() rather than a `gsap.to`
            // per event: a mouse-out mid-flight then unwinds along the same
            // curve from wherever it is. `quickTo` cannot reverse like that,
            // and stacked tweens fight each other.
            //
            // The start vars are the *composed* resting pose, never
            // `rotation: 0` — GSAP has already folded the authored
            // `rotate: -8deg` into `transform` by this point.
            hover = gsap.fromTo(
              el,
              {
                rotation: REST_ROTATION,
                rotationY: 0,
                transformPerspective: 800,
              },
              {
                rotation: HOVER_ROTATION,
                rotationY: HOVER_ROTATION_Y,
                transformPerspective: 800,
                duration: DUR * 0.7,
                ease: EASE,
                paused: true,
                // Nothing may be written until the pointer arrives; the enter
                // tween has just set the resting pose.
                immediateRender: false,
              },
            );
          });

          const onPointerEnter = () => hover?.play();
          const onPointerLeave = () => hover?.reverse();

          gsap.fromTo(
            root.current,
            {
              opacity: 0,
              rotationY: 45,
              rotation: -45,
              transformPerspective: 800,
            },
            {
              opacity: 1,
              rotationY: 0,
              rotation: REST_ROTATION,
              transformPerspective: 800,
              duration: DUR * 1.5,
              ease: EASE,
              scrollTrigger: {
                trigger: root.current,
                start: "top 88%",
                once: true,
              },
              onComplete: () => {
                if (!hasHover) return;
                buildHover?.();
                el.addEventListener("pointerenter", onPointerEnter);
                el.addEventListener("pointerleave", onPointerLeave);
              },
            },
          );

          return () => {
            el.removeEventListener("pointerenter", onPointerEnter);
            el.removeEventListener("pointerleave", onPointerLeave);
            hover?.kill();
          };
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    // Tilted as drawn in the comps. On tablet it hangs off the left gutter; on
    // mobile it is dropped, where it would crowd the list.
    <div
      ref={root}
      className="hidden md:-mt-4 md:-ml-24 md:block md:w-[290px] md:-rotate-[8deg] lg:mt-0 lg:ml-0 lg:w-auto"
      data-journal-mark
    >
      <svg
        viewBox="0 0 400 200"
        fill="none"
        className="w-full text-accent"
        aria-label="Aetherfield Journal"
        role="img"
      >
        <path
          d="M200 6 394 100 200 194 6 100Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <text
          x="200"
          y="92"
          textAnchor="middle"
          fill="currentColor"
          fontSize="34"
          fontWeight="700"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Aetherfield
        </text>
        <text
          x="200"
          y="128"
          textAnchor="middle"
          fill="currentColor"
          fontSize="34"
          fontWeight="700"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Journal
        </text>
        <text
          x="82"
          y="104"
          textAnchor="middle"
          fill="currentColor"
          fontSize="15"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          tech
        </text>
        <text
          x="200"
          y="44"
          textAnchor="middle"
          fill="currentColor"
          fontSize="15"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          earth
        </text>
        <text
          x="318"
          y="104"
          textAnchor="middle"
          fill="currentColor"
          fontSize="15"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          data
        </text>
        <text
          x="200"
          y="163"
          textAnchor="middle"
          fill="currentColor"
          fontSize="15"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          ®
        </text>
      </svg>
    </div>
  );
}

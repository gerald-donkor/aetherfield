"use client";

import { useRef } from "react";
import { ScrollTrigger, gsap, useGSAP } from "../motion/register";

/** Seconds for a row to travel exactly one perforation pitch.
 *
 * ~41 user units per second, i.e. ~41px/s at 1280. The "brisk" one of three
 * paces offered (gentle 3.5 / moderate 2 / brisk 1.2): the user picked 2, then
 * asked for it faster having seen it run. A judgement, not a measurement.
 *
 * Speed does not touch the loop's seamlessness — that is a property of the
 * uniform pitch, not of the duration. */
const CYCLE = 1.2;

type Props = {
  /** Stamp viewBox width in user units. */
  width: number;
  /** Stamp viewBox height in user units — the bottom row's `cy`. */
  height: number;
  /** Perforations drawn across one edge at rest, corners included. */
  count: number;
  /** Perforation radius. */
  r: number;
};

/**
 * The stamp's two perforation rows, drifting in opposite directions forever —
 * the top to the right, the bottom to the left.
 *
 * Split out of `journal/sections.tsx` as its **only** client module, so that
 * file stays a server component and its `next/image` never reaches the client
 * bundle. Keep this file **component-only**: a constant or type exported from
 * here and imported elsewhere drags GSAP into that page's bundle, the rule that
 * forced `PRINCIPLES` out into `principles-data.tsx`.
 *
 * **The loop is seamless because the spacing is uniform.** Translating a row by
 * exactly one pitch lands every circle where its neighbour started, so the row
 * at `t + CYCLE` is pixel-identical to the row at rest and `repeat: -1` has no
 * visible seam. No cloning, no wrap bookkeeping, no modulo.
 *
 * The geometry arrives as props and the pitch is derived here, so this file and
 * the comp-measured constants in `sections.tsx` cannot drift apart.
 */
export function StampPerforations({ width, height, count, r }: Props) {
  const root = useRef<SVGGElement>(null);
  const top = useRef<SVGGElement>(null);
  const bottom = useRef<SVGGElement>(null);

  const pitch = width / (count - 1);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          // Both halves are named on purpose: a `matchMedia` handler only runs
          // while at least one of its conditions matches, so a lone `reduce`
          // query would never fire for everybody else.
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions as {
            reduceMotion: boolean;
          };

          // Reduced motion gets nothing at all — no tween, no ScrollTrigger.
          // The rows are visible and correct at rest, exactly as the server
          // sent them, so nothing needs restoring and `globals.css` needs no
          // start-state rule for them.
          if (reduceMotion) return;

          /* `ease: "none"` is not a default being restated — a conveyor must
             not accelerate, or the wrap reads as a stutter. `x` is in user
             units, so the drift scales with the viewport for free, exactly as
             the rest of the stamp does.

             Two tweens rather than one timeline with `yoyo`: the rows never
             reverse.

             Built directly, **not** through `contextSafe`. This runs
             synchronously inside the `matchMedia` handler, so a gsap Context is
             already active and `mm.revert()` reverts these — routing it through
             `contextSafe` makes the two contexts reference each other and the
             next unmount throws `RangeError: Maximum call stack size exceeded`.
             See AGENTS.md. */
          const drift = (el: SVGGElement | null, to: number) =>
            gsap.to(el, {
              x: to,
              duration: CYCLE,
              ease: "none",
              repeat: -1,
              paused: true,
            });

          const t = drift(top.current, pitch);
          const b = drift(bottom.current, -pitch);

          /* Both loops start paused and only run while the stamp is on screen —
             the whole reason a `repeat: -1` loop is affordable here. The same
             gate the capabilities section's asterisk and counter use. */
          const gate = ScrollTrigger.create({
            trigger: root.current,
            start: "top bottom",
            end: "bottom top",
            onToggle: (self) => {
              if (self.isActive) {
                t.play();
                b.play();
              } else {
                t.pause();
                b.pause();
              }
            },
          });

          return () => {
            t.kill();
            b.kill();
            gate.kill();
          };
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  /* Painted white rather than masked — the page behind the stamp is white, so
     the result is identical and far simpler.

     Each row carries one circle beyond the drawn set, and it is required rather
     than padding: the right-moving top row needs one at `x = -pitch` so a
     perforation enters the left edge as the leftmost one leaves, and the
     left-moving bottom row needs the mirror past the right edge. Both sit
     outside the viewBox and are clipped by the SVG root, so the rest state is
     pixel-identical to the comp. */
  return (
    <g ref={root} fill="white">
      <g ref={top}>
        {Array.from({ length: count + 1 }, (_, i) => (
          <circle key={i} cx={(i - 1) * pitch} cy={0} r={r} />
        ))}
      </g>
      <g ref={bottom}>
        {Array.from({ length: count + 1 }, (_, i) => (
          <circle key={i} cx={i * pitch} cy={height} r={r} />
        ))}
      </g>
    </g>
  );
}

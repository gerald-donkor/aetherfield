"use client";

import { useRef } from "react";
import { DUR, EASE, SplitText, gsap, useGSAP } from "../motion/register";

/* The blur the type resolves out of. Desktop sets the h1 at 64–80px and mobile
   at 30–36, so one radius cannot serve both: 12px reads as a lens at 80px type
   and as a smear at 30px. Below `lg` it is two thirds of it, the same ratio the
   `Reveal` rise already uses. */
const BLUR = 12;

/* The lede starts a beat after the heading rather than after it. Sequencing the
   two end-to-end would run the hero's entrance to ~1.4s; overlapping holds it
   inside the ±20% budget recorded in AGENTS.md. */
const LEDE_DELAY = 0.18;

/* More targets than the page's 0.08, and smaller ones, so they are drawn
   tighter together. This is the only new timing number on the homepage; DUR and
   EASE still come from `register.ts` and are never restated. */
const STAGGER = 0.06;

type HeroTextProps = {
  /** Taken over from the wrapper being replaced, so no extra box is added. */
  className?: string;
  children: React.ReactNode;
};

/**
 * The hero's type, split and blurred in.
 *
 * The heading is split to **words** and the lede to **lines** — a performance
 * choice, not a taste one. An animated `filter: blur()` repaints each target's
 * layer every frame, so the target count is held in single digits: five words
 * and one or two lines. A `chars` split would put ~90 blurred layers on screen
 * at once.
 *
 * The two authored `<span className="block">`s in the `h1` stay: they are the
 * comp's line break at all three breakpoints, and `type: "words"` on each span
 * leaves that break alone rather than asking SplitText to rediscover it.
 *
 * `className` and the children-as-prop shape exist for the same two reasons
 * `Reveal` has them — the component takes an existing wrapper over instead of
 * adding a box, and `hero.tsx` stays a **server** component, so `HeroDashboard`
 * and its `next/image` never reach the client bundle. Keep this file
 * component-only: a constant or type exported from here and imported elsewhere
 * would drag GSAP and SplitText into that page's bundle.
 *
 * **SplitText mutates the DOM after hydration**, which is why it was rejected
 * once. Four things make that safe here and all four are load-bearing: it runs
 * only inside `useGSAP` and never during render; `autoSplit` with the animation
 * created inside — and returned from — `onSplit` re-splits and re-syncs on font
 * load and resize, so line breaks are never fitted to a fallback face; `aria`
 * stays at its default `"auto"`, so the heading still reads as one string; and
 * `useGSAP`'s context reverts the split on unmount. See AGENTS.md.
 */
export function HeroText({ className, children }: HeroTextProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 1024px)",
          isMobile: "(max-width: 1023px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { isDesktop, reduceMotion } = context.conditions as {
            isDesktop: boolean;
            reduceMotion: boolean;
          };

          const words = gsap.utils.toArray<HTMLElement>(
            '[data-hero-split="words"]',
          );
          const lines = gsap.utils.toArray<HTMLElement>(
            '[data-hero-split="lines"]',
          );
          if (!words.length && !lines.length) return;

          // Reduced motion never gets the CSS start state, so this only has to
          // land the opacity — and nothing splits, so the type is the plain
          // server markup.
          if (reduceMotion) {
            gsap.set([...words, ...lines], { opacity: 1 });
            return;
          }

          const blur = isDesktop ? BLUR : Math.round(BLUR * 0.66);

          // `blur(0px)`, not `none` — GSAP interpolates a filter numerically
          // only between two `blur()` functions. `clearProps` then drops the
          // compositing layer, and with it the `display` override below, once
          // the tween lands. It may never clear opacity or transform: that
          // hands the element back to the CSS start state in globals.css and
          // the element vanishes.
          const vars = {
            opacity: 0,
            filter: `blur(${blur}px)`,
            y: 14,
            duration: DUR,
            ease: EASE,
            stagger: STAGGER,
            clearProps: "filter,display",
          };

          SplitText.create(words, {
            type: "words",
            // A `<div>` inside the authored `<span>` is invalid markup, so the
            // pieces are spans — which means the inline-block has to be set
            // explicitly or the `y` will not render. It is set for the tween's
            // duration only and cleared with the filter: an inline-block box
            // rounds each word's advance to a whole pixel, which measured 2px
            // of extra ink on the desktop heading. Clearing it puts the settled
            // heading back on the exact pixels it drew before the split.
            tag: "span",
            autoSplit: true,
            onSplit(self) {
              // The CSS start state hides the *span*; the words carry the
              // animation, so the span has to come back up. Opacity only —
              // nothing here may touch a transform.
              gsap.set(words, { opacity: 1 });
              gsap.set(self.words, { display: "inline-block" });
              return gsap.from(self.words, vars);
            },
          });

          SplitText.create(lines, {
            type: "lines",
            tag: "span",
            autoSplit: true,
            onSplit(self) {
              gsap.set(lines, { opacity: 1 });
              gsap.set(self.lines, { display: "block" });
              return gsap.from(self.lines, { ...vars, delay: LEDE_DELAY });
            },
          });
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

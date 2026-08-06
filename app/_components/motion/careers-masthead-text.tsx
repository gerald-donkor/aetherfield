"use client";

import { useRef } from "react";
import { DUR, EASE, SplitText, gsap, useGSAP } from "./register";

/* Reused from the hero rather than refitted: `display-careers-title` is
   36 / 64 / 80px, the same curve as the article title and the same range the
   hero's type spans, so the same pair of radii applies. One radius cannot serve
   both ends — 12px reads as a lens at 80px type and as a smear at 36. Below
   `lg` it is two thirds of it, the ratio `Reveal`'s rise already uses. */
const BLUR = 12;

/* The masthead's rise. A judgement anchored on a measured floor, not a
   measurement: `career.webm` gives an *observed* 46.2px of travel on the
   masthead's half-max top edge (and 56.6 on the job cards), and no single power
   curve fits amplitude, onset and duration together — holding the fade's fitted
   power3.out/0.53s and solving frame by frame makes the amplitude climb
   monotonically. So 46 is a floor, the central free fit is 55, and 56 sits
   between them on the site's 8px rhythm. See AGENTS.md. */
const RISE = 56;

/* 20 glyphs at 0.03 is 0.57s of run, which sits alongside DUR for a masthead
   beat of ~1.07s — close to the footer's authored 1.0s and comfortably inside
   the entrance the recording shows. The hero's 0.06 over five words would run
   1.2s of stagger alone here and read as a crawl. A judgement, and the only new
   timing number; it stays local to this element, as the hero's STAGGER does. */
const CHAR_STAGGER = 0.03;

type CareersMastheadTextProps = {
  /** Taken over from the `<h1>` being replaced, so no extra box is added. */
  className?: string;
  children: React.ReactNode;
};

/**
 * The `/careers` masthead, split to **characters** and blurred in.
 *
 * A chars split is the user's explicit request and it overrides the standing
 * note that chars is out of scope. That note's objection is a target count —
 * an animated `filter: blur()` repaints each target's layer every frame — and
 * this element is **20 glyphs** ("Careersat" 9 + "Aetherfield" 11; the space is
 * not a char). That is the same order as the footer's 12 words and the hero's
 * five, so the objection does not apply here, and it applies nowhere else on
 * the site.
 *
 * The two authored `<span className="block">` lines stay exactly as they are —
 * they are the comp's mixed-font line break and the reason each line box sits
 * at exactly the authored leading. One `SplitText.create` over the whole `h1`
 * gives `self.chars` in document order, so the stagger is one continuous sweep
 * left-to-right and top-to-bottom across both lines. Do not create two
 * instances.
 *
 * `className` and the children-as-prop shape exist for the same reasons
 * `Reveal` and `HeroText` have them — this takes the `<h1>` over rather than
 * adding a box, and `careers/sections.tsx` stays a **server** component. The
 * file lives in `motion/` because that is the shared surface: nothing outside
 * `home/` may import `home/hero-text.tsx`. Keep it **component-only** — a
 * constant or type exported from here and imported elsewhere would drag GSAP
 * and SplitText into that page's bundle.
 */
export function CareersMastheadText({
  className,
  children,
}: CareersMastheadTextProps) {
  const root = useRef<HTMLHeadingElement>(null);

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

          const h1 = root.current;
          if (!h1) return;

          // Reduced motion splits nothing at all — no SplitText, no tween. The
          // CSS start state is gated on `no-preference` and so never applies
          // here, but land the opacity anyway for a browser without the query.
          if (reduceMotion) {
            gsap.set(h1, { opacity: 1 });
            return;
          }

          const blur = isDesktop ? BLUR : Math.round(BLUR * 0.66);

          // `aria: "auto"` labels the split element with `textContent.trim()`
          // (SplitText.js:213), and the two authored line spans have no
          // whitespace between them in the source, so the derived label reads
          // "Careers atAetherfield". Join the lines with a space instead, taken
          // off the markup rather than hardcoded so the copy cannot drift.
          // Captured before the split, because `h1.children` is the split spans
          // afterwards; re-applied inside `onSplit`, which runs after
          // SplitText has written its own label and on every re-split. The
          // revert restores the original attributes, so the settled heading
          // carries no `aria-label` at all and reads natively.
          const label = [...h1.children]
            .map((el) => (el.textContent ?? "").trim())
            .join(" ");

          SplitText.create(h1, {
            type: "chars",
            // Chars without words or lines lets the browser break mid-word;
            // `smartWrap` puts each word in a `white-space: nowrap` span so
            // "Aetherfield" cannot wrap between glyphs at a narrow viewport.
            smartWrap: true,
            // A `<div>` inside the authored `<span className="block">` is
            // invalid markup, so the pieces are spans.
            tag: "span",
            // Re-splits and re-syncs on font load and on resize. The animation
            // is created inside — and returned from — `onSplit`, because a
            // tween created outside it targets orphaned nodes after the first
            // re-split. It is also why no `document.fonts.ready` promise is
            // used: a tween created in a promise callback is outside every gsap
            // Context, and reaching for `contextSafe` to fix that is the
            // documented RangeError crash.
            autoSplit: true,
            onSplit(self) {
              h1.setAttribute("aria-label", label);
              // The CSS start state hides the *h1*; the chars carry the
              // animation, so the h1 has to come back up. Opacity only —
              // nothing here may touch a transform.
              gsap.set(h1, { opacity: 1 });
              // Required or the `y` will not render on a span. It goes away
              // with the revert below rather than with `clearProps`.
              gsap.set(self.chars, { display: "inline-block" });

              // `gsap.from` is safe here where it is not on the h1: the chars
              // are fresh spans at their default opacity 1, so reading the
              // current value as the end value is correct. `blur(0px)`, never
              // `none` — GSAP interpolates a filter numerically only between
              // two `blur()` functions.
              return gsap.from(self.chars, {
                opacity: 0,
                filter: `blur(${blur}px)`,
                y: isDesktop ? RISE : Math.round(RISE * 0.66),
                duration: DUR,
                ease: EASE,
                stagger: CHAR_STAGGER,
                // The split is reverted when the tween lands, and that is
                // load-bearing. The hero could get away with
                // `clearProps: "filter,display"` because a words split leaves
                // word-internal kerning intact. A chars split puts every glyph
                // in its own inline box, which breaks every kerning pair and
                // rounds every advance to a whole pixel — and line 1 is
                // Newsreader, which kerns. `revert()` restores the original
                // text nodes, so the settled masthead is the plain server
                // markup the comps were measured against: original kerning,
                // original rasterisation, no leftover aria-hidden spans.
                // `clearProps` is then unnecessary and is deliberately absent.
                onComplete: () => self.revert(),
              });
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
    <h1 ref={root} className={className} data-careers-split="">
      {children}
    </h1>
  );
}

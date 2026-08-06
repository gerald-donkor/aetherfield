"use client";

import { useRef } from "react";
import { EASE, ScrollTrigger, SplitText, gsap, useGSAP } from "./register";

/* A deliberate departure from `register.ts`'s vocabulary, at the user's
   request: *"do not make the animation speed for that fast."* Roughly double
   the site's `DUR 0.5` / stagger `0.08`. `EASE` is still imported rather than
   restated — only the pace changes, not the curve. */
const FOOTER_DUR = 1.0;
const FOOTER_STAGGER = 0.12;

/* The split type resolves out of 10px; the wordmark, which is an order of
   magnitude larger, out of 16. */
const SPLIT_BLUR = 10;
const WORDMARK_BLUR = 16;

/* The wordmark overlaps the tail of the split run rather than queuing behind
   it — end-to-end sequencing would push the footer's entrance past 3.5s. */
const WORDMARK_OVERLAP = 0.5;

type FooterMotionProps = {
  /** Taken over from the `<footer>` being replaced, so no box is added. */
  className?: string;
  children: React.ReactNode;
};

/**
 * The footer's type, split to words and blurred in — on every page.
 *
 * **This is the one client module reached from `chrome.tsx`, and therefore the
 * one that reaches every route.** That is a deliberate override of the "no GSAP
 * leak" rule, chosen by the user (*"Make reflect on every page"*). The narrower
 * rule that survives is still worth keeping: nothing outside `home/` may import
 * `home/sections.tsx` or any `home/` client module. See AGENTS.md.
 *
 * `type: "words"` and not `chars`: an animated `filter: blur()` repaints each
 * target's layer every frame, so the count is held low — 12 words here against
 * ~60 characters.
 *
 * **`data-footer-split` sits on each `<a>`, not on the `<nav>`.** With `aria`
 * at its default `"auto"` SplitText labels the element it splits and hides the
 * pieces; splitting the `<nav>` would therefore strip every link of its
 * accessible name. Splitting each link instead gives each one an `aria-label`
 * of its own text, so the nav still reads as five links.
 *
 * **The wordmark is one target and can never be split**: it is SVG `<text>`,
 * which SplitText does not support, and its `textLength="1013"` from `x="-1.6"`
 * is the measured thing that holds the ink flush to both gutters at any
 * viewport. It takes the same blur + fade + rise as a single element.
 *
 * Keep this file component-only — a constant or type exported from here and
 * imported elsewhere is the mistake that forced `PRINCIPLES` out into
 * `principles-data.tsx`.
 */
export function FooterMotion({ className, children }: FooterMotionProps) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions as {
            reduceMotion: boolean;
          };

          const lines = gsap.utils.toArray<HTMLElement>("[data-footer-split]");
          const wordmark = gsap.utils.toArray<HTMLElement>(
            "[data-footer-wordmark]",
          );
          if (!lines.length && !wordmark.length) return;

          // Reduced motion splits nothing at all — the type stays the plain
          // server markup — and only has to land the opacity, since the CSS
          // start state is gated on `no-preference`.
          if (reduceMotion) {
            gsap.set([...lines, ...wordmark], { opacity: 1 });
            return;
          }

          // **One ScrollTrigger gating paused tweens, rather than a
          // `scrollTrigger` on each tween.** With `autoSplit`, the split tween
          // is destroyed and rebuilt on font load and on resize; a rebuilt tween
          // carrying its own `once: true` trigger would be waiting on a trigger
          // that has already been and gone. A flag plus a pending set means a
          // tween created after the footer was entered simply plays at once.
          // Same shape as the capabilities section's on-screen gate.
          let entered = false;
          const pending = new Set<gsap.core.Tween>();
          const gate = (t: gsap.core.Tween) => {
            if (entered) t.play();
            else {
              t.pause();
              pending.add(t);
            }
            return t;
          };

          ScrollTrigger.create({
            trigger: root.current,
            start: "top 88%",
            once: true,
            onEnter: () => {
              entered = true;
              pending.forEach((t) => t.play());
              pending.clear();
            },
          });

          // The wordmark's start is the split run's own length, less the
          // overlap. Counted off the text rather than off `self.words`, so the
          // two tweens stay independent and `autoSplit` can re-split freely.
          const wordCount = lines.reduce(
            (n, el) => n + (el.textContent?.trim().split(/\s+/).length ?? 0),
            0,
          );
          const splitRun = FOOTER_DUR + FOOTER_STAGGER * Math.max(wordCount - 1, 0);

          SplitText.create(lines, {
            type: "words",
            // The pieces sit inside `<a>` and `<p>`, so a `<div>` would be
            // invalid markup. Spans then need an explicit `inline-block` or the
            // `y` will not render; it is set for the tween's duration only and
            // cleared with the filter, because an inline-block box rounds each
            // word's advance to a whole pixel.
            tag: "span",
            autoSplit: true,
            onSplit(self) {
              // The CSS start state hides the *unsplit* element; the words carry
              // the animation, so it has to come back up. Opacity only.
              gsap.set(lines, { opacity: 1 });
              gsap.set(self.words, { display: "inline-block" });
              // `blur(0px)`, never `none` — GSAP interpolates a filter only
              // between two `blur()` functions. `clearProps` may never touch
              // opacity or transform: that hands the element back to the CSS
              // start state in `globals.css` and it vanishes.
              return gate(
                gsap.from(self.words, {
                  opacity: 0,
                  filter: `blur(${SPLIT_BLUR}px)`,
                  y: 16,
                  duration: FOOTER_DUR,
                  ease: EASE,
                  stagger: FOOTER_STAGGER,
                  clearProps: "filter,display",
                }),
              );
            },
          });

          if (wordmark.length) {
            // **`fromTo`, and this is the one place on the site that needs it.**
            // A `gsap.from` reads the element's *current* value as the tween's
            // end value — and the wordmark's current opacity is the `0` the CSS
            // start state pins it at, so `from({opacity: 0})` animates 0 → 0 and
            // the wordmark never appears. Measured: `opacity: 0` inline, ink
            // count 0, forever. The split words escape this because they are
            // fresh spans at their default opacity 1; the wordmark is the
            // element the CSS rule names, so its end value has to be authored.
            gate(
              gsap.fromTo(
                wordmark,
                {
                  opacity: 0,
                  filter: `blur(${WORDMARK_BLUR}px)`,
                  y: 24,
                },
                {
                  opacity: 1,
                  filter: "blur(0px)",
                  y: 0,
                  duration: FOOTER_DUR * 1.2,
                  ease: EASE,
                  delay: Math.max(splitRun - WORDMARK_OVERLAP, 0),
                  // Filter only. `opacity` may never be cleared — that hands
                  // the element straight back to the `globals.css` rule above
                  // and it vanishes.
                  clearProps: "filter",
                },
              ),
            );
          }
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  // No `contextSafe` anywhere in this file: everything above is created
  // synchronously inside the `mm.add` handler and is already reverted by
  // `mm.revert()`. Wrapping it is the exact bug that crashed `/` on navigation
  // — see AGENTS.md, "contextSafe inside a matchMedia handler".
  return (
    <footer ref={root as React.Ref<HTMLElement>} className={className}>
      {children}
    </footer>
  );
}

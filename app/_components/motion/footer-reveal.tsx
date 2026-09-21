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

/* The wordmark's lead-in. It used to be derived from the split run's own
   length, which queued the footer's largest element behind twelve nav words and
   landed it at 3.02s — the user rejected that ("takes too long to appear").
   Three of the site's 0.08 steps, so the footer still composes itself before
   its headline arrives, without the wait. A judgement, not a measurement. */
const WORDMARK_DELAY = 0.24;

/* Deliberately slower than the desktop navbar's 0.04s / 0.02s quarters and
   stagger. This is a user-directed pacing judgement; see docs/motion-site.md.
   EASE remains shared with the rest of the site. */
const WAVE_DUR = 0.06;
const WAVE_STAGGER = 0.03;
const WAVE_Y = 12;

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
          canHover: "(hover: hover)",
          finePointer: "(pointer: fine)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { canHover, finePointer, reduceMotion, fullMotion } =
            context.conditions as {
              canHover: boolean;
              finePointer: boolean;
              reduceMotion: boolean;
              fullMotion: boolean;
            };
          const canWave = canHover && finePointer && fullMotion;

          const lines = gsap.utils.toArray<HTMLElement>("[data-footer-split]");
          const links = gsap.utils.toArray<HTMLElement>(
            "a[data-footer-split]",
          );
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
          const waves = new Map<HTMLElement, gsap.core.Timeline>();
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

          const removers: Array<() => void> = [];
          if (canWave) {
            links.forEach((link) => {
              const replay = () => waves.get(link)?.restart();
              link.addEventListener("pointerenter", replay);
              link.addEventListener("pointerleave", replay);
              removers.push(() => {
                link.removeEventListener("pointerenter", replay);
                link.removeEventListener("pointerleave", replay);
              });
            });
          }

          SplitText.create(lines, {
            // One SplitText owner preserves the entrance's original global
            // word order while, only where the wave can run, making its
            // generated characters available to link-local timelines.
            type: canWave ? "words,chars" : "words",
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
              const entrance = gate(
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

              // `autoSplit` replaces generated nodes on font readiness and
              // resplits. Kill the previous paused timelines before pointing
              // the stable native listeners at their fresh character nodes.
              waves.forEach((timeline) => timeline.kill());
              waves.clear();

              if (!canWave) return entrance;

              links.forEach((link) => {
                const chars = self.chars.filter((char) => link.contains(char));
                if (!chars.length) return;

                // SplitText's inline spans accept GSAP matrices but do not
                // paint them; transformable inline-level boxes retain normal
                // text flow without a global style or utility.
                gsap.set(chars, { display: "inline-block" });

                const timeline = gsap.timeline({ paused: true });
                timeline
                  .fromTo(
                    chars,
                    { y: 0, rotation: 0 },
                    {
                      keyframes: [
                        {
                          y: -WAVE_Y,
                          rotation: 90,
                          duration: WAVE_DUR,
                          ease: EASE,
                        },
                        {
                          y: 0,
                          rotation: 180,
                          duration: WAVE_DUR,
                          ease: EASE,
                        },
                        {
                          y: WAVE_Y,
                          rotation: 270,
                          duration: WAVE_DUR,
                          ease: EASE,
                        },
                        {
                          y: 0,
                          rotation: 360,
                          duration: WAVE_DUR,
                          ease: EASE,
                        },
                      ],
                      stagger: { each: WAVE_STAGGER, from: "start" },
                      transformOrigin: "50% 50%",
                      immediateRender: false,
                    },
                  )
                  .set(chars, { y: 0, rotation: 0 });
                waves.set(link, timeline);
              });

              return entrance;
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
                  delay: WORDMARK_DELAY,
                  // Filter only. `opacity` may never be cleared — that hands
                  // the element straight back to the `globals.css` rule above
                  // and it vanishes.
                  clearProps: "filter",
                },
              ),
            );
          }

          return () => {
            removers.forEach((remove) => remove());
            waves.forEach((timeline) => timeline.kill());
            waves.clear();
          };
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

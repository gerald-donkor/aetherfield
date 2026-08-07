"use client";

import { useRef } from "react";
import { DUR, EASE, ScrollTrigger, gsap, useGSAP } from "../motion/register";

/* Monthly carbon emissions, Jan–Jun. Shape traced from the comp: a slow climb
   to a 220 peak in late April, then a sustained decline. */
const BARS = [
  35, 38, 40, 42, 45, 48, 52, 58, 63, 70, 78, 86, 95, 104, 118, 132, 155, 175,
  195, 212, 220, 214, 198, 178, 165, 158, 150, 140, 132, 126, 120, 116, 112,
];
const PEAK = BARS.indexOf(220);
const Y_TICKS = [240, 160, 80, 0];
const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun"];

/* The hover readout's amplitudes and timings. Every one of these is a
   **judgement**, not a measurement — no reference recording covers this
   interaction — anchored on the site's own constants: the glide and the dim
   both ride `EASE`, the site's one reveal curve, at a little under `DUR`. */
const GLIDE = 0.28;
const DIM_DUR = 0.2;
const DIM_OPACITY = 0.28;
const HOVER_SCALE_X = 1.6;

/**
 * The hero dashboard's "Carbon emissions trend" panel.
 *
 * Split out of `dashboard.tsx` so that only the chart is a client module — the
 * three stat tiles above it keep their `next/image` and stay server-rendered.
 * The markup, the class strings and the `em`-on-`1cqw` sizing are unchanged
 * from when this lived inline; the panel's proportional scaling is
 * load-bearing.
 *
 * The bars grow from the baseline starting at **both ends at once**, meeting in
 * the middle — GSAP's advanced-stagger `from: "edges"`. Nothing runs until the
 * chart scrolls in; see AGENTS.md, "Homepage motion", for the measured trigger.
 */
export function EmissionsChart() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          // Every half is named on purpose: a `matchMedia` handler only runs
          // while at least one of its conditions matches, so a lone
          // `reduce` query would never fire for everybody else. `hasHover` is
          // the fourth named condition on this site — a JS pointer handler gets
          // none of the `@media (hover:hover)` wrapping Tailwind v4 gives its
          // `hover:` utilities, so nothing may stick on touch.
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
          hasHover: "(hover: hover)",
        },
        (context) => {
          const { reduceMotion, hasHover } = context.conditions as {
            reduceMotion: boolean;
            hasHover: boolean;
          };

          const scope = root.current;
          if (!scope) return;

          const pill = scope.querySelector<HTMLElement>("[data-chart-pill]");
          const plot = scope.querySelector<HTMLElement>("[data-chart-plot]");
          const cols = gsap.utils.toArray<HTMLElement>(
            "[data-chart-col]",
            scope,
          );
          const bars = gsap.utils.toArray<HTMLElement>(
            "[data-chart-bar]",
            scope,
          );

          /* The hover readout. Both halves are built **eagerly**, here inside
             the `mm.add` handler; only the listener binding is gated, on the
             entrance's `onComplete`. Building later — in a callback, wrapped in
             `contextSafe` — is the documented `RangeError` crash: every GSAP
             callback runs with its creating context active
             (`gsap-core.js:981`), so wrapping work that is already inside a
             live context makes two contexts reference each other. There is no
             `contextSafe` anywhere in this file. */
          let attach = () => {};
          let detach = () => {};

          if (hasHover && pill && plot && cols.length === BARS.length) {
            /* The pill's resting centring is Tailwind's `-translate-x-1/2`, and
               the first tween to touch this element's transform consumes it:
               `_parseTransform` folds v4's independent `translate` / `rotate` /
               `scale` into one `transform` and sets all three to `none`
               (`node_modules/gsap/CSSPlugin.js:859-866`). It would be baked in
               as a pixel half-width — which goes stale the moment the readout
               changes the pill's text from `220` to `35`. So GSAP owns the
               centring as `xPercent`, and `x` alone carries the position. */
            gsap.set(pill, { xPercent: -50, x: 0 });

            /* Column centres, relative to the plot's left edge and cached once
               per run — never read inside the move handler, which would be
               per-frame layout thrash. `pageX` rather than `clientX` so a
               vertical scroll cannot invalidate the cache; the panel is
               `cqw`-sized, so a resize moves every centre and `refresh` is
               where that is picked up. */
            const centres: number[] = [];
            let plotLeft = 0;
            let pitch = 1;

            const measure = () => {
              plotLeft = plot.getBoundingClientRect().left + window.scrollX;
              for (let i = 0; i < cols.length; i++) {
                const r = cols[i].getBoundingClientRect();
                centres[i] = r.left + r.width / 2 + window.scrollX - plotLeft;
              }
              pitch =
                (centres[cols.length - 1] - centres[0]) / (cols.length - 1) ||
                1;
            };

            /* Reduced motion keeps the readout and drops the motion — a
               deliberate divergence from the capabilities section's "reduce
               gets nothing at all", because this hover carries *information*
               rather than decoration. It is how the CSS hovers on `/journal`
               and the article cards already behave. */
            const dimDuration = reduceMotion ? 0 : DIM_DUR;

            /* `quickTo` is built for a continuously-retargeted value, and
               nothing here ever needs to *reverse* a tween. It is **not**
               usable at `duration: 0`, though — measured, not assumed: its
               tween is created paused with a `"+=0.1"` placeholder and driven
               by `resetTo` (`gsap-core.js:4179`), and at zero duration the
               pill did not move at all while the text and the dim both landed.
               So reduced motion writes the value directly. */
            const glide = reduceMotion
              ? (value: number) => {
                  gsap.set(pill, { x: value });
                }
              : gsap.quickTo(pill, "x", { duration: GLIDE, ease: EASE });
            const clampIndex = gsap.utils.clamp(0, cols.length - 1);

            // The dim runs on index change only, never on every move.
            let last = -1;

            const onMove = (e: PointerEvent) => {
              const i = clampIndex(
                Math.round((e.pageX - plotLeft - centres[0]) / pitch),
              );
              if (i === last) return;
              last = i;

              glide(centres[i] - centres[PEAK]);
              pill.textContent = String(BARS[i]);
              gsap.to(bars, {
                opacity: (j: number) => (j === i ? 1 : DIM_OPACITY),
                scaleX: (j: number) => (j === i ? HOVER_SCALE_X : 1),
                duration: dimDuration,
                ease: EASE,
                overwrite: "auto",
              });
            };

            const onLeave = () => {
              if (last === -1) return;
              last = -1;

              glide(0);
              pill.textContent = String(BARS[PEAK]);
              gsap.to(bars, {
                opacity: 1,
                scaleX: 1,
                duration: dimDuration,
                ease: EASE,
                overwrite: "auto",
              });
            };

            attach = () => {
              measure();
              plot.addEventListener("pointermove", onMove);
              plot.addEventListener("pointerleave", onLeave);
              ScrollTrigger.addEventListener("refresh", measure);
            };
            detach = () => {
              plot.removeEventListener("pointermove", onMove);
              plot.removeEventListener("pointerleave", onLeave);
              ScrollTrigger.removeEventListener("refresh", measure);
            };
          }

          // The hidden start state lives in globals.css so the prerendered page
          // never paints a finished chart first. Reduced motion never gets that
          // rule, but the final state is still written here so the element can
          // never be left mid-tween.
          if (reduceMotion) {
            gsap.set("[data-chart-grid]", { scaleX: 1 });
            gsap.set("[data-chart-bar]", { scaleY: 1 });
            gsap.set("[data-chart-pill]", { opacity: 1, y: 0 });
            attach();
            return () => detach();
          }

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: root.current,
              // Measured, not guessed: at scroll 0 the panel's bottom edge sits
              // at 687 / 879 / 1031 px on a 375 / 800 / 1280 viewport, below
              // the fold at each one's nominal height. So "bottom bottom" — the
              // whole chart in view — always costs at least a little scrolling.
              start: "bottom bottom",
              once: true,
            },
            // The entrance writes `opacity` and `y` on the same pill, so a
            // hover mid-entrance must be inert. Nothing is bound until it lands.
            onComplete: () => attach(),
          });

          tl.fromTo(
            "[data-chart-grid]",
            { scaleX: 0 },
            {
              scaleX: 1,
              transformOrigin: "left center",
              duration: 0.4,
              ease: "power2.out",
              stagger: 0.05,
            },
          )
            .fromTo(
              "[data-chart-bar]",
              { scaleY: 0 },
              {
                scaleY: 1,
                transformOrigin: "bottom center",
                duration: 0.4,
                ease: "power2.out",
                // `amount` rather than `each`: the run length is authored once
                // and does not drift with the bar count. `from: "edges"` starts
                // at both ends of the array and converges on the middle.
                stagger: { amount: 0.7, from: "edges", ease: "power1.inOut" },
              },
              "-=0.25",
            )
            .fromTo(
              "[data-chart-pill]",
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: DUR, ease: EASE },
              "-=0.15",
            );

          return () => detach();
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="mt-[1.9em] border border-border bg-white p-[1.5em]">
      <p className="font-mono text-[1.25em]">Carbon emissions trend</p>
      <div className="mt-[1.4em] flex gap-[1em]">
        {/* y axis */}
        <div className="flex w-[2.6em] shrink-0 flex-col justify-between py-[0.6em] text-right font-mono text-[1.1em] text-muted">
          {Y_TICKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        {/* plot */}
        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-[21em] items-end justify-between gap-[0.45em]"
            data-chart-plot
          >
            {Y_TICKS.map((t) => (
              <span
                key={t}
                style={{ bottom: `${(t / 240) * 100}%` }}
                className="absolute inset-x-0 border-t border-border"
                data-chart-grid
                aria-hidden
              />
            ))}
            {BARS.map((v, i) => (
              // The hit target is the whole column band — its `flex-1` share of
              // the row plus the gap — not the 0.3em bar: the pointer only has
              // to be *nearest*, never dead-centre.
              <span key={i} className="relative flex-1" data-chart-col={i}>
                {i === PEAK ? (
                  <span
                    className="absolute bottom-full left-1/2 mb-[0.6em] -translate-x-1/2 rounded-full bg-brand px-[0.7em] py-[0.15em] font-mono text-[1.1em] text-brand-ink"
                    data-chart-pill
                  >
                    220
                  </span>
                ) : null}
                {/* The pill is a sibling of this span, not a child, so scaling
                    the bar never distorts it. */}
                <span
                  style={{ height: `${(v / 240) * 21}em` }}
                  className="block w-[0.3em] bg-ink"
                  data-chart-bar
                />
              </span>
            ))}
          </div>
          <div className="mt-[0.8em] flex justify-around font-mono text-[1.1em] text-muted">
            {MONTHS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

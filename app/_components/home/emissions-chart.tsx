"use client";

import { useRef } from "react";
import { DUR, EASE, gsap, useGSAP } from "../motion/register";

/* Monthly carbon emissions, Jan–Jun. Shape traced from the comp: a slow climb
   to a 220 peak in late April, then a sustained decline. */
const BARS = [
  35, 38, 40, 42, 45, 48, 52, 58, 63, 70, 78, 86, 95, 104, 118, 132, 155, 175,
  195, 212, 220, 214, 198, 178, 165, 158, 150, 140, 132, 126, 120, 116, 112,
];
const PEAK = BARS.indexOf(220);
const Y_TICKS = [240, 160, 80, 0];
const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun"];

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
          // Both halves are named on purpose: a `matchMedia` handler only runs
          // while at least one of its conditions matches, so a lone
          // `reduce` query would never fire for everybody else.
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions as {
            reduceMotion: boolean;
          };

          // The hidden start state lives in globals.css so the prerendered page
          // never paints a finished chart first. Reduced motion never gets that
          // rule, but the final state is still written here so the element can
          // never be left mid-tween.
          if (reduceMotion) {
            gsap.set("[data-chart-grid]", { scaleX: 1 });
            gsap.set("[data-chart-bar]", { scaleY: 1 });
            gsap.set("[data-chart-pill]", { opacity: 1, y: 0 });
            return;
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
          });

          tl.fromTo(
            "[data-chart-grid]",
            { scaleX: 0 },
            {
              scaleX: 1,
              transformOrigin: "left center",
              duration: 0.5,
              ease: "power2.out",
              stagger: 0.06,
            },
          )
            .fromTo(
              "[data-chart-bar]",
              { scaleY: 0 },
              {
                scaleY: 1,
                transformOrigin: "bottom center",
                duration: 0.5,
                ease: "power2.out",
                // `amount` rather than `each`: the run length is authored once
                // and does not drift with the bar count. `from: "edges"` starts
                // at both ends of the array and converges on the middle.
                stagger: { amount: 0.9, from: "edges", ease: "power1.inOut" },
              },
              "-=0.25",
            )
            .fromTo(
              "[data-chart-pill]",
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: DUR, ease: EASE },
              "-=0.15",
            );
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
          <div className="relative flex h-[21em] items-end justify-between gap-[0.45em]">
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
              <span key={i} className="relative flex-1">
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

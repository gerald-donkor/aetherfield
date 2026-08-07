"use client";

import { useRef } from "react";
import { EASE, gsap, useGSAP } from "./register";

/* Neither number is the site's. The fits over both reference recordings land
   the bar's entrance at 0.62–0.89s across every curve tried, and `DUR` (0.5)
   sits outside that band — so the duration is local to this leaf, exactly as
   `FOOTER_DUR` is. `EASE` is imported rather than restated: `power3.out` and
   `power4.out` could not be separated by the fit (0.03px of rms), so the site's
   curve ships unchanged. */
const NAV_DUR = 0.7;

/* The chrome arrives after the page composes itself. `career.webm` carries the
   /careers masthead and the bar in one recording, which is the only way to read
   this: masthead onset 4.418s, bar 4.84–4.95s → Δ 0.42–0.53s. Six steps of the
   site's 0.08. Do not "improve" it to 0. */
const NAV_DELAY = 0.48;

/* Module scope, so it survives a remount but not a document load — which is
   exactly the lifetime the entrance wants. **Every page renders its own
   `<SiteNav />`, so React unmounts and remounts it on a client-side
   navigation** and a bare `useGSAP` with no dependencies runs again: measured
   before this flag, the bar sat at `yPercent −98` half a second after each of
   eight in-app clicks, i.e. it re-dropped every time. The bar is one constant
   bar; re-dropping it on every navigation fights that and is noisy on a site
   where every page shares the chrome. */
let hasDropped = false;

type NavDropProps = {
  /** Taken over from the `<header>` being replaced, so no box is added. */
  className?: string;
  children: React.ReactNode;
};

/**
 * The header drops in from behind the top edge of the window, once per document
 * load — on every page, since `chrome.tsx` reaches every route.
 *
 * **The measurement that says "drop" rather than "fade".** In both recordings
 * the wordmark's ink bounding box first appears *short and pinned to the top of
 * the crop*, grows downward to full height, and only then translates down. A
 * box that grows from a fixed top edge and then moves is an element entering
 * from behind the viewport edge, clipped by the window — a fade holds the box
 * still, and a rise moves it the other way. The nav links reproduce it in the
 * same frames, so the wordmark and the links move together as one element:
 * this is the `<header>` translating, not its contents staggering.
 *
 * **`yPercent: -100` is a judgement on a 32px observed floor, not a
 * measurement.** Travel does not resolve — the free fits span 41 to 70px,
 * because the start of the motion is off-screen and unmeasurable. −100 % is the
 * bar's own height and the self-evident authored value for "hidden above the
 * edge"; it is also tied to that height rather than to a magic 60, so a future
 * 72px bar cannot drift from the CSS start state.
 *
 * **The opacity ramp is present in the trace but confounded.** The wordmark's
 * darkest ink keeps darkening after the box has reached full height, which is
 * not clipping — but the bar is moving fastest exactly there, and both a
 * rolling-shutter smear and JPEG quantisation lift a dark minimum. The fade
 * ships because every other reveal on this site fades, not because it was
 * measured.
 *
 * **It plays once per document load and deliberately does not re-run on a
 * client-side navigation.** `SiteNav` never unmounts, so a `useGSAP` with no
 * dependencies runs exactly once; do not add a route listener. The bar is one
 * constant bar, and re-dropping it on every in-app navigation would fight that.
 *
 * Keep this file component-only — a constant or type exported from here and
 * imported elsewhere is the mistake that forced `PRINCIPLES` out into
 * `principles-data.tsx`.
 */
export function NavDrop({ className, children }: NavDropProps) {
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
          const header = root.current;
          if (!header) return;

          // Reduced motion gets no tween at all, and nothing needs restoring:
          // the CSS start state is gated on `no-preference`, so the bar is
          // already at rest and no inline transform is ever written.
          if (reduceMotion) return;

          // Already dropped earlier in this document, so this is a remount from
          // a client-side navigation: land the bar at rest rather than replaying
          // the entrance. The `gsap.set` is required, not cosmetic — the CSS
          // start state still applies on the fresh element and would leave the
          // bar hidden above the edge. `useGSAP` runs in a layout effect, so it
          // lands before paint and there is no flash.
          if (hasDropped) {
            gsap.set(header, { yPercent: 0, y: 0, opacity: 1 });
            return;
          }
          hasDropped = true;

          // **`fromTo`, never `from`.** `globals.css` holds the header at
          // `translateY(-100%)`, and `gsap.from` reads the element's *current*
          // value as the tween's END value — it would animate −100 % → −100 %
          // and the bar would never arrive. This is the same trap the footer
          // wordmark hit; see AGENTS.md.
          //
          // **`y: 0` is authored on both ends, and it is load-bearing.** GSAP
          // writes a transform as `translate(x, y) translate(xPercent%,
          // yPercent%)` and parses the element's existing transform into the
          // *px* pair — so the CSS start state's `translateY(-100%)` is read as
          // `y: -60px`, not as `yPercent: -100`. Animating `yPercent` alone
          // leaves that −60 in place and the bar settles one bar-height above
          // the viewport, permanently off-screen. Measured before the fix:
          // settled inline `translate(0px, -60px)` at 375, 800 and 1280.
          //
          // No `clearProps`: clearing the transform hands the element back to
          // the CSS start state and the bar vanishes. The residual inline
          // `translate(0px, 0px)` is cosmetic.
          gsap.fromTo(
            header,
            { yPercent: -100, y: 0, opacity: 0 },
            {
              yPercent: 0,
              y: 0,
              opacity: 1,
              duration: NAV_DUR,
              ease: EASE,
              delay: NAV_DELAY,
            },
          );
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  // No `contextSafe`: the tween is created synchronously inside the `mm.add`
  // handler and is already reverted by `mm.revert()`. Wrapping it is the exact
  // bug that crashed `/` on navigation — see AGENTS.md.
  //
  // `overflow-hidden` must never go on this element: the mobile panel is a
  // sibling of the row inside the same `<header>`, so clipping here would clip
  // the open menu. The window's own edge does the clipping, which is what both
  // recordings show.
  return (
    <header
      ref={root as React.Ref<HTMLElement>}
      data-nav-drop=""
      className={className}
    >
      {children}
    </header>
  );
}

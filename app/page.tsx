import type { Metadata } from "next";

import { CtaBand, SiteFooter, SiteNav } from "./_components/chrome";
import { Reveal } from "./_components/motion/reveal";
import {
  Capabilities,
  CaseStudy,
  Hero,
  Journal,
  Principles,
  Testimonial,
} from "./_components/home/sections";

/**
 * **The homepage leads with the brand**, where every subpage takes
 * `"<Page> — Aetherfield"`. Both shapes were already in the repository and each
 * is right where it is used: a tab or a bookmark for the site itself should
 * open with the name, not end with it.
 *
 * The title is the hero's own H1 and the description is its subline, verbatim
 * (`app/_components/home/hero.tsx`) — §5 states the thesis and forbids
 * re-deriving it, so this is not a copywriting exercise. Both are **editorial
 * judgements** with no comp behind them. Added by prompt 112, which found this
 * page inheriting "Aetherfield — Design System".
 */
export const metadata: Metadata = {
  title: "Aetherfield — Sustainability insights, built for business",
  description:
    "Track impact, reduce emissions, and accelerate progress—with clarity and confidence.",
};

export default function Page() {
  return (
    <>
      {/* The sky is a fixed-height band starting at the very top of the page:
          it sits behind the nav, and the dashboard deliberately overhangs it.

          It is a document-level absolute sibling rather than a child of a
          `relative isolate` wrapper, because SiteNav is sticky and would unpin
          at the bottom of any such wrapper. With no positioned ancestor the
          band resolves against the initial containing block, so `top-0` is
          still the page top and `-z-10` still paints it behind the nav and
          hero — the hero does not move. */}
      <div
        aria-hidden
        className="hero-sky absolute inset-x-0 top-0 -z-10 h-[540px] md:h-[700px] lg:h-[806px]"
      />
      <SiteNav />
      <Hero />

      <main>
        <Capabilities />
        <Principles />
        <CaseStudy />
        <Journal />
        <Testimonial />
        {/* Wrapped here rather than inside chrome.tsx: CtaBand is shared with
            /journal and /about, and this prompt is the homepage only. */}
        <Reveal>
          <CtaBand
            demo
            headline="Ready to operationalize your sustainability goals?"
          />
        </Reveal>
      </main>

      <SiteFooter />
    </>
  );
}

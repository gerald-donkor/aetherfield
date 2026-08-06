import type { Metadata } from "next";
import { CtaBand, SiteFooter, SiteNav } from "../_components/chrome";
import {
  AboutHero,
  FounderStory,
  TeamTable,
  Values,
} from "../_components/about/sections";
import { Reveal } from "../_components/motion/reveal";

export const metadata: Metadata = {
  title: "About — Aetherfield",
  description:
    "Why Aetherfield exists, the values behind the product, and the people building it.",
};

export default function Page() {
  return (
    <>
      {/* The hero sky. Full-bleed on mobile and tablet; on desktop the comp
          runs it across the left 632 of 1280 only — 49.375 % — with the mission
          column on plain white beside it.

          Like the homepage's band this is a document-level absolute sibling
          rather than a child of a `relative isolate` wrapper: SiteNav is sticky
          and unpins at the bottom of any positioned ancestor. With none, `top-0`
          still resolves to the page top and `-z-10` still paints it behind the
          bar and the Forecast card. */}
      <div
        aria-hidden
        className="hero-sky absolute top-0 left-0 -z-10 h-[320px] w-full md:h-[480px] lg:h-[800px] lg:w-[49.375%]"
      />
      <SiteNav />
      <AboutHero />

      <main>
        <Values />
        <FounderStory />
        <TeamTable />
        {/* On white, not surface: the team panel above it is already a surface
            block and the comp keeps the two reading as separate blocks.
            Wrapped here rather than in `chrome.tsx`, exactly as `app/page.tsx`
            and `app/journal/page.tsx` do it, so the band animates on the pages
            that opted into motion and nowhere else. */}
        <Reveal>
          <CtaBand
            tone="white"
            headline="We're hiring! Want to join the team?"
            action="View open roles"
          />
        </Reveal>
      </main>

      <SiteFooter />
    </>
  );
}

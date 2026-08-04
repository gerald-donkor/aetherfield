import { CtaBand, SiteFooter, SiteNav } from "./_components/chrome";
import {
  Capabilities,
  CaseStudy,
  Hero,
  Journal,
  Principles,
  Testimonial,
} from "./_components/home/sections";

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
        <CtaBand headline="Ready to operationalize your sustainability goals?" />
      </main>

      <SiteFooter />
    </>
  );
}

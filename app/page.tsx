import { CtaBand, SiteFooter, SiteNav } from "./_components/chrome";
import {
  Capabilities,
  CaseStudy,
  Container,
  Hero,
  Journal,
  Principles,
  Testimonial,
} from "./_components/home/sections";

export default function Page() {
  return (
    <>
      {/* The sky is a fixed-height band starting at the very top of the page:
          it sits behind the nav, and the dashboard deliberately overhangs it. */}
      <div className="relative isolate">
        <div
          aria-hidden
          className="hero-sky absolute inset-x-0 top-0 -z-10 h-[540px] md:h-[700px] lg:h-[806px]"
        />
        <Container>
          <SiteNav />
        </Container>
        <Hero />
      </div>

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

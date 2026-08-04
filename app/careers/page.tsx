import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { CareersMasthead, JobList } from "../_components/careers/sections";
import { Container } from "../_components/home/sections";

export const metadata: Metadata = {
  title: "Careers — Aetherfield",
  description:
    "Open roles at Aetherfield — design, data, and product work on the tools that turn climate measurement into action.",
};

export default function Page() {
  return (
    <>
      {/* SiteNav carries its own gutters and is sticky: it must not sit inside
          a one-child wrapper, or it unpins as soon as that wrapper scrolls off. */}
      <SiteNav />

      {/* The sky runs the full page, behind the bar. It cannot wrap SiteNav for
          the reason above, so `main` is a sibling that is pulled up under the
          60px bar and pads the content back down; z-50 on the header keeps it
          over the overlap. The gradient's 100% stop then lands on the footer's
          top edge, as in all three comps. The 120px foot is measured: the gap
          from the dashed card to the footer is 121px at 375, 800 and 1280. */}
      <main className="hero-sky -mt-[60px] pt-[60px] pb-[120px]">
        <Container>
          <CareersMasthead />
          <JobList />
        </Container>
      </main>

      <SiteFooter />
    </>
  );
}

import { Reveal } from "../motion/reveal";
import { Button } from "../primitives";
import { Container } from "./container";
import { HeroDashboard } from "./dashboard";

export function Hero() {
  return (
    /* `as="section"` rather than a wrapper inside the existing <section>: the
       reveal takes the element over instead of adding a box, so no layout row
       moves. The hero is above the fold, so it plays on load, not on scroll. */
    <Reveal as="section" stagger immediate>
      <Container>
        <div className="pt-12 text-center md:pt-16 lg:pt-[76px]">
          {/* The comp breaks after "insights," at all three sizes, so the break
              is explicit. Sizes are measured per breakpoint: 36 / 64 / 80.
              The break is two block spans rather than a <br> so the two lines
              are separately targetable — they arrive one beat apart, as the
              landing recording plays them. Both lines are the same Newsreader
              face, so the mixed-font line-box union that /careers' masthead
              runs into does not apply here. */}
          <h1 className="mx-auto font-serif text-[clamp(30px,9vw,64px)] leading-[0.96] md:text-[64px] lg:text-[clamp(64px,6.25vw,80px)]">
            <span className="block" data-reveal-item>
              Sustainability insights,
            </span>
            <span className="block" data-reveal-item>
              built for business
            </span>
          </h1>
          <p
            className="mx-auto mt-6 max-w-[720px] font-serif text-p2"
            data-reveal-item
          >
            Track impact, reduce emissions, and accelerate progress—with clarity
            and confidence.
          </p>
          <div
            className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row"
            data-reveal-item
          >
            <Button>Request a demo</Button>
            <Button>Explore the platform</Button>
          </div>
        </div>

        <div
          className="mx-auto mt-14 max-w-[960px] md:mt-16"
          data-reveal-item
        >
          <HeroDashboard />
        </div>
      </Container>
    </Reveal>
  );
}

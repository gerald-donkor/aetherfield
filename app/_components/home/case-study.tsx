import Image from "next/image";
import { Reveal } from "../motion/reveal";
import { Button } from "../primitives";
import { Container } from "./container";

export function CaseStudy() {
  return (
    <Reveal as="section" stagger className="py-20 md:py-28">
      <Container>
        {/* Two columns from tablet up, as in the comps; stacks on mobile. */}
        <div className="grid items-center gap-6 rounded-card bg-surface p-5 md:grid-cols-[360px_1fr] md:gap-8 md:p-6 lg:grid-cols-[496px_1fr] lg:gap-10">
          <Image
            src="/assets/generated/case-study-duotone.jpg"
            alt="Three colleagues meeting outdoors, rendered as a blue halftone"
            width={992}
            height={556}
            sizes="(max-width: 1024px) 100vw, 496px"
            className="h-full w-full object-cover"
            data-reveal-item
          />
          <div className="lg:pr-20" data-reveal-item>
            <h2 className="font-sans text-p1 font-bold">
              Why Acme Inc chose Aetherfield
            </h2>
            <p className="mt-4 font-serif text-p2">
              With fragmented data and growing reporting pressure, Acme turned
              to Aetherfield to streamline their ESG workflows. The result?
              Faster decisions, fewer spreadsheets, and 34% more coverage.
            </p>
            <Button
              size="secondary"
              bullet={false}
              className="mt-6 w-full sm:w-auto"
            >
              Read case study
            </Button>
          </div>
        </div>
      </Container>
    </Reveal>
  );
}

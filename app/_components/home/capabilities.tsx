import Image from "next/image";
import { Reveal } from "../motion/reveal";
import { Button } from "../primitives";
import { Container } from "./container";

export const CAPABILITIES = [
  ["Track", "Emissions, energy, and waste across your value chain"],
  ["Model", "Forecast performance and goal alignment"],
  ["Report", "Generate ESG disclosures, automate frameworks"],
  ["Act", "Surface insights and operational next steps"],
];

export function Capabilities() {
  return (
    <Reveal as="section" stagger className="py-20 md:py-28">
      <Container>
        <h2
          className="display-fluid-h4 mx-auto max-w-[600px] text-center font-sans font-bold"
          data-reveal-item
        >
          Everything you need to measure, model, and act on sustainability
        </h2>

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Image with the floating metric card */}
          <div className="relative aspect-[692/566] w-full" data-reveal-item>
            <Image
              src="/assets/images/Image-3.png"
              alt="Sheer fabric lifting against an open sky"
              fill
              sizes="(max-width: 1024px) 100vw, 620px"
              className="object-cover"
            />
            <div className="@container absolute inset-x-[8%] top-1/2 -translate-y-1/2 lg:inset-x-[16%]">
              <div className="bg-white p-[4.5cqw] text-[2.6cqw]">
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[1em]">
                    Energy consumption
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    className="size-[2.4em]"
                    aria-hidden
                  >
                    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
                  </svg>
                </div>
                <div className="mt-[3em] flex items-baseline justify-between">
                  <p className="font-sans text-[2.6em] leading-none font-bold">
                    583.7
                    <span className="ml-[0.3em] text-[0.42em]">MWh</span>
                  </p>
                  <span className="font-mono text-[1em] text-accent">
                    ↓12.4%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Numbered sequence */}
          <div className="flex flex-col">
            <ol className="border-t border-border">
              {CAPABILITIES.map(([name, detail], i) => (
                <li
                  key={name}
                  className="border-b border-border py-5"
                  data-reveal-item
                >
                  <div className="flex items-baseline justify-between gap-6">
                    <h3 className="font-sans text-p1 font-bold">{name}</h3>
                    <span className="font-mono text-caption text-muted">
                      {String(i + 1).padStart(3, "0")}
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-p2">{detail}</p>
                </li>
              ))}
            </ol>
            <Button
              className="mt-8 w-full lg:w-auto lg:self-start"
              data-reveal-item
            >
              Explore features
            </Button>
          </div>
        </div>
      </Container>
    </Reveal>
  );
}

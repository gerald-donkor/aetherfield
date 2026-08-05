import Image from "next/image";
import { Reveal } from "../motion/reveal";
import { Button } from "../primitives";
import { CapabilityVisual } from "./capability-visual";
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
          {/* Image with the floating metric card. The box, the card and their
              four animations live in a client leaf; the `<Image>` is passed in
              as children so this file stays a server component and `next/image`
              never reaches the client bundle. */}
          <CapabilityVisual>
            {/* `sizes` must advertise the *rendered* width, not the box: the
                drift wrapper carries a 1.16 overscan, so the image paints 16%
                larger than its container. At the box's own numbers the browser
                picks the 640w candidate for a 682px render and the photograph
                comes out visibly soft. 116vw / 720px lands on 1080w / 750w
                instead. q90 over the default 75 because the sky is a wide
                smooth gradient, which is exactly what a low JPEG/WebP quality
                smears. Image-3.png is 768x768, so a 2x display is upscaled
                whatever we ask for — that ceiling is the source, not `sizes`. */}
            <Image
              src="/assets/images/Image-3.png"
              alt="Sheer fabric lifting against an open sky"
              fill
              sizes="(max-width: 1024px) 116vw, 720px"
              quality={90}
              className="object-cover"
            />
          </CapabilityVisual>

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

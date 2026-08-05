import Image from "next/image";
import { Reveal } from "../motion/reveal";
import { Container } from "./container";

export function Testimonial() {
  return (
    <Reveal as="section" stagger className="pb-20 md:pb-28">
      <Container className="grid items-center gap-8 md:grid-cols-[372px_1fr] md:gap-14 lg:grid-cols-[608px_1fr] lg:gap-[120px]">
        <Image
          src="/assets/generated/testimonial-duotone.jpg"
          alt="Elliot Williams, rendered as a blue halftone portrait"
          width={1000}
          height={1151}
          sizes="(max-width: 1024px) 100vw, 608px"
          className="w-full object-cover"
          data-reveal-item
        />
        <div className="lg:max-w-[400px]" data-reveal-item>
          <span
            aria-hidden
            className="block font-serif text-[44px] leading-none text-border"
          >
            &ldquo;
          </span>
          <blockquote className="mt-4">
            <p className="display-fluid-h4 font-sans font-bold text-balance">
              We finally moved past spreadsheets and guesswork. Now we have real
              data to guide real decisions.
            </p>
            <footer className="mt-8">
              <p className="font-sans text-p1 font-bold">Elliot Williams</p>
              <p className="mt-1 font-serif text-p2 text-muted">
                Head of Sustainability, Flux Materials
              </p>
            </footer>
          </blockquote>
        </div>
      </Container>
    </Reveal>
  );
}

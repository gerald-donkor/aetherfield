import { Reveal } from "../motion/reveal";
import { Container } from "./container";
import { PRINCIPLES } from "./principles-data";

/* Re-exported so `home/sections` and every existing import still resolve;
   the array itself lives in a component-free module — see principles-data.tsx. */
export { PRINCIPLES };

export function Principles() {
  return (
    <Reveal as="section" stagger className="cream-fabric py-16 md:py-20">
      <Container>
        {/* Measured per breakpoint: 36 / 62 / 76 — a notch below the 80px H1. */}
        <h2 className="text-center text-[36px] leading-[1.02] md:text-[62px] lg:text-[clamp(62px,5.9vw,76px)]">
          <span className="block font-serif" data-reveal-item>
            Built for clarity
          </span>
          <span
            className="block font-sans font-bold tracking-[-0.01em]"
            data-reveal-item
          >
            Designed for action
          </span>
        </h2>

        <ul className="mt-10 grid gap-6 md:mt-12 lg:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <li
              key={p.title}
              className="flex flex-col rounded-card bg-white p-8 md:p-10"
              data-reveal-item
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-12"
                aria-hidden
              >
                {p.icon}
              </svg>
              <h3 className="mt-8 font-sans text-p1 font-bold">{p.title}</h3>
              <p className="mt-2 font-serif text-p2">{p.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Reveal>
  );
}

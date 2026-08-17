import { Reveal } from "../motion/reveal";
import { Container } from "./container";
import { PrincipleCard } from "./principle-card";
import { PRINCIPLES } from "./principles-data";

/* This module is **component-only**, and the front matter's bundle rule is why:
   it imports `Reveal`, which is `"use client"` and calls `useGSAP`, so a
   constant exported from here is an edge along which GSAP reaches an importer's
   bundle. `PRINCIPLES` used to be re-exported from this line "so every existing
   import still resolves" — by prompt 113 no import did. The one cross-area
   consumer, `about/sections.tsx`, already reads it from `principles-data.tsx`,
   which exists precisely because this went wrong once. */

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
            <PrincipleCard
              key={p.title}
              principle={p}
              className="bg-white p-8 md:p-10"
              headingClassName="mt-8"
              revealItem
            />
          ))}
        </ul>
      </Container>
    </Reveal>
  );
}

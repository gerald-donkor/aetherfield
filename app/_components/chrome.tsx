"use client";

import { useState } from "react";
import { Button, LinkButton, Wordmark } from "./primitives";

const NAV_ITEMS = ["Product", "Journal", "About", "Careers"] as const;

/* -------------------------------------------------------------------------- */
/*  Header nav — bar 1320×60, wordmark left, links right                        */
/* -------------------------------------------------------------------------- */

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="w-full bg-white">
      <div className="flex h-[60px] items-center justify-between">
        <Wordmark className="text-[26px]" />

        {/* Desktop */}
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href="#"
              className="font-sans text-nav font-bold text-ink hover:text-muted"
            >
              {item}
            </a>
          ))}
          <LinkButton href="#">Get started</LinkButton>
        </nav>

        {/* Mobile toggle: + rotates into × */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`size-6 transition-transform duration-200 ${
              open ? "rotate-45" : ""
            }`}
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Mobile panel: 40px items, hairline separators, full-width CTA */}
      {open ? (
        <nav className="pb-6 md:hidden">
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href="#"
              className="block border-b border-border py-5 font-sans text-[40px] leading-none font-bold"
            >
              {item}
            </a>
          ))}
          <Button className="mt-6 h-[52px] w-full">Get started</Button>
        </nav>
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  CTA band — 1280×358, surface, square corners, centred                       */
/* -------------------------------------------------------------------------- */

export function CtaBand({ headline }: { headline: string }) {
  return (
    <section className="flex flex-col items-center justify-center bg-surface px-6 py-[110px] text-center">
      <h2 className="display-fluid-h4 max-w-[860px] font-sans leading-none font-bold text-balance">
        {headline}
      </h2>
      <Button className="mt-[38px]">Request a demo</Button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Footer — the one full-colour moment. Yellow field, olive ink only.          */
/* -------------------------------------------------------------------------- */

export function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-brand text-brand-ink">
      <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:px-10">
        <nav className="flex flex-wrap gap-x-7 gap-y-2">
          {[...NAV_ITEMS, "Get started"].map((item) => (
            <a
              key={item}
              href="#"
              className="font-sans text-p1 font-bold hover:opacity-70"
            >
              {item}
            </a>
          ))}
        </nav>
        <p className="font-serif text-p2">© 2025 · All rights reserved</p>
      </div>

      {/* Duotone image band */}
      <div className="duotone-band mx-6 h-[190px] sm:mx-10 sm:h-[430px]" />

      {/* Oversized wordmark, bleeding edge to edge and cropped at the baseline.
          Drawn as SVG text so it fills the block width exactly at any viewport
          instead of depending on a viewport-unit font size. */}
      <svg
        viewBox="0 0 1000 150"
        role="img"
        aria-label="Aetherfield"
        className="mt-4 block w-full sm:mt-8"
      >
        <text
          x="0"
          y="147"
          textLength="1000"
          lengthAdjust="spacingAndGlyphs"
          fontSize="199"
          fontWeight="800"
          fill="currentColor"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Aetherfield
        </text>
      </svg>
    </footer>
  );
}

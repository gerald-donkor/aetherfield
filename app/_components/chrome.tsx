"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FooterMotion } from "./motion/footer-reveal";
import { NavDrop } from "./motion/nav-drop";
import { Button, LinkButton, Wordmark } from "./primitives";

/* There is no /product route, so Product resolves to the home page — the
   product story is what the homepage tells. */
const NAV_ITEMS = [
  { label: "Product", href: "/" },
  { label: "Journal", href: "/journal" },
  { label: "About", href: "/about" },
  { label: "Careers", href: "/careers" },
] as const;

/* The same gutters `Container` sets in home/sections.tsx, inlined rather than
   imported: that module is not a client module, and pulling it in here would
   drag the hero dashboard and the article list into the client bundle for the
   sake of one wrapper. Keep the two in step if the gutters ever change. */
const CONTAINER = "mx-auto w-full max-w-page px-5 lg:px-6";

/* -------------------------------------------------------------------------- */
/*  Header nav — bar 1320×60, wordmark left, links right                        */
/* -------------------------------------------------------------------------- */

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    // Pinned, full-bleed frosted glass: the page scrolls underneath it. The
    // fill is translucent so content smears through rather than being hidden —
    // over the white page top the bar reads as invisible. No border, no shadow:
    // the blur just stops at the bottom edge.
    //
    // 10 % white over a 32px blur. The tint is fitted on the hero sky, not on
    // the article page's photographs: over a smooth gradient any lift reads as
    // a band, and a bare blur reproduces the gradient almost exactly, so the
    // tint is as low as legibility allows rather than as low as possible —
    // 10 % is 4 levels out of 255 on the sky, and keeps the black links off the
    // near-black sunset photograph on /article/[slug]. Where backdrop-filter is
    // unsupported the bar falls back to a near-opaque white.
    //
    // `NavDrop` renders the `<header>` itself and takes this class string over
    // verbatim, so the settled bar gains its load entrance and not a single box
    // — exactly as `FooterMotion` takes over `<footer>` below. Everything
    // inside here is unchanged.
    <NavDrop className="sticky top-0 z-50 w-full bg-white/85 backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/10">
      <div className={`${CONTAINER} flex h-[60px] items-center justify-between`}>
        <Link href="/" aria-label="Aetherfield, home">
          <Wordmark className="text-[26px]" />
        </Link>

        {/* Desktop */}
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="font-sans text-nav font-bold text-ink hover:text-muted"
            >
              {item.label}
            </Link>
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

      {/* Mobile panel: 40px items, hairline separators, full-width CTA.
          Opaque, because the panel now overlays the page instead of pushing it
          down — prose must not read through it. It scrolls if it outgrows the
          viewport below the 60px bar. */}
      {open ? (
        <div
          className={`${CONTAINER} max-h-[calc(100dvh-60px)] overflow-y-auto bg-white pb-6 md:hidden`}
        >
          <nav>
            {NAV_ITEMS.map((item) => (
              // A client-side navigation doesn't unmount the panel, so close it
              // here or the new page arrives with the menu still over it.
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block border-b border-border py-5 font-sans text-[40px] leading-none font-bold"
              >
                {item.label}
              </Link>
            ))}
            <Button className="mt-6 h-[52px] w-full">Get started</Button>
          </nav>
        </div>
      ) : null}
    </NavDrop>
  );
}

/* -------------------------------------------------------------------------- */
/*  CTA band — 1280×358, surface, square corners, centred                       */
/* -------------------------------------------------------------------------- */

export function CtaBand({
  headline,
  action = "Request a demo",
  tone = "surface",
}: {
  headline: string;
  action?: string;
  /* /about runs the band straight on the page background: the block above it is
     already a surface panel, and two surfaces touching read as one. Defaults to
     "surface" so every settled caller is untouched. */
  tone?: "surface" | "white";
}) {
  return (
    <section
      className={`flex flex-col items-center justify-center px-6 py-[110px] text-center ${
        tone === "white" ? "bg-white" : "bg-surface"
      }`}
    >
      <h2 className="display-fluid-h4 max-w-[980px] font-sans font-bold text-balance">
        {headline}
      </h2>
      <Button className="mt-[38px]">{action}</Button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Footer — the one full-colour moment. Yellow field, olive ink only.          */
/* -------------------------------------------------------------------------- */

export function SiteFooter() {
  return (
    // `FooterMotion` renders the `<footer>` itself and takes its class string
    // over, so the settled footer gains motion and not a single box. The three
    // data attributes below are inert markers for it; no geometry, class string
    // or element here has changed.
    <FooterMotion className="overflow-hidden bg-brand text-brand-ink">
      <div className="mx-auto flex max-w-page flex-col items-center gap-3 px-5 lg:px-6 py-6 text-center sm:flex-row sm:items-baseline sm:justify-between sm:text-left">
        <nav className="flex flex-wrap justify-center gap-x-7 gap-y-2">
          {/* Labels only: the footer's link targets are unchanged pending review.
              `data-footer-split` is per-link rather than on the `<nav>`: SplitText
              labels the element it splits and hides the pieces, so splitting the
              nav would leave every link without an accessible name. */}
          {[...NAV_ITEMS.map((i) => i.label), "Get started"].map((item) => (
            <a
              key={item}
              href="#"
              data-footer-split=""
              className="font-sans text-p1 font-bold hover:opacity-70"
            >
              {item}
            </a>
          ))}
        </nav>
        <p data-footer-split="" className="font-serif text-p2">
          © 2025 · All rights reserved
        </p>
      </div>

      {/* Halftone-screened fabric band */}
      <div className="mx-auto max-w-page px-5 lg:px-6">
        <Image
          src="/assets/generated/texture-brand.png"
          alt=""
          width={1800}
          height={409}
          sizes="100vw"
          aria-hidden
          className="h-[120px] w-full object-cover sm:h-[210px] lg:h-[280px]"
        />
      </div>

      {/* Oversized wordmark, sharing the band's 20px gutter and cropped at the
          baseline. Drawn as SVG text so it fills the block width exactly at any
          viewport instead of depending on a viewport-unit font size.

          The viewBox is the tight glyph box — 165 units is exactly cap height
          plus the round letters' overshoot at this size, so the block carries no
          padding of its own. That is what keeps the 20px of yellow underneath
          constant at 375, 800 and 1280, as measured off the three comps. */}
      <div className="mx-auto max-w-page px-5 pb-5">
        <svg
          viewBox="0 0 1000 165"
          role="img"
          aria-label="Aetherfield"
          data-footer-wordmark=""
          className="mt-4 block w-full sm:mt-5"
        >
          {/* textLength is the advance width, which includes the A's left and
              the d's right side bearing — laying it out at a flat 1000 leaves
              the ink visibly inset on the right. Overshooting to 1013 from
              x=-1.6 puts the ink itself flush with both gutters, as in the
              comps. Bearings scale with the glyphs, so this holds at any width. */}
          <text
            x="-1.6"
            y="162.5"
            textLength="1013"
            lengthAdjust="spacingAndGlyphs"
            fontSize="222"
            fontWeight="800"
            fill="currentColor"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Aetherfield
          </text>
        </svg>
      </div>
    </FooterMotion>
  );
}

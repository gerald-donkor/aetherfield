# Chrome — the footer and the site header

## The footer is fixed

`SiteFooter` in `app/_components/chrome.tsx` is **settled — do not restyle it.**
It matches the comps at all three breakpoints and is committed. Treat it as
done when building new pages: import and render it, don't fork or adjust it.

This covers the whole footer block — the yellow `--color-brand` field, the
olive `--color-brand-ink` text, the halftone fabric band
(`/assets/generated/texture-brand.png`), and the oversized SVG wordmark. The
wordmark is drawn as SVG `<text>` with `textLength` on purpose, so it fills the
block width exactly at any viewport; a viewport-unit font size clips it.

**The wordmark block is measured, not eyeballed.** `viewBox="0 0 1000 165"` is
the tight glyph box — cap height plus the round letters' overshoot at
`fontSize` 222 — so the SVG carries no padding of its own and the surrounding
`px-5` / `pb-5` / `mt-4 sm:mt-5` are the only spacing. That is what holds the
comps' constant 20px gutter and 20px of yellow below the baseline at 375, 800
and 1280 while the type scales with the viewport. `textLength` is 1013 from
`x="-1.6"`, not 1000 from 0: 1000 is the *advance* width, so a flat 1000 leaves
the ink inset ~14px on the right by the `d`'s side bearing. Verified against all
three comps — glyph height 55 / 125 / 204, insets 20 on both sides at each.

If a design genuinely calls for a different footer, ask first rather than
editing this one.

## Site header (`SiteNav`)

The header is **sticky, full-bleed frosted glass**: `sticky top-0 z-50` on a
full-width `<header>`, with the row inside it holding the page gutters. It
never hides, shrinks or changes state on scroll — one constant bar.

**The glass is `bg-white/10` over `backdrop-blur-[32px]`**, no border and no
shadow, with a `bg-white/85` fallback where `backdrop-filter` is unsupported.
Both numbers are **matched against screencasts, not a comp** — there is no
static comp of the bar over content. The two are fitted on different pages, and
that is deliberate.

**The blur radius is fitted on `/article/[slug]`**, against the t=88s frame of
`~/Videos/Screencasts/navbar-demo.webm` (1280-wide prototype, frame scale
0.987). Extract the frame, render the article page scrolled to the same place —
align by the recent-article images' bottom edge, not by scroll offset — and
score the softness of the card-image edge under the bar with a horizontal
profile across the first image gutter. It bottoms out at 28–36px; 32 is the
midpoint.

**The tint is fitted on `/`, over the hero sky.** Photographs do not constrain
it — any lift hides in the image, and fitting the tint on the article band gave
30 %, which reads as an obvious lighter band across the top of the homepage
(`Screencast_20260804_115028.webm` shows this). A smooth gradient does
constrain it. The reference is **the page with no bar at all**: render `/` with
`background:none; backdrop-filter:none` forced on the `<header>` and compare
each candidate to it row by row down the 60px the bar occupies. A bare
`blur(32px)` reproduces a near-linear gradient almost exactly, so the error
falls monotonically toward zero tint — 6 % → 2.3 mean, 10 % → 4.2, 15 % → 5.9,
30 % → ~14 levels of 255.

**10 % rather than 0 is a legibility floor, not a fit.** Where the bar crosses
the third recent-article card's sunset photograph the backdrop is nearly black;
the black nav links measure 3.0:1 there at 10 % and about 1.5:1 at 0 %. 3.0:1
clears AA only on the large-bold reading of the nav type — it is the known cost
of a bar that blends, and the homepage is the stronger constraint. If this ever
needs to be better, change the backdrop (the card images' crop) rather than
raising the tint.

**The pages render `SiteNav` outside `Container`.** `sticky` only travels
within its parent, so a one-child `<Container><SiteNav /></Container>` wrapper
unpins the bar the moment that wrapper scrolls off. `SiteNav` therefore carries
its own gutters: the `Container` class string is **inlined** in `chrome.tsx` as
`CONTAINER` rather than imported, because `chrome.tsx` is a client module and
importing from `home/sections.tsx` would pull the hero dashboard and the
article list into the client bundle. Keep the two in step.

**The homepage sky was detached from its `relative isolate` wrapper** for the
same reason — `SiteNav` sat inside it alongside the hero and would have unpinned
below the fold. The band is now a document-level `absolute inset-x-0 top-0
-z-10` sibling: with no positioned ancestor it resolves against the initial
containing block, so `top-0` is still the page top and it still paints behind
the nav and hero. Verified: `/` at 375, 800 and 1280 is **pixel-identical below
the 60px bar** before and after.

**The homepage's only pixel change is inside the bar**, and at 10 % it is not
visible: the shipped bar sits 4.2 levels (max 5.0) from the bare gradient down
its whole height.

The mobile panel now overlays content instead of pushing it, so it is opaque
`bg-white` and scrolls at `max-h-[calc(100dvh-60px)]`. Items, separators and
CTA are unchanged.

### The "Get started" arrow is drawn, not a glyph

`LinkButton` in `primitives.tsx` used to render `→` as text. **Archivo has no
`→`**, so the shape came from whatever fallback the browser picked and differed
machine to machine: the same markup at the same 1262-wide viewport gives a
**12×9** chevron in the reference screenshot and a **15×6** flat dart in
headless Chromium. It is now an inline SVG, the rule this project already
follows wherever a glyph is not fittable (the `Seal`'s ®, the job-listing
bullets, the dashed card frame).

The target ink map, off `Screenshot_20260805_105535.png` at threshold 60 %
(`#` = ink, rows and columns local to the arrow's own 12×9 ink box):

```
0 .....###....
1 ......###...
2 .......###..
3 ........###.
4 ############
5 ###########.
6 .......###..
7 ......###...
8 .....###....
```

**Three numbers are load-bearing, and none of them is the path.** The viewBox is
the *ink* box, so it is the 2px stroke's outer edges that must fill 0…12 × 0…9:

- **The shaft is centred on y 5, not on the box's 4.5.** At 4.5 the stroke spans
  3.5…5.5, lands 50 % on three device pixel rows, and renders **3px thick** —
  measured, not predicted. At 5 it spans 4…6 and gives the two rows the
  reference draws. The chevron stays symmetric about 4.5, so shaft and vertex
  sit half a pixel apart; the reference's own map has exactly that offset (arms
  symmetric about row 10, shaft on rows 10–11).
- **The 12th column comes from the miter, not the shaft.** The vertex is at
  x 10.6 and the 90° miter tip runs to x 12.01. A shaft drawn to x 12 instead
  would blunt the tip, which the map shows as a single column.
- **The arms overrun the box and are clipped by the viewport.** Their butt caps
  are perpendicular to a 45° line, so an endpoint inside the box leaves a
  diagonal corner and the top row renders 1px wide instead of 3. Ending them at
  y 0.2 / 8.8 lets the SVG clip square, as the reference draws it. Everything
  past ±0.707 of the edge is clipped anyway, so the exact overrun does not
  matter — 0.4 and 0.2 measure identically.

Measured on the production render at 1262, `/about`: **12 × 9 with a 2px shaft**,
and every row matches the map above except the two extreme corners, which come
out 2px wide against the reference's 3 — one pixel of antialiasing on a
reference that is itself a rasterised font glyph. Vertically the arrow's ink
centres 1px below the nav text's cap mid, against the reference's 0.5px; the
ink box aligns without a `-mt` nudge, so none is authored. The `ml-1.5` gap and
the `group-hover:translate-x-1.5` slide are unchanged — hover measures 6.00px.

`/`, `/journal`, `/careers`, `/about` and `/design-system` are **byte-identical
prerendered HTML apart from the arrow element itself** (verified against a build
of the same tree with the `<span>` restored, normalising the CSS chunk names and
the build id). `/design-system` carries two, the navbar's and the sample's.

**Still outstanding:** `app/_components/about/sections.tsx:56` ("Adjust your
targets →") sets the same bare glyph and carries the same fallback risk. It is
not the navbar, so it was left alone.

### Nav — Product points at the home page

`NAV_ITEMS[0]` shipped as `{ label: "Product", href: "#" }` and was the last nav
item without a destination. There is no `/product` route and none is planned, so
it now resolves to `/` — the homepage *is* the product story. One line of data
in `chrome.tsx`; the desktop nav and the mobile panel both read `NAV_ITEMS`, so
both follow, and the panel's existing `onClick={() => setOpen(false)}` already
closes the overlay on navigation.

**The footer nav is deliberately untouched.** `SiteFooter` maps `NAV_ITEMS`'
*labels* only and hardcodes `href="#"` for every item. Wiring those is a change
to the settled footer and is a separate decision — do not fold it into a nav
change.

No layout row moves at any breakpoint: the label's text and type are unchanged,
so there is nothing to measure against the comps. Every page's prerendered HTML
gains exactly two diffs (desktop and mobile `<a href="#">` → `<a href="/">`)
with the same class strings.


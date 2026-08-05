# AGENTS.md

You are a **principal-level design engineer, full-stack engineer with several years of experience and AI implementation agent** working on **Aetherfield**.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes

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

## Journal index (`/journal`)

`app/journal/page.tsx` with its sections in `app/_components/journal/sections.tsx`.
Reuses `SiteNav`, `Container`, `CtaBand` and `SiteFooter` as-is.

**The masthead stamp is one scaling SVG.** `JournalStamp` draws the whole stamp
interior — perforations, hand-drawn frame, lozenge and all six pieces of type —
on a single `viewBox="0 0 1240 480"`, inside a wrapper holding that exact ratio.
That is why the three comps agree: nothing is sized per breakpoint. Hand-sizing
type here means you have drifted from the comp. Measured off `Desktop.png`:
26 perforations at pitch 1240/25, r 15, centred on the corners; frame inset
20 across / 30 down at stroke 3; lozenge at stroke **6** (twice the frame) with
tips at x 160 / 1080 and apexes at y 62 / 415, rounded left and right tips only.

**`texture-journal.png`** is the stamp's fabric — the same draped cloth as the
footer band, duotoned blue and halftone-screened:

```
magick "public/assets/images/Footer image.png" \
  -colorspace Gray -resize x743 -gravity center -extent 1920x743 \
  -sigmoidal-contrast 8,50% \
  -ordered-dither h4x4a \
  +level-colors '#63AAF6','#9DCCFF' \
  public/assets/generated/texture-journal.png
```

The sigmoidal contrast is load-bearing: without it the dither lands near 50 %
everywhere and the folds disappear into a flat crosshatch. Verified against the
comp at `Desktop.png -crop 130x380+55+100` — mean `#8AC3FE`, tones `#9CCCFF` /
`#6AAEF7`.

**Shared-component extensions made here** (both additive, `/` unchanged):
`ArticleCardStacked` takes optional `src`/`alt` (falling back to `Placeholder`),
`href` (which makes the whole card one link), `priority` and `className`; the
`max-w-[612px]` cap moved out of the component so it fills a grid column.
`CtaBand` takes an optional `action` label defaulting to `"Request a demo"`.

**Known deviation:** the comps set card titles and descriptions around 16px on
mobile, but `--text-p1` / `--text-p2` are a fixed 20px in the design system and
`/` ships that way. The journal page follows the system, so mobile titles and
descriptions wrap one line more than the comp. Changing it is a type-scale
decision that would also move the settled homepage — raise it before doing so.

## Article content lives in `app/_content/articles.ts`

`ARTICLES` is the one list behind `/`, `/journal` and `/article/[slug]` — the
`Article` type lives there too and `app/_components/cards.tsx` re-exports it.
Do not reintroduce a per-page copy. `FEATURED_ARTICLES` is the homepage's first
three.

Prose is separate: `ARTICLE_BODIES`, keyed by slug. Only slugs with a body are
prerendered (`WRITTEN_SLUGS` feeds `generateStaticParams`); the other five
articles are card copy and **404 by design** until their prose is written.
Keeping bodies out of `ARTICLES` is what stops the two index pages shipping
article prose they never render.

## Article page (`/article/[slug]`)

`app/article/[slug]/page.tsx` with its sections in
`app/_components/article/sections.tsx`. Reuses `SiteNav`, `Container` and
`SiteFooter`. **There is no `CtaBand`** — the comp runs the recent-articles band
straight into the footer.

Two `@utility` steps were added in `app/globals.css` because neither curve
already existed: `display-article-title` (36 / 64 / 80) for the masthead, and
`display-band-h2` (32 / 50 / 60) for "Recent articles". They are separate
utilities, not one with modifiers, because the two step differently.

**The reading column's 28px leading is set on the prose, not on the token.**
`--text-p2` is a fixed 20/24 and the settled pages depend on it, so the article's
line pitch is a `leading-[28px]` on the prose elements. Verified against the
desktop and tablet comps, where the pitch is 28 in both.

**`article-climate-hero.png`** is cropped out of the desktop comp — the
photograph is not in `public/assets/images`:

```
magick public/assets/pages/03-article1/screen-sizes/Desktop.png \
  -crop 1240x500+20+380 +repage -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-climate-hero.png
```

PNG, not JPEG: the image is a hard halftone dot screen and JPEG rings on it.
Quantising to 64 colours takes it from 791 KB to 179 KB with no visible change.
**Known limitation:** this is a 1x asset, so it is soft on a 2x display. Replace
it with the source photograph when one is available.

**Measured against the comps** at 375 / 800 / 1280. Masthead meta, both title
lines and the hero top all land within 1px at all three; the rail, lede, body
rule, band heading and card images land within 2px at 1280. Two drifts, both
inherited rather than introduced:

- The shipped Archivo runs ~18 % wider per unit of cap height than the comps'
  cut, so paragraphs wrap a line earlier — the desktop body ends ~24px low.
  This is visible on the settled `/journal` too (its "Latest articles" measures
  257px wide against the comp's 235 at the same size), so it is a font-loading
  question for the whole site, not this page.
- Mobile runs ~380px long, for the 20px `--text-p1` / `--text-p2` reason already
  recorded above.

`MetaPair`'s built-in 7px label→value gap sits ~6px below the comp on this page.
It was left alone rather than made configurable, since it is correct where it
already ships.

## Article 2 — "Sustainability Isn't a Side Project" (`/article/sustainability-isnt-a-side-project-making-impact-operational`)

**A data change, not a page.** The comp
(`public/assets/pages/04-article2/screen-sizes/`) has the same masthead, rail,
lede + rule, five `heading + body` sections and recent-articles band as article 1,
at the same geometry — hero `1240×500 +20+460` / `760×307 +20+412` /
`335×136 +20+306`, cards `403×235` ×3 / `760×443` / `335×195`. So the whole
change is one `ARTICLE_BODIES` key plus one generated hero. No new components,
no layout edits.

**`article-impact-hero.png`** is `public/assets/images/Image-7.png` — the same
photograph the article's card already uses — as a blue halftone cut out over
cream. Three steps, because it is a composite, not a single duotone pass:

```
# 1. backdrop mask: threshold the studio backdrop, keep only the two regions
#    that touch the corners (a plain threshold also catches bright fern tips)
magick public/assets/images/Image-7.png -colorspace Gray -threshold 75% \
  -morphology Close Disk:3 -morphology Open Disk:3 -alpha off -type TrueColor \
  -fill red -draw "color 764,3 floodfill" -draw "color 3,764 floodfill" \
  -fill black +opaque red -fill white -opaque red \
  -colorspace Gray -resize 1240x500! -threshold 50% mask.png
# 2. blue-on-white halftone
magick public/assets/images/Image-7.png -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' ink.png
# 3. cream paper field, grain damped to the comp's amplitude
magick public/assets/generated/texture-cream.jpg \
  -resize 1240x500^ -gravity center -extent 1240x500 \
  \( +clone -blur 0x10 \) -compose blend -define compose:args=75 -composite cream.png
# 4. composite
magick ink.png cream.png mask.png -composite \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-impact-hero.png
```

Load-bearing details:

- **The highlight is white, the corners are cream — that is two layers, not one
  `+level-colors`.** Sampled off `Desktop.png -crop 1240x500+20+460`: interior
  halftone highlights are `#FBFCFF`, the corner wedges `#EDE5D2`–`#F9F0DD` with
  a soft paper mottle. A single cream-highlight duotone makes the fern
  highlights cream too and reads muddy.
- **The dot colour `#2683EB` is exactly `--color-accent`** — no new token.
- **`-type TrueColor` before the floodfill.** Drawing red into a Gray image
  silently makes it grey and the `+opaque` pair then does the wrong thing.
- **The cream grain is measured.** `texture-cream.jpg` upscaled to 500 tall has
  σ ≈ 9.3 against the comp's σ ≈ 2.5–3.2 at the same mean (≈236); the 75 % blend
  with its own blur brings it to 3.2 without shifting hue.
- **`-colors 64`** for the same reason as article 1 — a hard dot screen rings
  under JPEG, and the palette cut is free. 36 KB.

Unlike `article-climate-hero.png` this is generated from the source photograph,
so it is resolution-honest rather than a 1x crop of the comp.

**Known deviation — the hero's framing.** The comp's hero is *not* a crop of
Image-7: its four cream-wedge edge crossings (left 224/500, right 328/500, top
1007/1240, bottom 260/1240) are mutually unsatisfiable by any affine
crop-and-stretch of the square — solving them gives a window 1.6× the source
width. A brute-force sweep over ~1000 crop windows (plus the 180° variants)
scores the full square at RMSE 0.273 against the comp's cream mask, versus 0.266
for the best crop found — i.e. nothing is meaningfully better. The shipped asset
therefore squashes the whole square, which matches the comp on the top and
bottom crossings (within ~3 %) and on the diagonal's direction, but shows
smaller cream wedges on the left and right edges. The comp was almost certainly
free-transformed in Figma. Replace this if the designer's transform is ever
recovered.

**Measured against the comps** at 375 / 800 / 1280: hero box lands at `+20+460`
(desktop, exact), `+20+412` (tablet, exact) and `+20+341` vs `+20+306` (mobile);
recent-articles cards are size-exact at all three (`400×232` / `760×443` /
`335×195`). The vertical drifts are the two already recorded for article 1 —
desktop runs ~76px short and mobile ~387px long, from the wide Archivo cut and
the 20px `--text-p1`/`--text-p2` floor. Record, don't chase.

The `published` date reads **May 31, 2028** in the comp; the entry ships **May
31, 2026** to match the site-wide 2026 convention (article 1 moved from 2028 to
2026 in the same commit).

## Article 3 — "Inside the Aetherfield Model" (`/article/inside-the-aetherfield-model-how-we-turn-data-into-action`)

**A data change, like article 2.** The comp
(`public/assets/pages/05-article3/screen-sizes/`) is the same page as articles 1
and 2 at the same geometry — hero `1240×500 +20+380` desktop / `760×307 +20+412`
tablet / `335×136 +20+306` mobile, cards `403×235` ×3 / `760×443` / `335×195`.
One `ARTICLE_BODIES` key plus one generated hero; no components touched. The
`ARTICLES` entry already existed, so adding the body is what puts the slug in
`WRITTEN_SLUGS` and stops the homepage's third card 404ing.

**`article-model-hero.png`** is `public/assets/images/Image-6.png` — the
photograph the article's card already uses — through article 2's three-layer
blue-halftone-over-cream composite:

```
C="636x311+0+79"
magick public/assets/images/Image-6.png -alpha off -crop $C +repage \
  -colorspace Gray -threshold 62% \
  -morphology Close Disk:3 -morphology Open Disk:3 \
  -resize 1240x500! -threshold 50% mask.png
magick public/assets/images/Image-6.png -alpha off -crop $C +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' ink.png
magick public/assets/generated/texture-cream.jpg \
  -resize 1240x500^ -gravity center -extent 1240x500 \
  \( +clone -blur 0x10 \) -compose blend -define compose:args=75 -composite cream.png
magick ink.png cream.png mask.png -composite \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-model-hero.png
```

36 KB. Ink is `#2683EB` = `--color-accent`; cream field measures σ 3.0 at mean
230, inside the comp's σ 2.5–3.2.

**The crop is fitted end-to-end, not on the mask.** Unlike article 2 there is no
studio backdrop to floodfill, so the cream/ink split is a brightness threshold
and crop and threshold have to be fitted together. Three metrics were tried and
only the third is trustworthy:

| metric | result |
| --- | --- |
| blurred greyscale, `-normalize` both sides | `624x311+0+84`, RMSE 0.142 |
| comp cream mask via `-fx "(r-b)>0.05?1:0"` | `624x291+0+84` T=58, RMSE 0.307 |
| **generate the candidate and compare it to the comp** | **`636x311+0+79`, RMSE 0.086** |

`x` pins to `0` at every width tried, so the window is flush with the
photograph's left edge. The plateau is broad — 0.0857 to 0.087 across ±12px of
width and height — so do not read precision into the last digit.

**A plain `(r-b)` test does not find the cream; it finds "not solid blue".**
Sparse halftone still reads warm on average, so that mask scored 0.42 cream when
the comp's true dot-free area is 0.357. Take a `-statistic Minimum 5x5` first —
in a dotted region the local minimum is the ink, in cream it is the paper:

```
magick comp-hero.png -statistic Minimum 5x5 -fx "(r-b)>0.02?1:0" \
  -colorspace Gray -morphology Close Disk:2 -morphology Open Disk:2 mask.png
```

**The threshold is 62 %, not the 54 % the end-to-end sweep prefers.** At 124×50
the RMSE metric cannot tell cream from sparse dots, so it drifts toward flooding
the sky with cream: 54 % gives 0.46 dot-free area against the comp's 0.357 and
the sky's dot gradient disappears. 62 % lands at 0.331 for 0.002 of RMSE, and
it is also where the min-filtered mask sweep independently lands. Cream fraction
is the honest signal here; use RMSE for the crop and the mask for the threshold.

**Known deviation — the comp's silhouette shapes are not in the photograph.**
The comp has three tall dot-screened masses the source does not: a full-height
band left of the head, a triangular "hill" at the right, and a bulge right of
the head. Contrast-stretching the source sky (`-auto-level -sigmoidal-contrast
15,50%`) shows a smooth gradient with no cloud structure there, and an RMSE rank
of every file in `public/assets/images` confirms Image-6 is the source (Image-1
scores lower only because the comparison is whole-image against a crop). Like
article 2's hero, the comp was hand-composed in Figma. The shipped asset matches
it on framing, horizon, all three turbines, palette and dot texture; it does not
reproduce those masses. Replace it if the designer's file is ever recovered.

**Measured against the comps** at 375 / 800 / 1280, production build: hero top
edge lands at y 380 (desktop, exact), `760×306 +20+412` (tablet, exact) and
`+20+341` vs `+20+306` (mobile — the same 35px as article 2); recent-articles
cards `400×232` / `760×442` / `335×195`. Page height runs 104px short at 1280,
123px short at 800 and 457px long at 375 — the same two inherited drifts as
articles 1 and 2 (wide Archivo cut; the 20px `--text-p1`/`--text-p2` floor).
Record, don't chase.

The `published` date reads **June 16, 2028** in the comp; the entry ships **June
16, 2026** for the site-wide 2026 convention.

## Articles 4, 5 and 6 — the rest of `/journal`

Three more `ARTICLE_BODIES` keys plus three generated heroes, from
`public/assets/pages/06-article4`, `07-article5` and `08-article6`. All six
slugs in `ARTICLES` now have prose, so nothing on `/journal` 404s any more.

| # | slug | hero |
| --- | --- | --- |
| 4 | `from-spreadsheets-to-systems-the-evolution-of-climate-reporting` | `article-reporting-hero.png` |
| 5 | `carbon-accounting-myths-models-and-must-haves` | `article-carbon-hero.png` |
| 6 | `seeing-clearly-designing-feedback-loops-for-sustainable-growth` | `article-loops-hero.png` |

**The one code change is a multi-paragraph lede.** Article 5's standfirst is two
paragraphs above the rule, so `ArticleBody.lede` is now `string | string[]` and
`sections.tsx` maps it. The break is **one blank line at the prose pitch** —
`mt-7` on top of the 28px leading, measured off `07-article5/Desktop.png`, whose
lede line boxes run 965 / 993 / 1021 / 1049 and then 1105, i.e. 56 = 2 × 28.
A plain `string` still renders `<p class="font-serif text-p2 leading-[28px]">`
with no wrapper and no extra class, so articles 1–3 are byte-identical HTML —
verified by grepping the prerendered `/article/how-to-build-a-climate-ready-data-stack`.

**Straight apostrophes, not curly.** The comps draw curly ones, but articles 1–3
shipped straight `'` and `"` throughout and read correctly against their comps.
Consistency across the six articles wins; don't "fix" one article to curly.

### Heroes

**`article-carbon-hero.png` (article 5) — the article 2 three-layer composite.**
Source `Image-5.png`, the same peak its card uses.

```
C=740x298+16+228
magick public/assets/images/Image-5.png -alpha off -crop $C +repage \
  -colorspace Gray -threshold 78% -morphology Close Disk:3 -morphology Open Disk:3 \
  -resize 1240x500! -threshold 50% mask.png
magick public/assets/images/Image-5.png -alpha off -crop $C +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' ink.png
magick public/assets/generated/texture-cream.jpg \
  -resize 1240x500^ -gravity center -extent 1240x500 \
  \( +clone -blur 0x10 \) -compose blend -define compose:args=75 -composite \
  \( +clone -resize 1x1! -resize 1240x500! \) -compose blend -define compose:args=60 -composite \
  -evaluate multiply 1.033 cream.png
magick ink.png cream.png mask.png -composite \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-carbon-hero.png
```

- **The crop is fitted on the silhouette, not on tone.** Tone RMSE has a very
  flat plateau here (0.0558 over W 758–766) and prefers a wider window than the
  comp; the sky/mountain mask does not. Score = XOR area against the comp's
  dot-aware cream mask (`-statistic Minimum 5x5` then `-fx "(r-b)>0.02?1:0"`,
  both at 310×125). Best 1.00 % at `740x298+16+228`, plateau W 736–756, X 10–18,
  Y 226–228.
- **`-threshold 78%`** is fitted on cream *area fraction*: it gives 0.4852
  against the comp's 0.4846, and is also the XOR minimum. 70 % floods the sky
  and leaves bright rock blobs on the peak.
- **Two extra cream steps that article 2 does not have.** Article 2's cream is
  only corner wedges; here it is half the frame, so `texture-cream`'s large-scale
  mottle reads as diagonal streaks across a sky the comp draws flat. Blending
  60 % against the texture's own mean (`-resize 1x1! -resize 1240x500!`) takes
  σ from 2.89 to 1.58 against the comp's 1.49, and `-evaluate multiply 1.033`
  lifts the mean from 231 to 238 to match. Corner lands `#F8F4E4` against the
  comp's `#F7EEDB`. The `+clone -blur 0x10` blend at 75 stays exactly as
  article 2 has it.

**`article-loops-hero.png` (article 6) — ink layer alone, one command.** Source
`Image-4.png` — *not* article 6's own card photograph (`Image-9`), and the same
photograph article 4's card uses. That is what the comp shows; do not "fix" it.

```
magick public/assets/images/Image-4.png -alpha off -crop 744x300+12+234 +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-loops-hero.png
```

End-to-end tone RMSE 0.0648 (from 0.1997 at the starting guess), plateau W
744–750, X 8–14, Y 232–236 — so ±4px, and no more precision than that is
claimed. The independent NCC search below put the same window at
`752x304+16+240`; the two agree inside the plateau.

**`article-reporting-hero.png` (article 4) is cropped out of the comp.** Its
photograph is **not in `public/assets/images`** — see the automation note below
for the search that settles this. So it takes article 1's fallback:

```
magick public/assets/pages/06-article4/screen-sizes/Desktop.png \
  -crop 1240x500+20+460 +repage -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-reporting-hero.png
```

**Known limitation:** a 1x asset, soft on a 2x display, exactly as
`article-climate-hero.png` is. Replace it when the source photograph turns up.
The comp art is soft and low-detail even at 1:1, consistent with a small crop
scaled up in Figma, so little is lost.

### Measured against the comps

Hero box, at 375 / 800 / 1280 (comp → render):

| | article 4 | article 5 | article 6 |
| --- | --- | --- | --- |
| desktop | `+20+460` → `+24+460` | `+20+380` → `+24+380` | `+20+460` → `+24+460` |
| tablet | `+20+412` → `+20+412` | `+20+348` → `+20+412` | `+20+412` → `+20+476` |
| mobile | `+20+342` → `+20+341` | `+20+306` → `+20+341` | `+20+342` → `+20+341` |

Desktop y is exact on all three; the 4px x and the `1232x497` size are
`Container`'s 24px desktop gutter, already recorded for articles 1–3. The 64px
tablet drop on articles 5 and 6 is one extra title line from the wide Archivo
cut — both titles wrap to three lines where the comp gets two. Cards are
`400×232` ×3 / `760×442-443` ×3 / `335×195` ×3 everywhere, as on articles 1–3.

Page height, render minus comp: **+64 / −11 / +546** (article 4), **−76 / +25 /
+650** (article 5), **−216 / −143 / +305** (article 6). The mobile numbers are
the 20px `--text-p1`/`--text-p2` floor. **Article 6's −216 at desktop is the
comp's own trailing whitespace, not a layout drift** — the gap from the last
body line to the recent-articles cards is 326 / 369 / 426 / 326 / 397 / **532**
px across comps 1–6, so article 6's comp simply carries ~200px more air before
the band than article 1's does. The prose is transcribed complete; verified
line by line against `08-article6/Desktop.png`. Record, don't chase.

Dates ship as 2026 (`July 1`, `July 11`, `August 4`) where the comps read 2028,
per the site-wide convention.

## Careers page (`/careers`)

`app/careers/page.tsx` with its sections in `app/_components/careers/sections.tsx`
and its listings in `app/_content/jobs.ts`. Comps:
`public/assets/pages/10-careers/screen-sizes/`. Reuses `SiteNav`, `Container`
and `SiteFooter`; **there is no `CtaBand`** — the last card runs into the
footer, as on `/article/[slug]`. Layout only: no new photography, no generated
assets, no `magick`.

**The background is `hero-sky` on `<main>`, not a wrapper.** Sampled down the
desktop comp's left gutter the gradient *is* the existing utility (`#A9D3FF` /
`#C9DFF4` / `#E8EBE7` / `#FFF4DF` at 0 / 37 / 74 / 100 %, within 1–2 levels of
`hero-sky`'s stops) — do not author a second gradient. It has to paint behind
the sticky bar, and a wrapper around `SiteNav` unpins the bar the moment the
wrapper scrolls off (the reason already recorded for the homepage sky). So
`main` is a *sibling* of the header, pulled up under it and padded back down:
`hero-sky -mt-[60px] pt-[60px] pb-[120px]`. `z-50` on the header keeps it over
the overlap and the 100 % stop lands on the footer's top edge, as in all three
comps. The 120px foot is measured — the dashed card → footer gap is 121px at
375, 800 *and* 1280, one of the few numbers this page holds constant.

**`@utility display-careers-title`** in `app/globals.css`: the article-title
sizes (36 / 64 / 80) with a much tighter, per-step leading — measured baseline
pitch **29 / 59 / 77**, i.e. 0.81 / 0.92 / 0.96 em, so the leading is authored
alongside each size rather than derived from one ratio. A separate utility
rather than `display-article-title` + `leading-*`, because two same-weight
utility classes on one element leave the winner to source order.

**The masthead is two `block` spans, not one `<br>`.** Line 1 is Newsreader and
line 2 Archivo — the page's one signature move, and what the comp draws
(verified on a 3× crop of `Desktop.png -crop 400x150+450+140`: Archivo's
flat-terminal `a` and the wordmark's `fi`, at a much lighter weight than the
extrabold footer wordmark). With both fonts on **one** line box Chrome unions
the Newsreader strut with the taller Archivo inline box and the pair runs 8px
past the authored leading (h1 measured 251 tall where 89 + 77 + 77 = 243). One
block per line puts each line box back at exactly the leading.

**The masthead padding and the title→list gap are fitted, and only these two.**
Everything below follows from the 16px card gaps. `pt-[66px] sm:pt-[89px]
lg:pt-[88px]` on the `h1` — the three are *not* one number because the cap-top
inset from the content box differs per step (+1 / −2 / −3 at 1280 / 800 / 375).
`mt-8` on the list: solving each breakpoint alone wants 30 / 33 / 32, and a flat
32 lands every card-1 top within 2px, so it ships as one token.

**`JobCard` got three edits** (`app/_components/cards.tsx`) — it existed for the
styleguide and `/careers` is its first real use:

1. **`p-6 sm:p-10`, not a flat `p-10`.** Measured content inset is 40 at 1280
   and 800 but **24 at 375**.
2. **`ring-1 ring-border sm:ring-0` dropped.** No comp ever showed it; the
   mobile comp goes straight from sky to white with no ring row. This also
   changes `/design-system`, which is the styleguide and should show what ships.
3. **New optional `action = "View role"` and `open = false`.**

**The dashed frame is an SVG, not `border-dashed`.** Measured on the comp's top
border at y 1010: **7px on / 9px off, pitch 16, solid `#000`, 1px, radius 16,
interior transparent** (the gradient reads through identically inside and out —
verified on the render too, `p{640,1120}` == `p{100,1120}`). CSS
`border-dashed` gives Chrome's own ~2/2 pattern at 1px and cannot be tuned.
`strokeWidth="2"` with the rect on the viewport boundary is deliberate: the SVG
clips the outer half, leaving exactly 1px, with no fractional `x="0.5"` /
`calc()` geometry browsers disagree on. Verified in the render — a single row of
ink at y 1036, runs 26–32 then 42–48.

`SiteNav`'s `Careers` item moved from `"#"` to `"/careers"`; Product and About
were still the only unbuilt destinations at the time (both are wired now — see
"Nav — Product points at the home page" below). Nothing else in `chrome.tsx`
changed.

### Measured against the comps

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| title line 1, cap top | 149 → **149** | 147 → **147** | 123 → **123** |
| card 1 | `820×218+230+332` → `+334` | `760×218+20+300` → `+299` | `335×276+20+216` → `335×320+20+216` |
| card 2 | `820×194+230+566` → `820×218+230+568` | `+534` → `+533` | `+508` → `+552` |
| card 3 | `820×218+230+776` → `+802` | `+768` → `+767` | `+800` → `+864` |
| dashed card | `820×194+230+1010` → `820×170+230+1036` | `760×170+20+1002` → `+1001` | `+1092` → `335×224+20+1200` |
| footer top | 1324 → **1326** | 1292 → **1291** | 1430 → 1544 |

Tablet is essentially exact everywhere. The deviations are the two already on
file plus one comp artefact:

- **Card role and body type.** The comp sets the desktop role at ~25px over a
  ~17px serif body; `--text-p1` / `--text-p2` are a fixed 20px and every settled
  page ships that way, so cards run larger and wrap differently — card 2 takes
  one extra line at 1280 (218 against the comp's 194), which is where card 3's
  +26 comes from. Mobile cards run 320/296/320/224 against 276/276/276/218, and
  that is the whole +114 at the footer. Same call as `/journal` and articles 1–6.
- **Title ink runs wide** — 341 / 392 at 1280 against the comp's 326 / 354 — the
  wide Archivo cut recorded for the article pages.
- **The desktop dashed card is 194 in the comp but 170 natural.** At 800 the
  same card measures 170 and its padding closes exactly on one body line; at
  1280 the designer appears to have reused card 2's 194px frame, leaving 24px
  unexplained. The natural height ships.

**Flag, shipped as drawn:** the open-application card carries a real role's meta
— "Full-time · Denver, CO" — which reads like comp placeholder left in by
mistake. The comp is the source of truth, so it ships; drop the line if the
designer confirms.

## Job listing page (`/job-listing/[slug]`)

`app/job-listing/[slug]/page.tsx` with its sections in
`app/_components/job/sections.tsx` and its prose in `app/_content/jobs.ts`.
Comps: `public/assets/pages/11-job-listing1/screen-sizes/` (Data Scientist);
`12-job-listing2` and `13-job-listing3` are the other two roles. Reuses
`SiteNav`, `Container` and `SiteFooter`; **there is no `CtaBand`** — the closing
call to action lives *inside* the white card, and the card runs into the footer
exactly as `/careers` does. Layout only: no generated imagery, no `magick`. The
only picture on the page is the seal, and it is drawn as SVG.

**The whole page is one white card on the `hero-sky` shell `/careers` already
uses** — `hero-sky -mt-[60px] pt-[60px] pb-[120px]` on `main` as a *sibling* of
the header, for the reason recorded there (a wrapper round `SiteNav` unpins the
sticky bar). The 120px foot is the same measured constant: the card→footer gap
is 121px at 375, 800 *and* 1280.

**The card is 335 / 720 / 820 wide, and tablet gutters are 40, not 20.** So the
cap is authored at `md` as well as `lg` (`md:max-w-[720px] lg:max-w-[820px]`)
rather than letting `Container` decide; mobile is the standard 335 + 20 and
desktop centres 820 in the 1232 content box, landing on the comp's x 230.
Padding is `p-6 sm:p-10` — 24 at 375, 40 at 800 and 1280, the same split
`JobCard` measures. **The card must not be `overflow-hidden`**: the seal
deliberately spills past its right edge onto the sky.

**The top Apply button is absolutely positioned, not a flex row.** The comp runs
the lede the full 740px content width *underneath* the button, not beside it;
putting the two in one `sm:flex … justify-between` row shortens the measure to
~600 and costs the lede a whole line — 24px that then propagates through the
entire card, and moves the seal with it. So the button is
`sm:absolute sm:top-10 sm:right-10` on a `relative` card, and drops back into
flow (`mt-6`, left-aligned on the content edge) at 375, which is what the mobile
comp draws.

**Derived spacing, one set of numbers at all three sizes**: 48px above and below
each rule, 52px between sections, 28px from a heading to its first line, 8px
between list items (the comp's 36px item pitch minus the 28px line). Everything
inside the card follows from these four — nothing else is fitted.

**`@utility display-job-h2`** in `app/globals.css`, for the role title and the
closing CTA heading: cap heights measure 17 / 22 / 28, i.e. exactly
`display-fluid-h4`'s 24 / 30 / 40, but the leading is 24 / 32 / 39 against that
utility's 1.1 (26.4 / 33 / 43.7). A separate utility rather than
`display-fluid-h4` + `leading-*`, for the reason `display-careers-title`
already records.

**The meta line is serif, not the mono `Meta` component** the `/careers` cards
use — verified on a 300 % crop of `Desktop.png -crop 400x80+265+240`. Set inline
as `font-serif text-p2 text-muted` with the system middot.

**The bullets are drawn.** Measured at 1280 the marker is a 4×4 dot 13px in from
the content edge with the text at 31px, 12px below the line box top; `list-disc`
cannot be pinned to that. So a `<span>` dot inside a real `ul`/`li`.

### Data shape

`Job` gains `slug` (the AGENTS.md slug rule: `"Data Scientist"` →
`"data-scientist"`). Prose is a separate `JOB_BODIES` map, keyed by slug, for the
reason `ARTICLE_BODIES` exists — `/careers` renders cards, not prose, and should
not ship copy it never draws. `WRITTEN_JOB_SLUGS` feeds `generateStaticParams`;
everything else `notFound()`s, so **`/job-listing/ux-designer` and
`/job-listing/product-manager` 404 by design** until comps 12 and 13 are built.

`JobBody.lede` is **optional and falls back to `Job.body`** — the comp's
standfirst is the card body verbatim, so the two cannot drift.

**Adding roles 2 and 3 is a pure data change**: one `JOB_BODIES` key each, no
components touched.

### Shared-component changes

- **`Seal` in `primitives.tsx`** — the company mark, one scaling SVG on
  `viewBox="0 0 283 144"`, nothing sized per breakpoint (the `JournalStamp`
  discipline). Three ellipses share `cx 141.5`, `cy 72` and one `ry` — so all
  three are tangent at the same top and bottom vertices — at `stroke-width 1.5`
  in `#2683EB`, which is exactly `--color-accent`, no new token. The ® is
  **drawn** (a ring plus a serif R) because Newsreader's ® glyph is not fittable
  at this size. **The whole mark is rotated +7°** — see "The seal's tilt" below,
  which supersedes the original upright numbers. **The /about founder's-story
  mark is a different drawing at a different angle and stays local to that
  page.**
- **`ButtonLink` moved from a bare `<a>` to `next/link`** so in-app destinations
  get client-side navigation. `BUTTON_BASE` is shared with `Button`, so the
  rendered class attribute is byte-identical either way.
- **`JobCard` gains optional `href`.** With one the action renders as
  `ButtonLink`; without one it stays the inert `Button` it is today. `JobList`
  passes an href **only for slugs in `WRITTEN_JOB_SLUGS`** — a link to a
  `notFound()` is worse than an inert button, the same rule `/journal` uses.
  Nothing else on `/careers` moves.

`/`, `/journal`, `/article/[slug]` and `/design-system` are **byte-identical**
prerendered HTML across this change (verified by diffing a build of `HEAD` in a
worktree against the working tree, normalising chunk hashes). `/careers`'
only diff is the Data Scientist card's `<button>` becoming an `<a>` with the
same class string.

### Measured against the comps

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1650+230+204` → `+1657` | `720×1762+40+204` → `+1748` | `335×2228+20+166` → `335×2746` |
| seal | `283×144+839+1399` → `276×144+841+1403` | `223×113+571+1524` → `218×113+574+1505` | not drawn |
| top Apply | `100×38+910+244` → `96×38+914+244` | — | `100×38+44+402` → `96×38+44+414` |
| closing Apply | `122×46+579+1768` → `+1775` | — | — |
| footer top | 1974 → **1981** | 2086 → **2072** | 2514 → 3032 |

Card x, y and width are **exact at all three**. The desktop interior is exact
too: every ink row — title, meta, both lede lines, the rule, all four headings,
all eleven body lines, all thirteen bullet lines, both CTA lines and the button
— lands within **7px**, most within 4, with identical line counts and identical
wraps.

Deviations, all inherited:

- **Mobile runs +518.** The comp sets the mobile lede at pitch 22 and the body
  at 25 (~17px type); `--text-p1` / `--text-p2` are a fixed 20px and every
  settled page ships that way. Same call as `/journal`, articles 1–6 and
  `/careers`.
- **Tablet runs −14**, because the shipped Newsreader wraps the lede to two
  lines where the comp takes three at the same 640px measure. The mirror image
  of the wide-Archivo note, on the serif.
- **The CTA heading breaks one word later** — "…build the future / of climate
  intelligence?" against the comp's "…build the / future of climate
  intelligence?". Both are two balanced centred lines; forcing the comp's break
  needs a max-width inside a 2px window, so it is recorded, not chased.
- **"Back to Careers" measures 165 wide against the comp's 142 / 142 / 131** —
  the 20px `--text-p2` floor again. Its ink sits 2px high at all three sizes;
  the card top below it is exact, so the padding is left alone.
- **Both Apply buttons measure 96 wide against the comp's 100**, the mono cut.
  The right edge is exact at 800 and 1280 and the left edge is exact at 375, so
  the button is pinned on the side the comp pins it.
- ~~**The seal's ink is 276 wide against the comp's 283.**~~ **Fixed** — see
  "Fix — the seal's tilt" below. The 7px was the missing rotation, not
  measurement noise; the seal now measures `283×144` against the comp's
  `283×143`.

**Flag:** **no comp gives either Apply button a destination.** The top one ships
as a `ButtonLink` to `#apply` (the CTA block carries `id="apply"`) so it does
something honest; the closing one ships inert, exactly as the `/careers`
open-application card's "Apply now" does today. Both want a real application URL
or `mailto:` once one exists.

### Role 3 — Product Manager (`/job-listing/product-manager`)

**A pure data change, as promised above.** One `JOB_BODIES` key from
`public/assets/pages/13-job-listing3/screen-sizes/` — same four sections
(Company description / About the role / Requirements / Company benefits, two
`body` and two `items`), same closing CTA, `lede` omitted so it falls back to
`Job.body`. **No component, utility or asset touched.** Company description and
Company benefits are byte-identical to the Data Scientist entry because the comp
repeats them verbatim; keep the two in step. Adding the key is what puts
`product-manager` in `WRITTEN_JOB_SLUGS`, which turns the `/careers` card's
action into a `ButtonLink` and adds the slug to `generateStaticParams`.

**`/job-listing/ux-designer` was the one slug still 404ing** at the time this
was written; it is built below.

Prerendered HTML is **byte-identical** for `/`, `/journal`, all six articles,
`/design-system`, `/about` and `/job-listing/data-scientist` — verified by
building the working tree twice, once with `jobs.ts` reverted and once with the
new key, and normalising the CSS chunk name and the build id. That isolates
*this* change; it holds nothing else in the tree fixed. `/careers`' only diff is
the Product Manager card's `<button>` becoming an
`<a href="/job-listing/product-manager">` with the same class string.

#### Measured against the comps

**These numbers were taken against a working tree that already carried the
bottom-anchored `Seal` refactor** (the `relative` wrapper around the whole prose
block in `job/sections.tsx`), not against `dd13557`'s top-anchored seal. Every
seal figure below therefore describes the bottom-anchored behaviour.

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1842+230+204` → `820×1685+230+204` | `720×1902+40+204` → `720×1800+40+204` | `335×2428+20+166` → `335×2826+20+166` |
| seal | `281×143+840+1591` → `274×144+842+1431` | `221×112+572+1664` → `216×113+575+1557` | not drawn |
| top Apply | `100×38+910+244` → `96×38+914+244` | `100×38+620+244` → `96×38+624+244` | `100×38+44+402` → `96×38+44+438` |
| closing Apply | `122×46+579+1960` → `+1803` | `122×46+339+2020` → `+1918` | `121×46+127+2516` → `122×46+127+2922` |
| footer top | 2166 → 2009 | 2226 → 2124 | 2714 → 3112 |

Card x, y and width are **exact at all three**, and the card→footer gap is 120px
in both the comp and the render at all three — the measured constant `/careers`
and job listing 1 already record. Both Apply buttons' x is exact at every size
(96 against 100 wide is the mono cut, already on file).

Deviations, all inherited or comp-side:

- **The desktop card runs −157 and the tablet −102, and it is comp-side air, not
  a layout drift.** Comp 13 draws **214px** between the last benefits bullet and
  the closing rule where the layout gives the `Rule`'s own 48 — and comp 11
  measures 46 at exactly the same place (last bullet ink ends 1564, rule ≈1610).
  So comp 13 alone carries ~166px more air there. **The seal anchoring is not
  the cause and was not changed**: it holds seal-bottom → closing-rule at 69px
  against comp 13's 74, the same invariant fitted on comps 11 and 12. What
  differs is that comp 13's designer drew the seal *below* the benefits list
  (1591–1733, clear of the last bullet at 1588) where comp 11 overlaps it. Same
  call as article 6's −216. Record, don't chase.
- **The desktop lede wraps to two lines where the comp takes three**, at the same
  740px measure — the shipped Newsreader cut, the mirror of the wide-Archivo
  note. Job listing 1 records this on tablet; this role's lede is longer, so it
  reaches desktop.
- **Two Requirements bullets wrap where the comp wraps one** ("Familiarity with
  sustainability…" takes a second line), +28. Same font-cut cause.
- **Mobile runs +398** on the fixed 20px `--text-p1` / `--text-p2` floor, which
  also puts the mobile top Apply 36px low (`+438` against `+402`) — one extra
  lede line above it.
- **The CTA heading breaks one word later**, "…build the future / of climate
  intelligence?" against the comp's "…build the / future of climate
  intelligence?" — the identical drift already recorded for job listing 1.

Everything else on desktop is line-for-line: identical headings, identical body
line counts and wraps through both prose sections, identical bullet order.

### Role 2 — UX Designer (`/job-listing/ux-designer`)

One `JOB_BODIES` key from `public/assets/pages/12-job-listing2/screen-sizes/`
plus **one shared-component fix** — the seal's anchoring. With it, all three real
roles have prose, so no `/careers` role card links at a 404; the
open-application card has no listing page by design and keeps its inert action.

The comp is the same page at the same geometry: card `820×1522+230+204`, rules
at y **459** and **1487**, footer top **1846** — the same 120px card→footer gap.
`lede` is omitted so it falls back to `Job.body`. Company description is verbatim
identical to the Data Scientist entry and is **transcribed again rather than
shared**: `JOB_BODIES` is per-slug copy, and a shared constant would invite
editing one role's boilerplate and silently moving the other's.

**"Company benefits" is a paragraph here, not a list** — the only shape
difference across the three listings, and the whole reason for the fix below.

**The `Seal` is bottom-anchored to the prose block, not top-anchored to the last
list.** It used to render *inside* the `items` branch of the last section, so on
this comp — whose last section has `body` — it would not have rendered at all.
It now sits once, outside the `sections.map`, in a single `relative` wrapper
around the whole prose block. (The offsets recorded here — `bottom-[55px] …
lg:bottom-[24px]` — were later moved by the user's reference; see "Fix — the
seal's offsets" below. The *anchoring* is unchanged.)

**Bottom-anchoring is measured, not chosen.** Seal bottom minus closing rule is
**−73px on all three desktop comps** (11: 1542/1615, 12: 1414/1487, 13:
1734/1807) even though the prose above it differs in length and in shape. Top-
anchoring cannot fit that: held at the old `top-[36px]` against comp 12's last
*list* it lands ~180px high. `left-[76.8%]`, the widths, `pointer-events-none`,
`hidden sm:block` and the spill past the card's right edge are unchanged — the
seal is still drawn outside the card, so nothing in that chain may become
`overflow-hidden`.

The move is worth ~4px on the settled Data Scientist page and improves it:
desktop `+841+1403` → `+841+1404` against the comp's `+840+1399`, tablet
`+574+1505` → `+575+1509` against `+572+1524`.

#### Measured against the comps

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1522+230+204` → `820×1533+230+204` | `720×1666+40+204` → `720×1677+40+204` | `335×2113+20+166` → `335×2618+20+166` |
| seal | `282×143+840+1271` → `276×144+841+1280` | `221×112+572+1428` → `217×113+575+1437` | not drawn |
| top Apply | `100×38+910+244` → `96×38+914+244` | `100×38+620+244` → `96×38+624+244` | `100×38+44+402` → `96×38+44+438` |
| closing Apply | `122×46+579+1640` → `+1651` | `122×46+339+1784` → `+1794` | `121×46+127+2201` → `122×46+127+2714` |
| footer top | 1846 → **1857** | 1990 → **2000** | 2399 → 2904 |
| page height | 2434 → 2456 | 2500 → 2479 | 2781 → 3255 |

Card x, y and width are **exact at all three**, and the card→footer gap holds at
120px in comp and render at every size.

Deviations, all already on file:

- **Desktop and tablet run +11**, one line's worth, and it lands on every row
  below it — card bottom, closing Apply, footer. The mono/serif cuts, not a
  spacing error.
- **Mobile runs +505** on the fixed 20px `--text-p1` / `--text-p2` floor, which
  also puts the mobile top Apply 36px low (`+438` against `+402`) from one extra
  lede line above it. Same call as `/journal`, articles 1–6, `/careers` and the
  other two listings.
- **Both Apply buttons measure 96 wide against the comp's 100** — the mono cut.
  x is exact at every size.
- ~~**The seal's ink is 276 wide against the comp's 282**, height and x exact.~~
  **Fixed** — the missing rotation; see "Fix — the seal's tilt" below.
- **The tablet footer measures 479 tall against the comp's 510**, which is why
  the page runs −21 there while every row above the footer runs +10. Pre-
  existing and shared with every page.

**Flag, unchanged:** no comp gives either Apply button a destination, so this
role inherits the same `#apply` top link and inert closing button. Both still
want a real application URL or `mailto:`.

Prerendered HTML for `/`, `/journal`, `/design-system`, `/about` and the articles
is **identical** across this change apart from the CSS chunk name and the build
id — verified against a worktree build of the parent commit. `/careers`' only
diff is the UX Designer card's `<button>` becoming an
`<a href="/job-listing/ux-designer">` with the same class string.

### Fix — the seal's tilt (`Seal` in `primitives.tsx`)

**The mark shipped upright; all three comps draw it rotated.** It is now one
`<g transform="rotate(7 141.5 72)">` around a symmetric drawing, the discipline
`AetherfieldSeal` on /about already follows. Nothing else on the page moved —
the seal is absolutely positioned, so no layout row shifted.

**How the first cut missed it.** The original fit measured the three ellipses'
**mid-height chord** (absolute x 842/883/920 and 1039/1076/1117, symmetric about
979.5) and read those half-chords as `rx`. **A mid-height chord cannot reveal a
tilt**: an ellipse is centrally symmetric, so the chord at `y = cy` is centred on
`cy` for *any* rotation. It only pins `a` once θ is known. The two "asymmetries"
the fit then baked into the type — `data` set 31px below `tech`, the ® set 7px
left of the wordmark's axis — were the rotation showing up in the one place the
chord measurement could not explain it.

**The measurement that does reveal it: the outer ellipse's extreme-x points.**
Isolate the mark (`-fuzz 28%` around `#2683EB`, threshold, negate) and take the
min/max-x columns' vertical midpoints. On all three desktop comps the ink bbox
is `283×143` with the left tip at `y 87.5` and the right at `y 113` — **25.5px
of drop across the mark**, i.e. right-hand side low, a *positive* (clockwise) SVG
rotation. Tablet measures `222×113` with a 20.5px drop, the same slope at
0.7845×. Comps 11, 12 and 13 are byte-identical here.

**Solving for the geometry.** For semi-axes `a`, `b` rotated θ, the ink half-box
is `√(a²cos²θ + b²sin²θ)` × `√(a²sin²θ + b²cos²θ)`, and the extreme-x point sits
at `t` where `tan t = −(b/a)tanθ`. Those three equations in `a`, `b`, θ solve
cleanly — but they are **sensitive**: ±1px on the measured tip drop moves θ by
±0.5° (12.0 → 6.43°, 12.75 → 6.81°, 13.5 → 7.20°). Two independent type
constraints break the tie: un-rotating the fitted type so `tech` and `data` land
on one line gives **7.25°**, and so `earth` and the ® land on one vertical axis
gives **7.13°**. The mark therefore ships at **7°**, with `a` and `b` solved
exactly there.

Shipped numbers, all on `cx 141.5`, `cy 72`, `ry 69.13`:

| | outer | middle | inner |
| --- | --- | --- | --- |
| comp extreme-x (local) | 29 | 72.5 | 109.5 |
| `rx` | 141.55 | 97.11 | 59.60 |
| predicted mid-height chord | 138.5 | 96.4 | 59.7 |
| measured mid-height chord | 137.5 | 96.5 | 59.5 |

The last two rows are the check, not the fit: the chord the first cut measured
falls out of the rotated solution to within a pixel, so both readings of the comp
are satisfied at once.

**The type is symmetric in the unrotated frame**, which is the tell that the comp
is one rigid rotation rather than a hand-tilted ellipse set. Un-rotating the
previously fitted anchors by −7° about `(141.5, 72)` puts `earth` at x 140.87,
the ® at 140.64, `Aether` at 141.64 and `field` at 141.83 — one axis, ~141.5 —
and `tech`/`data` at y 76.94 / 78.04, one line. It also independently confirms
the wordmark: the comp sets `field`'s ink centre **3px left of `Aether`'s**
(168.5 against 171.5), and 26px of line pitch × sin 7° = 3.17. The first cut had
both at the same x, so `field` was ~3.5px right of the comp. Shipped anchors:
`tech (18.8, 77.5)`, `data (264.2, 77.5)`, `earth (141.5, 21.7)`,
`Aether (141.5, 64.9)`, `field (141.5, 91.1)`, ® ring `(141.5, 126.5)`.

**The tablet width is now `222px`, not `223px`.** The upright mark drew 276 ink
in a 283 box, so the tablet width was padded to make the ink land near the comp's
221. The rotated mark's ink fills its box exactly, so the width *is* the ink
width, and the comp measures `222×113`. `lg:w-[283px]` is unchanged.

#### Measured against the comps

| | desktop comp → render | tablet comp → render |
| --- | --- | --- |
| seal box | `283×143+839+1399` → `283×144+838+1404` | `222×112+572+1524` → `222×113+572+1509` |
| tip drop | 25.5 → **25.5** | 20.5 → **21.0** |

**Size is exact at both breakpoints and tablet x is exact** (desktop x is 1px,
inside the `Container` gutter already on file). The previously recorded −7px on
the seal's width is gone — it was the missing rotation, not measurement noise, so
strike that line from job listing 1's deviation list. A channel overlay of render
against comp at `300x160+830` traces both marks within 1–2px everywhere, with the
® landing exactly. Vertical placement is unchanged from the bottom-anchored fit
(`+1404` against `+1399`); that was not touched.

Only `/job-listing/[slug]` renders `Seal`, so `/`, `/journal`, `/about`,
`/careers`, `/design-system` and the articles are untouched by this change.

### Fix — the seal's offsets (`bottom-[73px] left-[75.95%] lg:bottom-[42px]`)

**This one is fitted on a user-supplied reference, not on the comps, and it
overrides the −73px invariant recorded above.** Reference:
`~/Pictures/Screenshots/Screenshot_20260805_113838.png`, a 1263×575 window of
the Product Manager listing. Only the offsets moved — the bottom-anchoring, the
widths, `pointer-events-none`, `hidden sm:block` and the spill past the card's
right edge are all unchanged.

**The reference is not a comp export, and identifying that is the whole
measurement.** It renders at viewport 1263 (card `820+221`, which is
`24 + (1215−820)/2` — the render's own geometry, not the comps' `+230` at 1280),
so it is unscaled and directly comparable to a 1263-wide screenshot of ours. But
its benefits list runs at a **28px item pitch** where ours runs 36, and its
closing CTA breaks as `…build the / future of climate intelligence?` — both the
comps' ~17px body, not the shipped 20px `--text-p2`. So it is a faithful
implementation of the design, and its prose block is **44px shorter** than ours
for identical copy. **That difference is not fixable here** and is the same
`--text-p2` floor already recorded for every page since the article; do not try
to close it by moving the seal.

**What is fixable is the seal's two offsets**, and both are measured against the
card and the closing rule, which are scale-free landmarks:

| | reference | before | after |
| --- | --- | --- | --- |
| seal left − card left | 602 | 608 | **602** |
| seal bottom → closing rule | 91 | 73 | **91** |

`left-[76.8%]` → `left-[75.95%]`: the offsets resolve against the prose wrapper,
which is the card minus its `p-10`, i.e. 740 wide at `lg`, so 602 from the card
edge is `(602 − 40)/740 = 75.95 %`. `lg:bottom-[24px]` → `lg:bottom-[42px]` is
the same +18 as the gap.

**Tablet moves by the same +18 (`bottom-[55px]` → `bottom-[73px]`), and that is
an inference, not a measurement** — the reference is desktop-only. +18 rather
than 18×0.7845 because the prose leading that sets the vertical rhythm is the
same at both breakpoints; only the mark scales. Revisit if a tablet reference
turns up.

#### Measured after the change

All three listings, production build:

| | 1280 | 800 |
| --- | --- | --- |
| seal left − card left | **602** (x 832, card 230) | **526** (x 566, card 40) |
| seal bottom → closing rule | **91** | **122** |

Identical on Data Scientist, UX Designer and Product Manager — the anchoring
still holds one invariant across three differently shaped prose blocks, which is
the property the original fit was chosen for. Against the reference at 1263, the
seal lands at `+824+247` where the reference has `+823+247` (cards at 222 and
221), and the closing rule at 481 against 479 — i.e. **both offsets exact.**

For the record, the comps' own numbers are 609 / 73 (desktop) and 532 / ~107
(tablet); the shipped values now sit 7 left and 18 high of those. That is a
deliberate override on the user's reference.

## About page (`/about`)

`app/about/page.tsx` with its sections in `app/_components/about/sections.tsx`
(`AboutHero`, `Values`, `FounderStory`, `TeamTable`). Reuses `SiteNav`,
`Container`, `CtaBand` and `SiteFooter`. From
`public/assets/pages/09-about/screen-sizes` (1280×4216 / 800×4041 / 375×4774).

**The desktop sky band is half-width**: `632×800 +0+0` on the 1280 artboard —
**49.375 %** — with the mission column on plain white beside it. Mobile and
tablet run it full-bleed at `375×320` and `800×480`. Like the homepage's band it
is a **document-level `absolute inset-x-0 top-0 -z-10` sibling**, not a child of
a `relative isolate` wrapper: `SiteNav` is sticky and unpins at the bottom of any
positioned ancestor. Sampling the gradient at 0/25/50/74/99 % of each band, all
three artboards pass through exactly `#D3E3EF` at 50 % and the desktop band runs
`#AAD4FE → #FEF4DF`, which is `hero-sky` to within a level; the tablet and mobile
artboards compress the range around that midpoint (feet `#E8EBE7` and `#F0EEE4`
against the token's `#FEF3DF`). **The shared token ships and the drift is
recorded** — a second sky utility for one page is not worth it.

**`AboutHero` carries `-mt-[60px]`.** The comps measure the band from the top of
the artboard and centre the card in it, but `SiteNav` is sticky and takes 60px of
flow, so without the pull-up the card and the mission column both sit 60px low.
The bar is transparent glass over the band, exactly as the comp draws it.

**The Forecast card is one `@container` panel, not a per-breakpoint layout.**
Its box is `269×96 +53+112` / `574×204 +113+138` / `460×164 +86+318` against the
three bands — `(375−269)/2 = 53`, `(320−96)/2 = 112`, exact at all three
horizontally and vertically — i.e. **71.8 % of the band width at a constant 2.80
aspect, centred**. So it is sized in `cqw` with every interior dimension in `em`
against a `1cqw` root, the rule `HeroDashboard` already follows. Interior,
measured off `Desktop.png -crop 560x230+60+290`: square photo at 31.3 % of the
card width inset 2.17 %, 4.35 % gap to the text, pill 78×24 with 55px of ink,
headline 20/22, footer line ~12px mono. Behind it sit **two sheets**, inset
3.0 % and 6.1 % per side and peeking 3.04 % each below the card.

The markup started from `home/dashboard.tsx`'s Forecast tile but is a **copy, not
an import**: that tile is a fixed-height grid cell inside the hero mockup and
this is a standalone panel with a different aspect and an extra footer line.

**`em` on the element that sets `font-size` resolves against the new size.** The
pill's padding is therefore in its own em (`px-[0.97em]`), not the card's — a
`px-[2.5em]` meant as "2.5cqw" came out 2.5× too wide. Everything else in the
card is on an element that only inherits `1cqw`, so `em` there is `cqw`.

**Shared data and one new prop:**

- **`PRINCIPLES` is exported from `home/sections.tsx`** and consumed by "Our
  values" verbatim — same titles, bodies and icons. Only the heading, section
  background and card fill differ.
- **`CtaBand` takes `tone?: "surface" | "white"`**, defaulting to `"surface"`.
  `/about` passes `"white"`: the team panel above it is already a surface block
  and the comp keeps the two reading as separate blocks.
- **`primitives.tsx` gains `ButtonLink`** — the `Button` look on a link, for
  "Meet the team" → `#team`. The shared classes moved into a `BUTTON_BASE`
  constant and the bullet into a `Bullet()` so the two elements cannot drift.
- `NAV_ITEMS`: About → `/about`. Product was the last item still on `"#"`; it
  now points at `/` (see "Nav — Product points at the home page").

**`AetherfieldSeal` is local to this page and is *not* `primitives.Seal`.** The
job-listing seal has all three ellipses tangent at one top and one bottom vertex
and sets "earth" right of the ® with "tech" above "data". This comp draws
neither: its ellipse apexes are 17px apart and its type is symmetric about one
axis. Two different marks, not one mark at two angles.

It is fitted against `Desktop.png -crop 300x170+0+1320`. The ellipses are not
axis-aligned there — the horizontal chord midpoints drift with y, "data" sits
30px above "tech", "earth" 15px left of the ®. All of it is **one rotation**: the
earth/® pair gives 7.4°, the tech/data pair 6.7°, and un-rotating the landmarks
by 6.6° about page (128, 1408) puts earth and ® on one vertical axis (x 148.5 ±
0.4) and tech/data on one horizontal (y 76.0 / 76.1). So the mark is drawn
symmetric on `viewBox="0 0 300 160"` and rotated **-6.6°**: centre (150, 80),
radii **150×78 / 102×72 / 63×60** from the y=1400 chords and the apexes at
x=128 — widest is flattest. The rotated bbox is 298.6×158.8, which is why the
viewBox is 300×160 and the mark's left edge lands ~22px left of the page gutter,
clipped as the comp shows. **Dropped below `md`** — `Mobile.png` draws the
portrait with no mark over it — and re-placed rather than re-scaled on tablet
(0.807, measured off its "Aether").

### `about-founder.png`

`public/assets/images/Image-1.png` as a blue halftone cut-out with a rough white
ring, over the **hero sky gradient** rather than cream. 12 KB.

```
SRC=public/assets/images/Image-1.png
# 1. silhouette — backdrop cut, floodfilled from the top-left corner, then placed
magick $SRC -alpha off -colorspace Gray -threshold 62% \
  -morphology Close Disk:3 -morphology Open Disk:3 -type TrueColor \
  -fill red -draw "color 3,3 floodfill" -fill black +opaque red -fill white -opaque red \
  -colorspace Gray -depth 8 -negate PNG24:subj.png
magick -size 612x700 xc:black \( subj.png -resize 665x690! \) -geometry +0+10 -composite \
  -colorspace Gray -depth 8 PNG24:sil.png
# 2. ink
magick -size 612x700 xc:white \( $SRC -alpha off -colorspace Gray -resize 665x690! \) -geometry +0+10 -composite \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a +level-colors '#2683EB','#FFFFFF' PNG24:ink.png
# 3. field — hero-sky over 700px, with the white cut-out ring
magick \( -size 612x259 gradient:'#ABD4FE-#C8DFF3' \) \( -size 612x259 gradient:'#C8DFF3-#E9EBE7' \) \
       \( -size 612x182 gradient:'#E9EBE7-#FEF3DF' \) -append PNG24:sky.png
magick sil.png -morphology Dilate Disk:22 -blur 0x9 -ordered-dither h4x4a \
  -colorspace Gray -depth 8 PNG24:ring.png
magick sky.png \( -size 612x700 xc:white \) ring.png -composite PNG24:field.png
# 4. composite
magick ink.png field.png \( sil.png -negate \) -composite \
  -colors 64 -define png:compression-level=9 public/assets/generated/about-founder.png
```

Load-bearing details:

- **The field is `hero-sky`, verified not assumed.** The comp's portrait corners
  measure `#A8D3FF` top and `#FEF3DF` bottom-right, and `(5,350)` — 50 % down —
  measures `#D3E3EF` against the token's `#D4E3EF`. So the three-segment gradient
  above is the utility rendered to 612×700, and `#2683EB` is `--color-accent`;
  no new tokens.
- **The comp is not a crop of the source — it is a free transform**, as articles
  2 and 3's heroes are. A crop can only ever keep ≥87 % of a 768 square at this
  aspect, and the best crop scores 0.19 XOR against the comp's silhouette. The
  honest model is scale-and-place: the source at **665×690 (non-uniform) placed
  at +0+10** on the 612×700 canvas, found by sweeping coarse → fine → fine on the
  **end-to-end metric** — generate the candidate through the full recipe, blur
  and downsample both to 124×142, RMSE. 0.208 → 0.101 → 0.081 → **0.070**.
  Verified independently against the comp's own ink boundary, which is the strong
  check: first/last ink pixel per row lands at 139/138, 129/129, 122/122, 87/93,
  30/33, 1/1 and 443/449, 469/473, 489/489 at y 150…650.
- **Do not fit the crop on the comp's ink mask.** The subject's lit side is
  almost pure white in the comp, so an ink threshold cuts the silhouette short on
  the right; that fit lands 30 % small and looks it. Use the end-to-end metric.
- **The ring is `Dilate Disk:22` then `-blur 0x9 -ordered-dither h4x4a`.** The
  comp's ring is a white band ~30px wide (normal) whose *outer* edge fades into
  the sky as a dot gradient, not a torn silhouette — thresholding a blurred mask
  against smoothed noise produces lumpy scallops the comp does not have. Fitted
  on ring width and ring-area fraction; end-to-end RMSE is flat (0.0703 / 0.0704
  / 0.0708) across `Disk:20…34`, so it cannot choose the radius.
- **`-alpha off` first, `-type TrueColor` before the floodfill**, and
  `-colors 64` — the three rules articles 2 and 3 already record.

**Known deviation — the comp's ring is a hand-drawn straight-edged shape.** Ours
is an offset of the silhouette, so it follows the hair's curve where the comp
runs a chord across it. Everything else — framing, dot texture, palette, ring
width and softness — matches.

### Measured against the comps

Production build, 375 / 800 / 1280, comp → render:

| | mobile | tablet | desktop |
| --- | --- | --- | --- |
| sky band | 320 → **320** | 480 → **480** | 800 → **800** |
| Forecast card | `269×96+53+112` → **exact** | `574×204+113+138` → `574×206+113+137` | `460×164+86+318` → `454×162+89+319` |
| portrait | `335×376+20+1587` → `335×383+20+1652` | `372×425+20+1798` → `372×425+20+1805` | `612×700+20+1406` → `612×700+24+1438` |
| team panel top | 2290 → 2459 | 2306 → 2310 | 2226 → 2258 |
| page height | 4774 → 5242 | 4041 → 4129 | 4216 → 4279 |

Values cards render `400×276` at x 24 / 440 / 856, y 1002 against the comp's
`403×246` at x 20 / 439 / 857, y 1000 — the 3px and the 4px are `Container`'s
24px desktop gutter, already recorded for the article page, and the card top is
exact. The mission column is the closest part of the page: eyebrow at 233…246
and button at 524…569 against the comp's 233…246 and 525…570.

Deviations, all recorded rather than chased:

- **The 48px icon.** The comp draws 42px of ink in the values cards; `size-12`
  with the shared `PRINCIPLES` icons draws 40, and the extra box makes the cards
  30px taller than the comp's 246. Matching would mean either a bespoke icon
  size here or moving the homepage's identical cards.
- **`display-band-h2` runs large on this comp.** "Meet the team" and "Eunji Park"
  both measure cap 39 at 1280 (≈55px type) where the utility steps to 60 (cap
  44); tablet measures 34 against the utility's 50 → 35.7, mobile 24 against
  32 → 22.9. Two of three steps agree; the desktop one does not. A fourth
  heading curve for one page is not worth it.
- **The tablet mission headline** measures cap 25 (≈35px) against
  `display-fluid-h4`'s 30, and its line pitch 32 against the utility's 33.
- **`CtaBand`'s fixed `py-[110px]`** gives 337 / 357 at tablet and mobile where
  the comp draws 269 / 206. The component is settled and shared with `/` and
  `/journal`; changing its padding is a decision for those pages, not this one.
- Mobile runs 468px long overall, the 20px `--text-p1` / `--text-p2` floor
  already recorded for every page since the article.

`/`, `/journal` and `/careers` are **pixel-identical** before and after at all
three breakpoints (`magick compare -metric AE` = 0 against a worktree build of
the parent commit) — the `PRINCIPLES` export and the `CtaBand` prop are inert.
The sticky bar still pins on `/about` past the fold at all three widths.

## Homepage motion (`/` only)

GSAP, on the homepage and nowhere else. Two reference recordings in
`public/design-ref/animation-ref/`: `landing.webm` (three passes over `/` at
desktop, tablet and mobile) and `chart.webm` (a generic bar chart). Prompt 17.

**The vocabulary is small and identical at every breakpoint**: fade in and
rise, per-element stagger in reading order, ~0.6 s each with ~0.1 s between
siblings, decelerating, **once, on enter**. Nothing scales, blurs or rotates;
nothing reverses on scroll-up; nothing is scrubbed. **No pinning, no parallax,
no horizontal scroll, no `ScrollSmoother`** — the recording contains none of
them and they would fight the sticky navbar. `DUR` and `EASE` live in
`motion/register.ts` so the chart and the page reveals cannot drift apart.

### The component split

`home/sections.tsx` was 444 lines holding six sections, `Container`,
`PRINCIPLES` and a private `JournalMark`. It is now one file per section —
`container` / `hero` / `dashboard` / `emissions-chart` / `capabilities` /
`principles` / `principles-data` / `case-study` / `journal` / `testimonial` —
with `sections.tsx` left behind as a **barrel**, which is what `app/page.tsx`
imports.

**Nothing outside `home/` may import the barrel, and that is a bundle rule, not
a style one.** The barrel reaches every section, the sections reach the
client-side `Reveal`, and Next's client-reference graph follows: with the five
unrelated pages still importing `Container` through `home/sections`, **every
route's prerendered HTML gained the homepage's 118 KB GSAP `<script>`** —
measured on `/careers`, `/about`, `/journal`, all six articles and all three job
listings. So `/journal`, `/careers`, `/job-listing/[slug]`, `article/sections`
and `about/sections` import `home/container` directly, and `/about` imports
`PRINCIPLES` from **`home/principles-data`**, a component-free module that
`principles.tsx` re-exports.

That last file is the one addition prompt 17 did not anticipate: `PRINCIPLES`
could not stay in `principles.tsx` once that file imported `Reveal`, or `/about`
would keep pulling GSAP in for a plain array. Same discipline as `chrome.tsx`
inlining `CONTAINER` rather than importing it.

With the leaf imports in place, **`/` is the only route whose prerendered HTML
changes at all** — verified against a build of the parent commit, normalising
the build id and the CSS chunk name.

### The chart — `from: "edges"`

`HeroDashboard`'s "Carbon emissions trend" block moved into
`home/emissions-chart.tsx` as the panel's **only** client module; the three stat
tiles keep their `next/image` and stay server-rendered. `BARS`, `PEAK`,
`Y_TICKS` and `MONTHS` moved with it and the markup, class strings and
`em`-on-`1cqw` sizing are unchanged — the panel's proportional scaling is
load-bearing.

One timeline: gridlines `scaleX 0→1` from `left center` (stagger 0.06,
top-to-bottom), then the 33 bars `scaleY 0→1` from `bottom center`, then the
`220` pill fades and rises.

- **`stagger: { amount: 0.9, from: "edges", ease: "power1.inOut" }`.** GSAP's
  advanced-stagger `from` takes `"start" | "center" | "edges" | "end" |
  "random" | <index>`; `"edges"` starts at both ends of the target array at once
  and converges on the middle, which is exactly the user's ask. Do not hand-roll
  it with an index function. `amount` rather than `each` so the run length is
  authored once and does not drift with the bar count. **Verified in the render**
  — 0.56 s in, bars 0–3 and 29–32 read scaleY 0.15/0.13/0.09/0.04, symmetric,
  everything between still 0.
- **Never animate `height`.** The bars' heights are inline `em` values driving
  layout; `scaleY` is a compositor transform and leaves layout alone.
- **The pill is a sibling of the scaled bar, not a child** — both sit inside the
  `relative flex-1` wrapper — so scaling the bar cannot distort it. Confirmed in
  the render; no restructuring was needed.
- **The trigger is `start: "bottom bottom", once: true`, and it is measured.**
  At scroll 0 the panel's top/bottom edges sit at 585/687 (375), 651/879 (800)
  and 743/1031 (1280). The bottom edge is below the fold at each breakpoint's
  nominal height, so one value gives the user's ask everywhere: nothing fires on
  load, the bars run as the chart scrolls in. Verified — all 33 bars still read
  scaleY 0 after 1.2 s at scroll 0.

### `Reveal` — the page reveals

`app/_components/motion/reveal.tsx`:

```tsx
<Reveal>            {/* animates itself */}
<Reveal stagger>    {/* animates its [data-reveal-item] descendants, in order */}
```

Props: `as`, `stagger`, `delay`, `start` (default `"top 88%"`), `y`, `immediate`
(play on load — the hero, which is above the fold) and `className`.

**`className` and `as` exist so the reveal takes an existing wrapper over rather
than adding a box.** Every section renders `<Reveal as="section" stagger
className="…">` in place of its own `<section>`, so **no layout row moves**:
`/` is pixel-identical to the parent commit in the settled state at 375, 800 and
1280 (`magick compare` finds no pixel over a 5 % threshold at any of the three;
page heights 6350 / 6006 / 5595 unchanged).

**Server sections stay server components.** `children` arrive as a prop, so
`Capabilities`, `Principles`, `CaseStudy`, `Journal` and `Testimonial` keep
their `next/image` and never join the client bundle. **Do not add `"use client"`
to a section file.** `CtaBand` is wrapped **at the call site in `app/page.tsx`**
so the band animates on `/` only — `chrome.tsx` is not edited, and the footer is
not animated at all.

**The hero's two title lines are two `<span className="block">`s, not a `<br>`,**
so they are separately targetable. Both are the same Newsreader face, so the
mixed-font line-box union recorded for the `/careers` masthead does not apply —
verified: the h1's ink does not move at any of the three breakpoints.

### The flash-of-final-state problem, and why `clearProps` is forbidden

The server sends the sections visible and the browser paints them; `useGSAP`
runs in a layout effect, which is before *React's* paint but after the *initial
document* paint on a prerendered page. So the hidden start state is authored in
`globals.css`, not in JS:

```css
@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {
  [data-reveal], [data-reveal-item], [data-chart-pill] { opacity: 0; }
  [data-chart-bar] { transform: scaleY(0); transform-origin: bottom center; }
  [data-chart-grid] { transform: scaleX(0); transform-origin: left center; }
}
```

`scripting: enabled` survives Tailwind v4 / Lightning CSS into the built
stylesheet — checked in `.next/static/chunks/*.css`. With JavaScript off, or
reduced motion requested, the rules never apply and the page is simply at rest.

**No reveal tween may `clearProps` opacity or transform** — that hands the
element back to these rules and it vanishes.

### `matchMedia`

`gsap.matchMedia()` carries both the breakpoint and the accessibility split.
Desktop rises 36 px, below `lg` two thirds of that — the recording's mobile pass
travels a visibly shorter distance, which is also right for a 375 viewport.

**A `matchMedia` handler only runs while at least one of its conditions
matches**, so a lone `(prefers-reduced-motion: reduce)` query would never fire
for anybody else. Both halves are named — `reduceMotion` *and* a complementary
`fullMotion` / `isDesktop` + `isMobile` pair. The reduce branch sets the final
state and returns; verified at 1280 that **0 of 29 reveal targets sit below full
opacity and every bar reads scaleY 1**, under `reduce` and with JavaScript
disabled alike.

`useGSAP(() => {…}, { scope: ref })` everywhere, with `gsap.registerPlugin`
called once at module scope in `motion/register.ts` — never in render — and
`mm.revert()` returned as cleanup. No `markers: true` in committed code.
ScrollTriggers are created in page order naturally, so no `refreshPriority`.

**`SplitText` was considered and rejected.** It is free as of GSAP 3.13 and
would be the idiomatic way to stagger the two headings per line, but it mutates
the DOM after hydration; the two headings that need splitting carry authored
spans instead.

**`motion@^13` is in `package.json` and is unused by this work.** The homepage
is GSAP throughout. Do not mix the two libraries on one page.

# Content and asset conventions

**Photography comes from `public/assets/images`.** Every image a page needs is
sourced from that folder and treated in-repo into `public/assets/generated` when
the comp shows a duotone, halftone or crop, with the exact `magick` command
recorded here. Cropping artwork straight out of a comp is a fallback for when
the source photograph genuinely is not in that folder (as with
`article-climate-hero.png`), not the default.

**An article title referenced by its image or its comp is a slug.** When the
user points at an article by title or by pointing at a comp, its route is
`/article/<slugified title>` — lowercased, apostrophes and punctuation dropped,
spaces and colons to hyphens, e.g. "Sustainability Isn't a Side Project: Making
Impact Operational" → `sustainability-isnt-a-side-project-making-impact-operational`.
Do not invent a shorter slug; match the entry already in `ARTICLES` when one
exists.

# 1. Workflow

For every implementation request:

1. Read `AGENTS.md` and follow its instructions as the highest priority project guidance. `AGENTS.md` is the source of truth for implementation decisions. User requests may override these rules only when the user explicitly requests a deviation, explains why, and the relevant rule is intentionally changed.
2. Read the skills explicitly mentioned by the user.
3. Inspect only the code, files, and dependencies relevant to the request. Do not inspect, modify, or reason about unrelated parts of the repository unless they directly affect the approved implementation.
4. Ask a focused question only if the task has meaningful ambiguity. Do not ask questions when reasonable assumptions can be made without affecting the implementation outcome.
5. Create a detailed prompt file in `prompts/` per the contract in section 4.
6. Ask: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. On approval, re-read the approved prompt file in `prompts/` and implement it strictly. Implement only after user approval. Entering `y` or `Y` = `Approved. Execute.`  
8. Run available checks (section 2). Then finally, add all that was implemented to this `AGENTS.md`
9. Share exact steps to test or run the completed feature.
10. Commit the resulting change to `main`, unprompted. Every executed prompt ends in a commit—never leave implemented work uncommitted. Do not push unless asked.

Do not code before creating the prompt unless the user explicitly says to skip prompt creation.

**Why step 10 matters.** Resolving what is already built (below, and on any resume) reads the files on disk and `git log`, never the prompt files. Work left uncommitted makes that resolution wrong and invites a duplicate prompt for a feature that already exists.

**Resuming in a new session.** Entering `I` or `i` = `Work out what comes next and write its prompt file.` It runs steps 1–6 of this workflow and stops at the approval question. It never implements anything—`i` writes the prompt, `y` executes it.

Resolving what "next" means, in a session with no prior context:

1. **The number** is the highest existing prompt number in `prompts/` plus one. Never renumber, never overwrite, never reuse a number (section 4).
2. **The scope** is the next unbuilt item from section 1's build list, ordered by what unblocks the most downstream work. The spec's four-phase roadmap (section 7 of the spec) is the narrative for why that order exists; use it as context, not as a checklist to walk mechanically.
3. **Establish what is already built from the repository**—the files on disk and `git log`—not from the existing prompt files. A committed prompt file is evidence that a prompt was written, never that it was executed. Writing a prompt for work that already exists is the main failure mode here.
4. **Name the chosen scope and say why it is next in the first line of the reply**, before writing the file, so a wrong call is visible immediately.
5. If two candidates are genuinely equally unblocking, write neither yet—name both, state the trade-off, and ask.

Then finish with step 6's question as written.

# 2. Commands and checks

Scripts that currently exist in `package.json`:

- `npm run dev` — start the Next.js dev server (Turbopack); watch its terminal for job and pipeline logs
- `npm run build` — Next.js production build
- `npm run start` — run the production build locally after `npm run build`
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`

Report the exact command output; never claim a check passed without running it.

# 3. Automation

Steps that have already been worked out by hand. Start from the command, not the
investigation.

**A comp folder maps to a route by name.** `public/assets/pages/NN-<name>/screen-sizes/`
is the design source. `04-article2` is the second article, so the work is a
content entry against `/article/[slug]`, not a new route. Read the folder before
asking what to build.

**Comp geometry is measured, never eyeballed.** One command gives the hero and
card boxes at a breakpoint:

```
magick <comp>.png -colorspace Gray -threshold 95% -negate \
  -define connected-components:verbose=true \
  -define connected-components:area-threshold=25000 \
  -connected-components 8 null:
```

Run it against the render and the comp and diff the box list. Area threshold
25000 at 1280, 40000 at 800, 15000 at 375.

**Screenshotting the render** — Playwright is not a project dependency but its
browsers are cached; drive `playwright-core` out of the npx cache
(`/home/gdk26/.npm/_npx/*/node_modules/playwright-core`) against `npm run start`,
`deviceScaleFactor: 1`, `fullPage: true`, at 375 / 800 / 1280.

`playwright-core` is CommonJS — `import { chromium } from …/index.js` throws
`Named export 'chromium' not found`. Use
`import pkg from '…/index.js'; const { chromium } = pkg;`.

**Check port 3000 before starting a server.** A `next dev` may already be
running there; `npm run start` then dies with `EADDRINUSE` and every screenshot
silently comes from the dev server instead (the dev-tools badge shows up in the
render and can land in the connected-components list). Start production on a
free port — `npx next start -p 3001` — and leave the user's dev server alone.

**Identifying which photograph a treated comp image came from is a search, not a
guess.** Blur, greyscale and downsample both to ~124×50 and rank
`magick compare -metric RMSE` across `public/assets/images`. Note the ranking is
whole-image against a crop, so read it as a shortlist, not a verdict — confirm
by eye.

**RMSE cannot answer "which photograph", and will confidently lie.** On comp 4
it ranked `Image-8` first at 0.118 and `Image-9` — a hand holding a mirror in a
grass field — third, because at 124×50 the score is dominated by mean tone. Use
**scale-invariant NCC on a coarse tone grid** instead. Dump every source to a
192×192 ascii PGM (`-compress none -depth 8`) and the comp to a 16×7 tone grid,
then in plain Python sweep every 62:25 window at every scale with a summed-area
table and score zero-mean normalised cross-correlation against that grid. NCC is
invariant to the brightness and contrast the duotone imposes, which is exactly
what RMSE is not. About 10s per source image at a 4px step; there is no numpy in
this environment, and none is needed.

Read the result as a **gap, not a ranking**. A true match is unmistakable:
comp 6 → `Image-4` at 0.980 with second place 0.513; comp 5 → `Image-5` at
0.996 with second 0.915. Comp 4's field ran 0.90 / 0.89 / 0.88 with the best
windows collapsing to 32×13 — the overfit signature — and forcing a minimum
window killed it (0.90 for `Image-6`, a sunset silhouette). **No gap means the
photograph is not in the folder**; fall back to cropping the comp, as article 1
and article 4 both do. Always run a comp with a known answer as a control.

**Check the hero's corners before choosing a recipe.** Four flat `#2683EB` /
`#FFFFFF` corners means the **ink layer alone** — one command, no mask and no
cream field (articles 4 and 6). Cream in any corner means the three-layer
composite (articles 2, 3 and 5).

**Fitting a crop is a sweep, and the metric matters.** Run three passes,
coarse → fine → fine, over width / x / height / y, scoring each candidate. Two
weaker metrics and the one to trust:

- *blurred greyscale, `-normalize` on both sides* — usable when the treatment is
  a plain duotone, useless without the normalize (a halftone's greyscale range
  is nothing like the photograph's).
- *a binary feature mask* — for a cream/ink composite, `-fx "(r-b)>0.05?1:0"`.
  Overlay it in red over the comp before trusting it.
- **generate the candidate through the full recipe and compare it to the comp**,
  both blurred and downsampled to 124×50. This is the honest one: it scores the
  thing actually being shipped. Article 3's three metrics disagreed by ~12px of
  crop; only this one is worth reporting.

Downsampled RMSE cannot tell a cream field from sparse halftone dots, so fit
*coverage-like* parameters (the cream/ink threshold) against a dot-aware mask
and a target area fraction instead — see article 3.

**`-alpha off` first on `public/assets/images/*.png`.** They carry a 1-bit alpha
channel that silently flattens greyscale probes and thresholds to white.

**`txt:` pixel dumps are depth-dependent.** `magick … txt:-` prints 0–255 for an
8-bit image and 0–65535 for 16-bit. Add `-depth 16` before `txt:-` so probes can
assume one scale.

**Article prose is transcribed from the desktop comp at 200 % zoom**, split into
two crops so the text is legible in one pass.

**A new article that reuses `/article/[slug]` is a data change**: one
`ARTICLE_BODIES` key plus one generated hero. Reach for new components only when
the comp shows an element the route does not already render.

**Measuring an ellipse from a comp: use the extreme-x columns, never the
mid-height chord.** The chord at `y = cy` is centred for *any* rotation, so it
can never reveal a tilt — it reads a rotated ellipse as an upright one with a
smaller `rx`, which is exactly how the job-listing `Seal` shipped upright. Take
the ink bbox and the vertical midpoints of the min-x and max-x columns instead;
a drop between the two tips *is* the tilt. One command:

```
magick <img> -crop WxH+X+Y +repage -alpha off \
  -fuzz 28% -fill white +opaque '#2683EB' -fill black -opaque '#2683EB' \
  -colorspace Gray -threshold 50% -negate txt:- \
  | awk -F'[,:( ]+' 'NR>1 && $3>200 {print $1, $2}' \
  | awk '{if(NR==1||$1<a)a=$1; if($1>b)b=$1
          if(!($1 in m)||$2<m[$1])m[$1]=$2; if(!($1 in M)||$2>M[$1])M[$1]=$2}
         END{printf "w %d  Ltip %.1f  Rtip %.1f  drop %.1f\n", b-a+1,
             (m[a]+M[a])/2, (m[b]+M[b])/2, (m[b]+M[b])/2-(m[a]+M[a])/2}'
```

Then solve `hw = √(a²cos²θ + b²sin²θ)`, `hh = √(a²sin²θ + b²cos²θ)` and the tip
offset for `a`, `b`, θ. **θ is sensitive** — ±1px of drop is ±0.5° — so confirm
it against type landmarks (labels that should sit on one line, or on one axis)
before shipping a number. **A `-fx` mask over a whole page screenshot picks up
the sky and the accent links**; always crop to the mark first.

**Fitting a heading's top padding needs an ink-row profile, not a box list.**
Connected components gives card boxes but not a cap top. Count ink pixels per
row over a crop, and read the first non-zero row:

```
magick <img> -alpha off -crop WxH+X+Y +repage -colorspace Gray -threshold 50% \
  -negate txt:- | awk 'NR>1 { split($1,a,","); if (substr($2,2)+0>0) r[a[2]]++ } \
  END { for (k in r) printf "%d %d\n", k, r[k] }' | sort -n
```

Run it on the comp and the render at the same crop. **The cap-top inset from
the element's content box is not one number across breakpoints** — on the
careers masthead it is +1 / −2 / −3 at 1280 / 800 / 375, so solve the padding
per step rather than fitting one and scaling it.

**Cap tops across two different fonts are not a baseline pitch.** A serif line
over a sans line have different cap-height-to-baseline offsets, so an ink-top
difference overstates the leading. Measure ink *bottoms* on lines with no
descenders instead.

**`pkill -f "next start"` kills the tool's own shell** (exit 144, and the rest
of the command never runs). Kill by port instead:
`PID=$(ss -ltnp | grep ':3001' | sed -n 's/.*pid=\([0-9]*\).*/\1/p'); kill $PID`.

**Define shell helpers as files, not functions.** The tool shell is zsh and
`name() { … }` collides with its aliases (`cc`, and others) — write the helper
to the scratchpad with `chmod +x` and call it by path.

**Reading a reference recording: sample it, don't scrub it.** Extract frames
with `ffmpeg` and read them as a contact sheet rather than opening the video:

```
ffprobe -v error -show_entries stream=width,height,duration -of default=nw=1 ref.webm
ffmpeg -v error -i ref.webm -vf fps=1 -q:v 2 frames/f%03d.jpg           # whole pass
ffmpeg -v error -ss 4.2 -to 7.4 -i ref.webm -vf fps=15 -q:v 2 hero/h%03d.jpg  # one beat
magick montage frames/f0*.jpg -tile 6x -geometry +2+2 -resize 320x sheet.png
```

1 fps first, to find where each pass and each section starts; then 12–15 fps
over the two or three seconds that matter. **A 1 fps sample makes clean opacity
fades look like blur** — do not diagnose an effect off the coarse pass.

**Comparing two builds' prerendered HTML is a script, not an eyeball.** The
pages are single-line, so `diff` prints the whole file for a one-character
change. Normalise the build id (`.next/BUILD_ID`) and the CSS chunk name
(`/_next/static/chunks/*.css` — Next puts CSS under `chunks/`, not `css/`) and
report differing *regions* with `difflib.SequenceMatcher`. Keep the helper in
the scratchpad; it is ~20 lines of Python.

**Building the parent commit needs a sibling worktree with hard-linked
`node_modules`.** Turbopack rejects a symlinked `node_modules` outright
(`Symlink [project]/node_modules is invalid, it points out of the filesystem
root`), and a worktree under `/tmp` cannot hard-link to one under `/home`:

```
git worktree add ../aetherfield-base HEAD
cp -al node_modules ../aetherfield-base/node_modules
(cd ../aetherfield-base && npm run build)
```

Run the two servers side by side (`3001` new, `3002` base) and screenshot both.
Remove the worktree and `git worktree prune` when done.

**A client component reached from a shared barrel lands in every page's
`<script>` list.** After adding one, always check the chunk graph, not just the
markup:

```
grep -o '/_next/static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/<page>.html | sort -u
```

Diff that list against the parent build's. To identify an unexpected chunk,
grep it for a distinctive string from the suspect module.

**Standing instruction:** each session, watch for steps repeated by hand and add
the mechanical ones here, so later sessions start from the command rather than
the investigation.

# 4. Prompt files

Every implementation request gets a file in `prompts/`, written before any code
(section 1, step 5) and re-read verbatim at execution time (step 7).

**Numbering.** `NN-<kebab-case-scope>.md`, where `NN` is the highest existing
number in `prompts/` plus one. Never renumber, never overwrite, never reuse a
number — the sequence is the project's build history and a gap or a reused
number makes "what is already built" unresolvable in a later session.

**A prompt file must state**, in whatever order the work makes natural:

- the scope, and why it is next;
- the reference material read for it — comps, screenshots, recordings, source
  files — by path;
- the measurements the implementation must hit, or the measurement procedure
  that will produce them, never eyeballed numbers;
- the expected impact, including which routes' prerendered HTML must stay
  identical;
- non-goals — what is deliberately out of scope, and why;
- the checks to run (section 2), and what to record in `AGENTS.md` afterwards.

**`## SKILLS USED`** — required, in every prompt file. List every skill the
implementation should invoke, by its exact name from the skill listing, with one
line each saying what it is for. Include skills already loaded while writing the
prompt as well as ones only the implementation will need. Write `None` if the
work genuinely needs no skill, rather than omitting the section.

**Why it is required.** The prompt file is the whole brief on execution — after
a `/clear`, an approving `y` is answered by re-reading the file and nothing
else. A skill that was loaded while writing the prompt is not loaded when the
prompt runs, so an unlisted skill is a skill the implementation will silently
work without. Naming them in the file is what makes the run reproducible.

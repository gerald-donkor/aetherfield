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

### The open-application card's marching dashes

Prompt 31. The user circled the dashed frame in
`~/Pictures/Screenshots/Screenshot_20260806_203153.png` and asked for the dashes
to move around it. It is the site's fourth continuous loop, after the
capabilities asterisk and counter and the journal stamp's perforation drift —
and the only one that is **not** GSAP.

**CSS keyframes, not GSAP**, at the user's choice, and it is the cheaper route:
`cards.tsx` stays a server component, `/careers` gains no client reference, and
the loop needs no `matchMedia`, no `useGSAP` and no on-screen gate. One
`@keyframes` plus one class in `app/globals.css`, and `className="job-frame-march"`
on the existing `<rect>`. Nothing else.

**The loop is seamless because the dash pitch is uniform.** 7 on + 9 off = 16, so
a `stroke-dashoffset` of exactly `-16` lands every dash where its neighbour
started: the frame at `t + duration` is pixel-identical to the frame at rest and
`infinite` has no seam. Identical argument to the journal stamp's `1240/25 =
49.6` perforation pitch — **the pitch is what makes it seamless, not the
duration**, so a speed change cannot break it. **Verified, not assumed**: under
`prefers-reduced-motion: reduce` (animation not running), the dashed card's box
screenshotted at rest and again with `stroke-dashoffset: -16px` forced onto the
rect compares at **`AE` 0 at 375, 800 and 1280.**

- **Negative, i.e. clockwise** — a decreasing offset advances the pattern along
  the path's own direction, and the rect is drawn from its top-left corner
  clockwise, so the dashes travel left-to-right along the top edge. The user's
  choice, and it matches the journal stamp's top row.
- **`0.8s` per pitch = 20 px/s is a judgement, not a measurement.** The user
  picked "brisk" from three offered paces (0.5 / 0.8 / 1.2 s). Half the
  perforation drift's ~41 px/s, which is right for a 1px hairline against that
  loop's 15px circles. Say *judgement* if it is ever revisited.
- **`linear`.** A conveyor must not accelerate; any easing makes the wrap read as
  a stutter. Same reason the perforation drift ships `ease: "none"`.
- **No on-screen gate, deliberately.** The GSAP loops carry a `ScrollTrigger`
  `onToggle` because their ticker runs regardless. A CSS animation on an
  off-screen element is the browser's own problem, and this one repaints a single
  1px stroke. Do not add a gate, and do not convert this to GSAP to get one.
- **It sits OUTSIDE the `(scripting: enabled)` block.** That block exists to hide
  GSAP's start states; this animation needs no script and is authored to run with
  JavaScript off. It is gated on `prefers-reduced-motion: no-preference` alone.

**No geometry changed.** The 7/9 pattern, the `strokeWidth="2"`-clipped 1px, the
radius 16 and the interior transparency are all comp-measured and untouched.
`/design-system` renders `JobCard` **without** `open`, so it draws no frame and
contains the class zero times.

Confirmed in the **built** stylesheet, the discipline every CSS mechanic here
follows: `@keyframes job-frame-march{to{stroke-dashoffset:-16px}}` at top level
and `@media (prefers-reduced-motion:no-preference){.job-frame-march{animation:.8s
linear infinite job-frame-march}}` — Lightning CSS keeps both and adds the `px`.
Content detection does not strip a hand-authored class used in a `className`.

#### Measured in the production build

Against a worktree build of `ec70823`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| drift rate | **19.95 px/s** | **19.95 px/s** | **20.10 px/s** |
| seam check (`AE`, rest vs −16 forced) | **0** | **0** | **0** |
| dashed card box | `335×224+20+1200` | `760×170+20+1001` | `820×170+230+1036` |
| page height | **1895** | **1770** | **1925** |
| reduced motion | `animation-name: none`, `stroke-dashoffset: 0px` | same | same |
| JS off | animation runs; card box unchanged | same | same |

Card boxes and page heights are the recorded numbers **unchanged**, and
connected components on `/careers` gives an **identical box list** against the
base build at all three widths. Reduced motion also keeps `stroke-dasharray:
7px, 9px` and `stroke-width: 2px`. With JavaScript off, two shots of the card
box 400 ms apart differ (`AE` 1548) — the animation is genuinely running without
script. An ink-row profile across the top border at rest is a **single row of
ink** with runs of 7 separated by 9, i.e. the comp's pattern intact.

**Scoped `AE` at 5 % fuzz is `0` outside the dashed card's box at all three
widths**; inside it, 449 / 294 / 859 (0.2–0.6 % of the box's pixels) — the dashes
at a different loop phase. **Never report a bare page-wide `AE` for `/careers`
now**, for the same reason `/journal` and `/` already carry that warning.

`/careers` is the only route whose prerendered HTML changes and its only diff is
the one `class="job-frame-march"` attribute; the other **15 pages are
byte-identical** once the build id and the CSS and JS chunk names are normalised.
Every route keeps its chunk set (`/`, `/journal` and `/about` 10, the rest 9, the
two error pages 8).

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

## Homepage motion (`/` only, until prompt 24)

**Superseded in part.** Everything in this section still describes `/`
accurately, but "GSAP, on the homepage and nowhere else" and the "no GSAP leak"
invariant are no longer true of the site: prompt 24 put motion on `/journal`
and in the footer, and the footer reaches every route. See **"Site motion"**
below for what replaced them.

GSAP, on the homepage and nowhere else. Two reference recordings in
`public/design-ref/animation-ref/`: `landing.webm` (three passes over `/` at
desktop, tablet and mobile) and `chart.webm` (a generic bar chart). Prompt 17.

**The vocabulary is small and identical at every breakpoint**: fade in and
rise, per-element stagger in reading order, ~0.5 s each with ~0.08 s between
siblings, decelerating, **once, on enter**. Nothing scales, blurs or rotates;
nothing reverses on scroll-up; nothing is scrubbed. **No pinning, no parallax,
no horizontal scroll, no `ScrollSmoother`** — the recording contains none of
them and they would fight the sticky navbar. `DUR` and `EASE` live in
`motion/register.ts` so the chart and the page reveals cannot drift apart.

**The shipped timings are one step faster than the recording, on purpose**
(prompt 18). `DUR 0.5`, sibling stagger `0.08`, the chart's gridlines and bars
`0.4` with stagger `0.05` and a **0.7 s** bar run — a deliberate ~20 % cut on
the recording's own pace at the user's request, in the same spirit as the seal's
offsets being overridden by a user reference. Nothing else moved: `EASE`
(`power3.out`), `from: "edges"`, the `power1.inOut` stagger ease, the rise
distances (36 / 24), `start: "top 88%"`, the chart's `start: "bottom bottom",
once: true` and the `immediate` hero are all unchanged, and `DUR` / `EASE`
remain the single source of truth in `register.ts`. These are tween vars, not
markup — **all 16 prerendered pages, `/` included, are byte-identical** across
the change once the build id and the CSS chunk name are normalised. Verified in
the render at 1280: bars sit at scaleY 0 until the chart scrolls in, then run
edges-first with the centre still at 0.58 when the ends have landed.

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

- **`stagger: { amount: 0.7, from: "edges", ease: "power1.inOut" }`** (0.9 as
  originally fitted; see the speed-up note above)**.** GSAP's
  advanced-stagger `from` takes `"start" | "center" | "edges" | "end" |
  "random" | <index>`; `"edges"` starts at both ends of the target array at once
  and converges on the middle, which is exactly the user's ask. Do not hand-roll
  it with an index function. `amount` rather than `each` so the run length is
  authored once and does not drift with the bar count. **Verified in the render**
  — at 0.9 the original fit read, 0.56 s in, bars 0–3 and 29–32 at scaleY
  0.15/0.13/0.09/0.04, symmetric, everything between still 0; at 0.7 the same
  shape holds, with the two ends landed and the middle bar still at 0.58 1.2 s
  in.
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

~~**`SplitText` was considered and rejected.**~~ **Superseded** — the plugin is
now used, on the hero and nowhere else, at the user's explicit request. The
original objection (it mutates the DOM after hydration) is real and is answered
rather than avoided; see "The hero's split blur-in" below.

**`motion@^13` is in `package.json` and is unused by this work.** The homepage
is GSAP throughout. Do not mix the two libraries on one page.

### The journal rows' hover

**The one hover animation on the site, and it is CSS, not GSAP.** Prompt 19.
Reference: `public/design-ref/animation-ref/home-journals.webm` (34 s of the
"From the journal" rows being hovered), plus the user's
`~/Videos/Screencasts/Screencast_20260805_193354.webm`. The recording that
prompted it — `Screencast_20260805_193215.webm` — shows the old behaviour: an
underline that snapped on in a single frame with no transition anywhere near it.

Two class strings in `home/journal.tsx`. **The slide is on the `<Link>`, not on
the `<li>`** — the `li` carries the row's `border-b` (which the reference holds
still) *and* GSAP's inline reveal transform, so putting it there would move the
rule and fight the tween. Verified in the render: the `li`'s rect does not move
and its transform stays `matrix(1, 0, 0, 1, 0, 0)`.

| | at rest | on hover | how it was measured |
| --- | --- | --- | --- |
| the row (image + title + meta) | — | **+10 px in x** | title ink box left edge 6 → 16, **width constant at 365** — a translation, not a scale |
| title | `#000` | **≈ 84/255 ink ≈ 0.67 opacity** | aligned crop mean 198.87 → 217.27, ink fraction 0.220 |
| meta | — | **unchanged** | aligned crop mean 240.81 → 240.73 |
| thumbnail | — | **unchanged** — no zoom, no fade | aligned crop mean 186.65 → 186.66 |
| the row's rule | — | **does not move** | static pixels |
| underline | none | **none** | title ink box height constant at 19 px |

**The recordings are 1:1 with CSS pixels** — the thumbnail measures 165 and 166
px against the authored `md:grid-cols-[164px_1fr]` — so distances read off them
are CSS pixels directly. Establish that before trusting any number here.

**Both recordings were measured independently and agree.** On the 34 s file the
cursor sits inside the title crop during the hover, so the ink box's *left* edge
is the cursor's; read the **right** edge instead (379 → 389, +10) and crop the
tone probe to start past the cursor (191.57 → 212.73, which solves to the same
85/255).

**The easing is authored because the default is measurably wrong.** Title left
edge per frame at 30 fps: `6,6,6,7,7,9,10,12,13,15,16,16,16,16`; mouse-out
mirrors it. Fitting named curves to that trace:

| curve | best duration | SSE |
| --- | --- | --- |
| linear | 230 ms | 0.0153 |
| **`ease-in-out`** | **300 ms** | **0.0157** |
| `ease-out` (CSS) | 270 ms | 0.0211 |
| `ease` | 360 ms | 0.0334 |
| `ease-out` (Tailwind's `cubic-bezier(0,0,.2,1)`) | 330 ms | 0.0518 |

Linear and `ease-in-out` are tied at the top and Tailwind's default is the
**worst** fit, so it ships `duration-300 ease-in-out`. ±1 px on a 10 px travel
is ±10 % of progress — claim no more precision than that.

**`opacity-70`, not `opacity-65` and definitely not `text-muted`.** Predicted
crop means are 215.7 / 218.5 / 222.6 against the measured 217.3: the first two
straddle it and cannot be told apart, so 70 wins on idiom — `SiteFooter` already
ships `hover:opacity-70`. `text-muted` (`#6c6c6c`) is out by 5 grey levels.

Four Tailwind v4 mechanics, all checked against the **built** stylesheet rather
than assumed — re-check them on any Tailwind upgrade:

- `translate-x-2.5` is `2.5 × --spacing`, and `--spacing` is not overridden in
  `@theme`, so it is exactly **10 px**.
- **v4 emits translate utilities as the `translate` property, not `transform`.**
  `.transition-transform` expands to
  `transition-property: transform, translate, scale, rotate` and does cover it —
  but a narrower `transition-[transform]` would silently not animate.
- v4 already wraps every `hover:` / `group-hover:` rule in
  `@media (hover:hover)`, so nothing sticks on touch and no guard is needed.
- `motion-reduce:transition-none` compiles to
  `@media (prefers-reduced-motion:reduce){transition-property:none}` — the hover
  state still applies, just instantly, which is how the GSAP reduce branch
  already behaves.

**`cards.tsx` was deliberately left alone.** `ArticleCardStacked` carries the
same `group-hover:underline` idiom and feeds `/journal`, the `/article`
recent-articles band and `/design-system`, but those were fitted against their
own comps and no recording covers them. Extending this treatment to them is a
separate decision — as is the rest of the site's hover states, which remain
three unrelated idioms (`hover:text-muted`, `hover:opacity-70`,
`hover:underline` / `hover:no-underline`).

Measured in the production render at 1280: link x **+10.00**, image **+10.00**,
`li` **+0.00**, `h3` opacity `1 → 0.7`, `text-decoration-line` `none` in both
states, an intermediate value mid-transition, and a full reverse on mouse-out.
`/` is the only route whose prerendered HTML changes and its only diffs are the
two class attributes — the other 15 pages are byte-identical.

### The journal mark's flip

**The one element on the homepage with a treatment of its own.** Prompt 20. The
user circled the mark in `~/Pictures/Screenshots/Screenshot_20260805_192944.png`
and asked for it to "flip and tilt from 45 degrees point to the current
position". It used to be one `data-reveal-item` among six in the "From the
journal" section; it now has its own client leaf and its own hook, and the
section's stagger is five items, not six.

`app/_components/home/journal-mark.tsx` — `"use client"`, the SVG moved
verbatim out of `journal.tsx`, which **stays a server component**. Same shape as
`emissions-chart.tsx`: `gsap.matchMedia()`, `mm.add(..., root)`, `return () =>
mm.revert()`, `useGSAP(fn, { scope: root })`, no `clearProps`, no
`will-change`. Keep the file **component-only** — a constant or type exported
from here and imported elsewhere drags GSAP into that page's bundle, the rule
that forced `PRINCIPLES` out into `principles-data.tsx`.

**`home-journals.webm` was read and rejected as a source for this.** Across all
749 real frames (`-fps_mode passthrough`) the mark's blue-ink bbox is
bit-identical at `x 34–444, y 56–179` with a constant ink count of 5540 — it
never moves in that file. It constrains the row hover and nothing else. Do not
try to fit the flip to it.

**The tween:**

```
{ opacity: 0, rotationY: 45, rotation: -45, transformPerspective: 800 }
  → { opacity: 1, rotationY: 0, rotation: -8, transformPerspective: 800 }
```

`DUR * 1.5` = **0.75s** (the flip travels much further than a 36px rise and
reads rushed at `DUR`), `EASE` unchanged, `start: "top 88%", once: true` —
`Reveal`'s own default, so the mark starts with its section rather than on a
second threshold. `DUR` and `EASE` are imported from `register.ts`, never
restated.

**−45 → −8 is a judgement, and the two alternatives are recorded.** "45 degrees"
is a number read off the screen, so it is an *on-screen* start angle, and the
mark rests at −8° on screen. Sweeping from −45 up to −8 never reverses direction
and makes the resting angle the terminus of the gesture. The opposite-sign
reading (start at +45) sweeps across vertical and flies *past* the rest angle; a
literal `rotation: 45` on top of the CSS tilt is neither 45 on screen nor
defensible. At `t=0` "net −45" is strictly a sum only once the flip closes: with
`rotationY` also applied the composite is not a pure Z rotation, so the
perceived tilt starts slightly under 45° and converges.

**The resting −8° is authored twice — in the class and in the tween — and the
prompt's reasoning for keeping it out of JS was wrong.** Tailwind v4 does emit
`-rotate-[8deg]` as the independent `rotate` property (`.md\:-rotate-\[8deg\]{
rotate:-8deg}` in the built stylesheet), and css-transforms-2 does compose
`translate × rotate × scale × transform`. But **GSAP does not leave the property
alone**: `_parseTransform` folds `translate` / `rotate` / `scale` into a single
`transform` string and then sets all three to `none`
(`node_modules/gsap/CSSPlugin.js:859-866`) — unconditionally, on every parse.
The `_removeIndependentTransforms` guard at `:123` (`if (style.translate)`) is a
*different*, later code path and does not protect this. So the −8 is consumed at
tween creation and a tween ending at `rotation: 0` lands the mark **upright**.
Measured before the fix: resting rect `425×171` at 1280 against the settled
`421×252`, with `rotate` computing to `none`. The class stays because it is the
resting state with JavaScript off and under reduced motion; `REST_ROTATION = -8`
in the module is the same number for the tween's terminus. Keep the two in step.

**`rotate` in a GSAP vars object is an alias for `rotation`**
(`CSSPlugin.js:1592`, `"8:rotate"`) — it writes `transform`, never the CSS
property. Do not reach for it expecting the latter.

**The CSS start state is `opacity: 0` and nothing else** — deliberately *not* a
mirror of the tween's `from`. The mark is invisible there, so a start transform
could never be seen, but it would still be *parsed*: decomposing
`rotate(-8deg)` folded against `perspective(800px) rotateY(45deg) rotateZ(-37deg)`
yields a spurious `rotationX(-31.04deg)` that the tween never animates away, and
it survives into the resting state. Starting from `transform: none` plus the
authored `rotate` decomposes cleanly. The rule joins the existing
`(scripting: enabled) and (prefers-reduced-motion: no-preference)` block in
`globals.css`, verified present in the built chunk.

**`transformPerspective: 800` is required, not decorative.** Without a
perspective, `rotateY(45deg)` is an orthographic projection — a flat horizontal
squash with no foreshortening — and does not read as a flip. GSAP writes it as
`perspective()` at the head of the element's own transform string
(`CSSPlugin.js:1078-1079`), so it is element-local and needs no `perspective` on
the parent. 800 is ~2× the `lg` element width. `transformOrigin` stays at the
default `50% 50%`: the diamond path spans `6…394` of the 400-wide viewBox, so
its visual centre is the box centre. The leftover inline `perspective(800px)
rotate(-8deg)` after the tween is cosmetic — it is visually identical to the
class, since a perspective row is inert for a flat element at z 0 — and is left
alone.

**`isTabletUp: "(min-width: 768px)"` is a third named condition**, alongside the
`reduceMotion` / `fullMotion` pair. The mark is `display: none` below `md`, so
no tween is created at 375 at all. The reduce branch sets **only the opacity** —
touching a transform property there would parse the transform and strip the
authored `rotate`, exactly as above.

**Overflow was computed, not eyeballed.** For a 2:1 box the rotated bounding
half-width `(w·cosθ + h·sinθ)/2` is flat between 8° and 45°: at `md` the right
edge is 202.7 at rest against 202.8 at the start (the list begins at 222), at
`lg` 409.2 against 409.4 (list at 437.3). Under a tenth of a pixel — the width
lost to `cos` is repaid by the height projected through `sin` — and `rotationY`
foreshortens X further, so the mid-flip box is *narrower* than at rest. Measured
mid-flight at 768 the box peaks at `315×251`, still clear of the list. The
vertical bbox does grow ~±35px into the whitespace above and the empty tail of
the left grid column; the h2 and the list are in the *other* column. Nothing in
the chain may become `overflow-hidden`.

#### Measured in the production build

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `display` | `none` | `block` | `block` |
| resting rect | `0×0` | **`307×184`** | **`421×252`** |
| resting matrix | — | `matrix3d(0.990268, -0.139173, …)` | same |
| pre-trigger | `opacity 0`, no tween | `opacity 0`, `rotate(-45deg) rotateY(45deg)` | `opacity 0` |
| mid-flight | — | `opacity 0.77`, `rotate(-16.7) rotateY(10.6)` | `opacity 0.79`, `rotate(-15.7) rotateY(9.3)` |
| reduced motion | `opacity 1`, untouched | `opacity 1`, `rotate: -8deg`, `307×184` | `opacity 1`, `rotate: -8deg`, `421×252` |

The resting matrix's 2D block is exactly `cos/sin 8°`; the only extra term is the
perspective row (`-1/800`), inert at z 0. The resting rects are the settled
numbers unchanged. Under reduced motion the inline style is never written at
all, and with JavaScript off the `scripting: enabled` gate never applies.

`/` is **pixel-identical** in its settled state at 375 / 800 / 1280 (`magick
compare -metric AE` = 0 at 5 % fuzz against a worktree build of the parent
commit) and its page heights are unchanged at **6350 / 6006 / 5595**. It is the
only route whose prerendered HTML changes: the wrapper's `data-reveal-item`
becomes `data-journal-mark`, the SVG becomes a client reference, and the page
chunk is renamed. The other 15 pages are byte-identical once the build id and
the CSS chunk name are normalised, and **every one of them keeps the identical
chunk set** — no GSAP leak.

### The journal mark's hover

**The second treatment on the mark, and the site's only JS-driven hover.**
Prompt 21. The user circled it again in
`~/Pictures/Screenshots/Screenshot_20260805_212139.png`: *"Let this rotate and
tilt at 45 degree above when hovered upon."* It lives in the same client leaf as
the flip (`home/journal-mark.tsx`); `journal.tsx` stays a server component and
no markup changed at all — the hover is pure JS.

**"45 degrees above" is read as the enter pose, revisited.** Prompt 20
established that a degree figure from this user is an *on-screen* angle, and
that the mark's entrance runs from a net −45° up to its resting −8°. So hovering
sweeps it **back out to −45°** — further counter-clockwise, lifting the
right-hand tip above the resting line, which is the "above" — plus a reduced
slice of the same `rotationY` (**12°**, against the entrance's 45) so it leans
rather than replays the flip. `HOVER_ROTATION` / `HOVER_ROTATION_Y` in the
module. Two readings rejected, for the same reasons prompt 20 rejected them for
the entrance: *+45° on screen* crosses the rest angle instead of extending from
it, and a literal `rotation: 45` in the vars object is neither 45 on screen nor
defensible against a composed start. If the user meant 45° of *additional* tilt
(rest −8 → −53), that is one number.

**Paused tween driven by `play()` / `reverse()`, not a `gsap.to` per event.** A
mouse-out mid-flight then unwinds along the same curve from wherever it is —
measured: interrupting 150 ms in reads `rotate(-40.98deg) rotateY(10.69deg)` and
returns to the exact resting matrix. `quickTo` cannot reverse like that, and
stacked `to`s fight each other. `DUR * 0.7`, `EASE` — both imported from
`register.ts`, never restated.

**The hover tween is not built, and no listener is bound, until the entrance
flip's `onComplete`.** Both write `rotation` on the same element, so gating on
the entrance is what makes hovering mid-flip harmless: there is nothing bound
yet. The tween is created inside `contextSafe(...)` because anything GSAP makes
after `useGSAP` has run is outside the context and would never be reverted
(gsap-react); the `mm.add` handler returns a cleanup that removes both listeners
and kills the tween.

**Its start vars are the composed resting pose** (`rotation: REST_ROTATION`,
`rotationY: 0`), never `rotation: 0` — by this point GSAP has folded the
Tailwind `rotate: -8deg` into `transform`, the trap prompt 20 documented. It
also carries **`immediateRender: false`**: a paused `fromTo` otherwise writes its
start values at creation, on top of the entrance tween that has just landed.

**`hasHover: "(hover: hover)"` is a fourth named condition**, alongside
`reduceMotion` / `fullMotion` / `isTabletUp`. Tailwind v4 wraps its own `hover:`
rules in that query for free; a JS pointer handler gets no such wrapper, so it is
authored explicitly and nothing sticks on touch. The reduce branch binds no
listener and creates no tween, and still touches only `opacity`.

**Overflow was computed, then verified.** For the 2:1 box the rotated bounding
half-width `(w·cosθ + h·sinθ)/2` is 211.9 at 8° and 212.1 at 45° — flat, because
the width lost to `cos` is repaid by the height projected through `sin`, and
`rotationY` foreshortens X further. Half-*height* grows from 126.8 to 212.1, i.e.
~±85 px into the left column's whitespace; the h2 and the list are in the *other*
grid column. Measured hovered right edge **215.1 at 800** against the list's
242.0, and **420.1 at 1280** against 461.3 — clear by 27 and 41 px. Nothing in
the ancestor chain may become `overflow-hidden`.

#### Measured in the production build

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| resting rect | `0×0` (`display: none`) | **`307×184`** | **`421×252`** |
| resting inline transform | — | `perspective(800px) rotate(-8deg)` | same |
| resting matrix | — | `matrix3d(0.990268, -0.139173, …)` | same |
| hovered | no tween, no listener | `rotate(-45deg) rotateY(12deg)`, `304×304` | `rotate(-45deg) rotateY(12deg)`, `416×416` |
| after mouse-out | — | back to `rotate(-8deg)`, `307×184` | back to `rotate(-8deg)`, `421×252` |
| interrupted at 150 ms | — | `rotate(-40.38) rotateY(10.50)` → rest | `rotate(-40.98) rotateY(10.69)` → rest |
| reduced motion | `opacity 1`, untouched | `opacity 1`, `rotate: -8deg`, hover inert | same |

The resting rects and matrix are prompt 20's numbers **unchanged**, before and
after a hover. The hovered rect is *narrower* and taller than the resting one,
as the overflow calculation predicts.

### The hero's split blur-in

**SplitText, on the hero and nowhere else.** Prompt 21, from the user circling
the whole hero block in `~/Pictures/Screenshots/Screenshot_20260805_213058.png`:
*"split the text here and give it a nice blurry animation."*
`app/_components/home/hero-text.tsx` — `"use client"`, component-only, taking
its children as a prop and taking the hero's existing
`pt-12 text-center md:pt-16 lg:pt-[76px]` wrapper over via `className`, the same
two devices `Reveal` uses. **`hero.tsx` stays a server component**, so
`HeroDashboard` and its `next/image` never reach the client bundle.

**Why the earlier rejection was overridden.** The objection on file was that
SplitText mutates the DOM after hydration. That is true, and four things answer
it rather than avoid it — all four load-bearing:

1. It runs **only inside `useGSAP`**, never during render, so React never sees
   the split nodes. Verified: no hydration warning in the console.
2. **`autoSplit: true` with the animation created inside — and returned from —
   `onSplit(self)`**, so SplitText reverts, re-splits and re-syncs on font load
   and on resize. A tween created *outside* `onSplit` would target orphaned
   nodes after the first re-split.
3. **`aria` stays at its default `"auto"`**: SplitText labels the split element
   and hides the pieces. Verified in the accessibility tree, not just the
   markup — the `h1` reads
   `- heading "Sustainability insights, built for business" [level=1]`, and the
   lede carries its full sentence as `aria-label` with `aria-hidden="true"` on
   every piece.
4. `useGSAP`'s context reverts the split on unmount; the leaf still returns
   `() => mm.revert()` like every other. Do not call `revert()` twice.

**Words for the heading, lines for the lede — a performance choice, not a taste
one.** An animated `filter: blur()` repaints each target's layer every frame, so
the count is held in single digits: **5 words and 2 lines** at 1280. A `chars`
split would put ~90 blurred layers on screen at once and is out of scope; if
per-character is ever wanted it needs its own measurement. The buttons and the
dashboard wrapper are **untouched** and stay `data-reveal-item`, so `Reveal`'s
stagger is two items, not four.

**The two authored `<span className="block">`s stay.** They are the comp's line
break at all three breakpoints, and `type: "words"` on each span leaves that
break alone rather than asking SplitText to rediscover it — which matters
because `autoSplit` re-splits on font load.

**The tween**, one set of vars shared by both splits:

```
from { opacity: 0, filter: "blur(Npx)", y: 14 }
  → duration DUR, ease EASE, stagger 0.06, clearProps "filter,display"
```

- **Blur is 12 px at `lg` and 8 below** (`Math.round(BLUR * 0.66)`, the ratio
  `Reveal`'s rise already uses). One radius cannot serve both: the h1 is 64–80 px
  at desktop and 30–36 at mobile, and 12 px reads as a lens on the first and as a
  smear on the second.
- **`blur(0px)`, not `none`** — GSAP interpolates a filter numerically only
  between two `blur()` functions.
- **Stagger 0.06 rather than the page's 0.08** — more targets, and smaller ones.
  It is the only new timing number; `DUR` and `EASE` still come from
  `register.ts` and are never restated.
- **`clearProps: "filter,display"`, and the `display` half is measured.** A
  `<div>` inside the authored `<span>` is invalid markup, so the word pieces are
  `tag: "span"` — which means `display: inline-block` has to be set explicitly or
  the `y` will not render. An inline-block box rounds each word's advance to a
  whole pixel, which measured **758 px of desktop heading ink against 756** and
  put `magick compare -metric AE` at 4007 rather than 0. Clearing `display` with
  the filter returns the settled heading to the exact pixels it drew before the
  split. **`clearProps` may still never touch `opacity` or `transform`** — that
  hands the element back to the CSS start state and it vanishes.

**The hidden start state is `[data-hero-split] { opacity: 0; }`** in the existing
`(scripting: enabled) and (prefers-reduced-motion: no-preference)` block —
opacity only, on the *unsplit* element, for the reason `[data-journal-mark]`
already records. The split nodes do not exist when the stylesheet is parsed, so
the blur is a tween start value rather than an authored one; `onSplit` lifts the
outer element to `opacity: 1` and the words carry the animation from there.

**The `Reveal` delay is fitted, not guessed.** With the type off
`data-reveal-item`, the buttons and dashboard would otherwise race the heading.
`delay={0.3}` on `<Reveal ... immediate>` holds them behind it; the lede's lines
carry `delay: 0.18` so they overlap the heading rather than follow it —
end-to-end sequencing would run the entrance to ~1.4 s. Measured from the first
frame after load at 1280: heading and lede settle at **756 ms**, buttons at
**790**, dashboard at **873**. The parent build's same landmark (the dashboard,
last item in both) is **808 ms**, so the entrance is **+8.0 %**, inside the
±20 % budget.

#### Impact

`/` is **pixel-identical** in its settled state at 375 / 800 / 1280 (`magick
compare -metric AE` = **0** at 5 % fuzz against a worktree build of the parent
commit) and its page heights are unchanged at **6350 / 6006 / 5595**. Every hero
box — `h1`, both line spans, the lede, the button row — measures identical to two
decimal places at all three breakpoints.

It is the only route whose prerendered HTML changes, and its only content diffs
are the three attributes (`data-reveal-item` → `data-hero-split="words"` ×2 and
`="lines"` ×1) plus the new `HeroText` client reference and the page chunk
rename. The other 15 pages are byte-identical once the build id and the CSS chunk
name are normalised, and **every one keeps an identical chunk set** — SplitText
does not leak, because nothing outside `home/` imports `register.ts`.

Under reduced motion **nothing splits at all** (`childSpans = 0` on all three
elements), 0 of 28 reveal targets sit below full opacity and every bar reads
scaleY 1; with JavaScript off the `scripting: enabled` gate never applies and the
hero is at rest as the server sent it.

**Do not add `text-wrap: balance` anywhere in the hero** — it interferes with
splitting. **SplitText does not support SVG `<text>`**, so it may never be
pointed at the journal mark or the footer wordmark.

### The Capabilities section — four behaviours, and a vocabulary override

Prompt 22, from six user screenshots (`~/Pictures/Screenshots/Screenshot_20260805_2136{47}`,
`_2144{31,711}`, `_2150{46}`, `_2200{55}`, `_2203{29}.png`), each circling one
element. Four land in this section's photograph and metric card; two are the
journal row thumbnails, below.

**This section is a deliberate exception to everything "Homepage motion" records
about the vocabulary**, at the user's explicit request — the same kind of
override as the seal's offsets and the 20 % speed-up. It adds:

- **the site's only scrubbed ScrollTrigger** (the cloth), against "nothing is
  scrubbed… no parallax";
- **two `repeat: -1` loops** (the counter, the asterisk), against "once, on
  enter";
- **the site's second and third JS-driven hovers**.

Do not "fix" any of these back to the shared vocabulary. Nothing else on the
page became scroll-linked, and there is still no pinning and no `ScrollSmoother`.

**`home/capability-visual.tsx` is the section's only client module**, and the
`<Image>` **arrives as `children`** so `capabilities.tsx` stays a server
component and `next/image` never reaches the client bundle — the device `Reveal`
and `HeroText` already use. Keep it **component-only**: a constant or type
exported from here and imported elsewhere drags GSAP into that page's bundle,
the rule that forced `PRINCIPLES` out into `principles-data.tsx`. One `useGSAP`,
one `gsap.matchMedia()` with the named `reduceMotion` / `fullMotion` / `hasHover`
trio, `mm.add(…, root)`, `mm.revert()` as cleanup, `DUR` / `EASE` from
`register.ts`.

**The drift is on an inner wrapper, never on the `data-reveal-item` box.**
`Reveal`'s stagger tween writes `y` on that box and the two would fight. The
outer box keeps `data-reveal-item`, so the section's stagger is still **7 items**
(h2, image box, 4 `li`, button), and it gains `overflow-hidden` to clip the
drift — safe here, since the recorded "nothing in this chain may become
`overflow-hidden`" warnings are about the `Seal`'s and the journal mark's
ancestors, both in other sections.

**The cloth falls on two nested wrappers, and the scrub alone was not enough.**
The first cut shipped only the scrubbed parallax, and the user rejected it: a
scrub moves only while the reader is *actively scrolling*, so a reader who has
stopped to look at the card sees a still photograph. The falling has to be
autonomous. So the outer wrapper takes the scroll parallax (`yPercent -4 → 4`,
`scrub: 0.6`, `start: "top bottom"`, `end: "bottom top"`) and an inner one
carries a continuous drift. **Two wrappers, not one** — sharing an element would
make the two tweens fight over its transform.

The fall is three yoyoing tweens on **deliberately coprime-ish periods — 3.5 /
5.5 / 6.5 s** (`yPercent 6`, `xPercent 1.8`, `rotation 1.1`, all `sine.inOut`).
Their compound period is minutes long, so the cloth never visibly repeats and
never lines up into an obvious bounce; that is what makes a looping drift read as
organic rather than mechanical. `sine` because a falling cloth decelerates into
each turn. The timeline is `seek(1.75)` at build so the cloth is already mid-sway
the first time the section scrolls in, and it joins the same on-screen gate as
the counter and the spin.

**The periods are one 7 : 11 : 13 ratio, halved — keep the ratio.** They shipped
first at 7 / 11 / 13 s with `yPercent 2` / `xPercent 1.5` / `rotation 1`, and the
user asked for the fall to be more visible and faster (prompt 23). Halving every
period preserves the coprime structure exactly; a round "make everything 2 s"
would destroy it and the cloth would visibly bounce. `seek` halves with them, so
the entry phase is unchanged. Vertical travel is 3× and every period is half, so
peak vertical velocity is **6×** the original.

**The overscan is asymmetric CSS insets — `-inset-x-[4%] -inset-y-[16%]` — and
the two numbers are not the same kind of number.** It shipped first as a uniform
`gsap.set(scale: 1.16)`, and the user reported the photograph looking blurry. A
uniform scale makes the image paint 16 % wider than its box, and `Image-3.png` is
only **768×768**: at 800 that pushed the required source width to 884 and visibly
softened it.

- **The x inset is a hard resolution ceiling.** The box is wider than it is tall,
  so `object-fit: cover` scales by *width* and the rendered width — hence the
  srcset candidate — depends on the x inset alone. 4 % puts the render at
  **1.083×** the box, which is what keeps desktop inside the 750w candidate.
  Raising it re-softens the source. Do not.
- **The y inset is free up to 16.02 %, and no further.** At `-inset-y-[16.02%]`
  the wrapper is 1.3204H tall against 1.08W = 1.3204H wide — exactly square, the
  point where cover flips to scaling by height and the rendered width starts to
  grow. 16 % sits on that ceiling, and that is what buys the fall its 6 % of
  travel. Verified after the change: rendered/box is **1.083× at 375, 800 and
  1280**, unchanged, and `currentSrc` is still the `w=750&q=90` candidate at 1280
  and 375.

**`object-fit: cover` clips — the source's overhang is not spare coverage.**
Prompt 23 originally budgeted an extra `(1.3204 − 1.22)/2 = 0.0502H` of margin
from the image overhanging its box. It does not exist: cover crops to the element
box, so the only coverage the fall can spend is the inset itself. At the old
11 % the requested `yPercent 6` would have overrun it (0.1220H of travel into
0.1100H of margin) and the cloth's top edge would have entered the frame. The
0.0502H was converted into real inset instead, which is where 16 % comes from.

**The budget, per side.** `W`, `H` are the root box (aspect 692:566); the wrapper
is `1.08W × 1.32H`; the rotation term is the half-side × `sin θ`, the coverage the
leading corner of an edge gives up.

| | available | consumed |
| --- | --- | --- |
| vertical | `0.16H` | parallax `0.04 × 1.22H` + fall `0.06 × 1.22H` + `0.66H·sinθ` = **`0.1347H`** |
| horizontal | `0.04W` | fall `0.018 × 1.08W` + `0.499W·sinθ` = **`0.0290W`** |

Measured spare, worst case: **6.9 / 15.8 / 12.2 px** vertical and **3.7 / 8.4 /
6.5 px** horizontal at 375 / 800 / 1280. Horizontal is the binding constraint, so
the x-sway and the rotation are held small. **More travel is not a reason to
raise an inset** — solve it against this table, and if it will not fit, it will
not fit.

Verified by forcing the composite worst-case transform onto both wrappers with an
`!important` rule (five phase combinations × three breakpoints) and comparing the
`<img>` rect against the root's: no edge enters the frame at any of them. Note
`getBoundingClientRect()` returns the *axis-aligned* box of a rotated element and
so overstates corner coverage — take the rotation term from the table, not from
the rect.

**`sizes` must advertise the *rendered* width, not the box.** This is the trap
that made the image soft in the first place. The wrapper overscans, so the image
paints larger than its container, and `sizes="…, 620px"` had the browser pick
the **640w** candidate for a 637px render — right at the edge, and at 1.16× it
was a genuine upscale. It now reads `(max-width: 1024px) 116vw, 720px`. Measured
after the fix: **1280@1x renders 637 CSS and is served 750px — sharp**; 375
renders 363 and is served 750 — sharp.

**The 768×768 source is a hard ceiling, and two cases still sit under it**: 800
upscales ×1.07 and a 2× display ×1.66. Neither is fixable from here — the box at
800 is 760 CSS wide against a 768px source, so *any* overscan upscales, and that
was true before this work too. Replace the photograph if a larger one turns up;
do not chase it with `sizes`.

**`quality={90}` needs `images.qualities` in `next.config.ts`.** Next 16 defaults
that allowlist to `[75]` and **silently coerces** any other value to the nearest
allowed entry — the prop appeared in the source and the built srcSet still read
`q=75`, with no warning anywhere. The config now allows `[75, 90]`. 90 is used by
this one image, because the sky is a wide smooth gradient and that is exactly
what a low WebP quality smears; `q=90` appears on `/` and on no other page.

**The card leans; it does not flip.** `rotationY: 0 → 20` with
`transformPerspective: 900`. "Flip horizontally to the right" is read as the
right edge receding — a **positive** `rotationY`. A full 180° was rejected
because **no comp draws a back face**, and a 360° turn leaves the numbers
edge-on and unreadable mid-spin. `transformPerspective` is required, not
decorative, for the reason `journal-mark.tsx` records. Paused `fromTo` driven by
`play()` / `reverse()`, built inside `contextSafe`, so a mouse-out mid-flight
unwinds along the same curve. Measured: rest `matrix3d(1,0,0,0,…)`, hovered
`matrix3d(0.939693, 0, -0.34202, …)` — `cos 20°` exactly — and an exact return
to rest.

**The asterisk turns once per 9 s**, `ease: "none"`, `repeat: -1`,
`transformOrigin: "50% 50%"`. GSAP resolves an SVG element's transform origin
itself; do not hand-author a `transform-box`. Measured at 40°/s, i.e. 9 s/turn.

**The reading and its delta come off one proxy, and that is the point.** The
delta is derived from the tween — `(current − prev) / prev × 100` — so the arrow
*is* the direction the value is travelling and cannot disagree with it. The tween
is monotonic within a step, so the sign is constant and the arrow never flickers.

```
READINGS = [583.7, 611.2, 548.9, 604.5, 666.3, 583.7]
```

**The sequence starts and ends on 583.7**, so `repeat: -1` is seamless and the
loop rests on the value the comps draw. **666.3 is load-bearing**: the final step
`666.3 → 583.7` is −12.39 %, which reproduces the comp's `↓12.4%` exactly. All
six are three digits plus one decimal, so the advance width never changes step.
`0.7` s per sweep on **`power2.inOut` — deliberately not `EASE`**, which never
accelerates and so cannot read as a speedometer — then a `1.2` s hold.

**The colour ramp has no design-system token, on purpose.** `#2683EB` is exactly
`--color-accent` (the `Seal`'s precedent for an inline hex with that note); the
red end is **`#D7263D`**, blue at or below zero and fully red at **+12 %**. It
exists for this one element and a token would invite it being reused as a
semantic colour it has never been fitted for.

Two mechanics that are easy to miss:

- **`tabular-nums` on both readouts.** Without it the value shifts horizontally
  as its digits change. The `MWh` span is a **sibling** of the number, so the
  tween writes the number's own node — hence the extra `<span>` around `583.7`.
- **`↑` renders in the shipped mono cut**, checked at 1280 at 500 % against `↓`:
  same weight, same stroke, a real matching glyph pair, not a fallback. That was
  worth checking — `AGENTS.md` records the nav `→` shipping from an arbitrary
  fallback because Archivo lacks it. If either arrow ever loses its glyph, both
  become a drawn SVG.

**Both loops start paused** and are played/paused by one
`ScrollTrigger.create({ start: "top bottom", end: "bottom top", onToggle })`.
That gate is the whole reason a continuous loop is affordable here. Verified: at
scroll 0 the value is still `583.7` after 1.5 s and the asterisk's transform is
`none` at all three breakpoints.

**Reduced motion gets nothing at all** — no tween, no timeline, no listener, no
ScrollTrigger; the branch returns immediately. Nothing needs restoring because
nothing was ever hidden: every element here is visible and correct at rest, so
`globals.css` needed no new start-state rule. Verified under `reduce` **and**
with JavaScript off: `583.7`, `↓12.4%`, **no inline `color` written at all**,
and `transform: none` on the asterisk, the cloth and the thumbnails.

#### Fix — `contextSafe` inside a `matchMedia` handler makes two contexts
reference each other

**The lean tween shipped built through `contextSafe` and it crashed the page on
any client-side navigation away from `/`** —
`RangeError: Maximum call stack size exceeded` out of `Context.getTweens`,
reported as a Next.js runtime error pointing at `<CapabilityVisual>` in
`capabilities.tsx:30`. Reproduced by clicking `/` → `/journal`; the error fires
on **unmount**, so the homepage itself looked fine and only leaving it threw.
The `Invalid scope` spam, the `GSAP target null not found` on `float.current`
and the `float is not defined` trace in the same terminal were **stale
Fast-Refresh state from before `ddbd74f`, not separate bugs** — they do not
reproduce on a clean load.

**The mechanism, from the source.** `Context.add`'s wrapper opens with
`prev && prev !== self && prev.data.push(self)`
(`node_modules/gsap/gsap-core.js:3925`). When `mm.add`'s condition first
matches, that line runs with the outer `useGSAP` context as `prev`, so the
matchMedia's inner context lands in the outer's `data` — correct, and how
nesting is meant to work. Calling `contextSafe` **from inside that handler**
then runs the *same* line the other way round: `contextSafe` is bound to the
outer context, the inner one is live as `prev`, so the outer gets pushed into
the inner's `data`. The two now point at each other, and `getTweens` recurses
over `data` with no cycle guard (`:3949`), so the next `revert()` blows the
stack.

Anything created synchronously inside an `mm.add` handler is already inside a
live context and is already reverted by `mm.revert()` — wrapping it is not
belt-and-braces, it is the bug.

~~**The rule: `contextSafe` is for callbacks that fire *after* the hook has
returned, never for work done inline.** `journal-mark.tsx` keeps its
`contextSafe` correctly: it calls `buildHover` from the entrance tween's
`onComplete`, on a later tick, with no context active (`prev` is null, so the
line never fires).~~ **Both sentences are wrong**, and the exemption crashed
`/journal` the same way — see "Fix — the journal mark's `contextSafe`" below
for the corrected rule and the measurement that overturns them.

Verified after the fix at 1280 on the dev server: **four `/` ⇄ `/journal`
round trips with no page error**, and all four behaviours still live — drift
`matrix(1,0,0,1,0,2.16)`, fall `matrix(0.999984, 0.00563, …)`, asterisk
`matrix(0.5, 0.866, …)`, counter running (`611.2 ↑4.7%` → `548.9`), hover
`matrix3d(0.939693, 0, -0.34202, …)` = `cos 20°` exactly and an exact return to
rest. `Image-3.png` serves at `w=750&q=90` with no `images.qualities` warning,
so `next.config.ts`' allowlist is working — that warning in the terminal was
only ever the pre-restart bundle.

**The returned JSX is untouched**, so no route's prerendered HTML changes; only
the homepage's client chunk does. `npm run lint`, `npm run typecheck` and
`npm run build` all clean.

#### Fix — the journal mark's `contextSafe`, and the corrected rule

Prompt 26. **The exemption above was wrong and `journal-mark.tsx` crashed the
same way** — navigating `/` → `/journal` after the mark's entrance flip had
completed threw `RangeError: Maximum call stack size exceeded` out of
`JournalMark`, `at Array.forEach`, on Next.js 16.2.12.

**The discriminator is the flip, and it is what points at `buildHover`.** Two
scripted variants at 1280:

| variant | result |
| --- | --- |
| scroll the whole page so the flip fires and completes, wait, then navigate | **`PAGEERROR: Maximum call stack size exceeded`** |
| navigate immediately, mark never revealed | **no errors** |

`gsap-core.js` was then patched temporarily to log every `prev.data.push(self)`
in `Context.add`'s wrapper with both context ids and a stack (and **restored
from a backup afterwards** — nothing under `node_modules/` ships). Two lines
are the cycle:

```
CTXPUSH prev#17 <- self#32   MatchMedia.add ← JournalMark.useGSAP     (normal nesting)
CTXPUSH prev#32 <- self#17   JournalMark.useGSAP ← _callback ← Tween.render
```

`#17` is the outer `useGSAP` context, `#32` the inner `matchMedia` one. The
second push puts the outer inside the inner's `data`, which is already inside
the outer's — and `Context.getTweens` recurses over `data` with no cycle guard
(`:3949`), so the `revert()` on unmount blows the stack. The user's
`Array.forEach` frame is that recursion.

**Why "a later tick, with no context active" is false.** `_callback`
(`gsap-core.js:981`) does `context && (_context = context)` before invoking the
callback, where `context` is `animation._ctx` — the context the tween was
*created* in. **Every GSAP callback runs with its creating context active**, on
whatever tick it fires. So inside the entrance tween's `onComplete`, `prev` is
`#32`, not null.

**The corrected rule: `contextSafe` is only safe where no gsap Context is
active. A tween's own `onStart` / `onUpdate` / `onComplete` is not such a place,
and neither is anything synchronous inside an `mm.add` handler.** In this
codebase that leaves **no legitimate use of `contextSafe` at all** — it appears
nowhere in `app/` today, only in comments explaining why.

**The fix is to build the hover tween eagerly**, inside the `mm.add` handler
alongside the entrance tween, with no `contextSafe` anywhere. Nothing about it
depended on the entrance having landed: it is `paused: true` with
`immediateRender: false`, and its `fromTo` start vars are *authored literals*
(`rotation: REST_ROTATION`, `rotationY: 0`, `transformPerspective: 800`) rather
than values read off the element. **The listener binding stays gated on the
flip's `onComplete`**, so the documented behaviour is unchanged — hovering
mid-flip still does nothing, because the tween exists but nothing can reach it.
`REST_ROTATION`, `HOVER_ROTATION`, `HOVER_ROTATION_Y`, `DUR * 0.7`, `EASE`, the
four named conditions, the entrance tween and **the returned JSX** are all
untouched. This is a lifecycle fix, not a motion change.

##### Measured after the fix

Production build at 3001 against a worktree build of `528914f` at 3002.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `display` | `none` | `block` | `block` |
| resting rect | `0×0` | **`307×184`** | **`421×252`** |
| resting inline | — | `perspective(800px) rotate(-8deg)` | same |
| hovered | no tween, no listener | `rotate(-45deg) rotateY(12deg)`, `304×304` | `rotate(-45deg) rotateY(12deg)`, `416×416` |
| after mouse-out | — | exactly `rotate(-8deg)`, `307×184` | exactly `rotate(-8deg)`, `421×252` |
| interrupted at 150 ms | — | `rotate(-39.63) rotateY(10.26)` → rest | `rotate(-41.06) rotateY(10.72)` → rest |

The resting matrix is **unchanged and exact** at 800 and 1280 —
`matrix3d(0.990268, -0.139173, 0, 0, 0.139173, 0.990268, 0, 0, 0, 0, 1,
-0.00125, 0, 0, 0, 1)`, the 2D block `cos/sin 8°`. A `pointerenter` dispatched
mid-flip leaves the mark at rest, so the gate holds. Under
`prefers-reduced-motion: reduce`: `opacity: 1`, computed `rotate: -8deg` still
present, **no inline transform written at all**, hover inert.

**Four `/` → `/journal` round trips and four `/` → `/about` round trips, each
with a full scroll pass first: zero page errors and zero console errors.**

**No route's prerendered HTML changes.** 15 of 16 pages are byte-identical once
the build id and the CSS chunk name are normalised, and `/` is identical too
once the **`.js`** chunk names are normalised as well — its only diffs are the
renames. Every route keeps its chunk set (`/` and `/journal` 10, the other 14
nine). Page heights unchanged at **6350 / 6006 / 5595**, and `/` is
pixel-identical **outside the capabilities cloth box** at all three widths
(`AE` 0), with 0 / 69 / 0 differing pixels inside it — the scrubbed cloth at a
different phase.

**Settle for 6 s before the `fullPage` shot, not 2.5.** At 2.5 s the first pass
read `AE` 272 outside the box at 375, all of it at y 6278–6330 — the footer's
split words, which are authored to take **3.02 s**. It is not a regression and
it is not the cloth; it is the shot being taken mid-animation. Re-shot at 6 s
it is 0.

### The journal rows' thumbnails

**CSS, not GSAP** — `journal.tsx` stays a server component. The image gains a
`<span className="block overflow-hidden">` wrapper to clip against, and
`transition-[scale,filter] duration-300 ease-in-out group-hover:scale-110
group-hover:grayscale motion-reduce:transition-none`.

- **`duration-300 ease-in-out` is reused, not refitted.** It is the curve already
  measured off the reference recording for these rows' slide and title fade.
- **The transition list names `scale`, not `transform`.** Tailwind v4 emits
  `scale-110` as the independent `scale` property — checked in the built
  stylesheet, `.group-hover\:scale-110{…scale:var(--tw-scale-x) var(--tw-scale-y)}`
  — the same mechanic already recorded for `translate-x-2.5`. A
  `transition-[transform]` would silently not animate it.
- `grayscale` compiles to the `filter` property, and Chrome interpolates from an
  absent `filter` to `grayscale(100%)` as identity → 100 %.
- v4 already wraps `group-hover:` in `@media (hover:hover)`, so nothing sticks on
  touch and no guard is authored.

Measured at 375 / 800 / 1280: rest `scale: none, filter: none` → hover
`scale: 1.1, filter: grayscale(1)` → back to `none` on leave, with no layout
shift (see the AE below).

**`cards.tsx` / `ArticleCardStacked` was deliberately left alone**, the same call
already recorded for the row hover: it carries this thumbnail on `/journal`, the
article recent-articles band and `/design-system`, all fitted against their own
comps, and no reference covers them.

#### Impact

`/` page heights are **unchanged at 6350 / 6006 / 5595** and the capabilities
image box is geometrically identical to the parent build (`335×274+20+903` /
`760×622+20+1125` / `588×481+24+1346`).

**`magick compare -metric AE` at 5 % fuzz is `0` outside that box at all three
breakpoints.** It is *not* 0 inside it, and that is correct rather than a
regression: the parent build's cloth is static, this one's sits wherever the
scrub puts it (1.0–1.3 % of the box's pixels). **Report this scoped, never as a
bare page AE** — a whole-page number here reads as 1208 / 4876 / 3066 and means
nothing.

`/` is the only route whose prerendered HTML changes; its content diffs are the
`overflow-hidden` + drift wrapper, the `<span>` around `583.7`, `tabular-nums` on
both readouts, and the three journal image wrappers with their class strings.
The other **15 pages are byte-identical** once the build id and the CSS chunk
name are normalised, and **every page keeps an identical chunk set** — `/` still
has 10 and the rest 9, so `CapabilityVisual` bundled into the existing page chunk
and no GSAP leaked.

**Prompt 23's amplitude and speed change measures the same way.** Page heights
stay 6350 / 6006 / 5595 and the image box stays `335×274+20+903` /
`760×622+20+1125` / `588×481+24+1346`. Scoped `AE` at 5 % fuzz is **`0` outside
the box at all three** and 295 / 1629 / 854 inside it (0.30–0.34 % of the box's
pixels) — the cloth at a different phase, not a regression. **15 of 16 pages are
byte-identical** and `/`'s only content diff is the one class attribute
(`-inset-y-[11%]` → `-inset-y-[16%]`) plus the page-chunk rename; every page
keeps its chunk set (`/` still 10). The lean still measures `cos 20° =
0.939693` and returns exactly to rest, the asterisk still turns at 40 °/s, the
counter still runs the six readings to `583.7 ↓12.4%`, the on-screen gate still
holds the fall paused at scroll 0, and reduced motion still writes no transform
at all.

# Site-wide affordances

## The pointer cursor on buttons

**Tailwind v4 removed v3's Preflight rule `button, [role="button"] { cursor:
pointer }`.** Confirmed against the installed copy, not from memory:
`tailwindcss` here is **4.3.3** and `node_modules/tailwindcss/preflight.css`
carries only the Safari spinner note at `:384` — no `cursor` on `button`. So a
`<button>` fell back to the UA's `cursor: default` and stopped advertising
itself as clickable. The rule is authored back in `app/globals.css`, directly
after the `body` block:

```css
@layer base {
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

- **`@layer base`, so any future `cursor-*` utility still wins.**
  `node_modules/tailwindcss/index.css:1` declares
  `@layer theme, base, components, utilities;` — utilities come last.
- **`:not(:disabled)` is load-bearing**: a disabled control must keep the
  default cursor. The site's currently *inert* buttons (the `/careers`
  open-application "Apply now", the job listings' closing Apply) are not
  `disabled` — they are enabled buttons with no handler — so they do get the
  pointer. That matches the request; the honest fix for those is a destination,
  already flagged above for both Apply buttons.
- **`a[href]` needs no rule** — the UA stylesheet already gives it a pointer,
  and every link in the tree has an href (`next/link` always emits one; the
  only literal anchor is the `mailto:` in `about/sections.tsx`). The fix is
  deliberately scoped to `button` / `[role="button"]`; `[role="button"]` is in
  for completeness and nothing uses it today.

**CSS-only — no component file was edited.** Verified by building the working
tree twice, once with the block removed: **all 16 prerendered pages are
byte-identical** once the build id and the CSS chunk name are normalised, so
every JS chunk name is literally unchanged and no chunk set moved. Renders are
untouched by construction — the HTML is identical and `cursor` paints nothing —
so no screenshot comparison was run.

The rule survives Lightning CSS into the built stylesheet as
`button:not(:disabled),[role=button]:not(:disabled){cursor:pointer}`, sitting
immediately before `@layer components` — i.e. still inside `base`.

Measured in the production build, `getComputedStyle(el).cursor`:

| page | element | before | after |
| --- | --- | --- | --- |
| `/` @375 | mobile menu `<button>` | `default` | **`pointer`** |
| `/` @1280 | nav links, "Get started", journal row links, footer nav | `pointer` | `pointer` |
| `/careers` | inert "Apply now" `Button` | `default` | **`pointer`** |
| `/careers` | role card `ButtonLink` | `pointer` | `pointer` |
| `/job-listing/data-scientist` | top Apply `ButtonLink` | `pointer` | `pointer` |
| `/job-listing/data-scientist` | closing inert `Button` | `default` | **`pointer`** |
| `/about` | `mailto:` anchor, "Meet the team" | `pointer` | `pointer` |
| `/design-system` | all six `<button>`s | `default` | **`pointer`** |
| `/journal` | all six card links | `pointer` | `pointer` |

**`cursor` is an inherited property, so a naive negative check reads wrong.**
Enumerating every element with computed `cursor: pointer` on `/` returns
`{A, SPAN, IMG, DIV, H3, P, svg, path}` — the spans and images are *inside*
anchors. Resolve each hit to `el.closest('button, [role="button"], a[href]')`
instead; the tag set is then exactly `{A, BUTTON}` on all seven pages probed,
with no unattributed hit anywhere.

**Aside, harmless:** the built stylesheet also contains a `.cursor-pointer`
utility. Nothing in `app/` uses it — v4's automatic content detection picked the
class name out of the prose in `prompts/25-*.md`.

# Site motion — `/journal`, the article cards, and the footer

Prompt 24. Three pieces from one request, and the first work that puts motion
**outside `/`**. Everything in "Homepage motion" above still describes the
homepage correctly; what changes here is the scope, and one invariant.

## `journal.webm` contains no animation — it constrains nothing

`public/design-ref/animation-ref/journal.webm` (1263×571, ~50 s) is a scroll
pass down `/journal`. **It is a walkthrough of the current, unanimated page
recorded on `localhost:3000`** — the "Spectacle is Recording" badge is in frames
1–4 — not a designer's prototype. Sampled at 1 fps across the whole pass and at
12 fps across the two entry beats (t≈10–14 s, the article grid; t≈26.5–31 s, the
CTA band and footer), every element is fully opaque and at its final position
the instant it crosses the fold.

**So no number below is fitted to it, and no later session should re-do that
sampling.** The `/journal` reveals are the site's existing `DUR` / `EASE` /
stagger, unchanged.

## `/journal`'s reveals

The existing `Reveal` (`motion/reveal.tsx`), used as-is; no new motion component,
and `DUR` / `EASE` are not restated. `journal/sections.tsx` **stays a server
component** — `children` arrive as a prop, so its `next/image` never reaches the
client bundle. `Reveal`'s `as` union gained `"h2"`, which is inert.

- `JournalStamp`'s wrapper is `<Reveal immediate …>` — it is above the fold at
  scroll 0 at every breakpoint, the same call the hero makes.
- `LatestArticles`' `<h2>` is `<Reveal as="h2">` rather than a wrapping `div`,
  so no box is added and its `mt-6` margin cannot collapse differently.
- **Each card gets its own `Reveal`, not one `stagger` over the section, and
  that is measured rather than stylistic.** The grid is ~3000 px tall at 1280,
  so a single section trigger at `top 88%` would run all six cards while four
  are still far below the fold. `delay={i % 2 === 1 ? 0.08 : 0}` reproduces the
  sibling stagger *within a row* while each row still waits for its own trigger.
  Verified in the render at 1280: scrolled to 700, the h2 and the first four
  cards read `opacity: 1` while the cards at viewport-top 1200 and 1876 are
  still at **`opacity: 0`**; all nine targets settle at 1.
- `CtaBand` is wrapped **at the call site in `app/journal/page.tsx`**, exactly as
  `app/page.tsx` does it. `chrome.tsx`'s `CtaBand` is not edited.

## The article cards' hover zoom

One change in `ArticleCardStacked` (`cards.tsx`), which feeds `/journal`, the
`/article/[slug]` recent-articles band and `/design-system`. **This closes the
"cards.tsx was deliberately left alone" exception** recorded twice above — the
user took that decision explicitly ("Zoom in all the article images on hover in
a beautifully animated way").

The `<Image>` gains a `<span className="block overflow-hidden">` clip box — the
device the homepage journal thumbnails already use — and
`transition-[scale] duration-500 ease-in-out group-hover:scale-105
motion-reduce:transition-none`.

- **`ease-in-out` is measured; 500 ms and 5 % are judgements.** The curve is the
  one already fitted off `home-journals.webm` for these rows (linear and
  `ease-in-out` tied at the top of a five-curve fit; Tailwind's `ease-out` was
  the worst). The duration is not fitted: the homepage thumbnails run 300 ms
  across a 164 px box and this box is 612×356 at desktop, where the same 300 ms
  over ~4× the travel reads snappy rather than "beautifully animated". Say
  judgement, not measurement, if this is ever revisited.
- **`scale-105`, not the thumbnails' `scale-110`.** 10 % of a 612 px image is
  61 px of edge travel against 16 px on the thumbnail; 5 % lands at ~31 px.
- **`transition-[scale]`, never `transition-[transform]`.** Confirmed in the
  built stylesheet, not from memory:
  `.group-hover\:scale-105{…scale:var(--tw-scale-x) var(--tw-scale-y)}` — the
  independent `scale` property, the mechanic already recorded for
  `translate-x-2.5` and `scale-110`. v4 also wraps `group-hover:` in
  `@media (hover:hover)` for free (verified), so no touch guard is authored.
- **No grayscale.** The homepage rows desaturate because that was measured off a
  recording; nothing covers these cards and the ask was a zoom.
- The `group` class only exists on the `<Link>`, so the hrefless
  `/design-system` sample is unchanged apart from the wrapping `<span>`.

Measured at 375 / 800 / 1280: rest `scale: none` → an intermediate 1.018–1.023
mid-transition → `1.05` → back to `none`, with **no layout shift** (page heights
unchanged and `AE` 0 in the settled state).

## The footer's split blur-in — `motion/footer-reveal.tsx`

New client leaf, imported by `chrome.tsx`. It renders the `<footer>` itself and
takes its class string over via `className`, so the settled footer gains motion
and **not a single box**. The three markers — `data-footer-split` on each nav
`<a>` and on the `©` `<p>`, `data-footer-wordmark` on the wordmark `<svg>` — are
inert attributes; no geometry, class string or element changed. Keep the file
component-only.

- **`type: "words"`, not `chars`.** 12 blurred layers against ~60; an animated
  `filter: blur()` repaints every target's layer every frame.
- **`data-footer-split` is per-link, not on the `<nav>`.** With `aria` at its
  default `"auto"` SplitText labels the element it splits and hides the pieces,
  so splitting the `<nav>` would strip every link of its accessible name.
  Verified with `page.locator("footer nav").ariaSnapshot()`: five links, each
  with its own name.
- **`FOOTER_DUR = 1.0` and stagger `0.12`** — roughly double `register.ts`'s
  `DUR 0.5` / `0.08`, a **deliberate slow departure at the user's request**
  ("do not make the animation speed for that fast"), in the same spirit as the
  seal's offsets. `EASE` is still imported, never restated. Blur is 10 px on the
  split words and 16 on the wordmark.
- **The wordmark is one element and can never be split**: SplitText does not
  support SVG `<text>`, and its `textLength="1013"` from `x="-1.6"` is the
  measured thing that holds the ink flush to both gutters at any viewport. It
  takes the same blur + fade + rise as a single target, starting at the split
  run's length less a 0.5 s overlap.
- `autoSplit: true` with the animation created inside and returned from
  `onSplit(self)`; `clearProps: "filter,display"` on the words, `"filter"` on
  the wordmark; **never `opacity` or `transform`**. The start state is
  `[data-footer-split], [data-footer-wordmark] { opacity: 0 }`, appended to the
  existing `(scripting: enabled) and (prefers-reduced-motion: no-preference)`
  block. **No `contextSafe`** — everything is created synchronously inside the
  `mm.add` handler, and wrapping that is the crash already on file.

### Two traps, both cost a build to find

- **`gsap.from` reads the element's *current* value as the tween's end value.**
  The wordmark's current opacity is the `0` the CSS start state pins it at, so
  `gsap.from(wm, { opacity: 0 })` animates **0 → 0** and the wordmark never
  appears — measured as `opacity: 0` inline and an ink count of literally 0 in
  the render, on every page. The split words escape it because they are fresh
  spans at their default opacity 1. **Any tween on an element that
  `globals.css` hides must be a `fromTo` with the end value authored.** This
  applies to `[data-reveal]`, `[data-journal-mark]` and `[data-hero-split]` too;
  those all happen to animate split children or use `fromTo` already.
- **One ScrollTrigger gating paused tweens, not a `scrollTrigger` per tween.**
  With `autoSplit` the split tween is destroyed and rebuilt on font load and on
  resize, and a rebuilt tween carrying its own `once: true` trigger would be
  waiting on a trigger that has already fired. A flag plus a pending `Set` means
  a tween created after the footer was entered simply plays at once. Same shape
  as the capabilities section's on-screen gate.

Measured on `/journal` at 1280: the footer settles **3024 ms** end to end
(authored 1.82 + 1.2 = 3.02 s), split word counts `1,1,1,1,2,6` = 12.

## The bundle invariant, rewritten

`chrome.tsx` reaches every route, so the footer leaf does too. **"No GSAP leak"
is no longer the rule** — the user chose site-wide motion explicitly ("Make
reflect on every page"). The rule that survives is narrower and still worth
keeping: **nothing outside `home/` may import `home/sections.tsx` or any
`home/` client module.** The leaf-import discipline stays; `motion/` is the
shared surface and the footer is the one module that reaches everywhere.

`/about` took `Reveal` the same way in prompt 30 — see "`/about`'s reveals"
below. With GSAP already in the shared chunk, its cost is +998 raw / +643
gzipped, which is why the chunk *count* moving 9 → 10 overstates it.

The measured cost, against a build of `729bfcc` in a sibling worktree:

| | chunk count | raw JS | gzipped JS |
| --- | --- | --- | --- |
| the 14 non-homepage, non-`/journal` routes | 9 → **9** | 653,000 → 775,793 (**+122,793**) | 195,380 → 242,879 (**+47,499**) |
| `/journal` | 9 → **10** | +123,791 | +48,142 |
| `/` | 10 → **10** | +1,370 | +509 |

**The chunk *count* is the wrong instrument here** — GSAP went into an existing
shared chunk (`047q64__4pyf_.js`, 25.6 KB, became `3k-8_no3bkb0l.js`, 148 KB /
56.7 KB gz) rather than adding one, so only `/journal`'s extra `Reveal` chunk
shows up as a count. Diff the chunk *bytes*, not the list length, when checking
this again.

## Impact

- **Every route's prerendered HTML changes**, and the diffs are exactly:
  the three footer data attributes, the `FooterMotion` client reference, the
  `<span>` wrapper plus image class string on every `ArticleCardStacked`, the
  `data-reveal` attributes on `/journal`, and chunk/build-id renames. Confirmed
  page by page with the scratchpad build-diff helper — nothing else moved.
  `_not-found` and `_global-error` are identical.
- **`AE` at 5 % fuzz is `0`** in the settled state at 375 / 800 / 1280 on
  `/journal`, `/design-system` and `/article/[slug]`.
- **`/` is pixel-identical outside the capabilities cloth box** (`AE` 0 at all
  three); inside it, 41.7 / 14.9 / 0 differing pixels — the scrubbed cloth at a
  different phase, exactly as the note above predicts. Never report a bare
  page-wide `AE` for `/`.
- Page heights unchanged everywhere: `/` 6350 / 6006 / 5595, `/journal`
  3801 / 5160 / 3486.
- **Reduced motion**: nothing splits (`childSpans` 0 on all six elements), every
  footer element at `opacity: 1`, 0 of 9 `/journal` reveal targets below full
  opacity, and the card hover reaches 1.05 in 30 ms. **JavaScript off**: the
  wordmark and the stamp render at their normal boxes, page at rest as the
  server sent it.
- Four `/` ⇄ `/journal` / `/about` round trips with **zero page or console
  errors** — the `contextSafe` crash class does not reappear.

## Non-goals held

The footer's geometry, type, colours, texture band and wordmark drawing are
untouched; its `href="#"` links stay `#`. No scrub, pin or parallax was added —
the capabilities cloth is still the site's only scroll-linked element. No file
under `app/_components/home/` was touched. `ArticleCardHorizontal` and
`ArticleCardCompact` are left alone.

## The journal stamp's perforation drift

Prompt 28. The user circled the stamp's **top and bottom perforation rows** in
`~/Pictures/Screenshots/Screenshot_20260806_140054.png` and asked for them to be
permanently in motion — the top travelling right, the bottom left. It is the
site's third continuous loop, after the capabilities asterisk and counter, and
it obeys the same on-screen gate.

**The loop is seamless because the spacing is uniform.** The perforations sit at
a constant pitch of `1240/25 = 49.6` user units, so translating a row by exactly
one pitch lands every circle where its neighbour started: the row at `t + CYCLE`
is pixel-identical to the row at rest and `repeat: -1` has no seam. No cloning,
no wrap bookkeeping, no modulo. **Verified, not assumed** — under
`prefers-reduced-motion: reduce` (no tween running), screenshotting the stamp at
rest and again with `transform="translate(±49.6,0)"` forced onto the two row
groups compares at **`AE` 0** at 1280.

**One circle per row is added beyond the drawn set, and it is required rather
than padding.** The right-moving top row carries one at `x = -pitch` so a
perforation enters the left edge as the leftmost one leaves; the left-moving
bottom row carries the mirror past the right edge. Both sit outside the viewBox
and are clipped by the SVG root, so **the rest state is pixel-identical to the
comp** — the comp's 26 per edge are still the 26 that are ever visible.

`app/_components/journal/stamp-perforations.tsx` — `"use client"`, the section's
**only** client module, rendered as a child of the existing `<svg>` so
`journal/sections.tsx` stays a server component and its `next/image` never
reaches the client bundle. Keep it **component-only**, the `principles-data.tsx`
rule. Geometry arrives as props (`width` / `height` / `count` / `r`) and the
pitch is derived inside the leaf, so the file and `sections.tsx`' comp-measured
constants cannot drift; `PERF_PITCH` no longer exists in `sections.tsx`.

**The tweens**: two `gsap.to`s, `x: ±pitch`, `duration: CYCLE`, `ease: "none"`,
`repeat: -1`, `paused: true`.

- **`CYCLE = 1.2` s per pitch** — ≈41.3 user units per second, ≈41 px/s at 1280.
  Three paces were offered (gentle 3.5 / moderate 2 / brisk 1.2); the user picked
  2, then asked for it faster having seen it run, so it ships at the brisk one
  rather than an invented number (prompt 29). A judgement, not a measurement;
  say so if it is ever revisited. **Speed does not touch the loop's
  seamlessness** — that is a property of the pitch, not of the duration.
- **`ease: "none"` is not a default being restated.** A conveyor must not
  accelerate — any easing makes the wrap read as a stutter.
- **`x` is in user units**, so the drift scales with the viewport for free,
  exactly as the rest of the stamp does. Nothing is sized per breakpoint, the
  `JournalStamp` discipline.
- Two tweens rather than one timeline with `yoyo`: the rows never reverse.
- **No `contextSafe`** — both are created synchronously inside the `mm.add`
  handler, and wrapping that is the documented `RangeError` crash.

**The gate is the capabilities `ScrollTrigger.create({ start: "top bottom", end:
"bottom top", onToggle })`**, on the outer `<g>` (which spans the full stamp
height, so it has a usable bounding box). It is what makes a `repeat: -1` loop
affordable. **Reduced motion gets nothing at all** — no tween, no ScrollTrigger;
the branch returns immediately. Nothing was ever hidden, so `globals.css` needed
no new start-state rule.

`Reveal` is untouched: it tweens `opacity`/`y` on the **wrapper div** while these
tweens write `transform` on `<g>`s inside the SVG. Different elements, and no
`clearProps` anywhere.

### Measured in the production build

Against a worktree build of `f0ad19f` **carrying prompt 27's uncommitted
`cards.tsx` patch**, so the comparison isolates this change alone.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| top row drift | **41.6 u/s** | **40.8 u/s** | **40.9 u/s** |
| bottom row | the exact negation at all three | | |
| stamp box | `335×129.67+20+60` | `760×294.19+20+60` | `1232×476.89+24+60` |
| page height | **3801** | **5160** | **3486** |
| gated off screen | transform frozen | frozen | frozen |
| reduced motion | no `transform` attribute written | none | none |
| JS off, stamp box | `335×129.67+20+60` | `760×294.19+20+60` | `1232×476.89+24+60` |

Top `x` rises and bottom falls, both wrapping inside `[0, ±49.6]`, against the
authored 41.33 u/s. The 2 s original measured 24.5 / 25.1 / 24.6 against its own
24.8, so the two builds are 1.67× apart as authored — **run the old build as a
control when re-measuring a speed change**, since the rate is sampled over a
window and carries ~2 % of jitter. Page heights and the stamp box are the
recorded numbers **unchanged**, with and without JS. Scrolling past the stamp
freezes both transforms; returning resumes them.

**Scoped `AE` at 5 % fuzz is `0` outside the stamp box at all three widths** —
at both speeds. Inside it, 450 / 2048 / 4308 at 2 s and 458 / 2311 / 6567 at
1.2 s (0.7–1.1 % of the box's pixels) — the rows at a different phase, exactly
as with the capabilities cloth. **Never report a bare page-wide `AE` for
`/journal` now**; report the two numbers separately.

**The speed change itself is a tween var, not markup**: all 16 pages are
byte-identical across it once the build id and the chunk names are normalised.

**`/journal` is the only route whose prerendered HTML changes**, and its only
diff is the perforation restructure: today's 26 per-index `<g>`s pairing a top
and a bottom circle become two row `<g>`s of 27 each. The other **15 pages are
byte-identical** once the build id and the CSS and JS chunk names are
normalised, and every route keeps its chunk set (`/` and `/journal` 10, the rest
9) — the leaf bundled into the existing page chunk.

Four `/journal` ⇄ `/` round trips plus a `/journal` → `/about` → back, each with
a full scroll pass: **zero page errors and zero console errors.**

## The article cards' hover fade — the last `group-hover:underline`

Prompt 27. `ArticleCardStacked`'s title carried `group-hover:underline`, which
snapped a solid underline on with no transition. It now fades the **title and
the description** instead, the idiom `home/journal.tsx` already ships. This was
the last `group-hover:underline` in `app/`; the site's only remaining
`hover:underline` is the job listing's "Back to Careers" prose link
(`job/sections.tsx:22`), which is out of scope.

**CSS-only, two class strings**, both gaining
`transition-opacity duration-300 ease-in-out group-hover:opacity-70
motion-reduce:transition-none`. `cards.tsx` stays a server component; no new
module, no client reference, no `globals.css` rule.

### What the reference shows — measured, not eyeballed

`~/Videos/Screencasts/Screencast_20260806_141143.webm` (1264×598) is the target;
`…_141027.webm` is the current behaviour. The recording is 1264 CSS px with no
browser chrome, so distances read as CSS pixels. Sampled at 10 fps over
t 7.5–12.0 s, box means in an 8-bit grey channel, boxes in full-frame coords:

| element | box | at rest | hovered |
| --- | --- | --- | --- |
| left title | `370x24+20+410` | 197.51 | **217.18** |
| right title | `545x24+640+410` | 196.65 | **215.99** |
| left description | `590x50+20+476` | 223.19 | **233.93** |
| right description | `565x50+640+476` | 231.45 | **239.10** |
| left / right meta | `200x16+…+441` | 240.73 / 240.82 | **240.89 / 240.99** |
| image interior | `580x300+30+70` | 197.52 / 94.52 | **197.53 / 94.49** |

**Exactly one card is light at a time, and it is the hovered one** — verified
against the cursor, not inferred. So no `:has()` and no container group.
**Meta and image are measured unchanged and are not touched.** Title ink height
and title x are constant: no underline, no slide.

**The fade fits 0.666 and ships as `opacity-70`.** Against a white field,
`α = (255 − dim) / (255 − rest)` gives 0.658 / 0.669 / 0.662 / 0.675 across the
four boxes. **Same evidence, same call as prompt 19** (which measured 0.67 on
the homepage rows and shipped `opacity-70`): one fade value site-wide.

**The timing is `duration-300 ease-in-out`.** Three transitions traced at full
frame rate and fitted over 150–500 ms, normalised SSE:

| curve | best duration (in / in / out) | SSE |
| --- | --- | --- |
| CSS `ease` (.25,.1,.25,1) | 335 / 355 / 390 ms | 0.0004 / 0.0011 / 0.0007 |
| linear | 210 / 225 / 250 ms | 0.0014 / 0.0008 / 0.0012 |
| **Tailwind `ease-in-out` (.4,0,.2,1)** | **290 / 315 / 345 ms** | 0.0030 / 0.0020 / 0.0020 |
| CSS `ease-out` (0,0,.58,1) | 280 / 300 / 325 ms | 0.0014 / 0.0024 / 0.0021 |
| Tailwind `ease-out` (0,0,.2,1) | 415 / 440 / 485 ms | 0.0069 / 0.0091 / 0.0088 |

CSS `ease` at ~360 ms is the nominal best fit; Tailwind's `ease-in-out` at
~300 ms is in the same band and is **the curve already fitted and shipped for
these rows' sibling behaviour on `/`**. 60 ms on an opacity fade is not
perceptible, so consistency wins. The alternative is on file above.

Four v4 mechanics, confirmed in the **built** stylesheet (`tailwindcss` 4.3.3):
`.transition-opacity{transition-property:opacity}`;
`.group-hover\:opacity-70…{opacity:.7}`, and walking the enclosing at-rules puts
it inside **`@media (hover:hover)`**, which v4 wraps for free — no touch guard
authored, and `matchMedia('(hover: hover)')` reads `false` in a touch context;
`@media (prefers-reduced-motion:reduce){.motion-reduce\:transition-none{transition-property:none}}`;
`--ease-in-out: cubic-bezier(.4, 0, .2, 1)` with `.duration-300{…:.3s}`.

### Measured in the production build

At **1264 wide on `/journal`**, scrolled so the first card's `h3` lands at
y 409.81 — within 0.2 px of the reference's box top, with the meta at 441.81
against 441 and the description at 475.81 against 476, i.e. **the render aligns
with the reference to under a pixel.**

| | rest | hovered | α |
| --- | --- | --- | --- |
| left title | 194.14 | 212.03 | **0.7060** |
| right title | 192.29 | 210.74 | **0.7058** |
| left description | 227.62 | 235.65 | **0.7067** |
| right description | 234.62 | 240.60 | **0.7066** |
| left / right meta | 240.76 / 240.61 | **unchanged** | — |

**Report α, not the absolute box means.** The meta boxes match the reference to
0.15 grey levels, but the title and description boxes carry different ink (our
copy wraps differently inside those crops), so their absolute means sit 3–4
levels from the recording's and are not comparable. α is crop-invariant, and it
lands at the authored 0.706 against the reference's 0.666 — **the deliberate
`opacity-70` rounding**, worth ~2.5 grey levels in the title box and ~1.1 in the
description box. That is the known cost of the prompt 19 call, not a miss.

`getComputedStyle` on the first card, `h3` and `p` alike: `1 → 0.7 → 1` across
`pointerenter` / `pointerleave`, with **0.791569 at 140 ms in** and 0.908537 at
140 ms out. 0.791569 is `1 − 0.3 × cubic-bezier(.4,0,.2,1)(140/300)` to six
places — the curve confirms itself. `text-decoration-line` is `none` in **both**
states. `Meta` opacity stays `1`; the image keeps its own `scale` `none → 1.05`.
Reduced motion: `transition-property: none` and the hover reaches `0.7` in
30 ms. On `/article/[slug]` and `/design-system` the same computed
`opacity / 0.3s / cubic-bezier(0.4, 0, 0.2, 1)` applies; `/design-system`'s
sample has no `group` link, so it is visually unchanged.

### Impact

- **Server-rendered markup is identical on all 16 pages** once the two class
  strings are substituted and the build id and chunk names normalised. Eight
  pages are **byte-identical without any substitution** — `/`, `/careers`,
  `/about`, all three job listings, `_not-found`, `_global-error`.
- The eight that change are `/journal`, the six articles and `/design-system`.
  **Their residual whole-file diff beyond the two class strings is RSC
  flight-payload row segmentation only** — the longer class strings shift where
  Next splits `self.__next_f.push(…)` rows, so row labels renumber. Strip the
  flight scripts and compare the markup to see through it; that is the cheap
  check, and it is now in section 3.
- **Every route keeps its exact chunk set and chunk names** — `/` and `/journal`
  10, the other twelve 9, the two error pages 8. No module added.
- Page heights unchanged: `/journal` 3801 / 5160 / 3486, `/article/[slug]`
  4583 / 4813 / 3633, `/design-system` 7887 / 7773 / 7243, `/` 6350 / 6006 /
  5595.
- `magick compare -metric AE -fuzz 5%` in the settled state, against a worktree
  build of the parent: **0 at 375 / 800 / 1280 on `/article/[slug]` and
  `/design-system`**, and **0 on `/journal` outside the journal stamp** (78 / 109
  inside it at 800 / 1280 — the perforation drift at a different loop phase,
  present in both builds). `/` is **0 outside the capabilities cloth box** at all
  three, with 68 / 0 / 155 inside it.

### Non-goals

- **The image zoom stays.** The reference shows no zoom, but
  `group-hover:scale-105` was shipped deliberately in prompt 24 at the user's
  explicit request. The recording is read as showing the *type* treatment.
- **No slide** — the homepage rows translate +10 px, the reference's card titles
  do not move.
- `ArticleCardHorizontal`, `ArticleCardCompact`, `Meta` and the job listing's
  prose `hover:underline` are untouched.

## `/about`'s reveals

Prompt 30 (the file is `prompts/30-about-page-motion.md`; it was drafted as 29
and renumbered on execution — 29 was already taken by the perforation speed
change). `/about` was the last content route with no motion of its own, and it
now carries the site's existing `Reveal` and nothing else: **no new motion
component, no new timing constant, no `globals.css` rule, no geometry change,
no asset.** `about/sections.tsx` **stays a server component** — `children`
arrive as a prop, so its `next/image` never reaches the client bundle.

### `about.webm` *does* contain motion — and it is not our build

`public/design-ref/animation-ref/about.webm` (1264×573, 20.517 s, one
continuous scroll pass, recorded on localhost). **Unlike `journal.webm`, which
constrains nothing, this one carries authored motion and it was measured.**

**But it is a different implementation of the same comps.** Connected
components on the settled values row (t = 8.667) gives the three cards as
`398x247+19+133`, `397x246+433+134`, `398x246+846+134`; ours render **276
tall** — the 48px icon-box deviation already recorded above under "About page".
So the recording matches the comp's card height where ours deliberately does
not. **Read it for motion only.** Every geometry, type and wrap difference
against it is out of scope and must not be "fixed". No later session should
re-derive this.

### What was measured, and how

**The rise is measured with an ink-weighted centroid, which is
opacity-invariant** — opacity scales every weight uniformly, so the centroid
does not move as an element fades — and therefore separates a rise from the
page's own scrolling. The reference landmark is a neighbouring element that has
already settled.

| block | channel | rise | window |
| --- | --- | --- | --- |
| values card 1 | icon centroid − "Our values" centroid | 152.1 → 117.9 = **34.2 px** | t 7.90 → ~8.45 |
| team table | first-row centroid − "Meet the team" centroid | 192.9 → 160.5 = **32.4 px** | t 12.00 → 12.40 |

32–34 px against `Reveal`'s authored **36 px** desktop rise. Opacity runs 0→1
over the same window (values-card icon ink mass 5 222 → 94 000; founder title
ink mass 210 011 → 974 400).

**There is no sibling stagger, and that *is* a departure from `/`.** The three
values cards' rise is identical **to within 0.7 px at every frame**:

```
h014  c1 144.3  c2 144.2  c3 144.6
h019  c1 131.3  c2 131.2  c3 130.5
h024  c1 121.9  c2 121.7  c3 121.1
h030  c1 117.9  c2 117.7  c3 117.1
```

At the measured ~72 px/s mid-tween, 0.7 px is **under 10 ms**, where `Reveal`'s
`stagger` prop puts **0.08 s** between siblings. So the values grid is **one
plain `<Reveal>`, never `<Reveal stagger>`.** Do not "improve" it with a
stagger.

**Blocks trigger separately, rather than one section trigger with a stagger.**
"Our values" fades in at t ≈ 6.95–7.15; its cards do not start until t ≈ 7.90 —
a ~0.75 s gap on a continuous scroll. Same shape on the team block: "Meet the
team" is settled by t = 11.3 while the table starts at t ≈ 12.0.

**The founder text is one group, not three staggered lines.** Eyebrow, title and
prose share the same α at every frame (0.247/0.244, 0.455/0.431, 0.627/0.606,
0.710/0.688, 0.773/0.769 title/eyebrow) and their mutual gaps are constant
throughout (eyebrow→title 36–37 px, title→prose 107 px). One target, one tween.

**Duration could not be resolved better than 0.5–0.7 s.** Fitting `power3.out`
frame by frame and solving for `D`:

| channel | fitted `D` |
| --- | --- |
| values-card rise (centroid, opacity-invariant) | 0.60 – 0.75 s |
| founder title opacity (ink mass) | 0.40 – 0.74 s, drifting |
| team-table rise | ~0.45 s |

**The fit drifts in every ease tried** (`power2/3/4.out`, `expo.out`). The
site's existing `DUR = 0.5` / `EASE = "power3.out"` / `y = 36` sits inside that
band on all three channels, so they were **reused, not refitted**. If this is
ever revisited: say "measurement could not separate 0.5 from 0.7", not "0.5 was
measured".

**What the recording could NOT resolve**, and so is not claimed:

- **The hero on load.** The load beat (t = 3.2–5.2 at 20 fps) is progressive SSR
  paint plus a font swap, with no readable fade. `AboutHero`'s `immediate` is
  therefore a **judgement** — the call `/`'s hero and `/journal`'s stamp both
  make for an above-the-fold block — not a measurement.
- **The portrait and the seal.** Both enter from the foot of the viewport at
  full opacity within ~2 frames of becoming measurable (blue-band mean stable at
  241/246/251 from t = 8.80). `AetherfieldSeal` gets no motion of its own; it
  rides the portrait column's `Reveal`.
- **The footer.** The reference's wordmark is solid the instant it crosses the
  fold. **Ours keeps prompt 24's split blur-in**, which reaches every route via
  `chrome.tsx` and was shipped at the user's explicit request.

### What ships

`Reveal`'s `as` union gained **`"table"`** — one word, inert, the same kind of
change `"h2"` was for `/journal`. It is what lets the team table animate
**without a wrapper box**, which a `<div>` around a `<table>` would not manage
cleanly.

Eight targets, all at `Reveal`'s default `start: "top 88%"`:

| element | shape |
| --- | --- |
| `AboutHero`'s `<section>` | `<Reveal as="section" immediate>` |
| "Our values" `<h2>` | `<Reveal as="h2">` |
| the values `<ul>` | `<Reveal as="ul">` — **no `stagger`** |
| the portrait column | `<Reveal className="relative">` |
| the founder prose column | `<Reveal>` — one target for eyebrow + title + prose |
| "Meet the team" `<h2>` | `<Reveal as="h2">` |
| the team `<table>` | `<Reveal as="table">` |
| `CtaBand` | wrapped **at the call site in `app/about/page.tsx`** |

`chrome.tsx` is **not** edited — the same call `app/page.tsx` and
`app/journal/page.tsx` make. The sky band in `page.tsx` is deliberately **not**
wrapped: it is a document-level absolute sibling and paints immediately, as the
recording shows.

**Known deviation, recorded not chased:** the reference's elements begin fading
at roughly **95–97 %** of viewport height (its "Our values" is already grey at
the viewport foot), i.e. its trigger sits ~50 px lower at that 573 px viewport.
Matching it would fork the site's one trigger constant for a single page.

`globals.css` needed no change — `[data-reveal] { opacity: 0 }` inside the
existing `(scripting: enabled) and (prefers-reduced-motion: no-preference)`
block already covers every target. **Confirmed in the built chunk**, not
assumed: `[data-reveal],[data-reveal-item],[data-chart-pill]{opacity:0}`.

### Measured in the production build

Against a worktree build of `39b788c`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| page height | **5242** | **4129** | **4279** |
| `AE` @ 5 % fuzz, settled | **0** | **0** | **0** |
| reveal targets below opacity 1 after a full pass | 0 of 8 | 0 of 8 | 0 of 8 |

Page heights are the recorded numbers **unchanged**, and `/about` has no
scrubbed element, so a bare page-wide `AE` is the right instrument here —
unlike `/` and `/journal`.

**The lockstep property, which is what distinguishes this page from
`<Reveal stagger>`**, probed at 1280 through the values tween:

```
ul opacity 0      card tops 687.66 687.66 687.66   spread 0.00px
ul opacity 0.438  card tops 671.90 671.90 671.90   spread 0.00px
ul opacity 0.652  card tops 664.18 664.18 664.18   spread 0.00px
ul opacity 0.838  card tops 657.47 657.47 657.47   spread 0.00px
ul opacity 1      card tops 651.66 651.66 651.66   spread 0.00px
```

**Separate triggers confirmed**: scrolled so the heading is past `top 88%` but
its content is not, `h2` reads `1` while the `ul` reads `0`; the same on the
team block (`h2` `1`, `table` `0`). At scroll 0 the hero reads `1` (it is
`immediate`) and the other seven all read `0`.

**Reduced motion**: all eight at `opacity: 1` and `transform: translate(0px,
0px)`, i.e. at rest. **Note the prompt expected "no inline transform written"
and that is wrong about `Reveal`** — its reduce branch is `gsap.set(targets, {
opacity: 1, y: 0 })`, which writes the inline transform. Verified identical on
the **base** build's `/journal`, so it is pre-existing shared behaviour, not
something this change introduced; fixing it would move `/` and `/journal`.

**JavaScript off**: all eight at `opacity: 1` at their normal boxes
(`1280x800`, `1232x44`, `1232x276`, `612x700`, `400x338`, `1232x66`,
`1232x711`, `1280x348`) — the `scripting: enabled` gate never applies.

**Four `/about` ⇄ `/` and `/about` ⇄ `/journal` round trips, each with a full
scroll pass: zero page errors and zero console errors.** `Reveal` contains no
`contextSafe` and none was added.

### Impact

**`/about` is the only route whose prerendered HTML changes**, and its only
diffs are the seven `data-reveal` attributes, the `CtaBand` wrapper `<div
data-reveal>`, the `Reveal` client-reference `<script>` and chunk/build-id
renames. **The other 15 pages are byte-identical** once the build id and the CSS
and JS chunk names are normalised — no flight-payload segmentation to see
through, because no class string changed.

Chunk sets: `/about` goes **9 → 10**, the same way `/journal` did in prompt 24;
every other route keeps its exact set (`/` and `/journal` 10, the rest 9). GSAP
is already in the shared chunk site-wide, so **diff the chunk bytes, not the
list length** — `/about` is **775 793 → 776 791 raw (+998)** and **242 879 →
243 522 gzipped (+643)**. Every other route's totals are byte-identical.

### Non-goals held

- **No geometry, type, spacing or asset change.** The card height, the
  `display-band-h2` sizing, the `CtaBand` padding and the mobile length are all
  already-recorded deviations and were not chased.
- **The footer keeps its split blur-in**, and `chrome.tsx` was not edited.
- **No stagger, no scrub, no pin, no parallax, no loop, no hover.** The
  capabilities cloth is still the site's only scroll-linked element.
- **No new timing constant** — `DUR` and `EASE` come from `register.ts`.
- **`primitives.tsx`, `cards.tsx` and `home/` are untouched.**

## `/careers`' reveals, and the masthead's per-character blur-in

Prompt 32. `/careers` was the last **built** route with no motion of its own.
It now carries the site's existing `Reveal` on the job list and **one new client
leaf** for the masthead, which is split to **characters** and blurred in. Two
pieces from one request, and the second overrides the first: the user supplied
`~/Videos/Screencasts/career.webm` and asked for the page to animate "like
this", then added *"Use the ones circled and do a split words for each letter in
a blurry fashion too"* — the circle in
`~/Pictures/Screenshots/Screenshot_20260806_210121.png` is around the masthead
`h1` and nothing else.

### `career.webm` is the designer's build — geometry must not be read off it

Connected components at threshold 97 % on the settled frame:

| card | recording | our render at 1280 |
| --- | --- | --- |
| card 1 (UX Designer) | `820×218+223` | `820×218` |
| **card 2 (Data Scientist)** | **`820×194+223`** | **`820×218`** |
| card 3 (Product Manager) | `820×218+223` | `820×218` |

**194 is the comp's number**, and ours is 218 for the fixed 20 px
`--text-p1` / `--text-p2` floor already on file for `/careers`, `/journal` and
every article. So this is the designer's own implementation at ~17 px body type,
exactly as `career-joblisting.webm` was. **Only timing, opacity, easing and
travel transfer. No position, no box and no page height from this recording is a
target.** Put this first; it is what stops a later session fitting geometry to
it.

The file is **variable frame rate**, so frames were extracted once with
`-fps_mode passthrough` and indexed against the full `pts_time` list — see
section 3, where the trap is recorded.

### The fade is the site's own constants

α read as `(bg − mean) / (bg − final)`, linear in opacity because browsers
composite in sRGB. Background from a sky-only crop at the same y band
(`355x60+90+155` → 209.3), confirmed by the first painted frame reading α = 0.00
against it. Best fit over duration and onset, 38 samples:

| curve | masthead line 1 | masthead line 2 | job card 1 |
| --- | --- | --- | --- |
| power4.out | 0.67 s, SSE **0.0269** | 0.85 s, **0.0145** | 0.82 s, **0.0994** |
| **power3.out** | **0.53 s, 0.0298** | 0.69 s, 0.0184 | 0.65 s, 0.1000 |
| expo.out | 0.98 s, 0.0365 | 1.16 s, 0.0210 | 1.19 s, 0.1278 |
| power2.out | 0.39 s, 0.0409 | 0.54 s, 0.0315 | 0.47 s, 0.1102 |
| linear | 0.28 s, **0.0909** | 0.40 s, 0.0924 | 0.29 s, 0.1826 |

A decelerating curve beats linear by 3–5×, and `power3.out` at 0.53 s is inside
the winning band on every channel. **`DUR` and `EASE` ship from `register.ts`
unchanged.** Say *"measurement cannot separate power3.out / 0.53 s from
power4.out / 0.67 s; the site's constants sit inside the band"* if this is
revisited — **never "0.5 was measured"**.

**The masthead's two lines are one target.** Fitted onsets: line 1 4.418 s,
line 2 4.384–4.418 s — under two frames apart, against `Reveal`'s 0.08 s ≈ five
frames.

**`delay={0.16}` is two steps, and two recordings agree.** Fitted onsets put the
masthead at 4.418 and job card 1 at 4.557 → **Δ 0.139 s**; the unexecuted
`prompts/30-careers-and-job-listing-reveals.md` measured **0.167 s** the same way
on a *different* recording (`career-joblisting.webm`). Two independent readings
side by side make two steps of the site's 0.08 the honest number.

### The rise: measured floors, judged amplitudes

Two opacity-invariant channels, both on a page that is **not** scrolling:

- **Half-max row-profile top edge** of "Careers at": 208.05 → 161.86, i.e.
  **46.2 px observed**, and the first sample is already at α ≈ 0.10, so the true
  amplitude is larger.
- **Half-contrast top edge of job card 1** (a solid white block against the sky,
  the cleanest channel on the page): 385.08 → 328.44, **56.6 px observed**.

Both corroborated by normalised row-profile cross-correlation (masthead ≈ +30 px,
card ≈ +28 px, both decaying to 0).

**No single power curve fits amplitude, onset and duration together.** Free fits:

| channel | best | A | duration | rms |
| --- | --- | --- | --- | --- |
| masthead top edge | power3.out | 55 px | 0.76 s | 0.53 px |
| card 1 top edge | expo.out | 80 px | 1.00 s | 0.74 px |
| card 1 top edge | power4.out | 87 px | 0.81 s | 0.83 px |
| card 1 top edge | power3.out | 157 px | 0.83 s | 1.14 px |

Holding the fade's fitted `power3.out` / 0.53 s and solving for amplitude frame
by frame gives A = 44.7 → 46.3 → 58.2 → 72.5 → 229 — it climbs monotonically,
i.e. the position is still moving long after the opacity has landed. Prompt 30
hit the same runaway on the other recording.

**So `y={56}` on the masthead and `y={72}` on the job list are judgements
anchored on the 46 px and 57 px observed floors**, not measurements — but the
floors are what make `Reveal`'s default 36 definitely short. Both are multiples
of the 8 px rhythm and neither introduces a constant; `y` is an existing prop.
**Do not add a second duration or a second ease to `Reveal`** — the site has one
reveal curve and a per-page fork is not worth it.

### There is no blur and no split in the recording

Five masthead crops stacked at α ≈ 0.13 / 0.24 / 0.51 / 0.75 / 1.0 and enlarged
300 % show **crisp glyph edges at every stage**, every letter at the same α. This
matters twice: it confirms the rise is real rather than a blur artefact (a
symmetric blur pushes a half-max top edge *up*; the measured edge moves the
other way), and it establishes that **the chars split and the blur are the
user's explicit addition**, in the same spirit as the seal's offsets and the
20 % speed-up.

**Nothing reveals on scroll and there is no hover.** Cards 2, 3 and the
open-application card read `max = 255` on the first frame their top edge enters
the viewport across both scroll passes — in the designer's build the whole
document reveals at load. The cursor crosses several cards with no measurable
change. No scrub, no pin, no parallax, no loop.

### `motion/careers-masthead-text.tsx`

`"use client"`, component-only, `children` as a prop, and it renders the `<h1>`
itself with the class string taken over **verbatim** — so no box is added and no
class string changes. **It lives in `motion/`, never in `careers/` and never in
`home/`**: `motion/` is the shared surface and nothing outside `home/` may
import `home/hero-text.tsx`. Keep it component-only, the `principles-data.tsx`
rule. One `useGSAP` with `{ scope: root }`, one `gsap.matchMedia()` with the
named `isDesktop` / `isMobile` / `reduceMotion` / `fullMotion` set,
`mm.add(…, root)`, `mm.revert()` as cleanup, `DUR` / `EASE` from `register.ts`.
`careers/sections.tsx` **stays a server component**; `app/careers/page.tsx` is
unchanged.

**The 20-glyph count is what makes a chars split affordable, and it supersedes
the standing "chars is out of scope" note for this element only.** That note's
objection is a target count — an animated `filter: blur()` repaints each
target's layer every frame — and the masthead is **20 glyphs** ("Careersat" 9 +
"Aetherfield" 11; the space is not a char), the same order as the footer's 12
words and the hero's five. **Measured in the render: exactly 20.** The objection
still stands everywhere else.

```
type: "chars", smartWrap: true, tag: "span", aria: "auto" (default), autoSplit: true
```

- **`smartWrap: true` is required.** Splitting chars without words or lines lets
  the browser break mid-word; without it "Aetherfield" can wrap between glyphs at
  a narrow viewport. It is what makes the mid-flight span count **25** — two
  authored line spans + 20 chars + three `white-space: nowrap` word wrappers.
- **`tag: "span"`** — a `<div>` inside the authored `<span className="block">` is
  invalid markup, the reason `hero-text.tsx` gives.
- **`autoSplit: true`, with the animation created inside and returned from
  `onSplit(self)`.** A tween created outside it targets orphaned nodes after the
  first re-split. It is also why **no `document.fonts.ready` promise is used**: a
  tween created in a promise callback is outside every gsap Context, and
  reaching for `contextSafe` to fix that is the documented `RangeError` crash.
  Everything is created synchronously inside the `mm.add` handler.
- The two authored `<span className="block">` lines are untouched, and **one**
  `SplitText.create` runs over the whole `h1` — `self.chars` is then in document
  order, so the stagger is a single sweep left-to-right and top-to-bottom across
  both lines. Do not create two instances.

**The split is reverted when the tween lands, and that is load-bearing.**
`onComplete: () => self.revert()`. The hero could get away with
`clearProps: "filter,display"` because a **words** split leaves word-internal
kerning intact; a **chars** split puts every glyph in its own inline box, which
breaks every kerning pair and rounds every advance to a whole pixel — and line 1
is Newsreader, which kerns. `revert()` restores the original text nodes, so the
settled masthead is the plain server markup the comps were measured against:
original kerning, original rasterisation, no leftover `aria-hidden` spans.
**`clearProps` is then unnecessary and is deliberately absent.** Verified: the
settled `h1` holds **2** spans (the authored ones) and the settled render is
`AE` 0 — see the table below. Reverting from inside the tween's own `onComplete`
does not throw, and needs no `contextSafe`: it runs after the tween has finished
and, being a GSAP callback, with the creating context active
(`gsap-core.js:981`).

**`aria: "auto"` derives the label from `textContent.trim()`
(`SplitText.js:213`) and the two line spans have no whitespace between them**,
so the split element was labelled **"Careers atAetherfield"** — measured, and
the one defect this work found. The leaf now joins the two lines with a space
and re-applies the label inside `onSplit` (which runs *after* SplitText writes
its own, and on every re-split). The label is read off the markup rather than
hardcoded, so the copy cannot drift, and it is captured **before** the split
because `h1.children` is the split spans afterwards. An authored `aria-label` in
the JSX would not work — `aria: "auto"` overwrites it unconditionally. The
revert restores the original attributes, so the settled heading carries no
`aria-label` at all and reads natively. **Verified in the accessibility tree at
375, 800 and 1280: `- heading "Careers at Aetherfield" [level=1]` both during
the split and after the revert.**

The tween: `gsap.set(h1, { opacity: 1 })` (the CSS start state hides the `h1`),
`gsap.set(self.chars, { display: "inline-block" })` — required or the `y` will
not render on a span, and it goes away with the revert — then
`gsap.from(self.chars, { opacity: 0, filter: blur(N), y, duration: DUR, ease:
EASE, stagger: CHAR_STAGGER })`.

- **`gsap.from` is correct here and `fromTo` is not needed.** The trap on file
  ("`gsap.from` reads the element's *current* value as the tween's end value")
  bites only on an element `globals.css` is holding at 0 — that is the `h1`, and
  the `h1` is lifted by the `gsap.set` rather than tweened. The chars are fresh
  spans at their default opacity 1.
- **`blur(0px)`, never `none`** — GSAP interpolates a filter numerically only
  between two `blur()` functions.
- **`BLUR = 12` at `lg`, `Math.round(12 × 0.66) = 8` below — reused from the
  hero, not measured.** `display-careers-title` is 36 / 64 / 80 px, the same
  curve as the article title and the same range the hero's type spans.
- **`CHAR_STAGGER = 0.03` is a judgement**, and the only new timing number.
  20 × 0.03 = 0.57 s of run alongside `DUR 0.5` gives a masthead beat of ~1.07 s,
  close to the footer's authored 1.0 s. The hero's 0.06 would run 1.2 s of
  stagger alone here and read as a crawl. It stays **local to this leaf** and does
  not go into `register.ts`, as the hero's `STAGGER` does.

**Reduced motion splits nothing at all** — no `SplitText.create`, no tween — and
lands only `gsap.set(h1, { opacity: 1 })`, as `hero-text.tsx` and
`footer-reveal.tsx` do.

**`Reveal`'s `as` union was NOT widened.** Prompt 32 proposed adding `"h1"`; the
masthead is the split leaf and never a `Reveal`, so `"h1"` would have been a dead
type. Dropped, per that step's own escape clause. `reveal.tsx` is untouched.

### `globals.css` — one selector

`[data-careers-split]` joins the existing
`(scripting: enabled) and (prefers-reduced-motion: no-preference)` block,
**opacity only**, alongside `[data-hero-split]` and `[data-footer-split]`. No
start transform, for the reason `[data-journal-mark]` records. **Confirmed in
the built chunk**, not assumed:
`…[data-journal-mark],[data-hero-split],[data-footer-split],[data-footer-wordmark],[data-careers-split]{opacity:0}`.

### The job list — one staggered trigger, not one `Reveal` per card

`JobList`'s `<ul>` is `<Reveal as="ul" stagger delay={0.16} y={72}>` with the
identical class string, and each `<li>` gains `data-reveal-item`. `/journal` uses
per-card triggers because its grid is ~3000 px tall and a single trigger would
run four cards far below the fold; this list is ~900 px at 1280 and the recording
reveals all four together at load, so one trigger at `Reveal`'s default
`start: "top 88%"` — which fires at load at every breakpoint, the list top being
y ≈ 216–332 — is both simpler and closer to the source. Note `stagger` mode
emits no `data-reveal` on the `<ul>`, so the `<ul>`'s markup is unchanged.

### Measured in the production build

Against a worktree build of `9fd6cd3`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| page height | **1895** | **1770** | **1925** |
| dashed card box | `335×224+20+1200` | `760×170+20+1001` | `820×170+230+1036` |
| `AE` @ 5 % fuzz, **outside** the dashed card | **0** | **0** | **0** |
| `AE` inside the dashed card box | 47 | 143 | 546 |
| settled `h1` spans | **2** | **2** | **2** |
| mid-flight chars / spans | 20 / 25 | 20 / 25 | 20 / 25 |
| tail char at t ≈ 250 ms | `blur(8px)`, `y 37` | — | `blur(12px)`, `y 56` |
| head char at the same instant | α 0.79, `blur(1.67px)` | — | α 0.80, `blur(2.39px)` |

Page heights and every card box are the recorded numbers **unchanged**, and the
`h1` box is identical to the base build at all three widths. **Never report a
bare page-wide `AE` for `/careers`** — the open-application card's marching
dashes sit at a different loop phase in any two shots, the warning already on
file. Masked, the remainder is **0**, which is the proof that the revert lands
exactly.

**Reduced motion**: `h1` at `opacity: 1` with **0** split spans, all four `li` at
`opacity: 1`. `Reveal`'s reduce branch writes `matrix(1, 0, 0, 1, 0, 0)` — the
pre-existing shared behaviour verified on `/journal` in prompt 30, not a
regression. **JavaScript off**: `h1` and all four `li` at `opacity: 1` with
`transform: none`; the `scripting: enabled` gate never applies and the dashed
frame's CSS march still runs.

**Eight round trips (`/careers` ⇄ `/` and `/careers` ⇄ `/journal`), each with a
full scroll pass: zero page errors and zero console errors.** That is what the
new `self.revert()`-in-`onComplete` lifecycle surface was tested for.

### Impact

**`/careers` is the only route whose prerendered HTML changes**, and its markup
diffs are exactly six attributes plus one script: `data-careers-split=""` on the
`h1`, `data-reveal-item="true"` on each of the four `<li>`, and the client
reference `<script>`. Every class string is carried over verbatim, so there is
**no RSC flight-payload re-segmentation to see through** — the other **15 pages
are byte-identical** once the build id and the CSS and JS chunk names are
normalised, with no stripping required.

Chunks: `/careers` goes **9 → 10**, the way `/journal` and `/about` did. **Diff
the bytes, not the count** — GSAP is already in the shared chunk site-wide, so
`/careers` is **775 793 → 777 863 raw (+2 070)** and **242 198 → 243 160 gzipped
(+962)**. Every other route's chunk set, chunk names and byte totals are
**identical**.

### Non-goals held

- **`/job-listing/[slug]` is not touched.** The unexecuted prompt 30 bundled it
  in; the user's request names `/career` and the recording covers `/careers`
  only. It stays unanimated and wants its own prompt.
- **No geometry, type, spacing, colour or asset change.** The card heights, the
  20 px `--text-p1` / `--text-p2` floor, the masthead's fitted
  `pt-[66px] sm:pt-[89px] lg:pt-[88px]` and the 120 px foot are all
  already-recorded, comp-measured decisions and none was chased.
- **The dashed frame's marching CSS animation is untouched** — prompt 31, still
  outside the `scripting: enabled` block.
- **The footer keeps its split blur-in** and `chrome.tsx` is not edited.
- **No scroll-triggered reveal below the fold, no hover, no scrub, no pin, no
  parallax, no loop.** The capabilities cloth is still the site's only
  scroll-linked element.
- **No change to `DUR`, `EASE` or `Reveal`'s `stagger: 0.08`**, and `reveal.tsx`
  is not edited at all.
- **`cards.tsx` / `JobCard` is not touched** — it is shared with
  `/design-system`.

## The navbar's drop-in (`motion/nav-drop.tsx`)

Prompt 33. `SiteNav` was **the last piece of the site with no motion at all**,
and it was an omission rather than a decision: `chrome.tsx` imported exactly one
motion module (`FooterMotion`), and the structure that keeps the bar pinned also
puts it out of reach of every page's `Reveal` — `SiteNav` renders *outside*
`Container`, and on `/careers` and the job listings `main` is a **sibling** of
the header, because a wrapper round `SiteNav` unpins the sticky bar. So the
header needs its own leaf. `/job-listing/[slug]` remains the last unanimated
*route* and still wants its own prompt.

`app/_components/motion/nav-drop.tsx` — `"use client"`, component-only, renders
the `<header>` itself and takes its class string over **verbatim**, exactly as
`FooterMotion` takes over `<footer>`. One `useGSAP` with `{ scope: root }`, one
`gsap.matchMedia()` with the named `reduceMotion` / `fullMotion` pair,
`mm.add(…, root)`, `mm.revert()` as cleanup, `EASE` from `register.ts`. **No
`contextSafe`** — the tween is created synchronously inside the handler, and
wrapping that is the documented `RangeError` crash. Keep it component-only, the
`principles-data.tsx` rule. `chrome.tsx`'s `CONTAINER` row, the wordmark `Link`,
`NAV_ITEMS`, the `LinkButton`, the mobile toggle, the mobile panel and the
`useState` are all unchanged.

### The measurement that says "drop", not "fade"

References: `~/Videos/Screencasts/career.webm` (1263×569, VFR, 750 frames) and
`~/Videos/Screencasts/about.webm` (1264×573, VFR, 827 frames). **There is no
navbar-specific recording and none is needed** — every existing capture contains
the bar at load. `navbar-demo.webm` is about the *blur radius* and constrains
nothing here. Both are **the designer's build** (prompt 32's finding for
`career.webm`), so **only timing, opacity, easing and travel transfer — no
geometry.** Both are VFR and were extracted once with `-fps_mode passthrough`
and indexed against the full `pts_time` list.

The channel is the **ink bounding box of the wordmark**, thresholded at 60 %:

| | `career.webm` | `about.webm` |
| --- | --- | --- |
| first ink | f232, `102×1` at Y 1 | f198, `101×4` at Y 1 |
| full height | f240, `102×20` at Y 2 | f204, `101×20` at Y 2 |
| settled | f253, `102×20` at **Y 14** | f222, `101×20` at **Y 17** |

**A box that grows downward from a fixed top edge and then translates down is an
element entering from behind the viewport's top edge**, clipped by the window —
a fade holds the box still, and a rise moves it the other way. The nav links
reproduce it in the same frames (`390×12`, Y 1 → 15 and 1 → 18), so **the
wordmark and the links move together as one element**: the `<header>`
translating, not its contents staggering. Observed bottom-edge travel is **32 px
on both files**, and both are *floors* — the element is off-screen and
unmeasurable before the first ink frame.

### The fit, and the three sentences that must not drift

Free fit over onset, duration and travel against the bottom-edge trace:

| curve | `career.webm` | `about.webm` |
| --- | --- | --- |
| **power3.out** | onset 4.841, **0.74 s**, 70 px, rms **0.38 px** | onset 3.872, 0.67 s, 58 px, rms 0.69 px |
| **power4.out** | onset 4.911, 0.81 s, 55 px, rms 0.41 px | onset 3.952, **0.72 s**, 41 px, rms **0.54 px** |
| power2.out | onset 4.801, 0.64 s, 69 px, rms 0.64 px | onset 3.787, 0.62 s, 70 px, rms 1.08 px |
| expo.out | onset 4.946, 0.89 s, 59 px, rms 1.19 px | onset 3.907, 0.89 s, 67 px, rms 0.86 px |
| linear | onset 4.521, 0.79 s, 76 px, rms 1.62 px | onset 3.792, 0.46 s, 54 px, rms 2.11 px |

- **`power3.out` and `power4.out` cannot be separated** — 0.03 px of rms apart,
  and a decelerating curve beats linear by 3–4× on both files. **`EASE` ships
  unchanged.**
- **Travel does not resolve (41–70 px across the fits)**, because the start of
  the motion is off-screen. **`yPercent: -100` is a judgement anchored on the
  32 px observed floor, never a measurement.** It is the bar's own height, so it
  stays tied to the geometry rather than to a magic 60 that a future 72 px bar
  would break, and it matches the CSS start state exactly.
- **Duration fits 0.62–0.89 s across both files and every curve, and `DUR` (0.5)
  is outside that band** — which is why `NAV_DUR = 0.7` (the band centre) is
  **local to this leaf**, exactly as `FOOTER_DUR = 1.0` is. It does **not** go
  into `register.ts`.

**The chrome arrives after the page, by about half a second.** `career.webm` is
the only file that can show this, because it carries both onsets in one
recording: masthead **4.418 s** (prompt 32's fitted value), bar **4.84–4.95 s**
→ **Δ 0.42–0.53 s**. `NAV_DELAY = 0.48`, six steps of the site's 0.08. Prompt 30
already records that `about.webm`'s load beat is progressive SSR paint with no
readable content onset, so it cannot corroborate it. **Do not "improve" it to 0**
— the page composes itself first and the chrome follows.

**The opacity ramp is present in the trace but confounded.** Minimum grey inside
the wordmark crop (sky 205) keeps falling *after* the ink box has reached full
height — f234 70.8, f238 35.0, f240 26.3, f243 16.6, f247 5.2, f252 0.1 — so it
is not just clipping; as α that is ≈0.87 at f240 → 1.0 by f252. But the bar is
moving fastest exactly where the ink is lightest, and both a rolling-shutter
smear and JPEG quantisation lift a dark minimum. **The fade ships because every
other reveal on this site fades, not because it was measured.**

### Three traps, two of them found by measurement in this build

- **`fromTo`, never `from`, on any element `globals.css` hides.** The CSS start
  state holds the header at `translateY(-100%)`, and `gsap.from` reads the
  element's *current* value as the tween's **end** value — it would animate
  −100 % → −100 % and the bar would never arrive. Second time this trap has come
  up; the footer wordmark was the first.
- **`y: 0` must be authored on both ends of the `fromTo`, and this one bit.**
  GSAP writes a transform as `translate(x, y) translate(xPercent%, yPercent%)`
  and parses the element's existing transform into the ***px*** pair — so the CSS
  `translateY(-100%)` is read as `y: -60px`, not as `yPercent: -100`. Animating
  `yPercent` alone leaves that −60 in place. **Measured before the fix: the
  settled bar sat at inline `translate(0px, -60px)` at 375, 800 and 1280, one bar
  height above the viewport and permanently off-screen.** Not a theoretical risk
  — a page-wide `AE` would not have caught it either, since the bar is
  transparent glass at the top of the page.
- **It plays once per document load, and that needs a module-scope flag — the
  bar does NOT survive a client-side navigation on its own.** Every page renders
  its own `<SiteNav />`, so React unmounts and remounts it across routes and a
  bare `useGSAP` with no dependencies runs *again*: measured before the flag, the
  bar sat at `yPercent −98` half a second after each of eight in-app clicks, i.e.
  it re-dropped every time. `let hasDropped = false` at module scope survives a
  remount but not a document load, which is exactly the lifetime wanted. On a
  remount the branch must `gsap.set(header, { yPercent: 0, y: 0, opacity: 1 })`
  rather than simply return — the CSS start state applies to the fresh element
  and would leave the bar hidden. `useGSAP` runs in a layout effect, so it lands
  before paint and there is no flash. **Do not add a route listener to re-run the
  entrance**: the bar is "one constant bar", and re-dropping it on every in-app
  navigation would fight that. A judgement — no recording covers a client-side
  navigation.

**`overflow-hidden` must never go on the `<header>`.** The mobile panel is a
*sibling of the row inside the same `<header>`*, so clipping the header to
contain the entrance would clip the open menu. The window's own edge does the
clipping, which is what both recordings show. Verified: header `overflow`
computes `visible` with the panel open, and the panel measures
`375×424 +0+60` with its four links.

### `globals.css` — one selector

`[data-nav-drop]` joins the existing
`@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` block
with **an authored start transform**, unlike `[data-journal-mark]` and the split
elements. That warning is about a transform that *decomposes* badly — a
perspective folded against an independent `rotate` — and a plain `translateY` has
no such interaction; `[data-chart-bar]` and `[data-chart-grid]` in the same block
are the precedent. **Confirmed in the built chunk**, not assumed:
`…[data-careers-split]{opacity:0}[data-nav-drop]{opacity:0;transform:translateY(-100%)}`,
inside the gate.

### Measured in the production build

Against a worktree build of `cc664d4`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| settled inline transform | `translate(0px, 0px)`, opacity 1 | same | same |
| mid-flight (700 ms) | `matrix(…, -28.47)`, α 0.525 | `-29.87`, α 0.502 | `-33.70`, α 0.438 |
| settles at | 1327 ms | 1323 ms | 1310 ms |
| reduced motion | `transform: none`, opacity 1, **no inline transform** | same | same |
| JS off | `transform: none`, opacity 1, box `1280×60` | same | same |

Authored end-to-end is `NAV_DELAY + NAV_DUR` = 1.18 s from tween creation; the
~140 ms on top is hydration, measured from navigation commit.

**Page heights are unchanged on every route** — a transform is not layout, so any
movement here would be a bug: `/` 6350 / 6006 / 5595, `/journal` 3801 / 5160 /
3486, `/careers` 1895 / 1770 / 1925, `/about` 5242 / 4129 / 4279.

**The sticky bar still pins past the fold**, which is the specific risk of a
`position: sticky` element carrying a residual inline transform. Scrolled well
past the fold, `getBoundingClientRect().top` is **0** with `position: sticky` on
`/` (document-level sky sibling), `/careers` (`main` pulled up under the bar) and
`/article/[slug]`, at all three breakpoints.

**Eight client-side round trips (`/` ⇄ `/journal` ×4, `/` ⇄ `/` via Product ×4,
plus `/about`), each with a full scroll pass: zero page errors and zero console
errors**, and the bar reads `matrix(1, 0, 0, 1, 0, 0)` / opacity `1` after every
one — it does not re-drop.

`magick compare -metric AE -fuzz 5%` in the settled state:

| route | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `/about`, `/article/[slug]`, `/design-system`, `/job-listing/data-scientist` | **0** | **0** | **0** |
| `/` | **0** | 0 outside the cloth box, 33.6 inside | **0** |
| `/journal` | **0** | 0 outside the stamp, 106.6 inside | 0 outside, 80.7 inside |
| `/careers` | 0 outside the dashed card, 47.9 inside | 0 outside, 294.3 inside | 0 outside, 313.1 inside |

The three non-zero routes are the ones that already carry that warning — the
scrubbed capabilities cloth, the journal stamp's perforation drift and the
open-application card's marching dashes, each at a different loop phase in any
two shots. **Outside those boxes it is 0 everywhere.** Report it scoped.

### Impact

**Every route's prerendered HTML changes**, as prompt 24's footer did, and the
diff is exactly **one attribute — `data-nav-drop=""` on the `<header>`** — on all
15 content pages; `_not-found` and `_global-error` are byte-identical. The class
string is carried over verbatim, so there is **no other markup diff and no RSC
flight-payload re-segmentation to see through**.

**Every route keeps its exact chunk set** (`/`, `/journal`, `/about` and
`/careers` 10, the rest 9) — `NavDrop` bundled into the existing shared chunk.
**Diff the bytes, not the count**: every route is **+563 raw / +87 gzipped**.

### Non-goals held

- **No geometry, type, colour, spacing or asset change.** The 60 px bar, the
  `bg-white/10` over `backdrop-blur-[32px]` and its `bg-white/85` fallback, the
  `CONTAINER` gutters, the `text-nav` links and the drawn "Get started" arrow are
  all fitted numbers and none is touched.
- **No scroll behaviour.** The bar still never hides, shrinks or changes state on
  scroll — this is a load entrance and nothing else.
- **No stagger across the wordmark and the links.** The recordings move them
  together in the same frames; one element, one tween.
- **No split, no blur.** The footer's treatment is not extended upward — nothing
  in either recording shows it, and a split would strip the wordmark link and
  each nav link of its accessible name for the duration.
- **`SiteFooter` and `CtaBand` are untouched**, as are `NAV_ITEMS` and every
  `href`.
- **No change to `DUR`, `EASE` or `Reveal`**; `reveal.tsx` is not edited.
- **No `will-change`, no pin, no scrub.** The capabilities cloth is still the
  site's only scroll-linked element.

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

**A variable-frame-rate capture must be extracted once and indexed against its
own `pts_time` list.** `~/Videos/Screencasts/*.webm` from this user's recorder is
VFR: a `-ss/-to` slice returns a **different frame count** from the matching
`ffprobe` window, so every frame number is silently mis-timed and every fitted
onset is wrong. Extract everything once and build the timestamp table:

```
ffprobe -v error -select_streams v -show_entries frame=pts_time \
  -of csv=p=0 ref.webm > pts.csv
ffmpeg -v error -i ref.webm -fps_mode passthrough -q:v 2 all/f%04d.jpg
```

Frame *n* (1-based) is then line *n* of `pts.csv`. Quote frame numbers alongside
times so a later session can re-derive the reading.

**Measuring a rise on a page that is NOT scrolling: use a half-max row-profile
edge crossing, not an ink centroid.** The centroid is the right channel for a
*scroll-pass* recording, where everything moves; on a load-entrance it is
confounded on any multi-line element, because at low α the heavier line
dominates and the centroid moves for reasons that are not travel. Take the ink
count per row over a crop, find where the profile crosses half its settled
maximum, and track that row. For a solid block against a gradient (a white card
on the sky) the half-*contrast* crossing is cleaner still and is the most
sensitive channel on the page. Both are opacity-invariant. Corroborate with
normalised row-profile cross-correlation against the settled frame — the lag
should decay to 0 as the element lands. **Report the observed travel as a floor**,
since the first measurable frame is already part-way in.

**Telling a drop from a fade: watch the ink bbox's *shape*, not its position.**
An element entering from behind the viewport's top edge is clipped by the window,
so its ink box first appears **short and pinned to the top of the crop**, grows
downward to full height, and only then translates down. A fade holds the box
still at full height; a rise moves it the other way. Threshold the crop at ~60 %
and report the box per frame:

```
magick f0232.jpg -crop WxH+X+Y +repage -colorspace Gray -threshold 60% -negate \
  -define connected-components:verbose=true -connected-components 8 null: | head -3
```

Run it on two independent recordings before believing it. Sibling elements (the
wordmark and the nav links) reproducing the same growth in the **same frames** is
what says one element is translating rather than its contents staggering. The
travel is a **floor** — the element is off-screen and unmeasurable before the
first ink frame — so a free fit for amplitude will not resolve; author the
self-evident value (`yPercent: -100`) and record it as a judgement.

**Measuring a rise off a scroll-pass recording: use an ink-weighted centroid,
relative to a settled neighbour.** A recording of a continuous scroll moves
*everything*, so an element's absolute y tells you nothing about its tween. Two
properties make the centroid the right channel:

- **It is opacity-invariant.** Opacity scales every pixel's weight uniformly, so
  the centroid does not move as an element fades — it isolates the rise from the
  fade, which a bbox-top or a first-ink-row reading cannot.
- **Differencing it against a neighbour that has already settled removes the
  page scroll**, which is common to both.

Take the centroid over a crop containing one element, per frame, and report
`element_centroid − landmark_centroid`. On `about.webm` this gave 34.2 px and
32.4 px on two independent blocks against an authored 36 — see "`/about`'s
reveals". The same trace also tests for a **sibling stagger**: sample all
siblings per frame and look at the spread. Under 1 px at a ~70 px/s rise is
under 10 ms, i.e. no stagger; `Reveal`'s own stagger is 0.08 s and is
unmistakable.

**Ink *mass* over the same crop is the opacity channel** — sum the ink weights
rather than their centroid. Two elements sharing one tween show the same α at
every frame *and* constant mutual gaps; three separate tweens do not.

**Fitting a duration to such a trace usually fails, and saying so is the
result.** Solve for `D` frame by frame under a candidate ease; if the fitted `D`
*drifts* across the window under `power2/3/4.out` and `expo.out` alike, the
recording does not resolve it. Report the band and reuse the site's existing
`DUR`/`EASE` rather than inventing a number — and record "measurement could not
separate 0.5 from 0.7", never "0.5 was measured".

**Check whether a reference recording is even your build before fitting motion
to it.** Run connected components on a settled frame and compare the box list to
your render. `about.webm`'s values cards are 246 tall against ours at 276, so it
is a *different implementation* of the same comps — usable for motion, useless
for geometry. Establish this first; it is what stops a later session "fixing"
a deliberate deviation to a recording.

**Comparing two builds' prerendered HTML is a script, not an eyeball.** The
pages are single-line, so `diff` prints the whole file for a one-character
change. Normalise the build id (`.next/BUILD_ID`) and the CSS chunk name
(`/_next/static/chunks/*.css` — Next puts CSS under `chunks/`, not `css/`) and
report differing *regions* with `difflib.SequenceMatcher`. Keep the helper in
the scratchpad; it is ~20 lines of Python.

**The CSS chunk name is not hex, and `difflib.SequenceMatcher` on these files
times out.** Two traps in the build-diff helper, both hit again in prompt 20:
the chunk is `/_next/static/chunks/0fxyh0j19zdp7.css`, so a `[a-f0-9]+`
normalisation silently matches nothing and reports all 16 pages as differing;
use `[A-Za-z0-9_-]+`. And `SequenceMatcher` over a 200 KB single-line page runs
for minutes — scan the common prefix and suffix instead (two `while` loops) and
print only the middle. For the one page that legitimately differs, re-split on
`(?<=>)` and run `unified_diff` over the tags, which is fast and readable.

**A class-string change makes pages differ far beyond the class string, and it
is not a real diff.** The prerendered HTML carries the RSC flight payload inline
as `<script>self.__next_f.push([1,"…"])</script>`; changing a string's length
shifts where Next splits those rows, so the row labels renumber (`8:I[…]` →
`a:I[…]`) and a naive prefix/suffix scan reports tens of kilobytes. **Strip the
flight scripts and compare the markup instead** — that is the thing that
renders:

```python
markup = re.sub(r'<script>self\.__next_f\.push\(.*?\)</script>', '', html, flags=re.S)
```

Then substitute the old class string for the new one in the *base* side and the
16 pages come back identical. Report the two results separately: which pages are
byte-identical untouched, and that the rest differ only in the class strings
plus flight-row segmentation.

**Screenshotting for `AE` must wait on `document.fonts.ready` before the scroll
pass, not just after it.** The footer's split blur-in is driven by a
ScrollTrigger, and `autoSplit` re-splits on font load; if the 400px scroll pass
races the fonts, the footer's reveal never fires and the whole footer stays at
`opacity: 0` in the shot. It is intermittent, it looks exactly like a
regression, and it bit both sides of a comparison independently. The procedure
that is deterministic:

```js
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(2000);                      // fonts + autoSplit settle
for (let y = 0; y < H + 900; y += 400) { await p.evaluate(y => scrollTo(0, y), y);
                                         await p.waitForTimeout(150); }
await p.waitForTimeout(4000);                      // settle AT the footer
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(3000);
```

Assert it rather than trusting it — read
`[...document.querySelectorAll('footer [data-footer-split]')].map(e => getComputedStyle(e).opacity)`
and require all `1` before the shot.

**`cd <dir>` alone can be swallowed by the shell's `zoxide` alias** (`zoxide: no
match found`, and the directory never changes), so a follow-up `ls`/`git status`
silently describes the *old* directory. `cd X && cmd` short-circuits correctly,
but a bare `cd` does not. Use absolute paths, `git -C`, or `(cd X && …)`.

**Another session may be committing to `main` while you work.** In prompt 27 a
concurrent agent committed, rebuilt `.next`, and removed this session's
`../aetherfield-base` worktree mid-comparison — which showed up as a base server
returning 500 for its CSS chunk and screenshots of an unstyled page. Re-check
`git log --oneline -1` and `git worktree list` before trusting a
parent-commit comparison, and rebuild against the *current* parent if HEAD has
moved.

**`page.accessibility.snapshot()` is gone from the cached `playwright-core`.**
It throws `Cannot read properties of undefined`. Use
`await page.locator("h1").ariaSnapshot()` instead — it returns the YAML form
(`- heading "…" [level=1]`), which is what you want for checking that a split or
otherwise mangled element still reads as one string.

**Splitting text changes its rasterisation, and `magick compare` will catch
it.** Word pieces need `display: inline-block` for a transform to render, and an
inline-block box rounds each word's advance to a whole pixel — the desktop hero
heading measured 2 px of extra ink and 4007 differing pixels against the parent
build. Set the display for the tween's duration only and list it in
`clearProps` alongside the filter; the settled render then goes back to 0. Check
element rects *and* `-metric AE`: rects can be identical to two decimal places
while the glyphs have moved.

**`playwright-core`'s npx cache hash changes.** Do not copy a path out of an
older note — resolve it each session with
`ls -d /home/gdk26/.npm/_npx/*/node_modules/playwright-core`.

**There are two "Energy consumption" cards on `/`, and a `.first()` probe hits
the wrong one.** The hero dashboard carries one and the Capabilities section
carries the other, with the *same* markup — `svg[viewBox="0 0 24 24"]` matches
six elements on the page and `span:text("Energy consumption") ~ svg` matches two.
A probe of the capabilities card that silently read the hero's reported the
asterisk at `transform: none` and the counter frozen, i.e. a working animation
looking broken. Anchor on the section instead:

```js
const sec = [...document.querySelectorAll('section')]
  .find(s => s.textContent.includes('Everything you need'));
```

**`img.naturalWidth` is density-corrected and is NOT the delivered pixel
count.** When an image is chosen out of a `srcset` with `w` descriptors, Chrome
gives the resource an intrinsic density of `candidate_w / sizes_w` and
`naturalWidth` returns `real_pixels / density`. So a 768px file selected from a
`w=1920` candidate at `sizes=720px` reports **288**, and a *larger* request
appears to deliver a *smaller* image. A sharpness check built on it is garbage.
Read `currentSrc` for the candidate and confirm the real bytes against the
optimizer directly:

```
curl -s -H 'Accept: image/avif,image/webp,image/*' \
  "http://localhost:3001/_next/image?url=%2Fassets%2Fimages%2FX.png&w=1920&q=90" -o o.bin
magick identify -format '%wx%h %m %B bytes' o.bin
```

The optimizer caps output at the source's own width, so `delivered =
min(requested_w, source_w)`; compare that against `rendered_css_width × DPR`.

**Verifying a dash-pattern loop is seamless is one command, so do it rather than
argue it.** Any looping `stroke-dashoffset` (or perforation row, or conveyor)
is seamless *iff* one period of travel maps the pattern onto itself. Force
exactly one period onto the element with the animation stopped — emulate
`prefers-reduced-motion: reduce`, screenshot the element's box, set the offset
inline, screenshot again — and require `magick compare -metric AE -fuzz 5%` = 0.
It caught nothing on `/careers`' frame, which is the point: the claim is now
measured rather than reasoned. Note the clipped screenshot needs
`{ clip, fullPage: true }` when the element is below the fold — a bare `clip` in
page coordinates throws *"Clipped area is either empty or outside the resulting
image."*

**A CSS animation's rate is read off `getComputedStyle`, unwrapped modulo the
period.** Sample the animated property at two timestamps ~2 s apart; the raw
difference is only correct modulo one period, so add `round((expected × dt −
raw) / period) × period` before dividing. Expect ~2 % of sampling jitter — the
frame's authored 20 px/s measures 19.95 / 19.95 / 20.10.

**A page-wide `magick compare` is the wrong instrument once anything is
scroll-linked.** A scrubbed element sits wherever the screenshot's scroll put it,
so the whole-page `AE` is never 0 again and tells you nothing. Mask the animated
box in *both* renders and compare the remainder, then score the box on its own:

```
magick new.png -fill black -draw "rectangle X1,Y1 X2,Y2" m-new.png   # same for base
magick compare -metric AE -fuzz 5% m-new.png m-base.png null:        # must be 0
magick compare -metric AE -fuzz 5% \( new.png -crop WxH+X+Y +repage \) \
                                   \( base.png -crop WxH+X+Y +repage \) null:
```

Report the two numbers separately. Screenshot the *settled* state by stepping the
scroll down the whole page (400px at a time) to fire every reveal, then returning
to 0 and waiting, before the `fullPage` shot. **Wait at least 6 s** — the
footer's split blur-in is authored at 3.02 s, and at 2.5 s it shows up as a few
hundred `AE` at the very bottom of the page that reads like a regression.

**GSAP consumes an element's independent `rotate` / `translate` / `scale`.**
`_parseTransform` folds them into one `transform` and sets all three to `none`
(`node_modules/gsap/CSSPlugin.js:859-866`), unconditionally. So a Tailwind v4
`-rotate-[8deg]` class is **not** safe from a tween that writes `transform`: any
tween on that element must land on the authored angle explicitly. Probe
`getComputedStyle(el).rotate` before and after the tween to see it happen.
Corollary: a CSS start state that combines a perspective with an authored
`rotate` decomposes into a spurious `rotationX` the tween never clears.

**Every GSAP callback runs with its creating context active.** `_callback`
(`gsap-core.js:981`) does `context && (_context = context)` before invoking
`onStart` / `onUpdate` / `onComplete`, where `context` is `animation._ctx`. So
"it fires on a later tick, so no context is active" is never a valid reason to
reach for `contextSafe` — and in this codebase `contextSafe` has no valid use
at all. See "Fix — the journal mark's `contextSafe`".

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

**Auditing an inherited property site-wide (`cursor`, `color`, `font`) needs an
ancestor resolution, not a tag count.** Enumerating every element whose computed
`cursor` is `pointer` returns every span and image *inside* a link. Attribute
each hit to the element that actually set it:

```js
const m = {};
for (const el of document.querySelectorAll('*'))
  if (getComputedStyle(el).cursor === 'pointer') {
    const src = el.closest('button, [role="button"], a[href]');
    const k = src ? src.tagName : 'UNEXPECTED:' + el.tagName;
    m[k] = (m[k] || 0) + 1;
  }
```

Any `UNEXPECTED:` key is the finding. This is the cheap way to check a
site-wide affordance change on every route.

**Isolating a CSS-only change when the tree already carries someone else's
uncommitted work.** The usual parent-commit worktree build is confounded. Build
the working tree twice instead — once with the new block removed — and diff the
two `.next/server/app/**/*.html` sets, normalising the build id and the CSS
chunk name. It isolates exactly the one change and costs two ~10 s builds.

**Ports 3000, 3001 *and* 3002 can all be occupied.** `npx next start` prints
`EADDRINUSE` into its log and exits, but an *older* server on that port keeps
answering, so `curl` returns 200 and every probe silently reads a stale build.
Always confirm the served CSS chunk matches the build you just made:
`curl -s localhost:PORT/careers | grep -o '/_next/static/chunks/[A-Za-z0-9_-]*\.css'`.
Free ports: `ss -ltn | awk 'NR>1{print $4}' | grep -oE '[0-9]+$' | sort -un`.

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

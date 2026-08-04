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

**Standing instruction:** each session, watch for steps repeated by hand and add
the mechanical ones here, so later sessions start from the command rather than
the investigation.

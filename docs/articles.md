# Articles — content, the article page, and articles 2–6

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


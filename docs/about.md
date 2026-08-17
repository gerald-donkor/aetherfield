# About page (`/about`)


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


## Prompt 114 — the values cards now share the homepage's card component

"Our values" renders the same three `PRINCIPLES` items as `/`'s "Built for
clarity", and until this prompt the card markup existed twice. It now comes from
`app/_components/home/principle-card.tsx`, which holds only the invariant part —
the `<li>` box model, the SVG attribute block, and the `h3` / `p` pair.

**Nothing measured on this page moved.** The five differences between the two
call sites are preserved exactly, and the table recording them lives in
`docs/motion-homepage.md` under prompt 114 rather than being repeated here. The
two that belong to `/about` are its grid, `mt-8 grid gap-4 md:mt-10
lg:grid-cols-3`, and its card, `rounded-card bg-surface p-10` with the heading at
`mt-5`. The deviations already recorded above — the 48px icon against the comp's
42px of ink among them — are untouched, because the icon rendering did not
change.

`Reveal as="ul"` stays at this call site. It is not the homepage's section-level
`stagger`, and the two are measured separately (`docs/motion-site.md`): the cards
here carry **no** `data-reveal-item`, and a browser probe of the production build
confirms they sit at `opacity 1` / `transform: none` throughout while the list
above them reveals.

`/about`'s prerendered HTML is **byte-identical** across the change — one of 21
files that were, after normalising `BUILD_ID` and both content-hashed chunk
patterns, all unchanged. See `docs/motion-homepage.md`, prompt 114, for the
paired-build method and the CSS-delta finding that came with it.

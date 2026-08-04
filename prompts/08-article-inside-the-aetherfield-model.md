# 08 — Article 3: "Inside the Aetherfield Model: How We Turn Data Into Action"

## Why this is next

The homepage's "From the journal" list (and `/journal`) already links the third
article — the screenshot the user circled is that row on `/`. The route
`/article/inside-the-aetherfield-model-how-we-turn-data-into-action` **404s
today** because the slug has card copy in `ARTICLES` but no `ARTICLE_BODIES`
entry. The comp folder `public/assets/pages/05-article3/screen-sizes/` is the
third article, so per AGENTS.md §3 this is a **data change against the existing
`/article/[slug]` route**, not a new page.

## Scope

Two files, no new components, no layout edits:

1. `app/_content/articles.ts` — one new `ARTICLE_BODIES` key.
2. `public/assets/generated/article-model-hero.png` — one generated hero.

The `ARTICLES` entry (slug, title, category `Insights`, `5 min`, description,
`src: /assets/images/Image-6.png`) already exists and is **not** to be touched.
Adding the body automatically adds the slug to `WRITTEN_SLUGS`, so
`generateStaticParams` prerenders it and the circled link resolves.

Confirmed against the comp: same masthead (meta line, two-line title), same
hero band, same rail (`Published` / `Author`), same lede + rule, same **five**
`heading + body` sections, same recent-articles band running into the footer.
Nothing on the page is new.

## 1. Content

Transcribed from `05-article3/screen-sizes/Desktop.png` at 200 % zoom.

```
published: "June 16, 2026"
author:    "Theo Retical"
```

The comp reads **June 16, 2028**; it ships as **2026** to match the site-wide
2026 convention already applied to articles 1 and 2.

**Lede**

> Data is everywhere, but turning it into meaningful climate action takes more
> than dashboards. The Aetherfield Model is our response to the noise—a
> systems-based approach that connects data, decision-making, and delivery. In
> this piece, we break down how the model works, and why clarity beats
> complexity every time.

**Sections**

1. **From Signal to Strategy** — Sustainability teams are overwhelmed with
   inputs—from sensor data to survey results to supplier estimates. The
   Aetherfield Model starts with organizing that noise into coherent signals,
   aligning teams around a shared understanding of what's true, what matters,
   and where change is possible.
2. **Build for Real-Time Alignment** — Static reports quickly go stale. Instead,
   the model favors a living system of metrics, alerts, and dashboards that
   support decision-making in real time. That means connecting teams not just to
   the data—but to each other. Context travels faster when systems are designed
   to carry it.
3. **Centered on Causality** — Most models focus on correlation. We focus on
   causality. Aetherfield maps emissions to decisions—showing not just what
   happened, but why. Whether it's a procurement policy driving Scope 3
   emissions or a delivery route inflating Scope 1, the model surfaces cause,
   not just consequence.
4. **Designed to Evolve** — Climate strategy isn't static, and neither is the
   Aetherfield Model. As standards evolve and business conditions shift, the
   model updates to reflect new realities. This keeps teams responsive and
   grounded, without having to rebuild from scratch every quarter.
5. **From Model to Momentum** — The value of a model isn't in its elegance—it's
   in what it unlocks. With Aetherfield, teams don't just analyze—they act. When
   data, decisions, and direction are tightly aligned, momentum becomes
   measurable.

Punctuation follows the comp: em dashes unspaced, curly apostrophes as they
appear in the existing two bodies.

**Hero alt:** "A person silhouetted against wind turbines at dusk, rendered as a
blue halftone over cream" — parallel to the two shipped entries.

## 2. The hero — `article-model-hero.png`

**Source photograph: `public/assets/images/Image-6.png`** — the same square the
article's card already uses (silhouetted figure, wind turbines, sunset beach).
Generated from the photograph, not cropped out of the comp.

**The crop is measured, not eyeballed.** Sweeping ~700 crop windows over the
blurred greyscale square against the comp hero's blurred greyscale
(`Desktop.png -crop 1240x500+20+380`, both normalized to 124×50, `compare
-metric RMSE`) gives a clear optimum:

| window | RMSE |
| --- | --- |
| `624x291+0+104` | **0.146** |
| `640x298+0+96` | 0.149 |
| `624x251+0+136` (aspect-exact) | 0.150 |
| whole square squashed to 1240×500 | 0.383 |

Unlike article 2, a genuine crop wins by a wide margin. `x` pins to `0` at every
width tried, so the comp's window is flush with the photograph's left edge. Ship
`624x291+0+104` (a mild vertical squash to 1240×500, which is what the sweep
prefers), but **re-check it visually against the comp before committing** — if
the aspect-exact `624x251+0+136` reads closer by eye, take that one and record
the swap.

**The treatment is article 2's three-layer composite**, because the comp again
shows **white highlights inside the dot screen** (`#E4ECF2` sampled at
`300x100+500+200`) over a **cream paper field** at the edges (`#EAE2D1`–`#EEE8D9`
with grain). The ink is `#2683EB` — exactly `--color-accent`, no new token.

What differs from article 2: there is no studio backdrop to floodfill, so the
cream/ink split is a **brightness threshold on the source** (bright sky → cream
paper, everything else → halftone). Fit the threshold rather than guessing:
build the comp's cream mask with `-fx "(r-b)>0.05?1:0"` on the hero crop, sweep
the source threshold (start ~70–85 %, with a `Close`/`Open Disk:3` clean-up) and
take the lowest RMSE. Overlay the winning mask in red over the comp to confirm
before committing.

Recipe skeleton (fill in the fitted threshold, and the crop if it changes):

```
C="624x291+0+104"
# 1. cream/paper mask from the source's brightest sky
magick public/assets/images/Image-6.png -alpha off -crop $C +repage \
  -colorspace Gray -threshold <fitted>% \
  -morphology Close Disk:3 -morphology Open Disk:3 \
  -resize 1240x500! -threshold 50% mask.png
# 2. blue-on-white halftone
magick public/assets/images/Image-6.png -alpha off -crop $C +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' ink.png
# 3. cream paper field, grain damped to the comp's amplitude
magick public/assets/generated/texture-cream.jpg \
  -resize 1240x500^ -gravity center -extent 1240x500 \
  \( +clone -blur 0x10 \) -compose blend -define compose:args=75 -composite cream.png
# 4. composite
magick ink.png cream.png mask.png -composite \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-model-hero.png
```

Carry forward the two gotchas already recorded: `-alpha off` first (the source
PNGs carry a 1-bit alpha channel that silently flattens greyscale probes to
white), and `-colors 64` PNG rather than JPEG, because a hard dot screen rings
under JPEG. Target well under 200 KB.

Verify the grain: the cream field should measure σ ≈ 2.5–3.2 at mean ≈ 236,
matching the comp — the 75 % self-blur blend is what gets `texture-cream.jpg`
there.

## 3. Verification

- `npm run lint`, `npm run typecheck`, `npm run build` — report exact output.
- Screenshot `/article/inside-the-aetherfield-model-how-we-turn-data-into-action`
  at 375 / 800 / 1280 against `npm run start` (playwright-core out of the npx
  cache, `deviceScaleFactor: 1`, `fullPage: true`).
- Diff the connected-components box lists (AGENTS.md §3 command) render vs comp
  at each breakpoint. Expect the hero at `+20+380` desktop and the recent-article
  cards size-exact; expect the two **already-recorded** vertical drifts (desktop
  short from the wide Archivo cut, mobile long from the 20px
  `--text-p1`/`--text-p2` floor). Record them, don't chase them.
- Click through from `/` — the circled row in the user's screenshot must now
  resolve instead of 404ing.

## 4. Housekeeping

- Add a section to `AGENTS.md` for article 3 in the same shape as article 2's:
  the fitted crop and the sweep numbers, the threshold that was fitted, the
  final `magick` recipe as run, the measured comp deltas, and the 2028 → 2026
  date note.
- Add to AGENTS.md §3 Automation: the crop sweep recipe (blurred greyscale, both
  sides normalized to 124×50, `compare -metric RMSE`, sweep width/x/y) now that
  it has been run twice, plus the `-alpha off` gotcha for the source PNGs.
- Commit to `main`. Do not push.

# 27 — `/journal`'s card hover: underline → text fade

## Scope, and why it is next

`ArticleCardStacked`'s title carries `group-hover:underline` (`app/_components/cards.tsx:61`),
which snaps a solid underline on with no transition. The user recorded the
current behaviour and the wanted behaviour and asked for the second:

- current — `~/Videos/Screencasts/Screencast_20260806_141027.webm` (1366×768, 22.4 s)
- target — `~/Videos/Screencasts/Screencast_20260806_141143.webm` (1264×598, 24.3 s)

**The target is the idiom the homepage journal rows already ship**
(`app/_components/home/journal.tsx:64`): the hovered card's **title and
description fade**, and there is no underline at all. This is the last
`group-hover:underline` in `app/` — after this change the site's only remaining
`hover:underline` is the job listing's "Back to Careers" text link
(`app/_components/job/sections.tsx:22`), which is a prose link and is out of
scope.

It is a CSS-only change to two class strings.

## What the reference actually shows — measured, not eyeballed

All frames extracted with `-fps_mode passthrough` (834 real frames, 60 fps
container, VFR) and timestamped from `ffprobe … frame=pts_time`. The recording
is 1264 CSS px wide with no browser chrome, so distances are CSS pixels
directly. Measurements are box means in an 8-bit grey channel over the settled
scroll position at t 7.5–12.0 s, where the pointer moves between the two
top cards.

Boxes (full-frame coords): title `370x24+20+410` (left) / `545x24+640+410`
(right); description `590x50+20+476` / `565x50+640+476`; meta
`200x16+20+441` / `200x16+640+441`; image interior `580x300+30+70` /
`580x300+650+70`.

| element | at rest | hovered | Δ |
| --- | --- | --- | --- |
| left title | 197.59 | 217.11 | **fades** |
| left description | 223.2 | 233.8 | **fades** |
| right title | 196.79 | 216.06 | **fades** |
| right description | 231.4 | 239.0 | **fades** |
| left / right meta | 240.73 / 240.82 | 240.89 / 240.99 | **unchanged** (0.16 of 4.2 predicted) |
| left / right image | 197.52 / 94.52 | 197.53 / 94.49 | **unchanged** — no zoom, no dim |
| title ink height | — | — | **constant — no underline** |
| title x | 20 | 20 | **no slide** |

**The direction was verified against the cursor, not inferred.** At t 10.90 the
pointer is on the *left* card's title and the *left* card's type is the light
one; at t 9.80 it is on the *right* card's description and the *right* card's
type is light. So it is the **hovered** card that fades — not its siblings —
which means no `:has()` and no container group is needed.

**The fade is ~0.66 and ships as `opacity-70`.** Against a white field,
`α = (255 − dim) / (255 − rest)` gives 0.660 (left title), 0.669 (right title)
and 0.667 (left description) — 0.665 ± 0.005. `opacity-65` predicts 217.7
against the measured 217.11 and `opacity-70` predicts 214.8, so the raw fit
sits between them, exactly as it did in prompt 19 (which measured 0.67 on the
homepage rows and shipped `opacity-70`). **Same evidence, same call**: ship
`opacity-70` so the site has one fade value, and record the 0.66.

**The timing is `duration-300 ease-in-out`.** Three transitions were traced at
full frame rate (hover-in on each card, hover-out on the left) and fitted over
150–500 ms against six curves, scoring normalised SSE:

| curve | best duration (in / in / out) | SSE (in / in / out) |
| --- | --- | --- |
| CSS `ease` (.25,.1,.25,1) | 335 / 355 / 390 ms | 0.0004 / 0.0011 / 0.0007 |
| linear | 210 / 225 / 250 ms | 0.0014 / 0.0008 / 0.0012 |
| **Tailwind `ease-in-out` (.4,0,.2,1)** | **290 / 315 / 345 ms** | 0.0030 / 0.0020 / 0.0020 |
| CSS `ease-out` (0,0,.58,1) | 280 / 300 / 325 ms | 0.0014 / 0.0024 / 0.0021 |
| Tailwind `ease-out` (0,0,.2,1) | 415 / 440 / 485 ms | 0.0069 / 0.0091 / 0.0088 |

CSS `ease` at ~360 ms is the nominal best fit and Tailwind's `ease-in-out` at
~300 ms is within the same band. **Ship `duration-300 ease-in-out`** — it is
the curve already fitted and shipped for these rows' sibling behaviour on `/`,
and a 60 ms difference on an opacity fade is not perceptible. Record the table
so the alternative is on file.

## The change

`app/_components/cards.tsx`, `ArticleCardStacked` only:

- the `<h3>`: drop `group-hover:underline`, add
  `transition-opacity duration-300 ease-in-out group-hover:opacity-70 motion-reduce:transition-none`
  — the exact class string `home/journal.tsx:64` already carries.
- the description `<p>`: the same four classes. The reference fades it too, and
  it is the one thing this treatment adds over the homepage rows.
- **`Meta` is not touched** and **the image is not touched** — both measured
  unchanged in the reference.

Nothing else: no new component, no client module, no GSAP, no `globals.css`
rule. `cards.tsx` stays a server component.

Four Tailwind v4 mechanics to confirm **in the built stylesheet**, not from
memory (the discipline `AGENTS.md` records for `translate-x-2.5` and
`scale-110`):

- `transition-opacity` emits `transition-property: opacity`;
- `opacity-70` emits `opacity: .7`;
- v4 wraps `group-hover:` in `@media (hover:hover)` for free, so nothing sticks
  on touch and no guard is authored;
- `motion-reduce:transition-none` compiles to
  `@media (prefers-reduced-motion:reduce){transition-property:none}` — the
  hover still applies, instantly, which is how every other hover here behaves.

## Measurements the implementation must hit

Production build (`npx next start -p 3001`, port checked free first; confirm the
served CSS chunk matches the build), Playwright out of the npx cache,
`deviceScaleFactor: 1`.

1. **At 1264 wide on `/journal`**, the settled title/description tone must match
   the reference's rest state and the hovered tone its dim state, in the same
   boxes as the table above — within ~1.5 grey levels, which is the JPEG floor
   of the recording.
2. `getComputedStyle` on the first card: `opacity` `1 → 0.7 → 1` across
   `pointerenter` / `pointerleave` on the `<Link>`, with an intermediate value
   read mid-transition, on both the `h3` and the `p`.
3. `text-decoration-line` is `none` in **both** states.
4. `Meta` opacity stays `1` and the image's `scale` is unaffected by this change
   (it keeps its own `group-hover:scale-105`).
5. **No layout shift**: page heights on `/journal` stay 3801 / 5160 / 3486 at
   375 / 800 / 1280, and `magick compare -metric AE -fuzz 5%` is **0** in the
   settled state on `/journal`, `/article/[slug]` and `/design-system` against a
   worktree build of `HEAD` (`git worktree add ../aetherfield-base HEAD;
   cp -al node_modules …`). Settle **≥6 s** before the `fullPage` shot — the
   footer's split blur-in is authored at 3.02 s.
6. **`/` must be reported scoped**, never as a bare page `AE`: 0 outside the
   capabilities cloth box, whatever the scrub gives inside it.
7. Reduced motion: the hover still reaches `opacity: 0.7` immediately and
   nothing splits or breaks.

## Expected impact

- **Prerendered HTML changes on `/journal`, all six `/article/[slug]` pages and
  `/design-system`** — and only in the two class attributes per
  `ArticleCardStacked`, plus the build id and the CSS chunk name. Every other
  route (`/`, `/careers`, `/about`, the three job listings, `_not-found`,
  `_global-error`) must be **byte-identical** once those two are normalised
  (chunk name is `[A-Za-z0-9_-]+`, not hex).
- **Every route keeps its chunk set** — `/` 10, the rest 9. This change adds no
  module, so any movement there is a finding.

## Non-goals

- **The image zoom stays.** The reference shows *no* zoom on the card images,
  but `group-hover:scale-105` was fitted and shipped deliberately in prompt 24
  at the user's explicit request ("Zoom in all the article images on hover in a
  beautifully animated way"), and this request names the underline. The
  reference recording is therefore read as showing the *type* treatment, not as
  a mandate to revert the zoom. **Flagged for the approval step:** say so if the
  zoom should go with it.
- **No slide.** The homepage rows translate +10 px on hover; the reference's
  card titles do not move (title x constant at 20), so nothing is translated.
- **The meta line is left alone**, measured unchanged.
- `ArticleCardHorizontal` and `ArticleCardCompact` are untouched.
- The job listing's `hover:underline` prose link is untouched.
- The footer's `href="#"` links, `SiteFooter` and `SiteNav` are untouched.

## Checks

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output.

## What to record in `AGENTS.md` afterwards

Under "Site motion", a subsection for the card hover fade: that it replaces the
last `group-hover:underline`; the reference table above with the boxes and
tones; the direction check (hovered card fades, not its siblings — so no
`:has()`); the 0.665 fit and why it ships as `opacity-70`; the easing fit table
and why `duration-300 ease-in-out` ships over the nominally better CSS `ease` at
360 ms; that meta and image are measured unchanged; the zoom non-goal; and the
scoped `AE` / byte-identical-route results.

## SKILLS USED

- **tailwind-4-docs** — confirm `transition-opacity`, `opacity-70`,
  `group-hover:`'s automatic `@media (hover:hover)` wrapper and
  `motion-reduce:` against the v4.3 docs, then verify each in the built
  stylesheet.
- **vercel-react-best-practices** (`.agents/skills/vercel-react-best-practices`)
  — keep the change CSS-only: no `"use client"`, no state, no effect, and
  `cards.tsx` stays a server component so no route gains a client reference.

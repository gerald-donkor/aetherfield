# 30 — Entry reveals on `/careers` and `/job-listing/[slug]`

## Scope, and why it is next

`/careers` and the three `/job-listing/[slug]` pages are the last built routes
with **no motion of their own**. Prompt 24 put reveals on `/journal` and the
split blur-in in the footer (which reaches every route), and prompts 17–23 built
out `/`. These four pages still render exactly as the server sent them.

The user supplied `public/design-ref/animation-ref/career-joblisting.webm` and
asked for both pages to be animated "like you see here".

**Unlike `journal.webm`, this recording does contain animation, and it is not
our build.** Two facts settle that, and both must be recorded:

- The careers job cards measure `820×218` (card 1) and **`820×194`** (card 2) at
  viewport 1260 in the recording. 194 is the *comp's* number; our render gives
  218 because `--text-p1`/`--text-p2` are a fixed 20px (the drift already on file
  for `/careers`). So this is the **designer's own implementation**, running at
  ~17px body type — the same source the comps came from — not a walkthrough of
  our tree.
- It carries a "Spectacle is Recording" badge, so it is a localhost capture, and
  the page geometry below the masthead will never line up with ours.

**Therefore: only timing, opacity, easing and travel transfer. No geometry from
this recording is a target.** Do not measure positions against it.

## Reference material read

| path | what it is |
| --- | --- |
| `public/design-ref/animation-ref/career-joblisting.webm` | 1260×568, 60 fps, ~61 s. `/careers` load at t≈3.4 s, scroll pass, `/job-listing/ux-designer` entry at t≈21.6 s, scroll pass, footer, then a second pass through `/job-listing/data-scientist` |
| `app/_components/motion/reveal.tsx` | the shared reveal; `DUR`/`EASE`/stagger live in `motion/register.ts` |
| `app/_components/careers/sections.tsx`, `app/careers/page.tsx` | the target page |
| `app/_components/job/sections.tsx`, `app/job-listing/[slug]/page.tsx` | the target page |
| `app/journal/page.tsx`, `app/_components/journal/sections.tsx` | the precedent for reveals on a server-component page |

## What the recording measures

Frames extracted with `-fps_mode passthrough` (60 fps, i.e. 16.67 ms/frame).
Boxes are in the recording's own 1260-wide coordinates. Frame indices below are
local to each extraction window and are quoted only so the numbers can be
re-derived.

### It is a fade, and there is no blur

Stacked 420×150 crops of the careers masthead at α = 0.27 / 0.48 / 0.68 / 0.86 /
0.91 / 0.95 / 1.0 show **crisp glyph edges at every stage**. The site's
`SplitText` blur-in (hero, footer) is *not* what this is. Nothing splits: both
masthead lines carry one progress.

α was read as `(bg − mean) / (bg − final)` over `360x70+455+138` ("Careers at"),
which is linear in opacity because browsers composite in sRGB.

### The easing is `power3.out`, ~0.5 s — the site's own constants

Fitting the α trace (32 samples, onset to settle) over duration and onset:

| curve | best duration | SSE |
| --- | --- | --- |
| **power3.out** | **570 ms** | **0.0177** |
| power4.out | 720 ms | 0.0178 |
| Tailwind `ease-out` (0,0,.2,1) | 490 ms | 0.0200 |
| expo.out | 930 ms | 0.0243 |
| power2.out | 420 ms | 0.0298 |
| linear / power1.out | 300 ms | 0.0918 |
| `ease-in-out` (.4,0,.2,1) | 450 ms | 0.1306 |

`power3.out` wins outright, and it **is** `EASE` in `motion/register.ts`. 570 ms
against the shipped `DUR = 0.5` is 4 frames — inside the onset ambiguity (the
first two frames of ink are at α < 0.05 and are indistinguishable from paint).
**Ship `DUR` and `EASE` unchanged; do not restate them.**

### The stagger is ~0.08–0.10 s, which is the site's 0.08

Onsets, from the first frame each box's mean departs its background:

| page | element | onset | Δ from previous |
| --- | --- | --- | --- |
| `/careers` | masthead | f008 | — |
| `/careers` | job list, card 1 | f018 | **167 ms** |
| `/job-listing` | "Back to Careers" | f046 | — |
| `/job-listing` | the white card (bg, title, meta, lede all together) | f052 | **100 ms** |

100 ms is 6 frames against 0.08 s = 4.8 frames — one frame of measurement. The
careers 167 ms is **exactly two** 0.083 s steps, which is what you get if the
masthead and the list are consecutive items in one 0.08 cadence with the
masthead's two lines counted as one target and the list starting a step late.
So: keep `stagger: 0.08` inside `Reveal`, and author the careers list's own
`delay` at **0.16** and the job card's at **0.08**.

### The rise, and which number is trustworthy

Measured by ink centroid (`Σ(bg−I)·y / Σ(bg−I)`), which is invariant to a
uniform opacity scale, on the masthead; and by the strongest vertical gradient
along a text-free column, on the cards.

| element | method | fitted rise at `power3.out` / 0.5 s | fit quality |
| --- | --- | --- | --- |
| careers masthead ("Aetherfield" line) | ink centroid, 29 samples | **8.5 px** (joint fit prefers power2.out / 390 ms / 8.5 px) | SSE 0.57, ≈ **0.14 px RMS** |
| careers card 1 | card top edge, 30 samples | ~72 px | SSE 205, ≈ 2.6 px RMS; no power ease fits (the free fit runs away to power5.out / 880 ms / 168 px) |
| job-listing card | "Apply now" button top, 27 samples | ~41 px | SSE 15.4; the fit pins onset at the first observed frame, so it is a lower bound |

**Only the masthead number is trustworthy** — it comes from a centroid over
thousands of ink pixels and fits to a seventh of a pixel. The two card numbers
come from tracking a low-contrast edge *while it is fading up from zero*, they
disagree with each other by 1.75×, and no single power curve fits either.

So:

- **The careers masthead ships `y={12}`** — 8.5 px measured, rounded up to a
  round number whose mobile two-thirds (`Math.round(12 × 0.66) = 8`) is still a
  sane travel. It differs 3× from `Reveal`'s default and is measured well enough
  to be worth authoring.
- **Everything else ships the default 36 / 24.** Record the 41–72 px fits and the
  reason they are not chased. If the user wants a longer travel on the cards it
  is one `y` prop and no new constant.

### What the recording does **not** show

- **No per-section scroll reveal.** Sampled at 6 fps across the whole `/careers`
  scroll (t 10–14 s) and the whole job-listing scroll (t 27.5–34 s), every
  heading, paragraph, bullet list, the `Seal` and the closing CTA are **fully
  opaque the instant they cross the fold**. In the designer's build the entry
  sequence reveals the whole document at load, so nothing is ever left waiting.
- **No hover treatment** on the job cards or the Apply buttons. The cursor
  crosses several cards during the pass with no measurable change.
- **No blur, no split, no scrub, no pin, no parallax.**

## The change

**Use `Reveal` exactly as it is.** No new motion component, no new client module,
no change to `DUR`, `EASE` or the built-in `stagger: 0.08`, no new
`globals.css` rule — `[data-reveal]` and `[data-reveal-item]` are already in the
`(scripting: enabled) and (prefers-reduced-motion: no-preference)` block.

### 1. `motion/reveal.tsx` — widen the `as` union only

`as` gains `"h1" | "p" | "article"`. This is the same inert widening prompt 24
made for `"h2"`, and it exists so the reveal **takes an existing element over via
`className` rather than adding a box** — the device that keeps `/journal`'s and
`/`'s geometry byte-identical. Nothing else in the file changes.

### 2. `/careers`

- `CareersMasthead`'s `<h1>` becomes `<Reveal as="h1" immediate y={12}
  className="…">` with the **identical class string**. `immediate` because the
  masthead is above the fold at 375, 800 and 1280, the call `JournalStamp`
  already makes.
- `JobList`'s `<ul>` becomes `<Reveal as="ul" stagger delay={0.16}
  className="…">` with the identical class string, and each `<li>` gains
  `data-reveal-item`. One trigger on the list at the default `start: "top 88%"`,
  which fires at load at every breakpoint (the list top is y ≈ 216–332), so the
  cadence matches the reference; the built-in 0.08 then walks the four cards.

  This is deliberately **not** `/journal`'s one-`Reveal`-per-card treatment. That
  choice was made because `/journal`'s grid is ~3000 px tall and a single trigger
  would run four cards far below the fold. The careers list is ~900 px at 1280,
  ~1200 px at 375, and the reference reveals all four together — so one staggered
  trigger is both simpler and closer to the source.

- `app/careers/page.tsx` is unchanged.

### 3. `/job-listing/[slug]`

- `BackToCareers`'s `<p>` becomes `<Reveal as="p" immediate className="…">`,
  identical class string.
- `Card`'s `<article>` becomes `<Reveal as="article" immediate delay={0.08}
  className="…">`, identical class string. **The whole card is one target**, which
  is what the recording measures: the card background, the role title, the meta
  line and the lede all begin within one frame of each other.
  - The card keeps `relative`, so the `sm:absolute` Apply button still pins to it.
  - `Reveal` writes `opacity`, which makes a stacking context — harmless, since
    the `Seal` spills past the card's *border box* and nothing here is
    `overflow-hidden`. **Do not add `overflow-hidden` anywhere in this chain.**
- `app/job-listing/[slug]/page.tsx` is unchanged.

### Both pages stay server components

`children` arrive as a prop, so neither section file gains `"use client"` and
neither page's `next/image` — there is none on these two routes — nor its content
imports reach the client bundle. Same discipline as `/journal`.

## Expected impact, and what to verify

- **Prerendered HTML.** `/careers` and the three job listings gain
  `data-reveal` / `data-reveal-item` attributes, the `Reveal` client reference,
  and chunk renames. **Nothing else may move** — every class string is carried
  over verbatim, so there must be no other markup diff. Use the scratchpad
  build-diff helper, strip the RSC flight scripts first (`<script>self.__next_f
  .push(…)</script>`), and normalise the build id and the CSS **and JS** chunk
  names.
- **The other 12 pages must be byte-identical** — `/`, `/journal`,
  `/design-system`, all six articles, `/about`, `_not-found`, `_global-error`.
- **Chunk bytes, not chunk count.** These four routes do not import `Reveal`
  today. GSAP already reaches every route through the footer (prompt 24), so the
  marginal cost should be the `Reveal` module only. Diff the chunk *byte totals*
  against a worktree build of the parent, as prompt 24's table does; a count that
  does not move proves nothing.
- **`AE` at 5 % fuzz must be `0`** in the settled state at 375 / 800 / 1280 on
  `/careers` and `/job-listing/data-scientist`, against a worktree build of the
  parent. These pages have no scroll-linked element, so a bare page-wide `AE` is
  the right instrument here — unlike `/` and `/journal`.
  - Follow the recorded screenshot procedure: `document.fonts.ready`, 2 s, a
    400 px-step scroll pass, **≥ 6 s** at the footer, back to 0, 3 s, then
    `fullPage`. Assert every `footer [data-footer-split]` reads `opacity: 1`
    before shooting.
- **Page heights unchanged**: `/careers` 1326 / 1291 / 1544 region and the job
  listings' recorded numbers — take them from the parent build, don't quote from
  memory.
- **Reduced motion**: 0 of N reveal targets below `opacity: 1`, no inline
  transform left mid-flight. **JavaScript off**: both pages at rest exactly as the
  server sent them — the `scripting: enabled` gate never applies.
- **Navigation**: four `/careers` ⇄ `/job-listing/data-scientist` round trips and
  a `/careers` → `/` → back, each with a full scroll pass, with **zero page and
  zero console errors**. This is the `contextSafe` `RangeError` class; `Reveal`
  contains no `contextSafe` and must not gain one.
- **Behaviour to confirm in the render**, at 1280: the masthead settles first,
  the four cards follow one 0.08 step apart; on the job listing the back link
  leads the card by 0.08; the masthead's travel is 12 px and the cards' 36.

## Non-goals

- **`SiteNav` is not animated.** The reference fades the header in ~0.55 s
  *after* the masthead, on both page entries. `SiteNav` lives in `chrome.tsx` and
  reaches all 16 routes, so animating it would change every page's entry — far
  outside "the careers and job-listing pages", and it would move `/`, which is
  pixel-settled. **Flag it to the user as an observed, deliberately deferred
  finding.**
- **No per-section scroll reveals inside the job listing card.** The reference
  shows none, and the card is one target there.
- **No hover treatment** on `JobCard`, the Apply buttons or "Back to Careers".
  The site's remaining `hover:underline` on the back link (`job/sections.tsx:22`)
  stays as it is — that was already declared out of scope in prompt 27.
- **No geometry change of any kind.** The recording is the designer's build at
  ~17px body type; its card heights, page heights and vertical positions are not
  targets and must not be chased. The `--text-p1`/`--text-p2` 20px drift stands.
- **No blur, no `SplitText`, no scrub, no pin, no loop.** The capabilities cloth
  stays the site's only scroll-linked element.
- `DUR`, `EASE`, `Reveal`'s `stagger: 0.08` and its 36/24 default are not
  changed. `CtaBand` is not involved — neither page renders one.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- the render measurements above, against `npx next start` on a free port (check
  3000/3001/3002 are clear, and confirm the served CSS chunk matches the build)

## To record in `AGENTS.md` afterwards

A new section under "Site motion", covering:

- that `career-joblisting.webm` **is** an animated reference and **is the
  designer's build, not ours** — with the `820×194` card-2 measurement that
  proves it, and the standing instruction that no geometry from it is a target;
- the α fit table (power3.out / 570 ms) and that it lands on the site's existing
  `DUR`/`EASE`;
- the onset table and the 0.08 / 0.16 delays it produces;
- the three rise fits, which one is trustworthy and why, and that `y={12}` on the
  masthead is the only override;
- that the reference shows **no** blur, split, hover, or per-section scroll
  reveal, so later sessions do not re-sample it;
- the header finding, as an open item;
- the `as` union widening and why it exists (take the element over, add no box);
- the impact numbers actually measured — HTML diffs, chunk bytes, `AE`, page
  heights, reduced motion, JS off, round trips.

Add to section 3 (Automation) any step repeated by hand here, in particular the
**ink-centroid method for measuring a rise through a fade** — an absolute
threshold reads a fading element's bbox as growing symmetrically and hides the
translation, while the centroid is invariant to the opacity scale.

## SKILLS USED

- **gsap-react** — `useGSAP`, scoping and cleanup. `Reveal` is already written to
  this shape; the skill is here so the implementation can check the existing
  usage rather than assume it.
- **gsap-core** — `fromTo`, `stagger`, easing and `gsap.matchMedia()` including
  the `prefers-reduced-motion` split, which `Reveal` uses for its two named
  conditions.
- **gsap-scrolltrigger** — the careers list's single `start: "top 88%", once:
  true` trigger, and confirming that a trigger already past its start fires on
  refresh (which is what makes the list's cadence match the reference at load).
- **tailwind-4-docs** — only to confirm no utility is affected; the class strings
  are carried over verbatim and no new utility is authored.
- **vercel-react-best-practices** — keeping both section files server components
  and confirming the client-reference graph does not widen beyond `Reveal`.

# 34 — Entry reveals on `/job-listing/[slug]`

## Scope, and why it is next

`/job-listing/[slug]` is **the last content route with no motion of its own**.
Prompt 24 animated `/journal` and put the split blur-in in the footer (which
reaches every route), prompt 30 did `/about`, prompt 32 did `/careers`, and
prompt 32's non-goals name this route explicitly as wanting its own prompt. All
three roles — `data-scientist`, `ux-designer`, `product-manager` — render the
same two components, so this is one change covering three routes.
`/design-system` is the only other unanimated route and it is the styleguide,
not a page; out of scope.

**Provenance.** A prompt for this scope was drafted twice and neither survived:
`prompts/30-careers-and-job-listing-reveals.md` (committed, superseded on its
`/careers` half by prompt 32) and an untracked `33-job-listing-reveals.md` that
was replaced on disk by `33-navbar-drop-in.md`. This file re-derives the
numbers rather than quoting either, because **one number in prompt 30 was
measured wrong** — see "The rise" below.

## Reference material

| path | what it is |
| --- | --- |
| `public/design-ref/animation-ref/career-joblisting.webm` | 1260×568, 60 fps. `/careers` load at t≈3.4 s, scroll pass, **`/job-listing/ux-designer` entry at t≈21.6 s**, scroll pass, footer, then a pass through `/job-listing/data-scientist` |
| `AGENTS.md` § "`/careers`' reveals, and the masthead's per-character blur-in" | what shipped on the sibling page, and the numbers this must sit beside |
| `app/_components/motion/reveal.tsx` | the shared reveal; `DUR` / `EASE` live in `motion/register.ts` |
| `app/_components/job/sections.tsx` | the target — `BackToCareers` and `Card` |
| `app/job-listing/[slug]/page.tsx` | must stay unchanged |

**The recording is the designer's build, not ours.** Its `/careers` card 2
measures `820×194` where ours renders `820×218`, on the fixed 20 px
`--text-p1`/`--text-p2` floor already on file. **Only timing, opacity, easing and
travel transfer. No position, box or page height from it is a target.**

## What the recording measures

Frames extracted with `-fps_mode passthrough`; indices are local to the
21.6–23.1 s window and are quoted only so the numbers can be re-derived.

### It is a plain fade and rise — no blur, no split

Stacked crops of the masthead at α = 0.27 → 1.0, enlarged, show **crisp glyph
edges at every stage**. The per-character blur on `/careers` was the user's
explicit addition on top of the recording, and it is scoped to that one element.
**Do not split anything here.**

### The fade is the site's own constants

α as `(bg − mean) / (bg − final)`, linear in opacity because browsers composite
in sRGB. Best fit over duration and onset, 32 samples on the careers masthead in
this same recording:

| curve | best duration | SSE |
| --- | --- | --- |
| **power3.out** | **570 ms** | **0.0177** |
| power4.out | 720 ms | 0.0178 |
| Tailwind `ease-out` | 490 ms | 0.0200 |
| power2.out | 420 ms | 0.0298 |
| linear | 300 ms | 0.0918 |

A decelerating curve beats linear by 5×, and `power3.out` — which **is** `EASE` —
wins. 570 ms against `DUR = 0.5` is four frames, inside the onset ambiguity.
**Ship `DUR` and `EASE` unchanged and do not restate them.** If revisited, say
*"measurement cannot separate power3.out / 0.57 s from power4.out / 0.72 s"*,
never *"0.5 was measured"*.

### The stagger is one step of the site's 0.08

Onsets, from the first frame each box departs its background:

| element | onset | Δ |
| --- | --- | --- |
| "Back to Careers" | f046 | — |
| the white card — background, role title, meta line and lede all together | f052 | **100 ms** |

100 ms is six frames against 0.08 s = 4.8 frames: **one step, one frame of
measurement error.** So `delay={0.08}` on the card and nothing on the back link.
This corroborates `/careers`, where the masthead → list gap measured two steps
(0.139 s on `career.webm`, 0.167 s here).

**The whole card is one target.** Its background, title, meta and lede all begin
within one frame of each other — do not animate the card's contents separately.

### The rise, and the method that has already produced one wrong number

**An ink centroid is only opacity-invariant if the background contributes zero
weight.** Prompt 30 measured this masthead at **8.5 px** with a plain
`max(0, bg − v)` centroid and recommended `y={12}`. That was wrong by ~5×: the
crop clipped the glyph bottoms and the sky gradient carried weight of its own.
Re-measured with a **per-row background taken from a text-free column band at the
same rows**, the same recording gives **32 px observed** and a frame-by-frame
amplitude of **38–46 px**, which lands on the 46.2 px floor prompt 32 measured
independently on `career.webm` and on the 55 px it fitted. `/careers` shipped
`y={56}` and it is right.

Measured here with that corrected method:

| channel | observed floor | fits |
| --- | --- | --- |
| **"Back to Careers"**, background-subtracted ink centroid, 35 samples | **23.8 px** | power4.out 24 px / 0.67 s (rms 0.38); power5.out 24 px (0.41); power2.out 29 px (0.45); power3.out 49 px / 0.71 s (0.33). Held at the site's power3.out / 0.5 s: **23 px**, rms 0.53 |
| **the card**, "Apply now" button top edge — a black block on white, immune to the sky | ~41 px from the first thresholdable frame | holding power3.out / 0.5 s and solving frame by frame gives 70 → 75 → 85 → 89 → 117, i.e. **it climbs** |

The climbing amplitude is the same pathology `/careers` records: the position is
still moving after the opacity has landed, so no single power curve fits
amplitude, onset and duration together. **Read the floors, judge the values.**

- **`y={24}` on the back link** — the observed floor, the value two of four eases
  pick, and 23 when held at the site's own constants. On the 8 px rhythm.
- **`y={72}` on the card** — the floor here is ~70, and 72 is exactly what
  `/careers` ships on its job cards. **No new constant; `y` is an existing prop.**

**Do not add a second duration or a second ease to `Reveal`.** The site has one
reveal curve.

### What the recording does not show

- **No per-section scroll reveal.** Sampled at 6 fps across the whole job-listing
  scroll (t 27.5–34 s), every heading, paragraph, bullet, the `Seal` and the
  closing CTA are fully opaque the instant they cross the fold — in the
  designer's build the whole document reveals at load.
- **No hover** on either Apply button or on "Back to Careers".
- No blur, split, scrub, pin, parallax or loop.

## The change

**`Reveal` as it is.** No new client module, no change to `DUR`, `EASE` or the
built-in `stagger: 0.08`, and **no new `globals.css` rule** — `[data-reveal]` is
already in the `(scripting: enabled) and (prefers-reduced-motion: no-preference)`
block.

1. **`motion/reveal.tsx`** — the `as` union gains `"p" | "article"`. Inert, and
   the same widening prompts 24 and 30 made for `"h2"` and `"table"`. It exists
   so the reveal **takes an existing element over via `className` rather than
   adding a box**.
2. **`job/sections.tsx`**
   - `BackToCareers`' `<p>` becomes `<Reveal as="p" immediate y={24}>` with the
     **identical class string**.
   - `Card`'s `<article>` becomes `<Reveal as="article" immediate delay={0.08}
     y={72}>` with the **identical class string**.
   - `immediate` on both: each is above the fold at 375, 800 and 1280, the call
     `JournalStamp` and the `/careers` masthead already make. It also reproduces
     the recording's entry exactly, which fires on mount rather than on scroll.

Three things that must not change:

- **The card keeps `relative`** — the top Apply button (`sm:absolute`) and the
  `Seal` resolve against it.
- **Nothing in this chain may become `overflow-hidden`.** The `Seal` spills past
  the card's right edge onto the sky, and `Reveal` writing `opacity` makes a
  stacking context — harmless alone, fatal with a clip.
- `app/job-listing/[slug]/page.tsx` is unchanged and `job/sections.tsx` **stays a
  server component**: `children` arrive as a prop, so `primitives.tsx` and
  `jobs.ts` never reach the client bundle.

`primitives.tsx`, `cards.tsx`, `chrome.tsx` and everything under `home/` are
untouched. **No `contextSafe` anywhere** — that is the documented `RangeError`.

## Expected impact, and what to verify

- **Only the three `/job-listing/*` routes' prerendered HTML may change**, and
  only by: `data-reveal=""` on the `<p>` and the `<article>`, the `Reveal`
  client reference, and chunk/build-id renames. Every class string is carried
  over verbatim, so there is **no RSC flight re-segmentation to see through** —
  the other **13 pages must be byte-identical** once the build id and the CSS and
  JS chunk names are normalised. The CSS chunk name is `[A-Za-z0-9_-]+`, not hex.
- **Chunk count 9 → 10** on these three routes, as `/journal`, `/about` and
  `/careers` each did. GSAP is already site-wide via the footer, so the marginal
  cost is the `Reveal` module only. Every other route's chunk set must be
  identical.
- **`AE` at 5 % fuzz must be `0`** in the settled state at 375 / 800 / 1280 on
  `/job-listing/data-scientist` and `/job-listing/ux-designer`, against a
  worktree build of `cc664d4`. These pages have no scroll-linked element and no
  CSS loop, so a bare page-wide `AE` is the right instrument — unlike `/`,
  `/journal` and `/careers`.
  - Follow the recorded procedure: `document.fonts.ready`, 2 s, a 400 px-step
    scroll pass, **≥ 6 s** at the footer, back to 0, 3 s, then `fullPage`, and
    assert every `footer [data-footer-split]` reads `opacity: 1` first.
- **Page heights and the card box unchanged**, taken from the parent build — not
  from AGENTS.md's job-listing tables, which are comp comparisons.
- **Reduced motion**: both targets at `opacity: 1`. `Reveal`'s reduce branch is
  `gsap.set(targets, { opacity: 1, y: 0 })`, so it does write
  `matrix(1, 0, 0, 1, 0, 0)` — pre-existing shared behaviour, not a regression.
- **JavaScript off**: both at `opacity: 1`, `transform: none`, normal boxes.
- **Navigation**: four `/careers` ⇄ `/job-listing/data-scientist` round trips and
  a `/job-listing/data-scientist` → `/` → back, each with a full scroll pass,
  with **zero page and zero console errors**.
- **In the render**: the back link leads the card by 0.08 s; travel is 24 px and
  72 px at desktop, two thirds of each below `lg`; the `Seal` still spills past
  the card's right edge.

## Non-goals

- **`SiteNav` is not touched here.** The recording fades the header in ~0.55 s
  after the page content on both entries; that is prompt 33's scope
  (`33-navbar-drop-in.md`), not this one.
- **No per-section scroll reveals inside the card**, and no separate reveal for
  the `Seal` or the closing CTA — the card is one target.
- **No hover treatment**, and the back link's existing `hover:underline`
  (`job/sections.tsx:22`) stays as it is, already declared out of scope in
  prompt 27.
- **No split, no blur.** The `/careers` chars split is scoped to that masthead.
- **No geometry change of any kind**, and the 20 px `--text-p1`/`--text-p2`
  floor stands.
- `DUR`, `EASE`, `Reveal`'s `stagger: 0.08` and its 36/24 default are unchanged.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- the render measurements above, against `npx next start` on a free port —
  confirm the served CSS chunk matches the build just made

## To record in `AGENTS.md`

A section under "Site motion" covering: that `career-joblisting.webm` is the
designer's build and no geometry from it is a target; the fade fit table and that
it lands on the existing `DUR`/`EASE`; the 100 ms onset gap and the
`delay={0.08}` it produces; the card being one target; the two rise floors and
that 24 and 72 are judgements anchored on them; that the recording shows no
blur, split, hover or per-section scroll reveal, so later sessions do not
re-sample it; the `as` union widening; and the measured impact numbers.

Add to section 3 (Automation) the corrected measurement recipe: **an ink-centroid
rise measurement must subtract a per-row background sampled from a text-free
column band at the same rows, and the crop must be tall enough to hold the glyph
band at its full starting offset.** A plain `max(0, bg − v)` centroid on a
sky-gradient page under-reads the travel by ~5× — it produced prompt 30's wrong
8.5 px on the careers masthead, where the corrected method gives 38–46 px.

## SKILLS USED

- **gsap-react** — `useGSAP` scope and cleanup; confirming `Reveal`'s existing
  shape rather than assuming it.
- **gsap-core** — `fromTo`, `stagger`, easing and `gsap.matchMedia()` with the
  reduced-motion split.
- **gsap-scrolltrigger** — only to confirm `immediate` is the right call here and
  that no trigger is created for these two targets.
- **tailwind-4-docs** — to confirm no utility is affected; both class strings are
  carried over verbatim and no new utility is authored.
- **vercel-react-best-practices** — `bundle-barrel-imports`: keeping
  `job/sections.tsx` a server component and the client graph at `Reveal` only.

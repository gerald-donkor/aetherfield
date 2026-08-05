# 17 — Split `home/sections.tsx`, then animate the homepage with GSAP

Three pieces of work, in this order, because each depends on the one before it:

1. **Refactor** — break `app/_components/home/sections.tsx` into one file per
   section, with `sections.tsx` left behind as a barrel so no other page's
   import path changes.
2. **The dashboard chart** — the "Carbon emissions trend" bars grow from the
   baseline, staggered **from both edges inward to the middle**, on first
   scroll.
3. **The whole page** — the fade-and-rise reveal the landing recording uses,
   applied section by section at all three breakpoints.

## SKILLS USED

| skill | for |
| --- | --- |
| `gsap-react` | `useGSAP`, `{ scope }`, automatic cleanup/revert — the hook every animation in this prompt is written inside. The React/Next-specific rules. |
| `gsap-core` | `gsap.to/from/fromTo`, easing, duration, **advanced stagger** (`{ amount, from: "edges" }` — §2's whole mechanism), and `gsap.matchMedia()` for the breakpoint / `prefers-reduced-motion` split in §3. |
| `gsap-scrolltrigger` | `ScrollTrigger` registration, `start` values, `once: true`, creation order and refresh — the trigger on the chart and on every section reveal. |
| `gsap-timeline` | Sequencing the hero's on-load reveal and the chart's gridlines → bars → pill order. |
| `gsap-performance` | Why the bars animate `scaleY` rather than `height`, and the transform-only discipline for the reveals. |
| `tailwind-4-docs` | The `@utility` / v4 syntax if `globals.css` needs a new rule — the `scripting: enabled` start-state block in §3. |

`motion` (the Motion/Framer library skill) is **not** used: `motion@^13` is in
`package.json` but this prompt is GSAP throughout, per the reference recordings.
Do not mix the two libraries on one page.

Reference material read for this prompt:

- `/home/gdk26/Pictures/Screenshots/Screenshot_20260805_155549.png` — names the
  chart: it is the `HeroDashboard`'s bar chart, not a new component.
- `public/design-ref/animation-ref/chart.webm` — 280×198, 24.6 s, a looping
  generic bar chart. Bars scale up from the baseline in a left-to-right stagger,
  then an arrow draws across. **We take the bar behaviour and the timing feel,
  not the arrow and not the colours.** The user's instruction changes the
  stagger order: it must emanate from the two ends and converge in the middle.
- `public/design-ref/animation-ref/landing.webm` — 1262×571, 102.6 s, three
  passes over the homepage (desktop ≈ 0–31 s, tablet ≈ 43–74 s, mobile ≈ 78–102 s).

## What the landing recording actually does

Sampled at 1 fps across all three passes, then at 12–15 fps over the hero
(t 4.2–7.4) and the capabilities → principles handover (t 15.6–19.1). The
vocabulary is small and identical at every breakpoint:

- **Fade and rise.** Elements start transparent and roughly 30–40 px low and
  settle into place. Nothing scales, nothing blurs, nothing rotates. (The
  "blurry" frames in a 1 fps sample are just mid-fade; the 15 fps pass over the
  hero shows clean opacity.)
- **Per-element stagger, in reading order.** The hero's two title lines arrive
  one beat apart, then the lede, then the button row, then the dashboard. The
  principles cards come in left to right. The capabilities list items come in
  top to bottom.
- **Roughly 0.5–0.7 s per element with ~0.1 s between siblings**, decelerating —
  a `power2`/`power3` out curve.
- **Once, on enter.** Nothing reverses on scroll-up and nothing is scrubbed.
- **No pinning, no parallax, no horizontal scroll** anywhere in 102 s.

The hero plays on load. Everything below it plays as it enters the viewport.

## 1. The refactor

`app/_components/home/sections.tsx` is 444 lines holding six sections, the
shared `Container`, the shared `PRINCIPLES` data and a private `JournalMark`.
Five files outside `home/` import from it:

```
app/page.tsx                        Capabilities CaseStudy Hero Journal Principles Testimonial
app/journal/page.tsx                Container
app/careers/page.tsx                Container
app/job-listing/[slug]/page.tsx     Container
app/_components/article/sections.tsx  Container
app/_components/about/sections.tsx    Container PRINCIPLES
```

New layout under `app/_components/home/`:

| file | exports |
| --- | --- |
| `container.tsx` | `Container` |
| `hero.tsx` | `Hero` |
| `dashboard.tsx` | `HeroDashboard` (exists; loses the chart markup — see §2) |
| `emissions-chart.tsx` | `EmissionsChart` (new, client) |
| `capabilities.tsx` | `CAPABILITIES`, `Capabilities` |
| `principles.tsx` | `PRINCIPLES`, `Principles` |
| `case-study.tsx` | `CaseStudy` |
| `journal.tsx` | `JournalMark` (private), `Journal` |
| `testimonial.tsx` | `Testimonial` |
| `sections.tsx` | **barrel only** — `export * from "./container"` and one line per file above |

**`Container` stays inside `home/`** even though it is not a home-page concern.
Moving it to `app/_components/container.tsx` would churn five unrelated pages'
import paths for no behavioural gain; that is a separate decision. The barrel is
what keeps every existing import working byte-for-byte.

Move code verbatim in this step — no reformatting, no renaming, no JSX edits.
The comments on `Container`'s gutters, on `PRINCIPLES` being shared with
`/about`, and on `JournalMark`'s tilt travel with their code.

**Expected impact of step 1 alone: zero.** Every prerendered page must be
byte-identical apart from the build id and the CSS chunk name. Verify that
before touching anything else — it is the cheap checkpoint that isolates the
refactor from the animation work.

## 2. The chart

### Where it lives

`HeroDashboard`'s last block (`dashboard.tsx:100–142`) — the `y` axis, the four
gridlines, the 33 bars, the `220` peak pill and the month row. It moves into
`emissions-chart.tsx` as a `"use client"` component; `dashboard.tsx` stays a
server component and renders `<EmissionsChart />`. `BARS`, `PEAK`, `Y_TICKS` and
`MONTHS` move with it. The markup, the class strings and the `em`-on-`1cqw`
sizing are unchanged — the panel's proportional scaling is load-bearing and this
step must not disturb it.

Only the chart becomes a client module. The three stat tiles keep their
`next/image` and stay server-rendered.

### The animation

One `useGSAP` with `ScrollTrigger`, scoped to the chart's own ref:

- **Gridlines** — `scaleX: 0 → 1` from `transformOrigin: "left center"`,
  `ease: "power2.out"`, small stagger top-to-bottom. This is the reference's
  "axis draws first" beat, adapted to the four horizontal rules we actually
  have.
- **Bars** — `scaleY: 0 → 1`, `transformOrigin: "bottom center"`, with
  `stagger: { amount: <total>, from: "edges", ease: "power1.inOut" }`.
  **`from: "edges"` is the whole point of the user's instruction**: GSAP's
  advanced-stagger `from` accepts `"start" | "center" | "edges" | "end" |
  "random" | <index>`, and `"edges"` starts at both ends of the target array
  simultaneously and converges on the middle. Do not hand-roll this with an
  index function — `"edges"` is the documented value and it is what "animate
  from both directions to meet in the middle" means.
  Use `amount` (a fixed total spread across all 33 bars) rather than `each`, so
  the run length is authored once and does not drift with the bar count.
- **The `220` pill** — fades and rises in after the bars land, so it does not
  float over a half-grown chart. It sits inside the peak bar's `<span>`, which
  is itself being scaled; put the pill in its own tween and make sure the
  bar's `scaleY` does not squash it (the pill is a child of the `relative
  flex-1` wrapper, not of the scaled `<span>`, so check this in the render and
  restructure only if it actually distorts).
- **Trigger** — `once: true`. Start value to be **set from a measurement, not
  guessed**: screenshot `/` at 1280 / 800 / 375 and check whether the chart's
  top edge is above or below the fold at scroll 0. If it is below the fold at a
  breakpoint, `start: "top 88%"` gives exactly the user's ask — nothing happens
  on load, the bars run as they scroll in. If it is *above* the fold at some
  breakpoint, that breakpoint gets a `start` that still requires a little
  scrolling rather than firing at scroll 0, so the behaviour reads the same at
  all three sizes. Record the measured numbers and the chosen starts in
  AGENTS.md.

Do not animate `height` — the bars' heights are inline `em` values driving
layout. `scaleY` is a compositor-friendly transform and leaves layout alone.

## 3. The page reveals

### The mechanism

`app/_components/motion/reveal.tsx`, a `"use client"` component:

```tsx
<Reveal>            {/* animates itself */}
<Reveal stagger>    {/* animates its [data-reveal-item] descendants in order */}
```

Props: `as` (element, default `div`), `stagger`, `delay`, `start`, `y`,
`immediate` (play on load instead of on scroll — the hero), plus `className` so
it can take over an existing wrapper's classes rather than adding a box.

**Server sections stay server components.** A client component may receive
server-rendered `children` as a prop without those children joining the client
bundle, so `Capabilities`, `Principles`, `CaseStudy`, `Journal` and `Testimonial`
keep their `next/image` usage and stay off the client. This is the same bundle
discipline AGENTS.md records for `chrome.tsx` inlining `CONTAINER` rather than
importing it. Do not add `"use client"` to any section file.

Implementation rules, from the project's GSAP skills and the current docs:

- `gsap.registerPlugin(useGSAP, ScrollTrigger)` once, at module scope of the
  motion module — never inside render.
- `useGSAP(() => {…}, { scope: ref })` so cleanup and reversion are automatic on
  unmount. Never a bare `useEffect` without `gsap.context()` + `ctx.revert()`.
- `gsap.matchMedia()` for the breakpoint and accessibility split:
  ```js
  mm.add({
    isDesktop: "(min-width: 1024px)",
    isMobile: "(max-width: 1023px)",
    reduceMotion: "(prefers-reduced-motion: reduce)",
  }, (ctx) => { const { isDesktop, reduceMotion } = ctx.conditions; … });
  ```
  Desktop rises from a larger `y` than mobile (the recording's mobile pass moves
  a visibly shorter distance, which is also right for a 375 viewport).
  `reduceMotion` sets the final state with `duration: 0` — the elements must end
  up **visible**, never left hidden.
- ScrollTriggers are created top-to-bottom in page order, which they will be
  naturally since each section mounts in order; no `refreshPriority` needed. If
  that turns out not to hold, set it rather than reordering the page.
- No `markers: true` in the committed code.

### The flash-of-final-state problem

The server sends the sections fully visible; the browser paints them; then the
client sets `opacity: 0` and animates. `useGSAP` runs in a layout effect, which
is before *React's* paint but after the *initial document* paint on a
prerendered page — so there is a real flash.

Fix it in CSS, not in JS. `app/globals.css` gets:

```css
@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {
  [data-reveal] { opacity: 0; }
}
```

so the hidden start state is in the server-rendered stylesheet, and users with
JavaScript disabled or reduced motion requested get the page at full opacity
with no dependency on GSAP ever running. The reveal tweens animate `opacity` to
1 and **must not** `clearProps` it, or the CSS rule takes over again and the
element vanishes.

`scripting: enabled` is baseline across current Chrome, Safari and Firefox; if
the build's browser target rejects it, fall back to a `noscript` override and
say so.

### What gets revealed

Mapped from the recording, section by section:

| section | targets |
| --- | --- |
| `Hero` (on load) | h1 line 1, h1 line 2, lede, button row, then `HeroDashboard` — one staggered sequence |
| `Capabilities` | heading; the image panel; the four `<li>` staggered; the button |
| `Principles` | the two heading lines; the three cards staggered left→right |
| `CaseStudy` | the panel — image, then the text column |
| `Journal` | the mark; the heading; the three list items staggered; the button |
| `Testimonial` | the portrait; the quote block |
| `CtaBand` | wrapped **at the call site in `app/page.tsx`**, so the band animates on `/` only |

**The hero's two title lines need to be separately targetable**, and today they
are one text node split by `<br>`. They become two `<span className="block">`s,
the pattern `/careers`' masthead already uses. Both lines are the same
Newsreader face here, so the line-box union problem AGENTS.md records for the
careers masthead (which mixes Newsreader and Archivo on one line) does not
apply — but **verify it**: screenshot `/` at 375 / 800 / 1280 before and after
and confirm the h1's ink is unmoved.

**`chrome.tsx` is not edited.** `CtaBand` and `SiteFooter` are shared with
`/journal` and `/about`, and the footer is marked do-not-restyle. Wrapping
`CtaBand` from `app/page.tsx` gets the recording's CTA fade without touching a
shared component. The footer wordmark is not animated — the recording shows it
simply scrolling into view.

## Non-goals

- No pinning, no `scrub`, no parallax, no smooth-scroll library, no
  `ScrollSmoother`. The recording contains none of these and they would fight
  the sticky navbar.
- No animation on `/journal`, `/about`, `/careers`, the articles, the job
  listings or `/design-system`. This prompt is the homepage only.
- No `SplitText`. It is free as of GSAP 3.13 and would be the idiomatic way to
  stagger the headings per line, but it mutates the DOM after hydration and the
  two headings that need splitting can carry authored spans instead. Record it
  in AGENTS.md as the considered alternative.
- No layout, type-scale, spacing or colour changes anywhere. If a reveal appears
  to need a layout change to work, stop and raise it.
- No new dependencies — `gsap@^3.15.0` and `@gsap/react@^2.1.2` are already in
  `package.json`.

## Expected impact

- **Step 1:** every prerendered page byte-identical.
- **Steps 2–3:** `/`'s prerendered HTML changes — `data-reveal` attributes, the
  h1's two spans, the chart's wrapper — and `/` gains a small client bundle
  (GSAP core + ScrollTrigger + the two motion modules). Every other route's HTML
  must stay identical apart from the build id and the CSS chunk name; verify
  against a worktree build of the parent commit, the method AGENTS.md already
  records.
- No layout row moves at any breakpoint on any page, `/` included, once the
  animations have settled.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Production build on a free port (`npx next start -p 3001` — check port 3000
  first, the user may have `next dev` running).
- Screenshot `/` at 375 / 800 / 1280 in the **settled** state and diff against a
  build of the parent commit with `magick compare -metric AE`. Target: 0.
- Record the chart: confirm the bars start at the two ends and converge, and
  that nothing fires until the first scroll.
- Toggle `prefers-reduced-motion: reduce` and confirm the whole page is visible
  and static.
- Load `/` with JavaScript disabled and confirm nothing is stuck invisible.
- Confirm the sticky navbar still pins past the fold on `/` at all three widths.

Then update `AGENTS.md` with a new "Homepage motion" section covering: the
component split and why `sections.tsx` survives as a barrel; the `from: "edges"`
stagger and the measured trigger starts; the `Reveal` contract and the
server-children bundle rule; the `scripting: enabled` CSS start-state and why
`clearProps` is forbidden; the `matchMedia` breakpoint/reduced-motion split; and
the GSAP facts confirmed against the current docs this session (advanced-stagger
`from` values, `matchMedia`'s conditions object and cleanup return, `useGSAP`
scope-and-revert, ScrollTrigger creation order, all plugins free since 3.13).
Add the mechanical steps — frame extraction with `ffmpeg` + `magick montage` for
reading a reference recording — to AGENTS.md §3 Automation. Then commit to
`main`.

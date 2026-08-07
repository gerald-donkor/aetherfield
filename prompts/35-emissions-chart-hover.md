# 35 — The emissions chart's hover readout

## Scope, and why it is next

`~/Pictures/Screenshots/Screenshot_20260807_105228.png` is the homepage hero
dashboard, the whole panel in frame with the "Carbon emissions trend" chart
filling its lower half. The ask: *"animate the chart to be interactive when
pointing over it."*

The chart is `app/_components/home/emissions-chart.tsx`, rendered only by
`HeroDashboard` (`home/dashboard.tsx`) and therefore only by `/`. It already
carries the site's most elaborate entrance — 4 gridlines, 33 bars on
`from: "edges"`, and the `220` pill — and then **does nothing at all** once it
has landed. It is the last piece of the homepage with a resting state and no
response to the pointer, now that `/job-listing/[slug]` (prompt 34) and the
navbar (prompt 33) have closed the route-level gaps.

**This is the chart's first interactive behaviour, and it is a hover readout,
not new choreography.** Number 35 is the next free number (`prompts/` holds two
files numbered 30, one of which — `30-careers-and-job-listing-reveals.md` — was
never executed; 34 is the highest).

## Reference material read

- `~/Pictures/Screenshots/Screenshot_20260807_105228.png` — the request. It is a
  **static** screenshot of the settled chart, so it constrains the *rest* state
  and nothing about the motion. **There is no reference recording for this
  interaction.** Every duration, ease and opacity below is therefore either the
  site's existing constant or an explicitly-labelled judgement — say
  *judgement*, never *measured*, if any of them is revisited.
- `app/_components/home/emissions-chart.tsx` — `BARS` (33 values), `PEAK`,
  `Y_TICKS`, `MONTHS`, the entrance timeline and the `em`-on-`1cqw` markup.
- `app/_components/home/dashboard.tsx` — the panel, and the one
  `overflow-hidden` in it (the Forecast tile's image box, unrelated).
- `app/_components/home/hero.tsx` — the chart's ancestors, none of which clips.
- `app/globals.css:96-109` — the `(scripting: enabled) and
  (prefers-reduced-motion: no-preference)` start-state block.
- `app/_components/motion/register.ts` — `DUR 0.5`, `EASE "power3.out"`.
- AGENTS.md, "Homepage motion" (the chart's measured `bottom bottom` trigger and
  the `from: "edges"` stagger), "The journal mark's hover" (the paused-tween /
  `hasHover` / listener-gating shape), and both `contextSafe` fix sections.
- The `dataviz` skill's `references/interaction.md` — the rules this design is
  checked against, quoted where they bind below.

## The design

**The pill is already the chart's readout; hovering moves it.** The comp draws a
single brand-yellow `220` pill above the peak bar. Rather than inventing a
tooltip in a vocabulary the panel does not have, the hover *retargets that pill*:
it glides along the tops of the bars to the hovered column and reads that bar's
value; on pointer-leave it glides back to the peak and back to `220`.

Three consequences, and all three are why this shape was chosen over a tooltip
card:

- **It invents no data.** The chart's y-axis is unitless (0–240) and the panel's
  only unit, `192,000 tCO₂e`, belongs to a different tile at a different scale,
  so a tooltip claiming a unit would be fabricating one. The pill shows a bare
  number, exactly as the comp draws it. Likewise **no date**: the month axis is
  five `justify-around` labels over 33 bars, so the bar→month mapping is
  approximate *in the comp itself*. Do not derive one.
- **It adds no colour token.** dataviz asks that "the hovered mark lifts (slight
  lighten or outline)"; this lifts by *dimming the rest*, so the bars stay
  `bg-ink` and the pill stays `bg-brand`.
- **The hit target is the column band, not the 0.3em bar** — dataviz's "the hit
  target is bigger than the mark". Each bar already sits in a `flex-1` wrapper,
  so the band including its share of the `0.45em` gap is ~3 % of the plot width
  and the pointer only has to be *nearest*, never dead-centre.

On hover of column `i`:

| element | from | to |
| --- | --- | --- |
| the pill | peak column, `220` | column `i`, `BARS[i]` |
| bar `i` | `opacity 1` | `opacity 1`, `scaleX 1.6` |
| every other bar | `opacity 1` | `opacity 0.28` |

`scaleX 1.6` on a `0.3em` bar is `0.48em` — visibly the hovered one without
touching layout, and the bars' `transform-origin` is already `bottom center`
from the entrance. **Amplitudes and durations below are judgements**, anchored on
the site's constants:

- pill glide **0.28 s**, `EASE` — fast enough to keep up with a moving pointer,
  and `power3.out` is the site's one reveal curve.
- bar dim / undim **0.2 s**, `EASE`.
- `0.28` dim opacity — enough separation to read the hovered bar as selected
  while the trend's shape stays legible behind it.

## Implementation notes — five traps, all already on file

1. **The pill must stay a child of the peak bar's wrapper.** Its rest position is
   pure CSS (`absolute bottom-full left-1/2 -translate-x-1/2 mb-[0.6em]`) against
   a wrapper whose height *is* the peak bar's height. Re-authoring it at plot
   level means computing that position, and the flex row's `gap-[0.45em]` makes
   a percentage `left` land a few pixels off — which would break the settled
   render and the JS-off state at once. So the pill stays where it is and the
   hover writes a **delta** from measured rects.
2. **`-translate-x-1/2` will be consumed by the first tween that touches the
   transform.** AGENTS.md records this precisely: `_parseTransform` folds
   Tailwind v4's independent `translate` / `rotate` / `scale` into one
   `transform` and sets all three to `none`
   (`node_modules/gsap/CSSPlugin.js:859-866`). The pill's text changes width
   between `35` and `220`, so a baked-in pixel half-width goes stale. **Author
   `xPercent: -50` in the tween vars** and let GSAP own the centring; drive
   position with `x` alone.
3. **Build the tweens eagerly inside the `mm.add` handler; gate only the
   listener binding**, on the entrance timeline's `onComplete`. The entrance
   writes `opacity` and `y` on the same pill, so a hover mid-entrance must be
   inert — and the journal-mark fix proved that "bind it later" is the correct
   half and "create it later" is the crash. **No `contextSafe` anywhere**: every
   GSAP callback runs with its creating context active
   (`gsap-core.js:981`), and wrapping work that is already inside a live context
   is the documented `RangeError`.
4. **One delegated `pointermove` on the plot, not 33 `pointerenter`s**, with the
   bar wrappers' centres cached once per `mm.add` run. Recompute the cache on
   `ScrollTrigger.refresh` (the panel is `cqw`-sized, so every resize moves every
   centre) — never read a rect inside the move handler, which is per-frame layout
   thrash. Use **`gsap.quickTo`** for the pill's `x`: it is built for a
   continuously-retargeted value, and nothing here ever needs to *reverse* a
   tween, which is the one thing `quickTo` cannot do. The bar dim/undim runs on
   *index change only*, tracked against a `lastIndex`, not on every move.
5. **`hasHover: "(hover: hover)"` is a named condition**, alongside the existing
   `reduceMotion` / `fullMotion` pair — a JS pointer handler gets none of the
   `@media (hover:hover)` wrapping Tailwind v4 gives its `hover:` utilities, so
   nothing may stick on touch. At 375 the `1cqw` root is ~3.35 px and the bars
   are ~1 px wide; that viewport is touch in practice and this gate is what keeps
   the behaviour off it.

**Reduced motion keeps the readout and drops the motion** — `duration: 0` on
every tween, listeners still bound. This is a deliberate divergence from the
capabilities section's "reduce gets nothing at all", and the reason is that this
hover carries *information* rather than decoration: the CSS hovers on `/journal`
and the article cards already behave this way (`motion-reduce:transition-none`
keeps the hover state and makes it instant). Record the divergence and its
reason in AGENTS.md.

**No `globals.css` change.** The rest state is correct and visible with
JavaScript off; there is nothing to hide. `[data-chart-pill]`'s existing
opacity-0 rule is untouched and still owned by the entrance.

## What must be measured, and how

Production build on a free port (check 3000/3001/3002 first — a stale server
answers `curl` with the previous build; confirm the served CSS chunk matches),
Playwright out of the npx cache resolved fresh this session, against a sibling
worktree build of the parent commit with hard-linked `node_modules`.

1. **The settled render is untouched.** `magick compare -metric AE -fuzz 5%` at
   375 / 800 / 1280 with the documented settle procedure (`document.fonts.ready`,
   full 400 px scroll pass, back to 0, **≥ 6 s** before the `fullPage` shot).
   **Report it scoped**: `/` is only ever `0` *outside the capabilities cloth
   box* — a bare page-wide number for `/` means nothing and must not be quoted.
   Expect `0` outside that box at all three.
2. **Page heights unchanged at 6350 / 6006 / 5595.** A hover that writes
   `scaleX` and `opacity` is not layout; any movement here is a bug.
3. **The pill lands on the hovered column.** Dispatch `pointermove` at the
   measured centre of bars 0, 8, `PEAK`, 24 and 32 at 1280, wait for the glide,
   and require the pill's ink-box centre within **2 px** of the bar's centre at
   every one — including bars 0 and 32, where the pill overhangs the plot's edge
   and must not be clipped. Read its `textContent` and require it to equal
   `BARS[i]` exactly.
4. **Rest is restored exactly.** After `pointerleave`, the pill's rect and text
   must return to the pre-hover values, and all 33 bars to `opacity 1`,
   `scaleX 1`. This is the check that the settled `AE 0` in (1) is not an
   accident of when the screenshot was taken.
5. **Mid-entrance hover is inert.** Dispatch `pointermove` over the plot before
   the entrance timeline completes and require the pill's transform unchanged —
   the listener-gate.
6. **Reduced motion**: the readout still tracks the pointer and the pill arrives
   in ≤ 30 ms. **JS off**: the pill sits at the peak reading `220` at its
   recorded box, all bars at `opacity 1`, and the plot has no listener.
7. **Touch**: with `hasHover` not matching, no listener is bound and a synthetic
   pointer sequence leaves the pill at rest.
8. **Lifecycle**: four `/` ⇄ `/journal` round trips, each with a full scroll pass
   and a hover over the chart before navigating — **zero page errors and zero
   console errors**. This is the surface the two `contextSafe` crashes came from.

Probe the chart by anchoring on `[data-chart-*]` inside the hero panel — note
AGENTS.md's warning that the page carries **two** "Energy consumption" cards, so
a `.first()` selector on this panel's siblings can silently read the wrong one.

## Expected impact

- **`/` is the only route whose prerendered HTML changes**, and its markup diffs
  should be exactly the hover hooks: a `data-chart-plot` on the plot div and a
  `data-chart-col` (with its index) on each of the 33 bar wrappers, plus the
  chunk/build-id renames. **No class string changes**, so there is **no RSC
  flight-payload re-segmentation to see through** — the other **15 pages must be
  byte-identical** once the build id and the CSS and JS chunk names are
  normalised, with no stripping and no substitution.
- **Every route keeps its exact chunk set** — `/`, `/journal`, `/about` and
  `/careers` 10, the rest 9, the two error pages 8. The behaviour bundles into
  `/`'s existing page chunk; `emissions-chart.tsx` is already a client module and
  nothing new is imported. **Diff the chunk bytes, not the count.**
- Nothing outside `home/` may import this file, and it stays component-only.

## Non-goals

- **No tooltip card, no crosshair, no unit and no date.** dataviz: bar charts
  take a per-mark readout and no crosshair, and the two labels this chart could
  claim are not in the design (see "The design").
- **No keyboard affordance, no `<table>` view, no ARIA change.** This is a
  decorative product mockup in a marketing hero, not a data product: it presents
  no information the page's argument depends on, and its numbers are fiction. Its
  peak value stays visible at rest without any interaction, which is the sense in
  which the readout "enhances and never gates". Making the 33 bars focusable
  would put 33 tab stops in front of the site's first CTA. Record this as a
  decision with its reason rather than an oversight.
- **No colour change.** Bars stay `bg-ink`, the pill stays `bg-brand`, and no new
  token is introduced. The `#2683EB` accent belongs to the seal and the stat
  tile's delta.
- **No change to the entrance** — the `bottom bottom` / `once: true` trigger, the
  `from: "edges"` stagger, the gridline and pill tweens, `DUR` and `EASE` are all
  measured or settled and none is touched.
- **No geometry, type, spacing or asset change**, and no change to
  `dashboard.tsx`, `hero.tsx`, `register.ts`, `reveal.tsx` or `globals.css`.
- **No scrub, pin, parallax or loop.** The capabilities cloth stays the site's
  only scroll-linked element.
- **The other two hero-adjacent behaviours are untouched** — the capabilities
  card's lean and its counter, both in `capability-visual.tsx`.

## Checks

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output.
Then the eight measurements above.

## What to record in AGENTS.md

A new subsection under "Homepage motion", after "The chart — `from: "edges"`":
the pill-as-readout decision and the two labels it deliberately does not claim;
the delta-from-rest positioning and why the pill stays inside the peak wrapper;
the `xPercent: -50` fix for the consumed `-translate-x-1/2`; `quickTo` for the
pointer channel and the `lastIndex` gate for the dim; the eager-tween /
gated-listener shape and the standing no-`contextSafe` rule; `hasHover` as the
fourth named condition; **the reduced-motion divergence and its reason**; the
a11y decision and its reason; and the measured table (settled scoped `AE`, page
heights, pill-centre error, rest restoration, chunk bytes). Mark every duration,
ease and opacity as a **judgement**, with the note that no recording covers this
interaction.

## SKILLS USED

- **gsap-core** — tween vars, `xPercent`, `stagger`, `gsap.matchMedia()` with
  named conditions including `prefers-reduced-motion`, and the transform-alias
  rules.
- **gsap-react** — `useGSAP` with `{ scope: root }`, refs over bare selectors,
  and cleanup via `mm.revert()`. Note this project **overrides** the skill's
  `contextSafe` guidance: see AGENTS.md, "Fix — the journal mark's
  `contextSafe`".
- **gsap-utils** — `gsap.utils.clamp` / `snap` for mapping pointer x to a bar
  index without a per-frame rect read.
- **gsap-performance** — transform-only channels (`x`, `scaleX`, `opacity`), no
  layout reads inside the move handler, and no `will-change`.
- **dataviz** — `references/interaction.md` for the hover-layer rules this design
  is checked against (mark-as-hit-target, hit target bigger than the mark, the
  hovered mark lifts, values lead labels, `textContent` for any inserted text).
- **frontend-design:frontend-design** — for keeping the readout in the panel's
  existing vocabulary rather than adding a tooltip idiom the comps never draw.
- **tailwind-4-docs** — confirming in the **built** stylesheet how v4 emits
  `-translate-x-1/2` (the independent `translate` property), which is what trap 2
  turns on.

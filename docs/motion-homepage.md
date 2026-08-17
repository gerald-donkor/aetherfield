# Homepage motion (`/` only, until prompt 24)


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
`PRINCIPLES` from **`home/principles-data`**, a component-free module.
(`principles.tsx` re-exported it as well until prompt 113 — see the entry at the
end of this file.)

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

### The chart's hover readout

Prompt 35. The user circled the whole hero dashboard in
`~/Pictures/Screenshots/Screenshot_20260807_105228.png`: *"animate the chart to
be interactive when pointing over it."* It is the chart's **first interactive
behaviour** — until now it ran its entrance and then did nothing — and it lives
in the same client leaf, `home/emissions-chart.tsx`, which stays
component-only. `dashboard.tsx`, `hero.tsx`, `register.ts`, `reveal.tsx` and
`globals.css` are all untouched.

**The screenshot is static, so it constrains the rest state and nothing about
the motion. There is no reference recording for this interaction.** Every
duration, ease and opacity below is either the site's existing constant or an
explicitly-labelled **judgement** — say *judgement*, never *measured*, if any of
them is revisited.

**The pill is already the chart's readout; hovering retargets it.** Rather than
inventing a tooltip in a vocabulary the panel does not have, the hover glides
the brand-yellow pill along the tops of the bars to the hovered column and reads
that bar's value; pointer-leave glides it back to the peak and back to `220`.

| element | rest | hovering column `i` |
| --- | --- | --- |
| the pill | peak column, `220` | column `i`, `BARS[i]` |
| bar `i` | `opacity 1`, `scaleX 1` | `opacity 1`, `scaleX 1.6` |
| every other bar | `opacity 1` | `opacity 0.28` |

Three consequences, and all three are why this shape beat a tooltip card:

- **It invents no data.** The y-axis is unitless (0–240) and the panel's only
  unit, `192,000 tCO₂e`, belongs to a different tile at a different scale, so a
  tooltip claiming a unit would fabricate one. **And no date** — the month axis
  is five `justify-around` labels over 33 bars, so the bar→month mapping is
  approximate *in the comp itself*. Do not derive one.
- **It adds no colour token.** The hovered bar lifts by *dimming the rest*, so
  bars stay `bg-ink` and the pill stays `bg-brand`. `#2683EB` still belongs to
  the seal and the stat tile's delta.
- **The hit target is the column band, not the 0.3em bar.** Each bar already
  sits in a `flex-1` wrapper, so the band including its share of the `0.45em`
  gap is ~3 % of the plot width and the pointer only has to be *nearest*.

Judgements: pill glide **0.28 s**, bar dim/undim **0.2 s**, both on `EASE`
(`power3.out`, the site's one reveal curve, a little under `DUR`);
`scaleX 1.6` on a `0.3em` bar is `0.48em`, visibly selected without touching
layout, and the bars' `transform-origin` is already `bottom center` from the
entrance; **`0.28` dim opacity** keeps the trend's shape legible behind the
selection.

**The pill stays a child of the peak bar's wrapper, and the hover writes a
delta.** Its rest position is pure CSS (`absolute bottom-full left-1/2
-translate-x-1/2 mb-[0.6em]`) against a wrapper whose height *is* the peak bar's
height; re-authoring it at plot level would mean computing that position, and
the row's `gap-[0.45em]` makes a percentage `left` land a few pixels off — which
would break the settled render and the JS-off state at once. So `x` carries
`centres[i] − centres[PEAK]` and nothing else moves.

**`xPercent: -50` is the fix for the consumed `-translate-x-1/2`, and it is
load-bearing rather than tidy.** The first tween to touch this element's
transform consumes Tailwind v4's independent `translate` — `_parseTransform`
folds `translate` / `rotate` / `scale` into one `transform` and sets all three
to `none` (`node_modules/gsap/CSSPlugin.js:859-866`), baking the centring in as
a **pixel** half-width. The pill's text changes between `35` and `220`, so that
pixel value goes stale and the readout would drift off-centre. One
`gsap.set(pill, { xPercent: -50, x: 0 })` hands the centring to GSAP; it renders
identically, which is what holds the settled `AE` at 0.

**One delegated `pointermove` on the plot, not 33 `pointerenter`s**, with the
column centres cached once per `mm.add` run and recomputed on
`ScrollTrigger.refresh` (the panel is `cqw`-sized, so every resize moves every
centre). **Never read a rect inside the move handler** — that is per-frame
layout thrash. The cache is keyed on **`pageX`, not `clientX`**, so a vertical
scroll cannot invalidate it. The dim runs on **index change only**, tracked
against a `last` index, not on every move.

**`gsap.quickTo` drives the pill's `x`** — it is built for a continuously
retargeted value, and nothing here ever needs to *reverse* a tween, which is the
one thing `quickTo` cannot do.

**`quickTo` is NOT usable at `duration: 0`, and this was measured rather than
assumed.** Its tween is created paused with a `"+=0.1"` placeholder and driven
by `resetTo` (`gsap-core.js:4179`); at zero duration the first reduced-motion
probe read the pill **308.59 px** from the hovered column — it had not moved at
all — while the text and the dim both landed correctly. The reduce branch
therefore writes the value with `gsap.set`. The dim's plain `gsap.to` at
`duration: 0` works fine and is left as one channel.

**Reduced motion keeps the readout and drops the motion** — listeners still
bound, every channel instant. **This is a deliberate divergence from the
capabilities section's "reduce gets nothing at all", and the reason is that this
hover carries *information* rather than decoration**: it is exactly how the CSS
hovers on `/journal` and the article cards already behave
(`motion-reduce:transition-none` keeps the hover state and makes it instant).

**Both tweens are built eagerly inside the `mm.add` handler; only the listener
binding is gated**, on the entrance timeline's `onComplete`. The entrance writes
`opacity` and `y` on the same pill, so a hover mid-entrance must be inert — and
the journal-mark fix proved that "bind it later" is the correct half and "create
it later" is the crash. **No `contextSafe` anywhere in this file**, per the
standing rule.

**`hasHover: "(hover: hover)"` is a named condition** alongside the existing
`reduceMotion` / `fullMotion` pair — a JS pointer handler gets none of the
`@media (hover:hover)` wrapping Tailwind v4 gives its `hover:` utilities, so
nothing sticks on touch.

**No `globals.css` change.** The rest state is correct and visible with
JavaScript off, so there is nothing to hide; `[data-chart-pill]`'s existing
`opacity: 0` rule is untouched and still owned by the entrance.

**Accessibility — a recorded decision, not an oversight.** No keyboard
affordance, no `<table>` view, no ARIA change. This is a decorative product
mockup in a marketing hero: it presents no information the page's argument
depends on, its numbers are fiction, and its peak value stays visible at rest
without any interaction — the sense in which the readout enhances and never
gates. Making the 33 bars focusable would put 33 tab stops in front of the
site's first CTA.

#### Measured in the production build

Against a worktree build of `659725a`, servers on 3013 / 3012.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| page height | **6350** | **6006** | **5595** |
| settled `AE` @ 5 % fuzz, outside the cloth box | **0** | **0** | **0** |
| inside the cloth box | 62.9 | 0 | 0 |

Page heights are the recorded numbers **unchanged** — a hover that writes
`scaleX` and `opacity` is not layout, so any movement here would be a bug. The
cloth-box remainder is the scrubbed capabilities parallax at a different phase;
**never quote a bare page-wide `AE` for `/`**.

At 1280, `pointermove` dispatched at the measured centre of bars 0, 8, `PEAK`,
24 and 32:

| bar | 0 | 8 | 20 (`PEAK`) | 24 | 32 |
| --- | --- | --- | --- | --- | --- |
| pill-centre error | **−0.01 px** | −0.01 | −0.01 | −0.01 | −0.01 |
| pill text | `35` | `63` | `220` | `165` | `112` |
| hovered bar | `opacity 1`, `matrix(1.6, 0, 0, 1, 0, 0)` at every one | | | | |
| the other 32 | `opacity 0.28` exactly, at every one | | | | |

**The pill is never clipped at the extremes**: at bar 0 it spans 233.8–260.6 and
at bar 32 1053.4–1086.2, both inside the panel's 184.1–1095.9, and the whole
ancestor chain computes `overflow: visible`. **Nothing in that chain may become
`overflow-hidden`.**

**Rest is restored exactly.** After `pointerleave` the pill returns to
`32.78×19 +745+781.03` reading `220` — its pre-hover rect to the pixel — and all
33 bars to a single `opacity 1` / `scaleX 1.000`. **Mid-entrance hover is
inert**: a `pointermove` 120 ms into the entrance leaves the pill reading `220`.

**Reduced motion** at 30 ms after the move: text `63`, pill-centre error
**−0.008 px**, hovered bar `1`, others `0.28`. **JavaScript off**: pill at
`32.78×19 +745+781.03` reading `220`, all bars `opacity 1`, `transform: none`
with the CSS `translate: -50%` intact, and no listener. **Touch** (`hover:
hover` forced false): no listener bound, pill unmoved at `220`.

**Four `/` ⇄ `/journal` round trips, each with a full scroll pass and four
hovers over the chart before navigating: zero page errors and zero console
errors.** That is the surface both `contextSafe` crashes came from.

#### Impact

**`/` is the only route whose prerendered HTML changes**, and its markup diffs
are exactly the hover hooks — one `data-chart-plot` and 33 `data-chart-col`
attributes. Verified by substitution: with those 34 attributes stripped, `/` is
**byte-identical** to the base build. No class string changed, so there is **no
RSC flight-payload re-segmentation to see through**, and the other **15 pages
are byte-identical** once the build id and the CSS and JS chunk names are
normalised, with no stripping and no substitution.

**Every route keeps its exact chunk set** — `/`, `/journal`, `/about`,
`/careers` and the three job listings 10, the rest 9, the two error pages 8 —
and every route's chunk **bytes** are identical except `/`: **787 103 → 788 439
raw (+1 336)** and **245 661 → 246 137 gzipped (+476)**.

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


---

## Prompt 113 — the dead `PRINCIPLES` re-export in `principles.tsx`

`principles.tsx` carried `export { PRINCIPLES };` under a comment claiming it
existed "so `home/sections` and every existing import still resolve". **No
import resolved through it.** `grep -rn "PRINCIPLES" app/ lib/` returns eleven
lines and only three are references rather than prose: `principles.tsx:3` (its
own import) and `:31` (its own render), and `about/sections.tsx:4`, which
already reads `from "../home/principles-data"` — the correct module. The
comment's premise was stale, and the evidence governs (§12 rule 8).

The line is deleted, together with the comment that justified it; the surviving
comment records why the module stays component-only. `principles-data.tsx`'s own
docstring made the same stale claim in its last sentence and is corrected in the
same change. (`npx prettier --write` also dropped a pre-existing trailing blank
line from that file — the committed version fails `prettier --check` too, so it
is an incidental format fix, not a change this prompt set out to make.)

### Checks

`npm run lint` clean · `npm run typecheck` clean — **the primary evidence no
importer was missed** · `npm test` **12 files, 302 tests passed** ·
`npm run build` ✓, route table unchanged: `/`, `/about`, `/careers`,
`/design-system`, `/journal` `○ Static`, `/article/[slug]` (6) and
`/job-listing/[slug]` (3) `● SSG`.

### Prerender diff — `08f61a2` vs this change

Two built worktrees under `~/.cache/aetherfield-prerender/`, compared over all
**21** prerendered HTML files. Three normalisations were needed, and the third
is new — **it is written up in `docs/automation.md` as trap 10**:

1. the build id, which also appears inside the flight payload as `"b":"<id>"`;
2. the Turbopack chunk filenames, which are **not** stable between builds of
   identical input — canonicalised here to a hash of each chunk's *contents*, so
   a real change still shows;
3. **Server Action ids** — `createServerReference("40cc1357…")` is salted per
   build. Before normalising it, the 255 KB shared chunk reported as differing
   at *identical byte length*, exactly the way the build id used to.

**18 of 21 byte-identical.** The remaining three (`/job-listing/*`) differ in one
6292-byte chunk, at identical byte length, by a **minifier local-identifier
permutation inside `Reveal`** — `{immediate:m, className:d}` against
`{immediate:d, className:m}`. Nothing semantic; no route's markup changed.

### Bundle measurement — nothing moved

Summed bytes of the client chunks each prerendered page references:

| page | before | after | delta |
| --- | --- | --- | --- |
| `/` | 901,275 | 901,275 | **0** |
| `/about` | 890,190 | 890,190 | **0** |
| `/careers` | 896,558 | 896,558 | **0** |
| `/journal` | 891,253 | 891,253 | **0** |
| `/design-system` | 889,192 | 889,192 | **0** |

Chunk counts are identical too (10/10, except `/design-system` 9/9). **No bundle
win, and none is claimed** (§12 rule 7) — a re-export nobody imports is an edge
nobody traverses.

### The mechanism, probed rather than restated — and the result is honest

The front matter's rule is that a constant exported from a client-importing
module drags GSAP into the importer's bundle. A third build **probed** it:
`export { PRINCIPLES };` restored *and* `about/sections.tsx` repointed at
`../home/principles`, so an importer genuinely walks through.

`/about`'s chunk bytes came back **890,190 — unchanged, 10 chunks**.

**The probe cannot demonstrate the hazard on `/about`, because `/about` already
loads GSAP.** Two of its ten chunks carry it before any probe: a 998-byte chunk
containing `"Reveal"` and `useGSAP`, and the 255,315-byte shared chunk
containing `useGSAP`. `/about` has its own motion (`docs/motion-site.md`), so the
cost the rule warns about is already paid there for independent reasons, and
Turbopack has nothing left to pull in.

So, stated as §12 rule 4 requires: **measured** — removing the re-export changes
no byte of any bundle, and re-adding it with a live importer changes no byte of
`/about`'s. **Judged** — the invariant still holds for an importer that is *not*
already a GSAP page, which is what `principles-data.tsx` was created to
guarantee and what the four cautionary comments citing it protect
(`nav-drop.tsx:69`, `footer-reveal.tsx:56`, `journal/stamp-perforations.tsx:35`,
`capability-visual.tsx:43`). This codebase has no such importer today. The value
of the deletion is that the door is shut, not that a bundle shrank.

## Prompt 114 — the principle card, extracted (the `/` side and the stagger hook)

The same card rendered twice over the same `PRINCIPLES` array, in
`home/principles.tsx` and `about/sections.tsx`. Prompt 113 had just shut the
re-export between those two files; this one collapses the markup that sat on
either side of it.

**It is a variant, not a copy, and the five differences are the record.** They
were read out of the two sources and are preserved unchanged — the next session
does not have to re-derive them:

| | `/` | `/about` |
| --- | --- | --- |
| list wrapper | `<ul>` inside `<Reveal as="section" stagger>` | `<Reveal as="ul">` |
| grid | `mt-10 grid gap-6 md:mt-12 lg:grid-cols-3` | `mt-8 grid gap-4 md:mt-10 lg:grid-cols-3` |
| card | `rounded-card bg-white p-8 md:p-10` | `rounded-card bg-surface p-10` |
| heading spacing | `mt-8` | `mt-5` |
| stagger hook | `data-reveal-item` | absent |

`app/_components/home/principle-card.tsx` holds only the invariant part — the
`<li>` box model, the eight-attribute SVG block, and the `h3` / `p` pair — and
takes three props: `className` (background and padding), `headingClassName`
(the measured top margin), and `revealItem`. The grid and the `Reveal` wrapper
stay at each call site, because they differ structurally and not by a class;
`/about`'s list-level reveal is a separate measurement in `docs/motion-site.md`.

**Why extracting won the judgement the prompt left open.** The invariant surface
is ~15 lines of markup, the variant surface is three props. Where those numbers
had come out level the prompt's own instruction was to leave both sites alone
and cross-reference them instead.

**It stays a server component.** It imports the `PRINCIPLES` *type* only, from
`principles-data.tsx`, so neither page gains a client boundary and the front
matter's bundle rule is untouched.

### `data-reveal-item` survives being emitted by a child

The hook is a GSAP selector, not styling, and getting it wrong would break the
homepage stagger silently — the cards would still render, just without their
reveal. Two things confirm it did not:

- `revealItem` is written `data-reveal-item={revealItem || undefined}`, so React
  emits `data-reveal-item="true"` on `/` and the attribute is **absent** on
  `/about` — which is exactly what the built HTML shows (45 occurrences in
  `index.html`, 3 in `about.html`, none of the latter on a values card).
- A `Reveal` scope selector still matches an attribute set by a child component,
  because the scope is a DOM subtree and not a compile-time one.

### Checks

`npm run lint` and `npm run typecheck` exited 0 with no diagnostics. `npm test`
passed 302 tests in 12 files.

### Prerender diff — `cd928f6` vs this change

Paired builds per `docs/automation.md`, both with the same in-memory
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, both trees excluding `.claude/` and
`.agents/`. Route tables identical, 32 static pages generated on each side.
Both sides produced the same **21** `app/**/*.html` paths, and after normalising
`BUILD_ID` and both content-hashed chunk patterns and stripping the
`self.__next_f.push` scripts, **0 files differed**.

**The HTML being byte-identical is what settles `/` and `/about`.** No
`magick compare` was run, and the standing capabilities-cloth masking warning
therefore never came into play — a pixel comparison answers a weaker question
than the one already answered here.

### A CSS delta that was not this change

The first paired build reported **three added rules, all for one custom utility
unrelated to this work** — the dead two-word band class that `prompts/115` exists
to delete, deliberately not spelled here. It is defined in `app/globals.css`, has
no consumer, and shipped only because that **untracked** prompt file names the
token six times and Tailwind v4 scans `prompts/` — the prompt-74 trap, hit again
by the prompt file written to remove the utility. Rebuilding the implementation
tree with that one file removed put the CSS at **68,656 bytes on both sides,
0 rules added and 0 removed**. Nothing in this change touches the CSS.

### The stagger, confirmed running rather than assumed

A prerendered-HTML diff cannot see a GSAP failure, so the production build was
served on port 3001 and driven with the project's own Playwright Chromium at
1280×900, sampling computed style on the three cards after scrolling the section
into view:

| | card 1 | card 2 | card 3 |
| --- | --- | --- | --- |
| at scroll-in | `opacity 0`, `y 36` | `opacity 0`, `y 36` | `opacity 0`, `y 36` |
| t ≈ 150 ms | 0.032 | 0 | 0 |
| t ≈ 300 ms | 0.810 | 0.548 | 0.078 |
| t ≈ 450 ms | 0.984 | 0.928 | 0.789 |
| settled | `opacity 1`, `y 0` | `opacity 1`, `y 0` | `opacity 1`, `y 0` |

The three lead each other in order, which is the stagger and not one shared
tween. `/about`'s values cards read `opacity 1` and `transform: none`
throughout, as they must — there the reveal is on the `<ul>` itself.

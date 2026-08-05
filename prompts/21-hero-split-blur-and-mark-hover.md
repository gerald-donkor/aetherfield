# 21 — The hero's split blur-in, and the journal mark's hover tilt

## Scope, and why it is next

Two homepage motion asks from the user, in one prompt because they share the
same client-leaf pattern, the same `matchMedia` contract and the same
`globals.css` start-state block:

1. **The journal mark gains a hover treatment.** `JournalMark` in
   `app/_components/home/journal-mark.tsx` currently flips in once, on enter,
   and is then inert. The user circled it again in
   `~/Pictures/Screenshots/Screenshot_20260805_212139.png`: *"Let this rotate
   and tilt at 45 degree above when hovered upon."*
2. **The hero's type is split and blurs in.** The user circled the whole hero
   block — both `h1` lines, the lede and the two buttons — in
   `~/Pictures/Screenshots/Screenshot_20260805_213058.png`: *"split the text
   here and give it a nice blurry animation."*

It is next because the homepage motion sequence (prompts 17–20) is otherwise
complete and these are the only two outstanding requests against it. Nothing
else on the site is blocked by either.

**This prompt deliberately overrides one recorded decision.** AGENTS.md,
"Homepage motion", records: *"`SplitText` was considered and rejected. It is
free as of GSAP 3.13 and would be the idiomatic way to stagger the two headings
per line, but it mutates the DOM after hydration; the two headings that need
splitting carry authored spans instead."* The user has now asked for split text
explicitly, which is the deviation route AGENTS.md section 1 allows. The
mitigation is not to avoid the plugin but to run it correctly — see "SplitText,
done safely" below. Strike the rejection line from AGENTS.md and record the new
reasoning in its place.

## Reference material

- `~/Pictures/Screenshots/Screenshot_20260805_212139.png` — the journal mark
  circled at rest, viewport ~1347. Same element as prompt 20's screenshot.
- `~/Pictures/Screenshots/Screenshot_20260805_213058.png` — the hero circled:
  `h1` line 1, `h1` line 2, the lede, and the two buttons, viewport ~1351.
- `app/_components/home/journal-mark.tsx` — the mark, its enter tween and the
  `REST_ROTATION = -8` constant.
- `app/_components/home/hero.tsx` — a **server** component rendering
  `<Reveal as="section" stagger immediate>` over four `data-reveal-item`s: the
  two `h1` spans, the lede `p`, the button row, and the dashboard wrapper.
- `app/_components/motion/reveal.tsx` — the `matchMedia` / reduce-branch /
  `mm.revert()` contract every client leaf follows.
- `app/_components/motion/register.ts` — `DUR = 0.5`, `EASE = "power3.out"`,
  the single registration site.
- `app/_components/home/emissions-chart.tsx` and `journal-mark.tsx` — the
  client-leaf shape: component-only file, `useGSAP(fn, { scope: root })`,
  `mm.add(..., root)`, `return () => mm.revert()`.
- `app/globals.css:62-98` — the `(scripting: enabled) and (prefers-reduced-motion:
  no-preference)` hidden-start-state block.
- `node_modules/gsap/SplitText.js` — GSAP 3.15.0, so SplitText is bundled and
  free. Register it in `register.ts`, never inside a render.
- AGENTS.md, "Homepage motion (`/` only)" — the whole section is the contract
  this work extends.

## Part 1 — the journal mark's hover tilt

### The reading of "45 degree above", stated so it can be corrected

The mark rests at **−8°** on screen (`md:-rotate-[8deg]`, restated in JS as
`REST_ROTATION`). Prompt 20 established that "45 degrees" from this user is an
**on-screen** angle, and that the mark's enter gesture runs from a net −45° up
to that −8°.

So the hover is read as **the enter pose, revisited**: hovering tilts the mark
back out to **−45°** — further counter-clockwise, i.e. the right-hand tip lifts
*above* its resting line, which is the "above" in the ask — and adds the same
`rotationY` flip component the enter tween uses, at a reduced amount so hover
reads as a lean rather than a replay. Mouse-out reverses it exactly.

Two alternatives, recorded so the choice is visible rather than assumed:

- *+45° on screen* — sweeps the mark clockwise through horizontal, past its
  resting tilt and down the other side. Rejected for the reason prompt 20
  rejected it for the enter: the gesture crosses the rest angle instead of
  extending from it.
- *a literal `rotation: 45` in the vars object* — neither 45 on screen nor
  defensible, because the tween's start is the composed −8. Rejected.

If the user meant a full 45° of *additional* tilt (rest −8 → −53), that is a one
number change at `HOVER_ROTATION`; say so in the completion report.

### The tween

- `rotation: REST_ROTATION → HOVER_ROTATION` where `HOVER_ROTATION = -45`.
- `rotationY: 0 → 12`, with `transformPerspective: 800` carried on both ends —
  the same perspective the enter tween uses, and required for the same reason
  (without it `rotateY` is an orthographic squash, AGENTS.md).
- Duration `DUR * 0.7`, `EASE`, reversing on mouse-out. **`DUR` and `EASE` are
  imported from `register.ts`, never restated** — the rule prompt 18 set.
- Build the tween **paused** in the effect and drive it with `.play()` /
  `.reverse()` from `pointerenter` / `pointerleave`, so mouse-out interrupts
  mid-flight and unwinds from wherever it is. A `gsap.to` per event would
  stack; a `quickTo` cannot reverse along the same curve.
- The listeners are attached inside the `useGSAP` callback and **removed in the
  returned cleanup**; any GSAP object created in a handler is wrapped in
  `contextSafe` (gsap-react: objects created after `useGSAP` runs are not in the
  context and never get reverted).

### Ordering against the enter flip

The enter tween writes `rotation` on the same element and is `once: true`. The
hover tween must not be able to fight it:

- Gate the hover tween's creation on the enter tween's `onComplete`, or hold
  the hover timeline paused at progress 0 and only bind the listeners once the
  enter tween has landed. Either is acceptable; whichever is chosen, **verify
  in the render** that hovering during the enter flip cannot leave the mark off
  its resting angle.
- The hover tween's *start* vars must be the composed resting pose
  (`rotation: REST_ROTATION`, `rotationY: 0`), never `rotation: 0` — the same
  trap prompt 20 documented, where GSAP folds the Tailwind `rotate` property
  into `transform` and clears it (`CSSPlugin.js:859-866`).

### The conditions

Three named conditions on one `gsap.matchMedia()`, extending the pair the file
already has:

- `isTabletUp: "(min-width: 768px)"` — the mark is `display: none` below `md`,
  so no hover tween is created at 375 **at all**.
- `hasHover: "(hover: hover)"` — nothing may stick on touch. Tailwind v4 wraps
  its own `hover:` rules in this query (AGENTS.md, prompt 19); a JS handler gets
  no such wrapper, so the query is authored here explicitly.
- `reduceMotion` / `fullMotion` — the reduce branch **binds no listeners and
  creates no tween**, and touches only `opacity`, exactly as the enter branch
  does. Touching a transform property there would parse the transform and strip
  the authored `rotate: -8deg`.

### Measurements this part must hit

Take these in the **production** build (`npx next start -p 3001`), via
Playwright, at 375 / 800 / 1280:

| | must be |
| --- | --- |
| resting rect, 375 / 800 / 1280 | `0×0` (display none) / `307×184` / `421×252` — **unchanged from prompt 20** |
| resting computed transform | 2D block exactly `cos/sin 8°` (`matrix3d(0.990268, -0.139173, …)`), unchanged |
| hovered `rotation` | −45.0 ± 0.5 at 800 and 1280 |
| after mouse-out | back to the resting matrix above, to 3 decimal places |
| hover at 375 | no tween created, no listener bound, `display: none` |
| reduced motion | `opacity 1`, `rotate: -8deg` as the CSS property, hover inert |

**Overflow must be computed, not eyeballed**, exactly as prompt 20 did it. The
unrotated box is 400×200 at `lg`. Rotated half-width is `(w·cosθ + h·sinθ)/2`:
**211.9 at 8°** and **212.1 at 45°** — a 0.2px growth, so the mark cannot reach
the article list horizontally. Half-*height* is **126.8 at 8°** and **212.1 at
45°**, i.e. it grows ~85px above and below into the left column's whitespace.
**Verify at 800 and 1280 that the hovered bbox overlaps nothing** — the heading
and the list are in the other grid column — and that nothing in the ancestor
chain is `overflow-hidden` (the mark already spills the left gutter at `md`).

## Part 2 — the hero's split blur-in

### What is split, and what is not

| element | treatment |
| --- | --- |
| `h1` line 1 span | SplitText `type: "words"`, blur-in per word |
| `h1` line 2 span | same, continuing the same stagger |
| the lede `<p>` | SplitText `type: "lines"`, blur-in per line |
| the button row | **unchanged** — stays a `data-reveal-item` on `Reveal` |
| the dashboard wrapper | **unchanged** — stays a `data-reveal-item` |

Words for the heading and lines for the lede is a **performance** choice, not a
taste one: an animated `filter: blur()` forces a repaint of each target's layer
every frame, so the target count is kept in single digits. The heading is 5
words; the lede is 1–2 lines depending on breakpoint. Splitting either to
`chars` would put ~90 blurred layers on screen at once and is out of scope —
if the user wants per-character, that is a follow-up with its own measurement.

The two authored `<span className="block">`s **stay**. They are the comp's line
break at all three breakpoints (AGENTS.md) and SplitText must not be asked to
find it — `type: "words"` on each span leaves the break alone.

### The animation

One timeline, on load (the hero is above the fold — the existing `immediate`
behaviour):

```
from { opacity: 0, filter: "blur(12px)", y: 14 }
to   { opacity: 1, filter: "blur(0px)",  y: 0, duration: DUR, ease: EASE,
       stagger: 0.06 }
```

then the lede's lines on the same vars, then `Reveal`'s remaining two items.

- **`DUR` and `EASE` come from `register.ts`.** The stagger is 0.06 rather than
  the page's 0.08 because there are more, smaller targets; it is the only new
  number and it is authored next to the existing one, not in place of it.
- **`filter: "blur(0px)"`, not `"none"`** as the tween's end value — GSAP
  interpolates blur numerically only between two `blur()` functions. Then
  `clearProps: "filter"` on complete, so no compositing layer is left behind.
  **`clearProps` may never touch `opacity` or `transform`** (AGENTS.md: it hands
  the element back to the CSS start state and it vanishes).
- 12px of blur is the starting proposal; fit it by eye against the recording's
  register — the site's vocabulary is soft and decelerating, and blur that reads
  as a lens rather than a smear is roughly 1.5–2× the type's cap height at
  desktop. Record the number chosen and why.
- **Sequencing with the rest of the hero.** The two `h1` spans and the `<p>`
  come **off** `data-reveal-item`, so `Reveal`'s stagger drops from four items
  to two (buttons, dashboard). Give `Reveal` a `delay` — it already takes one —
  so the buttons still follow the type rather than racing it. Target: the whole
  hero entrance runs within **±20 %** of its current length (currently
  `0.5 + 3×0.08 = 0.74s`). Measure the current length first, then fit the delay.

### SplitText, done safely

The reasons AGENTS.md rejected the plugin are real and each has a specific
answer. All four must be in the implementation:

1. **It mutates the DOM after hydration.** So it runs inside the client leaf's
   `useGSAP` only, never during render, and the server markup is unchanged —
   React never sees the split nodes because they are created below a node React
   does not re-render. Confirm no hydration warning in the console.
2. **Line splits are wrong before webfonts load.** Use `autoSplit: true` with
   the animation created **inside `onSplit(self)` and returned from it**, so
   SplitText reverts, re-splits and re-syncs on font load and on resize
   (gsap-plugins). Do **not** create the tween outside `onSplit` — it would
   target orphaned nodes after the first re-split.
3. **Accessibility.** Leave `aria: "auto"` (the default): SplitText puts an
   `aria-label` on the split element and `aria-hidden` on the pieces, so the
   `h1` still reads as one string. Verify the accessibility tree in the render,
   not just the markup.
4. **Cleanup.** `useGSAP`'s context reverts the split on unmount; the leaf
   still returns `() => mm.revert()` like every other. Do not call `revert()`
   twice.

Also: **do not add `text-wrap: balance`** anywhere in the hero — it interferes
with splitting — and **SplitText does not support SVG `<text>`**, so nothing
here may be pointed at the journal mark or the footer wordmark.

### Structure

- New client leaf `app/_components/home/hero-text.tsx`, `"use client"`,
  **component-only** — a constant or type exported from it drags GSAP into any
  page that imports it, the rule that forced `PRINCIPLES` out into
  `principles-data.tsx`.
- It takes its `h1` and `p` as **children**, so `hero.tsx` stays a **server
  component** and `HeroDashboard`'s `next/image` never joins the client bundle.
  **Do not add `"use client"` to `hero.tsx`.**
- `SplitText` is registered once in `register.ts` alongside `ScrollTrigger` and
  re-exported from there. No other registration site.
- The hidden start state joins the existing `globals.css` block as
  `[data-hero-split] { opacity: 0; }` — **opacity only**, no start transform and
  no start filter, for the reason the `[data-journal-mark]` rule already records
  (a CSS start transform gets decomposed and leaves residue the tween never
  clears). With JavaScript off, or reduced motion requested, the hero is simply
  at rest.

## Expected impact

- **`/` is the only route whose prerendered HTML may change.** The other 15
  pages must be **byte-identical** once the build id and the CSS chunk name are
  normalised — use the scratchpad helper, and note the two traps AGENTS.md
  records: the chunk name is **not hex** (`[A-Za-z0-9_-]+`), and
  `difflib.SequenceMatcher` on a 200 KB single-line page times out.
- **Every one of those 15 pages must keep an identical chunk set.** SplitText is
  ~20 KB and must not leak:
  `grep -o '/_next/static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/<page>.html | sort -u`,
  diffed against the parent build.
- **`/`'s settled state must be pixel-identical** at 375 / 800 / 1280
  (`magick compare -metric AE` at 5 % fuzz against a worktree build of the
  parent commit) and its page heights unchanged at **6350 / 6006 / 5595**.
  Build the parent in a sibling worktree with hard-linked `node_modules`, per
  AGENTS.md section 3.
- `/`'s own HTML diffs should be confined to: the hero's `data-reveal-item`
  attributes moving to `data-hero-split`, the new client reference for
  `hero-text`, and the page chunk rename. The journal mark's markup does not
  change at all — its hover is pure JS.

## Non-goals

- **No other page's type is split.** `/careers`' masthead, the article
  mastheads and the `/about` hero are fitted against comps and no reference
  covers them. Extending the treatment is a separate decision.
- **No per-character split**, for the repaint reason above.
- **The journal row hover (prompt 19) is untouched**, as is `cards.tsx`,
  `CtaBand`, `chrome.tsx` and the footer.
- **No new `motion` (Framer) usage.** `motion@^13` stays unused; the homepage is
  GSAP throughout and the two libraries do not share a page.
- **No pinning, scrub, parallax or `ScrollSmoother`.** The vocabulary is
  unchanged: fade, rise, and now blur.
- No comp exists for either effect, so **nothing here is fitted against
  `public/assets/pages`** — the resting geometry is, and must not move.

## Checks

Report exact output; never claim a check passed without running it.

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npx next start -p 3001` (check port 3000 first — a `next dev` may be
   running; leave it alone). Screenshot `/` at 375 / 800 / 1280,
   `deviceScaleFactor: 1`, `fullPage: true`, via `playwright-core` out of the
   npx cache — **resolve the cache path this session**
   (`ls -d /home/gdk26/.npm/_npx/*/node_modules/playwright-core`), and use the
   CommonJS default-import form.
5. State probes, scripted rather than eyeballed: the mark's hover matrix and its
   return; the split nodes' opacity/filter at rest; the hero's total entrance
   length; the reduced-motion resting state; the JavaScript-disabled resting
   state.
6. Kill the server by port, not `pkill -f "next start"`.

## What to record in AGENTS.md afterwards

Under "Homepage motion (`/` only)", two new subsections:

- **"The journal mark's hover"** — the reading of "45 degrees above" and the two
  rejected readings; the paused-tween/`play`+`reverse` mechanism and why not
  `quickTo`; the `hasHover` condition; the ordering guard against the enter
  flip; the computed overflow numbers; the measured hover and return matrices.
- **"The hero's split blur-in"** — that SplitText is now used and **why the
  earlier rejection was overridden**, with the four mitigations; words-for-
  heading / lines-for-lede and the repaint reason; the blur value chosen and how;
  the `autoSplit` + `onSplit` return contract; the `clearProps: "filter"` rule
  and the standing prohibition on clearing opacity or transform; the `Reveal`
  delay fitted to hold the entrance length; and the chunk-set verification.

Strike the existing line *"`SplitText` was considered and rejected"* and replace
it with a pointer to the new subsection. Update `register.ts`'s comment if the
registration list changes.

Then commit both parts to `main` (section 1, step 10). Two commits — the hover
and the split are independent and either could be reverted alone.

## SKILLS USED

- **gsap-plugins** — SplitText: `SplitText.create`, `type`, `autoSplit`,
  `onSplit` return contract, `aria`, and the "no SVG `<text>`" limit.
- **gsap-react** — `useGSAP({ scope })`, `contextSafe` for the pointer handlers,
  cleanup on unmount, and keeping GSAP off the server render.
- **gsap-core** — `gsap.matchMedia()` conditions, `fromTo`, stagger, easing, and
  the reduced-motion branch.
- **gsap-timeline** — sequencing the heading, the lede and the remaining
  `Reveal` items so the hero entrance holds its current length.
- **gsap-performance** — the cost of animating `filter`, keeping the blurred
  target count low, and preferring transforms elsewhere.
- **frontend-design** — judging the blur amount and the hover's lean so both sit
  inside the site's existing soft, decelerating register rather than reading as
  a stock effect.
- **tailwind-4-docs** — confirming against the **built** stylesheet how any new
  utility is emitted, the way prompt 19 checked `translate-x-2.5` and
  `transition-transform`.
- **run** — driving the production build for the screenshots and state probes.

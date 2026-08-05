# 22 — Capabilities card + journal thumbnail micro-interactions

## Scope, and why it is next

Six user-marked elements on `/`, from six screenshots. Four of them live inside
the `Capabilities` section's image + metric card; two are the journal row
thumbnails and that section's background photograph. Prompts 17–21 built the
homepage's motion system (`Reveal`, the chart, the journal-mark flip and hover,
the hero split); this is the next layer of it — the section that has had no
treatment at all yet — and it needs no new route, comp or asset.

| ref (`~/Pictures/Screenshots/`) | circled | ask |
| --- | --- | --- |
| `Screenshot_20260805_213647.png` | the three journal row thumbnails | zoom in + go monochrome on hover |
| `Screenshot_20260805_214711.png` | the "Energy consumption" card | flip horizontally to the right on hover |
| `Screenshot_20260805_214431.png` | the asterisk in that card | spin clockwise, slowly |
| `Screenshot_20260805_215046.png` | the `↓12.4%` delta | read high→low, redder as the value rises, arrow follows |
| `Screenshot_20260805_220055.png` | the `583.7 MWh` value | speedometer counting, fast, up and down |
| `Screenshot_20260805_220329.png` | the cloth background photo | "falling from the sky" feel |

Three decisions taken with the user before writing this:

- the card **leans and returns**, not a 180° flip — no back face exists in any comp;
- the counter, the delta and the spin **loop continuously while on screen**, paused off;
- the cloth is **scroll-linked drift**, not an autonomous float.

## Reference material

- The six screenshots above.
- `app/_components/home/capabilities.tsx` (the section, currently all server).
- `app/_components/home/journal.tsx` (the rows, and their measured hover).
- `app/_components/home/journal-mark.tsx` (the paused-tween hover idiom, the
  `matchMedia` condition set, the `contextSafe` rule).
- `app/_components/motion/reveal.tsx`, `motion/register.ts` (`DUR`, `EASE`).
- `AGENTS.md` — "Homepage motion" and all its subsections.

## Deliberate deviation from the recorded vocabulary

`AGENTS.md` records "nothing is scrubbed… no parallax" and "once, on enter" as
the homepage's whole vocabulary. Three of these asks break it on purpose: a
scrubbed ScrollTrigger on the cloth, two `repeat: -1` loops, and the site's
second and third JS-driven hovers. This is a **user override**, the same kind as
the seal's offsets and the 20 % speed-up. Record it in `AGENTS.md` as an
override so a later session does not "fix" it back.

## Implementation

**New — `app/_components/home/capability-visual.tsx`**, `"use client"`, the one
new client leaf. It takes the `<Image>` as `children` so `capabilities.tsx`
stays a **server** component and `next/image` never enters the client bundle —
the device `Reveal` and `HeroText` already use. Keep it **component-only**: a
constant or type exported from here and imported elsewhere drags GSAP into that
page's bundle (the rule that forced `PRINCIPLES` into `principles-data.tsx`).

Structure, replacing `capabilities.tsx:26–62`:

```
<div data-reveal-item className="relative aspect-[692/566] w-full overflow-hidden">
  <div ref={drift} className="absolute inset-0">{children}</div>
  <div className="@container absolute inset-x-[8%] top-1/2 -translate-y-1/2 lg:inset-x-[16%]">
    <div ref={card} className="bg-white p-[4.5cqw] text-[2.6cqw]">…</div>
  </div>
</div>
```

- `data-reveal-item` stays on the **outer** box: the section's stagger must
  still be **7 items** (h2, image box, 4 `li`, button).
- The drift goes on an **inner** wrapper, never the `data-reveal-item` box —
  `Reveal`'s stagger writes `y` on that box and the two would fight.
- `overflow-hidden` clips the drift. Safe here; the recorded "nothing may become
  `overflow-hidden`" warnings are about the `Seal`'s and the journal mark's
  ancestor chains, both in other sections.
- The card's interior markup, class strings and `em`-on-`cqw` sizing are copied
  **verbatim**; that proportional scaling is load-bearing.

One `useGSAP` + one `gsap.matchMedia()`, four named conditions as
`journal-mark.tsx` does it (`reduceMotion` / `fullMotion` / `hasHover`, plus a
breakpoint if needed). `mm.add(…, root)`, `return () => mm.revert()`,
`useGSAP(fn, { scope: root })`. `DUR` / `EASE` from `register.ts`, never
restated. No `clearProps` on opacity or transform. Anything created after
`useGSAP` has run goes through `contextSafe`.

**1. Cloth drift.** `fromTo(drift, { yPercent: -5 }, { yPercent: 5, ease: "none",
scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top",
scrub: 0.6 } })`, with a constant `scale` on the wrapper so the overscan never
reveals an edge. 5 % of a 566-tall box is ~28 px; check both extremes and raise
the scale if an edge appears.

**2. Card lean.** A **paused `fromTo` driven by `play()` / `reverse()`**, not a
`gsap.to` per event — a mouse-out mid-flight must unwind along the same curve.
`rotationY: 0 → 20`, `transformPerspective: 900`, `transformOrigin: "50% 50%"`.
`transformPerspective` is required, not decorative: without it `rotateY` is an
orthographic squash. "To the right" is read as the right edge receding, i.e. a
**positive** `rotationY`. `duration: DUR * 0.7`, `EASE`. Bound only under
`hasHover`; listeners removed and the tween killed in cleanup.

**3. Asterisk spin.** `to(svg, { rotation: 360, duration: 9, ease: "none",
repeat: -1, transformOrigin: "50% 50%" })` — one turn per 9 s for "not so fast".
GSAP resolves SVG `transformOrigin`; do not hand-author `transform-box`.

**4. Counter + delta, one timeline.** Driven from one tween on a proxy so the
delta *is* the direction the reading is moving and the arrow can never disagree.

```
READINGS = [583.7, 611.2, 548.9, 604.5, 666.3, 583.7]
```

Starts and ends on 583.7, so `repeat: -1` is seamless and the loop rests on the
comp's shipped value. The final step `666.3 → 583.7` is **−12.39 %**, which
reproduces the comp's `↓12.4%` exactly — that is why 666.3 is the fifth reading.

Per step: tween the proxy, `duration 0.7`, `ease: "power2.inOut"` — the
speedometer snap, deliberately *not* `EASE`, which never accelerates — then a
`1.2` s hold. `onUpdate` writes:

- the value at `toFixed(1)` to the number text node only; the `MWh` span is a
  sibling and must not be overwritten;
- the delta `(current − prev) / prev × 100` as `↑`/`↓` + `toFixed(1)` + `%`.
  Monotonic within a step, so the arrow cannot flicker;
- the delta's colour, `gsap.utils.interpolate(BLUE, RED, clamp01(delta / 12))` —
  blue at or below zero, fully red at +12 %. `BLUE` is `#2683EB`, exactly
  `--color-accent` (the `Seal`'s precedent for an inline hex with that note).
  `RED` gets no design-system token for one element; state the hex in a comment
  and record it in `AGENTS.md`.

Two mechanics to get right:

- **Tabular figures.** All six readings are three digits + one decimal, but the
  value and the delta still need `tabular-nums` or the number jitters as digits
  change. Check for jitter in the render.
- **The arrow is a text glyph**, as it already ships. `↓` ships today so `↑` is
  not a new risk, but **confirm `↑` renders in the mono cut** at 1280 —
  `AGENTS.md` records the nav `→` shipping from an arbitrary fallback. If it
  does not, both arrows become a drawn SVG, which is out of scope here.

**Pausing off screen.** One `ScrollTrigger.create({ trigger: root, start: "top
bottom", end: "bottom top", onToggle })` playing/pausing both loops. Both start
paused. This is the whole reason "continuous" is affordable.

**Reduced motion.** No tween, no timeline, no listener, no ScrollTrigger — the
branch returns immediately and the section is exactly what the server sent.
Verify the DOM text is untouched, not merely that nothing animates.

**Edited — `app/_components/home/capabilities.tsx`.** Replace lines 26–62 with
`<CapabilityVisual><Image … /></CapabilityVisual>`. Stays a server component.

**Edited — `app/_components/home/journal.tsx`.** CSS only, no GSAP, stays a
server component. Wrap the `<Image>` in `<span className="block overflow-hidden">`
and add `transition-[scale,filter] duration-300 ease-in-out
group-hover:scale-110 group-hover:grayscale motion-reduce:transition-none`.
`duration-300 ease-in-out` is the curve already **measured** for these rows —
reuse it, do not refit. Tailwind v4 emits `scale-110` as the independent `scale`
property (the mechanic already recorded for `translate-x-2.5`), so the
transition list names `scale`, not `transform` — **verify against the built
stylesheet**, not from memory. v4 wraps `group-hover:` in `@media (hover:hover)`
for free.

**`app/globals.css`** needs nothing new: every element here is visible at rest
and the loops start from the shipped values.

## Expected impact

- `/` page heights **unchanged** at 6350 / 6006 / 5595.
- Settled `/` **pixel-identical outside the capabilities image box** at 375 /
  800 / 1280. It will *not* be identical inside it — the cloth's scrubbed
  position at the screenshot scroll differs from the parent build. Scope the
  comparison and record the one region that legitimately differs rather than
  reporting a bare `AE`.
- `/` is the **only** route whose prerendered HTML changes; its diffs should be
  the new `CapabilityVisual` client reference, the journal image wrapper and
  class strings, and the page chunk rename.
- The other **15 pages byte-identical** once the build id and the CSS chunk name
  are normalised, and **every one keeps an identical chunk set** — no GSAP leak.

## Non-goals

- **`cards.tsx` / `ArticleCardStacked` is not touched.** It carries the same
  thumbnail idiom on `/journal`, the article recent-articles band and
  `/design-system`, but those were fitted against their own comps and no
  reference covers them — the call `AGENTS.md` already records for the row hover.
- No new design-system tokens, no type-scale change, no new imagery, no `magick`.
- `dashboard.tsx` / `emissions-chart.tsx` untouched — a separate settled treatment.
- No pinning, no `ScrollSmoother`, no horizontal scroll. The cloth's is the only
  scrub added.

## Checks

1. `npm run lint`, `npm run typecheck`.
2. `npm run build`, served on a **free port** — check 3000 first, a `next dev`
   may be running and every screenshot would silently come from it.
3. Worktree build of the parent commit (`git worktree add ../aetherfield-base
   HEAD` + `cp -al node_modules …`; Turbopack rejects a symlinked
   `node_modules`), then the pixel and HTML diffs above. Normalise the CSS chunk
   name with `[A-Za-z0-9_-]+` — it is **not** hex — and never run
   `SequenceMatcher` over a 200 KB single-line page.
4. Chunk-set check on every page:
   `grep -o '/_next/static/chunks/[A-Za-z0-9_-]*\.js' .next/server/app/<page>.html | sort -u`.
5. Runtime probes at 375 / 800 / 1280: hovered vs. resting thumbnail `scale` and
   `filter`; hovered card `rotationY` and its unwind after mouse-out; the
   asterisk's matrix advancing; value and delta text changing with the arrow and
   colour tracking the sign; both loops `paused` at scroll 0 and running once the
   section is in view; and the whole set inert under
   `prefers-reduced-motion: reduce` and with JavaScript off.

## Record in AGENTS.md

A "Capabilities section" subsection under "Homepage motion" covering: the
vocabulary override and that it is the user's; the client-leaf split and why the
`<Image>` arrives as `children`; the drift-on-inner-wrapper reason; the
`READINGS` sequence and why 666.3 is load-bearing; the `RED` hex and why it is
not a token; the tabular-figures and arrow-glyph mechanics; and the journal
thumbnail classes with the Tailwind v4 `scale`-property note. Plus any new
mechanical step for section 3 (Automation).

## SKILLS USED

- `gsap-react` — `useGSAP`, `scope`, `contextSafe`, cleanup on unmount.
- `gsap-core` — tween vars, `matchMedia`, easing, `fromTo` semantics.
- `gsap-timeline` — the counter/delta loop's sequencing and `repeat: -1`.
- `gsap-scrolltrigger` — the cloth's `scrub`, and the on-screen `onToggle` gate.
- `gsap-utils` — `interpolate`, `clamp`, `toArray`.
- `gsap-performance` — transform-only animation, and the cost of a looping filter/repaint.
- `tailwind-4-docs` — v4's independent `scale` property and arbitrary transition lists.
- `vercel-react-best-practices` — keeping the section server-rendered and the client leaf minimal.

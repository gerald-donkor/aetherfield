# 28 — The journal stamp's perforation drift

## Scope, and why it is next

The user marked, in red on `~/Pictures/Screenshots/Screenshot_20260806_140054.png`,
the **top and bottom perforation rows of the `/journal` masthead stamp** — the
scalloped white half-circles that give the block its postage-stamp edge — and
asked for them to be permanently in motion: **top row travelling right, bottom
row travelling left**, in opposite directions, always.

It is next because it is the whole of the request and it touches one component.
`JournalStamp` (`app/_components/journal/sections.tsx:60`) is otherwise settled
against the three comps and nothing here moves any ink at rest.

## Reference material

- `~/Pictures/Screenshots/Screenshot_20260806_140054.png` — the red marks. Only
  the two perforation rows are circled; the frame, lozenge and type are not.
- `app/_components/journal/sections.tsx` — the stamp today: 26 white circles at
  pitch `1240/25 = 49.6` user units, `r 15`, at `cy 0` and `cy 480` on the
  `0 0 1240 480` viewBox.
- `app/_components/home/capability-visual.tsx` — the precedent for a gated
  `repeat: -1` loop (the asterisk's spin, the counter), for the named
  `reduceMotion` / `fullMotion` matchMedia pair, and for the `contextSafe` ban.
- `app/_components/motion/register.ts` — the single `gsap.registerPlugin` site.
- `AGENTS.md`, "Journal index (`/journal`)" and "Site motion".

## The mechanism

The perforations are evenly spaced, so **a translation of exactly one pitch,
looped, is seamless**: the row after one cycle is pixel-identical to the row at
rest. That is the whole implementation — no cloning, no wrap bookkeeping, no
modulo.

Two circles must be added, and they are required rather than padding:

- the right-moving top row needs one at `i = -1` (`x = -pitch`), so a
  perforation enters the left edge as the leftmost one leaves;
- the left-moving bottom row needs the mirror at `i = count` (`x = width + pitch`).

Both sit outside the viewBox and are clipped by the SVG root's `overflow:
hidden`, so **the rest state is pixel-identical to today**.

## Implementation

### `app/_components/journal/stamp-perforations.tsx` — new client leaf

`journal/sections.tsx` **must stay a server component** — it renders
`next/image` for `texture-journal.png` and the article grid. So only the
perforations move into a `"use client"` leaf, rendered as a child of the
existing `<svg>`, the device `capabilities.tsx` already uses.

Keep the file **component-only** — no exported constant or type — the rule that
forced `PRINCIPLES` into `principles-data.tsx`. Geometry arrives as props
(`width`, `height`, `count`, `r`) and the pitch is derived inside the leaf from
`width / (count - 1)`, so the two files cannot drift.

Markup: one outer `<g ref={root} fill="white">` holding **two sibling row
groups**, replacing today's per-index `<g>` that pairs a top and a bottom circle.

### The tweens

One `useGSAP(..., { scope: root })` with `gsap.matchMedia()`, importing `gsap` /
`ScrollTrigger` / `useGSAP` from `../motion/register` — never from the package.
`DUR` / `EASE` are not restated; this loop uses neither.

```
gsap.to(top.current,    { x:  pitch, duration: CYCLE, ease: "none", repeat: -1, paused: true })
gsap.to(bottom.current, { x: -pitch, duration: CYCLE, ease: "none", repeat: -1, paused: true })
```

- **`CYCLE = 2` seconds per pitch — the user's choice** from three offered
  (gentle 3.5 / moderate 2 / brisk 1.2). ≈25 user units per second, ≈25 px/s at
  1280. Named constant, with that note.
- **`ease: "none"`** — a conveyor must not accelerate; any easing makes the loop
  seam visible as a stutter at the wrap.
- **`x` is in user units**, so the drift scales with the viewport for free,
  exactly as the rest of the stamp does. Nothing is sized per breakpoint.
- Two tweens, not one timeline with `yoyo` — the rows never reverse.

**On-screen gate**, the capabilities precedent and the reason a `repeat: -1`
loop is affordable at all:

```
ScrollTrigger.create({ trigger: root.current, start: "top bottom", end: "bottom top",
  onToggle: self => self.isActive ? (t.play(), b.play()) : (t.pause(), b.pause()) })
```

The outer `<g>` spans the full stamp height, so it has a usable bounding box.

**Reduced motion gets nothing at all** — no tween, no ScrollTrigger; the branch
returns immediately. Nothing was ever hidden, so nothing needs restoring and
`globals.css` needs **no new start-state rule**. Both halves of the query are
named, since a lone `reduce` handler never fires for anyone else.

Cleanup: kill both tweens and the gate from the `mm.add` handler's return, and
`return () => mm.revert()` from `useGSAP`. **No `contextSafe` anywhere** —
everything is created synchronously inside the handler, and wrapping that is the
documented `RangeError` crash (AGENTS.md, both `contextSafe` fix sections).

### `Reveal` interaction

`JournalStamp`'s wrapper is `<Reveal immediate>`, which tweens `opacity` / `y`
on the **wrapper div**. These tweens write `transform` on `<g>` elements inside
the SVG — different elements, no conflict, and no `clearProps` is used.

## Measurements to hit

At 375 / 800 / 1280, production build:

- top row `x` increasing and bottom row `x` decreasing, both wrapping inside
  `[0, ±49.6]` user units;
- **seamlessness**: the stamp box at `t` and at `t + CYCLE` compares at
  `AE 0` (5 % fuzz);
- **gate**: transforms stop changing once the stamp is off screen and resume on
  return;
- **reduced motion**: no inline transform written on either row group;
- **JavaScript off**: the stamp renders at its normal box, rows at rest;
- `/journal` page heights unchanged at **3801 / 5160 / 3486**, stamp box
  unchanged at all three widths.

## Expected impact

- **`/journal` is the only route whose prerendered HTML may change**, and its
  only content diffs are the perforation `<g>` restructure, the two extra
  circles and the new client reference. The other 15 pages byte-identical once
  the build id and the CSS chunk name are normalised (the chunk name is
  `[A-Za-z0-9_-]+`, not hex).
- `magick compare -metric AE -fuzz 5%` against a worktree build of `HEAD`:
  **0 outside the stamp box** on `/journal`. Inside it, non-zero is expected and
  correct — the rows at a different phase. Report the two numbers separately,
  never a bare page AE.
- No chunk-set change is expected on any route; GSAP already reaches every page
  through the footer leaf.

## Non-goals

- The stamp's frame, lozenge, type, texture image and every comp-measured number
  are untouched. This adds motion and moves no ink at rest.
- No change to perforation pitch, radius or count *as drawn* — the two extra
  circles live outside the viewBox and are never visible.
- No scrub, pin or parallax: the capabilities cloth stays the site's only
  scroll-linked element. This is a gated loop, like the asterisk and the counter.
- `LatestArticles`, `ArticleCardStacked`, `CtaBand` and the footer are untouched.
- Nothing on `/`, the article pages, `/careers`, `/about` or `/design-system`
  changes.

## Checks

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output. Then
a production server on a free port (check 3000 / 3001 / 3002 first, and confirm
the served CSS chunk matches the build) and the Playwright probes above, plus
two `/journal` ⇄ `/` round trips with a full scroll pass each and **zero page or
console errors**.

Record in `AGENTS.md` under "Site motion": the mechanism, the seamlessness
argument, `CYCLE` and where it came from, why the two extra circles exist, the
gate, and the measurements.

## SKILLS USED

- `gsap-react` — `useGSAP`, scope, refs, cleanup, and the `contextSafe` rules.
- `gsap-core` — `gsap.to`, `repeat: -1`, `ease: "none"`, `gsap.matchMedia()`.
- `gsap-scrolltrigger` — the on-screen `ScrollTrigger.create` gate.
- `gsap-performance` — transform-only animation, keeping the loop cheap.

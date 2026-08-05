# 20 — The journal mark flips and tilts in

## Scope, and why it is next

The homepage journal section's diamond mark — `JournalMark` in
`app/_components/home/journal.tsx:9-87` — currently enters on the section's
shared reveal: it is one `data-reveal-item` among six, fading and rising 36px
with the heading, the three rows and the button. The user circled it in
`~/Pictures/Screenshots/Screenshot_20260805_192944.png` and asked for something
bespoke: *"animate this in such a way it flips and tilts from 45 degrees point
to the current position and state its in right now."*

This is the last unbuilt piece of the homepage motion work. Prompt 17 built the
scroll reveals, prompt 18 tuned their speed, prompt 19 built the row hover; the
mark is the one element the user has singled out for a treatment of its own.

**Prompt 19 is implemented but uncommitted.** `journal.tsx` carries its two
class strings already and `AGENTS.md` has no record of it. Verifying, recording
and committing that change is part of this prompt's work — see "The prompt 19
carry-over" below. It must land as its **own commit**, before this one.

## Reference material

- `~/Pictures/Screenshots/Screenshot_20260805_192944.png` — the mark circled in
  red marker, at its resting state, viewport ~1347.
- `public/design-ref/animation-ref/home-journals.webm` — **read and rejected as
  a source for this animation.** Measured across all 749 real frames
  (`-fps_mode passthrough`), the mark's blue-ink bounding box is bit-identical
  at `x 34–444, y 56–179` and its ink count constant at 5540. The mark does not
  move, flip, fade or respond to hover anywhere in that file. It constrains the
  row hover (prompt 19) and nothing else. **Do not try to fit the flip to it.**
- `app/_components/home/journal.tsx` — the mark and its wrapper.
- `app/_components/home/emissions-chart.tsx` — the precedent this follows: a
  client leaf owning its own `useGSAP` timeline, split out of a server section.
- `app/_components/motion/register.ts` — `DUR = 0.5`, `EASE = "power3.out"`.
- `app/_components/motion/reveal.tsx` — the `matchMedia` and cleanup contract.
- `app/globals.css:61-88` — the hidden-start-state block.
- AGENTS.md, "Homepage motion (`/` only)".

## The measurements the implementation must hit

### The resting state, which the animation must land on exactly

Measured in the production build via the state probe at 375 / 800 / 1280:

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `display` | **`none`** | `block` | `block` |
| rect | `0×0 +0+0` | `307×184 −85+3951` | `421×252 +12+3136` |
| computed transform | `none` | `matrix(0.990269, -0.13917, 0.13917, 0.990269, 0, 0)` | same |

**The resting matrix is not identity** — `0.990269 / −0.13917` is `cos/sin 8°`,
the authored `md:-rotate-[8deg]`. Every assertion compares against this matrix,
never against `"none"`.

**The mark is `display: none` below `md`**, so this is a tablet-and-up effect.
It nonetheless currently occupies a stagger slot at 375 for an element that is
never painted; moving it off `data-reveal-item` fixes that as a side effect.

### The tilt composes; it does not move into JS

Verified in the built stylesheet (`.next/static/chunks/*.css`):

```css
.md\:-rotate-\[8deg\]{rotate:-8deg}
```

Tailwind v4 emits the **independent `rotate` property**, not `transform`. Per
css-transforms-2 the used matrix is `translate × rotate × scale × transform`, so
anything GSAP writes into `transform` is applied *inside* the authored tilt.
Consequences the implementation depends on:

- A tween ending at `rotation: 0` lands the mark at exactly the authored −8°.
  **Do not move the −8 into JS.**
- `getComputedStyle(el).transform` reads `none` while `rotate` is `-8deg`, so
  GSAP's parser never sees the −8 and cannot double-count it.
- GSAP's `_removeIndependentTransforms` (`node_modules/gsap/CSSPlugin.js:123`,
  called at :164 and :605) does `style.removeProperty("rotate")` — but it is
  guarded by `if (style.translate)`, i.e. only when an **inline** `translate`
  exists. The −8 comes from a stylesheet class, so `el.style.translate` is `""`
  and the branch never runs.
- **`rotate` in a GSAP vars object is an alias for `rotation`**
  (`CSSPlugin.js:1592`, `"8:rotate"`) — it writes `transform`, not the CSS
  property. Never write `rotate:` in a tween expecting the CSS property.

### The start state

"45 degrees" is a number the user read off the screen, so it is an **on-screen**
start angle. The mark rests at −8° on screen, so the tween runs:

```
{ opacity: 0, rotationY: 45, rotation: -37 }  →  { opacity: 1, rotationY: 0, rotation: 0 }
```

`-37 + -8 = -45`, so the mark starts at a net **−45° on screen** and unwinds in
one continuous direction onto its resting −8°. This is chosen over the
opposite-sign reading (`rotation: 53`, net +45°, sweeping across vertical and
overshooting the rest angle) because it never reverses direction and makes the
authored −8° the terminus of the gesture rather than a point the mark flies
past. The third reading — a literal `rotation: 45` on top of the CSS, netting
+37° — is neither 45 on screen nor defensible, and is what falls out of not
accounting for the CSS tilt. Record the choice; it is a judgement, not a fit.

Caveat to record: "net 45" is strictly a sum only at `rotationY: 0`. At t=0,
with the flip also applied, the composite is not a pure Z rotation and the
perceived tilt is slightly under 45°. It converges as the flip closes.

### The flip

**`transformPerspective: 800` is required, not decorative.** Without a
perspective, `rotateY(45deg)` is an orthographic projection — a flat horizontal
squash with no foreshortening — and does not read as a flip at all. GSAP writes
it as `perspective()` at the head of the element's own transform string
(`CSSPlugin.js:1078-1079`), which is element-local and needs no `perspective` on
the parent. 800 is ~2× the lg element width, inside the conventional 600–1000.

`transformOrigin` stays at the default `50% 50%`: the diamond path spans
`6…394` of the 400-wide viewBox, so its visual centre is the box centre.

### Timing

`EASE` (`power3.out`) unchanged, so the vocabulary does not drift. Duration
**`DUR * 1.5` = 0.75s** — the flip travels much further than a 36px rise and
reads rushed at 0.5. Import both from `motion/register`; do not restate them.

Trigger `start: "top 88%", once: true` — `Reveal`'s default, so the mark starts
with its section rather than on a second, independent threshold.

### Overflow — computed, not eyeballed

For a 2:1 box the rotated bounding half-width `(w·cosθ + h·sinθ)/2` is flat
between 8° and 45°:

| | box | rest (−8°) right edge | start (−45°) right edge | list starts at |
| --- | --- | --- | --- | --- |
| md (768) | 290×145 at x −96…194 | 202.7 | **202.8** | 222 |
| lg (1280) | 397.3×198.7 at x 0…397.3 | 409.2 | **409.4** | 437.3 |

Under a tenth of a pixel at both breakpoints — the width lost to `cos` is repaid
by the height projected through `sin`. And `rotationY: 45` foreshortens X by a
further ~0.7×, so the mid-flip box is *narrower* than at rest. **No `-ml-24`
clearance problem and no overlap with the article list.** The left edge at lg
spills 11.8px into the 24px gutter at rest and 12.0 at the start — unchanged,
and nothing in the chain is `overflow-hidden` (it must stay that way).

The vertical bbox does grow, 184→308 (md) and 252→421 (lg), roughly ±62/±85px.
That spills into whitespace above and the empty tail of the left grid column
below; the h2 and the list are in the *other* column. **Eyeball 768**, where the
section's top padding is tightest.

## The change

Four files. `journal.tsx` stays a **server component**.

1. **New `app/_components/home/journal-mark.tsx`** — `"use client"`. The
   existing `JournalMark` SVG moves here verbatim, wrapped in a component that
   owns the wrapper `div`, the `ref`, and the `useGSAP` tween. Follows
   `emissions-chart.tsx`'s shape exactly: `gsap.matchMedia()` with **both**
   halves named (`fullMotion` / `reduceMotion` — a lone `reduce` query never
   fires for anybody else), `root` passed as `mm.add`'s third argument so the
   bare selector resolves inside the element, `return () => mm.revert()`, and
   `useGSAP(fn, { scope: root })`. The reduce branch `gsap.set`s the final state
   and returns.
2. **`app/_components/home/journal.tsx`** — delete the local `JournalMark`
   (:9-87), import the new component, and **drop `data-reveal-item`** from the
   wrapper (:98) so `Reveal`'s stagger stops claiming it. The wrapper's class
   string moves with the component unchanged.
3. **`app/globals.css`** — add `[data-journal-mark]` to the start-state block
   with a start state matching the tween's `from` vars **exactly**, including
   the perspective, since the tween starts from a transform and not just
   opacity:

   ```css
   [data-journal-mark] {
     opacity: 0;
     transform: perspective(800px) rotateY(45deg) rotateZ(-37deg);
   }
   ```

   `transform` is one property, so both rotations go in one declaration. This
   does not conflict with `rotate: -8deg` — different property.
4. **`AGENTS.md`** — see "Record" below.

**No `clearProps` anywhere.** Clearing any transform-related property clears the
whole transform and hands the element back to the CSS rule, and it vanishes.

**Do not add `will-change`.** GSAP's default `force3D: "auto"` already appends
`translateZ(0)` for the tween's duration and strips it on completion — the layer
promotion, done and undone at the right times. A static `will-change` pins the
layer permanently. **`backfaceVisibility` is not needed** either: the flip never
passes 90°, so the back face is never presented.

Accept the leftover inline `transform: perspective(800px) …rotateY(0deg)
rotateZ(0deg)` after the tween. It is cosmetic and must be left alone.

## Expected impact

- **`/` is the only route whose prerendered HTML may change.** `/journal`,
  `/careers`, `/about`, `/design-system`, all six articles and all three job
  listings must come back byte-identical apart from the build id and the CSS
  chunk name. Verify with the build-diff helper (AGENTS.md § 3).
- **`/`'s settled state must be pixel-identical** at 375 / 800 / 1280, and its
  page heights must stay **6350 / 6006 / 5595**. The tween ends on the same
  matrix the CSS class already produces, and no layout property is animated.
- **GSAP must not leak.** `journal-mark.tsx` is reachable only via
  `journal.tsx` → the `home/sections.tsx` barrel → `app/page.tsx`. Confirm with
  the chunk-graph diff, not just the markup:
  `grep -o '/_next/static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/<page>.html | sort -u`
- Keep `journal-mark.tsx` **component-only**. If it ever exports a constant or a
  type and another page imports it, GSAP travels — the rule that forced
  `PRINCIPLES` out into `principles-data.tsx`.

## The prompt 19 carry-over

`prompts/19-journal-row-hover.md` is implemented in the working tree and
uncommitted. Before starting this prompt:

1. Verify it against its own "Checks" section — the 10.0px rect delta on hover,
   `opacity` 1 → 0.7, `text-decoration-line: none` in both states, the `<li>`
   rect unchanged, and a mid-transition sample strictly between the endpoints.
2. Record it in `AGENTS.md` as prompt 19's own file specifies.
3. Commit it **separately**, with `prompts/19-journal-row-hover.md`, before any
   of this prompt's work. Two prompts, two commits.

Note for the record when writing it up: this session re-measured the same hover
independently from `home-journals.webm` and got +10px, `#4B4B4B` ≈ 0.70 alpha,
0.30s symmetric ease-in-out — agreeing with prompt 19's fit from
`~/Videos/Screencasts/Screencast_20260805_193354.webm`.

## Non-goals

- **The section's other five reveals are untouched.** The h2, the three rows and
  the button keep `data-reveal-item` and their existing fade-and-rise. Removing
  one item from the stagger array only shortens the sequence; nothing else
  moves.
- **No change to `Reveal`.** Not a new prop, not a new variant. It is the one
  shared reveal for every section and must not become a switchboard — the mark
  gets its own leaf module instead, as the chart does.
- **No change to `DUR`, `EASE`, `register.ts`, or any other section's timing.**
- **No mobile treatment.** The mark is `hidden` below `md` and stays so; this
  prompt does not introduce a mobile mark.
- **`AetherfieldSeal` on `/about` and `Seal` in `primitives.tsx` are not
  touched.** They are different marks on different pages with no reference for
  motion.
- No hover state on the mark — the reference recording shows it does not respond
  to hover.
- No `SplitText`, no pinning, no scrub, no parallax — AGENTS.md's standing rules
  for this page.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Prerendered-HTML diff and chunk-graph diff against a build of the parent
  commit, in a sibling worktree with hard-linked `node_modules` (AGENTS.md § 3).
- The helpers proven this session in
  `…/scratchpad/verify/` — `shot.mjs`, `shot-mid.mjs`, `reveal-state.mjs`,
  `html-diff.py`. Start production on a **free** port (3000 is the user's dev
  server, 3007 is also occupied); kill by port, never `pkill -f "next start"`.
- In the browser at 800 and 1280, assert:
  - at rest, the mark's computed transform is a perspective matrix whose Z
    rotation lands on the authored −8° — i.e. visually identical to
    `matrix(0.990269, -0.13917, 0.13917, 0.990269, 0, 0)`;
  - before the trigger fires, `opacity` is 0 and the transform carries
    `rotateY(45deg)`;
  - a mid-flight sample is strictly between the two;
  - at 375 the mark is still `display: none` and no tween runs;
  - under `prefers-reduced-motion: reduce` the mark is at full opacity and its
    resting angle, and with JavaScript disabled likewise.
- Confirm the section's other five items still stagger, and that the mark no
  longer consumes a slot.
- Eyeball 768 for the vertical bbox growth noted above.

## Record in AGENTS.md

Two additions inside "Homepage motion (`/` only)":

1. **`### The journal rows' hover`** — prompt 19's own record, per that file's
   "Record in AGENTS.md" section, plus the independent corroboration above.
2. **`### The journal mark's flip`** — the `rotation: -37 → 0` choice and the
   two readings rejected; that the resting −8° stays in CSS because Tailwind v4
   emits `rotate:` and css-transforms-2 composes it outside `transform`; the
   `_removeIndependentTransforms` guard that makes this safe; that `rotate` in a
   GSAP vars object aliases `rotation`; why `transformPerspective` is mandatory;
   the overflow arithmetic; `DUR * 1.5`; and that the mark left
   `data-reveal-item` for its own hook and its own client leaf, with the CSS
   start state mirroring the tween's `from`.

Also **correct the stale numbers already in AGENTS.md**: it narrates "~0.6 s
each with ~0.1 s between siblings" and the chart's `amount: 0.9`, but commit
`5e60fc2` shipped `DUR = 0.5`, `stagger: 0.08` and `amount: 0.7`. The prose is
one commit behind the code.

## SKILLS USED

- `gsap-react` — `useGSAP`, `{ scope }`, and the cleanup contract for the new
  client leaf.
- `gsap-core` — `rotationY`, `rotation`, `transformPerspective`,
  `transformOrigin`, `fromTo`, and `gsap.matchMedia()` with both halves named.
- `gsap-scrolltrigger` — `start: "top 88%"`, `once: true`, and confirming no
  pinning or scrub is introduced.
- `gsap-performance` — confirming `force3D: "auto"` already handles layer
  promotion and that a static `will-change` is wrong here.
- `tailwind-4-docs` — that `-rotate-[8deg]` emits the independent `rotate:`
  property, and how it composes with a `transform` written by JS.

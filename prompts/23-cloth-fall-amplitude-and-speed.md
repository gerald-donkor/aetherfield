# 23 — Make the cloth's fall visible, and twice as fast

## Scope, and why it is next

The Capabilities photograph's autonomous drift (`home/capability-visual.tsx`,
behaviour 1, inner `float` wrapper) is too subtle to read as falling. The user
circled the image box in `~/Pictures/Screenshots/Screenshot_20260806_090410.png`
and asked for two things, both about that inner drift only:

1. **make the falling feeling more visible** — i.e. more vertical travel;
2. **increase the animation speed**.

This is a tween-vars change to three tweens and one `seek`. No markup, no new
component, no new asset, no change to the scrub, the lean, the spin or the
counter.

It is next because it is the user's outstanding request on the section shipped
in prompt 22 and fixed in `bb6206f`; nothing else is queued.

## Reference material

- `~/Pictures/Screenshots/Screenshot_20260806_090410.png` — the circled box.
- `app/_components/home/capability-visual.tsx` — the `fall` timeline, lines
  ~125–170, and the drift wrapper's `-inset-x-[4%] -inset-y-[11%]`.
- `app/_components/home/capabilities.tsx:40-47` — the `<Image fill
  className="object-cover">` and its `sizes`.
- `AGENTS.md` § "The Capabilities section — four behaviours" — the overscan
  budget, the 768×768 source ceiling, and the coprime-period rationale.

## The numbers, and how they were derived

**The overscan is a fixed budget and the new amplitudes must fit inside it.**
The recorded insets (`-inset-x-[4%] -inset-y-[11%]`) were chosen to keep the
rendered width at 1.08× the box so desktop stays inside the 750w candidate —
raising them re-softens a 768×768 source. So the amplitudes are solved against
the existing budget rather than the budget being widened.

Let `W`, `H` be the box (aspect 692:566 = 1.2226). The drift wrapper is
`1.08W × 1.22H`; its aspect is 1.0822, so `object-cover` on a square source
renders the image `1.08W` square, i.e. `1.3204H` tall.

| | available margin | consumed |
| --- | --- | --- |
| vertical (per side) | `0.11H` inset + `(1.3204−1.22)/2 = 0.0502H` image overhang = **`0.1602H`** | parallax `0.04 × 1.22H = 0.0488H` + fall `A × 1.22H` + rotation `0.6602H·sinθ` |
| horizontal (per side) | `0.04W` inset + **0** overhang (image width = wrapper width) = **`0.04W`** | fall `B × 1.08W` + rotation `0.54W·sinθ` |

The rotation term is `s·sinθ` for a square of half-side `s`: the leading corner
of an edge drops by that much, which is the coverage actually lost.

**Shipped values** — `A = 6 %`, `B = 1.8 %`, `θ = 1.1°`:

- vertical: `0.0488 + 0.0732 + 0.0127 = 0.1347 ≤ 0.1602` — **`0.0255H` spare**
  (≈ 12 px at 1280, where `H = 481`);
- horizontal: `0.0194 + 0.0104 = 0.0298 ≤ 0.04` — **`0.0102W` spare**
  (≈ 6 px at 1280, where `W = 588`);
- upward worst case is `0.0488 + 0.0127 = 0.0615`, far inside the budget,
  because the fall is one-directional from rest.

**Durations halve, and the coprime structure is preserved exactly.**
7 / 11 / 13 s → **3.5 / 5.5 / 6.5 s**, the same 7 : 11 : 13 ratio. That is what
keeps the compound period minutes long, so the cloth still never visibly
repeats or lines up into an obvious bounce — the property the original periods
were chosen for. A round "make everything 4 s" would destroy it.

`fall.seek(3.5)` → **`fall.seek(1.75)`**, the same halving, so the cloth is at
the same phase of its cycle the first time the section scrolls in.

Summary of the diff:

| | before | after |
| --- | --- | --- |
| `yPercent` / duration | 2 / 7 s | **6 / 3.5 s** |
| `xPercent` / duration | 1.5 / 11 s | **1.8 / 5.5 s** |
| `rotation` / duration | 1 / 13 s | **1.1 / 6.5 s** |
| `seek` | 3.5 | **1.75** |

Vertical travel is 3× and every period is halved, so peak vertical velocity is
**6×** what shipped. `sine.inOut`, `repeat: -1`, `yoyo: true` and the shared
start position `0` are all unchanged — a falling cloth decelerates into each
turn, and that is still the right curve.

## Verification, in the production build

1. **No edge may enter the frame, at any phase.** Drive the fall timeline to
   its extremes (`fall.progress()` / `seek` at the y-tween's peak) at scrub
   positions 0, 0.5 and 1, and compare the `<img>`'s
   `getBoundingClientRect()` against the root box's at 375 / 800 / 1280:
   `img.left ≤ root.left`, `img.right ≥ root.right`, `img.top ≤ root.top`,
   `img.bottom ≥ root.bottom` at every combination. Report the smallest margin
   found, not just a pass.
2. **Sharpness is unchanged.** `img.currentSrc` must still resolve to the
   `w=750&q=90` candidate at 1280 — the insets and `sizes` are untouched, so
   any change here means something else moved. Do **not** use
   `naturalWidth`; it is density-corrected (AGENTS.md § Automation).
3. **The other three behaviours are untouched**: hover lean still measures
   `cos 20° = 0.939693` and returns to rest; the asterisk still turns at
   40°/s; the counter still runs `583.7 → 611.2 → …`.
4. **The on-screen gate still holds.** At scroll 0 the fall must be paused —
   `float`'s transform must not change over 1.5 s.
5. **Reduced motion still gets nothing** — `transform: none` on `float` and
   `drift` under `(prefers-reduced-motion: reduce)`.
6. Four `/` ⇄ `/journal` round trips with **no page error**, so `bb6206f`'s fix
   is not regressed.

## Expected impact

**The returned JSX is untouched**, so *every* route's prerendered HTML is
byte-identical once the build id and the CSS chunk name are normalised — `/`
included. Only the homepage's client chunk changes. `/` page heights stay
**6350 / 6006 / 5595**.

`magick compare` must be reported **scoped**, per the rule AGENTS.md already
records for this section: mask the image box in both renders and require `AE 0`
outside it; score the box separately and expect a non-zero number, since the
cloth sits wherever the scrub and the fall put it. A bare page-wide AE is
meaningless here.

## Non-goals

- **The overscan insets stay at `4%` / `11%`.** Widening them upscales a
  768×768 source and re-softens the photograph — the exact regression prompt 22
  fixed. The amplitudes are fitted to the existing budget instead.
- **The scrubbed parallax is unchanged.** Its speed is the reader's scroll
  speed; "increase the animation speed" is about the autonomous drift.
- **The lean, the spin and the counter are unchanged**, as are their timings.
- **No new easing, no `CustomEase`, no plugin.** `sine.inOut` is already right.
- **`journal-mark.tsx`, `hero-text.tsx`, `emissions-chart.tsx` and `Reveal` are
  not touched**, and `DUR` / `EASE` in `register.ts` are not touched — this
  section's periods have always been local to it.
- **No `will-change`.** The three tweens are transform-only on one element and
  already composite.

## Checks

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output.

## What to record in `AGENTS.md`

Under § "The Capabilities section — four behaviours", replace the recorded
7 / 11 / 13 numbers with the new ones and add the overscan budget table above,
so the next change to these amplitudes starts from the constraint rather than
rediscovering it. Note explicitly that the periods stay in a 7 : 11 : 13 ratio
and why, and that the insets are a resolution ceiling the amplitudes must fit
inside — not a knob to turn when more travel is wanted.

## SKILLS USED

- **gsap-core** — tween vars, `yPercent` / `xPercent` / `rotation` transform
  aliases, `sine.inOut`, `repeat: -1` + `yoyo`, and the `matchMedia` /
  reduced-motion contract this file already follows.
- **gsap-timeline** — the `fall` timeline's position parameter (all three
  children at `0`), `seek()`, and paused-timeline playback control.
- **gsap-react** — `useGSAP` scoping, `contextSafe`'s correct scope, and
  `mm.revert()` cleanup; re-read so `bb6206f`'s context-cycle fix is not
  reintroduced.
- **gsap-performance** — confirming the three tweens stay transform-only and
  composite, and that no `will-change` is warranted.
- **gsap-scrolltrigger** — the on-screen gate (`onToggle`) and the scrub that
  the fall composes with; needed to verify the gate still pauses the loop.

# 33 — The navbar drops in

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `gsap-react` | `useGSAP` scope + cleanup, why nothing may be created during render, and why a hook with no deps is what makes this play once per document load. |
| `gsap-core` | `gsap.matchMedia()` with the reduced-motion split, `fromTo` vs `from`, `yPercent`. |
| `vercel-react-best-practices` | `bundle-barrel-imports` — the leaf lives in `motion/` and is reached from `chrome.tsx`, the one module that reaches every route. |
| `tailwind-4-docs` | Only if a class string is touched. It should not be — the class string is carried over verbatim, as `FooterMotion` carries the footer's. |

---

## Scope, and why it is next

`SiteNav` is **the last piece of the site with no motion at all**. Prompts 17–23
built `/`, 24 did `/journal` and the footer, 30 did `/about`, 32 did `/careers`.
The footer is animated on every route through `chrome.tsx`; the header, its
sibling in the same file, is not. The user asked why, then asked for it.

**It was an omission, not a decision.** `chrome.tsx` imports exactly one motion
module (`FooterMotion`, `chrome.tsx:6`), and `SiteNav` carries no `Reveal`, no
`data-*` marker and no GSAP. The pages also make it structurally unreachable:
`SiteNav` renders *outside* `Container`, and on `/careers` and the job listings
`main` is a **sibling** of the header, so no page's reveal wrapper has ever
contained the bar. That sibling structure is load-bearing — a wrapper round
`SiteNav` unpins the sticky bar — so page motion cannot reach the header and the
header needs its own leaf.

`/job-listing/[slug]` remains the last unanimated *route* and still wants its own
prompt. It is **not** in scope here. (A draft for it was written and deleted at
the user's instruction; this file takes the number.)

---

## Reference material read

| path | what it is |
| --- | --- |
| `~/Videos/Screencasts/career.webm` | 1263×569, VFR, 750 frames. `/careers` load at t ≈ 4.36 s — carries the masthead *and* the bar in one frame, so the two onsets are directly comparable |
| `~/Videos/Screencasts/about.webm` | 1264×573, VFR, 827 frames. `/about` load at t ≈ 3.9 s — the independent second reading |
| `~/Pictures/Screenshots/Screenshot_20260806_220236.png` | the bar, cropped, as the user sent it |
| `app/_components/chrome.tsx` | `SiteNav`, and `FooterMotion` as the precedent for a leaf that renders a chrome element |
| `app/_components/motion/footer-reveal.tsx` | the shape this leaf copies |
| `app/globals.css` `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` | where every start state is authored |

**There is no navbar-specific recording**, and none is needed: every existing
reference capture contains the bar at load. `~/Videos/Screencasts/navbar-demo.webm`
is about the *blur radius* and constrains nothing here.

---

## What the recordings measure

Both files are **variable frame rate**, so frames were extracted once with
`-fps_mode passthrough` and indexed against the full `pts_time` list — the trap
already recorded in section 3. Frame numbers below are 1-based into those sets.

Both are the **designer's build**, the finding prompt 32 records for
`career.webm` (its Data Scientist card is 194 tall against our 218, the 20 px
`--text-p1`/`--text-p2` floor). **Only timing, opacity, easing and travel
transfer. No geometry.**

### The bar is animated, and it is a drop — not a fade-and-rise

The channel is the **ink bounding box of the wordmark**, thresholded at 60 %.
On both files the box first appears *short and pinned to the top of the crop*,
grows to full height, and only then translates downward:

| | `career.webm` | `about.webm` |
| --- | --- | --- |
| first ink | f232, `102×1` at Y 1 | f198, `101×4` at Y 1 |
| full height reached | f240, `102×20` at Y 2 | f204, `101×20` at Y 2 |
| settled | f253, `102×20` at **Y 14** | f222, `101×20` at **Y 17** |

**A box that grows downward from a fixed top edge and then moves down is an
element entering from behind the viewport's top edge**, clipped by the window —
not a fade (which holds the box still) and not a rise (which moves it the other
way). The nav links reproduce it in the same frames (`390×12`, Y 1 → 15 and
1 → 18), so **the wordmark and the links move together as one element**: this is
the `<header>` translating, not its contents staggering.

Observed travel of the ink's bottom edge: **32 px** on `career.webm` (2 → 34)
and **32 px** on `about.webm` (5 → 37). Both are *floors* — the element is fully
off-screen and unmeasurable before the first ink frame.

### The curve decelerates; the amplitude does not resolve

Free fit over onset, duration and travel against the bottom-edge trace:

| curve | `career.webm` | `about.webm` |
| --- | --- | --- |
| **power3.out** | onset 4.841, **0.74 s**, 70 px, rms **0.38 px** | onset 3.872, 0.67 s, 58 px, rms 0.69 px |
| **power4.out** | onset 4.911, 0.81 s, 55 px, rms 0.41 px | onset 3.952, **0.72 s**, 41 px, rms **0.54 px** |
| power2.out | onset 4.801, 0.64 s, 69 px, rms 0.64 px | onset 3.787, 0.62 s, 70 px, rms 1.08 px |
| expo.out | onset 4.946, 0.89 s, 59 px, rms 1.19 px | onset 3.907, 0.89 s, 67 px, rms 0.86 px |
| linear | onset 4.521, 0.79 s, 76 px, rms 1.62 px | onset 3.792, 0.46 s, 54 px, rms 2.11 px |

**A decelerating curve beats linear by 3–4× on both files, and `power3.out` and
`power4.out` cannot be separated** — they differ by 0.03 px of rms. Ship
**`EASE` from `register.ts` unchanged**; it is inside the winning band on both.

**Travel is not resolvable — 41 to 70 px across the fits** — for the reason the
`/careers` rise runs away in prompt 32: the start of the motion is off-screen.
**Ship `yPercent: -100`**, i.e. the bar's own 60 px height, which sits inside the
fitted band on both files and is the self-evident authored value for "hidden
above the edge". Record it as a judgement anchored on a 32 px observed floor,
**never as a measurement**.

**Duration is the one number that does not fit the site's constants.** The fits
land at **0.62–0.89 s** across both files and every curve; `DUR` is 0.5 and sits
outside that band. So this leaf takes a local `NAV_DUR = 0.7` — the band centre —
exactly as `footer-reveal.tsx` takes a local `FOOTER_DUR = 1.0`. **It does not go
into `register.ts`.**

### The bar arrives last, by about half a second

`career.webm` carries both onsets in one recording, which is why it is the file
to read this off: masthead **4.418 s** (prompt 32's fitted value), bar
**4.84–4.95 s** → **Δ 0.42–0.53 s**. Ship **`delay = 0.48`**, six steps of the
site's 0.08. `about.webm` cannot corroborate it — prompt 30 already records that
its load beat is progressive SSR paint with no readable content onset.

This is the one genuinely opinionated thing the recordings show: **the page
composes itself first and the chrome arrives afterwards.** Do not "improve" it
to 0.

### There is an opacity ramp, and it is not cleanly separable

Minimum grey inside the wordmark crop (sky background 205), i.e. how black the
darkest ink is:

```
f234 70.8   f238 35.0   f243 16.6   f252 0.1
f236 45.8   f240 26.3   f247  5.2   f257 0.1
```

It keeps darkening *after* f240, where the ink box is already at full height —
so it is not just clipping. As α that is ≈0.87 at f240 → 1.0 by f252.

**But it cannot be separated from motion blur and JPEG.** The bar is moving
fastest exactly where the ink is lightest, and both a rolling-shutter smear and
JPEG quantisation lift a dark minimum. **Ship `opacity: 0 → 1` alongside the
slide** — every other reveal on the site fades, so the fade is the conservative
choice and matching it costs nothing — and record that the ramp is *present in
the trace but confounded*, not that a fade was measured.

---

## The change

### 1. `app/_components/motion/nav-drop.tsx` — new client leaf

Same shape as `footer-reveal.tsx`: `"use client"`, **component-only**, renders
the `<header>` itself, takes its class string over via `className` **verbatim**
and its contents as `children`. **No box is added and no class string changes.**
`gsap` / `useGSAP` / `EASE` from `motion/register`; one `useGSAP` with
`{ scope: root }`, one `gsap.matchMedia()` with the named `reduceMotion` /
`fullMotion` pair, `mm.add(…, root)`, `return () => mm.revert()`.
**No `contextSafe`** — everything is created synchronously inside the handler,
and wrapping that is the documented `RangeError` crash.

```
gsap.fromTo(header,
  { yPercent: -100, opacity: 0 },
  { yPercent: 0, opacity: 1, duration: NAV_DUR, ease: EASE, delay: NAV_DELAY })
```

- **`fromTo`, never `from`.** `globals.css` holds the header at
  `translateY(-100%)`, and `gsap.from` reads the element's *current* value as
  the tween's **end** value — it would animate −100 % → −100 % and the bar would
  never arrive. This is exactly the footer wordmark trap already on file, and it
  is the single most likely way to get this wrong.
- **`yPercent`, not a literal `y: -60`**, so the start state is tied to the bar's
  own height rather than to a magic number that a future 72 px bar would break.
  It also matches the CSS start state exactly.
- **No `clearProps`.** Clearing the transform hands the element back to the CSS
  start state and the bar vanishes — the rule every reveal on this site follows.
  The residual inline `transform: matrix(1,0,0,1,0,0)` is cosmetic.
- **It plays once per document load, and that is the default rather than
  something authored.** `SiteNav` never unmounts on a client-side navigation, so
  a `useGSAP` with no dependencies runs exactly once. **Do not add a route
  listener to re-run it.** The bar is "one constant bar" (`AGENTS.md`); dropping
  it again on every in-app navigation would fight that and would be noisy on a
  site where every page shares the chrome. Record it as a judgement — no
  recording covers a client-side navigation.
- **Reduced motion gets no tween at all**; the branch returns immediately. The
  CSS start state is gated on `no-preference`, so nothing needs restoring —
  the same shape `capability-visual.tsx` uses. Verify no inline transform is
  written.

### 2. `app/globals.css` — one selector

`[data-nav-drop]` joins the existing
`@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` block:

```css
[data-nav-drop] {
  transform: translateY(-100%);
  opacity: 0;
}
```

**An authored start transform is correct here**, unlike `[data-journal-mark]` and
the split elements. That warning is about a transform that *decomposes* badly —
a perspective folded against an independent `rotate`. A plain `translateY` has
no such interaction, and the block already carries two authored start
transforms (`[data-chart-bar]`, `[data-chart-grid]`) that work. Confirm it
survives Lightning CSS into `.next/static/chunks/*.css`; do not assume.

### 3. `chrome.tsx` — the `<header>` becomes `NavDrop`

The class string, the `CONTAINER` row, the wordmark `Link`, `NAV_ITEMS`, the
`LinkButton`, the mobile toggle and the mobile panel are **all unchanged**. The
`useState` for the panel stays in `SiteNav`; only the `<header>` element itself
is taken over, exactly as `FooterMotion` takes over `<footer>`.

**`overflow-hidden` must NOT be added to the header** to clip the entrance — the
mobile panel is a *sibling of the row inside the same `<header>`*, so clipping
the header would clip the open menu. The window's own edge does the clipping,
which is what both recordings show.

---

## Expected impact, and what to verify

- **Every route's prerendered HTML changes**, as prompt 24's footer did, and the
  diffs must be exactly: `data-nav-drop` on the `<header>`, the `NavDrop`
  client-reference `<script>`, and chunk/build-id renames. The class string is
  carried over verbatim, so there must be **no other markup diff and no RSC
  flight-payload re-segmentation** to see through.
- **`AE` at 5 % fuzz must be `0` in the settled state** at 375 / 800 / 1280
  against a worktree build of the parent, on `/`, `/journal`, `/careers`,
  `/about`, `/article/[slug]`, `/design-system` and one job listing. **Report it
  scoped, never bare**, on the three routes that already carry that warning —
  mask the capabilities cloth on `/`, the journal stamp on `/journal` and the
  open-application card on `/careers`, compare the remainder (must be **0**) and
  score each box separately.
- **Page heights must be unchanged on every route** — a transform is not layout,
  so any movement here is a bug. `/` 6350 / 6006 / 5595, `/journal` 3801 / 5160 /
  3486, `/careers` 1895 / 1770 / 1925, `/about` 5242 / 4129 / 4279.
- **The sticky bar must still pin past the fold at all three breakpoints on every
  route.** This is the specific risk of the change: `position: sticky` with a
  residual inline `transform`. Scroll well past the fold and assert the header's
  `getBoundingClientRect().top` is `0`. Do this on `/` (document-level sky
  sibling), `/careers` (`main` pulled up under the bar) and `/article/[slug]`.
- **The mobile panel must still open, overlay and scroll at 375**, and must not
  be clipped — the `overflow-hidden` trap above.
- **The measured entrance**: `yPercent` `-100 → 0` and opacity `0 → 1`, landing
  at `NAV_DELAY + NAV_DUR` ≈ 1.18 s; sample mid-flight and confirm an
  intermediate value on both properties.
- **Reduced motion**: header at `opacity: 1`, **no inline transform written at
  all**, bar at its normal box. **JavaScript off**: same, via the
  `scripting: enabled` gate never applying.
- **Four `/` ⇄ `/journal` and four `/` ⇄ `/about` round trips, each with a full
  scroll pass: zero page errors and zero console errors** — the `contextSafe`
  crash class. Also assert the bar does **not** re-drop on a client-side
  navigation (its `yPercent` stays 0 across the transition).
- **Chunk bytes, not chunk count.** GSAP already reaches every route through the
  footer, so the marginal cost is the leaf only. Diff the byte totals against a
  worktree build of the parent, as prompts 24, 30 and 32 do.
- **Settle for at least 6 s before the `fullPage` shot** and wait on
  `document.fonts.ready` **before** the scroll pass — the footer's split blur-in
  is authored at 3.02 s. Assert every `footer [data-footer-split]` reads
  `opacity: 1` before shooting.

---

## Non-goals

- **No geometry, type, colour, spacing or asset change.** The 60 px bar, the
  `bg-white/10` over `backdrop-blur-[32px]` and its `bg-white/85` fallback, the
  `CONTAINER` gutters, the `text-nav` links and the drawn "Get started" arrow
  are all fitted numbers and none is touched.
- **No scroll behaviour.** The bar still never hides, shrinks or changes state on
  scroll — this is a load entrance and nothing else. No hide-on-scroll-down, no
  shadow-on-scroll, no shrink.
- **No stagger across the wordmark and the links.** The recordings move them
  together in the same frames; one element, one tween.
- **No split, no blur.** The footer's treatment is not extended upward — nothing
  in either recording shows it, and a split would strip the wordmark link and
  each nav link of its accessible name for the duration.
- **`SiteFooter` and `CtaBand` are untouched**, as are `NAV_ITEMS` and every
  `href`. The footer's `href="#"` links stay `#`.
- **`/job-listing/[slug]` is still unanimated** and still wants its own prompt.
- **No change to `DUR`, `EASE` or `Reveal`.** `NAV_DUR` and `NAV_DELAY` are local
  to the leaf, as `FOOTER_DUR` is.
- **No `will-change`, no pin, no scrub.** The capabilities cloth stays the site's
  only scroll-linked element.

---

## Checks to run

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output. Then
the production build on a free port (check 3000/3001/3002 first, and confirm the
served CSS chunk matches the build just made) for every measurement above.

## What to record in `AGENTS.md` afterwards

A new section under the motion material:

- **The bar was an omission, not a decision** — `chrome.tsx` imported only
  `FooterMotion`, and the sibling-`main` structure that keeps the bar pinned also
  puts it out of reach of every page's `Reveal`.
- **The measurement that identifies a drop rather than a fade**: an ink bbox that
  grows downward from a fixed top edge and then translates down is an element
  entering from behind the viewport edge. Include both files' numbers and the
  observed 32 px floor. This is the reusable part — add the technique to
  section 3.
- The ease/duration/travel fit table, and the three sentences that must not drift:
  **`power3.out` and `power4.out` cannot be separated**; **travel does not
  resolve (41–70 px), so `yPercent: -100` is a judgement on a 32 px floor**; and
  **duration fits 0.62–0.89 s, which is why `NAV_DUR = 0.7` is local rather than
  `DUR`**.
- **Δ 0.42–0.53 s after the masthead — the chrome arrives after the page** — and
  that only `career.webm` can show it, because it carries both onsets.
- **The opacity ramp is present but confounded by motion blur and JPEG**; the
  fade ships because the site fades, not because it was measured.
- **`fromTo`, never `from`, on any element `globals.css` hides** — restate it
  here with the `yPercent` case, since this is the second time the trap has come
  up.
- **`overflow-hidden` must never go on the `<header>`** — it would clip the open
  mobile panel.
- **It plays once per document load and deliberately does not re-run on
  client-side navigation**, with the reason.
- The measured impact table, the scoped `AE` per route, the sticky-pin
  verification, the chunk byte diff, and the reduced-motion / JS-off results.

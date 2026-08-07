# 36 — The footer wordmark leads instead of queueing

## SKILLS USED

- **`gsap-core`** — the tween being re-authored is a plain `gsap.fromTo` with a
  `delay`; this is the skill that covers `delay`, `duration`, `ease` and the
  `from` / `fromTo` distinction that the existing comment in the file depends on.
- **`gsap-react`** — `footer-reveal.tsx` is a `useGSAP` leaf with a `matchMedia`
  scope and an `mm.revert()` cleanup. The skill's `contextSafe` guidance is what
  confirms the file must keep **not** using it (see AGENTS.md, "Fix — the journal
  mark's `contextSafe`").
- **`gsap-plugins`** — SplitText's `autoSplit` / `onSplit` contract, which is why
  the wordmark tween is deliberately built *outside* `onSplit` and must stay
  there.

Not needed: `gsap-timeline` (the two tweens stay independent on purpose — see
the non-goals), `gsap-scrolltrigger` (the gate is untouched).

## Scope, and why it is next

The user's request, in full: *"The AETHERFIELD Text animation at the footer takes
too long to appear. Correct that."* — with
`public/design-ref/animation-ref/aetherfield-footer.webm` as evidence.

**One constant changes in one file.** `app/_components/motion/footer-reveal.tsx`
derives the wordmark's `delay` from the *length of the split run*:

```ts
const splitRun = FOOTER_DUR + FOOTER_STAGGER * Math.max(wordCount - 1, 0);
//              = 1.0 + 0.12 × 11 = 2.32
delay: Math.max(splitRun - WORDMARK_OVERLAP, 0)   // = 1.82
```

So the single largest element on the page queues behind twelve tiny nav words,
and only lands at **1.82 + 1.2 = 3.02 s**. That number is already recorded in
AGENTS.md ("Measured on `/journal` at 1280: the footer settles **3024 ms** end to
end") — it was measured and accepted at the time, and the user has now rejected
it. This is the same shape of override as the seal's offsets and the homepage's
20 % speed-up.

**It is next because it is the whole of the outstanding request**, and because
the footer reaches every route via `chrome.tsx`, so the defect is on all 16
pages.

## Reference material read

| path | what it is |
| --- | --- |
| `public/design-ref/animation-ref/aetherfield-footer.webm` | 1350×652, 26.488 s, **1004 frames, VFR** — a screen recording of **our own build**, not a designer prototype (the dev-tools badge and the OS taskbar are in frame; the pages are ours, wrapping as ours do) |
| `app/_components/motion/footer-reveal.tsx` | the leaf being edited |
| `app/_components/chrome.tsx` | `SiteFooter`, which renders `FooterMotion` and carries the three data attributes |
| `app/globals.css` | the `(scripting: enabled) and (prefers-reduced-motion: no-preference)` start-state block |
| AGENTS.md, "The footer's split blur-in" | the authored numbers and the two traps already on file |

**The recording is evidence of the defect, not a motion target.** It is our
build, so nothing in it is a designer's intent — do not fit new timings to it,
and do not read geometry off it. It is cited only for the measurement below.

## The measurement

Extracted once with `-fps_mode passthrough` and indexed against the full
`pts_time` list, per AGENTS.md section 3 (the file is VFR — a `-ss/-to` slice
returns a different frame count and every onset would be silently mis-timed):

```
ffprobe -v error -select_streams v -show_entries frame=pts_time -of csv=p=0 \
  public/design-ref/animation-ref/aetherfield-footer.webm > pts.csv   # 1004 lines
ffmpeg  -v error -i public/design-ref/animation-ref/aetherfield-footer.webm \
  -fps_mode passthrough -q:v 2 all/f%04d.jpg
```

Two ink counts per frame — the footer nav row (`1250x36+50+72`, threshold 62 %)
and the wordmark band (`1250x215+50+425`, threshold 55 %), both negated:

| landmark | frame | time |
| --- | --- | --- |
| footer nav words, first ink | f0308 | **6.382 s** |
| footer nav words, settled (plateau ≈ 3110) | f0374 | **7.810 s** |
| **wordmark, first ink** (148 → 24 413) | **f0384** | **8.004 s** |
| wordmark, settled (plateau ≈ 120 100) | f0410 | **8.555 s** |

Read three ways, all of which say the same thing:

- The wordmark starts **1.62 s after** the footer's own words — against the
  authored 1.82 s delay. The 0.2 s of slack is the trigger having fired while the
  band was still off-screen, so the recording **corroborates the authored
  numbers** rather than contradicting them. Nothing is broken; the pacing is
  simply wrong.
- The wordmark starts **0.19 s after everything else has already landed** — i.e.
  there is a beat where the footer is complete except for its headline.
- Between f0340 (t 7.066) and f0382 (t 7.951) the wordmark band's ink is a flat
  **146–148** (a scrollbar speck) while the yellow field fills the viewport:
  **~0.9 s of empty yellow**, verified by a frame-to-frame `AE` of ~0 across that
  window, i.e. the page is not scrolling either.

## What ships

Two constant lines and one `delay` expression in
`app/_components/motion/footer-reveal.tsx`. **Nothing else in the file, and no
other file at all.**

```ts
-const WORDMARK_OVERLAP = 0.5;
+/* The wordmark's lead-in. It used to be derived from the split run's own
+   length, which queued the footer's largest element behind twelve nav words and
+   landed it at 3.02 s — the user rejected that ("takes too long to appear").
+   Three of the site's 0.08 steps, so the footer still composes itself before
+   its headline arrives, without the wait. A judgement, not a measurement. */
+const WORDMARK_DELAY = 0.24;
```

and, in the `gsap.fromTo`:

```ts
-          delay: Math.max(splitRun - WORDMARK_OVERLAP, 0),
+          delay: WORDMARK_DELAY,
```

The `wordCount` reduce and the `splitRun` constant above it become dead and
**must be deleted with their comment** — nothing else reads them.

### The resulting shape, and why this is the right cut

| | before | after |
| --- | --- | --- |
| nav words begin | 0 | 0 |
| **wordmark begins** | **1.82 s** | **0.24 s** |
| **wordmark settled** | **3.02 s** | **1.44 s** |
| nav words settled | 2.32 s | 2.32 s |

**No duration, stagger or ease changes.** `FOOTER_DUR = 1.0`,
`FOOTER_STAGGER = 0.12`, `FOOTER_DUR * 1.2` on the wordmark, `EASE`,
`SPLIT_BLUR = 10` and `WORDMARK_BLUR = 16` are all untouched. That is deliberate
and it is what keeps faith with the standing instruction recorded in the file's
own header comment — *"do not make the animation speed for that fast"* — which is
about **pace**. Only the queueing is removed. The user chose this over two
alternatives that would also have trimmed `FOOTER_STAGGER`; record that the two
rejected options were "wordmark still trails, at stagger 0.06" and "both land
together at ~1.5 s".

The wordmark now settles *before* the nav words finish, which is the intended
reading: the headline arrives and the small type keeps resolving under it.

## The four things that must not be broken

All four are already on file and each is one line away from being undone:

1. **The tween stays a `fromTo` with `opacity: 1` authored on the end.**
   `globals.css` pins `[data-footer-wordmark] { opacity: 0 }`, and `gsap.from`
   reads the element's *current* value as its **end** value — it would animate
   0 → 0 and the wordmark would never appear. Cost a build to find once already.
2. **`clearProps` stays `"filter"` and never touches `opacity` or `transform`** —
   that hands the element straight back to the CSS start state and it vanishes.
3. **The wordmark tween stays outside `onSplit`**, built once in the `mm.add`
   handler, and stays wrapped in `gate(...)` so the single ScrollTrigger still
   controls it. Moving it inside `onSplit` would rebuild it on every `autoSplit`
   re-split (font load, resize).
4. **No `contextSafe` is added.** Everything is created synchronously inside the
   `mm.add` handler; wrapping that is the documented `RangeError: Maximum call
   stack size exceeded` crash on client-side navigation.

## Expected impact

- **No route's prerendered HTML changes.** This is a tween var, not markup — the
  same class of change as the homepage's 20 % speed-up and the perforation
  drift's speed change, both of which were byte-identical across all 16 pages.
  **All 16 must be byte-identical** once the build id and the CSS and JS chunk
  names are normalised. If any page's markup differs, something was edited that
  should not have been.
- **Every route keeps its exact chunk set** (`/`, `/journal`, `/about`,
  `/careers` 10; `/job-listing/*` 10; the rest 9; the two error pages 8) and its
  byte totals to within the constant's own few bytes.
- **Page heights unchanged everywhere**: `/` 6350 / 6006 / 5595, `/journal`
  3801 / 5160 / 3486, `/careers` 1895 / 1770 / 1925, `/about` 5242 / 4129 / 4279.
  A `delay` is not layout; any movement here is a bug.
- **`magick compare -metric AE -fuzz 5%` in the settled state must be `0`**
  against a worktree build of the parent — scoped per the standing warnings:
  outside the capabilities cloth box on `/`, outside the journal stamp on
  `/journal`, outside the dashed card on `/careers`. Bare page-wide numbers are
  meaningless on those three.

## Checks and measurements to run

Section 2 in full: `npm run lint`, `npm run typecheck`, `npm run build` —
**report the exact output**.

Then, against a worktree build of the parent commit (`git worktree add
../aetherfield-base HEAD` + `cp -al node_modules …`, servers on 3001 / 3002 —
and confirm the served CSS chunk matches the build just made, since 3000–3002 can
all be stale):

1. **The end-to-end settle time, which is the whole point of the change.** Time
   from footer trigger to the wordmark reading `opacity: 1` with no inline
   `filter`, on `/journal` at 1280. Authored is `0.24 + 1.2 = 1.44 s`; the
   previous build measured **3024 ms** end to end. Report both, measured the same
   way.
2. **The wordmark leads the nav words' tail.** Sample `opacity` on
   `[data-footer-wordmark]` and on the last `[data-footer-split]`'s words
   mid-run; the wordmark must reach 1 first.
3. **The wordmark actually arrives** — `opacity: 1` and a non-zero ink count in
   the wordmark's box, on at least `/`, `/journal` and `/careers`. This is the
   `fromTo` trap's failure mode and it is invisible to a page-wide `AE`.
4. **Screenshot procedure per AGENTS.md section 3**: `document.fonts.ready`
   *before* the scroll pass, scroll in 400 px steps, then **settle ≥ 6 s** at the
   footer — and **assert**
   `[...document.querySelectorAll('footer [data-footer-split]')].map(e => getComputedStyle(e).opacity)`
   is all `1` before the shot. A footer caught mid-reveal looks exactly like a
   regression.
5. **Scoped `AE`** at 375 / 800 / 1280 on `/`, `/journal`, `/careers`, `/about`,
   `/article/[slug]`, `/design-system` and `/job-listing/data-scientist`.
6. **Prerendered-HTML diff** across all 16 pages with the scratchpad helper
   (normalise the build id and the `[A-Za-z0-9_-]+` CSS chunk name — it is **not**
   hex), plus a chunk-set and chunk-byte comparison.
7. **Reduced motion**: every `[data-footer-split]` and `[data-footer-wordmark]`
   at `opacity: 1`, nothing split (`childSpans` 0). **JavaScript off**: the
   wordmark renders at its normal box.
8. **Four `/` ⇄ `/journal` round trips with a full scroll pass each: zero page
   errors and zero console errors** — the `contextSafe` crash class.

## Non-goals

- **No change to `FOOTER_DUR`, `FOOTER_STAGGER`, `EASE`, `SPLIT_BLUR`,
  `WORDMARK_BLUR`, the `y` distances or the wordmark's `× 1.2` duration.** The
  pace was set at the user's explicit request and only the queueing is at issue.
- **No change to the split type.** It stays `type: "words"` on each `<a>` and the
  `©` `<p>` — `chars` is ~60 blurred layers, and splitting the `<nav>` strips
  every link of its accessible name.
- **The wordmark is never split.** SplitText does not support SVG `<text>`, and
  `textLength="1013"` from `x="-1.6"` is the measured thing holding the ink flush
  to both gutters at any viewport.
- **The two tweens are not merged into a timeline.** They are independent so
  `autoSplit` can destroy and rebuild the split tween freely; a timeline would
  couple them.
- **The ScrollTrigger gate, the `entered` flag and the `pending` set are
  untouched.** `start: "top 88%"`, `once: true`.
- **`chrome.tsx`, `globals.css`, `register.ts` and `reveal.tsx` are not edited.**
  The footer's geometry, type, colours, texture band, wordmark drawing and
  `href="#"` links are all settled — AGENTS.md, "The footer is fixed".
- **`prompts/35-emissions-chart-hover.md` and the uncommitted
  `app/_components/home/emissions-chart.tsx` are another session's in-flight
  work.** Do not touch, revert or build around them; if they are still
  uncommitted at execution time, isolate this change in a sibling worktree
  rather than diffing the working tree.

## To record in AGENTS.md afterwards

Under **"Site motion" → "The footer's split blur-in — `motion/footer-reveal.tsx`"**:

- Replace the `FOOTER_DUR = 1.0` / stagger bullet's tail so it is unambiguous
  that the pace is unchanged but the wordmark no longer queues; state the new
  `WORDMARK_DELAY = 0.24` and that `WORDMARK_OVERLAP`, `wordCount` and `splitRun`
  are gone.
- Replace the "Measured on `/journal` at 1280: the footer settles **3024 ms**"
  sentence with the newly measured figure against the authored 1.44 s, keeping
  the split word counts line.
- Add the recording to the reference list with the **"it is our own build, read
  it as evidence of the defect and never as a motion target"** warning — the same
  caveat `career.webm` and `about.webm` carry, and the reason no new timing was
  fitted to it.
- Add the frame-indexed measurement table above, so a later session does not
  re-extract 1004 frames to re-derive it.
- Record the two rejected alternatives, so the ordering decision is not
  relitigated.

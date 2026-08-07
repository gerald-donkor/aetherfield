# Site motion — `/journal`, the cards, the footer, `/about`, `/careers`, the navbar, `/job-listing`


Prompt 24. Three pieces from one request, and the first work that puts motion
**outside `/`**. Everything in "Homepage motion" above still describes the
homepage correctly; what changes here is the scope, and one invariant.

## `journal.webm` contains no animation — it constrains nothing

`public/design-ref/animation-ref/journal.webm` (1263×571, ~50 s) is a scroll
pass down `/journal`. **It is a walkthrough of the current, unanimated page
recorded on `localhost:3000`** — the "Spectacle is Recording" badge is in frames
1–4 — not a designer's prototype. Sampled at 1 fps across the whole pass and at
12 fps across the two entry beats (t≈10–14 s, the article grid; t≈26.5–31 s, the
CTA band and footer), every element is fully opaque and at its final position
the instant it crosses the fold.

**So no number below is fitted to it, and no later session should re-do that
sampling.** The `/journal` reveals are the site's existing `DUR` / `EASE` /
stagger, unchanged.

## `/journal`'s reveals

The existing `Reveal` (`motion/reveal.tsx`), used as-is; no new motion component,
and `DUR` / `EASE` are not restated. `journal/sections.tsx` **stays a server
component** — `children` arrive as a prop, so its `next/image` never reaches the
client bundle. `Reveal`'s `as` union gained `"h2"`, which is inert.

- `JournalStamp`'s wrapper is `<Reveal immediate …>` — it is above the fold at
  scroll 0 at every breakpoint, the same call the hero makes.
- `LatestArticles`' `<h2>` is `<Reveal as="h2">` rather than a wrapping `div`,
  so no box is added and its `mt-6` margin cannot collapse differently.
- **Each card gets its own `Reveal`, not one `stagger` over the section, and
  that is measured rather than stylistic.** The grid is ~3000 px tall at 1280,
  so a single section trigger at `top 88%` would run all six cards while four
  are still far below the fold. `delay={i % 2 === 1 ? 0.08 : 0}` reproduces the
  sibling stagger *within a row* while each row still waits for its own trigger.
  Verified in the render at 1280: scrolled to 700, the h2 and the first four
  cards read `opacity: 1` while the cards at viewport-top 1200 and 1876 are
  still at **`opacity: 0`**; all nine targets settle at 1.
- `CtaBand` is wrapped **at the call site in `app/journal/page.tsx`**, exactly as
  `app/page.tsx` does it. `chrome.tsx`'s `CtaBand` is not edited.

## The article cards' hover zoom

One change in `ArticleCardStacked` (`cards.tsx`), which feeds `/journal`, the
`/article/[slug]` recent-articles band and `/design-system`. **This closes the
"cards.tsx was deliberately left alone" exception** recorded twice above — the
user took that decision explicitly ("Zoom in all the article images on hover in
a beautifully animated way").

The `<Image>` gains a `<span className="block overflow-hidden">` clip box — the
device the homepage journal thumbnails already use — and
`transition-[scale] duration-500 ease-in-out group-hover:scale-105
motion-reduce:transition-none`.

- **`ease-in-out` is measured; 500 ms and 5 % are judgements.** The curve is the
  one already fitted off `home-journals.webm` for these rows (linear and
  `ease-in-out` tied at the top of a five-curve fit; Tailwind's `ease-out` was
  the worst). The duration is not fitted: the homepage thumbnails run 300 ms
  across a 164 px box and this box is 612×356 at desktop, where the same 300 ms
  over ~4× the travel reads snappy rather than "beautifully animated". Say
  judgement, not measurement, if this is ever revisited.
- **`scale-105`, not the thumbnails' `scale-110`.** 10 % of a 612 px image is
  61 px of edge travel against 16 px on the thumbnail; 5 % lands at ~31 px.
- **`transition-[scale]`, never `transition-[transform]`.** Confirmed in the
  built stylesheet, not from memory:
  `.group-hover\:scale-105{…scale:var(--tw-scale-x) var(--tw-scale-y)}` — the
  independent `scale` property, the mechanic already recorded for
  `translate-x-2.5` and `scale-110`. v4 also wraps `group-hover:` in
  `@media (hover:hover)` for free (verified), so no touch guard is authored.
- **No grayscale.** The homepage rows desaturate because that was measured off a
  recording; nothing covers these cards and the ask was a zoom.
- The `group` class only exists on the `<Link>`, so the hrefless
  `/design-system` sample is unchanged apart from the wrapping `<span>`.

Measured at 375 / 800 / 1280: rest `scale: none` → an intermediate 1.018–1.023
mid-transition → `1.05` → back to `none`, with **no layout shift** (page heights
unchanged and `AE` 0 in the settled state).

## The footer's split blur-in — `motion/footer-reveal.tsx`

New client leaf, imported by `chrome.tsx`. It renders the `<footer>` itself and
takes its class string over via `className`, so the settled footer gains motion
and **not a single box**. The three markers — `data-footer-split` on each nav
`<a>` and on the `©` `<p>`, `data-footer-wordmark` on the wordmark `<svg>` — are
inert attributes; no geometry, class string or element changed. Keep the file
component-only.

- **`type: "words"`, not `chars`.** 12 blurred layers against ~60; an animated
  `filter: blur()` repaints every target's layer every frame.
- **`data-footer-split` is per-link, not on the `<nav>`.** With `aria` at its
  default `"auto"` SplitText labels the element it splits and hides the pieces,
  so splitting the `<nav>` would strip every link of its accessible name.
  Verified with `page.locator("footer nav").ariaSnapshot()`: five links, each
  with its own name.
- **`FOOTER_DUR = 1.0` and stagger `0.12`** — roughly double `register.ts`'s
  `DUR 0.5` / `0.08`, a **deliberate slow departure at the user's request**
  ("do not make the animation speed for that fast"), in the same spirit as the
  seal's offsets. `EASE` is still imported, never restated. Blur is 10 px on the
  split words and 16 on the wordmark.
- **The wordmark is one element and can never be split**: SplitText does not
  support SVG `<text>`, and its `textLength="1013"` from `x="-1.6"` is the
  measured thing that holds the ink flush to both gutters at any viewport. It
  takes the same blur + fade + rise as a single target, starting at a flat
  `WORDMARK_DELAY = 0.24` — see "The wordmark leads, it does not queue" below.
- `autoSplit: true` with the animation created inside and returned from
  `onSplit(self)`; `clearProps: "filter,display"` on the words, `"filter"` on
  the wordmark; **never `opacity` or `transform`**. The start state is
  `[data-footer-split], [data-footer-wordmark] { opacity: 0 }`, appended to the
  existing `(scripting: enabled) and (prefers-reduced-motion: no-preference)`
  block. **No `contextSafe`** — everything is created synchronously inside the
  `mm.add` handler, and wrapping that is the crash already on file.

### Two traps, both cost a build to find

- **`gsap.from` reads the element's *current* value as the tween's end value.**
  The wordmark's current opacity is the `0` the CSS start state pins it at, so
  `gsap.from(wm, { opacity: 0 })` animates **0 → 0** and the wordmark never
  appears — measured as `opacity: 0` inline and an ink count of literally 0 in
  the render, on every page. The split words escape it because they are fresh
  spans at their default opacity 1. **Any tween on an element that
  `globals.css` hides must be a `fromTo` with the end value authored.** This
  applies to `[data-reveal]`, `[data-journal-mark]` and `[data-hero-split]` too;
  those all happen to animate split children or use `fromTo` already.
- **One ScrollTrigger gating paused tweens, not a `scrollTrigger` per tween.**
  With `autoSplit` the split tween is destroyed and rebuilt on font load and on
  resize, and a rebuilt tween carrying its own `once: true` trigger would be
  waiting on a trigger that has already fired. A flag plus a pending `Set` means
  a tween created after the footer was entered simply plays at once. Same shape
  as the capabilities section's on-screen gate.

Split word counts on `/journal` at 1280: `1,1,1,1,2,6` = 12.

### The wordmark leads, it does not queue (prompt 36)

The wordmark's `delay` used to be **derived from the split run's own length** —
`FOOTER_DUR + FOOTER_STAGGER × (wordCount − 1)` = `1.0 + 0.12 × 11` = 2.32, less
a 0.5 s overlap = **1.82**, settling at 1.82 + 1.2 = **3.02 s**, measured on
`/journal` at 1280 as **3024 ms** end to end. The user rejected that pacing
("the AETHERFIELD Text animation at the footer takes too long to appear"). It is
now a flat constant:

```ts
const WORDMARK_DELAY = 0.24;   // three of the site's 0.08 steps. A judgement.
```

`WORDMARK_OVERLAP`, the `wordCount` reduce and `splitRun` are **deleted** —
nothing else read them. Authored shape now: wordmark begins 0.24, settles
**1.44 s**; nav words still begin at 0 and settle at 2.32 s. So the headline
lands *first* and the small type keeps resolving under it, which is the intended
reading.

**Nothing about the pace changed** — `FOOTER_DUR`, `FOOTER_STAGGER`, `EASE`,
`SPLIT_BLUR`, `WORDMARK_BLUR`, the `y` distances and the wordmark's `× 1.2` are
all untouched. The standing "do not make the animation speed for that fast"
instruction is about pace; only the queueing was at issue. Two alternatives were
rejected in favour of this one: "wordmark still trails, at stagger 0.06", and
"both land together at ~1.5 s". Do not relitigate the ordering.

The four things that must not be undone here are already listed above — the
tween stays a `fromTo` with `opacity: 1` authored on the end, `clearProps` stays
`"filter"`, the tween stays **outside** `onSplit` and inside `gate(...)`, and no
`contextSafe` is added.

**Reference:** `public/design-ref/animation-ref/aetherfield-footer.webm`
(1350×652, 26.488 s, 1004 frames, **VFR**). Like `career.webm` and `about.webm`
it is **a recording of our own build, not a designer prototype** — read it as
evidence of a defect, never as a motion target, and fit no timing to it. Frame
onsets, indexed against the full `pts_time` list per `docs/automation.md` (a
`-ss/-to` slice on a VFR file returns a different frame count and mis-times every
onset):

| landmark | frame | time |
| --- | --- | --- |
| footer nav words, first ink | f0308 | 6.382 s |
| footer nav words, settled (plateau ≈ 3110) | f0374 | 7.810 s |
| **wordmark, first ink** (148 → 24 413) | **f0384** | **8.004 s** |
| wordmark, settled (plateau ≈ 120 100) | f0410 | 8.555 s |

Ink counts were taken on two crops, both negated: the nav row `1250x36+50+72` at
threshold 62 %, the wordmark band `1250x215+50+425` at 55 %. The wordmark started
1.62 s after the footer's own words against an authored 1.82 — the 0.2 s of slack
is the trigger having fired while the band was still off-screen, so the recording
**corroborated the authored numbers**; nothing was broken, the pacing was simply
wrong. Between f0340 and f0382 the wordmark band held a flat ink of 146–148 (a
scrollbar speck) — **~0.9 s of empty yellow**, with a frame-to-frame `AE` of ~0
across that window, so the page was not scrolling either. Recorded here so no
later session re-extracts 1004 frames to re-derive it.

The 1.44 s figure above is **authored, not re-measured** — `npm run lint`,
`npm run typecheck` and `npm run build` all pass, and the build is unchanged at
17 prerendered routes, but the browser timing pass in prompt 36's check list was
not run against this commit.

## The bundle invariant, rewritten

`chrome.tsx` reaches every route, so the footer leaf does too. **"No GSAP leak"
is no longer the rule** — the user chose site-wide motion explicitly ("Make
reflect on every page"). The rule that survives is narrower and still worth
keeping: **nothing outside `home/` may import `home/sections.tsx` or any
`home/` client module.** The leaf-import discipline stays; `motion/` is the
shared surface and the footer is the one module that reaches everywhere.

`/about` took `Reveal` the same way in prompt 30 — see "`/about`'s reveals"
below. With GSAP already in the shared chunk, its cost is +998 raw / +643
gzipped, which is why the chunk *count* moving 9 → 10 overstates it.

The measured cost, against a build of `729bfcc` in a sibling worktree:

| | chunk count | raw JS | gzipped JS |
| --- | --- | --- | --- |
| the 14 non-homepage, non-`/journal` routes | 9 → **9** | 653,000 → 775,793 (**+122,793**) | 195,380 → 242,879 (**+47,499**) |
| `/journal` | 9 → **10** | +123,791 | +48,142 |
| `/` | 10 → **10** | +1,370 | +509 |

**The chunk *count* is the wrong instrument here** — GSAP went into an existing
shared chunk (`047q64__4pyf_.js`, 25.6 KB, became `3k-8_no3bkb0l.js`, 148 KB /
56.7 KB gz) rather than adding one, so only `/journal`'s extra `Reveal` chunk
shows up as a count. Diff the chunk *bytes*, not the list length, when checking
this again.

## Impact

- **Every route's prerendered HTML changes**, and the diffs are exactly:
  the three footer data attributes, the `FooterMotion` client reference, the
  `<span>` wrapper plus image class string on every `ArticleCardStacked`, the
  `data-reveal` attributes on `/journal`, and chunk/build-id renames. Confirmed
  page by page with the scratchpad build-diff helper — nothing else moved.
  `_not-found` and `_global-error` are identical.
- **`AE` at 5 % fuzz is `0`** in the settled state at 375 / 800 / 1280 on
  `/journal`, `/design-system` and `/article/[slug]`.
- **`/` is pixel-identical outside the capabilities cloth box** (`AE` 0 at all
  three); inside it, 41.7 / 14.9 / 0 differing pixels — the scrubbed cloth at a
  different phase, exactly as the note above predicts. Never report a bare
  page-wide `AE` for `/`.
- Page heights unchanged everywhere: `/` 6350 / 6006 / 5595, `/journal`
  3801 / 5160 / 3486.
- **Reduced motion**: nothing splits (`childSpans` 0 on all six elements), every
  footer element at `opacity: 1`, 0 of 9 `/journal` reveal targets below full
  opacity, and the card hover reaches 1.05 in 30 ms. **JavaScript off**: the
  wordmark and the stamp render at their normal boxes, page at rest as the
  server sent it.
- Four `/` ⇄ `/journal` / `/about` round trips with **zero page or console
  errors** — the `contextSafe` crash class does not reappear.

## Non-goals held

The footer's geometry, type, colours, texture band and wordmark drawing are
untouched; its `href="#"` links stay `#`. No scrub, pin or parallax was added —
the capabilities cloth is still the site's only scroll-linked element. No file
under `app/_components/home/` was touched. `ArticleCardHorizontal` and
`ArticleCardCompact` are left alone.

## The journal stamp's perforation drift

Prompt 28. The user circled the stamp's **top and bottom perforation rows** in
`~/Pictures/Screenshots/Screenshot_20260806_140054.png` and asked for them to be
permanently in motion — the top travelling right, the bottom left. It is the
site's third continuous loop, after the capabilities asterisk and counter, and
it obeys the same on-screen gate.

**The loop is seamless because the spacing is uniform.** The perforations sit at
a constant pitch of `1240/25 = 49.6` user units, so translating a row by exactly
one pitch lands every circle where its neighbour started: the row at `t + CYCLE`
is pixel-identical to the row at rest and `repeat: -1` has no seam. No cloning,
no wrap bookkeeping, no modulo. **Verified, not assumed** — under
`prefers-reduced-motion: reduce` (no tween running), screenshotting the stamp at
rest and again with `transform="translate(±49.6,0)"` forced onto the two row
groups compares at **`AE` 0** at 1280.

**One circle per row is added beyond the drawn set, and it is required rather
than padding.** The right-moving top row carries one at `x = -pitch` so a
perforation enters the left edge as the leftmost one leaves; the left-moving
bottom row carries the mirror past the right edge. Both sit outside the viewBox
and are clipped by the SVG root, so **the rest state is pixel-identical to the
comp** — the comp's 26 per edge are still the 26 that are ever visible.

`app/_components/journal/stamp-perforations.tsx` — `"use client"`, the section's
**only** client module, rendered as a child of the existing `<svg>` so
`journal/sections.tsx` stays a server component and its `next/image` never
reaches the client bundle. Keep it **component-only**, the `principles-data.tsx`
rule. Geometry arrives as props (`width` / `height` / `count` / `r`) and the
pitch is derived inside the leaf, so the file and `sections.tsx`' comp-measured
constants cannot drift; `PERF_PITCH` no longer exists in `sections.tsx`.

**The tweens**: two `gsap.to`s, `x: ±pitch`, `duration: CYCLE`, `ease: "none"`,
`repeat: -1`, `paused: true`.

- **`CYCLE = 1.2` s per pitch** — ≈41.3 user units per second, ≈41 px/s at 1280.
  Three paces were offered (gentle 3.5 / moderate 2 / brisk 1.2); the user picked
  2, then asked for it faster having seen it run, so it ships at the brisk one
  rather than an invented number (prompt 29). A judgement, not a measurement;
  say so if it is ever revisited. **Speed does not touch the loop's
  seamlessness** — that is a property of the pitch, not of the duration.
- **`ease: "none"` is not a default being restated.** A conveyor must not
  accelerate — any easing makes the wrap read as a stutter.
- **`x` is in user units**, so the drift scales with the viewport for free,
  exactly as the rest of the stamp does. Nothing is sized per breakpoint, the
  `JournalStamp` discipline.
- Two tweens rather than one timeline with `yoyo`: the rows never reverse.
- **No `contextSafe`** — both are created synchronously inside the `mm.add`
  handler, and wrapping that is the documented `RangeError` crash.

**The gate is the capabilities `ScrollTrigger.create({ start: "top bottom", end:
"bottom top", onToggle })`**, on the outer `<g>` (which spans the full stamp
height, so it has a usable bounding box). It is what makes a `repeat: -1` loop
affordable. **Reduced motion gets nothing at all** — no tween, no ScrollTrigger;
the branch returns immediately. Nothing was ever hidden, so `globals.css` needed
no new start-state rule.

`Reveal` is untouched: it tweens `opacity`/`y` on the **wrapper div** while these
tweens write `transform` on `<g>`s inside the SVG. Different elements, and no
`clearProps` anywhere.

### Measured in the production build

Against a worktree build of `f0ad19f` **carrying prompt 27's uncommitted
`cards.tsx` patch**, so the comparison isolates this change alone.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| top row drift | **41.6 u/s** | **40.8 u/s** | **40.9 u/s** |
| bottom row | the exact negation at all three | | |
| stamp box | `335×129.67+20+60` | `760×294.19+20+60` | `1232×476.89+24+60` |
| page height | **3801** | **5160** | **3486** |
| gated off screen | transform frozen | frozen | frozen |
| reduced motion | no `transform` attribute written | none | none |
| JS off, stamp box | `335×129.67+20+60` | `760×294.19+20+60` | `1232×476.89+24+60` |

Top `x` rises and bottom falls, both wrapping inside `[0, ±49.6]`, against the
authored 41.33 u/s. The 2 s original measured 24.5 / 25.1 / 24.6 against its own
24.8, so the two builds are 1.67× apart as authored — **run the old build as a
control when re-measuring a speed change**, since the rate is sampled over a
window and carries ~2 % of jitter. Page heights and the stamp box are the
recorded numbers **unchanged**, with and without JS. Scrolling past the stamp
freezes both transforms; returning resumes them.

**Scoped `AE` at 5 % fuzz is `0` outside the stamp box at all three widths** —
at both speeds. Inside it, 450 / 2048 / 4308 at 2 s and 458 / 2311 / 6567 at
1.2 s (0.7–1.1 % of the box's pixels) — the rows at a different phase, exactly
as with the capabilities cloth. **Never report a bare page-wide `AE` for
`/journal` now**; report the two numbers separately.

**The speed change itself is a tween var, not markup**: all 16 pages are
byte-identical across it once the build id and the chunk names are normalised.

**`/journal` is the only route whose prerendered HTML changes**, and its only
diff is the perforation restructure: today's 26 per-index `<g>`s pairing a top
and a bottom circle become two row `<g>`s of 27 each. The other **15 pages are
byte-identical** once the build id and the CSS and JS chunk names are
normalised, and every route keeps its chunk set (`/` and `/journal` 10, the rest
9) — the leaf bundled into the existing page chunk.

Four `/journal` ⇄ `/` round trips plus a `/journal` → `/about` → back, each with
a full scroll pass: **zero page errors and zero console errors.**

## The article cards' hover fade — the last `group-hover:underline`

Prompt 27. `ArticleCardStacked`'s title carried `group-hover:underline`, which
snapped a solid underline on with no transition. It now fades the **title and
the description** instead, the idiom `home/journal.tsx` already ships. This was
the last `group-hover:underline` in `app/`; the site's only remaining
`hover:underline` is the job listing's "Back to Careers" prose link
(`job/sections.tsx:22`), which is out of scope.

**CSS-only, two class strings**, both gaining
`transition-opacity duration-300 ease-in-out group-hover:opacity-70
motion-reduce:transition-none`. `cards.tsx` stays a server component; no new
module, no client reference, no `globals.css` rule.

### What the reference shows — measured, not eyeballed

`~/Videos/Screencasts/Screencast_20260806_141143.webm` (1264×598) is the target;
`…_141027.webm` is the current behaviour. The recording is 1264 CSS px with no
browser chrome, so distances read as CSS pixels. Sampled at 10 fps over
t 7.5–12.0 s, box means in an 8-bit grey channel, boxes in full-frame coords:

| element | box | at rest | hovered |
| --- | --- | --- | --- |
| left title | `370x24+20+410` | 197.51 | **217.18** |
| right title | `545x24+640+410` | 196.65 | **215.99** |
| left description | `590x50+20+476` | 223.19 | **233.93** |
| right description | `565x50+640+476` | 231.45 | **239.10** |
| left / right meta | `200x16+…+441` | 240.73 / 240.82 | **240.89 / 240.99** |
| image interior | `580x300+30+70` | 197.52 / 94.52 | **197.53 / 94.49** |

**Exactly one card is light at a time, and it is the hovered one** — verified
against the cursor, not inferred. So no `:has()` and no container group.
**Meta and image are measured unchanged and are not touched.** Title ink height
and title x are constant: no underline, no slide.

**The fade fits 0.666 and ships as `opacity-70`.** Against a white field,
`α = (255 − dim) / (255 − rest)` gives 0.658 / 0.669 / 0.662 / 0.675 across the
four boxes. **Same evidence, same call as prompt 19** (which measured 0.67 on
the homepage rows and shipped `opacity-70`): one fade value site-wide.

**The timing is `duration-300 ease-in-out`.** Three transitions traced at full
frame rate and fitted over 150–500 ms, normalised SSE:

| curve | best duration (in / in / out) | SSE |
| --- | --- | --- |
| CSS `ease` (.25,.1,.25,1) | 335 / 355 / 390 ms | 0.0004 / 0.0011 / 0.0007 |
| linear | 210 / 225 / 250 ms | 0.0014 / 0.0008 / 0.0012 |
| **Tailwind `ease-in-out` (.4,0,.2,1)** | **290 / 315 / 345 ms** | 0.0030 / 0.0020 / 0.0020 |
| CSS `ease-out` (0,0,.58,1) | 280 / 300 / 325 ms | 0.0014 / 0.0024 / 0.0021 |
| Tailwind `ease-out` (0,0,.2,1) | 415 / 440 / 485 ms | 0.0069 / 0.0091 / 0.0088 |

CSS `ease` at ~360 ms is the nominal best fit; Tailwind's `ease-in-out` at
~300 ms is in the same band and is **the curve already fitted and shipped for
these rows' sibling behaviour on `/`**. 60 ms on an opacity fade is not
perceptible, so consistency wins. The alternative is on file above.

Four v4 mechanics, confirmed in the **built** stylesheet (`tailwindcss` 4.3.3):
`.transition-opacity{transition-property:opacity}`;
`.group-hover\:opacity-70…{opacity:.7}`, and walking the enclosing at-rules puts
it inside **`@media (hover:hover)`**, which v4 wraps for free — no touch guard
authored, and `matchMedia('(hover: hover)')` reads `false` in a touch context;
`@media (prefers-reduced-motion:reduce){.motion-reduce\:transition-none{transition-property:none}}`;
`--ease-in-out: cubic-bezier(.4, 0, .2, 1)` with `.duration-300{…:.3s}`.

### Measured in the production build

At **1264 wide on `/journal`**, scrolled so the first card's `h3` lands at
y 409.81 — within 0.2 px of the reference's box top, with the meta at 441.81
against 441 and the description at 475.81 against 476, i.e. **the render aligns
with the reference to under a pixel.**

| | rest | hovered | α |
| --- | --- | --- | --- |
| left title | 194.14 | 212.03 | **0.7060** |
| right title | 192.29 | 210.74 | **0.7058** |
| left description | 227.62 | 235.65 | **0.7067** |
| right description | 234.62 | 240.60 | **0.7066** |
| left / right meta | 240.76 / 240.61 | **unchanged** | — |

**Report α, not the absolute box means.** The meta boxes match the reference to
0.15 grey levels, but the title and description boxes carry different ink (our
copy wraps differently inside those crops), so their absolute means sit 3–4
levels from the recording's and are not comparable. α is crop-invariant, and it
lands at the authored 0.706 against the reference's 0.666 — **the deliberate
`opacity-70` rounding**, worth ~2.5 grey levels in the title box and ~1.1 in the
description box. That is the known cost of the prompt 19 call, not a miss.

`getComputedStyle` on the first card, `h3` and `p` alike: `1 → 0.7 → 1` across
`pointerenter` / `pointerleave`, with **0.791569 at 140 ms in** and 0.908537 at
140 ms out. 0.791569 is `1 − 0.3 × cubic-bezier(.4,0,.2,1)(140/300)` to six
places — the curve confirms itself. `text-decoration-line` is `none` in **both**
states. `Meta` opacity stays `1`; the image keeps its own `scale` `none → 1.05`.
Reduced motion: `transition-property: none` and the hover reaches `0.7` in
30 ms. On `/article/[slug]` and `/design-system` the same computed
`opacity / 0.3s / cubic-bezier(0.4, 0, 0.2, 1)` applies; `/design-system`'s
sample has no `group` link, so it is visually unchanged.

### Impact

- **Server-rendered markup is identical on all 16 pages** once the two class
  strings are substituted and the build id and chunk names normalised. Eight
  pages are **byte-identical without any substitution** — `/`, `/careers`,
  `/about`, all three job listings, `_not-found`, `_global-error`.
- The eight that change are `/journal`, the six articles and `/design-system`.
  **Their residual whole-file diff beyond the two class strings is RSC
  flight-payload row segmentation only** — the longer class strings shift where
  Next splits `self.__next_f.push(…)` rows, so row labels renumber. Strip the
  flight scripts and compare the markup to see through it; that is the cheap
  check, and it is now in section 3.
- **Every route keeps its exact chunk set and chunk names** — `/` and `/journal`
  10, the other twelve 9, the two error pages 8. No module added.
- Page heights unchanged: `/journal` 3801 / 5160 / 3486, `/article/[slug]`
  4583 / 4813 / 3633, `/design-system` 7887 / 7773 / 7243, `/` 6350 / 6006 /
  5595.
- `magick compare -metric AE -fuzz 5%` in the settled state, against a worktree
  build of the parent: **0 at 375 / 800 / 1280 on `/article/[slug]` and
  `/design-system`**, and **0 on `/journal` outside the journal stamp** (78 / 109
  inside it at 800 / 1280 — the perforation drift at a different loop phase,
  present in both builds). `/` is **0 outside the capabilities cloth box** at all
  three, with 68 / 0 / 155 inside it.

### Non-goals

- **The image zoom stays.** The reference shows no zoom, but
  `group-hover:scale-105` was shipped deliberately in prompt 24 at the user's
  explicit request. The recording is read as showing the *type* treatment.
- **No slide** — the homepage rows translate +10 px, the reference's card titles
  do not move.
- `ArticleCardHorizontal`, `ArticleCardCompact`, `Meta` and the job listing's
  prose `hover:underline` are untouched.

## `/about`'s reveals

Prompt 30 (the file is `prompts/30-about-page-motion.md`; it was drafted as 29
and renumbered on execution — 29 was already taken by the perforation speed
change). `/about` was the last content route with no motion of its own, and it
now carries the site's existing `Reveal` and nothing else: **no new motion
component, no new timing constant, no `globals.css` rule, no geometry change,
no asset.** `about/sections.tsx` **stays a server component** — `children`
arrive as a prop, so its `next/image` never reaches the client bundle.

### `about.webm` *does* contain motion — and it is not our build

`public/design-ref/animation-ref/about.webm` (1264×573, 20.517 s, one
continuous scroll pass, recorded on localhost). **Unlike `journal.webm`, which
constrains nothing, this one carries authored motion and it was measured.**

**But it is a different implementation of the same comps.** Connected
components on the settled values row (t = 8.667) gives the three cards as
`398x247+19+133`, `397x246+433+134`, `398x246+846+134`; ours render **276
tall** — the 48px icon-box deviation already recorded above under "About page".
So the recording matches the comp's card height where ours deliberately does
not. **Read it for motion only.** Every geometry, type and wrap difference
against it is out of scope and must not be "fixed". No later session should
re-derive this.

### What was measured, and how

**The rise is measured with an ink-weighted centroid, which is
opacity-invariant** — opacity scales every weight uniformly, so the centroid
does not move as an element fades — and therefore separates a rise from the
page's own scrolling. The reference landmark is a neighbouring element that has
already settled.

| block | channel | rise | window |
| --- | --- | --- | --- |
| values card 1 | icon centroid − "Our values" centroid | 152.1 → 117.9 = **34.2 px** | t 7.90 → ~8.45 |
| team table | first-row centroid − "Meet the team" centroid | 192.9 → 160.5 = **32.4 px** | t 12.00 → 12.40 |

32–34 px against `Reveal`'s authored **36 px** desktop rise. Opacity runs 0→1
over the same window (values-card icon ink mass 5 222 → 94 000; founder title
ink mass 210 011 → 974 400).

**There is no sibling stagger, and that *is* a departure from `/`.** The three
values cards' rise is identical **to within 0.7 px at every frame**:

```
h014  c1 144.3  c2 144.2  c3 144.6
h019  c1 131.3  c2 131.2  c3 130.5
h024  c1 121.9  c2 121.7  c3 121.1
h030  c1 117.9  c2 117.7  c3 117.1
```

At the measured ~72 px/s mid-tween, 0.7 px is **under 10 ms**, where `Reveal`'s
`stagger` prop puts **0.08 s** between siblings. So the values grid is **one
plain `<Reveal>`, never `<Reveal stagger>`.** Do not "improve" it with a
stagger.

**Blocks trigger separately, rather than one section trigger with a stagger.**
"Our values" fades in at t ≈ 6.95–7.15; its cards do not start until t ≈ 7.90 —
a ~0.75 s gap on a continuous scroll. Same shape on the team block: "Meet the
team" is settled by t = 11.3 while the table starts at t ≈ 12.0.

**The founder text is one group, not three staggered lines.** Eyebrow, title and
prose share the same α at every frame (0.247/0.244, 0.455/0.431, 0.627/0.606,
0.710/0.688, 0.773/0.769 title/eyebrow) and their mutual gaps are constant
throughout (eyebrow→title 36–37 px, title→prose 107 px). One target, one tween.

**Duration could not be resolved better than 0.5–0.7 s.** Fitting `power3.out`
frame by frame and solving for `D`:

| channel | fitted `D` |
| --- | --- |
| values-card rise (centroid, opacity-invariant) | 0.60 – 0.75 s |
| founder title opacity (ink mass) | 0.40 – 0.74 s, drifting |
| team-table rise | ~0.45 s |

**The fit drifts in every ease tried** (`power2/3/4.out`, `expo.out`). The
site's existing `DUR = 0.5` / `EASE = "power3.out"` / `y = 36` sits inside that
band on all three channels, so they were **reused, not refitted**. If this is
ever revisited: say "measurement could not separate 0.5 from 0.7", not "0.5 was
measured".

**What the recording could NOT resolve**, and so is not claimed:

- **The hero on load.** The load beat (t = 3.2–5.2 at 20 fps) is progressive SSR
  paint plus a font swap, with no readable fade. `AboutHero`'s `immediate` is
  therefore a **judgement** — the call `/`'s hero and `/journal`'s stamp both
  make for an above-the-fold block — not a measurement.
- **The portrait and the seal.** Both enter from the foot of the viewport at
  full opacity within ~2 frames of becoming measurable (blue-band mean stable at
  241/246/251 from t = 8.80). `AetherfieldSeal` gets no motion of its own; it
  rides the portrait column's `Reveal`.
- **The footer.** The reference's wordmark is solid the instant it crosses the
  fold. **Ours keeps prompt 24's split blur-in**, which reaches every route via
  `chrome.tsx` and was shipped at the user's explicit request.

### What ships

`Reveal`'s `as` union gained **`"table"`** — one word, inert, the same kind of
change `"h2"` was for `/journal`. It is what lets the team table animate
**without a wrapper box**, which a `<div>` around a `<table>` would not manage
cleanly.

Eight targets, all at `Reveal`'s default `start: "top 88%"`:

| element | shape |
| --- | --- |
| `AboutHero`'s `<section>` | `<Reveal as="section" immediate>` |
| "Our values" `<h2>` | `<Reveal as="h2">` |
| the values `<ul>` | `<Reveal as="ul">` — **no `stagger`** |
| the portrait column | `<Reveal className="relative">` |
| the founder prose column | `<Reveal>` — one target for eyebrow + title + prose |
| "Meet the team" `<h2>` | `<Reveal as="h2">` |
| the team `<table>` | `<Reveal as="table">` |
| `CtaBand` | wrapped **at the call site in `app/about/page.tsx`** |

`chrome.tsx` is **not** edited — the same call `app/page.tsx` and
`app/journal/page.tsx` make. The sky band in `page.tsx` is deliberately **not**
wrapped: it is a document-level absolute sibling and paints immediately, as the
recording shows.

**Known deviation, recorded not chased:** the reference's elements begin fading
at roughly **95–97 %** of viewport height (its "Our values" is already grey at
the viewport foot), i.e. its trigger sits ~50 px lower at that 573 px viewport.
Matching it would fork the site's one trigger constant for a single page.

`globals.css` needed no change — `[data-reveal] { opacity: 0 }` inside the
existing `(scripting: enabled) and (prefers-reduced-motion: no-preference)`
block already covers every target. **Confirmed in the built chunk**, not
assumed: `[data-reveal],[data-reveal-item],[data-chart-pill]{opacity:0}`.

### Measured in the production build

Against a worktree build of `39b788c`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| page height | **5242** | **4129** | **4279** |
| `AE` @ 5 % fuzz, settled | **0** | **0** | **0** |
| reveal targets below opacity 1 after a full pass | 0 of 8 | 0 of 8 | 0 of 8 |

Page heights are the recorded numbers **unchanged**, and `/about` has no
scrubbed element, so a bare page-wide `AE` is the right instrument here —
unlike `/` and `/journal`.

**The lockstep property, which is what distinguishes this page from
`<Reveal stagger>`**, probed at 1280 through the values tween:

```
ul opacity 0      card tops 687.66 687.66 687.66   spread 0.00px
ul opacity 0.438  card tops 671.90 671.90 671.90   spread 0.00px
ul opacity 0.652  card tops 664.18 664.18 664.18   spread 0.00px
ul opacity 0.838  card tops 657.47 657.47 657.47   spread 0.00px
ul opacity 1      card tops 651.66 651.66 651.66   spread 0.00px
```

**Separate triggers confirmed**: scrolled so the heading is past `top 88%` but
its content is not, `h2` reads `1` while the `ul` reads `0`; the same on the
team block (`h2` `1`, `table` `0`). At scroll 0 the hero reads `1` (it is
`immediate`) and the other seven all read `0`.

**Reduced motion**: all eight at `opacity: 1` and `transform: translate(0px,
0px)`, i.e. at rest. **Note the prompt expected "no inline transform written"
and that is wrong about `Reveal`** — its reduce branch is `gsap.set(targets, {
opacity: 1, y: 0 })`, which writes the inline transform. Verified identical on
the **base** build's `/journal`, so it is pre-existing shared behaviour, not
something this change introduced; fixing it would move `/` and `/journal`.

**JavaScript off**: all eight at `opacity: 1` at their normal boxes
(`1280x800`, `1232x44`, `1232x276`, `612x700`, `400x338`, `1232x66`,
`1232x711`, `1280x348`) — the `scripting: enabled` gate never applies.

**Four `/about` ⇄ `/` and `/about` ⇄ `/journal` round trips, each with a full
scroll pass: zero page errors and zero console errors.** `Reveal` contains no
`contextSafe` and none was added.

### Impact

**`/about` is the only route whose prerendered HTML changes**, and its only
diffs are the seven `data-reveal` attributes, the `CtaBand` wrapper `<div
data-reveal>`, the `Reveal` client-reference `<script>` and chunk/build-id
renames. **The other 15 pages are byte-identical** once the build id and the CSS
and JS chunk names are normalised — no flight-payload segmentation to see
through, because no class string changed.

Chunk sets: `/about` goes **9 → 10**, the same way `/journal` did in prompt 24;
every other route keeps its exact set (`/` and `/journal` 10, the rest 9). GSAP
is already in the shared chunk site-wide, so **diff the chunk bytes, not the
list length** — `/about` is **775 793 → 776 791 raw (+998)** and **242 879 →
243 522 gzipped (+643)**. Every other route's totals are byte-identical.

### Non-goals held

- **No geometry, type, spacing or asset change.** The card height, the
  `display-band-h2` sizing, the `CtaBand` padding and the mobile length are all
  already-recorded deviations and were not chased.
- **The footer keeps its split blur-in**, and `chrome.tsx` was not edited.
- **No stagger, no scrub, no pin, no parallax, no loop, no hover.** The
  capabilities cloth is still the site's only scroll-linked element.
- **No new timing constant** — `DUR` and `EASE` come from `register.ts`.
- **`primitives.tsx`, `cards.tsx` and `home/` are untouched.**

## `/careers`' reveals, and the masthead's per-character blur-in

Prompt 32. `/careers` was the last **built** route with no motion of its own.
It now carries the site's existing `Reveal` on the job list and **one new client
leaf** for the masthead, which is split to **characters** and blurred in. Two
pieces from one request, and the second overrides the first: the user supplied
`~/Videos/Screencasts/career.webm` and asked for the page to animate "like
this", then added *"Use the ones circled and do a split words for each letter in
a blurry fashion too"* — the circle in
`~/Pictures/Screenshots/Screenshot_20260806_210121.png` is around the masthead
`h1` and nothing else.

### `career.webm` is the designer's build — geometry must not be read off it

Connected components at threshold 97 % on the settled frame:

| card | recording | our render at 1280 |
| --- | --- | --- |
| card 1 (UX Designer) | `820×218+223` | `820×218` |
| **card 2 (Data Scientist)** | **`820×194+223`** | **`820×218`** |
| card 3 (Product Manager) | `820×218+223` | `820×218` |

**194 is the comp's number**, and ours is 218 for the fixed 20 px
`--text-p1` / `--text-p2` floor already on file for `/careers`, `/journal` and
every article. So this is the designer's own implementation at ~17 px body type,
exactly as `career-joblisting.webm` was. **Only timing, opacity, easing and
travel transfer. No position, no box and no page height from this recording is a
target.** Put this first; it is what stops a later session fitting geometry to
it.

The file is **variable frame rate**, so frames were extracted once with
`-fps_mode passthrough` and indexed against the full `pts_time` list — see
section 3, where the trap is recorded.

### The fade is the site's own constants

α read as `(bg − mean) / (bg − final)`, linear in opacity because browsers
composite in sRGB. Background from a sky-only crop at the same y band
(`355x60+90+155` → 209.3), confirmed by the first painted frame reading α = 0.00
against it. Best fit over duration and onset, 38 samples:

| curve | masthead line 1 | masthead line 2 | job card 1 |
| --- | --- | --- | --- |
| power4.out | 0.67 s, SSE **0.0269** | 0.85 s, **0.0145** | 0.82 s, **0.0994** |
| **power3.out** | **0.53 s, 0.0298** | 0.69 s, 0.0184 | 0.65 s, 0.1000 |
| expo.out | 0.98 s, 0.0365 | 1.16 s, 0.0210 | 1.19 s, 0.1278 |
| power2.out | 0.39 s, 0.0409 | 0.54 s, 0.0315 | 0.47 s, 0.1102 |
| linear | 0.28 s, **0.0909** | 0.40 s, 0.0924 | 0.29 s, 0.1826 |

A decelerating curve beats linear by 3–5×, and `power3.out` at 0.53 s is inside
the winning band on every channel. **`DUR` and `EASE` ship from `register.ts`
unchanged.** Say *"measurement cannot separate power3.out / 0.53 s from
power4.out / 0.67 s; the site's constants sit inside the band"* if this is
revisited — **never "0.5 was measured"**.

**The masthead's two lines are one target.** Fitted onsets: line 1 4.418 s,
line 2 4.384–4.418 s — under two frames apart, against `Reveal`'s 0.08 s ≈ five
frames.

**`delay={0.16}` is two steps, and two recordings agree.** Fitted onsets put the
masthead at 4.418 and job card 1 at 4.557 → **Δ 0.139 s**; the unexecuted
`prompts/30-careers-and-job-listing-reveals.md` measured **0.167 s** the same way
on a *different* recording (`career-joblisting.webm`). Two independent readings
side by side make two steps of the site's 0.08 the honest number.

### The rise: measured floors, judged amplitudes

Two opacity-invariant channels, both on a page that is **not** scrolling:

- **Half-max row-profile top edge** of "Careers at": 208.05 → 161.86, i.e.
  **46.2 px observed**, and the first sample is already at α ≈ 0.10, so the true
  amplitude is larger.
- **Half-contrast top edge of job card 1** (a solid white block against the sky,
  the cleanest channel on the page): 385.08 → 328.44, **56.6 px observed**.

Both corroborated by normalised row-profile cross-correlation (masthead ≈ +30 px,
card ≈ +28 px, both decaying to 0).

**No single power curve fits amplitude, onset and duration together.** Free fits:

| channel | best | A | duration | rms |
| --- | --- | --- | --- | --- |
| masthead top edge | power3.out | 55 px | 0.76 s | 0.53 px |
| card 1 top edge | expo.out | 80 px | 1.00 s | 0.74 px |
| card 1 top edge | power4.out | 87 px | 0.81 s | 0.83 px |
| card 1 top edge | power3.out | 157 px | 0.83 s | 1.14 px |

Holding the fade's fitted `power3.out` / 0.53 s and solving for amplitude frame
by frame gives A = 44.7 → 46.3 → 58.2 → 72.5 → 229 — it climbs monotonically,
i.e. the position is still moving long after the opacity has landed. Prompt 30
hit the same runaway on the other recording.

**So `y={56}` on the masthead and `y={72}` on the job list are judgements
anchored on the 46 px and 57 px observed floors**, not measurements — but the
floors are what make `Reveal`'s default 36 definitely short. Both are multiples
of the 8 px rhythm and neither introduces a constant; `y` is an existing prop.
**Do not add a second duration or a second ease to `Reveal`** — the site has one
reveal curve and a per-page fork is not worth it.

### There is no blur and no split in the recording

Five masthead crops stacked at α ≈ 0.13 / 0.24 / 0.51 / 0.75 / 1.0 and enlarged
300 % show **crisp glyph edges at every stage**, every letter at the same α. This
matters twice: it confirms the rise is real rather than a blur artefact (a
symmetric blur pushes a half-max top edge *up*; the measured edge moves the
other way), and it establishes that **the chars split and the blur are the
user's explicit addition**, in the same spirit as the seal's offsets and the
20 % speed-up.

**Nothing reveals on scroll and there is no hover.** Cards 2, 3 and the
open-application card read `max = 255` on the first frame their top edge enters
the viewport across both scroll passes — in the designer's build the whole
document reveals at load. The cursor crosses several cards with no measurable
change. No scrub, no pin, no parallax, no loop.

### `motion/careers-masthead-text.tsx`

`"use client"`, component-only, `children` as a prop, and it renders the `<h1>`
itself with the class string taken over **verbatim** — so no box is added and no
class string changes. **It lives in `motion/`, never in `careers/` and never in
`home/`**: `motion/` is the shared surface and nothing outside `home/` may
import `home/hero-text.tsx`. Keep it component-only, the `principles-data.tsx`
rule. One `useGSAP` with `{ scope: root }`, one `gsap.matchMedia()` with the
named `isDesktop` / `isMobile` / `reduceMotion` / `fullMotion` set,
`mm.add(…, root)`, `mm.revert()` as cleanup, `DUR` / `EASE` from `register.ts`.
`careers/sections.tsx` **stays a server component**; `app/careers/page.tsx` is
unchanged.

**The 20-glyph count is what makes a chars split affordable, and it supersedes
the standing "chars is out of scope" note for this element only.** That note's
objection is a target count — an animated `filter: blur()` repaints each
target's layer every frame — and the masthead is **20 glyphs** ("Careersat" 9 +
"Aetherfield" 11; the space is not a char), the same order as the footer's 12
words and the hero's five. **Measured in the render: exactly 20.** The objection
still stands everywhere else.

```
type: "chars", smartWrap: true, tag: "span", aria: "auto" (default), autoSplit: true
```

- **`smartWrap: true` is required.** Splitting chars without words or lines lets
  the browser break mid-word; without it "Aetherfield" can wrap between glyphs at
  a narrow viewport. It is what makes the mid-flight span count **25** — two
  authored line spans + 20 chars + three `white-space: nowrap` word wrappers.
- **`tag: "span"`** — a `<div>` inside the authored `<span className="block">` is
  invalid markup, the reason `hero-text.tsx` gives.
- **`autoSplit: true`, with the animation created inside and returned from
  `onSplit(self)`.** A tween created outside it targets orphaned nodes after the
  first re-split. It is also why **no `document.fonts.ready` promise is used**: a
  tween created in a promise callback is outside every gsap Context, and
  reaching for `contextSafe` to fix that is the documented `RangeError` crash.
  Everything is created synchronously inside the `mm.add` handler.
- The two authored `<span className="block">` lines are untouched, and **one**
  `SplitText.create` runs over the whole `h1` — `self.chars` is then in document
  order, so the stagger is a single sweep left-to-right and top-to-bottom across
  both lines. Do not create two instances.

**The split is reverted when the tween lands, and that is load-bearing.**
`onComplete: () => self.revert()`. The hero could get away with
`clearProps: "filter,display"` because a **words** split leaves word-internal
kerning intact; a **chars** split puts every glyph in its own inline box, which
breaks every kerning pair and rounds every advance to a whole pixel — and line 1
is Newsreader, which kerns. `revert()` restores the original text nodes, so the
settled masthead is the plain server markup the comps were measured against:
original kerning, original rasterisation, no leftover `aria-hidden` spans.
**`clearProps` is then unnecessary and is deliberately absent.** Verified: the
settled `h1` holds **2** spans (the authored ones) and the settled render is
`AE` 0 — see the table below. Reverting from inside the tween's own `onComplete`
does not throw, and needs no `contextSafe`: it runs after the tween has finished
and, being a GSAP callback, with the creating context active
(`gsap-core.js:981`).

**`aria: "auto"` derives the label from `textContent.trim()`
(`SplitText.js:213`) and the two line spans have no whitespace between them**,
so the split element was labelled **"Careers atAetherfield"** — measured, and
the one defect this work found. The leaf now joins the two lines with a space
and re-applies the label inside `onSplit` (which runs *after* SplitText writes
its own, and on every re-split). The label is read off the markup rather than
hardcoded, so the copy cannot drift, and it is captured **before** the split
because `h1.children` is the split spans afterwards. An authored `aria-label` in
the JSX would not work — `aria: "auto"` overwrites it unconditionally. The
revert restores the original attributes, so the settled heading carries no
`aria-label` at all and reads natively. **Verified in the accessibility tree at
375, 800 and 1280: `- heading "Careers at Aetherfield" [level=1]` both during
the split and after the revert.**

The tween: `gsap.set(h1, { opacity: 1 })` (the CSS start state hides the `h1`),
`gsap.set(self.chars, { display: "inline-block" })` — required or the `y` will
not render on a span, and it goes away with the revert — then
`gsap.from(self.chars, { opacity: 0, filter: blur(N), y, duration: DUR, ease:
EASE, stagger: CHAR_STAGGER })`.

- **`gsap.from` is correct here and `fromTo` is not needed.** The trap on file
  ("`gsap.from` reads the element's *current* value as the tween's end value")
  bites only on an element `globals.css` is holding at 0 — that is the `h1`, and
  the `h1` is lifted by the `gsap.set` rather than tweened. The chars are fresh
  spans at their default opacity 1.
- **`blur(0px)`, never `none`** — GSAP interpolates a filter numerically only
  between two `blur()` functions.
- **`BLUR = 12` at `lg`, `Math.round(12 × 0.66) = 8` below — reused from the
  hero, not measured.** `display-careers-title` is 36 / 64 / 80 px, the same
  curve as the article title and the same range the hero's type spans.
- **`CHAR_STAGGER = 0.03` is a judgement**, and the only new timing number.
  20 × 0.03 = 0.57 s of run alongside `DUR 0.5` gives a masthead beat of ~1.07 s,
  close to the footer's authored 1.0 s. The hero's 0.06 would run 1.2 s of
  stagger alone here and read as a crawl. It stays **local to this leaf** and does
  not go into `register.ts`, as the hero's `STAGGER` does.

**Reduced motion splits nothing at all** — no `SplitText.create`, no tween — and
lands only `gsap.set(h1, { opacity: 1 })`, as `hero-text.tsx` and
`footer-reveal.tsx` do.

**`Reveal`'s `as` union was NOT widened.** Prompt 32 proposed adding `"h1"`; the
masthead is the split leaf and never a `Reveal`, so `"h1"` would have been a dead
type. Dropped, per that step's own escape clause. `reveal.tsx` is untouched.

### `globals.css` — one selector

`[data-careers-split]` joins the existing
`(scripting: enabled) and (prefers-reduced-motion: no-preference)` block,
**opacity only**, alongside `[data-hero-split]` and `[data-footer-split]`. No
start transform, for the reason `[data-journal-mark]` records. **Confirmed in
the built chunk**, not assumed:
`…[data-journal-mark],[data-hero-split],[data-footer-split],[data-footer-wordmark],[data-careers-split]{opacity:0}`.

### The job list — one staggered trigger, not one `Reveal` per card

`JobList`'s `<ul>` is `<Reveal as="ul" stagger delay={0.16} y={72}>` with the
identical class string, and each `<li>` gains `data-reveal-item`. `/journal` uses
per-card triggers because its grid is ~3000 px tall and a single trigger would
run four cards far below the fold; this list is ~900 px at 1280 and the recording
reveals all four together at load, so one trigger at `Reveal`'s default
`start: "top 88%"` — which fires at load at every breakpoint, the list top being
y ≈ 216–332 — is both simpler and closer to the source. Note `stagger` mode
emits no `data-reveal` on the `<ul>`, so the `<ul>`'s markup is unchanged.

### Measured in the production build

Against a worktree build of `9fd6cd3`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| page height | **1895** | **1770** | **1925** |
| dashed card box | `335×224+20+1200` | `760×170+20+1001` | `820×170+230+1036` |
| `AE` @ 5 % fuzz, **outside** the dashed card | **0** | **0** | **0** |
| `AE` inside the dashed card box | 47 | 143 | 546 |
| settled `h1` spans | **2** | **2** | **2** |
| mid-flight chars / spans | 20 / 25 | 20 / 25 | 20 / 25 |
| tail char at t ≈ 250 ms | `blur(8px)`, `y 37` | — | `blur(12px)`, `y 56` |
| head char at the same instant | α 0.79, `blur(1.67px)` | — | α 0.80, `blur(2.39px)` |

Page heights and every card box are the recorded numbers **unchanged**, and the
`h1` box is identical to the base build at all three widths. **Never report a
bare page-wide `AE` for `/careers`** — the open-application card's marching
dashes sit at a different loop phase in any two shots, the warning already on
file. Masked, the remainder is **0**, which is the proof that the revert lands
exactly.

**Reduced motion**: `h1` at `opacity: 1` with **0** split spans, all four `li` at
`opacity: 1`. `Reveal`'s reduce branch writes `matrix(1, 0, 0, 1, 0, 0)` — the
pre-existing shared behaviour verified on `/journal` in prompt 30, not a
regression. **JavaScript off**: `h1` and all four `li` at `opacity: 1` with
`transform: none`; the `scripting: enabled` gate never applies and the dashed
frame's CSS march still runs.

**Eight round trips (`/careers` ⇄ `/` and `/careers` ⇄ `/journal`), each with a
full scroll pass: zero page errors and zero console errors.** That is what the
new `self.revert()`-in-`onComplete` lifecycle surface was tested for.

### Impact

**`/careers` is the only route whose prerendered HTML changes**, and its markup
diffs are exactly six attributes plus one script: `data-careers-split=""` on the
`h1`, `data-reveal-item="true"` on each of the four `<li>`, and the client
reference `<script>`. Every class string is carried over verbatim, so there is
**no RSC flight-payload re-segmentation to see through** — the other **15 pages
are byte-identical** once the build id and the CSS and JS chunk names are
normalised, with no stripping required.

Chunks: `/careers` goes **9 → 10**, the way `/journal` and `/about` did. **Diff
the bytes, not the count** — GSAP is already in the shared chunk site-wide, so
`/careers` is **775 793 → 777 863 raw (+2 070)** and **242 198 → 243 160 gzipped
(+962)**. Every other route's chunk set, chunk names and byte totals are
**identical**.

### Non-goals held

- **`/job-listing/[slug]` is not touched.** The unexecuted prompt 30 bundled it
  in; the user's request names `/career` and the recording covers `/careers`
  only. It stays unanimated and wants its own prompt.
- **No geometry, type, spacing, colour or asset change.** The card heights, the
  20 px `--text-p1` / `--text-p2` floor, the masthead's fitted
  `pt-[66px] sm:pt-[89px] lg:pt-[88px]` and the 120 px foot are all
  already-recorded, comp-measured decisions and none was chased.
- **The dashed frame's marching CSS animation is untouched** — prompt 31, still
  outside the `scripting: enabled` block.
- **The footer keeps its split blur-in** and `chrome.tsx` is not edited.
- **No scroll-triggered reveal below the fold, no hover, no scrub, no pin, no
  parallax, no loop.** The capabilities cloth is still the site's only
  scroll-linked element.
- **No change to `DUR`, `EASE` or `Reveal`'s `stagger: 0.08`**, and `reveal.tsx`
  is not edited at all.
- **`cards.tsx` / `JobCard` is not touched** — it is shared with
  `/design-system`.

## The navbar's drop-in (`motion/nav-drop.tsx`)

Prompt 33. `SiteNav` was **the last piece of the site with no motion at all**,
and it was an omission rather than a decision: `chrome.tsx` imported exactly one
motion module (`FooterMotion`), and the structure that keeps the bar pinned also
puts it out of reach of every page's `Reveal` — `SiteNav` renders *outside*
`Container`, and on `/careers` and the job listings `main` is a **sibling** of
the header, because a wrapper round `SiteNav` unpins the sticky bar. So the
header needs its own leaf. `/job-listing/[slug]` remains the last unanimated
*route* and still wants its own prompt.

`app/_components/motion/nav-drop.tsx` — `"use client"`, component-only, renders
the `<header>` itself and takes its class string over **verbatim**, exactly as
`FooterMotion` takes over `<footer>`. One `useGSAP` with `{ scope: root }`, one
`gsap.matchMedia()` with the named `reduceMotion` / `fullMotion` pair,
`mm.add(…, root)`, `mm.revert()` as cleanup, `EASE` from `register.ts`. **No
`contextSafe`** — the tween is created synchronously inside the handler, and
wrapping that is the documented `RangeError` crash. Keep it component-only, the
`principles-data.tsx` rule. `chrome.tsx`'s `CONTAINER` row, the wordmark `Link`,
`NAV_ITEMS`, the `LinkButton`, the mobile toggle, the mobile panel and the
`useState` are all unchanged.

### The measurement that says "drop", not "fade"

References: `~/Videos/Screencasts/career.webm` (1263×569, VFR, 750 frames) and
`~/Videos/Screencasts/about.webm` (1264×573, VFR, 827 frames). **There is no
navbar-specific recording and none is needed** — every existing capture contains
the bar at load. `navbar-demo.webm` is about the *blur radius* and constrains
nothing here. Both are **the designer's build** (prompt 32's finding for
`career.webm`), so **only timing, opacity, easing and travel transfer — no
geometry.** Both are VFR and were extracted once with `-fps_mode passthrough`
and indexed against the full `pts_time` list.

The channel is the **ink bounding box of the wordmark**, thresholded at 60 %:

| | `career.webm` | `about.webm` |
| --- | --- | --- |
| first ink | f232, `102×1` at Y 1 | f198, `101×4` at Y 1 |
| full height | f240, `102×20` at Y 2 | f204, `101×20` at Y 2 |
| settled | f253, `102×20` at **Y 14** | f222, `101×20` at **Y 17** |

**A box that grows downward from a fixed top edge and then translates down is an
element entering from behind the viewport's top edge**, clipped by the window —
a fade holds the box still, and a rise moves it the other way. The nav links
reproduce it in the same frames (`390×12`, Y 1 → 15 and 1 → 18), so **the
wordmark and the links move together as one element**: the `<header>`
translating, not its contents staggering. Observed bottom-edge travel is **32 px
on both files**, and both are *floors* — the element is off-screen and
unmeasurable before the first ink frame.

### The fit, and the three sentences that must not drift

Free fit over onset, duration and travel against the bottom-edge trace:

| curve | `career.webm` | `about.webm` |
| --- | --- | --- |
| **power3.out** | onset 4.841, **0.74 s**, 70 px, rms **0.38 px** | onset 3.872, 0.67 s, 58 px, rms 0.69 px |
| **power4.out** | onset 4.911, 0.81 s, 55 px, rms 0.41 px | onset 3.952, **0.72 s**, 41 px, rms **0.54 px** |
| power2.out | onset 4.801, 0.64 s, 69 px, rms 0.64 px | onset 3.787, 0.62 s, 70 px, rms 1.08 px |
| expo.out | onset 4.946, 0.89 s, 59 px, rms 1.19 px | onset 3.907, 0.89 s, 67 px, rms 0.86 px |
| linear | onset 4.521, 0.79 s, 76 px, rms 1.62 px | onset 3.792, 0.46 s, 54 px, rms 2.11 px |

- **`power3.out` and `power4.out` cannot be separated** — 0.03 px of rms apart,
  and a decelerating curve beats linear by 3–4× on both files. **`EASE` ships
  unchanged.**
- **Travel does not resolve (41–70 px across the fits)**, because the start of
  the motion is off-screen. **`yPercent: -100` is a judgement anchored on the
  32 px observed floor, never a measurement.** It is the bar's own height, so it
  stays tied to the geometry rather than to a magic 60 that a future 72 px bar
  would break, and it matches the CSS start state exactly.
- **Duration fits 0.62–0.89 s across both files and every curve, and `DUR` (0.5)
  is outside that band** — which is why `NAV_DUR = 0.7` (the band centre) is
  **local to this leaf**, exactly as `FOOTER_DUR = 1.0` is. It does **not** go
  into `register.ts`.

**The chrome arrives after the page, by about half a second.** `career.webm` is
the only file that can show this, because it carries both onsets in one
recording: masthead **4.418 s** (prompt 32's fitted value), bar **4.84–4.95 s**
→ **Δ 0.42–0.53 s**. `NAV_DELAY = 0.48`, six steps of the site's 0.08. Prompt 30
already records that `about.webm`'s load beat is progressive SSR paint with no
readable content onset, so it cannot corroborate it. **Do not "improve" it to 0**
— the page composes itself first and the chrome follows.

**The opacity ramp is present in the trace but confounded.** Minimum grey inside
the wordmark crop (sky 205) keeps falling *after* the ink box has reached full
height — f234 70.8, f238 35.0, f240 26.3, f243 16.6, f247 5.2, f252 0.1 — so it
is not just clipping; as α that is ≈0.87 at f240 → 1.0 by f252. But the bar is
moving fastest exactly where the ink is lightest, and both a rolling-shutter
smear and JPEG quantisation lift a dark minimum. **The fade ships because every
other reveal on this site fades, not because it was measured.**

### Three traps, two of them found by measurement in this build

- **`fromTo`, never `from`, on any element `globals.css` hides.** The CSS start
  state holds the header at `translateY(-100%)`, and `gsap.from` reads the
  element's *current* value as the tween's **end** value — it would animate
  −100 % → −100 % and the bar would never arrive. Second time this trap has come
  up; the footer wordmark was the first.
- **`y: 0` must be authored on both ends of the `fromTo`, and this one bit.**
  GSAP writes a transform as `translate(x, y) translate(xPercent%, yPercent%)`
  and parses the element's existing transform into the ***px*** pair — so the CSS
  `translateY(-100%)` is read as `y: -60px`, not as `yPercent: -100`. Animating
  `yPercent` alone leaves that −60 in place. **Measured before the fix: the
  settled bar sat at inline `translate(0px, -60px)` at 375, 800 and 1280, one bar
  height above the viewport and permanently off-screen.** Not a theoretical risk
  — a page-wide `AE` would not have caught it either, since the bar is
  transparent glass at the top of the page.
- **It plays once per document load, and that needs a module-scope flag — the
  bar does NOT survive a client-side navigation on its own.** Every page renders
  its own `<SiteNav />`, so React unmounts and remounts it across routes and a
  bare `useGSAP` with no dependencies runs *again*: measured before the flag, the
  bar sat at `yPercent −98` half a second after each of eight in-app clicks, i.e.
  it re-dropped every time. `let hasDropped = false` at module scope survives a
  remount but not a document load, which is exactly the lifetime wanted. On a
  remount the branch must `gsap.set(header, { yPercent: 0, y: 0, opacity: 1 })`
  rather than simply return — the CSS start state applies to the fresh element
  and would leave the bar hidden. `useGSAP` runs in a layout effect, so it lands
  before paint and there is no flash. **Do not add a route listener to re-run the
  entrance**: the bar is "one constant bar", and re-dropping it on every in-app
  navigation would fight that. A judgement — no recording covers a client-side
  navigation.

**`overflow-hidden` must never go on the `<header>`.** The mobile panel is a
*sibling of the row inside the same `<header>`*, so clipping the header to
contain the entrance would clip the open menu. The window's own edge does the
clipping, which is what both recordings show. Verified: header `overflow`
computes `visible` with the panel open, and the panel measures
`375×424 +0+60` with its four links.

### `globals.css` — one selector

`[data-nav-drop]` joins the existing
`@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` block
with **an authored start transform**, unlike `[data-journal-mark]` and the split
elements. That warning is about a transform that *decomposes* badly — a
perspective folded against an independent `rotate` — and a plain `translateY` has
no such interaction; `[data-chart-bar]` and `[data-chart-grid]` in the same block
are the precedent. **Confirmed in the built chunk**, not assumed:
`…[data-careers-split]{opacity:0}[data-nav-drop]{opacity:0;transform:translateY(-100%)}`,
inside the gate.

### Measured in the production build

Against a worktree build of `cc664d4`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| settled inline transform | `translate(0px, 0px)`, opacity 1 | same | same |
| mid-flight (700 ms) | `matrix(…, -28.47)`, α 0.525 | `-29.87`, α 0.502 | `-33.70`, α 0.438 |
| settles at | 1327 ms | 1323 ms | 1310 ms |
| reduced motion | `transform: none`, opacity 1, **no inline transform** | same | same |
| JS off | `transform: none`, opacity 1, box `1280×60` | same | same |

Authored end-to-end is `NAV_DELAY + NAV_DUR` = 1.18 s from tween creation; the
~140 ms on top is hydration, measured from navigation commit.

**Page heights are unchanged on every route** — a transform is not layout, so any
movement here would be a bug: `/` 6350 / 6006 / 5595, `/journal` 3801 / 5160 /
3486, `/careers` 1895 / 1770 / 1925, `/about` 5242 / 4129 / 4279.

**The sticky bar still pins past the fold**, which is the specific risk of a
`position: sticky` element carrying a residual inline transform. Scrolled well
past the fold, `getBoundingClientRect().top` is **0** with `position: sticky` on
`/` (document-level sky sibling), `/careers` (`main` pulled up under the bar) and
`/article/[slug]`, at all three breakpoints.

**Eight client-side round trips (`/` ⇄ `/journal` ×4, `/` ⇄ `/` via Product ×4,
plus `/about`), each with a full scroll pass: zero page errors and zero console
errors**, and the bar reads `matrix(1, 0, 0, 1, 0, 0)` / opacity `1` after every
one — it does not re-drop.

`magick compare -metric AE -fuzz 5%` in the settled state:

| route | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `/about`, `/article/[slug]`, `/design-system`, `/job-listing/data-scientist` | **0** | **0** | **0** |
| `/` | **0** | 0 outside the cloth box, 33.6 inside | **0** |
| `/journal` | **0** | 0 outside the stamp, 106.6 inside | 0 outside, 80.7 inside |
| `/careers` | 0 outside the dashed card, 47.9 inside | 0 outside, 294.3 inside | 0 outside, 313.1 inside |

The three non-zero routes are the ones that already carry that warning — the
scrubbed capabilities cloth, the journal stamp's perforation drift and the
open-application card's marching dashes, each at a different loop phase in any
two shots. **Outside those boxes it is 0 everywhere.** Report it scoped.

### Impact

**Every route's prerendered HTML changes**, as prompt 24's footer did, and the
diff is exactly **one attribute — `data-nav-drop=""` on the `<header>`** — on all
15 content pages; `_not-found` and `_global-error` are byte-identical. The class
string is carried over verbatim, so there is **no other markup diff and no RSC
flight-payload re-segmentation to see through**.

**Every route keeps its exact chunk set** (`/`, `/journal`, `/about` and
`/careers` 10, the rest 9) — `NavDrop` bundled into the existing shared chunk.
**Diff the bytes, not the count**: every route is **+563 raw / +87 gzipped**.

### Non-goals held

- **No geometry, type, colour, spacing or asset change.** The 60 px bar, the
  `bg-white/10` over `backdrop-blur-[32px]` and its `bg-white/85` fallback, the
  `CONTAINER` gutters, the `text-nav` links and the drawn "Get started" arrow are
  all fitted numbers and none is touched.
- **No scroll behaviour.** The bar still never hides, shrinks or changes state on
  scroll — this is a load entrance and nothing else.
- **No stagger across the wordmark and the links.** The recordings move them
  together in the same frames; one element, one tween.
- **No split, no blur.** The footer's treatment is not extended upward — nothing
  in either recording shows it, and a split would strip the wordmark link and
  each nav link of its accessible name for the duration.
- **`SiteFooter` and `CtaBand` are untouched**, as are `NAV_ITEMS` and every
  `href`.
- **No change to `DUR`, `EASE` or `Reveal`**; `reveal.tsx` is not edited.
- **No `will-change`, no pin, no scrub.** The capabilities cloth is still the
  site's only scroll-linked element.

## `/job-listing/[slug]`'s two reveals

Prompt 34, the last content route with no motion of its own. Two `Reveal` calls
and a two-word type widening — **no new client module, no new timing constant,
and no `globals.css` rule** (`[data-reveal]` is already in the
`(scripting: enabled) and (prefers-reduced-motion: no-preference)` block).
`job/sections.tsx` stays a **server** component, and all three roles render the
same two components, so one change covers three routes.

```tsx
<Reveal as="p"       immediate              y={24}>  {/* Back to Careers */}
<Reveal as="article" immediate delay={0.08} y={72}>  {/* the whole card */}
```

`Reveal`'s `as` union gains `"p" | "article"`, inert, for the reason the `"h2"`
and `"table"` widenings already record: the reveal **takes the existing element
over via `className` instead of wrapping it**, so no box is added and no class
string changes. `app/job-listing/[slug]/page.tsx` is unchanged, as are
`primitives.tsx`, `cards.tsx`, `chrome.tsx` and everything under `home/`.

### Read off `career-joblisting.webm`, which is the designer's build

Same warning as everywhere else it is cited: its `/careers` card 2 measures
`820×194` where ours renders `820×218` on the fixed 20 px `--text-p1` /
`--text-p2` floor. **Only timing, opacity, easing and travel transfer — no
position, box or page height from it is a target.**

**The fade is the site's own constants.** α as `(bg − mean) / (bg − final)`,
linear in opacity because browsers composite in sRGB. Best fit over duration and
onset, 32 samples: **power3.out 0.57 s (SSE 0.0177)**, power4.out 0.72 s
(0.0178), Tailwind `ease-out` 0.49 s (0.0200), power2.out 0.42 s (0.0298),
linear 0.30 s (0.0918). A decelerating curve beats linear by 5× and `power3.out`
— which *is* `EASE` — wins. Say *"measurement cannot separate power3.out / 0.57 s
from power4.out / 0.72 s; the site's constants sit inside the band"*, **never
"0.5 was measured"**.

**`delay={0.08}` is one step, measured.** Onsets at 60 fps: back link f046, card
f052 → **100 ms**, against 0.08 s = 4.8 frames. One frame of error, and it
corroborates `/careers`, whose masthead → list gap measured two steps.

**The whole card is one target, and that is measured.** Its background, the role
title, the meta line and the lede all begin within one frame of each other. Do
not animate the card's contents separately, and do not give the `Seal` or the
closing CTA a reveal of their own.

### The rise, and the measurement error it corrects

**The unexecuted prompt 30 measured this wrong, and its `y={12}` was never
shipped.** It read the careers masthead's rise at **8.5 px** with a plain
`max(0, bg − v)` ink centroid. Re-measured with a **per-row background sampled
from a text-free column band at the same rows**, the same recording gives 32 px
observed and a frame-by-frame amplitude of **38–46 px** — landing on the 46.2 px
floor prompt 32 measured independently on `career.webm` and on the 55 px it
fitted. `/careers`' shipped `y={56}` is right; the 8.5 px was a clipped crop plus
sky in the weights. The corrected recipe is in section 3.

Measured here with that method:

| channel | observed floor | fits |
| --- | --- | --- |
| **back link**, background-subtracted ink centroid, 35 samples | **23.8 px** | power4.out 24 px / 0.67 s (rms 0.38), power5.out 24 px (0.41), power2.out 29 px (0.45), power3.out 49 px / 0.71 s (0.33). Held at the site's power3.out / `DUR`: **23 px** |
| **the card**, "Apply now" button top — a black block on white, immune to the sky | ~41 px from the first thresholdable frame | holding power3.out / `DUR` and solving frame by frame gives 70 → 75 → 85 → 89 → 117, i.e. **it climbs** |

The climbing amplitude is the pathology `/careers` already records: the position
is still moving after the opacity has landed, so no single power curve fits
amplitude, onset and duration together. **Read the floors, judge the values.**
`y={24}` is the back link's floor and what two of four eases pick; `y={72}` is
the card's ~70 px floor **and exactly what `/careers` ships on its job cards**,
so this introduces no constant the site did not already have.

**`immediate` on both**, because each is above the fold at 375, 800 and 1280 and
the recording's entry fires on mount rather than on a scroll threshold — the call
`JournalStamp` and the `/careers` masthead both make.

### The recording shows nothing else — do not re-sample it for these

- **No blur and no split.** Stacked masthead crops from α 0.27 to 1.0 show crisp
  glyph edges at every stage. The per-character blur is scoped to the `/careers`
  masthead and was the user's own addition on top of this recording.
- **No per-section scroll reveal.** Sampled at 6 fps across the whole job-listing
  scroll (t 27.5–34 s), every heading, paragraph, bullet, the `Seal` and the
  closing CTA are fully opaque the instant they cross the fold.
- **No hover** on either Apply button or on "Back to Careers".
- No scrub, pin, parallax or loop.

### Measured in the production build

**Isolated in two sibling worktrees at `cc664d4`**, one carrying only this
patch, servers on 3021 / 3022 — the main tree carried another session's in-flight
navbar work, so a working-tree build would not have isolated this change. The
behavioural numbers were then **re-verified on `9d96006`**, i.e. with the navbar
drop-in playing alongside: identical, and still zero errors.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `AE` @ 5 % fuzz, `/job-listing/data-scientist` | **0** | **0** | **0** |
| `AE` @ 5 % fuzz, `/job-listing/ux-designer` | **0** | **0** | **0** |
| page height, data-scientist | 3383 | 2551 | 2580 |
| page height, ux-designer | 3255 | 2479 | 2456 |
| back-link travel observed | 14.3 | — | 21.1 |
| card travel | **48** = round(72 × 0.66) | — | **72** |

Page heights are **identical** to the parent build at every width. A bare
page-wide `AE` is the right instrument on these routes — they carry no
scroll-linked element and no CSS loop, unlike `/`, `/journal` and `/careers`.

- **The back link leads the card**: sampled at 0.11 opacity with the card still
  at 0, at both 1280 and 375.
- **Reduced motion**: both at `opacity: 1`, `y: 0`. `Reveal`'s reduce branch is
  `gsap.set(targets, { opacity: 1, y: 0 })`, so it does write
  `matrix(1, 0, 0, 1, 0, 0)` — pre-existing shared behaviour, not a regression.
- **JavaScript off**: back link `1232×102+24+60`, card `820×1657+230+204` — the
  recorded settled geometry.
- **The `Seal` still spills 65 px past the card's right edge** and the card
  computes `overflow: visible`. `Reveal` writes `opacity`, which makes a stacking
  context; harmless alone, but **nothing in this chain may become
  `overflow-hidden`**.
- **Four `/careers` ⇄ `/job-listing/data-scientist` round trips plus a
  `/job-listing/data-scientist` → `/` → back, each with a scroll pass: zero page
  errors and zero console errors.** No `contextSafe` is used here.

**Only the three `/job-listing/*` routes' prerendered HTML changes.** A tag-level
diff shows exactly three markup diffs — `data-reveal=""` on the `<p>`,
`data-reveal=""` on the `<article>`, and one added client-reference `<script>` —
plus RSC flight-row renumbering from the inserted `Reveal` reference. **The other
13 pages are byte-identical** once the build id and the CSS and JS chunk names
are normalised, with no class-string substitution needed. Chunk count goes
**9 → 10** on those three routes and is unchanged everywhere else (`/`,
`/careers`, `/journal`, `/about` 10; `/design-system` 9).

### Non-goals held

- **`SiteNav` was not touched here.** The recording fades the header in ~0.55 s
  after the page content on both entries; that is prompt 33's scope, and it
  shipped separately in `9d96006`.
- The back link's `hover:underline` stays, as prompt 27 already declared.
- No geometry change, and the 20 px `--text-p1` / `--text-p2` floor stands.
- No change to `DUR`, `EASE`, `Reveal`'s `stagger: 0.08` or its 36/24 default.


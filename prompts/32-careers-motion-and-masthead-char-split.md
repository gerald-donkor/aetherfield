# 32 — `/careers` entry reveals, and a per-character blur-in on the masthead

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `gsap-plugins` | SplitText — `type: "chars"`, `smartWrap`, `tag`, `aria`, `autoSplit`/`onSplit`, `revert()`. The chars split is the new mechanic here and every one of those options is load-bearing. |
| `gsap-react` | `useGSAP` scope + cleanup, registering plugins at module scope, why nothing may be created during render. |
| `gsap-core` | `gsap.matchMedia()` with the reduced-motion split, `fromTo` vs `from`, stagger, `clearProps`. |
| `vercel-react-best-practices` | `bundle-barrel-imports` (leaf imports, never `home/sections`), `server-serialization` / children-as-prop so the section file stays a server component. |
| `tailwind-4-docs` | Only if a class string is touched. It should not be — every class is carried over verbatim. |

---

## Scope, and why it is next

`/careers` is the last **built** route with no motion of its own. Prompts 17–23
built out `/`, prompt 24 put reveals on `/journal` and the split blur-in in the
footer, prompt 30 did `/about`, prompt 31 marched the dashed frame. `/careers`
still renders exactly as the server sent it, apart from the footer it inherits.

The user supplied a new recording, `~/Videos/Screencasts/career.webm`, and asked
for the page to be animated "like this", plus one explicit addition:

> Use the ones circled and do a split words for each letter in a blurry fashion
> too.

The circle in `~/Pictures/Screenshots/Screenshot_20260806_210121.png` is drawn
around the **masthead `h1`** — both lines, "Careers at" (Newsreader) over
"Aetherfield" (Archivo). Nothing else is circled.

**So there are two pieces, and the second overrides the first.** The recording
gives the page's entry sequence — a fade and a rise, no split, no blur. The user
then asks for the masthead specifically to be split **to characters** and blurred
in. Where the two disagree, the user's instruction wins, and this file records
which numbers came from which.

**`prompts/30-careers-and-job-listing-reveals.md` was written and never
executed** — `git log` has no careers commit, `careers/sections.tsx` contains no
`Reveal`, and `AGENTS.md` records nothing for it. (It also collides in number
with `30-about-page-motion.md`, which *was* executed; the sequence is not
renumbered.) That file measured a **different** recording,
`public/design-ref/animation-ref/career-joblisting.webm`. Its findings are
re-derived independently below and mostly agree; where they differ, this file's
numbers are the ones to ship, and the disagreements are called out.

**`/job-listing/[slug]` is out of scope.** Prompt 30 bundled it in; the user's
request here names `/career` and the recording is `/careers` only. It stays
unanimated and gets its own prompt.

---

## Reference material read

| path | what it is |
| --- | --- |
| `~/Videos/Screencasts/career.webm` | 1263×569, VFR ≈60 fps, 750 frames, 21.5 s. Two `/careers` page loads with a scroll pass between them |
| `~/Pictures/Screenshots/Screenshot_20260806_210121.png` | the masthead `h1` circled in red |
| `app/_components/careers/sections.tsx`, `app/careers/page.tsx` | the target |
| `app/_components/motion/reveal.tsx`, `motion/register.ts` | the shared reveal, `DUR` / `EASE` |
| `app/_components/motion/footer-reveal.tsx` | the split-blur precedent that lives in `motion/` and is reachable from a non-`home/` route |
| `app/_components/home/hero-text.tsx` | the split-blur precedent, and the `clearProps: "filter,display"` reasoning |
| `app/globals.css` `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` | where every start state is authored |
| `prompts/30-careers-and-job-listing-reveals.md` | the unexecuted prior measurement, on a different recording |

---

## What `career.webm` measures

Frames extracted once with `-fps_mode passthrough` and indexed against the full
`pts_time` list, because the file is **variable frame rate** — a bare `-ss/-to`
extraction returns a different frame count from the matching `ffprobe` slice and
silently mis-times every reading. Frame numbers below are 1-based into that
750-frame set and are quoted only so the numbers can be re-derived.

The entrance analysed is the **second** load, frames 203–245 (t 4.358 – 5.171 s).

### It is the designer's build, not ours — geometry must not be read off it

Connected components at threshold 97 %:

| card | recording | our render at 1280 (`AGENTS.md`) |
| --- | --- | --- |
| card 1 (UX Designer) | `820×218+223` | `820×218` |
| **card 2 (Data Scientist)** | **`820×194+223`** | **`820×218`** |
| card 3 (Product Manager) | `820×218+223` | `820×218` |

**194 is the comp's number.** Ours is 218 because `--text-p1` / `--text-p2` are a
fixed 20 px, the drift already on file for `/careers`, `/journal` and every
article. So this recording is the **designer's own implementation at ~17 px body
type**, exactly as `career-joblisting.webm` was.

**Only timing, opacity, easing and travel transfer. No position, no box, no page
height from this recording is a target.** This is the check that stops a later
session "fixing" a deliberate, recorded deviation.

### The fade: `power3.out`, ≈0.5 s — the site's own constants

α read as `(bg − mean) / (bg − final)`, which is linear in opacity because
browsers composite in sRGB. Background sampled from a sky-only crop at the same
y band (`355x60+90+155` → **209.3**), and confirmed by the first painted frame
reading α = 0.00 against it.

Best fit over duration and onset, 38 samples:

| curve | masthead line 1 | masthead line 2 | job card 1 |
| --- | --- | --- | --- |
| power4.out | 0.67 s, SSE **0.0269** | 0.85 s, SSE **0.0145** | 0.82 s, SSE **0.0994** |
| **power3.out** | **0.53 s, SSE 0.0298** | 0.69 s, SSE 0.0184 | 0.65 s, SSE 0.1000 |
| expo.out | 0.98 s, 0.0365 | 1.16 s, 0.0210 | 1.19 s, 0.1278 |
| power2.out | 0.39 s, 0.0409 | 0.54 s, 0.0315 | 0.47 s, 0.1102 |
| linear | 0.28 s, **0.0909** | 0.40 s, 0.0924 | 0.29 s, 0.1826 |

**A decelerating curve beats linear by 3–5×, and `power3.out` at 0.53 s is
inside the winning band on every channel.** `power3.out` and `power4.out` cannot
be separated — they differ by 10 % of SSE on a trace with JPEG noise in it.

**Ship `DUR` and `EASE` from `register.ts` unchanged. Do not restate them and do
not refit them.** Say *"measurement cannot separate power3.out/0.53 from
power4.out/0.67; the site's constants sit inside the band"* if this is revisited
— never *"0.5 was measured"*.

### The masthead's two lines are one target — no per-line stagger

Fitted onsets: line 1 **4.418 s**, line 2 **4.384–4.418 s**. That is under two
frames apart, against `Reveal`'s 0.08 s = ~5 frames. The two lines fade
together.

### The list starts ≈0.14 s after the masthead

Fitted onsets: masthead **4.418**, job card 1 **4.557** → **Δ 0.139 s**. First
measurable departure gives 4.40 → 4.636, i.e. Δ 0.236, but the card's contrast
against the sky is 17 grey levels against the masthead's 44, so its onset is the
less sensitive of the two and the fitted value is the one to use.

Prompt 30, on the *other* recording, measured **0.167 s** by the same kind of
reading. Two independent recordings landing at 0.14 and 0.167 against a site
stagger of 0.08 is a good case for **two steps: `delay = 0.16`**. Ship that.

### The rise is much larger than `Reveal`'s 36 px — and its curve does not fit

Two independent, opacity-invariant measures:

- **Half-max row-profile top edge** of "Careers at": f208 **208.05** →
  settles **161.86**. Observed travel **46.2 px**, and f208 is already at α ≈ 0.10,
  so the true amplitude is larger.
- **Half-contrast top edge of job card 1** (a solid white block against the sky,
  the cleanest channel on the page): f217 **385.08** → settles **328.44**.
  Observed travel **56.6 px**.

Both corroborated by normalised row-profile cross-correlation (masthead ≈ +30 px
at f209, card ≈ +28 px at f221, both decaying to 0).

Free fits for amplitude, onset, duration and ease:

| channel | best | A | duration | rms |
| --- | --- | --- | --- | --- |
| masthead top edge | power3.out | 55 px | 0.76 s | 0.53 px |
| card 1 top edge | expo.out | 80 px | 1.00 s | 0.74 px |
| card 1 top edge | power4.out | 87 px | 0.81 s | 0.83 px |
| card 1 top edge | power3.out | 157 px | 0.83 s | 1.14 px |

**The rise and the fade are not on the same curve in this recording.** Holding
the fade's fitted `power3.out` / 0.53 s and solving for amplitude frame by frame
gives A = 44.7 → 46.3 → 58.2 → 72.5 → 229 across f210…f225 — it climbs
monotonically, i.e. the position is still moving long after the opacity has
landed. Prompt 30 hit the same runaway ("the free fit runs away to power5.out /
880 ms / 168 px").

**So the amplitude is not resolvable, but the floor is.** 46 px and 57 px are
*observed*, not extrapolated, so `Reveal`'s default 36 is definitely short.

**Ship `y={56}` on the masthead and `y={72}` on the job list**, and record them
as *judgements anchored on measured floors*, not as measurements:

- 56 is the masthead's 46 px observed floor with headroom toward the 55 px
  central fit; its mobile two-thirds is `Math.round(56 × 0.66) = 37`.
- 72 is the card's 57 px observed floor, sitting between the 65 and 87 px fits;
  mobile 48.
- Both are exact multiples of the site's 8 px rhythm, and neither introduces a
  new constant — `y` is an existing `Reveal` prop.

If the user prefers the site's uniform 36, that is one prop each and nothing else
changes. **Do not "improve" this by adding a second duration or a second ease to
`Reveal`** — the site has one reveal curve and a per-page fork is not worth it.

### There is no blur and no split in the recording

Five masthead crops stacked at α ≈ 0.13 / 0.24 / 0.51 / 0.75 / 1.0 and enlarged
300 % show **crisp glyph edges at every stage**, and every letter at the same α.
The type climbs upward through a fixed crop, which is the rise.

This matters twice. First, it confirms the rise is real rather than a blur
artefact: a symmetric blur pushes a half-max top edge *up*, and the measured edge
moves *down-to-up*, the opposite sign. Second, **the char split and the blur
below are the user's addition, not something the recording shows.** Record that
plainly.

### Nothing reveals on scroll, and there is no hover

- Sampled across both scroll passes: as each lower card's top edge enters the
  viewport its interior already reads `max = 255` in the bottom 30 px band, and
  connected components at threshold 97 % detects it on the first frame it
  appears. Cards 2, 3 and the open-application card are **fully opaque on
  entry** — in the designer's build the whole document reveals at load.
- The cursor crosses several cards during the passes with no measurable change.
  **No hover treatment.**
- No scrub, no pin, no parallax, no loop.

---

## The change

### 1. `motion/reveal.tsx` — widen the `as` union only

`as` gains `"h1"`. Inert, and the same widening prompt 24 made for `"h2"` and
prompt 30 made for `"table"`. Nothing else in the file changes — not `DUR`, not
`EASE`, not the built-in `stagger: 0.08`, not the reduce branch.

The `h1` itself does **not** become a `Reveal`; it becomes the split component
below. `"h1"` is widened because the split component takes the same shape and it
keeps the union honest if the masthead is ever reverted to a plain reveal.

*(If the implementation finds the union is not actually needed, drop this step
and say so — do not add a dead type.)*

### 2. `app/_components/motion/careers-masthead-text.tsx` — new client leaf

**It lives in `motion/`, not in `careers/` and never in `home/`.** `motion/` is
the shared surface; `home/hero-text.tsx` may not be imported from here, the
bundle rule `AGENTS.md` records. Keep the file **component-only** — a constant or
type exported from it and imported elsewhere drags GSAP and SplitText into that
page's bundle, the mistake that forced `PRINCIPLES` out into
`principles-data.tsx`.

Shape: `"use client"`, `children` as a prop, `className` taken over from the
`<h1>` being replaced **verbatim**, so **no box is added and no class string
changes**. One `useGSAP` with `{ scope: root }`, one `gsap.matchMedia()`, `mm.add(…, root)`,
`return () => mm.revert()`. `DUR` / `EASE` / `gsap` / `useGSAP` / `SplitText`
imported from `motion/register`.

The two authored `<span className="block">` line spans **stay exactly as they
are**. They are the comp's mixed-font line break and the reason each line box
sits at exactly the authored leading — `AGENTS.md`, "The masthead is two `block`
spans, not one `<br>`".

#### The split

```
type: "chars", smartWrap: true, tag: "span", aria: "auto" (default), autoSplit: true
```

- **`type: "chars"` is the user's explicit request** and it overrides the
  standing note in `AGENTS.md` that a chars split "would put ~90 blurred layers
  on screen at once and is out of scope; if per-character is ever wanted it needs
  its own measurement." **This is that measurement: the masthead is 20 glyphs**
  ("Careersat" 9 + "Aetherfield" 11, the space is not a char). 20 blurred layers
  is the same order as the footer's 12 words and the hero's 5, so the objection
  does not apply here. **Record the count and the reason — it is what makes
  chars affordable on this element and nowhere else.**
- **`smartWrap: true` is required.** The skill is explicit: splitting chars
  without words or lines lets the browser break mid-word. Without it "Aetherfield"
  can wrap between glyphs at a narrow viewport.
- **`tag: "span"`.** A `<div>` inside the authored `<span className="block">` is
  invalid markup — the same reason `hero-text.tsx` gives.
- **`aria` stays at its default `"auto"`**, which labels the split element and
  hides the pieces. **Verify it in the accessibility tree, not the markup**:
  `await page.locator("h1").ariaSnapshot()` must read
  `- heading "Careers at Aetherfield" [level=1]`. `page.accessibility.snapshot()`
  is gone from the cached `playwright-core`.
- **`autoSplit: true`, with the animation created inside and returned from
  `onSplit(self)`.** A tween created outside `onSplit` targets orphaned nodes
  after the first re-split. This is also what keeps the split off the fallback
  face while fonts load, and it is the reason **no `document.fonts.ready`
  promise is used**: a tween created in a promise callback is outside every gsap
  Context, and reaching for `contextSafe` to fix that is the documented
  `RangeError` crash. Everything is created synchronously inside the `mm.add`
  handler.

#### The split is reverted when the tween lands, and that is load-bearing

`onComplete: () => self.revert()` on the returned tween.

**The hero could get away with `clearProps: "filter,display"`; a chars split
cannot.** Splitting to words leaves word-internal kerning intact, so clearing
`display` puts the settled ink back on its original pixels. Splitting to
**characters** puts every glyph in its own inline box, which breaks every kerning
pair and rounds every advance to a whole pixel — "Careers at" is Newsreader, which
kerns. Left split, the settled masthead would **not** be the ink the comps were
measured against.

`self.revert()` restores the original text nodes, so the settled state is the
plain server markup: original kerning, original rasterisation, and no leftover
`aria-hidden` spans. `clearProps` is then unnecessary and must not be authored.

Two things the implementation must check rather than assume:

1. **Reverting from inside the tween's own `onComplete` must not throw** —
   `revert()` removes the elements the tween targeted. It runs after the tween
   has finished, and it is a GSAP callback so the creating context is active
   (`gsap-core.js:981`), which is exactly why **no `contextSafe` is needed**.
   Watch the console.
2. **The settled render must be pixel-identical.** `magick compare -metric AE
   -fuzz 5%` against a worktree build of the parent must be **0** at 375, 800 and
   1280. If it is not 0 on the masthead, the revert is not landing and the fix is
   the revert, not a nudge.

#### The tween

```
gsap.set(h1, { opacity: 1 })                    // the CSS start state hides the h1
gsap.set(self.chars, { display: "inline-block" })
gsap.from(self.chars, {
  opacity: 0,
  filter: `blur(${blur}px)`,
  y: <the masthead rise>,
  duration: DUR,
  ease: EASE,
  stagger: CHAR_STAGGER,
  onComplete: () => self.revert(),
})
```

- **`blur(0px)`, never `none`** — GSAP interpolates a filter numerically only
  between two `blur()` functions.
- **`gsap.from` is correct here and `fromTo` is not needed**, because the chars
  are fresh spans at their default opacity 1 — the trap `AGENTS.md` records
  ("`gsap.from` reads the element's *current* value as the tween's end value")
  bites only on an element `globals.css` is holding at 0, which is the `h1`, and
  the `h1` is lifted by the `gsap.set` above rather than tweened.
- **`display: inline-block` is required or the `y` will not render** on a span.
  It goes away with the revert.
- **Blur radius.** `display-careers-title` is **36 / 64 / 80 px** — the same curve
  as the article title, and the same range the hero spans. So reuse the hero's
  fitted pair rather than inventing one: **`BLUR = 12` at `lg`,
  `Math.round(12 × 0.66) = 8` below.** Say *"reused from the hero, which spans the
  same type sizes"*, not *"measured"*.
- **`CHAR_STAGGER = 0.03`.** A judgement, and the only new timing number in this
  file. 20 chars × 0.03 = 0.57 s of run, which sits alongside `DUR 0.5` for a
  total masthead beat of ~1.07 s — close to the footer's authored 1.0 s and
  comfortably inside the entrance the recording shows. The hero's 0.06 over 5
  words would run 1.2 s of stagger alone here and read as a crawl. **Say
  judgement if it is revisited.** Do not put it in `register.ts`; it is local to
  this element, as `STAGGER` is local to `hero-text.tsx`.
- **`stagger` runs across both lines in document order**, one continuous sweep
  left-to-right and top-to-bottom. `self.chars` from a single `SplitText.create`
  over both spans is already in that order. Do not create two instances.

#### Reduced motion

The branch **splits nothing at all** — no `SplitText.create`, no tween, no
listener — and only lands `gsap.set(h1, { opacity: 1 })`, exactly as
`hero-text.tsx` and `footer-reveal.tsx` do. Verify `childSpans === 0` on the
`h1`.

### 3. `app/globals.css` — one selector added

`[data-careers-split]` joins the existing
`@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` block,
**opacity only**, alongside `[data-hero-split]` and `[data-footer-split]`. No
start transform, for the reason `[data-journal-mark]` records: an invisible
start transform is still *parsed*, and a decomposed composite leaves properties
the tween never clears.

Confirm it survives Lightning CSS into `.next/static/chunks/*.css`. Do not assume.

### 4. `careers/sections.tsx` — two elements, no class string touched

- `CareersMasthead`'s `<h1>` is wrapped by / rendered as
  `CareersMastheadText` with the **identical class string** and
  `data-careers-split` on it. The two `<span className="block">` children are
  unchanged.
- `JobList`'s `<ul>` becomes `<Reveal as="ul" stagger delay={0.16} y={72}>` with
  the **identical class string**, and each `<li>` gains `data-reveal-item`.

  **One staggered trigger over the list, not one `Reveal` per card.** `/journal`
  uses per-card triggers because its grid is ~3000 px tall and a single trigger
  would run four cards far below the fold. The careers list is ~900 px at 1280
  and the recording reveals all four together at load, so one trigger at
  `Reveal`'s default `start: "top 88%"` — which fires at load at every breakpoint,
  the list top being y ≈ 216–332 — is both simpler and closer to the source.

- **`CareersMasthead` gets no `immediate` prop because it is not a `Reveal`** —
  the split leaf has no ScrollTrigger at all and plays on load. That is right:
  the masthead is above the fold at 375, 800 and 1280, the call `JournalStamp`
  and the hero both make.

- **The section file stays a server component.** `children` arrive as a prop.
  Do not add `"use client"` to `careers/sections.tsx`.

- `app/careers/page.tsx` is **unchanged**.

---

## Expected impact, and what to verify

- **`/careers` is the only route whose prerendered HTML may change.** Its diffs
  must be exactly: `data-careers-split` on the `h1`, `data-reveal` /
  `data-reveal-item` on the list and its four `li`, the two client-reference
  `<script>`s, and chunk/build-id renames. **Every class string is carried over
  verbatim, so there must be no other markup diff.**
- **The other 15 pages must be byte-identical** once the build id and the CSS
  **and JS** chunk names are normalised — `/`, `/journal`, `/about`,
  `/design-system`, all six articles, all three job listings, `_not-found`,
  `_global-error`. No class string changes anywhere, so there should be **no RSC
  flight-payload re-segmentation to see through**; if a page differs, strip the
  flight scripts and find out why rather than waving it off.
- **Chunk bytes, not chunk count.** GSAP already reaches every route through the
  footer, so the marginal cost here is the `Reveal` and the new leaf only.
  `/careers` will likely go 9 → 10 chunks the way `/journal` and `/about` did;
  that count says nothing. Diff the byte totals against a worktree build of the
  parent, as prompts 24 and 30 do.
- **`AE` at 5 % fuzz must be `0`** in the settled state at 375 / 800 / 1280
  against a worktree build of the parent. **Report it scoped, never bare** —
  `AGENTS.md` already warns that `/careers` carries the open-application card's
  marching dashes, so mask that card's box in both renders, compare the
  remainder (must be **0**), and score the box separately (expect a few hundred,
  the dashes at a different loop phase).
- **Settle for at least 6 s before the `fullPage` shot** and wait on
  `document.fonts.ready` **before** the scroll pass, not just after — the
  footer's split blur-in is authored at 3.02 s and `autoSplit` re-splits on font
  load. Assert every `footer [data-footer-split]` reads `opacity: 1` before
  shooting.
- **Page heights must be unchanged**: `/careers` **1895 / 1770 / 1925** at
  375 / 800 / 1280, and the card boxes must match the recorded list — dashed card
  `335×224+20+1200` / `760×170+20+1001` / `820×170+230+1036`.
- **Accessibility**: `h1` `ariaSnapshot()` reads
  `- heading "Careers at Aetherfield" [level=1]` during the split *and* after the
  revert.
- **Reduced motion**: nothing splits (`childSpans === 0`), the `h1` and all four
  `li` at `opacity: 1`. Note `Reveal`'s reduce branch is
  `gsap.set(targets, { opacity: 1, y: 0 })`, which **does** write an inline
  transform — pre-existing shared behaviour, verified on `/journal` in prompt 30.
  Do not report it as a regression and do not "fix" it here.
- **JavaScript off**: masthead and all four cards at `opacity: 1` at their normal
  boxes; the `scripting: enabled` gate never applies. The dashed frame's CSS
  march still runs, as prompt 31 records.
- **Four `/careers` ⇄ `/` and `/careers` ⇄ `/journal` round trips, each with a
  full scroll pass: zero page errors and zero console errors.** This is the
  `contextSafe` crash class, and the `self.revert()` in `onComplete` is new
  lifecycle surface — it is the specific thing these round trips are testing.

---

## Non-goals

- **`/job-listing/[slug]` is not touched.** Prompt 30 drafted it; the user's
  request names `/career` and the recording covers `/careers` only.
- **No geometry, type, spacing, colour or asset change.** The card heights, the
  `--text-p1` / `--text-p2` 20 px floor, the masthead's fitted
  `pt-[66px] sm:pt-[89px] lg:pt-[88px]` and the 120 px foot are all already-
  recorded, comp-measured decisions and none of them is chased.
- **The dashed frame's marching CSS animation is untouched** — prompt 31, still
  outside the `scripting: enabled` block, still gated on reduced motion alone.
- **The footer keeps its split blur-in** and `chrome.tsx` is not edited.
- **No scroll-triggered reveal below the fold, no hover, no scrub, no pin, no
  parallax, no loop.** The capabilities cloth stays the site's only scroll-linked
  element.
- **No change to `DUR`, `EASE` or `Reveal`'s `stagger: 0.08`.** `CHAR_STAGGER`
  is local to the new leaf and does not go into `register.ts`.
- **`cards.tsx` / `JobCard` is not touched.** It is shared with
  `/design-system`.
- **Nothing outside `home/` may import `home/sections.tsx` or any `home/` client
  module** — including `home/hero-text.tsx`. The new leaf lives in `motion/`.

---

## Checks to run

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output.
Then the production build on a free port (check 3000/3001/3002 first, and
confirm the served CSS chunk matches the build just made) for every measurement
above.

## What to record in `AGENTS.md` afterwards

A new section under the motion material:

- **`career.webm` is the designer's build** — card 2 at 194 against our 218 — so
  only timing, opacity, easing and travel transfer. Put this first; it is what
  stops a later session fitting geometry to it.
- The fade fit table, and the sentence *"measurement cannot separate power3.out /
  0.53 s from power4.out / 0.67 s; the site's `DUR`/`EASE` sit inside the band"*.
- The 0.139 s masthead → list onset gap, and that prompt 30's independent 0.167 s
  on a different recording is what makes `delay={0.16}` two steps rather than one.
- **The rise: 46.2 px and 56.6 px observed floors, and that no single power curve
  fits amplitude, onset and duration together** (the runaway table). `y={56}` /
  `y={72}` are judgements anchored on those floors, not measurements.
- **No blur and no split in the recording** — the crisp-edge check at five α
  levels — and that the chars split and the blur are the user's explicit
  addition, in the same spirit as the seal's offsets and the 20 % speed-up.
- **The 20-glyph count is what makes a chars split affordable**, and the standing
  "chars is out of scope" note in `AGENTS.md` is superseded **for this element
  only**.
- **`self.revert()` in `onComplete`, and why `clearProps` cannot do the job for a
  chars split** — kerning pairs and per-glyph advance rounding, against the hero's
  words split where clearing `display` was enough. Include the measured settled
  `AE`.
- `smartWrap: true`, and why chars-only needs it.
- The measured impact table, the scoped `AE` (masked dashed card vs the box), the
  chunk byte diff, and the reduced-motion / JS-off results.
- Add to section 3 (Automation) anything mechanical that had to be worked out
  here — the VFR frame-indexing trap is the strongest candidate: **extract every
  frame once with `-fps_mode passthrough` and index against the full `pts_time`
  list; a `-ss/-to` slice returns a different frame count from the matching
  `ffprobe` window on a VFR capture and silently mis-times every reading.**
  Also worth adding: **the half-max row-profile / half-contrast edge crossing as
  the opacity-invariant way to measure a rise on a page that is *not* scrolling**,
  which is cleaner than the ink centroid — the centroid over a two-line heading
  is confounded, because at low α the heavier line dominates and the centroid
  moves for reasons that are not travel.

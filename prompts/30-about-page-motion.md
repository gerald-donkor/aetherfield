# 30 — Motion on `/about`

## Scope, and why it is next

`/about` is the last content route with no motion of its own. `/` (prompts
17–23, 26), `/journal` and the footer (prompt 24) and the article cards
(prompts 24, 27) are all animated; `/about` currently inherits only the
site-wide footer reveal. The user asked for it directly, pointing at
`public/design-ref/animation-ref/about.webm`.

The work is **`Reveal` placement plus one inert prop-union widening**. No new
motion component, no new timing constant, no `globals.css` rule, no geometry
change, no asset.

## Reference material read

- `public/design-ref/animation-ref/about.webm` — 1264×573, 20.517 s, one
  continuous scroll pass down `/about`, recorded on localhost (the "Spectacle
  is Recording" badge is in the first ~1.5 s).
- `app/about/page.tsx`, `app/_components/about/sections.tsx`
- `app/_components/motion/reveal.tsx`, `app/_components/motion/register.ts`
- `app/_components/journal/sections.tsx` and `app/journal/page.tsx` — the
  precedent for wrapping a server section's children without adding a box.

### The recording is NOT a capture of our build — this is load-bearing

Connected components on the settled values row (t = 8.667) gives the three
cards as **`398x247+19+133`, `397x246+433+134`, `398x246+846+134`**. Our build
renders them **276 tall** — the 48 px icon-box deviation already recorded in
`AGENTS.md` ("The 48px icon… makes the cards 30px taller than the comp's 246").
So the recording is a **different implementation** of the same comps, one that
matches the comp's card height where ours deliberately does not.

**Consequence: read this recording for motion only.** Every geometry, type and
wrap difference against it is out of scope and must not be "fixed" — see
Non-goals.

Unlike `journal.webm` (prompt 24), which contained no animation at all, this
recording **does** carry authored motion, and it was measured rather than
eyeballed.

## What the recording actually shows

### The vocabulary is the site's own: opacity 0→1 plus a rise

Measured with an **ink-weighted centroid**, which is opacity-invariant (opacity
scales every weight uniformly, so the centroid does not move as an element
fades) and therefore separates a rise from the page's own scrolling. The
reference landmark is a neighbouring element that has already settled.

| block | channel | rise | window |
| --- | --- | --- | --- |
| values card 1 | icon centroid − "Our values" centroid | 152.1 → 117.9 = **34.2 px** | t 7.90 → ~8.45 |
| team table | first-row centroid − "Meet the team" centroid | 192.9 → 160.5 = **32.4 px** | t 12.00 → 12.40 |

32–34 px against `Reveal`'s authored **36 px** desktop rise. Opacity runs 0→1
over the same window (values card icon ink mass 5 222 → 94 000; founder title
ink mass 210 011 → 974 400).

### There is no sibling stagger — and that *is* a departure

The three values cards' rise is identical **to within 0.7 px at every frame**:

```
h014  c1 144.3  c2 144.2  c3 144.6
h019  c1 131.3  c2 131.2  c3 130.5
h024  c1 121.9  c2 121.7  c3 121.1
h030  c1 117.9  c2 117.7  c3 117.1
```

At the measured rise rate (~72 px/s mid-tween) 0.7 px is **under 10 ms**.
`Reveal`'s `stagger` prop puts **0.08 s** between siblings. So the values grid
must be **one plain `<Reveal>`, not `<Reveal stagger>`.**

### Blocks trigger separately, in place of one section trigger

"Our values" fades in at t ≈ 6.95–7.15 (visibly grey at the viewport foot, then
black); its cards do not start until **t ≈ 7.90**. A ~0.75 s gap on a
continuous scroll — i.e. two independent triggers, not one section tween with a
stagger. Same shape on the team block: "Meet the team" is fully settled by
t = 11.3 while the table starts at t ≈ 12.0.

### The founder text is one group, not three staggered lines

Eyebrow, title and prose share the same α at every frame — 0.247/0.244,
0.455/0.431, 0.627/0.606, 0.710/0.688, 0.773/0.769 (title/eyebrow) — and their
mutual gaps are constant throughout (eyebrow→title **36–37 px**, title→prose
**107 px**). One target, one tween.

### Duration and ease — the honest band

Fitting `power3.out` frame by frame and solving for `D`:

| channel | fitted `D` |
| --- | --- |
| values-card rise (centroid, opacity-invariant) | 0.60 – 0.75 s |
| founder title opacity (ink mass) | 0.40 – 0.74 s, drifting |
| team-table rise | ~0.45 s |

**The fit drifts in every ease tried** (`power2/3/4.out`, `expo.out`), so the
recording does not resolve `D` better than **0.5–0.7 s, strongly
decelerating**. The site's existing `DUR = 0.5` / `EASE = "power3.out"` /
`y = 36` sits inside that band on all three channels.

**So: reuse `DUR`, `EASE` and the default rise from `register.ts`. Do not
author a new timing constant on this page, and do not restate `DUR`/`EASE`.**
If this is ever revisited, the drift table above is the evidence — say
"measurement could not separate 0.5 from 0.7", not "0.5 was measured".

### What is NOT animated in the reference

- **The footer.** The wordmark is fully solid the instant it crosses the fold
  (sampled t = 15.6–16.8 at 20 fps). Ours ships the split blur-in from prompt
  24, site-wide via `chrome.tsx`. **That stays** — see Non-goals.
- **The hero, on load.** The load beat (t = 3.2–5.2 at 20 fps) is progressive
  SSR paint plus a font swap (the mission headline renders in a serif fallback
  for ~100 ms, then Archivo), with no readable fade on anything. The recording
  **cannot resolve** whether the hero animates.
- **The portrait and seal.** They enter from the foot of the viewport and are at
  full opacity within ~2 frames of becoming measurable (blue-band mean stable at
  241/246/251 from t = 8.80 onward). Their own reveal could not be isolated.

## What to build

All of it in `app/_components/about/sections.tsx` and `app/about/page.tsx`.
`about/sections.tsx` **stays a server component** — `children` arrive as a prop,
so its `next/image` never reaches the client bundle, the discipline
`journal/sections.tsx` already follows.

1. **`Reveal`'s `as` union gains `"table"`** (`motion/reveal.tsx`). One word,
   inert — the same kind of change `"h2"` was for `/journal`. It is what lets
   the team table animate **without a wrapper box**.

2. **`AboutHero`** — the existing `<section>` becomes
   `<Reveal as="section" immediate className="-mt-[60px] lg:flex lg:items-center">`.
   Above the fold at every breakpoint, so `immediate`, the call `/`'s hero and
   `/journal`'s stamp both make.
   **This is a judgement, not a measurement** — record it as such. The sky band
   is a document-level sibling in `page.tsx` and is *not* wrapped, so it paints
   immediately, as the recording shows.

3. **`Values`** — two independent `Reveal`s, matching the measured ~0.75 s gap:
   - `<Reveal as="h2" className="display-fluid-h4 text-center font-sans font-bold">`
   - `<Reveal as="ul" className="mt-8 grid gap-4 md:mt-10 lg:grid-cols-3">`
   **No `stagger` prop on either** — see the lockstep measurement above.

4. **`FounderStory`** — two `Reveal`s inside the existing grid:
   - the portrait column `<div className="relative">` → `<Reveal className="relative">`
   - the prose column `<div className="mt-6 md:mt-0 lg:max-w-[400px]">` →
     `<Reveal className="mt-6 md:mt-0 lg:max-w-[400px]">`, one target for
     eyebrow + title + prose, as measured.

5. **`TeamTable`** —
   - `<Reveal as="h2" className="display-band-h2 font-sans font-bold">`
   - `<Reveal as="table" className="mt-7 w-full text-left md:mt-[52px]">`

6. **`CtaBand`** — wrapped **at the call site in `app/about/page.tsx`**, exactly
   as `app/page.tsx` and `app/journal/page.tsx` do it. **`chrome.tsx` is not
   edited.**

`start` stays `Reveal`'s default `"top 88%"` everywhere. **Known deviation,
recorded not chased:** the reference's elements begin fading at roughly 95–97 %
of viewport height (its "Our values" is already grey at the viewport foot), i.e.
its trigger sits ~50 px lower at this 573 px viewport. Matching it would fork
the site's one trigger constant for a single page.

No `globals.css` change is needed — `[data-reveal] { opacity: 0 }` inside the
existing `(scripting: enabled) and (prefers-reduced-motion: no-preference)`
block already covers every target here. **Confirm that in the built chunk
rather than assuming it.**

## Measurements the implementation must hit

Production build, `375 / 800 / 1280`, against a worktree build of the parent
commit (`git worktree add ../aetherfield-base HEAD; cp -al node_modules …`).

- **Page heights unchanged** at all three breakpoints. Record the numbers.
- **`magick compare -metric AE -fuzz 5%` = 0** on `/about` in the settled state
  at all three. `/about` has no scrubbed element, so a bare page-wide `AE` is
  the right instrument here — unlike `/` and `/journal`.
  Follow the screenshot procedure in `AGENTS.md` §3: `document.fonts.ready`,
  2 s settle, 400 px scroll steps, **≥6 s** settle at the footer, back to 0,
  then the `fullPage` shot. Assert every `footer [data-footer-split]` reads
  `opacity: 1` before shooting.
- **Prerendered HTML**: `/about` is the **only** route whose markup changes, and
  its only diffs must be the `data-reveal` attributes, the `Reveal` client
  references and chunk/build-id renames. The other 15 pages byte-identical once
  the build id and the CSS **and JS** chunk names are normalised. Use the
  scratchpad build-diff helper; the CSS chunk name is `[A-Za-z0-9_-]+`, not hex.
- **Chunk set**: `/about` is expected to go **9 → 10** chunks, the same way
  `/journal` did when it took `Reveal` in prompt 24. GSAP is already in the
  shared chunk site-wide, so the delta must be small — **diff the chunk bytes,
  not the list length**, and record raw and gzipped totals. Every other route
  must keep its exact chunk set.
- **Reveal behaviour**, probed in the render at 1280:
  - at scroll 0, the values cards, founder blocks, team heading/table and
    `CtaBand` all read `opacity: 0`; the hero reads `opacity: 1` (it is
    `immediate`).
  - scrolled to the values row, all three cards' `getBoundingClientRect().top`
    must be **equal to within 1 px** mid-tween — the lockstep property. This is
    the one measurement that distinguishes this page from `<Reveal stagger>`.
  - after a full pass, **0 of N reveal targets** below full opacity.
- **Reduced motion** (`prefers-reduced-motion: reduce`): every target at
  `opacity: 1`, **no inline transform written**, page at rest.
- **JavaScript off**: page renders exactly as the server sent it; the
  `scripting: enabled` gate never applies.
- **Navigation**: four `/about` ⇄ `/` and `/about` ⇄ `/journal` round trips,
  each with a full scroll pass, **zero page errors and zero console errors** —
  the `contextSafe` `RangeError` class from prompts 25/26. `Reveal` contains no
  `contextSafe` and none may be added.

## Non-goals

- **No geometry, type, spacing or asset change.** The reference is a different
  implementation (cards 246 tall against our 276) and every such difference is
  already recorded in `AGENTS.md` under "About page". Do not chase the card
  height, the `display-band-h2` sizing, the `CtaBand` padding or the mobile
  length.
- **The footer keeps its split blur-in.** The reference has no footer motion;
  ours was shipped deliberately in prompt 24 at the user's explicit request and
  reaches every route via `chrome.tsx`. Do not remove or wrap it.
- **`chrome.tsx` is not edited** — `CtaBand` is wrapped at the call site.
- **No stagger, no scrub, no pin, no parallax, no loop, no hover.** The
  capabilities cloth stays the site's only scroll-linked element.
- **No new timing constant.** `DUR` and `EASE` come from `register.ts`.
- **`AetherfieldSeal` is not given motion of its own.** Its reveal could not be
  isolated in the recording; it rides the portrait column's `Reveal`.
- **`primitives.tsx`, `cards.tsx` and `home/` are untouched.**

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Report exact output; do not claim a check passed without running it.

## To record in `AGENTS.md` afterwards

A new subsection under the `/about` material (and a pointer from "Site motion"):

- that `about.webm` **does** contain motion, unlike `journal.webm` — and the
  connected-components evidence that it is **not our build**, so no later
  session re-derives it or "fixes" the card height to it;
- the centroid method for separating a rise from page scroll, added to §3
  Automation if it is not already general enough there;
- the two rise measurements (34.2 px / 32.4 px), the lockstep table proving
  **no stagger**, and the ~0.75 s heading→content gap proving separate triggers;
- the `D` drift table and the explicit statement that 0.5–0.7 s could not be
  separated, so `DUR`/`EASE` were reused rather than refitted;
- the trigger-start deviation (reference ~95–97 %, ours `top 88%`) as recorded,
  not chased;
- that the hero's `immediate` is a **judgement** the recording could not
  resolve, and why;
- the `as="table"` union widening, and that it exists to avoid a wrapper box;
- the impact numbers: page heights, `AE`, the chunk-byte delta, which routes'
  HTML changed.

## SKILLS USED

- **gsap-react** — `useGSAP` scoping and cleanup semantics for the `Reveal`
  instances added here; confirming no `contextSafe` is warranted.
- **gsap-scrolltrigger** — `start` / `once` semantics for the per-block
  triggers, and confirming separate triggers behave as measured.
- **gsap-core** — `gsap.matchMedia()` named conditions and the reduced-motion
  branch that `Reveal` already implements.
- **tailwind-4-docs** — only if a class string ends up changing; verify any
  emitted property against the **built** stylesheet, never from memory.

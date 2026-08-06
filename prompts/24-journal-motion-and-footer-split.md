# 24 — `/journal` scroll motion, article-image hover zoom, and the footer's split blur-in

## Scope, and why it is next

Three pieces, from one request:

1. **`/journal` gets the site's scroll-reveal vocabulary.** It is the last
   content-heavy route with no motion at all; `/` has been animated since
   prompt 17 and the journal index is the page the user is reading next.
2. **Article card images zoom on hover.** `ArticleCardStacked` is the one
   shared card AGENTS.md explicitly left alone twice ("cards.tsx was
   deliberately left alone… extending this treatment to them is a separate
   decision"). **The user is now taking that decision**, so the exception is
   closed.
3. **The footer's text splits and blurs in, on every page.** This is a
   deliberate override of the "no GSAP leak" invariant — see *Bundle cost*
   below. The user was asked and chose site-wide explicitly.

**Another agent is working in this tree** (`app/_components/home/capability-visual.tsx`
is modified and `prompts/23-cloth-fall-amplitude-and-speed.md` is untracked).
**Do not touch any file under `app/_components/home/`.** `app/globals.css` is
the one file both changes could plausibly reach: re-read it immediately before
editing and **append** the new rules to the existing start-state block rather
than rewriting it.

## Reference material read for this

- `public/design-ref/animation-ref/journal.webm` — 1263×571, ~50 s, a scroll
  pass down `/journal` at desktop.
  **Finding, and it changes the brief: this recording contains no animation.**
  Sampled at 1 fps across the whole pass and at 12 fps across the two entry
  beats (t≈10–14 s, the article grid; t≈26.5–31 s, the CTA band and footer),
  every element is fully opaque and at its final position the instant it
  crosses the fold. It is a walkthrough of the *current, unanimated* page
  recorded on `localhost:3000` (the "Spectacle is Recording" badge is in frame
  1–4), not a designer's prototype.
  **So there is nothing here to fit against, and none of the numbers below are
  claimed to come from it.** The reveal timings are the site's existing
  `DUR` / `EASE` / stagger, unchanged. Do not attempt to fit a curve to this
  file — record in AGENTS.md that it does not constrain anything, so a later
  session does not re-do this sampling.
- `~/Pictures/Screenshots/Screenshot_20260806_091438.png` — `/journal`'s
  "Latest articles" grid with the cursor on the second card (its title
  underlined, the status bar showing
  `localhost:3000/article/sustainability-isnt-a-side-project-making-impact-operational`).
  The circled element is the card **image**. Ask: *"Zoom in all the article
  images on hover in a beautifully animated way."*
- `~/Pictures/Screenshots/Screenshot_20260806_091723.png` — the footer, showing
  exactly three pieces of type: the nav row (`Product Journal About Careers Get
  started`), the `© 2025 · All rights reserved` line, and the oversized
  wordmark. Ask: *"Animate the texts on the footer in a splittext and nicely
  blurred fashion, do not make the animation speed for that fast."*
- Source files: `app/journal/page.tsx`, `app/_components/journal/sections.tsx`,
  `app/_components/cards.tsx`, `app/_components/chrome.tsx`,
  `app/_components/motion/reveal.tsx`, `app/_components/motion/register.ts`,
  `app/globals.css`.

## Two answered decisions — do not revisit them

- **Footer motion is site-wide**, inside `SiteFooter`. The alternative (an
  opt-in wrapper rendered on `/journal` only, keeping 15 routes GSAP-free) was
  offered and declined: *"Make reflect on every page."*
- **The wordmark blurs in as one piece.** AGENTS.md records that SplitText does
  not support SVG `<text>`, and the wordmark's `textLength="1013"` from
  `x="-1.6"` is the measured thing that holds it flush to both gutters at any
  viewport. **The SVG is not to be split, re-authored, or re-measured.** It
  takes the same blur + fade + rise as a single element.

---

## 1. `/journal` scroll reveals

Use the existing `Reveal` (`app/_components/motion/reveal.tsx`) as-is. **Do not
add a new motion component and do not restate `DUR` or `EASE`** — import them
from `register.ts` if any timing is needed at all.

- `JournalStamp`'s wrapper → `<Reveal immediate className="relative aspect-[1240/480] w-full">`.
  It is above the fold at scroll 0 on every breakpoint, so it plays on load,
  the same call the hero makes.
- `LatestArticles`' `<h2>` → its own `<Reveal>` (default `start: "top 88%"`).
- **Each card gets its own `Reveal`, not one `stagger` over the section.** The
  section is ~3000 px tall at 1280, so a single `stagger` trigger at `top 88%`
  would run all six cards while four of them are still far below the fold.
  Wrap each grid cell: `<Reveal key={…} delay={i % 2 === 1 ? 0.08 : 0}>`, which
  reproduces the section stagger *within a row* while each row still waits for
  its own trigger.
  The `Reveal` `div` becomes the grid item and the `<article>` sits inside it
  as a plain block — **this must not move a pixel**; verify with the AE check
  below.
- `CtaBand` → wrapped **at the call site in `app/journal/page.tsx`**, exactly
  as `app/page.tsx` does it. `chrome.tsx`'s `CtaBand` is not edited.

`journal/sections.tsx` **must stay a server component** — `children` arrive as
a prop, so its `next/image` never reaches the client bundle. Do not add
`"use client"` to it.

## 2. The article-image hover zoom

One change, in `ArticleCardStacked` (`app/_components/cards.tsx`). It feeds
`/journal`, the `/article/[slug]` recent-articles band and `/design-system`;
"all the article images" is read as all three, and that is the whole point of
changing the shared component.

- Wrap the `<Image>` in `<span className="block overflow-hidden">` to clip
  against — the same device the homepage journal thumbnails already use.
- On the image:
  `transition-[scale] duration-500 ease-in-out group-hover:scale-105 motion-reduce:transition-none`.

Three things that are decided, with reasons:

- **`ease-in-out` at `duration-500`, not Tailwind's default.** The curve is the
  one already *measured* off `home-journals.webm` for these rows (linear and
  `ease-in-out` tied at the top of the fit; Tailwind's `ease-out` was the worst
  of five). The **duration is a judgement, not a measurement**: the homepage
  thumbnails run 300 ms across a 164 px box, and this box is 612×356 at
  desktop — the same 300 ms over ~4× the travel reads snappy rather than
  "beautifully animated". 500 ms is the deliberate choice; say so in AGENTS.md
  rather than implying it was fitted.
- **`scale-105`, not the thumbnails' `scale-110`.** 10 % of a 612 px image is
  61 px of edge travel against 16 px on the thumbnail. 5 % lands at ~31 px,
  closer to the thumbnail's perceived movement.
- **`transition-[scale]`, never `transition-[transform]`.** Tailwind v4 emits
  `scale-105` as the independent `scale` property — the mechanic AGENTS.md
  already records for `translate-x-2.5` and `scale-110`. **Confirm it in the
  built stylesheet, not from memory.** v4 also wraps `group-hover:` in
  `@media (hover:hover)` for free, so no touch guard is authored.
- **No grayscale.** The homepage rows fade and desaturate because that
  treatment was measured off a recording; nothing here covers it, and the ask
  is a zoom.
- The `group` class only exists on the `<Link>`, so on the hrefless
  `/design-system` sample the hover class is inert and that page is unchanged
  apart from the wrapping `<span>`.

## 3. The footer's split blur-in

New client leaf **`app/_components/motion/footer-reveal.tsx`**, imported by
`chrome.tsx` (already `"use client"`). Keep it **component-only** — a constant
or type exported from here and imported elsewhere is the mistake that forced
`PRINCIPLES` out into `principles-data.tsx`.

Markup changes in `SiteFooter`, all inert attributes — **no geometry, class
string, or element may change**; the footer is settled:

- `data-footer-split` on the `<nav>` and on the `© 2025` `<p>`.
- `data-footer-wordmark` on the wordmark `<svg>`.
- The footer's contents get wrapped by `<FooterMotion>` (or `FooterMotion`
  renders inside `<footer>` and takes them as `children`) — whichever adds **no
  box**; take the existing element over via `className`, the device `Reveal`
  and `HeroText` both use.

The tween:

- `SplitText` with **`type: "words"`** on both `[data-footer-split]` elements —
  6 words in the nav, 5 in the © line, so **11 blurred layers**, inside the
  single-digit-ish budget the hero split's note sets. **Not `chars`**: that is
  ~60 simultaneously blurred layers, and an animated `filter: blur()` repaints
  every target's layer every frame.
- `autoSplit: true`, the animation created **inside and returned from**
  `onSplit(self)` so it survives font load and resize; `aria` left at its
  default `"auto"`. Both are load-bearing for the same reasons the hero's split
  records.
- `from { opacity: 0, filter: "blur(10px)", y: 16 }` → `blur(0px)`. **`blur(0px)`,
  never `none`** — GSAP interpolates a filter only between two `blur()`
  functions.
- **Slow, per the ask.** `FOOTER_DUR = 1.0` and `stagger: 0.12` — roughly
  double the site's `DUR 0.5` / `0.08`. Author them in the leaf as named
  constants with a comment saying they are a deliberate departure from
  `register.ts`'s vocabulary at the user's request; **still import `EASE`**, do
  not restate the curve.
- The **wordmark** is one target: `opacity 0 → 1`, `blur(16px) → blur(0px)`,
  `y 24 → 0`, `duration: FOOTER_DUR * 1.2`, starting after the split lines
  (a timeline position of about `-=0.5`, i.e. overlapping rather than queued —
  end-to-end sequencing would run the footer past ~2.5 s).
- `ScrollTrigger` `{ trigger: root, start: "top 88%", once: true }` — the
  site's default. Verify it actually fires at the bottom of a short page as
  well as a long one; `/journal` and `/design-system` are the two extremes.
- `clearProps: "filter"` only. **It may never touch `opacity` or `transform`** —
  that hands the element back to the CSS start state and it vanishes.
- `gsap.matchMedia()` with the named `reduceMotion` / `fullMotion` pair; the
  reduce branch **splits nothing**, sets `opacity: 1` on the three elements and
  returns. `mm.revert()` as cleanup, `useGSAP(fn, { scope: root })`.
- **No `contextSafe`.** Everything here is created synchronously inside the
  `mm.add` handler, and wrapping that is the exact bug that crashed `/` on
  navigation (`Context.getTweens` stack overflow, AGENTS.md's `contextSafe`
  note).

Start state, appended to the existing
`@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` block
in `globals.css`:

```css
[data-footer-split], [data-footer-wordmark] { opacity: 0; }
```

Opacity only, on the unsplit elements — the split nodes do not exist when the
stylesheet is parsed, and an authored transform would decompose into a spurious
component the tween never clears (the `[data-journal-mark]` lesson).

### Bundle cost — the deliberate override

`chrome.tsx` reaches every route, so **every page's prerendered HTML will gain
the GSAP `<script>`** and the chunk count for the 15 non-homepage routes goes
from 9 to 10. AGENTS.md currently records "no GSAP leak" as an invariant and
several past changes were shaped by it. **The user chose this explicitly.**

The implementation must therefore:

- **measure and report the actual cost** — the chunk list per page before and
  after (`grep -o '/_next/static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/<page>.html | sort -u`),
  and the delivered JS weight of the added chunk;
- **rewrite the invariant in AGENTS.md** rather than leaving the old claim
  standing. The rule that survives is narrower and still worth keeping:
  *nothing outside `home/` may import `home/sections.tsx` or any `home/` client
  module* — the leaf-import discipline stays, only the footer is exempt.

## Expected impact

- **Every route's prerendered HTML changes.** Expected diffs are exactly: the
  three footer data attributes, the `FooterMotion` client reference, the
  `<span>` wrapper around each `ArticleCardStacked` image plus its class
  string, and the chunk/build-id renames. **Enumerate them and confirm nothing
  else moved** with the scratchpad build-diff helper — normalise the build id
  and the CSS chunk name with `[A-Za-z0-9_-]+` (it is not hex), and scan the
  common prefix/suffix instead of running `SequenceMatcher` over a 200 KB
  single-line page.
- **`/` must be pixel-identical in its settled state** at 375 / 800 / 1280,
  with the caveat AGENTS.md already records: the capabilities cloth is
  scroll-linked, so mask that box in both renders and compare the remainder,
  and report the two numbers separately. Never a bare page-wide AE.
  **The baseline for `/` is the last commit, not the working tree** — the other
  agent's uncommitted cloth edit is not part of this change. Build the parent
  in a sibling worktree with hard-linked `node_modules`.
- **`/journal`, `/article/[slug]` and `/design-system` must be pixel-identical
  in their settled state** at all three breakpoints (`-metric AE` = 0 at 5 %
  fuzz). The card image wrapper and the `Reveal` grid-item divs are the risk;
  if AE is not 0, the wrapper changed layout and must be fixed, not recorded.
- Page heights on `/journal` unchanged at all three breakpoints.

## Non-goals

- **No change to the footer's geometry, type, colours, texture band or
  wordmark drawing.** It is settled; this adds motion to it and nothing else.
- **No per-letter SVG wordmark**, for the `textLength` reason above.
- No scrub, pin, parallax, or `ScrollSmoother` anywhere in this work. The
  capabilities section's scrubbed cloth stays the site's only scroll-linked
  element.
- **No file under `app/_components/home/` is touched**, and no homepage timing
  is changed — another agent is mid-flight there.
- `ArticleCardHorizontal` and `ArticleCardCompact` are left alone; no comp or
  screenshot covers them.
- The footer's `href="#"` links stay `#`. Wiring them is the separate decision
  AGENTS.md already records.
- No new design tokens, no `magick`, no new imagery.

## Checks to run

- `npm run lint`, `npm run typecheck`, `npm run build` — report exact output.
- Production render at 375 / 800 / 1280 on a **free port** (`npx next start -p 3001`;
  check port 3000 first, the user's dev server may be up), `deviceScaleFactor: 1`,
  `fullPage: true`, screenshotting the **settled** state (step the scroll down
  400 px at a time to fire every reveal, return to 0, wait, then shoot).
- Probe, in the render:
  - `/journal` — stamp plays on load; each card's `Reveal` fires on its own
    trigger (confirm a card below the fold still reads `opacity: 0` after the
    heading has landed); CtaBand reveals.
  - hover a card image at each breakpoint — `scale: none` → `1.05` → back to
    `none`, with an intermediate value mid-transition and **no layout shift**.
  - footer — nav and © line split into words, both blur from 10 px, wordmark
    from 16 px; the whole footer sequence measured end to end (report the ms).
  - **reduced motion**: nothing splits (`childSpans === 0` on all three
    elements), every footer element at `opacity: 1`, card hover instant.
  - **JavaScript disabled**: footer fully visible, page at rest as the server
    sent it.
  - `/journal`'s `<h2>`/footer accessibility — `await page.locator("footer nav").ariaSnapshot()`
    to confirm the split nav still reads as five links.
    (`page.accessibility.snapshot()` is gone from the cached `playwright-core`;
    resolve its npx path fresh with `ls -d /home/gdk26/.npm/_npx/*/node_modules/playwright-core`.)
- Chunk-set diff for all 16 pages, before and after.

## What to record in AGENTS.md afterwards

A new section under "Homepage motion" (or a sibling "Site motion" heading if
that framing now reads wrong, since motion is no longer homepage-only):

- that `journal.webm` **contains no animation** and constrains nothing, with
  the sampling that establishes it — so no later session re-derives it;
- `/journal`'s reveal structure, and specifically **why each card gets its own
  `Reveal`** rather than one section stagger;
- the hover zoom's numbers, marked as **judgement (500 ms, `scale-105`)** on
  top of a **measured** curve (`ease-in-out`), and the note that this closes
  the "cards.tsx deliberately left alone" exception at the user's request;
- the footer split: `type: "words"` and why not `chars`, `FOOTER_DUR 1.0` /
  stagger 0.12 as a deliberate slow departure from `register.ts`, the wordmark
  as one blurred element and **why it can never be split**;
- **the rewritten bundle invariant**, with the measured chunk cost.

## SKILLS USED

- `gsap-react` — `useGSAP`, refs, scope, and cleanup on unmount for the new
  `footer-reveal.tsx` leaf.
- `gsap-plugins` — SplitText registration and the `autoSplit` / `onSplit`
  contract the footer split depends on.
- `gsap-scrolltrigger` — the footer's `start` / `once` trigger and the
  per-card triggers on `/journal`.
- `gsap-timeline` — sequencing the two split lines against the wordmark with a
  position parameter.
- `gsap-core` — `gsap.matchMedia()` and the reduced-motion split.
- `gsap-performance` — the blurred-layer budget that decides `words` over
  `chars`.
- `tailwind-4-docs` — confirming `scale-105` compiles to the independent
  `scale` property and that `group-hover:` carries its own `@media (hover:hover)`.
- `vercel-react-best-practices` — keeping `journal/sections.tsx` and
  `cards.tsx` server components and the new leaf component-only, so no
  additional client code reaches these routes.

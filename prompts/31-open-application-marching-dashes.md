# 31 — March the open-application card's dashed frame

## Scope, and why it is next

The user circled the **open-application card's dashed frame** on `/careers` in
`~/Pictures/Screenshots/Screenshot_20260806_203153.png` and asked for the dashes
to "move around" — a marching-ants loop around the frame.

It is next because it is a self-contained, user-requested micro-interaction on
an element that already ships settled and measured. It does **not** overlap
`prompts/30-careers-and-job-listing-reveals.md` (written, untracked, **not
executed**): that prompt puts entry reveals on `/careers` and
`/job-listing/[slug]`; this one animates one existing SVG stroke and touches no
reveal, no wrapper and no layout row. The two are independent and can execute in
either order.

**Numbering note:** `prompts/` already carries two files numbered 30
(`30-about-page-motion.md`, executed and recorded in `AGENTS.md`, and
`30-careers-and-job-listing-reveals.md`, unexecuted). Neither is renumbered —
this file takes **31**, the highest existing number plus one.

## Reference material read

| path | what it is |
| --- | --- |
| `~/Pictures/Screenshots/Screenshot_20260806_203153.png` | the request — a 1352-wide capture of `localhost:3000/careers`, the open-application card ringed in red |
| `app/_components/cards.tsx:174–223` | `JobCard`, and the `open` branch that draws the frame |
| `app/_components/careers/sections.tsx` | `JobList` — the only place `open` is set |
| `app/design-system/page.tsx:283` | the styleguide's `JobCard`, which is **not** `open` and therefore draws no frame |
| `app/globals.css:96` | the existing `(scripting: enabled) and (prefers-reduced-motion: no-preference)` block |
| `AGENTS.md` — "Careers page", "The journal stamp's perforation drift" | the frame's measured geometry, and the seamless-loop argument this reuses |

## What is already measured, and must not move

From `AGENTS.md` ("Careers page"), fitted off the comp's top border at y 1010 and
**not to be refitted**:

- **7px on / 9px off, pitch 16**, solid `#000`, 1px, radius 16, interior
  transparent.
- `strokeWidth="2"` with the rect on the viewport boundary is deliberate — the
  SVG clips the outer half, leaving exactly 1px with no fractional `x="0.5"`
  geometry browsers disagree on. **Keep it.**
- The dashed card's own box: `820×170+230+1036` at 1280, `760×170+20+1001` at
  800, `335×224+20+1200` at 375.

## The change

**CSS keyframes, not GSAP** — the user's choice, and it is the cheaper one here:
`cards.tsx` stays a server component, `/careers` gains no client reference, and
the loop needs no `matchMedia` and no `useGSAP`. This is the same call
`home/journal.tsx`'s row hover and `cards.tsx`' article-card fade already make
for CSS-expressible motion.

Two edits, and nothing else:

1. **`app/globals.css`** — one `@keyframes` and one class, authored **outside**
   the `(scripting: enabled)` block (that block exists to hide GSAP's start
   states; this animation needs no script and must run with JavaScript off), and
   gated on `prefers-reduced-motion: no-preference`:

   ```css
   @keyframes job-frame-march {
     to {
       stroke-dashoffset: -16;
     }
   }

   @media (prefers-reduced-motion: no-preference) {
     .job-frame-march {
       animation: job-frame-march 0.8s linear infinite;
     }
   }
   ```

2. **`app/_components/cards.tsx`** — add `className="job-frame-march"` to the
   `<rect>` in the `open` branch. No other attribute changes.

### Why each number is what it is

- **`-16`, and it must be exactly the dash pitch.** 7 on + 9 off = 16, so
  translating the pattern by one full period lands every dash where its
  neighbour started: the frame at `t + duration` is pixel-identical to the frame
  at rest and `infinite` has no seam. Identical argument to the journal stamp's
  `1240/25 = 49.6` perforation pitch. **Verify it rather than assume it** — see
  the checks below.
- **Negative, i.e. clockwise.** A decreasing `stroke-dashoffset` advances the
  pattern along the path's own direction; the rect is drawn from its top-left
  corner clockwise, so the dashes travel left-to-right along the top edge. The
  user's choice, and it matches the journal stamp's top row.
- **`0.8s` = 20 px/s.** A judgement, not a measurement — the user picked "brisk"
  from three offered paces (0.5 / 0.8 / 1.2 s per pitch). Half the perforation
  drift's ~41 px/s, which is right for a 1px hairline against that loop's 15px
  circles. **Record it as a judgement**; say so if it is ever revisited.
- **`linear`.** A conveyor must not accelerate — any easing makes the wrap read
  as a stutter. The same reason the perforation drift ships `ease: "none"`.
- **No on-screen gate.** The perforation drift and the capabilities loops carry a
  `ScrollTrigger` `onToggle` gate because they are GSAP timelines whose ticker
  runs regardless. A CSS animation on an off-screen element is the browser's own
  problem, and this one repaints a single 1px stroke. Do **not** add a gate; do
  not convert this to GSAP to get one.

## Expected impact

- **`/careers` is the only route whose prerendered HTML changes**, and its only
  diff is the one `class="job-frame-march"` attribute on the `<rect>`, plus the
  build id and chunk renames. `/design-system` renders `JobCard` **without**
  `open`, so it draws no frame and is unaffected.
- **Expect flight-payload row segmentation on the pages whose markup changes** —
  the recorded trap from prompt 27. Strip
  `<script>self.__next_f.push(…)</script>` before diffing the markup.
- **Every route must keep its exact chunk set** — `/` and `/journal` 10,
  `/about` 10, the rest 9, the two error pages 8. No module is added, so any
  movement here is a finding.
- **Page heights unchanged everywhere**, and `/careers`' card boxes unchanged at
  all three breakpoints (the numbers above).
- CSS-only, so `magick compare` on the *settled* state is not a meaningful check
  for the frame itself — the dashes sit wherever the loop's phase puts them.
  Report `AE` **scoped**: 0 outside the dashed card's box at 375 / 800 / 1280,
  and whatever falls inside it, exactly as the journal stamp and the
  capabilities cloth are reported. **Never report a bare page-wide `AE` for
  `/careers` after this.**

## Checks, and the measurements to produce

Run against a production build on a free port (check 3000/3001/3002 first;
confirm the served CSS chunk matches the build just made), Playwright out of the
npx cache, `deviceScaleFactor: 1`.

1. **The loop is seamless — verify, do not assume.** Under
   `prefers-reduced-motion: reduce` (animation not running), screenshot the
   dashed card's box, then force `stroke-dashoffset: -16` onto the rect and
   screenshot again. `magick compare -metric AE -fuzz 5%` between the two must
   be **0**. This is the perforation drift's own verification, transposed.
2. **The rate is what is authored.** Read `stroke-dashoffset` off the rect at
   two timestamps ~2 s apart via `getComputedStyle`, unwrap modulo 16, and
   confirm ≈20 px/s at 375 / 800 / 1280. Expect ~2 % of sampling jitter.
3. **The stroke is still 1px and the pattern is still 7/9.** Ink-row profile
   across the frame's top border in the render, the AGENTS.md command — a single
   row of ink, runs of 7 separated by 9.
4. **Reduced motion**: `getComputedStyle(rect).animationName` reads `none`, and
   `stroke-dashoffset` stays `0`. **JavaScript off**: the animation still runs
   (it is CSS and deliberately outside the `scripting: enabled` gate) and the
   card box is unchanged.
5. **Card geometry**: connected components on `/careers` at 375 / 800 / 1280
   against a worktree build of the parent commit — the dashed card's box must be
   identical.
6. **Build diff**: the scratchpad helper, normalising the build id and the CSS
   and JS chunk names, flight scripts stripped. 15 of 16 pages byte-identical;
   `/careers`' only markup diff the one class attribute. Chunk sets identical
   on every route.
7. Confirm in the **built** stylesheet that the keyframes and the media query
   survive Lightning CSS — `grep` for `job-frame-march` in
   `.next/static/chunks/*.css` and check the enclosing at-rules, the discipline
   every Tailwind v4 mechanic on file follows.
8. `npm run lint`, `npm run typecheck`, `npm run build` — report exact output.

## Non-goals

- **No geometry change.** The 7/9 pattern, the `strokeWidth="2"`-clipped 1px,
  the radius 16, the interior transparency and the card's padding are all
  comp-measured and settled.
- **No GSAP, no client component, no ScrollTrigger, no `globals.css` start-state
  rule.** `cards.tsx` stays a server component.
- **No entry reveal on `/careers`** — that is prompt 30's unexecuted scope, and
  folding it in here would make both unreviewable.
- **The open-application card's other flags stay as they are**, including the
  "Full-time · Denver, CO" meta already flagged in `AGENTS.md` as possible comp
  placeholder, and the inert "Apply now" button.
- `ArticleCardStacked`, `ArticleCardHorizontal`, `ArticleCardCompact` and the
  non-`open` `JobCard` are untouched.

## What to record in `AGENTS.md` afterwards

Under the **Careers page** section, a new subsection — the dash pitch as the
seamlessness argument (cross-referencing the perforation drift), the three
authored numbers with 0.8 s marked explicitly as a *judgement* and the direction
as the user's choice, why there is no on-screen gate, why it sits outside the
`scripting: enabled` block, and the measured table (rate at three breakpoints,
the `AE` 0 seam check, reduced-motion and JS-off behaviour, scoped `AE`, chunk
sets).

Add to **section 3 (Automation)** if it generalises: verifying a CSS
dash-pattern loop is seamless by forcing one period of offset and comparing at
`AE` 0.

## SKILLS USED

- **`tailwind-4-docs`** — confirm how Tailwind v4 / Lightning CSS treats a
  hand-authored `@keyframes` and a bare class in `app/globals.css`, and that
  neither is stripped by content detection. Every v4 mechanic in this project is
  checked against the built stylesheet rather than recalled.
- **`gsap-core`** — read only if the CSS route turns out not to express the
  loop; the user chose CSS keyframes explicitly, so reaching for GSAP is a
  deviation that must be raised before it is taken, not a fallback.

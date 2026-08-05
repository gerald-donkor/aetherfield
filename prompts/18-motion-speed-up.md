# 18 — Speed up the homepage motion (a little)

## Scope, and why it is next

The homepage motion shipped in prompt 17 (`77db960`) runs at the recording's
pace: `DUR = 0.6`, 0.1 s between siblings, and a 0.9 s run across the 33
emissions bars. Reviewing it on the hero dashboard
(`~/Pictures/Screenshots/Screenshot_20260805_191302.png` — the "Good morning,
Acme Inc" panel with the stat tiles and the "Carbon emissions trend" chart) the
user asked for it to be **a bit faster, not much**.

This is a tuning change to numbers that already exist. No new components, no new
tweens, no new triggers.

## Reference material

- `~/Pictures/Screenshots/Screenshot_20260805_191302.png` — the panel in question.
- `public/design-ref/animation-ref/landing.webm`, `chart.webm` — the original
  reference recordings, for the vocabulary the change must not break.
- `app/_components/motion/register.ts`, `app/_components/motion/reveal.tsx`,
  `app/_components/home/emissions-chart.tsx` — the three files that carry every
  timing number.
- AGENTS.md, "Homepage motion (`/` only)".

## The change

One step faster across the board — roughly a 20 % cut, so the vocabulary is
unchanged and the sequence still reads as fade-in-and-rise, decelerating, once:

| where | now | after |
| --- | --- | --- |
| `register.ts` `DUR` | 0.6 | **0.5** |
| `reveal.tsx` sibling stagger | 0.1 | **0.08** |
| `emissions-chart.tsx` gridline duration | 0.5 | **0.4** |
| `emissions-chart.tsx` gridline stagger | 0.06 | **0.05** |
| `emissions-chart.tsx` bar duration | 0.5 | **0.4** |
| `emissions-chart.tsx` bar run `amount` | 0.9 | **0.7** |

`EASE` (`power3.out`), the `from: "edges"` stagger, the `power1.inOut` stagger
ease, the rise distances (36 / 24), `start: "top 88%"`, the chart's
`start: "bottom bottom", once: true` and the `immediate` hero are all
**unchanged**. `DUR` and `EASE` stay the single source of truth in
`register.ts`, so the chart's pill and the page reveals still cannot drift.

## Expected impact

- Only `/` animates, so only `/` is affected at all. **Every route's prerendered
  HTML must stay byte-identical**, including `/` — these are JS tween vars, not
  markup or classes. Verify with the build-diff helper (AGENTS.md § 3), or at
  minimum confirm no `.tsx` render output changed.
- No layout row moves at any breakpoint; the CSS start state in `globals.css` is
  untouched, so there is still no flash of final state.
- The reduced-motion and no-JavaScript branches are untouched.

## Non-goals

- Not re-fitting the motion against the recordings — the recording is the
  origin of these numbers and the user is deliberately overriding it, exactly as
  the seal's offsets were overridden by a user reference.
- No change to easing, distance, trigger points, or the `from: "edges"` bar
  order.
- No motion added to any other route, and no motion added to the footer or
  `chrome.tsx`.
- `motion@^13` stays unused; the homepage is GSAP throughout.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Watch `/` at 1280 and 375 in `npm run start` and confirm the hero, the chart
  and the lower sections still read as one vocabulary, just quicker.

## Record in AGENTS.md

Under "Homepage motion (`/` only)": note that the shipped timings are `DUR 0.5`
/ stagger 0.08 / chart 0.4 with a 0.7 s bar run, that they are a deliberate ~20 %
speed-up on the recording's pace at the user's request, and that `DUR`/`EASE`
remain the shared source of truth.

## SKILLS USED

- `gsap-core` — duration, easing and stagger semantics; the `amount` vs `each`
  distinction on the bar run.
- `gsap-react` — `useGSAP` scoping and cleanup, unchanged but touched.
- `gsap-timeline` — the chart's single timeline and its position parameters.
- `gsap-scrolltrigger` — the `start` / `once` triggers that must not move.
- `gsap-performance` — confirming the speed-up stays on transform/opacity only.

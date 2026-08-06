# 29 — The perforation drift, faster

## Scope, and why it is next

Prompt 28 shipped the `/journal` stamp's two perforation rows drifting in
opposite directions at `CYCLE = 2` s per perforation pitch — the "moderate" pace
the user picked from three offered. Having seen it running, the user asked for
it to be **faster**. That is one constant, and it is next because it is the
whole of the request.

## The change

`app/_components/journal/stamp-perforations.tsx`:

```
const CYCLE = 2;   →   const CYCLE = 1.2;
```

**1.2 s is the "brisk" pace already offered and described in prompt 28** —
≈41 user units per second, ≈41 px/s at 1280, i.e. **1.67× the shipped speed**.
It is the next step up from the one the user chose rather than an invented
number, and it is the fastest of the three paces they were shown, which is the
honest reading of "faster" after picking the middle one. Like the original, it
is a **judgement, not a measurement**; say so if it is ever revisited.

Nothing else moves. `ease: "none"`, `repeat: -1`, `x: ±pitch`, the on-screen
`ScrollTrigger` gate, the reduced-motion branch, the extra circle per row and
the two row groups are all unchanged. **The seamlessness argument is
speed-independent** — it is a property of the pitch, not of the duration — so it
does not need re-deriving, only re-confirming.

This is the same shape of change as prompt 23 (the cloth's speed-up at the
user's request): a tween var, not markup.

## Measurements to hit

At 375 / 800 / 1280, production build:

- top row `x` rising and bottom row `x` falling at **≈41.3 user units per
  second** (one pitch per 1.2 s), both wrapping inside `[0, ±49.6]`;
- **seamlessness still `AE` 0** — under `prefers-reduced-motion: reduce`, the
  stamp at rest against the stamp with `translate(±49.6,0)` forced onto the two
  row groups;
- the gate still freezes both transforms off screen and resumes them on return;
- reduced motion still writes no transform at all; JS off still renders the
  stamp at its normal box;
- `/journal` page heights unchanged at **3801 / 5160 / 3486**, stamp box
  unchanged at all three widths.

## Expected impact

- **No route's prerendered HTML changes at all** — this is a tween var, not
  markup. All 16 pages byte-identical once the build id and the CSS and JS chunk
  names are normalised, and every route keeps its chunk set.
- Renders differ only inside the stamp box, and only because the rows are at a
  different phase. **`AE` must be 0 outside the stamp box** on `/journal`;
  report the two numbers separately, never a bare page AE.

## Non-goals

- No change to pitch, radius, circle count, direction, easing, the gate or the
  reduced-motion branch.
- No change to any other loop on the site — the capabilities asterisk (9 s per
  turn), the counter and the cloth's 3.5 / 5.5 / 6.5 s periods are untouched.
- Nothing outside `stamp-perforations.tsx`, beyond the `AGENTS.md` record.

## Checks

`npm run lint`, `npm run typecheck`, `npm run build` — report exact output. Then
a production server on a free port (3000–3002 and 3007 are occupied on this
machine; check with `ss -ltn` and confirm the served CSS chunk matches the
build) and the Playwright probes above.

Update the "The journal stamp's perforation drift" subsection in `AGENTS.md`:
the new `CYCLE`, where 1.2 came from, and the re-measured drift rate.

## SKILLS USED

- `gsap-core` — the tween var being changed (`duration` on a `repeat: -1` loop).
- `gsap-react` — `useGSAP` scope and cleanup, unchanged but re-read on execution.

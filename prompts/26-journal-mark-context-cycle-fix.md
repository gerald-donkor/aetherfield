# 26 — The journal mark's `contextSafe` crashes `/journal` on navigation

## Scope, and why it is next

Navigating `/` → `/journal` after the journal mark's entrance flip has completed
throws a **`RangeError: Maximum call stack size exceeded`** out of
`JournalMark`. It is a live runtime crash on a shipped page and takes priority
over any new feature work.

It is the **same crash class** already fixed once in `capability-visual.tsx`
(`ddbd74f`, "Stop the capabilities card crashing on navigation away from /") —
and `journal-mark.tsx` was explicitly exempted from that fix on a reasoning that
this prompt's measurement shows to be wrong. So the fix is one file plus a
correction to the rule recorded in `AGENTS.md` and in `capability-visual.tsx`'s
comment.

## Reference material read

- The user's report: `/journal`, `Runtime RangeError`, `Maximum call stack size
  exceeded`, `at Array.forEach` → `at JournalMark`, Next.js 16.2.12.
- `app/_components/home/journal-mark.tsx` — the file at fault.
- `app/_components/home/capability-visual.tsx:198-220` — the comment that
  exempted this file, which must be corrected.
- `node_modules/gsap/gsap-core.js:965-985` (`_callback`) and `:3908-3931`
  (`Context.prototype.add`), `:3949` (`getTweens`).
- `node_modules/@gsap/react/src/index.js:33-34` — `contextSafe` is
  `func => context.current.add(null, func)`, bound to the **outer** `useGSAP`
  context.
- `AGENTS.md`, "Fix — `contextSafe` inside a `matchMedia` handler…".

## The mechanism, measured not assumed

Reproduced against the running dev server on port 3000 with `playwright-core`
(resolved this session at `/home/gdk26/.npm/_npx/606f4d49f911e2b4/…`): load `/`
at 1280, wheel-scroll the whole page in 400px steps so the mark's flip fires and
completes, then click the header's `/journal` link.

| variant | result |
| --- | --- |
| scroll past the mark, wait 2 s, then navigate | **`PAGEERROR: Maximum call stack size exceeded`** |
| navigate immediately, mark never revealed | **no errors** |

So the crash requires the entrance flip's `onComplete` — i.e. `buildHover()` —
to have run.

`gsap-core.js` was then patched temporarily to log every
`prev.data.push(self)` in `Context.add`'s wrapper with both context ids and a
stack. Two lines matter, and they are the cycle:

```
CTXPUSH prev#17 <- self#32   MatchMedia.add ← JournalMark.useGSAP      (normal nesting)
CTXPUSH prev#32 <- self#17   JournalMark.useGSAP:2054 ← _callback ← Tween.render
```

Context **#17** is the outer `useGSAP` context, **#32** the inner `matchMedia`
context. The second push puts the outer context inside the inner one's `data`,
which already contains it the other way round. `Context.getTweens` recurses over
`data` with no cycle guard (`gsap-core.js:3949`), so the `revert()` on unmount
blows the stack — and `Array.forEach` in the user's trace is that recursion.

**Why `prev` is not null, which is the thing `AGENTS.md` gets wrong.**
`_callback` (`gsap-core.js:981`) does `context && (_context = context)` before
invoking the callback, where `context` is `animation._ctx` — the context the
tween was *created* in. So **every GSAP callback runs with its creating context
active**, on whatever tick it fires. The recorded rule — "`contextSafe` is for
callbacks that fire *after* the hook has returned… `journal-mark.tsx` keeps its
`contextSafe` because `prev` is null there" — is false. `prev` is `#32`.

The corrected rule: **`contextSafe` is only safe where no GSAP context is
active. A tween's own `onComplete` / `onUpdate` / `onStart` is not such a place,
and neither is anything synchronous inside an `mm.add` handler.** In this
codebase that leaves no legitimate use of `contextSafe` at all.

## The change

`app/_components/home/journal-mark.tsx`, one file:

- **Drop `contextSafe` entirely** — both the `useGSAP` callback's second
  parameter and the `buildHover` wrapper.
- **Create the hover tween eagerly, inside the `mm.add` handler**, alongside the
  entrance tween. It is already `paused: true` and `immediateRender: false`, and
  its `fromTo` start vars are *authored literals* (`rotation: REST_ROTATION`,
  `rotationY: 0`, `transformPerspective: 800`) rather than values read off the
  element, so nothing about it depends on the entrance having landed. Created
  inside the handler it is inside a live context and is already reverted by
  `mm.revert()`.
- **Keep the listener binding gated on the entrance flip's `onComplete`**, so
  the documented behaviour is unchanged: hovering mid-flip still does nothing,
  because no listener is bound yet. The existing `mm.add` cleanup already
  removes both listeners and kills the tween.
- Nothing else moves: `REST_ROTATION`, `HOVER_ROTATION`, `HOVER_ROTATION_Y`,
  `DUR * 0.7`, `EASE`, the `hasHover` / `isTabletUp` / `reduceMotion` conditions,
  the entrance tween's vars and its ScrollTrigger, and **the returned JSX** are
  all untouched.

Then correct the two places that record the wrong rule:

- `capability-visual.tsx:216-220` — the paragraph exempting `journal-mark.tsx`.
- `AGENTS.md`, the "Fix — `contextSafe` inside a `matchMedia` handler makes two
  contexts reference each other" section, plus a new section for this fix.

## Measurements the implementation must hit

Against the dev server at 1280, with the scripted repro above:

1. `/` → `/journal` after a full scroll pass: **zero page errors and zero
   console errors**. Also run `/` → `/about` and back, four round trips, as
   `ddbd74f` did.
2. The mark's **resting matrix is unchanged**:
   `matrix3d(0.990268, -0.139173, 0, 0, 0.139173, 0.990268, 0, 0, 0, 0, 1,
   -0.00125, 0, 0, 0, 1)` — the 2D block is exactly `cos/sin 8°`. Measured
   before the fix in this session; it must read identically after.
3. **Hover still works and still reverses**: `pointerenter` drives the mark to
   `rotate(-45deg) rotateY(12deg)`, `pointerleave` returns it exactly to
   `rotate(-8deg)`, and an interrupt ~150 ms in unwinds along the same curve
   (the numbers already on file: `rotate(-40.98) rotateY(10.69)` → rest).
4. **Hovering mid-flip is still inert** — no listener bound until the flip
   completes.
5. Resting rect **`421×252` at 1280** and **`307×184` at 800**; `display: none`
   at 375, where no tween and no listener may be created at all.
6. Under `prefers-reduced-motion: reduce`: `opacity: 1`, computed
   `rotate: -8deg` still present, no inline transform written, hover inert.

## Expected impact

- **No route's prerendered HTML changes.** The returned JSX is untouched, so all
  16 pages must be byte-identical once the build id and the CSS chunk name are
  normalised (the scratchpad build-diff helper; remember the chunk name is
  `[A-Za-z0-9_-]+`, not hex). Only `/`'s client chunk contents change.
- `/` must be **pixel-identical outside the capabilities cloth box** at 375 /
  800 / 1280 in the settled state. Never report a bare page-wide `AE` for `/` —
  mask the cloth box and report the two numbers separately, per `AGENTS.md`.
- Page heights unchanged: `/` 6350 / 6006 / 5595.

## Non-goals

- **No change to the hover's angles, duration or easing**, and none to the
  entrance flip. This is a lifecycle fix, not a motion change.
- **No change to `capability-visual.tsx`'s code** — only its comment, which
  currently states the wrong rule.
- No change to `footer-reveal.tsx`, which is already correct and says so.
- No attempt to fix GSAP's missing cycle guard in `getTweens`; the codebase's
  own usage is what is wrong.
- `node_modules/gsap/gsap-core.js` was patched during this investigation and
  **has already been restored from a backup**; the implementation must not ship
  any change under `node_modules/`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- The scripted repro above, at 1280, before and after.

## What to record in `AGENTS.md`

A new subsection under "The journal mark's hover" (or immediately after the
existing `contextSafe` fix note), stating:

- the reproduction and the two-variant discriminator;
- the two `CTXPUSH` lines and the `#17` ↔ `#32` cycle;
- **`_callback` at `gsap-core.js:981` restores the tween's creating context
  before invoking any callback** — the fact that makes the previously recorded
  "prev is null on a later tick" reasoning wrong;
- the corrected rule, and that `contextSafe` now appears nowhere in `app/`;
- the strike-through/correction of the exemption sentence in the earlier fix
  note;
- the measured after-state (resting matrix, hover, reduced motion, HTML
  identity).

## SKILLS USED

- **gsap-react** — `useGSAP`, `contextSafe`, context lifecycle and cleanup on
  unmount; this is exactly the API being misused.
- **gsap-core** — `gsap.matchMedia()` semantics and the `fromTo` / paused-tween
  behaviour the hover relies on.
- None beyond these; the work touches no layout, no assets and no comps.

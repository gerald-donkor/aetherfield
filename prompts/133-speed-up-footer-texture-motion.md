# Speed up the footer texture motion

## Scope and why this is next

Increase the speed of the continuous unwinding motion in the shared footer
texture, as explicitly requested on 20 September 2026. This is a follow-up to
prompt 132 and is independent of the backend sequence.

Change the loop period from 18 seconds to 12 seconds. That makes the motion 50%
faster and is a judgement translating the user's qualitative request into a
concrete target; the earlier 18-second value was itself a judgement rather than
a measurement. Change only the period. Preserve the shader's spatial
deformation, linear phase, direction, texture, resolution caps, pause/resume
behavior, reduced-motion behavior, fallbacks and cleanup.

## Reference material

- `AGENTS.md`, especially the settled footer exception, GSAP discipline,
  reporting rules and prompt workflow.
- `docs/chrome.md`, "Footer band motion — prompt 132".
- `docs/motion-site.md`, "Footer texture unwinding — prompt 132".
- `app/_components/motion/footer-texture.tsx`, especially `PERIOD` and the GSAP
  phase tween.
- `prompts/132-footer-texture-unwinding-motion.md`, the approved implementation
  brief that introduced the effect.

Repository evidence at preparation: `main` is at `b09515b`; the implementation
uses `const PERIOD = 18` and a linear, repeating GSAP tween from phase 0 to 2π.
The only unrelated worktree item is `.claude/settings.local.json`; leave it
untouched.

## Implementation requirements

- Set the judged period to 12 seconds in
  `app/_components/motion/footer-texture.tsx`.
- Update the adjacent comment only as needed to keep the judgement accurate.
- Do not change shader source, amplitudes, wave count, canvas dimensions,
  rendering resolution, easing, image markup, IntersectionObserver,
  ResizeObserver, Page Visibility handling, reduced-motion handling, resource
  cleanup or any footer component outside this timing constant.
- Keep the continuous phase linear with `ease: "none"`; do not change shared
  `DUR` or `EASE` in `motion/register.ts`.
- Update the owning record in `docs/motion-site.md` with the new 12-second
  period and the user's request. Preserve prompt 132's historical measurements:
  distinguish the original 18-second implementation/recording from the new
  shipped value instead of rewriting history as though prompt 132 used 12.
- Add a concise note to `docs/chrome.md` only if needed to keep its current
  cross-reference accurate; it currently contains no stale duration.

## Measurement and acceptance

The target is authored, not inferred from a reference: one complete loop must
take 12 seconds, which is 50% faster than the current 18-second loop.

In a production browser check:

- inspect at least two full periods (24 seconds) and the wrap boundary;
- confirm the folds travel in the same direction and keep the same spatial
  shape, with no seam, flash, gap or visible reset;
- confirm the animation continues when scrolling stops;
- confirm it pauses offscreen and resumes without jumping;
- confirm reduced motion and no JavaScript still show the original texture;
- confirm no page or console errors on `/about` and `/`.

Because only a scalar client timing constant changes, do not repeat prompt
132's full geometry fitting or WebGL failure matrix unless a check reveals a
regression. Footer geometry must remain identical by source inspection, and a
focused bounding-box check at 1280 is enough to confirm it. The prerendered
markup and CSS should be unchanged; compare them rather than assuming that.

## Expected impact

Every route rendering `SiteFooter` receives the faster client-side motion. No
route changes render mode, server-rendered markup, styling or layout. The
expected prerender impact is `none`: normalized prerendered HTML and CSS remain
identical because the period is a client JavaScript constant.

## Non-goals

No change to deformation strength, wave density, direction, easing, texture,
footer geometry, navigation, typography, wordmark, text reveal, responsive
behavior, accessibility fallback, dependency set, backend or unrelated motion.
Do not regenerate the texture or add controls for animation speed.

## SKILLS USED

- `gsap-core` — verify the repeating tween duration and linear continuous phase.
- `browser-use` — guide the focused production browser inspection and visual
  motion verification.

No other implementation skill owns this one-constant timing adjustment. The
WebGL API and React lifecycle are unchanged from prompt 132.

## Checks, documentation and delivery

- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
  Report their actual output.
- Run the focused production browser checks above in Chromium and Firefox. Use
  the documented WebKit workflow if Podman is available; otherwise record the
  existing environmental block honestly.
- Verify the 12-second authored period and inspect at least two loops.
- Verify normalized prerendered HTML, CSS, route modes and the 1280 footer box
  against the prompt 132 baseline where available.
- Record the final change and verification in `docs/motion-site.md`; update
  `docs/chrome.md` only if its current statement becomes inaccurate. Add to
  `docs/automation.md` only if a genuinely reusable new procedure is found.
- Commit this prompt, implementation and documentation to `main`; do not push.
  Preserve `.claude/settings.local.json` and any other unrelated user work.

## Execution gate

This file is the prepared brief only. Implement after the user approves it under
AGENTS.md section 1, steps 6-7; `y` or `Y` is approval.

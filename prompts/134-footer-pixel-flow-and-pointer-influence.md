# Footer pixel flow and pointer influence

## Scope and why this is next

Combine the existing footer texture animation with the pixel/particle motion in
the user's recording, then make mouse movement over the band influence those
pixels while autonomous animation continues. This is the user's requested
follow-up to committed prompt 133 (`aded489`), independent of the backend plan.
The request authorises changes inside the otherwise settled texture band.

## Reference material

- `/home/dgk/Videos/screenrecording-2026-09-21_00-10-15.mp4`.
- `AGENTS.md`: workflow, settled surfaces, GSAP discipline and bundle rules.
- `docs/chrome.md`: footer geometry and band wrapper.
- `docs/motion-site.md`: prompts 132 and 133, lifecycle and measurements.
- `docs/automation.md`: recording sampling, footer probes and build comparison.
- `app/_components/motion/footer-texture.tsx`: current implementation.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.
- `.agents/skills/vercel-react-best-practices/rules/rerender-use-ref-transient-values.md`.

Reference metadata measured with ffprobe: 1334 x 258, 60 fps, 18.466667 seconds.
Preparation inspected a whole-clip sheet sampled every two seconds and a
12-fps native-scale 480 x 258 crop at x 420 over seconds 6-7. Scratch artifacts:
`/tmp/aetherfield-134-reference.png` and `/tmp/aetherfield-134-detail.png`.
Re-extract from the original if these temporary files disappear.

Observed appearance: flowing broad light/dark bands with fine, regularly spaced
halftone dots and changing density at their boundaries. The recording includes
a cursor-following 'Hold to disrupt' label. Its underlying implementation,
particle physics and click state are not established by the recording. Do not
claim those as measured facts. Our pointer interaction is the user's separate
explicit request and needs no click or hold.

## Visual and interaction brief

Preserve the current yellow/olive fabric identity and recognisable travelling
folds at the current 12-second base period. Add the reference's flowing dot-field
quality: fine pixels/dots visibly reorganise with the field, density and scale
respond to its light/dark contours, and movement remains coherent at both the
large fold scale and the small dot scale. Keep the existing source texture as a
material input. A second unrelated layer of random particles is not the target.

Use a compact GPU-rendered field in the existing canvas; explicit particle
simulation is optional only if needed to achieve the observed result. Prototype
the combined appearance and inspect it before committing to a rendering method.
Do not merely speed up the old UV warp and call that the new pixel treatment.
Do not import reference branding, text, monochrome palette or its tooltip.

Mouse movement over the band creates a local directional disturbance/swirl.
Position determines its centre; movement direction and bounded velocity influence
its displacement. Nearby pixels respond most strongly, with smooth spatial
falloff. Retain a short, decaying wake and let the field settle smoothly when
the pointer stops or leaves. The base clock continues throughout: hovering must
not pause it, reset phase or turn the entire band into a mouse follower.
Strength, radius, dot pitch, smoothing and decay are design judgements to tune
and document, not numbers inferred from the clip. Keep the effect clear but
bounded so rapid sweeps cannot expose blank edges or destroy the fabric pattern.

Use pointer events scoped to the band host with normalized local coordinates
and aspect-correct distances. Keep the native cursor. Touch scrolling remains
native; coarse pointers receive autonomous motion without requiring interaction.
Handle pointer exit/cancel, resize, visibility changes and offscreen re-entry
without stale velocity spikes or a frozen disturbance.

## Engineering constraints

- Modify the existing component under `app/_components/motion/`; preserve its
  component-only export and server-supplied image children.
- Retain one canvas, the original image fallback and existing layout wrapper.
  Preserve responsive dimensions, crop, surrounding footer and reveal behavior.
- Use the scoped useGSAP / named matchMedia lifecycle. Project prohibition of
  contextSafe overrides that recommendation in the GSAP React skill. Avoid
  creating tweens per pointer event; store transient input in refs or lifecycle
  locals and update reusable animation state/uniforms in the existing clock.
- Keep the 12-second phase linear and seamless. Added motion must also cross
  repeats without a visible reset. Use elapsed-time smoothing and bounded deltas.
- Retain offscreen and hidden-document pausing and capped rendering resolution.
  Reset timing baselines on resume; no catch-up simulation after a hidden tab.
- Preserve reduced-motion, no-JavaScript, unsupported WebGL, shader failure and
  context-loss fallbacks. Reduced motion disables autonomous and pointer motion.
- Explicitly remove all added listeners, clocks, buffers, textures and other GPU
  resources on teardown. No per-frame React renders or layout thrashing.
- Verify new native APIs against installed types or official documentation.
  No dedicated shader/design skill is available. No dependency addition is
  expected; no backend, AI service, secrets or external data transmission.

## Measurement and acceptance

1. Capture the baseline before implementation. Inspect additional 12-15 fps
   reference windows if needed to resolve flow; distinguish observations from
   chosen parameters and do not infer an exact algorithm from appearance.
2. Capture at least 24 seconds of idle animation and a separate pointer sequence
   with slow sweeps, fast reversals, stopping, leaving and re-entering the band.
   Inspect dot movement, fold continuity, edges and the repeat boundary.
3. Demonstrate pointer influence with comparisons at the same autonomous phase:
   idle versus pointer movement should differ locally, including dot positions;
   distant regions should retain the baseline flow. Measure decay to baseline
   after exit. Do not confuse different phase samples with interaction evidence.
4. Check `/about` and `/` in Chromium and Firefox, and the documented WebKit
   workflow if Podman is available. Capture page and console errors explicitly.
5. Check 375, 800 and 1280 widths, high device scale, resize, coarse pointer,
   live reduced-motion toggles, no JavaScript, offscreen/hidden pause and resume,
   context loss, and route away/return without listeners or detached-canvas work.
6. Compare footer, band, nav and wordmark boxes to baseline. Band heights remain
   120/210/280 at the established breakpoints. Mask the animated band and compare
   the rest of the footer independently; obey other page motion masks.
7. Profile visible idle and pointer-active work separately from video recording.
   Report frame intervals, JS submission cost, buffer size and browser/renderer.
   Bound field complexity; disclose software-rendering limitations honestly.

## Expected impact and prerendering

All shared SiteFooter consumers gain the combined animation and pointer response.
No route render mode or server-rendered markup is intended to change. All 21
existing prerendered HTML paths must retain their rendered markup; verify the
current set rather than assume it. All route classifications must remain as in
the baseline. Client chunks and their flight references will change, so report
those separately from markup equality. CSS should remain byte-identical unless
a narrowly justified band-only change is needed and documented. Build baseline
and final output in equivalent Tailwind scan environments, including after docs
are updated. Preserve unrelated `.claude/settings.local.json`.

## Non-goals

No footer geometry, typography, nav, wordmark, link, palette or page changes.
No global pointer effects, custom cursor, click-to-enable interaction, controls,
reference branding, audio, backend work, new dependencies or generated imagery.

## SKILLS USED

- `gsap-core` — continuous clock and reusable smoothing with named media queries.
- `gsap-react` — scoped lifecycle and explicit input/resource cleanup; obey the
  project's contextSafe prohibition.
- `gsap-performance` — bound pointer updates, avoid per-event tween creation,
  pause inactive work and profile the field.
- `nextjs` — preserve the existing client boundary and static image fallback;
  read installed Next.js guidance before code changes.
- `vercel-react-best-practices` — transient pointer state without React renders.
- `browser-use` — production visual, pointer and lifecycle verification; use
  installed Playwright if the browser-use executable remains unavailable.

The GSAP core and browser-use skills were read in the preceding work in this
conversation; the other listed skills were read during preparation. Reload all
listed skills at execution. No new Tailwind utilities are planned; load
`tailwind-4-docs` if that changes.

## Checks, documentation and delivery

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, plus the
focused browser/visual checks above. Record actual results and any blocked check.
Document the combined rendering method, chosen parameters, interaction behavior,
performance and artifacts in `docs/motion-site.md`, preserving prior history.
Update the concise footer cross-reference in `docs/chrome.md` if necessary.
Add genuinely reusable new probe mechanics to `docs/automation.md`.
Commit this prompt, implementation and owning documentation to main; do not push.
Provide exact local review steps and a recording of idle plus pointer behavior.

## Execution gate

Prepared under AGENTS.md section 1. Implement after approval; `y` or `Y` means
approved, execute.

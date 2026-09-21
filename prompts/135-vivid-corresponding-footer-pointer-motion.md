# Vivid, corresponding footer pointer motion

## Scope and why this is next

Tune the footer band's existing mouse disturbance so it reads more vividly and
corresponds more directly to pointer movement. This is the user's requested
follow-up to committed prompt 134 (`68c0abc`), independent of the backend plan.
The approved surface is the pointer-driven part of the existing footer canvas;
the autonomous fabric and dot-field treatment remain the visual foundation.

Interpret "corresponding" as spatial and directional fidelity: the strongest
response stays visibly centred near the current pointer position, movement bends
the pixels in the same direction as the pointer's path, reversals read promptly,
and speed changes produce a proportionate change in disturbance. Keep a trailing
wake for character, but do not let its smoothing make the primary response feel
detached or late.

## Reference material

- `AGENTS.md`: workflow, settled-footer exception, GSAP discipline, bundle rule
  and render-comparison requirements.
- `prompts/134-footer-pixel-flow-and-pointer-influence.md`: the approved source
  request and the distinction between observed reference motion and judged mouse
  interaction.
- `app/_components/motion/footer-texture.tsx`: current shader, three-sample wake,
  bounded velocity and full cleanup lifecycle.
- `docs/motion-site.md`: prompt 134's shipped method, chosen parameters, browser
  measurements and known software-rendering limits.
- `docs/chrome.md`: settled footer geometry and the narrow band exception.
- `docs/automation.md`: footer capture procedure and fixed-phase pointer-uniform
  comparison.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`:
  installed Next.js guidance for the existing client boundary.
- `.agents/skills/vercel-react-best-practices/rules/rerender-use-ref-transient-values.md`:
  frequent pointer values stay outside React state.

Prompt 134's review video and scratch probes may still exist under
`/tmp/aetherfield-134-*`; treat them as disposable. Recreate any evidence needed
from committed code rather than depending on a temporary artifact.

## Interaction brief

Make the response unmistakable during ordinary mouse movement, including a slow
sweep. The lead deformation should sit at or very near the pointer instead of
arriving behind it. Fast movement may stretch and curl the field more strongly,
but the effect must remain bounded and preserve the fabric/dot structure. A quick
direction reversal should visibly reverse the lead response without waiting for
the old wake to disappear.

Retain a short, smoothly decaying wake behind the lead response. Separate the
lead and trailing behaviour if that produces better correspondence: the lead may
track position more tightly while older samples remain smoother and weaker. Do
not achieve vividness by enlarging the affected area until most of the band moves;
the response remains local, with distant regions following only autonomous flow.

Tune pointer strength, velocity mapping, rotational contribution, local radius,
lead smoothing, trail spacing/retention and decay together. These are design
judgements. Start from prompt 134's values and change only the minimum set needed
to make the result clearly stronger and more direct. Preserve the native cursor,
the absence of a tooltip and the no-click/no-hold interaction.

## Engineering constraints

- Modify the existing component under `app/_components/motion/`; keep it a
  component-only client leaf receiving server-supplied image children.
- Retain one canvas, the original image fallback, current object-cover crop,
  12-second seamless autonomous phase, dot field and surrounding footer markup.
- Keep pointer state in lifecycle locals/typed arrays. No React render per event,
  GSAP tween per event, layout read per event or second animation clock.
- Preserve the scoped `useGSAP` / named `gsap.matchMedia()` lifecycle and explicit
  cleanup. The project prohibition on `contextSafe` overrides the general skill
  recommendation because these callbacks create no GSAP objects.
- Keep pointer input scoped to the band and mouse-only. Touch/coarse-pointer
  scrolling remains native and receives autonomous motion without disturbance.
- Preserve aspect-correct local coordinates, velocity bounds, edge safety,
  pointer exit/cancel, resize, scroll, visibility and offscreen handling. A first
  move or stationary re-entry must not create a velocity spike.
- Reduced motion disables autonomous and pointer motion. No-JavaScript,
  unsupported-WebGL, shader-failure and context-loss cases keep the image.
- Retain capped rendering resolution and no per-frame allocation. If the shader
  needs another uniform or wake sample, justify and profile it; prefer tuning the
  existing data path.
- Verify any added browser/WebGL API against installed types or official docs.
  No dedicated shader/design skill is installed. No dependency, backend, secret,
  external request or data transmission is expected.

## Measurement and acceptance

1. Before editing, reproduce prompt 134's deterministic pointer trajectory in a
   production build. Capture its same-phase, zero-wake comparison and record the
   lead position, nearby mean pixel difference, distant mean pixel difference,
   decay and idle/active timing. This is the baseline for the tuning.
2. Run that identical trajectory after tuning. The nearby same-phase difference
   must be materially greater than baseline and visibly stronger in paired crops;
   the distant comparison remains at baseline/noise. State the measured change,
   not only that it "looks more vivid."
3. Add a correspondence probe that finds the changed-pixel influence centroid or
   peak region at fixed phase and compares it with the known pointer coordinate.
   The final lead offset must be smaller than baseline for slow and medium sweeps.
   Inspect fast reversals frame by frame to confirm the lead changes direction
   promptly while older wake samples trail behind.
4. Record at least two 12-second idle periods followed by slow sweeps, medium
   sweeps, fast reversals, stopping, leaving and stationary re-entry. Inspect dot
   integrity, fold continuity, band edges and the loop boundary. Include a
   side-by-side or alternating baseline/final pointer excerpt when practical.
5. Confirm that slow motion is visible, speed scales the response, rapid sweeps
   cannot expose blank edges, stopping decays smoothly, and exit settles fully.
   Do not confuse autonomous phase differences with pointer evidence.
6. Re-run Chromium and Firefox lifecycle checks on `/about` and `/`: reduced
   motion, no JavaScript, offscreen/hidden pause and resume, resize, high DPR,
   coarse/touch input, context loss, route away/return and zero page/console
   errors. Run the documented WebKit leg if Podman is available; report the
   environmental block exactly if it remains unavailable.
7. At 375, 800 and 1280 widths, compare footer, band, nav and wordmark boxes with
   baseline. Heights remain 120/210/280. Mask the animated band and require the
   remainder of the footer to compare at `AE 0 (0)`; follow the site's other
   page-motion masking rules.
8. Profile visible idle and pointer-active work without recording overhead. A
   more vivid effect may not introduce per-event rendering or a material JS
   submission regression. Report browser, renderer, buffer size, frame intervals
   and submission cost, with software-rendering limitations stated plainly.

## Expected impact and prerendering

Every shared `SiteFooter` consumer gains the stronger, more corresponding mouse
response. Server-rendered markup and route modes must remain unchanged. Verify
the current prerendered path set rather than assuming its count. Client chunk
content may change; report that separately from rendered-markup equality. CSS
should remain byte-identical because the change belongs in the existing canvas.
Build baseline and final in equivalent Tailwind scan environments.

## Non-goals

No autonomous speed or fold redesign, dot-style redesign, footer geometry,
typography, nav, wordmark, links, palette, page content, global pointer effect,
custom cursor, tooltip, click/hold state, touch gesture, controls, audio, backend,
dependency or generated-asset changes. Preserve unrelated
`.claude/settings.local.json`.

## SKILLS USED

- `gsap-core` — retain the single continuous clock and named reduced-motion
  lifecycle while tuning transient input around it.
- `gsap-react` — preserve scoped setup and complete listener/GPU cleanup, subject
  to the project's explicit `contextSafe` prohibition.
- `gsap-performance` — keep high-frequency input allocation-free and compare
  idle versus active frame cost.
- `nextjs` — preserve the existing client boundary and server-rendered markup.
- `vercel-react-best-practices` — keep pointer position and velocity in transient
  lifecycle state without React renders.
- `browser-use` — production visual, pointer, lifecycle and recording checks;
  use the installed Playwright package if the browser-use executable is absent.

No Tailwind change is planned, so `tailwind-4-docs` is not required. Reload every
listed skill before implementation.

## Checks, documentation and delivery

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, plus the
focused browser, visual, prerender, pointer-correspondence and performance checks
above. Record the final judged parameters, baseline/final measurements, browser
results, artifacts and limitations in `docs/motion-site.md`. Update
`docs/chrome.md` only if its concise cross-reference needs clarification. Add a
probe procedure to `docs/automation.md` only if it is genuinely reusable beyond
this one tuning pass.

Commit this prompt, implementation and owning documentation to `main`; do not
push. Provide exact local review steps and a final recording.

## Execution gate

Prepared under AGENTS.md section 1. Implement after approval; `y` or `Y` means
approved, execute.

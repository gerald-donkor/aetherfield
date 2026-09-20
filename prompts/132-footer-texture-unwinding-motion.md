# Footer texture: continuous unwinding folds

## Scope and intent

Animate the halftone fabric strip in the shared SiteFooter, as explicitly requested
on 20 September 2026. This user-requested site change is next; it is independent
of the backend sequence. The user circled the texture and asked for constant pixel
movement with an AI algorithmic, DNA-unwinding feel.

The request authorises motion within this otherwise settled band. Preserve the
footer's geometry, colours, navigation, typography, wordmark and existing reveals.
Apply the effect wherever the shared footer renders.

## Reference material

- User screenshot: `/home/dgk/Pictures/screenshot-2026-09-20_20-11-44.png`
  (attached in the conversation). The red outline is annotation, not artwork.
- `AGENTS.md`, especially settled surfaces, GSAP discipline and prompt workflow.
- `docs/chrome.md`: settled footer, band image and responsive dimensions.
- `docs/motion-site.md`: footer split blur-in, cleanup traps and wordmark timing.
- `docs/automation.md`: font readiness, motion masking and build normalization.
- `docs/skills.md`: installed skills and excluded capabilities.
- `app/_components/chrome.tsx`: SiteFooter and the existing image element.
- `app/_components/motion/footer-reveal.tsx` and `motion/register.ts`.
- `/public/assets/generated/texture-brand.png`: existing source texture; inspect
  the actual asset before implementing its deformation.
- `package.json` and installed Next.js `use-client.md` documentation under
  `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/`.

Repository evidence at preparation: HEAD `e837277`; the band is a static
next/image, separate from the existing text reveal. Highest prompt number is 131.
Unrelated untracked `.claude/settings.local.json` must be left alone.

## Visual and implementation brief

Create coherent travelling folds: neighbouring parts of the halftone texture
compress, stretch and twist in phase-offset waves, suggesting a helix continually
unwinding. The dots must move with the folds, retaining the yellow/olive fabric
character. Motion should remain perceptible when the user stops scrolling.
Avoid a flat image pan, a whole-strip wobble, random static, blinking particles,
hard loop resets or a literal diagram of DNA.

Use a compact client component under `app/_components/motion/`, with the current
image as the prerendered, no-JavaScript and reduced-motion fallback. Prefer one
canvas rendering the existing image through a continuous spatial deformation;
select Canvas 2D or a small native WebGL shader after checking quality and cost.
Do not add a rendering library. Verify any chosen browser APIs against installed
types or official documentation before using them; no dedicated shader/design
skill is available in this session.

Keep the original image in layout and place the decorative rendering within its
exact box. Only expose the animated layer after its first successful render.
Failure to initialise or load must leave the original texture visible. If WebGL
is selected, handle context loss and release its resources on cleanup.

Use the existing GSAP lifecycle for the motion clock, named full/reduced motion
conditions, scoped useGSAP and mm.revert cleanup. Never use contextSafe. Reuse
register.ts exports; a constant-speed periodic phase may use linear progression
as a documented exception to the one-shot reveal ease. Author any loop duration
as an explicit judgement for this new continuous motion, not a measured value
from the static screenshot. Do not change shared DUR/EASE or existing reveals.

Use elapsed-time motion, no per-frame React state updates. Pause work offscreen
and while the document is hidden; resume without jumping. Handle resize and
live reduced-motion changes, cap rendering resolution, and clean up all clocks,
observers, listeners and rendering resources on navigation. Keep the layer
aria-hidden and pointer-transparent.

## Geometry and measurement procedure

Existing band height is 120px below sm, 210px from sm, and 280px from lg; width
comes from the current max-width container and its existing gutters. These are
source values, not measurements inferred from the screenshot.

Before editing, capture band and surrounding footer bounding boxes at viewport
widths 375, 800 and 1280. Repeat after implementation and require identical
dimensions and positions at the same scroll position. Inspect frames through at
least two full periods and the wrap boundary: continuous directional folds,
stable dot detail, no gaps, seams, flashes or visible reset. Tune speed and
amplitude by visual judgement and record the final values as such.

Capture and inspect a motion recording plus desktop/mobile stills. Check reduced
motion and no-JavaScript against the original image. Compare the rest of the
footer after its text reveal settles. Mask the animated band in image diffs,
alongside any existing moving areas described in docs/automation.md; report each
region separately. Profile visible and offscreen work, report measured frame
behaviour and machine/browser context, and reduce quality if rendering janks.

## Expected impact and prerendering

All routes that render SiteFooter gain the shared band enhancement. At preparation
these include `/`, `/journal`, `/about`, `/careers`, `/design-system`,
`/article/[slug]`, `/job-listing/[slug]`, `/account`, `/dashboard`, `/targets`,
`/activity`, `/activity/[importId]`, `/activity/mappings`, `/activity/factors`,
`/reports`, `/reports/[reportId]`, `/submissions`, and routes or boundary states
using AuthShell or WorkspaceBoundary. Enumerate transitive consumers when
executing to confirm the complete set.

No route changes render mode. Routes containing the footer may differ only in
the band's markup and necessary client references. Every other route's normalized
prerendered HTML must remain identical. Compare baseline and final production
builds using docs/automation.md's normalization and equivalent build locations;
report markup and flight-payload effects honestly, without claiming literal
byte identity across changed build identifiers.

## Non-goals

No navbar or footer link changes, no wordmark restyling or timing change, no
homepage capabilities animation changes, no new palette, generated replacement
artwork, backend, AI service calls, dependencies or unrelated refactors. The AI
feel is visual motion, with no model involved. Preserve existing Tailwind classes;
use narrowly scoped native styles for the rendering layer if needed.

## SKILLS USED

- `nextjs` — client boundaries, static fallback and local Next.js documentation.
- `vercel-react-best-practices` — animation refs, rendering cost and bundle scope.
- `gsap-core` — continuous phase and named reduced-motion conditions.
- `gsap-react` — scoped useGSAP lifecycle; project ban on contextSafe takes precedence.
- `gsap-performance` — pause inactive work, bound frame cost and verify performance.
- `tailwind-4-docs` — preserve established responsive classes and CSS conventions;
  the local gotchas and engineering playbook were read during preparation. No new
  Tailwind APIs are proposed; consult current verified docs if that changes.
- `browser-use` — browser inspection and visual motion verification.

Reload every listed skill before implementation. No applicable design/shader
skill is installed; use the reference image, project records and verified native
browser documentation for that surface.

## Checks, documentation and delivery

- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
  Report actual output and any blocked check without inventing success.
- Run focused browser checks on `/` and another shared-footer route, including
  mobile, resizing, route-away/return, reduced motion, no JavaScript and console
  errors. Check Chromium and Firefox; use the documented pinned WebKit workflow
  if native WebKit is unavailable. Avoid unrelated authenticated mutation tests.
- Verify baseline/final prerender impact and unchanged footer geometry as above.
- Record the implementation, final judged motion parameters, checks and measured
  limits in `docs/motion-site.md`; add a short footer-band update in
  `docs/chrome.md`. Record reusable new measurement mechanics in
  `docs/automation.md` if discovered. Do not expand AGENTS.md's build record.
- Provide exact run/review steps and the captured motion artifact if available.
- Commit the executed prompt, implementation and documentation to main; do not
  push. Preserve all unrelated user work.

## Execution gate

This file is the prepared brief only. Implement after the user approves it under
AGENTS.md section 1, steps 6-7; `y` or `Y` is approval.

# Prompt 139 — Fix navbar character-wave rendering

## Scope and why this is next

Correct prompt 138's desktop navbar character wave, which currently advances
inside GSAP but does not visibly transform its glyphs in the browser. This is
the user's current reported regression and directly repairs the immediately
preceding implementation; it is independent of the backend build sequence.

The defect is isolated to the generated SplitText character boxes in
`app/_components/motion/nav-link-wave.tsx`. Preserve prompt 138's intended
motion, timing, media gates, semantics, geometry, CTA arrow behavior and bundle
shape. Do not redesign the effect or touch the settled navbar chrome.

## Reference material read

- User recording:
  `/home/dgk/Videos/screenrecording-2026-09-21_14-41-00.mp4`.
- `AGENTS.md`, especially the settled-chrome, GSAP, bundle, measurement,
  prompt-approval and anti-fabrication rules.
- `prompts/138-navbar-link-character-wave.md`, including its recording
  measurements and implementation contract.
- `docs/chrome.md`, especially the fitted `SiteNav` and drawn CTA arrow.
- `docs/motion-site.md`, especially "The navbar's per-character rollover" and
  the site's shared motion discipline.
- `docs/automation.md`, especially the reference-recording and production
  browser measurement workflows.
- `app/_components/chrome.tsx`.
- `app/_components/motion/nav-link-wave.tsx`.
- `app/_components/motion/nav-drop.tsx`.
- `app/_components/motion/register.ts`.
- `app/_components/primitives.tsx`, especially `LinkButton`.
- `app/globals.css`.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.
- The installed GSAP/SplitText implementation and types in `node_modules/gsap/`.
- Tailwind CSS 4's locally synced `display`, `transform`, and engineering
  guidance.

## Confirmed cause and measurements

The source MP4 is 610x128, constant 60 fps and 16.25 seconds. Prompt 138's
measurements remain the target: a visible left-to-right full-turn pass on both
pointer entry and exit, about 12 source pixels above and below the baseline,
0.017–0.025 seconds between visible glyph onsets, and about 0.37–0.40 seconds
for the twelve-character reference label.

The committed production implementation creates SplitText characters with
`tag: "span"`. Those generated glyphs compute to `display: inline`. Although
GSAP writes a transform matrix, transforms do not visually affect ordinary
inline boxes. A production Playwright probe, after fonts and the existing
navbar entrance had settled, sampled the first Product glyph 22 ms into hover:

- committed glyph: `display: inline`, computed transform
  `matrix(-0.879012, 0.4768, -0.4768, -0.879012, 0, -3.7969)`, but its rendered
  box remained 11x17 at the line position instead of rotating/translating;
- the same built page with only a temporary DevTools
  `display: inline-block` on generated character spans produced a visibly
  transformed box at that sample: x 793 → 789.851, y 20.591 → 16.549, and
  11x16 → 17.298x19.309 as the glyph rotated.

This establishes the defect and the correction class without editing the
repository. The earlier prompt 138 verification that read GSAP/computed
transform values was a false positive: a written matrix is not proof that a
glyph's painted or rendered box moved.

## Implementation contract

- Make every generated SplitText character a transformable inline-level box
  while its split is active. Prefer the smallest local mechanism supported by
  the installed SplitText API or one scoped GSAP setup write; do not add a
  global selector for SplitText output and do not style unrelated spans.
- Keep the rendered tag as `span`, preserve inline flow, and do not turn a
  glyph into a full-width block. The corrected computed display must be
  `inline-block` or an equivalent transformable inline-level box.
- Preserve the existing explicit transform endpoints, four-quarter full turn,
  `Y = 12`, `CHAR_DUR = 0.04`, `CHAR_STAGGER = 0.02`, imported `EASE`, forward
  replay on both pointer boundaries, and explicit resting `y`/rotation. Change
  those only if frame evidence shows the display fix exposes a separate
  mismatch; record any such finding as measured or judged.
- Preserve the named `gsap.matchMedia()` conditions and the exact desktop
  threshold. Reduced-motion, coarse-pointer, non-hover and below-`md` contexts
  must remain unsplit and static.
- Preserve automatic ARIA, one accessible name per link, all destinations,
  auth-aware `Get started`/`Account` rebuilding, listener cleanup,
  `mm.revert()`, and the prohibition on `contextSafe`.
- Preserve the CTA arrow as an ignored, independently animated SVG. Its
  existing 6px hover travel must still compose with the text wave.
- Do not add `overflow-hidden` to the nav or any ancestor. The source button's
  capsule clipping is not part of Aetherfield's navbar treatment.
- Keep `NavLinkWave` component-only. Do not export constants or types, add a
  dependency, register another plugin, or import any `home/` client module.
- Correct the inaccurate prompt-138 record in `docs/motion-site.md`: retain
  useful intent and measurements, but state that the original inline spans did
  not paint the claimed motion and record the verified corrected behavior.
  Never leave the earlier false-positive claim standing as if it described
  commit `8f1f6d5` accurately.

## Measurement procedure and acceptance

Use a production build at 1280px with a real fine hover pointer, fonts ready,
and the existing navbar drop-in fully settled.

1. Before hover, record computed `display`, transform and
   `getBoundingClientRect()` for representative generated glyphs. During a
   clean pass, sample on animation frames or at 60 fps. Acceptance requires the
   actual glyph rectangles or painted pixels to move and rotate with the
   authored transform; a changing computed matrix or `gsap.getProperty()` alone
   is explicitly insufficient.
2. Capture a short browser recording or frame sequence and compare it visually
   with source frames `f0173`–`f0195` and `f0225`–`f0249`. It must show the
   unmistakable compact full-turn wave on both entry and exit, left to right,
   rather than merely reporting timeline progress.
3. Re-measure the enclosing nav, all five anchors and four gaps before and
   after the display correction. Resting x/y/width/height must remain within
   prompt 138's 0.5 CSS-pixel ceiling, all gaps must remain 28px, and a
   no-hover image comparison must show no new visible settled change beyond
   subpixel glyph-edge rasterisation. If inline-block alters geometry beyond
   the ceiling, stop and find a scoped transformable-box treatment that does
   not compensate by changing nav spacing.
4. Verify all glyphs explicitly return to rest after pointer entry, pointer
   exit and rapid repeated boundary crossings; no transform or display state
   may become stuck.
5. Recheck accessible names, destinations, the auth-aware label swap, the CTA
   arrow's 6px travel, 375/800/1280 responsive behavior, reduced motion,
   coarse/non-hover input and route-navigation cleanup.

## Expected impact

Runtime behavior changes only for the already-marked desktop navbar links:
their existing generated character spans become transformable and the intended
wave finally becomes visible.

No route should change render mode or data access. Prefer a runtime-only style
on SplitText's generated DOM, so prerendered HTML should remain identical to
commit `8f1f6d5` after the normal build-id/chunk normalisation. If an emitted
class is required instead, the only acceptable prerender delta is that scoped
class on the existing motion boundary; enumerate and verify it. Route counts,
chunk counts, and the number of chunks containing GSAP/SplitText must remain
unchanged. Measure any JS or CSS byte delta rather than assuming it.

## Non-goals

- No navbar glass, geometry, typography, spacing, colour, sticky behavior or
  load-time drop-in changes.
- No wordmark, mobile-menu, footer, page-section or backend UI changes.
- No new animation concept, opacity, blur, clipping, layout-property tween,
  token, dependency or route.
- No change to the CTA arrow drawing or its independent Tailwind motion.
- Do not modify the unrelated existing working-tree change in
  `.agents/skills/tailwind-4-docs/references/docs-source.txt`.

## Verification

Run and quote the exact output of:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:local
git diff --check
```

Compare the production route table, normalised prerendered HTML, emitted CSS,
route chunk counts and GSAP/SplitText-containing chunks against commit
`8f1f6d5`. Record the actual rendered-box/frame evidence, settled geometry,
accessibility, media-gate behavior, prerender result and bundle delta in
`docs/motion-site.md`. Update `docs/chrome.md` only if the correction discovers
a genuinely new chrome invariant. Commit the approved prompt and implementation
to `main`; do not push.

## SKILLS USED

- `agent-browser` — inspect the production DOM, real pointer hover, rendered
  glyph boxes, frame sequence, accessibility tree and responsive media gates.
- `nextjs` — preserve the existing client boundary, hydration, prerender modes
  and shared bundle shape under the installed Next.js 16 behavior.
- `tailwind-4-docs` — verify the transformable inline display treatment and any
  emitted utility against the locally synced Tailwind CSS 4 documentation.
- `gsap-core` — preserve transform-only tween semantics, match-media control,
  explicit resting state and cleanup.
- `gsap-react` — preserve the scoped `useGSAP` lifecycle, dependency rebuild and
  reversion behavior.
- `gsap-timeline` — retain the prebuilt replayable per-link sequence and verify
  timeline completion under rapid boundary events.
- `gsap-plugins` — use the installed SplitText API to create transformable
  character wrappers without breaking ARIA, smart wrapping or reversion.
- `gsap-performance` — keep the corrected visible effect compositor-safe and
  avoid layout or paint-heavy animated properties.

# Prompt 140 — Add a slower footer link character wave

## Scope and why this is next

Replicate prompt 139's verified desktop navbar per-character rollover on the
footer navigation links, at a deliberately slower pace as requested by the
user. This focused site-motion change is independent of the backend build
sequence.

The footer is settled. Add only a runtime desktop fine-pointer hover
affordance to its link labels. Preserve the existing slow scroll-triggered
footer entrance, wordmark, texture interaction, layout, destinations and
mobile treatment.

## Reference material read

- `AGENTS.md`, particularly its settled-surface, client-boundary, GSAP,
  overflow, measurement, prompt, verification and commit rules.
- `docs/chrome.md`, particularly the settled `SiteFooter` geometry.
- `docs/motion-site.md`, especially the footer split blur-in and navbar
  character rollover records.
- `docs/automation.md`, especially production-browser, screenshot and
  normalised-prerender comparison procedures.
- `prompts/138-navbar-link-character-wave.md` and
  `prompts/139-fix-navbar-character-wave-rendering.md`.
- `app/_components/chrome.tsx`,
  `app/_components/motion/footer-reveal.tsx`,
  `app/_components/motion/nav-link-wave.tsx`,
  `app/_components/motion/register.ts`, and `app/globals.css`.
- Next's installed server/client-components and `use client` guides, the
  installed GSAP/SplitText API and types, and Tailwind CSS 4 engineering
  guidance.

## Interaction and pacing contract

- Target only footer navigation anchors. At implementation, enumerate the
  actual anchors from `NAV_ITEMS` plus Get started and record the count. Do
  not target the copyright, wordmark, texture or other footer content.
- Use the navbar's visual language: each visible glyph makes a left-to-right,
  transform-only full turn with explicit values
  `y: 0 -> -12 -> 0 -> 12 -> 0` and
  `rotation: 0 -> 90 -> 180 -> 270 -> 360`, then explicitly lands at
  `y: 0, rotation: 0`.
- Both `pointerenter` and `pointerleave` replay the same forward pass; do
  not reverse exit or create tweens in an event callback.
- The slower speed is a user-directed judgement, not a video measurement:
  multiply prompt 139's 0.04-second quarter and 0.02-second stagger by 1.5,
  giving 0.06 seconds and 0.03 seconds. A ten-glyph label is therefore about
  0.51 seconds, versus the navbar's 0.34 seconds. Reuse imported `EASE`.
  If a production recording does not visibly establish a slower cadence or
  reveals a defect, report it rather than inventing a second timing scale.
- Run only when all named media conditions agree: min-width 48rem, hover,
  fine pointer and reduced-motion no-preference. Mobile, coarse/non-hover and
  reduced-motion contexts retain static, original unsplit text.

## Implementation contract

- `FooterMotion` already owns SplitText for these exact anchors during the
  slow scroll reveal. Do not create an independent nested splitter that races
  with, is reverted by, or corrupts that owner. Use one coordinated, scoped
  GSAP/SplitText lifecycle, whether extending `FooterMotion` or introducing
  a strictly coordinated component-only leaf. Prove that entrance, hover, font
  readiness, resize, breakpoint change, route navigation and unmount leave no
  stale split nodes, listeners or timelines.
- Preserve the entrance unchanged: individual-link automatic ARIA,
  word splitting, autoSplit, its one ScrollTrigger gate, FOOTER_DUR 1.0,
  FOOTER_STAGGER 0.12, blur values, wordmark lead-in and clear-property
  restrictions. The hover wave must coexist without delaying, replacing or
  restarting the wordmark.
- Reuse `gsap`, `SplitText`, `useGSAP` and the one registration module.
  Do not register another plugin or add a package. Any new leaf renders the
  semantic element it takes over and exports no constants or types.
- Split links separately with automatic ARIA and `tag: "span"`; use a scoped
  runtime `display: "inline-block"` setup on generated characters, as prompt
  139 verified. No global SplitText selector. Preserve one accessible name and
  ordinary destination per anchor.
- Build one paused timeline per link synchronously in `useGSAP` and a named
  `gsap.matchMedia()` handler. Event listeners only restart pre-built
  timelines; remove them in match-media cleanup and return `mm.revert()`.
  Do not use `contextSafe`.
- Keep existing hover opacity, hrefs, classes, wrapping, 28px horizontal link
  gap, copyright, wordmark SVG and current overflow unchanged. Do not add
  overflow clipping, will-change, filters, opacity animation, layout-property
  animation, static styles or Tailwind utilities. Never clear opacity or
  transform properties.
- Keep the leaf component-only and out of `home/`. No routes, server code,
  data access, dependencies, tokens or test framework work.

## Measurements and acceptance

Use a production build with fonts ready, at 1280px on a fine hover pointer.

1. Record entry and exit on Product, Get started and one representative
   single-word link. Painted glyph rectangles or frames, not only computed
   matrices, must show the full-turn left-to-right motion and exact resting
   state. Confirm the slower ten-glyph pass is about 0.51 seconds.
2. Measure the footer nav and every anchor before and after hydration: width,
   height, x/y and each gap. Settled deltas must be within 0.5 CSS px and gaps
   remain 28px. Inspect a no-hover screenshot for changed kerning or raster.
   Stop and report if splitting cannot meet this ceiling.
3. Test rapid 55ms boundary crossings, resize through 48rem, navigation away
   and back, font readiness and the existing scroll reveal. No duplicate
   listener, stuck transform, nested SplitText artifact, detached animation or
   replayed wordmark/entrance is allowed.
4. Check the footer accessibility tree and destinations before and while split.
   Named links, copyright and wordmark semantics remain unchanged.
5. At 375, 800 and 1280px, and for reduced motion, coarse pointer and
   non-hover, confirm functional links and unsplit static unsupported contexts.

## Prerender impact

All routes render `SiteFooter`, but this should be runtime-only. Expected
static HTML impact: none. No route render mode or data access change. Verify
all 21 normalised prerendered HTML files.

## Non-goals

- No footer restyle, wordmark or texture-motion change, or footer entrance
  timing change.
- No navbar change; it is reference-only.
- No mobile/touch wave, CTA redesign, item/destination change, backend, auth,
  form, API, provider, dependency, token or route work.
- Do not modify the unrelated existing change in
  `.agents/skills/tailwind-4-docs/references/docs-source.txt`.

## Verification and record

Run and quote exact output for `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`, `npm run test:e2e:local`, and
`git diff --check`.

Use `docs/automation.md` production-browser and normalised-prerender
procedures; use its prescribed masks for /, /journal and /careers rather than
bare page-wide AE. Compare emitted CSS, route chunk counts and
GSAP/SplitText-containing chunks with `7db1e0a`. Record implementation, the
coordinated SplitText lifecycle, frame/geometry evidence, slower-speed
judgement, media/accessibility behavior, prerender/bundle result, exact check
output and any unrelated E2E failure in `docs/motion-site.md`. Update
`docs/chrome.md` only for a genuinely new chrome invariant.

Commit the approved prompt, implementation and documentation to main; do not
push.

## SKILLS USED

- `agent-browser` — production pointer interaction, geometry, accessibility,
  media contexts and recorded visual movement.
- `nextjs` — narrow client boundary, hydration, prerendering and shared
  bundle shape.
- `tailwind-4-docs` — ensure no static utility or style alters settled
  Tailwind CSS 4 footer behavior.
- `gsap-core` — transform-only tweening, media conditions, rest states and
  cleanup.
- `gsap-react` — scoped useGSAP lifecycle and reversion.
- `gsap-timeline` — prebuilt replayable four-quarter sequences.
- `gsap-plugins` — SplitText ARIA, inline tags, font/resize re-splitting and
  reversion without conflicts.
- `gsap-performance` — a small transform-only hover target set without
  layout work or unnecessary layer promotion.

# Prompt 141 — Make footer-link motion responsive

## Scope and why this is next

Correct the uncommitted footer character-wave work from prompt 140 so the
shared `SiteFooter` remains functional and visually stable at every supported
viewport and input capability. The user reported tablet/mobile failure. This
prompt is a focused repair to the approved footer interaction, not a footer
restyle or a new motion surface.

## Reference material read

- `AGENTS.md`, especially settled chrome, client-boundary, GSAP lifecycle,
  measurement, verification and commit rules.
- `docs/chrome.md`, `docs/motion-site.md`, and `docs/automation.md`.
- `prompts/138-navbar-link-character-wave.md`,
  `prompts/139-fix-navbar-character-wave-rendering.md`, and
  `prompts/140-footer-link-character-wave.md`.
- `app/_components/chrome.tsx`,
  `app/_components/motion/footer-reveal.tsx`,
  `app/_components/motion/nav-link-wave.tsx`, and `motion/register.ts`.
- Installed Next.js Server/Client Component and `use client` guides, Tailwind
  CSS 4 engineering guidance, and installed GSAP / SplitText guidance.

## Responsive interaction contract

- The five footer anchors are Product, Journal, About, Careers, and Get
  started. Their hrefs, accessible names, layout, 28px horizontal gap and
  existing word-based entrance remain intact at 375px, 800px and 1280px.
- The slower per-character wave is an enhancement, not a prerequisite: it may
  run only when a hover-capable fine pointer and reduced-motion
  no-preference are present. Do not use viewport width alone as an input proxy;
  a tablet with a mouse may receive the enhancement, and a touch tablet may
  not.
- At mobile/touch, coarse/non-hover, and reduced-motion contexts, retain the
  original static link labels after the established word entrance; do not
  create character wrappers, hover timelines or pointer listeners. Links must
  still navigate normally.
- At fine-pointer widths, preserve the prompt-140 transform-only four-quarter
  wave (`y: 0 -> -12 -> 0 -> 12 -> 0`, rotation through 360), its explicit
  rest state, `EASE`, 0.06-second quarters and 0.03-second stagger. Both
  pointer boundaries replay the forward pass.

## Implementation contract

- Repair the one coordinated `FooterMotion` lifecycle; do not add a nested
  splitter, a global selector, an extra plugin registration, dependency,
  static utility, global style or layout box.
- Preserve the existing global word entrance, autoSplit behavior, one
  ScrollTrigger gate, footer/wordmark timings, blur and clear-property rules.
  Split characters only inside the matching fine-pointer lifecycle so the
  baseline mobile/tablet structure remains the established word split.
- Use named `gsap.matchMedia()` conditions, `useGSAP` with its existing scope,
  prebuilt paused timelines, scoped `inline-block` character nodes, listener
  cleanup and `mm.revert()`. Never use `contextSafe`, never clear opacity or
  transform, and never create a tween in an event callback.
- Breakpoint, pointer-capability, font readiness, route navigation and unmount
  must remove generated nodes, listeners, timelines and inline transforms.

## Measurements and acceptance

Use production builds with fonts ready at 375px touch/coarse, 800px coarse and
fine-pointer variants, and 1280px fine pointer:

1. Check five named functional destinations and unchanged footer geometry,
   including every anchor width/height/x/y and 28px gaps. Fine-pointer split
   deltas must remain within 0.5 CSS px; static contexts retain the established
   word-only rendering.
2. At fine pointer, record entry and exit on Product and Get started with
   painted glyph boxes plus transform evidence; the ten-glyph pass remains
   about 0.51 seconds and ends exactly at rest.
3. At every unsupported context, prove zero character spans and no page errors;
   at 375px and 800px, exercise every link and confirm navigation works.
4. Resize through 48rem and switch pointer/reduced-motion emulation live where
   possible. No stale split nodes, duplicate callbacks, stuck transforms or
   restarted footer entrance/wordmark are allowed.

## Prerender impact

None expected: runtime-only client behavior. Verify the 21 normalised
prerendered HTML outputs and unchanged route modes.

## Non-goals

- Do not restyle or resize the settled footer, alter the texture/wordmark,
  alter navigation labels/destinations, or add a touch-only animation.
- No navbar, backend, route, data, dependency, token, CSS-system or test
  framework changes.
- Do not modify the unrelated Tailwind skill snapshot change.

## Verification and record

Run and quote exact output for `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`, `npm run test:e2e:local`, and `git diff --check`. Use
`docs/automation.md` for browser/prerender comparison and its required masks.
Record the responsive behavior, media conditions, geometry, accessibility,
prerender/bundle result and exact checks in `docs/motion-site.md`.

Commit the prompt, implementation and documentation to `main`; do not push.

## SKILLS USED

- `agent-browser` — production browser interaction, media-context and
  accessibility checks.
- `nextjs` — narrow client boundary and prerender verification.
- `tailwind-4-docs` — preserve settled Tailwind CSS 4 footer styling.
- `gsap-core` — media conditions, transform-only motion and rest state.
- `gsap-react` — scoped lifecycle and cleanup.
- `gsap-timeline` — prebuilt replayable waves.
- `gsap-plugins` — coordinated SplitText ARIA and reversion.
- `gsap-performance` — transform-only target set and no unnecessary layers.

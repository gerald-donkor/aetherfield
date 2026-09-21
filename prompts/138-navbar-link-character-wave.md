# Prompt 138 — Navbar link character-wave hover

## Scope and why this is next

Add the supplied per-character rollover animation to the **desktop `SiteNav`
links only**: Product, Journal, About, Careers, and the auth-aware final label
(`Get started` or `Account`). This is the user's current site-motion request and
is independent of the backend build sequence.

The animation must reproduce the reference's character wave without changing
the settled navbar: the sticky header, fitted glass, gutters, 60px height,
type, link gaps, colours, destinations, auth-aware CTA behavior, drawn arrow,
and load-time `NavDrop` remain as they are. The wordmark is not part of the
hover treatment. The mobile panel is not part of it because it has no hover
interaction and its large links must remain plain.

## Reference material read

- User still: `/home/dgk/Pictures/screenshot-2026-09-21_14-38-24.png`.
- User recording:
  `/home/dgk/Videos/screenrecording-2026-09-21_14-41-00.mp4`.
- `AGENTS.md`, especially the settled-chrome, bundle, GSAP, measurement,
  workflow, and anti-fabrication rules.
- `docs/chrome.md`, especially `SiteNav`, its fitted glass, link data, auth-aware
  CTA, and drawn-arrow invariants.
- `docs/motion-site.md`, especially the navbar drop-in and the shared motion
  conventions.
- `docs/automation.md`, especially the reference-recording extraction and PTS
  workflow and the prerender comparison procedure.
- `app/_components/chrome.tsx`.
- `app/_components/motion/nav-drop.tsx`.
- `app/_components/motion/register.ts`.
- `app/_components/primitives.tsx`, especially `LinkButton`.
- `app/globals.css`.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`.
- The installed GSAP/SplitText implementation and type declaration in
  `node_modules/gsap/`.

## Recording measurements

The MP4 is 610x128 at a constant 60 fps and 16.25 seconds. Although the
container advertises 981 frames, passthrough decoding and the PTS table both
produce 975 frames, which is consistent with 16.25 seconds at 60 fps. Use the
decoded frames and their own `pts_time` entries, not the container's frame
count.

The clean first pointer-entry pass starts visibly at `f0173`, 2.866667s, and is
settled by about `f0195`, 3.233333s. The clean pointer-exit pass starts visibly
at `f0225`, 3.733333s, and is settled by approximately `f0247`–`f0249`,
4.100000–4.133333s. The observed complete-pass band is therefore about
**0.37–0.40s**.

What those frames resolve:

- The 12 visible characters of “Subscribe Now” move independently from left to
  right; whitespace is not a visible animated target.
- Each character makes one compact full-turn loop and returns to its exact
  resting transform. Its centre reaches roughly **12 source pixels above and
  below** the resting centre. Treat 12px as the measured reference amplitude;
  scale it to Aetherfield's existing 16px nav type only if a render comparison
  demonstrates that the source recording's text size differs.
- Successive character onsets are about one source frame apart, occasionally
  two because of raster/compression ambiguity. Fit inside **0.017–0.025s per
  visible character** rather than claiming a more precise stagger.
- Pointer entry and pointer exit both run the **same forward, left-to-right
  pass**. Exit is not the reverse of entry.
- The recording resolves rotation direction, vertical excursion, order, and
  total visible time. It does **not** reliably separate nearby easing curves.
  Compare a constant angular phase with the project's imported `EASE`; if the
  frames cannot distinguish them, use the project's existing motion vocabulary
  and record that as a judgement. Do not describe the chosen curve as measured.
- The source button clips the most distant glyph positions against its own
  capsule. That clipping is a property of the reference button, not a licence
  to put `overflow-hidden` on `SiteNav` or any ancestor. The navbar must keep
  its existing overflow behavior.

Re-run the measurement from the source rather than relying on a scrubbed video:

```sh
ffprobe -v error -select_streams v -show_entries frame=pts_time \
  -of csv=p=0 /home/dgk/Videos/screenrecording-2026-09-21_14-41-00.mp4 > pts.csv
ffmpeg -v error \
  -i /home/dgk/Videos/screenrecording-2026-09-21_14-41-00.mp4 \
  -fps_mode passthrough -q:v 2 all/f%04d.jpg
```

Use contact sheets over `f0165`–`f0200` and `f0219`–`f0251`, with each filename
mapped to the same-numbered line in `pts.csv`.

## Implementation contract

- Keep `SiteNav`'s current client boundary. Add a component-only shared motion
  leaf under `app/_components/motion/` that renders the existing desktop
  `<nav>` element itself, taking over its class string and children so it adds
  no layout box. Do not move nav data or export a constant/type from the leaf.
- Mark only the five desktop anchors as animation targets. The motion leaf may
  use inert data attributes, but the resting DOM must remain semantically five
  links with the same accessible names and destinations.
- Reuse `gsap`, `SplitText`, `useGSAP`, and the existing registration from
  `motion/register.ts`; do not register another plugin or add a dependency.
  Split each target link individually, never the enclosing `<nav>`, so
  SplitText's ARIA handling preserves one accessible name per link. Ignore the
  CTA's `aria-hidden` arrow SVG rather than splitting or animating it.
- Build each link's paused animation synchronously inside `useGSAP` and the
  named `gsap.matchMedia()` handler. Event listeners may only control those
  already-created animations. Do not create a tween from an event callback and
  do not use `contextSafe`.
- Name every media condition. Run the effect only for a fine pointer that can
  hover and when reduced motion is not requested. Reduced motion and
  non-hover/touch contexts must leave the original unsplit text in place and
  create no tween.
- Use compositor-safe character transforms only. Reproduce the measured
  vertical full-turn wave, left-to-right stagger, and complete-pass band. Both
  `pointerenter` and `pointerleave` replay the same forward pass. Every pass
  must land at explicit `y: 0` and `rotation: 0`/an equivalent full-turn rest;
  do not use `clearProps` for transform or opacity.
- Account for the auth-aware last label. When `Get started` changes to
  `Account`, revert the old split/timeline, split the replacement anchor, and
  bind exactly one new pair of listeners. Use an explicit dependency plus
  `revertOnUpdate` (and, if needed, a keyed anchor) rather than leaving a
  timeline targeting detached characters.
- On cleanup, remove every native listener and let the GSAP context/matchMedia
  revert the timelines and SplitText instances. Return `mm.revert()` from the
  hook cleanup. There must be no duplicate listener after resize, auth-state
  change, route navigation, or remount.
- Preserve the current `hover:text-muted` treatment on the four standard
  links. Preserve `LinkButton`'s drawn arrow and its measured 6px hover slide;
  the text wave composes with that existing affordance rather than replacing
  it.
- Character splitting must not change the settled typography or geometry.
  Measure each desktop link and the enclosing nav before and after hydration:
  width, height, x/y, and the inter-link gaps must agree within **0.5 CSS px**.
  Compare a no-hover screenshot as well, because per-character inline boxes can
  change kerning even when their outer width matches. If the split cannot keep
  the settled render visually and geometrically stable, stop and report the
  conflict instead of compensating by eye.
- Do not touch the wordmark, mobile menu markup/behavior, navbar drop-in,
  footer, page sections, backend UI, or any route destination.

## Expected impact

Every route that renders `SiteNav` gains the desktop hover behavior at runtime.
No route changes render mode, data access, or navigation behavior.

For prerendered output, the expected deliberate markup delta is limited to
inert animation markers on the five desktop navbar anchors and any client
component bookkeeping caused by replacing the desktop `<nav>` with a leaf that
renders that same element. The settled visible HTML structure, text, classes,
and geometry remain unchanged. Verify all 21 prerendered HTML files using the
normalisation procedure in `docs/automation.md`; do not claim byte identity
for the raw files if Next's client-module ids or chunk hashes change.

The shared client bundle may grow only by the small motion leaf itself:
`chrome.tsx` already imports `NavDrop`, and the existing shared registration
already includes GSAP and SplitText. Verify rather than assume that no second
GSAP/SplitText chunk appears.

## Non-goals

- No restyling of the fitted `SiteNav` glass, dimensions, typography, spacing,
  colour, or sticky behavior.
- No animation on the wordmark or mobile menu links.
- No change to the navbar's load-time drop-in.
- No replacement of the CTA arrow motion.
- No footer-link animation change, even though the labels overlap.
- No new route, dependency, design token, provider, backend behavior, or test
  framework.

## Verification

Run and quote the exact output of:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:local
```

In a production build at 1280px with fonts ready:

1. Capture the no-hover navbar before and after the change and measure the
   header, desktop nav, each anchor, and every inter-link gap. Apply the 0.5px
   geometry ceiling and visually inspect text kerning/rasterisation.
2. Record pointer entry and exit for each of Product, Journal, About, Careers,
   and the final CTA. Sample at 60 fps and verify a left-to-right forward pass
   on both boundaries, a roughly 0.37–0.40s complete cycle for a 12-character
   label, no stuck transforms, and no layout movement.
3. Sweep rapidly between links and across one link's boundary repeatedly.
   Nothing may snap to a non-resting state, retain a transform, or accumulate
   listeners/tweens.
4. Verify the links retain their accessible names and correct destinations,
   the CTA arrow still travels 6px, and the auth-aware label can change to
   `Account` without stale split nodes or duplicate listeners.
5. Emulate `prefers-reduced-motion: reduce` and a coarse/non-hover pointer.
   Text must remain unsplit and static, with navigation fully functional.
6. Resize across the desktop threshold, navigate between routes, and return.
   Confirm cleanup and the existing once-per-document `NavDrop` behavior.
7. At 375, 800, and 1280px, confirm navbar/footer/page geometry remains
   unchanged. Follow the route-specific masking rules in `docs/automation.md`
   for `/`, `/journal`, and `/careers`; never report their bare page-wide AE.
8. Compare the production build's route table and normalised prerendered HTML,
   and inspect emitted chunks for duplicate GSAP/SplitText code.

Record the implementation, measured render/recording results, accessibility
checks, reduced-motion behavior, prerender impact, bundle result, and any
measurement-versus-judgement distinction in `docs/motion-site.md`. Update
`docs/chrome.md` only if the implementation discovers a chrome invariant that
the existing record does not already cover. Commit the approved prompt and its
implementation to `main`; do not push.

## SKILLS USED

- `agent-browser` — exercise the production interaction, responsive media
  gates, accessibility tree, and measured browser geometry.
- `nextjs` — preserve the current Next.js client boundary, `Link` behavior,
  prerendering, and shared bundle shape.
- `tailwind-4-docs` — verify hover media behavior, transform/transition styling,
  and reduced-motion handling against the refreshed Tailwind CSS 4 snapshot.
- `gsap-core` — build the transform-only hover tween, named match-media
  conditions, playback control, and cleanup.
- `gsap-react` — use `useGSAP` with a scoped ref, dependencies, and correct
  lifecycle cleanup.
- `gsap-timeline` — prebuild and replay the ordered per-character sequence
  without creating animations inside pointer callbacks.
- `gsap-plugins` — use the already-registered SplitText API with correct ARIA,
  inline tags, target isolation, and reversion.
- `gsap-performance` — keep the repeated interaction compositor-safe and avoid
  layout/paint-heavy animated properties or unnecessary layer promotion.

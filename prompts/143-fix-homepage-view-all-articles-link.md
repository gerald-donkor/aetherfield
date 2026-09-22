# 143 — Fix the homepage “View all articles” link

## Scope and why this is next

Correct the user's reported homepage regression: the standalone “View all
articles” control in the `Journal` section is an inert `<button>`, so it cannot
reach the existing `/journal` index. This is a tightly scoped navigation fix;
it is independent of the completed backend and architecture work.

## Reference material read

- `AGENTS.md`, especially the settled-surface, homepage bundle, client-leaf,
  prompt, verification, documentation and commit requirements.
- `docs/motion-homepage.md` for the homepage `Journal` section's server/client
  split and its settled reveal/hover behavior.
- `docs/journal.md` for the existing `/journal` destination and the shared
  article-content contract.
- `app/_components/home/journal.tsx` — the broken secondary `<Button>`.
- `app/_components/primitives.tsx` — `ButtonLink` deliberately shares the
  button's visual classes while using Next's `Link` for in-app navigation.
- `app/_components/article/sections.tsx` — the existing “View all articles”
  navigation target is `/journal`.
- Installed Next.js 16.2.12 documentation:
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`.
- `e2e/home.spec.ts` and `docs/automation.md` for the existing production
  Playwright verification setup.

## Implementation contract

1. In `app/_components/home/journal.tsx`, replace only the inert standalone
   `Button` with `ButtonLink` targeting `/journal`.
2. Preserve the existing secondary size, no-bullet appearance, classes,
   `data-reveal-item`, layout wrapper, copy, and reveal behavior exactly. The
   rendered interactive element must be a link, not a button or a nested
   button/link combination.
3. Add a focused regression assertion to `e2e/home.spec.ts`: starting from
   `/`, locate the accessible `View all articles` link, assert its href is
   `/journal`, click it, and assert the `/journal` route and its `Journal`
   heading load. Keep the test independent of unrelated article cards.
4. Do not alter the journal route, article content, card links, motion leaves,
   `Button`/`ButtonLink` primitives, site navigation/footer, or any backend
   feature.

## Measurement and acceptance

The existing secondary button's visual contract is the measurement: preserve
the exact class-based dimensions (`h-[38px] px-3`), no bullet, and wrapper
layout at mobile, tablet and desktop. Inspect the production homepage with an
isolated `agent-browser` session and confirm the accessible control has role
`link`, name `View all articles`, and href `/journal`; click it and confirm the
resulting URL is `/journal` and the journal page's heading is present. This is
functional verification, not a new visual fit.

## Expected impact

- `/` prerendered HTML changes only at this control: a button becomes an anchor
  with href `/journal`; its classes, text and surrounding markup stay the same.
- `/journal` and all other route markup and render modes remain unchanged.
- The homepage remains the only route importing the homepage sections barrel;
  do not pull homepage client code into another route.

## Non-goals

- No redesign, copy change, CTA dialog, analytics, newsletter behavior, route
  rename, article content change, or broad link cleanup.
- No GSAP, Tailwind token, cache, server action, database, auth, environment or
  dependency change.

## Verification and documentation

Run and quote exact output for:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:local
git diff --check
```

Also perform the isolated production-browser acceptance check above. Record the
CTA navigation correction and the checks in `docs/motion-homepage.md`; update
`docs/automation.md` only if this work reveals a repeatable mechanical step
that is not already documented. Commit the approved prompt, implementation,
test and documentation to `main`; do not push.

## SKILLS USED

- `nextjs` — use the installed App Router `Link` API and preserve static-route
  behavior.
- `agent-browser` — inspect the rendered control and exercise the real
  homepage-to-journal navigation in an isolated browser session.

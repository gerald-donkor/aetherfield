# 92 — Correct `register.ts`'s false claim about who imports SplitText

## Scope, and why it is next

The whole-project code review of 2026-08-16 found exactly **one hard rule
violation** in the Standards axis, and this is it. It is first in the sequence
because it is the only finding classified as a violation rather than a
judgement, and because it costs one comment edit.

`app/_components/motion/register.ts` lines 13-15 state:

> It is used by exactly one module — `home/hero-text.tsx` — and it reaches no
> other route because nothing outside `home/` imports this file.

**Both clauses are false**, verified this session:

- `app/_components/motion/careers-masthead-text.tsx:4` —
  `import { DUR, EASE, SplitText, gsap, useGSAP } from "./register";`
- `app/_components/motion/footer-reveal.tsx:4` —
  `import { EASE, ScrollTrigger, SplitText, gsap, useGSAP } from "./register";`

And `footer-reveal` is used by `SiteFooter`, which ships on **every** route, so
the "reaches no other route" clause is the more misleading of the two.

This breaches AGENTS.md §12 rule 8: the repository disagrees with a written
claim, so the repository is the fact and the comment is stale. Nothing is wrong
at runtime — the plugin is registered once at module scope either way.

## Reference material read

- `app/_components/motion/register.ts` (whole file, 20 lines)
- `grep -rn "from \"./register\"" app/_components/motion/` — the importer list
- `docs/motion-homepage.md` — the hero split, which is where the original claim
  came from and was true when written
- `docs/motion-site.md` — the footer's split blur-in and the careers masthead,
  which are the two later additions that falsified it

## What the implementation must do

Rewrite the third paragraph of the docblock so it names the **three** current
SplitText consumers and drops the false containment claim. Keep the two
statements that are still true and still load-bearing:

- SplitText is free as of GSAP 3.13, bundled in the public package, needs no
  auth token and no registry override.
- The pointer to the "hero's split blur-in" rationale.

Do **not** restate the bundle rule as though `register.ts` were subject to it —
`register.ts` is in `motion/`, which the front matter names as *the shared
surface*, so being imported across areas is correct behaviour here, not a leak.
The original comment conflated "nothing outside `home/` imports this" (a
statement about `home/sections.tsx`, which is the module the bundle rule
actually governs) with a statement about `register.ts`. The replacement must not
repeat that conflation.

## Measurements

None. This is a comment.

## Expected impact

**Zero.** A comment is stripped from every build output. The prerendered HTML of
all nine routes is byte-identical, and `motion/register.ts` emits the same
JavaScript.

## Prerender impact

`none — no route changes`. To be **verified**, not assumed: `npm run build` and
confirm the route table still reads `/`, `/journal`, `/about`, `/careers`,
`/design-system` as `○ Static` and `/article/[slug]` (6) / `/job-listing/[slug]`
(3) as `● SSG`.

## Trust boundary

`none` — no request path, no input, no data crosses any boundary. This change
touches a comment in a client module.

## Secrets and data

None read, none stored, none transmitted.

## Non-goals

- **Do not touch `gsap.registerPlugin(...)` or the export list.** The runtime
  behaviour is correct.
- **Do not move SplitText out of `register.ts`** or split registration per
  consumer. One registration site is the stated design and it still holds.
- Do not audit the other comments in `motion/` for staleness — that is a
  separate sweep and would make this diff unreviewable.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build` — quote the route table

`npm test` is `lib/domain/`-scoped and cannot observe this change; run it anyway
so the sequence's baseline stays quoted, but do not present it as evidence.

## Where the result is recorded

`docs/motion-site.md` — it owns the footer's split blur-in and the careers
masthead, which are the two edits that falsified the comment. One short entry
noting the comment was corrected and why, so a later session does not re-derive
the importer list.

## SKILLS USED

- `gsap-core` — to confirm the SplitText-is-free-as-of-3.13 claim being retained
  is still accurate before re-committing to it in a comment.
- `nextjs` — client/server boundary, to state the bundle-rule nuance correctly.

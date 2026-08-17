# 113 — `principles.tsx` re-exports `PRINCIPLES`, which is the trap it was split to avoid

## Scope, and why it is next

Small, and sequenced here because it is the bundle-rule finding — the front
matter's most emphatic invariant — and it should land before 114 touches the
same file.

`app/_components/home/principles.tsx:1-7`:

```tsx
import { Reveal } from "../motion/reveal";
import { Container } from "./container";
import { PRINCIPLES } from "./principles-data";

/* Re-exported so `home/sections` and every existing import still resolve;
   the array itself lives in a component-free module — see principles-data.tsx. */
export { PRINCIPLES };
```

**Nothing imports `PRINCIPLES` from this module.** Verified this session across
`app/` and `lib/`: the only consumers are `principles.tsx` itself (line 27) and
`app/_components/about/sections.tsx:4`, which imports from
`../home/principles-data` — the correct module. The comment's premise no longer
holds.

The re-export is exactly the hazard the front matter names:

> Client leaves stay **component-only** — export a constant or a type from one
> and GSAP lands in that page's bundle.

`principles.tsx` imports `Reveal`, a client module. `principles-data.tsx` exists
*because* this happened once already — three separate comments in the codebase
cite it as the cautionary case (`nav-drop.tsx:69`, `footer-reveal.tsx:56`,
`journal/stamp-perforations.tsx:35`, and `capability-visual.tsx:43`). The
re-export line quietly leaves the door open.

It is harmless today only because nobody walks through it.

## Reference material read

- `app/_components/home/principles.tsx` — whole file
- `app/_components/home/principles-data.tsx` — the component-free module
- `grep -rn "PRINCIPLES" app/ lib/` — every reference, which is how the re-export
  was established as unused
- `app/_components/about/sections.tsx:1-10` — the one cross-area importer, and
  that it already points at the right module
- `app/_components/home/sections.tsx:13` — the comment naming
  `home/principles-data` as the place to get `PRINCIPLES`, which the re-export's
  own justification contradicts
- The front matter's bundle rule, in full

## What the implementation must do

Delete the `export { PRINCIPLES };` line and the two-line comment above it that
justifies it.

**Confirm the removal is safe first** — re-run the grep and show that no importer
resolves `PRINCIPLES` through `principles.tsx`. The comment claims importers
exist; the evidence says they do not, and the evidence is what governs (§12
rule 8). If the grep turns up an importer the review missed, **do not delete** —
repoint that importer at `principles-data` and say so.

`typecheck` and `build` are the backstop: a missed importer fails the build
rather than shipping broken.

## Measurements

**Check whether the homepage bundle actually shrinks.** `Reveal` is a client
module and the re-export is a live edge in the module graph, so it is plausible
that removing it changes what some consumer pulls in. Measure the before and
after with the build output; if nothing moves, **say nothing moved** rather than
claiming a bundle win that did not happen (§12 rule 7).

## Expected impact

One line and one comment deleted. Most likely zero bundle change — no current
importer means no current edge being traversed. The value is that the trap
closes.

## Prerender impact

`none — no route changes`. `/` and `/about` both render principles content and
both stay `○ Static` with byte-identical HTML.

`npm run build`, quote the route table, then diff the prerendered HTML of all
nine routes per `docs/automation.md`. Standing warning in force for `/`,
`/journal` and `/careers` — mask the scrubbed capabilities cloth in particular,
since it sits on the same page.

## Trust boundary

`none` — a module export on a static marketing page.

## Secrets and data

None.

## Non-goals

- **Do not move `PRINCIPLES`** — `principles-data.tsx` is already the right home.
- **Do not touch the card markup** — prompt 114, same file, separate commit.
- Do not audit the other components for stray non-component exports. That is a
  worthwhile sweep and it is its own prompt; the front matter records that the
  only sanctioned non-component export anywhere is `DUR`/`EASE` from
  `motion/register.ts`, so such a sweep has a clear pass condition.
- Do not touch `Reveal` or any motion module.

## Checks

- `npm run lint`
- `npm run typecheck` — the primary evidence that no importer was missed
- `npm test`
- `npm run build` — quote the route table, and the bundle figures for `/` and
  `/about` before and after
- Nine-route prerendered HTML diff — quote it

## Where the result is recorded

`docs/motion-homepage.md` — it owns the homepage's `Reveal` usage and the
Capabilities section, and the bundle rule is why `principles-data.tsx` exists.
Record the grep evidence, the deletion, and the bundle measurement or the
explicit statement that nothing changed.

## SKILLS USED

- `nextjs` — module graph and client-boundary behaviour; what actually lands in
  a route's bundle when a server component re-exports a constant it imported.
- `vercel-react-best-practices` — bundle composition and the cost of a client
  boundary.
- `gsap-react` — only to confirm the hazard being closed is real: `Reveal` uses
  `useGSAP`, and the front matter's claim is that a non-component export from
  such a module drags GSAP into the importer's bundle. Verify that mechanism
  rather than restating it (§12 rule 2).

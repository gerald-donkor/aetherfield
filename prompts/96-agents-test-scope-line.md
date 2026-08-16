# 96 — AGENTS.md §2 points at the wrong place for the test scope

## Scope, and why it is next

Last of the five documentation-accuracy findings, and the smallest. Grouped here
so the whole comment-and-docs group lands before any behavioural change, leaving
prompts 97 onward to run against a repository whose written claims are true.

AGENTS.md §2 says:

> `npm test` — Vitest, **scoped to `lib/domain/`** and nothing else.

The **effect** is right. The **location** is not stated, and a reader looking
for the scope in `package.json` will not find it — the script there is a bare
`"test": "vitest run"` (`package.json:15`), and the scope actually lives in
`vitest.config.mts` at the repository root.

Verified this session: `package.json:15-16` are `"test": "vitest run"` and
`"test:watch": "vitest"`, and the only Vitest config in the tree is
`./vitest.config.mts`. The review reported this file as `vitest.config.ts`; the
extension is `.mts`, and citing it wrongly in AGENTS.md would just relocate the
same defect (§12 rule 1).

This is the mildest §12 rule 8 case in the set — the sentence is not false, it
is under-specified in a way that costs a reader a search. It is worth one line.

## Reference material read

- `AGENTS.md` §2 — the script list
- `package.json:8-20` — the actual scripts
- `vitest.config.mts` — where the scope is really configured
- `find . -name "*.test.ts" -not -path "./node_modules/*"` — twelve test files,
  all under `lib/domain/`, which is what makes the "and nothing else" clause
  true today

## What the implementation must do

Amend §2's `npm test` bullet so it names `vitest.config.mts` as where the scope
is enforced, keeping every other clause of that bullet intact — in particular
the reasoning about why the domain layer is independently testable (§6.2) and
the rule that a test needing a database, a browser or a mock belongs in
`npm run test:e2e` instead. Those are the load-bearing parts and they are
correct.

Read `vitest.config.mts` first and describe **what it actually does** to produce
the scope — an `include` glob, a `dir`, a project definition, whatever is there.
Do not write "scoped in `vitest.config.mts`" as a vague gesture; say how, in the
few words it takes, so the next reader does not have to open it either.

Keep it to one sentence or one parenthetical. §2 is contract, and the front
matter's cap applies.

## Measurements

None.

## Expected impact

**Zero.** Markdown.

## Prerender impact

`none — no route changes`. Verify with `npm run build` and quote the route
table.

## Trust boundary

`none` — documentation only.

## Secrets and data

None.

## Non-goals

- **Do not move the scope into `package.json`.** Changing where the scope lives
  is a build-tooling decision, not a documentation fix, and the current
  arrangement works. The defect is that AGENTS.md does not say where it is.
- **Do not widen the test scope**, and do not add a test file outside
  `lib/domain/`. §6.2 and §2 both depend on that boundary holding.
- Do not touch §8.4's table — that is prompt 95.
- Do not add a `test:domain` alias or any new script.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test` — quote the full output, since this prompt is about that command's
  scope and the file count is the evidence the claim is still true
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, alongside the entry for the build step that introduced the
domain tests. One line: the §2 bullet was under-specified and now names
`vitest.config.mts`.

## SKILLS USED

`None.` No installed skill covers Vitest configuration, and the only external
fact needed — how the scope is expressed in `vitest.config.mts` — is read
directly from the file in the repository. Stated explicitly rather than omitted,
per §4.

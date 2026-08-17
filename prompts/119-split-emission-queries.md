# 119 — Split `lib/db/emission-queries.ts` (2,616 lines, eight edit reasons)

## Scope, and why it is next

**Deferred by the user on 2026-08-16**, along with prompt 120, to run after the
26 findings in prompts 92-118. Both are pure structural splits with no behaviour
change — the largest diffs in the set and the lowest risk-adjusted payoff — so
they land last, once everything else is committed and verified green.

`lib/db/emission-queries.ts` is **2,616 lines**. The review identified eight
unrelated reasons it gets edited — Divergent Change. It is the largest file in
`lib/db/` by a wide margin and it holds the factor-set reads, the factor reads,
the mapping reads, the coverage reads, the emission aggregations and the
tenant-scope helper.

**Three earlier prompts deliberately left it alone and said so** — 99
(`visibleFactorScope` on three joins), 100 (the `visible()` helpers) and 101
(the operation-name strings) each list "do not split `emission-queries.ts`" as a
non-goal. **All three must be committed before this runs**, so the split moves
settled code rather than code still under revision.

## Reference material read

- `lib/db/emission-queries.ts` — **in full.** 2,616 lines. There is no shortcut
  here; a split decided from grep output will cut through a shared helper
- `lib/db/report-evidence.ts`, `lib/db/dashboard-queries.ts`,
  `lib/db/alert-queries.ts`, `lib/db/target-queries.ts` — the neighbouring
  modules, for the naming and layout conventions a new module must match
- Every importer of `emission-queries.ts` across `app/` and `lib/`
- `lib/db/schema.ts` — the tables involved
- `docs/backend.md`, build steps 9, 10 and 14

## What the implementation must do

1. **Establish the eight edit reasons from the file itself**, not from the
   review's summary. Name them, and map every exported symbol to one. That map
   is the deliverable that justifies the cut lines — **produce it before moving
   a single line**, and put it in the recorded result.
2. **Cut along those seams.** Likely modules: factor sets, factors, mappings,
   coverage, aggregation. Let the map decide, not this list.
3. **`visibleFactorScope` and the module docblock at `:88` go somewhere every
   split module can import**, and the docblock's claim — "the predicate is
   written once … so no query can filter on half of it" — must remain true and
   locally verifiable after the split. Prompt 99 made that claim honest; this
   prompt must not undo it. If the split would scatter the predicate, **that is
   a reason to cut differently**.
4. **Keep the public import surface stable if that is cheap** — a barrel
   re-export means importers do not churn. **But a barrel that re-exports
   everything recreates the coupling the split exists to break**, so decide
   deliberately and say which was chosen and why. Updating importers is the more
   honest option if the count is manageable.
5. **Move code; do not edit it.** No renamed symbol, no reordered argument, no
   "while I'm here" improvement. The diff should be almost entirely relocation,
   and anything that is not must be called out line by line.

**If the file does not have eight clean seams — if the reads genuinely interlock
— stop and report that.** A split that leaves five modules importing each other
circularly is worse than one long file, and "this does not cut cleanly, here is
why" is a legitimate and valuable outcome (§12 rule 9). Do not force it.

## Measurements

**Every query's emitted SQL must be unchanged.** That is the acceptance
condition. State how it was established — a scripted comparison is the right
evidence; reasoning file-by-file is a judgement and must be labelled one (§12
rule 4).

Line counts before and after are worth quoting, but they are not the point and
must not be presented as the benefit.

## Expected impact

One large module becomes several. Identical SQL, identical rows, identical
behaviour. No route, no action and no page changes.

## Prerender impact

`none — no route changes`. `lib/db/` is `server-only` and reaches no prerendered
page. Verify with `npm run build` and quote the route table. Each new module
carries `import "server-only"` so a mistaken client import is a **build** error
(§6.3).

## Trust boundary

No request path changes. The boundary that matters is the **tenant** boundary,
and the split must not weaken it: after the change, every read of
`emission_factor` still states `visibleFactorScope`, and every read of a
strictly tenant-scoped table still filters `organizationId` (§9.2 rule 6).
**Re-verify that across all the new modules** — it is the one property most
easily lost when 2,600 lines move.

## Secrets and data

Reads `DATABASE_URL` transitively. No new variable. No personal data, and **no
logging may be added** during the move (§8.3 rule 2).

## Non-goals

- **Do not change any query's behaviour, SQL, name or signature.**
- **Do not change any tenant predicate.**
- **No migration, no schema change.**
- Do not split any other module — prompt 120 covers the route pages, and nothing
  else is in scope.
- Do not fold in any finding from 92-118; all are committed by now and reopening
  one here would make this diff unreadable.

## Checks

- `npm run lint`
- `npm run typecheck` — with a barrel, this is weak evidence; without one, it is
  strong. Say which situation applies
- `npm test`
- `npm run build` — quote the route table
- The SQL-equivalence comparison described under Measurements — quote it
- `npm run test:e2e` — **required.** The dashboard, activity, targets and
  reports areas all read through this module and the domain tests touch none of
  it. Quote the result, or say plainly if the matrix could not run and treat the
  prompt as unverified.

## Where the result is recorded

`docs/backend.md`, build step 10's section: the eight-reason map, the modules
created, where `visibleFactorScope` landed, the barrel decision and its
reasoning, and the SQL-equivalence evidence.

## SKILLS USED

- `drizzle-docs` — schema imports, query composition across modules, and whether
  splitting affects type inference on `and`/`or` fragments shared between files.
- `nextjs` — `server-only` boundaries on each new module.
- `neon-postgres` — only if any query is executed to compare SQL; record whether
  the connection was warm (§7.3's scale-to-zero rule).

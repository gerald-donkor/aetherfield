# 99 — Three joins onto `emission_factor` do not state the scope predicate

## Scope, and why it is next

The tenant-isolation finding, and the first of the data-layer group. It goes
before the cosmetic data-layer work because it is the one that touches §9.2
rule 6 — the rule the sanctioned nullable-`organization_id` exception depends on.

Three queries join `emission_factor` **without** `visibleFactorScope()`, verified
this session:

| site | join |
| --- | --- |
| `lib/db/emission-queries.ts:1753-1758` | `.innerJoin(emissionFactor, and(eq(emissionFactor.id, activityFactorMapping.factorId), isNull(emissionFactor.deletedAt)))` |
| `lib/db/emission-queries.ts:1959-1964` | the same, as a `.leftJoin` |
| `lib/db/report-evidence.ts:198` | `.innerJoin(emissionFactor, eq(emissionFactor.id, activityEmission.factorId))` |

Twelve other reads in `emission-queries.ts` do name the helper — lines 1118,
1216, 2085, 2243, 2345, 2419, 2596 among them.

**No cross-tenant read is reachable through any of the three.** The scope
arrives transitively: each joins from `activityFactorMapping` or
`activityEmission`, both of which are strictly tenant-scoped
(`.notNull()` organisation reference, §9.2 rule 6) and both of which are already
filtered on `organizationId` in the same query's `where`. So this is a
**defence-in-depth and legibility** finding, not a live vulnerability, and the
prompt must not overstate it.

What makes it worth fixing is exactly what the module's own docblock at
`emission-queries.ts:88` claims:

> The predicate is written once, in {@link visibleFactorScope}, so no query
> can filter on half of it

That claim is stronger than what the code does. Either the three sites state the
predicate, or the docblock is wrong (§12 rule 8). Stating it is the better fix,
because the transitive guarantee is a property of *today's* join graph and a
future edit to either of those two tables' filters would remove it silently.

## Reference material read

- `lib/db/emission-queries.ts:88-120` — the module docblock and
  `visibleFactorScope`'s definition
- `lib/db/emission-queries.ts:1740-1775`, `:1945-1975` — the two joins in
  context, including their `where` clauses
- `lib/db/report-evidence.ts:185-215` — the third
- `lib/db/schema.ts` — confirming `activityFactorMapping.organizationId` and
  `activityEmission.organizationId` are both `.notNull()`
- AGENTS.md §9.2 rule 6 — the sanctioned exception and its exact wording

## What the implementation must do

Add `visibleFactorScope(organizationId)` to all three joins' `and(...)`.

**`visibleFactorScope` is private to `emission-queries.ts`** (declared
`function visibleFactorScope`, not exported). The third site is in
`report-evidence.ts`, so the helper must be exported and imported, or moved to a
shared module. **Prefer exporting it from where it lives** — moving it costs a
larger diff and the module docblock that explains it is in `emission-queries.ts`.

Verify each of the three still returns identical rows afterwards. The predicate
is `organizationId IS NULL OR organizationId = $1`, and every row these joins
can currently reach already satisfies it, so **the result sets must not change**.
If any one of them does change, that is a finding in its own right — **stop and
report it** (§12 rule 9), because it would mean a cross-tenant row was reachable
after all and this prompt's premise is wrong.

## Measurements

Row-count equivalence before and after, per query, is the measurement. State how
it was obtained. If it can only be reasoned about rather than executed against
data, **say that it is a judgement, not a measurement** (§12 rule 4) — do not
write "verified identical" for something argued on paper.

## Expected impact

Three queries gain a redundant-today predicate. Same rows, marginally different
SQL. §9.2 rule 6's guarantee becomes locally checkable at every join rather than
dependent on the join graph.

## Prerender impact

`none — no route changes`. `lib/db/` is `server-only`. Verify with
`npm run build` and quote the route table.

## Trust boundary

No request path changes. The boundary this strengthens is the tenant boundary
**inside** the data layer: after this change, every read of `emission_factor`
states its own scope predicate rather than inheriting one.

## Secrets and data

Reads `DATABASE_URL` transitively, as the module already does. No new variable.
No personal data. **Do not log a query, a row, or an organisation id** if
row-count verification is performed — use counts only (§8.3 rule 2).

## Non-goals

- **Do not split `emission-queries.ts`.** Deferred to its own prompt.
- **Do not touch `visibleFactorScope`'s definition.** The predicate is correct.
- Do not add the predicate to joins that read a strictly tenant-scoped table —
  `activity_factor_mapping` and `activity_emission` are `not null` by §9.2
  rule 6 and the published-data predicate is wrong for them.
- Do not dedupe the three `visible()` helpers — that is prompt 100.
- No migration. No schema change.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, build step 10's section — where §9.2 rule 6's exception is
already argued. Record the three sites, that the transitive guarantee held (so
no data was exposed), and that the predicate is now stated at every join so the
module docblock's claim is true.

## SKILLS USED

- `drizzle-docs` — `and` / `or` composition inside a join condition versus in
  `where`, and how an `or(...)` inside an `innerJoin`'s `and(...)` is emitted.
  `emission-queries.ts:1222` already warns that the scope must stay an outer
  `AND` over the whole `where`; the same trap applies to a join condition and
  must be verified, not assumed.
- `neon-postgres` — only if a row-count check is run against the database;
  note whether the connection was warm (§7.3's scale-to-zero rule).

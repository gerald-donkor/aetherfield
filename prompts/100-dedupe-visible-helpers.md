# 100 — Three identical `visible()` helpers across the query modules

## Scope, and why it is next

Follows 99 because both are tenant-predicate work in `lib/db/` and 99 must land
first: it is the one with a correctness argument attached, and doing the
cosmetic dedupe first would make its diff harder to read.

Three query modules each declare a private helper of the same shape — verified
this session by reading all three:

```
lib/db/report-queries.ts:91   → and(eq(report.organizationId, organizationId),        isNull(report.deletedAt))
lib/db/target-queries.ts:107  → and(eq(emissionTarget.organizationId, organizationId), isNull(emissionTarget.deletedAt))
lib/db/alert-queries.ts:41    → and(eq(targetAlert.organizationId, organizationId),    isNull(targetAlert.deletedAt))
```

Identical but for the table. Each is "this tenant's rows, not soft-deleted" —
§9.2 rule 6 plus rule 5, written three times.

**A correction to the review, which this prompt must not inherit.** The review
reported *four* such helpers, counting `visibleFactorScope` in
`emission-queries.ts:113`. That one is **a different predicate**:

```
or(isNull(emissionFactor.organizationId), eq(emissionFactor.organizationId, organizationId))
```

It is the sanctioned published-reference-data exception (§9.2 rule 6) — `or`,
not `and`; nullable, not `notNull`; and no `deletedAt` clause. **It must not be
folded into the shared helper.** Doing so would either weaken the three strict
predicates to admit `NULL` organisation ids, or strengthen the factor predicate
so published rows stop being visible. Both are wrong, and the first is a
cross-tenant read. This is the single most important line in this prompt.

## Reference material read

- `lib/db/report-queries.ts:85-100`, `lib/db/target-queries.ts:100-115`,
  `lib/db/alert-queries.ts:35-50` — the three helpers in full
- `lib/db/emission-queries.ts:105-120` — `visibleFactorScope`, confirming it is
  genuinely different
- `lib/db/schema.ts` — the three tables, confirming each has `organizationId`
  `.notNull()` and a `deletedAt`
- AGENTS.md §9.2 rules 5 and 6

## What the implementation must do

Extract one generic helper into a shared module under `lib/db/` and call it from
all three sites.

**It must be typed so it cannot be applied to the wrong table.** A helper taking
`any` column pair would let a future call site pass `emissionFactor` and
reintroduce exactly the confusion this prompt exists to prevent. Prefer a
signature constrained to a table that has both a non-nullable `organizationId`
and a `deletedAt` — verify what Drizzle's type system actually supports here
before committing to a shape (§12 rule 2), and if a fully safe signature is not
expressible, **say so and choose the closest safe thing**, recording the residual
risk rather than pretending it away.

**Its docblock must state the boundary explicitly**: this is the strict
tenant-scoped predicate, `visibleFactorScope` is the published-data exception,
and the two are not interchangeable. Cross-reference both ways.

Keep the local name `visible` at the call sites if that reads better — a
one-line re-export or alias per module is fine and keeps the three diffs small.

## Measurements

None. **Every one of the three queries' emitted SQL must be unchanged.** That is
the acceptance condition, not a measurement.

## Expected impact

Three small deletions, one new shared helper. Identical SQL, identical rows.

## Prerender impact

`none — no route changes`. Verify with `npm run build` and quote the route
table.

## Trust boundary

No request path changes. The tenant predicate is unchanged in meaning at all
three sites; only its declaration site moves.

## Secrets and data

Reads `DATABASE_URL` transitively. No new variable, no personal data, no
logging.

## Non-goals

- **Do not touch `visibleFactorScope`.** See above — this is the prompt's hard
  line.
- **Do not extend the helper to any fourth table** in this change, even if one
  looks eligible. Three sites, three deletions.
- Do not split any query module.
- No migration, no schema change.
- Do not change `withSafeQueryErrors` usage — prompt 101.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, build step 10 or the nearest section covering the query
layer. Record the helper's location, the three call sites, **and the correction
to the review's count** — that `visibleFactorScope` is a fourth helper of a
deliberately different shape and is excluded on purpose. That note is the part
most worth having: it is what stops a later session "finishing the job".

## SKILLS USED

- `drizzle-docs` — column and table typing, whether a generic constrained to
  tables carrying `organizationId` and `deletedAt` is expressible, and how `and`
  composes when the helper's result is spread into a larger `where`.

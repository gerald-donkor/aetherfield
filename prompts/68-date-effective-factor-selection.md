# 68 — Date-effective factor selection

## Scope, and why it is next

**Select an emission factor by the activity record's own date, not by whichever
factor the tenant's mapping happens to point at.**

§5.2's fourteen-step sequence is fully built and committed (`git log`: step 14 at
`f9e102b`, step 13 at `8196d09`, step 12 at `f16e86f`, step 11 at `b13bc02`,
step 10 at `60def3c`), and prompts 63–67 closed four post-sequence items. So
"next" comes from the work those prompts explicitly deferred, and this is the
one `docs/backend.md` names as needing its own prompt:

> `docs/backend.md:4194` — | date-based factor selection by `effective_from` /
> `effective_to` | not built for published sets either; its own prompt |

It is the only deferred item that changes a number in a disclosure, which is why
it comes before the other two candidates (custom-factor-set workflow gaps; §5.3's
sanctioned AI factor matching).

**The gap, verified in code rather than inferred.** `lib/db/schema.ts:524-532`
already stores the window and already states the rule in its docblock:

> The activity dates this set applies to. **A factor is selected by the
> activity's date, not by today's** — DEFRA's own instruction is that the 2026
> factors are "for use with activity data that falls entirely or mostly within
> 2026", so a restatement of an earlier year re-selects against that year's set
> rather than the current one.

Nothing selects on those columns. `grep -rn "effectiveFrom" lib app` finds them
in `lib/db/schema.ts`, the seeder, `lib/db/emission-queries.ts` (as *returned
provenance* only), `lib/validation/emissions.ts`, `app/activity/factors/page.tsx`
and `app/_components/activity/custom-factor-form.tsx` — display and validation,
never selection. `buildFactorResolver` (`lib/db/emission-queries.ts:631`) keys
purely on `` `${mapping.category}.${mapping.unit}` `` and ignores the record
entirely apart from those two fields. A 2025-dated `activity_record` is
currently costed at the 2026 factor, silently.

## Decisions taken with the user before this prompt was written

Taken on 12 Aug 2026, in answer to three questions asked before any file was
written.

| question | answer | consequence |
| --- | --- | --- |
| is this the right next prompt | **yes** — date-effective selection | the other two deferred candidates stay deferred |
| a record whose date no visible set covers | **refuse, and surface it** | the record produces no figure and is counted in a new coverage channel. Accepted caveat: only the DESNZ 2026 set is seeded, so any record dated outside 2026 leaves the totals until a second year's set is loaded |
| how a mapping travels to another year's set | **follow `source_row_id`** | no schema change and no migration. The tenant's one choice per `(category, unit)` keeps its meaning across revisions, which is what DEFRA's stable row ids exist for |

### One rule this prompt decides, flagged for veto at approval

When more than one visible set has the same `source` and a window containing the
record's date, the winner must be deterministic — it decides a filed number.
**Order: tenant-owned (`organization_id = $1`) before published (`null`), then
`publication_year` descending, then `created_at` descending, then `id`
ascending.** Tenant-owned first because a customer supplying a set under its own
licence is a deliberate act, and the alternative — published always wins — makes
the custom-factor-set surface prompt 66 built unable to supply a year the
published data does not cover. Say so and stop if this is wrong.

## Reference material read for this prompt

| path | what was taken from it |
| --- | --- |
| `AGENTS.md` §§5.2, 5.3, 6.2, 6.3, 9.2, 12 | the sequence being exhausted, the hard rule, the pure-domain boundary, the reference-table exception, the anti-fabrication rules |
| `docs/backend.md:5937-6100` (step 10) | the engine's design, the seeded set's shape, why every DEFRA row normalises to `gas: "co2e"` |
| `docs/backend.md:3639-3785` (prompt 65) | the mapping surface, and its "AI factor matching / deterministic surface first" non-goal |
| `docs/backend.md:3785-4198` (prompts 66, 67) | custom factor sets, and the deferral line this prompt closes |
| `lib/domain/emissions.ts` | `ENGINE_VERSION`, `ActivityInput`, `FactorInput`, `FactorResolver`, `CoverageReport`, `aggregate` |
| `lib/db/emission-queries.ts` | `listFactorMappings`, `buildFactorResolver`, `listRecordsForCalculation`, `recalculateOrganization`, `replaceEmissions`, `listFactorCoverage`, `visibleFactorScope` |
| `lib/db/schema.ts:511-740` | `emission_factor_set`, `emission_factor`, `activity_factor_mapping` and their indexes |
| `lib/db/seed/seed-emission-factors.ts:75-76` | the only seeded window: `2026-01-01` to `2026-12-31` |
| `.claude/skills/drizzle-docs/references/docs/324-pg-select.md`, `311-pg-operators.md`, `307-pg-joins.md` | the Postgres select, filter-operator and join pages — read at implementation, not paraphrased from memory |

## What to build

### 1. `lib/domain/emissions.ts` — a fifth way to refuse

The engine already documents "the four ways this module refuses" (lines 23-41),
each "a **typed refusal that keeps the record out of the total**, never a
fallback, a zero or a guess". Out-of-period is the fifth, and it must read as one
of them.

- **`FactorResolver` returns a tagged resolution, not `FactorInput | null`.**
  Today `null` collapses two different facts — "no mapping for this pair" and
  (after this change) "mapped, but no set covers this date" — into one bucket.
  Widen it to a discriminated union carrying `no_mapping` and `out_of_period`.
  **The resolver already receives the whole `ActivityInput`**, which carries
  `activityDate` (line 98), so the signature's *input* does not change and the
  engine stays pure.
- **`CoverageReport` gains an out-of-period channel.** `unmatchedPairs` keeps its
  exact current shape and meaning — `listFactorCoverage` mirrors it in SQL
  (`lib/db/emission-queries.ts:977`) and the mappings page reads that. Report
  out-of-period separately, keyed by the record's **year**, with a record count,
  sorted the same way `unmatchedPairs` is (count descending, then the key), so
  the reporter sees *which year's factor set to load*. Update the module docblock
  to say five, not four.
- **Bump `ENGINE_VERSION` to `1.1.0`.** Its own docblock (lines 79-87): "Bump it
  whenever a change here would move a number that a previous run produced." This
  change removes figures for every out-of-period record, so it moves numbers by
  construction. This is exactly the case the field exists for.
- **Tidy the NUL separator at line 490.** `` `${record.category}\x00${record.unit}` ``
  makes `file` report the engine as `data` and makes **`grep` silently return
  nothing for the whole file** — it is the only such file in the repo
  (`git ls-files` + `file --mime-encoding` over every `.ts`/`.tsx`/`.md`/`.css`
  finds one). It has been committed since step 10 and a session grepping the
  engine gets an empty result and a wrong conclusion. Use the same `.` separator
  `buildFactorResolver` already uses; both enum vocabularies contain no dot.
  **This moves no number, and is not why the version bumps.**

### 2. `lib/db/emission-queries.ts` — the date-aware resolver

- `listFactorMappings` must additionally return, per mapping, the mapped
  factor's `sourceRowId` and its set's `source`, `organizationId`,
  `effectiveFrom` and `effectiveTo`.
- **A second query loads the siblings, once.** For the distinct
  `(source, source_row_id)` pairs the tenant's mappings use, select every visible
  factor sharing them, joined to its set's window. Predicates: the existing
  `visibleFactorScope(organizationId)`, `isNull(emissionFactor.deletedAt)`,
  `isNull(emissionFactorSet.deletedAt)`, and `isNull(supersededBySetId)` — the
  same three `searchFactorsForPair` applies (lines ~1170-1180), so nothing can be
  selected here that the search surface would not offer.
- **`buildFactorResolver` becomes date-aware and stays pure and synchronous.** It
  takes the mappings *and* the sibling rows and returns the resolver; all
  interval matching happens in memory over data already loaded. **No per-record
  query.** `recalculateOrganization` runs over a whole organisation and the cron
  sweep (`app/api/cron/recalculate/sweep.ts:104`) runs it for every organisation,
  so an N+1 here is a production problem, not a style note.
- The fast path stays free: if the mapped factor's own set covers the date, use
  it without consulting siblings.
- Resolution order is the tie-break rule decided above. Write it once, in a named
  helper, with the reasoning in a comment — it decides a filed number.

`recalculateOrganization` needs no structural change beyond passing the siblings
into `buildFactorResolver`. **`replaceEmissions` already handles the
disappearance correctly**: its delete is bounded by the same `recordIds` the
insert covers, precisely so "a record whose mapping was removed now produces no
figure" leaves no stale row (its docblock, lines ~695-706). An out-of-period
record is the same case.

### 3. Surfacing it

Out-of-period records must be visible wherever a gap is already visible, in the
site's measured, evidence-first register:

- `app/_components/activity/emissions-summary.tsx` — the coverage line, beside
  the existing unmatched count.
- `app/activity/mappings/page.tsx` — reads `listFactorCoverage`, which is SQL and
  currently answers only "is there a mapping". Extend it so a pair whose records
  fall outside every covering set is distinguishable from an unmapped pair, or
  state in `docs/backend.md` why it was left to the engine's report alone.
- `lib/db/report-evidence.ts` / `lib/domain/reports.ts` — an out-of-period record
  already lands in `uncalculatedRecords`, which is honest but unexplained.
  **If a new figure enters the report evidence it must also be added to the
  `allowed` set at `lib/domain/reports.ts:363-365`** — that allowlist is §5.3's
  guardrail keeping the generated narrative to figures that were computed, and a
  number in the evidence but not in `allowed` is a number the narrative may not
  cite.

## Measurements, and how to produce them

No number in this prompt is eyeballed, and none may be written into
`docs/backend.md` without being produced by one of these.

1. **The seeded windows.** `select source, dataset_version, effective_from,
   effective_to, organization_id from emission_factor_set` over
   `dotenv -e .env.local -- npx tsx`. Expected: one published row, DESNZ,
   `2026-01-01`–`2026-12-31` (`lib/db/seed/seed-emission-factors.ts:75-76`).
   **Record what is actually returned.**
2. **The blast radius, before the change.** Per organisation, the count of
   non-deleted `activity_record` rows whose `activity_date` falls outside every
   visible set's window, and the tCO₂e those records currently contribute. This
   is the figure that disappears, and it must be stated in `docs/backend.md` as a
   measurement, not an estimate.
3. **Before and after totals** for one organisation with out-of-period data —
   run `recalculate`, record `{ records, written }` and the scope totals either
   side. If no organisation has out-of-period data, say so and produce the case
   through the custom-factor-set surface prompt 66 built rather than inventing a
   number.
4. **The sibling path, observed at least once.** Two sets of the same `source`
   with adjacent windows, and one record in each, resolving to different factor
   rows. `app/activity/factors/` can create the second set without new seed data.
   If this cannot be observed, say so — do not report it as working.
5. **`npm test`** — the new resolver logic is pure and belongs in
   `lib/domain/emissions.test.ts` beside the existing 81 tests. Quote the run.
6. **Query count** on a recalculation, to evidence the no-N+1 claim.

Where a recording or a query cannot separate two readings, record the observed
value as the measurement and the shipped value as a judgement on it, and say
which (front matter).

## Prerender impact

**Expected: none — no route changes.** Every surface this touches is already an
authenticated, request-time route (`/activity`, `/activity/mappings`,
`/activity/factors`, `/dashboard`, `/reports`, `/targets`), and the nine
marketing routes are not imported by anything here.

**Verify, do not assume** (§8.1): run `npm run build`, confirm the route table
still reads

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

and diff the prerendered HTML per `docs/automation.md`, with the standing
warning about `/`, `/journal` and `/careers` in force — **never quote a bare
page-wide `magick compare -metric AE` for those three** (front matter).

## Trust boundary

**No new request path.** The only entry points are the existing `recalculate`
Server Action (`app/activity/actions.ts:553`) and the existing cron route
(`app/api/cron/recalculate/route.ts`), both already authorised, rate-limited and
tenant-scoped. This change alters what those paths *compute*, never who may call
them or what they accept.

Every new or widened query keeps `visibleFactorScope(organizationId)` — §9.2 rule
6's reference-table exception is `organization_id IS NULL OR organization_id =
$1`, and the sibling lookup is a read of exactly those tables. **A sibling
resolved across the tenant boundary would be a cross-tenant data leak into a
filed number**, so the predicate is not optional and must be the existing shared
helper rather than a restatement.

## Secrets and data

Reads no environment variable that does not already exist; adds none; adds no
`NEXT_PUBLIC_*`. No new provider, no email, no blob, **no model call** — §5.3's
hard rule is the reason this whole prompt exists, and nothing here is heuristic.
Stores no new personal data. **Logs nothing** on any path — no organisation name,
no record body, no date, no total — matching the existing silence across
`lib/db/emission-queries.ts`, `lib/domain/*` and `app/activity/actions.ts`.

## Non-goals

| not doing | why |
| --- | --- |
| any schema change or migration | the `source_row_id` decision is what avoids one. If one turns out to be unavoidable, **stop and say so** rather than generating it |
| per-period mappings — widening `activity_factor_mapping`'s unique key | the rejected option from the decision above |
| loading a second DEFRA year's factor set | that is data, and its own prompt. This change makes a second year *usable*; it does not supply one |
| AI factor matching | §5.3 sanctions it at step 10 and does not schedule it; prompt 65 already deferred it once |
| editing a stored set's metadata, retiring a set from the UI, bulk factor-set CSV import | prompt 67's other deferrals, untouched |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work, exactly as prompts 63–67 were |
| recalculating every organisation as part of this change | the cron sweep already does it on its schedule; a mass recalculation is an operational act, not a migration |
| touching `SiteNav`, `SiteFooter` or any marketing route's markup | §8.1 and the front matter's settled surfaces |
| GSAP anywhere in this work | §7.5 — `motion/` is the shared surface and the backend UI does not use it |

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test` — quote the run; the widened `FactorResolver` will touch existing
  engine tests
- `npm run build` — quote the route table (§8.1)
- `npm run test:e2e` if it is runnable; if it is still blocked before tests, say
  so plainly and do not report it as passed

Report exact output. Never claim a check passed without running it (§2, §12
rule 3).

## Where the result is recorded

**`docs/backend.md`**, as a new section following the existing post-sequence
sections (`## Custom factor set corrections, prompt 67`). It must carry the
resolution rule and its tie-break, the measured blast radius, the before/after
totals, the `ENGINE_VERSION` bump and why, and a "what prompt 68 deliberately did
not do" table.

**Correct `docs/backend.md:4194` in the same change** — the line that defers this
work is no longer true once it ships, and §12 rule 8 requires it be fixed rather
than left standing. `AGENTS.md` gets **no new line**: no new index row is needed
(`docs/backend.md` is already indexed) and this introduces no site-wide invariant
that meets the cap rule.

## SKILLS USED

- **`drizzle-docs`** — the sibling-lookup query, the date-range predicate and the
  join. Read `references/docs/324-pg-select.md`, `311-pg-operators.md` and
  `307-pg-joins.md` — the **`pg-`** files; titles repeat across six dialects and
  this project is Postgres.
- **`zod-docs`** — only if any validated shape changes. Expected to be untouched;
  load before editing `lib/validation/emissions.ts` if it does.
- **`nextjs`** — the Server Component surfaces and the existing Server Action
  whose result shape may widen. Next 16 contradicts most tutorials (§7.3).
- **`vercel:next-cache-components`** — before touching revalidation on any
  affected route, if the coverage surfaces turn out to cache.
- **`neon-postgres`** — the pooled/direct split, if any measurement query is run
  against the database. Migrations and Studio take `DATABASE_URL_UNPOOLED`; the
  app never does.
- **`frontend-design:frontend-design`** — the coverage line's wording and
  hierarchy on the two activity surfaces. The register is measured and
  operational, never alarmist (§5).

Listing is not loading (§4): invoke each of these at execution before writing the
code it covers.

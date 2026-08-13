# 71 — Superseding a published factor row from a customer-supplied set

## Scope, and why it is next

**Close the custom-factor-set sibling gap** — let a tenant-supplied
`emission_factor` declare that it restates a specific published row, so
`listFactorSiblings` can reach it and `selectFactorForDate` can select it for a
date the published set does not cover.

Every row of AGENTS.md §5.2's build sequence, steps 1–14, is committed
(`git log`: `4541641` step 9 through `f9e102b` step 14, plus prompts 63–70).
This is therefore post-sequence work, as prompts 63–70 were, and it is chosen
over the other open items because it is the only one `docs/backend.md`
classifies as a **defect** rather than deferred scope:

> letting the custom-factor-set surface create a sibling of a published row |
> it hashes its own `source_row_id`; see the correction above. **A real gap, not
> closed here** — `docs/backend.md:4399`

It has been carried forward unchanged three times — prompt 68 (`:4399`), prompt
69 (`:4772`), prompt 70 (`:4997`) — which is the pattern §12 rule 8 exists to
stop. It also sits on the path that decides a filed disclosure figure, which
§5.3 protects above everything else in this codebase.

Deliberately **not** chosen, and each remains open with its recorded reason:
organisation soft-delete and erasure (`disableOrganizationDeletion: true`,
`docs/backend.md:2894`), set-metadata editing, retiring a set from the UI, bulk
CSV import, market-based scope 2, AI factor matching, and re-pointing existing
organisations' mappings at a newer set.

## The failure being closed

Verified by reading the code, not inferred from the record:

- `lib/db/emission-queries.ts:719-733` — `listFactorSiblings` matches on
  `and(eq(emissionFactorSet.source, pair.source), eq(emissionFactor.sourceRowId,
  pair.sourceRowId))`. `source` is a **set** column (`lib/db/schema.ts:520`);
  `source_row_id` is a **factor** column (`lib/db/schema.ts:608`).
- `lib/db/emission-queries.ts:316-343` — `sourceRowIdForCustomFactor` returns
  `custom:${sha256(...)}`, and the row is written into a tenant set carrying the
  customer's own `source`.

So a customer-supplied row is unreachable as a sibling on **both** halves of the
key. The user-visible consequence, which the customer cannot resolve from either
side:

1. An organisation maps a `(category, unit)` pair to a DEFRA 2026 row.
2. It supplies its own set covering 2024, which the published data does not
   cover.
3. Records dated 2024 resolve `out_of_period` — `lib/domain/factor-selection.ts`
   `selectFactorForDate` returns `null` — because the tenant row is not a
   sibling of the mapped row.
4. Re-pointing the mapping at the tenant row fixes 2024 and breaks 2026 the same
   way, because the tenant set's window does not cover 2026 and the published
   row is now not a sibling of *it*.

## The design decision, taken with the user on 13 Aug 2026

| question | answer |
| --- | --- |
| how a tenant row declares it restates a published row | **a nullable `(supersedes_source, supersedes_source_row_id)` pair on `emission_factor`** |

Chosen over a `supersedes_factor_id` self-FK and over reusing the published
`source_row_id` verbatim:

- **Not a self-FK.** It pins one specific row, and `listFactorSiblings` already
  filters `isNull(emissionFactorSet.supersededBySetId)`
  (`lib/db/emission-queries.ts:724`). When the target's set is later superseded
  by a republication, the link would stop resolving **silently** — a figure
  disappearing for no recorded reason.
- **Not reusing the published `source_row_id` under a relaxed key.** Dropping
  `source` from the sibling key would let two publishers that reuse one row-id
  string collide into each other's sibling set, producing a *wrong* figure
  rather than a missing one.
- **The chosen pair follows `source_row_id`**, which is already prompt 68's
  answer to "how a mapping travels to another year's set"
  (`docs/backend.md:4215`), and it leaves the tenant set's own `source`
  attribution intact — a customer's own figure is never relabelled as DESNZ's.

## Reference material read for this prompt

| path | what was taken from it |
| --- | --- |
| `lib/db/schema.ts:595-670` | `emissionFactor`'s columns, the `emission_factor_set_row_key (set_id, source_row_id)` unique index and the two existing indexes; `check` is already imported at `:4` |
| `lib/db/schema.ts:520,545` | `source` and `supersededBySetId` are set-level columns |
| `lib/db/emission-queries.ts:310-343` | `sourceRowIdForCustomFactor`'s identity array and `custom:` prefix |
| `lib/db/emission-queries.ts:374-500` | `createTenantFactor`, its transaction, its `onConflictDoNothing` on `(setId, sourceRowId)` |
| `lib/db/emission-queries.ts:678-740` | `listFactorSiblings`, the `visibleFactorScope` predicate and the returned `FactorSibling` shape |
| `lib/db/emission-queries.ts:778-814` | `buildFactorResolver`'s nested `bySourceRow` index and the `bySourceRow.get(mapping.source)?.get(mapping.sourceRowId)` lookup |
| `lib/domain/factor-selection.ts` (whole file, 186 lines) | `covers`, `preferCandidate`, `preferredBySourceRow`, `selectFactorForDate` — none of which needs changing |
| `lib/validation/emissions.ts:396-435` | `createCustomFactorSchema`, `customFactorSchema`, `retireCustomFactorSchema` |
| `docs/backend.md:4198-4405` | prompt 68's decisions, the resolution order, the recorded gap |
| `docs/backend.md:4778-5001` | prompt 70's record and its open-items table |

`app/activity/factors/page.tsx` (300 lines) and `app/activity/actions.ts`
around `createCustomFactor` (`:803-806`) must be **read at execution time**
before being changed; this prompt has confirmed they exist and own the surface,
not their internals.

## What to implement

### 1. Schema — `lib/db/schema.ts`, `emissionFactor`

Two nullable columns, and the constraints that keep them honest:

- `supersedesSource: text("supersedes_source")`
- `supersedesSourceRowId: text("supersedes_source_row_id")`
- a `check` that the two are **both null or both non-null** — a half-declared
  supersession is a row that silently supersedes nothing.
- a `check` that they are null when `organization_id is null` — **published
  reference data never supersedes anything.** Only a customer-supplied row may
  declare a restatement.
- `index("emission_factor_supersedes_idx").on(t.supersedesSource,
  t.supersedesSourceRowId)`, because `listFactorSiblings` will now filter on the
  pair.

Document each column in the style the file already uses — the existing
docblocks on `sourceRowId` and `scope2Method` are the register to match.

### 2. The identity hash — `sourceRowIdForCustomFactor`

Append the two supersession fields to the identity array **only when
supersession is declared.**

This is not a style choice. Two custom factors identical in every other field
but differing in what they supersede are different rows, and without the pair in
the hash they collide on `(set_id, source_row_id)` and the existing
`onConflictDoNothing` (`lib/db/emission-queries.ts:477`) silently discards the
second. Appending unconditionally would instead change the hash of **every
non-superseding submission**, so an organisation re-submitting a factor it
created before this change would get a duplicate row rather than the idempotent
no-op it gets today. Appending only when set preserves every existing hash
exactly.

### 3. The sibling query — `listFactorSiblings`

Widen each pair's predicate to match **either** key:

```
(set.source = $s AND factor.source_row_id = $r)
OR (factor.supersedes_source = $s AND factor.supersedes_source_row_id = $r)
```

`visibleFactorScope(organizationId)` stays an outer `AND` over the whole `where`
and is **not** to be moved inside the `or` — it is what stops one tenant's
superseding row entering another tenant's sibling set. `isNull(deletedAt)` on
both factor and set, and `isNull(supersededBySetId)`, are unchanged.

`FactorSibling` gains the declared pair so the resolver can key on it.

### 4. The keying rule — and it goes in `lib/domain/`

`buildFactorResolver` currently files every sibling under its set's `source` and
its own `sourceRowId` (`lib/db/emission-queries.ts:790-799`), then looks it up by
the mapping's pair. A superseding tenant row would be filed under the **tenant
set's** source and its `custom:` row id, so the widened query would load it and
the resolver would still never find it. **Widening the query alone does not
close the gap.**

Add a pure function to `lib/domain/factor-selection.ts` that returns the keys a
row is reachable under — its own `(source, sourceRowId)`, plus the declared
`(supersedesSource, supersedesSourceRowId)` when present — and have
`buildFactorResolver` file each sibling under **every** key it returns. Indexing
under its own pair as well as the superseded one is required so that a mapping
pointing directly at the tenant row still finds that row's siblings.

It belongs in `lib/domain/` for exactly the reason prompt 68 moved the tie-break
there (`docs/backend.md:4237-4249`): it decides which value multiplies a
customer's activity, `lib/db/` is `server-only` and outside `npm test`'s
`lib/domain/` scope, and left in `lib/db/` this rule would ship untested.

**`covers`, `preferCandidate`, `preferredBySourceRow` and `selectFactorForDate`
need no change.** A superseding tenant row that covers the date already beats a
published row covering the same date, because `preferCandidate` ranks
tenant-owned first — that is the behaviour this change is meant to produce, and
it falls out of the existing total order rather than needing a new tier.

### 5. Validation — `lib/validation/emissions.ts`

An optional supersession object on `customFactorSchema`, with `source` and
`sourceRowId` **required together** when present, mirroring the database check.
`lib/validation/` stays free of any `lib/db/` import (§6.3) — the candidate rows
are passed into the form as props from the server component, never queried from
the schema module.

### 6. The surface — `app/activity/factors/page.tsx` and `app/activity/actions.ts`

The create form gains one optional control: *this factor restates a published
row*, choosing from **the published rows the organisation's current mappings
point at**. That is precisely the set where a supersession has any effect, and it
keeps the list short instead of offering thousands of DEFRA rows.

`createCustomFactor` keeps its existing action order unchanged — BotID absent by
design, `getCurrentMembership()`, user-id rate limit via
`checkFactorMappingLimit`, shared Zod parse, owner-only authorisation,
tenant-predicated write, no email, revalidation of `/activity/factors`,
`/activity/mappings` and `/activity`.

**One behaviour change must be stated in the UI copy**, because it departs from
prompt 66's precedent that creating a factor changes no figure until the owner
maps it: a superseding factor takes effect on the **next recalculation** without
any mapping change. Say so at the control, in the site's measured register, and
do not trigger a recalculation from the create action.

## Measurements this must hit

No comp geometry is involved. The measurements are behavioural, and each is
produced by running the check rather than asserted:

1. **The four-step failure above, reproduced and then closed**, against a real
   database with a synthetic organisation: records dated 2024 report
   `out_of_period` before the change, and after declaring the supersession they
   cost at the customer's own factor while 2026 records continue to cost at the
   DEFRA 2026 row. Report both totals, exactly, as prompt 68's record does
   (`docs/backend.md:4340-4343`).
2. **Query count is constant in the record count** — count
   `pg.Pool.prototype.query` around `recalculateOrganization` at two record
   counts, as prompt 68 did (3 and 3). The widened `or` must not become an N+1.
3. **`npm test`** — the new keying function covered in
   `lib/domain/factor-selection.test.ts`: own-pair only, declared pair, both keys
   reachable, and a row whose supersession is absent. Report the file and test
   counts against prompt 70's baseline of 9 files / 197 tests.
4. **Cleanup is part of the check.** Every synthetic organisation, set, factor,
   mapping and record is removed afterwards and the removal confirmed, as step 7
   and prompt 68 both did.

## Expected impact

**Prerender impact: none — and it must be verified, not assumed.** No marketing
route imports `lib/db/`, `lib/domain/factor-selection.ts` or
`app/activity/*`. The route table must be unchanged: `/`, `/journal`, `/about`,
`/careers`, `/design-system` `○ Static`; `/article/[slug]` (6) and
`/job-listing/[slug]` (3) `● SSG`. Verify with the two-build method in
`docs/automation.md` (`## Regenerating Better Auth's schema, and diffing a build
against the parent`, `:713`, and `### Three more prerender-diff traps, found at
step 10`, `:751`), excluding `.claude/`, `.agents/` and `prompts/`, normalising
`.next/BUILD_ID` and both chunk patterns, and stripping the
`self.__next_f.push` payloads.

**Trust boundary.** No new route and no new request path. The one changed
request path is the existing `createCustomFactor` Server Action: the browser now
additionally submits a claimed `(source, sourceRowId)` pair to supersede. That
pair is **a claim, not a capability** — it is parsed by the shared Zod schema,
and the write stays tenant-predicated exactly as `createTenantFactor` already
handles a submitted `setId` (`lib/db/emission-queries.ts:387-399`). A pair
naming a row the organisation cannot see is harmless by construction: every
read of it runs under `visibleFactorScope(organizationId)`, so it can only ever
resolve to published data or the tenant's own. A rejected request returns the
existing typed result with field errors; nothing throws to the client.

**Secrets and data.** No environment variable is read or added, no
`NEXT_PUBLIC_*`, no `.env.example` line. Emission factors are reference data and
carry no personal data; `activity_factor_mapping.created_by` is untouched.
`lib/db/emission-queries.ts` keeps `import "server-only"` and must gain no
`console` call. Nothing reaches a third party and **no model is called** (§5.3 —
AI factor matching stays deferred).

**Migration.** One generated migration, `0011_*`, via `npm run db:generate`,
applied with `npm run db:migrate` over the direct connection. Two added columns,
two checks and one index; no data migration, since every existing row is
correctly `null` on both. No hand-written `ALTER TABLE`.

## Non-goals

| not doing | why |
| --- | --- |
| changing `covers`, `preferCandidate`, `preferredBySourceRow` or `selectFactorForDate` | the existing total order already produces the wanted outcome; a new tier would be a second rule deciding a filed number |
| per-period mappings, or widening `activity_factor_mapping`'s unique key | prompt 68's explicitly rejected option — one choice per pair keeps its meaning across revisions |
| re-pointing existing organisations' mappings at a newer set | prompt 70's deferral, unchanged: a mapping is a deliberate choice and a backfill would silently undo an override |
| recalculating on create, or a mass recalculation | prompt 68's reasoning stands — a mass recalculation is an operational act, and the cron sweep runs on its schedule |
| bumping `ENGINE_VERSION` | the engine is untouched. Only if the verification in measurement 1 shows a figure moving for a reason other than a deliberately declared supersession |
| organisation soft-delete and erasure | the largest open item, but deferred scope with a recorded reason (`docs/backend.md:2894`), and it wants its own prompt and its own decisions with the user |
| set-metadata editing, retiring a set from the UI, bulk CSV import, market-based scope 2 | untouched prior deferrals |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68, 69 and 70 |
| a third factor set, or a second published year | prompt 69's decision: one year at a time. This makes a *customer's* row reachable; it supplies no data |
| any change to a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | out of scope entirely |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work |

## Checks to run

| check | note |
| --- | --- |
| `npm run db:generate` | quote the migration filename and its statements |
| `npm run db:migrate` | over `DATABASE_URL_UNPOOLED`, per §7.3 |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm test` | quote file and test counts |
| `npm run build` | quote the route table |
| prerender diff | two-build method above; quote files compared / identical / differing |
| `npm run test:e2e` | Chromium and Firefox natively. **WebKit needs rootless Podman, which prompt 70 recorded as not installed** — if it does not run, say so and do not report it as passed |

Report exact output for each (§2, §12 rule 3).

## Where the result is recorded

**`docs/backend.md`**, as a new section following the existing convention —
`## Superseding a published factor row, prompt 71` — placed after
`## A deterministic factor set for the seeded default mappings, prompt 70`
(`:4778`). It must carry the decision above and why the two alternatives were
rejected, the migration and the exact column and check definitions, the
before/after totals from measurement 1, the query counts, the checks table, and
its own "what prompt 71 deliberately did not do" table.

**It must also correct the three standing gap rows** — `docs/backend.md:4399`,
`:4772` and `:4997` — to record that the gap is closed here, rather than leaving
them predicting an open gap that no longer exists (§12 rule 8). AGENTS.md itself
needs **no** change: this adds no index row and no site-wide invariant, and the
front matter's cap rule forbids recording build results there.

## SKILLS USED

| skill | for |
| --- | --- |
| `drizzle-docs` | the two nullable `text` columns, the `check` constraints and the composite index on `emissionFactor`; the `db:generate` / `db:migrate` workflow and the pooled-vs-direct connection split. **Take the `pg-` pages** — titles repeat across six dialects |
| `zod-docs` | the optional supersession object on `customFactorSchema` with both fields required together, and the field-error shape the action already returns |
| `nextjs` | Server Action semantics, `revalidatePath`, and confirming no route's render mode changes |
| `neon-postgres` | the direct connection the migration runs over, and the scale-to-zero cold start that any latency figure must be qualified against |
| `vercel:vercel-storage` | only if a storage question arises; the Neon connection guidance is the relevant part |
| `tailwind-4-docs` | the one new form control on `/activity/factors`, built from the existing primitives in `app/_components/` — no new design system, no new token |
| `frontend-design:frontend-design` | the register and framing of the new control and its "takes effect on next recalculation" copy, so it reads as measured and operational rather than as scaffolding |

No GSAP skill: §7.5 forbids GSAP in backend UI and this adds none. No AI skill:
§5.3 forbids a model call here.

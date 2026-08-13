# 70 — A deterministic factor set for the seeded default mappings

## Scope, and why it is next

**Close the one follow-up prompt 69 recorded as owed, and the one docblock claim
its code no longer satisfies.** `docs/backend.md`, "The DEFRA 2025 factor set,
prompt 69" → *"A finding, reported rather than fixed"*:

> **`seedDefaultMappings` picks its factor row non-deterministically now that two
> sets are visible.** Its query selects by `source_row_id` across
> `visibleFactorScope` with **no `ORDER BY`**, and `new Map(factors.map(…))`
> takes the last row wins. … the fix is an `ORDER BY` making the choice
> deterministic — newest publication year, presumably — not a change to
> resolution.

That record also says why this is a defect rather than a wrong number: prompt
68's resolution path (`lib/domain/factor-selection.ts`) reads the mapped row's
own window first and follows the siblings when it does not cover the date, so a
mapping on the 2025 row and a mapping on the 2026 row produce **the same
figures**. What differs is what `/activity/mappings` shows — two otherwise
identical organisations can display a different dataset version for the same
default, for no recorded reason.

**Why it is next, and why now rather than earlier.** Every step of §5.2's
sequence, 1–14, is built and committed (`git log`: `f9e102b` closes step 14),
and prompts 63–69 are post-sequence work of exactly this kind. This is the only
open item that is a **correctness-of-presentation defect in a disclosure-adjacent
surface** rather than a deferred feature: the remaining deferrals recorded at
`docs/backend.md` prompt 69's "What prompt 69 deliberately did not do" — AI
factor matching, the custom-set sibling gap, market-based scope 2, set-metadata
editing, retiring a set, bulk CSV import — are all new product surfaces, and
§5.2's "do not overbuild" says a feature that is not a step is asked about, not
assumed. This one was explicitly handed forward by the previous prompt's own
record, which is the strongest claim on the next number available.

**This is post-sequence work, as prompts 63–69 were. It is not a step 15.**

## Reference material read for this prompt

| path | what was read |
| --- | --- |
| `docs/backend.md` §"The DEFRA 2025 factor set, prompt 69" | the finding quoted above, and the prompt's non-goals |
| `docs/backend.md` §"Date-effective factor selection, prompt 68" | that resolution is unchanged by this, and why no figure moves |
| `docs/backend.md` §"Step 10 — emission factors and the calculation engine" | `visibleFactorScope`, the reference-table deviation from §9.2 rule 6 |
| `lib/db/emission-queries.ts` | `visibleFactorScope` (l. 99), `seedDefaultMappings` (l. 1623), `searchFactorsForPair` (l. 1443), `getVisibleFactor`, `listFactorSiblings`, `recalculateOrganization` (l. 976, the one caller of the seeder) |
| `lib/domain/factor-selection.ts` | `preferCandidate` (l. 97) — the existing **total order** over candidate sets, and its four documented tiers |
| `lib/domain/defra.ts` | `DEFAULT_FACTOR_MAPPINGS` (l. 380) — eleven mappings over nine distinct `source_row_id`s |
| `lib/db/schema.ts` l. 511–570 | `emission_factor_set`: `organizationId` (nullable), `publicationYear`, `createdAt`, `deletedAt`, `supersededBySetId` |
| `.claude/skills/drizzle-docs` → `references/docs/324-pg-select.md` l. 343–362 | `orderBy` with `asc` / `desc`, multi-column form. Postgres page, per the skill's dialect warning |

## The two defects, as read from the code

**1. Non-deterministic winner.** `seedDefaultMappings` (l. 1638–1658) selects
`{ id, sourceRowId }` with no `orderBy`, then `new Map(factors.map(…))` — last
row wins, and with two published DESNZ sets each of the nine ids returns two
rows. Row order from Postgres without `ORDER BY` is not defined.

**2. A docblock that the code no longer satisfies.** `searchFactorsForPair`'s
docblock states it applies *"the same three predicates `seedDefaultMappings`
applies"*. It does not: the picker filters
`isNull(emissionFactorSet.deletedAt)` and the seeder **does not**. Verified by
reading both `where` clauses. Under §12 rule 8 the repository is the fact and
the divergence is closed rather than described — here by adding the missing
predicate to the seeder, which is the direction that makes the docblock true and
cannot widen what the seeder may choose.

## What to build

**Reuse the total order that already exists; do not author a second one.**
`preferCandidate` is the project's single answer to "which of several covering
sets wins", decided with the user on 12 Aug 2026 and documented in its own
docblock (tenant-owned before published → `publicationYear` desc → set
`createdAt` desc → set id asc). An `ORDER BY` in SQL restating those four tiers
would be a second copy of a rule that decides a filed number's provenance.

1. **`lib/domain/factor-selection.ts` — one new pure export.** A function that
   takes candidate rows carrying a `sourceRowId` plus the fields
   `preferCandidate` reads, and returns a `Map<sourceRowId, winner>` chosen with
   `preferCandidate`. Name it for what it does; keep it in this module because
   it *is* the same decision, and keep it pure (no I/O, no `Date.now()`). Its
   docblock states that the seeder and the resolver agree by construction.
2. **`lib/db/emission-queries.ts` — `seedDefaultMappings`.** Select the set
   provenance columns the helper needs (`emissionFactorSet.organizationId`,
   `publicationYear`, `createdAt`, `id`), add
   `isNull(emissionFactorSet.deletedAt)` to the `where`, and replace the
   last-wins `new Map(...)` with the helper. **`visibleFactorScope(organizationId)`
   stays exactly as it is** — the tenant predicate is not touched, restated or
   inlined.
3. **`searchFactorsForPair` — a deterministic tail on its existing `orderBy`.**
   Two identically-labelled rows from two sets currently order arbitrarily
   between themselves, which also decides arbitrarily which survives
   `FACTOR_SEARCH_LIMIT`. Append a stable tail after the three label columns —
   customer-supplied first, then `publicationYear` desc, then set id asc, i.e.
   the same reading order `preferCandidate` encodes — using `asc`/`desc` per the
   Drizzle page above. The label columns keep their present precedence, so the
   list a reporter sees does not reorder.
4. **Tests, in `lib/domain/factor-selection.test.ts`** (`npm test` is scoped to
   `lib/domain/`, §2). At minimum: two published sets over one `sourceRowId`
   picks the newer publication year **regardless of input array order**; a
   tenant-owned set beats a published one; identical years fall through to
   `createdAt` then set id; an id present in no candidate row is absent from the
   map, so the seeder's existing "a default naming a row the set does not
   contain inserts nothing" behaviour is preserved.

**No schema change and no migration.** No column is added and none is altered;
`db:generate` must not be run as part of this work.

## Measurements this must produce

Not eyeballed — each is a command whose output goes in the record.

1. **The defect's precondition, from the live database.** For the nine distinct
   `source_row_id`s in `DEFAULT_FACTOR_MAPPINGS`, count visible non-deleted,
   non-superseded rows per id across both published sets. Quote the counts and
   the two set ids. If any id does not return two rows, say so — the finding
   assumes it does.
2. **The winner, read back.** Against a throwaway organisation with no mappings,
   run the seeded path, then read each inserted mapping's factor row and its
   set's `dataset_version`. Expect **every one on the newest published set**.
   Quote the eleven rows. **Tear the throwaway organisation and its mappings
   down afterwards and quote the counts back at baseline**, as prompt 69's
   teardown did.
3. **Determinism, not luck.** Show the choice is fixed by the order rather than
   by arrival: assert it in the domain tests over shuffled input (point 4
   above), since a repeated database read cannot prove absence of a coincidence.
4. **No figure moves.** With an existing calculated organisation — or a
   synthetic one built as prompt 69 built its five records — record
   `activity_emission.factor_id` and `kg_co2e` before and after the change and
   show they are **identical**. This is the claim that this prompt changes
   presentation only; if any figure moves, stop and report it rather than
   accommodating it.
5. **Query count unchanged.** `seedDefaultMappings` must remain one `select`
   plus one `insert` inside its transaction. Count pool-level queries around
   `recalculateOrganization` the way prompts 68 and 69 counted them (3 at 5
   records) and confirm the number is unchanged.

## Prerender impact

**Expected: none. Every route's HTML and render mode identical.** No route file,
no component and no marketing surface is touched; the changes are two
server-only query functions and one pure domain module.

**Verified, not assumed**, by the two-build method in `docs/automation.md` —
both sides excluding `.claude/` and `.agents/`, normalising `.next/BUILD_ID` and
both the `.js` and `.css` chunk patterns, stripping the `self.__next_f.push`
payloads. The baseline to reproduce is prompt 69's: **31 routes — 11 `○ Static`,
2 `● SSG` (6 + 3 paths), 18 `ƒ Dynamic`, plus `ƒ Proxy (Middleware)`**, and
**CSS byte-identical at 68,208 bytes**. Quote the table actually produced; if it
differs, the record is the fact (§12 rule 8).

**One live hazard, and it is why the CSS number is quoted.** Tailwind v4 scans
`.ts` files including tests and extracts candidate class names **from prose** —
`docs/backend.md` prompt 58 and `docs/automation.md` record a bare English verb
in a doc comment shipping a `text-overflow` rule to every page. This prompt adds
docblocks and tests. **If the CSS grows by a rule, find the word and reword it**
rather than accepting the byte difference.

## Trust boundary

**No new request path, no new route, no new action.** The two already-authorised
paths whose behaviour this reaches are unchanged in their stages:

- the `recalculate` Server Action in `app/activity/actions.ts` — `resolveTenant()`
  → rate limit by user id → `safeParse` → tenant-predicated reads → pure engine
  → tenant-predicated write. No stage added or removed.
- `/api/cron/recalculate`, which drives the same function.

**Nothing crosses the tenant boundary.** `visibleFactorScope(organizationId)` is
unchanged in every query this prompt touches, and the change *narrows* what the
seeder may select (one extra `deleted_at is null`) rather than widening it. No
input from the browser reaches the new code: `DEFAULT_FACTOR_MAPPINGS` is a
compiled-in constant. A rejected request is impossible here because there is no
request.

## Secrets and data

- **No new environment variable, no `NEXT_PUBLIC_*`, no `.env.example` line.**
  Runtime reads the existing pooled `DATABASE_URL`; any verification read uses
  the existing direct `DATABASE_URL_UNPOOLED` through `dotenv -e .env.local --`.
- `lib/db/emission-queries.ts` keeps `import "server-only"`.
  **`lib/domain/factor-selection.ts` must not gain it** — the domain layer is
  pure and stays importable and independently testable (§6.2).
- **No personal data.** Emission factors are public reference data; the mappings
  carry a nullable `created_by` that this prompt does not touch.
- **Nothing is logged**, on any path or in any catch — `lib/db/emission-queries.ts`
  has no `console` call and must still have none (§8.3 rule 2). Verification
  output goes to a throwaway script's stdout, never into request-path code, and
  names no organisation.
- Nothing reaches a third party. **No model is called** (§5.3: AI factor
  matching stays deferred).

## Non-goals

| not doing | why |
| --- | --- |
| changing `selectFactorForDate` or any resolution semantics | prompt 68's path is correct and prompt 69 proved it against two sets. This is which row a *new* organisation's default names, not how a date resolves |
| an `ORDER BY` restating `preferCandidate`'s four tiers in SQL | a second copy of the rule that decides a figure's provenance. The pure function is the single definition |
| re-pointing existing organisations' mappings at the newer set | a mapping is a deliberate choice once made, and `seedDefaultMappings` refuses to overwrite one — a backfill would silently undo overrides. If it is wanted, it is its own prompt with the user's say-so |
| bumping `ENGINE_VERSION` | the engine is unchanged and no figure moves. `1.1.0` stands |
| any schema change, migration or `db:generate` | none is needed |
| loading a third factor set, or 2024 | prompt 69's decision: one year at a time |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68 and 69 |
| the custom-factor-set sibling gap (`createTenantFactor` hashing its own `source_row_id`) | prompt 68's open gap, unchanged and still open |
| market-based scope 2, set-metadata editing, retiring a set, bulk CSV import | untouched prior deferrals |
| any marketing route's markup, `SiteNav`, `SiteFooter`, or GSAP | §8.1 and the front matter's settled surfaces |
| showing the dataset year anywhere new in the UI | `/activity/mappings` (l. 220) and the picker (l. 151) already render `source` + `datasetVersion`; no new surface is owed |

## Checks to run

Report exact output; never claim a pass without it (§2, §12 rule 3).

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | the **197-test, 9-file** baseline plus the new `factor-selection` cases; every prior test still passing |
| the five measurements above | via a throwaway `dotenv -e .env.local -- tsx` script, not committed to a request path |
| `npm run build` | the 31-route table above, unchanged |
| prerender diff | **0 of 21 differed**; CSS byte-identical, or the leaked word found and reworded |
| `npm run test:e2e` | Chromium + Firefox natively. **WebKit will not run** — `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux" and podman is not installed here. Report it as an environment gap, never as a pass |

`npm run db:generate` and `npm run db:migrate` are **not** run — there is no
schema change.

## Where the result is recorded

**`docs/backend.md`**, as a new section immediately after "The DEFRA 2025 factor
set, prompt 69". It must:

- state that prompt 69's *"A finding, reported rather than fixed"* is now
  **closed**, and amend that paragraph's forward-looking last sentence rather
  than leaving it predicting a fix that has happened (§12 rule 8);
- correct the same rule's second half honestly — the fix is **not** the
  `ORDER BY` prompt 69 predicted but a reuse of `preferCandidate`, and say why;
- record the measured counts, the read-back winners, the before/after
  `factor_id` and `kg_co2e` equality, and the query count;
- record the `searchFactorsForPair` docblock divergence and its closure.

**Nothing is added to `AGENTS.md`** — no index row (this is `docs/backend.md`
again) and no invariant (nothing here can be broken without opening that file).

Commit to `main`, unprompted, per §1 step 10. Do not push.

## SKILLS USED

- **`drizzle-docs`** — the `orderBy` / `asc` / `desc` form on a joined select,
  from the **Postgres** page `references/docs/324-pg-select.md`; and this
  project's fixed Drizzle decisions (pooled vs direct URL, generated migrations
  only). Required for both query edits.
- **`nextjs`** — to confirm nothing in a server-only data module or a pure
  domain module can change a route's render mode, before asserting "prerender
  impact: none". Read before the build is claimed clean.
- **`zod-docs`** — only if a validation schema turns out to be involved. It
  should not be: no new input crosses the boundary. If nothing is owed, say so
  rather than opening it for form.
- **`vercel:vercel-storage`** — Neon connection guidance if the verification
  script's connection needs anything beyond the existing
  `dotenv -e .env.local --` + `DATABASE_URL_UNPOOLED` pattern.
- **`neon-postgres`** — scale-to-zero: the first query after idle pays a cold
  start of a few hundred ms, so any timing quoted must say whether it was warm
  (§7.3). Only relevant if a duration is recorded.
- **`vercel:nextjs`** — the vendored counterpart to `nextjs`; load whichever the
  listing resolves, not both, and say which was used.

No skill covers `lib/domain/`'s pure arithmetic or this repository's own
`preferCandidate` ordering — those come from the source files named above, read
this session.

# 67 — Custom factor set corrections

## Scope, and why it is next

**Not a new feature — the correction pass on prompt 66.** Resolved from the
repository and `git log`: `98a8382 Add custom factor sets` is `HEAD`, and
`docs/backend.md` records prompt 66 as implemented. A review of that commit
found seven defects, one of which loses customer-supplied provenance silently.
Nothing further should be built on `/activity/factors` until they are fixed,
because the set-metadata defect writes wrong evidence into a disclosure's
attribution and every later factor feature inherits the surface.

§5.2's build sequence remains exhausted; this prompt adds no step and no
product surface. The seven findings, in the order they are fixed:

1. **Set metadata is silently discarded after the first row.**
   `createTenantFactor` (`lib/db/emission-queries.ts:311`) inserts the set with
   `onConflictDoNothing` and then re-selects it, so every subsequent factor
   under the same `(source, dataset_version)` throws away the licence,
   effective range, source URL, reference and notes the form just collected.
   The owner sees "Customer-supplied factor saved" and no indication. That
   licence string is rendered as disclosure evidence by `reportSections`'
   provenance notes, on `/dashboard` and in `EmissionsSummary`, so a corrected
   licence never lands and a wrong one persists. Effective dates are stored and
   displayed but nothing selects factors by them yet (`effectiveFrom` has no
   reader outside display and the seeder), so this is a provenance-integrity
   defect today and a factor-selection defect the day date-based selection
   arrives.
2. **Retiring gives no in-use signal.** `retireCustomFactor` soft-retires a row
   that may be the chosen factor for one or more `(category, unit)` pairs.
   Every join filters `isNull(emissionFactor.deletedAt)`, so those pairs
   silently become unmapped at the next recalculation. Degrading to a visible
   gap is the right failure mode; telling the owner nothing is not.
3. **Retired rows still count.** `listTenantFactorSets`' `factorCount`
   subquery (`lib/db/emission-queries.ts:198`) omits
   `and deleted_at is null`, which `listFactorSets` (line 141) has, so
   `/activity/factors` and `/activity/mappings` disagree about the same set.
4. **Non-owners see the whole form.** `/activity/factors` never reads
   `membership.role`, so a member fills roughly twenty fields before the action
   refuses. Server-side enforcement is correct and stays; the presentation half
   is missing.
5. **Invalid markup.** `Detail` in `app/activity/factors/page.tsx:161` emits
   `<dt>`/`<dd>` whose nearest ancestor is a `<div>` inside an `<li>`, with no
   `<dl>`. `MiniDetail` in the form does it correctly.
6. **`gasBasis` is hard-coded `"combined_co2e"`**
   (`lib/db/emission-queries.ts:326`) whatever gas the owner chose, so a
   per-gas CH4 row lands in a set labelled combined. Nothing reads the column
   today, which is why it is last in severity, not why it is acceptable.
7. **The client leaf renders the factor list.** 619 lines, including the whole
   row table, against prompt 66's own brief that the leaf owns "only pending
   state, courtesy validation, focus management and the announced result".

## Reference material read for this prompt

- `AGENTS.md` §§6.2, 6.3, 8.1, 8.2, 8.3, 9.2, 10, 11, 12
- `docs/backend.md` — the prompt 66 section (the record this prompt corrects),
  prompt 65's mapping surface, step 10's reference-data design
- `prompts/66-custom-factor-sets.md` — decisions 2, 5, 6 and the client-leaf
  brief this prompt restores
- `git show 98a8382` — the whole implementation under review
- `lib/db/schema.ts` — `emissionFactorSet` (lines 511–570: the two partial
  unique indexes, `factorGasBasis` at 482 with values `combined_co2e` /
  `per_gas`), `emissionFactor` (591–665, `emission_factor_set_row_key` at 662),
  `activityFactorMapping` (690–723, `activity_factor_mapping_factor_idx`)
- `lib/db/emission-queries.ts` — `listFactorSets`, `listTenantFactorSets`,
  `listTenantFactors`, `createTenantFactor`, `retireTenantFactor`,
  `getVisibleFactor`, `visibleFactorScope`, `factorLabelOf`
- `lib/validation/emissions.ts` — the prompt 66 schemas
- `app/activity/actions.ts` — `createCustomFactor`, `retireCustomFactor`,
  `customFactorFieldErrors`
- `app/activity/factors/page.tsx`, `app/_components/activity/custom-factor-form.tsx`
- `app/_components/primitives.tsx` — `Button`, `Field`, `TextareaField`
- `zod-docs` skill — `references/docs/02-defining-schemas.md` on
  `z.discriminatedUnion` (each option must be an *object* schema; a
  `superRefine` therefore goes on the wrapping object, not on a member)
- `node_modules/drizzle-orm/pg-core/query-builders/insert.js:100` — how
  `onConflictDoNothing`'s `where` is emitted as the index predicate

## Decisions this prompt makes

Each is a judgement, not a measurement.

1. **The set becomes an explicit choice, not an inferred one.** The form gains
   a factor-set selector: an existing tenant-owned set, or "a new set" which
   reveals the metadata fields. `createCustomFactorSchema`'s `set` becomes a
   discriminated union on `mode`. This is what actually removes the silent
   discard — validating the resubmitted metadata against the stored set would
   still make the owner retype it every time and would turn a harmless repeat
   into an error.
2. **Creating a set that already exists is a field error, not a silent reuse.**
   `mode: "new"` with a `(source, dataset_version)` the organisation already
   has returns a typed error on `set.datasetVersion` naming the existing set.
   The race path — `onConflictDoNothing` inserting nothing — returns the same
   error, so concurrent submissions cannot diverge.
3. **Retirement states its consequence and is confirmed in place.** The row
   lists how many active mappings use it; retiring an in-use factor takes a
   second, explicit click on the same button ("Confirm retire"). No
   `window.confirm`, no dialog — a browser modal blocks the page and this
   codebase has no confirm primitive.
4. **The consequence is reported from the server's own count**, taken inside
   the same transaction as the update, so the announced number is the number
   that was true at the write. A count read before the transaction could be
   stale by the time the row is retired.
5. **The mapping row is left in place on retirement.** It is not soft-deleted
   and not repointed. The pair degrades to unmapped, which the coverage surface
   already renders as a visible gap, and the historical `activity_emission`
   rows stay re-derivable — prompt 66 decision 6, unchanged.
6. **`gas_basis` is derived, not asked.** `gas === "co2e"` writes
   `combined_co2e`; every other gas writes `per_gas`. The owner is not asked a
   question whose answer is already implied by the gas they chose, and no new
   field appears in the form.
7. **A set's basis is settled by its first row.** A set holds one
   `gas_basis`, so a later row of the other kind cannot restate it — mode
   `"existing"` writes rows into the set as it stands, and a mismatch between
   the chosen gas and the set's basis is a typed field error on `factor.gas`
   pointing at the set. This is the honest reading of a per-set column; making
   it per-row is a schema change and belongs to whoever needs it.
8. **The row list moves to the server; retirement becomes its own leaf.**
   `app/activity/factors/page.tsx` renders the rows; a small
   `RetireFactorButton` client leaf owns the arm/confirm state, the pending
   state and its own announcement. Both leaves stay component-only.
9. **A member sees the surface read-only.** The sets and rows still render; the
   form and the retire buttons are replaced by one line saying an owner
   maintains customer-supplied factors. The action's owner check is untouched —
   this is presentation, and §11.2 rule 2 says so.

## The work

### 1. Validation — `lib/validation/emissions.ts`

Split the set schema so the union members are plain objects:

- keep the existing field definitions, but move them into an object with
  `mode: z.literal("new")`;
- add `{ mode: z.literal("existing"), setId: z.uuid() }`;
- `createCustomFactorSchema` becomes
  `z.object({ set: z.discriminatedUnion("mode", [...]), factor: customFactorSchema })`
  with the cross-field rules that belonged to the set (`effectiveTo` not before
  `effectiveFrom`; a source URL or an internal reference) moved to a
  `superRefine` on the wrapper, guarded by `set.mode === "new"` and emitting
  paths `["set", "<field>"]` so the existing two-segment field-error mapping in
  both the action and the leaf keeps working unchanged.
- `CustomFactorField` must cover `set.setId` and `set.mode` as well as the new
  set's fields. Derive it from the schemas; do not restate a field list.
- Add the copy for the two new refusals — the set already exists, and the gas
  does not match the set's basis — to `CUSTOM_FACTOR_ERRORS`, in the same
  measured operational register as the existing entries.

`customFactorSchema` itself is unchanged. `retireCustomFactorSchema` is
unchanged.

### 2. Query layer — `lib/db/emission-queries.ts`

- `listTenantFactorSets`: add `and deleted_at is null` to the `factorCount`
  subquery, matching `listFactorSets`. Also return `gasBasis`, which the form
  needs to explain a set's basis, and `deletedAt` so a retired set is not
  offered as a target.
- `listTenantFactors`: return `mappingCount` — active
  `activity_factor_mapping` rows for the organisation that point at the factor
  and are not soft-deleted. One correlated subquery, not an N+1.
- `createTenantFactor`: return a typed outcome rather than throwing for the
  expected refusals —
  `{ ok: true, factorId } | { ok: false, reason: "set_exists" | "set_not_found" | "gas_basis_mismatch", … }`.
  In one transaction:
  - `mode: "existing"` — re-read the set under
    `organization_id = $1 and deleted_at is null`. A missing, retired or
    foreign set is `set_not_found`, indistinguishable from each other, exactly
    as `getVisibleFactor` treats a foreign factor id. **A submitted `setId` is
    a claim, not a capability.**
  - `mode: "new"` — insert with the existing `onConflictDoNothing` target and
    predicate; if nothing was inserted, the set exists, so answer `set_exists`.
  - either way, compare the derived `gas_basis` against the set's and answer
    `gas_basis_mismatch` when they differ.
  - insert the row with `organization_id = $1`, `result_unit = "kg_co2e"`, the
    derived `gas_basis` on a new set, and the existing `custom:` SHA-256
    `source_row_id`. Keep the `(set_id, source_row_id)` conflict backstop and
    its re-select, which is what makes a double submission idempotent.
- `retireTenantFactor`: in one transaction, count the active mappings pointing
  at the row, then soft-retire it under
  `id = $1 and organization_id = $2 and deleted_at is null`. Return
  `{ retired: false }` when the update matched nothing, and
  `{ retired: true, mappingCount }` otherwise. Do not touch the mapping rows.

No schema change and no migration: nothing above adds a column, an index or an
enum value. If implementation shows one is genuinely needed, stop and say so
rather than hand-writing SQL (§7.2) — `npm run db:generate` writes it.

### 3. Actions — `app/activity/actions.ts`

Stage order, typed results and the silent-log rule are unchanged. Only stage e
changes:

- `createCustomFactor` maps the three refusals onto field errors —
  `set.datasetVersion` for `set_exists`, `set.setId` for `set_not_found`,
  `factor.gas` for `gas_basis_mismatch` — and keeps the generic failure for a
  thrown error, which is now a bug rather than an expected outcome.
- `retireCustomFactor` returns the mapping count on success so the leaf can
  state the consequence. `CustomFactorResult` gains an optional success payload
  or a sibling result type; either is acceptable, but it stays a typed result
  and never a thrown string (§10 rule 2).
- Both keep `checkFactorMappingLimit`, BotID-absent-by-design, and revalidation
  of `/activity/factors`, `/activity/mappings` and `/activity`.

Nothing is logged: not a factor value, a source name, an organisation name, a
row description or a caught payload.

### 4. Surface

`app/activity/factors/page.tsx`:

- read `membership.role`; pass `canManage = role === "owner"` down;
- wrap the set-detail grid in a `<dl>` so `Detail`'s `<dt>`/`<dd>` are legal,
  and check the same defect is not repeated anywhere else added by prompt 66;
- render the factor rows here, in the Server Component, with scope, activity
  unit, gas, value, region, state and the mapping count;
- render `RetireFactorButton` per row for an owner only;
- render the create form for an owner only, with one line of copy for a member
  in its place.

`app/_components/activity/custom-factor-form.tsx`:

- loses the row list;
- gains the set selector, which reveals the metadata fields only for a new set
  and shows the chosen set's provenance and basis otherwise;
- keeps courtesy validation with the same shared schema, pending state, focus
  management and the announced result;
- stays component-only: no exported constant, no exported type, no data
  fetching.

`app/_components/activity/retire-factor-button.tsx` is new: arm, confirm,
pending, announce. Component-only.

Both leaves keep the existing `role="status" aria-live="polite"` pattern and
the focus move to the status line, so success and refusal are legible without
colour (§8.2 rule 5). The arm state must be announced, not only styled.

### 5. Tests

Extend the existing pure coverage where it fits: the discriminated-union schema
and its cross-field rules are pure and testable without a database. Add cases
for the `existing`/`new` split, the guarded `effectiveTo` and
URL-or-reference rules, and the unchanged decimal bound. `npm test` is scoped to
`lib/domain/`, so a validation test belongs wherever the existing schema tests
live — check, and if there is no precedent for testing `lib/validation/`, say so
rather than widening the Vitest scope in this prompt.

Do not add E2E coverage. `npm run test:e2e:local` still fails before tests
start, as prompt 66 recorded.

## Prerender impact

Expected: **none**. `/activity/factors`, `/activity` and `/activity/mappings`
are already dynamic (`ƒ`), no marketing route is touched, no route is added or
removed, and `proxy.ts` is not edited. Verify rather than assume: `npm run
build`, confirm the route table is unchanged from the one recorded in
`docs/backend.md` for prompt 66, and run the two-build prerender diff by the
method that worked there (repository-local scratch, hard-linked `node_modules`,
pinned `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, normalised build id and chunk
names). The expected result is `diff_html=0` over the same 21 files.

## Trust boundary

| what crosses | from | validated | authorised by | rejection |
| --- | --- | --- | --- | --- |
| `set.mode = "new"` metadata plus one factor row | `/activity/factors` leaf | shared Zod schema, then the derived-basis and set-identity checks in the transaction | live session, membership row, `role === "owner"` | typed `{ ok: false, error, fieldErrors? }` |
| `set.mode = "existing"` `setId` | the same leaf | `z.uuid()` shape first, then re-read under `organization_id = $1 and deleted_at is null` | the same owner check | `set_not_found`, identical for missing, retired and foreign |
| `factorId` to retire | `RetireFactorButton` | `z.uuid()`, then the update's own tenant predicate | the same owner check | identical not-found for missing and foreign |

The organisation id never crosses the browser boundary; it is resolved
server-side from the membership row on every render and every call. The mapping
count returned on retirement is the organisation's own data, and is a count —
it names no pair and no factor of another tenant.

## Secrets and data

- No new environment variables, no `NEXT_PUBLIC_*`.
- Reads existing `DATABASE_URL` through `lib/db/client.ts` and the existing
  Upstash limiter (`KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- No email, Blob, AI or third-party model call.
- Stores and reads the same tenant commercial data as prompt 66 — customer
  factor values and provenance. Nothing new is collected. Nothing is logged.

## Non-goals

| not doing | why |
| --- | --- |
| bulk factor-set CSV import | unchanged from prompt 66 — needs a parser, staging surface and rollback |
| editing a stored set's metadata after creation | a real gap this prompt narrows but does not close; it is a restatement question, and a set whose licence changes may need superseding rather than editing |
| retiring a whole set from the UI | the query layer already refuses to add rows to a retired set; offering the button needs the same in-use accounting per set |
| repointing or soft-deleting mappings on retirement | decision 5 — the visible gap is the correct failure |
| per-row `gas_basis` | a schema change; decision 7 records the reading |
| date-based factor selection by `effective_from` / `effective_to` | not built for published sets either; it is its own prompt |
| a `window.confirm` or a modal | decision 3 |
| E2E harness repair | still its own prompt |
| any marketing-route, `WorkspaceNav`, primitive or GSAP change | out of scope |

## Checks

Run every applicable check and quote the exact output:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` and route-table verification
- the two-build prerender HTML diff from `docs/automation.md`
- `npm run db:generate` **only** to confirm no migration is pending; if it
  writes one, stop and report it rather than applying an unplanned schema change
- `npm run test:e2e:local` — quote the same blocker honestly if it persists
- `npm run test:e2e:webkit` — quote the `podman` requirement if it is still
  absent

Record the result in `docs/backend.md` by **correcting the prompt 66 section in
place and adding a short prompt 67 subsection under it** — §12 rule 8: the
existing section documents behaviour that this prompt changes (the set
find-or-create, the retire semantics, the client leaf's contents), and leaving
it to be read as current is the failure that rule names. Do not edit
`AGENTS.md`; nothing here is a site-wide invariant.

## SKILLS USED

- **`zod-docs`** — `z.discriminatedUnion` requiring object members, `superRefine`
  on the wrapper, `z.flattenError`, and the shared-schema rule
- **`drizzle-docs`** — transactions, correlated subqueries, `onConflictDoNothing`
  target and predicate, and confirming no migration is generated
- **`nextjs`** — Next 16 Server Actions and Server Components, `revalidatePath`,
  and keeping the new leaves out of any prerendered route
- **`tailwind-4-docs`** — v4 utilities and the existing token discipline for the
  reworked page and the two leaves
- **`vercel-react-best-practices`** — component-only client leaves, minimal
  serialized props, no client data fetching
- **`better-auth-best-practices`** — server-side session and database-backed
  role reads
- **`organization-best-practices`** — owner/member semantics for the read-only
  member view
- **`neon-postgres`** — pooled/direct split and the scale-to-zero caveat on any
  timing claim
- **`upstash-ratelimit-js`** — the unchanged user-id keyed limiter

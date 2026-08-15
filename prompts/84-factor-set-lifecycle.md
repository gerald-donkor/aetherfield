# 84 — The factor set's lifecycle: correct its provenance, retire it

## Scope, and why it is next

**Every one of AGENTS.md §5.2's fourteen build steps is committed** (resolved
from the repository and `git log`, not from `prompts/` — §12 rule 5), so this is
post-sequence work, as prompts 63–83 were. It is **not a step 15**.

The open items named in `docs/backend.md`'s own deferral tables are:

| deferral | status |
| --- | --- |
| **editing a set's metadata, and retiring a set from the UI** | named by prompts 67, 68, 69, 70, 73, 82. Prompt 82's table says it "wants its own prompt" |
| market-based scope 2 | untouched, and it is an engine and schema change, not a correction path |
| re-pointing existing mappings at a newer set | prompt 70's *refusal*, with a recorded reason. Not a deferral to close |
| AI factor matching | **blocked, not deferred** — prompt 75 reached AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, and prompt 76 shipped the provider-free path |

So this one is next by elimination among things that are actually open, and on
its own merits:

1. **`emission_factor_set.deleted_at` is a column nothing ever writes.** Nine
   read paths in `lib/db/emission-queries.ts` filter `isNull(emissionFactorSet.deletedAt)`
   (lines 190, 458, 835, 1015, 1840, 1930, 1997, 2124) and
   `app/activity/factors/page.tsx:39` derives `activeSets` from it, but **no
   action and no query sets it**. Retirement is designed, filtered for, and
   unreachable.
2. **A set's provenance is uncorrectable today.** `licence` is rendered as
   disclosure evidence — `lib/db/report-evidence.ts:171-201` selects `source`,
   `datasetVersion`, `publicationYear`, `licence`, `licenceUrl`, `sourceUrl`
   and `sourceReference` straight off the set for every report — and a typo in
   any of them can only be escaped by creating a second set and re-importing
   every row.
3. **Prompt 82 made the gap worse.** Bulk import means a mistyped set can now
   arrive with 8,740 rows behind it, and the only exit is to import them again.

## Reference material read

Read this session, by path, before the file was written:

- `lib/db/schema.ts:490-575` — `emissionFactorSet`'s docblock, its columns, the
  two partial unique indexes and why there are two
- `lib/db/schema.ts:1027,1078` — `report.evidence`, "the whole disclosure, and
  it is immutable", stored as `text`
- `lib/db/emission-queries.ts:142-195` (`listFactorSets`), `197-272`
  (`TenantFactorSet`, `listTenantFactorSets`), `394-545`
  (`CreateTenantFactorOutcome`, `resolveWritableSet` and its
  `onConflictDoNothing` collision idiom), `700-755` (`retireTenantFactor` — the
  shape this prompt copies)
- `lib/db/report-evidence.ts:167-201` — `listPeriodFactorSets`, which reads the
  set live and does **not** filter `deletedAt`
- `lib/validation/emissions.ts:303-332` (`newFactorSetSchema`,
  `existingFactorSetSchema`, `factorSetChoiceSchema`), `423-460`
  (`createCustomFactorSchema` and its two cross-field rules), `461-600`
  (the import schema, `CUSTOM_FACTOR_ERRORS`, `retireCustomFactorSchema`,
  `CustomFactorField`, `RetireCustomFactorResult`)
- `app/activity/actions.ts:788-1155` — `createCustomFactor`,
  `importCustomFactors`, `retireCustomFactor` and `customFactorFieldErrors`
- `app/activity/factors/page.tsx` — all 336 lines, both list sections, `Detail`,
  `MiniDetail`, `canManage`, `activeSets`
- `app/_components/activity/retire-factor-button.tsx` — the arm/confirm pattern,
  the live region, why there is no `window.confirm`
- `app/_components/activity/factor-import-form.tsx:1-90` — the leaf docblock,
  `FormFactorSet`, `FIELD_ALIGN`, `SELECT_CLASS` and why they are local
- `e2e/factor-import.spec.ts:1-60` — the Chromium-only walk, `OWNER_STATE_PATH`,
  the per-run unique set name
- `docs/backend.md` — prompts 66, 67, 82 and 83's sections and every deferral
  table quoted above
- `.claude/skills/drizzle-docs/references/docs/333-pg-update.md` — `update`,
  `.set()`, `.returning()`. **There is no conflict clause on `update`**; only
  `insert` has `onConflictDoNothing`
- `.claude/skills/zod-docs/references/docs/02-defining-schemas.md:1184-1370` —
  `.shape`, `.extend()`, `.omit()`, and the docs' own preference for spread
  syntax over `.extend()`

## The decisions this prompt makes

Each is a decision, not a measurement (§12 rule 4). Record them in
`docs/backend.md` with their reasons.

**D1 — Editable: the ten provenance and applicability fields.** `source`,
`datasetVersion`, `publicationYear`, `effectiveFrom`, `effectiveTo`, `licence`,
`licenceUrl`, `sourceUrl`, `sourceReference`, `notes`. That is exactly
`newFactorSetSchema` minus `mode`, which is why the edit schema derives from it
rather than restating it.

**D2 — `gasBasis` is not editable.** `resolveWritableSet` refuses a row whose
derived basis differs from the set's (`lib/db/emission-queries.ts:501-503`), and
the basis is derived from the rows themselves (`co2e` → `combined_co2e`, any
other gas → `per_gas`). Editing it would relabel every stored row's meaning
without touching a row. The form states that it is fixed; it does not render a
disabled control that implies otherwise.

**D3 — Editing the effective window is allowed, and the surface says what it
costs.** Prompt 68 made selection date-effective, so a corrected window changes
which factor applies **at the next recalculation** and nothing before it. It
changes no filed report: `report.evidence` is an immutable stored snapshot
(`lib/db/schema.ts:1027`). Say both, in the copy, in the voice of §5's register.

**D4 — Retiring a set is `deleted_at`, and it does not cascade to its rows.**
Every read path already excludes a retired set's rows through the set join, so
cascading would add a second source of truth for the same fact and make an
un-retire (not built here) a per-row repair. The rows list must therefore stop
calling such a row "Active" — see task 4.

**D5 — Retirement reports its cost the way row retirement does.** Count the
active `activity_factor_mapping` rows pointing at any live row of the set,
**inside the same transaction as the update**, and return it. A count read
before the update can be stale by the time it lands — `retireTenantFactor`'s
docblock records exactly this.

**D6 — A published set can never be retired or edited here.** Both queries
filter `eq(emissionFactorSet.organizationId, organizationId)`, which is non-null,
so a published set (`organization_id is null`) is not addressable. A missing,
already-retired, published or foreign id is **one indistinguishable
`set_not_found`**, exactly as `resolveWritableSet` and `getVisibleFactor` treat
theirs. No existence oracle.

**D7 — Both operations are owner-only**, checked inside the action after the
session and the `pendingDeletion` lock, as `retireCustomFactor` does. `canManage`
on the page stays presentation (AGENTS.md §11.2 rule 2).

## The work

### 1. `lib/validation/emissions.ts` — two schemas, derived not restated

- `editFactorSetSchema` — `z.object({ setId: z.uuid({ error: "Choose a factor
  set." }), ...newFactorSetSchema.omit({ mode: true }).shape })` carrying
  **`createCustomFactorSchema`'s two cross-field rules verbatim**: `effectiveTo`
  not before `effectiveFrom`, and at least one of `sourceUrl` /
  `sourceReference`. Prefer the spread over `.extend()`, per the Zod docs line
  cited above. The issue paths are **single-segment field names here** (there is
  no `set` wrapper on this form), so this form needs its own field-error mapper
  rather than `customFactorFieldErrors`, which skips any issue with
  `path.length < 2`.
- `retireFactorSetSchema` — `{ setId: z.uuid(...) }`, mirroring
  `retireCustomFactorSchema`.
- The result types: `EditFactorSetResult = SubmitResult<EditFactorSetField>`
  and a `RetireFactorSetResult` shaped like `RetireCustomFactorResult` but
  carrying `mappingCount` **and** the retired set's live row count.
- Extend `CUSTOM_FACTOR_ERRORS` rather than adding a second error vocabulary.
  A duplicate `(source, datasetVersion)` needs one new message; write it in the
  register §5 sets, and put it on the `datasetVersion` field.

Nothing here may import from `lib/db/` (AGENTS.md §6.3).

### 2. `lib/db/emission-queries.ts` — two functions, both `withSafeQueryErrors`

- `updateTenantFactorSet({ organizationId, data })`, returning
  `{ ok: true } | { ok: false; reason: "set_not_found" } | { ok: false; reason: "set_exists" }`.
  One transaction: re-read the set under
  `eq(organizationId) and isNull(deletedAt)` — a claim, not a capability — then
  `update ... set(...).where(...).returning({ id })`. **Drizzle's `update` has
  no conflict clause**, so the `(organization_id, source, dataset_version)`
  collision is answered by catching the driver's unique violation and mapping
  it to `set_exists`; `lib/db/query-error.ts`'s `readSqlState` is the existing
  reader for a `code`/`sqlState` off an unknown error and this must not grow a
  second one. A pre-check select alone is not enough — it loses the race, and
  the race is what the catch is for.
- `retireTenantFactorSet({ organizationId, setId })`, returning
  `{ retired: false } | { retired: true; mappingCount: number; factorCount: number }`.
  One transaction, counts first, update second, per D5. The mapping count joins
  `activity_factor_mapping` to `emission_factor` on `set_id`, filtering
  `deleted_at is null` on both and `organization_id` on both.
- Do not change any existing query. `TenantFactorSet` already carries
  `deletedAt`, `notes` and every editable column, so the page needs no new read.

### 3. `app/activity/actions.ts` — two Server Actions

`editFactorSet` and `retireFactorSet`, both copying `retireCustomFactor`'s
stage order exactly (AGENTS.md §10 rule 3): no BotID on an authenticated path
with the existing comment pointing at `stageImport`; session, tenant,
`pendingDeletion` lock; `checkFactorMappingLimit` keyed by user id; parse with
the shared schema; **then** the owner check; then the write. Typed result
throughout, never a throw, never a bare string (§10 rule 2). On success,
`revalidatePath` the same three paths `retireCustomFactor` revalidates —
`/activity/factors`, `/activity/mappings`, `/activity` — and **verify whether
`/reports` needs a fourth**: the report reads the set live at generation time,
so state the answer either way rather than adding the call reflexively.

No `console` call anywhere in the new code, matching every file under `app/`
(AGENTS.md §8.3 rule 2).

### 4. The surface — `/activity/factors`, and nothing else

- `app/_components/activity/factor-set-form.tsx` — a **client leaf,
  component-only**, one instance per set, rendered inside a `<details>` whose
  summary reads as an owner action. It repeats `FIELD_ALIGN` / `SELECT_CLASS`
  locally for the reason `factor-import-form.tsx` records, uses the existing
  `Field` / `TextareaField` / `Button` primitives, and no GSAP (AGENTS.md §7.5).
  The live region takes focus when the outcome settles, exactly as the two
  existing leaves do.
- `app/_components/activity/retire-set-button.tsx` — `RetireFactorButton`'s
  arm → confirm → announce pattern, with the set's own numbers in the warning
  and the **server's** numbers in the confirmation.
- `app/activity/factors/page.tsx` — render both, per set, only when
  `canManage`. A retired set stays in the list, marked, with no controls. In the
  **rows** section, a row whose set is retired must read "Set retired" rather
  than "Active" (D4); the page already holds `sets` and each row's `setId`, so
  this is a lookup, not a query change.

Do not restyle a settled surface, do not touch `Container`, `SiteNav`,
`SiteFooter`, any marketing route or any GSAP surface (AGENTS.md §8.1).

### 5. `e2e/factor-set-lifecycle.spec.ts`

Chromium-only, `OWNER_STATE_PATH`, per-run unique set identity — copy
`factor-import.spec.ts`'s docblock reasoning rather than inventing a new one.
Three assertions and no more:

1. an owner corrects a set's licence and source reference, and the **page**
   renders the corrected values after the refresh (read from the Server
   Component's output, never from the leaf's message);
2. renaming a set onto an existing `(source, datasetVersion)` is refused with a
   field error and changes nothing;
3. an owner retires a set, the set stops appearing in the "Add a factor" and
   "Import factors" set choosers, and its rows read "Set retired".

Every locator is an accessible role or visible text; class names are settled
design output and a test must not pin them.

## Prerender impact

**Expected: none — no route changes.** Everything here is under `/activity`,
which is already dynamic behind `requireOrganization`. **Verify it, do not
assume it** (AGENTS.md §8.1): run `npm run build`, confirm `/`, `/about`,
`/careers`, `/journal` and `/design-system` are still `○ Static` and the six
`/article/[slug]` and three `/job-listing/[slug]` entries still `● SSG`, then
run `docs/automation.md`'s clean two-build prerendered-HTML comparison against
`d9ffbdd` and report the file count, the identical count and the CSS byte
delta — remeasuring the parent's CSS at that commit rather than carrying prompt
82's number forward. New Tailwind classes in a dynamic route can still move the
one CSS chunk; that is expected and is reported, not hidden.

## Trust boundary

What crosses: two Server Action calls from a browser carrying a Better Auth
session cookie — an edited set's ten fields, and a set id.

- **Authorised by** a live session, a `member` row for the organisation, a
  non-`pendingDeletion` organisation and `role === "owner"`, all resolved
  server-side inside the action.
- **Validated by** the shared schemas in `lib/validation/emissions.ts`, running
  in the leaf as a courtesy and in the action as the check (§6.2).
- **A submitted set id is a claim, not a capability** — re-read under the tenant
  predicate inside the transaction. Missing, retired, published and foreign are
  one indistinguishable `set_not_found` (D6).
- **Rejected requests return a typed result**, never a thrown string, never a
  swallowed error, never a silent success (§8.2 rule 4).
- No new route handler, no new public path, no new environment conditional, no
  test-only route.

## Secrets and data

No new environment variable, no `.env.example` change, no `NEXT_PUBLIC_*`, no
new secret read, **no model call** (§5.3: nothing here selects or produces a
number). The edited fields are a customer's own reference metadata, tenant
scoped, and exit with the organisation under prompt 73's 30-day erasure.
Nothing logs a field value, a set identity, an address or a tenant identifier;
`withSafeQueryErrors` covers both new queries so a failure cannot print the
statement or its bound parameters.

## Non-goals

| not done | why |
| --- | --- |
| un-retiring a set | reversal is a second decision with its own surface; retirement is the deferral being closed. Name it in `docs/backend.md` |
| editing `gasBasis`, `organizationId`, `supersededBySetId`, `createdAt`, `retrievedAt` | D2, and the last three are not the owner's to state |
| editing an individual factor **row** | a row is retired and re-added; prompt 67 settled that and it is not reopened here |
| a migration | the schema is untouched — `deleted_at` and every editable column already exist. `npm run db:generate` must not be run |
| cascading retirement onto rows | D4 |
| re-pointing mappings, or recalculating after an edit | prompt 70's refusal and prompt 66's decision, both unchanged. The surface *says* a recalculation is what applies the change; it does not trigger one |
| market-based scope 2 | untouched prior deferral, unrelated to this path |
| AI-assisted anything | blocked, not deferred — the AI Gateway card refusal recorded at prompts 75/76 |
| any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface | out of scope entirely (§8.1) |
| a step 15 | §5.2 remains the ordered plan; this is post-sequence work as prompts 63–83 were |

## Checks

Run, and quote the exact output (§2, §12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — the domain suite. **Expect it unchanged at 255**; this prompt
  adds no `lib/domain/` code, and the reason it adds no unit test is that the
  new logic is a query and an action, which `npm test`'s scope deliberately
  excludes
- `npm run build`, plus the route table and the prerender comparison above
- `npm run test:e2e:local` — Chromium and Firefox natively
- `npm run test:e2e:webkit` — run it. If Podman is absent it reports "Podman is
  required for WebKit on Arch Linux"; record that as **an environment gap, not
  a pass**, exactly as prompts 78–82 did
- `npm run db:generate` — **not run**, and say why: the schema is untouched

## Where the result is recorded

`docs/backend.md`, as a new section after prompt 83's, carrying the decisions
D1–D7 with their reasons, the two queries and their outcome types, both actions
and their full field lists, the checks with their real output, the prerender
comparison table, and a "what prompt 84 deliberately did not do" table built
from the non-goals above. **Nothing in `AGENTS.md`** — no index row is needed
(`docs/backend.md` is already indexed) and no site-wide invariant is created
here.

## SKILLS USED

- **`drizzle-docs`** — the `update … set … where … returning` form, the absence
  of any conflict clause on `update`, and this project's fixed decisions on the
  driver, the two connection strings and generated-not-hand-run migrations.
  Take the `pg-` file for every dialect-repeated page.
- **`zod-docs`** — deriving `editFactorSetSchema` from `newFactorSetSchema`
  (`.omit()`, `.shape`, spread over `.extend()`), `superRefine` cross-field
  rules, `z.flattenError` for field errors, and the fixed shape of the typed
  result.
- **`nextjs`** — Server Actions, `revalidatePath`, and the client-leaf boundary
  in Next 16.2. Read from `node_modules/next/dist/docs/` where the skill points
  there.
- **`tailwind-4-docs`** — any new utility on the two leaves; the tokens live in
  `@theme` in `app/globals.css` and there is no `tailwind.config.js`.
- **`better-auth-security-best-practices`** — confirm the session and role read
  inside the action matches the pattern the existing actions use; the role is
  re-read per request from the database, never trusted from a cookie
  (AGENTS.md §11.2 rule 5).
- **`vercel:vercel-storage`** — not needed. No blob, no Redis change beyond
  reusing the existing `checkFactorMappingLimit`; named here so its absence is
  a decision rather than an omission.

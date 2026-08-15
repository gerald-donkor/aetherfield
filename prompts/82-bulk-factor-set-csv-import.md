# 82 — Bulk factor-set CSV import

## Scope, and why it is next

**Import many customer-supplied emission factors into one tenant-owned factor
set from a single CSV, atomically.**

Every step in AGENTS.md §5.2 (1–14) is committed — resolved from the repository
and `git log`, not from this file or from `prompts/`. This is post-sequence
work, as prompts 63–81 were, and **it is not a step 15**; §5.2 remains the
complete ordered product build.

Among the open items the record names, bulk factor CSV import is the strongest:

| candidate | status |
| --- | --- |
| **bulk factor-set CSV import** | deferred by name in `docs/backend.md` at lines 3813, 4009, 4200, 4413, 4784, 5009, 5256, 5685 — six separate records. `/activity/factors` accepts **one hand-typed row at a time**, and a customer supplying its own licensed set must fill twenty fields per row |
| AI factor matching | **blocked, not deferred**: prompt 75 reached Vercel AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, prompt 76 shipped the provider-free path. Nothing to build |
| market-based scope 2 | a methodology expansion touching the engine and filed figures. Larger, riskier, and closer to new product scope |
| set-metadata editing, retiring a set from the UI | smaller, and the licence text is rendered as disclosure evidence, so a correction path wants its own prompt |
| re-pointing existing mappings at a newer set | prompt 70 refused it deliberately: a mapping is a choice and a backfill would silently undo an override. Unchanged |

The parser this needs already exists and is already pure
(`lib/domain/csv.ts`), the per-row rules already exist and are already shared
(`customFactorSchema`), and step 9's upload action is the shape to copy. That
is what makes this the cheapest large win still open.

### The design fork, settled with the user before this file was written

The user chose **atomic — all rows or none** over a staged-review flow of the
kind step 9 built for activity data.

So there is **no staging table, no migration, no new route and no blob write**.
A file whose rows all validate is inserted in one transaction; a file with any
invalid row writes **nothing** and returns every failing line with its reason.
"Rollback" is the transaction itself, plus the existing per-row retire control.
The prior deferral text predicted "a parser, staging UI and rollback"; that
prediction is superseded here rather than left standing (AGENTS.md §12 rule 8),
and the reason is recorded: staged review exists for activity data because a
partial commit there is still a usable dataset, whereas a partly-imported factor
set is a set whose licence and provenance describe rows that are not all
present — which is exactly the thing a disclosure cites.

## Reference material read before writing this file

Opened, not recalled (§12 rule 1):

- `AGENTS.md` — §5.2, §5.3's hard rule, §6.2, §6.3, §7.3, §8.1, §8.2, §8.4, §9, §10, §11.2, §12
- `docs/backend.md` — the deferral lines above; step 9 (from line 6300); step 10 (from 8962); the prompt 66/67/71/72 factor-surface records; prompts 79–81's hardening records (7275, 9500) for the current logging and retention contract
- `lib/domain/csv.ts` — `decodeUtf8`, `parseCsv(text, maxRecords)`, `CsvRecord { line, fields }`, and the stated grammar
- `lib/validation/activity.ts:180–224` — `CSV_MAX_BYTES` (2 MB), `CSV_MAX_LABEL`, `CSV_MAX_ROWS` (10,000), `CSV_ACCEPT_ATTR`, `CSV_ERRORS`, and why the declared MIME type is deliberately not a gate
- `lib/validation/emissions.ts:183–500` — `FACTOR_ACTIVITY_UNITS`, `EMISSION_SCOPES`, `SCOPE3_CATEGORIES`, `SCOPE2_METHODS`, `GHG_GASES`, `CH4_VARIANTS`, `GWP_SETS`, `newFactorSetSchema`, `existingFactorSetSchema`, `factorSetChoiceSchema`, `customFactorSchema`, `createCustomFactorSchema`, `CustomFactorResult`, `CUSTOM_FACTOR_ERRORS`
- `app/activity/actions.ts:196–330` (`stageImport`, the a–f stages and the recorded BotID decision) and `:763–869` (`createCustomFactor`, the owner check and the three set refusals)
- `lib/db/emission-queries.ts:380–545` — `CreateTenantFactorOutcome`, `createTenantFactorImpl`, the tenant re-read of a submitted set id, the derived `gas_basis`, `sourceRowIdForCustomFactor`, the `(setId, sourceRowId)` conflict target
- `lib/db/query-error.ts` usage across `lib/db/*-queries.ts` — prompt 80's `withSafeQueryErrors` wrapper, which every new exported query must carry
- `lib/rate-limit/index.ts:525–571` — `checkActivityImportLimit`, `checkFactorMappingLimit`, `consume(prefix, limit, window, key)`
- `app/_components/activity/upload-form.tsx` — the CSV client leaf to copy: primitives only, live region, focus on settle, client checks as courtesy
- `app/activity/factors/page.tsx` — the owner-only `canManage` gate, the two listing sections, the `CustomFactorForm` mount
- `lib/db/seed/defra-2026-factors.csv` — a real 8,740-row factor file, measured below
- `next.config.ts:34` — `bodySizeLimit: "6mb"`

## Measurements

Two are already taken and are the reason no new limit constant is introduced:

| measured | value | consequence |
| --- | --- | --- |
| `lib/db/seed/defra-2026-factors.csv` | **1.1 MB**, **8,740 data rows** (`du -h`, `wc -l` minus the header) | a whole national dataset fits inside the existing `CSV_MAX_BYTES` (2 MB) and `CSV_MAX_ROWS` (10,000). **Reuse both; add no new ceiling.** |
| Server Action body limit | `6mb`, `next.config.ts:34` | 2 MB plus a multipart envelope stays well under it, so the framework never rejects before the action can render an error |

Measurements the implementation must produce:

1. **Import timing, stated warm or cold** (§7.3's scale-to-zero note): the wall time of one successful import of a generated 8,740-row file, and of a 100-row file, against a warm database. Record both, and say they are warm.
2. **Row count read back from the database** after the large import — the set's `factorCount` as `listTenantFactorSets` reports it, not as the action's own return value.
3. **The all-or-nothing proof**: a file with one bad row in the middle leaves the row count unchanged, read back from the database.
4. **Prerender/CSS comparison** by `docs/automation.md`'s clean two-build procedure, with the parent's CSS byte count **remeasured at this commit, never carried forward** from prompt 80's 68,506.

Anything the run cannot resolve is recorded as a judgement and labelled one
(§12 rule 4).

## What to build

### 1. `lib/domain/factor-import.ts` — new, pure, tested

`lib/domain/` is I/O-free (§6.2). No database handle, no `fetch`, no implicit
`Date.now()`.

- **The column contract**, exported as a constant so the form hint, the docs and
  the parser cannot drift. Header names are matched **trimmed and
  case-insensitively**, in any order.

  | column | required | accepted values |
  | --- | --- | --- |
  | `scope` | yes | `EMISSION_SCOPES` members verbatim |
  | `activity_unit` | yes | `FACTOR_ACTIVITY_UNITS` members verbatim |
  | `gas` | yes | `GHG_GASES` members verbatim |
  | `gwp_set` | yes | `GWP_SETS` members verbatim |
  | `published_uom` | yes | free text, ≤ 120 |
  | `published_ghg_unit` | yes | free text, ≤ 120 |
  | `value` | yes | the same decimal grammar `factorDecimal` enforces |
  | `biogenic` | yes | `true`/`false`/`yes`/`no`/`1`/`0`, case-insensitive |
  | `scope3_category`, `scope2_method`, `ch4_variant` | no | the matching enum, empty otherwise |
  | `level_1`–`level_4`, `column_text`, `region` | no | free text |
  | `supersedes_source`, `supersedes_source_row_id` | no | free text; both or neither |

  **Enum values are accepted verbatim, never guessed at.** `Scope 1` is not
  `scope_1`; a mis-spelled value is a legible row error naming the accepted
  members. This matches `lib/domain/csv.ts`'s own stance: nothing outside the
  stated grammar is inferred.

- **Whole-file failures, before any row is looked at**: a missing required
  column, a duplicate header, or an **unknown header** — each naming the
  offending names. Silently ignoring an unknown column is how a customer's
  intended `region` column ends up unimported.
- **Per-row coercion** into the exact object `customFactorSchema` parses —
  empty optionals dropped, `supersedes` assembled as the object both halves live
  in. **The row rules are not restated here**; the action runs
  `customFactorSchema.safeParse` per row, so the rules exist once (§10 rule 1).
- **In-file duplicate detection** on the identity `sourceRowIdForCustomFactor`
  derives from, reported as a row error naming **both** line numbers. Two rows
  that collide would otherwise become one silently.
- A companion `lib/domain/factor-import.test.ts` under `npm test`'s
  `lib/domain/` scope: the header contract, each whole-file failure, biogenic
  coercion, the verbatim-enum refusal, the supersedes pairing, and in-file
  duplicates.

### 2. `lib/validation/emissions.ts` — the shared contract

- `importCustomFactorsSchema` over the **set choice only** (`factorSetChoiceSchema`,
  with `createCustomFactorSchema`'s two cross-field rules for a new set —
  `effectiveTo >= effectiveFrom`, and a source URL or an internal reference).
  The file itself travels as `FormData` and is checked as `stageImport` checks
  it.
- `FactorImportRowError = { line: number; message: string }` and
  `ImportCustomFactorsResult`, a typed result (§10 rule 2):
  `{ ok: true; imported: number; skipped: number }`
  `| { ok: false; error: string; fieldErrors?: …; rowErrors?: FactorImportRowError[] }`.
  `rowErrors` is capped at the first **20**, with the total stated in `error`,
  so a 5,000-error file returns a readable answer rather than a wall.
- Error copy in `FACTOR_IMPORT_ERRORS`, in the site's measured, operational
  register (§5): what is wrong and what to do. No apology, no exclamation.
- **`lib/validation/` imports nothing from `lib/db/`** (§6.3) — unchanged.

### 3. `lib/rate-limit/index.ts` — `checkFactorImportLimit`

A new prefix (`factor-import`), keyed by the **user id resolved server-side**,
never a browser value. Tighter than `checkFactorMappingLimit`, since one call
can write thousands of rows. **Both numbers are judgements**, labelled as such
in the constant's docblock exactly as the neighbouring limits are — nothing has
shipped to fit them against.

### 4. `lib/db/emission-queries.ts` — `importTenantFactors`

Exported through `withSafeQueryErrors` (prompt 80's contract — every exported
query in this file carries it).

One transaction:

1. Resolve the set exactly as `createTenantFactorImpl` does — an existing id
   **re-read under the tenant predicate** (a missing, retired or foreign id is
   one indistinguishable `set_not_found`), or a new set inserted with the
   `(organization_id, source, dataset_version)` collision answered as
   `set_exists`. A submitted id is a claim, not a capability.
2. Derive `gas_basis` from the file's rows, never ask for it — `co2e` is
   combined, anything else is per-gas. A file **mixing** the two is refused
   before any write, naming the two lines; a file whose basis disagrees with the
   chosen existing set is `gas_basis_mismatch`, unchanged in meaning from the
   single-row path.
3. Insert every row, **chunked at 500 values per statement** to stay well inside
   Postgres's 65,535 bind-parameter ceiling, with the existing
   `(setId, sourceRowId)` conflict target as `onConflictDoNothing`.
4. Rows already present are **skipped and counted**, not failures — re-running
   the same file imports nothing and says so. Everything else that fails aborts
   the transaction.

Return a typed outcome in the shape `CreateTenantFactorOutcome` already
established, widened with the counts. `organization_id` is set on every row, so
§9 rule 6's tenant scoping is unchanged.

### 5. `app/activity/actions.ts` — `importCustomFactors(formData)`

§10's stages, in order, copying `stageImport` and `createCustomFactor`:

- **a. BotID — deliberately absent**, for the reason `stageImport:211` records
  verbatim: this path needs a live session and a `member` row, which is stronger
  than a bot heuristic, and adding it is a two-file commitment in
  `instrumentation-client.ts` whose half-application makes the server call fail.
- **b.** session → membership → `pendingDeletion` lock → `checkFactorImportLimit`,
  failing closed on a limiter error as every existing path does.
- **c.** file presence, `CSV_MAX_BYTES`, `decodeUtf8`, `parseCsv(text, CSV_MAX_ROWS)`,
  then the header contract, then `customFactorSchema.safeParse` per row.
- **d.** `membership.role !== "owner"` → `CUSTOM_FACTOR_ERRORS.notOwner`. A
  factor moves every figure in a disclosure; §11.2 rule 2 puts the check here,
  not in the component.
- **e.** `importTenantFactors`.
- **f.** no email. `revalidatePath` for `/activity/factors`, `/activity/mappings`,
  `/activity`.

**No recalculation, and no automatic mapping** — prompt 66's decision,
unchanged: an imported row changes no figure until an owner maps a
`(category, unit)` pair to it at `/activity/mappings`, which is the surface that
already recalculates.

### 6. `app/_components/activity/factor-import-form.tsx` — the client leaf

A copy of `upload-form.tsx`'s shape, not a second form vocabulary. Existing
primitives only (`FileField`, `Button`, and whatever `CustomFactorForm` already
uses for the set chooser); **component-only export** (the bundle rule);
**no GSAP** (§7.5). The live region is mounted before the text arrives, takes
focus when the outcome settles, and is legible without colour (§8.2 rule 5).
Row errors render as a numbered list of `Line N: …`, with the total stated when
it exceeds the 20 shown. Client-side size and extension checks are a courtesy;
the action re-runs everything.

The required header row is rendered as copyable `<code>` in the field hint, so
no template asset is added and the contract a person needs is on the page.

### 7. `app/activity/factors/page.tsx` — one new section

An "Import factors" section, inside the existing `canManage` gate and using the
existing `Detail`/section rhythm. It adds no new route and no new nav entry.

## Prerender impact

**`none — no route markup or render-mode changes`**, and this must be
*verified*, not assumed. Every file touched is authenticated
(`/activity/factors` is `ƒ`), server-only, or a client leaf mounted on that
page. Nothing under `app/(marketing routes)`, `SiteNav`, `SiteFooter` or any
GSAP surface is touched.

Verification is `docs/automation.md`'s clean two-build procedure — `.claude/`,
`.agents/` and every `.env*` file removed from both sides, build id and chunk
names normalised — reporting: prerendered HTML files on each side, how many
differ, the CSS byte count both sides, rules added/removed, and a line-by-line
route-table diff. Run it **after** this file and the `docs/backend.md` section
are on disk, so Tailwind v4's scan of prose is on both sides. The standing
warning about `/`, `/journal` and `/careers` applies.

## Trust boundary

What crosses: a multipart POST to the Server Action carrying a CSV file and the
set choice, from a browser with a Better Auth session cookie.

- **Authorised by** a live session, a `member` row for the organisation, a
  non-`pendingDeletion` organisation, and `role === "owner"` — all resolved
  server-side inside the action (§11.2 rules 1 and 2).
- **Validated by** the file checks above and `customFactorSchema` per row, the
  same schema the single-row form runs (§10 rule 1). Nothing in the payload
  names an organisation and nothing may; the tenant comes from the session.
- **A submitted set id is re-read under the tenant predicate** before a row is
  written into it.
- **Rejected requests return** a typed result — never a thrown string, never a
  swallowed error, never a silent success (§8.2 rule 4, §10 rule 2). A
  transaction that aborts leaves zero rows.
- No new route handler, no new public path, no `NODE_ENV` or E2E conditional,
  no test-only route.

## Secrets and data

No new environment variable, no `.env.example` change, no `NEXT_PUBLIC_*`, no
new secret read, **no model call** (§5.3: phase-two AI is sanctioned only at the
three named surfaces, and this is not one — the import performs no matching and
invents no value).

The uploaded file is a customer's commercial reference data. It is **parsed in
memory and never persisted as a file** — no blob write, unlike step 9's staged
import, because there is no staged state to reconstruct. What is stored is the
factor rows themselves, tenant-scoped.

**Nothing logs a row, a file, a header, a cell value, an address or a
tenant identifier.** Prompts 79–81 closed the logging paths that did; the new
code adds **no `console` call at all**, matching every file under `app/`.
`withSafeQueryErrors` covers the new query, so a database failure cannot print
the statement or its bound parameters.

Retention: prompt 81's phase-one sweep is untouched. Imported factors are
tenant data and exit with the organisation under prompt 73's 30-day erasure —
no new retention surface.

## Non-goals

| not doing | why |
| --- | --- |
| a staging table, a review route, a blob write, a migration | the user chose the atomic shape; there is no staged state to persist, and the schema is untouched |
| partial import of a file with bad rows | the decision above: a partly-imported set is a set whose licence describes rows that are not all present |
| editing a set's metadata, retiring a set from the UI | named deferrals, unchanged, and each wants its own prompt |
| market-based scope 2 | untouched prior deferral |
| automatic mapping or recalculation after import | prompt 66's decision, unchanged |
| re-pointing existing mappings at newly imported rows | prompt 70's refusal, unchanged |
| AI-assisted column mapping | blocked, not deferred — prompt 75/76. §5.3 sanctions it and does not schedule it |
| a downloadable template CSV asset | the header contract renders on the page; a new public asset is not needed for it |
| any change to a marketing route, `SiteNav`, `SiteFooter`, `Container` or any GSAP surface | out of scope entirely (§8.1) |
| a step 15 | §5.2 remains the ordered plan; this is post-sequence work, as prompts 63–81 were |

## Checks (§2), and where the result goes

Run every one and quote its exact output (§12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — with the new `lib/domain/factor-import.test.ts`; report the file
  and test counts before and after
- `npm run build` — quote the route table and confirm it is identical to the
  parent's, including First Load JS
- the prerender/CSS comparison above
- `npm run test:e2e:local` — the existing matrix must stay green. Add one
  authenticated Chromium walk of the import, using prompt 74's fixture: an owner
  imports a small valid file and sees the counts; a file with one bad row is
  refused and the set's row count is unchanged
- `npm run test:e2e:webkit` — run it; if `podman` is absent this environment
  reports **an environment gap, not a pass**, exactly as prompts 78–80 recorded
- `npm run db:generate` — **not run; the schema is untouched.** Say so rather
  than omitting it

Record the result in **`docs/backend.md`**, as a new section in the
post-sequence run (prompts 63–81's convention), covering: the design fork and
why atomic won, the column contract as implemented, the measured timings with
warm/cold stated, the read-back row counts, the all-or-nothing proof, the
prerender/CSS numbers, the trust boundary, the secrets-and-data statement, the
checks table, and a "what this deliberately did not do" table carrying the
non-goals above forward. **Nothing goes in `AGENTS.md`** — no index row is
needed, since `docs/backend.md` already owns this area, and no new site-wide
invariant meets the cap rule.

## SKILLS USED

Listing is not loading: **invoke every one of these before writing code** (§4).

- `zod-docs` — the per-row `safeParse`, `z.flattenError`, and the discriminated
  union on the set choice. Loaded while writing this file; must be loaded again
  at execution
- `drizzle-docs` — the chunked multi-row `insert().values([...])`,
  `onConflictDoNothing` with a composite target, and transaction semantics for
  the all-or-nothing abort
- `nextjs` — Server Action contract on Next 16.2, `FormData` handling,
  `revalidatePath`, and the async `headers()` / `cookies()` trap
- `tailwind-4-docs` — the new section and form leaf use `@theme` tokens from
  `app/globals.css`; there is no `tailwind.config.js`
- `neon-postgres` — pooled vs direct connection, and the scale-to-zero note that
  makes every timing measurement state warm or cold
- `upstash-ratelimit-js` — the new limiter's sliding window, matching the
  existing `consume` helper
- `better-auth-best-practices` — the session read inside the action
- `organization-best-practices` — the membership and `owner` role resolution
- `vercel:vercel-functions` — the Fluid Compute runtime the action executes on,
  and the body-size boundary
- `frontend-design:frontend-design` — the new section on `/activity/factors` is
  design work under the front-matter rules, built from existing primitives

# 58 — Emission factors and the calculation engine

## Scope, and why it is next

Build step 10 — **emission factors and the calculation engine, scopes 1, 2 and 3, as
pure functions in `lib/domain/`** (AGENTS.md §5.2, phase two).

It is next because step 9 is committed (`4541641 Build step 9: activity-data
ingestion`), which is step 10's only stated dependency, and because steps 11
(targets and forecasting), 12 (the dashboard routes) and 13 (ESG report
generation) all depend on step 10 and on nothing else that is unbuilt. Nothing
in phase one is outstanding: steps 1–7 are committed (`6f120b2`, `26ad46c`,
`9778e41`, `ff03de8`, `5d3043c`, `4e0afb2`/`ee27aed`, `ce84e14`), and step 8 is
committed (`246decd`).

Resolved from the repository and `git log`, not from `prompts/` (§1, §12 rule 5).
`lib/domain/` today contains exactly two files, `activity-import.ts` and
`csv.ts`; there is no factor table, no scope calculation and no tCO₂e arithmetic
anywhere in the repo.

## Decisions taken with the user before this file was written

Asked and answered on 10 Aug 2026, all four as recommended:

| question | answer |
| --- | --- |
| factor dataset | **UK DESNZ ("DEFRA") 2026 conversion factors, flat file, only.** Open Government Licence v3.0 — verified freely redistributable with attribution. EPA Hub and eGRID are deferred; IEA is licence-blocked (below) |
| GWP set | **stored per factor row, seeded as the publisher states it.** Not a global constant |
| scope 2 | **location-based only, with a dual-ready schema.** The `scope2_method` discriminator exists from the first migration; market-based is deferred |
| AI factor matching | **not in this step.** Deterministic matching only |

## Reference material read for this prompt

Repository, by path — all opened this session:

- `AGENTS.md` §5.2 (step 10 row, l.364), §5.3 (the hard rule, l.396–412; the
  step-10 AI surface row, l.393; the provider rule, l.416–421), §6.1 (l.442–444),
  §6.2 (l.445–461), §7.3 (Neon traps), §7.5, §8.1, §9.2 rules 2, 3, 5, 6, 7
  (l.841–848), §10 (l.860–894), §12
- `docs/backend.md` — step 8 (l.2860) and step 9 (l.3212) records; the format a
  step-10 record must copy is `### The tables, as applied` (l.3249–3291) and the
  enum table at l.3295–3300
- `docs/automation.md` — the build-diff procedure and its four traps
- `lib/db/schema.ts` (l.16–22 imports, l.200–216 enums, l.232 `site`, l.264
  `activity_import`, l.322 `activity_import_row`, l.384 `activity_record`,
  l.366–379 the numeric rationale, l.435–442 inferred types)
- `lib/db/database-schema.ts` (whole file), `lib/db/client.ts`,
  `lib/db/auth-schema.ts`, `drizzle.config.ts`, all five files in
  `lib/db/migrations/`
- `lib/db/activity-queries.ts` (whole file), `lib/db/organization-queries.ts`
- `lib/domain/activity-import.ts` (l.32–35 module doc, l.162 `CoercedActivityRow`,
  l.226 `coerceRow`), `lib/domain/csv.ts` (l.74 `decodeUtf8`, l.98 `parseCsv`)
- `lib/validation/activity.ts` (l.66 `ACTIVITY_CATEGORIES`, l.87 `ACTIVITY_UNITS`,
  l.142 `ActivityMapping`), `lib/validation/result.ts` (l.22–29 `SubmitResult`)
- `lib/auth/organization.ts` (l.84 `getCurrentMembership`, l.135
  `requireOrganization`), `lib/auth/server.ts`, `lib/rate-limit/index.ts`
- `app/activity/actions.ts` (l.119–143 `resolveTenant`, l.441–471 `discardImport`
  — the canonical stage order), `app/activity/page.tsx`, `proxy.ts`
- `app/_components/home/dashboard.tsx` and `app/_components/home/emissions-chart.tsx`
  — the product mockup, read as **intent, not as a comp** (§5)
- `package.json`, `playwright.config.ts`

External, fetched 10 Aug 2026 — every number below is sourced, and the
unverified items are named as unverified (§12 rules 2, 4, 7):

- GHG Protocol Corporate Standard, Revised Edition (2004) —
  <https://ghgprotocol.org/sites/default/files/standards/ghg-protocol-revised.pdf>
- GHG Protocol Scope 2 Guidance (2015) —
  <https://ghgprotocol.org/sites/default/files/standards/Scope%202%20Guidance_Final_Sept26.pdf>
- GHG Protocol Corporate Value Chain (Scope 3) Standard (2011), Table 5.3 —
  <https://ghgprotocol.org/sites/default/files/standards/Corporate-Value-Chain-Accounting-Reporing-Standard_041613_2.pdf>
- GHG Protocol Scope 3 Calculation Guidance (2013) —
  <https://ghgprotocol.org/sites/default/files/standards/Scope3_Calculation_Guidance_0.pdf>
- GHG Protocol Global Warming Potential Values v2.0, Aug 2024 —
  <https://ghgprotocol.org/sites/default/files/2024-08/Global-Warming-Potential-Values%20%28August%202024%29.pdf>
- DESNZ 2026 conversion factors, **flat file** —
  <https://assets.publishing.service.gov.uk/media/6a6c9748862aaf18d9c62ac9/ghg-conversion-factors-2026-flat-format-revised.xlsx>
  and its methodology report —
  <https://assets.publishing.service.gov.uk/media/6a2940543b15d05a7ce3202e/2026-GHG-conversion-factors-methodology-report.pdf>
- Collection page (licence, cadence) —
  <https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting>

## The domain facts this implementation must honour

Each is sourced above. **Do not restate any of these from memory at execution
time; they are here so the implementation does not have to re-fetch them.**

1. **Scope 1** is direct emissions from owned or controlled sources. **Scope 2**,
   as widened by the 2015 Guidance, is purchased *electricity, steam, heat or
   cooling* — **generation only**; transmission and distribution losses belong in
   **scope 3 category 3**. **Scope 3** is all other indirect emissions, in the 15
   categories of Table 5.3.
2. **Direct CO₂ from biomass combustion "shall not be included in scope 1 but
   reported separately."** DEFRA ships an explicit `Outside of Scopes` bucket —
   58 rows in the 2026 set. **Neither may fold into a scope total.**
3. The identity is `Σ (activity quantity × emission factor)`. The factor's
   denominator is **not** one fixed dimension: the 2026 flat file's `UOM` column
   contains `km`, `miles`, `tonne.km`, `tonnes`, `kg`, `passenger.km`, `litres`,
   `kWh (Net CV)`, `kWh (Gross CV)`, `GJ`, `cubic metres`, `room per night`,
   `per FTE working hour`, `million litres`.
4. `CO₂e = Σ_gas (activity × factor_gas × GWP_gas)`, CO₂'s GWP = 1. DEFRA ships
   **both** a combined `kg CO2e` row and per-gas `kg CO2e of CO2/CH4/N2O per unit`
   sibling rows for the same activity (e.g. `1_100_1000_15_1` and `…_2`).
   **Summing both double-counts.** The seeder must take one or the other and the
   choice must be recorded.
5. **GWP set is per row, not per dataset.** DEFRA's own 2026 methodology puts
   some fuel families on AR4, most on AR5 (CH₄ 28, N₂O 265), and refrigerants
   lacking an AR5 value on AR6 or EU F-gas Annex IV. GHG Protocol's Aug 2024
   table (AR4/AR5/AR6): CO₂ 1/1/1 · CH₄ non-fossil 25/28/27.0 · CH₄ fossil
   —/30/29.8 · N₂O 298/265/273 · SF₆ 22,800/23,500/24,300 · NF₃
   17,200/16,100/17,400.
6. **A factor is selected by the activity's date, not by today's date.** DEFRA:
   "The 2026 GHG Conversion Factors are for use with activity data that falls
   entirely or mostly within 2026." A restatement re-selects.
7. **A published set is itself mutable.** The 2026 workbook is `Version 1.2`;
   eGRID2023 was revised twice within six months. Store a revision identifier,
   never a bare year.
8. **DEFRA distinguishes Net CV from Gross CV for the same fuel.** These are
   different factors and confusing them is a silent error.
9. **IEA factors are licence-blocked for this product** and must not be
   ingested. Their terms state that calculating or verifying a third party's
   carbon footprint "is not permitted under our standard terms and conditions",
   and that putting the data in a model whose derived data is visible to third
   parties requires a signed agreement and a fee (€995 single-user otherwise).
   A multi-tenant SaaS computing customers' footprints is the prohibited use.
   **Record this in `docs/backend.md` so a later session does not reach for it.**

Marked unverified, and to be written into the record as unverified: whether the
DEFRA `.xlsx` files themselves carry the OGL notice (verified only in the
methodology PDF); whether an EPA Hub 2026 edition or eGRID2024 exists; CDP's and
SBTi's current GWP requirements.

## The constraint that shapes the whole step

**Step 9's activity model is thin for factor selection, and this is the central
design problem.** `activity_record` carries `category` (8 values:
`electricity, fuel, heat, waste, water, travel, freight, other`), `unit`
(8 values: `kWh, MWh, L, m3, kg, t, km, tkm`), a free-text `description`, a
`site` whose only attributes are a name, and `quantity numeric(18,6)`. There is
no fuel type, no region, no grid, no Net/Gross CV flag.

Sixty-four category×unit pairs cannot address 8,741 DEFRA rows. The
deterministic answer, and what this step builds:

- an **organisation-scoped mapping** from `(category, unit)` to one chosen
  factor row, seeded with a small default set and otherwise **empty**;
- every activity record whose pair has no mapping is **surfaced as unmatched**,
  with a count and a list, and **contributes nothing to any total**;
- **no total is ever presented as complete while unmatched rows exist.** The
  coverage figure is shown alongside every total.

This is §5.3's "surfaced, never silently accepted" applied to a deterministic
matcher rather than a model, and it is the honest reading of a thin schema.
**Extending the activity model with fuel type or region is a non-goal here**
(below) — it changes step 9's CSV grammar and belongs in its own prompt.

## What to build

### A. Exact decimal arithmetic — `lib/domain/decimal.ts`, pure

`quantity` is `numeric(18, 6)` read back as a **string** by deliberate decision
(`lib/db/schema.ts:366–379`). Factor values need full published precision.
**JavaScript `Number` cannot represent the product exactly**, and §5.3's hard
rule — "a plausible invented number is the single worst failure this product can
have" — makes a floating-point rounding error in a disclosure figure
unacceptable.

Build fixed-point arithmetic over `BigInt`, operating on and returning decimal
**strings**: parse, add, multiply, scale/rescale with an explicit rounding mode,
and compare. No dependency; `BigInt` is native. No `Number` anywhere on the
value path.

**Non-negotiable:** no intermediate rounding. Round once, at presentation.

### B. GWP tables — `lib/domain/gwp.ts`, pure

AR4, AR5 and AR6 as versioned constant tables keyed by gas, with the AR6
**fossil / non-fossil CH₄ split**. Values exactly as in GHG Protocol's Aug 2024
table (§ domain fact 5). A lookup takes `(gwpSet, gas, ch4Variant)` and returns a
decimal string or a typed "not in this set" result — never a fallback number.

Note in the module doc, per GHG Protocol's own instruction: use the **non-fossil**
CH₄ GWP for all *combustion* emissions including fossil-fuel combustion (the
fossil value's methane-oxidation term would double-count the combustion CO₂),
and the fossil value for fugitive fossil sources.

### C. The calculation engine — `lib/domain/emissions.ts`, pure

Pure functions over typed inputs. **No database handle, no `fetch`, no
`Date.now()` passed implicitly** (§6.2). Everything time-dependent is a
parameter.

- unit conversion: **exact integer ratios only** (`MWh→kWh` ×1000, `t→kg` ×1000,
  `m3→L` ×1000). A cross-dimensional pair (`km` vs `tkm`) is **not** convertible
  and returns a typed refusal, never a guess.
- `calculateRecordEmission(record, factor, gwpTable)` → a typed result carrying
  the kgCO₂e as a decimal string, the factor row's id, the scope, the scope 3
  category if any, the `scope2_method`, the GWP set applied, and the biogenic /
  outside-of-scopes flags — **or** a typed reason it could not be calculated.
- aggregation by scope, by scope 3 category, and by period, with biogenic and
  outside-of-scopes carried **separately** and never summed into a scope total.
- coverage: matched record count, unmatched record count, and the unmatched
  `(category, unit)` pairs.

### D. Schema — one migration, generated

Follow every convention already in `lib/db/schema.ts`: `uuid` pk
`.defaultRandom()`, `timestamp(..., { withTimezone: true })`, `.defaultNow()` on
`created_at`, nullable `deleted_at`, the `(t) => [...]` array extra-config form,
`pgEnum` built by spreading an `as const` tuple from `lib/validation/`.

- **`emission_factor_set`** — the publication. Source, dataset version (`1.2`),
  publication year, `effective_from` / `effective_to`, licence, source URL,
  `retrieved_at`, and the recorded per-gas-vs-combined choice from domain fact 4.
- **`emission_factor`** — the rows. Publisher's own hierarchy kept verbatim
  alongside the normalised keys; `activity_unit` (denominator) and `result_unit`
  as published strings; `gas`; `is_co2e`; `gwp_set`; `ch4_variant`; `scope`;
  `scope3_category`; `scope2_method`; `region`; `biogenic` and
  `outside_of_scopes` flags; the publisher's stable `source_row_id`; and the
  value at full published precision.
- **`activity_factor_mapping`** — **organisation-scoped**, `(organization_id,
  category, unit)` unique, referencing one `emission_factor`.
- **`activity_emission`** — the computed result per `activity_record`. It
  persists **the factor row id it used**, not just the number, so a filed figure
  is re-derivable; plus the GWP set applied and the engine version.

**Numeric precision is a decision to make and record, not to guess.** Derive the
scale from the actual published values in the 2026 flat file (count the decimal
places across all 8,741 rows) and state the derived figure in `docs/backend.md`
as measured. Do not copy `numeric(18, 6)` across without checking it holds.

#### The one deviation from AGENTS.md that needs the user's say-so

**§9.2 rule 6 says every phase-two table carries an organisation reference and
every query filters on it.** `emission_factor_set` and `emission_factor` are
published reference data shared by every tenant; duplicating 8,741 rows per
organisation is wrong, and the IEA finding (domain fact 9) means a tenant may
one day need to supply its **own** licensed set.

Proposed, and flagged here rather than done silently (§12 rule 8): both tables
carry a **nullable** `organization_id` — `null` means published and global,
non-null means tenant-supplied — and **every query filters
`organization_id IS NULL OR organization_id = $1`**. No cross-tenant read is
possible, which is what rule 6 exists to guarantee. `activity_factor_mapping`
and `activity_emission` are strictly tenant-scoped and `not null`, unchanged.

If approved, **AGENTS.md §9.2 rule 6 gains one clause in the same change**
naming reference tables as the exception and stating the nullable-plus-`IS NULL`
predicate — the only AGENTS.md edit this prompt makes, and it replaces nothing.

### E. Ingesting the DEFRA set

**No xlsx parser is added to the application.** Convert the workbook to CSV
once, by hand, with the command recorded in `docs/automation.md`; commit the
derived CSV under a seed directory; and have the seeder read it with the
**existing pure `parseCsv` in `lib/domain/csv.ts`** (raise `maxRecords` at the
call site — the parser already takes it as a parameter).

The seeder is a script, not a route and not an action. Per §2 it is written as
`dotenv -e .env.local -- …` from the day it is added, with a matching
`package.json` script. It is **idempotent**, keyed on
`(source, dataset_version, source_row_id)`, and it **never updates a factor row
in place** — a revision inserts a new set and supersedes the old one, or last
year's disclosure stops reproducing.

Attribution for OGL v3.0 must appear wherever the factors are surfaced.

### F. The visible outcome

Minimal, and on the existing authenticated `/activity` area only. Per import
and per organisation: total kgCO₂e (presented as tCO₂e), the scope 1 / 2 / 3
split, biogenic and outside-of-scopes shown **separately**, and the coverage
figure with the unmatched pairs listed. Location-based label on every scope 2
figure, as the Scope 2 Guidance requires.

A `recalculate` Server Action colocated at `app/activity/actions.ts`, following
the **exact** stage order that file already establishes (`resolveTenant` →
rate limit keyed by `userId`, failing closed → `safeParse` → tenant-predicated
write → `revalidatePath` → typed `SubmitResult`). BotID is absent on
authenticated paths, as `app/activity/actions.ts:163–172` already documents.
**No redirect on success** (§10 rule 5).

### G. A test runner — flagged as a scope addition

§6.2 requires the domain layer to be "independently testable", and `package.json`
has no unit-test runner (`npm run test:e2e*` is Playwright only). An exact-decimal
arithmetic engine producing regulatory figures with zero unit tests is the wrong
call, and this is the step where a runner earns its place.

**Proposed:** add `vitest` as a devDependency and a `test` script scoped to
`lib/domain/`, with tests for the decimal arithmetic, the GWP lookups, the unit
conversions and refusals, the scope aggregation, and the biogenic /
outside-of-scopes separation.

**This is a new tool and therefore a scope decision — strike it and the rest of
the prompt still stands.** Note that AGENTS.md §2's "There is no test script"
line and its "Never reference a script name before it exists" warning would then
need correcting in the same change (§12 rule 8).

## Measurements, and how they are produced

No comp and no recording is involved; every number below is produced by running
something, and each is recorded in `docs/backend.md` as measured or as judged
(§12 rule 4).

| number | procedure |
| --- | --- |
| factor row counts by scope | count from the committed seed CSV after conversion. Expected from this session's read of the 2026 flat file: **8,741 rows — Scope 1: 3,059, Scope 2: 392, Scope 3: 5,231, Outside of Scopes: 58**. If the conversion yields different counts, the conversion is wrong — do not adjust the expectation |
| the numeric precision and scale chosen | count decimal places across all value rows in the seed CSV; state the maximum observed and the chosen `numeric(p, s)` |
| decimal round-trip fidelity | insert a value at full published precision, read it back, assert string equality — the same evidence step 9 recorded for `numeric(18,6)` at `docs/backend.md:3338–3339` |
| the tables, as applied | read back from `information_schema` and `pg_indexes` **after** `db:migrate`, never from the generated SQL. Step 9's `### The tables, as applied` (`docs/backend.md:3249–3291`) is the format to copy exactly |
| seed runtime, and whether warm | time the seeder; state warm or cold, since Neon free-plan scale-to-zero costs a few hundred ms on the first query (§7.3) |
| coverage on a real import | run the engine over a committed import and report matched / unmatched counts and the unmatched pairs |

**Judgements, to be labelled as judgements:** the default `(category, unit)` →
factor mappings; the Net CV vs Gross CV choice for fuels (DEFRA's stated default
for company reporting is Net CV — confirm against the methodology report at
execution time rather than trusting this line); and the per-gas-vs-combined
choice from domain fact 4.

## Prerender impact

**Expected: none — no marketing route changes.** Every addition is `lib/`, one
migration, a seed script, and edits inside the already-dynamic `/activity` area.

**This must be verified, not assumed** (§4, §8.1). The baseline was produced this
session by an actual `npm run build`:

```
27/27 static pages generated · 21 prerendered HTML files · one CSS chunk, 64513 bytes
○ Static (11): / /_not-found /about /careers /design-system /forgot-password
               /journal /reset-password /sign-in /sign-up /verify-email
● SSG (2):     /article/[slug] (6 paths)  /job-listing/[slug] (3 paths)
ƒ Dynamic (9): /account /activity /activity/[importId] /api/auth/[...all]
               /api/newsletter/unsubscribe /newsletter/confirm
               /newsletter/unsubscribe /submissions
               /submissions/applications/[id]/cv
ƒ Proxy (Middleware)
```

The build **does not need a database connection** — verified this session by
building with `.env.local` moved aside, which produced a byte-identical route
table. That is §7.3's lazy-pool rule working, and the new schema must not break
it: nothing may construct a pool or read `DATABASE_URL` at module scope.

Diff procedure, per `docs/automation.md` — **all four traps apply, all four are
silent**:

1. stash the four gitignored docs-snapshot paths behind a restoring `EXIT` trap,
   or the CSS chunk balloons from ~64 KB to ~411 KB across two chunks;
2. normalise `.next/BUILD_ID`, the CSS chunk name, **and**
   `/_next/static/chunks/[A-Za-z0-9_-]+\.js` — the character class is
   `[A-Za-z0-9_-]`, not hex, and equal byte lengths on both sides is the tell
   that a "difference" is a rename;
3. check `pgrep -af "next dev"` first and **do not kill the user's server** —
   build a `tar` copy with hard-linked `node_modules` **on the same filesystem
   as `/home`** (`/tmp` is tmpfs; `cp -al` there degrades silently and produces a
   broken tree);
4. pin the same in-memory `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on both sides, or
   Next 16 changes every Server Action id per build.

Strip the RSC flight scripts before comparing markup:
`re.sub(r'<script>self\.__next_f\.push\(.*?\)</script>', '', html, flags=re.S)`.

**Anything short of byte-identical on all 21 prerendered pages is a finding**, to
be reported rather than explained away.

## Trust boundary

- **The seeder** is a local script run by a developer against the direct
  connection. It is not reachable from the browser, has no request path, and
  takes a committed CSV as its only input.
- **`recalculate`** is an authenticated Server Action. `resolveTenant()` resolves
  the organisation from the **membership row**, never from `formData` — the
  request never names a tenant. The rate limit is keyed by `userId` and **fails
  closed** on a limiter error. Input is `safeParse`d with a shared Zod schema
  after auth and the limit (§10 rule 3: a, b, then c). Every `lib/db/` call takes
  `organizationId` as a predicate, so a cross-tenant id answers not-found rather
  than acting as an existence oracle.
- **A rejected request returns a typed `SubmitResult`** — `{ ok: false, error }`,
  never a thrown string and never a bare string (§10 rule 2).
- **Reads** on `/activity` go through `requireOrganization`, which redirects
  signed-out users to `/sign-in?callbackURL=…` and org-less users to `/account`.
  `proxy.ts` stays an optimistic redirect only; its matcher already covers
  `/activity/:path*` and **must not** be widened to any marketing route (§8.1).
- Factor reads filter `organization_id IS NULL OR organization_id = $1`, so a
  tenant can read published factors and its own, and no others.

## Secrets and data

- **No new environment variable.** The seeder uses `DATABASE_URL_UNPOOLED`
  through the existing `dotenv -e .env.local --` pattern; the app uses
  `DATABASE_URL`. Both already exist.
- **No `NEXT_PUBLIC_*`.** Adding one would be a decision to make a value public
  (§8.4).
- Every new `lib/` module that touches the database or a secret carries
  `import "server-only"`. **`lib/domain/` and `lib/validation/` do not** —
  `lib/domain/` is pure and has no I/O to protect, and `lib/validation/` must
  stay importable by client leaves and must not import from `lib/db/` (§6.3).
- **No personal data is added.** Emission factors are public reference data;
  activity records are a customer's commercial data and stay tenant-scoped.
  **Nothing is sent to any third-party model** — there is no model in this step.
- **Nothing is logged.** No request body, no tenant figures, no console output
  on the action path — `app/activity/actions.ts` has no `console` call today and
  must still have none afterwards.

## Non-goals

| out of scope | why, and where it belongs |
| --- | --- |
| EPA Hub, eGRID, or any second publisher | decided with the user: DEFRA only. EPA's shape differs fundamentally (per-gas columns each with its own unit, model-year bands) and generalising over two publishers at once widens the step |
| IEA factors | licence-blocked for this product (domain fact 9). Not a scheduling decision |
| market-based scope 2 | needs REC/GO capture, supplier-specific rates and residual-mix fallback, none of which the product models. The `scope2_method` discriminator is built now so it is not a rewrite later |
| AI factor matching | §5.3 sanctions embeddings + rerank at step 10 but "sanctioned, not scheduled". The engine must be correct and tested before a model is near factor selection. **Do not install an AI SDK, name a model, or scaffold a prompt** |
| extending `activity_record` with fuel type, region or Net/Gross CV | changes step 9's CSV grammar, its alias table and its mapping UI. Its own prompt |
| editing the `(category, unit)` mapping in the UI | read-only surfacing this step; the editing surface belongs with step 12's dashboard routes |
| targets, forecasting, the "16% off your 2027 goal" reading | step 11 |
| the dashboard routes, and anything resembling `home/dashboard.tsx` as a comp | step 12. That file is a marketing illustration with traced numbers and is intent only (§5) |
| ESG report narrative | step 13 |
| scheduled recalculation and threshold alerts | step 14 |
| any change to a marketing route's markup or render mode | §8.1. The prerender diff is the check |

## Checks to run

Every one of these is run and its **exact output quoted**; never claim a check
passed without running it (§2, §12 rule 3).

1. `npm run lint`
2. `npm run typecheck`
3. `npm run db:generate` — inspect the generated SQL before applying; a
   hand-written `ALTER TABLE` is out of bounds, and `drizzle-kit push` is not
   used in this project
4. `npm run db:migrate` — over the **unpooled** connection, which
   `drizzle.config.ts` already reads
5. read the applied schema back from `information_schema` and `pg_indexes`
6. the seeder, then the row counts and the precision measurement above
7. `npm test` — only if section G is approved
8. `npm run build` — quote the full route table and confirm it matches the
   baseline above, 27/27
9. the prerender diff, with all four traps handled
10. `npm run test:e2e` — the existing matrix, to confirm nothing regressed

## Where the result is recorded

**`docs/backend.md`**, appended as `## Step 10 — emission factors and the
calculation engine`, after step 9's "What step 10 deliberately did not do"
section at the end of the file. Copy step 8's and step 9's structure: decisions
taken with the user; what was built and where it lives; the tables as applied,
in the prose format at `docs/backend.md:3249–3291`; the enums as a two-column
table; the numeric precision with round-trip evidence; the measurements; what is
judged rather than measured; the IEA licence finding; prerender impact and
verification; secrets and data; and what step 10 deliberately did not do.

**`docs/automation.md`** gains the xlsx→CSV conversion command, and the
`/tmp`-is-tmpfs hard-link gotcha found while producing this prompt's build
baseline.

**AGENTS.md** gains **nothing** except the §9.2 rule 6 clause described above,
if that deviation is approved — and, if section G is approved, the correction to
§2's "there is no test script" line. `docs/backend.md` is already in the index,
so **no new index row.** Column types, DDL, migrations, endpoint fields and
measured latencies go in `docs/`, never in AGENTS.md (the cap rule).

Finish with a commit to `main` (§1 step 10). Do not push unless asked.

## SKILLS USED

- **`drizzle-docs`** — the schema, the migration workflow, `numeric` with
  precision and scale, `pgEnum`, the `(table) => [...]` extra-config array form,
  composite and partial indexes, and `onDelete` actions. Note two gaps this
  session found in it: the default JS type of `numeric` without `mode`, and
  adding a value to an existing enum in a migration, are **not covered** — read
  those from `node_modules/drizzle-orm/pg-core/columns/numeric.d.ts` and
  `foreign-keys.d.ts` and say that is where they came from
- **`neon-postgres`** — the pooled/unpooled split, scale-to-zero's effect on any
  latency measurement, and connection behaviour for the seed script
- **`zod-docs`** — the shared schema for the recalculate action, `safeParse`, and
  `z.flattenError` for field errors, matching what `app/activity/actions.ts`
  already does
- **`nextjs`** — Server Action semantics on Next 16.2, `revalidatePath`, and
  confirming no route's render mode changes
- **`vercel-storage`** — only to confirm nothing here needs new storage; the
  seed CSV is committed, not uploaded
- **`vercel-functions`** — Fluid Compute behaviour if the recalculation is
  long-running, and the function timeout
- **`organization-best-practices`** — the tenant-scope predicate on every new
  query, and confirming the nullable-reference pattern for shared reference data
  does not conflict with the organization plugin
- **`tailwind-4-docs`** — for the `/activity` surface in section F; tokens live
  in `@theme` in `app/globals.css` and there is no `tailwind.config.js`
- **`frontend-design:frontend-design`** — the `/activity` totals and coverage
  surface is design work built from the existing primitives in
  `app/_components/`; no second design system, and **no GSAP** (§7.5)
- **`dataviz`** — only if section F ends up rendering any chart. Read it before
  the first line of chart code, not after
- **`next-cache-components`** — only if caching the computed totals is
  considered; `use cache` is not `unstable_cache` and must not be written from
  memory

**Deliberately not used:** `vercel:ai-sdk` and anything AI — there is no model in
this step (§5.3). `marketplace` — no new provider is needed. `gsap-*` — §7.5
forbids GSAP in backend UI. `resend` / `react-email` — no email on this path.
`upstash-ratelimit-js` is not listed because the recalculate action reuses the
existing limiter in `lib/rate-limit/index.ts` rather than adding one; load it if
that turns out to need a new window.

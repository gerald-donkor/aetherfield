# 69 — the DEFRA 2025 factor set

Load a second published DESNZ conversion-factor set — **2025** — so that
activity data dated before 2026 is costed instead of refused.

## Scope, and why it is next

Prompt 68 made factor selection date-effective. Its fourth resolution stage is
`out_of_period`: **a refusal, never the nearest year.** That is the right rule,
and it was shipped with an accepted caveat recorded in `docs/backend.md` under
"What prompt 68 deliberately did not do":

> | loading a second DEFRA year's factor set | that is data, and its own prompt.
> This makes a second year *usable*; it does not supply one. **Until one is
> loaded, any record dated outside 2026 leaves the totals** — the accepted
> caveat of the "refuse and surface it" decision |

So today the database holds exactly one published set — `DESNZ 2026 v1.2`,
`2026-01-01`–`2026-12-31`, measured back from the database by prompt 68 — and a
customer importing a full 2025 baseline gets a coverage line saying every record
is out of period and a total of zero. This is the only outstanding item where
the last shipped change made a plausible input worse. Everything else on the
open deferral lists — AI factor matching (deferred by prompts 65 and 68 alike),
market-based scope 2, editing a set's metadata, retiring a set, bulk CSV import,
the erasure path and a stated retention period — blocks nothing downstream and
was deferred on its own merits.

**This is post-sequence work, as prompts 63–68 were.** §5.2's fourteen steps are
all committed; this is not a step 15 and must not be recorded as one.

## Reference material read for this prompt

Read this session, by path:

- `AGENTS.md` — §5.2 (the sequence is exhausted), §5.3's hard rule, §6.2, §7.3's
  Neon traps, §9.2 rule 6 on published reference data, §12
- `docs/backend.md` — "Date-effective factor selection, prompt 68"
  (`docs/backend.md:4198`), "Step 10 — emission factors and the calculation
  engine" (`docs/backend.md:6145`), and the custom-factor-set sections at
  `docs/backend.md:3785` and `docs/backend.md:4007`
- `lib/db/seed/seed-emission-factors.ts` — the whole file, including the
  `PUBLICATION` constant and the idempotence check
- `scripts/defra-xlsx-to-csv.py` — the whole file, including `FIRST_DATA_ROW`
  and `SIGNIFICANT_DIGITS`
- `lib/domain/defra.ts` — grepped for the year-specific tables: `SCOPES`,
  `ACTIVITY_UNITS`, `RESULT_UNITS`, `AR4_FAMILIES`, `SCOPE3_CATEGORIES`,
  `BIOGENIC_FAMILIES`, `DEFAULT_FACTOR_MAPPINGS`
- `lib/db/seed/defra-2026-factors.csv` — header and first rows only (8,741 lines)

**A correction to `docs/backend.md`, to be made in the same change (§12 rule 8).**
Step 10's record says `www.gov.uk` is "unreachable from this build environment —
WebFetch reports the domain cannot be verified as safe to fetch". That is true of
*WebFetch* and is not true of the environment: `curl` to
`https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting`
returned **200** this session, and `assets.publishing.service.gov.uk` answers
`curl` as step 10 already found. The line must be narrowed to name WebFetch
rather than the environment, because as written it would stop a later session
even trying.

## What to build

### 1. Obtain the 2025 workbook — discovery, not a guessed URL

**Do not hard-code a media URL from memory or from this file.** A guessed
`assets.publishing.service.gov.uk/media/<id>/…` path 404s — one was tried while
writing this prompt and did. The procedure is:

1. `curl` the collection page named in `PUBLICATION.sourceUrl` and read the 2025
   edition's page out of the returned HTML;
2. `curl` that page and read the **flat-file / "condensed set" `.xlsx`** asset
   link out of it;
3. download it to the scratchpad — **the workbook is not committed**, exactly as
   step 10 decided, and neither is any spreadsheet dependency;
4. record the resolved URL, the file's size and its SHA-256 in `docs/backend.md`.

If the flat-format workbook for 2025 cannot be located or downloaded, **stop and
report it** (§12 rule 9). Do not substitute the condensed set for the flat set,
do not hand-transcribe rows, and do not seed a partial year.

### 2. Convert it with the existing script — and re-derive its two constants

`scripts/defra-xlsx-to-csv.py <workbook.xlsx> lib/db/seed/defra-2025-factors.csv --report`

Two of its constants are measured from the **2026** workbook and must be
re-established against the 2025 one rather than assumed:

- **`FIRST_DATA_ROW = 7`** is documented as read back from the 2026 file's
  `_FilterDatabase` defined name (`'Factors by Category'!$A$6:$J$8746`). Read the
  2025 workbook's own `_FilterDatabase` and confirm or correct it. A title block
  one row taller silently drops the first factor row.
- **The sheet name `"Factors by Category"`** is passed to `find_sheet`, which
  exits if it is absent. If 2025 names it differently, the sheet name becomes a
  parameter — it does not become a second script.
- **`SIGNIFICANT_DIGITS = 12`** sits inside a measured gap in the 2026 set
  (7,007 rows at ≤10 significant digits, **nothing at 11–15**, 28 rows at 16–17).
  `--report` prints `noise rounded`; **re-run the same distribution measurement
  over the 2025 file** and record it. If 2025 has rows in the 11–15 band the
  threshold is no longer safe and that is a finding to report, not to round
  through.

Whatever changes, the script stays **one script with parameters**. Do not fork
`defra-xlsx-to-csv-2025.py`.

### 3. The sibling continuity measurement — the one that decides whether this works at all

**This is the most important measurement in the prompt and it must be taken
before any seeding.**

Prompt 68 resolves a mapped pair into another year through
`(source, source_row_id)` siblings — `listFactorSiblings`, indexed by
`buildFactorResolver`. `source_row_id` is DEFRA's own `id` column (e.g.
`7_400_4000_5_1`). The whole payoff of this prompt rests on an assumption
prompt 68 stated but never verified against data: **that DEFRA reuses the same
row id for the same activity across publication years.**

If it does not, seeding 2025 changes nothing — every mapping still points at a
2026 row, no sibling matches, and every 2025-dated record stays `out_of_period`
while the coverage line now claims a 2025 set is loaded. That would be worse
than the current state, because the gap would stop being legible.

So, from the converted CSV against the committed 2026 CSV, measure and record:

| measurement | how |
| --- | --- |
| ids present in both files | set intersection on the `id` column |
| ids in 2026 only, and in 2025 only | the two differences, with counts |
| **the eleven `DEFAULT_FACTOR_MAPPINGS` targets specifically** | do all eleven mapped `source_row_id`s exist in the 2025 file? Name any that do not |
| for a sample of shared ids, whether the hierarchy still describes the same activity | compare `level_1`–`level_4`, `uom` and `ghg_unit`, not just the id. **An id reused for a *different* activity is the dangerous case** — it would silently cost a 2025 record against the wrong thing |

**If the ids do not carry across, stop and report before seeding.** The fix is a
different prompt (a stable cross-year key, or per-period mappings — the option
prompt 68 rejected), not an improvisation inside this one.

### 4. Re-read the 2025 methodology report for the GWP basis and the scope-3 map

`lib/domain/defra.ts` carries two tables that are **publication-specific** and
currently module-level constants derived from the 2026 report:

- **`AR4_FAMILIES`** — measured from Table 1 of the 2026 methodology report by
  tick *column position*, giving AR4 for Bioenergy, WTT Bioenergy and Material
  Use, AR5 for everything else. Read the 2025 report's equivalent table.
- **`SCOPE3_CATEGORIES`** — a judgement mapping DEFRA `Level 1` to Table 5.3,
  recorded as such.

If the 2025 basis differs from 2026's, the table stops being a module constant
and becomes **per-publication input to `normaliseDefraRow`**. If it is identical,
say so and leave the constant alone — and say that it was checked, not assumed.

Note that neither moves a number today: every DEFRA value is already CO₂e and
`gwp_set` is never applied to one. It is provenance, and provenance that is
wrong is still wrong.

### 5. Generalise the seeder from one publication to a registry

`lib/db/seed/seed-emission-factors.ts` hard-codes a single `PUBLICATION` object
and a single `SEED_CSV` path. Turn that into a list of publication descriptors,
each carrying its own CSV path, and have `main()` iterate:

- **The idempotence check stays exactly as it is**, per descriptor — keyed on
  `(organization_id is null, source, dataset_version)`. An already-seeded
  publication writes nothing and says so. Re-running with both present must
  write nothing at all.
- **A factor row is still never updated in place**, and a revision is still a new
  `dataset_version` alongside the old — the file's docblock already argues this
  and the argument is unchanged.
- **Keep the vocabulary refusal fatal.** `normaliseDefraRow` returning a
  non-blank refusal must still throw and stop the whole run. A 2025 unit of
  measure the `ACTIVITY_UNITS` table does not know is a publisher vocabulary
  change, and **widening that table to make the seed pass is out of bounds** —
  each new entry is a claim about what a denominator means. Report it.
- `npm run db:seed:factors` keeps its name and its `dotenv -e .env.local --`
  prefix and seeds every unseeded descriptor. An optional argument selecting one
  by `dataset_version` is fine; a second npm script is not.
- Batching (`INSERT_BATCH = 500`), the transaction per set, and
  `DATABASE_URL_UNPOOLED` are all unchanged — §7.3's session-state reason still
  holds and the pooled handle is still not reused.

`effectiveFrom` / `effectiveTo` for the 2025 descriptor come from the 2025
methodology report's own "for use with activity data that falls entirely or
mostly within …" sentence, quoted in the descriptor's comment as 2026's is —
**not** assumed to be `2025-01-01`–`2025-12-31`.

`retrievedAt` is the download date, not the run date.

### 6. Do not touch the resolver, the engine, or `ENGINE_VERSION`

`lib/domain/factor-selection.ts`, `lib/domain/emissions.ts` and
`lib/db/emission-queries.ts` are **correct already** — prompt 68 built them for
exactly this. Seeding a second set exercises them; it must not require editing
them. `ENGINE_VERSION` stays `1.1.0`: the engine's behaviour is unchanged, and
the figures that move do so because new data became visible, which is what the
`emission_factor_set` rows record. **If any of those three files needs a change
to make this work, that is a finding — report it before making it.**

The tie-break already orders tenant-owned before published, then
`publication_year` desc. Two published sets whose windows do not overlap never
reach the tie-break at all; if the 2025 window turns out to overlap 2026's, say
so and record which set wins and why.

## Measurements the implementation must produce

None of these may be eyeballed or carried over from prompt 68's numbers.

1. **The resolved 2025 asset URL, byte size and SHA-256.**
2. **`--report` output for the 2025 conversion**: total rows, rows per scope,
   rows with a value, blank-value rows, noise-rounded count — beside the 2026
   file's, which the record already holds (8,740 rows, 1,705 blank, 7,035
   seeded).
3. **The significant-digit distribution** over the 2025 valued rows, per §2.
4. **The full sibling-continuity table** of §3.
5. **Seeded distribution read back from the database** — scope, result unit, GWP
   set, scope-3 category counts for the 2025 set, in the same shape step 10
   recorded for 2026.
6. **Seed runtime**, stating warm or cold (§7.3's scale-to-zero note), and the
   re-run writing nothing.
7. **The end-to-end case, driven through the real seam.** The development
   database holds 0 `activity_record` rows, so the case must be produced as
   prompt 68 produced its: a temporary organisation, records dated across 2024,
   2025 and 2026, driven through `recalculateOrganization`, measured, then
   deleted with the row counts confirmed back at baseline. Record, for the same
   record set, **before and after** the 2025 set is seeded:
   - total tCO₂e and matched count,
   - `outOfPeriodYears`,
   - **which `factor_id` each emission row used**, proving the 2025 records
     resolved to 2025 rows and the 2026 records did not move.
   The 2024 records must **stay refused** — no year is loaded for them, and a
   nearest-year fallback appearing here would be a defect.
8. **Query count around `recalculateOrganization`**, by the same
   `pg.Pool.prototype.query` count prompt 68 used, confirming a second set adds
   no per-record query. Prompt 68 measured 3 at 5 records and 3 at 205.

## Prerender impact

**Expected: none.** This adds a CSV, edits a developer-run script and possibly a
pure domain module; no marketing route imports any of it. **Verify, do not
assume** — the two-build diff in `docs/automation.md`, both sides excluding
`.claude/` and `.agents/`, normalising `.next/BUILD_ID` and the CSS chunk name,
and quoting the route table (27/27, 11 Static, 2 SSG, 9 Dynamic, plus Proxy) and
the 21-file prerender comparison. If a dev server is running, leave it alone and
build both sides under `/home/gdk26/.cache/aetherfield-diff` per that file's
third trap.

CSS is expected byte-identical — no new utility should appear. If one does, find
it; step 10 shipped a dead utility that came from a bare English verb in a doc
comment matching a utility name, and this prompt adds prose to `.ts` files.

## Trust boundary

**No new request path.** The seeder is a developer-run script with no route, no
action and no HTTP surface, reading a committed CSV over the direct connection.

What *does* change is the data behind two already-authorised paths — the
`recalculate` Server Action in `app/activity/actions.ts` and the cron sweep at
`app/api/cron/recalculate/route.ts`. Neither gains a stage. Every read they make
keeps `visibleFactorScope(organizationId)`, and the new set is inserted with
`organization_id = null`, which §9.2 rule 6 defines as published and shared —
**the narrow exception, and the reason every query on the table filters
`organization_id is null or organization_id = $1`.** Confirm the 2025 rows are
inserted with a null organisation and that no tenant-scoped query was widened.

## Secrets and data

- **No new environment variable.** `DATABASE_URL_UNPOOLED` through the existing
  `dotenv -e .env.local --` prefix, as the seeder already does.
- **No `NEXT_PUBLIC_*`.**
- **No personal data.** Emission factors are public reference data under the Open
  Government Licence v3.0. The seeder logs counts and a set id — never a tenant,
  never a figure — and that must stay true.
- **Attribution.** `licence`, `licenceUrl` and `sourceUrl` are stored on the set
  and rendered from the row, not hard-coded, which is what makes a second dataset
  safe to add. Confirm the OGL notice in the 2025 publication rather than copying
  2026's wording, and record it verbatim.
- **Nothing reaches a third party and no model is called.** §5.3: phase two
  sanctions AI factor matching at step 10 and this prompt does not build it.

## Non-goals

| not doing | why |
| --- | --- |
| any schema change or migration | the tables already carry `effective_from` / `effective_to`, `publication_year` and `superseded_by_set_id`. If one is genuinely needed, stop and report |
| touching `factor-selection.ts`, `emissions.ts` or `emission-queries.ts` | prompt 68 built them for this case; see §6 above |
| bumping `ENGINE_VERSION` | the engine is unchanged; the data is not the engine |
| 2024 or any earlier year | one year at a time, and the measurement in §7 depends on a year staying unloaded to prove refusals still refuse |
| EPA Hub, eGRID, or a second publisher | step 10's decision with the user: DEFRA only. EPA's shape differs fundamentally |
| IEA factors | licence-blocked for this product. Not a scheduling decision and it does not expire |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65 and 68 |
| letting the custom-factor-set surface create a sibling of a published row | prompt 68's open gap — `createTenantFactor` hashes its own `source_row_id`. Real, and not closed here |
| market-based scope 2, set-metadata editing, retiring a set, bulk CSV import | untouched prior deferrals |
| an xlsx parser in the application | the workbook is converted once by the committed script; the app reads the derived CSV with the pure `parseCsv` |
| adding an out-of-period figure to `ReportEvidence` | it would widen a stored snapshot and the narrative allowlist. Prompt 68's reasoning is unchanged |
| any marketing route, `SiteNav`, `SiteFooter` | §8.1 and the front matter's settled surfaces |

## Checks to run

Report exact output; never claim a pass without running it (§2, §12 rule 3).

| check | note |
| --- | --- |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm test` | 9 files / 197 tests is the current baseline. Any change to `lib/domain/defra.ts` needs tests with it |
| `npm run db:seed:factors` | first run seeds 2025 only; second run writes nothing for either set |
| database readback | the distribution table of measurement 5, and the two sets' windows |
| `npm run build` | quote the route table |
| prerender diff | two-build method, 21 files, per `docs/automation.md` |
| `npm run test:e2e` | Chromium and Firefox. **WebKit needs rootless Podman, which is not installed on this machine** — if it does not run, say so plainly and do not report it as passed |

## Where the result is recorded

`docs/backend.md`, a new section **"The DEFRA 2025 factor set, prompt 69"**,
placed with the other post-sequence sections (after "Date-effective factor
selection, prompt 68"). It carries every measurement above, the judgements
labelled as judgements (§12 rule 4), and the correction to step 10's WebFetch
line noted at the top of this file.

**Nothing goes in `AGENTS.md`.** No index row is needed — `docs/backend.md` is
already indexed — and no new site-wide invariant is created.

Commit to `main` unprompted (§1 step 10). Do not push.

## SKILLS USED

Invoke each of these at execution time, before writing code. Listing is not
loading (§4).

- **`drizzle-docs`** — the seeder's batched inserts, its transaction per set and
  its idempotence query; and the project's fixed decision that migrations are
  generated, never hand-run, if a schema change is even considered.
- **`neon-postgres`** — the pooled/direct split, why the seeder takes
  `DATABASE_URL_UNPOOLED`, and scale-to-zero, which every timing measurement must
  declare itself warm or cold against.
- **`vercel:vercel-storage`** — the Neon-on-Vercel side of the same, and the
  standing correction that the driver here is `pg`, never
  `@neondatabase/serverless`.
- **`nextjs`** — only for the build and prerender verification; this prompt adds
  no route. Confirms the route table's meaning and the App Router rendering
  modes being compared.
- **`zod-docs`** — if any descriptor or CLI argument is validated. Not expected
  to be needed; named so the implementation does not write a schema from memory
  if it is.
- **`vercel:env-vars`** — only to confirm that no new variable is required and
  that `.env.example` needs no line. Expected to change nothing.

No skill covers DEFRA's publication itself, the OGL, or the GHG Protocol. That
material comes from the fetched documents and is cited by URL and retrieval date
in `docs/backend.md`, per §12 rule 2.

# 85 — Market-based scope 2: the second reporting lane

## Scope, and why it is next

**Every step of AGENTS.md §5.2 is committed** — resolved from the repository and
`git log`, not from `prompts/` (§12 rule 5). Steps 1–7 land in commits
`6f120b2` … `ce84e14`; steps 8–14 in `246decd`, `4541641`, `60def3c`, `b13bc02`,
`f16e86f`, `8196d09`, `f9e102b`. Prompts 63–84 are post-sequence work on those
steps' surfaces. **This is not a step 15**; §5.2 remains the complete ordered
product build.

The scope is **market-based scope 2**, and it is next because it is the largest
remaining named deferral on the path that decides a filed disclosure figure.
`docs/backend.md` records it as open in eleven places — lines 3867, 4012, 4784,
5009, 5256, 5685, 8499, 8957, 9488, 10235 and 10567 — and step 10's own table
says why it was left: *"needs REC/GO capture, supplier rates and a residual-mix
fallback. `scope2_method` is built now so it is not a rewrite later"*
(`docs/backend.md`:9488).

It is also the one open item that is **structurally impossible today**, not
merely unbuilt. The GHG Protocol Scope 2 Guidance requires **dual reporting** —
a location-based figure *and* a market-based figure for the same electricity
consumption — and three shipped constraints forbid a second figure:

| constraint | file |
| --- | --- |
| `activity_factor_mapping_key` is `unique(organization_id, category, unit)` — one factor per pair, so a pair cannot carry both a grid-average and a contractual rate | `lib/db/schema.ts`:776 |
| `activity_emission_record_key` is `unique(activity_record_id)` — "One computed figure per record", by its own comment | `lib/db/schema.ts`, `activityEmission` indexes |
| `buildFactorResolver` keys one mapping per `${category}.${unit}` and `recalculateOrganizationImpl` runs exactly one `aggregate()` pass | `lib/db/emission-queries.ts`:1266, :1477 |

Everything else the figure needs already exists: `scope2_method` is a column on
both `emission_factor` and `activity_emission`, `SCOPE2_METHODS` already carries
`market_based` (`lib/validation/emissions.ts`:127), `custom-factor-form.tsx`
already offers both values on a scope-2 custom factor, and `totalsOf` already
collects `scope2Methods` (`lib/domain/emissions.ts`:659). The vocabulary shipped;
the second lane did not.

The alternative candidate — **un-retiring a factor set**, the deferral prompt 84
opened — is a reversal affordance on a surface that shipped four days ago. It
blocks nothing, and it is not on the disclosure path. Market-based scope 2 is.

## Reference material read for this prompt

By path, all read this session:

- `AGENTS.md` — §5.2 (the sequence), §5.3 (the hard rule), §6.2 (boundaries),
  §9.2 (the data-model rules, incl. rule 2 on enums and rule 6 on tenant scope),
  §10 (the write-path stage order), §11.2, §12
- `docs/backend.md` — step 10's "did not do" table (:9488), prompt 66's (:4012),
  prompts 68/69/70/73/82/84's deferral rows (:4784, :5009, :5256, :5685, :10235,
  :10567), step 13's methodology refusal (:8499), and prompt 84's whole section
  (:10420–:10570) as the pattern for a query + action + client-leaf change
- `lib/db/schema.ts` — `emissionFactor` (:620–:700), `activityFactorMapping`
  (:748–:782), `activityEmission` (:790–:860), and the four existing partial
  unique indexes at :567, :570, :1257, :1405
- `lib/domain/emissions.ts` — `ENGINE_VERSION` (:101), `ScopeTotals` (:468),
  `AggregateResult` (:485), `FactorResolver` (:516), `aggregate` (:527),
  `totalsOf` (:628), `totalsByPeriod` (:687)
- `lib/domain/factor-selection.ts` — the whole module
- `lib/db/emission-queries.ts` — `buildFactorResolver` (:1266),
  `listRecordsForCalculation` (:1327), `replaceEmissions`,
  `recalculateOrganization` (:1477), `PersistedEmission` (:1532)
- `lib/domain/reports.ts` — `buildReportEvidence` (:144), `allowedNumberTokens`
  (:339), `reportSections` (:482)
- `lib/validation/reports.ts` — `reportSnapshotSchema`'s `totals` and
  `scope2Methods` (:185–:215)
- `lib/validation/emissions.ts` — `SCOPE2_METHODS` and its docblock (:120–:135)
- `app/_components/activity/emissions-summary.tsx`, `app/dashboard/page.tsx`,
  `app/activity/mappings/page.tsx`, `app/_components/activity/mapping-form.tsx`
- the Drizzle Postgres index page,
  `.claude/skills/drizzle-docs/references/docs/305-pg-indexes-constraints.md`,
  for `uniqueIndex(...).on(...).where(sql\`…\`)`

**Read again at execution time, before writing code**: `docs/backend.md`'s
step 10 section in full (the engine's contract), and prompt 84's section (the
action and query idiom this copies).

## The methodology, and how it is verified

**No number and no rule in this prompt is written from memory** (§12 rule 2).
`docs/backend.md`:8499 records that step 13 refused market-based scope 2 because
*"no verified methodology was read for this step"*. This prompt does not repeat
that refusal — it makes the read part of the work:

1. **Fetch the GHG Protocol Scope 2 Guidance** at execution time
   (<https://ghgprotocol.org/scope-2-guidance>, and the PDF it links) and quote,
   verbatim into `docs/backend.md`, the two things this implementation turns on:
   - the **dual-reporting requirement** — that both figures are reported, and
     neither replaces the other in a total;
   - the **market-based hierarchy** in order, and what it says a reporter does
     when no contractual instrument and no residual mix are available.
2. If the fetch fails or the document cannot be read, **stop and report it**
   (§12 rule 9). Do not implement the hierarchy from recollection, and do not
   substitute a secondary summary for the primary document without saying in
   `docs/backend.md` that that is what was quoted and why.
3. Every sentence of user-facing copy that makes a methodological claim traces
   to a quoted line. Copy that cannot be traced is cut, not softened.

## The decisions

Each is a decision, not a measurement (§12 rule 4). D3 and D5 are the two that
would be expensive to reverse.

| # | decision | why |
| --- | --- | --- |
| **D1** | **A second mapping lane on the existing table**, not a new table: `activity_factor_mapping` gains a nullable `scope2_method` column. `null` is the existing lane and keeps its meaning for every scope; `market_based` is the new one | a new table would duplicate `factorId`, `createdBy`, the soft-delete and the tenant column, and every reader would have to union two shapes. §9.2 rule 7 — extend, never fork a parallel table for the same concept |
| **D2** | **Two partial unique indexes replace `activity_factor_mapping_key`**: `(organization_id, category, unit) where scope2_method is null` and `(organization_id, category, unit, scope2_method) where scope2_method is not null` | Postgres treats NULLs as distinct in a plain unique index, so widening the existing one to four columns would silently permit unlimited duplicate default mappings. The repo already uses this exact shape four times (`lib/db/schema.ts`:567, :570, :1257, :1405) |
| **D3** | **`activity_emission` gets two partial unique indexes in place of `activity_emission_record_key`**: one on `(activity_record_id) where scope2_method is distinct from 'market_based'`, one on `(activity_record_id) where scope2_method = 'market_based'` | the shipped comment — "One computed figure per record, so a total can never double-count" — is the invariant to preserve, not the index. **Exactly one primary figure and at most one market-based figure per record** keeps that guarantee while admitting the second lane. `is distinct from` is required: `scope2_method` is null on scope 1 and 3 |
| **D4** | **`ScopeTotals.scope2` and `ScopeTotals.total` keep meaning the location-based figure**, unchanged. The market-based figures are **new fields**: `scope2MarketBased` and `totalMarketBased` | it bounds the blast radius by construction. `lib/domain/targets.ts`, `lib/domain/alerts.ts`, `lib/domain/dashboard.ts` and every stored `report.evidence` snapshot read `total` and `scope2`; changing what those mean would silently restate filed figures. A reporter who wants targets tracked market-based is a later decision with its own surface |
| **D5** | **No residual-mix dataset ships, and the grid average is never silently substituted.** A scope-2 record with no market-based mapping produces **no** market-based figure, and the surfaces state the market-based coverage explicitly | DEFRA publishes no residual mix (the AIB European Residual Mixes are separately licensed — `docs/backend.md` records the IEA licence block at :8974 for the same class of reason). Substituting a location-based value into a market-based total would put a number the reporter did not contract for into a disclosure, which is §5.3's hard rule in its deterministic form. **A missing figure is honest; an invented one is not** |
| **D6** | **The market-based rate is entered through the existing custom-factor surface**, unchanged. No new capture UI for the number | `custom-factor-form.tsx` already offers `market_based` on a scope-2 factor, and a supplier-specific rate *is* a customer-supplied factor under its own provenance — exactly what a tenant factor set models. Adding a parallel "supplier rate" entity would be §9.2 rule 7's forked table |
| **D7** | **The market pass runs over the filtered record subset** — only records whose `(category, unit)` carries a market-based mapping — and its own `CoverageReport.unmatchedPairs` is **discarded**, while `outOfPeriodYears` is kept and reported against the market lane | a record with no contractual rate is not a coverage gap under D5; it is the expected state. An out-of-period market factor *is* a gap, and it is the same gap the location lane reports |
| **D8** | **`ENGINE_VERSION` bumps** (`lib/domain/emissions.ts`:101), and existing stored emissions are **not** retroactively rewritten | `activity_emission.engine_version` exists to say how a number was produced. Old rows were produced by the old engine and stay labelled as such; the next recalculation restates them |
| **D9** | **`reportSnapshotSchema`'s new fields are optional** | a stored `report.evidence` snapshot is immutable and already-filed reports must keep parsing. `lib/validation/reports.ts` is the parser for both new and stored snapshots |
| **D10** | **Both mapping lanes are managed by the same owner-gated action**, with the lane as an input field | one authorisation path, one rate-limit key, one stage order. §11.2 rule 2 |

## What to build

Ordered so each item compiles against the one before it.

**1 — `lib/validation/emissions.ts`.** Widen the mapping input schema with the
lane; correct the `SCOPE2_METHODS` docblock at :120, which currently reads
*"`market_based` exists in the vocabulary … it needs REC and GO capture,
supplier-specific rates and a residual-mix fallback, none of which the product
models yet"* — after this change that sentence is stale and it is corrected in
the same change (§12 rule 8), stating precisely which of the three now exist
(the supplier-specific rate, through D6) and which do not (REC/GO document
capture, residual mix — both still deferred below).

**2 — `lib/db/schema.ts`.** D1's column, D2's and D3's index pairs, with a
docblock on each saying what the partial predicate is for. Then
`npm run db:generate`, read the generated SQL before applying it, and
`npm run db:migrate`. **Never a hand-run `ALTER TABLE`** (§9, and the
drizzle-docs skill's project decisions).

**3 — `lib/domain/emissions.ts`.** D4's two fields on `ScopeTotals`, computed in
`totalsOf` from the market-based emissions; `totalsByPeriod` carries them
through. D8's version bump. The market-based figure is **excluded from
`total`, `scope2` and every existing field** — assert that in a test.

**4 — `lib/db/emission-queries.ts`.** `listFactorMappings` returns the lane;
`buildFactorResolver` gains a lane-aware key or a second builder (the
implementation's call, but **one rule, not two copies** — the pure selection rule
in `lib/domain/factor-selection.ts` is not duplicated);
`recalculateOrganizationImpl` runs D7's second pass and merges both emission
lists into one `replaceEmissions` call, so a recalculation stays one
transaction. `replaceEmissions`'s delete-then-insert bound by the covered record
set must clear **both** lanes for a covered record — a market mapping that was
removed must lose its figure, exactly as the location lane already behaves.

**5 — the actions.** `app/activity/actions.ts`, copying `retireCustomFactor`'s
stage order exactly (§10 rule 3, and prompt 84's precedent): session, tenant and
the `pendingDeletion` lock; the existing limiter keyed by user id; parse with the
shared schema; **then** the owner check; then the write. Typed result, never a
throw, never a bare string, no `console` call.

**6 — the surfaces.** `/activity/mappings` gains the market-based lane per
`(category, unit)`; `/activity`'s `emissions-summary.tsx` and `/dashboard` show
the market-based figure **beside** the location-based one, labelled with its
method, plus D5's coverage statement. Client leaves stay **component-only** and
add no box (§8.1, and the front matter's bundle rule). **No GSAP** (§7.5).

**7 — `lib/domain/reports.ts` and `lib/validation/reports.ts`.** D9's optional
fields on the snapshot; `buildReportEvidence` populates them;
`allowedNumberTokens` admits the new figures — **it must, or the narrative
validator will reject a report that quotes a number the engine computed**;
`reportSections` renders both, dual-reported, with the coverage caveat.

**8 — tests.** New cases in `lib/domain/emissions.test.ts` and
`lib/domain/reports.test.ts`, and one Chromium-only spec in `e2e/` walking:
create a market-based scope-2 custom factor → map it on the market lane →
recalculate → both figures visible and different. Follow
`e2e/factor-set-lifecycle.spec.ts`'s fixture and its **locator lesson** — prompt
84's third assertion failed on a label that was a superstring of another
(`docs/backend.md`, "One test bug found and fixed by the walk"). Use unrelated
words.

## Measurements this must produce

None of these is eyeballed; each is a procedure with an output to quote.

| what | how |
| --- | --- |
| the dual figures are genuinely independent | a fixture where the market rate differs from the grid average, asserting `scope2` and `scope2MarketBased` differ and that `total` equals the location-based sum exactly (exact decimal, `lib/domain/decimal.ts`, not a float compare) |
| no double counting | a record with both lanes contributes to `total` exactly once |
| D5's coverage | the count of scope-2 records with and without a market-based mapping, read back from the database and quoted |
| the migration | the generated SQL quoted verbatim in `docs/backend.md`, and the two index pairs confirmed present with `\d+` output or its Drizzle Studio equivalent |
| recalculation cost | the query count and wall-clock for a recalculation before and after, warm — and **stated as warm** (§7.3's scale-to-zero note). A second `aggregate()` pass must not become a second N-query fan-out |

## Prerender impact

**Expected: none — no route changes.** Every file this touches is `lib/`,
`app/activity/*`, `app/dashboard/*` or `app/reports/*`, all of which are already
request-time (`ƒ`) authenticated routes. No marketing route imports any of them.

**This is to be verified, not assumed** (§8.1): `npm run build`, confirm the
route table — `/`, `/about`, `/careers`, `/journal`, `/design-system` `○ Static`,
`/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` — then the two-build
prerendered-HTML diff by `docs/automation.md`'s clean recipe against `8b21f34`,
expecting **21 of 21 identical** and the CSS chunk identical by content hash.
The standing warning about a bare page-wide `magick compare` on `/`, `/journal`
and `/careers` stays in force.

## Trust boundary

No new public write path. The mapping actions are **authenticated and
owner-only**, checked inside the action after the session, the tenant resolution
and the `pendingDeletion` lock (§11.2 rules 1 and 2) — never in the component
that renders the control. **No BotID on an authenticated path**, matching
`stageImport`'s existing comment and prompt 84's actions.

A submitted mapping id, factor id or set id is **a claim, not a capability**:
re-read under the tenant predicate, with missing, retired, foreign and published
answering one indistinguishable refusal. No existence oracle, exactly as
`resolveWritableSet` and `getVisibleFactor` treat theirs.

A rejected request returns a typed result — field errors from the shared schema,
or the existing tenant-state and rate-limit sentences. Never a throw to the
client, never a bare string.

## Secrets and data

**No new environment variable, and no `NEXT_PUBLIC_*`.** The change reads
`DATABASE_URL` through `lib/db/client.ts` and the existing Upstash limiter
(`KV_REST_API_URL` / `KV_REST_API_TOKEN`). No email, no Blob, no third party.

**No personal data.** A supplier-specific emission rate is a customer's
commercial data: tenant-scoped on every read and write (§9.2 rule 6), never
logged, never transmitted. `lib/db/` keeps `import "server-only"`;
`lib/domain/` and `lib/validation/` deliberately do not. **No `console` call on
any request path.** The market pass adds no model call — §5.3's phase-two AI
surfaces are unchanged and untouched by this.

## Non-goals

| not done | why |
| --- | --- |
| **a residual-mix dataset or fallback** | D5. It needs a separately licensed dataset (AIB), and inventing a substitute would put an uncontracted number in a disclosure. Named as still-deferred in `docs/backend.md`, with the licence reason |
| **REC / GO certificate document capture** | a blob upload, a retention decision and an evidence-linking surface. Genuinely its own prompt, and the figure is correct without it — the contractual instrument's *rate* is what multiplies, and D6 already captures that |
| **supplier or contract entities** | D6. A supplier-specific rate is a tenant factor set; a contract register is a different product |
| **re-basing targets or alerts on the market-based figure** | D4 keeps `total` location-based on purpose. A reporter choosing which basis a target tracks is a decision with its own surface, and it must not arrive as a side effect of this |
| **restating already-filed reports** | `report.evidence` is an immutable stored snapshot. D9 keeps old snapshots parseable; nothing rewrites one |
| **retroactively rewriting stored emissions** | D8 |
| **un-retiring a factor set** | prompt 84's own deferral, untouched and still open |
| **AI-assisted anything** | blocked, not deferred — prompt 75 reached AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, and prompt 76 shipped the provider-free path |
| **any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface** | out of scope entirely (§8.1) |
| **a step 15** | §5.2 remains the ordered plan; this is post-sequence work as prompts 63–84 were |

## Checks to run

Every one of these, with its exact output quoted — never a claim without the
output (§2, §12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — the domain suite, currently **255 passed, 12 files**. This
  prompt adds cases, so the count **must rise**; a flat count means the new
  tests are not running
- `npm run db:generate` — **is** run this time, and the generated SQL is read
  before it is applied
- `npm run db:migrate`
- `npm run build` — route table quoted
- `npm run test:e2e:local` — Chromium and Firefox natively
- `npm run test:e2e:webkit` — expected to report the Podman environment gap on
  Arch, as prompts 78–84 recorded. **That is a gap, not a pass**, and is
  reported as one
- the two-build prerendered-HTML diff, per "Prerender impact" above

## Where the result is recorded

**`docs/backend.md`**, as a new section following prompt 84's, carrying: the
verbatim Scope 2 Guidance quotations and their retrieval date, D1–D10 with their
reasons, the generated migration SQL, the measurements above, the check output,
and a "what prompt 85 deliberately did not do" table repeating the non-goals.

The `SCOPE2_METHODS` docblock correction (item 1) and any `docs/backend.md` line
this makes stale are fixed **in the same change**, not left standing (§12
rule 8). **Nothing is added to `AGENTS.md`** — no new index row is needed
(`docs/backend.md` already owns this area) and no site-wide invariant is created
by this work. §5.2 is not ticked; a step's completion is resolved from the
repository and `git log`.

Finish with the commit (§1 step 10). Do not push.

## SKILLS USED

- **`drizzle-docs`** — the partial unique index API
  (`uniqueIndex(...).on(...).where(sql\`…\`)`), `pgEnum`, and the
  generate-then-migrate workflow. Already loaded while writing this prompt;
  **load it again before touching `lib/db/schema.ts`**
- **`zod-docs`** — widening the mapping schema, and D9's optional fields on
  `reportSnapshotSchema` so stored snapshots keep parsing
- **`nextjs`** — Server Action semantics, `revalidatePath`, and the client-leaf
  boundary the new mapping control sits on
- **`neon-postgres`** — the pooled/direct split the migration depends on
  (`drizzle.config.ts` reads `DATABASE_URL_UNPOOLED`), and the warm/cold caveat
  on the recalculation measurement
- **`vercel-storage`** — only if the recalculation measurement raises a
  connection or pooling question; not otherwise needed
- **`tailwind-4-docs`** — the mapping lane control and the second figure on
  `/activity` and `/dashboard`, using existing tokens from `@theme`
- **`frontend-design:frontend-design`** — the dual-figure presentation, which is
  a real design decision: two numbers that must read as one disclosure, not as a
  discrepancy
- **`upstash-ratelimit-js`** — only if the existing limiter's key or window is
  changed; the default is to reuse `checkFactorMappingLimit` unchanged

**Not used, deliberately:** every `gsap-*` skill (§7.5 forbids GSAP in backend
UI), `resend` / `react-email` / `email-best-practices` (no email on this path),
`better-auth-*` (no auth surface changes), `vercel:ai-*` (§5.3 — no model, and
AI Gateway is card-blocked).

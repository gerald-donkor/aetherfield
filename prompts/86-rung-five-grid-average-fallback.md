# 86 — Rung 5: the reporter-chosen grid-average fallback on the market lane

## Scope, and why it is next

**Every step of AGENTS.md §5.2 is committed** — resolved from the repository and
`git log`, not from `prompts/` (§12 rule 5). Steps 1–7 land in `6f120b2` …
`ce84e14`; steps 8–14 in `246decd`, `4541641`, `60def3c`, `b13bc02`, `f16e86f`,
`8196d09`, `f9e102b`. Prompts 63–85 are post-sequence work on those steps'
surfaces. **This is not a step 15**; §5.2 remains the complete ordered product
build.

The scope is **rung 5 of the Scope 2 Guidance's market-based data hierarchy,
offered as an explicit per-pair choice with its own recorded provenance.**

It is next because it is the one open item the *immediately preceding* prompt
named as newly-open, on the disclosure path, and because it is the only one that
closes a stated contradiction rather than adding a feature.
`docs/backend.md`:10664 records it verbatim:

> **Adding rung 5 as an explicit, reporter-chosen fallback is therefore a real
> open item**, not a rejected idea.

and the deferrals table at `docs/backend.md`:10851 repeats it as *"a coherent
next prompt, and it is not this one"*.

**The contradiction it closes.** Prompt 85 shipped D5 — no grid-average
substitution on the market lane — and `docs/backend.md`:10643 records that the
prompt's *original* justification for D5 was falsified by the Guidance's own
text (§12 rule 8). The Guidance's rung 5 **is** the grid average, and the
sentence quoted at `docs/backend.md`:10640 says location-based data *should* be
used when no better market data exists. D5 survives as a product decision — not
to make the substitution **silently**. That leaves exactly one thing unbuilt:
making it **non-silently**. This prompt builds that, and nothing else.

**What is deliberately preserved from D5.** The fallback is never a default,
never inferred, never applied to a pair the reporter has not chosen it for, and
never indistinguishable from a contractual rate in the stored figure or on any
surface. If this prompt ends with a grid average wearing an unqualified
market-based label anywhere, it has failed.

### The alternative candidates, and why not

| candidate | why not now |
| --- | --- |
| **un-retiring a factor set** (prompt 84's deferral, `docs/backend.md`:10559) | a reversal affordance on a surface that shipped five days ago. It blocks nothing and is not on the disclosure path |
| **REC / GO certificate document capture** (`docs/backend.md`:10852) | a blob upload, a retention decision under §8.3 and an evidence-linking surface — three decisions, and prompt 85 records that the *figure* is already correct without it |
| **a residual-mix dataset (rung 4)** | licence-blocked, same class as the IEA block at step 10. Named, not deferrable by effort |
| **editing a factor set's metadata** (`docs/backend.md`:10234) | a correction path on rendered disclosure evidence; wants its own prompt, as that line says |

## Reference material read for this prompt

All read this session, by path:

- `AGENTS.md` — §5.2, §5.3 (the hard rule: no model produces a disclosure
  number; nothing here calls one), §6.2, §9.2 rules 2 and 6, §10, §11.2, §12
- `docs/backend.md` — prompt 85's whole section, :10572–:10862. Specifically the
  Table 6.3 hierarchy at :10623–:10632, the "no other market-based method data"
  sentence at :10640, the D5 correction at :10643–:10665, the D1–D10 table, the
  lane check, migration `0016_mute_doomsday.sql`, and **the double-count trap
  table** — that table is the single most important thing to re-read before
  writing a query in this change
- `lib/db/schema.ts` — `activityFactorMapping.scope2Method` and its docblock
  (:763–:776), the two partial mapping indexes (:790–:809), `activityEmission`
  (:855–:897) and its two partial indexes
- `lib/validation/activity.ts` — `SCOPE2_MARKET_LANE_CATEGORIES` /
  `offersMarketLane` (:80–:96), `factorMappingSchema` (:305–:315),
  `FACTOR_MAPPING_ERRORS` incl. `notMarketBased` and
  `marketBasedOnDefaultLane` (:330–:342)
- `lib/validation/emissions.ts` — `SCOPE2_METHODS` (:120–:135) and its
  corrected docblock, the custom-factor schema's `scope2Method` refinements
  (:364, :411–:421)
- `lib/domain/emissions.ts` — `ENGINE_VERSION = "1.2.0"` (:101–:109),
  `ScopeTotals` (:476–:517), `totalsOf`'s partition (:677–:722)
- `lib/db/emission-queries.ts` — `ResolvedMapping.lane` (:948–:951),
  `buildFactorResolver`'s one-lane-per-resolver contract (:1281–:1300), the
  market pass in `recalculateOrganizationImpl` (:1534–:1570), the
  `is distinct from` predicate at :1667, `listFactorCoverage`'s join predicate
  (:1918–:1920), `listMarketBasedMappings` (:1992–:2060),
  `searchFactorsForPair`'s `lane` narrowing (:2145–:2190), `getVisibleFactor`'s
  lane fields (:2309), `setFactorMapping`'s `targetWhere` branches (:2380–:2400)
- `app/activity/actions.ts` — the lane check at :750–:775
- `app/activity/mappings/page.tsx` — `Lane` / `laneOf` (:77–:96), the market
  lane panel (:178–:230), `marketByPair` (:242–:250), lane selection (:265–:278),
  the picker copy and lane toggle (:437–:500)
- `app/_components/activity/emissions-summary.tsx` — the row-vs-record count
  (:104–:118) and the market-based stat block (:226–:243)
- `lib/domain/reports.ts` — `buildReportEvidence`'s `marketBased` block
  (:166–:190), the caveats at :293–:305, `allowedNumberTokens` (:382–:392),
  `reportSections`' market-based section (:552–:592)
- `lib/validation/reports.ts` — `reportEvidenceSchema.marketBased` (:197–:218)
- `e2e/market-based-scope-2.spec.ts`

**Re-read at execution time, before writing code** (§12 rule 1 — quote, do not
paraphrase): `docs/backend.md`:10572–:10862 in full, and the double-count trap
table in particular.

## The standard, and how the wording is verified

**Nothing in the disclosure copy this change writes may be composed from
memory** (§12 rule 2). The two sentences that authorise rung 5 are already
quoted verbatim into `docs/backend.md` at :10623–:10642 by prompt 85, which
recorded its source there.

At execution time, **verify the rung-5 row and the "no other market-based method
data" sentence against that recorded quotation before writing any user-facing
copy**, and cite the rung by number and the table by name in the code comment
that justifies the substitution. If the recorded quotation and any live source
consulted disagree, **stop and report it** — do not reconcile them silently
(§12 rule 8 and rule 9).

The copy must state the substitution in the site's measured, operational
register (AGENTS.md §5): what was substituted, for how many records, and that
the reporter chose it. Never reassuring, never apologetic.

## What to build

Shape stated as intent; every API is verified against `node_modules/`, a loaded
skill or live docs before it is written (§12 rule 2).

### 1. The basis is an explicit stored column, not an inference

A rung-5 mapping is a **market-lane mapping pointing at a grid-average factor**,
so the basis is *derivable* from `emission_factor.scope2_method`. **Derive it
anyway and it is wrong**, for two reasons to state in the docblock:

- the factor row can be superseded or corrected later, and a filed figure's
  provenance must not move when it is;
- rung 5 is a **reporter's assertion** — that no better instrument exists for
  that consumption — and an assertion has to be recorded as one. Inference would
  make the product look as though it decided.

So: a new pgEnum, on the two tables that already carry `scope2_method`
alongside it —

- `activity_factor_mapping` — nullable; non-null **only** where
  `scope2_method = 'market_based'`;
- `activity_emission` — denormalised at calculation time, exactly as
  `scope2_method`, `scope`, `biogenic` and `outside_of_scopes` already are, and
  for the reason `lib/db/schema.ts`:824 already gives.

Two values, named for the hierarchy: the contractual instrument (rungs 1–3, what
prompt 85 shipped) and the grid-average fallback (rung 5). **Rung 4, residual
mix, is not a value** — the dataset is licence-blocked and a value with no way
to be populated is a fabrication (§12 rule 6's spirit). Say so in the docblock.

**Choose the enum's value names at execution time from the Guidance's own
vocabulary** as recorded at `docs/backend.md`:10623–:10632, and record the
chosen names in `docs/backend.md`. Do not invent a name this prompt guessed.

Existing market-lane rows carry a contractual rate by construction — the lane
check has refused anything else since prompt 85 — so the migration backfills
them to the contractual value. **State the backfill in the migration review and
verify the row count**, rather than assuming the table is empty.

### 2. Validation — `lib/validation/activity.ts`

`factorMappingSchema` gains the basis field, with a cross-field rule in the same
idiom `lib/validation/emissions.ts`:411–:421 already uses for
`scope`/`scope2Method`:

- default lane (`scope2Method` absent/null) + any basis → field error. The
  default lane has one meaning and a basis on it would create a fourth lane;
- market lane + basis absent → field error. **There is no default basis**: the
  whole point is that the reporter chose.

Two new entries in `FACTOR_MAPPING_ERRORS`, written beside the existing
`notMarketBased` / `marketBasedOnDefaultLane` pair and in the same voice, for
the two new refusals in §3. `notMarketBased`'s text currently tells the reporter
their only option is to add a contractual rate; **it is now incomplete and must
be rewritten** to name both options (§12 rule 8).

`lib/validation/` stays free of `server-only` and free of any `lib/db/` import
(AGENTS.md §6.3) — the client leaf imports this module.

### 3. The action — `app/activity/actions.ts`, stage e

The lane check at :750–:775 becomes a three-case matrix, checked **after**
re-resolving the factor through `getVisibleFactor` under the tenant predicate
(unchanged — a submitted factor id stays a claim, not a capability):

| lane | basis | the factor must be | otherwise |
| --- | --- | --- | --- |
| default (`null`) | must be absent | **not** a market-based row | `marketBasedOnDefaultLane` (unchanged) |
| `market_based` | contractual | a scope 2 row with `scope2_method = 'market_based'` | `notMarketBased`, rewritten |
| `market_based` | grid-average fallback | a scope 2 row that is **not** market-based — i.e. a grid average | a new refusal: a contractual rate is not a fallback, map it as one |

The third row is the substitution prompt 85 refused, now permitted **only** on
the explicit basis. That is the entire behavioural change, and the check is the
enforcement — the picker's narrowing is a courtesy (AGENTS.md §6.2, and
`docs/backend.md`'s own words on the prompt-85 check).

Stage order (BotID n/a on an authenticated path, rate limit, parse, authorise,
write) is unchanged, as is the owner gate and the `pendingDeletion` lock.

`setFactorMapping`'s upsert already passes `targetWhere` on both branches
because the indexes are partial (`docs/backend.md`:10760 — *"`ON CONFLICT` needs
the predicate repeated"*). **Adding a column to the row does not change which
index is inferred, but verify it against the applied indexes rather than
assuming.**

### 4. The engine — `lib/domain/emissions.ts`, and the resolver

The basis travels with the figure. The market pass in
`recalculateOrganizationImpl` (:1534) already builds a second resolver over the
market-lane subset; the basis rides on `ResolvedMapping` and lands on the
persisted row. **No new query** — the mappings are already loaded; hold to
prompt 85's `+1 query` result and measure it.

`ScopeTotals` gains the fallback's own count and its own figure, so a surface can
say *how much* of the market-based total rests on rung 5 rather than only how
many records do. `scope2MarketBased` and `totalMarketBased` keep meaning the
whole market lane — the fallback is **part of** the market-based figure, which
is what the Guidance's hierarchy means; it is not a third lane. `total`,
`scope2` and `totalsForCoverage` in `lib/domain/targets.ts` are untouched, so no
filed target, alert or stored snapshot restates (prompt 85's D4, preserved).

`ENGINE_VERSION` bumps. Stored emissions are **not** retroactively rewritten;
old rows keep the version that produced them until the next recalculation, as
D8 established. Write the new version's docblock entry in the existing style.

The domain layer stays pure — no I/O, no `Date.now()` (AGENTS.md §6.2) — and
every new branch gets a case in `lib/domain/emissions.test.ts`.

### 5. Reports — the part that reaches a filing

This is where the change must not be silent, and three things at
`lib/domain/reports.ts` are **now false** and must be corrected in place
(§12 rule 8), not appended to:

- :303 — *"no residual mix or grid average has been substituted for them"* —
  false whenever a fallback exists. It becomes conditional, and the fallback
  case gets its own sentence naming the count and the rung;
- :591 — the same claim in `reportSections`' market-based note;
- `app/_components/activity/emissions-summary.tsx`:237 — the same claim again.

`buildReportEvidence` carries the fallback counts into the evidence, and
**`allowedNumberTokens` must admit them** — `lib/domain/reports.ts`:382 records
why: a figure the narrative validator does not know about makes a valid report
unfileable. `reportEvidenceSchema`'s new fields are **optional**, so a report
filed before this change keeps parsing (D9's rule, restated).

The caveat must state the rung-5 substitution as a **reporter's choice with a
count**, and must not imply the market-based total is comparable to the
location-based one where it rests on grid averages.

### 6. Surfaces

- `app/activity/mappings/page.tsx` — the market lane panel (:178) gains the
  fallback as a **second, separately-worded choice**, not a toggle that silently
  changes what the picker returns. The two states read differently: a mapped
  contractual rate, a mapped fallback, and an unmapped lane are **three**
  states, and the panel says which. The lane travels in the query string as it
  does today (`laneOf`, :83 — a forged value selects the lane the reporter would
  have got anyway); the basis travels the same way and under the same rule.
- `searchFactorsForPair` (:2145) takes the basis alongside the lane, so the
  fallback list offers grid-average scope 2 rows and the contractual list offers
  market-based ones. Prompt 85's note that the market lane is **lexical only**
  applies to the contractual basis; the fallback basis is searching the same
  7,035-row published space the default lane searches, so **re-derive whether
  close-wording ranking should be available there rather than copying either
  answer** — and record which, and why.
- `emissions-summary.tsx` — the market-based block states the split.

**No change to any marketing route, `Container`, `SiteNav`, `SiteFooter`, or any
GSAP surface** (AGENTS.md §8.1). No GSAP anywhere in this change (§7.5).

## Measurements the implementation must produce

Not eyeballed, and each stated as measured or judged (§12 rule 4). Produce them
from a **throwaway synthetic organisation, built and deleted by a scratch
script** — the pattern prompt 85 used and recorded (`docs/backend.md`:10786) —
with no real supplier and no real contractual rate. Say **warm or cold** on
every latency (§7.3, scale-to-zero).

| measurement | how |
| --- | --- |
| the applied indexes and the new column | read back from `pg_indexes` and `information_schema`, quoted verbatim, as prompt 85 did |
| the backfill | row count of pre-existing market-lane mappings before and after |
| `max_rows_per_record` | still **2** — one primary figure, one market-lane figure. A pair carrying a fallback must not produce a third row |
| recalculation query count, both lanes | against prompt 85's recorded **11 queries** — hold it, or report and explain the change |
| recalculation wall clock, warm | stated beside the row count it wrote, as prompt 85's note requires |
| the three-way split | location-based figures, market-based-contractual figures, market-based-fallback figures, and the exact `numeric` sums, so the fallback is provably inside the market total and outside `total` |
| the double-count traps | re-run every check in `docs/backend.md`'s trap table against a pair that carries a **fallback** mapping — `listFactorCoverage`, `countOutOfPeriodRecords`, `countPeriodRecords`, `EmissionsSummary.calculated`, `coverage.calculatedRecords`, `seedDefaultMappings` — and report each as verified or fixed |

## Prerender impact

**Expected: none. It must be verified, not assumed** (AGENTS.md §8.1).

Every file this change touches sits behind an authenticated route —
`/activity`, `/activity/mappings`, `/dashboard`, `/reports*` — all already `ƒ`.
No marketing route, no `app/_components/` primitive shared with one, no new
client leaf on a static page.

Verification is the recorded recipe: `npm run build`, confirm `/`, `/about`,
`/careers`, `/journal`, `/design-system` are `○ Static` and the six article and
three job-listing routes are `● SSG`, then diff the prerendered HTML per
`docs/automation.md`'s clean two-copy recipe (a dev server will be running;
build both sides under `~/.cache/aetherfield-diff`, base at `b51c4ea`).
Normalise `.next/BUILD_ID`, chunk names and the RSC flight scripts, and report
**n of 21 differed** plus the CSS chunk's content hash. The standing warning
about bare page-wide `magick compare` on `/`, `/journal` and `/careers` is not
engaged here — this is an HTML diff, not a render comparison.

## Trust boundary

- **No new public write path.** `setFactorMapping` is authenticated and
  owner-gated, checked **inside** the action after the session, the tenant
  resolution and the `pendingDeletion` lock (AGENTS.md §11.2 rules 1 and 2).
  No BotID on an authenticated path.
- The basis arrives as a field on the shared Zod schema and is parsed at
  stage c. A value outside the enum, or a basis on the default lane, is a field
  error — **never a third lane and never a silent default** (§10 rule 1: the
  schema exists once and runs twice).
- The factor id stays **a claim**: re-read through `getVisibleFactor` under the
  tenant predicate, with missing, deleted, superseded and foreign answering one
  indistinguishable refusal.
- The rung-5 permission is **narrow by construction**: it admits a scope 2
  grid-average row and nothing else. A scope 1 or scope 3 factor on the market
  lane stays refused on both bases.
- Rejections return the typed result the surface already renders — announced,
  focus managed, legible without colour (§8.2 rules 4 and 5).

## Secrets and data

- **No new environment variable, and no `NEXT_PUBLIC_*`.** `DATABASE_URL`
  through `lib/db/client.ts`; the existing Upstash limiter unchanged.
- **No personal data.** A supplier rate and a reporter's methodology choice are
  a customer's commercial data: tenant-scoped on every read and write, never
  logged, never transmitted. `app/activity/actions.ts` has no `console` call
  today and must still have none (§8.3 rule 2).
- Every phase-two table this touches stays tenant-scoped (§9.2 rule 6);
  `emission_factor` keeps its narrow published-data exception and every read
  keeps the `organization_id IS NULL OR organization_id = $1` predicate.
- **No model is called** (§5.3). AI factor matching remains blocked, not
  deferred — prompt 75 reached AI Gateway, got *"AI Gateway requires a valid
  credit card on file to service requests"*, the user declined the card, and
  prompt 76 shipped the provider-free path.

## Non-goals

| not doing | why |
| --- | --- |
| **applying the fallback automatically, or defaulting it on** | the entire distinction between this prompt and prompt 85's D5. Silent substitution stays refused, permanently |
| **rung 4, a residual-mix dataset** | needs the separately licensed AIB European Residual Mixes — the same class of block as IEA at step 10. Not a value in the enum |
| **REC / GO certificate document capture** | a blob upload, a §8.3 retention decision and an evidence-linking surface. The rate is what multiplies, and D6 already captures it |
| **Scope 2 Quality Criteria enforcement** | Chapter 7's criteria are properties of an instrument this product does not model. Prompt 85's reasoning, unchanged |
| **re-basing targets or alerts on the market-based figure** | D4 keeps `total` location-based on purpose. Which basis a target tracks is its own decision with its own surface |
| **restating filed reports or rewriting stored emissions** | D8 and D9. A snapshot is immutable; old rows keep their engine version until the next recalculation |
| **the market lane on categories beyond `electricity` and `heat`** | `SCOPE2_MARKET_LANE_CATEGORIES` is unchanged. `fuel` is combusted on site and is scope 1 |
| **un-retiring a factor set** | prompt 84's deferral, still open and untouched |
| **editing a factor set's metadata** | still open, still wants its own prompt |
| **AI-assisted anything** | blocked, not deferred — see above |
| **any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface** | out of scope entirely (§8.1) |
| **a step 15** | §5.2 remains the ordered plan; this is post-sequence work as prompts 63–85 were |

## Checks to run (AGENTS.md §2)

Report the exact output; never claim a pass without running it (§12 rule 3).

| check | note |
| --- | --- |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm test` | 268 passed / 12 files today. The new domain cases must show as a rise |
| `npm run db:generate` | **read the generated SQL before applying it** and quote it verbatim, including the backfill. No hand-run `ALTER TABLE` (§9) |
| `npm run db:migrate` | over the **unpooled** URL; read the indexes and the column back |
| `npm run build` | quote the route table |
| `npm run test:e2e:local` | Chromium + Firefox. Extend `e2e/market-based-scope-2.spec.ts`, or add a sibling spec, to walk a reporter choosing the fallback and seeing it labelled as one |
| `npm run test:e2e:webkit` | **expected to report "Podman is required for WebKit on Arch Linux". That is an environment gap, not a pass, and is recorded as a gap** — prompts 78–85 all recorded it |
| prerender diff | per the recipe above |

## Where the result is recorded

**`docs/backend.md`**, as a new section at the end, in the shape prompt 85's
section uses: the decisions table, the enum's chosen value names and why, the
migration verbatim with the backfill, the indexes read back, the corrections
made to now-false statements, the measurements, the prerender verification, the
checks with real output, and a "deliberately did not do" table.

**Never in `AGENTS.md`** (the cap rule). The only permissible edits there are
none — this adds no index row (`docs/backend.md` already exists and already
owns this area) and no site-wide invariant.

Then commit to `main`, unprompted (§1 step 10). Do not push.

## SKILLS USED

Invoke every one of these **before writing code** — listing is not loading (§4).

- **`drizzle-docs`** — the new pgEnum, the column on two tables, the partial
  unique indexes that must keep holding, `ON CONFLICT` with `targetWhere` on a
  partial index, and the whole `db:generate` / `db:migrate` workflow
- **`zod-docs`** — the cross-field rule on `factorMappingSchema` (basis
  required on the market lane, refused on the default lane), enum handling, and
  `flattenError` / field-error shaping for the typed result
- **`nextjs`** — Server Action semantics on Next 16.2, `async` `headers()` /
  `cookies()`, the client-leaf boundary, and confirming no touched route changes
  render mode
- **`tailwind-4-docs`** — any utility the mappings panel and the summary block
  need; config-less, tokens in `@theme` in `app/globals.css`, no
  `tailwind.config.js`
- **`vercel-react-best-practices`** — the mappings page is a Server Component
  composing a client leaf; keep the leaf component-only and the data read on the
  server (AGENTS.md §6.2, and the bundle rule)
- **`neon-postgres`** — pooled vs direct connection for the migration, and the
  scale-to-zero caveat that every latency measurement must state
- **`better-auth-best-practices`** — only to confirm the session read in the
  action is unchanged and correct; no auth change is in scope

**Not loaded, and why:** no `gsap-*` skill (no motion in this change, §7.5); no
`resend` / `react-email` (no email); no `upstash-*` beyond the limiter already
wired; no `vercel:ai-*` (§5.3 — no model is called); no `figma:*` and no
`frontend-design` (no new visual language — this extends a shipped surface).

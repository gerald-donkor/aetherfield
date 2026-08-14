# 75 — AI factor matching in the mapping picker

## Scope, and why it is next

**Semantic ranking of emission-factor candidates in `/activity/mappings`'s
factor search**, through Vercel AI Gateway embeddings stored in pgvector, with a
rerank second stage — §5.3's sanctioned step 10 surface, "matching a messy
activity description to the right emission factor", built as **embeddings +
rerank, not generation**.

**Why it is next.** Every one of §5.2's fourteen build steps is committed
(resolved from the repository and `git log`, per §1 and §12 rule 5 — not from
`prompts/`), so scope comes from the post-sequence deferral tables in
`docs/backend.md`. That record names this item itself: `docs/backend.md:6063`,
prompt 74's "What prompt 74 deliberately did not do" table, records AI factor
matching as deferred by prompts 65, 68, 69, 70 and 73 and again by 74 — six
times — and states that the reason for the last deferral was that "putting a
model near factor selection while the authenticated surfaces had no
browser-level verification at all was the wrong order. That objection is now
answered, which makes it the strongest remaining candidate."

**Two shaping questions were put to the user before this file was written**, and
both answers are load-bearing:

1. **The matcher acts on the existing `(category, unit)` mapping picker**, not
   per activity record. Chosen over per-record description matching and over
   doing both.
2. **Gateway embeddings + pgvector**, chosen over embeddings without the
   extension and over a purely deterministic ranking.

**Not a step 15.** §5.2 remains the ordered plan; this is approved
post-sequence work, on the same footing as prompts 63–74.

---

## Reference material read for this prompt

By path, all opened this session:

| path | what was read |
| --- | --- |
| `AGENTS.md` | §5.3 in full (the sanctioned surfaces, the hard rule, the provider decision), §6.2, §6.3, §9.2 rule 6, §10, §12 |
| `docs/backend.md:6063` | prompt 74's deferral table — the sentence quoted above |
| `docs/backend.md:5251-5300` | prompt 73, for the shape of a post-sequence section |
| `lib/reporting/narrative.ts:1-130` | the house pattern for reaching the gateway: `server-only`, the OIDC-token authentication note, model choice recorded as a judgement with its live-list date, `MAX_RETRIES`, `TIMEOUT_MS`, and what may and may not cross to the provider |
| `lib/db/emission-queries.ts:1509-1620` | `FACTOR_SEARCH_LIMIT = 50`, `escapeLike`, and `searchFactorsForPair`'s five predicates, admissible-unit narrowing and deterministic ordering tail |
| `lib/db/emission-queries.ts:761-830` | `listFactorSiblings` and `visibleFactorScope`, the tenant predicate every factor read carries |
| `lib/db/schema.ts:730-765` | `activity_factor_mapping` — the table a suggestion ends at, unchanged by this prompt |
| `lib/domain/factor-selection.ts:1-50` | why the date rule is pure and separate, and the sentence naming this seam: "which is what keeps `resolveFactor` a parameter and keeps the seam AGENTS.md 5.3 sanctions a model for explicit" |
| `lib/domain/defra.ts:347-400` | `DEFAULT_FACTOR_MAPPINGS` and its "an unmapped pair is surfaced as unmatched, which is a legible gap, where a wrong default is an invisible error" |
| `app/activity/mappings/page.tsx:250-336` | the existing `method="get"` search form, its `q` param and the `FactorPicker` client leaf |
| `node_modules/ai/docs/03-ai-sdk-core/30-embeddings.mdx` | `embed`, `embedMany`, `maxParallelCalls`, `cosineSimilarity`, `usage.tokens`, `providerOptions` for dimension reduction |
| `node_modules/ai/dist/index.d.ts` | `rerankingModel` / rerank surface exists in `ai` 7.0.59 |
| `node_modules/drizzle-orm/pg-core/columns/vector_extension/vector.js` | Drizzle ships a `vector` column type |

**Live sources, fetched 14 Aug 2026** (§12 rule 7 — none of these may be
recalled at execution; re-fetch and record what they say on the day):

- `https://ai-gateway.vercel.sh/v1/models` — embedding models available:
  `openai/text-embedding-3-small` ($0.02 / M input tokens),
  `openai/text-embedding-3-large` ($0.13), `cohere/embed-v4.0` ($0.12),
  `google/gemini-embedding-001` ($0.15), plus alibaba, amazon, mistral and
  perplexity families. Rerank models available: `cohere/rerank-v3.5`,
  `cohere/rerank-v4-fast`, `cohere/rerank-v4-pro`, `voyage/rerank-2.5`,
  `voyage/rerank-2.5-lite`.
- The project's own Neon database, over `DATABASE_URL_UNPOOLED`:
  `select name, default_version, installed_version from pg_available_extensions
  where name in ('vector','pg_trgm')` returns
  `vector 0.8.0 / installed_version null` and `pg_trgm 1.6 / null`.
  **pgvector is available on this free-plan database and is not yet
  installed.** This is a measurement, taken 14 Aug 2026, not an assumption.

---

## What gets built

### The model, and what crosses to it

**`openai/text-embedding-3-small`, 1536 dimensions.** The choice is a
**judgement, not a measurement** (§12 rule 4): the task is short-label
similarity over publisher description columns, not reasoning, and this model is
**6.5× cheaper than the next candidate** on the live list above. Re-read that
list at execution and record the price on the day.

At execution, **verify the model's native dimension count from
`node_modules/@ai-sdk/*` or the provider docs rather than trusting the 1536 in
this file** — the `vector(N)` column and every stored row depend on it, and a
wrong N is a migration to redo. If `providerOptions` dimension reduction is
used, the reduced N is what the column takes and the reason goes in the record.

**What crosses to the provider, and what must not:**

| crosses | never crosses |
| --- | --- |
| the publisher's own `level2` / `level3` / `column_text` label strings from **published** factor sets — public DESNZ data, already on the page | any label from a **customer-supplied** factor set (see the decision below) |
| the search string a reporter **deliberately typed into the search box** | any `activity_record.description`, any `activity_import_row.raw`, any uploaded CSV body |
| — | a site name, a personal name, an email address, an organisation id, a user id, a session, or any secret |

**Customer-supplied factor labels are not embedded, and this is a decision with
a reason** (§5.3: "Never send a tenant's raw activity data to a third-party
model without an explicit recorded decision"). A customer's own factor set is
that customer's commercial data. Those rows stay in the result list — reached
by the existing lexical predicate and keeping their existing precedence ahead of
published rows — they are simply not ranked by similarity. **Say so in the UI**;
a silently unranked row is the invisible error `defra.ts` warns about.

**Seeding the query from the organisation's unmatched import descriptions is a
non-goal**, for the same reason: it would send tenant activity data to a third
party as a background effect of loading a page. A reporter pasting
"Diesel #2, 500 gal, Fleet ops" into the box is §5.3's own example and is a
deliberate human action; that is the supported path.

### The data

**A new table, `emission_factor_embedding`** — not a column on
`emission_factor`. Three reasons, all recorded:

1. An embedding is **model-versioned**. The table carries `model` and
   `dimensions`, so re-embedding under a different model is an insert, not a
   destructive rewrite of the factor rows that decide filed figures.
2. `emission_factor` rows are written by the seeder from a publisher CSV;
   keeping a derived, network-sourced value out of that shape keeps the seed
   idempotency argument intact.
3. It can be truncated and rebuilt without touching a single factor row.

Shape to author in `lib/db/schema.ts` (column types and the final DDL are
recorded in `docs/backend.md`, per §9's "column types, indexes and the
migrations themselves go in `docs/backend.md`, not here"):

- `id`, `factor_id` → `emission_factor.id` **`on delete cascade`** (derived data,
  unlike `activity_factor_mapping`'s deliberate `restrict`),
- `model` text, `dimensions` integer, `embedding vector(N)`,
- `source_text` text — exactly the string that was embedded, so a later reader
  can see what produced the vector without re-deriving it,
- `created_at`,
- a unique index on `(factor_id, model)`,
- an HNSW index on `embedding` with the cosine operator class.

**No organisation reference.** §9.2 rule 6's narrow exception covers
`emission_factor_set` and `emission_factor`; this table holds embeddings of
**published rows only** and inherits its scope from the join. **Every read still
joins through `emission_factor` → `emission_factor_set` and still applies
`visibleFactorScope(organizationId)`** — the predicate is the shared helper, not
a restatement of it, exactly as `listFactorSiblings` argues at
`lib/db/emission-queries.ts:761-765`.

**The migration must create the extension.** `drizzle-kit generate` writes the
table and indexes; it does **not** emit `CREATE EXTENSION`. Add
`CREATE EXTENSION IF NOT EXISTS vector;` **as the first statement of the
generated SQL file, by hand, before `db:migrate` runs** — an HNSW index on a
type the database does not have fails the apply. This is a trap; record it in
`docs/automation.md`. Migrations run over `DATABASE_URL_UNPOOLED` (§7.3).

### The backfill

**A new script, `db:embed:factors`**, written as
`dotenv -e .env.local -- tsx …` from the day it is added (§2 — only Next.js
auto-loads `.env.local`). It must be:

- **idempotent** — an already-embedded `(factor_id, model)` writes nothing, the
  same contract `db:seed:factors` holds;
- **published-only** — `emission_factor_set.organization_id is null`, and
  non-deleted, non-superseded, matching the seeder's predicates;
- **batched**, through `embedMany` with an explicit `maxParallelCalls`, so a
  17,482-row backfill is a bounded number of in-flight requests;
- **resumable** — a failure part-way leaves the rows already written in place
  and re-running continues;
- **silent about content** — it logs counts and token usage, never a label body
  and never a vector.

Report the **actual** row count, token usage from `usage.tokens`, wall-clock
time and computed cost at execution. The estimate from this file — roughly
17.5k rows and single-digit US cents — is a **prediction, not a measurement**,
and must be replaced by the real figures in the record (§12 rules 3 and 4).

### The ranking

Two stages, and the second degrades gracefully:

1. **Vector recall.** Embed the reporter's query through the gateway; ANN-search
   the embedding table for the pair's admissible candidates, under
   `searchFactorsForPair`'s existing five predicates — `visibleFactorScope`,
   both `deleted_at is null` checks, `superseded_by_set_id is null`,
   `result_unit = 'kg_co2e'` and `activity_unit in admissibleFactorUnits(unit)`.
   **Nothing may be offered here that `searchFactorsForPair` would not offer**;
   that sentence is already load-bearing at `emission-queries.ts:1544-1551` and
   this prompt must not make it false.
2. **Rerank.** The recalled set through a gateway reranking model, verified from
   `node_modules/ai` at execution. **If the rerank call fails or times out, the
   vector order stands and the result says which stage produced it** — never a
   thrown error, never a silently different ordering presented as the same
   thing.

**The scoring and banding rule is pure and goes in `lib/domain/`** —
`lib/domain/factor-match.ts`, with `factor-match.test.ts` beside it, inside
`npm test`'s scope (§6.2, §2). It takes scores and candidates as typed inputs
and returns the ordered, banded list. **No database handle, no `fetch`, no
implicit clock.** The gateway call and the vector query are its callers, not
its contents — the same split `factor-selection.ts:1-33` argues for itself.

**Where the gateway module lives:** `lib/matching/`, `server-only`, alongside
the precedent `lib/reporting/narrative.ts` set for step 13. §6.3's tree does not
list it and does not list `lib/reporting/` either; **this is an extension of that
tree recorded in `docs/backend.md`, not a new layer**, and it needs no edit to
`AGENTS.md`.

### What the reporter sees

§5.3's requirements, made concrete — a model's output is "a suggestion with a
confidence and a provenance, not a committed value", it is reviewable, and "a
low-confidence match is **surfaced, never silently accepted**":

- Suggestions are **labelled as suggestions** and carry a **confidence band**,
  not a bare float. The band thresholds are a **judgement** and must be recorded
  as one.
- **Nothing auto-maps.** The existing action path is unchanged: a mapping is
  written only when a person selects a row and submits. There is no
  "accept all", no default selection, and no pre-checked control.
- **A low-confidence result is shown with its band, saying plainly that no
  candidate matched well** — the legible gap `defra.ts` prefers over the
  invisible error.
- The **provenance line already on each row is kept** — source, dataset version,
  licence — and the suggestion adds *why it was ranked*, not a replacement for
  it.
- **The lexical search survives.** Semantic ranking is offered alongside, and a
  reporter who types an exact publisher string still gets the exact-substring
  behaviour they have today. If the gateway is unreachable, the picker falls
  back to today's ordering and **says so** — never an empty list presented as
  "no matches", which is §8.2 rule 4's silent-success failure wearing a
  different hat.
- Result and failure are both **announced, focus-managed, and legible without
  colour** (§8.2 rule 5). A confidence band that is only a colour is not a band.

### The trust boundary

- The picker's search stays a **`method="get"` form on an authenticated,
  organisation-scoped page**. Re-read the page's existing authorisation and
  membership resolution and **keep it exactly as it is** — do not add a
  test-only branch, do not parameterise a check.
- The query string is **validated with a Zod schema in `lib/validation/`**
  before it reaches the gateway: trimmed, length-capped (today's page caps at
  120 chars — keep or tighten, do not loosen), and rejected as a typed result
  rather than a throw (§10 rule 2).
- **Rate-limit the embedding call**, keyed by **user id** — this path is
  authenticated, so IP is the wrong key. `lib/rate-limit/` already exists;
  extend it rather than adding a second limiter. A rejected request returns
  retry timing and the picker falls back to lexical ordering.
- **BotID is not added.** These are §8.2's rules for *public* write paths; this
  is an authenticated read. State that reasoning in the record rather than
  leaving the absence unexplained.
- **No secret is echoed and no query body is logged** (§8.3 rule 2).

---

## Expected impact

### Prerender impact

**`none — no route changes`**, and it must be **verified, not assumed** (§8.1).
`/activity/mappings` is already an authenticated dynamic route. Run the full
procedure in `docs/automation.md` against `HEAD`:

- all 21 prerendered HTML files identical after normalising `BUILD_ID`, both
  chunk-name patterns and the flight-data scripts;
- **CSS byte delta 0** — the last recorded figure is 68,506 bytes
  (`docs/backend.md`, prompt 74). Quote the real number from the run.
- the same route table from `npm run build`: the marketing routes still `○`, the
  six articles and three job listings still `●`.

**The Tailwind prose trap applies to this file.** Prompt 74's record documents
it firing *from the prompt file itself*, and then firing again from the wording
of the explanation: Tailwind v4 scans `prompts/`, so an ordinary English word
that is also a utility token ships a rule to every marketing page. **Re-run the
diff after the documentation is written, not only after the code is** — a clean
result before the record is written is not a result.

### Other impact

- **A migration is generated** — the first since prompt 73's. `npm run
  db:generate` **is** run here, unlike prompt 74.
- **`package.json` gains one script**, `db:embed:factors`. §2's list is updated
  in the same change; that is the one edit `AGENTS.md` takes.
- **No new environment variable.** Authentication is the project's
  Vercel-managed OIDC token, exactly as `narrative.ts:52-64` records — verify at
  execution that the embedding path falls back to `getVercelOidcToken()` the
  same way `generateText` does, **and if it does not, stop and report it rather
  than inventing an `AI_GATEWAY_API_KEY`** (§12 rule 9). `.env.example` is
  expected to be unchanged.
- **No `NEXT_PUBLIC_*`.** Phase one needed none; this adds none.
- **No change to any filed figure.** `lib/domain/emissions.ts`,
  `lib/domain/factor-selection.ts`, `lib/domain/decimal.ts` and every existing
  `lib/domain/` test are untouched. `npm test`'s 210 tests must still pass, plus
  the new `factor-match.test.ts`.

---

## Non-goals

| not doing | why |
| --- | --- |
| **per-record description matching** — a `activity_record` → factor override, a review queue, recalculation on accept | the user's answer to question 1. It is §5.3's literal example but a materially larger build, it needs a new override table and a change to `factor-selection.ts`'s resolver, and it puts a model closer to the filed figure. Named as the obvious follow-up, not smuggled in |
| **any generation** | §5.3 sanctions embeddings + rerank at step 10 and generation only at step 13. No `generateText`, no `generateObject`, no structured extraction in this prompt |
| **auto-accepting any suggestion**, at any confidence | §5.3's hard rule. There is no threshold above which this becomes acceptable |
| **embedding customer-supplied factor labels** | the recorded decision above. If the user wants it later it is an explicit decision, which is exactly what §5.3 requires |
| **seeding the query from tenant import descriptions** | same reason; it would send tenant activity data as a page-load side effect |
| **step 9's CSV header mapping** (§5.3's other sanctioned surface) | a different step, a different technique (structured extraction), and a different prompt |
| **fixing prompt 74's finding 1**, the report not-found status | a real open defect with its own decision. Naming it here rather than folding it in |
| **chasing prompt 74's finding 2**, the one-off 500 | still not reproducible, still no trace |
| **a CI workflow**, **an E2E walk of `/submissions` and the staff/admin roles** | prompt 74's named follow-ups, unchanged |
| set-metadata editing, retiring a set from the UI, bulk CSV import, market-based scope 2, re-pointing existing mappings at a newer set | untouched prior deferrals |
| **any change to a marketing route, `SiteNav`, `SiteFooter`, or any GSAP surface** | §8.1 and the front matter's settled surfaces |
| relaxing, branching or parameterising any authorisation check | §11.2, and prompt 74's own non-goal |

---

## Checks to run (§2)

| check | expectation |
| --- | --- |
| `npm run db:generate` | one migration, with `CREATE EXTENSION IF NOT EXISTS vector;` added by hand as its first statement |
| `npm run db:migrate` | applies clean over `DATABASE_URL_UNPOOLED` |
| `npm run db:embed:factors` | real row count, token usage and wall-clock; then **run it a second time and confirm it writes nothing** |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 210 existing tests still passing, plus `factor-match.test.ts` |
| `npm run build` | same route table, same static page count |
| prerender diff per `docs/automation.md` | 0 of 21 differed, CSS delta 0 — re-run **after** the docs are written |
| `npm run test:e2e:local` | the existing suite unregressed. Quote the real output |
| `npm run test:e2e:webkit` | run it; **if Podman is absent on this machine, say so and report Chromium/Firefox only**, as prompts 71 and 74 did. Never claim a matrix that did not run |
| a manual pass on `/activity/mappings` | one good query, one nonsense query (the low-confidence band), and one with the gateway unreachable (the lexical fallback and its message) |

**Report the exact output of every command** (§2, §12 rule 3). A latency figure
must say whether the database was warm — Neon's scale-to-zero is on (§7.3).

---

## Where the result is recorded

**`docs/backend.md`**, a new section — **"AI factor matching, prompt 75"** —
placed with the other post-sequence prompt sections. It must record:

- the live model list as read **on the day**, the chosen embedding and rerank
  model ids, their prices, and the dimension count verified from the package;
- the pgvector availability reading, the extension trap, and the migration's
  contents;
- the table's column types, both indexes, and the tenant-scope argument;
- the confidence bands and their thresholds, **explicitly as judgements**;
- the backfill's **measured** row count, token usage, cost and wall-clock, and
  its idempotency readback;
- the customer-supplied-labels and tenant-description decisions, with reasoning,
  as the explicit recorded decisions §5.3 demands;
- the prerender diff, the trust boundary, and the secrets-and-data findings;
- **anything this file predicted that did not happen, corrected in place**
  (§12 rule 8) — the 1536 dimensions, the "no new environment variable", the
  cost estimate and the `getVercelOidcToken()` fallback are the four most likely
  to move.

**`docs/automation.md`** gets the mechanical steps this work has to work out by
hand (§3): the `CREATE EXTENSION` step `drizzle-kit generate` omits, and the
command for reading `pg_available_extensions` over the unpooled URL.

**`AGENTS.md`** gets **one edit and no more**: §2's script list gains
`db:embed:factors`. No index row (`docs/backend.md` exists and is indexed), and
no new invariant unless the run turns one up meeting the front matter's cap rule.

**Then commit to `main`, unprompted** (§1 step 10). Do not push.

---

## SKILLS USED

Every one of these must be **invoked at execution**, not merely listed — §4:
"listing is not loading", and a skill loaded while writing this prompt is not
loaded when the prompt runs.

- **`vercel:ai-sdk`** — `embed`, `embedMany`, `maxParallelCalls`,
  `cosineSimilarity`, `usage`, `providerOptions` dimension reduction, and the
  reranking surface. Its own standing instruction is that internal knowledge of
  this SDK is wrong and that model ids must be fetched live, never recalled.
  Loaded while writing this prompt; **load it again.**
- **`vercel:ai-gateway`** — model routing, provider failover, cost tracking, and
  the OIDC-token authentication path that keeps this change free of a new
  environment variable.
- **`neon-postgres`** — the pgvector extension on Neon, pooled vs direct
  (`DATABASE_URL_UNPOOLED` for the migration and the backfill), and
  scale-to-zero's effect on any latency figure quoted.
- **`drizzle-docs`** — the `vector` column type, index declaration, the
  `db:generate` → hand-edit → `db:migrate` workflow, and the ANN query. Also the
  project's own fixed Drizzle decisions.
- **`zod-docs`** — the search-query schema in `lib/validation/`, `safeParse`,
  and typed field errors rather than a throw.
- **`nextjs`** — Next 16 route and render behaviour, `searchParams` as a
  Promise, Server Components as the only initial-read path, and confirming no
  prerendered route changes mode.
- **`upstash-ratelimit-js`** — the limiter on the gateway call, keyed by user
  id, and what a rejection returns.
- **`upstash-redis-js`** — the client behind it; `lib/rate-limit/` already
  exists and is extended, not duplicated.
- **`better-auth-best-practices`** — reading the session server-side on the
  mapping page and resolving the active organisation, unchanged.
- **`organization-best-practices`** — membership and the tenant scope every
  factor read carries.
- **`tailwind-4-docs`** — the confidence-band and suggestion presentation is a
  styling change on an authenticated page, config-less v4, tokens in
  `@theme`. Also the authority on the prose-scanning behaviour behind the
  prerender trap above.
- **`frontend-design:frontend-design`** — the picker's suggestion presentation is
  design work under the front-matter rules, in the existing primitives from
  `app/_components/`, not scaffolding.
- **`vercel:env-vars`** — confirming no new variable is needed, and how the OIDC
  token is refreshed by `vercel env pull`.
- **`vercel:vercel-storage`** — Neon through the Marketplace, for the extension
  and connection questions.

**Not used, deliberately:** no `gsap-*` skill (§7.5 — GSAP is out of bounds in
backend UI, and the one granted exception is the demo dialog's close button);
no `figma:*` (no comp for this surface); no `resend` / `react-email` /
`email-best-practices` (no email path); no `vercel:vercel-firewall` (no public
write path added). There is **no Playwright skill installed** in this
environment — the API is verified from `node_modules/@playwright/test` and the
existing `playwright.config.ts`, not recalled (§12 rule 2).

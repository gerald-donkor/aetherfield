# 76 — Provider-free fuzzy factor matching

## Scope, and why it is next

Replace prompt 75's blocked AI Gateway embedding/rerank implementation with a
**provider-free PostgreSQL fuzzy matcher** on `/activity/mappings`, using
Neon's available `pg_trgm` extension and the existing factor-label columns.

This is next because prompt 75 reached the first embedding call and Vercel
refused it with: `AI Gateway requires a valid credit card on file to service
requests.` The user explicitly declined adding a card and requested a
completely free alternative. `pg_trgm` adds no provider, API credential,
model download, backfill, or per-query AI charge. It is fuzzy lexical matching,
not semantic understanding, and every UI and documentation line must say that
plainly.

This prompt supersedes prompt 75 before that prompt was committed. Prompt 75's
migration `0013_sour_epoch.sql` was already applied to the linked Neon database,
so it remains in migration history. No embedding row was written before the
gateway refusal. Execution must verify that zero-row fact before generating the
follow-up migration.

## Reference material read

- `AGENTS.md`, especially sections 5.3, 6.2, 7.2–7.5, 8.1, 9.2, 11.2 and 12.
- `prompts/75-ai-factor-matching.md`, including its trust boundary, picker
  requirements, and required checks.
- The current uncommitted prompt-75 implementation and migration 0013.
- `app/activity/mappings/page.tsx` and
  `app/_components/activity/factor-picker.tsx`.
- `lib/db/emission-queries.ts`, especially `searchFactorsForPair`,
  `visibleFactorScope`, and the five eligibility predicates.
- `lib/db/schema.ts`, `drizzle.config.ts`, `lib/rate-limit/index.ts`, and
  `lib/validation/activity.ts`.
- `docs/backend.md` prompt 74's deferral and prompt 75's source references.
- `docs/automation.md` migration, prerender, Tailwind prose-scan, and Neon
  readback procedures.
- PostgreSQL 17 `pg_trgm` documentation, fetched 14 Aug 2026:
  `https://www.postgresql.org/docs/17/pgtrgm.html`. It defines `similarity` as
  a zero-to-one character-trigram overlap measure and documents GIN/GiST index
  support.
- Hugging Face Transformers.js server-side documentation, fetched 14 Aug 2026:
  `https://huggingface.co/docs/transformers.js/main/tutorials/node`. It says a
  model downloads and caches on first use unless local files are supplied.
- Vercel Functions limits, fetched 14 Aug 2026:
  `https://vercel.com/docs/functions/limitations`. Function bundles include
  imported libraries/files, and active CPU and memory are billed resources.

## What gets built

### The honest product change

The picker keeps exact substring search and gains a second action labelled
**Find close wording**. It ranks eligible factors by PostgreSQL trigram
similarity over the publisher label assembled from `level_2`, `level_3`, and
`column_text`.

- Never call it AI, semantic search, an embedding, a rerank, or a confidence
  probability.
- Exact substring matches remain first in their existing deterministic order.
- Remaining fuzzy matches follow by descending trigram similarity with a
  deterministic factor-id tail.
- Customer-supplied labels participate locally under the same tenant scope.
  Nothing leaves Neon.
- Nothing auto-maps. The existing human selection and mapping action remain the
  only path that can change a filed figure.
- Weak results remain visible and are labelled as weak wording matches. A weak
  result never becomes a default or a checked control.

The pure scoring vocabulary remains in `lib/domain/factor-match.ts`, renamed
away from AI/provider stages. Its thresholds are judgements, not measurements,
and tests cover their boundaries, stable ordering, and score clamping.

### Database and migration recovery

1. Read `count(*)` from `emission_factor_embedding`. It must be zero. If not,
   stop rather than deleting derived rows without reporting them.
2. Remove `emissionFactorEmbedding` from the current schema and remove the
   abandoned backfill and gateway modules/scripts from the working tree.
3. Preserve migration 0013 because it is already applied and migration history
   is immutable.
4. Add a trigram GIN expression index over the exact factor-label expression
   used by the query. Verify the Drizzle index API from the current package and
   the local Drizzle snapshot before writing it.
5. Run `npm run db:generate` to produce migration 0014. Add
   `CREATE EXTENSION IF NOT EXISTS pg_trgm;` before any trigram index statement
   the generator emits. Migration 0014 also drops the unused, empty embedding
   table.
6. Do not drop the `vector` extension. It is installed and idle; removing a
   database extension is broader than this recovery needs. Record that fact.
7. Apply migration 0014 over `DATABASE_URL_UNPOOLED`, then read back the
   extension, table absence, and index definition. A clean migration exit alone
   is not evidence.

No factor backfill exists in the finished change, and `package.json` does not
gain `db:embed:factors`. Therefore `AGENTS.md` section 2 remains unchanged.

### Query and validation

- Keep `factorSearchSchema` in `lib/validation/activity.ts`: trimmed, at most
  120 characters, and a typed handled error for invalid input.
- Rename its mode from `semantic` to `fuzzy`; `lexical` remains the default.
- The Server Component continues to await `searchParams` and continues to call
  `requireOrganization` unchanged.
- Put the trigram query in `lib/db/emission-queries.ts`. No SQL or query builder
  call belongs in the page or client leaf.
- Apply all five existing eligibility predicates through the same shared
  helpers: tenant visibility; factor and set not deleted; set not superseded;
  `result_unit = kg_co2e`; activity unit admissible for the selected pair.
- Exact matching must retain the existing escaped `ILIKE` behavior.
- No Upstash limit is needed: this is an authenticated database read with no
  third-party call and no new marginal provider spend. Remove the abandoned
  factor-suggestion limiter added by the partial prompt-75 work.

### Presentation and accessibility

- Reuse the existing picker leaf and project primitives; add no design system.
- Label rows as `Exact text match`, `Close wording`, or `Weak wording match`.
- Explain that fuzzy ranking compares wording and can miss synonyms; the person
  must review source, dataset version, licence, unit, value, scope and gas.
- Preserve the existing provenance line.
- Search validation and outcome copy are announced and focus-managed, and the
  match label is text rather than colour alone.
- Remove all provider/privacy copy that says text is sent to AI, because no text
  leaves the database.

## Measurements and decisions

- `pg_trgm` availability was measured on 14 Aug 2026 as version 1.6 available
  and not installed. Read it again before migration and record the applied
  version afterwards.
- Similarity is measured by PostgreSQL's documented zero-to-one trigram score.
- The label-band thresholds are product judgements. Record their exact values
  as judgements after implementation.
- Measure one exact query, one misspelling/close-wording query, and one nonsense
  query against a warm database. Record latency and returned bands; do not call
  those fit measurements unless the thresholds are changed from those results.

## Expected impact

### Prerender impact

`none — no route changes`, verified rather than assumed. `/activity/mappings`
is already dynamic. After documentation is complete, compare all 21 shared
prerendered HTML files against `HEAD`, normalising the established build-id,
chunk-name, and flight-data patterns. CSS byte delta must be zero.

### Trust boundary

The browser supplies `category`, `unit`, `q`, and `mode` through the existing
authenticated GET form. Category and unit are narrowed against the existing
enums; the query/mode are parsed with the shared Zod schema. Better Auth's
session and the database membership row choose the organisation. The database
query applies the shared visible-factor predicate. Invalid input produces a
typed visible result; it does not throw. BotID is not used because this is an
authenticated read, not a public write.

### Secrets and data

No new environment variable and no `NEXT_PUBLIC_*`. The query reads the
existing pooled `DATABASE_URL`; migrations read the existing direct URL. The
search string, publisher labels, customer labels, user id, organisation id and
session are not transmitted to any new party. No request text or label is
logged. `.env.example` stays unchanged.

## Non-goals

- True semantic similarity, embeddings, transformer inference, reranking, or
  any model call. Those require either a paid/credentialed provider or a bundled
  model runtime with deployment and compute costs; neither is “completely free”.
- A direct Hugging Face, Cohere, Voyage, OpenAI, or other provider SDK.
- Local model downloads during a server request.
- Hand-authored synonym mappings presented as semantic understanding.
- Per-activity-record matching, auto-acceptance, recalculation changes, or any
  change to deterministic disclosure arithmetic.
- Any marketing route, `SiteNav`, `SiteFooter`, GSAP surface, report path, or
  other deferred backend item.

## Checks to run

- Read `emission_factor_embedding` count before recovery: exactly zero.
- `npm run db:generate`: migration 0014, creating `pg_trgm`, dropping the empty
  embedding table, and adding the trigram index.
- `npm run db:migrate`: applies successfully over the direct connection.
- Database readback: installed `pg_trgm` version, no embedding table, exact
  trigram index definition.
- `npm run lint`.
- `npm run typecheck`.
- `npm test`: 210 existing tests plus the revised factor-match tests.
- `npm run build`: unchanged marketing route modes and static-page count.
- Prerender diff after docs: 0 of 21 changed, CSS delta 0.
- `npm run test:e2e:local`.
- `npm run test:e2e:webkit`; if Podman is absent, report that exact limitation.
- Manual authenticated picker pass: exact wording, misspelling, nonsense, and
  invalid overlength input.

Report exact output for every command run.

## Documentation and commit

Add `docs/backend.md` section **Provider-free fuzzy factor matching, prompt
76**. Record the gateway refusal, the user's no-card decision, why the result is
not called semantic, migration 0013/0014 recovery, schema readback, scoring
judgements, trust/secrets findings, measured warm-query timings, all checks, and
remaining limitations.

Add the `pg_trgm` extension-before-index and readback procedure to
`docs/automation.md`. Do not edit `AGENTS.md`; no script or invariant changes in
the finished result. Commit the complete change to `main`; do not push.

## SKILLS USED

- **`neon-postgres`** — direct migration connection, extension availability,
  scale-to-zero, and honest warm/cold latency reporting.
- **`drizzle-docs`** — expression index declaration, generated migration
  workflow, and readback after apply.
- **`zod-docs`** — shared GET-query schema and handled validation result.
- **`nextjs`** — async `searchParams`, Server Component read ownership, and
  route-mode verification.
- **`upstash-ratelimit-js`** — verify that the abandoned paid-call limiter is
  removed rather than repurposed for a local authenticated read.
- **`upstash-redis-js`** — confirm the final path adds no new Redis key or
  client behavior.
- **`better-auth-best-practices`** — preserve the server-side session check.
- **`organization-best-practices`** — preserve membership-based tenant scope.
- **`tailwind-4-docs`** — picker-state presentation and the source-prose CSS
  scan trap.

No AI, Gateway, model-provider, email, storage, GSAP, or image skill applies to
the finished implementation.

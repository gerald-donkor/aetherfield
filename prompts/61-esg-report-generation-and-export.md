# 61 — ESG report generation and export

## Scope, and why it is next

**Build step 13 of AGENTS.md §5.2** — "ESG report generation and export." Steps
10, 11 and 12 are its declared dependencies and are committed as `60def3c`,
`b13bc02` and `f16e86f`. The repository now has tenant-scoped activity records,
stored emissions, targets/forecasting and an authenticated `/dashboard`
overview, but it has no `/reports` route, no report table, no report export and
no generated narrative.

This step adds an authenticated reporting workspace where a tenant can create a
report snapshot for the latest complete reporting period, review the
deterministic figures and provenance behind it, generate a draft narrative from
those already-computed figures, and export the result as a deterministic HTML
document. The report is a reviewed draft; nothing auto-files, auto-publishes or
emails it.

The hard constraint is AGENTS.md §5.3: **an LLM never produces a number that
appears in a disclosure.** Every figure in a report is read from stored
`activity_emission`, `activity_record`, factor-set and target evidence. The
model may draft prose over a bounded evidence package; it never calculates,
selects, rounds, forecasts or fills a missing number.

Resolved from files on disk and `git log`, not from prompt filenames and not
from AGENTS.md's plan alone (§12 rule 5).

## Reference material read for this prompt

Everything below was opened while writing this prompt. Re-open it at execution;
the prompt is not a substitute for current code (§12 rule 1).

| path / source | what governs this step |
| --- | --- |
| `AGENTS.md` | front-matter invariants; §§5–12; especially AI boundaries, tenant scoping, Server Action write path, static-site protection and anti-fabrication |
| `docs/backend.md`, "Step 10" | stored emissions, exact arithmetic, factor attribution, coverage gaps, provenance, and the explicit step-13 exclusion |
| `docs/backend.md`, "Step 11" | target table, projection/refusal semantics, target provenance and the explicit ESG-narrative exclusion |
| `docs/backend.md`, "Step 12" | `/dashboard` definitions, reporting window, dashboard evidence read, workspace nav, prerender/CSS verification, and the explicit reports exclusion |
| `docs/automation.md` | prerender HTML diff, CSS-rule diff, production screenshot/browser matrix procedure and known Tailwind scanner traps |
| `docs/skills.md` | installed-skill provenance and project-specific corrections to generic stack guidance |
| `lib/db/schema.ts` | tenant-scoped phase-two tables, `activity_record.import_id` / `import_row_id` provenance, `activity_emission` precision, `emission_target`, and the current absence of `report` |
| `lib/db/emission-queries.ts` | stored-emission reads, factor-set reads, uncalculated-count reads and the nullable reference-data tenant predicate |
| `lib/db/dashboard-queries.ts` | current page-facing tenant evidence aggregation and in-memory scale judgement |
| `lib/auth/tenant.ts`, `lib/auth/organization.ts` | action-side and page-side tenant resolution; no staff/admin bypass into tenant data |
| `lib/rate-limit/index.ts` | user-keyed authenticated limiters, lazy Upstash client, retry formatting and judgement-vs-measurement wording |
| `lib/domain/dashboard.ts`, `lib/domain/targets.ts`, `lib/domain/emissions.ts`, `lib/domain/decimal.ts` | reporting windows, exact totals, target projection, formatting seams and no-implicit-clock/no-I/O domain rules |
| `app/dashboard/page.tsx`, `app/_components/workspace-nav.tsx` | authenticated workspace layout, server-rendered nav, card/register vocabulary and no client chart dependency |
| `app/activity/actions.ts`, `app/targets/actions.ts` | existing authenticated Server Action stage order, typed results, rate-limit handling and `revalidatePath` usage |
| `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` | current Next 16 Server Function/Server Action model and direct POST reachability |
| `node_modules/next/dist/docs/01-app/02-guides/data-security.md` | Data Access Layer, server-only modules, DTO minimisation and client-boundary protection |
| `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md` | top-level `"use server"` files, action authorisation and return-value constraints |
| `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` | route handler API, async `params`, cookies/headers and named HTTP exports |
| Vercel AI Gateway docs, `https://vercel.com/docs/ai-gateway` | AI Gateway overview, AI SDK compatibility and unified `creator/model` model strings |
| Vercel AI Gateway authentication docs, `https://vercel.com/docs/ai-gateway/authentication-and-byok` | API-key/OIDC authentication modes; OIDC is the preferred Vercel path for this project |
| Vercel AI Gateway + AI SDK guide, `https://vercel.com/kb/guide/ai-gateway-and-ai-sdk` | current OIDC local-development flow and `generateText` shape; verify again at execution |

## SKILLS USED

- `nextjs` — App Router, Server Components, Server Actions, route handlers and Next 16 async/security traps.
- `next-best-practices` — RSC boundaries, route conventions, data patterns and error/loading route idioms.
- `next-cache-components` — revalidation/cache guidance; avoid `unstable_cache` and do not invent `use cache` behavior.
- `vercel-react-best-practices` — authenticated UI performance, server-side data fetching and client-boundary minimisation.
- `tailwind-4-docs` — Tailwind v4 implementation playbook and existing-token discipline.
- `drizzle-docs` — schema/table/migration workflow, Postgres enum/index/query guidance and project Drizzle decisions.
- `zod-docs` — shared validation schemas, `safeParse`, `z.flattenError` and typed action results.
- `neon` — Neon/Lakebase overview and the distinction between Postgres and beta AI Gateway capabilities.
- `neon-postgres` — pooled vs direct connection split, Drizzle-on-Postgres and scale-to-zero caveats.
- `better-auth-best-practices` — session/plugin baseline and Better Auth server/client boundaries.
- `better-auth-security-best-practices` — session, CSRF/origin and secure auth handling.
- `organization-best-practices` — tenant membership semantics and organisation-scoped access.
- `vercel-functions` — Node/Fluid runtime, route handler constraints and AI SDK warning surface.
- `env-vars` — Vercel env/OIDC behavior, no `NEXT_PUBLIC_*` secrets and `.env.local` pull caveats.
- `vercel-storage` — existing Vercel storage/provider guidance and serverless persistence constraints.
- `marketplace` — confirms AI has a dedicated skill path rather than Marketplace provisioning.
- `upstash-ratelimit-js` — authenticated report-generation rate limiting over the existing Upstash pattern.

**Required but missing in this session:** AGENTS.md §7.4 names `vercel:ai-sdk`
as the dedicated skill for AI Gateway/model selection, and the Neon overview
names `neon-ai-gateway` for Neon AI Gateway. Neither skill is installed in this
environment. Execution must install/load the appropriate AI Gateway / AI SDK
skill or fetch current official Vercel AI Gateway + AI SDK docs before writing
AI-backed code. If that verification cannot be completed, stop before code.

## Product definitions

### Report period

Use the same complete-month semantics step 12 records:

- the primary reporting period is the latest 12 complete UTC calendar months;
- the current partial month is excluded;
- the Server Component or action captures one `YYYY-MM-DD` clock value and
  passes it into pure report-domain functions;
- no domain module reads `Date.now()` implicitly.

The period must be stored on the report snapshot as explicit start/end dates.
A later recalculation must not silently move a report's period.

### Figures and provenance

A report snapshot stores or references:

- scope 1, scope 2 and scope 3 totals;
- biogenic and outside-of-scopes totals, separately;
- count of committed activity records included;
- count of committed records excluded because they have no calculated emission;
- factor source/version/licence/source URL used by the stored emissions;
- target evidence available at generation time, if any;
- a machine-readable evidence payload sufficient to render the report and check
  every figure in the narrative.

All numeric values are computed by existing deterministic domain functions over
stored `activity_emission` rows. They stay in kgCO2e internally and are rounded
once for presentation/export. Missing evidence is represented as a gap/refusal,
never as zero.

### Narrative

The narrative is AI-assisted prose only:

- Input to the model is a bounded, server-constructed evidence object containing
  already-computed figures, labels, period dates, caveats and provenance.
- The model is instructed not to invent, transform, interpolate, smooth, round
  or calculate figures.
- The model output is treated as a draft and validated before storage.
- Any numeric-looking token in the generated narrative must match an allowed
  rendered figure string or a known period/year from the evidence package. If it
  does not, reject the narrative and return a handled result.
- A rejected generation must leave the report's deterministic snapshot intact
  and visible. The user can still export a deterministic report without AI
  narrative.

Do not send raw uploaded CSV rows, row bodies, names, emails, CVs, session data
or unbounded tenant data to a model provider. Activity totals and factor
provenance are customer commercial data; keep the prompt minimal and record
exactly what leaves the app.

### Export

Export is a deterministic HTML document route, not a PDF renderer unless a
verified, platform-safe PDF path is explicitly approved during execution.

The export route renders from the stored report snapshot and validated narrative
only. It does not recalculate emissions, re-run a model, write a file to local
disk, or mint a permanent public URL. If a download affordance is added, use the
Web `Response` API from a named `GET` route handler and authorise server-side
before returning any tenant data.

## What to build

### 1. Report validation and pure domain derivations

Add `lib/validation/reports.ts` for shared report action schemas:

- report creation/generation input: period choice if needed, otherwise no
  browser-supplied period or organisation id;
- report id schema;
- typed result fields/messages following the existing `SubmitResult` pattern;
- narrative status values derived from constants, not re-declared in UI code.

Add `lib/domain/reports.ts` and `lib/domain/reports.test.ts`.

The pure module should:

- build report windows from caller-supplied `asOf`;
- aggregate stored emissions into a report evidence object using existing
  `ScopeTotals`/decimal helpers;
- create allowed presentation strings for every figure/year/date that a
  narrative may mention;
- validate generated narrative by rejecting numeric-looking content not in the
  allowlist;
- produce deterministic export sections and caveats when no narrative exists;
- contain no database handle, `fetch`, model SDK import, implicit clock or I/O.

Tests must cover:

- January rollover and leap-year complete-month boundaries;
- missing month / uncalculated records as caveats, not zero;
- biogenic and outside-of-scopes separation;
- exact kgCO2e → tCO2e presentation strings;
- narrative validation accepting allowed figures and rejecting invented figures,
  percentages, years and currency-like numbers;
- export payload generation without model output.

### 2. Report table and tenant-scoped queries

Extend `lib/db/schema.ts` with a strictly tenant-scoped `report` table. The
exact shape is an implementation decision, but it must satisfy these constraints:

- `id` uuid primary key;
- `organization_id` text not null references `organization.id` cascade;
- `created_by` text nullable references `user.id` set null;
- explicit `period_start` / `period_end` dates;
- lifecycle/status enum, declared once in validation and spread into `pgEnum`;
- deterministic evidence snapshot as text/JSON text with a schema-owned parser;
- narrative text nullable;
- narrative/model metadata sufficient for audit, without storing secrets or raw
  provider credentials;
- `created_at`, any lifecycle transition timestamps, and `deleted_at`;
- tenant-first indexes for listing and id lookup.

All reads/writes live in `lib/db/report-queries.ts` with `import "server-only"`.
No SQL outside `lib/db/`.

Required query functions:

- list reports for an organisation newest first;
- read one report by `(organizationId, reportId)` with no existence oracle for
  another tenant's id;
- create deterministic report snapshot from server-constructed evidence;
- update narrative/status only for the same tenant/report;
- soft-delete if a delete affordance is included. If delete is not included,
  state that as a non-goal.

Run `npm run db:generate`, `npm run db:migrate`, and read back
`information_schema`, enum values and indexes. Never hand-run `ALTER TABLE`.

### 3. Report evidence read

Add a report-facing data read. It may compose existing functions from
`lib/db/dashboard-queries.ts`, `lib/db/emission-queries.ts`,
`lib/db/target-queries.ts` and `lib/db/activity-queries.ts`, but report evidence
must have its own named query seam so the snapshot's definition is explicit.

Constraints:

- `requireOrganization("/reports")` on pages and `resolveTenant()` in actions
  must run before any tenant data read.
- The browser never supplies `organizationId`, totals, period boundaries,
  target ids or figures.
- Every customer-data query predicates on `organizationId`.
- Every activity read excludes soft-deleted activity.
- Numeric values leave Postgres as strings until parsed in the domain layer.
- Independent reads use `Promise.all` where safe.
- Nothing logs organisation names, report titles, figures, target names, row
  bodies or generated prose.

### 4. AI Gateway integration

Before writing this part, verify current API details from an installed
`vercel:ai-sdk`/AI Gateway skill or official Vercel/AI SDK docs fetched during
execution. Do not rely on this prompt's API examples if the docs have moved.

Expected direction, subject to verification:

- use the Vercel AI SDK package rather than a direct provider SDK;
- authenticate through Vercel AI Gateway OIDC where possible;
- no direct OpenAI/Anthropic/etc. provider API key is introduced unless the user
  explicitly approves a documented deviation;
- no model id is hard-coded from memory. Choose a current model only after
  checking available models/cost/limits, and record the date/source in
  `docs/backend.md`;
- keep the model call server-only, in a small `lib/reporting/` or
  `lib/ai/` module with `import "server-only"`;
- cap input/output length and timeout defensively;
- return handled failure states, never a thrown expected generation error.

If AI Gateway is unavailable locally because `VERCEL_OIDC_TOKEN` is absent or
expired, run `vercel env pull .env.local --yes` only with user-approved access.
If provider/model selection or authentication cannot be verified, implement only
the deterministic snapshot/export after stopping for user direction; do not
substitute a mock model or placeholder prose.

### 5. Actions and rate limiting

Add `app/reports/actions.ts` with top-level `"use server"` if client leaves
invoke it.

Actions:

- create report snapshot;
- generate/regenerate narrative for an existing report;
- optionally soft-delete report if the UI includes removal.

Stage order for authenticated paths:

1. resolve tenant/session server-side;
2. consume a new report limiter keyed by user id;
3. parse with the shared Zod schema;
4. tenant-predicated read/write through `lib/db/`;
5. model call only after deterministic evidence snapshot exists;
6. validate narrative output before storage;
7. `revalidatePath("/reports")` and the report detail path as needed;
8. return typed results.

Add a named limiter to `lib/rate-limit/index.ts`, not a reuse of activity or
target buckets. A reasonable starting judgement is:

- report snapshot writes: 20 per user per hour;
- AI narrative generations: 10 per user per hour.

These are judgements, not measurements. Record the reasoning in the constant
docblocks and in `docs/backend.md`.

### 6. UI routes

Add:

- `app/reports/page.tsx` — authenticated Server Component list/create surface;
- `app/reports/[reportId]/page.tsx` — authenticated Server Component detail;
- `app/reports/[reportId]/export/route.ts` — authorised deterministic HTML
  export, if export is implemented as a route handler;
- `app/reports/loading.tsx`, `app/reports/error.tsx` and nested loading/error
  files where useful;
- `app/_components/reports/*` client leaves only for forms/buttons that need
  pending state.

Update `app/_components/workspace-nav.tsx` to add:

- Reports → `/reports`

Do not touch `SiteNav`, `SiteFooter`, `NAV_ITEMS` or marketing routes.
No `home/` imports, no chart package, no GSAP and no root provider.

The `/reports` UI must show:

- reporting period;
- deterministic scope totals and caveats;
- factor/source attribution;
- target snapshot if present;
- narrative status (`not generated`, `generated`, `rejected/failed`) in plain
  language;
- an export link/button only when a deterministic snapshot exists.

Every generated narrative is labelled draft. Every figure in visible narrative
must be traceable to the evidence shown on the page.

### 7. Proxy and route protection

Add only the enumerated optimistic matcher for `/reports/:path*` to `proxy.ts`.
Do not widen the matcher to catch marketing routes. The real enforcement stays
inside pages/actions/route handlers via Better Auth session and current
organisation membership.

Add E2E coverage for signed-out `/reports` redirect with the encoded callback,
following the existing `/dashboard` test style.

## Prerender impact

Expected: **none for every existing prerendered route**.

This step adds authenticated dynamic report routes only:

- `/reports`
- `/reports/[reportId]`
- `/reports/[reportId]/export` if implemented as a route handler

No existing Static or SSG marketing route may change render mode or HTML. Verify
with `npm run build` and the `docs/automation.md` isolated prerender comparison:
normalise build id/chunk names, strip RSC flight scripts as documented, and
report the exact count of changed prerendered HTML files. Expected result:
`0 of 21 differed`, unless an earlier committed route count has legitimately
changed; if so, state the new count and why.

CSS may grow because Tailwind v4 emits a single app-wide stylesheet. Report CSS
bytes and rule-level additions/removals, and confirm every added rule traces to
authenticated report markup. Watch for prose/class-name scanner leaks.

## Trust boundary

Browser to server:

- report create/generate/delete requests carry only action fields such as report
  id or an action intent;
- they do **not** carry organisation id, totals, period dates, evidence payload,
  generated narrative to trust, model id, or provider credentials.

Server validation/authorisation:

- pages call `requireOrganization("/reports")` before tenant reads;
- actions call `resolveTenant()` and return typed handled failures for signed
  out/no organisation/failure states;
- schemas in `lib/validation/reports.ts` validate every browser-supplied field;
- every DB read/write predicates on the resolved organisation id;
- route handler export authorises the session and membership before returning
  any tenant data.

Rejected requests return typed form/action results or appropriate HTTP status
for the export route. They never reveal whether another tenant's report id
exists.

Model boundary:

- only the server-constructed evidence DTO crosses to AI Gateway;
- no raw activity rows, uploaded CSV bodies, names, emails, sessions, secrets or
  unbounded tenant records cross to the model;
- model output is untrusted until narrative validation passes.

## Secrets and data

Expected new environment variables:

- none if Vercel AI Gateway OIDC is used (`VERCEL_OIDC_TOKEN` is Vercel-managed
  and should not be added to `.env.example`);
- if official docs require a project variable such as `AI_GATEWAY_API_KEY`, stop
  and ask before adding it, because AGENTS.md §8.4 currently expects no
  `NEXT_PUBLIC_*` and no direct provider keys for phase two AI.

No `NEXT_PUBLIC_*` variable is expected.

Existing server-only variables still read:

- `DATABASE_URL` for runtime DB access;
- `DATABASE_URL_UNPOOLED` for Drizzle migration/readback;
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` for rate limiting;
- Vercel-managed OIDC token if AI Gateway uses it.

Data stored:

- report snapshot and narrative are tenant-scoped commercial data;
- created-by user id is attribution, not public display identity;
- generated narrative and evidence payload may contain customer emissions
  figures and must not be logged;
- no email, Blob write or public URL is expected.

## Non-goals

| not done | why |
| --- | --- |
| automatic filing, publishing or emailing | this step creates reviewed drafts and exports only |
| PDF generation | requires a verified platform-safe renderer and may change runtime/storage shape; deterministic HTML export is enough unless explicitly approved |
| scheduled reports, alerts or threshold emails | step 14 |
| changing the emissions engine, factor mappings or target formulas | steps 10–12 own those definitions; reports consume stored evidence |
| market-based scope 2, SBTi validation or framework-specific filing rules | no verified methodology has been read for this step |
| raw CSV row inclusion in model prompts | customer commercial data; prose only needs aggregate evidence |
| second design system, chart dependency, GSAP or imports from `home/` | violates settled bundle/design constraints |
| staff/admin access to tenant reports | tenant membership remains the only tenant-data authority |

## Checks to run

Run and quote exact output:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run db:generate`
5. `npm run db:migrate`
6. database readback for the new report table, enum values, indexes and foreign
   keys over the direct connection
7. `npm run build`, including route table
8. isolated prerender HTML diff per `docs/automation.md`
9. CSS byte/rule diff per `docs/automation.md`
10. report-domain focused tests showing narrative-number rejection
11. authenticated browser matrix for `/reports`:
    - signed-out redirect with exact callback;
    - signed-in without organisation redirects/handles as current workspace
      pattern requires;
    - tenant member can create a deterministic report;
    - another tenant cannot read/export it;
    - forged session cookie is rejected by page enforcement;
    - generated narrative containing an invented figure is rejected in a
      controlled test seam;
    - export route returns deterministic HTML and never recalculates/model-calls.
12. `npm run test:e2e` and report the known WebKit/Podman environment gap if it
    recurs.

If AI Gateway is exercised in tests, use a deterministic test seam rather than a
live model in the default test suite. A live model smoke test may be run
manually only after current docs, auth and cost/limit behavior are verified and
recorded.

## Recording the result

Record implementation details in `docs/backend.md`, under a new "Step 13 — ESG
report generation and export" section:

- AI Gateway / AI SDK verification sources and date;
- chosen model/provider and why, or the reason deterministic-only fallback was
  approved;
- exact report table columns, enum values, indexes, migration file and readback;
- rate-limit numbers labelled as judgements;
- trust boundary and model prompt/output validation;
- route table, prerender diff, CSS diff and browser matrix;
- secrets/env findings, including whether OIDC required no committed env var;
- what was deliberately not built.

Do not record completion in `AGENTS.md` except for a genuinely new site-wide
invariant or index row that meets the cap rule.

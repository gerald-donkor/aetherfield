# 60 — Authenticated dashboard routes

## Scope, and why it is next

**Build step 12 of AGENTS.md §5.2** — "The dashboard routes: behind auth, the
four-verb loop made real." Steps 10 and 11 are its declared dependencies and
are committed as `60def3c` and `b13bc02`. The repository contains the
authenticated `/activity` and `/targets` workspaces, exact stored emissions,
and target forecasting, but it contains no authenticated product dashboard;
`app/_components/home/dashboard.tsx` is still only a marketing illustration.

This step adds one new authenticated overview route, **`/dashboard`**, and
makes `/dashboard`, `/activity`, and `/targets` read as one product workspace.
Those three routes are the "dashboard routes" in this step. Do not invent a
parallel `/dashboard/activity` hierarchy or move the two established routes.

The four verbs become real as an overview of evidence and existing actions:

| verb | dashboard meaning in this step |
| --- | --- |
| **Track** | calculated emissions, recorded energy, the latest complete-month window, and visible calculation gaps |
| **Model** | the nearest active absolute target and its existing, labelled run-rate projection |
| **Report** | disclosure readiness: what is calculated, what is missing, and the provenance already stored; **not** report generation |
| **Act** | deterministic links to the next known corrective action — import data, resolve a calculation gap, or set/review a target |

This is deliberately one overview, not four new feature routes. Step 13 still
owns ESG report generation/export and step 14 still owns scheduled
recalculation, thresholds, alerts, and email. No placeholder `/reports` route,
disabled control, or fake alert is permitted.

Resolved from files on disk and `git log`, not from the existence of prompt 59
and not from AGENTS.md's plan alone (§12 rule 5).

## Reference material read for this prompt

Everything below was opened while writing this prompt. Re-open it at execution;
the prompt is not a substitute for current code (§12 rule 1).

| path | what governs this step |
| --- | --- |
| `AGENTS.md` | the front-matter invariants; §§5–12; especially the four-verb product intent, pure-domain rule, tenant scoping, static-site protection, and anti-fabrication rules |
| `docs/backend.md`, "Step 10" | persisted emissions, exact calculation, attribution, coverage gaps, current checks and deliberate dashboard exclusion |
| `docs/backend.md`, "Step 11" | target semantics, projection/refusal states, current 0-row measured database state, route modes, and deliberate dashboard exclusion |
| `docs/automation.md` | isolated prerender diff, CSS-rule diff, production screenshots, port isolation, and the Playwright matrix |
| `docs/skills.md` | installed-skill provenance and the project-specific corrections to generic Next/Neon guidance |
| `app/_components/home/dashboard.tsx` | product intent only: tCO2e, recorded energy with comparison, target reading, and an emissions trend; **not a comp and not reusable dashboard code** |
| `app/_components/home/emissions-chart.tsx` | proof that the marketing chart is a `home/` client/GSAP surface and therefore forbidden to import here |
| `app/activity/page.tsx` | authenticated-page typography, spacing, read parallelism, links, empty states, and Server Component data pattern |
| `app/targets/page.tsx` | tenant gate, target/evidence read, caller-supplied clock, and target presentation contract |
| `app/_components/activity/emissions-summary.tsx` | scope totals, tCO2e presentation, provenance, and incomplete-calculation caveat |
| `app/_components/targets/target-card.tsx` | projection basis/window, target reading, baseline caveat, and refusal copy |
| `app/targets/loading.tsx`, `app/targets/error.tsx` | loading and unexpected-error idiom for a tenant route |
| `lib/auth/organization.ts`, `lib/auth/tenant.ts` | database-backed page gate and action-side tenant resolution; staff roles grant no tenant access |
| `lib/db/emission-queries.ts` | `listActivityInputs`, `listEmissions`, `countUncalculatedRecords`, `listFactorSets`, and their tenant predicates |
| `lib/db/target-queries.ts` | `listTargets`, `readTargetEvidence`, and the current in-memory evidence boundary |
| `lib/db/activity-queries.ts`, `lib/db/schema.ts` | activity record fields, tenant/date/category indexes, soft-delete predicate, numeric quantity, and current query ownership |
| `lib/domain/decimal.ts` | exact decimal operations, caller-declared division/rounding, and presentation formatting |
| `lib/domain/emissions.ts` | exact unit conversion, `ScopeTotals`, `totalsOf`, `totalsByPeriod`, and `monthOf` |
| `lib/domain/targets.ts` | pure target selection inputs, trajectory, projection, and typed refusals |
| `lib/validation/activity.ts` | the only energy units the product records: `kWh` and `MWh`; category vocabulary |
| `proxy.ts` | enumerated optimistic matchers; `/dashboard/:path*` must be added without widening the matcher |
| `e2e/home.spec.ts`, `playwright.config.ts` | current signed-out route test and the three-browser production matrix |
| `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` | current Next 16 Server Component reads, parallel fetching, loading UI, and streaming guidance |
| `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` | current `error.tsx` contract and expected-versus-uncaught errors |
| `node_modules/next/dist/docs/01-app/02-guides/authentication.md` | current Next 16 authentication/authorization boundary guidance |

## Product definitions — settle the numbers before drawing them

The marketing panel's values are traced artwork. **Do not copy `192,000`,
`583.7`, `12.4%`, `16%`, its 33 bars, or "Acme Inc".** The new route reads only
the active organisation's stored data.

### Reporting window

Use a caller-supplied UTC calendar date, captured once in the Server Component
and passed down as `YYYY-MM-DD`. A **complete month** has the definition step 11
already established: a calendar month strictly earlier than the month
containing `asOf`.

- The primary period is the latest 12 complete calendar months.
- The comparison period is the 12 complete months immediately before it.
- Both boundaries must be rendered in words or `YYYY-MM`; a rolling value with
  no visible period is not evidence-first.
- Do not use an implicit `Date.now()` inside `lib/domain/`.
- A missing month is **missing**, not measured zero. The trend renders a gap and
  its accessible data says no calculated record exists for that month.

### Emissions

- Sum only stored `activity_emission` figures through the existing exact domain
  functions. Never recalculate factors on page render.
- The headline is the latest-12-complete-month total in **tCO2e**, rounded once
  for presentation with half-even rounding.
- Scope 1, 2, and 3 stay visible as the breakdown. Biogenic and
  outside-of-scopes figures stay separate and never enter the total.
- If any committed record has no calculated emission, show the count beside
  every affected total/trend. Do not call the figure complete.
- With no stored emissions, render an explicit empty state and link to
  `/activity`; never render `0 tCO2e` as if zero were measured.

### Recorded energy

"Energy consumption" means only committed activity records whose unit is
`kWh` or `MWh` and whose category is `electricity` or `heat`. This is a
deliberately narrow, mechanically convertible definition. Litres of fuel,
cubic metres of gas, and any factor-derived energy value are not silently
converted into this card.

- Convert `kWh` and `MWh` to MWh exactly by a power-of-ten scale shift; do not
  use JavaScript `Number` on the value path.
- Sum the primary and comparison windows separately.
- Label the result **recorded energy**. The schema has no completeness model for
  meter coverage, so the dashboard may not call it whole-estate consumption.
- Show a signed period-over-period percentage only when both windows contain at
  least one eligible record and the comparison total is non-zero. Division
  names its scale and half-even mode at the call site.
- Otherwise return and render a typed reason: no current-window readings, no
  comparison-window readings, or a zero comparison denominator. Never turn a
  refusal into `0%`, `Infinity`, or an omitted label.

### Target and forecast

Choose the dashboard target deterministically from targets the organisation may
read:

1. active targets only;
2. target year not elapsed relative to `asOf`;
3. earliest target year first;
4. newest `createdAt` as the tie-breaker;
5. stable id order as the final tie-breaker.

If none qualifies, render "No active future target" and link to `/targets`.
For the chosen target, use the existing `targetFigure`, `projectTargetYear`, and
`readingAgainstTarget` definitions unchanged. Render target name, coverage,
year, projection basis/window, signed direction, and every existing refusal.
A projection is always labelled as a projection. Do not duplicate the target
engine or simplify its caveats for a card.

### Report readiness and actions

Report readiness is a factual summary of existing evidence, not a report:

- committed activity-record count;
- calculated-emission count and uncalculated count;
- the stored factor-set source/version/licence attribution already available;
- whether at least one active future target exists.

The action list is a pure deterministic priority list over those facts:

1. no activity records → import activity data;
2. uncalculated records → review activity calculations/mappings;
3. no active future target → set a target;
4. chosen projection is off target → review the target and its activity trend;
5. otherwise → continue reviewing current evidence.

Each action is ordinary operational copy plus a real link to `/activity` or
`/targets`. No recommendation is generated, no score is invented, and nothing
is written to the database.

## What to build

### 1. Pure dashboard derivations — `lib/domain/dashboard.ts`

Add a pure, independently testable module. It has no database handle, `fetch`,
implicit clock, or I/O.

- Define the 12-month primary/comparison window from caller-supplied `asOf`.
- Accept the small plain-object shapes it needs; do not import `lib/db/`.
- Build a 12-slot emissions trend whose missing months remain `null`/missing.
- Sum exact latest-window scope totals using the existing emissions helpers.
- Convert eligible recorded energy into MWh and compute the comparison with
  explicit scale/mode and typed refusals.
- Select the dashboard target with the ordering above.
- Produce the deterministic action list from an explicit input object.
- Keep numeric values as `Decimal` until presentation. A bounded integer or
  string used only for bar geometry may be derived at the final presentation
  seam, but it must not become a second arithmetic engine.

Add `lib/domain/dashboard.test.ts`. Cover at least:

- UTC month boundaries including January rollover and leap-year February;
- omission of the current partial month;
- missing month versus a present zero-valued month;
- exact `kWh`/`MWh` conversion and exclusion of every other category/unit;
- positive, negative, zero, unavailable, and zero-denominator energy deltas;
- active-target ordering and all tie-breakers;
- no-target, no-activity, calculation-gap, off-target, and current-evidence
  action priorities;
- no `Number` conversion on arithmetic inputs.

Do not change `lib/domain/emissions.ts`'s engine version: this step presents
stored results and does not change how one is calculated.

### 2. Tenant-scoped dashboard read — `lib/db/dashboard-queries.ts`

Add `import "server-only"`. Expose one page-facing
`readDashboardEvidence(organizationId)` which composes existing reads and only
adds the narrow raw-energy read the dashboard lacks.

- Every query takes and predicates on `organizationId`.
- Every activity read excludes `deletedAt` rows.
- Select only fields the domain derivation needs.
- Keep `numeric` values as strings out of Postgres.
- Parallelise independent reads with `Promise.all`.
- Reuse `listEmissions`, `countUncalculatedRecords`, `listTargets`,
  `countActivityRecords`, and `listFactorSets` where their existing contract is
  correct. Do not build a second definition of scope totals in SQL.
- The energy query may read `activity_record` directly here because query
  construction belongs under `lib/db/`; filter to the approved categories and
  units in the query as well as defensively in the pure function.
- Do not log organisation names, figures, target names, row bodies, or counts.

**No schema or migration is expected.** If implementation discovers that a
schema change is necessary, stop and ask; do not smuggle a migration into a
dashboard presentation step.

The existing all-emissions in-memory read is still a judgement, not a measured
production-scale limit. Record that explicitly. Do not introduce a second SQL
aggregation merely to look optimized before real tenant volume exists.

### 3. Shared authenticated-workspace navigation

Add a server-renderable, component-only navigation component under
`app/_components/` for exactly these destinations:

- Overview → `/dashboard`
- Activity → `/activity`
- Targets → `/targets`

It takes the current destination as a serializable prop, exposes the active
page with `aria-current="page"`, works without JavaScript, wraps safely on a
375px viewport, and uses the existing type/color/focus vocabulary. It is not a
replacement `SiteNav`, not a root provider, and not a new design system.

Render it on `/dashboard`, `/activity`, and `/targets`. Remove the now-redundant
reciprocal one-off links between activity and targets. Do not touch
`NAV_ITEMS`, `SiteNav` styling, `SiteFooter`, or marketing chrome.

### 4. The `/dashboard` route

Add:

- `app/dashboard/page.tsx`
- `app/dashboard/loading.tsx`
- `app/dashboard/error.tsx`
- server-renderable components under `app/_components/dashboard/` only where
  extracting them makes the page clearer

`page.tsx` is a Server Component and calls
`requireOrganization("/dashboard")` before reading any tenant data. Capture
`asOf` once, then read evidence and derive the view. Initial data never comes
through a Route Handler or client fetch.

The visible order is:

1. product workspace navigation;
2. organisation-aware heading and explicit reporting-window label;
3. three primary cards: latest emissions, recorded energy, chosen target;
4. the 12-complete-month emissions trend;
5. the four-verb evidence/action section.

The marketing illustration is intent, not layout. Build a real responsive page
in the authenticated-route language:

- 375px: one column, no clipped labels, no page-level horizontal scrolling;
- 768px: cards may form two columns where content allows;
- 1280/1440px: three primary cards, with the trend and evidence sections using
  the full readable page width;
- figures use tabular numerals and units remain attached to their values;
- card labels and caveats remain legible without colour;
- focus order follows visual order;
- the chart has an accessible heading and textual list/table of all 12 monthly
  values and gaps; the visual bars alone are `aria-hidden`;
- a flat series, one populated month, all-zero present series, all-missing
  series, and very large values all render honestly.

Use a server-rendered HTML/CSS or SVG chart with no runtime interaction. There
is no GSAP in backend UI, no chart package, and no import from `home/` or
`motion/`. Do not turn the route into a client component to draw bars.

`loading.tsx` and `error.tsx` follow the existing target-route idiom. The error
boundary must reveal no partial tenant figures. Copy remains operational and
evidence-first.

### 5. Auth matcher and route integration

- Add exactly `"/dashboard/:path*"` to `proxy.ts`'s enumerated matcher.
- Keep proxy optimistic only. The page's database-backed
  `requireOrganization` call is the enforcement.
- A forged/stale cookie must still reach the page check and be rejected.
- Staff/admin status alone grants no tenant read. Only a current organisation
  membership does.
- Do not widen the matcher to marketing paths.

### 6. Tests and browser verification

Extend `e2e/home.spec.ts` with a signed-out `/dashboard` redirect assertion,
including the exact callback URL. Keep the test independent of database fixture
state.

For the authenticated surface, create a **temporary synthetic fixture** using
the same disposable practice already recorded in `docs/backend.md`: synthetic
account, organisation/membership, committed activity across both 12-month
windows, calculated emissions, and an active target. Exercise these visible
states in a production browser:

- complete dashboard with positive/negative comparison and a target reading;
- uncalculated-record caveat;
- no target;
- no activity;
- missing month rendered as a gap, not zero;
- tenant isolation (a second organisation's rows never appear);
- forged/stale session rejection.

Delete every synthetic row afterwards and verify the cleanup. Do not print the
synthetic password, session token, real environment values, tenant figures, or
personal data. Temporary helper scripts belong under `/tmp` and are removed
after use.

Use `agent-browser` if its executable is installed, loading
`agent-browser skills get core` before the first command. If it is unavailable,
state that and use the repository's pinned Playwright dependency; do not claim
an agent-browser run. Capture production screenshots at device scale 1 after
`document.fonts.ready` at **375×812, 800×1000, and 1280×960**. These viewport
sizes follow `docs/automation.md`; they are a verification procedure, not comp
measurements.

At each width verify:

- document `scrollWidth === clientWidth`;
- workspace nav is visible and wraps without overlap;
- card order and accessible headings match the visible order;
- every unit, period, projection label, and caveat is present;
- no value is clipped at 200% text zoom;
- keyboard focus reaches every workspace/action link visibly;
- no marketing animation or client chart bundle is loaded by `/dashboard`.

## Measurement and comparison procedure

There is no dashboard comp. Say **judged** for the layout and copy. The
marketing panel determines only the four data ideas named above.

1. Record the current CSS chunk size and rule set from committed `b13bc02`.
2. Build the implementation and compare rule-level additions. Every added rule
   must trace to authenticated dashboard/workspace markup; watch Tailwind v4's
   prose-candidate leak documented in `docs/automation.md`.
3. Use the three production screenshots above to record card column count,
   page overflow, nav wrapping, and the chart's empty/gap/extreme states.
4. Build isolated baseline and implementation copies with the same unprinted,
   unwritten `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, excluding `.agents/` and
   `.claude/` from both trees.
5. Normalize only the documented build ID and CSS/JS chunk names and strip RSC
   flight scripts as `docs/automation.md` specifies.
6. Compare all 21 prerendered HTML files. Expected result: **0 differ**.

Do not quote a page-wide image metric for `/`, `/journal`, or `/careers`; this
step has no reason to image-diff those phase-sensitive surfaces.

## Expected impact

- One new dynamic authenticated route: `/dashboard`.
- `/activity` and `/targets` gain only the shared workspace navigation and lose
  their reciprocal one-off links.
- `proxy.ts` gains one explicit matcher.
- No existing route changes render mode.
- The 21 prerendered marketing HTML files stay byte-identical after the
  documented normalization.
- Global CSS may grow only by rules used by the new authenticated UI; measure
  and report the exact byte/rule delta.
- No new browser data-fetching library, chart dependency, provider, environment
  variable, database table, index, migration, API route, Server Action, or
  email.

## Prerender impact

**None expected, and it must be verified rather than assumed.** `/dashboard`,
`/activity`, and `/targets` are dynamic authenticated routes. The route table
must add `/dashboard` as Dynamic and preserve every Static/SSG classification.
The isolated HTML comparison must report the exact file count and differences.

## Trust boundary

This is a read-only request path. The browser sends navigation, request headers,
and Better Auth's session cookie. It sends **no organisation id, target id,
date window, total, projection, or chart value**.

`requireOrganization("/dashboard")` validates the session and re-reads current
membership from Postgres. Its returned organisation id is the only tenant key
passed to `readDashboardEvidence`; every query predicates on it. A signed-out
request redirects to `/sign-in?callbackURL=%2Fdashboard`. A signed-in request
with no resolvable organisation goes to `/account`. A forged or stale cookie
never authorises a read. There is no mutation and therefore no Server Action,
input schema, rate limit, BotID check, or write result in this step.

## Secrets and data

- Reads the existing server-only `DATABASE_URL` through `lib/db/client.ts`.
- Better Auth reads the existing `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` on its
  existing session path; this step does not add or expose them.
- No new environment variables and no `NEXT_PUBLIC_*` variables.
- Activity, emissions, targets, and organisation membership are customer
  commercial data. They render only to a current member of that tenant.
- No request body, email address, organisation name, target name, quantity,
  emissions figure, or session value is logged.
- Nothing is transmitted to Resend, Blob, Upstash beyond existing auth/session
  behavior, an analytics service, or any model provider.
- No AI is used. A model never calculates, suggests, ranks, or narrates a
  dashboard figure or action.

## Non-goals

- ESG report generation, narrative, export, `/reports`, and report storage —
  step 13.
- scheduled recalculation, thresholds, alerts, notifications, and email — step
  14.
- new activity ingestion, factor matching, market-based scope 2, or changing a
  committed emission on read.
- new target types, target editing, per-site targets, intensity targets, or
  sector-pathway/SBTi claims.
- AI recommendations or prose, analytics, billing, public APIs, or a separate
  backend service.
- schema/migration work, provider provisioning, environment variables, caching,
  `use cache`, Route Handlers, or Server Actions.
- a client-side chart, animation, GSAP, a chart dependency, a root provider, a
  new design system, or changes to settled `SiteNav`/`SiteFooter` geometry.
- importing anything from `home/` or its client bundle into authenticated
  routes.
- staff impersonation or any staff/admin bypass into tenant data.

## Checks to run

Run and quote the exact output of:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run test:e2e`
6. the signed-out `/dashboard` redirect and callback assertion
7. the disposable authenticated-browser matrix above, including cleanup
8. the 375 / 800 / 1280 production screenshot and overflow/accessibility checks
9. the isolated parent-versus-implementation prerender comparison
10. the CSS byte and rule-level diff

`npm run db:generate` and `npm run db:migrate` are **not** checks for this
prompt because no schema change is authorised. If either becomes necessary,
stop and ask.

Record platform gaps honestly. In particular, if agent-browser is not installed
or WebKit cannot run, report the exact failure and use only the supported
fallbacks; do not relabel an unrun check as passed.

After verification, append the complete build record to `docs/backend.md`:
definitions, files, arithmetic/refusals, query boundaries, visible states,
synthetic fixture/cleanup, route table, CSS delta, prerender result, browser
matrix, exact check outputs, secrets/data statement, judgements versus
measurements, and what step 12 deliberately did not do. Add any newly repeated
mechanical browser or diff step to `docs/automation.md`, not to `AGENTS.md`.

Commit all resulting changes to `main` with no push.

## SKILLS USED

- `nextjs` — verify Next.js 16 App Router Server Component reads, route loading/error boundaries, auth gating, and proxy integration.
- `next-best-practices` — enforce current file conventions, async APIs, Server/Client boundaries, parallel reads, and error handling.
- `vercel-react-best-practices` — avoid waterfalls, keep the route server-rendered, minimize client JavaScript, and preserve bundle boundaries.
- `tailwind-4-docs` — implement the responsive authenticated dashboard with the initialized Tailwind v4 docs and existing token/utilities vocabulary.
- `drizzle-docs` — verify the tenant-scoped Postgres select/filter APIs used by the new dashboard query module; no schema change or migration.
- `neon` — retain the repository's existing Neon/Lakebase backend architecture without provisioning a new service.
- `neon-postgres` — preserve pooled application reads, exact Postgres numeric strings, and the current `pg`/Fluid connection decision.
- `better-auth-best-practices` — preserve the existing Better Auth session path and server-side protected-page pattern.
- `better-auth-security-best-practices` — keep the cookie check optimistic only and require authoritative database-backed session validation.
- `organization-best-practices` — enforce active-organisation selection, current membership, and strict tenant isolation.
- `agent-browser` — verify the authenticated dashboard responsively and accessibly when its executable is available, with pinned Playwright as the recorded fallback.

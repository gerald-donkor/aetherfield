# 62 — Scheduled recalculation and threshold alerts

## Scope, and why it is next

**Build step 14** — the final row of AGENTS.md §5.2's phase two, and the last
step in the sequence. Its dependencies are steps 10 and 12, both committed
(`60def3c` and `f16e86f`), and step 11 (`b13bc02`) supplies the target maths this
step alerts on.

It is unbuilt, resolved from the repository rather than from `prompts/`:
`app/api/` holds only `auth/[...all]/route.ts` and
`newsletter/unsubscribe/route.ts`, there is no `vercel.json` or `vercel.ts`, and
no `CRON_SECRET` appears in `vercel env ls`. Every one of steps 9, 10, 11, 12 and
13 defers "scheduled recalculation, threshold alerts" to step 14 by name in its
own *What this step deliberately did not do* table in `docs/backend.md`.

Two halves, one nightly invocation:

1. **Scheduled recalculation** — the emissions engine runs over every
   organisation on a schedule, so a tenant's totals are not stale until somebody
   remembers to press the button `app/_components/activity/recalculate-control.tsx`
   renders.
2. **Threshold alerts** — after an organisation is recalculated, its active
   targets are read against the run-rate projection, and an organisation that has
   drifted past the threshold is emailed once per crossing.

## Decisions taken with the user before this prompt was written

Asked and answered on 11 Aug 2026, before any of the design below was fixed:

| decision | chosen | rejected |
| --- | --- | --- |
| what raises an alert | **target drift only** — the signed `readingAgainstTarget` against an active target | month-over-month spike (a single month is noisy and seasonal); a stale-data alert |
| where the threshold lives | **one fixed constant in `lib/domain/`, recorded as a judgement** | a per-organisation column with a settings UI — meaningfully widens the step |
| recipients, and the off switch | **organisation owners only, with a per-member opt-out column** honoured server-side | all members; owners with no opt-out at all |

## Reference material read for this prompt

Read this session, by path. Quote these rather than recalling them.

- `AGENTS.md` — §5.2 (step 14 and the citation convention), §5.3 (AI), §6.2 and
  §6.3 (layers and boundaries), §8.1–8.5, §9.1–9.2, §10, §11, §12.
- `docs/backend.md` — steps 9, 10, 11, 12 and 13, in particular
  `### `recalculate`` (line 4936), `### What step 10 deliberately did not do`,
  `### What step 11 deliberately did not do`, `### What step 12 deliberately did
  not do`, `### What step 13 deliberately did not do`.
- `app/activity/actions.ts` — the whole file; `recalculate` at line 501 is the
  seam this step must share rather than duplicate, and `stageImport`'s stage-a
  docblock is the standing reason an authenticated path carries no BotID.
- `lib/domain/targets.ts` — `targetFigure`, `trajectory`, `projectTargetYear`,
  `readingAgainstTarget`, the four refusals, and `ProjectionBasis`'s docblock
  requiring the basis to travel with the figure.
- `lib/domain/reports.ts` lines 199–241 — `buildTargetEvidence`, the **existing**
  pure composition of `targetFigure` → `projectTargetYear` → `readingAgainstTarget`,
  and the scales it declares.
- `lib/db/emission-queries.ts` — `listRecordsForCalculation`, `listFactorMappings`,
  `buildFactorResolver`, `replaceEmissions`, `seedDefaultMappings`,
  `countUncalculatedRecords`, `listEmissions`.
- `lib/db/target-queries.ts` — `listTargets`, `readTargetEvidence`, and the
  `visible()` tenant predicate written once.
- `lib/db/organization-queries.ts`, `lib/db/auth-schema.ts` — `member.role`,
  `user.email`, `user.name`, `organization.name`.
- `lib/email/send.ts`, `lib/email/config.ts`, `lib/email/newsletter.ts`,
  `lib/email/templates/shared.tsx` — the send helper, `appBaseUrl()`, the
  best-effort wrapper idiom, and `Shell`.
- `app/api/newsletter/unsubscribe/route.ts` — the in-repo Route Handler idiom and
  its fail-open reasoning.
- `lib/rate-limit/index.ts`, `proxy.ts`, `package.json`, `.env.example`,
  `app/account/page.tsx`, `app/account/actions.ts`.
- Vercel cron docs, fetched this session:
  `https://vercel.com/docs/cron-jobs.md` (updated 2026‑06‑16) and
  `https://vercel.com/docs/cron-jobs/usage-and-pricing` (updated 2026‑07‑15).

## The measured platform constraint that shapes the design

**The team is on the Hobby plan.** Read back, not assumed:
`vercel api /v2/teams/dgsloxx417s-projects` reports `billing.plan = hobby`.

Vercel's own pricing page, fetched this session, states for Hobby:

> **Minimum interval** Once per day · **Scheduling precision** Per-hour (±59 min)
>
> Cron jobs can only run once per day. Expressions like `0 * * * *` (per-hour) or
> `*/30 * * * *` (every 30 minutes) **will fail deployment**.

So the schedule is **`0 2 * * *`** — once daily, and the implementation must not
assume it lands at 02:00 UTC, because Hobby triggers anywhere in the hour. The
timezone is always UTC and there is no configuring it. **Do not write a schedule
finer than daily**: it is not a preference, it fails the deploy.

Two further facts from the same docs, both to be relied on rather than recalled:

- Vercel makes an **HTTP `GET`** to the **production deployment URL** at the
  configured `path`. So the handler exports `GET` and nothing else.
- The request carries user agent `vercel-cron/1.0` and an
  `x-vercel-cron-schedule` header. **Neither is an authentication mechanism** —
  both are attacker-supplied on any direct request — and the prompt requires the
  `CRON_SECRET` bearer check below instead. Do not gate on the user agent.

## What to build

### a. One recalculation seam, shared by the action and the cron

`app/activity/actions.ts`'s `recalculate` currently inlines the whole
orchestration at lines 522–557: `seedDefaultMappings` → `listRecordsForCalculation`
+ `listFactorMappings` → `buildFactorResolver` → `aggregate` → `toStoredKgCo2e` →
`replaceEmissions`. **The cron must not restate it.** Two implementations of what
a recalculation is would be two definitions of a disclosure figure.

Extract it as `recalculateOrganization(organizationId, importId)` in
`lib/db/emission-queries.ts`, returning the record count covered and the emission
count written, and have `recalculate` call it. Its `NOTHING_TO_CALCULATE` branch
stays in the action, keyed off a zero record count — that is copy, not
orchestration.

**A query module composing a pure domain function is the established idiom here,
not a new smear**: `lib/db/target-queries.ts`'s `readTargetEvidence` and
`lib/db/dashboard-queries.ts`'s `readDashboardEvidence` already compose a
tenant-predicated read with `totalsByPeriod`. `lib/domain/` stays free of every
database handle, which is the boundary §6.2 actually names.

The action's behaviour must not change. In particular `replaceEmissions` keeps
its delete-then-insert semantics bounded by the covered record set, for the
reason `docs/backend.md` line 4936 records.

### b. The alert evaluator — pure, tested, and reusing the report's composition

New `lib/domain/alerts.ts`, pure (§6.2): no database handle, no `fetch`, and the
clock arrives as an `asOf` parameter exactly as `projectTargetYear` takes one.

It evaluates one organisation's `active` targets against its emissions and
returns the alerts to raise and the open alerts to resolve. **It must reuse
`lib/domain/reports.ts`'s `buildTargetEvidence` composition at the same declared
scales — `projectTargetYear` at `scale: 3, mode: "half-even"`, and
`readingAgainstTarget` at `scale: 1, mode: "half-even"`** (read at
`lib/domain/reports.ts:205-218`). An alert and a report that disagreed about the
same target's reading would be the worst failure this half can have; sharing the
scales is what makes that impossible. If the composition can be factored so both
modules call one function, do that; if not, the scales are named constants in one
module and imported by the other. **Do not restate a bare `3` or `1` in a second
place.**

**Every refusal produces no alert, never a zero and never an alert.** All four of
step 11's refusals apply unchanged: fewer than 12 complete months
(`insufficient_history`), an elapsed target year (`target_year_elapsed`), a zero
target figure (`target_is_zero`), and a non-`active` target is not evaluated at
all. A refusal is not a crossing, and must never be reported as one.

**A `flat`-basis projection does raise an alert, and the basis travels with it.**
`ProjectionBasis`'s own docblock states that a flat projection and a trending one
are different claims about the future and that showing them identically presents
the weaker one as the stronger — so the alert carries `basis` and
`completeMonths`, and the email renders both.

Tests in `lib/domain/alerts.test.ts`, picked up by `npm test` (scoped to
`lib/domain/`). Cover at minimum: a crossing on a trend basis; a crossing on a
flat basis; a reading exactly at the threshold (not a crossing — see below); a
negative reading (ahead of target, never an alert); each of the three refusals; a
retired target; and resolution when a previously-open alert's reading falls back.

### c. The threshold — a judgement, and said to be one

`ALERT_THRESHOLD_PERCENT = 10` in `lib/domain/alerts.ts`, as a `Decimal`
consistent with the module's no-`Number`-on-the-value-path discipline.

**This is a judgement, not a measurement, and `docs/backend.md` must record it as
one** (AGENTS.md §12 rule 4). The reasoning to record: the projection is a linear
two-window run rate whose own uncertainty is not quantified, so a threshold below
roughly ten per cent would alert on movement the method cannot distinguish from
noise; `home/dashboard.tsx`'s illustrative "16% off your 2027 emissions goal"
sits above it, which is the intent the marketing mock states. No recording,
comp or dataset was fit to produce the number, and nothing in this prompt may
describe it as measured.

**The comparison is strictly greater than**, so a reading of exactly the
threshold is not a crossing, and an open alert resolves when the reading returns
to at-or-below it. **No hysteresis band**, and the reason is stated rather than
left implicit: the underlying data changes on import, not continuously, and the
sweep runs once a day, so flapping needs a committed import in each direction. If
flapping is ever observed that is a measured reason to add a band later.

### d. The tables

Two, added to `lib/db/schema.ts` with a Drizzle-generated migration
(`npm run db:generate`, then `npm run db:migrate`). **Never a hand-run
`ALTER TABLE`** (§9).

**`target_alert`** — one row per crossing. Strictly tenant-scoped with a
**`not null`** `organization_id`: §9.2 rule 6's published-reference-data exception
covers `emission_factor_set` and `emission_factor` only, and an alert is a
customer's own data. Carries the target reference, and — so that a later change
to the constant cannot rewrite history — the **figures and the threshold in force
when it was raised**: `reading_percent`, `projected_kg_co2e`, `target_kg_co2e`,
`threshold_percent`, `basis`, `complete_months`, `window_end`.

Status is an enum defined once and imported everywhere (§9.2 rule 2) —
`target_alert_status` with `raised` → `notified` → `resolved` — and **every
transition carries its own timestamp**, not just a current-state column (§9.2
rule 3): `created_at`, `notified_at`, `resolved_at`, plus `deleted_at` for
§9.2 rule 5's soft delete. Numeric columns follow the precisions step 11 derived
for the same quantities; read them from `docs/backend.md`'s
`### Numeric precision, derived` rather than choosing new ones.

**Dedupe is one open alert per target**, enforced by a partial unique index over
`target_id` where the row is neither resolved nor soft-deleted — in the database,
not by a read-then-write in application code, for the same concurrency reason
`retireTarget` puts its status predicate in the `WHERE`.

**`alert_preference`** — the opt-out, unique on `(organization_id, user_id)`,
`email_alerts boolean not null default true`, with `created_at` and `updated_at`.
**A row's absence means opted in**, so nothing needs backfilling.

**It is a separate table and must stay one**: §9.1 forbids adding columns to
Better Auth's generated tables, and `member` is one of them. Do not touch
`lib/db/auth-schema.ts`.

New queries go in a new `lib/db/alert-queries.ts` carrying `import "server-only"`,
every function taking `organizationId` and predicating on it, with the tenant
predicate written once in a `visible()` helper as `target-queries.ts` does.

### e. The cron Route Handler

`app/api/cron/recalculate/route.ts`, exporting `GET` only.

**A Route Handler is correct here and is not a §6.2 violation** — §6.2 names
"cron endpoints" among the external callers handlers exist for, and the caller is
Vercel's scheduler, not this application. Say so in the file's docblock, in the
manner `app/api/newsletter/unsubscribe/route.ts` already does for its own case.
**No business logic in the handler**: it authenticates, calls the sweep, and
answers.

Stage order, in §10's letters where they apply:

- **a. BotID — deliberately absent**, and for a stronger reason than the
  authenticated-path one `stageImport` records: the caller is not a browser at
  all, `instrumentation-client.ts` protects page paths rather than API routes,
  and AGENTS.md §7.3 records that a path missing from that list makes the server
  call **fail** rather than pass.
- **b. Authenticate the caller.** `authorization` must equal
  `Bearer ${process.env.CRON_SECRET}`; anything else is `401` with no body and no
  detail. Compare in a way that does not leak length or position — use
  `crypto.timingSafeEqual` over equal-length buffers, guarding the length check
  first. **An unset `CRON_SECRET` fails closed**, never open.
- **b2. Rate limit**, keyed on a constant rather than an IP, **failing open** —
  the inverted stance `app/api/newsletter/unsubscribe/route.ts` documents, for the
  same class of reason: refusing the nightly job because Redis is unreachable is
  worse than letting an idempotent sweep run unmetered during an outage. A
  judgement of 6 per hour, stated as a judgement in `docs/backend.md` alongside
  every other limiter number step 2 onwards has recorded as one. It exists so a
  leaked secret cannot drive repeated full-tenant sweeps, not to shape normal
  traffic.
- **c–f.** The sweep, below.

Response body is a small JSON summary — organisations swept, organisations
recalculated, alerts raised, alerts resolved, emails attempted — and **no tenant
identifier, no organisation name, no address and no figure** (§8.3 rule 2 as
extended to commercial data by §5.3).

### f. The sweep

For each organisation, in a stable order:

1. `recalculateOrganization(organizationId, null)` — the shared seam from (a).
   An organisation with no committed records is skipped, not failed.
2. Read its active targets and calculated emissions through the existing
   tenant-predicated reads.
3. Evaluate with `lib/domain/alerts.ts`.
4. Raise and resolve rows through `lib/db/alert-queries.ts`.
5. For each newly raised alert, send to the organisation's **owners** —
   `member.role = 'owner'` — excluding any user with an `alert_preference` row
   whose `email_alerts` is false. A send failure marks nothing as notified and
   never fails the sweep (§10 rule 4).

**One organisation's failure must not end the sweep.** Each is wrapped, the
error is counted, and the loop continues — a single tenant with bad data cannot
be allowed to stop every other tenant's recalculation. Nothing is logged beyond
a count.

**Scale boundary, stated rather than pre-optimised.** The sweep is sequential and
reads each organisation's full calculated set into memory, which is the same
boundary `readTargetEvidence` and `readDashboardEvidence` already document.
Configure `maxDuration: 300` for this path in `vercel.json` — 300s is the Hobby
maximum per the functions docs — and record in `docs/backend.md` that revisiting
sequencing and pagination is a future judgement against real tenant volume, not
something to guess at now.

### g. The email

`lib/email/templates/target-alert.tsx` built on `Shell` and the shared style
constants, plus `lib/email/alerts.ts` as the best-effort sender in the shape of
`lib/email/newsletter.ts`. Idempotency key `target-alert/<alert.id>`, matching
step 3's documented `<event-type>/<entity-id>` format.

**It is transactional, not marketing, and that has a consequence.** Per the
`email-best-practices` skill's `references/email-types.md`, it reports on the
service the recipient's organisation contracted for, is non-promotional, and is
sent under contract fulfilment rather than consent. So it carries **no
`List-Unsubscribe` header** — `lib/email/send.ts`'s `headers` passthrough exists
for the newsletter's bulk message, and the same skill warns against the
transactional/marketing hybrid. The off switch is the in-app preference in (h),
and the email links to it in plain words.

Content: the organisation and target names, target year, target figure and
projection in tonnes, the signed reading, **the basis and the complete-month
count**, the window end, and a link to `/targets` built from `appBaseUrl()`.
Register per §5 — measured and operational, evidence-first. It states the gap
and what the workspace shows; it is never alarmist about climate and never
congratulatory.

**No figure in this email is generated, and no model is involved** — every one is
computed by `lib/domain/` and passed in. §5.3's hard rule binds this step even
though step 14 has no sanctioned AI surface at all.

### h. The off switch

`/account` gains a small preference control: a client leaf that is
component-only per the bundle rule, posting to a Server Action colocated at
`app/account/actions.ts` alongside what is already there. The action follows §10
unchanged — resolve tenant, rate limit keyed by user id, `safeParse` with a
shared schema in `lib/validation/`, tenant-predicated write, `revalidatePath`,
typed result, **no redirect on success**.

Built from the existing primitives in `app/_components/`. **No new primitive, no
second design system, no GSAP** (§7.5).

## Measurements this implementation must hit

- **The Hobby schedule is `0 2 * * *`**, once daily. Verified against the pricing
  page quoted above. A finer expression fails deployment.
- **`maxDuration: 300`** — the Hobby ceiling from the functions docs.
- **Projection scale 3 `half-even`; reading scale 1 `half-even`** — read from
  `lib/domain/reports.ts:205-218`, not chosen here.
- **Numeric column precisions** — taken from `docs/backend.md`'s
  `### Numeric precision, derived` (step 11) and
  `### The two numeric precisions, both derived` (step 10). Do not invent a new
  precision for a quantity that already has a derived one.
- **`ALERT_THRESHOLD_PERCENT = 10`** — a **judgement**, recorded as one.
- **The rate limit of 6 per hour** — a **judgement**, recorded as one.
- Every check in the *Checks* section below is run and its output quoted.

## Prerender impact

**Expected: no marketing route changes, and this must be verified rather than
assumed** (§8.1, and the backend-prompt heading contract in §4).

- `app/api/cron/recalculate/route.ts` is a new Route Handler and changes no
  page's HTML.
- `/account` changes — it gains the preference control. It is already an
  authenticated, non-prerendered route behind `proxy.ts`'s matcher, so its
  **render mode must not change**.
- The nine static/SSG marketing routes — `/`, `/journal`, `/about`, `/careers`,
  `/design-system`, `/article/[slug]` ×6, `/job-listing/[slug]` ×3 — must be
  **byte-identical**. Verify by the build diff in `docs/automation.md`, and
  **honour the standing warning**: never quote a bare page-wide
  `magick compare -metric AE` for `/`, `/journal` or `/careers`; mask the box and
  report the remainder and the box separately.
- **`vercel.json` is new to this repository.** Confirm from `npm run build`'s
  route table that adding it changes no route's render mode. Use `vercel.json`
  rather than `vercel.ts`: the `vercel-functions` skill documents the `crons` and
  `functions` keys in `vercel.json` and it needs no new dependency, whereas
  `vercel.ts` would add `@vercel/config` for no gain here. Note the choice in
  `docs/backend.md` so a later session does not re-litigate it.
- **`proxy.ts`'s matcher is not widened, and `/api/cron/*` must not be added to
  it.** The matcher is enumerated deliberately (§8.1); an auth redirect in front
  of the cron path would break the scheduler. Confirm the enumerated list is
  unchanged.

## Trust boundary

- **What crosses:** an unauthenticated public HTTPS `GET` from Vercel's scheduler
  to `/api/cron/recalculate`, carrying an `authorization` header. Nothing else —
  no body, no query parameter, and **no organisation identifier**. The sweep
  derives every tenant id server-side; a tenant id accepted from a request would
  be the whole multi-tenancy failure in one line, which is the rule
  `app/activity/actions.ts` states at length.
- **What authorises:** a constant-time comparison against `CRON_SECRET`. Nothing
  else — not the user agent, not `x-vercel-cron-schedule`, both of which any
  caller can set.
- **What a rejected request returns:** `401`, empty body, no detail, no logging of
  the presented value.
- **The `/account` preference action** authorises inside the action via the
  existing tenant resolution, writes only the calling user's own row, and takes
  no user id or organisation id from the browser.
- **Aetherfield's `staff` and `admin` roles grant nothing here** (§11.1). The
  sweep acts as the system, not as a person, and no staff bypass into tenant data
  is introduced.

## Secrets and data

- **Reads:** `CRON_SECRET` (new), plus the already-established `DATABASE_URL`,
  `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `RESEND_API_KEY` and `BETTER_AUTH_URL`
  (through `appBaseUrl()`).
- **`CRON_SECRET` is generated locally**, ≥32 characters, in the manner
  `BETTER_AUTH_SECRET` was. It is **not auto-provisioned** — Vercel does not set
  it; the developer does. Add it with `vercel env add CRON_SECRET` to production,
  preview and development, **read the name back from `vercel env ls`**, and only
  then add a Step 14 section to `.env.example`. Never echo the value (§8.4).
- **No `NEXT_PUBLIC_*` is added.** Phase one needed none and this step needs none;
  a cron secret in a browser bundle would be the secret given away.
- **Personal data:** the alert email is sent to a `user.email` already held for an
  authenticated account. **No address, organisation name, target name or figure
  is ever logged** — not in the response body, not on a catch, not in the send
  helper, which already carries only an error *name* and a template name.
- **Nothing reaches a third party but Resend**, which already handles this
  project's mail. No AI provider, no model, no analytics.
- **Retention:** state it in `docs/backend.md`. A resolved alert is retained as
  the record of what the workspace told the customer and when; soft delete is
  available for an erasure request.

## Non-goals

Deliberately out of scope. Do not add any of these.

| not done | why |
| --- | --- |
| per-organisation configurable thresholds and a settings UI | decided with the user: one constant, recorded as a judgement. A settings surface is its own prompt |
| month-over-month spike alerts, or a stale-data alert | decided with the user: target drift only |
| alerts to all members, or to `staff`/`admin` | owners only; staff status stays orthogonal to membership (§11) |
| in-app notifications, a notification centre, Slack or webhooks | a step-14 alert is an email; anything else is a new surface |
| a finer-than-daily schedule, a second cron job, or a queue | Hobby is capped at once per day, measured above |
| any AI — no model, no prompt, no provider | §5.3: step 14 has no sanctioned AI surface at all |
| scheduled *report* generation | step 13 shipped reviewed drafts on purpose; nothing auto-publishes |
| changing the emissions engine, factor mappings, or any target formula | steps 10–12 own those definitions; this step consumes them |
| widening `proxy.ts`'s matcher, or touching `SiteNav`, `SiteFooter`, `NAV_ITEMS` or any marketing markup | §8.1 and the front matter's settled surfaces |
| a new primitive, a second design system, a chart dependency, or GSAP | §7.5 |
| adding a column to any Better Auth generated table | §9.1 |

## Two inherited blockers to report, not to route around

Both are pre-existing, both must be **stated in `docs/backend.md`**, and neither
is a reason to narrow the build (§12 rule 9).

1. **The alert email cannot reach a real customer yet.** `lib/email/config.ts`
   sends `from` `onboarding@resend.dev`, Resend's sandbox sender, which
   **delivers only to the Resend account's own address** and 403s every other
   recipient. That is the same unclosed prerequisite step 3 recorded, and it now
   bites a customer-facing message rather than an internal one. Record it against
   step 14 explicitly.
2. **One line in `lib/email/config.ts` is now stale and must be corrected in this
   change** (§12 rule 8). Its docblock states "Aetherfield has no deployment and
   no assigned production domain (recorded at prompt 38, and still true at prompt
   43)". The deployment half is no longer true: `vercel project ls` reports
   `aetherfield` with production URL `https://aetherfield-rho.vercel.app`, updated
   1 day ago. The **domain** half remains true and remains the actual blocker — a
   `*.vercel.app` URL is not a domain Resend can verify SPF, DKIM and DMARC on.
   Correct the sentence to say exactly that; do not silently leave it, and do not
   overstate the fix.

## Verification, and what cannot be verified locally

**Vercel does not run cron schedules locally**, so the schedule itself is only
confirmable after a deploy. Say so plainly rather than implying it was exercised.

Locally exercisable, and to be exercised:

1. `npm run dev`, then invoke the handler directly:
   `curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/recalculate`
   — expect `200` and the summary body.
2. The same without the header, and with a wrong secret — expect `401` and an
   empty body both times.
3. A seeded organisation with an active target and enough committed history to
   clear the 12-complete-month floor: confirm a row appears in `target_alert`,
   confirm a second invocation raises **no** second row (the dedupe index), and
   confirm resolution when the reading falls back.
4. The `/account` toggle: set it false, invoke again, confirm no send is
   attempted for that user.
5. `proxy.ts` does not intercept `/api/cron/recalculate` — confirm by the `401`
   in (2) arriving from the handler rather than a redirect to `/sign-in`.

## Checks to run (AGENTS.md §2)

Run each, and **quote the exact output**. Never claim one passed without running
it (§12 rule 3).

- `npm run lint`
- `npm run typecheck`
- `npm test` — including the new `lib/domain/alerts.test.ts`
- `npm run build` — and confirm the route table still shows the nine marketing
  routes as `○ Static` / `● SSG`
- the prerendered-HTML diff per `docs/automation.md`, with the standing masking
  warning honoured
- `npm run db:generate` then `npm run db:migrate`
- `npm run test:e2e` if the `/account` change touches anything an existing spec
  asserts; state which specs ran

## Where the result is recorded

**`docs/backend.md`**, as a new `## Step 14 — scheduled recalculation and
threshold alerts` section, placed consistently with how steps 9–13 are already
ordered in that file. It records: the two tables as applied with their column
types and indexes; the enum; the shared seam and why it lives where it does; the
threshold and the rate limit **as judgements, said to be judgements**; the
`vercel.json` choice; the schedule and the Hobby constraint with its source and
date; the trust boundary; the environment variable as read back from
`vercel env ls`; retention; the two inherited blockers above; and a
*What step 14 deliberately did not do* table mirroring the non-goals.

**Never in `AGENTS.md`.** The only change that file may receive is nothing at
all — step 14 adds no index row (`docs/backend.md` already exists and is already
indexed) and introduces no site-wide invariant meeting the cap rule. **Do not tick
anything in §5.2**; a step is marked done by the repository and `git log`.

One addition to **`docs/automation.md`** under its standing instruction: `grep`
silently skips `lib/db/emission-queries.ts` because the file contains two literal
`NUL` bytes — a deliberate composite map-key separator at
`buildFactorResolver` (`` `${mapping.category}\0${mapping.unit}` ``) that makes
`file` report the source as `data` and makes `grep` treat it as binary. `grep -a`
is the workaround. This cost time this session and will cost it again.

Finish with §1 step 9 (exact steps to run and test the feature) and step 10
(commit to `main`, unprompted; do not push).

## SKILLS USED

Invoke every one of these before writing code — listing is not loading (§4).

- `vercel:vercel-functions` — cron job configuration in `vercel.json`, the
  `CRON_SECRET` bearer pattern, `maxDuration`, and Fluid Compute's runtime. Loaded
  while writing this prompt; load it again at execution.
- `drizzle-docs` — the two new tables, the enum, the partial unique index, and the
  `db:generate` / `db:migrate` workflow. Nothing in `lib/db/` is written without
  it.
- `zod-docs` — the shared schema for the `/account` preference action, and
  `flattenError` for field errors in the shape the existing actions use.
- `neon-postgres` — the pooled/direct connection split, so the migration runs over
  `DATABASE_URL_UNPOOLED` and the sweep over `DATABASE_URL`.
- `resend` — the send call, idempotency keys, and the installed SDK's real
  surface. Verify against `node_modules/resend` rather than the skill where the
  two disagree, as step 3 had to.
- `react-email` — the alert template, and `render()` for inspecting it; there is
  no email-preview script in this repository and this step does not add one.
- `email-best-practices` — the transactional/marketing classification behind the
  no-`List-Unsubscribe` decision (`references/email-types.md`), and
  `references/accessibility.md` for the template's `lang`, headings, alt text and
  contrast.
- `upstash-ratelimit-js` — the fail-open limiter on the cron path, matching the
  existing `lib/rate-limit/` construction.
- `nextjs` — Route Handler shape on Next 16.2, `proxy.ts` rather than
  `middleware.ts`, and async `headers()` / `cookies()`.
- `vercel:env-vars` — `vercel env add` / `vercel env ls` for `CRON_SECRET`,
  without ever echoing the value.
- `better-auth-security-best-practices` — read before touching anything near
  session or role resolution, to confirm the owner-role read stays a
  database-backed per-request check rather than a session-payload trust.
- `tailwind-4-docs` — the `/account` control's utilities, config-less, tokens from
  `@theme` in `app/globals.css`.
- `frontend-design:frontend-design` — the preference control, built from the
  existing primitives so it reads as part of the settled surface rather than a
  bolted-on form.

**Not used, deliberately:** no AI skill of any kind (`vercel:ai-gateway`,
`vercel:ai-sdk`) — step 14 has no sanctioned AI surface (§5.3), and no GSAP skill
— `motion/` is untouched and §7.5 forbids GSAP in backend UI.

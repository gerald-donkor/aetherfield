# Aetherfield

**A B2B sustainability-intelligence platform — track, model, report and act on emissions data.**

![Next.js 16.2.12](https://img.shields.io/badge/Next.js-16.2.12-000000?logo=nextdotjs&logoColor=white)
![React 19.2.4](https://img.shields.io/badge/React-19.2.4-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Neon Postgres](https://img.shields.io/badge/Postgres-Neon-00E599?logo=postgresql&logoColor=white)

Emissions, energy and waste data lives scattered across procurement systems, building sensors,
vendor spreadsheets and departmental silos — inside stacks built to optimise for sales and cost
rather than carbon. Sustainability reporting ends up manual, retrospective and error-prone: an
annual ESG document instead of an operational input.

Aetherfield closes that gap with one loop. **Track** emissions, energy and waste across the value
chain · **Model** performance and goal alignment · **Report** ESG disclosures and automate
frameworks · **Act** on surfaced insights and operational next steps.

The repository holds both halves of the product: a prerendered marketing site and the
authenticated platform behind it, in one Next.js App Router application with no separate backend
service.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill it in — names only live in .env.example
npm run dev
```

> [!IMPORTANT]
> There is no local-database mode. The app talks to a real [Neon](https://neon.com) Postgres
> database, and every authenticated route stays broken until the schema is applied:
>
> ```bash
> npm run db:migrate       # applies migrations over the direct (unpooled) connection
> npm run db:seed:factors  # loads the published DESNZ/DEFRA conversion factors
> ```
>
> See [Getting started](#getting-started) for the full prerequisite list.

## Features

### The marketing site

Seven public routes, all prerendered, with content hand-authored as typed constants in
[`app/_content/`](app/_content) rather than loaded from the database:

| route | what it is |
| --- | --- |
| `/` | the homepage — hero, capabilities loop, the product mockup, and the demo-request CTAs |
| `/journal` | the journal index, and the newsletter signup band |
| `/article/[slug]` | six articles, statically generated |
| `/careers` | open roles, plus the open-application card |
| `/job-listing/[slug]` | three roles, each with its own application form |
| `/about` | the company page |
| `/design-system` | the component exhibit the whole site is built from |

Three of those pages carry public write paths: demo-request capture, double opt-in newsletter
signup, and job applications with private CV upload. All three are unauthenticated, rate-limited
and bot-protected.

### The platform

| area | routes |
| --- | --- |
| Accounts and organisations | `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`, `/invitation/[id]` |
| Activity-data ingestion | `/activity`, `/activity/[importId]`, `/activity/mappings`, `/activity/factors` |
| Dashboard | `/dashboard` |
| Targets and forecasting | `/targets` |
| ESG reports and export | `/reports`, `/reports/[reportId]`, `/reports/[reportId]/export` |
| Staff submissions view | `/submissions`, `/submissions/applications/[id]/cv` |

Behind them: multi-tenant organisations with membership and invitations, CSV activity import with
staged rows and a reviewable outcome, published and customer-supplied emission factor sets
(DEFRA 2025 and 2026 ship as seed data), date-effective factor selection, a scope 1 / 2 / 3
calculation engine with both location-based and market-based scope 2, target tracking with
projections, generated ESG reports, and three nightly cron jobs for recalculation, threshold
alerts and retention purges.

## AI, and the rule that bounds it

One module in this codebase reaches a language model —
[`lib/reporting/narrative.ts`](lib/reporting/narrative.ts), which drafts the narrative prose of an
ESG report through the Vercel AI Gateway.

> [!WARNING]
> **An LLM never produces a number that appears in a disclosure.** All arithmetic is deterministic,
> in the pure functions under [`lib/domain/`](lib/domain). A model may select a factor; it never
> multiplies by one. A generated narrative is checked token by token against a closed allowlist of
> already-computed figures, and a draft that fails the check is discarded rather than stored — the
> system prompt is a request, the allowlist is the enforcement.

Only rendered, already-rounded report sections cross to the provider: no raw activity row, no
uploaded file, no personal name, no email address, no organisation identifier.

## Tech stack

| layer | choice | version |
| --- | --- | --- |
| Framework | Next.js App Router, Turbopack | `16.2.12` |
| UI | React | `19.2.4` |
| Language | TypeScript | `^5` |
| Styling | Tailwind CSS 4 — config-less, tokens in `@theme` in `app/globals.css`, no `tailwind.config.js` | `^4` |
| Database | Neon Postgres over `pg` (node-postgres) | `pg@^8.22.0` |
| ORM | Drizzle, which owns schema and migrations exclusively | `drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10` |
| Auth | Better Auth, self-hosted, with the Drizzle adapter | `^1.6.26` |
| Email | Resend + React Email | `resend@^6.18.1`, `react-email@^6.9.2` |
| Rate limiting | Upstash Redis | `@upstash/ratelimit@^2.0.8` |
| File storage | Vercel Blob, private | `@vercel/blob@^2.7.0` |
| Bot protection | BotID — the package is `botid`, not `@vercel/botid` | `^1.5.11` |
| Validation | Zod, one schema shared between form and action | `^4.4.3` |
| Motion | GSAP (marketing site) and Motion | `gsap@^3.15.0`, `motion@^13.0.0` |
| AI | the `ai` SDK through Vercel AI Gateway | `^7.0.59` |
| Testing | Vitest (unit), Playwright (E2E) | `vitest@^4.1.10`, `@playwright/test@^1.62.1` |

## Architecture

Layers, and what each is allowed to do:

- **UI** — routes, Server Components, client leaves. Renders data and calls Server Actions.
- **Server Actions** — the only mutation path for this app's own forms. Colocated as
  `app/<route>/actions.ts`, or in `app/_actions/` when no single route owns the form.
- **Route Handlers** — thin, and for *external* callers only: the Better Auth mount, cron
  endpoints, the one-click unsubscribe link. No business logic.
- **Data** — `lib/db/`. Nothing else in the codebase writes SQL or builds a query.
- **Domain** — `lib/domain/`. Pure functions over typed inputs: no database handle, no `fetch`, no
  implicit `Date.now()`.

Two rules a newcomer will otherwise break: **the UI never mutates through a Route Handler**, and
**every mutation authorises and validates server-side inside the action** — hiding a control in the
UI is presentation, never enforcement.

Every public form follows the same path:

```
client leaf form            validates with the shared Zod schema, for the user's benefit only
   │
   ▼
Server Action               a. BotID check                    → reject
   │                        b. rate limit, keyed by IP        → reject, with retry timing
   │                        c. parse with the SAME Zod schema → typed field errors
   │                        d. authorise, where the path is not public
   │                        e. write via lib/db/
   │                        f. send email via lib/email/      (failure never fails the write)
   ▼
typed result                { ok: true } | { ok: false, error, fieldErrors? }
   │
   ▼
the leaf renders it in place — announced, focus managed, legible without colour
```

Validation runs twice and the schema exists once. The action returns a typed result; it never
throws to the client, and it never redirects on success.

## Project structure

```
app/
  _actions/        Server Actions with no single owning route (demo request, newsletter, application)
  _components/     every UI primitive, grouped by surface; motion/ holds the shared GSAP leaves
  _content/        articles and jobs, as typed constants
  api/             Route Handlers — Better Auth's catch-all, three crons, one-click unsubscribe
  <route>/         one directory per route, with actions.ts colocated where the route owns a form
  globals.css      Tailwind v4 @theme tokens and the site's base layer
lib/
  auth/            session, roles, organisation and tenant resolution
  db/              schema, client, queries, generated migrations, factor seed data
  domain/          pure calculation, forecasting and validation logic, with colocated .test.ts files
  email/           templates and the send helper
  rate-limit/      the Upstash limiter
  reporting/       the one module that reaches a model
  storage/         private blob upload and signed reads
  validation/      shared Zod schemas — deliberately NOT server-only
docs/              the build record: one file per surface (see the documentation map below)
prompts/           the numbered implementation prompts that built this repository
e2e/               Playwright specs, plus the auth setup/teardown projects
public/assets/     photography, generated treatments, and the design comps
scripts/           the WebKit container runner and two one-shot data scripts
tools/             the pinned rootless Podman image used for WebKit
```

Every module under `lib/` that touches a secret carries `import "server-only"`, so a mistaken client
import is a build error rather than a leaked key at runtime. `lib/validation/` is the one deliberate
exception — its schemas are imported by client leaves *and* by actions, which is what makes
"the rules exist once and run twice" true.

## Getting started

### Prerequisites

- **Node.js** — the repository declares no `engines` range; `@types/node` is `^20`, so Node 20 LTS
  or newer.
- **A Neon Postgres database.** Both a pooled and a direct connection string are needed, and using
  the wrong one fails silently: the app reads the pooled `-pooler` host, migrations and Studio read
  the direct one.
- **The Vercel CLI**, if you are pulling real values: `npm i -g vercel`, then `vercel env pull .env.local`.

### Configure

`cp .env.example .env.local` and fill it in. [`.env.example`](.env.example) is the canonical list —
names only, never values — and it carries a comment on each variable explaining which provider sets
it and why it is not public.

### Database

```bash
npm run db:generate      # write a migration from lib/db/schema.ts (after a schema change)
npm run db:migrate       # apply pending migrations over the direct connection
npm run db:seed:factors  # seed the published conversion factors; idempotent
npm run db:studio        # browse the database
```

> [!NOTE]
> Drizzle owns schema and migrations exclusively — never a hand-run `ALTER TABLE`. Nothing but
> Next.js auto-loads `.env.local`, which is why every database script above is wrapped in
> `dotenv -e .env.local --`.

## Environment variables

Every variable is **server-only**. There is no `NEXT_PUBLIC_*` variable anywhere in this project,
and adding one is a decision to make a value public.

| variable | what it is | set by |
| --- | --- | --- |
| `DATABASE_URL` | the pooled (PgBouncer) connection; the only one the application reads | Neon integration |
| `DATABASE_URL_UNPOOLED` | the direct connection; migrations, Studio, `pg_dump`, logical replication | Neon integration |
| `KV_REST_API_URL` | Upstash Redis REST endpoint for the rate limiter | Upstash integration |
| `KV_REST_API_TOKEN` | its write token — a limiter counts, so the read-only token will not do | Upstash integration |
| `RESEND_API_KEY` | transactional email | added by hand |
| `LEAD_NOTIFICATION_EMAIL` | where a demo request's internal notification goes; unset skips it | yours |
| `BLOB_READ_WRITE_TOKEN` | the private CV store | Vercel Blob |
| `APPLICATION_NOTIFICATION_EMAIL` | where a job application's notification goes; unset skips it | yours |
| `BETTER_AUTH_SECRET` | at least 32 characters | generated locally |
| `BETTER_AUTH_URL` | the app's base URL; auth callbacks and email links resolve against it | yours |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth; the redirect URI is `<BETTER_AUTH_URL>/api/auth/callback/google` | Google Cloud |
| `CRON_SECRET` | authenticates the only caller of the nightly cron routes; unset fails closed | generated locally |

`NEON_API_KEY` is optional and local-tooling only — `neonctl` reads it to address Neon branches.
Nothing in `app/` or `lib/` reads it, and the app runs without it.

## Commands

| command | what it does |
| --- | --- |
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` | production build |
| `npm run start` | serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest, scoped to `lib/domain/` |
| `npm run test:e2e` | the full E2E matrix — Chromium and Firefox natively, then WebKit in a container |
| `npm run test:e2e:local` | build, start on port 3100, run Chromium and Firefox |
| `npm run test:e2e:webkit` | the same, but WebKit inside the pinned rootless Podman container |
| `npm run test:e2e:ui` | Playwright's interactive UI, native projects only |
| `npm run db:generate` · `db:migrate` · `db:studio` · `db:seed:factors` | see [Database](#database) |

## Testing

**Vitest is scoped to `lib/domain/` and nothing else**, and the scope is the point. The domain layer
is where an exact-decimal arithmetic engine turns activity data into figures that land in regulatory
disclosures, so it is required to stay pure and independently testable. Every test there calls a
function with arguments and asserts on its return value — no environment, no setup file, no mocks.
A test that needs a database or a browser belongs in the E2E suite instead.

**Playwright** covers Chromium, Firefox and WebKit against a real production build on port 3100,
including an authenticated fixture that provisions its own organisation. WebKit runs in a pinned
rootless Podman container (`npm run test:e2e:webkit`), which is what makes the suite reproducible on
Arch Linux where a native WebKit build is not available.

## Personal data

The three public forms collect real personal data — names, work emails, employers, CVs — and the
handling rules are not optional:

- A **CV is private blob storage**, read back through a short-lived signed URL minted per request for
  an authorised session. Never a public URL, never a guessable path.
- **Newsletter signup is double opt-in**, and every marketing email carries a working one-click
  unsubscribe.
- **Request bodies, email addresses and CV contents are never logged** — not to the console, not to
  an error report, not to analytics.
- Retention is finite and enforced by a nightly purge, and organisation deletion is a real erasure
  path rather than a hidden flag.

## Deployment

Vercel, on **Fluid Compute** with the **Node.js runtime**. `runtime = "edge"` is a standing
non-choice here: Fluid runs in the same regions at the same price with full Node.js, streaming and
SSE included, and it keeps functions warm long enough for the `pg` pool to reuse TCP connections
across requests — which is the whole reason this project uses node-postgres rather than an HTTP
driver.

[`vercel.json`](vercel.json) declares the three nightly crons and their 300-second durations.
Neon runs with scale-to-zero on the free plan, so the first query after five idle minutes pays a
cold start of a few hundred milliseconds — expected behaviour, not a performance bug.

## Documentation map

[`AGENTS.md`](AGENTS.md) is the contributor contract: the invariants, the architecture rules, the
stack decisions and the traps each provider carries. Read it before changing anything. The build
record itself lives in `docs/`, one file per surface:

| file | covers |
| --- | --- |
| [`docs/backend.md`](docs/backend.md) | the whole backend build record — schema, endpoints, migrations, environment |
| [`docs/chrome.md`](docs/chrome.md) | the site footer and nav, the drawn "Get started" arrow, `NAV_ITEMS` |
| [`docs/journal.md`](docs/journal.md) | `/journal`, the scaling journal stamp, the shared-component extensions |
| [`docs/articles.md`](docs/articles.md) | `ARTICLES` / `ARTICLE_BODIES`, `/article/[slug]`, the generated heroes |
| [`docs/careers.md`](docs/careers.md) | `/careers`, `JobCard`, the dashed frame and its CSS march |
| [`docs/job-listing.md`](docs/job-listing.md) | `/job-listing/[slug]`, all three roles, the seal's tilt |
| [`docs/about.md`](docs/about.md) | `/about`, the half-width sky band, the Forecast card |
| [`docs/motion-homepage.md`](docs/motion-homepage.md) | GSAP on `/` — reveals, the emissions chart, the hero split |
| [`docs/motion-site.md`](docs/motion-site.md) | motion everywhere else — card hovers, the footer blur-in, the navbar drop-in |
| [`docs/site-affordances.md`](docs/site-affordances.md) | the pointer cursor on buttons |
| [`docs/skills.md`](docs/skills.md) | the installed agent skills, and what was deliberately excluded |
| [`docs/automation.md`](docs/automation.md) | read before measuring anything — comp geometry, screenshotting, build diffing |

[`prompts/`](prompts) holds the numbered implementation prompts, in order. It is the build history:
every change in this repository was specified there before it was written.

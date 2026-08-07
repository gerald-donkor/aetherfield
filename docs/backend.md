# Backend

The build record for everything under `lib/`, `app/api/` and the providers
behind them. `AGENTS.md` §§5–12 hold the *decisions*; this file holds what was
built against them. Nothing here is a plan — a line lands after the work is
committed.

Started at build step 1 (prompt 37, 7 Aug 2026).

---

## Step 1 — the data layer and the phase-one schema

### The provisioned resource

Neon Postgres, provisioned through the §7.4 procedure before this prompt ran and
**not re-provisioned by it**:

| | |
| --- | --- |
| resource | `neon-purple-candle` |
| plan | `free_v3` |
| region | `iad1` |
| `auth` metadata | `false` — Better Auth (step 6) owns authentication; Neon Auth would have been a second one |
| project | `dgsloxx417s-projects/aetherfield` |

Provisioning state is read from `vercel integration list` and `vercel env ls`,
never from a file. `vercel env pull` put 17 variables into a gitignored
`.env.local`; only the two below are used by anything in the repository.

### The connection split

Two URLs, and using the wrong one fails silently rather than loudly.

| variable | host | who reads it |
| --- | --- | --- |
| `DATABASE_URL` | pooled (PgBouncer, the `-pooler` host) | `lib/db/client.ts` — the application, and only the application |
| `DATABASE_URL_UNPOOLED` | direct | `drizzle.config.ts` — migrations and Studio, and later `pg_dump`, logical replication, `LISTEN`/`NOTIFY` |

PgBouncer breaks session state, so a migration over the pooled host can fail
confusingly or leave a partial apply. The reverse mistake — the app on the
direct host — exhausts connections under Fluid concurrency.

Both are server-only. **No `NEXT_PUBLIC_*` exists in this project**, by §8.4.

### Packages

`pg` 8.22.0 · `drizzle-orm` 0.45.2 · `@vercel/functions` 3.8.0 · `server-only`
Dev: `drizzle-kit` 0.31.10 · `@types/pg` · `dotenv-cli` 11.0.0

**`pg`, not `@neondatabase/serverless`** — §7.2's correction to the
`vercel:vercel-storage` skill. Fluid Compute keeps instances warm long enough to
reuse TCP connections, which is the case the HTTP transport exists to work
around.

`attachDatabasePool` is exported unprefixed from `@vercel/functions`
(`experimental_attachDatabasePool` is the deprecated alias; both were read from
`node_modules/@vercel/functions/db-connections/index.d.ts`). It keeps the
instance alive long enough for idle connections to leave the pool.

### `lib/db/client.ts`

`import "server-only"` first, then a single exported `getDb(): Db` over a
module-level `let`. Three constraints, each of which is a silent failure if
dropped:

- **Lazy.** `next build` evaluates top-level module code, so a pool constructed
  at import time against an unset `DATABASE_URL` fails the build before any
  route renders. Verified — see the checks below.
- **No `Proxy`.** The lazy `Proxy` wrapper breaks any library that inspects the
  adapter object, and Better Auth (step 6) is one; the request chain hangs with
  no error.
- **Pooled URL only**, with a thrown `Error` naming `vercel env pull` when it is
  missing.

`Db` is exported as `NodePgDatabase<typeof schema>`, so step 2's query functions
type against the schema rather than re-deriving it.

### `lib/db/schema.ts` — the phase-one tables

Three tables, no auth tables (step 6 generates its own), nothing tenant-scoped.
All timestamps are `timestamp with time zone`; all ids are `uuid` defaulting to
`gen_random_uuid()`.

**Enums** — declared once here, imported everywhere (§9 rule 2). The TypeScript
unions `LeadSource` and `SubscriberStatus` are derived from `.enumValues`, so
step 2's Zod schema cannot drift from the database:

| enum | values |
| --- | --- |
| `lead_source` | `hero`, `nav`, `cta_band` |
| `subscriber_status` | `pending`, `confirmed`, `unsubscribed` |

**`lead`** — a demo request.

| column | type | null | default |
| --- | --- | --- | --- |
| `id` | `uuid` PK | no | `gen_random_uuid()` |
| `name` | `text` | no | |
| `email` | `text` | no | |
| `company` | `text` | no | |
| `message` | `text` | yes | |
| `source` | `lead_source` | no | |
| `created_at` | `timestamptz` | no | `now()` |
| `deleted_at` | `timestamptz` | yes | |

`company` is `NOT NULL` because the lead is a B2B demo request and the company
is the qualifying field; `message` is optional. Step 2's form is the place to
revisit that if the copy says otherwise. Index: `lead_created_at_idx` — the
submissions view (step 7) lists newest first.

**`subscriber`** — a newsletter address and its state.

| column | type | null | default |
| --- | --- | --- | --- |
| `id` | `uuid` PK | no | `gen_random_uuid()` |
| `email` | `text` | no | |
| `status` | `subscriber_status` | no | `'pending'` |
| `confirmation_token` | `text` | no | |
| `created_at` | `timestamptz` | no | `now()` |
| `confirmed_at` | `timestamptz` | yes | |
| `unsubscribed_at` | `timestamptz` | yes | |
| `deleted_at` | `timestamptz` | yes | |

A timestamp per transition, not just a current-state column (§9 rule 3). Unique
indexes: `subscriber_email_key`, `subscriber_confirmation_token_key`. One row
per address, so re-subscribing after an unsubscribe moves this row back to
`pending` rather than forking a second identity for the same person.

**`application`** — a job application.

| column | type | null | default |
| --- | --- | --- | --- |
| `id` | `uuid` PK | no | `gen_random_uuid()` |
| `job_slug` | `text` | no | |
| `name` | `text` | no | |
| `email` | `text` | no | |
| `message` | `text` | yes | |
| `cv_pathname` | `text` | no | |
| `cv_filename` | `text` | no | |
| `created_at` | `timestamptz` | no | `now()` |
| `deleted_at` | `timestamptz` | yes | |

`job_slug` is a **reference, not a foreign key** — jobs are typed constants in
`app/_content/jobs.ts` and there is no `job` table. Step 5 validates the slug
against `JOBS` at write time, and an application survives the role being closed
and removed from that file. `cv_pathname` is the private blob's pathname, which
is what `get()` takes to mint a short-lived signed URL; the bytes are never in
the database and the URL is never public. `cv_filename` is the applicant's own
filename, for display. Indexes: `application_job_slug_idx`,
`application_created_at_idx`.

**Applying to all three:**

- `created_at` on every table, `deleted_at` on every table. All three hold data
  a person can ask to have erased, so erasure is one write with an audit trail
  rather than a cascade. **Every read filters on `deleted_at`** — that is the
  obligation this column creates for steps 2, 4, 5 and 7.
- **Email is lowercase by constraint, not by convention.** Each table carries a
  `CHECK (email = lower(email))` — `lead_email_lowercase`,
  `subscriber_email_lowercase`, `application_email_lowercase`. A caller that
  forgets to lowercase gets a write error rather than a subscriber list that
  treats two casings as two people. On `subscriber` the constraint is what makes
  the plain unique index on `email` *be* uniqueness on the lowercased value.
- **Not tenant-scoped**, deliberately (§9 rule 6). Leads and applications belong
  to Aetherfield, not to a customer.

### The migration workflow

`drizzle.config.ts` → schema `./lib/db/schema.ts`, out `./lib/db/migrations`,
dialect `postgresql`, credentials `DATABASE_URL_UNPOOLED`, `strict` and
`verbose` on.

| script | command |
| --- | --- |
| `npm run db:generate` | `dotenv -e .env.local -- drizzle-kit generate` |
| `npm run db:migrate` | `dotenv -e .env.local -- drizzle-kit migrate` |
| `npm run db:studio` | `dotenv -e .env.local -- drizzle-kit studio` |

`dotenv -e .env.local --` is not optional: nothing but Next.js auto-loads that
file, and without it Drizzle Kit sees an undefined URL.

Migrations are code and are committed. **Never a hand-run `ALTER TABLE`.** The
first one is `lib/db/migrations/0000_empty_starjammers.sql` (the name is Drizzle
Kit's own), plus `meta/0000_snapshot.json` and `meta/_journal.json` — the
journal is how re-running becomes a no-op, so it is committed too.

### `.env.example`

Committed, names only. `.gitignore`'s `!.env.example` negation (added in commit
`84fc6ea`) is what stops `.env*` swallowing it; verified with `git add -n`, and
`.env.local` confirmed still ignored. It currently lists `DATABASE_URL` and
`DATABASE_URL_UNPOOLED` and is extended by the step that provisions each
remaining variable — never ahead of it.

### Verified, prompt 37

Every line below was produced by running the command.

- `npm run lint` → exit 0. `npm run typecheck` → exit 0.
- `npm run build` → the §8.1 route table unchanged: 17 prerendered pages,
  `/ /_not-found /about /careers /design-system /journal` ○ Static,
  `/article/[slug]` (6) and `/job-listing/[slug]` (3) ● SSG.
- **Prerender impact: none, measured.** Against a base worktree at `18041fc`
  with a freshly hard-linked `node_modules`, all **16 prerendered HTML files are
  byte-identical with only `.next/BUILD_ID` normalised**, and the 14 client
  chunks are byte-identical by sha1. No `drizzle`, `node-postgres` or
  `attachDatabasePool` string appears anywhere in `.next/static/chunks`. The
  base-worktree traps that made the first attempt of this comparison wrong are
  now in `docs/automation.md`.
- **`npm run build` with `.env.local` moved aside → exit 0.** This is the
  lazy-init trap, and it is the one failure mode that only shows on a clean
  deploy.
- **Migration applied**, then verified by querying `information_schema` and
  `pg_constraint` over the direct connection: the three tables, both enums with
  the values above, the three `CHECK` constraints, all eight indexes, and
  0 rows in every table.
- **Re-running `npm run db:migrate` is a no-op**, exit 0.
- No connection string in the diff — the staged change was grepped before
  committing, and no value from `.env.local` is quoted anywhere in this file.

### Timing note

Neon's free plan suspends an idle compute after 5 minutes and it is not
disableable below Launch, so the first query after an idle period pays a
cold start of a few hundred ms. That is expected behaviour, not a bug to chase.
No latency figure is recorded here because none was measured warm.

### What step 1 deliberately did not do

No queries (they land with the step that needs them), no server actions, no
route handlers, no forms, no auth tables, no phase-two entities, no seed data,
and no Neon branching setup for preview deployments — worth raising when preview
deploys start writing.

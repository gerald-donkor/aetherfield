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

---

## Step 6 — Better Auth, sign-in and sign-up

Implemented by prompt 38 on 7 Aug 2026, ahead of steps 2–5 at the user's
direction. `better-auth` and `@better-auth/drizzle-adapter` are both 1.6.26.
No Marketplace integration or second auth provider was provisioned.

### Server configuration

`lib/auth/server.ts` constructs Better Auth lazily over the existing pooled
`getDb()` handle and `drizzleAdapter(..., { provider: "pg", schema })`. The
complete runtime schema merges the phase-one application tables with the
generated auth tables; no `Proxy` wraps the database client.

Options set explicitly:

- email/password enabled with explicit 8–128 password limits;
- `requireEmailVerification: true`; account verification and password reset now
  send through step 3's email layer. The exact policy and completed public flows
  are recorded in the prompt-52 completion section below;
- a nullable user `role`, `input: false`, so public signup cannot submit or
  grant `staff` / `admin`;
- rate limiting enabled in every environment with `storage: "database"`;
- `plugins: [nextCookies()]`, last.

The catch-all mount is `app/api/auth/[...all]/route.ts`. It uses
`toNextJsHandler()` over a request-lazy function, so importing the route during
`next build` does not construct a pool or require secrets. This is Better
Auth's own handler only; it contains no application business logic.

`getCurrentAccount()` resolves the session from `await headers()`. It then asks
`lib/db/auth-queries.ts` to re-read the role from Postgres by user id on every
protected request. The session payload and cookie never authorise a staff
operation. A role value other than `staff` or `admin` is treated as no staff
role.

### Generated schema and migration

`npx auth@latest generate --config lib/auth/cli.ts --output
lib/db/auth-schema.ts --yes` generated the schema; no auth column or DDL was
hand-authored. The CLI cannot evaluate a module carrying `server-only`, so the
guards on the CLI entrypoint, auth module and its transitive DB client were
removed only for the generator process and restored immediately afterwards.

The generated tables are:

| table | purpose |
| --- | --- |
| `user` | name, unique email, verification state, image, timestamps, nullable non-input `role` |
| `session` | unique token, expiry, client metadata and cascading user reference |
| `account` | credential/provider record, password hash and cascading user reference |
| `verification` | expiring single-use verification values |
| `rate_limit` | persistent limiter key, count and last-request timestamp |

Drizzle Kit now reads both `lib/db/schema.ts` and
`lib/db/auth-schema.ts`. It generated
`lib/db/migrations/0001_first_rattler.sql`, which was applied over
`DATABASE_URL_UNPOOLED`. Re-running the migration is a no-op.

### Routes and enforcement

- `/sign-in` and `/sign-up` are static Server Component screens whose forms are
  client leaves. They use Better Auth's client API, lower-case email before
  submission, show handled generic failures, announce status and move focus to
  it. Signup produces a customer account with a null staff role.
- `/account` is the smallest honest signed-in destination: name, email and a
  sign-out control, with no dashboard or product data.
- Root `proxy.ts` matches `/account` only. `getSessionCookie()` performs the
  optimistic missing-cookie redirect; `/account` performs the authoritative
  server-side session/database check and redirects forged or expired sessions.

The actual Next 16.2 route table marks `/account` **dynamic**, not static:
authoritative session resolution uses the request-time `headers()` API. This
corrects prompt 38's incompatible expectation that all three new pages be
static; making `/account` static would remove the required server-side
enforcement. `/sign-in` and `/sign-up` are ○ Static, the auth handler and
`/account` are ƒ Dynamic, and every pre-existing marketing route retained its
previous ○ / ● marker.

### UI and CTA wiring

`Field` in `app/_components/primitives.tsx` is the shared label/input/hint/error
primitive. It uses the existing ink, border, surface, accent, font and type
tokens, exposes `aria-invalid` / `aria-describedby`, and is exhibited in
`/design-system`. No component library, root provider or GSAP was added.

The desktop and mobile nav `Get started` controls and the homepage's `Explore
the platform` control now navigate to `/sign-in`; `Request a demo` is unchanged
for step 2. The settled nav geometry, tint, blur and class strings are unchanged.

### Secrets, personal data and remaining gaps

`.env.example` adds names only: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, both
server-only. Vercel holds generated secrets for Production, Preview and
Development. Development also holds `BETTER_AUTH_URL=http://localhost:3000`
and `.env.local` was refreshed from it.

There is no deployment or assigned production domain yet, verified with
`vercel ls` and domain inspection. Production and Preview therefore do not yet
have an honest `BETTER_AUTH_URL`; add their deployed origins before deploying
auth rather than inventing one now. Rotation uses `BETTER_AUTH_SECRETS`
(plural), recorded but not configured.

Auth now stores a person's name, lower-cased email and password hash. Request
bodies, email addresses, passwords and secrets are not logged. BotID remains
the prompt-approved §8.2 gap until step 2 establishes it for public write paths;
database rate limiting is active in the meantime.

### Verified, prompt 38

- `npm run typecheck` and `npm run lint` exited 0.
- `npm run build` exited 0 with the route table described above. A second build
  with `.env.local` moved aside also exited 0, proving auth and the pool remain
  request-lazy. The first sandboxed env-less attempt failed only because
  `next/font` could not reach Google; the approved network retry passed.
- Parent-commit prerender comparison, after stripping RSC flight scripts and
  normalising CSS chunk names: `_global-error` and `_not-found` are identical;
  all marketing pages differ only by the approved desktop nav href; after that
  href is normalised, `/about`, `/careers`, `/journal`, all six articles and all
  three job listings are identical. `/` additionally swaps `Explore the
  platform` from button to link; `/design-system` additionally exhibits
  `Field`; `/sign-in` and `/sign-up` are new.
- A real synthetic signup returned 200, created one user and one credential
  account with `role=none`, and authenticated `/account` returned 200. Sign-out
  returned 200 and `/account` then returned 307; sign-in returned 200 and
  restored a 200. A forged session cookie reached the server page but was
  rejected with a redirect, proving the page does not trust the proxy check.
  The synthetic user was deleted afterwards; user, account and session counts
  for it all returned zero.
- `vercel env ls` confirmed `BETTER_AUTH_SECRET` and the Development
  `BETTER_AUTH_URL` by name. No value is quoted here.

---

## Step 6 extension — Google authentication on `/sign-up`

Implemented by prompt 41 on 7 Aug 2026 at the user's direction. This extends
the existing Better Auth work; it is not a new build step and adds no package,
route, table or migration.

### Provider and security configuration

`lib/auth/server.ts` now configures Better Auth's built-in Google provider from
the server-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` variables. The
auth factory remains request-lazy, so the production build does not construct
the provider or database pool while collecting routes. Google's default
`email profile openid` identity scopes are the only ones requested.

`account.encryptOAuthTokens: true` encrypts any access, ID or refresh tokens
Better Auth stores, using the existing auth secret. The installed generated
`account` schema already contains the provider identity and token columns, so
no schema generation or Drizzle migration was required.

Default verified-email account linking remains unchanged. Google was not added
to `trustedProviders`, different-email linking was not enabled, and Google
profile data is not configured to overwrite an existing local profile. The
non-input nullable role still applies to social signup, so the browser cannot
request `staff` or `admin`.

### Signup client leaf

`app/_components/auth/sign-up-form.tsx` adds a 52px full-width `Continue with
Google` control and `OR CREATE WITH EMAIL` separator above the existing fields.
The control uses the established white, ink, border, surface and accent tokens
and has hover, focus-visible, pending and disabled treatments. No Google SDK,
remote script, image, root provider or additional client boundary was added.

One discriminated pending state prevents Google and email attempts racing.
Google initiation calls `signIn.social()` with `/account` as the successful
destination and `/sign-up` as the error destination. A callback failure is
reduced to one generic live-status message; the machine-readable `error` and
provider `error_description` parameters are removed with `history.replaceState`
and never rendered. The existing status region receives focus. The route does
not use `useSearchParams`, so `/sign-up` remains static.

### Environment and callback state

`.env.example` records names and the callback rule only; it contains no value.
The real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` exist in `.env.local` and
Vercel Development. Vercel lists both as Development-only and non-sensitive;
its extra Sensitive mode is unavailable for Development variables. Production
and Preview deliberately do not have either variable because neither has an
honest `BETTER_AUTH_URL` yet.

The configured Development callback is exactly
`http://localhost:3000/api/auth/callback/google`. A live Better Auth initiation
returned 200 and generated that redirect URI, the three default identity
scopes, PKCE, state and a client id. Loading the generated authorization URL
reached Google's normal account surface with neither `redirect_uri_mismatch`
nor `invalid_client`. No client id, secret, state, verifier or token was printed
or recorded.

### Verified, prompt 41

- `npm run typecheck` exited 0 with `tsc --noEmit`; `npm run lint` exited 0
  with `eslint`.
- `npm run build` exited 0 on Next 16.2.12. `/sign-up` and `/sign-in` remain
  ○ Static; `/account` and `/api/auth/[...all]` remain ƒ Dynamic; every
  pre-existing marketing route retains its previous render mode.
- The clean parent-commit prerender comparison stripped RSC flight scripts and
  normalised generated chunk names. Seventeen HTML files — every marketing
  route, `/sign-in`, `/design-system`, `_not-found` and `_global-error` — are
  identical. Only `sign-up.html` changes, first at the inserted Google button.
  The gitignored Tailwind and Drizzle documentation snapshots were temporarily
  moved for the implementation build and restored before the result was
  trusted.
- Headless layout checks at 375px and 1280px measured the Google control at
  52px high, form widths of 287px and 504px, no horizontal overflow, and focus
  order Google, name, email, password, email submit. Both screenshots were
  inspected; the label, separator and focus geometry are unclipped.
- A synthetic OAuth error proved `/sign-up` removes its query, renders only the
  generic message and focuses the live-status region. This tests application
  handling, not a real denial at Google's consent screen.
- Email/password regression returned 200 for signup, authenticated `/account`,
  sign-out, sign-in and authenticated `/account` again. The synthetic user had
  `role=none` and one credential account. It was deleted afterwards; its user,
  account and session counts all returned zero.
- A complete new-user Google login, returning-user login and verified-email
  link were not exercised because no interactive Google test-account access
  was available. No Google-backed user or OAuth token was created during these
  checks; those three outcomes remain an operational browser check.

---

## Step 2 — demo-request capture, and the write path

Implemented by prompt 42 on 7 Aug 2026. **This is the step §5.2 calls
load-bearing: steps 4 and 5 copy the files below rather than inventing their
own.** Read this section before writing the newsletter or the job-application
form.

### The contract, in file order

The stage letters are `AGENTS.md` §10's.

| file | role | server-only |
| --- | --- | --- |
| `lib/validation/lead.ts` | the shared Zod schema, the `SubmitResult` type, the field-error record | **no — deliberately** |
| `lib/rate-limit/index.ts` | the Upstash client and limiter, lazily constructed | yes |
| `lib/db/lead-queries.ts` | `insertLead()` — the only caller of Drizzle for this table | yes |
| `app/_actions/demo-request.ts` | the action: stages a, b, c, e | yes (`"use server"`) |
| `app/_components/lead/demo-request-dialog.tsx` | the client leaf | client |
| `instrumentation-client.ts` | BotID's client half | client |

**A later form changes five of those six.** The one that does not is
`lib/validation/lead.ts`'s `SubmitResult` — import it, do not restate it.

### `lib/validation/` is not server-only, and must not import `lib/db/`

The schema is imported by the browser leaf *and* by the action, which is what
makes §10 rule 1 true rather than aspirational. It follows that it may never
read a secret.

**It also may not import `lib/db/schema.ts`, and this is not a style rule.**
That file calls `pgEnum` and `pgTable` at module scope, so importing it from a
browser-reachable module puts `drizzle-orm/pg-core` in `/`'s bundle. The
`source` discriminator is therefore composed onto the schema **in the action**:

```ts
const demoRequestSchema = demoRequestFieldsSchema.extend({
  source: z.enum(leadSource.enumValues),
});
```

The union is still never re-declared (§9.2 rule 2) — it is derived from the
database enum one layer up, on the server, where `leadSource` is already in
scope. Step 4 does the same with `subscriberStatus` if it needs it.

`source` is validated because it arrives from the browser like every other
field: a request may not write an arbitrary `lead_source` value. It is not a
user-facing field, so a failure on it produces no field error — a forged
request, not a typo.

The email is trimmed and lowercased **before** the format check, so a pasted
address with a trailing space is corrected rather than rejected, and `lead`'s
`lead_email_lowercase` CHECK can never be what catches a missed `toLowerCase()`
(§9.2 rule 4). Verified against Zod 4.4.3: `"  ADA@Example.COM "` parses to
`ada@example.com`, and a whitespace-only message parses to `undefined` rather
than `""` — `lead.message` is nullable and an empty string is not a message.

### The limiter — five per hour per IP, and it is a judgement

`Ratelimit.slidingWindow(5, "1 h")`, prefix `aetherfield:demo-request`,
`analytics: false`.

**Both numbers are a judgement, not a measurement**, and the front matter's
measured-or-judged rule applies: the form had never shipped when they were
chosen, so there was no traffic to fit against and nothing was measured. The
reasoning: a demo request is a considered act a person performs once, so five
per hour is far above any honest use and far below what makes the table worth
spamming. Sliding rather than fixed so an hour boundary is not a free refill for
a client that times its burst. **Revisit against real traffic; do not treat
these as fitted.**

The key is the caller's IP and nothing else — §8.3 rule 2 keeps names and
addresses out of every store that is not `lead` itself. The IP is read with
`ipAddress()` from `@vercel/functions`, which reads `x-real-ip` as Vercel Proxy
calculates it. **Not `x-forwarded-for`**: a client can write that header and
cannot write this one. It falls back to the literal `"unknown"`, which buckets
all unattributable callers together — deliberately conservative.

Redis and the limiter are constructed lazily, for the same reason `getDb()` is:
`next build` evaluates top-level module code, so a client built at import time
against unset variables fails the build before any route renders. Proven —
see the checks below.

**A rate-limit infrastructure failure fails closed**, returning the generic
error. An unlimited public write path is a worse outcome than a form that is
briefly unavailable, and §8.2 rule 4 requires the failure be visible rather than
a silent success.

### The action's stages

`a` BotID → `b` rate limit → `c` parse → `d` skipped, this path is public by
design (§11) → `e` write → `f` **absent, step 3 owns it.** No email is sent, no
template exists, and nothing is stubbed "to wire up later".

It returns `{ ok: true } | { ok: false, error, fieldErrors? }` and never throws
to the client. `z.flattenError()` produces the field errors — **not**
`error.flatten()`, which is deprecated in Zod 4.

Retry timing is rendered in words, not seconds: "Try again in 58 minutes".

**Nothing personal is logged anywhere on any path** — not the body, not the
address, not in a catch. There is no `console` call in the action at all, which
is the easiest form of that guarantee to verify.

### BotID — both halves, and no root provider

The package is **`botid`**. `@vercel/botid` does not exist on npm; it 404s.

- `next.config.ts` wraps the config in `withBotId()`, which adds the proxy
  rewrites that serve the challenge from this origin so script blockers cannot
  quietly disable it. Verified present in `.next/routes-manifest.json`.
- `instrumentation-client.ts` calls `initBotId()`. **This file rather than a
  component in `app/layout.tsx`**: Next 15.3+ supports it, and it is what lets
  BotID ship without the root provider §8.1 forbids. The README documents the
  layout component as the pre-15.3 path; do not take it.
- The protected paths are **page paths** — `/` and `/design-system` — because a
  Server Action POSTs to the page it was invoked from. A fourth trigger surface
  means editing this list too, or the action's check **fails** rather than
  passes.

**Honest scope:** `initBotId` is bundled into the shared client entry chunk, so
its script loads on **every** page, not only the two protected ones. Only the
listed paths are challenged.

**`/api/auth/*` is not covered, so prompt 38's gap on it stays open.** Covering
Better Auth's catch-all is a separate decision with its own failure modes, not a
side effect of this step.

### The dialog

`app/_components/lead/demo-request-dialog.tsx`, one component for both trigger
sites.

**It takes the settled `<Button>` over and adds no box**, exactly as `NavDrop`
and `FooterMotion` do — it renders the button itself with the same props, so the
class string is unchanged and nothing enters the measured layout. The `<dialog>`
is a sibling in a fragment, and its contents render only while open, so a closed
page carries one empty element.

**Native `<dialog>` + `showModal()`** supplies the focus trap, the inert
background, the top layer and Escape from the platform; none of them is
hand-rolled. The dialog's own open and close carry no animation and still do
not — the one piece of GSAP in the file arrived later, in prompt 45, and is
recorded below. Focus moves to the heading on open
rather than the first input, so the dialog is announced before the person is
dropped in a text box, and `onClose` returns focus to the trigger by every route
out — button, Escape and backdrop click alike. A click landing on the `<dialog>`
element itself is the backdrop signal, since the backdrop is not a child.

The announcement copies `sign-up-form.tsx`'s mechanics rather than inventing a
second pattern: `role="status"`, `aria-live="polite"`, `tabIndex={-1}`, focused
on message change, and legible without colour — every error carries a square
bullet and a border, no colour alone.

**Success swaps the body in place**, no redirect (§10 rule 5): the page keeps
its scroll position and its motion state.

### The close button's fitted spin, fan and blurred backdrop — prompts 45 and 49

A design pass over the leaf began in prompt 45 and was refitted in prompt 49
against `/home/gdk26/Videos/Screencasts/Screencast_20260809_172923.webm`. It
touches no stage of the write path: no action, schema, query, email or
environment variable changed.

**GSAP here is an explicit deviation from §7.5**, which bars GSAP from backend
UI. The user was shown the conflict, offered a CSS-only alternative that keeps
§7.5 intact, and chose GSAP — the override §1 rule 1 provides for. The §7.5
bullet in `AGENTS.md` was amended in place to record the grant and point here.

**The deviation costs no bundle, and this was checked rather than assumed.**
`chrome.tsx` already pulls `NavDrop` and `FooterMotion`, so GSAP was in every
affected route's chunks before this change. Measured on the pre-change build by
grepping each route's referenced chunks: `/` 2 chunks containing `gsap`,
`/journal` 2, `/about` 2, `/design-system` 1. After the change the per-route
chunk **counts are unchanged on all 18 prerendered pages**.

**The spin is now measured.** The 481×230, 60 fps reference has a video stream
only. Crop the 26×26 glyph, fit each grey frame against a 4× supersampled
synthetic two-bar `✕`, mask the black cursor at `<150/255`, and unwrap the
result modulo 90 degrees. All three clean windows give one continuous
**360-degree clockwise** turn over **0.450 s** (27 frames), rest to rest. The
earlier "four oscillations" reading was the glyph's 90-degree symmetry aliasing
one full turn into four identical quarters and is superseded.

The scale fit searched 0.9–1.5 and selected **1.0 on every frame**. The shipped
**1.35** magnify is therefore a **judgement**, retained as a separate persistent
hover/focus affordance: it says the target remains live after the measured
one-shot spin has returned upright. Its **0.22 s** duration and imported `EASE`
remain the prompt-45 judgement. The spin is pointer-enter only, never reversed,
and re-entry calls `restart()` rather than stacking.

The fitted progress is symmetric: `p(0.5) = 0.500` to within one frame. RMS
residuals by clean window were:

| ease | W2 | W3 | W4 |
| --- | ---: | ---: | ---: |
| `linear` | 0.0730 | 0.0639 | 0.0808 |
| `sine.inOut` | 0.0265 | 0.0399 | **0.0188** |
| `power1.5.inOut` | 0.0300 | **0.0341** | 0.0307 |
| `power2.inOut` | 0.0339 | 0.0489 | 0.0173 |
| `power3.inOut` | 0.0743 | 0.0884 | 0.0579 |

`linear` and `power3.inOut` lose by 2–4× in every window and are excluded. The
remaining three are inside the duplicated-frame noise floor; each wins a
different window. The shipped `power1.5.inOut`-shaped function is therefore a
**judgement on that measured floor**, chosen because it never loses badly.
GSAP has no parseable fractional-power string, so the symmetric power function
is authored directly rather than silently falling back to an out ease.

- `useGSAP` takes `{ dependencies: [open], revertOnUpdate: true, scope }` —
  the button mounts *after* the hook first runs, because the dialog body
  renders only while `open` is true, and the body no-ops on a null ref.
- `gsap.matchMedia()` with **both** conditions named. Under `reduce` no tween is
  created at all and the ref stays null, so hovering does nothing — not a
  zero-duration tween. Verified: the button's computed `transform` is `none`
  through hover, leave, focus and blur under `prefers-reduced-motion: reduce`.
- No `contextSafe`, which is banned outright; the handlers are React props and
  the tween is created inside the context, so `mm.revert()` owns it.
- **Two paused `fromTo` tweens compose on one transform.** Scale plays/reverses;
  rotation restarts and completes. Production-browser matrices were
  `matrix(1, 0, 0, 1, 0, 0)` at rest,
  `matrix(-0.550541, -1.23264, 1.23264, -0.550541, 0, 0)` mid-spin, and
  `matrix(1.35, 0, 0, 1.35, 0, 0)` hovered after completion. Leaving settles
  back to the identity matrix, so the 360-degree turn leaves no residual angle.
  Re-entering mid-spin moved from a 153-degree matrix to about 29 degrees after
  40 ms, proving restart rather than accumulation.
- A pointer leaving a **focused** button does not settle it, so the pointer
  cannot undo the keyboard's state.

**The fan is entirely judged.** The reference has no audio stream, so none of
its sound numbers is measured. On pointer enter only, a cached one-second white
noise buffer feeds a bandpass whose centre ramps **320 → 1500 → 320 Hz** across
the measured **0.45 s** spin (`Q = 1.8`). A sine blade LFO ramps
**18 → 72 → 18 Hz** at depth **0.35** into the chop gain. The output envelope
attacks over **0.06 s**, peaks at the already-settled **0.05**, then falls to the
positive **0.0001** floor; MDN confirms that an exponential ramp target must be
positive. These are sound-design judgements on the user's "spinning or whinning
sound like a fanning sound" brief, not facts extracted from the silent file.

One lazily created `AudioContext` is closed on unmount and its context-owned
buffer is discarded. The running source is stopped before another begins, so
re-entry cannot stack. Five rapid entries created **5 buffer sources** and
**5 blade oscillators**; every node was stopped. Instrumentation saw **9 source
`stop()` calls** (five scheduled endings plus four interruptions) and **10 blade
`stop()` calls** (five scheduled endings plus the source `onended` cleanup).
Focus alone created **0** sources. No input device is opened and no permission
is requested.

Production-browser verification also found `transform: none` through hover,
leave, focus and blur under `prefers-reduced-motion: reduce`, with **0** audio
sources. Closing and reopening left identity at rest and a composed scaled spin
on hover, exercising `revertOnUpdate`. There were no page or console errors.

**The backdrop.** `backdrop:bg-ink/40` became
`backdrop:bg-ink/25 backdrop:backdrop-blur-md`. Both values are **judgements** —
the reference screenshot shows the state *before* the blur and only marks where
it belongs — and the tint drops because the blur now does the separation work;
keeping 40 % over a blur makes the page unreadable rather than deferred.
`backdrop-blur-md` is 12px, read from the Tailwind v4 docs snapshot
(`backdrop-filter-blur.mdx`), and confirmed as computed
`backdrop-filter: blur(12px)` / `background-color: oklab(0 0 0 / 0.25)` in the
browser. **No `::backdrop` transition**: animating one needs `@starting-style`
and `transition-behavior: allow-discrete`, and the dialog has no open/close
transition to hang it on. That is a separate change with its own measurement.

**Prompt 49's prerender impact is measured as none.** Build-before/build-after,
with RSC flight scripts stripped and `BUILD_ID` plus generated chunk names
normalised, found all **18 of 18 pages markup-identical**. `/` and
`/design-system` — the only routes carrying this dialog — have identical markup
too because the close button is absent from the closed `open ? … : null` branch.
The route table, CSS chunk, and every prerendered route's count of chunks
containing `gsap` are unchanged.

### `Field` gained a textarea, and it was extended rather than forked

`app/_components/primitives.tsx` now exports `TextareaField` alongside `Field`.
Both wrap the same non-exported `FieldFrame` (label, hint, error) and share the
same `CONTROL_BASE` class string, so there is no second field vocabulary.

**Sizing is deliberately not in `CONTROL_BASE`** and is prefixed by each
variant: it is what keeps `Field`'s emitted class string byte-identical to the
one `/sign-in` and `/sign-up` already prerender. Reordering it would have
changed two settled pages for nothing. The `/design-system` exhibit is not
extended for it in this prompt — the dialog is the exhibit.

### `/about` and `/journal` opt out, and `CtaBand` takes an explicit prop

`CtaBand` gained `demo?: boolean`, **opt-in, defaulting to false**. Inferring it
from the `action` string would make the wiring a property of a copy string, and
three of the four call sites are not demo bands: `/journal`'s is the
newsletter's (step 4) and `/about`'s reads "View open roles".

The user decided on 7 Aug 2026 that `/about` opts out too. Prompt 42's trigger
table had listed it as a demo trigger; a button labelled "View open roles"
opening a demo form is a behaviour bug, and `AGENTS.md` §5.2's step 2 row is
corrected in the same change. `/about` and `/journal` needed **no edit at all**
as a result, which is the strongest possible guarantee that their prerendered
HTML is unchanged.

Presentation was settled before implementation: a modal dialog, not an inline
disclosure (it pushes the hero dashboard and the band's measured height) and not
a `/demo` route (it discards the page's scroll and motion state).

### `lead_source`'s `nav` value stays unwritten

The nav's "Get started" goes to `/sign-in` (step 6), so nothing writes `nav`. It
stays in the enum for a possible mobile-drawer demo CTA. Dropping it is a
migration and it is not this step's.

### Environment and personal data

The resource is **`upstash-kv-camel-lamp`**, product `upstash/upstash-kv`
("Upstash for Redis"), `primaryRegion=iad1`, provisioned 7 Aug 2026 after the
user accepted the marketplace terms in the browser — the CLI returns
`integration_terms_acceptance_required` and does not wait, so that handoff is
mandatory and must not be worked around (§7.4 rule 5). No `--plan` was passed;
the CLI's `--help` does not enumerate this product's plan IDs.

**The variable names are `KV_REST_API_URL` and `KV_REST_API_TOKEN`, and this
contradicted `AGENTS.md` §8.4, which predicted `UPSTASH_REDIS_REST_URL` /
`_TOKEN`.** §8.4 was corrected in the same change (§12 rules 6 and 8). The
distinction is live rather than cosmetic: **`Redis.fromEnv()` looks for the
`UPSTASH_*` names and finds nothing here**, which is why `lib/rate-limit/`
constructs the client explicitly. Use the write token —
`KV_REST_API_READ_ONLY_TOKEN` is also set and a limiter counts. `KV_URL` and
`REDIS_URL` are the TCP endpoints and are deliberately unused; the REST client
is what suits Fluid Compute.

Both are server-only. **BotID needs no environment variable** — the challenge is
proxied through the app's own origin. No `NEXT_PUBLIC_*` was added; phase one
still has none.

Stored: name, work email, company, an optional message and the source — exactly
`lead`'s existing columns. No new column, no migration; `npm run db:generate`
reported "No schema changes, nothing to migrate".

**Retention is stated and nothing enforces it yet.** The intent is that a lead
is kept while it is an active sales conversation and soft-deleted on request or
when it goes cold, through `lead.deletedAt`, which exists for exactly that. No
scheduled deletion, no retention window and no erasure endpoint is implemented;
an erasure request today is a manual `UPDATE`. Step 7 is where a real control
would land.

### Two API traps hit during implementation

Both cost a debugging cycle and neither is guessable from the docs.

**`ipAddress()` from `@vercel/functions` must be handed `{ headers }`, not the
headers object.** Its implementation is
`const headers = "headers" in input ? input.headers : input`, and Next 16's
awaited `headers()` result *has* a `headers` property that is not itself a
`Headers` — so the bare call takes the Request branch and throws
`TypeError: headers.get is not a function`, surfacing as a 500 and a "couldn't
reach the server" state in the dialog. Wrapping it as
`ipAddress({ headers: await headers() })` hits the documented Request-shaped
branch. Step 4 and step 5 copy the wrapper.

**Focus-on-open has to run in an effect.** The dialog's body renders only once
`open` is true, so `headingRef` is still null inside the click handler and
`showModal()` leaves focus on the `<dialog>` element. Measured before the fix:
`document.activeElement` was `DIALOG`; after, `demo-request-heading`.

### Verified, prompt 42

Every result below was produced by running the command, on 7 Aug 2026.

- `npm run lint` exited 0 with no output; `npm run typecheck` exited 0.
- `npm run build` exited 0 on Next 16.2.12. **The route table is unchanged**:
  `/`, `/about`, `/careers`, `/design-system`, `/journal`, `/sign-in`,
  `/sign-up` all ○ Static; the six articles and three job listings ●;
  `/account` and `/api/auth/[...all]` ƒ, as they already were. No route became
  dynamic.
- **Prerender diff** against a clean `../aetherfield-base` worktree at the
  parent commit `7f37b48`, with RSC flight scripts stripped and generated chunk
  names normalised. **16 of 18 pages are markup-identical** with unchanged
  script and stylesheet counts: `/journal`, `/careers`, all six articles, all
  three job listings, `/about`, `/sign-in`, `/sign-up`, `_not-found`,
  `_global-error`. The only differences are **one empty `<dialog>` added per
  trigger** — two on `/`, one on `/design-system`. A tag-level diff of
  `index.html` shows `Request a demo</button>` as *unchanged context* on both
  sides: the buttons' class strings are byte-identical, as §8.1 requires. The
  gitignored Tailwind and Drizzle doc snapshots were mirrored into the base
  worktree first, per `docs/automation.md`.
- `npm run db:generate` → "No schema changes, nothing to migrate".
- **`npm run build` with `.env.local` moved aside exited 0**, proving the lazy
  construction in `lib/rate-limit/` holds the guarantee `getDb()` does.
- **A real submission wrote a real row.** Driven through a headless browser
  against the dev server. `"Prompt42.Check@Example.COM"` was stored as
  `prompt42.check@example.com` — lowercasing verified end to end, not just in
  the schema — with `source = hero` and the message intact. The dialog swapped
  to "Request received" in place, no navigation.
- **The rate limit rejects, with retry timing.** A burst past the threshold
  returned, verbatim: `That's a few too many requests. Try again in 15
  minutes.` The count was consistent with a limit of 5 — earlier valid and
  rejected-at-parse requests had already consumed tokens, which confirms stage
  b runs *before* stage c as §10 rule 3 requires.
- **An invalid submission was rejected with per-field errors** and wrote no
  row: `Enter your name.`, `Enter a valid work email address.`,
  `Enter your company.`, announced through the live region, heading unchanged.
- **A forged `source` is refused.** The Server Action's POST body was rewritten
  in flight, `"hero"` → `"superuser"`. The action returned "Check the marked
  fields and try again." and **no row was written** — confirmed by query.
- **Nothing personal reached the logs.** Grepping the dev server log for every
  test address, name and company returned **0** occurrences. There is no
  `console` call anywhere in `app/_actions/`, `lib/rate-limit/`,
  `lib/db/lead-queries.ts` or `lib/validation/`.
- `vercel env ls` shows `KV_REST_API_URL` and `KV_REST_API_TOKEN` present for
  Production, Preview and Development. Names only; no value is quoted here.
- The staged change was grepped for connection strings and tokens before
  committing: no match.
- **All four test rows were deleted afterwards** and `lead` returned to 0 rows.

**Not verified, and why.** BotID's real classification was never exercised — it
returns `HUMAN` in development ("[Dev Only] Without setting the
developmentOptions.bypass value, the bot protection will return HUMAN") and a
production build run from localhost cannot complete a real challenge. That its
wiring is correct is established by the challenge rewrites being in
`routes-manifest.json` and the protect list being in the shipped client chunk;
that it actually *blocks a bot* is an operational check on a deployment.

---

## Step 3 — transactional email, and §10 stage f

Implemented by prompt 43 on 7 Aug 2026. **This is the second load-bearing step
(§5.2): step 2 set the pattern every later form copies, and this sets the
pattern every later email copies.** Steps 4 and 5 import `lib/email/`'s send
helper rather than calling `resend` directly.

### Resend is NOT provisioned through the Marketplace, and that is a decision

`vercel integration discover --category messaging` returns exactly one product
— `Resend email`, slug `resend/resend-email` — as §7.2 recorded. Then
`vercel integration add resend --help` reports:

```
  Metadata options for "resend":
    domain (required)
      Domain for sending emails through Resend. Note: you must own a domain to be able to send.
    region (required)
      Options: us-east-1, eu-west-1, sa-east-1, ap-northeast-1   Default: us-east-1
  Available billing plans for "Resend email":
    free   Free (0.00)   pro    Pro ($20.00/month)   scale  Scale ($90.00/month)
```

**`domain` is required at provisioning time and Aetherfield owns no domain** —
the same no-deployment, no-assigned-domain finding prompt 38 recorded above.
Prompt 43's plan had assumed the Marketplace resource could be created without
one and the sandbox sender used until a domain landed; the CLI does not allow
that. Inventing a domain was refused (§12 rule 9).

The user's decision, 7 Aug 2026: **create the Resend account directly and add
`RESEND_API_KEY` by hand**, rather than pause the step and leave steps 4, 5 and
7 blocked. Region `us-east-1` was chosen for whenever the Marketplace route
does open, matching the Neon resource's `iad1`.

**This is a recorded deviation from §7.4 and §7.5, not an oversight.** It is the
one provider in this project not provisioned through the resolution procedure,
and the reason is that the procedure is unsatisfiable without a domain. **When a
domain is acquired, the correct move is to provision through
`vercel integration add resend --plan free -m domain=<domain> -m region=us-east-1`
and drop the hand-added variable** — nothing in `lib/email/` changes, because
the only thing that changes is where `RESEND_API_KEY` comes from.

### The sending domain is an unclosed prerequisite for deploying

`lib/email/config.ts` sends from `Aetherfield <onboarding@resend.dev>`, Resend's
sandbox sender. **It delivers only to the Resend account's own address**; every
other recipient is refused with a 403 (`authorization_error`), per the `resend`
skill's mistakes table, entries 11 and 12.

Before this can be deployed:

1. a domain must be acquired and verified in Resend;
2. **SPF, DKIM and DMARC must be published** for it — Gmail and Yahoo reject
   unauthenticated bulk mail outright (`email-best-practices`,
   `deliverability.md`);
3. `FROM` in `lib/email/config.ts` becomes `Aetherfield <hello@<domain>>`. The
   `from` domain must **exactly** match the verified one — verifying
   `send.example.com` and sending from `user@example.com` is a 403.

Until then the internal notification works end to end and the requester's
confirmation does not reach a requester. **Step 4 needs one thing more**: the
newsletter is marketing, not transactional, so it carries `List-Unsubscribe` and
`List-Unsubscribe-Post` and a working one-click unsubscribe (§8.3 rule 3). The
demo-request confirmation deliberately carries neither — see below.

### The contract, in file order

Step 2's table, extended. The stage letters are `AGENTS.md` §10's.

| file | role | server-only |
| --- | --- | --- |
| `lib/validation/lead.ts` | the shared Zod schema, the `SubmitResult` type, the field-error record | **no — deliberately** |
| `lib/rate-limit/index.ts` | the Upstash client and limiter, lazily constructed | yes |
| `lib/db/lead-queries.ts` | `insertLead()` — the only caller of Drizzle for this table | yes |
| `lib/email/config.ts` | `FROM`, `internalRecipient()`, `replyTo()` — the only place an address is decided | yes |
| `lib/email/send.ts` | `sendEmail()` — the lazy Resend client, both rendered parts, the typed outcome | yes |
| `lib/email/templates/*.tsx` | the two messages | **no — deliberately** |
| `lib/email/demo-request.ts` | `sendDemoRequestEmails()` — stage f for this one flow | yes |
| `app/_actions/demo-request.ts` | the action: stages a, b, c, e, f | yes (`"use server"`) |
| `app/_components/lead/demo-request-dialog.tsx` | the client leaf | client |
| `instrumentation-client.ts` | BotID's client half | client |

**A later form changes seven of those ten.** The three it does not are
`lib/validation/lead.ts`'s `SubmitResult`, `lib/email/config.ts` and
`lib/email/send.ts` — import them, do not restate them. Step 4 adds
`lib/email/templates/newsletter-*.tsx` and a `lib/email/newsletter.ts` beside
`demo-request.ts`; it does not touch `send.ts`.

> **Corrected by prompt 47, in the change that falsified it** (§12 rule 8).
> Step 4 touched all three of those, and the prediction was wrong in a
> different way each time. `send.ts` gained an optional `headers` passthrough,
> because marketing mail needs `List-Unsubscribe` and a transactional
> confirmation does not — the paragraph above could not have known that,
> because step 3 sent no marketing. `config.ts` gained `appBaseUrl()`, because
> an email carrying a link needs an absolute origin and step 3's two messages
> carried none. And `SubmitResult` moved out of `lib/validation/lead.ts` to
> `lib/validation/result.ts`, because the newsletter needs the same shape keyed
> by a different field set — the name and the meaning at the old import path are
> unchanged, so "import it, do not restate it" held even as the file did not.
> The rule the sentence was really making is intact; only its file list was
> stale. See step 4 below.

### `templates/` has no `server-only`, and that is deliberate

§8.4 puts `import "server-only"` on every `lib/` module that touches a secret.
The templates touch none — they are pure presentation over props. Keeping them
importable outside the `react-server` export condition is what lets them be
rendered and inspected on their own: `server-only`'s `index.js` throws
unconditionally under any other condition, so a template carrying it cannot be
rendered by any tool that is not the Next.js server bundle. `config.ts`,
`send.ts` and `demo-request.ts` all read a secret or reach the network, and all
three carry it.

### Two API facts, both verified against `node_modules/` and both contradicting a skill

**The Resend SDK does not generate a plain-text part.** `resend@6.18.1`,
`dist/index.mjs:231-233`, is `if (email.react) { email.html = await render(email.react); email.react = void 0; }`
— it sets `html` and sends **no `text` at all**. The `react-email` skill states
"The Resend Node SDK automatically handles both HTML and plain-text rendering";
against the installed version it does not. `lib/email/send.ts` therefore renders
**both** parts itself, with `render(el)` and `render(el, { plainText: true })`,
and never passes `react`. A plain-text alternative is required by
`email-best-practices`' accessibility checklist, so this is not a nicety.

**The SDK returns `{ data, error }` and does not throw for API errors.** The
`try` around the send in `send.ts` is for transport failures (DNS, a dropped
socket), which do throw. Both paths are handled; neither escapes.

### `waitUntil`, not `await` — and it is a judgement

`app/_actions/demo-request.ts` hands `sendDemoRequestEmails(...)` to `waitUntil`
from `@vercel/functions` rather than awaiting it.

**Judged, not measured.** There is no deployment, so no send latency was
measured and nothing here is fitted. The reasoning: the dialog swaps to its
success state on the action's result, and making a person wait on a third party
for work §10 rule 4 defines as best-effort is backwards — the lead is already
committed by then.

Verified behaviour, from `@vercel/functions@3.8.0`: `wait-until.js` is
`getContext().waitUntil?.(promise)` and `get-context.js` is
`globalThis[Symbol.for("@vercel/request-context")]?.get?.() ?? {}`. **Outside a
Vercel request context the call is a no-op and the already-started promise
simply floats**, which is why the sends are still observable against
`next dev` — that is how the checks below were run. `sendDemoRequestEmails`
therefore wraps its own body in `try`/`catch`, because an escaping rejection
would be unhandled rather than caught by a caller.

### Idempotency: used, keyed on `lead.id`

`<event-type>/<entity-id>`, the format the `resend` skill documents:
`demo-request-confirmation/<lead.id>` and `demo-request-notification/<lead.id>`.
Keys expire after 24 hours, max 256 characters; the same key with the same
payload returns the original response without resending, and with a *different*
payload returns 409.

**`insertLead()` was changed to return the new row's id** for this. `lead.id` is
the right entity: two genuine requests are two rows and key differently, so both
send, while a retry of one request cannot double-send. A hash of the address
would have wrongly collapsed two real requests from the same person. There is no
retry loop in phase one (§10 rule 4, and the "no retry queue" non-goal), so the
key is insurance rather than load-bearing today.

### The two templates

Both are single-column, inline-styled, and **not a design system** (§7.5). The
`react-email` `Tailwind` wrapper is deliberately unused: its classes have to be
inlined at render time, which pulls the whole `tailwindcss` package into the
server bundle, and two plain messages do not earn that. The four colour
literals in `lib/email/templates/shared.tsx` are copied from `app/globals.css`'s
`@theme` and are the only place in the repository they are restated.

| template | to | subject |
| --- | --- | --- |
| `demo-request-confirmation.tsx` | the requester | `Your Aetherfield demo request` |
| `demo-request-notification.tsx` | `LEAD_NOTIFICATION_EMAIL` | `Demo request — <company>` |

The confirmation's second paragraph is the dialog's own success copy verbatim,
so the screen and the inbox do not say two different things. **It carries no
unsubscribe, and that is correct**: `email-best-practices`' `email-types.md`
classifies a confirmation of a user-initiated action as transactional, and puts
an unsubscribe on one in the "problematic hybrid" category. Step 4's newsletter
is the marketing path.

The notification carries the lead's name, work email, company, message **and
`source`** — the whole reason `lead_source` exists (§9.1) — and sets `replyTo`
to the requester's own address, so replying in the inbox reaches the person.

**No domain is named in the copy.** Aetherfield has none, and a fabricated
address in front of a real person is exactly §12's failure mode.

Accessibility, verified from the rendered HTML rather than asserted:
`<html dir="ltr" lang="en">`, a `<title>` carrying the preview text (not the
brand name), `dir`/`lang` repeated on `<body>` because several clients strip
them from `<html>`, `role="presentation"` on every layout table React Email
emits, exactly one `<h1>`, no images and no links (so no `alt` and no link-text
question), body text `#000000` on `#ffffff` and the muted `#6c6c6c` at 5.32:1 —
both past WCAG AA's 4.5:1.

### Environment and personal data

`.env.example` adds two names: `RESEND_API_KEY` and `LEAD_NOTIFICATION_EMAIL`.
Both server-only. **No `NEXT_PUBLIC_*` was added; phase one still has none.**
`LEAD_NOTIFICATION_EMAIL` unset is a supported state — the notification is
skipped with a log line naming no address, not crashed and not sent to a guessed
fallback. §8.4's table is extended for it in the same change.

**This step transmits personal data to a third party for the first time in this
project's history.** On every successful demo request, the requester's name,
work email, company and free-text message go to Resend over TLS. Resend retains
them in its own logs under its own policy; **we control none of that retention
and have configured nothing about it.** No Resend webhook, no delivery-event
handler, no contacts or audiences — this project sends and never receives
(`docs/skills.md` records `agent-email-inbox` as deliberately excluded).

**Stores nothing new.** No column, no table, no send-audit table, no migration.

The email is unreachable by an unvalidated request: it runs only after BotID,
the rate limit, the schema and the insert have all passed, which is a direct
consequence of §10's a-b-c-then-write ordering. **The existing five-per-hour-per-IP
limiter therefore also caps the send rate at five per hour per IP.** That is the
mail-amplifier control, and it is worth naming the risk plainly: the
confirmation goes to an attacker-supplied address, so this endpoint is a
potential relay. Five per hour per IP is judged sufficient for a marketing
site's demo form and, like the limit itself, **is a judgement and not a
measurement** — revisit it against real traffic rather than treating it as
fitted.

### Verified, prompt 43

Every result below was produced by running the command, on 7 Aug 2026.

- `npm run typecheck` exited 0 with no output; `npm run lint` exited 0 with no
  output.
- `npm run build` exited 0 on Next 16.2.12. **The route table is unchanged**:
  `/`, `/about`, `/careers`, `/design-system`, `/journal`, `/sign-in`,
  `/sign-up` ○ Static; the six articles and three job listings ●; `/account`
  and `/api/auth/[...all]` ƒ, as they already were. **No route became dynamic.**
- **Prerender impact is `none`, and it was verified rather than assumed.**
  `git diff --name-only -- app/` returns exactly one path,
  `app/_actions/demo-request.ts`. No component, no page and no client module
  changed, so no HTML diff was required under prompt 43's own condition.
- **`npm run build` with `.env.local` moved aside exited 0** with the same route
  table, proving `lib/email/`'s lazy client holds the guarantee `getDb()` and
  the limiter do.
- **The templates render, and both parts exist.** Rendered standalone through
  `react-email`'s `render()`. The confirmation's plain-text part, verbatim:

  ```
  Aetherfield

  WE HAVE YOUR DEMO REQUEST

  Ada Whitfield, thank you for the request.

  Someone from the team will be in touch to arrange a walkthrough of how
  Aetherfield fits your reporting. You can reply to this message directly if
  there is anything you would like us to cover.

  You are receiving this because you requested a demo on the Aetherfield
  website. It is a one-off confirmation, not a subscription.
  ```

  The notification's plain-text part carries every field including
  `Source / Homepage hero`.
- **A failed send does not fail the write.** Forced with
  `RESEND_API_KEY=re_invalid_key_for_check_4` against the dev server. The
  action returned `1:{"ok":true}` over the wire; the row landed as
  `47f40b0b-3aa1-497b-9f2e-fee71114bc0c` with the address stored lowercased and
  `source = hero`; and both sends logged and nothing else:

  ```
  [email] send failed for lead 47f40b0b-…: demo-request-confirmation:validation_error
  [email] send failed for lead 47f40b0b-…: demo-request-notification:validation_error
  ```

  No address, no subject, no body — the template name and Resend's error class.
  The test row was deleted afterwards (`deleted 1`).
- **`lib/email/` logs nothing personal**, but **the grep is not zero, and step
  2's claim above is now stale.** Next 16.2.12's dev server traces Server Action
  *arguments*, so the dev log contains:

  ```
  └─ ƒ submitDemoRequest({"company":"Check Four Ltd","email":"Prompt43.Check4@Example.COM", …}) in 13536ms app/_actions/demo-request.ts
  ```

  That is framework dev-only instrumentation, not application logging, and it
  does not exist in a production build. §8.3 rule 2 binds our code, and our
  code's only output is the two `[email]` lines above. **Do not repeat step 2's
  "grepping the dev server log returned 0" as a check on Next 16** — it will not
  be 0 for any Server Action that takes arguments.
- The staged change was grepped for an API key and for a connection string
  before committing: no match.
- **A real send, end to end.** Against the dev server with a live
  `RESEND_API_KEY` and `LEAD_NOTIFICATION_EMAIL` set. The action returned
  `1:{"ok":true}`; the row landed as `f4c004bc-3c8b-482c-9977-9229eaf9c686`
  with `source = cta_band`; and **the dev log contains zero `[email]` lines**,
  which is the proof both sends were accepted — `sendEmail` emits a failure
  line for a render failure, a Resend `error`, a missing `data.id` *and* a
  transport throw, so silence is the only success path. The test row was
  deleted afterwards and `lead` returned to **0 rows**.
- **The key is scoped to sending, confirmed without echoing it.**
  `GET https://api.resend.com/emails` returned
  `{"statusCode":401,"name":"restricted_api_key","message":"This API key is
  restricted to only send emails"}` — a valid key with sending-only permission,
  which is the correct scope for this project (`emails.send` is the only call
  `lib/email/` makes). It also means Resend's email list and logs endpoints are
  not readable with this key, so **delivery was verified from the send path and
  the recipient's inbox, not from Resend's API.**
- **Both messages arrived, and the received side was inspected**, not just the
  send. In Gmail, from `Aetherfield <onboarding@resend.dev>`, both in **Inbox**
  rather than Spam:

  | | confirmation | notification |
  | --- | --- | --- |
  | subject | `Your Aetherfield demo request` | `Demo request — Prompt43 Check3` |
  | `<h1>` | `We have your demo request` | `New demo request` |
  | first line | `Gerald Donkor, thank you for the request.` | `Reply to this message to reach Gerald Donkor.` |

  The wordmark, the heading, the body paragraphs, the horizontal rule and the
  muted footer all render as authored; the em dash in the notification's
  subject survived; and the notification's `NAME` / `WORK EMAIL` / `COMPANY` /
  `SOURCE` / `MESSAGE` labels render in the intended order.

  **The Inbox placement is weak evidence and must not be read as
  deliverability.** It was sent to the Resend account holder's own address from
  a shared sandbox sender — no domain of ours, no SPF, DKIM or DMARC of ours.
  Real deliverability is unmeasurable until the domain gap above is closed.
- **The requester's address had to be the Resend account address.** Both
  messages were addressed to the account holder, because the sandbox sender
  refuses everyone else — the domain gap above, demonstrated rather than
  described. On a verified domain the confirmation goes to whoever filled the
  form and nothing in the code changes.

**Not verified, and why.** The Marketplace provisioning path was never
exercised — it is unsatisfiable without a domain (above). Resend's delivery,
bounce and complaint webhooks are out of scope (phase one sends and never
receives). And, as at step 2, **BotID's real classification is still an
operational check on a deployment**: it returns `HUMAN` in development.

---

## Step 6 extension — Google on `/sign-in`, and the mark on both auth cards

Implemented by prompt 44 on 7 Aug 2026 at the user's direction, from a
screenshot of `/sign-in` with the auth card circled. Two things were asked for:
Google single sign-on on `/sign-in`, which did not exist; and the Google logo
displayed properly on that control **and** on `/sign-up`'s existing one, which
was text only. Like prompt 41 this extends committed step 6 work — no package,
route, table or migration, and no build step is completed by it.

This is the **sibling** of the section above, not a replacement: the provider
config, linking decisions and `?error=` discipline recorded there still hold
except where corrected here.

### The consequential decision — signing in no longer creates an account

Better Auth's `signIn.social()` is one call for both meanings, so before this
change an unrecognised Google account arriving at `/sign-in` would have been
silently **registered**. That is not what the page says, and with the control on
two pages it stops being a hypothetical.

**Chosen: `disableImplicitSignUp: true` on the Google provider**
(`lib/auth/server.ts`), with only `/sign-up` sending `requestSignUp: true`. So
`/sign-up` creates accounts and `/sign-in` does not; an unknown Google address
at `/sign-in` is told no account exists.

Verified in `node_modules` rather than recalled (§12 rule 2), against
`better-auth@1.6.26`:

- `disableImplicitSignUp` and `disableSignUp` are real per-provider options on
  `ProviderOptions`
  (`@better-auth/core/dist/oauth2/oauth-provider.d.mts:76,80`), which
  `GoogleOptions` extends.
- `requestSignUp` is a documented body field on the social sign-in route
  (`better-auth/dist/api/routes/sign-in.mjs:97`), is persisted into the OAuth
  state (`oauth2/state.mjs:19`) and is read back at the callback
  (`api/routes/callback.mjs:154`). Enforcement is therefore **server-side at the
  callback**, not in the two labels.
- A blocked registration returns `"signup disabled"`
  (`oauth2/link-account.mjs:79-83`), which the callback space-joins into the
  `error` query parameter as **`signup_disabled`**.
- The option is genuinely typed, not silently dropped: a throwaway probe passing
  `requestSignUp` plus a deliberately bogus sibling key reported
  `TS2353 … 'bogusOptionThatShouldFail' does not exist` and said nothing about
  `requestSignUp`. The probe was deleted.

**`disableSignUp` was deliberately not used.** It is read inconsistently — the
initiation path reads `provider.disableSignUp` but the callback reads
`provider.options?.disableSignUp` — whereas `disableImplicitSignUp` is read the
same way in both. `disableImplicitSignUp` is also the option that keeps
`/sign-up` working, which a blanket `disableSignUp` would not.

Nothing else about the provider changed. Default verified-email linking,
`account.encryptOAuthTokens: true`, the absent `trustedProviders`, and the
non-input nullable role all stand, so social signup still cannot request
`staff` or `admin` (§11.2 rule 3).

### The shared control

`app/_components/auth/google-sign-in-button.tsx` is one client leaf rendered by
both forms; the handler, the `?error=` cleanup and the button were **not**
copied into `sign-in-form.tsx`. It exports one component and nothing else.

The parent still owns pending state. `sign-in-form.tsx`'s `pending` was a bare
`boolean` and is now the same `"email" | "google" | null` union `/sign-up`
already used, so a Google attempt and an email attempt cannot race; the button
holds no second flag and reports transitions upward through `onPendingChange`.
`errorPath` is a prop (`/sign-in` and `/sign-up`), so the module hardcodes
neither page.

`window.location`, never `useSearchParams` — the reason both pages are still
`○ Static`. The only occurrence of that identifier anywhere in `app/` or `lib/`
is the comment in `google-sign-in-button.tsx` saying so.

**The `?error=` cleanup now maps before it strips.** On `/sign-in` only,
`signup_disabled` produces "There's no Aetherfield account for that Google
address. Create one first, then sign in."; everything else, on both pages,
produces prompt 41's generic "We couldn't connect your Google account. Please
try again." The machine-readable `error` and the provider's `error_description`
are still removed with `history.replaceState` and **never rendered** — reading a
known code to choose between two strings of our own is not rendering it, and
prompt 41's decision is not reopened.

### Labels and separators

| page | control | separator |
| --- | --- | --- |
| `/sign-in` | `Sign in with Google` | `OR SIGN IN WITH EMAIL` |
| `/sign-up` | `Sign up with Google` | `OR CREATE WITH EMAIL` |

Both pending to `Connecting to Google...`. `/sign-up` changed from prompt 41's
`Continue with Google`: with `disableImplicitSignUp` the two pages genuinely do
different things, and "Continue" names neither.

### Google's branding guidelines — fetched 7 Aug 2026

From <https://developers.google.com/identity/branding-guidelines>, read this
session rather than recalled (§12 rule 7). What it states:

- **Permitted labels** — "Sign in with Google", "Sign up with Google" or
  "Continue with Google". Both shipped strings are on that list.
- **The mark** — always the standard multi-colour version, on a white
  background; "You can't change the size or color of the Google 'G' logo";
  monochrome cuts prohibited; preserve aspect ratio.
- **Padding (Android & Web)** — "12px left padding before the Google logo, 10px
  right padding after the Google logo and 12px right padding after the Sign in
  with Google text".
- **Light theme** — fill `#FFFFFF`, 1px inside stroke `#747775`, font `#1F1F1F`.
- **Font** — "The button font is Google Sans Medium".
- **Custom buttons are permitted**, subject to those size, text, colour, font
  and padding rules; Google's own SDK is "strongly recommended".

**What it does not state, checked explicitly:** no pixel size for the logo, no
button height and no corner radius. It says to "start with any of the logo sizes
included in the download bundle" — a bundle not fetched here.

**Met.** Permitted label strings; the standard four-colour G, unmodified,
unrecoloured, aspect ratio preserved; a white button fill at rest; 10px between
mark and label, exactly as specified; 53.5px/162px of horizontal padding, well
past the 12px minimum.

**Deliberately deviated from, and why.** Three, all so the control stays inside
the settled design system rather than importing Google's:

1. **Font is JetBrains Mono at `--text-button`, not Google Sans Medium.** Google
   Sans is not licensed to this project and the auth card's vocabulary is
   `font-mono`. Adding a fourth family for one button is the larger error.
2. **Stroke is `--color-border` `#dbe0ec`, not `#747775`;** ink is
   `--color-ink` `#000000`, not `#1F1F1F`. Prompt 44 fixed the mark's four brand
   hex values as the *only* non-`@theme` colours in the change, and that holds.
3. **On hover the fill becomes `--color-surface` `#f6f8fb`, not `#FFFFFF`.** The
   guideline says the mark appears on white; #f6f8fb is off-white by ~2%. The
   hover treatment is prompt 41's and the prompt required it to carry over
   unchanged. Recorded as a knowing deviation, not an oversight.

**Judged, not measured: the mark ships at 18×18 CSS px.** Google states no
number, so this is a judgement against the 14px mono label rather than a
measurement of anything. The 48×48 viewBox is the official artwork's own
coordinate space and is unscaled in aspect.

The mark is **inline SVG, four paths, no network request** — no `next/image`,
no remote asset, no icon library, no Google SDK or GSI script. It is
`aria-hidden` beside a real text label, so the button keeps its accessible name
from its text and the mark is never the only content.

### Composition — centred group, both pages identically

The mark and label are centred **together** as a group (`flex items-center
justify-center gap-[10px]`), rather than the mark pinned left with the label
centred in the remainder.

Chosen because the card's other full-width control — the email submit `Button` —
centres its content, and a lone left-pinned element would be the only
left-aligned thing in a centred card. Google's own rendered button also centres
the group once the button is wider than its content, so this is not a deviation
from their layout so much as their layout at this width. Applied identically to
both pages.

### Verified, prompt 44

Every item below was run this session; nothing here is asserted from the plan.

- `npm run typecheck` exited 0 (`tsc --noEmit`); `npm run lint` exited 0
  (`eslint`).
- `npm run build` exited 0 on Next 16.2.12, emitting one 65949-byte CSS chunk.
  **`/sign-in` and `/sign-up` are both still `○ Static`**; `/account` and
  `/api/auth/[...all]` remain `ƒ`; every marketing route keeps its previous
  mode. Nothing became dynamic.
- **Prerender diff against parent `7f53872`**, built in a detached worktree with
  `node_modules` copied in, base CSS chunk 65926 bytes. Normalising the build
  id and the generated CSS **and JS** chunk names and stripping the inline RSC
  flight payload: **16 of 18 pages are byte-identical** — all six articles, all
  three job listings, `/`, `/about`, `/careers`, `/journal`, `/design-system`,
  `_not-found` and `_global-error`. **Only `sign-in.html` and `sign-up.html`
  differ**, and each difference is the button, its four SVG paths, the label and
  (on `/sign-in`) the new separator. Nothing else moved, and `primitives.tsx`
  was not touched.
- **Geometry, measured** at 375 and 1280 on both pages: control **52px** high
  (unchanged from prompt 41), **287px** wide at 375 and **504px** at 1280
  (identical to prompt 41's recorded form widths, so the control did not
  resize). Mark **18×18**. Mark-to-label gap **10px**, `column-gap: 10px`.
  Horizontal padding 53.5px at 375 and 162px at 1280, equal on both sides.
  No horizontal document overflow at either width.
- **All five states exercised on both pages**, computed styles read rather than
  eyeballed. Rest: white fill, `#dbe0ec` border. Hover: `#f6f8fb` fill, ink
  border. Focus-visible (reached by a real 7-press Tab sequence from the top of
  the document): `#2683eb` border plus the accent ring. Pending: label
  `Connecting to Google...`, `disabled`, `cursor: not-allowed`, underlined.
  Disabled is the same state. **In every one of the five the mark is present at
  `opacity: 1` with its four fills exactly `rgb(66,133,244)`, `rgb(52,168,83)`,
  `rgb(251,188,5)`, `rgb(234,67,53)`** — it never disappears and never
  recolours. Screenshots at both widths were inspected.
- **Live Google initiation from `/sign-in`** returned HTTP 200 and generated an
  `accounts.google.com/o/oauth2/v2/auth` URL whose `redirect_uri` is exactly
  `http://localhost:3000/api/auth/callback/google`, with scopes
  `email profile openid`, `response_type=code`, PKCE `S256`, and a client id,
  state and code challenge all present. Fetching that URL returned 200 and
  reached Google's normal account surface with **neither `redirect_uri_mismatch`
  nor `invalid_client`** — the same bar prompt 41 met from `/sign-up`. No client
  id, secret, state, verifier or token was printed or recorded.
- **The `?error=` path, all four combinations.** `/sign-in?error=signup_disabled`
  renders only the no-account message; `/sign-in?error=access_denied` and both
  `/sign-up` cases render only the generic one. In all four the query string is
  emptied, the status region is focused, and the page contains **neither the
  error code nor the `error_description`** that was supplied.
- **Email/password regression on the rebuilt `/sign-in`**, whose pending state
  machine this change rewrote. A synthetic account signed up, reached `/account`,
  signed out (200, `/account` then redirected), and signed back in through the
  form. While the email attempt was in flight the submit read `Signing in...`
  and **the Google control was `disabled` with its label unchanged**, proving the
  two paths cannot race. The row had `role` null and one `credential` account
  (§11.2 rule 3 holds for the form too). It was deleted; user, account and
  session counts for it all returned 0. Run against a server started with
  `BETTER_AUTH_URL` pointed at its own port, because ports 3000–3002 were in use.
- `npx drizzle-kit generate` reported **"No schema changes, nothing to migrate"**
  and wrote no file; the migrations directory still holds only `0000` and `0001`.
- The staged diff was grepped for secret-shaped strings before committing;
  none present. No environment variable was added, no `NEXT_PUBLIC_*` exists,
  `.env.example` is unchanged, and no `console` call was added.

**Not verified, and why.** Unchanged from prompt 41 and still an operational
browser check: a complete new-user Google login, a returning-user Google login,
and a verified-email link to an existing local account. **This change adds a
fourth: the `signup_disabled` outcome was proved end to end only in the
application's handling of it** — the message, the focus and the URL stripping
were driven by a synthetic query string, not by Google actually refusing an
unknown account at the callback. No interactive Google test-account access was
available, and no Google-backed user or OAuth token was created during any of
these checks.

---

## Step 1 correction — the connect timeout that presented as broken sign-in, prompt 46

`POST /api/auth/sign-in/social` returned 500 in local development, with the
failing query being Better Auth's own rate-limit read:

```
Failed query: select "id", "key", "count", "last_request" from "rate_limit" ...
[cause]: AggregateError: code: 'ETIMEDOUT', [errors]: [ Error x6 ]
```

It looked like an auth bug and was not one. **Every database query from the dev
server was failing intermittently**; sign-in is simply the first surface that
touches the database on every request, because `rateLimit.storage: "database"`
(`lib/auth/server.ts`) reads `rate_limit` before anything else runs.

### The cause, measured

| measurement | value | how |
| --- | --- | --- |
| addresses the pooled Neon host resolves to | **6** — 3x A, 3x AAAA | `getent ahosts …-pooler.c-10.us-east-1.aws.neon.tech` |
| Node's default happy-eyeballs attempt budget | **500 ms** | `net.getDefaultAutoSelectFamilyAttemptTimeout()`, node v26.5.1 |
| real TCP connect RTT to the Neon proxy | **319 ms / 410 ms** on the attempts that won | `net.connect` timing loop, 4 runs |
| the attempts that lost, in the same loop | **1513 ms / 1516 ms**, `ETIMEDOUT` | same loop |

`net.autoSelectFamily` is on by default and races every resolved address,
allowing each one 500 ms. The genuine RTT from this network to `us-east-1` sits
at 320-410 ms — inside the budget, but only just — so jitter pushes an attempt
over, and when all six go over Node collapses them into a single
`AggregateError` of six `ETIMEDOUT`s. **The six inner errors are the six
addresses**, which is what identifies the failure. The ~1.5 s wall time of the
second 500 in the reported terminal output (`1735ms`) matches the 1513/1516 ms
measured failures.

Nothing was wrong with Neon, the credentials, the pooled URL, Drizzle, or the
Better Auth configuration.

### The fix

`lib/db/client.ts` only, inside `getDb()`, and it is now constraint 4 in that
file's comment block:

- `net.setDefaultAutoSelectFamilyAttemptTimeout(2500)`, guarded by a
  `typeof === "function"` check so a runtime without the setter cannot throw at
  pool construction. **2500 ms is a judgement on the measurements above**, not a
  measurement: about six times the slowest winning attempt, leaving room for a
  developer further from `us-east-1`. It is a ceiling, not a wait, so it costs
  nothing when a connect is healthy. It is a process-wide default and therefore
  applies to every outbound socket the server opens — acceptable because the
  module is server-only and a sub-500 ms connect budget is wrong for anything
  cross-region.
- `connectionTimeoutMillis: 10_000` on the `Pool`, previously unset and
  therefore off. **Also a judgement**, sitting above the cold connect measured
  at **3215 ms** (scale-to-zero wake plus one `select 1`), and chosen as the
  point past which a request is better off failing visibly than hanging.

No schema, migration, environment variable or route change. `attachDatabasePool`
and the lazy no-`Proxy` shape of `getDb()` are untouched.

### Two things deliberately not done

- **The `pg-connection-string` SSL warning in the same terminal output is
  unrelated and was left alone.** It is a deprecation notice that `prefer`,
  `require` and `verify-ca` will adopt libpq semantics in `pg` v9, not a
  failure. Changing `sslmode` on the Neon URL to silence it weakens or pins a
  security-relevant default and deserves its own decision.
- **Better Auth's `rateLimit.storage: "database"` was left as it is.** Moving it
  to `"secondary-storage"` over the already-provisioned Upstash Redis would take
  a database round trip off the front of every auth request and make auth
  resilient to exactly this class of database fault. It is a real improvement
  and an open follow-up — but it is a change to a shipped step 6 decision, and
  it would not have fixed the bug, which reproduced on every query.

### Verified, prompt 46

- `npm run typecheck` exited 0 (`tsc --noEmit`); `npm run lint` exited 0
  (`eslint`).
- `npm run build` exited 0 on Next 16.2.12. **The route table is unchanged**:
  `/`, `/about`, `/careers`, `/journal`, `/design-system`, `/sign-in`,
  `/sign-up` and `_not-found` all `○ Static`; the six articles and three job
  listings `● SSG`; `/account` and `/api/auth/[...all]` `ƒ`. Nothing became
  dynamic, as expected for a server-only module.
- **A-B against the default budget, six fresh pools each** (a fresh `Pool` per
  iteration, because a warm pool reuses its socket and never reconnects):
  at the **500 ms** default, **5 ok / 1 failed** — and the failure was the exact
  signature, `ETIMEDOUT` at 1526 ms. At **2500 ms**, **6 ok / 0 failed**, connects
  landing between 2271 and 3682 ms. Small sample, stated as such: it reproduces
  the reported failure and shows it absent, it does not prove a rate.
- **Live**, against a production server started on a spare port from this build,
  the user's own dev server left running and untouched: three consecutive
  `POST /api/auth/sign-in/social` returned **HTTP 200 in 4.6 s, 1.1 s and 1.0 s**,
  each with an `accounts.google.com/o/oauth2/v2/auth` URL. **No `ETIMEDOUT` and
  no error of any kind in the server log** — the only output was the unrelated
  SSL deprecation warning. No client id, secret, state or verifier was recorded.

**Not verified.** Whether the same `ETIMEDOUT` can reach `drizzle-kit` on
`db:generate` / `db:migrate`, which run in their own short-lived processes over
the unpooled URL and are not covered by this fix. It was not observed; it was
also not provoked. And nothing here says anything about production on Vercel,
where the function and the database sit in the same region and the 500 ms budget
was never tight.

---

## Step 4 — newsletter signup, double opt-in

Implemented by prompt 47 on 8 Aug 2026. **This step invents nothing.** Step 2 set
the write path and step 3 set the email pattern, and §5.2 says in terms that
steps 4 and 5 copy them; every deviation below is named where it happens, and
there are five — a second limiter that runs *after* the parse, an already-confirmed
address that reports success, a confirmation send keyed on a token rather than a
row id, a Route Handler that fails **open**, and a `Shell` prop widened rather
than duplicated. Anything not named here matches
`app/_actions/demo-request.ts` and `lib/email/demo-request.ts`.

### The contract, in file order

Step 3's table, extended. The stage letters are `AGENTS.md` §10's.

| file | role | server-only |
| --- | --- | --- |
| `lib/validation/result.ts` | **new** — `SubmitResult<TField>`, the one result vocabulary, moved out of `lead.ts` | **no — deliberately** |
| `lib/validation/lead.ts` | changed — `SubmitResult` is now an alias of `Result<DemoRequestField>` | **no — deliberately** |
| `lib/validation/newsletter.ts` | **new** — the address schema, the field-error record, `NewsletterTokenState`, `NewsletterTokenResult` | **no — deliberately** |
| `lib/db/schema.ts` | changed — two columns and a unique index on `subscriber` | yes |
| `lib/db/migrations/0002_fuzzy_felicia_hardy.sql` | **new** — generated, never hand-written | — |
| `lib/db/subscriber-queries.ts` | **new** — `upsertSubscriber`, `confirmSubscriberByToken`, `unsubscribeByToken`, the token generator, the TTL | yes |
| `lib/rate-limit/index.ts` | changed — four new limiters, and `formatRetry` moved here | yes |
| `lib/email/config.ts` | changed — `appBaseUrl()` | yes |
| `lib/email/send.ts` | changed — an optional `headers` passthrough | yes |
| `lib/email/templates/shared.tsx` | changed — `footerText` widened to `ReactNode` | **no — deliberately** |
| `lib/email/templates/newsletter-confirmation.tsx` | **new** — the double opt-in request | **no — deliberately** |
| `lib/email/templates/newsletter-welcome.tsx` | **new** — the first marketing email in this repository | **no — deliberately** |
| `lib/email/newsletter.ts` | **new** — stage f for this flow, two calls, both returning void and throwing nothing | yes |
| `app/_actions/newsletter.ts` | **new** — `subscribeToNewsletter` (a, b, c, b-again, e, f), `confirmSubscription`, `unsubscribe` | yes (`"use server"`) |
| `app/_actions/demo-request.ts` | changed — imports `formatRetry` instead of declaring it | yes |
| `app/_components/newsletter/subscribe-dialog.tsx` | **new** — the client leaf on `/journal`'s band | client |
| `app/_components/newsletter/token-action.tsx` | **new** — the one button both token pages render | client |
| `app/newsletter/confirm/page.tsx` | **new** — reads `?token=`, on `AuthShell` | server |
| `app/newsletter/unsubscribe/page.tsx` | **new** — the same shape | server |
| `app/api/newsletter/unsubscribe/route.ts` | **new** — the one-click `List-Unsubscribe` endpoint | server |
| `app/_components/chrome.tsx` | changed — `CtaBand` gains `newsletter?: boolean` | server |
| `app/journal/page.tsx` | changed — passes it. **The only settled page this step edits** | server |
| `instrumentation-client.ts` | changed — three page paths added to BotID's protect list | client |

**The three files step 3 said a later form would not touch were two.**
`lib/email/config.ts` and `lib/email/send.ts` were both changed after all —
`config.ts` because an email now carries a link and something has to decide what
it resolves against, `send.ts` because marketing mail carries headers
transactional mail does not. Step 3's line "it does not touch `send.ts`" is
therefore **stale, and is corrected here rather than left standing** (§12
rule 8). What did hold is the *shape*: neither change is a fork, both are
additive, and `FROM`, `replyTo()` and the rendering of both parts are untouched.

### The schema — two columns, and why each exists

`subscriber` already existed from step 1 with `status`, `confirmation_token`,
`created_at`, `confirmed_at`, `unsubscribed_at` and `deleted_at`. It was short
two things and both are additive.

**`confirmation_token_sent_at`** (`timestamp with time zone`, nullable) — the
column expiry is read from, and the only one. `created_at` cannot date a
confirmation link, because a resend rotates the token *without* creating a row:
after one resend `created_at` describes an address and this column describes the
link sitting in the person's inbox. Nullable because a confirmed row has no live
token to date.

**`unsubscribe_token`** (`text`, `NOT NULL`, unique) — **a second, stable token,
and it must never be the confirmation one.** See the next heading.

The generated migration, quoted verbatim from
`lib/db/migrations/0002_fuzzy_felicia_hardy.sql`:

```sql
ALTER TABLE "subscriber" ADD COLUMN "confirmation_token_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriber" ADD COLUMN "unsubscribe_token" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_unsubscribe_token_key" ON "subscriber" USING btree ("unsubscribe_token");
```

**`ADD COLUMN ... text NOT NULL` with no default is only safe on an empty
table**, and that was checked rather than assumed: `subscriber` was queried and
returned **0 rows** before the migration was generated — nothing has ever
written it, in any environment. Had it not been empty the correct move was to
stop and report rather than guess a backfill, per the prompt and §12 rule 9.
The unique index is generated by Drizzle Kit from `uniqueIndex(...)` in
`schema.ts`, exactly as `subscriber_confirmation_token_key` was; no
`ALTER TABLE` was hand-run (§7.2).

No other column. No `source`, no `ip`, no `user_agent` — §8.3 rule 1 is "collect
only what the flow needs", and a newsletter needs an address.

### Two tokens, not one

An unsubscribe link built from the confirmation token would be broken by design.
The confirmation token is **single-use and rotated on every resend**, so the
unsubscribe link in a message already delivered would stop working the moment
the person asked for another confirmation. Worse, it would put a *confirmation
capability* in a marketing footer — a link that lives in an inbox for years and
gets forwarded.

So `unsubscribe_token` is issued once, at insert, and
`upsertSubscriber` deliberately does **not** rotate it: rotating would break the
link in every message already sent to that person. Both tokens are 32 bytes from
`randomBytes`, base64url, verified against `node:crypto` — synchronous, throws
rather than returning weak bytes on an unseeded pool, `"base64url"` a supported
`BufferEncoding`. Never a uuid derived from the row and never a hash of the
address: possession of the confirmation token is the entire proof that a person
controls the inbox, so anything derivable from public data defeats the mechanism.

### The upsert — four cases in one statement

`upsertSubscriber(email)` in `lib/db/subscriber-queries.ts` covers, with
`deleted_at is not null` treated as "no row" throughout:

| existing row | result |
| --- | --- |
| none | insert `pending`, both tokens fresh, `confirmation_token_sent_at` stamped |
| `pending` | rotate the confirmation token, re-stamp the sent-at, send again |
| `unsubscribed` | back to `pending` with a fresh confirmation token — re-subscribing is not a second identity |
| `confirmed` | **no token, no state change, no email** — and the action still reports success |

**`onConflictDoUpdate`, not a read followed by a write.** Two simultaneous
submissions of the same address would both find no row and both insert, and the
unique index would reject one of them with an error the person did nothing to
deserve. Postgres settles it in one statement instead.

**`setWhere` is what encodes "confirmed means leave it alone":**

```ts
setWhere: or(
  ne(subscriber.status, "confirmed"),
  isNotNull(subscriber.deletedAt),
),
```

Unqualified column references on this side of `ON CONFLICT` resolve to the
**target** table, so this reads the existing row and not the proposed one. When
it is false the update is skipped, `returning()` yields nothing, and the caller
gets `{ state: "already-confirmed" }`. **That is the only reason it can yield
nothing**, which is what makes an empty `returning()` a reliable signal rather
than an ambiguity — the insert either lands, or the update lands, or the guard
suppressed it. The soft-deleted arm keeps an erased address able to start a fresh
lifecycle.

The transition timestamps are cleared on the way back to `pending`: a
`confirmed_at` left sitting on a pending row would read as "this address is
confirmed" to step 7's submissions view and to any later query that trusts it.
`created_at` is untouched, so the audit trail of when the address first arrived
survives.

`confirmSubscriberByToken` is **single-use by construction** — the status is part
of the `WHERE`, so a replayed link updates nothing rather than restamping
`confirmed_at` and sending a second welcome — and expiry is `gt(sentAt, cutoff)`
against `confirmation_token_sent_at`, never `created_at`. When the conditional
update matches nothing, one follow-up read classifies *why* (`already-confirmed`
/ `unsubscribed` / `expired` / `unknown`). **That read is not an oracle**: it
answers only to someone already holding a 32-byte token, and it never sees or
returns an address.

`unsubscribeByToken` is idempotent — unsubscribing twice is a success, because a
provider may retry and a person may click the link in two different issues — and
it never reveals whether the token belonged to a confirmed or a merely pending
row. A soft-deleted row reports `already-unsubscribed`: the person is gone, they
are certainly not receiving mail, and telling them their token is unknown would
be both alarming and false.

### The limiters — five of them, and every number is a judgement

`lib/rate-limit/index.ts` now holds five. **Nothing here was measured against
traffic**, because neither of the two forms it protects has ever shipped and
there is no traffic to fit against. The front matter's measured-or-judged rule
applies to every row: these are judgements with recorded reasoning, and they are
to be revisited against real traffic rather than treated as fitted.

| limiter | prefix | limit | window | key |
| --- | --- | --- | --- | --- |
| demo request (step 2, unchanged) | `demo-request` | 5 | 1 h | IP |
| newsletter signup | `newsletter-ip` | 5 | 1 h | IP |
| confirmation send, burst | `newsletter-address-burst` | 1 | 60 s | sha256(address) |
| confirmation send, hourly | `newsletter-address` | 3 | 1 h | sha256(address) |
| confirm / unsubscribe actions | `newsletter-token` | 20 | 1 h | IP |
| one-click endpoint | `newsletter-one-click` | 10 | 1 h | sha256(token) |

The reasoning, per limiter:

- **Signup, 5/h per IP** — the same shape and the same judgement as the demo
  request's. Subscribing is a once-ever act for a person, so five in an hour from
  one address block is far above honest use and far below what makes the table
  worth spamming. Sliding rather than fixed, so an hour boundary is not a free
  refill for a client that times its burst.
- **The per-address pair is the limit that actually matters.** An IP limit bounds
  how often one client submits; it does nothing about *whose* inbox those five
  submissions point at, so without this one a subscribe form is a small mail
  cannon aimed at five strangers. The numbers — 3/hour per address, resend after
  60 seconds — come from `email-best-practices`'s `email-capture.md`. **That is a
  published recommendation, not a measurement of this site**, and it is recorded
  as the judgement it is. The two windows are checked burst-first so a rejected
  double-click does not consume one of the three hourly sends.
- **Token actions, 20/h per IP** — deliberately looser. They write no new row,
  send no mail to a third party, and act on a 32-byte token that guessing does not
  reach. The limit exists so a broken client cannot hammer the database, not
  because the path is dangerous.
- **One-click, 10/h per token.**

**The address key is a sha256, and the reason is §8.3 rule 2.** That rule keeps
personal data out of every store that is not the table which owns it, and Redis
is such a store: an unhashed key would put every submitted address in Upstash's
console, readable by anyone with dashboard access and retained for the window's
lifetime. sha256 over the already-lowercased address gives a stable key with none
of that. It is why the per-address check runs **after** the parse rather than at
stage b — it needs the canonical lowercased address the schema produces. Still
before the write, so a limited address costs nothing but a parse.

**The one-click endpoint is keyed by the token rather than the IP, and this is
deliberate.** Gmail's and Yahoo's infrastructure POST on behalf of many different
people from a small pool of addresses, so an IP key would throttle a mail
provider honouring real unsubscribes. A token key bounds abuse of any one
subscriber's link, which is the thing that can actually be abused.

**And that endpoint fails OPEN, where the demo action fails closed.** The
reasoning is inverted because the risk is: refusing to honour an unsubscribe
because Redis is unreachable is a compliance failure, while letting an
idempotent, non-destructive write through unmetered for the duration of an
outage is not. Every other path in this step keeps step 2's closed stance — an
unlimited public write path is worse than a form that is briefly unavailable
(§8.2 rule 4).

`formatRetry` moved from `app/_actions/demo-request.ts` into
`lib/rate-limit/index.ts` unchanged, because two actions now need the identical
sentence and `app/_actions/*.ts` are `"use server"` modules whose every runtime
export must be an async function. It now sits next to the limiter that produces
the number it formats.

### The enumeration decision — success for an address already on the list

`subscribeToNewsletter` returns the **same** `{ ok: true }` for a new address, a
pending one and an already-confirmed one. The upsert sends no second email in the
third case; the browser cannot tell the three apart.

**This is a deliberate deviation from the `email-best-practices` skill**, whose
`email-capture.md` offers "You're already subscribed! [Manage preferences]" as
the copy for this case. That copy is written for a signed-in preference centre,
where the person has already proved who they are. On an anonymous public form it
is a **membership oracle**: anyone could type an address and learn whether it is
on Aetherfield's list. The cost is that a genuinely subscribed person
re-subscribing gets no second email — which is the correct behaviour anyway.

The same reasoning runs through the token paths. The one-click endpoint returns
`200` for an unknown token, and `unsubscribeByToken` never distinguishes a
confirmed row from a pending one.

### Confirmation is a button, not a GET

Both `/newsletter/confirm` and `/newsletter/unsubscribe` render a page with one
button. **The transition does not happen on render**, and either of two reasons
alone would settle it:

1. §6.2 puts every mutation in a Server Action. A page that confirms while
   rendering is a GET that writes.
2. **Corporate mail scanners follow links in email** before a person ever sees
   them. A GET that confirms lets a scanner opt someone in; a GET that
   unsubscribes lets one silently opt them out.

**The cost is one extra click, and confirming on render is the more common
industry choice** — it is stated plainly here rather than buried, because a later
session reading this should know the trade was made knowingly and is one line to
change.

Both pages are built on `AuthShell` rather than a new shell (§7.5 forbids a
second design system): the page needs exactly what `/sign-in` needs, and
`AuthShell`'s props are plain strings, so nothing about it is auth-specific but
its folder. Both are `noindex` — a page whose entire content is a capability in
its query string has no business in a search index. Both read `searchParams`
asynchronously (Next 16) and take the first value if `?token=` repeats, letting
the lookup decide whether it is anything.

**Every outcome gets its own copy** rather than one "something went wrong"
(§8.2 rules 4 and 5): `confirmed`, `already-confirmed`, `expired`,
`unsubscribed`, `already-unsubscribed`, `unknown`, and `missing` — the last
produced by the page, not the action, when the URL carried no token at all. The
copy is keyed by state in `token-action.tsx`, so the action returns a state and
never a sentence and the site's copy stays on the site's side of the boundary.
The announcement is a focused `role="status"`, and the page has no colour state
at all, so it is legible without colour by construction. Any classified state
spends the button and swaps it for a route back to `/journal`; only an `ok: false`
error leaves the button, because a rate limit or an unreachable database is the
one thing worth clicking again.

`NewsletterTokenResult`'s `ok` is about the **request**, not the outcome: "your
link expired" is a successfully handled request reporting an unhappy state, while
`ok: false` is reserved for a rejection the person can retry.

### Idempotency keys — the confirmation deviates from step 3's format

Step 3 established `<event-type>/<entity-id>` keyed on the row id. **The
confirmation send breaks that, and the welcome send keeps it.**

`newsletter-confirmation/${confirmationToken}` — keyed on the **token**. A resend
rotates the confirmation token without creating a row, so a key built from
`subscriber.id` would be identical across the first send and every resend, and
Resend's idempotency window is 24 hours: the second message would be swallowed
and the person would wait forever for a link that was never sent. The token
changes on exactly the occasions a new message must go out, which makes it the
correct entity here. It still suppresses a genuine retry of one send — same
token, same payload — which is the whole point of the key. 43 base64url
characters, far inside the documented 256-character limit.

`newsletter-welcome/${subscriberId}` — back to the step-3 format. Confirmation is
single-use, so a second welcome inside 24 hours can only be a retry or a
resubscribe-and-reconfirm cycle, and suppressing it is right in both cases.

### `Shell`'s `footerText` widened to `ReactNode`

`lib/email/templates/shared.tsx` changed one type: `footerText: string` became
`footerText: ReactNode`. The welcome message is marketing, so its footer has to
carry a visible unsubscribe `<Link>` **inside the sentence**, which a string
cannot express.

**Widening beat adding a second prop.** A `string` is still a `ReactNode`, so
both step-3 templates are untouched and there remains exactly one footer in the
vocabulary — a `footerNode` alongside `footerText` would have created two ways to
say the same thing and a rule about which wins.

### `send.ts` gained a `headers` passthrough

One optional field on `SendEmail`, spread into the send only when present:

```ts
...(email.headers ? { headers: email.headers } : {}),
```

**Verified against the installed SDK rather than recalled** (§12 rule 2): resend
**6.18.1** declares `headers?: Record<string, string>` on
`CreateEmailBaseOptions`, at `node_modules/resend/dist/index.d.mts:553`, with the
doc comment "Custom headers to add to the email." Nothing else about `send.ts`
changed — both parts are still rendered here, `react` is still never passed, and
a failure still logs a template name and an error class and never an address.

It exists for exactly one purpose. The welcome email sets:

```
List-Unsubscribe: <https://…/api/newsletter/unsubscribe?token=…>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Gmail, Yahoo and Microsoft require the pair of bulk senders
(`email-best-practices`, `compliance.md`). `List-Unsubscribe` names the **API
endpoint** rather than the page, because `List-Unsubscribe-Post` promises the
receiver it may POST to it; the visible link in the footer is the page, for a
human.

**The confirmation email carries neither**, and that is correct: there is nothing
to unsubscribe *from* yet — the address is `pending`, no marketing has been sent,
and an opt-out link on a message asking for opt-in is incoherent. It is also the
"problematic hybrid" `email-types.md` warns against, which the demo-request
confirmation's own docblock already argued.

### Environment and personal data

**No new environment variable, and specifically no `NEXT_PUBLIC_*`.** Phase one
still has none, and `.env.example` is unchanged by this step. §8.4's table needs
no row.

The absolute URLs in both emails resolve against **`BETTER_AUTH_URL`**, read by a
new `appBaseUrl()` in `lib/email/config.ts`, which strips trailing slashes and
**throws when unset**, in `getResend()`'s register. **Reusing it beat inventing
`APP_URL`** (§8.4: do not invent a variable name): it is already the
application's base URL, already in `.env.example`, and already required in every
environment that runs auth, so a second variable naming the same value is one
more thing to set and one more way for two parts of the app to disagree about
where they live. The throw is caught by `lib/email/newsletter.ts`, which is
best-effort by construction, so it can never fail a write — an email carrying
`undefined/newsletter/confirm` would be worse than one never sent, because the
send would be reported as a success and the person would be stuck.

**Stored:** one lowercased address per subscriber, its status, two tokens and the
lifecycle timestamps — exactly `subscriber`'s columns, and nothing else.

**In Redis:** an IP, a sha256 of an address, and a sha256 of a token. **Never an
address and never a live token.**

**Logged:** nothing personal, on any path, in any catch. `lib/email/newsletter.ts`
emits `[email] send failed for subscriber <uuid>: <template>:<class>` and
`[email] <template> threw for subscriber <uuid>` — a uuid, a template name and
the provider's error class. `app/_actions/newsletter.ts` contains no `console`
call at all. `app/api/newsletter/unsubscribe/route.ts` deliberately logs nothing
even on a swallowed failure: the token is a live capability and the row it points
at is a person.

**Personal data continues to reach a third party.** Every confirmation and every
welcome sends the subscriber's address to Resend over TLS, under Resend's own
retention policy, which we control and have configured nothing about — the same
position step 3 recorded. No Resend webhook, no delivery-event handler, no
contacts or audiences.

### Retention is stated, not enforced

The intent is that a subscriber row lives as long as the subscription and is
soft-deleted on request, through `subscriber.deletedAt`, which exists for exactly
that and is honoured on every read in `subscriber-queries.ts`. **No scheduled
deletion, no retention window and no erasure endpoint is implemented**; an
erasure request today is a manual `UPDATE`. Step 7 is where a real control would
land. This is recorded plainly rather than implying a mechanism exists.

### Two open gaps, and both are blockers rather than bugs

**1. The sending domain, unchanged from step 3.** `lib/email/config.ts` still
sends from `Aetherfield <onboarding@resend.dev>`, Resend's sandbox sender, which
**delivers only to the Resend account's own address**; every other recipient is
refused with a 403. So today a confirmation link cannot reach a stranger's inbox,
and the double opt-in cannot complete for anyone but the account holder. The
close-out is step 3's, unchanged: acquire and verify a domain, publish SPF, DKIM
and DMARC, and change `FROM`.

**2. There is no physical postal address in the welcome email, and CAN-SPAM
requires one.** Aetherfield has none. **This is a blocker for sending marketing
mail in production** — it is not a styling gap and it is not closed by the domain
landing. **No placeholder was put in the template**, because a fabricated address
in front of a real person is exactly §12's failure mode, and a placeholder that
looks real is worse than an omission that is visible. `newsletter-welcome.tsx`'s
own docblock records the same thing at the point of use.

Both are recorded here rather than invented around (§12 rules 7 and 9). Until
they are closed the flow is complete in code and undeliverable in production.

### What step 4 deliberately did not do

- **No preference centre and no send infrastructure.** Nothing here sends an
  actual issue of the journal. The list is captured, confirmed and
  unsubscribable, which is the whole of §5.2's step-4 row.
- **No webhook handling** — bounces, complaints and suppression are real
  requirements for a sender at volume, and they are a later decision with their
  own endpoint and its own verification.
- **No `/design-system` exhibit** for the subscribe band. Step 2 put the dialog in
  the exhibit because the dialog was the new thing; this leaf is a copy, and
  adding it would change a second settled page's HTML for no gain.
- **No GSAP.** The demo dialog's close-button magnify-spin-and-tone is an
  explicit, user-granted exception to §7.5 (7 Aug 2026, after the rule was shown
  and a CSS-only alternative offered). A grant for one surface is not a licence to
  spread GSAP into the next piece of backend UI, so this dialog's close button is
  the same markup with the same `transition-colors` and no tween. If the
  affordance is wanted here too, that is a decision, not an assumption.
- **No email-preview script.** The templates are inspected with `render()`
  directly, per §2's corrected note. Both carry `PreviewProps` for whenever one
  exists.
- **No change to the demo-request flow** beyond the two extractions it genuinely
  shares — `formatRetry` and `SubmitResult`. Both are moves, not rewrites.


### A third new route, where §5.2 predicted two

§5.2's step-4 row reads "`/journal` form leaf; two new routes". This step shipped
**three**: `/newsletter/confirm`, `/newsletter/unsubscribe` and
`/api/newsletter/unsubscribe`. The third is the one-click `List-Unsubscribe`
endpoint, and the plan could not have named it because the requirement comes from
`compliance.md` rather than from the product — Gmail, Yahoo and Microsoft require
the header pair of bulk senders, and `List-Unsubscribe-Post` is a promise that
something will accept a `POST`.

It is a **sanctioned** Route Handler and not a §6.2 breach: 6.2 reserves handlers
for callers that are not this application, and the caller here is a mail
provider's infrastructure acting on a header we published. No business logic is
in it — it reads a token, calls the query layer, and answers `200`.

§5.2 is a *plan*, and a plan is not amended by what was built against it; the
deviation is recorded here, which is where the build record lives (§8.5).

### The leaf lands in every page's bundle, not just `/journal`

`CtaBand` lives in `chrome.tsx`, and every route imports that module for
`SiteNav` and `SiteFooter`. So importing `NewsletterSubscribeDialog` at its top
puts the dialog, the newsletter Zod schema and the action reference into the
**shared** client chunk on all eighteen prerendered pages, not only the one page
that renders the band.

This is step 2's precedent exactly — `DemoRequestDialog` is imported the same way
and has been since prompt 42 — and it does not breach the front matter's bundle
rule, which governs `home/` imports. It is recorded because it is a real cost
that the prerender diff makes visible and that no route table would: five
content-hashed JS chunks are renamed site-wide, with **script counts unchanged on
every page**, which is the signature of chunk *content* changing rather than a
page gaining one.

The alternative — hoisting the leaf out of `chrome.tsx` and passing it into
`CtaBand` from `/journal` — would confine it to one route and is the thing to do
if a third dialog ever arrives. Two is not yet worth restructuring a settled
shared component for.

### Two accessibility defects, found by rendering rather than by reading

Both were in code written this step, and both were invisible in the source:

1. **The confirmation's fallback link failed WCAG AA.** `<Link>` with no `style`
   emits react-email's default `#067df7`, which measures **3.97:1** on white at
   13px normal text — under the 4.5:1 floor, and the 3:1 large-text exemption
   does not apply. The surrounding paragraph was the compliant `#6c6c6c`; only
   the anchor inside it was not. Now ink at 21:1 with an underline.
2. **The welcome's unsubscribe link had no distinguishing cue at all.** It
   rendered `color:#6c6c6c;text-decoration-line:none` inside footer prose that is
   *also* `#6c6c6c` — same colour, no underline, no weight change. That is worse
   than a WCAG 1.4.1 colour-only failure, which at least leaves a colour to
   notice, and it mattered here because this is the opt-out a bulk-mail recipient
   must be able to find.

Both links now set `textDecorationLine` **and** `textDecoration`. The longhand is
not redundant: `Link`'s own default is `text-decoration-line:none`, so the
shorthand alone emitted `text-decoration-line:none;text-decoration:underline` —
correct by cascade order, but Outlook's Word engine is not to be trusted to
resolve shorthand against longhand, and an accessibility cue is not the place to
bet on it.

A third finding was a **stale comment, not a defect**: the template claimed
`box-border` protected the `Button`'s padding. The rendered HTML contains no
`box-sizing` at all — react-email v6's `Button` uses `mso-padding-alt` plus split
`padding-*` and `max-width:100%`. The protection is real, the explanation was
wrong, and the docblock now says what the renderer actually does. The skill's
`box-border` advice is for its Tailwind mode; these templates are inline styles.

### Tokens travel in query strings, and that is a property to know about

A capability in a URL is inherent to any emailed link — there is nowhere else to
put it — but it means the confirmation and unsubscribe tokens appear in anything
that records request URLs. Against `next dev` this is visible immediately: the
framework's own tracing prints both the full URL and the **serialized Server
Action arguments**, so the address and the tokens appear in the dev log even
though the application logs neither.

That is Next's tracing and not this code — `grep -rn "console\."` across
`app/_actions/newsletter.ts`, both leaves, both pages, the route handler,
`lib/db/subscriber-queries.ts` and `lib/rate-limit/` returns nothing, and the only
`console` calls in the flow are `lib/email/newsletter.ts`'s two warning lines,
which carry a template name, an error class and a row uuid.

**Not verified: whether the same tracing is emitted under `next start` or on
Vercel.** It should be checked before a deployment, and a platform access log will
carry the token in the URL regardless of the answer. The mitigations already in
place are that the confirmation token is single-use and expires in 48 hours, and
that the unsubscribe token grants nothing but unsubscribing.

### Verified, prompt 47

Every result below was produced by running the command, on 8 Aug 2026. Work was
parallelised across four agents; each result is quoted from the run that produced
it.

- `npm run lint` exited 0 with no output. `npm run typecheck` exited 0 with no
  output. Both were re-run after the accessibility fixes and exited 0 again.
- `npm run db:generate` produced **exactly one** migration,
  `0002_fuzzy_felicia_hardy.sql`, quoted in full above. A second run afterwards
  reported `No schema changes, nothing to migrate`.
- **`subscriber` was confirmed empty before the `NOT NULL` column was added** —
  `select count(*) from subscriber` returned `0`, which is what makes
  `unsubscribe_token text NOT NULL` safe without a backfill.
- **The first `npm run db:migrate` silently did not apply.** Its output ended
  mid-spinner and was *reported as applied*; the journal in fact still held only
  ids 1 and 2. The failure surfaced only when the end-to-end run hit
  `column "confirmation_token_sent_at" of relation "subscriber" does not exist`
  (`42703`) on the first real subscribe. A second `db:migrate` succeeded. Final
  state, read back from the database: `MIGRATIONS: 1,2,3`; `COLUMNS:
  id,email,status,confirmation_token,created_at,confirmed_at,unsubscribed_at,deleted_at,confirmation_token_sent_at,unsubscribe_token`;
  `INDEXES: subscriber_confirmation_token_key, subscriber_email_key,
  subscriber_pkey, subscriber_unsubscribe_token_key`.

  **The lesson is not "run it twice".** The write path's `catch` around
  `upsertSubscriber` returns the generic failure and logs nothing (by design,
  §8.3 rule 2), so a missing migration presents as a generic error toast and
  *nothing at all* in the log. Anyone resuming this work should assume the
  database may be unmigrated and check the journal rather than the spinner.
- `npm run build` exited 0 on Next 16.2.12. **The nine static and nine SSG routes
  kept their render modes**, and exactly three routes were added, all dynamic:
  `ƒ /api/newsletter/unsubscribe`, `ƒ /newsletter/confirm`,
  `ƒ /newsletter/unsubscribe`.
- **Prerender diff** against a clean `../aetherfield-base` worktree at parent
  commit `5c76823`, with the four gitignored doc snapshots moved aside on both
  sides (both builds emitted **one** 67k CSS chunk, confirming no contamination).
  **17 of 18 pages are byte-identical** after normalising the build id, the CSS
  chunk name (`[A-Za-z0-9_-]+`, not hex), the JS chunk names *positionally*, and
  stripping the RSC flight payload: `/`, `/about`, `/careers`, `/design-system`,
  `/sign-in`, `/sign-up`, `_not-found`, `_global-error`, all six articles, all
  three job listings. Stylesheet and script counts are unchanged on every page.
- **`/journal` is the single expected difference**, and the whole of it is one
  inserted empty element:

  ```
   Sign up to newsletter</button>
  +<dialog aria-labelledby="newsletter-subscribe-heading" class="m-auto w-[min(560px,calc(100vw-32px))] bg-white p-0 text-ink backdrop:bg-ink/25 backdrop:backdrop-blur-md">
  +</dialog>
   </section>
  ```

  `Sign up to newsletter</button>` appears as **unchanged context**, and the
  button's class string was asserted byte-identical by string equality rather
  than eyeballed — §8.1's requirement, checked rather than assumed.
- **A real subscription ran end to end** against `npm run dev`, driven through a
  real headless Chromium against the real Neon database, not stubbed.
  `Prompt47.Check@Example.COM` was stored as `prompt47.check@example.com` —
  **lowercasing verified end to end**, not just in the schema — with `status =
  pending`, both tokens present and different, and `confirmation_token_sent_at`
  set. The dialog swapped to its success state **in place**: URL before and after
  both `/journal`, navigation list unchanged.
- **Confirmation works and is single-use.** Confirming set `status = confirmed`
  and `confirmed_at = 2026-08-08T22:35:55.609Z`. **Replaying the same link did not
  re-confirm** — the already-confirmed copy was shown and `confirmed_at` was
  byte-identical afterwards.
- **Every enumerated outcome renders its own copy.** An unknown token, a missing
  token (no action button rendered at all), already-confirmed, unsubscribed and
  already-unsubscribed were each exercised and each produced its own sentence
  rather than "something went wrong".
- **Unsubscribe works and is idempotent.** The visible page set `status =
  unsubscribed`, `unsubscribed_at = 2026-08-08T22:38:07.477Z`. The one-click
  endpoint returned `HTTP/1.1 200 OK` with an empty body for a live token, for a
  replay of it, **and for a garbage token** — so it is not an oracle. `GET`
  returned `307` to
  `http://localhost:3001/newsletter/unsubscribe?token=…`.
- **Re-subscribing behaves as the schema's docblock specifies.** `status` returned
  to `pending`, the confirmation token **changed**, the unsubscribe token **did
  not**, `confirmed_at` and `unsubscribed_at` were both cleared, and `id` and
  `created_at` were preserved.
- **Nothing personal reaches application logs.** The only `console` output in the
  flow was three `[email] send failed for subscriber
  0508aced-…: newsletter-confirmation:validation_error` lines — template name,
  error class, row uuid, no address and no token. The address and tokens *do*
  appear in the dev log via Next's own tracing; see the section above, which
  records what was and was not verified about that.
- **All four email templates were rendered** with `render()` to HTML and to plain
  text (there is no preview script, per §2). Each has one `<h1>`, a `<title>`,
  `lang`/`dir` on `<html>`, every layout table `role="presentation"`, no image and
  so no `alt` question, and no "click here". The confirmation contains **zero**
  occurrences of "unsub" — correct, because the address is only `pending`.
  Contrast measured on white: `#000000` 21.0:1, `#6c6c6c` 5.25:1.
- **The two step-3 templates render byte-for-byte identical** to their `HEAD`
  versions after `footerText` widened to `ReactNode` — HTML and plain text both,
  footers still bare text in the existing `<p>`, no wrapper element introduced
  and zero `<a>` tags. The widening is type-only, and it was proven rather than
  assumed.
- **The `List-Unsubscribe` split is as designed**: the header points at
  `/api/newsletter/unsubscribe` (the machine endpoint, angle-bracket wrapped,
  token `encodeURIComponent`-escaped) while the visible footer link points at
  `/newsletter/unsubscribe` (the human page with a button).
- **The test row was deleted afterwards** and `subscriber` returned to 0 rows,
  confirmed by count.

**Not verified, and why.**

- **No email was delivered to an inbox, and none is claimed.** Every send was
  refused by Resend with `validation_error`, which is consistent with the sandbox
  `onboarding@resend.dev` sender delivering only to the Resend account's own
  address. What *is* verified is that the send is attempted, that its failure is
  caught, that it does not fail the write — the row was created and confirmed
  regardless — and that it logs nothing personal. Actual deliverability waits on
  the sending domain.
- **BotID's real classification was never exercised**, unchanged from step 2: it
  returns `HUMAN` in development, and a production build run from localhost
  cannot complete a real challenge. That the three new paths are wired is
  established by their presence in `instrumentation-client.ts`; that it blocks a
  bot is an operational check on a deployment.
- **The rate limiters were not driven to rejection.** The numbers are judgements
  with no traffic behind them (see above), and exercising the 3-per-hour address
  limit against a real Upstash instance would have consumed the window for the
  rest of the run without testing anything the demo-request limiter did not
  already establish at prompt 42.

## Step 5 — blob upload and job applications

Implemented by prompt 48 on 9 Aug 2026. **This step invents nothing either.**
Step 2 set the write path, step 3 set the email pattern, and step 4 already
copied both; every deviation below is named where it happens. Anything not named
here matches `app/_actions/demo-request.ts` and `lib/email/demo-request.ts`.

### Provisioning — Blob, and the two things the prompt predicted wrongly

`vercel env ls` on 9 Aug 2026 listed no `BLOB_READ_WRITE_TOKEN`, so the store did
not exist and the step was blocked at its first line (§7.4 rule 5, §12 rule 9).
The user authorised the command before it ran.

Vercel Blob is **first-party, not a Marketplace integration**, so §7.4's
`vercel integration add` procedure does not apply. The command, read from
`vercel blob --help` rather than guessed:

```
vercel blob create-store aetherfield-cv --access private --region iad1 \
  --environment production --environment preview --environment development
```

> Success! Blob store created: aetherfield-cv (store_Livjh6tZg2Me3b5D) in iad1
> Access: private.

**Two corrections to what prompts/48 predicted**, both from reading `--help`
first (§12 rule 6):

- the subcommand is **`create-store`**, not `store add`;
- **`--access` is a store-level flag and is *required* at creation.** The prompt
  treated private access as purely a per-`put()` option. It is both: the store is
  private, and `put()` still takes a required `access`.

`env pull` ran automatically as part of the command and added
`BLOB_READ_WRITE_TOKEN` to `.env.local`. The name matches §8.4's prediction and
was still **read back from `vercel env ls`**, not assumed.

### The installed `@vercel/blob` surface, read not recalled

`@vercel/blob@2.7.0`, from `node_modules/@vercel/blob/dist/index.d.ts`:

- `put(pathname, body, options) => Promise<PutBlobResult>`; `PutBody` includes
  `File`, so the action hands the `File` straight through.
- **`access` is required** and typed `BlobAccessType = 'public' | 'private'`.
  Private access is a first-class value in this version — the
  `vercel:vercel-storage` skill still calls it a public beta, which is what §12
  rule 2 exists to catch.
- **`addRandomSuffix` and `allowOverwrite` both default to `false`** here. Older
  docs and memory say `true` for the former; the shared `CommonCreateBlobOptions`
  that `put` uses says false.
- `del(urlOrPathname, options?)`.

### The contract, in file order

| file | role | server-only |
| --- | --- | --- |
| `lib/validation/application.ts` | **new** — the shared schema, the four-slot field-error record, `ApplicationSubmitResult`, and the `CV_*` constants | **no — deliberately** |
| `lib/storage/cv.ts` | **new** — `putCv`, `deleteCv`, `sanitiseFilename`. The write only | yes |
| `lib/db/application-queries.ts` | **new** — `insertApplication`, the only Drizzle caller for this table | yes |
| `lib/email/application.ts` | **new** — the two sends, and `APPLICATION_NOTIFICATION_EMAIL` | yes |
| `lib/email/templates/application-confirmation.tsx` | **new** — to the applicant | **no — deliberately** |
| `lib/email/templates/application-notification.tsx` | **new** — internal | **no — deliberately** |
| `lib/rate-limit/index.ts` | changed — one new limiter | yes |
| `app/_actions/application.ts` | **new** — the action, stages a-f | yes (`"use server"`) |
| `app/_components/application/apply-dialog.tsx` | **new** — the client leaf | client |
| `app/_components/primitives.tsx` | changed — `FileField` added; `Field` and `TextareaField` untouched | — |
| `app/_components/cards.tsx` | changed — `JobCard` gains `actionSlot` | — |
| `app/_components/careers/sections.tsx`, `app/_components/job/sections.tsx` | changed — the two trigger sites | — |
| `instrumentation-client.ts`, `next.config.ts`, `.env.example` | changed | — |

**No migration.** `application` shipped with step 1's
`0000_empty_starjammers.sql`; `npm run db:generate` producing anything here would
have meant the schema had been changed, which it was not.

### The upload path — a Server Action, and the rejected alternative

The file travels in the Server Action's `FormData`, which is why
`submitApplication` takes `FormData` rather than the plain object step 2's action
takes. **`@vercel/blob/client`'s `upload()` was rejected on purpose**: it needs a
Route Handler that hands a *write capability* to an unauthenticated browser on a
public marketing page, and §6.2 reserves Route Handlers for callers that are not
this application.

The cost is Next's Server Action body cap. From the installed docs
(`node_modules/next/dist/docs/.../serverActions.md`): "the maximum size of the
request body sent to a Server Action is 1MB", configurable with "the number of
bytes or any string format supported by bytes". `experimental.serverActions.bodySizeLimit`
is set to **`"6mb"`** against a 5 MB file cap — headroom for the multipart
boundaries and part headers, and **a judgement, not a measurement**. The Zod cap
is what a person ever sees; the body limit only has to sit above it so the
framework never throws before the action runs.

### The blob pathname

`cv/<crypto.randomUUID()>.pdf`, and **it carries no personal data** — never the
applicant's name, never their own filename, never a sequential id, so a store
listing is not itself a list of who applied. The applicant's filename is stored
separately on `application.cv_filename`, sanitised, for display in step 7.
`putCv` returns the store's own `blob.pathname` rather than the string it
composed, so the two can never diverge silently.

### Judgements, said to be judgements

Nothing here is fitted; there is no traffic and no comp.

- **5 MB** and **`application/pdf` only**. `.doc`/`.docx` were not added.
- **Five applications per IP per hour**, matching the demo-request limiter: a
  person may genuinely apply to two roles in a sitting.
- **No per-address limiter.** The newsletter's exists because a confirmation
  email is a capability sent to a stranger's inbox; nothing on this path is.
- **`"6mb"`** for the body limit, above.
- The `FileField`'s box: `py-1.5` + a 38px button + 2px borders = `Field`'s
  `h-[52px]`, so a form mixing them keeps one rhythm. **Derived, not measured
  against a render.**

### The file is checked four times, and the declared type is not trusted

Server-side, cheapest gate first: present and non-empty → within `CV_MAX_BYTES`
→ `type === "application/pdf"` → **the leading bytes are `%PDF-`**, read with
`await cv.slice(0, 5).arrayBuffer()`. The browser-declared `type` is written from
the file's extension and is attacker-controlled (§8.2 rule 3), so it is never the
last word. The leaf runs the first three as a courtesy — a faster no, not a
check.

### Verified against a running dev server

Neon was cold for the first submission; every timing below says which.

- **A valid PDF submitted from `/careers`'s open-application card** wrote exactly
  one row and one blob. `POST /careers 200 in 11.0s` — **cold**, including the
  Neon scale-to-zero start, the blob put and the Resend attempt. The next server
  submission was `1223ms` warm.
- **The address was lowercased and trimmed end to end** (§9.2 rule 4): submitted
  as `"  ADA.Whitfield@Example.COM  "`, stored as `ada.whitfield@example.com`.
- **`cv_pathname` was `cv/6171df87-…-….pdf`** and contained no part of the name;
  `cv_filename` held `valid-cv.pdf`; an empty textarea stored `null`, not `""`.
- **The CV is genuinely private, and this was reported rather than assumed.**
  `head()` returned it on `https://livjh6tzg2me3b5d.private.blob.vercel-storage.com/…`,
  and an **anonymous `fetch` of that URL returned `403`**. `deleteCv` then removed
  it and `list({prefix:"cv/"})` returned to 0.
- **Every rejection rendered a visible, announced field error**: missing file
  ("Attach your CV as a PDF."), a `.pdf` whose bytes are not a PDF and a
  `text/plain` file (both "Your CV must be a PDF."), an over-cap 5.4 MB PDF
  ("That file is over 5 MB. Attach a smaller PDF."), and a malformed address
  ("Enter a valid email address.").
- **The disguised PDF reached the server and was caught by the `%PDF-` check** —
  confirmed by the request log, since the client's type check passes it.
- **The rate limiter was driven to rejection**, which step 4 declined to do. The
  sixth server-reaching submission inside the hour returned "That's a few too
  many requests. Try again in 7 minutes." — `formatRetry` in the site's register.
- **No orphaned blobs.** After five rejected submissions the store still held
  only the one blob from the successful write: the rejections all land at stage c,
  before the put.
- **The selected file is announced** — an `sr-only` `role="status"` region read
  "Selected: valid-cv.pdf, 1 KB".
- **Success swaps in place** to "Application received" with no redirect.

### Not verified, and why

- **No email reached an inbox, and none is claimed.** The confirmation send was
  attempted and refused by Resend with `validation_error`, consistent with the
  sandbox `onboarding@resend.dev` sender delivering only to the account holder —
  **the step-3 blocker, unchanged and still open.** What is verified is that the
  send is attempted, that its failure is caught, that **it does not fail the
  write** (the row and blob were both committed and the person saw success), and
  that our log line names only a template, an error class and a row uuid:
  `[email] send failed for application <uuid>: application-confirmation:validation_error`.
  Note the **Resend SDK prints its own `[Resend API Error]` block**, which we do
  not control; it quoted no address in this case.
- **The internal notification was skipped**, `APPLICATION_NOTIFICATION_EMAIL`
  being unset — the supported state, logged as
  `application-notification:no-recipient-configured` with no address.
- **BotID's real classification was never exercised**, unchanged from steps 2
  and 4: it returns `HUMAN` in development. That `/careers` and `/job-listing/*`
  are wired is established by `instrumentation-client.ts` and by the matcher read
  from the installed package; that it blocks a bot is an operational check on a
  deployment.
- **Focus return on dialog close is UNVERIFIED, in either direction.** The
  attempt to measure it was invalidated by the automation environment: a bare,
  freshly-created `<dialog>` in that context fires **no `close` event at all**,
  so neither this leaf nor the shipped demo-request dialog could be observed
  running their `onClose`. The code path is present and identical to step 2's.
  **Do not read this as either a pass or a defect** — it needs a real browser
  session or a test that does not depend on the `close` event.
- **The `FileField`'s rendered box was not measured** against a screenshot; see
  the judgement above.

### Prerender impact — measured against a base build of `ff03de8`

Built in a sibling worktree per `docs/automation.md`, with `node_modules`
hard-linked and **the gitignored `.agents/skills/*/references/` snapshots copied
in** — without them Tailwind scans a different file set and every page falsely
appears to gain a stylesheet.

The route table is **unchanged**: the same 8 `○ Static`, `/article/[slug]` and
`/job-listing/[slug]` still `● SSG`, and **no route went dynamic**.

Chunk *names* moved on every page, because `next.config.ts` and
`instrumentation-client.ts` both changed; the helper therefore maps each chunk to
its index in order of first appearance and compares that. With the RSC flight
scripts stripped:

- **14 of 18 pages byte-identical**, including **`/design-system`** (it renders
  `JobCard` with no `href` and no `actionSlot`, so the inert-button branch is
  untouched), `/`, `/journal`, `/about`, all six articles, `/sign-in`, `/sign-up`.
- **4 pages differ, and they are exactly the two routes §5.2's step-5 row
  authorises**: `/careers` (+180 bytes) and the three `/job-listing/[slug]`
  pages (+175 to +179). **The entire difference on each is one empty
  `<dialog aria-labelledby="apply-<slug>-heading" …></dialog>`** — the closed
  leaf. The `#apply` region's `<button>` markup is byte-identical, so no measured
  geometry moved.
- On the full HTML the job listings read as ~85 bytes *smaller*; that is the
  flight payload re-segmenting as the button became a client leaf, which is the
  effect `docs/automation.md` warns is not a real diff.
- **Script chunk count per page is unchanged on all 18 pages** — the leaf never
  reached the shared chunk. That is the bundle rule holding, and it is why both
  trigger sites import the leaf directly instead of through `chrome.tsx`.

### Checks

`npm run lint` exit 0, `npm run typecheck` exit 0, `npm run build` succeeded with
the route table above. `grep -rn "console\." ` across the action, the leaf,
`lib/storage/`, `lib/db/application-queries.ts` and `lib/validation/application.ts`
returns nothing.

### Retention — stated, not enforced

`application.deleted_at` exists and the query module is written to honour it, but
**there is no scheduled deletion and no erasure endpoint**, and none is implied.
Step 7 is where a real control would land. CVs live in private blob storage
indefinitely until someone removes them.

### Prompt 50 — branded application success state

Prompt 50 changes only `ApplyDialog`'s successful composition. The existing
`Seal` is rendered between the heading block and the live status at **160px on
mobile and 184px from `sm` upward**. The status becomes a centred accent mono
line; the unchanged thank-you copy is centred at a 440px maximum measure. The
full-width Close button, title, role caption, status string, copy and both close
controls are unchanged.

Those sizes and the **28/32px** heading-to-seal, **16px** seal-to-status,
**20px** status-to-copy and **32px** copy-to-button gaps are **design
judgements**, not comp measurements. The supplied screenshot was a before-state
visual brief and contained no target geometry.

The form, pending and error branches retain their previous structure and class
strings. The native dialog, `showModal()`, live-region focus effect, Escape and
backdrop close paths, and trigger focus return are untouched. A real browser
pass verified that focus lands on the heading when opened and on the status
after success; Tab reaches the top Close and full-width Close controls; Enter,
Escape, backdrop click and both explicit controls close the dialog; every close
path returns focus to the trigger.

One real synthetic application produced the successful state. Its row and
private blob were both removed afterwards (`rowsRemoved: 1`, `blobsRemoved: 1`);
no address, filename, pathname or CV content was printed. The production server
correctly failed closed before submission because local production mode cannot
supply Vercel BotID's request context. The actual write therefore ran against
`next dev`, where the installed BotID SDK documents and supplies its development
`HUMAN` classification; the visual result uses the same application code and
Tailwind output. This is a local verification limitation, not a production
security bypass.

At 375px, `deviceScaleFactor: 1`, the open success dialog measured
**337×481.40625px** and the seal **160×81.40625px**. At 1280px it measured
**560×455.625px** and the seal **184×93.625px**. Both renders kept both close
controls visible, the role and body wrapped without collision, the seal stayed
inside the dialog, and `document.documentElement.scrollWidth - innerWidth` was
**0**. Screenshots inspected were
`/tmp/aetherfield-p50-success-375.png` and
`/tmp/aetherfield-p50-success-1280.png`.

**Prerender impact is verified as none.** The production route table remains
`○ /careers` and `● /job-listing/[slug]` with all three job paths. In each of
`.next/server/app/careers.html` and the three generated listing HTML files, the
closed `<dialog>` has `inner-bytes=0`; the success-only seal and copy therefore
do not enter prerendered markup. The client chunk changes on those four routes,
as expected from importing `Seal` into their existing client leaf.

Checks after implementation: `npm run lint` exit 0 (`eslint`),
`npm run typecheck` exit 0 (`tsc --noEmit`), and `npm run build` exit 0 with
Next.js 16.2.12. The build compiled in 7.4s, generated 22 static pages, retained
`/careers` as Static and the three `/job-listing/[slug]` pages as SSG, and
reported only the existing `serverActions` experimental warning. There is no
test script, so no test run is claimed.

---

## Step 6 completion — required email verification and password reset

Implemented by prompt 52 on 9 Aug 2026. This closes the email/password gap left
by prompt 38 now that step 3's Resend/React Email layer exists. It adds no
schema, migration, provider resource, environment variable, root provider or
auth middleware matcher.

### Installed APIs and server policy

The implementation was read from Better Auth **1.6.26**, not recalled:

- `emailVerification.sendVerificationEmail`, `sendOnSignUp`, `sendOnSignIn`,
  `autoSignInAfterVerification` and `expiresIn` are the installed option names;
- `emailAndPassword.sendResetPassword`, `resetPasswordTokenExpiresIn` and
  `revokeSessionsOnPasswordReset` are the installed reset options;
- the generated client methods are `sendVerificationEmail`,
  `requestPasswordReset` and `resetPassword`;
- the installed reset callback adds `?token=` on success and `?error=` on an
  invalid or expired credential; verification adds the provider error code to
  the configured callback only on failure;
- the installed implementation consumes a reset value before changing the
  password, then deletes every session when revocation is enabled. Verification
  JWTs are checked against the auth secret and their expiry before the user is
  marked verified.

`lib/auth/server.ts` now makes the policy explicit: verification required,
passwords 8–128 characters, verification and reset credentials both valid for
**3,600 seconds (one hour)**, every session revoked after a reset, verification
sent after email signup and after a valid-password sign-in by an unverified
user, and a session created only after verification succeeds. Google provider
configuration, OAuth token encryption, non-input roles, database rate limiting,
lazy construction and `plugins: [nextCookies()]` last are unchanged.

Better Auth **1.6.26** marks the signup, sign-in and reset sends as background
work through its own `runInBackgroundOrAwait` path. `advanced.backgroundTasks`
therefore receives Vercel's `waitUntil` directly. The email hooks are not
wrapped in a second background call, and provider failure never changes the
public auth response.

### Auth email contract

`lib/email/auth.ts` is server-only and is the one orchestration module for both
messages. It passes Better Auth's provider-created `url` through unchanged; it
never reconstructs a callback or credential. The same hook's retry is
idempotent, while a newly issued credential sends a new message:

```
auth-account-verification/<user id>/<sha256(provider token)>
auth-password-reset/<user id>/<sha256(provider token)>
```

The raw token, signed URL, address, name, password, subject and body never enter
the key or application logs. Failure output is limited to the fixed event,
template and `sendEmail()`'s safe provider error class. Both keys measured under
Resend's 256-character limit in the live capture, and the final segment was a
64-character hexadecimal SHA-256 digest rather than the provider token.

`account-verification.tsx` and `password-reset.tsx` are named-export React Email
templates over the existing `Shell`; the deliberate direct `render()` workflow
and absence of an email-preview script are unchanged. Both are transactional:
one `<h1>`, one unique HTTPS action destination used by the button and visible
fallback, explicit one-hour copy, monitored reply-to policy through `send.ts`,
and a no-action-needed line for an unsolicited request. Neither carries
marketing, newsletter or unsubscribe content. `sendEmail()` continues to render
and send both HTML and plain text explicitly.

### Browser and callback flow

Email signup supplies an absolute same-origin
`/verify-email?verified=1` callback. Better Auth returns `token: null` before
verification, including its synthetic duplicate-safe response; the leaf swaps
to the same focused check-inbox state for either and never navigates to
`/account`. Google signup still goes directly to `/account`.

Email sign-in also supplies the fixed verification callback. This matters only
when a valid password belongs to an unverified account: Better Auth reuses that
field for the new verification link and then returns `EMAIL_NOT_VERIFIED`. A
normal verified sign-in still follows the leaf's existing explicit `/account`
navigation. The UI maps only that installed code to safe “may have been sent”
guidance; every invalid email/password outcome remains generic. The new
`Forgot password?` link is the only initial-markup change on `/sign-in`.

The public route table is:

| route | render | credential handling |
| --- | --- | --- |
| `/forgot-password` | static | email goes directly to Better Auth; known and unknown addresses receive the same visible completion |
| `/reset-password` | static shell + Suspense client leaf | `useSearchParams()` derives `token` / `error`; the query is removed with `history.replaceState`, the token stays only in a ref until use, and every rejection becomes one invalid-or-expired state |
| `/verify-email` | static shell + Suspense client leaf | reads only fixed `verified=1` / provider error, removes the query, and offers an enumeration-safe resend form on every non-success state |
| `/account` | dynamic, unchanged | the real session/database check remains authoritative; typing `?verified=1` is presentation only |

Reset validates 8–128 characters and an exact confirmation in the browser as a
courtesy, then Better Auth performs the authoritative length, credential,
single-use and session-revocation checks. No form reads an auth table, no custom
Route Handler or Server Action wraps Better Auth, and `proxy.ts` still matches
only `/account`.

### Enumeration, secrets and personal data

The anonymous reset and verification-send endpoints retain Better Auth's
database rate limit, trusted-origin/origin checks, dummy reset work and 500 ms
verification-send floor. A known address, unknown address and already-verified
address do not produce distinguishable site copy. BotID remains the recorded
auth catch-all gap; this prompt did not replace provider endpoints or invent a
wrapper to broaden its scope.

No new environment variable and no `NEXT_PUBLIC_*` variable was added. The
flow reads the existing `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `RESEND_API_KEY` and optional reply-to policy. Better Auth
stores the existing user, credential, verification and session records; there
is no send audit. Verification/reset sends transmit the user's name, address
and credential-bearing link to Resend over TLS, under Resend's retention policy.
Nothing personal is logged by application code.

The deployment prerequisite from step 3 becomes stricter now: required
verification means an arbitrary email/password signup cannot finish while
`FROM` remains `onboarding@resend.dev`. Acquire and verify an owned domain,
publish SPF/DKIM/DMARC, then change `FROM`; do not weaken verification to work
around the sandbox. Google remains the available signup path in the meantime.

### Verified, prompt 52

Every pass below was run on 9 Aug 2026; no result is inferred from the prompt.

- `npm run typecheck` exited 0 (`tsc --noEmit`), and `npm run lint` exited 0
  (`eslint`).
- `npm run build` exited 0 on Next **16.2.12**, compiled in **8.4 s**, and
  generated **25** static pages. `/forgot-password`, `/reset-password` and
  `/verify-email` are `○ Static`; `/sign-in` and `/sign-up` stay static;
  `/account` and `/api/auth/[...all]` stay `ƒ Dynamic`.
- The same production build with `.env.local` safely moved aside exited 0,
  compiled in **6.5 s**, and emitted the same route table. The file was restored
  and checked afterwards, proving database, auth and email construction remain
  request-lazy.
- `npm run db:generate` reported **“No schema changes, nothing to migrate”**
  across the existing eight tables and wrote no migration.
- Both new templates were rendered directly to HTML and plain text. Each had
  non-empty parts, one `<h1>`, one unique destination, the named action,
  one-hour and fallback copy, the no-action-needed line, explicit ink/underline
  fallback-link styling, and no marketing/newsletter/unsubscribe text.
- Clean baseline build at parent `abe1d17`, with the local skill snapshots
  mirrored as `docs/automation.md` requires: all **16 of 16** pre-existing
  non-auth prerendered pages are markup-identical after stripping RSC flight
  scripts and normalising generated CSS/JS chunk names. `/sign-in` alone changes
  among the two existing auth pages; `/sign-up`'s initial markup is identical
  because its new confirmation is post-submit state. The three new route HTML
  files exist.
- A production build on isolated port 3101 exercised the complete flow with
  Resend's documented test recipient and a localhost capture endpoint receiving
  the **exact payload produced by the installed Resend SDK**: signup created no
  session; a duplicate returned the same public shape; valid-password
  unverified sign-in was rejected and issued another verification; verification
  landed on the fixed marker, marked the user verified and created a session;
  known/unknown reset responses were byte-equal; reset changed the password,
  revoked the previous session and consumed the credential; replay and the old
  password failed; the new password signed in; and both Google sign-in and
  sign-up initiation still returned Google authorization URLs. The captured
  payloads contained both rendered parts, one-hour copy and the hashed-token
  idempotency-key shapes above.
- Cleanup removed the synthetic user and verified **0 users, 0 accounts, 0
  sessions and 0 verification values** remained.

**Not verified, and why.** The first pass used the real Resend endpoint, but the
configured key is send-only: listing the sent message returned
`restricted_api_key`, and this environment has no inbox connector. Actual inbox
receipt and link use are therefore **not claimed**. The local capture verified
the exact provider request and full application lifecycle, not deliverability.
The credential/error query-removal effects were not browser-driven because
prompt 51's Playwright installation is still unrelated uncommitted work and
prompt 52 explicitly forbids using it as evidence. The implementation uses the
same `history.replaceState(window.history.state, ...)` pattern already shipped
for Google callback cleanup, and production HTML contains no query credential,
but the visible-address transition remains a browser check after prompt 51 is
committed. `npm run test:e2e` was not run for the same reason.

## Step 7 — authenticated submissions

Implemented by prompt 53 on 9 Aug 2026. This closes phase one with one
request-time staff workspace, one on-demand private-CV handoff, minimum staff
role management and the manual removal controls deferred by steps 2, 4 and 5.
It adds no schema, migration, provider, environment variable, public write path,
email or phase-two tenant concept.

### Authorisation and routing

`requireSubmissionsAccount()` sits on the existing `getCurrentAccount()` path.
Better Auth resolves the session, then `getStaffRole()` re-reads the role from
Postgres for every protected request. The order before any submission read is:

| state | `/submissions` and CV route | admin action |
| --- | --- | --- |
| no session | sign-in redirect with the exact submissions callback | handled denial |
| verified account, role null | `/account` redirect | handled denial |
| `staff` | live submissions and one CV read allowed | handled denial |
| `admin` | all staff reads plus Staff view | guarded mutation allowed |

`proxy.ts` now matches exactly `/account` and `/submissions/:path*`. It preserves
the path and query in `callbackURL`, but still checks only cookie presence; a
forged cookie passed proxy and was then rejected by the database-backed page
check. Because `loading.tsx` can begin streaming before that authoritative
redirect resolves, the forged-cookie response is a 200 containing Next's
`NEXT_REDIRECT`/meta-refresh control flow rather than proxy's initial 307. It
contains no protected content.

The routes are:

| route | render | purpose |
| --- | --- | --- |
| `/submissions?view=<view>&page=<n>` | `ƒ Dynamic` | exactly one fresh paginated dataset |
| `/submissions/applications/[id]/cv` | `ƒ Dynamic` | authorise, validate, find one live row, mint and redirect |
| `/account` | `ƒ Dynamic`, unchanged | conditional staff/admin discovery link |

`loading.tsx`, the narrow client `error.tsx` and local `not-found.tsx` retain the
same page geometry and use safe fixed copy. No experimental auth interrupt or
global fallback was enabled.

### Query contract and pagination

The existing owning modules were extended; no second module touches the same
table. Every list filters `deleted_at is null`, orders
`created_at desc, id desc`, selects only rendered columns and executes
`limit 20 / offset ((page - 1) * 20)` in Postgres. The row and filtered count
start together with `Promise.all()` only after authorisation and parsing.
Twenty rows is a product judgement: it bounds a personal-data response and
keeps the operational page readable while these tables remain small. A request
past the final count redirects to the final valid page.

The selected fields are exact:

- lead — id, name, email, company, message, source, created time;
- subscriber — id, email, status, confirmation-send, created, confirmed and
  unsubscribed times; neither token is selected;
- application — id, job slug, name, email, message, original sanitised filename
  and created time; `cv_pathname` is not selected;
- Staff view — verified user id, name, email, verified state, role and created
  time.

The workspace uses server-rendered definition-list records: stacked and
wrapping on mobile, aligned as a denser grid at `lg`. Addresses, filenames,
companies and messages use `wrap-anywhere`; the page does not introduce a
horizontal scroller. Only action ids plus a display name/current staff boolean
cross into the narrow client controls.

`lib/validation/submissions.ts` normalises invalid, repeated or out-of-range
view/page input to leads/page 1 and caps the page representation at six digits
and the value at 100,000 before it can reach `.offset()`. Submission and
application ids are UUIDs; entity kind and desired role are closed Zod enums.

**One approved prompt assumption was wrong, verified against installed Better
Auth 1.6.26.** Its default `generateId()` produces 32 alphanumeric characters,
not a UUID; only `advanced.database.generateId: "uuid"` would change that.
Existing users already carry the default ids, so changing auth generation now
would strand them and violate this prompt's no-auth-configuration boundary.
Staff target ids therefore use the installed bounded
`^[A-Za-z0-9]{32}$` contract. Synthetic signup confirmed all three generated
ids matched it.

### Staff controls and removal

`app/submissions/actions.ts` validates first, then re-runs the database-backed
admin check inside each action. Role mutation can write only `staff` or null;
its guarded update excludes the acting admin, every admin/unknown-role target
and every unverified account. The first admin remains a trusted database
bootstrap operation.

Lead and subscriber removal stamp `deleted_at` once. Application removal:

1. stamps `deleted_at` and returns only pathname plus the exact timestamp;
2. calls the new strict Blob deletion helper;
3. on Blob failure, restores only the row carrying that exact timestamp, so the
   application becomes visible and retryable again;
4. on success, leaves the audit row soft-deleted while the private bytes are
   gone.

`deleteCv()` keeps its step-5 best-effort/no-throw contract. The admin flow uses
the separate `deleteCvStrict()` boolean contract. Unknown/already-removed rows
are handled outcomes. There is no bulk action, restore UI, scheduled retention
job or permanent row purge. This is a manual active-workspace control, **not a
finite retention policy**; that open policy question remains unresolved.

The client controls use an explicit confirm/cancel state before removal,
keyboard buttons, pending text and a focused polite status result. Success
revalidates only `/submissions`; no client data-fetching layer or cache was
added.

### Private CV handoff

The installed Blob 2.7.0 API is used exactly as declared. After session, role,
UUID and live-row checks, `createCvReadUrl()` calls:

1. `issueSignedToken({ pathname, operations: ["get"], validUntil })`;
2. `presignUrl(token, { access: "private", operation: "get", pathname,
   validUntil, useCache: false })`.

Both absolute expiries use one `Date.now() + 5 minutes` value. Five minutes is
a security/usability judgement, enough for one browser handoff while limiting
reuse. The API omits a separate URL-expiry query value when it equals the
delegation ceiling; runtime verification decoded the delegation payload and
proved the exact pathname, only `get`, the five-minute ceiling and `cache=0`.
The URL is redirected outside a catch, never stored, cached, listed or logged.

### Secrets and personal data

No new variable and no `NEXT_PUBLIC_*` value was added. The request-time change
reads existing `DATABASE_URL`, Better Auth's secret/base URL and
`BLOB_READ_WRITE_TOKEN`, all through server-only modules. Authorised HTML
contains only the exact fields named above. Subscriber tokens, auth secrets,
CV pathnames, Blob credentials and signed URLs never enter list HTML or client
props. Application removal necessarily sends one opaque pathname to Blob; CV
handoff necessarily sends one expiring signed URL to the requesting browser.

Application/server output during the full check contained only Better Auth's
fixed email-template/error-class lines and node-postgres's existing SSL-mode
warning. It contained no synthetic name, address, message, filename, pathname,
signed URL, query result or secret.

### Prerender impact and verification, prompt 53

Every result below was run on 9 Aug 2026.

- `npm run typecheck` exited 0 and `npm run lint` exited 0.
- `npm run build` exited 0 on Next 16.2.12, compiled the final code in **8.8
  seconds**, generated **26** static pages and emitted only `/submissions` plus
  `/submissions/applications/[id]/cv` as new `ƒ Dynamic` routes. Existing render
  modes are unchanged.
- The env-less build first reached Next but the sandbox blocked the three
  existing Google-font requests. Re-run with network access exited 0, compiled
  in **10.3 seconds**, emitted the same route table, and `.env.local` was
  confirmed restored. Database, auth and Blob construction therefore remain
  request-lazy.
- `npm run db:generate` listed the existing eight tables and reported **“No
  schema changes, nothing to migrate”**; no migration was written.
- A clean parent build at `ee27aed`, with the local Tailwind/Drizzle snapshots
  mirrored per `docs/automation.md`, had **20 of 20 common prerendered HTML
  files identical** after stripping RSC flight scripts and normalising
  generated CSS/JS/font names. This includes every marketing and existing auth
  page; the two new submissions routes have no prerendered HTML.
- An isolated production server on 3101 verified the full matrix with synthetic
  customer/staff/admin accounts and opaque submission ids: 20-row page boundary,
  deterministic newest-first order, final-page navigation, repeated-input
  normalisation, customer and staff guards, admin-only Staff view, role
  grant/revoke guards, token/pathname absence, and account-link visibility.
- The same pass verified signed CV read 200, unsigned private read 403, all
  three soft removals, staff removal denial, already-removed handling, and an
  induced strict Blob failure that restored the application row.
- Cleanup physically removed every synthetic user/account/session/submission
  row and confirmed the synthetic Blob prefix listed zero objects. The temporary
  script containing synthetic credentials was then permanently removed.

`npm run test:e2e` was not run and no focused Playwright test was added: prompt
51's Playwright setup remains unrelated dirty work and prompt 53 expressly says
not to use it as evidence until committed. Keyboard focus/announcement behavior
is implemented from the existing focused-status pattern but is therefore not
claimed as browser-driven verification in this prompt.

## Step 8 — organisations and multi-tenancy

Implemented by prompt 56 on 9 Aug 2026. This opens phase two with Better Auth's
`organization` plugin, the tenant tables it generates, an explicit
create-organisation flow on `/account`, and the membership resolution every
later phase-two query filters on (§9.2 rule 6). It adds no provider, no
environment variable, no public write path, no email and no AI surface (§5.3:
phase two's first AI surface is step 9).

### Decisions taken with the user before the prompt was written

Recorded here because each one bounds what a later session may assume was
merely unbuilt:

| decision | consequence |
| --- | --- |
| **Organisations are created explicitly**, from a flow on `/account` | sign-up and the settled auth screens are untouched, and the no-organisation state stays reachable and therefore testable |
| **Invitations are deferred to a follow-up prompt** | they block nothing downstream; an email template, an accept route and a members UI would have doubled an already large step |
| **Tenant roles are `owner` and `member` only**, per §11.1 | Better Auth's default third role, `admin`, is removed by custom access control rather than left registered and undefined |

### The plugin configuration, and why each option is set

`lib/auth/server.ts` gains one plugin inside the existing `createAuth()`,
placed **before `nextCookies()`**, which keeps its position last for the reason
its own comment gives. The options, and the reasoning that is not obvious from
the option name:

| option | value | why |
| --- | --- | --- |
| `ac` / `roles` | `organizationAccessControl`, `organizationRoles` from `lib/auth/organization-access.ts` | constrains the accepted role values to `owner` and `member` (below) |
| `creatorRole` | `"owner"` | the first member of every organisation lands on the role §11.1 names |
| `allowUserToCreateOrganization` | `async (user) => user.emailVerified === true` | sign-in already requires verification, so this is not what keeps unverified users out — it states the rule at the creation boundary instead of leaving it a consequence of `requireEmailVerification` elsewhere in the same file |
| `organizationLimit` | `3` | **a judgement, not a measurement** |
| `membershipLimit` | `100` | **a judgement, not a measurement** |
| `disableOrganizationDeletion` | `true` | the plugin's delete cascades members and invitations, while §9.2 rule 5 wants a soft-delete with an audit trail so an erasure request is one reversible operation. Off rather than merely unbuilt; design the two together, later |
| `teams`, `dynamicAccessControl` | left disabled | neither is in §5.2 step 8, and §5.2's "do not overbuild" covers the temptation |

**Both limits are judgements and are recorded as such** (§12 rule 4). Nothing
has shipped, so there is no traffic to fit them against. They are bounds
against runaway creation on the free Neon plan, not product requirements, and
sit on the same footing as every window in `lib/rate-limit/` — revisit them
against real usage rather than treating them as fitted.

### Why the organisation-level `admin` role was dropped

Better Auth ships three default organisation roles — `owner`, `admin` and
`member`. `lib/auth/organization-access.ts` registers two, building the
controller from the library's own `defaultStatements` and its own `ownerAc` /
`memberAc` definitions rather than restating either, so a library upgrade that
adds a resource does not silently leave these roles behind.

`adminAc` is omitted for two reasons:

1. §11.1 names exactly `owner` and `member` on the tenant side. A third role
   with no defined powers is dead surface, and the first phase-two feature to
   ask "what can an org admin do?" would have to invent the answer.
2. **`admin` already means something else in this codebase.** `user.role`
   carries Aetherfield's own staff roles, `staff` and `admin` (step 7,
   `lib/db/auth-queries.ts`). An organisation-level `admin` sharing the word
   would make every authorisation read ambiguous at a glance.

**Omitting the role is not a security boundary on its own.** It means the
plugin will not accept `admin` as a role value; it authorises nothing by
itself.

### The orthogonality invariant

**An Aetherfield staff member is not thereby a member of any customer
organisation** (§11.1). `user.role` being `staff` or `admin` grants nothing on
the tenant side, and no tenant read may be authorised by it. The membership row
is re-read from Postgres per request and the role comes from that row, never
from the session payload (§11.2 rule 5).

This is written as a stated invariant in the resolution module rather than left
implicit, because the temptation to add a staff bypass arrives at step 12 —
when a staff account cannot see the dashboard it is trying to debug. Build step
8 does not have that bypass, and adding one is a decision, not a fix.

`lib/auth/organization.ts` is the tenant gate. It exports
`getCurrentMembership()`, `requireOrganization(callbackURL)` and
`authorizeOrganization(organizationId)`.

`getCurrentMembership()` resolves in three steps: the session's
`activeOrganizationId` if it names an organisation the user is actually a
member of; otherwise the user's **sole** membership, because a user with
exactly one organisation has no choice to make and an explicit "set active"
step before their only workspace appears would be a state with one exit;
otherwise `null`. A stale or forged `activeOrganizationId` falls back to the
sole membership rather than locking the user out.

`requireOrganization()` redirects a signed-out caller to
`/sign-in?callbackURL=...` and a signed-in caller with no organisation to
`/account`, where the create flow is — not to an error, because having no
organisation yet is an ordinary state rather than a fault.
`authorizeOrganization()` is the action-side counterpart: no redirect, just the
answer, because a Server Action returns a typed result and never throws to the
client (§10 rule 2).

**Nothing in the module reads `account.role`**, and the docblock says so
explicitly.

`lib/db/organization-queries.ts` exports `getMembership(userId,
organizationId)`, `listMembershipsForUser(userId)` and
`getOrganizationBySlug(slug)`.

**`getMembership()` is the function step 9 onwards filters on.** It joins
`member` to `organization` and filters on `member.user_id` and
`member.organization_id` and nothing else — no role column of any kind enters
the predicate, which is what makes the orthogonality invariant structural
rather than a convention.

### The generated schema

Better Auth's schema is generated, never authored (§7.3: `npx auth@latest
migrate` is Kysely-only; on the Drizzle adapter it is `generate`, whose output
must then be applied by Drizzle Kit). Generation ran to a scratch path and the
diff was merged into `lib/db/auth-schema.ts` by hand — that file is not purely
generated, carrying hand-added `index()` calls, the `relations()` block and the
`rate_limit` table.

Generation ran through a new committed helper,
`scripts/generate-auth-schema.py`, which wraps:

```
npx auth@latest generate --config lib/auth/cli.ts \
  --output <scratch>/auth-schema.generated.ts --yes
```

The helper exists because the CLI refuses to evaluate a config module carrying
`server-only` ("Please remove import 'server-only' from your auth config file
temporarily"). Step 6 cleared that by hand. Doing it by hand is the failure
mode: if the generator throws, the guards stay off and the next commit ships a
codebase whose client-import protection is gone. The helper holds all sixteen
guarded file bodies in memory and restores them in a `finally`, so the guards
are off only for one subprocess. It also refuses an `--output` of
`lib/db/auth-schema.ts`. Observed: `Stripping the guard from 16 file(s)` then
`Restored the guard in 16 file(s)`, and `grep -rl` confirmed 16 files still
carry the guard afterwards.

The generated output proved to be a **strict superset** of the committed file
— `diff` reported 0 removed lines and 80 added — so it was copied wholesale
rather than transcribed, which removes the hand-merge as a fabrication risk
entirely. The three tables, as generated:

| table | columns |
| --- | --- |
| `organization` | `id` text pk, `name` text not null, `slug` text not null unique, `logo` text, `created_at` timestamp not null, `metadata` text |
| `member` | `id` text pk, `organization_id` text not null → `organization.id` cascade, `user_id` text not null → `user.id` cascade, `role` text not null default `'member'`, `created_at` timestamp not null |
| `invitation` | `id` text pk, `organization_id` text not null → `organization.id` cascade, `email` text not null, `role` text, `status` text not null default `'pending'`, `expires_at` timestamp not null, `created_at` timestamp not null default now, `inviter_id` text not null → `user.id` cascade |

`invitation` is created by the plugin's own schema even though invitations are
out of scope for this step; the table exists and is unused, which is the
library's shape and not a decision made here.

**`member` carries no unique constraint on `(organization_id, user_id)`.** That
is Better Auth's generated schema as it stands, not an omission made here, and
it is left alone because the auth schema is generated and never hand-authored
(§9). Worth revisiting with the library before step 9 relies on one row per
pair.

`session` gained `active_organization_id text` (nullable), confirmed in the
migration at line 30 and read back from `information_schema.columns` after the
apply: `active_organization_id | text | YES`.

**None were added by hand.** The generator emitted
`member_organizationId_idx`, `member_userId_idx`,
`invitation_organizationId_idx` and `invitation_email_idx`, plus
`organizationRelations`, `memberRelations` and `invitationRelations` and the
`members` / `invitations` additions to `userRelations`. The prompt anticipated
hand-adding these; the generator already covers them, so nothing was judged
here. Recorded because the prompt predicted otherwise (§12 rule 8).

`npm run db:generate` reported `11 tables` and wrote
`lib/db/migrations/0003_dazzling_captain_britain.sql`: three `CREATE TABLE`
statements, the `session` ALTER, four foreign keys and the four indexes above.
`npm run db:migrate` applied it over `DATABASE_URL_UNPOOLED` and ended
`[✓] migrations applied successfully!`.

Read back from Postgres afterwards: `invitation`, `member` and `organization`
all present in `information_schema.tables`, and `member`'s five columns match
the generated types exactly.

### The validation contract

`lib/validation/organization.ts` holds the organisation's input contract and
its role vocabulary — one set of rules, shared verbatim by the client leaf and
the Server Action so they exist once and run twice (§10 rule 1).

**It stays outside `server-only`, and that is deliberate** (§6.3). It reads no
secret and touches no connection; being importable from the browser is the
whole point. It also imports nothing from `lib/db/` and nothing from
`better-auth` — `lib/db/schema.ts` calls `pgEnum` at module scope, so an import
there would put `drizzle-orm/pg-core` in a marketing page's browser bundle. The
`ORGANIZATION_ROLES` union therefore lives in this module and
`lib/auth/organization-access.ts` imports it, rather than the reverse, so the
role names are declared exactly once (§9.2 rule 2).

What the schema enforces:

| field | rule |
| --- | --- |
| `name` | trimmed, 1–160 characters |
| `slug` | lowercased and trimmed **before** the shape check, so a pasted capital is corrected rather than rejected — the same courtesy `lib/validation/lead.ts` extends to an email address |
| `slug` shape | 2–48 characters, `^[a-z0-9]+(?:-[a-z0-9]+)*$` — lowercase alphanumerics with single hyphens between them |
| `slug` reserved words | rejected against a set covering every top-level route segment that exists today, plus the segments §5.2 already commits phase two to |

The slug is **not** in a URL as of step 8 — no `/[org]` route ships — but it is
the identifier phase two will reach for, and a slug already in the table is far
more expensive to reject later than at the point it is created.

`slugifyOrganizationName()` derives a candidate slug from the name for the
form's convenience only. It is never trusted: the action re-parses whatever
arrives with the same schema.

`app/account/actions.ts` exports
`createOrganization(input: unknown): Promise<SubmitResult<CreateOrganizationField>>`.

Stage order is b then c (§10 rule 3): `getCurrentAccount()` first — no session
returns a handled `{ ok: false }`, never a throw and never a redirect — then
`checkOrganizationCreateLimit()` keyed by **user id** rather than IP, because
the path is authenticated and an IP key would throttle a whole NAT while
leaving single-account slug probing unbounded. Rejection returns `formatRetry()`
timing. Then `createOrganizationSchema.safeParse`, with `z.flattenError` mapped
onto `fieldErrors`. Then
`getAuth().api.createOrganization({ body: { name, slug }, headers: await headers() })`,
then `revalidatePath("/account")`. No redirect on success (§10 rule 5).

The limiter is 10 per hour, sliding, prefix `organization-create` — **a
judgement, not a measurement**, on the same footing as every other window in
`lib/rate-limit/`. It is deliberately loose because the real cap is the
plugin's `organizationLimit`, not this; the limiter exists to stop a script
walking the slug namespace, not to bound honest use. The user id needs no
sha256: it is the opaque identifier of the session's own subject, not a name or
an address, so the module's "no identifier here is personal" docblock stays
true.

A duplicate slug is a **typed field error on `slug`**. The discriminant is
`error.body?.code === ORGANIZATION_ALREADY_EXISTS`, narrowed with `isAPIError`
from `better-auth/api` — read from `routes/crud-org.mjs` rather than recalled.
Note `ORGANIZATION_SLUG_ALREADY_TAKEN` is *not* handled: that code is thrown
only by the check-slug and update endpoints, never by create.

**BotID is deliberately not applied**, and the decision is written into the
shipped action rather than left to be re-derived. §8.2's BotID rule covers
*public* write paths; this one requires a live, email-verified session, which
is a strictly stronger gate. Adding it would also mean listing `/account` in
`instrumentation-client.ts` — §7.3 records that as a two-file commitment whose
half-application makes the server call **fail** rather than pass.

### One AGENTS.md line was wrong, and is corrected in this change

§9.2 rule 7 listed the phase-two entity as **`membership`**. Better Auth's table
is **`member`**, and the name is the library's to choose (§12 rule 6). Per §12
rule 8 the line is corrected rather than silently contradicted: that one word in
§9.2 rule 7 now reads `member`. It is the only edit this step made to
`AGENTS.md` — no build-step ticking, no build record, per the front-matter cap
rule.

### Prerender impact and verification, prompt 56

**Expected: none, and it must be verified rather than assumed** (§8.1).
`/account` and `/submissions` are already `ƒ Dynamic` (step 7's route table
above). Auth adds no root provider and this step adds none, and `proxy.ts`'s
matcher stays exactly `["/account", "/submissions/:path*"]` — it is not
widened.

`npm run lint` — exit 0, no output beyond npm's own notice lines.

`npm run typecheck` — exit 0, no diagnostics.

`npm run build` succeeded, generating 26 static pages with 7 workers in 679 ms.
The route table matches §8.1 verbatim: `/`, `/about`, `/careers`,
`/design-system`, `/journal` (plus `/_not-found`, `/forgot-password`,
`/reset-password`, `/sign-in`, `/sign-up`, `/verify-email`) as `○ Static`; the
six `/article/[slug]` and three `/job-listing/[slug]` as `● SSG`; `/account`,
`/submissions`, `/submissions/applications/[id]/cv`, `/api/auth/[...all]`,
`/api/newsletter/unsubscribe`, `/newsletter/confirm` and
`/newsletter/unsubscribe` as `ƒ Dynamic`. **No marketing route changed mode.**

**21 shared prerendered pages compared, 0 differed.** The parent build was a
`../aetherfield-base` worktree at `bca19b9` with hard-linked `node_modules`.

Three traps had to be cleared before the number meant anything, and all three
are now in `docs/automation.md`:

1. **The four gitignored docs snapshots contaminate the CSS.** With them
   present the build emitted two CSS chunks; stashed behind a restoring `EXIT`
   trap it emitted one, matching the parent. The contaminated build would have
   shown every page gaining a stylesheet.
2. **JS chunk names are content-hashed and rename freely.** Normalising only
   `BUILD_ID` and the CSS chunk left 19 of 21 pages "differing" — every one at
   identical byte length, the signature of a pure rename. The helper normalises
   `/_next/static/chunks/[A-Za-z0-9_-]+\.js` as well.
3. **A `next dev` server was running in the workspace and rewrites `.next`
   underneath a comparison.** A page vanished mid-run. The fix was to build a
   pristine copy of the working tree in the scratchpad rather than touch the
   user's server; the 0-of-21 result is from that build.

No `magick compare` was run: no page's markup changed, so there is no render to
compare and the masking rule for `/`, `/journal` and `/careers` did not arise.

`npm run test:e2e` — the Chromium and Firefox projects both passed:
`2 passed (18.3s)`, building and serving production on port 3100.

The script then chained a WebKit step from concurrent work on the same branch
and stopped with `Podman is required for WebKit on Arch Linux.` That is not
this step's work and nothing here depends on it; the native matrix is green.

**Not performed, and that is a gap rather than a pass** (§12 rules 3 and 9).
The five browser scenarios in prompt 56 — the signed-out redirect, the create
flow, creation swapping in place with the creator as `owner`, the announced
duplicate-slug field error, and a second account resolving to no membership —
were not exercised against a running app in this session.

What *was* verified, against the live database:

- The three tables and the `session` column exist with the generated types.
- **The orthogonality guard is structural, not demonstrated.** The query
  `select u.role, count(m.id) from "user" u left join member m on m.user_id =
  u.id where u.role in ('staff','admin') group by u.role` returned **no rows** —
  there is no `staff` or `admin` account in the database to assert against. The
  guarantee rests on `getMembership()`'s predicate, which reads only
  `member.user_id` and `member.organization_id`, and on
  `lib/auth/organization.ts` never reading `account.role`. **Demonstrating it
  with a real staff account and a real organisation is the first thing step 9
  should do.**

No new environment variable, and no `NEXT_PUBLIC_*` — phase one's set is
unchanged and this step reads none of it directly. Every new module under
`lib/` carries `server-only` except `lib/validation/organization.ts`, which is
the deliberate exception (§6.3) and imports nothing from `lib/db/` or
`better-auth`; the `server-only` guard was confirmed working when a
verification script importing `lib/db/client.ts` was refused at load.

No organisation name, slug, member email address or request body is logged
anywhere on this path: the action's catch blocks log nothing at all, and the
rate limiter's key is an opaque user id.

### What step 8 deliberately did not do

| not done | why |
| --- | --- |
| invitations, `sendInvitationEmail`, an accept route, a members management UI | the user's decision above; blocks nothing downstream, and **remains deferred**. This line originally read "and is the next prompt". It was not: the user chose step 9 over it, and prompt 57 implemented step 9. Corrected here rather than left standing against what the repository shows (§12 rule 8) |
| teams, `dynamicAccessControl`, custom roles | not in §5.2 step 8 |
| organisation deletion or renaming | §9.2 rule 5 wants a soft-delete with an audit trail; design it with the erasure path, not ahead of it |
| any phase-two table — `site`, `activity_record`, `emission_factor`, `target`, `report` | steps 9–13 |
| any dashboard route or chart | step 12. `home/dashboard.tsx` stays a marketing illustration |
| refactoring the six existing `app/_components/auth/*` components onto a shared auth client | settled screens, and the churn buys nothing this step needs |
| touching sign-up | decision 1 above |
| widening `proxy.ts`'s matcher | §8.1 — the marketing routes must stay unmatched |
| adding a staff bypass into tenant data | §11, explicitly |

## Step 9 — activity-data ingestion

Implemented by prompt 57 on 10 Aug 2026. CSV import, staged rows, validation
and a visible import outcome — the first phase-two data tables, tenant-scoped
from their first line (§9.2 rule 6). It adds no provider, no environment
variable, no public write path, no email, and **no AI surface at all**.

### Decisions taken with the user before the prompt was written

| decision | consequence |
| --- | --- |
| **Step 9 over step 8's deferred invitations** | invitations block nothing downstream; step 9 unblocks steps 10-13, none of which can begin until rows exist in `activity_record` |
| **Deterministic header mapping, not the AI mapper** | §5.3 sanctions structured extraction for this step but does not schedule it. A fixed alias table plus a human review step ships instead. **No AI SDK is installed, no model is named, no prompt is scaffolded.** The mapper drops in behind the same review control later with no rework, because `proposeMapping()` already returns a *proposal* that `updateImportMapping` overrides |

### What was built, and where it lives

The directory contract in §6.3 is **not extended** — there is no `lib/import/`:

| module | role |
| --- | --- |
| `lib/validation/activity.ts` | the four enum vocabularies, the six canonical fields, the mapping schema, the upload constraints. **Not `server-only`** — the deliberate exception, and it imports nothing from `lib/db/` |
| `lib/db/schema.ts` (extended) | the four tables and their `pgEnum`s, built from the constants above |
| `lib/db/activity-queries.ts` | every read and write of them |
| `lib/domain/csv.ts` | RFC 4180 parsing — **pure**, created by this step |
| `lib/domain/activity-import.ts` | header mapping and row coercion — **pure** |
| `lib/storage/activity-import.ts` | the raw CSV's private blob write, delete and signed read |
| `lib/rate-limit/index.ts` (extended) | `checkActivityImportLimit`, `checkActivityCommitLimit` |
| `app/activity/actions.ts` | the four Server Actions, colocated |
| `app/activity/page.tsx`, `app/activity/[importId]/page.tsx` | the workspace and the review view |
| `app/_components/activity/{upload-form,mapping-form,import-controls}.tsx` | three client leaves, component-only, no GSAP |

**`lib/domain/` is created here and is the phase-two domain layer §6.2
specifies**: pure functions over typed inputs, no database handle, no `fetch`,
no implicit `Date.now()`. Step 10's calculation engine lands beside these two
modules. `parseIsoDate` uses `Date.UTC` rather than `new Date(y, m, d)` so 29
February's validity does not depend on the server's timezone.

### The tables, as applied

Read back from `information_schema` and `pg_indexes` after `db:migrate`, not
from the generated SQL — a generated migration is not evidence that it applied.

**`site`** — `id` uuid pk `gen_random_uuid()`, `organization_id` text not null →
`organization.id` cascade, `name` text not null, `normalized_name` text not
null, `created_at` timestamptz not null `now()`, `deleted_at` timestamptz.
Unique index `site_organization_normalized_name_key (organization_id,
normalized_name)`.

**`activity_import`** — 16 columns: `id` uuid pk, `organization_id` text not
null → `organization.id` cascade, `uploaded_by` text not null → `user.id`
cascade, `filename` text not null, `blob_pathname` text **nullable**,
`status` enum not null, `header_row` text not null, `row_count` /
`valid_row_count` / `invalid_row_count` integer not null default 0,
`column_mapping` text not null, `error` text, `created_at` not null,
`committed_at`, `discarded_at`, `deleted_at`. Index
`activity_import_organization_created_at_idx (organization_id, created_at)`.

**`activity_import_row`** — 15 columns: `id` uuid pk, `import_id` uuid not null
→ `activity_import.id` cascade, `organization_id` text not null →
`organization.id` cascade, `row_number` integer not null, `raw` text not null,
then the nullable coerced columns `site_name`, `site_normalized_name`,
`activity_date` date, `category` enum, `description`, `quantity`
numeric(18,6), `unit` enum, plus `status` enum not null, `error` text,
`created_at` not null. Unique index
`activity_import_row_import_row_number_key (import_id, row_number)`; index
`activity_import_row_import_status_idx (import_id, status)`.

**`activity_record`** — 12 columns: `id` uuid pk, `organization_id` text not
null → `organization.id` cascade, `site_id` uuid not null → `site.id` **no
action**, `activity_date` date not null, `category` enum not null,
`description` text, `quantity` numeric(18,6) not null, `unit` enum not null,
`import_id` uuid → `activity_import.id` **set null**, `import_row_id` uuid →
`activity_import_row.id` **set null**, `created_at` not null, `deleted_at`.
Indexes `activity_record_organization_date_idx (organization_id,
activity_date)` and `activity_record_organization_category_idx
(organization_id, category)`.

`site_id` is deliberately `NO ACTION` where every other reference cascades or
nulls: a committed disclosure figure must not lose the facility it was measured
at because a site row was removed.

### The enums, as applied

| enum | members |
| --- | --- |
| `activity_import_status` | `staged, committed, discarded, failed` |
| `activity_import_row_status` | `valid, invalid, committed` |
| `activity_category` | `electricity, fuel, heat, waste, water, travel, freight, other` |
| `activity_unit` | `kWh, MWh, L, m3, kg, t, km, tkm` |

**All four are declared in `lib/validation/activity.ts` and spread into
`pgEnum` in `schema.ts`** (§9.2 rule 2), for the reason `ORGANIZATION_ROLES`
lives in `lib/validation/organization.ts`: `pgEnum` runs at module scope, so a
client leaf importing `schema.ts` would pull `drizzle-orm/pg-core` into a page
bundle.

**The category and unit sets are judgements, not measurements** (§12 rule 4).
There is no corpus of customer files to fit them against. Step 10 may extend
them; extending an enum is cheap, forking a parallel column is not.

**`failed` is currently unreachable, and that is recorded rather than hidden.**
The prompt's rationale for it was that "a file that cannot be parsed at all
still deserves a row a person can see", but the same prompt's stage c makes an
unparseable file a *rejection* with a legible field error naming the line to
fix — no blob is written and no row is created. The rejection is the better
outcome: the person sees the reason immediately, and uploading garbage does not
accumulate rows. The member stays in the enum because an asynchronous or
connector-driven ingestion path (step 9's "connectors later") will need it, and
adding a member to a live enum is more expensive than reserving one.

### `quantity` is `numeric(18, 6)`, and it is read back as a string

`numeric()` without a `mode` yields a **string** in Drizzle — confirmed on the
snapshot's `pg/column-types` page — and it is left that way on purpose. These
figures end up in regulatory disclosures (§5.3), and binary floating point is
the wrong representation for a number that must survive a round trip exactly.
`lib/domain/activity-import.ts` never passes a quantity through `Number`: the
source string is validated against a pattern and handed to the column
unchanged.

**The precision and scale are a judgement, not a measurement.** 12 digits
before the point covers a national grid's annual kWh with room to spare; 6
after it covers a fuel meter's litres. Both halves are enforced at coercion
time, so an over-long value is a legible row error rather than a write failure
that takes a whole commit down.

Verified against the live database: `500`, `11980.25` and `12450.5` round-trip
as `500.000000`, `11980.250000`, `12450.500000`.

### The CSV grammar the parser accepts

Hand-written rather than a package, and **no CSV package is installed**. The
parser must be pure, deterministic and independently testable to sit in
`lib/domain/` at all; the grammar is small and fully specified; and §12 rule 2
makes an unverified third-party API a cost rather than a saving.

- **UTF-8**, leading BOM stripped. `TextDecoder(..., { fatal: true })` — without
  `fatal` a UTF-16 or Latin-1 file decodes into replacement characters and
  parses "successfully" into nonsense.
- **Comma** only. No delimiter sniffing.
- **`"` quoting**, `""` for a literal quote. Quoted fields may contain commas
  and newlines.
- **CRLF or LF.** A lone CR outside a quoted field is a failure.
- **A header row is required**, and it is the first record.
- **Blank lines are skipped** wherever they occur, so a trailing newline is not
  an empty final row.

Anything outside that grammar is a parse failure carrying the physical line it
happened on — never a silent mis-parse. Observed messages, exercised directly:
`Line 2: a quoted value is never closed.`, `Line 2: there are characters after
a closing quote.`, `That file has a header row and no data rows.`, `That file
is not UTF-8 text.`

**Dates accept `YYYY-MM-DD` and `YYYY/MM/DD` only, and that is the decision.**
`05/06/2026` is 5 June to a British export and 6 May to an American one, and a
wrong date silently moves a figure into another reporting period. Guessing is
worse than asking, so an ambiguous date is a row error reading `use an ISO
date, for example 2026-03-31.`

**Quantities take no thousands separators.** Stripping commas is ambiguous
against a European decimal comma in a comma-delimited file, so the pattern is
`^[+-]?\d{1,12}(\.\d{1,6})?$`; a leading `+` is dropped because Postgres
`numeric` rejects one, and nothing else is rewritten.

### The alias table

`lib/domain/activity-import.ts` matches on a normalised header — lowercased,
non-alphanumeric runs collapsed to single spaces, trimmed — so `Activity_Date`,
`activity date` and `Activity-Date` are one header and `Qty.` is `qty`. **A
judgement, not a measurement**: it is the set of headers a utility bill export,
a fleet-card statement and a waste-contractor report were expected to use.

Two guarantees the review view relies on and that are enforced rather than
assumed: the **leftmost** matching column wins, and **no column is proposed for
two fields**. The alias sets are disjoint today; the second guarantee exists so
an alias later added to two lists cannot silently duplicate one column's value
across two schema fields.

Verified: the header row `Facility,Activity Date,Category,Notes,Consumption,UOM`
proposes `{site:0, date:1, category:2, description:3, quantity:4, unit:5}`.

### The four actions

All four resolve the tenant server-side and take **no organisation id from the
browser**. `getCurrentMembership()` is the primitive rather than
`authorizeOrganization(organizationId)` — the prompt named the latter, but it
takes an id, and the only way an action could obtain one is from the request,
which is exactly what must not happen. **This is a deliberate deviation from
the prompt's wording in service of the prompt's own rule**, recorded here per
§12 rule 8. The two are the same database-backed check; this one takes no
argument to get wrong.

| action | signature | stages |
| --- | --- | --- |
| `stageImport` | `(formData: FormData) => Promise<StageImportResult>` | a skipped (below), b session + tenant then `checkActivityImportLimit(userId)`, c file gates then UTF-8 decode then parse, d the tenant from the membership row, e blob `put` then one transaction, f none |
| `updateImportMapping` | `(importId, mapping) => Promise<SubmitResult<ActivityField>>` | b, `importIdSchema` + `activityMappingSchema`, every index re-checked against the **stored** header row, then re-coerce every staged row and rewrite the counts in one transaction |
| `commitImport` | `(importId) => Promise<SubmitResult>` | b, then one transaction: re-read status, upsert sites, insert records, mark rows `committed`, mark the import `committed` |
| `discardImport` | `(importId) => Promise<SubmitResult>` | b, then one transaction: read the pathname, mark `discarded`, null the pathname; then a best-effort blob delete |

`stageImport` returns `{ ok: true, importId }` — the one result shape in this
repository that carries a value on success, and a deliberate extension of
`SubmitResult` rather than a second vocabulary. Its failure half is
`SubmitResult`'s verbatim.

**The `type` gate is deliberately absent on this upload**, unlike the CV path's.
Browsers report CSV as `text/csv`, `application/vnd.ms-excel`,
`application/octet-stream` or an empty string for the same file, so an equality
check would reject honest uploads. The parse is the real check (§8.2 rule 3):
a file that does not decode as UTF-8 and yield a header row is rejected
whatever it claims to be.

**BotID is deliberately not applied**, and the decision is written into the
shipped action rather than left to be re-derived — the same reasoning step 8
recorded. §8.2's BotID rule covers *public* write paths; this one requires a
live session on a verified account **and** a `member` row, which is strictly
stronger. Adding it would mean listing `/activity` in
`instrumentation-client.ts`, and §7.3 records that as a two-file commitment
whose half-application makes the server call **fail** rather than pass.

**Success navigates, and this is the one sanctioned navigation on a write path
in this repository.** §10 rule 5 forbids a redirect because the phase-one forms
sit inside settled, measured marketing pages whose scroll and motion state a
navigation would discard. `/activity` is neither, and moving to the staged
import *is* the outcome — there is nothing else for the form to swap to. **Not
licence to redirect a marketing form.**

### The two limiter windows

Both are **judgements, not measurements**, on the same footing as every window
beside them, and both are keyed by **user id** rather than IP for the reason
`organization-create` records: the path is authenticated, an IP key would
throttle a whole NAT, and the abusable surface is one account in a loop.

| limiter | window | reasoning |
| --- | --- | --- |
| `activity-import` | 20 / hour | deliberately loose — correcting a mapping often means several re-exports in one sitting. What it bounds is cost: every accepted upload writes a private blob and up to 10,000 staged rows, by far the most expensive write in the codebase |
| `activity-commit` | 60 / hour | looser still — commit, discard and mapping override write no blob and read no file; the limit stops a broken client hammering Postgres, not a dangerous path |

### Upload constraints

`CSV_MAX_BYTES` 2 MB, `CSV_MAX_ROWS` 10,000 — **both judgements**. 2 MB sits
under `next.config.ts`'s existing 6 MB Server Action body limit with room for
the multipart envelope, so the framework never rejects a request before the
action can render an error. `CSV_MAX_ROWS` bounds the parse rather than the
file, because 2 MB of one-byte rows is still a million records. A file over the
row cap **fails as a whole rather than being truncated**: a truncated import is
a disclosure built on part of a customer's data.

### The visible outcome

`/activity/[importId]` shows the file, who uploaded it and when, the status,
the resolved mapping with each canonical field naming its source header or
reading `Not mapped`, the three counts, and the invalid rows with their line
number and reason, paged at 25. Commit and discard render only while the import
is `staged` — **and the actions authorise regardless**, because hiding a control
is presentation and never enforcement (§6.2, §11.2 rule 2).

Every outcome is announced through a focused live region and is legible without
colour (§8.2 rule 5), copying `create-organization-form.tsx`. The register is
measured and operational: "3 of 5 rows need attention", never "Oops".

### Retention

The raw blob is stored privately at `activity-import/<uuid>.csv` — non-guessable
and carrying **no tenant identity**: never the organisation id, its slug, the
uploader, or the customer's filename, so a store listing is not itself a list of
who Aetherfield's customers are.

**A discard deletes the object and nulls `blob_pathname` in the same
transaction**, so retention is finite and stated (§8.3 rule 5). **A committed
import keeps its file** — that is the deliberate intent, because `import_id` and
`import_row_id` on `activity_record` exist so step 13 can trace a disclosed
figure back to the row a customer uploaded, and the source file is the last link
in that chain. There is no automatic expiry yet; the erasure path and a stated
retention period are to be designed together, as step 8 said of organisation
deletion.

### The four small edits outside the new area

1. `proxy.ts`'s matcher is now `["/account", "/activity/:path*",
   "/submissions/:path*"]` — **enumerated, not widened**. The marketing routes
   stay unmatched (§8.1).
2. `RESERVED_SLUGS` gains `"activity"`.
3. `/account` gains an "Import activity data" `ButtonLink` inside the
   organisation section, shown only when a membership exists. `/account` is
   already `ƒ Dynamic`.
4. `lib/rate-limit/index.ts` gains the two limiters above.

`SiteNav` and `SiteFooter` are untouched.

### The two items inherited from step 8, both resolved

**1. The staff / tenant orthogonality invariant is now demonstrated, not just
argued.** Step 8 could only offer the structural argument, because the database
held no staff account. A verification harness created a `role = 'admin'`
account and an organisation it is not a member of, then ran the real query
modules against the live database:

```
PASS  staff account has no membership of any organisation
PASS  getMembership(staff, orgA) is null even though the account is role=admin
PASS  getMembership(owner, orgA) resolves
PASS  getMembership(owner, orgB) is null — membership is per organisation
PASS  staff account still has no membership after all of that
```

**2. Better Auth does not guarantee one `member` row per `(organization_id,
user_id)`, and this step does rely on it.** Read from
`node_modules/better-auth/dist/plugins/organization/`, not recalled:

- `adapter.mjs`'s `createMember` is a bare `adapter.create({ model: "member" })`
  with no existence check;
- `routes/crud-members.mjs`'s `addMember` checks `countMembers` against
  `membershipLimit` and then creates — it never looks for an existing row for
  the pair;
- `routes/crud-invites.mjs`'s `acceptInvitation` likewise creates
  unconditionally inside its transaction;
- the generated schema carries no unique constraint on the pair, and the
  library's own source carries a `FIXME(team-cap-race)` acknowledging the same
  count-then-create race for `teamMember`.

**So duplicate rows are possible** — an account already in an organisation
accepting a second invitation to it, or `addMember` called twice server-side,
produces two rows.

**What it does and does not affect here.** It is **not** a tenant-boundary
problem: both rows name the same organisation, so no query can return another
customer's data because of one. `getMembership()` takes `.limit(1)` with no
`ORDER BY`, so the only exposure is a **non-deterministic role** if the two rows
disagree — an `owner` duplicate and a `member` duplicate for the same person.
Nothing in step 9 branches on the tenant role, so nothing here is affected
today; step 12's tenant-side authorisation would be.

**No constraint was hand-added.** `lib/db/auth-schema.ts` is generated and is
never hand-authored (§9), and adding a unique index behind the library's back
would make the next `auth generate` diff misleading. The fix belongs with the
library — an upstream constraint, or an explicit decision recorded with the user
to add one — and is flagged here for step 12 rather than taken silently.

### Prerender impact and verification, prompt 57

**Expected: none, and verified rather than assumed** (§8.1).

`npm run lint` — exit 0, no output beyond npm's own notice lines.
`npm run typecheck` — exit 0, no diagnostics.

`npm run db:generate` reported `15 tables` and wrote
`lib/db/migrations/0004_black_ghost_rider.sql`: four `CREATE TYPE`, four
`CREATE TABLE`, nine foreign keys and six indexes. `npm run db:migrate` applied
it over `DATABASE_URL_UNPOOLED` and ended `[✓] migrations applied
successfully!`. The applied schema was then read back from
`information_schema.columns`, `pg_type`/`pg_enum`,
`information_schema.referential_constraints` and `pg_indexes`, and matches the
tables above column for column.

`npm run build` succeeded, generating 27 static pages with 7 workers in 357 ms.
The route table matches §8.1 verbatim: `/`, `/about`, `/careers`,
`/design-system`, `/journal` (plus `/_not-found`, `/forgot-password`,
`/reset-password`, `/sign-in`, `/sign-up`, `/verify-email`) as `○ Static`; the
six `/article/[slug]` and three `/job-listing/[slug]` as `● SSG`; `/activity`
and `/activity/[importId]` join `/account`, `/submissions`,
`/submissions/applications/[id]/cv`, `/api/auth/[...all]`,
`/api/newsletter/unsubscribe`, `/newsletter/confirm` and
`/newsletter/unsubscribe` as `ƒ Dynamic`. **No marketing route changed mode.**

**21 shared prerendered pages compared, 0 differed**, with no page present in
one build and absent from the other. The base was a `../aetherfield-base`
worktree at `cc8c8c3` with `node_modules` hard-linked in after
`rm -rf`; the implementation build ran in the workspace with the four
gitignored docs snapshots stashed behind a restoring `EXIT` trap, and both
emitted a single CSS chunk (70,917 bytes against the base's 70,468 — the new
views' utilities, which renames the content-hashed chunk on every page and is
what the normalisation exists for). `BUILD_ID`, the CSS chunk name and the
content-hashed JS chunk names were all normalised, per the three traps
`docs/automation.md` records. No `next dev` server was running.

No `magick compare` was run: no page's markup changed, so there is no render to
compare and the masking rule for `/`, `/journal` and `/careers` did not arise.

`npm run test:e2e:local` — Chromium and Firefox both passed: `2 passed (18.8s)`,
building and serving production on port 3100. **WebKit was not run**: `podman`
is not installed on this machine, and `npm run test:e2e:webkit` requires it on
Arch Linux. That is a gap, not a pass.

### What was exercised, and what was not

**Exercised, against the live database, through the real query and domain
modules** (28 assertions, all passing, fixtures created and deleted in the same
run — the database was confirmed back to 0 rows in all six tables afterwards):

- staging a six-column vendor file with two deliberately broken rows: 5 rows,
  3 valid, 2 invalid, with line numbers and per-field reasons;
- cross-tenant isolation on every read: the same `importId` read as another
  organisation returns `null` from `getImport`, and no rows from
  `listImportRows` or `listRawImportRows`;
- cross-tenant isolation on every write: `restageImport` returns `false`,
  `commitImport` and `discardImport` both return `not-found` — the identical
  answer a non-existent id gets, so there is no existence oracle;
- a mapping override in both directions: unmapping `unit` moved the counts to
  0 valid / 5 invalid, re-mapping restored 3 / 2;
- commit: 3 records written, idempotent on a second call
  (`already-committed`), the 2 invalid rows still `invalid` afterwards;
- site upsert: `Bristol Works` and `Bristol works ` became **one** site, and
  the stored display name is refreshed to the spelling the latest file used;
- discard: returns the pathname to delete, writes no records, and a committed
  import can be neither discarded nor re-mapped.

**Not exercised, and that is a gap rather than a pass** (§12 rules 3 and 9):

- **the flow through a browser.** No organisation existed in the database and
  the one verified account's password is not available to this session, so
  sign-in could not be driven. The three client leaves' announcement, focus and
  pending states are implemented from the settled pattern in
  `create-organization-form.tsx` and `action-controls.tsx`; they are **not**
  claimed as browser-verified.
- **the Server Actions' own stages.** `resolveTenant`, the two rate limiters,
  the BotID-shaped absence, the file gates and the blob write were not run —
  the harness exercises the query and domain layers those actions call, not the
  actions themselves, which need a request context.
- **a real blob round trip.** `putActivityImport` /
  `createActivityImportReadUrl` were not called; the harness passed a synthetic
  pathname.
- **WebKit**, as above.

There is **no unit-test script in this repository**, and `lib/domain/`'s two
pure modules are the first thing here that genuinely wants one. Whether to add
a harness is its own decision and is not taken here.

### Secrets and data

No new environment variable and no `NEXT_PUBLIC_*`. The change reads
`DATABASE_URL` through `lib/db/client.ts`, `KV_REST_API_URL` /
`KV_REST_API_TOKEN` through the limiter and `BLOB_READ_WRITE_TOKEN` through
`@vercel/blob` — all existing, all server-only.

Every new `lib/` module carries `import "server-only"` **except**
`lib/validation/activity.ts`, the deliberate exception (§6.3), and the two
`lib/domain/` modules, which read no secret and touch no connection.

**Nothing on any of these paths is logged** — no filename, no blob pathname, no
cell value, no organisation name, no row body, on no path and in no catch.
There is no `console` call in `lib/db/activity-queries.ts`,
`lib/storage/activity-import.ts`, `lib/domain/*` or `app/activity/actions.ts`.
A customer's activity file is their commercial data (§5.3's last bullet), and
**it is never sent to any third party**: no AI provider is involved in this step
at all.

### What step 9 deliberately did not do

| not done | why |
| --- | --- |
| emission factors, scope 1/2/3 calculation, any tCO₂e figure | step 10. This step writes what was *measured*, never a computed emission |
| targets, forecasting, the "16% off your 2027 goal" reading | step 11 |
| any dashboard route or chart | step 12. `home/dashboard.tsx` stays a marketing illustration |
| report generation or export | step 13 |
| scheduled recalculation, threshold alerts | step 14 |
| **AI header mapping** — no AI SDK, no provider, no model, no prompt | §5.3: sanctioned but not scheduled, and the user chose deterministic |
| connectors, an ingestion API, a webhook | §5.2: "CSV import first, connectors later" |
| a site management UI — create, rename, merge, delete | sites are created implicitly by an import; a CRUD screen is not in step 9 |
| editing or deleting a committed `activity_record` | provenance matters more than convenience here; design it with the erasure path |
| organisation invitations, a members UI | step 8's deferred work, unchanged by this |
| a CSV parsing package, XLSX support, delimiter sniffing | stated grammar, stated bounds; anything else is a parse failure with a line number |
| touching `SiteNav`, `SiteFooter`, or any marketing route's markup | §8.1 and the front matter's settled surfaces |

## Step 14 — scheduled recalculation and threshold alerts

Built from `prompts/62-scheduled-recalculation-and-threshold-alerts.md`. **The
last row of AGENTS.md §5.2.** A nightly Vercel cron recalculates every
organisation's emissions through the same seam the workspace button uses, reads
each active target against the run-rate projection, and emails the
organisation's owners once per crossing.

Two halves, one invocation. Recalculation exists so a tenant's totals are not
stale until somebody remembers to press the button
`app/_components/activity/recalculate-control.tsx` renders; alerts exist so a
target that has drifted is something a company is told about rather than
something it discovers at filing time.

**No AI, anywhere on this path.** Step 14 has no sanctioned surface (§5.3), and
every figure in the email is computed by `lib/domain/` and passed in.

### Decisions taken with the user before the prompt was written

| decision | chosen | rejected |
| --- | --- | --- |
| what raises an alert | target drift only — the signed `readingAgainstTarget` against an active target | month-over-month spike (a single month is noisy and seasonal); a stale-data alert |
| where the threshold lives | one fixed constant in `lib/domain/`, recorded as a judgement | a per-organisation column with a settings UI |
| recipients, and the off switch | organisation **owners** only, with a per-member opt-out honoured server-side | all members; owners with no opt-out |

### The platform constraint, measured

**The team is on the Hobby plan** — `vercel api /v2/teams/dgsloxx417s-projects`
reports `billing.plan = hobby`. Vercel's pricing page states for Hobby: minimum
interval **once per day**, scheduling precision **per-hour (±59 min)**, and that
a finer expression such as `0 * * * *` **fails deployment**.

So `vercel.json` carries `"schedule": "0 2 * * *"` and the implementation
assumes nothing about landing at 02:00 — Hobby triggers anywhere in the hour,
always UTC, with no timezone configuration. `maxDuration` is **300**, the Hobby
ceiling.

Two further facts relied on rather than recalled: Vercel makes an HTTP **`GET`**
to the production deployment URL at the configured path, so the handler exports
`GET` and nothing else; and the `vercel-cron/1.0` user agent and
`x-vercel-cron-schedule` header are **not authentication** — both are
attacker-supplied on a direct request, and nothing gates on them.

**`vercel.json`, not `vercel.ts`.** The `vercel-functions` skill documents the
`crons` and `functions` keys in `vercel.json` and it needs no new dependency;
`vercel.ts` would add `@vercel/config` for no gain here. Recorded so a later
session does not re-litigate it. This is the **first `vercel.json` in the
repository**, and the build confirms it changes no route's render mode.

### One recalculation seam, shared

`recalculateOrganization(organizationId, importId)` in
`lib/db/emission-queries.ts` now holds the whole orchestration — seed defaults,
read records and mappings, `buildFactorResolver`, `aggregate`, `toStoredKgCo2e`,
`replaceEmissions` — and returns `{ records, written }`.
`app/activity/actions.ts`'s `recalculate` calls it, and so does the sweep.
**Two implementations of what a recalculation is would be two definitions of a
disclosure figure.** The `NOTHING_TO_CALCULATE` branch stays in the action, keyed
off a zero record count: what to say to a person is the surface's business.

A query module composing a pure domain function is the established idiom here,
not a new smear — `readTargetEvidence` and `readDashboardEvidence` already do it.
`lib/domain/` keeps no database handle. The action's behaviour is unchanged, and
`replaceEmissions` keeps its delete-then-insert semantics bounded by the covered
record set.

### The assessment composition, factored out

`buildTargetEvidence` in `lib/domain/reports.ts` used to restate the chain
`targetFigure` → `projectTargetYear` → `readingAgainstTarget` with the bare
literals `3` and `1`. It now calls **`assessTarget` in `lib/domain/targets.ts`**,
and so does the alert evaluator. The scales are named constants in one place:

```
PROJECTION_SCALE = 3
READING_SCALE    = 1
ASSESSMENT_MODE  = "half-even"
```

An alert and a report disagreeing about the same target's reading would be the
worst failure the pair can have — one number in a filed disclosure, a different
one in the email. Sharing the function is what makes that impossible. The
refactor is behaviour-preserving: `npm test` went from 156 to 170 passing with
`reports.test.ts` unchanged.

`ProjectionBasis` also moved its members to `lib/validation/targets.ts` as
`PROJECTION_BASES`, because a column now stores it and `schema.ts` must build a
`pgEnum` from the constant rather than restate the union (§9.2 rule 2).

### The evaluator — `lib/domain/alerts.ts`

Pure: no database handle, no `fetch`, `asOf` as a parameter. It takes an
organisation's targets, its emissions and its open alerts, and returns
`{ raise, resolve }`.

- **Only `active` targets are evaluated.**
- **The comparison is strictly greater than**, so a reading of exactly the
  threshold is not a crossing and an open alert resolves when the reading returns
  to at-or-below it.
- **No hysteresis band**, and the reason is stated rather than implicit: the data
  changes on import, not continuously, and the sweep runs once a day, so flapping
  needs a committed import in each direction on successive days. Observed
  flapping would be a measured reason to add a band later.
- **Every refusal produces no alert — never a zero and never an alert.** All four
  of step 11's refusals pass through: fewer than 12 complete months, an elapsed
  target year, a zero target figure, and a non-active target.
- **A refusal is not a resolution either.** An open alert whose target can no
  longer be read is left open, because resolving would assert that the gap
  closed and nothing knows that. Same for a retired target: retiring is a human
  decision about a commitment, not evidence the projection improved, and the row
  is the record of a crossing that did happen.
- **A flat-basis projection does raise**, and `basis` and `completeMonths`
  travel with the alert and are rendered in the email — a flat projection and a
  trending one are different claims about the future.

14 cases in `lib/domain/alerts.test.ts`, picked up by `npm test`.

### The threshold — a judgement, said to be one

```
ALERT_THRESHOLD_PERCENT = 10
```

**This is a judgement, not a measurement** (§12 rule 4). No recording, comp or
dataset was fit to produce it. The reasoning: the projection is a linear
two-window run rate whose own uncertainty is not quantified anywhere in this
codebase, so a threshold below roughly ten per cent would alert on movement the
method cannot distinguish from noise. `home/dashboard.tsx`'s illustrative "16%
off your 2027 emissions goal" sits above it, which is the intent the marketing
mock states. It is a `Decimal`, because it is compared on the value path.

### The two tables

Migration **`0008_unique_mystique.sql`**. It creates two enums, two tables,
their foreign keys and their indexes; **no existing table is altered.**

`target_alert` — one row per crossing, strictly tenant-scoped with a `not null`
`organization_id` (§9.2 rule 6's reference-data exception covers
`emission_factor_set` and `emission_factor` only; an alert is a customer's own
data). Status enum `target_alert_status` is `raised` → `notified` → `resolved`,
with `created_at`, `notified_at`, `resolved_at` and `deleted_at` — a timestamp
per transition, not just a current-state column (§9.2 rule 3).

**The figures in force at the moment of raising are stored on the row**, so a
later change to the constant cannot rewrite what a company was told and when.
Nothing is recomputed on read. The local exercise below confirms it: after the
target was widened and the alert resolved, the row still carried `2388.2` and a
`20000.000` target figure.

#### Numeric precision, derived

| column | type | derivation |
| --- | --- | --- |
| `target_kg_co2e` | `numeric(20, 3)` | its source: `emission_target.baseline_kg_co2e` is exactly that, and a target figure is the baseline scaled by a percentage, so it cannot be wider |
| `threshold_percent` | `numeric(6, 3)` | the same quantity and range as `emission_target.reduction_percent` — `(0, 100]` to three places, so `100.000` is the widest |
| `reading_percent` | **unbounded `numeric`** | a quotient: widest storable projection over smallest non-zero target figure. A 0.001 tCO2e baseline at 99.999% gives a 1e-5 kg figure, and `activity_emission.kg_co2e` is `numeric(50, 24)`, so the true ceiling is past 1e54 — not a bound worth a constraint. The value is rounded to one place by `lib/domain/` before the write, so the scale is enforced where the arithmetic is |
| `projected_kg_co2e` | **unbounded `numeric`** | a sum over `numeric(50, 24)` rows, which has no finite bound in the number of rows. Rounded once at `PROJECTION_SCALE` before it arrives |

**Dedupe is one open alert per target, in the database:**

```sql
CREATE UNIQUE INDEX "target_alert_open_key" ON "target_alert" (target_id)
  WHERE status <> 'resolved' AND deleted_at IS NULL;
```

A partial unique index rather than a read-then-write, for the same concurrency
reason `retireTarget` puts its status predicate in the `WHERE`: two sweeps at
once would both read "no open alert" and both insert. `raiseAlerts` uses
`onConflictDoNothing` and returns only the rows actually written, so exactly one
set of emails is sent per crossing. Resolved rows are excluded, so a target that
drifts again after resolving raises a second alert — exercised below.

`alert_preference` — the opt-out. Unique on `(organization_id, user_id)`,
`email_alerts boolean not null default true`, `created_at` and `updated_at`.
**A row's absence means opted in**, so nothing needs backfilling. **It is a
separate table and must stay one**: §9.1 forbids adding columns to Better Auth's
generated tables, and `member` — the natural home for this column — is one of
them. `lib/db/auth-schema.ts` is untouched.

`lib/db/alert-queries.ts` carries `import "server-only"`, every function takes
`organizationId` and predicates on it, and the tenant predicate is written once
in `visible()`.

### The one query that is not tenant-scoped, and why that is the rule working

`listAllOrganizationIds()` in `lib/db/organization-queries.ts` is the only read
in this codebase not scoped to one tenant. **That is not a violation of §9.2
rule 6; it is what makes obeying it possible here.** The sweep has no session and
no request to derive a tenant from, so it derives the whole set server-side and
then runs the ordinary tenant-predicated queries once per id. The alternative —
accepting an organisation id from the request — is precisely the failure rule 6
exists to prevent. Its only caller is the cron handler.

### The endpoint

`app/api/cron/recalculate/route.ts`, exporting `GET` only, with the sweep in a
sibling `sweep.ts` so the handler stays what §6.2 requires: authenticate, call,
answer.

**A Route Handler is correct here and is not a §6.2 violation** — §6.2 names
"cron endpoints" among the external callers handlers exist for, and the caller is
Vercel's scheduler, not this application.

| stage | what happens |
| --- | --- |
| a. BotID | **deliberately absent**, and for a stronger reason than the authenticated-path one `stageImport` records: the caller is not a browser, `instrumentation-client.ts` protects page paths rather than API routes, and §7.3 records that a path missing from that list makes the server call **fail** rather than pass |
| b. authenticate | `authorization` must equal `Bearer ${CRON_SECRET}`, compared with `timingSafeEqual` over equal-length buffers with the length checked first. **An unset `CRON_SECRET` fails closed.** Anything else is `401`, empty body, no detail, nothing logged |
| b2. rate limit | `checkCronSweepLimit()`, keyed on a constant, **failing open** — the inverted stance `app/api/newsletter/unsubscribe/route.ts` documents, for the same class of reason: refusing the nightly job because Redis is unreachable is worse than letting an idempotent sweep run unmetered during an outage |
| c–f | the sweep |

**The rate limit of 6 per hour is a judgement, not a measurement**, on the same
footing as every window in `lib/rate-limit/index.ts`. It is deliberately loose
against a once-daily schedule: Hobby's precision is ±59 minutes, a deploy can
retrigger the job, and the sweep is idempotent. It exists so a leaked secret
cannot drive repeated full-tenant sweeps, not to shape traffic. The `/account`
preference limiter is **30 per hour keyed by user id**, also a judgement.

The response body is counts only — organisations, recalculated, alerts raised,
alerts resolved, alerts notified, failures. **No tenant identifier, no
organisation name, no address and no figure** (§8.3 rule 2 as extended to
commercial data by §5.3); this body lands in Vercel's function logs.

### The sweep

One `asOf` for the whole run, so two organisations evaluated a second apart
cannot land on different months. Per organisation: recalculate through the shared
seam (zero records is skipped, not failed), read targets, open alerts and
evidence, evaluate, resolve, raise, then email each newly raised alert to the
owners who have not opted out.

**One organisation's failure must not end the sweep.** Each is wrapped, the
error is counted, and the loop continues; nothing about which tenant failed
reaches the response or the console.

**`notified` only when a message actually left.** A total send failure leaves the
row at `raised` so the next sweep retries — which is why the status is a state
rather than a boolean, and why a failed email cannot be mistaken for a delivered
one. A failed email never fails the sweep (§10 rule 4).

**Scale boundary, stated rather than pre-optimised.** The sweep is sequential and
reads each organisation's full calculated set into memory — the same boundary
`readTargetEvidence` and `readDashboardEvidence` already document. Revisiting
sequencing and pagination is a future judgement against real tenant volume, not
something to guess at now.

### The email

`lib/email/templates/target-alert.tsx` on the existing `Shell`, sent by
`lib/email/alerts.ts` in the best-effort shape of `lib/email/newsletter.ts`.

**Transactional, not marketing, and that has a consequence.** Per
`email-best-practices`'s `references/email-types.md` it reports on the service
the recipient's organisation contracted for, is non-promotional, and is sent
under contract fulfilment rather than consent. So it carries **no
`List-Unsubscribe` header** — that passthrough exists for the newsletter's bulk
message, and the same skill warns against the transactional/marketing hybrid.
The off switch is the in-app preference, and the footer links to it in plain
words.

**The idempotency key is `target-alert/<alert-id>-<sha256(address) prefix>`.**
Step 3's format is `<event-type>/<entity-id>`, and the recipient had to become
part of the entity: an organisation with two owners sends two messages for one
crossing with the same key but different payloads, which Resend answers with a
**409**, so the second owner would never be told. The address is hashed rather
than embedded — the key is a value we construct and log around, and §8.3 rule 2
keeps addresses out of everything but the table that owns them.

Figures are converted from stored kgCO2e to tCO2e at `REPORT_TONNES_DECIMALS`,
so a company never sees the same quantity at two precisions. An unreadable stored
figure means the message is **not sent at all** rather than sent with a number
nobody can stand behind.

### The off switch

`/account` gains a `TARGET ALERTS` section rendering
`app/_components/alerts/alert-preference-control.tsx` — a client leaf,
component-only, built from the existing `Button` primitive, no GSAP, no new
primitive. It posts to `setAlertEmailPreference` in `app/account/actions.ts`,
which follows §10 unchanged: no BotID on an authenticated path, session and
tenant, user-keyed limit failing closed, `safeParse` with
`alertPreferenceSchema`, tenant-predicated write, `revalidatePath`, typed result,
**no redirect on success**.

The action takes **no user id and no organisation id from the browser** — only
`{ emailAlerts: boolean }`. Turning alerts off is not enforcement by absence: the
sweep re-reads the preference in `listAlertRecipients`'s own SQL predicate every
night, as a `LEFT JOIN` with `is null or is true` so an organisation whose
members never touched the setting stays reachable.

**Aetherfield's `staff` and `admin` roles grant nothing here** (§11.1). The only
thing that puts an address on the recipient list is a `member` row with
`role = 'owner'`.

### Secrets and data

`CRON_SECRET` is **new, generated locally (64 base64 characters) and not
auto-provisioned** — Vercel does not set it. Added with `vercel env add` to
production, preview and development, and the name read back from
`vercel env ls`. Sensitive on production and preview; **the CLI refuses
`--sensitive` on development** (`sensitive_not_allowed_on_development`), so it is
stored non-sensitive there. The value was never echoed. `.env.example` gained the
name only.

**No `NEXT_PUBLIC_*` was added** — phase two still has none.

Personal data: the alert email goes to a `user.email` already held for an
authenticated account. No address, organisation name, target name or figure is
logged — not in the response body, not in a catch, not in the send helper.
Nothing reaches a third party but Resend.

**Retention.** A resolved alert is **retained** as the record of what the
workspace told a customer and when. `deleted_at` is available for an erasure
request, and every read filters on it.

### Two inherited blockers, reported rather than routed around

1. **The alert email cannot reach an arbitrary customer yet.**
   `lib/email/config.ts` sends `from onboarding@resend.dev`, Resend's sandbox
   sender, which delivers only to the Resend account's own address and 403s every
   other recipient. That is the same unclosed prerequisite step 3 recorded, and it
   now bites a **customer-facing** message rather than an internal one. In the
   local exercise below the message did leave, because the seeded owner is the
   Resend account's own address — which is exactly the boundary of what works.
2. **One line in `lib/email/config.ts` was stale and is corrected in this
   change** (§12 rule 8). Its docblock said Aetherfield had "no deployment and no
   assigned production domain". The deployment half is no longer true —
   `vercel project ls` reports `aetherfield` at
   `https://aetherfield-rho.vercel.app`. The **domain** half remains true and
   remains the actual blocker: a `*.vercel.app` URL is not a domain SPF, DKIM and
   DMARC can be published on. The sentence now says exactly that.

### Prerender impact — verified, not assumed

`npm run build` route table: `/`, `/about`, `/careers`, `/design-system` and
`/journal` remain `○ Static`; `/article/[slug]` ×6 and `/job-listing/[slug]` ×3
remain `● SSG`. `/account` remains `ƒ` — its render mode did not change.
`/api/cron/recalculate` is new and `ƒ`.

The prerendered-HTML diff per `docs/automation.md`, both sides excluding
`.claude/` and `.agents/` and normalising `BUILD_ID` plus both content-hashed
chunk patterns: **21 files each side, 0 differing.** The CSS chunk is
**66,990 bytes on both sides with 0 added and 0 removed rules**, so no Tailwind
utility leaked out of the new prose.

Because the HTML is byte-identical, the standing masking warning about `/`,
`/journal` and `/careers` did not arise — no image comparison was needed or
quoted.

`proxy.ts`'s matcher is **unchanged and was not widened**; `/api/cron/*` is
deliberately not in it, since an auth redirect in front of the cron path would
break the scheduler. The `401` in the exercise below arrived from the handler
rather than as a redirect to `/sign-in`, which is the confirmation.

### What was exercised locally, and what could not be

**Vercel does not run cron schedules locally**, so the schedule itself is only
confirmable after a deploy. It has not been exercised.

Against `npm run dev` with a seeded organisation (24 months of electricity
records, an active scope-2 target the run rate misses):

| check | result |
| --- | --- |
| no `authorization` header | `401`, 0 bytes |
| wrong secret | `401`, 0 bytes |
| correct secret, empty tenant | `200`, `{"organizations":1,"recalculated":0,…}` |
| first sweep with fixture | `alertsRaised: 1`, `alertsNotified: 1`; row `notified`, `basis: trend`, `complete_months: 24`, `window_end: 2026-07`, `reading_percent: 2388.2` |
| second sweep, unchanged | `alertsRaised: 0` and still **one** row — the partial unique index holds |
| target widened so the projection sits **above** it by 25.7% | `alertsResolved: 0` — correctly *not* resolved, since 25.7% is still past the threshold |
| target widened far past the projection | `alertsResolved: 1`; row `resolved`, and its stored figures **unchanged** |
| owner opted out, target tightened again | `alertsRaised: 1`, `alertsNotified: 0` — no send attempted, row stays `raised`, and a second row was written because the first had resolved |

**Not exercised:** the `/account` toggle was not driven in a browser. The
preference's *effect* was verified by writing `alert_preference` directly and
observing the sweep skip the send; the control and its action are typechecked and
call the query that was verified, but the UI path itself is unconfirmed.

The fixture was removed afterwards; the database carries no step-14 test data.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **8 files, 170 tests passed** (was 7/156) |
| `npm run build` | compiled, route table as above |
| prerender diff | 21/21 identical, CSS 0 rules changed |
| `npm run db:generate` / `db:migrate` | `0008_unique_mystique.sql` generated and applied |
| `npm run test:e2e` | Chromium + Firefox **10 passed (52.8s)**; **WebKit did not run** — the pinned rootless Podman container needs `podman`, which is not installed on this machine. A pre-existing environment gap, not a change from this step |

### What step 14 deliberately did not do

| not done | why |
| --- | --- |
| per-organisation configurable thresholds, a settings UI | decided with the user: one constant, recorded as a judgement. A settings surface is its own prompt |
| month-over-month spike alerts, or a stale-data alert | decided with the user: target drift only |
| alerts to all members, or to `staff` / `admin` | owners only; staff status stays orthogonal to membership (§11) |
| an in-app alert surface, a notification centre, Slack or webhooks | a step-14 alert is an email; anything else is a new surface |
| a finer-than-daily schedule, a second cron job, or a queue | Hobby is capped at once per day, measured above |
| any AI — no model, no prompt, no provider | §5.3: step 14 has no sanctioned AI surface at all |
| scheduled *report* generation | step 13 shipped reviewed drafts on purpose; nothing auto-publishes |
| changing the emissions engine, factor mappings, or any target formula | steps 10–12 own those definitions; this step consumes them |
| a hysteresis band on the threshold | no flapping has been observed; a band without one would be a guessed number |
| widening `proxy.ts`'s matcher, or touching any marketing markup | §8.1 and the front matter's settled surfaces |
| a new primitive, a second design system, or GSAP | §7.5 |
| adding a column to any Better Auth generated table | §9.1 |

## Step 13 — ESG report generation and export

Built from `prompts/61-esg-report-generation-and-export.md`. This is the
authenticated reporting workspace: a tenant builds an immutable snapshot of the
latest 12 complete months from stored emissions, reviews it with its provenance
and caveats, optionally has a **draft** narrative written over those already
computed figures, and exports a deterministic HTML document.

**This is the first and only AI in the product** (AGENTS.md §5.3, "sanctioned,
not scheduled"). It is also the step where AGENTS.md §5.3's hard rule — *an LLM
never produces a number that appears in a disclosure* — stops being a policy and
becomes a mechanism. Read "The narrative allowlist" below before changing
anything under `lib/domain/reports.ts` or `lib/reporting/`.

### AI Gateway — verification, and one live blocker

**Nothing here was recalled.** AGENTS.md §7.4 names `vercel:ai-sdk` as the skill
that owns this decision and the Neon overview names `neon-ai-gateway`; **neither
is installed in this environment** (`ls .agents/skills` shows no AI skill). The
prompt's fallback was taken: current official docs were fetched during
execution, and every API was then checked against `node_modules/`.

| what | source | date |
| --- | --- | --- |
| authentication modes, `AI_GATEWAY_API_KEY`, OIDC fallback | `https://vercel.com/docs/ai-gateway/authentication-and-byok` | 11 Aug 2026 |
| OIDC setup, 12-hour token life, `vercel env pull` refresh | `https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc` | 11 Aug 2026 |
| `generateText`, plain `creator/model` strings, install | `https://vercel.com/docs/ai-gateway/getting-started/text` | 11 Aug 2026 |
| model/provider routing, `creator/model` format, model list API | `https://vercel.com/docs/ai-gateway/models-and-providers` | 11 Aug 2026 |
| live model IDs and pricing | `https://ai-gateway.vercel.sh/v1/models` (no auth required) | 11 Aug 2026 |
| `generateText` signature, `LanguageModel = GlobalProviderModelId \| …` | `node_modules/ai` **7.0.59** | 11 Aug 2026 |
| OIDC fallback via `getVercelOidcToken()` from `@vercel/oidc` | `node_modules/@ai-sdk/gateway` **4.0.47** | 11 Aug 2026 |

**The package is `ai` (7.0.59), added as a dependency.** `@ai-sdk/gateway` and
`@vercel/oidc` arrive as its transitive dependencies; neither is imported
directly, and **no provider SDK** (`@ai-sdk/anthropic`, `openai`, …) was
installed. A plain string model routes through AI Gateway by the SDK's own
default, which is the documented path.

**No new environment variable, and none is expected.** `@ai-sdk/gateway` reads
`AI_GATEWAY_API_KEY` and, when it is unset, falls back to
`getVercelOidcToken()` — read from `node_modules/@ai-sdk/gateway/dist/index.js`,
not assumed. `VERCEL_OIDC_TOKEN` is Vercel-managed, is already present in
`.env.local` from `vercel env pull`, and is **not** added to `.env.example`.
`.env.example` is unchanged by this step. The prompt required stopping to ask
before introducing `AI_GATEWAY_API_KEY`; it was not needed and was not added.

#### The model

**`anthropic/claude-haiku-4.5`**, chosen 11 Aug 2026 from the gateway's live
model list rather than from memory (AGENTS.md §12 rule 7). At that reading:
**$1.00 per million input tokens, $5.00 per million output tokens, 200,000-token
context**.

**The choice is a judgement, not a measurement.** The task is bounded prose over
a small, fully supplied evidence package under a hard instruction not to produce
figures — constrained writing, not reasoning — and the frontier models on the
same list cost five times as much for it. The context window is an order of
magnitude larger than the ~12,000-character prompt cap needs. A wrong choice is
cheap and reversible: the allowlist rejects a bad draft whatever produced it, so
a weaker model's failure mode is a rejected draft, never a wrong number.

#### The live blocker — reported, not routed around (AGENTS.md §12 rule 9)

A single controlled smoke test was run against the real gateway after the docs,
the auth mechanism and the pricing had been verified. It returned:

```text
statusCode: 403
type: 'customer_verification_required'
"AI Gateway requires a valid credit card on file to service requests."
```

**This is a billing prerequisite on the Vercel team, not a code fault, and the
distinction is visible in the status.** A 403 `customer_verification_required`
means the OIDC credential **authenticated successfully** and the model id was
accepted — an invalid credential returns 401 with
`GatewayAuthenticationError`. The request reached
`https://ai-gateway.vercel.sh/v4/ai/language-model` and was refused on account
standing.

So **the integration is complete and unverified end to end at the same time**,
and both halves are stated plainly:

- *verified* — package APIs against `node_modules`, OIDC authentication against
  the live endpoint, model id accepted, request/response shape, and the handled
  failure path;
- *not verified* — that a real completion passes `validateNarrative`. No draft
  has ever been generated by this code.

The failure path **was** verified against that real 403: a scratch replica of
`draftNarrative`'s `try`/`catch` returned
`{"ok":false,"reason":"The narrative service could not be reached."}` and threw
nothing. In the product that becomes `narrative_status = failed`, a handled
`{ ok: false }` result, and a report whose figures and export are untouched —
confirmed in the browser matrix below.

**To unblock:** add a card to the Vercel team at
`https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card`,
then draft a narrative from `/reports/<id>`. Nothing in the code needs to change.
If the OIDC token has since expired (12 hours), `vercel env pull .env.local`
refreshes it.

### The narrative allowlist — how the hard rule is enforced

The instruction in the system prompt tells the model not to invent figures.
**The instruction is not the control.** A system prompt is a request; the
allowlist is the enforcement, and AGENTS.md §5.3 survives a model that ignores
every word of the prompt.

1. `buildReportEvidence()` computes every figure deterministically, from stored
   `activity_emission` rows, through the existing step-10/11 engine, and
   **rounds once** into strings (three decimal places, `half-even` — a kilogram;
   a judgement, matching what `/targets` already shows).
2. `allowedNumberTokens()` returns the **closed set** of numeric tokens those
   strings contain, plus exactly two stated structural additions: `1`/`2`/`3`
   (prose must be able to say "Scope 1") and `12` (the window's own length).
   Scope 3 category numbers are admitted **only for categories the report
   actually contains**.
3. `validateNarrative()` tokenises the draft and rejects on the **first** token
   outside that set. The default is refusal.
4. A rejected draft is **discarded, never stored** — only the status, the
   timestamp and the reason are written.

Two tokeniser details are load-bearing and are covered by tests:

- The pattern is
  `/(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?%?(?![A-Za-z0-9])/g`. The lookarounds are
  what stop `tCO2e`, `kgCO2e` and `AR5` from reading as the numbers 2 and 5.
- Thousands separators are normalised away, so `1,984.000` matches `1984.000`;
  a **trailing `%` is kept**, so a percentage can never satisfy a count and a
  count can never satisfy a percentage. Trailing zeroes are optional
  (`1984` matches `1984.000`) because they are equal under `compare`.

**No `Number` appears on any value path.** Every figure in a snapshot is a
decimal string produced by `lib/domain/decimal.ts`; the only `number`s in the
evidence object are record counts and calendar years.

### Definitions carried by a report

- The period is the **latest 12 complete UTC calendar months**, ending before the
  month containing `asOf` — the same `dashboardWindows()` derivation step 12
  established, **reused rather than restated**, because a report and the overview
  disagreeing about "the latest complete year" would be two definitions of the
  reporting period. The current partial month is excluded.
- The Server Action captures **one** `YYYY-MM-DD` clock value and passes it into
  the pure layer. No domain module reads a clock.
- The period is stored as explicit `period_start` / `period_end`, so a later
  recalculation cannot move an existing report's window.
- **The snapshot is immutable.** The detail page and the export route render
  `evidence` and never recalculate — verified in the matrix by mutating
  `activity_emission` underneath a built report and re-exporting byte-identically.
- Biogenic and outside-of-scopes are carried separately and are in no scope total.
- **Missing evidence is a refusal, never a zero.** Building a report over a
  period with zero calculated records is rejected with a field error telling the
  reporter to import and calculate first, rather than producing a document full
  of `0.000`.
- Coverage counts are **period-scoped**, from a new single-statement read; the
  organisation-wide gap figure `/dashboard` shows would have over- or understated
  the gap inside a particular twelve months.
- Factor attribution comes from the sets the period's stored emissions **actually
  used**, reached through `activity_emission.factor_id` — not from
  `listFactorSets()`, which answers "what can this tenant see". A superseded set
  still appears, correctly.

### What was built, and where

| file | what |
| --- | --- |
| `lib/validation/reports.ts` | the narrative-status enum (declared once), the create/id schemas, the evidence Zod schema and `parseReportEvidence()`, the error register, `REPORT_FORMAT_VERSION`, the tonnes/prompt/output caps |
| `lib/domain/reports.ts` | pure: report period, one-time rounding, `buildReportEvidence()`, `allowedNumberTokens()`, `validateNarrative()`, `reportSections()` |
| `lib/domain/reports.test.ts` | 46 focused tests — period boundaries, scope separation, caveats, determinism, and the full allowlist/rejection matrix |
| `lib/db/schema.ts` | the `report` table and `report_narrative_status` enum, built from the validation constant |
| `lib/db/report-queries.ts` | tenant-predicated list / get / create / narrative transition / soft delete |
| `lib/db/report-evidence.ts` | the **named evidence seam**: composes existing reads, plus the period record counts and the period's factor-set attribution |
| `lib/reporting/narrative.ts` | `server-only`; the one model call, its prompt, its caps and its typed refusal |
| `lib/rate-limit/index.ts` | `checkReportWriteLimit`, `checkReportNarrativeLimit` |
| `app/reports/actions.ts` | create / generate narrative / soft delete, in §10 stage order |
| `app/reports/page.tsx` | authenticated list and create surface |
| `app/reports/[reportId]/page.tsx` | authenticated detail — sections, provenance, caveats, narrative state |
| `app/reports/[reportId]/export/route.ts` | authorised deterministic HTML export |
| `app/reports/loading.tsx`, `error.tsx` | route states; the error state reveals no partial figure |
| `app/_components/reports/*` | two client leaves — the create form, and the shared draft/remove control |
| `app/_components/workspace-nav.tsx` | Reports added to the workspace navigation |
| `proxy.ts` | exactly `/reports/:path*` added to the enumerated optimistic matcher |
| `e2e/home.spec.ts` | signed-out `/reports` and `/reports/<id>/export` redirects with the encoded callback |

The reports routes import nothing from `home/` or `motion/`, add no chart
package, use no GSAP and add no root provider.

### The `report` table, as applied

Migration **`lib/db/migrations/0007_bouncy_alex_wilder.sql`** — one enum and one
table, nothing else. Read back over the **direct** connection
(`DATABASE_URL_UNPOOLED`), not assumed:

| column | type | null | default |
| --- | --- | --- | --- |
| `id` | uuid | no | `gen_random_uuid()` |
| `organization_id` | text | no | — |
| `created_by` | text | yes | — |
| `title` | text | no | — |
| `period_start` | date | no | — |
| `period_end` | date | no | — |
| `generated_as_of` | date | no | — |
| `evidence` | text | no | — |
| `engine_version` | text | no | — |
| `format_version` | text | no | — |
| `narrative_status` | `report_narrative_status` | no | `'not_generated'` |
| `narrative` | text | yes | — |
| `narrative_model` | text | yes | — |
| `narrative_error` | text | yes | — |
| `created_at` | timestamptz | no | `now()` |
| `narrative_generated_at` | timestamptz | yes | — |
| `narrative_attempted_at` | timestamptz | yes | — |
| `deleted_at` | timestamptz | yes | — |

- **enum `report_narrative_status`**: `not_generated`, `generated`, `rejected`,
  `failed` — in that order.
- **indexes**: `report_pkey` (unique, `id`),
  `report_organization_created_at_idx` (`organization_id, created_at`),
  `report_organization_id_idx` (`organization_id, id`).
- **foreign keys**: `organization_id → organization.id` **CASCADE**;
  `created_by → user.id` **SET NULL**.

**`evidence` is `text`, not `jsonb`, deliberately** — matching
`activity_import.header_row` and `column_mapping`. Nothing queries inside it,
`parseReportEvidence()` is the schema-owned parser standing between the column
and any render, and a `jsonb` column would invite a query that bypassed it.

**There is no second `report_status` column, and that is not an omission.** The
snapshot is immutable once written — it is what the report *is* — and the only
other lifecycle a report has is removal, which `deleted_at` carries (§9.2
rule 5). A `draft`/`final` pair would be a publishing state for a step whose
whole contract is that nothing auto-publishes.

**Strictly tenant-scoped, `not null`.** §9.2 rule 6's reference-data exception
covers a third party's published dataset and nothing else; there is no
`IS NULL OR` anywhere in `report-queries.ts`.

### Rate limits — judgements, not measurements

Neither is fitted; the flow has never shipped, so there is no traffic to fit
against (AGENTS.md §12 rule 4). Both are keyed by **user id**, for the reason the
organisation limiter records: the path is authenticated and tenant-scoped, so an
IP key would throttle a whole office behind one NAT.

| limiter | window | reasoning |
| --- | --- | --- |
| `report-write` | **20 / user / hour** | Named rather than sharing `target-write`, because building a report reads every stored emission the organisation holds and writes a JSON snapshot — materially heavier than a target row, and an afternoon of target edits must not exhaust the allowance for a disclosure someone is trying to file. |
| `report-narrative` | **10 / user / hour** | Deliberately **tighter** than the write limiter beside it, and the asymmetry is the point: this is the only limiter in the file guarding a **paid third-party call**. It is consumed *after* the report is known to be this tenant's and *before* a single token is paid for, so a rejected request costs one select and nothing at the provider. |

### Trust boundary

| | |
| --- | --- |
| **crosses from the browser** | a report title (create), a uuid (draft, remove). Nothing else. |
| **never crosses** | organisation id, period dates, totals, evidence payload, target id, model id, narrative to trust, provider credentials |
| **pages** | `requireOrganization("/reports")` before any tenant read |
| **actions** | `resolveTenant()`, then a user-keyed limiter, then the shared Zod schema, then tenant-predicated statements |
| **export route** | `getCurrentMembership()` re-reads the membership row from Postgres before a byte of tenant data is returned |
| **rejections** | 401 signed out, 404 for both another tenant's id and a nonexistent one — **no existence oracle**, verified byte-for-byte in the matrix |

**The model boundary.** Only the **rendered deterministic sections** — the labels
and already-rounded strings the reporter can already see — plus the title and
period cross to the provider. The prompt is assembled from `reportSections()`
and nothing else, and it is capped at 12,000 characters. No raw activity row, no
uploaded CSV body, no site name, no personal name, no email address, no session,
no organisation or user identifier, no secret. A tenant's aggregate emissions
figures **are** customer commercial data, and sending them is this recorded
decision rather than an incidental one (AGENTS.md §5.3, last bullet).

**The caught provider error is never inspected, forwarded or logged** — a
provider error object carries the request body, and the request body is a
tenant's figures (§8.3 rule 2). The smoke test above printed one to a terminal
deliberately and it is not in any code path.

### Route table, prerender and CSS

**No prerender impact. Verified, not assumed.** Isolated parent (`f16e86f`) and
implementation copies both excluded `.agents/` and `.claude/`, shared one
unprinted Server Actions encryption key, and each produced 21 prerendered HTML
files. After normalising build id plus CSS/JS chunk names and stripping RSC
flight scripts, **0 of 21 differed**, with no file present on one side only.

The parent route table had 29 routes; the implementation has the same table plus
Dynamic `/reports`, `/reports/[reportId]` and `/reports/[reportId]/export`, for
**32**. Every Static, SSG and existing Dynamic classification is unchanged.

CSS was **66,526 → 66,815 bytes, +289**, with **3 rules added and 0 removed**:
`gap-y-1` (the detail page's definition rows), `max-w-[46rem]` (narrative and
note measure) and `space-y-5` (narrative paragraphs). All three trace to
authenticated report markup.

**The first CSS run reproduced `docs/automation.md`'s prose-scanner trap** and is
recorded rather than quietly fixed: it showed **4** added rules, the fourth being
`.ordinal` — Tailwind v4's `font-variant-numeric` utility, matched from the bare
English word used as a variable name and in comments and test names in the
report domain module. Renaming it to `categoryNumber` and rewording the prose
removed the dead rule from every page of the site. The numbers above are the
rerun. The HTML result was 0/21 on both runs.

### Disposable authenticated browser matrix

`agent-browser` is still not installed, so the step-12 fallback was used again:
Playwright 1.62.1 from the repository, driving the production build on port 3200.
A temporary helper created a uniquely named synthetic account, one organisation
with twelve complete months of stored emissions plus one deliberately
uncalculated committed record, and a **second, unjoined sentinel tenant holding
its own report**. It exercised 33 checks:

- signed in with no organisation → `/account`; signed out → the exact
  `%2Freports` callback;
- a member builds a report; exactly one row is written; the snapshot carries
  `1200.000` tCO2e, `calculated=12 uncalculated=1`, and the DESNZ attribution;
- the detail page shows the stored total, the coverage caveat, the narrative
  state and the export affordance;
- the export returns 200 `text/html`, is **byte-identical across two requests**,
  is `attachment` + `no-store`, and **embeds no external resource**;
- **the export does not recalculate**: `activity_emission` was mutated
  underneath and the re-export was byte-identical;
- the sentinel tenant's report is 404 on export, not found on detail, and absent
  from the listing — and a **nonexistent id returns the identical status and
  body**, so neither answer leaks the other;
- a forged session cookie never authorises tenant data and cannot export (401);
- a failed draft is recorded as a state rather than thrown, **stores no prose**,
  **leaves the snapshot untouched**, and the report still exports byte-identically;
- no document overflow at 375×812, 800×1000 or 1280×960.

```text
authenticated reports matrix: 33/33 passed
cleanup verified: {"users":0,"orgs":0,"reports":0}
```

Cleanup removed only the exact UUIDs the run created, cross-checked against its
run-specific slugs, and the helper was deleted after inspection. No credential,
session token, environment value, personal datum or tenant figure was printed
beyond the counters above.

### Checks run

| check | result |
| --- | --- |
| `npm run lint` | clean; ESLint printed no findings |
| `npm run typecheck` | clean; TypeScript printed no findings |
| `npm test` | **156 passed, 7 files** (110 → 156; 46 new) |
| `npm run db:generate` | wrote `0007_bouncy_alex_wilder.sql` — one enum, one table |
| `npm run db:migrate` | applied; **see the trap below** |
| database readback | 18 columns, 4 enum values, 3 indexes, 2 foreign keys with the delete rules above, over the direct connection |
| `npm run build` | compiled, typechecked and generated **32 routes**; the three `/reports` routes Dynamic; prior classifications unchanged |
| prerender comparison | **0 of 21 differed** |
| CSS comparison | **+289 bytes; 3 added rules; 0 removed** (after the `.ordinal` fix) |
| AI Gateway smoke test | OIDC **authenticated**; refused 403 `customer_verification_required` — billing, not code |
| narrative failure path | returned a typed refusal against the real 403 and threw nothing |
| authenticated Playwright matrix | **33/33**; cleanup 0/0/0 |
| `npm run test:e2e` | Chromium and Firefox **10/10 passed**; then the known environment gap: `Podman is required for WebKit on Arch Linux.` |

**`npm run db:migrate` can report success while applying nothing, and it did
once here.** The command printed its spinner and exited 0, but the readback found
`relation "report" does not exist` — the same IPv6 happy-eyeballs trap prompt 46
recorded for the app's own pool, which `lib/db/client.ts` fixes with
`net.setDefaultAutoSelectFamilyAttemptTimeout` but which `drizzle-kit` does not.
Re-running as `NODE_OPTIONS="--dns-result-order=ipv4first" npm run db:migrate`
applied it. **Always read the schema back after a migration on this machine;
a clean exit is not evidence.** Added to `docs/automation.md`.

### Secrets and data

- **No new environment variable and no `NEXT_PUBLIC_*`.** `.env.example` is
  unchanged.
- Server-only variables read on this path: `DATABASE_URL` (runtime),
  `DATABASE_URL_UNPOOLED` (migration and readback), `KV_REST_API_URL` /
  `KV_REST_API_TOKEN` (limiters), and the Vercel-managed `VERCEL_OIDC_TOKEN`
  for the gateway.
- `lib/db/report-queries.ts`, `lib/db/report-evidence.ts` and
  `lib/reporting/narrative.ts` all carry `import "server-only"`. The two pure
  modules and `lib/validation/reports.ts` deliberately do not.
- A report's title, snapshot, figures and narrative are tenant commercial data
  and render only after current membership resolution. `created_by` is
  attribution, not a public display identity.
- **Nothing on any path logs** an organisation, a title, a figure, a factor, a
  target or a line of generated prose.
- No email is sent, no Blob is written and no public or permanent URL is minted.

### What step 13 deliberately did not do

| not done | why |
| --- | --- |
| PDF export | needs a verified platform-safe renderer and would change the runtime/storage shape; deterministic HTML was the approved scope, and it prints |
| automatic filing, publishing, emailing or sharing | this step creates reviewed drafts and exports only |
| scheduled reports, thresholds or alerts | step 14 |
| a browser-chosen reporting period, or any period but the latest 12 complete months | a browser-supplied period would let a caller frame a disclosure over a window of its choosing; a period picker is a surface of its own |
| letting a model select, round, forecast or compute any figure | AGENTS.md §5.3's hard rule — the allowlist is the enforcement |
| storing a rejected draft | a discarded draft is discarded; only its status, timestamp and reason persist |
| changing the emissions engine, factor mappings or target formulas | steps 10–12 own those definitions; reports consume stored evidence |
| market-based scope 2, SBTi validation or framework-specific filing rules | no verified methodology was read for this step |
| a second design system, chart dependency, GSAP or any `home/` import | settled bundle and design constraints |
| staff/admin access to tenant reports | tenant membership remains the only tenant-data authority |

## Step 12 — authenticated dashboard routes

Built from `prompts/60-dashboard-routes.md`. This is the authenticated
organisation overview behind the marketing illustration's four data ideas. It
reads only stored tenant evidence and deterministic domain results. There is no
AI, generated recommendation, report narrative, alert, scheduled job or write
path in this step.

### Definitions carried by the dashboard

- The primary reporting period is the latest 12 complete UTC calendar months;
  the comparison is the 12 complete months immediately before it. The Server
  Component captures one `YYYY-MM-DD` clock value and passes it into the pure
  domain layer. The current partial month is excluded.
- The headline emissions figure sums stored `activity_emission` rows in the
  primary period. It never recalculates a factor on read. Scopes 1, 2 and 3 are
  visible; biogenic and outside-of-scopes remain separate.
- Recorded energy is committed `electricity` or `heat` activity measured in
  `kWh` or `MWh`, and nothing else. `kWh` becomes MWh by an exact scale shift.
  The comparison percentage has three typed refusals: no current readings, no
  comparison readings, and a zero comparison denominator.
- A missing emissions month is `null`, not zero. A present zero-valued month is
  still present evidence. The accessible table says `No calculated record` for
  a gap.
- The target selector takes active, not-elapsed targets; then earliest target
  year, newest creation time, and stable id. Projection, reading and refusal
  semantics are the unchanged step-11 functions.
- Actions are an ordered pure result: no activity, calculation gaps, no target,
  off-target projection, then the current-evidence fallback. They are ordinary
  links to `/activity` or `/targets`, never generated prose.

Calendar-window tests include January rollover and 29 Feb 2024. Trend tests
distinguish missing from stored zero and cover all-missing, all-zero, one-month
and values beyond JavaScript's safe integer range. Energy tests cover exact
`kWh`/`MWh` conversion, excluded categories/units, positive, negative and zero
deltas, all three refusals, and an input beyond JavaScript's safe integer range.
No arithmetic input is coerced through `Number`; only the final bounded chart
percentage crosses to a CSS height.

### What was built, and where

| file | what |
| --- | --- |
| `lib/domain/dashboard.ts` / `.test.ts` | pure reporting windows, emissions trend/totals, exact recorded energy, target selection and actions; focused unit coverage of every approved state |
| `lib/db/dashboard-queries.ts` | one page-facing tenant read, composing existing emissions, calculation-gap, target, activity-count and factor-set reads plus the narrow energy select |
| `app/_components/workspace-nav.tsx` | server-rendered Overview / Activity / Targets navigation with `aria-current`; component-only and JavaScript-independent |
| `app/dashboard/page.tsx` | authenticated Server Component overview, three evidence cards, accessible 12-month HTML/CSS chart, four-verb readiness and actions |
| `app/dashboard/loading.tsx`, `error.tsx` | route-level loading and unexpected-error states; the error state reveals no partial tenant figure |
| `app/activity/page.tsx`, `app/targets/page.tsx` | shared workspace navigation replaces the reciprocal one-off links |
| `app/account/page.tsx` | stale pre-dashboard copy corrected and the established organisation state now links to the overview |
| `proxy.ts` | exactly `/dashboard/:path*` added to the enumerated optimistic matcher |
| `e2e/home.spec.ts` | signed-out `/dashboard` redirect with the exact encoded callback |

The dashboard imports nothing from `home/` or `motion/`, adds no chart package,
and is not a Client Component. Searching the built dashboard server output and
client-reference manifest found no `EmissionsChart`, chart data selector,
`home/dashboard` or `motion/register` reference. The settled shared chrome
keeps its existing behaviour; this route adds no marketing animation bundle.

### Query, trust and scale boundaries

`requireOrganization("/dashboard")` runs before `readDashboardEvidence()`. A
signed-out request is redirected to
`/sign-in?callbackURL=%2Fdashboard`; a signed-in account with no current
membership is redirected to `/account`. The browser sends no organisation id,
date window, target id or figure. A current database membership supplies the
only tenant id, and every customer-data query predicates on it; soft-deleted
activity is excluded. Aetherfield `staff`/`admin` roles are not consulted.

The new energy select projects only date, category, unit and numeric quantity,
with approved category/unit predicates in SQL and the same defensive predicates
in the pure function. Numeric values leave Postgres as strings. Independent
reads use one `Promise.all`. The existing all-emissions read remains the
step-11 **judgement**, not a measured production-scale limit; this step did not
invent a second SQL total.

There is no mutation, Server Action, Route Handler, schema change or migration.
Nothing on the request path logs an organisation, name, count, target or figure.

### Visible outcome — judged and measured

There is no comp. Card composition, copy, three-column desktop arrangement and
the flat evidence-first chart are **judgements** against the existing
authenticated-route vocabulary. The marketing illustration supplied only the
four data ideas; none of its traced numbers or its organisation name was used.

The production render was **measured** at device scale 1 after
`document.fonts.ready`:

| viewport | cards | workspace navigation | document overflow |
| --- | --- | --- | --- |
| 375 × 812 | one column | visible, one row in the fixture copy | `scrollWidth === clientWidth` |
| 800 × 1000 | two columns, target spans the row | visible, one row | equal widths |
| 1280 × 960 | three columns | visible, one row | equal widths |

At all three widths the visible and accessible order matched: workspace
navigation, heading/window, emissions, recorded energy, target, trend, then the
four-verb evidence/actions. The chart exposed all 12 months in a table; its
bars were `aria-hidden`. Focus was visibly outlined on every workspace/action
link. An injected 200% text-size check found no text clipped by an
`overflow-hidden` box. The only horizontal overflow is the deliberate inner
chart-table scroller on narrow screens; the document itself never overflowed.

### Disposable authenticated browser matrix

`agent-browser` was not installed (`command -v agent-browser` returned no
path), so the prompt's recorded fallback was used: Playwright 1.62.1 from the
repository. A temporary helper under `/tmp` created a uniquely named synthetic
account, one exact organisation membership, activity across both 12-month
windows, stored emissions, an active target and a second, unjoined sentinel
tenant. It exercised:

- complete evidence with a negative energy comparison, then a positive one;
- one uncalculated committed record and repeated incomplete-figure caveats;
- no active target; no activity; an explicit missing-month gap;
- absence of the sentinel organisation and row from the member's response;
- a forged session cookie reaching the page check and being redirected, never
  authorising tenant data.

The verifier reported:

```text
authenticated dashboard matrix passed: states=6 viewports=3 overflow=0 focus=visible tenant-isolation=passed forged-cookie=rejected
cleanup verified: users=0 organizations=0
```

Cleanup was limited to the exact UUIDs the run created, cross-checked against
its unique run-specific slugs and names. It removed both organisations (and
their cascading tenant rows), then the synthetic user/account/session and
verification rows. The helper, cookie state and screenshots were removed after
inspection; no credential, session token, environment value, personal data or
tenant figure was printed.

### Prerender and CSS verification, prompt 60

**No prerender impact. Verified, not assumed.** Isolated parent (`b13bc02`) and
implementation copies excluded `.agents/` and `.claude/`, used the same
unprinted/unwritten Server Actions encryption key, and each produced 21
prerendered HTML files. After normalising build id plus CSS/JS chunk names and
stripping RSC flight scripts, **0 of 21 differed**.

The parent route table had 28 routes; the implementation had the same table
plus Dynamic `/dashboard`, for 29. Every Static, SSG and existing Dynamic
classification remained unchanged.

CSS was **65,280 → 66,526 bytes, +1,246**, with **24 rules added and 0
removed**. The additions were the workspace active state and dashboard-only
layout/chart utilities: `aria-[current=page]:underline`, `bg-accent`,
`border-collapse`, `border-muted`, `gap-1`, `gap-px`, `grid-cols-12`, the two
chart heights, the 700px inner table width, small table padding, the responsive
card spans/columns/gaps/padding, and the action-list spacing rule. Every rule
traces to authenticated workspace markup; no prose-candidate utility leaked.

The first CSS run was discarded: it reproduced the documented asymmetric-skill
tree trap and showed 90 unrelated removals. The numbers above are the rerun
with both copies excluding both skill trees. The HTML result was 0/21 on both
runs.

### Checks run

| check | result |
| --- | --- |
| `npm run lint` | clean; ESLint printed no findings |
| `npm run typecheck` | clean; TypeScript printed no findings |
| `npm test` | **110 passed, 6 files** |
| `npm run build` | compiled, typechecked and generated **29 routes**; `/dashboard` Dynamic; prior classifications unchanged |
| signed-out redirect | Chromium and Firefox both reached the exact `%2Fdashboard` callback and the sign-in heading |
| authenticated Playwright matrix | six states, three viewports, overflow/focus/tenant/forged-cookie checks passed; cleanup 0/0 |
| prerender comparison | **0 of 21 differed** |
| CSS comparison | **+1,246 bytes; 24 added rules; 0 removed** |
| `npm run test:e2e` | Chromium and Firefox **6/6 passed**; command then stopped at the known environment gap: `Podman is required for WebKit on Arch Linux.` |

`npm run db:generate` and `npm run db:migrate` were not run: this step has no
schema change, and the approved prompt explicitly excluded both as checks.

### Secrets and data

- No new environment variable and no `NEXT_PUBLIC_*` variable.
- Runtime reads the existing pooled `DATABASE_URL`; the browser fixture used
  the same configured database and never printed it.
- `lib/db/dashboard-queries.ts` is server-only. The pure domain module is not.
- Activity, emissions, energy and targets are customer commercial data and
  render only after current membership resolution. Nothing is transmitted to
  email, Blob, Upstash, analytics or a model provider.
- No AI is used. No model calculates, selects, ranks or narrates a figure or
  action.

### What step 12 deliberately did not do

| not done | why |
| --- | --- |
| report generation, narrative, export or `/reports` | step 13 |
| scheduled recalculation, thresholds, alerts or email | step 14 |
| factor-mapping edits, new ingestion, target types or target editing | existing/later owning surfaces |
| client chart, chart dependency, GSAP or dashboard interaction | a server-rendered evidence chart is sufficient |
| cache directives, API routes, Server Actions, provider or environment work | this is a fresh read-only tenant route |
| staff impersonation or tenant bypass | staff status remains orthogonal to membership |
| changes to `SiteNav`, `SiteFooter`, `NAV_ITEMS` or marketing markup | settled surfaces and prerender contract |

## Step 11 — targets and forecasting

Built from `prompts/59-targets-and-forecasting.md`. This is the absolute-target
workspace behind the marketing dashboard's goal reading: the filed target, its
linear trajectory, and a labelled run-rate projection over stored emissions.
There is **no AI** in this step and no model produces, adjusts or narrates a
figure.

### Decisions carried into the implementation

| decision | result |
| --- | --- |
| visible surface | a new authenticated `/targets` route beside `/activity`; step 12 still owns the dashboard |
| target type | absolute only — name, coverage, base year, target year, reduction percentage and baseline |
| baseline | stated by the reporter or accepted from a calculated suggestion, then stored and never moved by a later import |
| forecast | both the planned linear trajectory and the observed run-rate projection |
| rate limit | **judged**, not measured: 30 target writes per user per sliding hour, in its own bucket |

The in-memory read of all calculated emissions is also a **judgement**, not a
measurement of production scale. It composes the existing `listEmissions()` and
`totalsByPeriod()` definitions rather than pre-optimising a second aggregation
in SQL. Revisit it against real tenant volume; do not call it a measured limit.

### What was built, and where

| file | what |
| --- | --- |
| `lib/domain/decimal.ts` | caller-scaled, caller-rounded `BigInt` division with a typed zero-divisor refusal; `rescale` and `divide` share one rounding decision |
| `lib/domain/targets.ts` | coverage totals, exact target figure, annual trajectory, flat/trending run-rate projection and signed reading; pure and clock-parameterised |
| `lib/validation/targets.ts` | the three enum vocabularies, bounded decimal-string inputs, the cross-field year rule, typed fields and results |
| `lib/db/schema.ts` | `emission_target` and its three enums |
| `lib/db/target-queries.ts` | tenant-predicated create/list/get/retire plus the existing-emissions evidence read |
| `lib/auth/tenant.ts` | the session-plus-membership resolution extracted behaviour-identically from `/activity` |
| `app/targets/actions.ts` | create and retire Server Actions in §10's stage order |
| `app/targets/` | the authenticated Server Component page, loading state and error boundary |
| `app/_components/targets/` | component-only create and retire leaves; server-rendered target reading and trajectory |
| `proxy.ts` | explicit `/targets/:path*` matcher; no marketing route was added |
| `app/activity/page.tsx` | reciprocal text link to `/targets` |

### Division: the step-10 statement that changed

The emissions engine still never divides. Its unit ratios remain exact powers
of ten and `lib/domain/emissions.ts` gained no `divide` call. Step 11 needs an
arbitrary year-span quotient and a percentage reading, so `decimal.ts` now has:

```ts
divide(a, b, scale, mode)
```

Neither `scale` nor `mode` has a default. The operation makes one `BigInt`
division, weighs the full remainder once, applies the sign afterwards, and
returns `{ ok: false }` for a zero divisor. Exact-half tests cover `half-up`,
`half-even` and `down`, including negative operands; tests also cover scale 0,
an exact quotient, `1 / 3` at six places and the zero-divisor refusal.

### The table, as applied

Read back from `information_schema`, `pg_indexes` and the referential-constraint
tables after `npm run db:migrate`:

**`emission_target` — 15 columns.** `id` uuid pk `gen_random_uuid()`;
`organization_id` text not null → `organization.id` **cascade**; `name` text not
null; `coverage` `target_coverage` not null; `base_year` / `target_year` integer
not null; `reduction_percent` **numeric(6,3)** not null;
`baseline_kg_co2e` **numeric(20,3)** not null; `baseline_source`
`target_baseline_source` not null; `computed_baseline_kg_co2e`
**numeric(20,3)** nullable; `status` `target_status` not null default `active`;
`created_by` text nullable → `user.id` **set null**; `created_at` timestamptz not
null `now()`; `retired_at` / `deleted_at` timestamptz nullable.

`created_by` uses `SET NULL`, not cascade: deleting an account clears the
attribution and does not erase the organisation's commitment. The target itself
is soft-deletable, and every read excludes `deleted_at`.

Indexes: primary key; `emission_target_organization_target_year_idx
(organization_id, target_year)`; and
`emission_target_organization_created_at_idx (organization_id, created_at)`.
There is no uniqueness constraint: interim and long-term commitments may share
a coverage, multiple coverages may share a year, and a retired row may coexist
with its replacement.

Enums, in applied order:

- `target_coverage`: `scope_1`, `scope_2`, `scope_3`, `scope_1_2`,
  `scope_1_2_3`
- `target_status`: `active`, `retired`
- `target_baseline_source`: `stated`, `computed_at_creation`

The migration is `0006_simple_clint_barton.sql`. It creates only these types,
this table, its foreign keys and indexes. Its two `ALTER TABLE` statements add
foreign keys to the newly created `emission_target`; **no existing table is
altered**.

### Numeric precision, derived

`reduction_percent` is `numeric(6,3)`: validation admits `(0,100]` with at most
three decimal places, so the widest value is `100.000` — six digits total.

The filed baseline form admits at most 12 integer digits and 3 decimal places in
tCO2e. Multiplication by 1,000 makes at most 15 integer digits in kgCO2e; the
database's three-place scale stores to the gram, so 18 digits are required and
`numeric(20,3)` leaves two integer digits of headroom. The calculated-at-creation
snapshot uses the same `numeric(20,3)` representation. A calculated suggestion
is rounded once to the nearest kilogram before it becomes a filed baseline;
the separate snapshot retains grams, so the two roles do not silently collapse.

### The write path and trust boundary

Both actions deliberately omit BotID because the path requires a live session
and a current organisation membership. They resolve that tenant, consume the
user-keyed limiter (failing closed), validate with the shared Zod schema, then
write through a tenant-predicated query. No request field names an organisation.
Create re-derives a claimed calculated baseline from stored emissions instead
of trusting the browser's figure, and refuses that source while any committed
record is uncalculated. Retire predicates on organisation, id and
active status in one update; another tenant's id and a missing id answer the
same message. Neither action logs, emails, redirects or throws an expected
failure to the client. Both revalidate `/targets` and return a typed result.

`lib/auth/tenant.ts` preserves `/activity`'s three existing messages verbatim;
only the shared check moved. Aetherfield `staff` and `admin` roles are not read
and grant no tenant access.

### Projection definitions and refusals

A complete month is strictly earlier than the month containing caller-supplied
`asOf`. `W1` is the latest 12 complete months and `W0` the 12 before it. With
both windows, the target-year projection is:

```text
W1 + (W1 - W0) × months-to-target-year-end / 12
```

It is linear, not compounded, and computed as one quotient at the caller's
declared scale. With 12–23 complete months, `W1` is carried forward flat and
the result says explicitly that no earlier window supports a trend.

Every refusal was exercised:

| refusal | exercised input | result |
| --- | --- | --- |
| invalid trajectory span | base year 2028, target year 2028 | no trajectory points |
| insufficient history | 11 complete months before `2026-01-02` | no projection |
| flat basis, not a fabricated trend | 12 complete months before `2026-01-02` | projection with `basis: flat`, `W0: null` |
| target year elapsed | target 2025 as of `2026-01-02`, even with no history | no projection |
| zero target figure | reading 1 kg against 0 kg | no percentage and no infinity |

### Worked target — measured over a synthetic series

The database readback still reports **0 committed activity records**. This is
therefore a deterministic synthetic test, not a statement about customer or
production performance.

| part | hand arithmetic | produced |
| --- | --- | --- |
| baseline | stated | 100,000 kgCO2e |
| reduction | stated | 20% |
| target figure | `100,000 × (100 - 20) / 100` | 80,000.00 kgCO2e |
| trajectory, 2024–2028 | four equal steps of `(80,000 - 100,000) / 4 = -5,000` | 100,000 · 95,000 · 90,000 · 85,000 · 80,000 |
| `W0` | 12 months × 10,000 | 120,000 kgCO2e |
| `W1` | 12 months × 9,000 | 108,000 kgCO2e |
| projection to Dec 2028 | `108,000 + (108,000 - 120,000) × 36 / 12` | 72,000.000 kgCO2e |
| reading | `(72,000 - 80,000) / 80,000 × 100` | `-10.0%` — 10.0% ahead |

### The visible outcome

`/targets` is gated by `requireOrganization("/targets")`. Initial reads happen
only in its Server Component. The form is the client leaf; target figures,
baseline comparison, projection basis and windows, signed reading, refusal copy
and the full annual trajectory render on the server.

Three presentation rules hold:

1. A projection is labelled as one, carries its complete-month count/window,
   and a refusal is rendered in words rather than as blank or zero.
2. When any committed activity record lacks a calculated emission, the caveat
   appears above every affected target reading.
3. When the filed baseline differs from the calculated-at-creation snapshot,
   both are visible and the copy says the filed value has not moved.

The baseline source is visible, retired targets remain in the record with their
transition time, and `/activity` and `/targets` link to each other. `SiteNav`,
`SiteFooter`, `NAV_ITEMS`, all marketing routes and all GSAP surfaces are
untouched.

### Prerender impact and verification, prompt 59

**None. Verified, not assumed.** Both sides were built in isolated copies under
`/home/gdk26/.cache/aetherfield-diff-ptM2Y8`, excluding `.agents/` and
`.claude/` and pinning the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.

Baseline: 27 routes — 11 Static, 2 SSG route groups (6 article paths and 3 job
paths), 9 Dynamic, plus Proxy. Implementation: the same table plus one Dynamic
`/targets` route — 28 routes and 10 Dynamic. No Static or SSG route changed
render mode.

**21 prerendered HTML files per side; after normalising `BUILD_ID`, CSS and JS
chunk names and stripping RSC flight scripts, 0 of 21 differed.**

The prompt's expected 64,513-byte baseline did **not** reproduce. HEAD
(`60def3c`) emitted **64,826 bytes**. The exact 313-byte difference was the
text-overflow rule step 10 had recorded as removed: the rule had been
reintroduced by the documentation sentences that named it while explaining the
earlier leak. The repository was the fact (§12 rule 8), so those sentences and
the prompt's check line were reworded in this change. This is a correction to a
stale build record, not a target-route style decision.

CSS is **64,826 → 65,280 bytes, +454 net**. Rule-level diff: 11 intentional
utilities added — `.border-r`, `.last:border-r-0`, `.leading-4`,
`.max-w-[660px]`, `.max-w-[900px]`, `.min-w-[136px]`, `.min-w-max`,
`.overflow-x-auto`, `.pl-3`, `.text-[10px]`, `.text-[20px]` — and the one stale
text-overflow rule removed. A second prose leak from a calendar variable name
was found in the first implementation build and renamed before the recorded
build. Every final added rule traces to `/targets` markup.

### Checks run

| check | result |
| --- | --- |
| `npm run lint` | clean, no ESLint findings |
| `npm run typecheck` | clean, no TypeScript findings |
| `npm test` | **100 passed, 5 files** |
| `npm run db:generate` | generated `0006_simple_clint_barton.sql`; 3 enums, 1 table, no alteration of an existing table |
| `npm run db:migrate` | migration applied successfully over the direct connection; `pg` printed its forward-looking SSL-mode warning |
| `information_schema` / `pg_indexes` readback | 15 columns, the precisions and enum/nullability above, 2 tenant-first indexes plus the primary key |
| database activity count | **0 committed records**; worked reading is synthetic |
| `npm run build` | 28 routes; `/targets` Dynamic; all prior route modes unchanged |
| prerender diff | **0 of 21 differed**; CSS rule diff above |
| `npm run test:e2e` | native Chromium and Firefox **4/4 passed** (homepage plus protected-target redirect in both). The overall command exits 1 at the WebKit step because Podman is absent: `Podman is required for WebKit on Arch Linux.` |

The `agent-browser` and `browser-use` executables were not installed, so no
separate interactive browser session was claimed. The repository's pinned
Playwright path supplied the browser verification instead.

### Secrets and data

- No new environment variable and no `NEXT_PUBLIC_*` variable.
- Runtime reads keep the existing pooled `DATABASE_URL`; migration/readback used
  the existing direct `DATABASE_URL_UNPOOLED` through `dotenv -e .env.local`.
- `lib/db/`, `lib/auth/tenant.ts` and `lib/rate-limit/` remain server-only.
  Validation and the pure domain module deliberately do not.
- The only personal reference added is nullable `created_by`; no name, email or
  request body is logged or transmitted. Targets are tenant-scoped commercial
  data and soft-deletable.
- Nothing reaches a third party. No email, blob or AI provider is involved.

### What step 11 deliberately did not do

| not done | why |
| --- | --- |
| intensity, per-site or per-category targets | no denominator series or finer target vocabulary exists |
| SBTi or sector-pathway validation | a published methodology must be read and cited, not recalled |
| dashboard routes or charts | step 12 |
| ESG narrative | step 13 |
| recalculation schedules, threshold alerts or email | step 14 |
| market-based scope 2 or factor-mapping edits | still owned by their later product surfaces |
| a second design system, new primitive or GSAP | the existing authenticated-page and field idioms were sufficient |
| widening `proxy.ts`'s matcher beyond an enumerated `/activity/:path*` | §8.1 |
| any staff bypass into tenant data | §11, explicitly |

## Step 10 — emission factors and the calculation engine

Built from `prompts/58-emission-factors-and-calculation-engine.md`. Phase two's
third step, and the one AGENTS.md §5.3's hard rule is written about: **an LLM
never produces a number that appears in a disclosure.** There is no model
anywhere in this step. Every figure is produced by deterministic, exact
arithmetic in `lib/domain/`.

### Decisions taken with the user before the prompt was written

| question | answer |
| --- | --- |
| factor dataset | **UK DESNZ ("DEFRA") 2026 conversion factors, flat file, only.** EPA Hub and eGRID deferred; IEA licence-blocked (below) |
| GWP set | **stored per factor row**, seeded as the publisher states it. Not a global constant |
| scope 2 | **location-based only**, with a dual-ready schema. `scope2_method` exists from the first migration |
| AI factor matching | **not in this step.** Deterministic matching only |

### Two decisions taken at execution time

Both were flagged in the prompt as needing the user's say-so, and both were
approved on 10 Aug 2026 before any code was written.

1. **The reference tables carry a nullable `organization_id`** — the one
   deliberate deviation from §9.2 rule 6. `null` is published data shared by
   every tenant, non-null is a set a customer supplied under its own licence,
   and **every read filters `organization_id IS NULL OR organization_id = $1`**,
   so no cross-tenant read is possible. AGENTS.md §9.2 rule 6 gained one clause
   naming reference tables as its exception, in this same change.
2. **`vitest` was added**, with `npm test` scoped to `lib/domain/`. An
   exact-decimal engine producing regulatory figures with no unit tests was the
   wrong call. AGENTS.md §2's "there is no test script" line is corrected in
   this change, per §12 rule 8.

### What was built, and where it lives

| file | what |
| --- | --- |
| `lib/domain/decimal.ts` | exact fixed-point arithmetic over `BigInt`. Parse, add, subtract, multiply, compare, rescale with an explicit rounding mode, render. **No `Number` on the value path** |
| `lib/domain/gwp.ts` | AR4 / AR5 / AR6 tables with the fossil / non-fossil CH₄ split. A lookup returns a value **or a typed refusal**, never a fallback |
| `lib/domain/emissions.ts` | the engine: unit conversion, `calculateRecordEmission`, `aggregate`, `totalsOf`, `totalsByPeriod`. Pure |
| `lib/domain/defra.ts` | normalising one published row into this codebase's vocabulary, plus the eleven default mappings |
| `lib/validation/emissions.ts` | the eight vocabularies and the recalculate action's schema. Not `server-only`, and imports nothing from `lib/db/` |
| `lib/db/emission-queries.ts` | every read and write of the four new tables. The tenant predicate is written once, in `visibleFactorScope` |
| `lib/db/seed/defra-2026-factors.csv` | the derived seed data, 8,740 rows, 1.1 MB, committed |
| `lib/db/seed/seed-emission-factors.ts` | the idempotent seeder — `npm run db:seed:factors` |
| `scripts/defra-xlsx-to-csv.py` | the one-off xlsx → CSV conversion, stdlib-only |
| `app/_components/activity/emissions-summary.tsx` | the totals, the scope split, the coverage line, the attribution. A Server Component |
| `app/_components/activity/recalculate-control.tsx` | the one client leaf. Component-only, no GSAP |
| `app/activity/actions.ts` | gained `recalculate`, in the file's existing stage order |
| `lib/domain/*.test.ts` | 81 tests across four files |

### The finding that shapes the whole step

**Every value DEFRA publishes is already a CO₂ equivalent, including the
per-gas rows.** The flat file's `GHG/Unit` column reads `kg CO2e`, `kg CO2e of
CO2 per unit`, `kg CO2e of CH4 per unit`, `kg CO2e of N2O per unit`. The natural
reading of the third is "the mass of CH₄ emitted", and it is **wrong**. The 2026
methodology report, paragraph 1.9:

> Values for the non-carbon dioxide (CO2) GHGs, methane (CH4) and nitrous oxide
> (N2O), are presented as CO2 equivalents (CO2e), using Global Warming Potential
> (GWP) factors from the [IPCC's] fifth assessment report (IPCC, 2014) (GWP for
> CH4 = 28, GWP for N2O = 265).

Normalising a `kg CO2e of CH4` row to `gas: "ch4"` would multiply it by 28 a
second time — a 28-fold overstatement, invisible in the output. So **every
DEFRA row normalises to `gas: "co2e"`**, which is exactly the value
`lookupGwp()` refuses to apply a GWP to. The publisher's own wording survives
verbatim in `emission_factor.published_ghg_unit`, so nothing is lost.

A consequence: **`gwp_set` never enters the arithmetic for a DEFRA row.** It is
provenance, and the `co2e` refusal is what guarantees it stays that way.

### The prompt's Net CV line was wrong, and is corrected here

`prompts/58` recorded "DEFRA's stated default for company reporting is Net CV"
and instructed that it be confirmed against the methodology report at execution
time rather than trusted. It was confirmed, and it is **the opposite** for the
case that matters. Paragraph 2.9:

> Natural gas consumption figures quoted in kilowatt hours (kWh) by suppliers in
> the UK are generally calculated (from the volume of gas used) on a **Gross CV
> basis**. Therefore, the emission factor for energy consumption on a Gross CV
> basis should be used by default for calculation of emissions from natural gas
> in kWh, unless your supplier specifically states they have used Net CV basis.

The `fuel` + `kWh` default mapping therefore selects `1_100_1004_6_1` (natural
gas, Gross CV, 0.18231 kg CO₂e/kWh), not the Net CV row (0.20199). Recorded as
a correction rather than silently applied (§12 rule 8).

### The seed data, as measured

Produced by `python3 scripts/defra-xlsx-to-csv.py <workbook> lib/db/seed/defra-2026-factors.csv --report`.

| measurement | value |
| --- | --- |
| data rows in the flat sheet | **8,740** |
| Scope 1 / Scope 2 / Scope 3 / Outside of Scopes | **3,059 / 392 / 5,231 / 58** |
| rows carrying a published value | **7,035** |
| rows with **no** value | **1,705** |
| rows whose value was Excel float noise | **28** |
| rows seeded | **7,035** |

**The prompt predicted 8,741 rows and it is 8,740.** The per-scope figures it
gave are exactly right and they sum to 8,740, so the total was an arithmetic
slip in the prompt, not a conversion fault. Recorded rather than adjusted away.

**The 1,705 valueless rows are not seeded.** DEFRA publishes the hierarchy for
them but no number applies. A null-valued factor row is something a mapping
could later select, and a mapping that selects nothing is a silent zero in a
disclosure. The full sheet stays committed, so nothing is lost from the record.

#### Recovering the published decimal from the workbook

An `.xlsx` stores a binary double and Excel serialises it with up to 17
significant digits: the published `1.74296` appears in the XML as
`1.7429600000000001`. `repr(float(...))` returns the shortest decimal that
round-trips to the same double, which recovers `1.74296` exactly.

Where the stored double is itself a computed value the shortest form keeps all
17 digits, and those trailing digits are floating-point noise from DEFRA's own
spreadsheet. Measured across the 7,035 valued rows: **7,007 carry ≤ 10
significant digits, none carries 11–15, and 28 carry 16 or 17.** Rounding to 12
significant digits sits inside that gap — it collapses exactly those 28
(`0.13388999999999998` → `0.13389`) and leaves the other 7,007 bit-identical.
The `--report` flag prints both counts so the claim is re-checkable against a
later revision.

### The tables, as applied

Read back from `information_schema` and `pg_indexes` after `db:migrate`, not
from the generated SQL — a generated migration is not evidence that it applied.

**`emission_factor_set`** — 16 columns: `id` uuid pk `gen_random_uuid()`,
`organization_id` text **nullable** → `organization.id` cascade, `source` text
not null, `dataset_version` text not null, `publication_year` integer not null,
`effective_from` / `effective_to` date not null, `licence` / `licence_url` /
`source_url` text not null, `retrieved_at` timestamptz not null, `gas_basis`
enum not null, `superseded_by_set_id` uuid → `emission_factor_set.id` **set
null** (self-reference), `notes` text, `created_at` timestamptz not null
`now()`, `deleted_at` timestamptz. Indexes: unique
`emission_factor_set_published_key (source, dataset_version) WHERE
organization_id is null`; unique `emission_factor_set_organization_key
(organization_id, source, dataset_version) WHERE organization_id is not null`;
`emission_factor_set_effective_idx (effective_from, effective_to)`.

**Two partial unique indexes rather than one over three columns**, because
`NULL` is not equal to `NULL` in a unique index: a single
`(organization_id, source, dataset_version)` index would let the same published
set be seeded twice, since both rows' null organisation would compare unequal.
The seeder's idempotence depends on this being right.

**`emission_factor`** — 24 columns: `id` uuid pk, `set_id` uuid not null →
`emission_factor_set.id` cascade, `organization_id` text **nullable** →
`organization.id` cascade, `source_row_id` text not null, then the publisher's
hierarchy verbatim — `level_1` … `level_4`, `column_text` (all nullable),
`published_uom` and `published_ghg_unit` text not null — then the normalised
reading: `scope` enum not null, `scope3_category` enum, `scope2_method` enum,
`activity_unit` enum not null, `result_unit` enum not null, `gas` enum not null,
`ch4_variant` enum, `gwp_set` enum not null, `region` text, `biogenic` boolean
not null default false, `value` **numeric(24, 17)** not null, `created_at` not
null, `deleted_at`. Indexes: unique `emission_factor_set_row_key (set_id,
source_row_id)`; `emission_factor_organization_scope_idx (organization_id,
scope)`; `emission_factor_set_scope_idx (set_id, scope)`.

**`activity_factor_mapping`** — 9 columns: `id` uuid pk, `organization_id` text
**not null** → `organization.id` cascade, `category` enum not null, `unit` enum
not null, `factor_id` uuid not null → `emission_factor.id` **restrict**,
`created_by` text → `user.id` set null, `created_at` / `updated_at` not null
`now()`, `deleted_at`. Indexes: unique `activity_factor_mapping_key
(organization_id, category, unit)`; `activity_factor_mapping_factor_idx
(factor_id)`.

`factor_id` is deliberately `RESTRICT` where the tenant columns cascade: a
factor row disappearing must not silently un-map a customer's category. A set is
superseded, never deleted.

**`activity_emission`** — 14 columns: `id` uuid pk, `organization_id` text not
null → `organization.id` cascade, `activity_record_id` uuid not null →
`activity_record.id` cascade, `factor_id` uuid not null → `emission_factor.id`
**restrict**, `kg_co2e` **numeric(50, 24)** not null, `scope` enum not null,
`scope3_category` enum, `scope2_method` enum, `gwp_set` enum not null,
`biogenic` boolean not null, `outside_of_scopes` boolean not null,
`engine_version` text not null, `calculated_at` timestamptz not null `now()`,
`created_at` timestamptz not null `now()`. Indexes: unique
`activity_emission_record_key (activity_record_id)`;
`activity_emission_organization_scope_idx (organization_id, scope)`.

**No `deleted_at` on `activity_emission`, and that is not an omission.** §9.2
rule 5 is about data a person can ask to have removed; this row is derived,
holds nothing a person supplied, and is replaced wholesale on recalculation. It
cascades from the record it describes.

### The enums, as applied

| enum | members |
| --- | --- |
| `emission_scope` | `scope_1, scope_2, scope_3, outside_of_scopes` |
| `scope3_category` | `c1_purchased_goods_and_services` … `c15_investments`, the fifteen of Table 5.3 in the standard's numbering |
| `scope2_method` | `location_based, market_based` |
| `gwp_set` | `AR4, AR5, AR6` |
| `ghg_gas` | `co2, ch4, n2o, sf6, nf3, co2e` |
| `ch4_variant` | `combustion, fugitive` |
| `factor_result_unit` | `kg_co2e, kwh` |
| `factor_activity_unit` | `kwh, kwh_net_cv, kwh_gross_cv, litres, cubic_metres, million_litres, kg, tonnes, km, tonne_km, unknown_unit` |
| `factor_gas_basis` | `combined_co2e, per_gas` |

`outside_of_scopes` is a fourth member of `emission_scope` rather than a boolean
beside three: it is a genuine fourth state of one column (§9.2 rule 2), and the
aggregation carries it separately with no code path that adds it to a scope
total.

### The two numeric precisions, both derived

**`emission_factor.value` is `numeric(24, 17)`.** Across the 7,035 valued rows
of the 2026 flat file, after the float-noise round: **maximum 17 decimal places
and 5 integer digits**, so 22 are required and 24 leaves two of headroom on each
side.

**`activity_emission.kg_co2e` is `numeric(50, 24)`.** The product is a
`numeric(18, 6)` quantity, a `numeric(24, 17)` factor and a GWP of up to 5
integer digits and 1 decimal place: at most 12 + 5 + 5 = 22 integer digits and
exactly 6 + 17 + 1 = 24 decimal places, so 46 are required and 50 leaves four.

#### Round-trip evidence

Read back from the database after seeding, the same evidence step 9 recorded for
`numeric(18, 6)`:

| `source_row_id` | published | stored |
| --- | --- | --- |
| `5_303_3081_4_3` | `0.00000486077670539` | `0.00000486077670539` |
| `1_100_1000_15_1` | `3033.38067` | `3033.38067000000000000` |
| `1_100_1004_6_1` | `0.18231` | `0.18231000000000000` |
| `3_200_2009_3_1` | `12400` | `12400.00000000000000000` |

The 17-place value survives exactly. The others are padded to the column's scale,
which is what `numeric(p, s)` does; `Decimal` preserves the scale it reads and
`compare()` treats `1.5` and `1.500` as equal, so the padding changes no result.

### Seeded distribution, read back from the database

| dimension | counts |
| --- | --- |
| scope | scope_1 **2,531** · scope_2 **352** · scope_3 **4,096** · outside_of_scopes **56** |
| result unit | `kg_co2e` **6,584** · `kwh` **451** |
| GWP set | AR5 **6,866** · AR4 **169** |
| scope 3 category | c4 **1,445** · c6 **1,034** · unassigned **952** · c3 **448** · c5 **139** · c1 **75** · c7 **3** |

The scope counts are lower than the flat file's because the 1,705 valueless rows
are not seeded.

**451 rows produce kWh, not emissions** — DEFRA's `SECR kWh` families, which
exist so a reporter can derive energy consumption from a distance travelled.
They are seeded because the set is stored as published, and the engine refuses
them by `result_unit` rather than letting energy be summed into a carbon total.

**Seed runtime: 39.3 s, warm** — the connection was already established by the
migration in the same session, so this does not include Neon's scale-to-zero
cold start (§7.3). Re-running writes nothing and reports the existing set.

### What is judged rather than measured

Labelled as judgements, per §12 rule 4.

- **The eleven default `(category, unit)` mappings.** There is no customer file
  to fit against. Eleven of the sixty-four possible pairs are seeded and the
  rest are deliberately empty — an unmapped pair is surfaced as unmatched, which
  is a legible gap, where a wrong default is an invisible error. `other` is
  unmapped in every unit.
- **The scope 3 category assignment**, from DEFRA's `Level 1` to Table 5.3.
  DEFRA's file carries no category column. `Freighting goods` is the clearest
  judgement: the same tonne-kilometre is category 4 inbound and category 9
  outbound, and nothing in the row says which; it is read as category 4 because
  the activity model records a company's own purchased freight. 952 scope 3 rows
  are left **unassigned** rather than guessed.
- **`region` is `"UK"` on every row.** DESNZ publishes UK factors; families that
  name another country do so in their hierarchy, which is kept verbatim.

### What is measured but could not be fully resolved

- **The GWP basis per family is measured**, from Table 1 of the methodology
  report. The table's tick glyphs do not survive text extraction but their
  *column position* does, and reading by position gives **AR4 for Bioenergy,
  WTT Bioenergy and Material Use; AR5 for every other family.**
- **Hotel Stay is ticked in both columns.** Footnote 6 says "different countries
  could be in either AR4 or AR5 basis" and the file carries nothing that
  resolves it per row. Assigned AR5, the set's headline basis.
- **Refrigerants are AR5 "where AR5 values were available, and AR6 otherwise"**
  (footnote 3), and which rows fell to AR6 is not stated per row. Assigned AR5.

Neither qualification moves a number, because every DEFRA value is already CO₂e
and `gwp_set` is never applied to one.

### What could not be verified this session

`ghgprotocol.org` and `www.gov.uk` are **unreachable from this build
environment** — WebFetch reports the domain cannot be verified as safe to fetch.
Two consequences, stated as unverified rather than as checked (§12 rule 2):

- **The GWP values in `lib/domain/gwp.ts` are reproduced from `prompts/58`**,
  which recorded them from GHG Protocol's August 2024 publication on 10 Aug
  2026. They were **not** re-fetched at execution time.
- The DEFRA **methodology report** *was* readable, because
  `assets.publishing.service.gov.uk` answered `curl` where `www.gov.uk` did not.
  Everything sourced to the methodology report above was read from the PDF this
  session, including the OGL v3.0 notice: "This publication is licensed under the
  terms of the Open Government Licence v3.0 except where otherwise stated."
- Still unverified, as the prompt predicted: whether the `.xlsx` files
  themselves carry an OGL notice; whether an EPA Hub 2026 edition or eGRID2024
  exists; CDP's and SBTi's current GWP requirements.

### IEA factors are licence-blocked for this product

Recorded here so a later session does not reach for them. The IEA's terms state
that calculating or verifying a third party's carbon footprint "is not permitted
under our standard terms and conditions", and that putting the data into a model
whose derived data is visible to third parties requires a signed agreement and a
fee. **A multi-tenant SaaS computing customers' footprints is the prohibited
use.** This is not a scheduling decision and it does not expire.

### The engine, and its four refusals

Every refusal is typed, keeps the record **out of the total**, and is counted in
the coverage report. None is a fallback, a zero or a guess.

| refusal | when |
| --- | --- |
| no factor mapped | the record's `(category, unit)` has no `activity_factor_mapping` row |
| `factor_is_not_an_emission` | the factor's `result_unit` is `kwh` |
| `unit_mismatch` | cross-dimensional (`km` against `tonne.km`), or a denominator the activity model cannot measure |
| `gas_not_priceable` | the gas has no GWP in the factor's own set — AR4 publishes no fossil-methane value, and this repository's tables carry no halocarbons |

**Unit conversion is by exact powers of ten only, and that is the design.** A
decimal scaled by a power of ten is exact in both directions, so no conversion
can round and `decimal.ts` needs no division at all. Every ratio the activity
model requires happens to be one: `MWh`→`kWh`, `t`→`kg`, `m3`→`L` are all ×1000.
The units that are *not* — **`miles` (1.609344 km) and `GJ` (277.7… kWh)** — are
refused. DEFRA publishes a `km` row beside almost every `miles` row, so the
correct fix is to map the other row, not to approximate. A guessed 1.609 in a
disclosure is a fabricated number.

**The halocarbons are deliberately absent from the GWP tables.** DEFRA's
`Refrigerant & other` family alone names ~170 species and none of their GWPs was
verified this session. A missing gas is a legible refusal; a remembered GWP for
HFC-134a in a disclosure is the fabrication §12 rule 7 forbids. Those rows stay
usable through their combined `kg CO2e` factor, which needs no lookup.

### Coverage, measured over the activity vocabulary

**There is no committed activity record in this database** — the one
organisation holds zero — so there was no real import to measure against, and
this is a measurement over a representative set rather than over customer data.
64 synthetic records, one per `(category, unit)` pair, 100 units each, resolved
through the eleven default mappings against the **actually seeded** factors:

```
records 64 · matched 11 · unmatched 53 · unmatched pairs 53 · refusals 0
total scopes 1-3  65.7620 tCO2e
  scope 1          0.4792
  scope 2         13.1266  (location-based)
  scope 3         52.1562
  outside scopes   0.0000
  biogenic         0.0000
```

Four of the eleven, checked by hand against the published factors:

| record | factor | expected | produced |
| --- | --- | --- | --- |
| 100 kWh electricity | 0.13096 /kWh | 13.096 | `13.09600000000000000000000` |
| 100 MWh electricity | 0.13096 /kWh | 100,000 × 0.13096 = 13,096 | `13096.00000000000000000000000` |
| 100 kg waste | 520.58023 /tonne | 0.1 × 520.58023 = 52.058023 | `52.05802300000000000000000000` |
| 100 kWh fuel | 0.18231 /kWh Gross CV | 18.231 | `18.23100000000000000000000` |

The 53 unmatched pairs are mostly combinations that cannot occur in a real file
— electricity in kilograms, water in kilometres — but they are reported as
unmatched all the same, because the engine has no opinion about which pairs are
plausible.

### The visible outcome

On `/activity` (organisation-wide) and on `/activity/[importId]` for a committed
import. Three rules the component exists to hold:

1. **No total is presented as complete while records are uncalculated.** The
   coverage line renders *above* the figure, always — not behind a disclosure,
   not only when something is wrong.
2. **Biogenic and outside-of-scopes are shown separately and are never in the
   total**, in words as well as in layout, so the separation survives a screen
   reader.
3. **Every scope 2 figure carries its method**, read from the data rather than
   assumed. This step produces location-based only.

**Attribution is rendered from the set, not hard-coded** — the OGL requires it
wherever the factors are surfaced, and reading the licence and URL off the row
means a second dataset cannot make a hard-coded line wrong.

The summary **reads stored figures rather than recalculating on render**: a
disclosure figure is something computed at a moment, by a named engine version,
against a named factor row, and re-deriving it per page view would make "what
did we file" unanswerable.

### `recalculate`

Colocated in `app/activity/actions.ts`, in that file's existing stage order:
no BotID (deliberately absent on an authenticated path, for the reason
`stageImport` records) → `resolveTenant()` → rate limit keyed by **user id**,
failing closed, reusing `checkActivityCommitLimit` → `safeParse` with the shared
schema → tenant-predicated reads → the pure engine → tenant-predicated write →
`revalidatePath` → typed `SubmitResult`. **No redirect on success** (§10 rule 5).

**Delete-then-insert, not upsert**, bounded by the same record set the insert
covers. A record whose mapping was removed must lose its emission rather than
keep a stale one that the next total would include. Scoping the delete to the
covered records is what lets one import be recalculated without discarding
another's figures. The unique index on `activity_record_id` is the backstop.

**Default mappings are seeded on first use, and only when the organisation has
none** — a reporter's own choice of factor is never overwritten.

### `tsconfig.json`'s target was raised to ES2020

`lib/domain/decimal.ts` is built on `BigInt` literals, whose syntax TypeScript
gates on `target`; the scaffold's `ES2017` rejected them. The project emits
nothing (`noEmit`) and Next transpiles through SWC against browserslist, so this
governs type-checking only — confirmed by the prerender diff below.

**A stale `tsconfig.tsbuildinfo` masked the change**: `tsc --showConfig` reported
`es2020` while `npm run typecheck` kept reporting the ES2017 error. Deleting it
resolved it. Added to `docs/automation.md`.

### Prerender impact and verification, prompt 58

**None. Verified, not assumed.**

A dev server was running, so per `docs/automation.md`'s third trap it was left
alone and both sides were built in copies under
`/home/gdk26/.cache/aetherfield-diff` — on the `/home` filesystem, because
`/tmp` is tmpfs and `cp -al` degrades there.

Route table, **identical on both sides, 27/27**: 11 Static, 2 SSG (6 + 3 paths),
9 Dynamic, plus Proxy (Middleware) — the same table the prompt recorded as the
baseline.

**21 prerendered HTML files on each side. After normalising `.next/BUILD_ID`,
the CSS chunk name, `/_next/static/chunks/[A-Za-z0-9_-]+\.js`, and stripping the
RSC flight scripts: 0 of 21 differed.** Both builds pinned the same
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.

Two things had to be got right before that number meant anything, and both are
now in `docs/automation.md`:

- **The CSS chunk is emitted to `.next/static/chunks/`, not `.next/static/css/`.**
  A normaliser looking in `static/css/` finds nothing and reports all 20
  non-trivial pages as differing, every one at identical byte length — the
  documented signature of a pure rename.
- **`git archive HEAD` includes the tracked `.claude/` skills; a `tar` of the
  working tree that excludes them does not.** Tailwind v4 scans those files, so
  the base built to 70,917 bytes of CSS against the implementation's 64,826 —
  a 6 KB "regression" that was purely an artefact of the copy method. With both
  sides excluding `.claude/` and `.agents/`, the base built to **exactly 64,513
  bytes**, matching the prompt's recorded baseline.

**CSS: 64,513 → 64,758 bytes, +245.** A rule-level diff shows **5 utilities
added, 0 removed** — `.leading-5`, `.max-w-[26rem]`, `.pb-7`, `.py-1`, `.py-7` —
all of them from the new `/activity` emissions section. Tailwind v4 emits one
chunk for the whole app, so a utility used only on a dynamic route still lands
in the file the marketing pages link. That is inherent and precedented: the
baseline has moved 61,752 → 64,385 → 64,513 across earlier steps. **The
prerendered markup is byte-identical; no marketing route's HTML or render mode
changed.**

A sixth text-overflow utility appeared and was removed. It came from **a bare
English verb in a doc comment that matched the utility's name** — Tailwind v4's scanner extracts
candidate class names from prose in `.ts` files, including test files, and a bare
word that collides with a utility name ships as dead CSS on every page. Two
comments were reworded. Added to `docs/automation.md`.

### Checks run

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm run db:generate` | `0005_amazing_daimon_hellstrom.sql` — 9 types, 4 tables, **no `ALTER` on any existing table** |
| `npm run db:migrate` | applied |
| `information_schema` / `pg_indexes` readback | above |
| `npm run db:seed:factors` | 7,035 factors in 39.3 s warm; re-run wrote nothing |
| `npm test` | **81 passed, 4 files** |
| `npm run build` | 27/27, route table above |
| prerender diff | **0 of 21 differed** |
| `npm run test:e2e` | **Chromium and Firefox passed (2/2). WebKit did not run** — `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux", and podman is not installed on this machine. An environment gap, not a regression, and stated rather than papered over (§12 rule 3) |

### Secrets and data

- **No new environment variable.** The seeder reads `DATABASE_URL_UNPOOLED`
  through the existing `dotenv -e .env.local --` pattern; the app reads
  `DATABASE_URL`. Both already existed.
- **No `NEXT_PUBLIC_*`.** Phase one needed none and this step adds none.
- `lib/db/emission-queries.ts` carries `import "server-only"`. **`lib/domain/`
  and `lib/validation/` do not** — the domain layer is pure and has no secret to
  protect, and the validation layer must stay importable by client leaves.
- **No personal data is added.** Emission factors are public reference data.
  Activity records are a customer's commercial data and stay tenant-scoped.
- **Nothing is logged on the request path.** `app/activity/actions.ts` still has
  no `console` call. The seeder logs counts and a set id — never a tenant, never
  a figure — and it is a developer-run script with no request path.
- **Nothing reaches a third party.** There is no model in this step.

### What step 10 deliberately did not do

| not done | why |
| --- | --- |
| EPA Hub, eGRID, or any second publisher | decided with the user: DEFRA only. EPA's shape differs fundamentally and generalising over two publishers at once widens the step |
| IEA factors | licence-blocked for this product, above. Not a scheduling decision |
| market-based scope 2 | needs REC/GO capture, supplier rates and a residual-mix fallback. `scope2_method` is built now so it is not a rewrite later |
| **AI factor matching** — no AI SDK, no provider, no model, no prompt | §5.3: sanctioned at this step but "sanctioned, not scheduled". The engine must be correct and tested before a model is near factor selection |
| halocarbon GWPs | not verified this session; a refusal beats a remembered number |
| extending `activity_record` with fuel type, region or a Net/Gross CV flag | changes step 9's CSV grammar, its alias table and its mapping UI. Its own prompt |
| editing the `(category, unit)` mapping in the UI | read-only surfacing this step; the editing surface belongs with step 12's dashboard routes |
| targets, forecasting, the "16% off your 2027 goal" reading | step 11 |
| any dashboard route or chart | step 12. `home/dashboard.tsx` stays a marketing illustration |
| ESG report narrative | step 13 |
| scheduled recalculation, threshold alerts | step 14 |
| an xlsx parser in the application | the workbook is converted once by a committed script and the derived CSV is read with the existing pure `parseCsv` |
| touching `SiteNav`, `SiteFooter`, or any marketing route's markup | §8.1 and the front matter's settled surfaces |

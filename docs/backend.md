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

- email/password enabled; Better Auth's verified 8–128 password limits remain
  the defaults;
- `requireEmailVerification: false`, deliberately, until step 3 can send the
  verification message;
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

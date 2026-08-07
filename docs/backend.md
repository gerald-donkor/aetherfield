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
hand-rolled and there is no GSAP (§7.5). Focus moves to the heading on open
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

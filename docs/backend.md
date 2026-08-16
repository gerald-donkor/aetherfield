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

> **Branching was closed at prompt 89, on the half step 1 never named.** Step 1
> framed branching as a *preview deployment* concern; the live problem turned
> out to be local — one `DATABASE_URL` spanning Production, Preview and
> Development meant every `npm run dev` and every E2E run wrote to the
> production database. See "A development database branch, prompt 89" at the
> end of this file. Preview's own `DATABASE_URL` is still unsplit and still
> open.

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

> **Corrected 15 Aug 2026 by prompt 87 (§12 rule 8).** The first sentence above
> was true when written and is now false: production has been deploying from
> `main` since at least 9 Aug 2026 — the oldest deployment `vercel ls` still
> lists — on the alias `https://aetherfield-rho.vercel.app`.
> The instruction in the second sentence was carried out at prompt 87 —
> Production's `BETTER_AUTH_URL` is that alias, added as a deployed origin and
> not an invented one. **Preview still has no `BETTER_AUTH_URL`**, deliberately;
> the refusal to invent one stands there, for the reason recorded in prompt 87's
> D3. There is still **no assigned custom domain** — that half of the sentence
> remains true. See "Completing the production environment, prompt 87" below.

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

### `FormStatus` — §8.2 rule 5 in one place, prompt 105

The announced, focus-managed result line every write-path leaf ends in was
**copy-pasted at 28 sites across 24 files**. That is AGENTS.md §8.2 rule 5 —
"the result is announced, focus is managed, and the state is legible without
colour alone" — implemented by duplication, so it was exactly as strong as the
least careful copy. The copies had already diverged on `role`, which is what
prompt 108 exists to reconcile.

`app/_components/form-status.tsx` now holds it once, including the `useEffect`
that moves focus when a message arrives — the part most easily dropped in a copy
and the part the rule most depends on.

#### It is deliberately **not** in `primitives.tsx`

§7.5 would make that the default home, and it is the wrong one here.
`primitives.tsx` has **no `"use client"` and every primitive in it is
stateless** — `FileField`'s own docblock says so — and the marketing routes'
server components import it. `FormStatus` needs `useRef` and `useEffect`, so
hosting it there would put `"use client"` on the whole module and hand `/`,
`/about`, `/careers`, `/journal` and `/design-system` client JavaScript they do
not carry today. That is §8.1's line. Its own module was the fallback prompt 105
named, and it was taken **as a visible judgement up front** rather than
discovered in a bundle diff.

#### The variance diff, taken before anything was collapsed

All 28 blocks were parsed and compared. What varied:

| dimension | values found |
| --- | --- |
| element | `p` at 14 sites, `div` at 14 |
| `role` | `status` at 19, `alert` at 9, and one that switches on `searchInvalid` |
| `aria-live` | `polite`/`assertive`, **always derivable from `role`** — every site already paired them, so no site needs the override prop |
| leading utilities | none, `mt-3`, `mt-4`, `mt-6`, `mb-6`, `max-w-[34rem]`, `mt-4 max-w-[560px]`, `mt-6 max-w-[560px]`, `mt-3 max-w-[34rem]` |
| shown class | `block`, `mt-5 block`, `mt-6 block`, `mb-8 block`, `mb-8 block max-w-[720px]`, `mt-4 block max-w-[34rem]` |
| visibility | 26 class-toggled `hidden`/shown; **2 conditionally mounted** by the caller and so never hidden (`pinned`) |
| body | `{message}` at 26; two append more (`factor-picker`'s field errors, `factor-import-form`'s row-error list) — handled with `children` |
| focus trigger | `message` at 25, and three compound: `message \|\| complete`, `message \|\| done`, `message \|\| settled` |

**Nothing was normalised.** Every dimension became a prop. `role` in particular
is passed through untouched, so nine sites still say `alert` — reconciling them
is prompt 108's decision to make on its own rather than buried in a
twenty-four-file mechanical diff.

#### The one behaviour change, and it is stated rather than absorbed

Three files — `sign-up-form`, `create-organization-form`,
`invitation-response` — used **one `statusRef` for two mutually exclusive
regions**: a success panel (its own class, its own heading or body, **not** a
`FormStatus`) and the form's result line. Their effect therefore watched
`message || complete` / `|| done` / `|| settled`.

After the split, the success panel keeps `statusRef` and watches its own flag
alone, and the result line focuses itself on `message`. **The two regions never
render together**, so the pair is behaviour-identical to the single compound
effect — but it is two effects where there was one, and that is a structural
change worth naming rather than absorbing silently. The `focusOn` prop exists
for a site that genuinely needs a compound trigger on the status line itself;
after the split, none does.

#### The rendered markup is byte-identical, and that was measured

The acceptance condition, checked rather than eyeballed. Every block's element,
`role`, and **both** rendered class strings — the message-present one and the
`hidden` one — were extracted from `git show HEAD:` for the before side and
recomputed from the `FormStatus` props for the after side:

```
mismatches: 0
```

The composition that makes this hold is `[className, BASE, visibility]
.filter(Boolean).join(" ")`, which reproduces a site with no leading utilities
as `${BASE} ${shown}` exactly as its template literal did.

#### The prerender diff

Two clean git worktrees at `HEAD`, the change applied to one, both built with
hard-linked `node_modules`. Worktrees sidestep `docs/automation.md`'s trap 1
(gitignored doc snapshots contaminating the CSS chunk) because git does not
check them out.

**All 21 prerendered HTML files: rendered markup identical.** All 21 differ in
the inline RSC flight payload only — the documented signature of a component
boundary moving, since module ids and `self.__next_f.push` row segmentation
shift. `docs/automation.md` already records that flight-row renumbering is not a
real diff and that the markup is the thing to compare.

Two practical notes for the next session, now also in `docs/automation.md`:
**Turbopack refuses a symlinked `node_modules` that points outside the project
root** ("Symlink [project]/node_modules is invalid"), so it must be `cp -al` —
and `cp -al` cannot cross filesystems, so the scratch worktrees cannot live under
`/tmp`. Also, `git diff HEAD` does not carry a **new untracked file**, so the
first head build failed with 24 module-not-found errors before
`form-status.tsx` was copied across.

Per-page client JavaScript, measured from the chunks each page actually
references:

| page | base | head | delta | chunks |
| --- | --- | --- | --- | --- |
| `/` | 900,455 | 900,680 | **+225** | 10 → 10 |
| `/about` | 889,370 | 889,595 | **+225** | 10 → 10 |
| `/careers` | 895,778 | 896,003 | **+225** | 10 → 10 |
| `/journal` | 890,433 | 890,658 | **+225** | 10 → 10 |
| `/design-system` | 888,372 | 888,597 | **+225** | 9 → 9 |
| `/sign-in` | 925,121 | 925,148 | **+27** | 11 → 11 |

**No marketing route gained a chunk**, which was the §8.1 risk. The 225 bytes are
the component folded into a chunk those pages already load — `/` and `/journal`
already ship the demo and subscribe dialog leaves, so the code moved rather than
appeared. Across *all* chunks the count went 41 → 42 and the total grew ~251 KB,
which is one additional ~249 KB shared chunk **not referenced by any marketing
page**; chunk names are content-hashed and all of them renamed, so a name-level
comparison says nothing (`docs/automation.md` trap 2).

#### Sites not adopted

Every site carrying the shared class string was adopted — 28 of 28. Three
regions that use `role="status"` with focus management but a **different** class
string are left alone, because they are not this component: `sign-up-form`'s
"check your inbox" panel, `create-organization-form`'s and
`invitation-response`'s settled panels. Each has a heading or a multi-element
body and its own styling. One further paragraph in
`app/activity/[importId]/page.tsx` shares part of the class string but has no
`aria-live`, no `outline-none` and no focus handling — it is a server-rendered
error line, not a form status.

#### Verification, prompt 105

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 735 ms — unchanged; the domain tests see none of this |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| markup equivalence | 0 mismatches across 28 sites; 21 of 21 prerendered pages markup-identical |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, 4.1 min — Chromium and Firefox |
| `npm run test:e2e:webkit` | **not run — blocked.** `podman` is absent on this machine |

**`npm run test:e2e` therefore did not complete as a matrix.** The two native
projects passed and WebKit did not run; that is stated rather than reported as a
pass. The suite is what exercises these leaves, and 24 of them changed at once.

No message text changed, nothing was restyled, no `role` was normalised, no
`NETWORK_ERROR` was extracted, no `SelectField` was added, no `router.refresh()`
was removed, and neither `SiteFooter` nor `SiteNav` was touched.

The 24 files lost 595 lines and gained 315.

### One network-failure sentence, not two, prompt 106

`const NETWORK_ERROR` was declared in **sixteen** files under
`app/_components/`, and **the text was not the same in all of them**. The review
that raised this suspected one further inlined literal; the actual survey found
**nine**, in eight files, and that is the correction this record exists to make
(§12 rule 1 cuts both ways).

| exact text | named constants | inlined literals | total |
| --- | --- | --- | --- |
| `We couldn't reach the server. Check your connection and try again.` | 12 | 7 | **19** |
| `We couldn't reach the server. Please try again.` | 4 | 2 | **6** |

Two distinct strings, twenty-five occurrences, twenty-four files. So the copy a
person saw for one identical failure depended on which control they had pressed.

#### The sentence chosen, and it is a judgement

The **longer** one, everywhere. There is no measurement of comprehension to
appeal to, so this is a judgement and is labelled as one (§12 rule 4). Two
reasons: it is already the large majority, so the smallest number of surfaces
change; and it is the only one of the two that is **operational**, which is the
register AGENTS.md §5 sets — a failure a person can act on should say what to
check.

**No site carried a comment or docblock justifying the shorter text.** Each of
the six was checked individually before it was flattened, and that absence is
the evidence the divergence was accidental rather than deliberate.

#### The copy that changed, listed rather than described as a no-op

Six surfaces now say "Check your connection and try again" where they said
"Please try again". This is a **user-visible copy change**, all of it on
authenticated pages:

- `activity/import-controls.tsx` — the staged-import confirm controls
- `activity/recalculate-control.tsx`
- `alerts/alert-preference-control.tsx`
- `reports/report-controls.tsx`
- `app/submissions/action-controls.tsx` — both inlined literals

#### Where it lives

`lib/validation/result.ts`, beside `SubmitResult` — the module that already owns
the vocabulary every write path speaks. It is deliberately **not**
`server-only` (§6.3), it reads no secret and imports nothing, so a marketing
route's client leaf can import it freely. Three of the adopting leaves are on
prerendered pages (`demo-request-dialog`, `subscribe-dialog`, `apply-dialog`),
which is why the prerender check below was run rather than assumed.

#### Prerender check

Two clean worktrees, same recipe as prompt 105. **All 21 prerendered HTML files:
rendered markup identical**, differing in the inline RSC flight payload only. No
route changed mode. Per-page client JavaScript: `+38` bytes on `/`, `/journal`,
`/about` and `/design-system`, and `-2` on `/careers`, with no change in chunk
count — the constant is one string folded into chunks those pages already load,
and none of the three marketing dialogs' own text changed.

#### Verification, prompt 106

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 724 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| prerender diff | 21 of 21 markup-identical, above |

No other user-facing string changed, the per-path action constants
(`FACTOR_MAPPING_FAILURE` and friends) are untouched and stay per-path, nothing
that reads a secret or imports `lib/db/` was added to `lib/validation/`, and the
`catch` blocks still log nothing (§8.3 rule 2).

### `SelectField` — the primitive that was missing, prompt 107

`primitives.tsx` exported `Field`, `TextareaField` and `FileField` but **no
`SelectField`**, so every `<select>` in the app was hand-styled. The survey
found more than the review had:

- **14 `<select>` elements** across four files;
- **4 `SELECT_CLASS` constants**, one per file, and **all four byte-identical**
  — checked, no drift, so nothing was flattened that someone had decided;
- **2 local `SelectField` components**, in `activity/factor-import-form.tsx` and
  `activity/custom-factor-form.tsx`, themselves **byte-identical to each other**.

That last one is the finding worth keeping: the primitive had already been
invented twice locally. That is the shape §7.5's "no second design system" rule
exists to prevent, and a primitive missing from this module is how it starts.

**And both local copies wired no `aria-describedby`.** They rendered the label
and the error and left them unconnected to the control — exactly the erosion a
missing primitive causes, since a hand-rolled control gets whatever its author
remembered. The shared one shares `FieldFrame` with `Field` and `TextareaField`
and does the same `describedBy` composition, so a hint and an error are now
announced *with* the select. Confirmed in the built HTML:
`aria-describedby="select-example-hint"` on the resting exhibit and
`aria-invalid="true" aria-describedby="select-error-example-error"` on the error
one.

#### Two deliberate differences from `Field`, both preservations

The prompt asked for a primitive with "no gratuitous difference" from `Field`
**and** for byte-identical rendering at every adopted site. Those pull apart in
two places, and the acceptance condition won both times — a restyle of fourteen
controls smuggled into a refactor is the worse outcome. Both are recorded as
their own follow-up, because each is a visual change that should be reviewed as
one:

1. **`SELECT_CONTROL` is not composed from `CONTROL_BASE`.** The two differ by
   `placeholder:text-muted/70` — which a `<select>` has no placeholder to apply
   it to — and by where `border-border` falls in the string. Composing would
   change the rendered `class` attribute at all fourteen selects.
2. **An errored select does not gain `border-ink`,** where `Field` swaps its
   border. None of the fourteen did, so neither does this.

#### Adopted, and not

**Twelve of fourteen adopted**: one in `targets/create-target-form.tsx`, one in
`activity/factor-import-form.tsx`, ten in `activity/custom-factor-form.tsx`. The
four `SELECT_CLASS` constants and both local `SelectField` definitions are gone.

**Two left alone, in `activity/mapping-form.tsx`.** Their labels are not
strings — each carries a JSX "Optional" badge inside the `<label>`:

```tsx
{ACTIVITY_FIELD_LABELS[field]}
{optional ? <span className="…">Optional</span> : null}
```

`FieldFrame` types `label` as `string`, and widening it would change a primitive
`Field` and `TextareaField` also use, which this prompt's non-goals forbid. They
are also the only two selects that append `border-ink` on error, and the only
ones whose class string carries a **stray trailing space** when there is no
error (`${SELECT_CLASS} ${error ? "border-ink" : ""}`). Left exactly as they
are; a `ReactNode` label on `FieldFrame` is the follow-up that would let them in.

#### `/design-system` gains the exhibit, as approved up front

The prompt put this in scope and approved it explicitly, because **a primitive
absent from the exhibit is how the next session concludes there isn't one and
hand-rolls a fifteenth select**.

It sits in the existing `Components · Fields` grid rather than in a section of
its own — the pairing beside `Field` is the lesson: the same label, hint and
error chrome around a different control. Two cells, resting and error, using the
product's own vocabulary (target coverage) rather than lorem options. No new
section device, no restyle, nothing else on the page touched.

#### Prerender diff

Two clean worktrees, the recipe from prompt 105. **`design-system.html` is the
only page whose markup changes — +1,590 bytes, the two new cells.** The other
twenty prerendered files, including all eight other marketing routes and every
`article/` and `job-listing/` page, are **markup-identical**, differing only in
the inline RSC flight payload. Every route keeps its mode.

The rendered class attribute was read back out of the built HTML and is
byte-identical to the four constants it replaced:

```
class="mt-2 h-[52px] w-full border border-border bg-white px-4 font-sans
text-[16px] text-ink outline-none transition-[border-color,box-shadow]
focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)]
disabled:cursor-not-allowed disabled:bg-surface"
```

#### Verification, prompt 107

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 779 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| prerender diff | only `/design-system` differs, by the approved exhibit; 20 of 21 markup-identical |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, 3.8 min — Chromium and Firefox |
| `npm run test:e2e:webkit` | **not run — blocked.** `podman` is absent on this machine |

**`npm run test:e2e` therefore did not complete as a matrix**, and that is stated
rather than reported as a pass.

No select was restyled, no other primitive changed (`describedBy` dedupe is
prompt 110, the `secondary`/`compact` collapse is prompt 111), no other missing
primitive was added, and neither `SiteFooter` nor `SiteNav` was touched.

### The `role` rule for a result region, prompt 108

Prompt 105 put every result region behind `FormStatus` and deliberately passed
each site's `role` through untouched. This is the accessibility decision it kept
out of that diff.

Nine regions were `role="alert"` and thirty were `role="status"`, for the same
success-or-error result after a Server Action returns. **Not one of the nine
carried a comment or docblock giving a reason** — each was read individually
looking for one, and that absence is the useful finding: the split was accident,
not policy.

#### The rule

> **A result region that takes focus is `status`. `alert` is for a message that
> appears without focus moving to it.**

It is written in `FormStatus`'s docblock rather than here, so the next component
inherits it instead of guessing; this section records why it says what it says.

#### Why, from the sources rather than from memory

Read on **16 Aug 2026** (§12 rule 2):

- **W3C ARIA Authoring Practices, Alert Pattern**
  (`https://www.w3.org/WAI/ARIA/apg/patterns/alert/`) — "Because alerts are
  intended to provide important and potentially time-sensitive information
  without interfering with the user's ability to continue working, **it is
  crucial they do not affect keyboard focus.**"
- **MDN, `alert` role** — `role="alert"` is equivalent to `aria-live="assertive"`
  plus `aria-atomic="true"`, and "As they don't receive focus, focus does not
  need to be managed and no user interaction should be required."

Every one of these regions **does** move focus into itself, deliberately, because
that is what AGENTS.md §8.2 rule 5 asks for. So `alert` and the focus effect
work against each other: the assertive interruption buys nothing, since focus is
what guarantees the user reaches the message, while the element is announced on
insertion *and* again when focus lands on it.

#### The double announcement is a **judgement**, not a measurement

This is the part the prompt insisted must not be asserted from theory dressed up
as observation. **No screen reader was run.** There is none available in this
environment, and none of the automated checks can observe an announcement. The
claim that the nine announced twice is **reasoned from the two sources above**,
and it is recorded as a judgement (§12 rules 3 and 4). What *is* established by
reading the code is the precondition: all nine combined an assertive live region
with a focus move, which both sources say not to do.

#### Disposition — eight changed, one kept

| site | disposition |
| --- | --- |
| `activity/factor-picker.tsx` | → `status` |
| `activity/mapping-form.tsx` | → `status` |
| `activity/upload-form.tsx` | → `status` |
| `organization/create-organization-form.tsx` | → `status` |
| `organization/delete-organization-panel.tsx` | → `status` |
| `organization/invitation-response.tsx` | → `status` |
| `organization/members-panel.tsx` | → `status` |
| `targets/create-target-form.tsx` | → `status` |
| **`auth/sign-out-button.tsx`** | **keeps `alert`** |

`sign-out-button` is conditionally mounted and **moves no focus**, which is
exactly the case the rule reserves `alert` for. It stays, and it is the evidence
the deliverable was a stated rule rather than uniformity for its own sake.

All eight changed sites are `FormStatus` calls, so each is a one-prop deletion.

#### One implication, stated because it is a change rather than an addition

`role="alert"` implies `aria-atomic="true"`; `status` does not. Dropping to
`status` therefore drops that implicit atomicity, so a partial update to the
region would announce only the changed part. **These regions replace their whole
text at once**, so there is no partial update to mis-announce. No `aria-atomic`
was added — the prompt's non-goals forbid it, and it would be its own judgement.

#### Prerender

`none — no route changes`, and confirmed rather than assumed: every consumer of
the eight changed components is a `ƒ` dynamic authenticated route
(`/targets`, `/activity`, `/activity/[importId]`, `/activity/mappings`,
`/account`, `/invitation/[id]`). No prerendered page renders one, so no HTML
diff was needed.

#### Verification, prompt 108

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 802 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, 3.6 min — Chromium and Firefox |
| `npm run test:e2e:webkit` | **not run — blocked.** `podman` is absent on this machine |

**`npm run test:e2e` did not complete as a matrix**, and that is stated rather
than reported as a pass.

No message text, timing or focus effect changed; no live-region attribute was
added; the class string and the component's shape are as prompt 105 left them;
and no `role` outside a form-result region was touched.

### Thirteen `router.refresh()` calls, determined one by one, prompt 109

Thirteen client leaves called `router.refresh()` in their success branch while
`app/activity/actions.ts` alone calls `revalidatePath` twenty-nine times, and
`organization/members-panel.tsx` documented the opposite convention outright.
Two conventions for one job.

**This was not a blanket deletion**, and treating it as one would have shown a
reporter a report that no longer exists. The determination is per site: which
action the leaf calls, what that action revalidates, and whether that is the path
the leaf is rendered on.

#### The determination table

| leaf | action | action revalidates | leaf renders on | verdict |
| --- | --- | --- | --- | --- |
| `activity/retire-factor-button` | `retireCustomFactor` | `/activity/factors`, `/activity/mappings`, `/activity` | `/activity/factors` | **removed** |
| `activity/factor-import-form` | `importCustomFactors` | same three | `/activity/factors` | **removed** |
| `activity/factor-set-form` | `editFactorSet` | same three | `/activity/factors` | **removed** |
| `activity/custom-factor-form` | `createCustomFactor` | same three | `/activity/factors` | **removed** |
| `activity/retire-set-button` | `retireFactorSet` | same three | `/activity/factors` | **removed** |
| `activity/factor-picker` | `setFactorMapping` | `/activity`, `/activity/mappings` | `/activity/mappings` | **removed** |
| `activity/import-controls` | `commitImport` / `discardImport` | `/activity`, `/activity/[id]` | `/activity/[importId]` | **removed** |
| `activity/mapping-form` | `updateImportMapping` | `/activity/[id]` | `/activity/[importId]` | **removed** |
| `activity/recalculate-control` | `recalculate` | `/activity`, and `/activity/[id]` when an id is given | both, via `EmissionsSummary` | **removed** — the action's conditional matches the two mount points exactly |
| `reports/create-report-form` | `createReport` | `/reports` | `/reports` | **removed** |
| `reports/report-controls` | `generateNarrative` **and** `deleteReport` | `/reports/[id]` (all three branches) / **`/reports` only** | `/reports/[reportId]` | **kept** |
| `auth/sign-in-form` | `authClient.signIn.email` | — not a Server Action | `/sign-in` | **kept** |
| `auth/sign-out-button` | `authClient.signOut` | — not a Server Action | anywhere | **kept** |

**Ten removed, three kept**, each keep carrying a comment at the call site
saying why — which is the part that converts a silent inconsistency into a
stated one.

#### The three that stay

**`reports/report-controls`** is the interesting one. `ReportAction` is shared by
`GenerateNarrativeControl` and `DeleteReportControl`. `generateNarrative`
revalidates `/reports/[id]` on every branch, so for that action the refresh *is*
redundant. `deleteReport` revalidates **`/reports` only** — not the page the
control is standing on, which is the page whose report has just stopped
existing. Without the refresh the reporter keeps looking at a deleted report:
a stale success, §8.2 rule 4's failure. One component serves both and the
deleting one decides.

**The two auth leaves keep theirs, and the evidence is clear in the opposite
direction** from the prompt's default-to-caution. `authClient.signIn.email()`
and `authClient.signOut()` are **not Server Actions** — no `revalidatePath` runs
anywhere on either path, so nothing invalidates the client router cache. Each
follows with `router.replace(...)` then `router.refresh()`, and the refresh is
what makes the destination render against the session cookie that has just
changed rather than the cache entry the client already holds. A broken sign-out
is a far worse outcome than a redundant refresh.

#### Cache Components does not apply here, and that was checked

AGENTS.md's front matter requires loading `next-cache-components` before touching
revalidation, and it was. **The finding is that it does not bear on this
change:** `next.config.ts` does not set `cacheComponents`, and there is no
`use cache` directive anywhere in `app/` or `lib/`. Classic `revalidatePath`
semantics apply, which is what the table above assumes.

#### The benefit is judged, not measured

**No request-count or timing measurement was taken**, so none is claimed (§12
rule 4). Ten fewer client-initiated refreshes is a structural fact; that it is
faster for any user is a judgement. Any latency number here would also have to
say whether the database was warm (§7.3's scale-to-zero rule), and none was
gathered.

#### Verification, prompt 109

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 760 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, 3.7 min — Chromium and Firefox |
| `npm run test:e2e:webkit` | **not run — blocked.** `podman` is absent on this machine |

The E2E suite is the load-bearing check for this prompt, because a wrongly
removed refresh shows stale data after a successful write and no unit test can
see it. **The matrix did not complete** — the two native projects passed and
WebKit did not run. The native pass covers the activity, factor, mapping,
report and auth flows these thirteen leaves sit in.

No `revalidatePath` call was added or removed in any action, no redirect on
success was introduced (§10 rule 5), and no leaf was restructured beyond
deleting the call and its now-unused `useRouter`.

### `describedBy`, composed once, prompt 110

`primitives.tsx` composed the `aria-describedby` id list **four** times — in
`Field`, `TextareaField`, `FileField` and, from prompt 107, `SelectField`. Three
were byte-identical; `FileField`'s inserts `statusId` before `errorId`.

`SelectField` becoming the fourth copy the moment it landed is the point: a
copied expression spreads at exactly the rate new components are added, and this
is the accessibility wiring that makes the field primitives correct.

One helper now, called four times:

```ts
function describedBy(...ids: (string | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}
```

#### Order is semantic, and that was checked rather than assumed

**W3C, *Accessible Name and Description Computation 1.2*, §4.3.2**, read
**16 Aug 2026** (§12 rule 2): the description is computed from "all nodes
referenced by `aria-describedby` on the element, concatenated, and separated by
a space character", following "the sequence in which the IDREFs are listed".

So argument order is read order. The helper is variadic and **never sorts,
dedupes or reorders**. `FileField` passing `hint, status, error` is a decision
worth preserving: the status names the file just chosen and belongs before any
complaint about it, and the call site now carries a comment saying so.

#### `undefined`, decided once

The helper returns `undefined` rather than an empty string, and the four call
sites dropped their `|| undefined`. `aria-describedby=""` is not the same as
omitting the attribute; putting the guard inside the helper is what stops a
fifth primitive forgetting it. That was a free choice between two placements and
it is applied uniformly.

#### The combination check

The acceptance condition was byte-identical output for **every** combination, not
a spot check. All sixteen were enumerated — caller-supplied id present/absent ×
hint present/absent × error present/absent, for the three-id primitives, and the
same again with `status` always present for `FileField`:

```
16 combinations checked, 0 differences
```

with, for example, `caller f-hint f-status f-error` and `f-hint f-status` coming
out in exactly that order.

#### The prerender diff — 21 of 21 byte-identical

Not "markup identical" this time but **fully byte-identical**, which is the
specific evidence this prompt wanted for `/design-system`.

Getting there needed one more normalisation than the earlier prompts used, now
recorded as `docs/automation.md`'s trap 9: **the build id appears inside the
inline flight payload** as a bare `"b":"<buildId>"` field, not only in
`/_next/static/<buildId>/` paths. Before normalising it, all 21 pages reported
as differing at identical byte length — trap 2's signature — and the whole
difference was those twenty-one characters. With the id read from each side's
`.next/BUILD_ID` and replaced out:

```
21 of 21 byte-identical after normalising build id + chunk names
```

The rendered attributes on `/design-system` read back as
`aria-describedby="field-example-hint"`,
`aria-describedby="field-error-example-error"`,
`aria-describedby="select-example-hint"` and
`aria-describedby="select-error-example-error"`.

#### Where this is recorded, and why here

The prompt asked for the `docs/` file that owns `primitives.tsx`, named from
AGENTS.md's index rather than assumed. **The index has no row for
`primitives.tsx`** — `docs/site-affordances.md` owns the pointer cursor and
`docs/chrome.md` owns `SiteFooter`/`SiteNav`, neither of which is this file. The
module's previous additions (`TextareaField`, `FileField`, `SelectField`) are all
recorded in this file, so it stays the owner and no index row was added for a
file that does not need creating.

#### Verification, prompt 110

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 731 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| combination enumeration | 16 of 16 identical |
| prerender diff | **21 of 21 byte-identical** |

No id value or generation changed, no ids were reordered, the hint and error
rendering and every label wiring are untouched, no fifth primitive was added,
`secondary`/`compact` was left for prompt 111, and neither `SiteFooter` nor
`SiteNav` was touched.

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

**Performed on production, 15 Aug 2026.** The deadlock is real and not
theoretical: with no admin row, `setStaffRole` cannot grant `staff` either,
because it re-checks the actor's admin role — so a fresh database has no
in-app path to any privileged account at all. It was resolved by a one-off
script, run once and deleted rather than committed, that built its own pool
from `DATABASE_URL_UNPOOLED` (the `seed-emission-factors.ts` pattern, which
avoids `server-only`) and set `role = 'admin'` on the single user row by id.

**`staff` would not have been enough, and `admin` is the correct bootstrap
target.** `lib/auth/server.ts:242` admits either role to `/submissions`, so
`staff` opens the view — but only `admin` reaches the removal controls and the
staff tab (`app/submissions/page.tsx:366`), and only an admin can grant
anything. Granting `admin` once is what makes every later grant an ordinary
in-app operation; granting `staff` would have left the deadlock in place.

**Any future environment repeats this.** The write is deliberately not a
committed script: a repeatable `db:grant:admin` would be a standing privilege
escalation living in the repo, and §11.2 rule 3 exists to keep self-granted
staff impossible. A one-off, deleted after use, keeps the escalation out of the
codebase. Whoever does it next needs the target's user id, which is read from
the `user` table directly.

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

> **Corrected at prompt 81** (§12 rule 8). The last clause is no longer true:
> the policy question is resolved and the repository now disagrees with it.
> `/submissions`'s controls are unchanged and are still a manual
> active-workspace control — that part stands — but a **scheduled retention job
> now exists**, and a soft-deleted lead, subscriber or application is no longer
> a permanent hidden row: stamping `deleted_at` starts a 30-day grace window and
> the nightly sweep at `/api/cron/purge-submissions` then hard-deletes the row,
> and an application's private CV blob with it. See "Finite retention for
> phase-one personal data, prompt 81" at the end of this file for the windows,
> the sweep's order and what is stated where.

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

### The application row's two controls — fault and fix, prompt 88

Reported from production with a screenshot on 15 Aug 2026, fixed on 16 Aug 2026.

**The fault.** In the applications view only, the CV download link and the
Remove control rendered flush against each other on desktop — two black blocks
of different widths touching at the edge, reading as one mis-shapen object
rather than two controls.

**The cause.** `app/submissions/page.tsx`'s `ApplicationList` is the one list
that does not place `RemoveSubmissionControl` directly in the row grid; it nests
the control and the CV link inside a wrapper that occupies a single grid cell.
That wrapper was a bare `<div className="min-w-0">` — no direction, no gap, no
alignment — so the two were block-level siblings.
`RemoveSubmissionControl` supplies its own separation and **only as a grid
child**: `app/submissions/action-controls.tsx` opens with
`mt-4 border-t border-border pt-4 lg:mt-0 lg:border-0 lg:pt-0`, which separates
it from content above on mobile and, on desktop, deliberately drops that margin
because it is expected to occupy its own grid column. Nested one level down it
kept `lg:mt-0` and lost the column, so desktop had no separation at all. That is
why the fault was desktop-only and appeared in this list alone. `LeadList` and
`SubscriberList` place the control directly in the grid, which is the
arrangement its classes were written for, and are untouched.

**The fix** is one wrapper, in `ApplicationList` only:

```
- <div className="min-w-0">
+ <div className="flex min-w-0 flex-col items-start gap-5">
```

`items-start` stops either control stretching to the other's width — they have
different jobs and equal width would imply equal weight. `min-w-0` is kept: it
is what lets the CV link's `max-w-full wrap-anywhere` wrap a long filename
instead of forcing the grid column wider. `RemoveSubmissionControl`'s own
classes are unchanged, because they remain correct for its two other call sites.

**`gap-5` is a judgement, not a measurement.** There is no comp for this route.
The value is not new: it is the row grid's own `gap-5`, the other of the two
candidates on this row being the control's `mt-4`. `gap-5` was chosen because it
makes the wrapper's children stack at exactly the rhythm the surrounding grid
cells stack at, so on mobile the applications row now spaces identically to
`LeadList` and `SubscriberList` — grid `gap-5`, then the control's own
`mt-4`/border/`pt-4` — while on desktop it supplies the separation the control
contributes none of.

**Verification, prompt 88.** `npm run lint` and `npm run typecheck` exited 0
with no diagnostics; `npm test` reported **283 passed (283)** across 12 files.
`npm run build` exited 0, compiled in **14.0 seconds**, generated **32** static
pages and emitted the route table unchanged — `/`, `/about`, `/careers`,
`/journal`, `/design-system` `○ Static`, `/article/[slug]` (6) and
`/job-listing/[slug]` (3) `● SSG`, `/submissions` still `ƒ Dynamic`. Prerender
impact is therefore **none**, verified rather than assumed.

**The browser confirmation was not obtained, and no geometry is claimed as
measured.** A throwaway Playwright spec against the committed admin fixture was
written and run; `auth.setup.ts` could not reach Neon from that process
(`ENETUNREACH` on the IPv6 address, `ETIMEDOUT` on `…:5432`), so the fixture
never provisioned and no screenshot was taken. The spec was deleted rather than
committed. The layout claims above are read from the Tailwind v4 utilities —
`flex-col` is `flex-direction: column`, `items-start` is `align-items:
flex-start`, `gap-5` is `calc(var(--spacing) * 5)` — and are **reasoned, not
observed in a browser**. Note also that a screenshot of this row shows a real
applicant's name, address and CV filename and must never be committed (§8.3).

### The two admin actions gained a limiter, prompt 97

Step 7 shipped `changeStaffRole` and `removeSubmission` **unlimited**. That was
not an §8.2 breach — §8.2 governs *public* write paths, and both actions refuse
anyone whose re-read role is not `admin` — but it made them the only two
mutating authenticated actions in the repository without a limiter, and the
omission was silent rather than written down as a decision, which every
comparable omission here is.

| | |
| --- | --- |
| limiter | `checkSubmissionWriteLimit(userId)`, prefix `submission-write` |
| window | **30 per hour**, keyed by the admin's **user id** |
| bucket | **shared by both actions** — same person, same page, same sitting |
| on limiter error | **fails closed**, as every authenticated path here does |
| rejection | `{ ok: false, error }` with `formatRetry` timing. No throw, no bare string (§10 rule 2) |

**The window is a judgement, not a measurement** (§12 rule 4), with less to fit
against than most: the view has never been in front of a real admin. It was
judged against its neighbours — it sits at `ALERT_PREFERENCE_LIMIT`'s 30 rather
than `ORGANIZATION_DELETION_LIMIT`'s 10, because unlike deleting an organisation
there *is* honest repetition (clearing a morning of spam leads is one call per
row), while `removeSubmission`'s application branch deletes a **CV blob per
call** and that erasure does not come back, so the number still has to bound
what one compromised admin session can destroy. If a real spam wave ever exceeds
it, the answer is a bulk action with its own limit rather than a looser window.

**A named limiter rather than a reuse**, and for a reason no other limiter in
the file has: **the callers are Aetherfield's own admins**, not a tenant.
Sharing a bucket with a tenant flow would let a customer's afternoon of imports
throttle the person removing that customer's data on request.

**The stage ordering was wrong and is fixed here.** Both actions parsed at
stage **c** *before* authorising, which inverts §10 rule 3 — the cheap
rejections must come first. Both now run one helper, `resolveAdminForWrite()`,
which resolves the admin session and spends the limit, and parse afterwards.
Stage **d** necessarily precedes **b** because the key *is* the user id and
there is no key without the session — the same constraint
`resolveMembershipForWrite()` documents in `app/account/actions.ts`.

**Deliberately not done:** no BotID (authenticated path, and a page path missing
from `instrumentation-client.ts` makes the call *fail* — §7.3; the absence now
carries the same explanatory comment every comparable site does), no change to
either success path or to the application branch's compensating restore, no
change to `getAdminAccount()`, and no shared preamble across route files. No new
environment variable; nothing new logged.

**Checks:** lint and typecheck clean, 283 `lib/domain/` tests passing, and
`npm run build` left the route table as §8.1 states — `/`, `/about`,
`/careers`, `/design-system`, `/journal` `○ Static`, `/article/[slug]` and
`/job-listing/[slug]` `● SSG`, `/submissions` still `ƒ Dynamic`.

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

> **Closed by prompt 64 on 12 Aug 2026** — see "One membership row per
> `(organisation, user)`" below. The constraint was hand-added after all, with
> the precedent this file already records (`auth-schema.ts` is not purely
> generated) and a comment that survives regeneration. This paragraph is left
> standing as the question it was, rather than rewritten to look prescient
> (§12 rule 8).

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
| invitations, `sendInvitationEmail`, an accept route, a members management UI | the user's decision above; blocked nothing downstream. **Closed by prompt 63 on 12 Aug 2026 — see "Step 8's deferred invitations" below.** This line has now been wrong twice and is corrected rather than left standing (§12 rule 8): it first read "and is the next prompt", which it was not (the user chose step 9, and prompt 57 implemented it); it then read "remains deferred", which it no longer does |
| teams, `dynamicAccessControl`, custom roles | not in §5.2 step 8 |
| organisation deletion or renaming | §9.2 rule 5 wants a soft-delete with an audit trail; design it with the erasure path, not ahead of it |
| any phase-two table — `site`, `activity_record`, `emission_factor`, `target`, `report` | steps 9–13 |
| any dashboard route or chart | step 12. `home/dashboard.tsx` stays a marketing illustration |
| refactoring the six existing `app/_components/auth/*` components onto a shared auth client | settled screens, and the churn buys nothing this step needs |
| touching sign-up | decision 1 above |
| widening `proxy.ts`'s matcher | §8.1 — the marketing routes must stay unmatched |
| adding a staff bypass into tenant data | §11, explicitly |

## Step 8's deferred invitations, closed by prompt 63

Implemented by prompt 63 on 12 Aug 2026. Step 8 shipped organisations,
membership and the tenant boundary, and deliberately shipped **no way for a
second person to reach a tenant** — the `invitation` table existed and stayed
empty from `246decd` until this prompt. Everything phase two built on top of it
(`/activity`, `/dashboard`, `/targets`, `/reports`, and step 14's nightly sweep
mailing "the organisation's owners") was single-user in practice. This closes
that, and adds no row to §5.2: it is the last named piece of step 8.

**No migration.** `member` and `invitation` were generated by
`npx @better-auth/cli generate` at step 6 and have existed since; nothing in
this prompt changes `lib/db/schema.ts` or `lib/db/auth-schema.ts`.

### What was added

| file | what |
| --- | --- |
| `lib/validation/organization.ts` | `inviteMemberSchema`, `invitationIdSchema`, `memberIdSchema`, `cancelInvitationSchema`, `removeMemberSchema`, `invitationResponseSchema`, `ORGANIZATION_ROLE_LABELS`, `MEMBERSHIP_ERRORS`; `invitation` / `invitations` added to `RESERVED_SLUGS` |
| `lib/validation/lead.ts` | `workEmail` renamed to an **exported** `workEmailSchema`, so the invite form reuses the demo request's address rules instead of restating them |
| `lib/email/templates/organization-invitation.tsx` | the message, on the existing `Shell` |
| `lib/email/organization.ts` | `sendOrganizationInvitation` — returns a boolean, throws nothing |
| `lib/auth/server.ts` | `sendInvitationEmail` wired, plus `invitationExpiresIn`, `invitationLimit`, `cancelPendingInvitationsOnReInvite` |
| `lib/rate-limit/index.ts` | `checkInvitationWriteLimit`, `checkInvitationResponseLimit` |
| `lib/db/organization-queries.ts` | `listMembersForOrganization`, `listPendingInvitations`, `getInvitationForLink` |
| `app/account/actions.ts` | `inviteMember`, `cancelInvitation`, `removeMember`, `leaveOrganization` |
| `app/_components/organization/members-panel.tsx` | the client leaf |
| `app/account/page.tsx` | the MEMBERS section, between ORGANISATION and TARGET ALERTS |
| `app/invitation/[id]/page.tsx`, `actions.ts` | the accept route and its colocated action |
| `app/_components/organization/invitation-response.tsx` | the accept / decline leaf |

### The API, and the trap that was in it

**The server method is `createInvitation`, not `inviteMember`.** `inviteMember`
is the *client* plugin's name, and it is what the `organization-best-practices`
skill and every tutorial show. This project has no `organizationClient()`
anywhere; every organisation mutation is a Server Action calling `auth.api`
(§6.2). Read from
`node_modules/better-auth/dist/plugins/organization/routes/crud-invites.d.mts`
and `crud-members.d.mts` rather than recalled (§12 rule 2).

`removeMember`'s body field is **`memberIdOrEmail`**, and the action always
passes the `member` row's id — never the user's id, which is a different key,
and never an address, which a browser could supply.

### The three plugin options, each a judgement

Recorded as judgements, not measurements (§12 rule 4) — nothing has shipped, so
there is no traffic to fit against.

| option | value | why |
| --- | --- | --- |
| `invitationExpiresIn` | `60 * 60 * 48` — **the plugin's own default, kept** | stated explicitly rather than left implicit, because a link's lifetime is a security decision. Two days spans a weekday and a weekend for someone who read the mail on a phone and acted on a laptop, while keeping a forwarded link short-lived. A missed window costs one click: `/account` lists every pending invitation and an owner can withdraw and re-send |
| `invitationLimit` | 50 | a bound against runaway *pending* invitations on a free Neon plan, not a cap on eventual membership (that is `membershipLimit: 100`). 50 lets an organisation invite its whole roster in two passes |
| `cancelPendingInvitationsOnReInvite` | `true` | off, a second invitation to an address that already has one is refused with `USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION` (`crud-invites.mjs:132`) — and re-inviting is exactly what an owner does when the first message did not arrive. On, the stale row moves to `canceled` and a fresh id and expiry are issued, so **the old link stops working the moment a new one is sent**: one live link per address at a time |

### A failed invitation email cannot fail the write — verified, not assumed

§10 rule 4 required checking what the plugin actually does with a throw inside
`sendInvitationEmail`. The source says: `createInvitation` writes the row, then
calls the sender through `ctx.context.runInBackgroundOrAwait`
(`crud-invites.mjs:226`). That helper
(`node_modules/better-auth/dist/context/create-context.mjs:214-224`) hands the
promise to `advanced.backgroundTasks.handler` with a `.catch` already attached
when one is configured — this project configures `waitUntil` — and otherwise
awaits it inside its own `try`/`catch`. **Either way the endpoint cannot be
failed by the sender.** `sendOrganizationInvitation` returns `false` rather than
throwing regardless, so the rule does not rest on a library's internals.

The consequence to be honest about: **an invitation whose email did not leave is
still a row in `invitation`**, and the action reports success. That is the
correct trade under rule 4 — the invitation genuinely exists and is genuinely
acceptable — and the owner's remedy is the Withdraw control plus a re-send,
which `cancelPendingInvitationsOnReInvite` makes safe.

### The write path, per §10

All four `/account` actions carry §10's letters in §10's order, and each copies
`createOrganization` directly above them:

- **a. BotID — deliberately absent**, for the reason already written at
  `app/account/actions.ts` stage a and not restated there or here.
- **b.** session and tenant via `getCurrentMembership()`, then
  `checkInvitationWriteLimit` keyed by the user id, **failing closed**. Shared
  by all four through `resolveMembershipForWrite()`.
- **c.** `safeParse` with the schema the leaf ran.
- **d.** **owner-only for invite, cancel and remove**, checked in the action —
  hiding the controls is presentation (§11.2 rule 2). `leaveOrganization` is the
  exception: a member may leave, and the **last owner may not**, which the
  plugin enforces by counting owners inside the endpoint
  (`crud-members.mjs:403-411`); its error code is translated rather than the
  rule duplicated.
- **e.** `auth.api.*` with `headers: await headers()` (async on Next 16).
- **f.** the email, sent by the plugin.
- `revalidatePath("/account")`, **no redirect** (§10 rule 5), typed result.

**No organisation id and no user id is ever taken from the browser.** Both come
from the resolved membership. `cancelInvitation` and `removeMember` additionally
**re-check the id they were given against the resolved tenant** — the pending
set and the roster are read from `lib/db/organization-queries.ts` and the id has
to be in one of them — so a response can never reveal that some other
organisation's invitation or member exists.

`translateOrganizationError()` maps every reachable
`ORGANIZATION_ERROR_CODES` value into this path's own vocabulary, and an
unhandled code falls through to the generic message rather than throwing
(§10 rule 2). The codes were read from
`node_modules/better-auth/dist/plugins/organization/error-codes.mjs`.

### The accept route

`app/invitation/[id]/page.tsx` — a **page, not an API route** (§6.2: route
handlers are for callers that are not this application, and a browser following
a link is not one). Modelled on `app/newsletter/confirm/page.tsx`, and built on
`AuthShell` rather than a second shell (§7.5).

- **Signed out → redirect to `/sign-in?callbackURL=/invitation/<id>`**, before
  anything is read, so an anonymous visitor gets the same answer for every id
  and the page cannot be used to discover which invitations exist.

  **The prompt asked for the callback round-trip to be verified. It was, and it
  does not round-trip — reported here rather than routed around (§12 rule 9).**
  `app/_components/auth/sign-in-form.tsx:76` navigates to `/account` on a
  successful sign-in and never reads `?callbackURL=`; `sign-up-form.tsx` sends
  its own callback to `/verify-email`. So a signed-out invitee who follows the
  link signs in and lands on `/account`, not back on the invitation. The link in
  the email is durable and works on a second click, so the flow completes — it
  is one extra step, not a dead end.

  **The parameter is still sent, and the fix is deliberately not in this
  prompt.** `proxy.ts` has built the same `/sign-in?callbackURL=…` URL for every
  protected route since step 6, so this is a **pre-existing gap across the whole
  authenticated site**, not something this route introduced; dropping the
  parameter here would make the invitation route inconsistent with the six
  routes beside it and would delete the intent a fix needs. Honouring it means
  editing a settled auth screen, which this prompt's non-goals put out of
  scope — it wants a same-origin-only allowlist on the redirect target, which is
  a security decision worth its own prompt rather than a line added at the end
  of this one.
- **Four distinct handled states with honest copy**, not one error page:
  not-found (or malformed id), already-accepted, withdrawn (`canceled`),
  declined (`rejected`), and expired — five in the implementation, because
  `rejected` and `canceled` mean different things to the person reading.
- **The invited address is the only address that may accept.** The page refuses
  before offering the control, and names **the invited address and nothing
  else** — not the organisation, not the inviter. Whoever holds the link
  received it at that address, so the address is not a disclosure to them; the
  organisation's name would be.
- **`auth.api.getInvitation` is deliberately not used for the read.** It
  collapses expired, non-pending and not-found into a single "Invitation not
  found!" and refuses a non-recipient outright, which leaves the page with
  nothing true to say. `getInvitationForLink` in the data layer returns the row
  with its status, so the page can tell the states apart — and §6.3 wants the
  read there anyway.
- **`getInvitationForLink` is the one read in `organization-queries.ts` not
  predicated on an organisation id**, and that is a bounded, deliberate
  exception recorded rather than hidden: the route exists for someone who is not
  yet a member and therefore has no membership row to resolve a tenant from.
  What stands in for the predicate is the 32-character random id, shape-checked
  before the lookup, plus the address match the page and the plugin both
  enforce before anything is disclosed or written.
- **`proxy.ts`'s matcher is not widened for this route**, and that is a decision
  rather than an oversight. The matcher is optimistic convenience only (§7.3),
  the page does its own database-backed check, and the list's whole purpose is
  to stay narrow (§8.1).

### The id contract, verified

`invitationIdSchema` and `memberIdSchema` are `^[A-Za-z0-9]{32}$`. Verified
against the generator rather than a sample: Better Auth 1.6.26's `generateId` is
`createRandomStringGenerator("a-z", "A-Z", "0-9")(size || 32)`
(`node_modules/@better-auth/core/dist/utils/id.mjs`), and this project sets no
`advanced.database.generateId` override. Same contract step 7 recorded for
`user.id`; restated in the organisation's own vocabulary rather than imported
from the submissions view's.

### Rate limiters

Both keyed by the **user id**, both judgements, both placed with the other
authenticated limiters.

| limiter | window | why |
| --- | --- | --- |
| `checkInvitationWriteLimit` | 20 / 1 h | invite, cancel and remove share it. Invite is the one write on this site that **sends mail to an address the caller typed**, which is the abusable surface; 20 bounds what one compromised owner account can put in other people's inboxes while leaving room to onboard a ten-person department |
| `checkInvitationResponseLimit` | 30 / 1 h | accept and decline. Separate because it is reached by a *different person* — an invitee throttled by an owner's morning of invitations would be locked out of the one action they came for. Deliberately loose; it bounds probing, not traffic |

Neither is keyed by the invitation id: that is a capability in a link, and
keying on it would let a probed link exhaust the limit for the person who
legitimately holds it.

**The invitation-write docblock was orphaned, and prompt 92's sweep found it
(fixed by prompt 93).** In `lib/rate-limit/index.ts` the invite/cancel/remove
docblock sat immediately above the *organisation-deletion* one (prompt 73), so
the two docblocks stacked and `INVITATION_WRITE_LIMIT` / `_WINDOW` stood bare
below `ORGANIZATION_DELETION_LIMIT` / `_WINDOW`. The file read as though the
"sends mail to an address the caller typed" reasoning and the figure 20
belonged to organisation deletion, which is 10 for unrelated reasons. **The
comment was moved, not rewritten** — both texts were already correct about
correct numbers, and rewording a justification would be a new judgement (§12
rule 4). **Declaration order was left as it stands**: the deletion pair keeps
its position and the invitation-write pair keeps its own, so nothing but the
comment's placement changed. No limit or window moved, and `Ratelimit` reads
these as literal values with no dependence on declaration order.

### Personal data

- Stored: the **invited email address** in `invitation` (lowercased by
  `workEmailSchema` before it leaves the browser's schema and again by the
  plugin), and the inviter's user id. Both columns already existed.
- **Nothing personal is logged** (§8.3 rule 2): no address, no name, no
  organisation name, no payload — in any catch block, any warning, or the
  idempotency key. The invitation id is the only identifier that appears.
- The idempotency key is `organization-invitation/<invitation-id>`, and unlike
  `sendTargetAlert`'s it folds in **no hash of the recipient**: one invitation
  has exactly one recipient, so there is no fan-out to disambiguate, and a
  re-invite produces a new row with a new id rather than colliding on the old
  key.
- **No new environment variable, and no `NEXT_PUBLIC_*`.** `.env.example` is
  unchanged. `vercel env ls` lists `BETTER_AUTH_URL`; it does **not** list
  `RESEND_API_KEY`, which is present in `.env.local` and `.env.example` only —
  that is step 3's recorded deviation (Resend cannot be provisioned without a
  domain Aetherfield owns) and is unchanged by this prompt, not a new gap.
- No permanent archive is added (§8.3 rule 5). An invitation ends at the
  plugin's own lifecycle — accepted, rejected, canceled or expired — and the
  open retention-policy question stays open and unclaimed.

### Prerender impact — none, verified

`npm run build` reports the route table §8.1 requires, unchanged:

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

`/invitation/[id]` is `ƒ` (dynamic), by construction. `/account` was already
dynamic.

The HTML was diffed against the parent commit `f9e102b`, both builds made in
copies of the tree that exclude the gitignored docs snapshots (trap 1 in
`docs/automation.md`), with `BUILD_ID`, the CSS chunk name and the
content-hashed **JS** chunk names normalised (trap 2). Result: **21 of 21
prerendered pages byte-identical**, so the standing warning about masking `/`,
`/journal` and `/careers` did not arise — that warning is about raster
comparison, and nothing here needed one.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | passes, no output |
| `npm run typecheck` | passes, no output |
| `npm test` | **170 passed, 8 files** — unchanged; this prompt adds no `lib/domain/` code |
| `npm run build` | succeeds; route table as above |
| prerendered-HTML diff | 21/21 byte-identical against `f9e102b` |
| `npm run test:e2e:local` | **10 passed** (Chromium, Firefox) |
| WebKit | **not run — `podman` is not installed on this machine** (`command -v podman` finds nothing). A known environment gap, reported as one rather than as a pass |

One lint finding was worth keeping rather than suppressing:
`react-hooks/purity` rejected a `Date.now()` in the invitation page's body. The
fix moved the expiry decision into `getInvitationForLink`, which returns
`expired` — the clock is a read of the world, and this layer is where a
request's reads happen.

### What prompt 63 deliberately did not do

| not done | why |
| --- | --- |
| teams, `dynamicAccessControl`, custom roles | not in §5.2 step 8; still out |
| a third tenant role | §11.1 fixes the tenant side at `owner` and `member` |
| `organizationClient()` on the browser | §6.2 — every mutation is a Server Action |
| organisation deletion or renaming | still coupled to the erasure path (§9.2 rule 5) |
| ownership transfer as a first-class flow | `updateMemberRole` exists and is unused. A sole owner cannot leave; the Leave control is **still shown to them** with copy saying an organisation always keeps one owner and to invite another owner first — the honest statement, rather than a transfer UI built to dodge the rule |
| `/[org]` routing, an org switcher, multi-org sessions | the slug is still not in a URL |
| touching sign-up, sign-in or any settled auth screen | settled surfaces |
| widening `proxy.ts`'s matcher | §8.1 |
| adding `/account` or `/invitation/[id]` to BotID's protected paths | no public unauthenticated write path was added, and a path in that list is a two-file commitment (§7.3) |
| any staff bypass into tenant data | §11, explicitly |
| an email preview script | none exists; §2 says do not reference one |

## One membership row per `(organisation, user)`, prompt 64

Implemented on 12 Aug 2026. **No new feature** — §5.2's sequence is exhausted
(steps 1–14 committed, step 8's invitations closed by prompt 63), and this
closes the open question the step 8 and step 9 records both left standing rather
than inventing a step 15.

### What the exposure actually was

Stated honestly, because the two earlier notes overstated how reachable it is:
**this was a race, not an ordinary path.** Every single-threaded sequence was
already refused in the application layer. Verified this session by reading
`node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs`
(Better Auth 1.6.26), cited by line:

- `createInvitation` — the handler begins at **line 37**. At **line 127** it
  throws `USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION` when the invitee is
  already a member, and at **line 132** it refuses a second pending invitation
  unless `resend` or `cancelPendingInvitationsOnReInvite` is set. The latter
  **is** set here (prompt 63), so line 132 does not fire and **line 163**
  cancels the prior pending invitations instead.
- `acceptInvitation` — endpoint at **line 246**, handler from **line 264**. It
  checks, in order: status and expiry (**268**), the recipient address
  (**269**), verified email (**270–274**), the organisation's existence
  (**278**) and the membership limit (**279**). It then flips the invitation
  with `updateInvitation({ …, fromStatus: "pending" })` (**285–289**) and
  creates the member row inside `runWithTransaction` (**291**).
  **It performs no already-a-member check at all.** `fromStatus` guards one
  invitation being accepted twice; it does not guard two invitations being
  accepted once each.

So a duplicate needed concurrency — two `createInvitation` calls interleaving
around the pending read, or an accept interleaving with an invite. The argument
for fixing it was never likelihood: `getMembership()` in
`lib/db/organization-queries.ts` is documented in its own comment as "**This is
the tenant check**", it reads one row with `.limit(1)` and no `ORDER BY`, and
the role it reports was therefore arbitrary under a duplicate. That invariant
belongs in the schema rather than in three call sites that happen to agree.

### The pre-check, run before generating anything

A unique index cannot be created over existing duplicates, so the live table was
read first over the **direct** connection (`DATABASE_URL_UNPOOLED`), grouping
`member` by the pair. Counts and ids only — no address, no name, no
organisation name (§8.3 rule 2). Exact output:

```
member rows: 1
duplicate (organization_id, user_id) pairs: 0
```

No duplicates, so no dedupe decision arose. Had any existed the work would have
stopped there: choosing which of two membership rows survives is a decision
about someone's role in a tenant and is the user's, not a migration written on
our own judgement (§12 rule 9).

### The constraint, and the migration

`lib/db/auth-schema.ts`'s `member` gained, in the same third-argument array as
its two existing hand-added `index()` calls:

```ts
uniqueIndex("member_organizationId_userId_unique").on(
  table.organizationId,
  table.userId,
),
```

`uniqueIndex` is imported from `drizzle-orm/pg-core` alongside `index`. It
carries a comment marking it hand-added, because
`scripts/generate-auth-schema.py` does not emit it and a regeneration would drop
it silently otherwise — the comment is what makes the next merge notice.

`npm run db:generate` wrote **`lib/db/migrations/0009_groovy_virginia_dare.sql`**,
whose entire contents are:

```sql
CREATE UNIQUE INDEX "member_organizationId_userId_unique" ON "member" USING btree ("organization_id","user_id");
```

`npm run db:migrate` ended `[✓] migrations applied successfully!`. Nothing was
hand-written and `drizzle-kit push` was not used (§9).

### The application-layer refusal

`app/invitation/[id]/actions.ts` gained one check in stage **d**, after the
recipient comparison and before the plugin call: an accept reads the caller's
membership of `invitation.organizationId` through the existing `getMembership()`
and returns `MEMBERSHIP_ERRORS.ALREADY_JOINED` if one exists. A typed result,
never a throw (§10 rule 2); nothing personal logged; declining is unchanged.

`ALREADY_JOINED` — "You are already a member of this organisation." — is new in
`lib/validation/organization.ts`. It is second person, unlike the existing
`ALREADY_MEMBER`, which is shown to an owner inviting someone else; this one is
read by the invitee on their own link.

**Both, not either.** The index closes the race; the check closes the ordinary
path, so a second click reads as a sentence rather than a caught unique
violation falling through to `GENERIC`.

### Prerender impact and verification, prompt 64

**Expected none, and verified rather than assumed** (§8.1). `npm run build`'s
route table is unchanged — `/invitation/[id]` is still `ƒ`, the marketing routes
still `○`/`●`, 30 static pages generated.

**The parent-commit worktree comparison was confounded, and the two-build method
replaced it.** A `git worktree` at `127fa8f` with hardlinked `node_modules`
built **one 74 KB CSS chunk**, where the main tree built **11 KB + 407 KB**, and
20 of 21 pages differed. That is not this change: the main tree carries
gitignored files a fresh worktree does not — notably the `drizzle-docs` skill's
484-file, ~4.5 MB markdown snapshot under `.claude/skills/` — and Tailwind v4
scans them, so the two trees do not generate the same stylesheet at all. Any
future prerender diff on this repository hits the same wall while that snapshot
is present. `docs/automation.md`'s fallback was used instead: **build the
working tree twice**, once with the change stashed, in an identical environment.

Result, with only `.next/BUILD_ID` and the CSS chunk name normalised:
**0 of 21 pages differed.** JS chunk names were deliberately *not* normalised
and matched anyway, so no bundle moved either — which is the expected outcome
for a change touching one schema file, one migration, one action and one
validation constant.

### Checks run, prompt 64

- `npm run lint` — exit 0, no output beyond npm's notice lines.
- `npm run typecheck` — exit 0, no diagnostics.
- `npm test` — `Test Files 8 passed (8)`, `Tests 170 passed (170)`. The domain
  suite is untouched by this change and stayed green.
- `npm run build` — compiled in 12.3 s, 30/30 static pages, route table above.
- `npm run test:e2e:local` — `10 passed (28.8s)`, Chromium and Firefox.
- **`npm run test:e2e:webkit` did not run: `which podman` returns "podman not
  found".** Stated plainly rather than omitted; the previous commit had the same
  gap.

### Secrets and data, prompt 64

No new environment variable and no `NEXT_PUBLIC_*`. The migration and the
pre-check used `DATABASE_URL_UNPOOLED` through `dotenv -e .env.local`; the app
keeps the pooled `DATABASE_URL` (§7.3). No personal data stored, transmitted or
logged — the pre-check printed counts only, and it found none to print. No
email, blob or AI provider involved.

### What prompt 64 deliberately did not do

| not done | why |
| --- | --- |
| a step 15, or any new product feature | §5.2 is exhausted and "do not overbuild" is explicit |
| a unique constraint anywhere else in the auth schema | this one is the tenant check; speculative constraints on a generated schema are how it drifts |
| regenerating `auth-schema.ts` | the generated output would not contain this index; regeneration is its own change |
| a dedupe or merge migration | the pre-check found no duplicates, and the decision would have been the user's |
| touching `getMembership()`'s `.limit(1)` | with the index it is exact. Changing it would hide the invariant rather than assert it |
| a members-UI or organisation-surface change | prompt 63 shipped those and they are unaffected |

## Factor-mapping surface, prompt 65

Implemented on 12 Aug 2026. **No new §5.2 build step** — the ordered sequence
is exhausted. This closes an existing product loop instead: `/activity` already
told a tenant when committed records were outside the calculated total, while
`DEFAULT_FACTOR_MAPPINGS` deliberately covered only the known-safe starting
pairs and no reporter could override or fill a missing `(category, unit)`
mapping.

### What was verified before building

- `app/_components/activity/emissions-summary.tsx` rendered an incomplete-total
  line, but its copy over-claimed: `countUncalculatedRecords()` counts every
  committed record with no `activity_emission` row, not only records with no
  mapped factor.
- `lib/domain/defra.ts` seeds 11 default mappings and explicitly leaves the
  rest unmapped rather than guessing. A wrong default would be invisible; an
  unmapped pair is a legible gap.
- `activity_factor_mapping.created_by` already existed for the provenance line,
  but all rows were seeded defaults because there was no user-facing writer.
- `hasAnyFactorMapping()` had no caller, and its docblock claimed a surface used
  it. Prompt 65 corrected the docblock rather than leaving the prediction in
  place (§12 rule 8).

### Decisions

All five are judgements, not measurements.

| decision | result |
| --- | --- |
| Owner-only writes | Any member may read `/activity/mappings`; `setFactorMapping` refuses `membership.role !== "owner"` at stage d. Aetherfield `staff` and `admin` grant nothing on the tenant side. |
| Recalculate inline | After a mapping write, the action calls `recalculateOrganization(organizationId, null)` and revalidates `/activity` and `/activity/mappings`, so a stale disclosure figure is not left looking current. |
| Set and change only | There is no unmap control. `activity_factor_mapping_key` is a plain unique index, so the upsert clears `deleted_at` when changing a soft-deleted row. |
| Server-rendered search | The picker uses `?category=&unit=&q=` and a Server Component query, not a client data-fetching path over thousands of factors. |
| Activity sub-flow | `/activity/mappings` is not a top-level workspace tab. It is linked from the Activity coverage line and sits under the existing `/activity/:path*` proxy matcher, which did not widen. |

### Domain and query layer

`lib/domain/emissions.ts` now exports `factorEligibility()` and
`admissibleFactorUnits()`. They are pure, tested, and built from the same
`result_unit` check and `convertQuantity()` path that `calculateRecordEmission`
uses, so the picker cannot offer a factor the engine would refuse for unit or
result-unit reasons.

`lib/db/emission-queries.ts` gained the mapping-surface queries:

- `listFactorCoverage(organizationId)` groups committed, non-deleted activity
  records by `(category, unit)` and left-joins the organisation's live mapping.
  Pairs with no records are deliberately absent.
- `searchFactorsForPair(organizationId, unit, query)` searches visible,
  non-deleted, non-superseded factors, restricted to `result_unit = 'kg_co2e'`
  and `activity_unit in admissibleFactorUnits(unit)`. The result limit is 50.
- `getVisibleFactor(organizationId, factorId)` re-resolves a submitted factor id
  under the tenant's visibility. A foreign private factor and a nonexistent id
  both return `null`.
- `setFactorMapping()` upserts on
  `(organization_id, category, unit)`, setting `factor_id`, `created_by`,
  `updated_at` and `deleted_at = null`.

The query module also had one interrupted-edit artefact removed: a NUL byte in
`buildFactorResolver()`'s pair key. A Perl NUL scan returned no output after
the fix.

### Action and surface

`app/activity/actions.ts` gained `setFactorMapping(input)`, following the
existing lettered action order: no BotID on an authenticated path, membership
and user-id rate limit, shared Zod parse, owner authorisation, factor
re-resolution and eligibility check, upsert, recalculation, revalidation, typed
result. It adds `checkFactorMappingLimit(userId)`, 30 changes per hour, because
the write can recalculate the whole organisation and should not share the import
commit bucket.

`lib/validation/activity.ts` owns the shared `factorMappingSchema`, result type
and user-facing error constants. The category and unit parse against the
existing vocabularies; `factorId` is a UUID shape check only. Existence,
visibility and eligibility remain server-side checks.

`app/activity/mappings/page.tsx` is a Server Component gated by
`requireOrganization("/activity/mappings")`. It lists the committed pairs in
use, unmapped first, shows mapped factor provenance and OGL attribution from
the factor set rows, and renders the search form for the selected pair.
`app/_components/activity/factor-picker.tsx` is the only client leaf: it takes
server-read rows, runs the courtesy Zod check, calls the action, announces the
typed result, and refreshes the route on success. It imports no server-only
module.

`app/_components/activity/emissions-summary.tsx` now says records have "no
calculated emission yet" rather than "no emission factor mapped", and links to
`/activity/mappings`.

### Prerender impact and verification, prompt 65

**Expected none, and verified rather than assumed.** The new route is dynamic
(`ƒ /activity/mappings`) and the marketing routes remain static/SSG. The normal
`npm run build` generated 31 static pages after the change; the base tree, with
the change stashed, generated 30 because the new dynamic route did not exist.

The two-build method from prompt 64 was used again in the same working tree.
After normalising the embedded build id and generated `/_next/static/chunks/*`
JS/CSS filenames in the server app HTML, the comparison found:

```
base_html=21
changed_html=21
common_html=21
normalized_diffs=none
```

### Checks run, prompt 65

- `npm run lint` — exit 0, no diagnostics beyond npm notice lines.
- `npm run typecheck` — exit 0, `tsc --noEmit`.
- `npm test` — `Test Files 8 passed (8)`, `Tests 178 passed (178)`.
- `npm run build` — exit 0, Next 16.2.12 Turbopack, compiled successfully,
  31/31 static pages, route table includes `ƒ /activity/mappings`.
- `npm run test:e2e:local` — failed before tests ran:
  `Error: Process from config.webServer was not able to start. Exit code: 1`.
  Starting the configured server directly showed why: `next start -p 3100`
  reported `Could not find a production build in the '.next' directory` because
  the current `next build` output contains no `.next/BUILD_ID`. No tests ran.
- `node_modules/.bin/next build --webpack --debug` — also failed, but Next did
  not print a specific webpack diagnostic beyond `Build failed because of
  webpack errors`. It was used only to diagnose the E2E startup blocker, not as
  a replacement for `npm run build`.
- `npm run test:e2e:webkit` — did not run: the script reports `Podman is
  required for WebKit on Arch Linux. Install it with: sudo pacman -S --needed
  podman`. `which podman` returned `podman not found`.

### Secrets and data, prompt 65

No new environment variable and no `NEXT_PUBLIC_*`. No new provider, email,
blob or AI call. The change stores one new fact in an existing column: the user
id that chose a factor for a pair. Nothing is logged on any path.

### What prompt 65 deliberately did not do

| not done | why |
| --- | --- |
| a step 15 | §5.2 remains the ordered plan; this is a new approved feature after the sequence |
| unmap / clear | what a removed mapping means needs a separate data-model decision |
| custom customer-supplied factors | needs provenance, licence and validation for tenant-owned factor sets |
| AI factor matching | deterministic surface first; §5.3's model suggestion remains unbuilt |
| per-record factor overrides | the data model maps by `(category, unit)` |
| E2E coverage for this surface | not part of the approved candidate; the existing E2E command is currently blocked before tests |

## Custom factor sets, prompt 66

> **Seven parts of this section were corrected by prompt 67 on 12 Aug 2026 and
> are marked inline below.** The set is no longer found-or-created from the
> typed source and version, `retireTenantFactor` no longer returns a bare
> boolean, `source_row_id` no longer hashes the set's columns, and the client
> leaf no longer renders the row list. Read
> [Custom factor set corrections, prompt 67](#custom-factor-set-corrections-prompt-67)
> for what is current.

Implemented on 12 Aug 2026. **No new §5.2 build step** — the ordered sequence
is exhausted. This closes prompt 65's named non-goal: an owner can now add a
tenant-owned, customer-supplied factor with provenance when the correct supplier
or contractual factor is not present in the published shared data.

### Scope and data model

Manual single-factor entry ships first. Bulk factor-set CSV import remains out
of scope because it needs a parser, staging surface and rollback story.

The existing nullable reference-data design is used rather than forked:

- `emission_factor_set.organization_id = null` and
  `emission_factor.organization_id = null` still mean published shared data.
- A non-null organisation id means a tenant-owned factor set and row.
- `emission_factor_set_organization_key (organization_id, source,
  dataset_version)` is the set identity for customer-supplied data.
- `emission_factor_set_row_key (set_id, source_row_id)` is reused as the
  duplicate-submission backstop for factor rows.

One schema migration was generated and applied:

```
ALTER TABLE "emission_factor_set" ALTER COLUMN "licence_url" DROP NOT NULL;
ALTER TABLE "emission_factor_set" ALTER COLUMN "source_url" DROP NOT NULL;
ALTER TABLE "emission_factor_set" ADD COLUMN "source_reference" text;
```

The nullability change is required because private or contractual customer
factor sources may have no public licence URL or source URL, and the product
must store a real internal reference rather than inventing one. Published DESNZ
rows continue to carry both URLs.

### Validation and precision

`lib/validation/emissions.ts` now owns `customFactorSetSchema`,
`customFactorSchema`, `createCustomFactorSchema` and
`retireCustomFactorSchema`. They are shared by the `/activity/factors` client
leaf and by the Server Actions.

**Corrected by prompt 67.** `customFactorSetSchema` no longer exists:
`newFactorSetSchema`, `existingFactorSetSchema` and `factorSetChoiceSchema`
replace it, and the two cross-field rules moved onto `createCustomFactorSchema`'s
wrapper.

Important rules enforced before any write:

- factor values are positive decimal strings bounded to 5 integer digits and
  17 decimal places, preserving the measured `numeric(24,17)` contract;
- `result_unit` is not accepted from the browser and is written server-side as
  `kg_co2e`;
- scope 3 category is required only for scope 3;
- scope 2 method is required only for scope 2;
- CH4 variant is required only for CH4;
- effective end date cannot precede effective start date — **prompt 67: only
  when a new set is being created**, since an existing set does not restate it;
- a source URL or internal source reference is required — **same guard**;
- strings are trimmed and bounded, with empty required strings rejected.

The value precision remains **measured** from step 10's DEFRA seed. The
manual-entry scope is a **judgement**: it admits customer-supplied kgCO2e rows
only, leaving `kwh` result-unit factors and market-based scope 2 certificate
capture for a later decision.

### Query layer and tenant predicates

All SQL stays in `lib/db/emission-queries.ts`.

Added helpers:

- `listTenantFactorSets(organizationId)` and
  `listTenantFactors(organizationId)` read only rows with
  `organization_id = $1`;
- `createTenantFactor()` wraps set find-or-create and factor insertion in one
  Drizzle transaction — **corrected by prompt 67: there is no find-or-create.
  The set is the submitter's explicit choice and the function returns a typed
  outcome, not a bare `{ factorId }`**;
- `retireTenantFactor()` soft-retires only a factor row whose
  `organization_id = $1` — **corrected by prompt 67: it returns the count of
  active mappings it unmapped, not a boolean**;
- `searchFactorsForPair()` and `listFactorCoverage()` now include
  `customerSupplied` and set provenance, so UI attribution is data-driven.

Visible reference-data reads still use the approved predicate:

```
organization_id is null or organization_id = $1
```

Tenant-owned writes use strict equality:

```
organization_id = $1
```

The deterministic tenant-owned `source_row_id` is a SHA-256 hash over the
organisation id, normalised set identity and factor identity, prefixed with
`custom:`. **Corrected by prompt 67: it hashes the resolved `set_id` rather than
the typed source and version**, which do not exist on a submission that chooses
an existing set. It is stable enough for duplicate form submissions and includes the
tenant id, so it is not a cross-tenant identifier.

### Actions and surface

`app/activity/actions.ts` gained `createCustomFactor(input)` and
`retireCustomFactor(input)`. Both follow the existing authenticated action
order: BotID absent by design, `getCurrentMembership()` with role, user-id rate
limit, shared Zod parse, owner-only authorisation, tenant-predicated write
through `lib/db/`, no email, and revalidation of `/activity/factors`,
`/activity/mappings` and `/activity`.

The actions reuse `checkFactorMappingLimit(userId)`. That is a judgement: both
flows are owner-only factor-control writes, both can affect disclosure inputs,
and creating a row is lighter than prompt 65's mapping write because it does not
recalculate until the owner explicitly maps the factor.

`/activity/factors` is a new dynamic authenticated route gated by
`requireOrganization("/activity/factors")`. It lists tenant-owned factor sets
and factor rows, renders a compact manual-entry form, and links back to
`/activity/mappings` to use the new row. The only client leaf is
`app/_components/activity/custom-factor-form.tsx`; it performs courtesy
validation, pending state, focus management, result announcement and retire
clicks. It does no data fetching and exports no constants or types.

**Corrected by prompt 67.** The leaf ran to 619 lines and included the whole row
table, against its own brief that it owns "only pending state, courtesy
validation, focus management and the announced result". The rows are now
rendered by the Server Component, and
retirement moved to `app/_components/activity/retire-factor-button.tsx`.

`/activity/mappings` now links to `/activity/factors` and labels tenant-owned
search results or current mappings as customer-supplied. Attribution no longer
assumes DEFRA/OGL when a visible set has no licence URL; it renders the set's
licence and internal source reference instead. `/activity` gets a secondary
link near the intro rather than a new top-level `WorkspaceNav` item.

### Prerender impact and verification, prompt 66

**Expected none, and verified rather than assumed.** The new route is dynamic
(`ƒ /activity/factors`), `/activity` and `/activity/mappings` were already
dynamic, and the marketing routes remain static/SSG.

The first two isolated scratch comparisons failed before producing a diff:
scratch builds without the working tree's font cache could not fetch Google
Fonts under the restricted network, and a `/tmp` run that copied `node_modules`
hit disk quota. A symlinked dependency run was rejected by Turbopack because
`node_modules` pointed outside the project root. The successful comparison used
the documented repository-local scratch method with hard-linked `node_modules`,
excluded `.agents` and `.claude`, pinned one
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and normalised build id plus generated
JS/CSS chunk names while stripping RSC flight scripts:

```
base_html=21
impl_html=21
common_html=21
only_base=0
only_impl=0
diff_html=0
```

### Checks run, prompt 66

- `npm run db:generate` — generated
  `lib/db/migrations/0010_wandering_the_captain.sql`; Drizzle reported 23
  tables and the three SQL statements above.
- `npm run db:migrate` — applied successfully. `pg-connection-string` emitted
  the existing SSL warning that `sslmode=prefer`, `require` and `verify-ca` are
  currently aliases for `verify-full` and will change semantics in a future
  major version.
- `npm run lint` — exit 0, no diagnostics beyond npm notice lines.
- `npm run typecheck` — exit 0, `tsc --noEmit`.
- `npm test` — `Test Files 8 passed (8)`, `Tests 178 passed (178)`.
- `npm run build` — exit 0, Next 16.2.12 Turbopack, compiled successfully,
  generated 32/32 static pages, route table includes `ƒ /activity/factors`.
- prerender diff — `diff_html=0` across 21 shared prerendered HTML files.
- `npm run test:e2e:local` — failed before tests ran:
  `Error: Process from config.webServer was not able to start. Exit code: 1`.
  **This did not reproduce at prompt 67**, which ran the same command to
  `10 passed (29.4s)`. The failure was environmental, not a harness defect, and
  the "E2E harness repair" non-goal carried by prompts 66 and 67 has no repair
  to do beyond WebKit's missing `podman`.
- `npm run test:e2e:webkit` — not run because `podman` is not installed.
  `scripts/playwright-webkit.sh` says: `Podman is required for WebKit on Arch
  Linux. Install it with: sudo pacman -S --needed podman`.

### Secrets and data, prompt 66

No new environment variables and no `NEXT_PUBLIC_*`. The actions read existing
`DATABASE_URL` through `lib/db/client.ts` and reuse the existing Upstash
limiter path (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). No email, Blob, AI or
third-party model call is added.

The new data is customer-supplied factor provenance and numeric factor values.
Treat it as tenant commercial data: no request path logs it, no provider
receives it, and every read/write is tenant-filtered. A custom factor becomes a
disclosure input only after the owner maps it and recalculates through the
existing prompt 65 flow.

### What prompt 66 deliberately did not do

| not done | why |
| --- | --- |
| bulk factor-set CSV import | needs its own parser, staging UI and rollback |
| automatic mapping to the new factor | prompt 65's explicit mapping flow remains the recalculation point |
| editing used factor rows | restatement semantics are separate; retire and add a replacement |
| market-based scope 2 evidence capture | requires REC/GO evidence and residual-mix fallback |
| `kwh` result-unit custom factors | this prompt only admits factors that directly compute kgCO2e |
| AI factor matching | no model belongs in this deterministic data-entry flow |
| top-level workspace navigation | this is an Activity sub-flow |
| E2E harness repair | the existing local runner still fails before tests start |

## Custom factor set corrections, prompt 67

Implemented on 12 Aug 2026. **No new §5.2 build step and no new product
surface** — a correction pass on prompt 66, whose review found seven defects.
One of them wrote wrong provenance into disclosure evidence, which is why
nothing further was built on `/activity/factors` before it landed.

### The seven findings, and what each became

| # | finding | fix |
| --- | --- | --- |
| 1 | set metadata silently discarded after the first row | the set became an explicit choice; see below |
| 2 | retiring gave no in-use signal | the row states its mapping count and retirement is armed, confirmed and announced |
| 3 | retired rows still counted in `listTenantFactorSets` | `and deleted_at is null` added, matching `listFactorSets` |
| 4 | non-owners saw the whole form | `membership.role` read on the page; presentation only |
| 5 | `<dt>`/`<dd>` with no `<dl>` ancestor in `Detail` | the set-detail grid is a `<dl>` |
| 6 | `gas_basis` hard-coded `combined_co2e` | derived from the chosen gas |
| 7 | the client leaf rendered the factor list | rows moved to the Server Component |

### Finding 1, which is the load-bearing one

`createTenantFactor` inserted the set with `onConflictDoNothing` and re-selected
it, so the second and every later row under one `(source, dataset_version)`
threw away the licence, effective range, source URL, reference and notes the
form had just collected. The owner saw "Customer-supplied factor saved" and no
indication. That licence is rendered as disclosure evidence by `reportSections`'
provenance notes, on `/dashboard` and in `EmissionsSummary`, so a corrected
licence never landed and a wrong one persisted.

**The fix is that the set is chosen, not inferred.** `createCustomFactorSchema`'s
`set` is a `z.discriminatedUnion("mode", …)` over `newFactorSetSchema` and
`existingFactorSetSchema`, and the form's metadata fields appear only for
`mode: "new"`. Validating resubmitted metadata against the stored set was
rejected as the alternative: it makes the owner retype it on every row and turns
a harmless repeat into an error.

Both union members are **plain object schemas**, because `z.discriminatedUnion`
requires it — the two cross-field rules that belonged to the set
(`effectiveTo` not before `effectiveFrom`; a source URL or an internal
reference) moved to a `superRefine` on the wrapping object, guarded by
`set.mode === "new"` and emitting two-segment `["set", …]` paths so the existing
field-error mapping in both the action and the leaf is unchanged.

### What the query layer now answers

`createTenantFactor` returns a typed outcome rather than throwing for an
expected refusal:

```
{ ok: true, factorId }
| { ok: false, reason: "set_exists" }
| { ok: false, reason: "set_not_found" }
| { ok: false, reason: "gas_basis_mismatch", setGasBasis }
```

- **`mode: "existing"`** re-reads the set under `id = $1 and organization_id =
  $2 and deleted_at is null`. Missing, retired and foreign are one
  indistinguishable `set_not_found` — a submitted set id is a claim, not a
  capability, exactly as `getVisibleFactor` treats a foreign factor id.
- **`mode: "new"`** inserts with the existing `onConflictDoNothing` target and
  predicate and takes the `returning()` row. Nothing inserted means the set
  exists, which is `set_exists` — and the race where a concurrent submission
  created it a moment earlier gets the same answer, so two submissions cannot
  diverge.
- **`gas_basis` is derived, not asked**: `co2e` writes `combined_co2e`, every
  other gas writes `per_gas`. No new form field appeared. A set holds one basis
  (the column is per-set), so a row of the other kind into an existing set is
  `gas_basis_mismatch` rather than a mislabelled row. Making the basis per-row
  is a schema change and belongs to whoever needs it.

`retireTenantFactor` returns `{ retired: false }` or
`{ retired: true, mappingCount }`, counting the active
`activity_factor_mapping` rows **inside the same transaction as the update**, so
the announced number is the number that was true at the write. The mapping rows
are left in place — not soft-deleted, not repointed. The pair degrades to
unmapped, which the coverage surface already renders as a visible gap, and the
historical `activity_emission` rows stay re-derivable.

`listTenantFactors` gained `mappingCount` as one correlated subquery, not an
N+1. `listTenantFactorSets` gained `gasBasis` and `deletedAt`, so a retired set
is not offered as a target for a new row.

**No schema change and no migration.** `npm run db:generate` reported
`No schema changes, nothing to migrate`.

### Actions

Stage order, typed results and the silent-log rule are unchanged; only stage e
moved. `createCustomFactor` maps the three refusals onto field errors —
`set.datasetVersion` for `set_exists`, `set.setId` for `set_not_found`,
`factor.gas` for `gas_basis_mismatch`, with the copy chosen from the set's own
basis. A thrown error from `createTenantFactor` is now a bug and keeps the
generic failure.

`retireCustomFactor` returns `RetireCustomFactorResult` — a sibling of
`SubmitResult` carrying `mappingCount` on success, since it is the only success
in phase two with a payload. Still a typed result, never a thrown string
(§10 rule 2). Nothing is logged on any path.

### Surface

`app/activity/factors/page.tsx` reads `membership.role` and renders the factor
rows itself: label, scope, activity unit, gas, value, region, state and the
mapping count. The set-detail grid is a `<dl>`, and the set rows now show the
set's gas basis and an **active** row count.

Two client leaves, both component-only:

- `custom-factor-form.tsx` — the set selector, the metadata fields for a new set
  only, the chosen set's provenance and basis otherwise, courtesy validation
  with the shared schema, pending state, focus management, announced result;
- `retire-factor-button.tsx` — arm, cancel, confirm, pending, announce. The arm
  state is **announced, not only styled**: it names how many mapped pairs the
  retirement will leave unmapped. No `window.confirm` and no dialog — a browser
  modal blocks the page and this codebase has no confirm primitive.

A member sees the sets and rows read-only, with one line of copy where the form
was. The action's owner check is untouched; this is presentation, and §11.2
rule 2 says so.

### Tests, prompt 67

**No test was added, and the Vitest scope was not widened.** `vitest.config.mts`
includes `lib/domain/**/*.test.ts` only, and there is no precedent in this
repository for testing `lib/validation/` — all eight existing test files are
under `lib/domain/`. The prompt asked for that to be checked and said so rather
than widened, which is what happened. The discriminated union and its guarded
cross-field rules are pure and would be testable; adding them means changing the
scope that §2 deliberately pins to the disclosure-bearing domain layer, and that
is its own decision.

### Prerender impact and verification, prompt 67

**Expected none, and verified rather than assumed.** The route table is
unchanged from prompt 66's, `/activity/factors` is still `ƒ`, and no marketing
route was touched. The two-build comparison used the same repository-local
scratch method — hard-linked `node_modules`, `.agents` and `.claude` excluded
from both sides, one pinned `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, build id and
both generated chunk patterns normalised, RSC flight scripts stripped:

```
base_html=21
impl_html=21
only_base=0
only_impl=0
diff_html=0
```

The CSS chunk grew from 68,069 to 68,208 bytes — 139 bytes of new utilities for
the reworked page and the two leaves. It is normalised out of the HTML
comparison and changes no prerendered markup.

### Checks run, prompt 67

- `npm run lint` — exit 0, no diagnostics beyond npm notice lines.
- `npm run typecheck` — exit 0, `tsc --noEmit`.
- `npm test` — `Test Files 8 passed (8)`, `Tests 178 passed (178)`.
- `npm run db:generate` — `No schema changes, nothing to migrate`. Run only to
  confirm nothing was pending; nothing was applied.
- `npm run build` — exit 0, compiled in 9.2s, `32/32` static pages, route table
  unchanged from prompt 66's.
- prerender diff — `diff_html=0` across 21 shared prerendered HTML files.
- `npm run test:e2e:local` — `10 passed (29.4s)` across Chromium and Firefox.
  Prompt 66 recorded this failing before tests started; it did not reproduce.
- `npm run test:e2e:webkit` — not run: `podman` is not installed
  (`command -v podman` returns nothing), and `scripts/playwright-webkit.sh`
  requires it on Arch Linux.

### Secrets and data, prompt 67

No new environment variables and no `NEXT_PUBLIC_*`. Reads existing
`DATABASE_URL` through `lib/db/client.ts` and the existing Upstash limiter
(`KV_REST_API_URL` / `KV_REST_API_TOKEN`). No email, Blob, AI or third-party
model call. The same tenant commercial data as prompt 66 is stored and read;
nothing new is collected and nothing is logged. The mapping count returned on
retirement is the organisation's own data and names no pair and no factor of
another tenant.

### What prompt 67 deliberately did not do

| not done | why |
| --- | --- |
| bulk factor-set CSV import | unchanged from prompt 66 — needs a parser, staging surface and rollback |
| editing a stored set's metadata after creation | a real gap this narrows but does not close; a set whose licence changes may need superseding rather than editing |
| retiring a whole set from the UI | the query layer already refuses to add rows to a retired set; the button needs the same in-use accounting per set |
| repointing or soft-deleting mappings on retirement | the visible gap is the correct failure |
| per-row `gas_basis` | a schema change |
| date-based factor selection by `effective_from` / `effective_to` | **no longer deferred — built by prompt 68**, below. This row read "not built for published sets either; its own prompt" until then, and is corrected rather than left standing (AGENTS.md §12 rule 8) |
| a `window.confirm` or a modal | a browser modal blocks the page |
| widening the Vitest scope to `lib/validation/` | no precedent; see "Tests, prompt 67" |

## Date-effective factor selection, prompt 68

Implemented on 12 Aug 2026. **A factor is now selected by the activity record's
own date**, not by whichever row the tenant's mapping happens to point at.

`lib/db/schema.ts` has stored `effective_from` / `effective_to` on
`emission_factor_set` since step 10, and its docblock has stated the rule since
step 10 — DEFRA publishes the 2026 factors "for use with activity data that
falls entirely or mostly within 2026". Nothing selected on those columns:
`buildFactorResolver` keyed purely on `(category, unit)`. A 2025-dated
`activity_record` was costed at the 2026 factor, silently.

### The decisions, taken with the user before the prompt was written

| question | answer |
| --- | --- |
| a record whose date no visible set covers | **refuse, and surface it** — no figure, counted in a new coverage channel |
| how a mapping travels to another year's set | **follow `source_row_id`** — no schema change, no migration |
| the tie-break when several visible sets cover the date | tenant-owned before published, then `publication_year` desc, then the set's `created_at` desc, then the set's `id` asc |

**Why tenant-owned wins.** A customer supplying a set under its own licence is a
deliberate act, and "published always wins" would make the custom-factor-set
surface (prompt 66) unable to supply a year the published data does not cover.

**Why the tie-break runs to four keys.** It is a total order. A figure that moves
between two runs over unchanged data, for no recorded reason, is the failure this
ordering exists to prevent — so nothing is left to row arrival order.

### Where the rule lives, and why not where the prompt put it

The prompt placed the whole resolver in `lib/db/emission-queries.ts`. The
**decision rule** was moved to a new pure module, `lib/domain/factor-selection.ts`
(`covers`, `preferCandidate`, `selectFactorForDate`), because it decides which
published value multiplies a customer's activity — a disclosure figure — and
AGENTS.md §6.2 requires that layer to be pure and independently testable.
`lib/db/` is neither: it is `server-only`, so it cannot be imported under
Vitest, and `npm test` is scoped to `lib/domain/`. Left in `lib/db/` the
tie-break would have shipped untested.

It is **not** in `lib/domain/emissions.ts`: the engine deliberately has no notion
of a set, a publisher or an organisation, which is what keeps `resolveFactor` a
parameter and keeps §5.3's model seam explicit.

`lib/db/emission-queries.ts` keeps the two things that are about storage —
`listFactorSiblings` (the query) and `buildFactorResolver` (indexing mappings by
pair and siblings by `(source, source_row_id)`, and deciding `no_mapping`).

### The resolution order

1. no mapping for the pair — `no_mapping`, unchanged from step 10;
2. **the mapped row's own set covers the date** — use it, never look further.
   This is the one place a superseded set still calculates: a mapping is a
   deliberate choice and superseding a set does not un-make it;
3. otherwise the mapped row's `(source, source_row_id)` siblings whose window
   contains the date, ordered by the tie-break above;
4. nothing covers it — `out_of_period`. **A refusal, never the nearest year.**

Windows are inclusive at both ends and compared as `YYYY-MM-DD` **strings**; no
`Date` is constructed, for the reason `monthOf` records — parsing would introduce
a timezone into a `date` column that has none.

### The engine

- **`FactorResolver` returns `FactorResolution`**, a tagged union carrying
  `no_mapping` and `out_of_period`, where it returned `FactorInput | null`. The
  resolver's *input* is unchanged: it already received the whole `ActivityInput`,
  which carries `activityDate`.
- **`CoverageReport.outOfPeriodYears`** is the new channel — `{ year,
  recordCount }`, keyed by the record's year because loading that year's set is
  the action, sorted count-descending then by year. `unmatchedPairs` keeps its
  exact shape and meaning: only `no_mapping`, so it still agrees with
  `listFactorCoverage`'s SQL.
- The module docblock now says **five** ways it refuses, not four.
- **`ENGINE_VERSION` is `1.1.0`.** This removes figures for every out-of-period
  record and re-points others at a different year's row, so it moves numbers by
  construction.
- **The NUL separator at the old line 490 is gone**, replaced by the `.` that
  `buildFactorResolver` already used. `lib/domain/emissions.ts` was the only file
  in the repository that `file` reported as `data`, and `grep` returned nothing
  for the whole file — a session grepping the engine got an empty result and a
  wrong conclusion. Confirmed fixed: `file lib/domain/emissions.ts` now reports
  `JavaScript source, Unicode text, UTF-8 text`. **This moved no number.**

### Surfacing it

One SQL expression, `outOfPeriodPredicate`, written once and used by both
surfaces, so the pair list and the coverage line cannot disagree — and mirroring
`buildFactorResolver` stage for stage, including the mapped set's own window
first.

| surface | what it says |
| --- | --- |
| `EmissionsSummary`'s coverage line | how many of the uncalculated records are mapped but outside every loaded set's dates, and that loading that year's set brings them in — `countOutOfPeriodRecords` |
| `/activity/mappings` | a lead paragraph with the organisation-wide count, and a per-pair line on any mapped pair with out-of-period records — `listFactorCoverage.outOfPeriodRecords` |

`listFactorCoverage` answered only "is there a mapping" before this. A mapped
pair whose records all fell outside every published window read as fully covered
while contributing nothing.

**The report evidence was deliberately left alone.** An out-of-period record
already lands in `uncalculatedRecords`, which is honest. Adding a distinct figure
would widen `ReportEvidence` — a stored, versioned snapshot — and would have to
be admitted to `allowedNumberTokens` (`lib/domain/reports.ts`), which is §5.3's
guardrail on the generated narrative. That is a change to what a report *is*, not
a coverage improvement, and it is not what this prompt asked for.

### Measurements

Taken 12 Aug 2026 against the development database over
`DATABASE_URL_UNPOOLED`. **Warm** unless stated; the first query paid Neon's
scale-to-zero cold start (2,848 ms) and the rest ran at ~300 ms.

**1. The seeded windows** — one row, as expected:

| source | dataset_version | publication_year | effective_from | effective_to | organization_id |
| --- | --- | --- | --- | --- | --- |
| DESNZ | 2026 v1.2 | 2026 | 2026-01-01 | 2026-12-31 | null |

**2. The blast radius: zero, and measured rather than assumed.** The development
database holds 1 organisation, 1 user, 11 factor mappings, 7,035 factor rows —
and **0 `activity_record` rows and 0 `activity_emission` rows**. So no stored
figure moves and no total changes anywhere in this environment. The per-
organisation out-of-period query returned no rows because there is no activity
data at all, not because everything is in period.

**3 and 4. The case was produced**, since no organisation had one. A temporary
organisation was created, driven through the real seam
(`recalculateOrganization`), measured, and deleted; the record counts were
confirmed back at baseline afterwards. Five records of 1,000 kWh electricity —
two in 2026, two in 2025, one in 2024 — mapped by `seedDefaultMappings` to the
DESNZ 2026 row `7_400_4000_5_1` at `0.13096`:

| visible sets | 1.0.0 total | 1.1.0 total | 1.1.0 matched | out of period | `{records, written}` |
| --- | --- | --- | --- | --- | --- |
| DESNZ 2026 only | 0.6548 tCO2e (5 of 5) | **0.2619 tCO2e** (2 of 5) | 2 | `2025: 2`, `2024: 1` | `{5, 2}` |
| plus a 2025 set at `0.1` | 0.6548 tCO2e (5 of 5) | **0.4619 tCO2e** (4 of 5) | 4 | `2024: 1` | `{5, 4}` |

The 1.0.0 column is the same pure `aggregate()` run with a resolver that returns
the mapped factor whatever the date — the behaviour this change replaced — not a
remembered number.

**The sibling path was observed**, second row: one run produced emissions against
**two different factor rows**, the 2026 record at the DESNZ row and the 2025
records at the second set's row, and the total is exactly
`2 × 0.13096 + 2 × 0.1 = 0.46192` tonnes. `unmatchedPairs` stayed empty
throughout — an out-of-period record is never reported as an unmapped pair.

**A correction to the prompt's own procedure.** It said
`app/activity/factors/` could create the second set without new seed data. It
cannot create a **sibling**: `createTenantFactor` derives `source_row_id` as
`custom:<sha256>` of the submission, so a row created there never shares
`(source, source_row_id)` with a published row. The second set was therefore
inserted directly, as a second year's seed would produce it. The
`source_row_id` decision is right for the case it was made for — DEFRA
republishing the same row id each year — and a customer-supplied set reaches
records through the tenant's own mapping and its own window instead.

**6. No N+1, measured.** `pg.Pool.prototype.query` was counted around
`recalculateOrganization`: **3 pool-level queries at 5 records and 3 at 205
records.** (The two transactions — `seedDefaultMappings` and `replaceEmissions` —
run on a checked-out client and are outside that count; they are already batched
and neither scales with an extra query per record.) The claim this evidences is
the one that matters: the query count is constant in the record count.

**5. `npm test` — 9 files, 197 tests, all passing** (540 ms). The five existing
`aggregate` tests were updated for the tagged resolver; five new ones cover the
out-of-period channel, and `lib/domain/factor-selection.test.ts` adds fourteen
over the window boundaries and every step of the tie-break, including the same
two candidates in both orders. `emissions.test.ts` itself runs 41.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | 9 files, 197 tests passed |
| `npm run build` | route table unchanged — `/`, `/journal`, `/about`, `/careers`, `/design-system` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| prerendered HTML | **21 files, 21 identical, 0 differ**, two-build method per `docs/automation.md`, normalising only `.next/BUILD_ID` and the CSS chunk name — which was in fact identical on both sides (`00u7jgtk688mf.css`, `3ytlec8_wtxwp.css`) |
| `npm run test:e2e` | chromium + firefox: **10 passed** (27.1 s). **WebKit did not run** — `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux", which is not installed. Not reported as passed |

**Prerender impact: none, verified rather than assumed.** No marketing route
imports anything this touched, and the diff above is the evidence.

**Trust boundary: no new request path.** The entry points are the existing
`recalculate` Server Action and the existing cron route, both already authorised,
rate-limited and tenant-scoped. Every new and widened query keeps
`visibleFactorScope(organizationId)`, and the sibling subquery restates the same
`organization_id is null or organization_id = $1` — a sibling resolved across the
tenant boundary would be a cross-tenant leak into a filed number.

**Secrets and data.** No new environment variable, no `NEXT_PUBLIC_*`, no
provider, no model call. Nothing on any path logs.

### What prompt 68 deliberately did not do

| not done | why |
| --- | --- |
| any schema change or migration | the `source_row_id` decision is what avoids one, and none turned out to be needed |
| per-period mappings — widening `activity_factor_mapping`'s unique key | the rejected option; one choice per pair keeps its meaning across revisions |
| loading a second DEFRA year's factor set | that is data, and its own prompt. This makes a second year *usable*; it does not supply one. **Until one is loaded, any record dated outside 2026 leaves the totals** — the accepted caveat of the "refuse and surface it" decision |
| letting the custom-factor-set surface create a sibling of a published row | it hashes its own `source_row_id`; see the correction above. A real gap, not closed here — **closed by prompt 71**, which adds a declared `(supersedes_source, supersedes_source_row_id)` pair rather than reusing the published row id |
| adding an out-of-period figure to the report evidence | it would widen a stored snapshot and the narrative allowlist; see above |
| AI factor matching | §5.3 sanctions it and does not schedule it; prompt 65 deferred it once already |
| prompt 67's other deferrals — editing a set's metadata, retiring a set from the UI, bulk CSV import | untouched |
| recalculating every organisation | the cron sweep does it on its schedule; a mass recalculation is an operational act |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work, as prompts 63–67 were |

## The DEFRA 2025 factor set, prompt 69

Implemented on 12 Aug 2026. **A second published set is loaded**, so activity
data dated in 2025 is costed instead of refused — closing the accepted caveat
prompt 68 recorded one section above.

Post-sequence work, as prompts 63–68 were. Not a step 15.

**No code outside the seeder changed.** `lib/domain/factor-selection.ts`,
`lib/domain/emissions.ts`, `lib/db/emission-queries.ts` and
`lib/domain/defra.ts` are untouched, `ENGINE_VERSION` stays `1.1.0`, and there
is no schema change and no migration. Prompt 68 built the resolution path for
exactly this case; this prompt exercised it and it needed nothing.

### Obtaining the workbook — discovered, not guessed

`curl` the collection page named in the seeder's `sourceUrl`, read the 2025
edition's page out of it, then read the flat-format asset link out of that. The
prompt's own warning was earned: a guessed `assets.publishing.service.gov.uk`
media path 404s, because the media id is opaque.

| what | value |
| --- | --- |
| collection page | `https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting` → **200** (this is the correction to step 10's WebFetch line, below) |
| edition page | `https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025` → **200** |
| **flat-format workbook** | `https://assets.publishing.service.gov.uk/media/6846b6ea57f3515d9611f0dd/ghg-conversion-factors-2025-flat-format.xlsx` |
| size | **505,634 bytes** |
| SHA-256 | `8bfdb45b81ec4a88e3bdf4584637330f62e6bd09ce1940e654c5d7b7f736de94` |
| methodology report | `https://assets.publishing.service.gov.uk/media/6846b0870392ed9b784c0187/2025-GHG-CF-methodology-paper.pdf`, 1,853,848 bytes |
| retrieved | **12 Aug 2026** — which is what `retrieved_at` records, not the run date |

The workbook is **not committed**, as step 10 decided, and no spreadsheet
dependency was added. The derived CSV is:
`lib/db/seed/defra-2025-factors.csv`, 8,741 lines (header + 8,740 data rows).

The workbook's own front page: **Status Final, Version 1, Year 2025, updated
2025-06-10** (Excel serial 45818). That is where `dataset_version` `2025 v1`
comes from — the same convention that produced `2026 v1.2`.

### The script's two measured constants, re-established against 2025

Neither moved, and both were **read from the 2025 file** rather than assumed.
`scripts/defra-xlsx-to-csv.py` is unchanged — one script, no fork, no new
parameter, because nothing needed parameterising.

| constant | 2026 | 2025, read back | verdict |
| --- | --- | --- | --- |
| sheet name | `Factors by Category` | `Factors by Category` (workbook has two sheets: `Front page`, `Factors by Category`) | unchanged |
| `FIRST_DATA_ROW` | 7, from `_FilterDatabase` = `'Factors by Category'!$A$6:$J$8746` | `_FilterDatabase` = **`'Factors by Category'!$A$6:$J$8746`**, byte-identical | unchanged |
| header row | row 6: `ID, Scope, Level 1…Level 4, Column Text, UOM, GHG/Unit, GHG Conversion Factor 2026` | row 6, same ten columns, last one reading `GHG Conversion Factor 2025` | column order unchanged |
| `SIGNIFICANT_DIGITS` = 12 | 7,007 rows ≤ 10 sig. digits, **none at 11–15**, 28 at 16–17 | see below | **still inside a measured gap** |

**The significant-digit distribution over the 2025 valued rows**, measured the
same way (shortest round-trip decimal of the stored double, digits counted after
normalising):

| sig. digits | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11–15 | 16 | 17 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rows | 747 | 1,277 | 1,000 | 1,246 | 1,861 | 721 | 24 | 56 | 68 | 1 | **0** | 12 | 16 |

**7,001 at ≤ 10, nothing at 11–15, 28 at 16–17** — the same shape as 2026, so
rounding to 12 collapses exactly the 28 float-noise rows and leaves the rest
bit-identical. `--report`'s `noise rounded` count agrees: **28**.

### `--report`, beside 2026's

Produced by
`python3 scripts/defra-xlsx-to-csv.py <workbook> lib/db/seed/defra-2025-factors.csv --report`.

| measurement | 2025 | 2026 |
| --- | --- | --- |
| data rows in the flat sheet | **8,740** | 8,740 |
| Scope 1 / Scope 2 / Scope 3 / Outside of Scopes | **3,059 / 392 / 5,231 / 58** | 3,059 / 392 / 5,231 / 58 |
| rows carrying a published value | **7,029** | 7,035 |
| rows with **no** value | **1,711** | 1,705 |
| rows whose value was Excel float noise | **28** | 28 |
| rows seeded | **7,029** | 7,035 |

The per-scope counts are identical between the two years; the six-row difference
is entirely in which rows carry a number.

### Sibling continuity — the measurement the whole prompt rested on

Prompt 68 resolves a mapped pair into another year through
`(source, source_row_id)` siblings, on the **assumption** that DEFRA reuses the
same row id for the same activity across publication years. It stated the
assumption and did not test it. Tested here, from the two committed CSVs:

| measurement | result |
| --- | --- |
| ids present in both files | **8,740 — every one** |
| ids in 2026 only | **0** |
| ids in 2025 only | **0** |
| the eleven `DEFAULT_FACTOR_MAPPINGS` targets (nine distinct ids) | **all nine present in 2025** |
| shared ids whose `level_1`–`level_4` / `uom` / `ghg_unit` differ | 1,962 of 8,740 — **all label rewordings, no reassignment** |

**The dangerous case — an id reused for a different activity — does not occur.**
Every one of the 1,962 differences is one of eight relabelings, and each keeps
the same activity:

| field | rows | 2025 → 2026 |
| --- | --- | --- |
| `level_2` | 736 | `HGV (all diesel)` → `HGV (non-refrigerated, all diesel)` |
| `level_2` | 480 | `HGV refrigerated (all diesel)` → `HGV (refrigerated, all diesel)` |
| `level_2` | 256 | `HGVs refrigerated (all diesel)` → `HGV (refrigerated, all diesel)` |
| `level_2` | 128 | `Managed HGV (all diesel)` → `Managed HGV (non-refrigerated, all diesel)` |
| `level_2` | 128 | `Managed HGV refrigerated (all diesel)` → `Managed HGV (refrigerated, all diesel)` |
| `level_2` | 96 + 96 | the same two, on the `WTT- HGV` families |
| `level_3` | 720 | `All rigids` / `All artics` / `All HGVs` → `Average [non-]refrigerated rigids` / `artics` / `HGVs` |
| `column_text` | 42 | `Incineration with Energy Recovery` → `Combustion` |

`scope`, `level_1`, `level_4`, `uom` and `ghg_unit` differ on **zero** rows.
DEFRA clarified the HGV refrigeration wording in 2026 and left the ids alone,
which is exactly the behaviour prompt 68's design needs.

One mapping target is in that set: `27_304_3140_14_1` (freight, tkm) reads
`HGV (all diesel)` / `All HGVs` in 2025 and `HGV (non-refrigerated, all diesel)`
/ `Average non-refrigerated HGVs` in 2026. Same activity, clearer label.

### The publisher's vocabulary did not change

Compared as distinct-value sets across the two CSVs, all four identical:
**`scope` 4, `level_1` 33, `uom` 15, `ghg_unit` 6.** So `ACTIVITY_UNITS`,
`RESULT_UNITS`, `SCOPES` and `SCOPE3_CATEGORIES`' keys in `lib/domain/defra.ts`
all already cover 2025, and the seeder's fatal vocabulary refusal never fired.
Nothing was widened to make the seed pass, which was the explicit bound.

### The GWP basis, re-read from the 2025 report — checked, not assumed

Table 1 of the 2025 methodology paper ("summary of conversion factors that are
in AR4 or/and AR5 basis GWPs") was read by **tick column position**, the same
method step 10 used, since the glyphs do not survive text extraction.

**It is identical to 2026's**: AR4 for **Bioenergy, WTT Bioenergy and Material
Use**; AR5 for every other family; **Hotel Stay ticked in both columns** with
the same footnote ("different countries could be in either AR4 or AR5 basis"),
and refrigerants AR5 "where AR5 values were available, AR6 otherwise". So
`AR4_FAMILIES` stays a module-level constant and does **not** become
per-publication input to `normaliseDefraRow`.

Paragraph numbering moved between editions and is recorded per set rather than
carried forward: the CO₂e-basis statement is **1.7** in the 2025 report and 1.9
in the 2026 one; the applicability sentence is **1.8** in 2025 and 1.10 in 2026.

`SCOPE3_CATEGORIES` is unchanged for the same reason the vocabulary is: it is
keyed on `Level 1`, and the 33 `Level 1` values are the same 33.

Neither table moves a number — every DEFRA value is already CO₂e and `gwp_set`
is never applied to one. It is provenance, and it was checked as such.

### The effective window, quoted rather than assumed

From the 2025 methodology paper, paragraph **1.8**, read from the PDF this
session:

> The 2025 GHG Conversion Factors are for use with activity data that falls
> entirely or mostly within 2025.

Hence `effective_from` `2025-01-01`, `effective_to` `2025-12-31`. **The two
published windows do not overlap**, so prompt 68's tie-break is never reached
between them — a date resolves to at most one published set.

### Attribution, confirmed in the 2025 publication

Read from the 2025 methodology paper's own front matter, verbatim:

> This publication is licensed under the terms of the Open Government Licence
> v3.0 except where otherwise stated.

The same notice the 2026 report carries. `licence`, `licence_url` and
`source_url` are stored on the set row and rendered from it, which is what makes
a second dataset safe to add.

### The seeder, now a registry

`lib/db/seed/seed-emission-factors.ts` held one `PUBLICATION` object and one
`SEED_CSV` constant. It now holds `PUBLICATIONS`, a list of descriptors each
carrying its own CSV path, and `main()` iterates it through a new
`seedPublication(db, publication)`.

- **The idempotence check is unchanged in substance**, per descriptor — keyed on
  `(organization_id is null, source, dataset_version)`. It moved *before* the
  CSV read, so an already-seeded publication does not parse 8,740 rows to
  discover it has nothing to do.
- **A factor row is still never updated in place.** A revision is still a new
  `dataset_version` inserted alongside; the docblock's argument is unchanged.
- **The vocabulary refusal is still fatal** and now names the publication in its
  message, so a two-set run says which one refused.
- `npm run db:seed:factors` keeps its name and its `dotenv -e .env.local --`
  prefix. An optional argument selects one entry —
  `npm run db:seed:factors -- "2025 v1"` — and an unknown version is an error
  listing the known ones. **No second npm script.**
- `INSERT_BATCH` = 500, one transaction per set, and `DATABASE_URL_UNPOOLED` are
  all unchanged (§7.3's session-state reason).
- `gasBasis` is typed from the schema's own enum rather than `string`, which is
  what caught the descriptor type at compile time.

### Measurements

Against the development database over `DATABASE_URL_UNPOOLED`. **Warm** — the
connection was established by the harness in the same session, so no
scale-to-zero cold start is included (§7.3).

**1. Baseline, before anything was written.** 1 organisation, 0
`activity_record`, 0 `activity_emission`, 11 factor mappings, 7,035 factor rows,
**1** `emission_factor_set`.

**2. Seed runtime: 31.8 s, warm**, for the 2025 set's 7,029 rows; the 2026 entry
reported "already seeded (set `560dadb5-…`). Nothing written." A second full run
took **2.4 s** and wrote nothing for either set.

**3. The two windows, read back:**

| source | dataset_version | publication_year | effective_from | effective_to | organization_id | superseded_by_set_id | rows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DESNZ | 2025 v1 | 2025 | 2025-01-01 | 2025-12-31 | **null** | null | 7,029 |
| DESNZ | 2026 v1.2 | 2026 | 2026-01-01 | 2026-12-31 | **null** | null | 7,035 |

`retrieved_at` `2026-08-12` and `2026-08-10`; `licence` `Open Government Licence
v3.0` and `gas_basis` `combined_co2e` on both. **All 7,029 new
`emission_factor` rows carry `organization_id = null`** — published and shared,
§9.2 rule 6's narrow exception — confirmed by a `count(*) filter (where
organization_id is null)` equal to the row count.

**4. Seeded distribution for the 2025 set, read back from the database**, in the
shape step 10 recorded for 2026:

| dimension | 2025 v1 | 2026 v1.2, for comparison |
| --- | --- | --- |
| scope | scope_1 **2,531** · scope_2 **352** · scope_3 **4,090** · outside_of_scopes **56** | 2,531 · 352 · 4,096 · 56 |
| result unit | `kg_co2e` **6,578** · `kwh` **451** | 6,584 · 451 |
| GWP set | AR5 **6,861** · AR4 **168** | 6,866 · 169 |
| scope 3 category | c4 **1,445** · c6 **1,034** · unassigned **952** · c3 **448** · c5 **134** · c1 **74** · c7 **3** | 1,445 · 1,034 · 952 · 448 · 139 · 75 · 3 |

The six-row gap sits in scope 3 — five in c5 and one in c1 — and is the six rows
that carry a value in 2026 and none in 2025.

**5. The end-to-end case, before and after, driven through the real seam.** The
development database holds no activity data, so the case was produced as prompt
68 produced its: a temporary organisation, five 1,000 kWh electricity records
dated 2026-03-15, 2026-07-01, 2025-03-15, 2025-09-30 and 2024-06-01, driven
through `recalculateOrganization`, then deleted. Its mappings were seeded by
`seedDefaultMappings` **before** the 2025 set existed, so all eleven point at
2026 rows — the realistic case, and the one that actually tests the sibling path.

| | before seeding 2025 | after |
| --- | --- | --- |
| `recalculateOrganization` | `{ records: 5, written: 2 }` | `{ records: 5, written: 4 }` |
| total | **261.92 kg = 0.26192 tCO₂e** | **615.92 kg = 0.61592 tCO₂e** |
| matched / total records | 2 / 5 | **4 / 5** |
| `outOfPeriodYears` | `2025: 2`, `2024: 1` | **`2024: 1`** |
| `unmatchedPairs` | empty | empty |
| pool queries | 3 | 3 |

**Which factor row each emission used**, which is the proof the resolution went
where it should:

| activity_date | kg CO₂e | source_row_id | factor_id | set |
| --- | --- | --- | --- | --- |
| 2025-03-15 | 177.000000 | `7_400_4000_5_1` | `d52d03fe-8ccf-4bc6-9e08-8de6657eaa3c` | **2025 v1** |
| 2025-09-30 | 177.000000 | `7_400_4000_5_1` | `d52d03fe-8ccf-4bc6-9e08-8de6657eaa3c` | **2025 v1** |
| 2026-03-15 | 130.960000 | `7_400_4000_5_1` | `8e43e43d-1f18-472c-8e0b-a5256114a15d` | 2026 v1.2 |
| 2026-07-01 | 130.960000 | `7_400_4000_5_1` | `8e43e43d-1f18-472c-8e0b-a5256114a15d` | 2026 v1.2 |

`2 × 0.177 + 2 × 0.13096 = 0.61592` tonnes exactly. **The 2026 records did not
move** — same `factor_id` before and after — and **the 2024 record stayed
refused**: no set covers 2024, and no nearest-year fallback appeared. That
refusal is the control on this whole measurement.

`engine_version` is `1.1.0` on every row, before and after.

**6. No N+1, and a second set adds none.** `pg.Pool.prototype.query` counted
around `recalculateOrganization`, exactly as prompt 68 counted it: **3 pool-level
queries at 5 records and 3 at 205 records**, with two sets visible — the same 3
prompt 68 measured with one. The sibling lookup is one query whatever the number
of sets.

**7. Teardown confirmed back at baseline**: 0 `activity_record`, 0
`activity_emission`, 1 organisation, 0 sites, 11 mappings — and 14,064 factor
rows across 2 sets, which is the intended residue.

### A finding, reported rather than fixed — **closed by prompt 70**

**`seedDefaultMappings` picks its factor row non-deterministically now that two
sets are visible.** Its query selects by `source_row_id` across
`visibleFactorScope` with **no `ORDER BY`**, and `new Map(factors.map(…))` takes
the last row wins. With two published sets carrying the same nine ids, a *new*
organisation's default mappings may land on either year's row, unpredictably.

**No figure moves either way**, which is why it is reported and not changed here:
prompt 68's stage 2 uses the mapped row's own set when it covers the date and
stage 3 follows the siblings when it does not, so a mapping pointing at 2025 and
one pointing at 2026 resolve every record identically. But "which row is the
mapping" is visible on `/activity/mappings`, and a surface that shows a
different year on two otherwise identical organisations is a defect of
presentation. `lib/db/emission-queries.ts` was out of scope for this prompt
(§6 of `prompts/69-defra-2025-factor-set.md`), so it was recorded for a later
one.

**Prompt 70 fixed it on 13 Aug 2026, and not the way this paragraph predicted**
(§12 rule 8). The prediction was "an `ORDER BY` making the choice deterministic
— newest publication year, presumably". The determinism half was right; the
mechanism was wrong. An `ORDER BY` would have restated `preferCandidate`'s four
tiers a second time in SQL, and those tiers decide a filed number's provenance,
so the fix reuses the pure function instead. "Newest publication year" is also
only tier 2 of four — an `ORDER BY` on it alone would still have been arbitrary
between two sets of the same year. See the section below.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **9 files, 197 tests passed** (558 ms) — the baseline, unchanged. `lib/domain/defra.ts` was not modified, so no test was owed |
| `npm run db:seed:factors` | 7,029 factors for 2025 in **31.8 s warm**; 2026 already seeded, nothing written. Re-run: nothing written for either, 2.4 s |
| database readback | the tables above |
| `npm run build` | route table below |
| prerender diff | **21 files, 21 identical, 0 differ**; CSS **byte-identical at 68,208 bytes and the same chunk name on both sides** (`2c7p8i7-arsrn.css`), so no utility was added by the prose in this change |
| `npm run test:e2e` | chromium + firefox: **10 passed** (38.2 s). **WebKit did not run** — `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux", which is not installed on this machine. Not reported as passed |

**The route table, quoted — and a correction to the prompt's prediction.**
`prompts/69-defra-2025-factor-set.md` predicted "27/27, 11 Static, 2 SSG, 9
Dynamic, plus Proxy". The build produces **31 routes: 11 `○ Static`, 2 `● SSG`,
18 `ƒ Dynamic`, plus `ƒ Proxy (Middleware)`** — identical on both sides of the
diff. The prompt's Static and SSG counts are right and its Dynamic count was a
stale figure; recorded rather than adjusted away (§12 rule 8).

- `○ Static` — `/`, `/_not-found`, `/about`, `/careers`, `/design-system`,
  `/forgot-password`, `/journal`, `/reset-password`, `/sign-in`, `/sign-up`,
  `/verify-email`
- `● SSG` — `/article/[slug]` (6), `/job-listing/[slug]` (3)
- `ƒ Dynamic` — `/account`, `/activity`, `/activity/[importId]`,
  `/activity/factors`, `/activity/mappings`, `/api/auth/[...all]`,
  `/api/cron/recalculate`, `/api/newsletter/unsubscribe`, `/dashboard`,
  `/invitation/[id]`, `/newsletter/confirm`, `/newsletter/unsubscribe`,
  `/reports`, `/reports/[reportId]`, `/reports/[reportId]/export`,
  `/submissions`, `/submissions/applications/[id]/cv`, `/targets`

**Prerender impact: none, verified rather than assumed**, by the two-build method
in `docs/automation.md` with both sides excluding `.claude/` and `.agents/`,
normalising `.next/BUILD_ID` and both the `.js` and `.css` chunk patterns, and
stripping the `self.__next_f.push` payloads.

**Trust boundary: no new request path.** The seeder is a developer-run script
with no route, no action and no HTTP surface. The two already-authorised paths
whose *data* changed — the `recalculate` Server Action and the cron sweep — gain
no stage, and no tenant-scoped query was widened: every read still carries
`visibleFactorScope(organizationId)`, and the new rows are `organization_id =
null`, which that predicate admits as published.

**Secrets and data.** No new environment variable, no `NEXT_PUBLIC_*`, no
`.env.example` line. No personal data: emission factors are public reference data
under the OGL v3.0, and the seeder logs counts and set ids only. Nothing reached
a third party and no model was called.

### What prompt 69 deliberately did not do

| not done | why |
| --- | --- |
| any schema change or migration | none was needed; the columns have carried the windows since step 10 |
| touching `factor-selection.ts`, `emissions.ts`, `emission-queries.ts` or `defra.ts` | prompt 68 built them for this case and they needed nothing. The `seedDefaultMappings` ordering finding above is the one place a later change is owed |
| bumping `ENGINE_VERSION` | the engine is unchanged; the data is not the engine. Figures moved because new data became visible, which the `emission_factor_set` rows record |
| 2024 or any earlier year | one year at a time — and the 2024 record staying refused is what proves refusals still refuse |
| EPA Hub, eGRID, a second publisher, IEA factors | step 10's decisions, unchanged; IEA remains licence-blocked |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65 and 68 and still deferred |
| the custom-factor-set sibling gap | `createTenantFactor` still hashes its own `source_row_id`, so a tenant row can never be a sibling of a published one. Prompt 68's open gap, still open here and **closed by prompt 71** |
| market-based scope 2, set-metadata editing, retiring a set, bulk CSV import | untouched prior deferrals |
| an xlsx parser in the application | the workbook is converted once by the committed script; the app reads the derived CSV with the pure `parseCsv` |
| adding an out-of-period figure to `ReportEvidence` | prompt 68's reasoning is unchanged |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work |

## A deterministic factor set for the seeded default mappings, prompt 70

Implemented on 13 Aug 2026. **Closes prompt 69's "A finding, reported rather
than fixed"**, and closes a docblock claim the repository had stopped
satisfying. Post-sequence work, as prompts 63–69 were. Not a step 15.

**Three files changed**, none of them a route, a component or a marketing
surface: `lib/domain/factor-selection.ts`, `lib/db/emission-queries.ts` and
`lib/domain/factor-selection.test.ts`. No schema change, no migration,
`ENGINE_VERSION` stays `1.1.0`, and `db:generate` was not run.

### The two defects, as read from the code

**1. The winner was whatever Postgres returned last.** `seedDefaultMappings`
selected `{ id, sourceRowId }` across `visibleFactorScope` with no `ORDER BY`,
then built `new Map(factors.map(…))` — last row wins. With two published DESNZ
sets each carrying the same nine ids, a new organisation's eleven defaults could
land on either year's rows, and row order without `ORDER BY` is undefined.

**2. `searchFactorsForPair`'s docblock claimed a parity the code did not have.**
It said it applies *"the same three predicates `seedDefaultMappings` applies"*.
It did not: the picker filtered `isNull(emissionFactorSet.deletedAt)` and the
seeder did not. Under §12 rule 8 the divergence was closed rather than described
— by adding the missing predicate to the **seeder**, which is the direction that
narrows what a default may name rather than widening it.

### The fix — reusing the total order, not writing a second one

`lib/domain/factor-selection.ts` gains two pure exports and keeps its lack of
`server-only` (§6.2 — the domain layer stays importable and testable):

| export | what it is |
| --- | --- |
| `CandidateProvenance` | the four fields `preferCandidate` actually reads — `setId`, `setOrganizationId`, `publicationYear`, `setCreatedAt`. `preferCandidate`'s parameters were widened from `FactorCandidate` to this, so a caller choosing between rows rather than calculating with them need not invent a window |
| `preferredBySourceRow(candidates)` | `Map<sourceRowId, winner>`, each winner chosen by `preferCandidate`. Generic over any row carrying `CandidateProvenance & { sourceRowId }` |

**Why not an `ORDER BY`.** `preferCandidate` is the project's single answer to
"which of several covering sets wins", decided with the user on 12 Aug 2026 and
carrying four tiers: tenant-owned before published → `publicationYear` desc →
set `createdAt` desc → set id asc. Restating those in SQL would put a second
copy of the rule that decides a figure's provenance in a second language. The
seeder and prompt 68's resolver now agree **by construction**.

The comparison in `preferredBySourceRow` is strict (`preferCandidate(…) < 0`),
so an equally-ranked later row never displaces an earlier one — and since the
order is total, no two distinct rows rank equally. That is what makes the result
independent of input sequence.

`seedDefaultMappings` selects the four provenance columns alongside `id` and
`sourceRowId`, adds `isNull(emissionFactorSet.deletedAt)` to its `where`, and
uses the helper. **`visibleFactorScope(organizationId)` is untouched** — not
restated, not inlined, not widened.

`searchFactorsForPair` gains a deterministic tail after its three label columns:

```
asc(sql`${emissionFactorSet.organizationId} is null`)   -- customer-supplied first
desc(emissionFactorSet.publicationYear)
asc(emissionFactorSet.id)
```

the same reading order `preferCandidate` encodes. Two identically-labelled rows
from two sets previously ordered arbitrarily between themselves, which also
decided arbitrarily which of them survived `FACTOR_SEARCH_LIMIT`. The label
columns keep their precedence, so the list a reporter reads does not
re-sequence.

### Measurements

**1. The defect's precondition, from the development database.** Two visible
sets, neither deleted, neither superseded, both published:

| set id | dataset_version | publication year | organization_id | created_at |
| --- | --- | --- | --- | --- |
| `560dadb5-b4fa-4925-aa37-55d0fc9f40d8` | 2026 v1.2 | 2026 | null | 2026-08-10T19:20:10.412Z |
| `265d72c4-d929-4cf4-8ede-edde707a4ac7` | 2025 v1 | 2025 | null | 2026-08-12T23:48:40.577Z |

The eleven `DEFAULT_FACTOR_MAPPINGS` cover **nine distinct `source_row_id`s, and
every one returns exactly two visible rows** — one per set. Ids returning fewer
than two: **0**. So the finding's premise held on every default, not on some.

`10_401_4003_5_1`, `17_404_4005_1_1`, `1_100_1004_1_1`, `1_100_1004_6_1`,
`1_101_1011_8_1`, `20_507_5313_15_1`, `25_301_3074_4_1`, `27_304_3140_14_1`,
`7_400_4000_5_1` — all `rows=2`, `sets=2025 v1, 2026 v1.2`.

**2. The winner, read back.** A throwaway organisation with no mappings, seeded
through `seedDefaultMappings` and read back joined to its set:

| category / unit | source_row_id | factor_id | set |
| --- | --- | --- | --- |
| electricity / kWh | `7_400_4000_5_1` | `8e43e43d-1f18-472c-8e0b-a5256114a15d` | 2026 v1.2 |
| electricity / MWh | `7_400_4000_5_1` | `8e43e43d-1f18-472c-8e0b-a5256114a15d` | 2026 v1.2 |
| fuel / kWh | `1_100_1004_6_1` | `d45b47e7-4e62-40c1-8165-914f2df97d58` | 2026 v1.2 |
| fuel / L | `1_101_1011_8_1` | `ad3d8168-b715-43e3-bdda-97ac920dbdc7` | 2026 v1.2 |
| fuel / m3 | `1_100_1004_1_1` | `8d859335-09b0-47a0-9283-527d2c8cbca4` | 2026 v1.2 |
| heat / kWh | `10_401_4003_5_1` | `13b233b1-1045-4696-9bed-f3974ff12cad` | 2026 v1.2 |
| waste / kg | `20_507_5313_15_1` | `4f11c9df-cb7e-4ca9-b52e-c323f57fa65d` | 2026 v1.2 |
| waste / t | `20_507_5313_15_1` | `4f11c9df-cb7e-4ca9-b52e-c323f57fa65d` | 2026 v1.2 |
| water / m3 | `17_404_4005_1_1` | `4e2cea3c-6d5d-4f4d-b3d1-39524936ed8b` | 2026 v1.2 |
| travel / km | `25_301_3074_4_1` | `5ceec5a7-28c7-4c56-8b9b-f77b4712a2e1` | 2026 v1.2 |
| freight / tkm | `27_304_3140_14_1` | `f2122d3b-d986-4762-971f-e529aa8b931c` | 2026 v1.2 |

`{ inserted: 11 }`, and **11 of 11 on the newest published set**.

**3. Determinism, not luck.** A repeated database read cannot prove the absence
of a coincidence, so this is asserted in the domain tests, over **every
permutation** of the input rather than a sample of shuffles:
`winnersOverEveryOrder` enumerates all orderings and each must answer
identically. Six new cases cover the later publication year, tenant-owned ahead
of a *later* published set, the `createdAt` fall-through, the set-id
fall-through, independence between two source rows, and the absent-row case that
keeps a default naming a row no visible set contains from seeding anything.

**4. No figure moves.** Two organisations, the same five 1,000 kWh electricity
records dated 2026-03-15, 2026-07-01, 2025-03-15, 2025-09-30 and 2024-06-01: one
seeded by the new code (2026 rows), one **pinned to the 2025 rows** to reproduce
the pre-prompt-70 outcome. Both driven through `recalculateOrganization`:

| | control, mapped to 2025 | seeded, mapped to 2026 |
| --- | --- | --- |
| outcome | `{ records: 5, written: 4 }` | `{ records: 5, written: 4 }` |
| 2025-03-15 | `d52d03fe-…eaa3c` 177.000000 (2025 v1) | `d52d03fe-…eaa3c` 177.000000 (2025 v1) |
| 2025-09-30 | `d52d03fe-…eaa3c` 177.000000 (2025 v1) | `d52d03fe-…eaa3c` 177.000000 (2025 v1) |
| 2026-03-15 | `8e43e43d-…4a15d` 130.960000 (2026 v1.2) | `8e43e43d-…4a15d` 130.960000 (2026 v1.2) |
| 2026-07-01 | `8e43e43d-…4a15d` 130.960000 (2026 v1.2) | `8e43e43d-…4a15d` 130.960000 (2026 v1.2) |
| 2024-06-01 | refused, no set covers it | refused, no set covers it |

**Every `factor_id` and every `kg_co2e` identical**, asserted by comparison and
not by eye. They are also the same two factor ids and the same two values prompt
69 recorded one section above, so the equality holds against the prior record as
well as across the two mappings. This is what makes prompt 70 a presentation fix:
which row the *mapping* names moved; which row the *calculation* used did not,
because prompt 68's resolver follows the mapped row's siblings when its own
window does not cover the date.

**5. Query count unchanged.** `pg.Pool.prototype.query` counted around
`recalculateOrganization`: **3 pool-level queries at 5 records**, the same 3
prompts 68 and 69 measured. `seedDefaultMappings` is still one `select` plus one
`insert` inside its transaction; the extra columns and the extra predicate add
no round trip.

**Teardown confirmed back at baseline**: organizations **1**, mappings **11**,
records **0**, emissions **0**, sites **0** — identical to the reading before the
throwaway organisations were created.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **9 files, 204 tests passed** (511 ms) — the 197 baseline plus 7 new `preferredBySourceRow` cases, every prior test still passing |
| the five measurements | via a throwaway `dotenv -e .env.local -- tsx --conditions=react-server` script, deleted afterwards; nothing added to a request path |
| `npm run build` | the 31-route table below, unchanged |
| prerender diff | **21 HTML files, 21 identical, 0 differ**; CSS byte-identical at **65,212 bytes** and the same chunk name on both sides (`042--fgx_-5jm.css`) |
| `npm run test:e2e` | chromium + firefox: **10 passed** (24.2 s). **WebKit did not run** — `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux", which is not installed on this machine. Not reported as passed |
| `npm run db:generate` / `db:migrate` | **not run** — no schema change |

**The route table: 31 routes — 11 `○ Static`, 2 `● SSG` (6 + 3 paths), 18
`ƒ Dynamic`, plus `ƒ Proxy (Middleware)`.** Identical on both sides of the diff
and identical to prompt 69's.

**A note on the CSS byte count, which differs from prompt 69's 68,208.** Both
comparison trees here also excluded `prompts/`, because an *untracked* prompt
file exists in the working tree and not in `git archive HEAD`, and Tailwind v4
would have scanned its prose on one side only. The number to check the method
against is therefore 65,212 for a prompts-excluded pair, not 68,208. Both sides
were built the same way, which is what the comparison rests on.

**The prose hazard fired, and was found rather than accepted.** The first
implementation build grew the stylesheet by **18 bytes**, and a rule-by-rule
diff named it: a single `{grid-row:1}` declaration, whose selector is Tailwind's
own grid-row utility name — which was also, verbatim, the `sourceRowId` value
the new test fixtures used. Tailwind v4 scans `.ts` files including tests and
takes candidate class names out of any string it finds, not only out of JSX.
The fixtures were renamed to `srcrow-1` / `srcrow-a` / `srcrow-b` and the
rebuild is byte-identical.

**The offending token is deliberately not spelled out in this paragraph**, and
that is not coyness: `docs/` is inside the scan root too, so writing it here
ships the rule from this file instead. It was verified — the first draft of this
section quoted the token and the stylesheet grew by the same 18 bytes again,
caught by re-running the diff after the record was written. `docs/automation.md`
records this trap from step 10's `text-overflow` leak; this is the second time
it has fired in implementation code, the first time from a **string literal**
rather than a doc comment, and the first time from the record of the fix.

**Prerender impact: none, verified rather than assumed**, by the two-build
method in `docs/automation.md` — both sides excluding `.claude/`, `.agents/` and
`prompts/`, normalising `.next/BUILD_ID` and both the `.js` and `.css` chunk
patterns, and stripping the `self.__next_f.push` payloads.

**Trust boundary: no new request path, no new route, no new action.** The two
already-authorised paths this reaches — the `recalculate` Server Action in
`app/activity/actions.ts` and `/api/cron/recalculate` — gain and lose no stage.
Nothing crosses the tenant boundary: `visibleFactorScope(organizationId)` is
unchanged in every query touched, and the seeder's one added predicate
*narrows* what it may select. No browser input reaches the new code —
`DEFAULT_FACTOR_MAPPINGS` is a compiled-in constant.

**Secrets and data.** No new environment variable, no `NEXT_PUBLIC_*`, no
`.env.example` line. `lib/db/emission-queries.ts` keeps `import "server-only"`
and still contains no `console` call; `lib/domain/factor-selection.ts` remains
free of it, as §6.2 requires. No personal data: emission factors are public
reference data, and `activity_factor_mapping.created_by` was not touched.
Nothing reached a third party and **no model was called** (§5.3 — AI factor
matching stays deferred).

### What prompt 70 deliberately did not do

| not done | why |
| --- | --- |
| changing `selectFactorForDate` or any resolution semantics | prompt 68's path is correct and prompt 69 proved it against two sets. This is which row a *new* organisation's default names, not how a date resolves |
| an `ORDER BY` restating `preferCandidate`'s four tiers in SQL | a second copy of the rule that decides a figure's provenance. The pure function is the single definition |
| re-pointing existing organisations' mappings at the newer set | a mapping is a deliberate choice once made, and `seedDefaultMappings` refuses to overwrite one — a backfill would silently undo an override. Its own prompt, with the user's say-so, if it is wanted |
| bumping `ENGINE_VERSION` | the engine is unchanged and no figure moved. `1.1.0` stands |
| any schema change, migration or `db:generate` | none was needed |
| a third factor set, or 2024 | prompt 69's decision: one year at a time |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68 and 69 and still deferred |
| the custom-factor-set sibling gap | `createTenantFactor` still hashes its own `source_row_id`. Prompt 68's open gap, unchanged and still open here — **closed by prompt 71** |
| market-based scope 2, set-metadata editing, retiring a set, bulk CSV import | untouched prior deferrals |
| showing the dataset year anywhere new in the UI | `/activity/mappings` and the factor picker already render `source` + `datasetVersion`; no new surface was owed |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work |

## Superseding a published factor row, prompt 71

Implemented on 13 Aug 2026. **Closes the custom-factor-set sibling gap** carried
forward unchanged by prompts 68, 69 and 70: a customer-supplied `emission_factor`
can now declare that it restates a specific published row, which makes it
reachable by `listFactorSiblings` and selectable by `selectFactorForDate` for a
date the published set does not cover.

It is the only open item the record classified as a **defect** rather than as
deferred scope, and it sits on the path that decides a filed disclosure figure.

### The failure it closes

Read out of the code, not inferred:

- `listFactorSiblings` matched each mapping on
  `and(eq(emissionFactorSet.source, …), eq(emissionFactor.sourceRowId, …))`.
  `source` is a **set** column; `source_row_id` is a **factor** column.
- `sourceRowIdForCustomFactor` returns `custom:${sha256(…)}`, and the row is
  written into a tenant set carrying the customer's own `source`.

So a customer-supplied row was unreachable as a sibling on **both** halves of the
key, and the customer could not resolve it from either side:

1. An organisation maps a `(category, unit)` pair to a DEFRA row.
2. It supplies its own set covering 2024, which the published data does not
   cover.
3. Records dated 2024 resolve `out_of_period` — `selectFactorForDate` returns
   `null` — because the tenant row is not a sibling of the mapped row.
4. Re-pointing the mapping at the tenant row fixes 2024 and breaks 2026 the same
   way.

### The decision, taken with the user on 13 Aug 2026

**A tenant row declares what it restates through a nullable
`(supersedes_source, supersedes_source_row_id)` pair on `emission_factor`.**

Two alternatives were rejected, and the reasons are the point:

| rejected | why |
| --- | --- |
| a `supersedes_factor_id` self-FK | it pins one specific row, and every sibling read filters `isNull(emissionFactorSet.supersededBySetId)`. When the target's set is later superseded by a republication the link stops resolving **silently** — a figure disappearing for no recorded reason |
| reusing the published `source_row_id` verbatim, under a sibling key without `source` | two publishers that reuse one row-id string would collide into each other's sibling set, producing a **wrong** figure rather than a missing one |

The chosen pair follows `source_row_id`, which is already prompt 68's answer to
"how does a mapping travel to another year's set", and it leaves the tenant set's
own `source` attribution intact — **a customer's own figure is never relabelled
as DESNZ's.**

### The schema

Migration `0011_daily_slapstick.sql`, generated by `npm run db:generate` and
applied by `npm run db:migrate` over `DATABASE_URL_UNPOOLED`. Two columns, one
index and two checks; **no data migration**, because every existing row is
correctly `null` on both.

```sql
ALTER TABLE "emission_factor" ADD COLUMN "supersedes_source" text;
ALTER TABLE "emission_factor" ADD COLUMN "supersedes_source_row_id" text;
CREATE INDEX "emission_factor_supersedes_idx" ON "emission_factor" USING btree ("supersedes_source","supersedes_source_row_id");
ALTER TABLE "emission_factor" ADD CONSTRAINT "emission_factor_supersedes_pair" CHECK (("emission_factor"."supersedes_source" is null) = ("emission_factor"."supersedes_source_row_id" is null));
ALTER TABLE "emission_factor" ADD CONSTRAINT "emission_factor_supersedes_tenant_only" CHECK ("emission_factor"."organization_id" is not null or "emission_factor"."supersedes_source" is null);
```

- **`emission_factor_supersedes_pair`** — both null or both set. A half-declared
  supersession is a row that silently supersedes nothing: the source alone
  matches no sibling key, and the row id alone would match across publishers.
- **`emission_factor_supersedes_tenant_only`** — **published reference data never
  supersedes anything.** Only a row a customer supplied may declare a
  restatement.
- The index exists because `listFactorSiblings` now filters on the pair.

### The four changes, and why widening the query was not enough

1. **The identity hash.** `sourceRowIdForCustomFactor` appends the two
   supersession fields **only when supersession is declared.** Two custom factors
   identical in every other field but restating different published rows are
   different rows; without the pair in the hash they collide on
   `(set_id, source_row_id)` and the existing `onConflictDoNothing` discards the
   second in silence. Appending unconditionally would instead move the hash of
   **every non-superseding submission**, so a row created before this change
   would re-submit as a duplicate rather than as the idempotent no-op it gets
   today. Appending only when set preserves every existing hash exactly.

2. **The sibling query.** Each pair's predicate now matches **either** key:

   ```
   (set.source = $s AND factor.source_row_id = $r)
   OR (factor.supersedes_source = $s AND factor.supersedes_source_row_id = $r)
   ```

   `visibleFactorScope(organizationId)` stays an outer `AND` over the whole
   `where` and is deliberately **not** folded inside the `or` — it is what stops
   one tenant's superseding row entering another tenant's sibling set.
   `isNull(deletedAt)` on both factor and set, and `isNull(supersededBySetId)`,
   are unchanged. `FactorSibling` is now `FactorCandidate & FactorRowIdentity`.

3. **The keying rule, and it is in `lib/domain/`.** `buildFactorResolver` filed
   every sibling under its **set's** `source` and its **own** `sourceRowId`, then
   looked it up by the mapping's pair. A superseding tenant row would be filed
   under the tenant set's source and its `custom:` row id, so the widened query
   would load it and the resolver would still never find it. **Widening the query
   alone does not close the gap.**

   `factorSiblingKeys` in `lib/domain/factor-selection.ts` returns the keys a row
   is reachable under — its own pair, plus the declared pair when both halves are
   present and differ from its own — and `buildFactorResolver` files each sibling
   under **every** key it returns. Indexing under its own pair as well is what
   keeps a mapping that points directly at the tenant row finding that row's
   siblings.

   It is in `lib/domain/` for exactly the reason prompt 68 moved the tie-break
   there: it decides which value multiplies a customer's activity, and `lib/db/`
   is `server-only` and outside `npm test`'s `lib/domain/` scope. Left in
   `lib/db/` this rule would ship untested.

4. **Nothing else in the selection rule changed.** `covers`, `preferCandidate`,
   `preferredBySourceRow` and `selectFactorForDate` are untouched. A superseding
   tenant row that covers the date already beats a published row covering the
   same date, because `preferCandidate` ranks tenant-owned first — the wanted
   behaviour **falls out of the existing total order** rather than needing a new
   tier. A second rule deciding a filed number is what that avoids.

### Validation and the surface

`customFactorSchema` gains an optional `supersedes` **object** with `source` and
`sourceRowId` required inside it, so the object itself carries the
"both-or-neither" rule and mirrors the database check without a `superRefine`
restating it. `lib/validation/` imports nothing from `lib/db/` (§6.3): the
candidate rows reach the form as props from the Server Component.

`listSupersedableRows` is the new query behind that prop — **the published rows
this organisation's active mappings currently point at**, distinct on
`(source, source_row_id)`. That is precisely the set where a supersession has any
effect, and it keeps the control's list short instead of offering thousands of
DEFRA rows. A row the organisation supplied itself is excluded:
`isNull(emissionFactor.organizationId)` is the whole filter, because a tenant row
restating another tenant row is a link with no meaning.

`CustomFactorForm` gains one optional `<select>`, defaulting to "Restates
nothing", rendered only when there is at least one candidate. Its copy states the
one behaviour that departs from prompt 66's precedent:

> A restating row is used wherever that published row is mapped, for the dates
> this set covers. It takes effect at the next recalculation without a mapping
> change — the rest of this form does not.

`createCustomFactor` keeps its action order unchanged — BotID absent by design,
`getCurrentMembership()`, user-id rate limit, shared Zod parse, owner-only
authorisation, tenant-predicated write, no email, revalidation of
`/activity/factors`, `/activity/mappings` and `/activity`. **No recalculation is
triggered from the create action.**

### Measured

A synthetic organisation on the real database, seeded with the default mappings,
two 1,000 kWh electricity records — one dated `2026-03-01`, one `2024-03-01`.
The mapped row is `DESNZ 7_400_4000_5_1`, window `2026-01-01..2026-12-31`, value
`0.13096000000000000`. The declared tenant set covers `2024-01-01..2024-12-31`
at `0.25000000000000000`.

| | recalculation | 2024 | 2026 |
| --- | --- | --- | --- |
| **before** the supersession | `{ records: 2, written: 1 }` | *no figure* — `out_of_period` | `130.960000000000000000000000` kgCO2e, 1 row |
| **after** the supersession | `{ records: 2, written: 2 }` | `250.000000000000000000000000` kgCO2e, 1 row | `130.960000000000000000000000` kgCO2e, 1 row |

**2026 did not move.** The only figure that changed is the one a deliberately
declared supersession was asked to produce, which is why `ENGINE_VERSION` is not
bumped.

**Query count is constant in the record count** — `pg.Pool.prototype.query`
counted around `recalculateOrganization`:

```
2 records  -> 3 pool queries
42 records -> 3 pool queries
```

Three at both counts, matching prompt 68's baseline. The widened `or` did not
become an N+1. **Warm** — the Neon compute was already up from the migration, so
no cold start is in these numbers, and none of them is a latency figure.

Every synthetic organisation, set, factor, mapping, record and emission was
deleted afterwards and the removal confirmed: `remaining records/factors/orgs:
0 0 0`.

### Checks

| check | result |
| --- | --- |
| `npm run db:generate` | `lib/db/migrations/0011_daily_slapstick.sql` — the five statements above |
| `npm run db:migrate` | `migrations applied successfully!` |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **9 files, 210 tests passed** (prompt 70's baseline: 9 / 197) |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG`; `/activity/factors` stays `ƒ Dynamic` |
| prerender diff | **21 files compared, 21 identical, 0 differing.** CSS chunk byte-identical at 68,208 bytes on both sides |
| `npm run test:e2e` | Chromium and Firefox **10/10 passed**. **WebKit did not run** — `Podman is required for WebKit on Arch Linux`, still not installed, as prompt 70 recorded. Not reported as passed |

The prerender diff used the copy-tree method in `docs/automation.md` (a
`next dev` was running, trap 3), excluding `.claude/` and `.agents/` on both
sides, normalising `BUILD_ID` and both content-hashed chunk patterns, and
stripping the `self.__next_f.push` payloads.

The six new tests are in `lib/domain/factor-selection.test.ts`: own pair only,
both pairs when declared, own pair still reachable alongside the declared one, a
half-declared pair ignored rather than completed, an identical pair collapsed,
and a same-row-id pair from a different publisher **not** collapsed.

### Trust boundary

No new route and no new request path. The one changed request path is the
existing `createCustomFactor` Server Action, which now additionally carries a
claimed `(source, sourceRowId)` pair to supersede.

**That pair is a claim, not a capability.** It is parsed by the shared Zod schema
and written as text; the write stays tenant-predicated exactly as a submitted
`setId` already was. A pair naming a row the organisation cannot see is harmless
**by construction**: every read of it runs under
`visibleFactorScope(organizationId)`, so it can only ever resolve to published
data or the tenant's own rows. A rejected request returns the existing typed
result with field errors; nothing throws to the client.

### Secrets and data

No environment variable is read or added, no `NEXT_PUBLIC_*`, no `.env.example`
line. Emission factors are reference data and carry no personal data;
`activity_factor_mapping.created_by` is untouched. `lib/db/emission-queries.ts`
keeps `import "server-only"` and gained no `console` call. Nothing reaches a
third party and **no model is called** (§5.3 — AI factor matching stays
deferred).

### What prompt 71 deliberately did not do

| not done | why |
| --- | --- |
| changing `covers`, `preferCandidate`, `preferredBySourceRow` or `selectFactorForDate` | the existing total order already produces the wanted outcome; a new tier would be a second rule deciding a filed number |
| per-period mappings, or widening `activity_factor_mapping`'s unique key | prompt 68's explicitly rejected option — one choice per pair keeps its meaning across revisions |
| re-pointing existing organisations' mappings at a newer set | prompt 70's deferral, unchanged: a mapping is a deliberate choice and a backfill would silently undo an override |
| recalculating on create, or a mass recalculation | prompt 68's reasoning stands — a mass recalculation is an operational act, and the cron sweep runs on its schedule |
| bumping `ENGINE_VERSION` | the engine is untouched, and the only figure that moved is the one a declared supersession produced. `1.1.0` stands |
| editing or removing a declared supersession after the fact | retiring the row already withdraws it, and an edit surface wants its own decisions |
| organisation soft-delete and erasure | the largest open item, but deferred scope with a recorded reason, and it wants its own prompt |
| set-metadata editing, retiring a set from the UI, bulk CSV import, market-based scope 2 | untouched prior deferrals |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68, 69 and 70 and still deferred |
| a third factor set, or a second published year | prompt 69's decision: one year at a time. This makes a *customer's* row reachable; it supplies no data |
| any change to a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | out of scope entirely |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work |

## Organisation deletion and erasure, prompt 73

Implemented on 13 Aug 2026. It closes the item prompt 71 named as "the largest
open item" in its own deferral table, and the one `lib/auth/server.ts` recorded
against `disableOrganizationDeletion: true`: **§9.2 rule 5 wants a soft-delete
with an audit trail so an erasure request is one reversible operation, and
§8.3 rule 5 wants retention to be finite and stated.** Before this, an
organisation could be created and never removed, and a customer's commercial
data — sites, imports, activity records, computed emissions, targets, reports,
and the private CSV blobs behind the imports — had no exit.

Not a step 15. §5.2 remains the ordered plan; this is approved post-sequence
work, on the same footing as prompts 63–72.

### The shape, decided with the user

Asked before the prompt file was written, because the answers change what gets
built:

- **Grace window, then purge.** An owner requests deletion; the workspace locks
  immediately — every tenant read and write refuses — but stays restorable, and
  a nightly sweep then hard-deletes the tenant rows and their private blobs.
- **The window is 30 days.**

Both are the user's decision, taken over "immediate erasure" and "soft-delete
only". **The 30 days is a product decision recorded as a decision, not a
measurement** (§12 rule 4): there is no traffic to fit it against, exactly as
`organizationLimit` and `invitationExpiresIn` say of themselves.

Better Auth's own `deleteOrganization` endpoint stays disabled.
`disableOrganizationDeletion: true` is unchanged in `lib/auth/server.ts`, and
its recorded reason still holds — the plugin's delete is immediate and
unaudited. The `organization-best-practices` skill's suggested soft-delete
pattern (a `beforeDelete` hook that **throws** to archive) was loaded and
declined: it works by making a documented endpoint fail, and §10 rule 2's
"never throw" is the house rule.

### The marker lives in our own table

New table `organization_deletion`, and **no column was added to Better Auth's
`organization`**. `schema.organization.additionalFields` does exist in
better-auth 1.6.26 (`node_modules/better-auth/dist/plugins/organization/types.d.mts:250-286`,
read rather than recalled), so this was a choice between two workable designs:

1. §9.1 says the generated tables are not extended by hand, and
   `lib/db/auth-schema.ts:112-125` already records what a regeneration costs the
   hand-added `member` unique index.
2. §9.2 rule 5 asks for an **audit trail** — who requested, when, when the purge
   is due, whether it was cancelled and by whom, and when it completed. That is
   a row with a lifecycle, not a nullable timestamp.
3. Decisively: **the audit row must outlive the purge.** The purge deletes the
   `organization` row, so a column on it is destroyed by the very operation it
   exists to record.

`lib/db/schema.ts`, after `alert_preference`:

| column | type | note |
| --- | --- | --- |
| `id` | `uuid` pk `gen_random_uuid()` | as every phase-two table |
| `organization_id` | `text not null` | **deliberately no foreign key** — the one place in the schema where the absence of an FK is the design. A reference would cascade this row away at the moment it becomes the only evidence the organisation existed |
| `organization_name`, `organization_slug` | `text not null` | snapshots, so the trail reads once the organisation is gone |
| `status` | `organization_deletion_status` | `pending` \| `cancelled` \| `purged`, declared once in `lib/validation/organization.ts` and imported (§9.2 rule 2) |
| `requested_at` | `timestamptz not null default now()` | |
| `requested_by` | `text not null` | the user id, no FK, same reasoning |
| `scheduled_purge_at` | `timestamptz not null` | `requested_at` + the window, **stored rather than computed**, so changing the constant later cannot move a date already promised to a customer |
| `cancelled_at`, `cancelled_by` | nullable | |
| `purged_at` | nullable | |
| `purge_error` | `text` nullable | a failed sweep leaves the row `pending` and records why, so the next night retries |
| `created_at` | `timestamptz not null default now()` | §9.2 rule 3 |

Indexes:

- `organization_deletion_pending_key` — **partial unique** on
  `organization_id where status = 'pending'`. One open request per
  organisation, enforced in the schema rather than by the action happening to
  check first, which is the argument `lib/db/auth-schema.ts:112-125` makes for
  the `member` unique index. Cancelled and purged rows accumulate freely; that
  is the trail.
- `organization_deletion_due_idx` on `(status, scheduled_purge_at)` — the
  sweep's due read.

Migration **`lib/db/migrations/0012_brainy_luke_cage.sql`**: one `CREATE TYPE`,
one `CREATE TABLE`, one `CREATE UNIQUE INDEX ... WHERE`, one `CREATE INDEX`.

`ORGANIZATION_DELETION_WINDOW_DAYS = 30` lives in
`lib/validation/organization.ts` so the action, the confirmation copy, the
locked notice and the email all read one value. That module stays the deliberate
non-`server-only` exception and still imports nothing from `lib/db/`.

### The locked state — where it is enforced

`Membership` (`lib/db/organization-queries.ts`) gained
`pendingDeletion: { scheduledPurgeAt: Date } | null`, filled by a left join to
`organization_deletion` on `status = 'pending'` in **both** `getMembership()`
and `listMembershipsForUser()` — one shared join predicate, so the two cannot
disagree about what "locked" means. `CurrentMembership`
(`lib/auth/organization.ts`) carries it through.

Two chokepoints lock everything with no call-site edit:

- **`requireOrganization()` redirects to `/account`** when it is set — all
  eight phase-two pages (`/dashboard`, `/activity`, `/activity/[importId]`,
  `/activity/mappings`, `/activity/factors`, `/targets`, `/reports`,
  `/reports/[reportId]`). `/account` rather than an error, because it is the one
  surface that must still render for a locked organisation: without it the
  restore control is unreachable and the lock is a state with no exit.
- **`authorizeOrganization()` returns `null`**, and `resolveTenant()`
  (`lib/auth/tenant.ts`) returns a handled failure. `TenantMessages` gained a
  fourth message, `organizationLocked`, passed per-flow exactly as the existing
  three are — `TARGET_ERRORS.organizationLocked`,
  `REPORT_ERRORS.organizationLocked`, and `ORGANIZATION_LOCKED` in
  `app/activity/actions.ts`.

**Five actions resolve their membership directly rather than through
`resolveTenant`, and the prompt's "no call-site edit" did not reach them.** They
need the *role* at stage d, which `resolveTenant` does not return, so each
checks the marker itself. Named here because it is the gap a later session would
otherwise reopen:

| action | file | message |
| --- | --- | --- |
| `setFactorMapping` | `app/activity/actions.ts` | `FACTOR_MAPPING_ORGANIZATION_LOCKED` |
| `createCustomFactor`, `retireCustomFactor` | `app/activity/actions.ts` | `CUSTOM_FACTOR_ORGANIZATION_LOCKED` |
| `inviteMember` / `cancelInvitation` / `removeMember` / `leaveOrganization`, via `resolveMembershipForWrite` | `app/account/actions.ts` | `MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED` |
| `setAlertEmailPreference` | `app/account/actions.ts` | `MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED` |

`listAllOrganizationIds()` now **excludes** organisations with an open request,
by an anti-join rather than a filter in the sweep, so a later caller cannot
forget it. Recalculating a workspace that is being erased is wasted work, and
step 14's threshold alerts would otherwise email a customer about a target
inside a workspace they asked to have removed.

**The two new actions deliberately do not go through the lock.** They resolve
membership through their own `resolveOwnerForDeletion` helper — restore is the
one thing a locked organisation may do.

### Erasure

`app/api/cron/purge-organizations/route.ts` + `sweep.ts`, copying the
recalculation cron's shape rather than abstracting over it: the two handlers are
eleven lines of gate each, and a shared wrapper would put the `CRON_SECRET`
check one indirection away from the endpoint that deletes tenant data.

`vercel.json` gained a second cron at **`0 3 * * *`** and a `maxDuration` of 300
alongside the existing entry. **That hour is a judgement derived from a
constraint, not a measurement** (§12 rule 4): it must not overlap the 02:00
recalculation sweep, whose `maxDuration` is 300s, so a purge never races a
recalculation of the same tenant.

Two things differ from the recalculation handler, and both are deliberate:

- **The rate limiter fails closed here**, where the recalculation's fails open.
  That one is idempotent and refusing it during a Redis outage costs a night of
  stale figures; this one deletes tenant data irreversibly, so a limiter that
  cannot be consulted is a reason to wait a night. Nothing is lost — every due
  row stays `pending` and is due again tomorrow. It shares
  `checkCronSweepLimit`'s bucket: one scheduler, one call each per night, and a
  leaked `CRON_SECRET` driving repeated sweeps is what both bound.
- The response body carries `{ due, purged, blobsDeleted, failures }` — counts
  only, no tenant identifier, no name, no slug, no blob pathname.

**The order per due request is the design:**

1. **Blobs first.** Vercel Blob is not in Postgres and no cascade reaches it, so
   deleting the rows first would orphan a customer's uploaded CSVs in storage
   permanently, with the pointers to them gone. Each pathname is deleted through
   the existing `deleteActivityImport` and then nulled on its own row as it
   succeeds, so a sweep that dies partway is resumable. Soft-deleted imports are
   included: a discarded import's blob is still a customer's file.
2. **Then one statement**: delete the `organization` row.
3. `status = 'purged'`, `purged_at = now`. The audit row remains.

A failure at either stage writes `purge_error` from a closed two-value
vocabulary — `blob-delete-failed` / `organization-delete-failed`, never an
exception message, which can quote a customer's data — leaves the row `pending`,
and the next night retries.

#### The `onDelete` audit, enumerated

Read out of `lib/db/schema.ts` and `lib/db/auth-schema.ts` at execution time
rather than trusted from the prompt. **Every `organization_id` reference is
`onDelete: cascade`** — 14 tables:

| table | `organization_id` | `onDelete` |
| --- | --- | --- |
| `site` | not null | cascade |
| `activity_import` | not null | cascade |
| `activity_import_row` | not null | cascade |
| `activity_record` | not null | cascade |
| `emission_factor_set` | **nullable** | cascade |
| `emission_factor` | **nullable** | cascade |
| `activity_factor_mapping` | not null | cascade |
| `activity_emission` | not null | cascade |
| `emission_target` | not null | cascade |
| `report` | not null | cascade |
| `target_alert` | not null | cascade |
| `alert_preference` | not null | cascade |
| `member` (generated) | not null | cascade |
| `invitation` (generated) | not null | cascade |

The two nullable ones are §9.2 rule 6's narrow published-reference-data
exception, and `cascade` is the **safe** mode there: deleting the organisation
deletes a customer's private factor set rather than orphaning it into the
published set every tenant reads. `set null` on either would have been a silent
cross-tenant leak of exactly the kind that rule exists to prevent. Confirmed,
not assumed.

Two references deliberately outside the cascade:

- **`organization_deletion.organization_id` carries no FK** — that is what lets
  the audit row survive.
- **`session.active_organization_id` carries no FK** (`lib/db/auth-schema.ts:42`),
  so a purged organisation leaves stale active ids on sessions. Harmless:
  `getCurrentMembership()` treats an `activeOrganizationId` that resolves to
  nothing as stale and falls back to the sole membership, which is behaviour
  that already existed.

**A table added later with a different `onDelete` mode is the failure this
sweep cannot detect by itself.** Re-run the enumeration when the schema grows.

### The surface

`/account`, following the spacing already in that file (`mt-20 md:mt-24`
between sections, `mt-7` under a caption) — **read from the file, not chosen.**
Built from `Field` and `Button` in `app/_components/primitives.tsx` and nothing
else; no second design system (§7.5), no GSAP.

- **Not locked, owner** — a `DELETE ORGANISATION` section, last on the page,
  stating exactly what is removed and that it is restorable for 30 days, behind
  a confirmation that requires typing the organisation's slug.
- **Not locked, member** — the panel renders `null`. Presentation only; the
  action refuses a non-owner regardless.
- **Locked** — the organisation section's intro paragraph, the "Open overview"
  link, `MembersPanel` and the alert control are all replaced by the notice
  giving the purge date. An owner additionally gets "Restore organisation"; a
  member gets the notice and a line saying an owner can reverse it.
  `CreateOrganizationForm` does **not** appear: a locked organisation is not "no
  organisation yet". The three tenant reads the page makes are skipped entirely
  while locked, since nothing renders them.

The `MetaPair` block naming the organisation, its identifier and the viewer's
role stays in both states — it says what is being deleted.

### Email

One best-effort message per owner on a deletion request, through
`lib/email/organization.ts` (extended, not forked) and a new template
`lib/email/templates/organization-deletion.tsx`. It states the purge date, what
goes, and how to restore.

- **A failed send never fails the write** (§10 rule 4). The row is committed
  first; a sender returns rather than throws, and the whole loop is inside a
  `catch` that swallows silently.
- **Idempotency key folds in a sha256 of the recipient** — the fan-out reasoning
  `sendTargetAlert` records: one request goes to every owner, and Resend answers
  a repeated key carrying a different payload with a 409, so without it the
  second owner would never be told. The address itself is never in the key.
- **Recipients come from a new `listOwnerEmails`, not `listAlertRecipients`.**
  That read filters on the `alert_preference` opt-out, which is a preference
  about *target threshold* email; reusing it would make a notice about erasure
  suppressible by an unrelated switch.
- **No message on the purge**: by then there is no workspace to link to and the
  address was already told the date.
- The template names no person — every recipient is an owner and the requester
  is one of them, so naming a colleague inside an automated destructive notice
  is a disclosure the flow does not need. The audit row records the user id.

`formatExpiry` in `lib/email/organization.ts` was renamed `formatDate`, since it
now formats a purge date as well as an invitation expiry. Behaviour identical.

### Rate limiting

`checkOrganizationDeletionLimit`, keyed by **user id**, **10 per hour**,
request and restore sharing one bucket. **A judgement, not a measurement**, like
every window in that file. Deliberately the tightest there: there is no honest
use that repeats deleting an organisation, and mistyping the confirmation slug
is the only reason to try twice. The two share a bucket so an attacker who
exhausts it cannot thereby stop the owner restoring — an exhausted bucket
refuses both, and the purge is still 30 days away.

### Checks

| check | result |
| --- | --- |
| `npm run db:generate` | `lib/db/migrations/0012_brainy_luke_cage.sql` — the four statements above |
| `npm run db:migrate` | `migrations applied successfully!` |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **9 files, 210 tests passed** — `lib/domain/` is untouched, so this is a regression check |
| `npm run build` | route table below |
| prerender diff | **21 HTML files compared, 0 differing** |
| `npm run test:e2e` | Chromium and Firefox **10/10 passed**. **WebKit did not run** — `Podman is required for WebKit on Arch Linux`, still not installed, as prompts 69–72 recorded. **Stated as a gap, not a pass** |

Route table from `npm run build`: `/`, `/about`, `/careers`, `/design-system`,
`/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3)
`● SSG`; `/account` stays `ƒ`; **one new `ƒ` entry,
`/api/cron/purge-organizations`.** No route changed mode.

The prerender diff used the **two-build method** in `docs/automation.md`:
snapshot `.next/server/app` and `.next/BUILD_ID`, `git stash push -- app lib
vercel.json`, rebuild, snapshot again, `git stash pop`, diff normalising only
`BUILD_ID`. Both builds produced the **same two CSS chunk names**
(`00u7jgtk688mf.css`, `3qi1cinspn7re.css`), so no chunk normalisation was
applied and none was needed. 21 files on both sides, no file added or removed,
**0 differing**.

#### The locked-organisation walk — what was exercised, and what was not

Run against the development database, which holds exactly one organisation
(`kinsmen-01`) with one owner. **Every step was reversible and the table was
empty again at the end**; the organisation itself was never deleted and the
purge sweep was never run against real data.

Exercised, all twelve assertions passing:

- the membership join reports no lock before, and reports the lock after a
  `pending` row is inserted;
- `listAllOrganizationIds`'s anti-join sees the organisation before and
  excludes it while locked;
- the **partial unique index refuses a second open request** — the guarantee
  `createDeletionRequest`'s `onConflictDoNothing` rests on;
- the due read returns nothing while the window is open and returns the row once
  `scheduled_purge_at` has elapsed;
- cancelling unlocks the membership and restores the organisation to the sweep;
- a **cancelled** row does not block a subsequent open request;
- the table is empty afterwards.

**Not exercised, and stated rather than claimed** (§12 rules 3 and 9):

- the eight `requireOrganization()` redirects and the per-flow action failures
  were **not** driven through a signed-in browser session — the E2E suite covers
  only unauthenticated redirects, and no seeded authenticated fixture exists in
  this repository. The lock is one `if` in each of the two chokepoints plus the
  five direct call sites listed above, all type-checked, and the data those
  branches read was exercised above; that is weaker than a walk-through and is
  recorded as such.

  > **Corrected at prompt 74** (§12 rule 8). The last sentence of that bullet
  > is no longer true: an authenticated fixture now exists — `e2e/auth.setup.ts`
  > and `e2e/authenticated.spec.ts` — and all eight `requireOrganization()`
  > pages are walked by a browser holding a real session, in both the member
  > and the member-less branch. **What is still not walked is the lock itself**:
  > prompt 74's fixture creates no `organization_deletion` row, so the
  > `pendingDeletion` redirect and the `authorizeOrganization` refusal remain
  > type-checked and unit-covered rather than driven. See "An authenticated E2E
  > fixture, prompt 74" below;
- **the purge itself has never run.** No blob was deleted and no cascade was
  executed against real data. The `onDelete` enumeration is read from the schema
  and the ordering argument is reasoned, not observed;
- no latency figure was taken, warm or cold.

### Prerender impact

`none — no route changes`, verified rather than assumed: 21 prerendered HTML
files byte-identical after normalising `BUILD_ID` alone. Nothing here touches a
marketing route, `SiteNav`, `SiteFooter` or a GSAP surface.
`DeleteOrganizationPanel` is a client leaf imported only by `/account`, which is
already `ƒ`.

### Trust boundary

Two new Server Actions and one new cron route.

- **`requestOrganizationDeletion`** — what crosses: the typed organisation slug,
  as a confirmation, and nothing else. Authorised by a live session **plus** a
  membership row with `role === "owner"`, re-read from Postgres on the request
  (§11.2 rule 5). **The organisation id is resolved server-side from that
  membership row and is never accepted from the request.** Validated by
  `deleteOrganizationSchema`, run in the leaf as a courtesy and in the action as
  the check; the slug comparison is against the membership row's own slug, never
  against a second browser-supplied value. Rate-limited by user id. **No BotID**:
  the path requires a live verified session, which is strictly stronger, and
  adding `/account` to `instrumentation-client.ts` is the two-file commitment
  §7.3 records. A rejected request returns the existing typed `SubmitResult` —
  never a throw, never a bare string.
- **`restoreOrganization`** — same authorisation, **no payload at all**. Bypasses
  the lock deliberately. A concurrent restore by another owner returns `ok` — the
  state the person wanted is the state that holds.
- **`/api/cron/purge-organizations`** — an external caller (§6.2's sanctioned
  category), gated fail-closed on `CRON_SECRET` with a constant-time bearer
  comparison, `401` with no body and no detail for every rejected caller. It
  holds no business logic beyond calling its sweep.

A non-owner member, a signed-out caller and a caller naming another organisation
all reach the same handled failures, and nothing in the copy discloses anything
about another tenant.

### Secrets and data

- **No new environment variable.** `CRON_SECRET` already exists — confirmed from
  `vercel env ls` (names only, §8.4: Development non-sensitive, Preview and
  Production sensitive). No `NEXT_PUBLIC_*` was added and `.env.example` is
  unchanged.
- **Personal data**: the audit row stores a user id and the organisation's name
  and slug. **No email address and no person's name** — the minimum that keeps
  the trail readable after the purge (§8.3 rule 1). Owner addresses are read at
  send time and not stored by this change.
- **Nothing is logged** on any path or in any catch — not a request body, not an
  address, not a slug, not a blob pathname. `purge_error` is written from a
  closed two-value vocabulary so it cannot carry a customer's data. The email
  module's two `console.warn` lines carry the deletion row's id and the
  provider's reason only, matching the invitation sender beside them.
- Every new `lib/` module carries `import "server-only"`;
  `lib/validation/organization.ts` stays the deliberate exception and still
  imports nothing from `lib/db/`.
- **This is the change that makes retention finite** (§8.3 rule 5), which is the
  point of it.
- **No model is called** — §5.3's phase-one bar applies; nothing here benefits
  from one.

### What prompt 73 deliberately did not do

| not done | why |
| --- | --- |
| enabling Better Auth's `deleteOrganization` endpoint | `disableOrganizationDeletion: true` stays. Its cascade is immediate and unaudited, which is the mismatch `lib/auth/server.ts:126-132` recorded |
| a `beforeDelete` hook that throws to archive | the `organization-best-practices` skill's suggested soft-delete pattern, loaded and declined: it works by making a documented endpoint fail, and §10 rule 2's "never throw" is the house rule |
| adding a column to any Better Auth table | §9.1, and the three reasons above |
| deleting a **user** account, or `lead` / `subscriber` / `application` erasure | a different subject with different rules; those three already soft-delete |
| an admin-side control to delete another tenant's organisation | §11.1's orthogonality — staff are not members, and a staff bypass is the failure `lib/auth/organization.ts:23-35` exists to prevent |
| a data export before deletion | genuinely wanted, genuinely separate: step 13's report export exists, and "download everything" is its own prompt with its own format decisions |
| an email on the purge itself | there is no workspace to link to by then, and the date was already given |
| an authenticated E2E fixture | it would be the right way to walk the eight redirects, and it is a prompt of its own — the gap is recorded above rather than papered over. **Built by prompt 74**; this row is left standing as the reason it was a separate prompt |
| changing the 02:00 recalculation sweep's schedule or logic | beyond excluding locked organisations from `listAllOrganizationIds()`, which was required |
| set-metadata editing, retiring a set from the UI, bulk CSV import, market-based scope 2 | untouched prior deferrals |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68, 69, 70 and still deferred |
| re-pointing existing organisations' mappings at a newer set | prompt 70's deferral, unchanged |
| any change to a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | out of scope entirely |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work, as prompts 63–72 were |

## Aligning the custom-factor form's fields, prompt 72

Implemented on 13 Aug 2026, from a screenshot of the live page: "make the text
boxes consistently aligned and inline". Layout only — no action, schema, query
or validation rule is touched.

### The root cause, read out of the code

`FieldFrame` (`app/_components/primitives.tsx:224-268`) renders label → hint →
control → error in normal flow inside a plain `<div className={className}>`, and
the hint at `:252` is conditional. `CustomFactorForm` lays its fields out in
`md:grid-cols-2`. **A grid item's content starts at the item's top edge**, so a
field carrying a hint started its control one hint-height — a measured 30px —
below the field beside it. Three rows paired a hinted field with an unhinted
one, and the taller row read as broken vertical rhythm rather than as `gap-6`.

The form's local `SelectField` renders no hint, so the selects always aligned.

### Why the fix is local, and not in `FieldFrame`

`Field` / `TextareaField` / `FileField` are consumed by sixteen modules,
including `/design-system`, `/sign-in`, `/sign-up`, `/forgot-password`,
`/reset-password`, `/verify-email` and the three dialogs on `/`, `/journal`,
`/careers` and `/job-listing/[slug]` — all prerendered. Changing the frame's
markup or class strings rewrites almost every static route's HTML, which is what
`CONTROL_BASE`'s own comment at `primitives.tsx:214-217` already guards against.
`/activity/factors` is `ƒ Dynamic`, so a fix scoped to it costs no prerendered
byte. `Field` forwards `className` onto the frame div, so no primitive changed.

### The mechanism, and the one the prompt proposed instead

`FIELD_ALIGN = "md:flex md:flex-col md:justify-end"`, passed to all 19 `Field` /
`TextareaField` elements in the three grid blocks — not only the hinted ones, so
a field that gains a hint later cannot reintroduce the bug. A grid item stretches
to its row's height, so hanging the label/hint/control stack off the item's
bottom edge puts two equal-height (52px) controls on the same line.

**Prompt 72 specified `[&>input]:mt-auto` instead. It was tried first, measured,
and rejected** — its selector `.[&>input]:mt-auto > input` outranks the `mt-2`
on the control, so on the tallest item in each row, where there is no slack to
absorb, `margin-top` resolved to 0 and the label sat flush against its input.
Measured on the live page at 1350px, candidate B collapsed the label→control gap
to **0** on every unhinted row (Level 1/2, Level 3/4, Effective from/to, Region,
Notes) and to **30** from 38 on every hinted one, and shortened the form by
about 50px. `md:justify-end` moves the whole stack and preserves both gaps
exactly. This is a deviation from the approved prompt's stated mechanism, taken
on the measurement above, not on preference.

### The two hand-tuned offsets, re-derived

Both now follow **one rule: a companion line beside a control centres on that
control's text line.** The control's own top is `16px` label (`--text-nav` is
16px at `--text-nav--line-height: 1`) + `8px` (`mt-2`) = **24px**, and the slack
between a 52px control and a 24px `leading-6` line is `(52 - 24) / 2` = **14px**.

| element | was | now | derivation |
| --- | --- | --- | --- |
| the two set-description notes, and prompt 71's supersession note | `md:mt-[30px]` | `md:mt-[38px]` | 24 + 14. **Measured**: the note's first line box centre and the select's centre both land on the same y (1481 and 1481 at the measured scroll). The old 30 put it 8px high. Whether centring on the control's text beats the old nudge is a **judgement**, taken on a zoomed comparison of the two |
| the biogenic checkbox | `md:mt-[34px]` | `md:mt-0 md:mb-[14px] md:self-end` | the same 14px, read from the row's **bottom** edge instead of its top. **Measured**: its line centre and the Region control's centre are both 2936. The old 34 sat 4px high, and it assumed a partner with no hint — the scope and gas selects change which field that is, so a top offset could not stay right |

### The alignment measurement

Chrome at **1350 CSS px** (`devicePixelRatio` 0.75, so a 1013px window), signed
in as an owner on the dev server, `document.fonts.ready` awaited, reading
`getBoundingClientRect().top` of every `input` and `select` in the three grid
blocks. Control top is given relative to its grid row's top edge.

| grid row | before | after |
| --- | --- | --- |
| Source / Dataset-version | 54 / 54 | 54 / 54 |
| **Publication year / Licence or basis** | **24 / 54** | **54 / 54** |
| Effective from / Effective to | 24 / 24 | 24 / 24 |
| Licence URL / Source URL | 54 / 54 | 54 / 54 |
| Internal source reference / Notes (textarea) | 54 / 24 | 71 / 24 — bottoms now agree at 2178 |
| Level 1 / Level 2, Level 3 / Level 4 | 24 / 24 | 24 / 24 |
| **Column text / Published unit** | **54 / 24** | **54 / 54** |
| **Published GHG unit / Value** | **24 / 54** | **54 / 54** |
| Scope / Activity unit, Gas / GWP set | 24 / 24 | 24 / 24 |
| Region / biogenic checkbox | 24 / 34 | 24 / checkbox line centred on the control |

The label→control gap is unchanged everywhere: **8px** without a hint, **38px**
with one. Re-measured with `scope_3` and `ch4` selected, which insert two more
selects and re-pair every following row: all eight rows still agree.

### The limit, stated rather than hidden

**If exactly one field in a row carries a validation error, that row's two
controls disagree while the error is on screen** — the errored field's stack is
taller by its error line, so it rides up. Measured by submitting the empty form
(11 field errors): Column text 1556, Published unit 1530, a **26px**
disagreement, against the **30px** that row showed permanently before this
change and in every state. Closing it properly needs `grid-rows-subgrid` over
the whole form, which is a larger change to a settled layout than the reported
defect warrants, and is deliberately not done.

### Prerender impact and verification, prompt 72

**None, and verified rather than assumed.** `/activity/factors` is `ƒ` and
nothing else imports `custom-factor-form.tsx`. The copy-tree two-build diff
(`docs/automation.md`, traps 1-6) at parent `714f764`, both sides excluding
`.claude/` and `.agents/`, `BUILD_ID` and both content-hashed chunk patterns
normalised and `self.__next_f.push` stripped: **21 HTML files each side, same
path set, 21 identical, 0 differing.** The two route tables `diff` clean.

The CSS chunk moves, as a class-string change must: **68,208 → 68,506 bytes**
(+298). No prerendered HTML references it by name, because the name is
normalised out — the chunk is content-hashed and the HTML carries the hash only.

### Checks run, prompt 72

| check | result |
| --- | --- |
| `npm run lint` | clean, no diagnostics |
| `npm run typecheck` | clean, no diagnostics |
| `npm test` | **9 files, 210 tests passed** in 832ms — unchanged, as expected |
| `npm run build` | both trees exit 0; `/activity/factors` stays `ƒ`, every `○` and `●` route unchanged |
| prerender diff | 21 compared, 21 identical, 0 differing |
| `npm run test:e2e` | Chromium and Firefox: **10 passed** in 26.4s. **WebKit did not run** — `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux", which is unchanged from earlier prompts and is **not** reported as passing |

### What prompt 72 deliberately did not do

| not done | why |
| --- | --- |
| touching `FieldFrame`, `Field`, `TextareaField`, `FileField` or `CONTROL_BASE` | §8.1 — it rewrites the prerendered HTML of nine static routes |
| `grid-rows-subgrid` over the whole form | the complete fix for the one-error-in-a-row case, and a larger change than the defect warrants |
| restyling the form — spacing scale, field order, `max-w-[980px]`, `gap-6` | the report is about alignment, not the design |
| the same treatment on the other twelve `Field` consumers | none was reported, and each carries its own prerender question |
| the local `SelectField` | it renders no hint, so its controls already aligned |
| anything behind the form — the action, the schema, the queries, prompt 71's supersession behaviour | untouched. No migration; `npm run db:generate` was not run |

## An authenticated E2E fixture, prompt 74

Implemented on 14 Aug 2026. Until this change, **every phase-two surface was
verified by type-checking, by `npm test` over `lib/domain/`, and by hand — never
by a browser holding a session.** `e2e/home.spec.ts` could assert only that a
signed-out caller is turned away. That was the weakest link in this
repository's verification story, and prompt 73's own record named it as the gap
every later prompt would inherit.

### What was added

| file | what it is |
| --- | --- |
| `e2e/support/fixture.ts` | the run-scoped identity, the paths under `e2e/.auth/`, and the record the three halves share |
| `e2e/support/database.ts` | the fixture's own `pg` pool over `DATABASE_URL_UNPOOLED`, the one direct write, the row-count readback and the deletes |
| `e2e/auth.setup.ts` | a Playwright *setup* project that provisions three identities and two organisations |
| `e2e/auth.teardown.ts` | the matching *teardown* project — deletes, then reads the row counts back |
| `e2e/authenticated.spec.ts` | the walk |
| `playwright.config.ts` | the setup/teardown projects, and two test-run environment values |
| `.gitignore` | `/e2e/.auth/`, which holds live session cookies |

`e2e/home.spec.ts` is **unchanged**, and the saved sessions are applied
per-`describe` rather than as a project-wide default, so its five
unauthenticated assertions still mean what they said.

### How the fixture is built, and the one direct write

Through the application's own HTTP surface, in this order, per identity:

1. `POST /api/auth/sign-up/email` — so the password is hashed by Better Auth's
   own hasher and the `account` row is shaped by the library;
2. **`UPDATE "user" SET "email_verified" = true`** over the direct connection;
3. `POST /api/auth/sign-in/email`;
4. `POST /api/auth/organization/create`, which makes the caller the **owner**
   (`creatorRole: "owner"`) and runs the real `allowUserToCreateOrganization`
   verified-only gate rather than bypassing it — which is why step 2 has to come
   first;
5. `context.storageState()` to a gitignored path.

**Step 2 is the only row the fixture may not obtain honestly.** Verification
arrives by email and §8.3 forbids a test reaching into a mailbox. It is a
developer-run script write with no request path, exactly like `db:seed:factors`.
Everything else is the library's business: a hand-written `account` row would
need Better Auth's scrypt output and a hand-written `member` row the plugin's
role vocabulary, and a fixture that fabricates either stops testing the thing it
exists to test the moment the library changes shape (§12 rule 6).

`lib/auth/server.ts` is **not** imported by the setup script — it carries
`import "server-only"`, which throws outside the `react-server` condition, and
§6.2's boundary is not something a test may route around.

The three identities: an **owner** of one organisation; an **unaffiliated**
verified user with no organisation at all; and a **neighbour** owning a second
organisation that nothing ever signs into, so the tenant-boundary assertion
excludes a name that really is in the database rather than one that never
existed.

### The origin resolution, as it actually landed

`.env.local`'s `BETTER_AUTH_URL` names `http://localhost:<port>`; Playwright
serves on `http://127.0.0.1:3100`, and **those are different origins.** Better
Auth seeds its trusted origins from `BETTER_AUTH_URL` and validates the `origin`
header on any auth `POST` that carries a cookie
(`api/middlewares/origin-check.mjs`, `validateOrigin` — the check is skipped
only when no cookie is present, which is why the first sign-up would have
succeeded and everything after it failed).

**Resolved by `webServer.env` in `playwright.config.ts`**, a test-run value for
a variable that already exists. **Not** by editing `.env.local`, and **not** by
`advanced.disableCSRFCheck` or `disableOriginCheck` — both are flagged as
security risks by `better-auth-security-best-practices`, and both would weaken
the shipped application to suit a test. `.env.example` is unchanged and no new
variable exists.

Two consequences worth writing down, both verified in `node_modules/` rather
than recalled:

- Playwright merges `webServer.env` **over** `process.env`
  (`playwright/lib/runner/index.js`), and `@next/env` never applies a `.env`
  value to a key already present in `process.env`, so the override wins in
  `next start`.
- Better Auth derives cookie security from the base URL's scheme, not from
  `NODE_ENV` (`cookies/index.mjs`), so an `http://` base URL yields non-secure
  cookies and the session survives a production build served over plain HTTP.

### The email decision: suppressed, not accepted

`sendOnSignUp` is on, so each sign-up would hand a synthetic address to a real
provider. **`RESEND_API_KEY` is emptied for the test run**, alongside the
`BETTER_AUTH_URL` override. `lib/email/send.ts` throws on an unset key and
`lib/email/auth.ts` catches it, so suppression costs nothing and changes no code
path under test — the observed server line is
`[email] account-verification failed: account-verification:transport-failed`,
which names a template and no address (§8.3 rule 2).

Letting the sends run would have bought nothing: `lib/email/config.ts`'s sender
is Resend's sandbox address, which delivers only to the Resend account's own
address and refuses every other recipient. So the mail could not have arrived,
and a run that generates provider traffic for no observation is a
deliverability cost with no return (`email-best-practices`). The fixture's
address is under `example.com`, reserved by RFC 2606, so it could not reach a
person even if a send escaped.

### Teardown, and what "left as it found it" is measured against

The setup project counts every relation it could reach **before** writing
anything; the teardown project deletes in dependency order and counts them
again, asserting each delta is zero. Across three full runs the seven counted
relations — `user`, `session`, `account`, `verification`, `organization`,
`member`, `invitation` — came back identical every time; the teardown assertion
is what proves it, and a leftover row fails the run rather than sitting
unnoticed. The run-scoped suffix means a crashed run cannot collide with the
next one.

Two deliberate exclusions, stated rather than papered over:

- **`verification` is counted but never deleted.** Better Auth's email
  verification is a signed JWT (`createEmailVerificationToken` in
  `api/routes/email-verification.mjs`) and writes no row at all, and this
  fixture never requests a password reset — the flow that does write one, keyed
  by its token rather than by an address. There is nothing to target by run id,
  and the readback is what proves the count did not move.
- **`rate_limit` is neither deleted nor asserted on.** Its key is `<ip>|<path>`
  (`@better-auth/core/utils/ip.mjs`, `createRateLimitKey`) and carries no user
  reference, so a row this run caused cannot be told apart from one any other
  local request caused. Better Auth prunes them itself once the window passes.
  The delta is **printed** by the teardown project instead — observed 2 → 5 on
  the first run and 3 → 3 on the two after it. Inventing a scope for the delete
  would be worse than naming the gap.

### Rate limiting, and why the fixture signs in once

`/sign-in*` and `/sign-up*` carry Better Auth's own special rule of **three
requests per ten seconds**, per IP and per path
(`api/rate-limiter/index.mjs`, `getDefaultSpecialRules`), with
`storage: "database"` in `lib/auth/server.ts`. The run makes exactly three of
each, which sits on the boundary, so `authPost` honours a 429's `X-Retry-After`
rather than treating it as a failure. Signing in **once** per identity and
reusing `storageState` across the browser projects is what keeps it to three; a
per-test sign-in would trip the limiter and produce a flake that reads as an
auth bug.

### What is now exercised

48 tests per full local run — the five pre-existing unauthenticated ones plus
new ones, across Chromium and Firefox:

| assertion | branch it enters |
| --- | --- |
| the six id-less `requireOrganization()` pages return 200 with one `h1` for a member | the pass branch, on `/dashboard`, `/targets`, `/reports`, `/activity`, `/activity/mappings`, `/activity/factors` |
| `/activity/<absent id>` answers 404, not a sign-in redirect | the seventh call site, past the gate and into the page's own not-found path |
| `/reports/<absent id>` answers the not-found markup, not a sign-in redirect | the eighth call site — see the status finding below |
| `/account` renders for the owner | the surface a locked or member-less caller is sent to |
| a member-less user is sent from all six pages to `/account`, never to `/sign-in` | **`requireOrganization`'s second branch, which no test had ever entered** — and the one an ordinary new signup meets |
| the owner's dashboard names its own organisation and never the neighbouring one | the tenant edge. `resolveTenant` accepts no organisation id from the request, so there is no id to tamper with; the assertion is on what a non-member sees |
| a forged session cookie is turned away with a redirect to `/sign-in?callbackURL=%2Fdashboard` | **§7.3's `getSessionCookie()` trap, asserted rather than trusted.** `proxy.ts` lets the forged cookie straight through by design; the database-backed check is what catches it. The cookie names are read from the real saved session rather than written out, so the assertion cannot drift from what Better Auth actually sets |

### Two findings this walk produced

**1. `/reports/[reportId]` answers an absent report at HTTP 200, where
`/activity/[importId]` answers 404.** Measured on both Chromium and Firefox; the
not-found markup renders correctly in both cases, only the status differs. The
mechanism is `app/reports/loading.tsx`: the `/reports` segment has a Suspense
boundary, so the shell — and with it the status — is committed before
`notFound()` runs inside it. `app/activity` has no `loading.tsx` and so
completes its render before the status is sent.

This is a real defect for a crawler or an API client and a non-issue for a
person reading the page. **It is reported, not fixed**: fixing it is a separate
change and needs its own decision, so `e2e/authenticated.spec.ts` asserts what
the gate is for — no sign-in redirect, not-found markup rendered — and
deliberately does not lock the status in either way. The reasoning is recorded
at the test itself.

**2. `/activity` returned HTTP 500 once, on Chromium, during the first full
run**, with the application's own error surface and an error digest. **The cause
was not captured and is not known.** It did not recur in a targeted 3×
re-run at four workers, nor in either of the two subsequent full runs. A
cold-compute effect on the first burst after `npm run build` is *plausible*
given Neon's scale-to-zero (§7.3) but is a **hypothesis, not a measurement** —
no server-side trace was taken, and the digest was not resolved to a stack.
Recorded here so a recurrence is recognised rather than met fresh.

### Prerender impact

`none — no route changes`, **verified, not assumed** (§8.1). Built per
`docs/automation.md`'s procedure against `HEAD`:

- **0 of 21 prerendered HTML files differed** after normalising `BUILD_ID`, both
  chunk-name patterns and the flight-data scripts; the file sets are identical.
- **CSS: 68,506 bytes on both sides — delta 0**, and no rule added or removed.
- `npm run build` reports the same route table: `/` and the other marketing
  routes still `○`, the six articles and three job listings still `●`, 32 static
  pages generated.

**The Tailwind prose trap fired, and it fired from the prompt file.** The first
comparison showed +219 bytes and one added filter-utility rule, traced to a bare
English verb in `prompts/74-authenticated-e2e-fixture.md`'s non-goals — Tailwind
v4 scans `prompts/` too. The first reword then **re-shipped the same rule by
quoting the offending word while explaining the fix**, which is exactly the
extension `docs/automation.md` records. Describing the token instead of
spelling it brought the delta to zero. Three builds were needed to reach a clean
result; the check is only trustworthy when re-run after the documentation is
written, not only after the code is.

### Trust boundary

**No new request path, and no change to any existing one.** No Server Action, no
Route Handler, no form, no schema. **No authorisation check is relaxed,
parameterised or given a test-only branch** — there is no `NODE_ENV` or `E2E`
conditional anywhere in `lib/auth/`, `proxy.ts` or any page, `proxy.ts`'s
matcher is untouched, and neither `disableCSRFCheck` nor `disableOriginCheck`
appears. The fixture is an ordinary client of the existing public auth
endpoints holding an ordinary session, and can do nothing a real signed-in user
could not — with the single stated exception of the direct `email_verified`
write above.

### Secrets and data

- **No new environment variable.** The fixture reads `DATABASE_URL_UNPOOLED`,
  already present; `BETTER_AUTH_URL` and `RESEND_API_KEY` are overridden **for
  the test run only**. `.env.example` is unchanged.
- **No `NEXT_PUBLIC_*`.**
- **No secret is echoed.** Key names only, here and in the code.
- **No real personal data.** The addresses are synthetic and run-scoped, the
  password is generated per run and never committed, and `e2e/.auth/` is
  gitignored because **`storageState` holds a live session cookie and is a
  credential** — the teardown project removes the directory along with the rows
  it authenticates against.
- **Nothing is logged** — not an address, not a cookie, not a password. The
  shape of the fixture address is recorded above; no instance of one is.
- **No model is called.**

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | 9 files, 210 tests passed — unchanged; nothing in `lib/domain/` was touched |
| `npm run build` | compiled successfully, 32/32 static pages, same route table |
| prerender diff | **0 of 21 differed**, CSS delta 0 |
| `npm run test:e2e:local` | **48 passed** (Chromium + Firefox), ~1.5 min wall-clock per run against a warm database; three full runs, the first of which produced finding 2 above |
| `npm run test:e2e:webkit` | **did not run — Podman is absent on this machine**, and `scripts/playwright-webkit.sh` says so and exits. Chromium and Firefox only, as prompt 71's record also reported. `scripts/playwright-webkit.sh` and the Containerfile are unchanged |
| row-count readback | zero delta on all seven counted relations, every run |

No migration was generated and `npm run db:generate` was **not** run — the
schema is untouched.

### What prompt 74 deliberately did not do

| not done | why |
| --- | --- |
| **AI factor matching** | §5.3 sanctions it and does not schedule it. Deferred by prompts 65, 68, 69, 70 and 73, and deferred again here for the sixth time: it sits on the path that decides a filed disclosure figure, and putting a model near factor selection while the authenticated surfaces had no browser-level verification at all was the wrong order. That objection is now answered, which makes it the strongest remaining candidate |
| fixing finding 1, the report not-found status | a separate change with its own decision; papering over it in the test would have been worse |
| chasing finding 2, the one-off 500 | not reproducible in three attempts and no trace was captured; inventing a cause would be worse than recording the observation |
| seeding activity records, imports, factors, targets or reports | the walk is of the **gates**, not of the workspaces' contents. A data-bearing fixture is a much larger prompt and would bury the authorisation result it exists to expose |
| walking the deletion lock, the restore control or the purge sweep | prompt 73's purge has still never run, and making it run in a test deletes blobs — a real want and a separate decision. The corrected bullet in that section says so explicitly |
| an E2E walk of `/submissions` and the staff/admin roles | §11.1's roles are orthogonal to tenant membership and need their own fixture with a granted `user.role`. The obvious follow-up, named rather than smuggled in |
| a CI workflow | nothing in this repository runs CI today; adding one is its own decision |
| a new `package.json` script | none was needed. The existing three E2E scripts pick the new projects up through `dependencies` |
| any change to a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | §8.1 and the front matter's settled surfaces |

## An E2E walk of the factor picker, prompt 77

Implemented on 14 Aug 2026. **Prompt 76 shipped `/activity/mappings`'s wording
search with no browser-level verification at all** — its own record above lists
`npm run test:e2e:local` as "no test result" and names the interactive focus
behaviour as the thing nothing had ever exercised. That was the newest and
largest verification gap in the repository, and it sat on the surface that
decides which factor multiplies a disclosure figure. This walk closes it.

Nothing under `app/` or `lib/` changed. The whole change is `e2e/`.

### What was added

| file | what it is |
| --- | --- |
| `e2e/factor-picker.spec.ts` | the walk — three tests in a `test.describe.serial`, under `test.use({ storageState: OWNER_STATE_PATH })` |
| `e2e/support/fixture.ts` | six activity relations added to `COUNTED_TABLES` |
| `e2e/support/database.ts` | the matching deletes in dependency order, plus the blob cleanup below |

No new `package.json` script and no new Playwright project: the existing browser
projects pick a new spec file up through `testDir` and their
`dependencies: ["setup"]`.

### The dependency, and why the import is obtained through the UI

`/activity/mappings` renders the picker **only when the organisation has
committed activity records** — `app/activity/mappings/page.tsx` answers
`coverage.length === 0` with the "No committed activity records yet." section
and renders neither the coverage column nor "Choose a factor". Supplying
`?category=…&unit=…` does not route around it; `selected` is consulted only
inside the non-empty branch. Prompt 74's fixture deliberately seeds no activity
data, so this walk had to make the surface reachable.

**It does so through the application's own UI** — `setInputFiles` with a buffer
the test wrote, "Stage import", then "Commit 2 rows" and "Confirm commit" — not
by writing rows into the database, which is the same discipline prompt 74
applied to sign-up and organisation creation. Two rows in one `(category, unit)`
pair, `fuel` + `L`, chosen because DESNZ publishes many `litres` rows and that
is what gives the wording search something to rank; the dates sit inside the
seeded 2026 set's activity window, so the pair is calculable rather than out of
period. Headers are named canonically, so the alias set in
`lib/domain/activity-import.ts` has nothing to guess at.

### What is now exercised, and which branch each assertion enters

| assertion | the branch it enters |
| --- | --- |
| staging | `stageImport`, then the review view's own summary — `6 of 6 fields are mapped, from a file with 6 columns.` and the override form's six selects, each holding its resolved column index |
| commit | `commitImport`'s transaction, then the Server Component's re-render reporting `The rows below are part of your activity records.` with the commit section gone |
| exact-text search | `searchFactorsForPair`'s substring pass — at least one result row labelled `Exact text match` |
| close wording, on a misspelling (`diesal`) | `searchFactorsByWording`'s ranked pass — a row carrying `Close wording` or `Weak wording match`, plus the caveat line about character groups |
| the invalid path | `factorSearchSchema`'s `superRefine`, and the branch rendering the refusal as `role="alert"` — **and `factor-picker.tsx`'s `searchStatusRef` focus effect, which nothing had exercised before this line.** The assertion reads `document.activeElement`, so it proves the refusal *holds focus* rather than merely being announced |
| search never mutates | the pair's coverage row, read before and after all three searches, is unchanged |

Every locator is an accessible role or visible text. The class names are settled
design output and a test must not pin them.

**Nothing here asserts a timing, a similarity score or a band threshold.**
Prompt 76 measured 299–723 ms warm against a scale-to-zero database (§7.3); a
threshold on that is a flake generator and would be a judgement dressed as a
measurement (§12 rule 4). `0.10` is a recorded product judgement, so the
assertion is that *a* band label renders, never that a given query lands in a
given band.

### Two comparisons that needed care, and why they are written the way they are

- **The coverage comparison blanks every digit run** before comparing. The two
  browser projects run the same walk against the same organisation
  concurrently, so a record count moving between two reads is the other project
  committing — never a mutation the searches caused, which is the only thing
  that comparison is about. Mapped-or-not, the factor's label, its source and
  who chose it all survive the blanking.
- **Waiting on a URL *pattern* would not wait at all.** `waitForURL` resolves
  immediately when the current URL already matches, and every search lands back
  on `/activity/mappings`. The predicate form compares against the URL the page
  was on, so it waits for the real navigation.

### The counted relations, and the blob

`COUNTED_TABLES` gains **six**, not the four prompt 77 named. `site` and
`activity_import_row` are the two it did not: `commitImport` upserts a `site`
per distinct normalised name (`lib/db/activity-queries.ts:468`) and the staging
path writes one `activity_import_row` per parsed line (`:604`). The list is
widened rather than the count narrowed — a relation missing from it is a
leftover row nothing would fail on.

`activity_factor_mapping` and `activity_emission` are counted even though this
walk may write neither: nothing on the read paths it visits calls
`recalculateOrganization`. Counting them is what would catch that changing.

**The blob is deleted before the row that names it.** A committed import keeps
its uploaded CSV — only a discard deletes it — so without this the walk would
leave one private file per run in the store forever, which is §8.3 rule 5 read
backwards. The package's own `del` is called with the token passed explicitly,
**not** `lib/storage/activity-import.ts`, which carries `import "server-only"`
and is a boundary a test may not route around (§6.2), exactly as the fixture's
pool is not `lib/db/client.ts`. It is best-effort and silent: a delete failure
must not replace the teardown's real outcome — the counted readback — with a
secondary one, and there is nothing loggable there that is not a customer's
data.

### What the walk found, and is reporting rather than fixing

Both are test-authoring findings, both were fixed in this file, and neither is a
defect in the application:

1. **`Not mapped` is the empty option of every one of the six mapping selects**,
   so it is present six times on a fully mapped import. An assertion that its
   count was zero failed the first run — on the test, not on the application.
   The page's own summary sentence and the six resolved select values are
   asserted instead.
2. **The commit needs a wait budget, and the default 5 s expired mid-commit** —
   with the button still reading "Committing..." — on both projects on the
   second run. The commit is one transaction against a scale-to-zero database,
   the two projects run it concurrently, and `router.refresh()` re-renders the
   page afterwards. `COMMIT_WAIT` is 45 s and the test timeout is raised to
   120 s so the budget is reported as the assertion it belongs to rather than as
   a test timeout. **Nothing claims the commit takes any particular time.**

Also observed, and not a finding about this change: **the first `npm run build`
of this session failed on `next/font/google`** with
`Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'`.
That is a font fetch with no network, not a code fault; the two builds after it
were clean with zero `Module not found` lines. Recorded because a session that
hits it once should not go looking for a regression.

**Neither of prompt 74's two open findings was touched** — `/reports/[reportId]`
answering an absent report at 200, and the one-off `/activity` 500. Both remain
open, both are changes to shipped behaviour with their own decisions, and this
walk visits neither route.

### Which of prompt 76's gaps this closes

Prompt 76 left two, and named them as environment limitations rather than
passes:

| gap | state now |
| --- | --- |
| the four authenticated browser cases, and the interactive focus behaviour | **closed.** All four are asserted, and the focus effect is read from `document.activeElement` |
| WebKit | **still open, unchanged.** `scripts/playwright-webkit.sh` exits with `Podman is required for WebKit on Arch Linux.`, as on every prompt since 71 |

### Prerender, trust, secrets

**Prerender impact: none, verified.** The route table is unchanged — `/`,
`/about`, `/careers`, `/journal`, `/design-system`, `/forgot-password`,
`/reset-password`, `/sign-in`, `/sign-up`, `/verify-email` and `/_not-found`
static; `/article/[slug]` (6) and `/job-listing/[slug]` (3) SSG; everything else
dynamic. After normalising the build id, both chunk-name patterns and the RSC
flight payloads, **0 of 21 prerendered HTML files differed**, and the CSS
compared **68,506 → 68,506 bytes, 0 rules added and 0 removed** against prompt
76's baseline. The comparison was re-run *after* this section and the prompt
file were written, because Tailwind v4 scans `prompts/` and `docs/` and a rare
word in prose can ship dead CSS on every page — it has fired twice before, once
from prompt 74's own file.

**Trust boundary: no new request path, and no existing one changed.** No Server
Action, Route Handler, schema or form was added or altered. No authorisation
check was relaxed, parameterised or given a test-only branch: there is no
`NODE_ENV` or `E2E` conditional in `lib/auth/`, in `proxy.ts` or on any page,
and neither `disableCSRFCheck` nor `disableOriginCheck` appears. What crosses
from the browser in this walk — a CSV part and a column mapping to
`stageImport`, an import id to `commitImport`, and `category` / `unit` / `q` /
`mode` as an authenticated GET — is already validated server-side by the shared
Zod schemas, and each already resolves its organisation from the session rather
than from the request. **The one write the fixture may not obtain honestly
remains the single `email_verified` update prompt 74 recorded; this prompt adds
no second one.** `checkActivityCommitLimit` was not tripped: one import per run
per identity sits well inside it.

**Secrets and data.** No new environment variable and no change to
`.env.example`; the fixture reads `DATABASE_URL_UNPOOLED` and, for the blob
cleanup, `BLOB_READ_WRITE_TOKEN`, both already present, and
`BETTER_AUTH_URL` / `RESEND_API_KEY` stay overridden for the test run only. No
`NEXT_PUBLIC_*`. No secret is echoed — key names only. No real personal data:
the CSV's site name, description and quantities are synthetic and the identities
stay prompt 74's run-scoped `example.com` addresses. Nothing is logged — not an
address, not a cookie, not a search term, not a figure (§8.3 rule 2). No model
is called. Worth stating plainly: these rows are written to the project's one
real Neon database, as prompt 74's already are, and the teardown's counted
readback is what keeps that acceptable.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output, exit 0 |
| `npm run typecheck` | clean, no output, exit 0 |
| `npm test` | **215 passed, 10 files** — unmoved from prompt 76; `lib/domain/` is untouched |
| `npm run build` | exit 0, 0 `Module not found` lines, route table above (see the font observation) |
| prerender comparison | **0 of 21 differed**; CSS 68,506 → 68,506, 0 rules changed |
| `npm run test:e2e:local` | **54 passed**, twice — **2.7 min** and **2.5 min** wall-clock, each including a production build. 48 before, so the three new tests × two projects account for all six |
| row-count readback | **zero delta on all thirteen counted relations, on both runs.** The teardown asserts each relation back to its before-count, so its pass *is* the measurement |
| `npm run test:e2e:webkit` | **did not run** — `Podman is required for WebKit on Arch Linux.` An environment gap, not a pass (§12 rule 3) |
| `npm run db:generate` | **not run.** The schema is untouched, and saying so is part of the record |

On warm versus cold (§7.3): the second run began immediately after the first and
its database was warm. The first followed a build with no database traffic
earlier in the session, so its opening query was plausibly cold — that is a
judgement, not a measurement, and the 0.2 min between the two runs is well
inside the noise of two production builds either way.

### What prompt 77 deliberately did not do

| not done | why |
| --- | --- |
| an E2E walk of `/submissions` and the staff/admin roles | §11.1's roles are orthogonal to tenant membership and want their own identity with a granted `user.role`. Named by prompt 74, named again here, and still the obvious follow-up |
| fixing prompt 74's finding 1, `/reports/[reportId]` answering an absent report at 200 | a change to shipped behaviour with its own decision. This walk touches neither route |
| chasing prompt 74's finding 2, the one-off `/activity` 500 | not reproducible in three attempts and no trace was captured |
| asserting a similarity score, a band threshold or a query latency | judgements and warm-database timings; see above |
| exercising the customer-supplied factor path, superseding, or retirement | prompts 66, 67 and 71's surfaces. This walk is prompt 76's gap, and widening it buries the result |
| the deletion lock, the restore control or the purge sweep | prompt 73's purge deletes blobs when it runs; a real want and a separate decision |
| a CI workflow | nothing in this repository runs CI today |
| any change to `app/`, `lib/`, a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | §8.1 and the front matter's settled surfaces |

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

> **Superseded by prompt 64 on 12 Aug 2026** (§12 rule 8). The index was added,
> under the second of the two options this paragraph itself allows: an explicit
> decision, taken with the user, recorded in "One membership row per
> `(organisation, user)`" below and carrying a comment so a regeneration cannot
> drop it silently. Two claims here are also narrower than they read: this
> section's `addMember` and `acceptInvitation` findings are correct, but every
> single-threaded path is refused in the application layer, so the reachable
> exposure was a race rather than the ordinary "accepting a second invitation"
> described above. The line numbers behind that are in the prompt 64 section.

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

## An E2E walk of /submissions and the staff roles, prompt 78

Implemented on 14 Aug 2026. `/submissions` was the last authenticated surface
with no browser-level verification, despite being the only route that reads all
three phase-one personal-data relations and the only route that can mint a
signed CV URL. This walk closes that gap without changing anything under
`app/` or `lib/`.

### What changed

| file | change |
| --- | --- |
| `e2e/submissions.spec.ts` | 22 browser cases covering the submissions gate, the staff/admin difference, the CV branch and admin grant/revoke |
| `e2e/auth.setup.ts` | provisions admin, staff and one grant target per configured browser project; saves the two new sessions once |
| `e2e/support/database.ts` | one narrow direct role update for fixture-owned ids and the existing exact-id cleanup path |
| `e2e/support/fixture.ts` | the two role sessions, project-derived target map and an incremental exact-id cleanup journal |
| `e2e/auth.teardown.ts` | can clean a partial setup from that journal; on a failed delete it removes live session files but preserves the non-secret id records for an exact retry |
| `playwright.config.ts` | names setup and teardown once, so the browser project list can be derived instead of copied |

No package script, schema, migration, application route, Server Action or
environment variable was added.

### The identities, and the two direct writes

The fixture still obtains the password hash, account row, sessions and
organisation memberships through Better Auth's real endpoints. Prompt 78 adds
five identities to prompt 74's three: an Aetherfield admin, an Aetherfield
staff member, and a role-less grant target for each of Chromium, Firefox and
WebKit. The targets are keyed by the names read from `playwright.config.ts`, so
a new browser project cannot silently run without one.

There are now exactly two kinds of direct fixture write:

1. `email_verified = true`, retained from prompt 74 because verification
   arrives by email and the walk must not enter a mailbox;
2. `role = 'admin' | 'staff'` on an id the fixture just created through
   sign-up. The first admin has no honest application path: public sign-up
   grants no staff role, `changeStaffRole` already requires an admin actor, and
   `setStaffRole` cannot write admin.

The second write is one parameterised update over one recorded id. No
application authorisation check was relaxed or given a test condition. The
grant/revoke case then uses `StaffRoleControl` and `changeStaffRole`, so the
application's own mutation path is the path under test.

### What the 22 cases per browser assert

| assertion | branch exercised |
| --- | --- |
| signed out on `/submissions` and on an absent CV | `proxy.ts` sends the caller to sign-in with the requested path preserved |
| a forged saved cookie with `view=applications&page=2` | the proxy admits the cookie-shaped value, the database-backed account check rejects it, and `requestedCallback` preserves both parameters |
| owner and unaffiliated sessions on both routes | `requireSubmissionsAccount`'s signed-in/no-staff branch sends both to `/account`; tenant membership is not the deciding fact |
| staff on the index | 200, three views, no Staff view |
| staff requesting `view=staff` | total fallback to Leads |
| staff on leads, subscribers and applications | no removal control, whether each real relation happens to be empty or populated |
| admin on the index | 200 and all four views |
| admin on the three submission relations | one removal control per rendered row; no control is operated |
| invalid `view` and `page`, for both roles | Leads and page 1 from the shared total-fallback parsers |
| admin's own Staff row | listed as Admin with no self-role control |
| the per-project grant target | Customer → Staff → Customer through the real action, ending at its provisioned null role |
| staff on absent and malformed CV ids | past the staff gate and into the not-found markup; the malformed value is rejected before the storage read |

The suite count is **98**: prompt 77's 54 plus **22 new cases × 2 browser
projects = 44**. Setup and teardown remain one case each. The prompt described
13 logical cases; the executable count is larger because role-less membership
has two identities, the three submission views are separate cases, parameter
fallback is asserted for both staff roles, and both CV id shapes are separate.

No assertion reads a real submission's name, address, employer, message or CV.
Row counts are used only to compare control counts. No removal control is
operated. The only row content located is a run-scoped `example.com` address
created by this fixture.

### CV status: a second instance of the known streamed-status finding

Both an absent well-formed id and a malformed id render the correct not-found
heading. On Chromium and Firefox, on both successful full runs, the navigation
response was **HTTP 200**. That is four observations per run.

This is the same mechanism prompt 74 measured on `/reports/[reportId]`:
`app/submissions/loading.tsx` lets the shell commit before `notFound()` runs in
the page below it, so the markup is correct after the status has already been
sent. Prompt 78 reports the second instance and deliberately does not fix or
lock it into the assertion. A crawler still receives 200 for a missing CV
route; changing that shipped behavior needs its own decision.

`ROLE_GATE_WAIT` is 20 seconds for the database-backed redirect destination.
It is a wait budget, not a performance assertion: the streamed shell can appear
before the role read finishes, and Lakebase Postgres can be cold. The expected
destination remains exact, and a server error still fails.

### Failure-path findings, and the cleanup hardening they required

The first parallel repeat exposed a setup failure that prompt 74's fixture
could not recover: sign-up had created a row, the next direct query met a TCP
timeout, and `run.json` did not exist yet. Teardown correctly refused to guess
which row to delete. An exact recovery found **2 synthetic users and 1
synthetic organisation** for that run and removed them; the exact-id readback
was zero.

The fixture now writes `cleanup.json` before the first sign-up and rewrites it
immediately with the id Better Auth returns after every successful user and
organisation creation. The response field was verified in the installed
Better Auth endpoint source. If setup later fails, teardown reads that journal
and uses the same exact-id deletion path as a complete run — never an address
pattern.

A later parallel run hit the same transport condition during teardown before
its first delete. The old `finally` removed the whole auth directory, including
the only exact-id record. That run was recovered by its exact synthetic run id:
**8 users and 2 organisations**, then zero exact users remaining. Teardown now
removes the directory only after deletion and the 13-relation readback succeed.
If cleanup fails, it deletes all four saved session files immediately but keeps
`run.json` and `cleanup.json`, neither of which contains a password or cookie,
so the exact cleanup can be retried.

The failed parallel runs also made an existing logging defect visible. When a
database read failed, provider/database error output included query parameters;
one Better Auth session lookup therefore printed a live fixture session token.
The token is not reproduced here. Its session row and user were deleted by the
exact recovery, so it is no longer valid. **This prompt does not change the
application logger**, but the finding remains open: a production database
failure must not print session tokens or personal-data query parameters.

### The local TCP condition and the successful run shape

Four-worker attempts became broadly unstable across existing and new tests:
the captured causes were `ETIMEDOUT` / `timeout exceeded when trying to
connect`, affecting Better Auth session reads, factor reads, actions and
teardown. This was not inferred from a failed locator; the server printed the
database causes. The same suite had passed once at four workers before the
network degraded, **98 passed in 3.5 minutes**, but that run preceded the
failure-journal hardening and is not one of the final two measurements.

The final two complete runs used the repository's documented happy-eyeballs
workaround as a process-only setting and one worker:

```sh
NODE_OPTIONS=--network-family-autoselection-attempt-timeout=1000 \
  npm run test:e2e:local -- --workers=1
```

Node 26's `--help` lists that option and a readback from
`net.getDefaultAutoSelectFamilyAttemptTimeout()` returned **1000**. It is not
committed to `playwright.config.ts`, is not an application environment
variable, and changes no assertion. Both final runs were warm: each followed
database traffic by much less than Neon's five-minute idle-suspend window, and
the second began immediately after the first. One worker is a verification
condition, not a product claim; every one of the 98 tests still ran.

### Prerender impact

`none — no route changes`, verified rather than assumed. The final comparison
was run after this section and the prompt file were present. A clean build of
`HEAD` and a clean build of the implementation produced the same **21**
prerendered HTML files; after normalising the build id, CSS/JavaScript chunk
names and the inline RSC transport, **0 of 21 differed**. Compiled CSS was
**74,718 → 74,718 bytes**, with **0 rules added and 0 removed**.

The prompt carried 68,506 bytes as the expected CSS floor from the previous
record. The clean base build itself measured 74,718, so 68,506 was stale rather
than a change caused by this work. The before/after equality and rule-set diff
are the comparison used here.

### Trust boundary

No request path changed. What crosses the existing paths remains:

- `view` and `page` on an authenticated GET, parsed by the shared total-fallback
  functions;
- the CV id path segment, checked by `submissionIdSchema` after the staff gate;
- `{ userId, role }` to `changeStaffRole`, checked by `staffMutationSchema` and
  authorised against a freshly read database role.

Inspection found **no `NODE_ENV` or `E2E` conditional** in `lib/auth/`,
`proxy.ts` or `app/submissions`, and neither `disableCSRFCheck` nor
`disableOriginCheck` appears there. Rejected callers still receive the existing
sign-in redirect, account redirect, not-found branch or typed forbidden action
result. The fixture's only extra privilege is the narrow direct role update
described above.

### Secrets and data

- No new environment variable and no `.env.example` change. The fixture reads
  the existing direct database URL; the test server still overrides only the
  existing Better Auth base URL and Resend key.
- No `NEXT_PUBLIC_*`, and no model call.
- The committed code logs only the two CV case labels and status numbers. It
  logs no id, address, row, cookie or request body.
- Saved sessions remain gitignored credentials. Successful teardown removes
  them with the rows; failed teardown removes them even while retaining the
  non-secret exact-id journals.
- The transient provider-log disclosure above is an observed open finding, not
  silently folded into the claim that nothing logged.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, exit 0 |
| `npm run typecheck` | clean, exit 0 |
| `npm test` | **10 files, 215 tests passed** (906 ms), unchanged |
| `npm run build` | exit 0, compiled in 7.8 s, 32/32 static pages, expected route table |
| final prerender comparison | **0/21 HTML files differed** after normalisation; CSS **74,718 → 74,718 bytes**, **0 rules added / 0 removed** |
| final E2E run 1 | **98 passed in 8.4 minutes**, Chromium + Firefox, one worker |
| final E2E run 2 | **98 passed in 8.5 minutes**, Chromium + Firefox, one worker |
| row-count readback | zero delta on all **13** counted relations on both final runs; `rate_limit` **3 → 3** on both |
| CV status observation | absent and malformed ids both **HTTP 200**, Chromium and Firefox, both final runs |
| `npm run test:e2e:webkit` | did not run: `Podman is required for WebKit on Arch Linux.` Environment gap, not a pass |
| `npm run db:generate` | not run; schema untouched |

The first plain `npm run build` attempt in the sandbox failed because all three
configured Google Font requests were blocked. Re-running with network access
compiled cleanly; that is an environment failure, not a code regression.

### What prompt 78 deliberately did not do

| not done | why |
| --- | --- |
| fix the streamed 200 status on missing reports or CVs | shipped behavior and a separate decision |
| add database retries to application queries | a product-wide resilience decision; the walk reports the observed transport failures instead |
| change provider/database error logging | the disclosed session parameter makes this important, but changing production logging is outside the approved E2E-only scope |
| operate a submission removal control or download a real CV | real people's data; presence and authorization only |
| assert tenant access for staff | Aetherfield staff and tenant membership remain orthogonal; tenant authorization has its own walk |
| add a CI workflow or commit the local TCP setting | neither was approved, and the latter is environment-specific |
| add a migration | no schema changed |
| change any marketing route, `SiteNav`, `SiteFooter` or GSAP surface | §8.1 and the settled-site contract |

## Better Auth database-failure log redaction, prompt 79

Implemented on 14 Aug 2026. Prompt 78 left one open finding: when a database
read failed, provider output included the query's parameters, and one Better
Auth session lookup therefore printed a live fixture session token. That token
was invalidated with its row at the time and is not reproduced here or
anywhere else. This is post-sequence hardening, not a step 15 — AGENTS.md §5.2
remains the complete ordered product build.

### What changed

| file | change |
| --- | --- |
| `lib/auth/logger.ts` | new — `safeAuthLogger`, the allowlist log sink |
| `lib/auth/server.ts` | `logger: safeAuthLogger` on the `betterAuth()` options |

Nothing else. No schema, migration, route, environment variable, dependency,
package script or UI changed, and `npm run db:generate` was not run.

### The cause, read from the installed sources

Three installed files compose into the disclosure, and each was read rather
than recalled:

1. `node_modules/better-auth/dist/api/routes/session.mjs:258` — the
   `get-session` catch calls `ctx.context.logger.error("INTERNAL_SERVER_ERROR", error)`,
   passing the caught error itself as an argument.
2. `node_modules/@better-auth/core/dist/env/logger.mjs`, `LogFunc` — with no
   `logger` option configured, the error branch is
   `console.error(formattedMessage, ...args)`. Every argument reaches the
   console verbatim.
3. `node_modules/drizzle-orm/errors.js` — `DrizzleQueryError`'s constructor
   builds its message from the query text and the bound parameter array, and
   keeps `query` and `params` as own properties. Node's console inspector
   prints both.

So the printed line carried the value the session lookup was made with.

`"INTERNAL_SERVER_ERROR"` is a literal at exactly one call site across
`node_modules/better-auth/dist/`, which is why it can be allowlisted as an
event rather than matched as a pattern.

### The safe logger's contract

`safeAuthLogger` is `server-only` and is passed as Better Auth's public
`logger` option. Its type is derived from the package's own public surface —
`NonNullable<BetterAuthOptions["logger"]>` off `better-auth/types` — so no deep
import, no copied internal logger, no `node_modules` patch.

- Output is composed from the level and an event code and nothing else. The
  line is `[Aetherfield][Better Auth] <LEVEL> <event>`.
- The event comes from a `Map` of exact provider messages verified as literals
  in the installed source. `INTERNAL_SERVER_ERROR` maps to `auth.internal_error`;
  everything else maps to one code, `auth.unclassified_event`. A `Map` rather
  than an object literal, so a provider message naming an `Object.prototype`
  member cannot resolve to an entry nobody wrote.
- **The handler's signature stops at `message`.** The rest arguments are not
  merely unused, they are unreachable — a throwing getter on an argument
  cannot be evaluated by code that never receives it, which is what makes rule
  6 of the brief structurally true rather than carefully coded.
- The level word is written out per branch, so no method is ever called on a
  provider-supplied value.
- `error` goes to `console.error`, `warn` to `console.warn`, `info` and `debug`
  to `console.log`. One line per provider call.
- `level` is deliberately not set. The installed `createLogger` applies its own
  `"warn"` threshold *before* calling a custom handler, and the custom-handler
  branch does not require the option to be stated; setting it would change the
  shipped threshold under cover of a logging fix. The sink is narrowed, not
  disabled — a safe event still reaches the log for every provider call.

**Why an allowlist and not redaction.** Matching a token-shaped substring is
the narrower change and the wrong one: the same parameter array reaches names,
work addresses, organisation rows, application fields and blob references, all
governed by AGENTS.md §8.3. Nothing provider-controlled is inspected at all.

### The deterministic fault probe

Two clean trees were built and started on unused local ports — `git archive HEAD`
for the parent, a `tar` of the working tree for the implementation, both with
`.claude/`, `.agents/` and every `.env*` file removed so the two sides read the
same environment. Each ran with a fake loopback database URL, a local
`BETTER_AUTH_URL` and a test-only 44-character secret. No real secret was read
or printed.

**A total outage does not reproduce the finding, and that matters.** With the
database wholly unreachable, Better Auth's database-backed rate limiter fails
before the endpoint handler runs, so the request never reaches the session
lookup at all; the parent printed only `rate_limit` queries. Prompt 78's
condition was *intermittent*, so the rate-limit read succeeded and the session
read did not. The probe reproduces exactly that with a minimal Postgres wire
stub held outside the repository: every statement succeeds except one naming
the session relation, which is answered with an `ErrorResponse`. The stub is
uncommitted and adds no dependency, route or environment flag.

The forged cookie's value is the non-secret sentinel
`AF79-FORGED-SESSION-SENTINEL-0000000000`. It has to carry a valid signature:
`better-call`'s `getSignedCookie` (`node_modules/better-call/dist/context.mjs`)
splits on the last `.` and verifies an HMAC-SHA-256 over the value, returning
early on a mismatch — an unsigned forgery never reaches the database and would
have proved nothing. The signature was computed with the probe's own test-only
secret.

| measurement | parent | implementation |
| --- | --- | --- |
| HTTP status | 500 | 500 |
| response body | `{"message":"Failed to get session","code":"FAILED_TO_GET_SESSION"}` | identical |
| sentinel occurrences in server output | **2** | **0** |
| `Failed query` occurrences | 1 | 0 |
| parameter-section occurrences | 2 | 0 |
| session-relation text occurrences | 2 | 0 |
| fake database user / password / name occurrences | 0 | 0 |
| total server log lines | 46 | 8 |
| safe auth events | none — the sink did not exist | `[Aetherfield][Better Auth] WARN auth.unclassified_event` and `[Aetherfield][Better Auth] ERROR auth.internal_error` |

The parent's line began `[Better Auth]: INTERNAL_SERVER_ERROR Error: Failed
query: …` and continued into the bound parameters. It is not quoted in full
here, by the same rule that keeps prompt 78's real value out of this file.

The warning in the implementation column is the provider's own
missing-social-credential notice under the probe's credential-free
environment. It is included because it is the evidence that a non-error level
still reaches the log through the correct channel: narrowing the sink did not
silence the pipeline.

### The direct fault matrix

The handler was exercised in a temporary, uncommitted probe. Every call was
handed the same hostile argument list: a `DrizzleQueryError`-shaped `Error`
carrying sentinels in its message, its stack, its `query` and its `params`; a
nested object; a self-referencing object; an object whose getter records that
it was read and then throws; plus a number, `null` and `undefined`.

| case | level | channel | lines | sentinels | threw |
| --- | --- | --- | --- | --- | --- |
| allowlisted session failure | error | `console.error` | 1 | 0 | no |
| interpolated error message | error | `console.error` | 1 | 0 | no |
| interpolated warning | warn | `console.warn` | 1 | 0 | no |
| info level | info | `console.log` | 1 | 0 | no |
| debug level | debug | `console.log` | 1 | 0 | no |
| an `Error` passed *as* the message | error | `console.error` | 1 | 0 | no |
| `undefined` message | warn | `console.warn` | 1 | 0 | no |
| an unknown static provider label | error | `console.error` | 1 | 0 | no |

**35 assertions, all passing**, exit 0. Eight calls produced eight lines. The
recording getter was never read. The only two distinct outputs across the whole
matrix were `[Aetherfield][Better Auth] ERROR auth.internal_error` for the
allowlisted label and the corresponding `auth.unclassified_event` line at each
level for everything else.

### The boundary audit, and what this does not close

Supported by the evidence above:

- **This closes Better Auth's provider-logger path for the configured auth
  instance.** Measured, not assumed: zero sentinels against the parent's two,
  on identical status and body.
- **It does not modify `DrizzleQueryError`, so an unrelated Drizzle error that
  reaches the framework still prints its message.** Also measured rather than
  reasoned: the total-outage run against the *implementation* build printed 60
  framework error blocks, each carrying `query` and `params` — here the rate
  limiter's key, which embeds the client IP address. The escaping error is
  the rate limiter's, not the session lookup's, and the sentinel never appears
  in it; but the mechanism is intact and is recorded as the next candidate
  below rather than described as fixed.
- **`onRequestError` is a reporting hook, not a suppressor.** The installed
  Next 16 documentation
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md:38`)
  describes it as a way "to track **server** errors to any custom observability
  provider", and says nothing about replacing or sanitizing Next's own output.
  The total-outage measurement above is the empirical half of the same point.
  No `instrumentation.ts` was added; the repository has only
  `instrumentation-client.ts`, and exports no `onRequestError` anywhere.

Every `console` call under `app/` and `lib/` was inspected:

| location | what it prints |
| --- | --- |
| `app/**` | **no `console` call at all** — four files carry a comment saying so |
| `lib/auth/logger.ts:88,92,96,100,103` | the level and an event code, this change |
| `lib/email/auth.ts:44,48` | a fixed event name and a fixed failure reason |
| `lib/email/demo-request.ts:90,96` | a lead id and a fixed reason |
| `lib/email/application.ts:132,138` | an application id and a fixed reason |
| `lib/email/newsletter.ts:73,81,116,121` | a subscriber id and a fixed reason |
| `lib/email/organization.ts:119,126,194,201` | an invitation or organisation id and a fixed reason |
| `lib/email/alerts.ts:91,122,131` | an alert id and a fixed reason |
| `lib/db/seed/seed-emission-factors.ts:199,244,297,330,333,340` | counts and labels in an operator-run CLI seed, not a request path |

None logs an address, a name, a row, a cookie, a token or a request body.

**The next candidate, with its exact path.** An unrelated `DrizzleQueryError`
escaping to the framework — measured above on the rate limiter's
`consume` path, whose parameters embed the client IP. Closing it is a different
change from this one (it is Drizzle's error surface and Next's error printer,
not a provider option) and needs its own evidence and decision.

### Prerender impact

`none — no route markup or render-mode changes`, verified rather than assumed.
The comparison was run after this section and the prompt file were on disk, so
Tailwind v4's scan of `docs/` and `prompts/` prose is included on the
implementation side. `docs/automation.md`'s clean two-build procedure, with
`.claude/`, `.agents/` and every `.env*` file removed from both sides and the
build id, JavaScript and CSS chunk names and inline RSC transport normalised:

| measurement | result |
| --- | --- |
| prerendered HTML files | **21** on each side, same set |
| differing after normalisation | **0 of 21** |
| compiled CSS | **68,506 → 68,506 bytes** |
| CSS rules added / removed | **0 / 0** |
| route table | identical, diffed line by line |

**Remeasure the parent; do not carry a number forward.** Prompt 78's record
puts its clean base at 74,718 bytes and its own prompt carried 68,506 as a
stale floor. This comparison's clean base — a different commit — measures
68,506 again. The load-bearing result is the parent-to-implementation equality
and the empty rule-set difference, not either absolute figure.

### Trust boundary

No new request path. The existing browser-to-server boundary remains Better
Auth's catch-all Route Handler, and the measured failure keeps its existing
status, body and cookie behavior — proven by the identical parent and
implementation columns above.

The new boundary is between a caught provider error and the server log. The
handler accepts a provider-controlled level and message and composes output
from neither's content: only from the level's identity and an allowlisted
event code. No `NODE_ENV` or E2E conditional, no `disableCSRFCheck`, no
`disableOriginCheck`, no auth fallback, no test-only Route Handler and no
swallowed error was introduced. The provider error still propagates; only its
observation changed.

### Secrets and data

No new environment variable, no `.env.example` change, no `NEXT_PUBLIC_*`, no
additional secret read, no model call. The probe used only fake loopback
credentials, a test-only Better Auth secret and non-secret sentinels, and no
value from prompt 78 appears in code, tests, transcripts or this record.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, exit 0 |
| `npm run typecheck` | clean, exit 0 |
| `npm test` | **10 files, 215 tests passed** (867 ms), unchanged |
| parent/implementation synthetic auth failure | same 500 and same body; sentinel **2 → 0**; safe event present |
| direct logger fault probe | **35 assertions passed**, exit 0; 8 calls, 8 lines, 0 sentinels, getter untouched |
| `npm run build` | exit 0, compiled in 8.8 s, 32/32 static pages |
| route table | identical to the parent build, diffed line by line |
| `npm run test:e2e:local`, default workers | **97 passed, 1 failed** in 4.8 min — see below |
| `npm run test:e2e:local -- --workers=1` | **98 passed in 6.9 min**, Chromium + Firefox, exit 0 |
| `npm run test:e2e:webkit` | did not run: `Podman is required for WebKit on Arch Linux.` `podman` is not installed here. Environment gap, not a pass — unchanged from prompt 78 |
| `npm run db:generate` | not run; the schema is untouched |
| prerender/CSS comparison | **0 of 21** HTML files differed; CSS **68,506 → 68,506** bytes, **0 rules added / 0 removed** — see "Prerender impact" above |

**The one failure, explained rather than rounded away.** The first run used
Playwright's default worker count and lost one Firefox case —
`e2e/factor-picker.spec.ts:179`, a 30-second `page.waitForURL` timeout on the
factor-search navigation. It is not an auth route, not a database-disclosure
assertion, and nothing in it reaches `lib/auth/`. It is prompt 78's recorded
local instability at higher worker counts, and prompt 78's documented remedy
resolves it: the second run used the same process-only network condition and
one worker,

```sh
NODE_OPTIONS=--network-family-autoselection-attempt-timeout=1000 \
  npm run test:e2e:local -- --workers=1
```

and returned prompt 78's baseline of 98 passed. Neither the option nor the
worker count is committed; both are verification conditions. Teardown reported
`rate_limit` rows 3 before and 3 after on both runs.

## Drizzle query-error disclosure, closed at the data layer, prompt 80

Implemented on 15 Aug 2026. Prompt 79 closed Better Auth's provider-logger path
and recorded, as a measurement rather than a reservation, that an unrelated
`DrizzleQueryError` reaching Next's own error printer still carried the failing
statement and its bound parameters. This section closes that. Post-sequence
hardening, not a step 15 — AGENTS.md §5.2 remains the complete ordered product
build.

### What changed

| file | change |
| --- | --- |
| `lib/db/query-error.ts` | new — `DatabaseQueryError`, `toSafeQueryError`, `withSafeQueryErrors` |
| `lib/db/*-queries.ts` (11 files) and `lib/db/report-evidence.ts` | every exported async function wrapped — 89 of them |
| `app/api/auth/[...all]/route.ts` | `GET` and `POST` wrapped, because Better Auth's adapter queries do not go through `lib/db/` |

Nothing else. No schema, migration, environment variable, dependency, package
script, component or style changed, and `npm run db:generate` was not run.

### The mechanism, read from the installed sources

Four files compose into the disclosure, and each was opened rather than
recalled:

1. `node_modules/drizzle-orm/errors.js` — `DrizzleQueryError`'s constructor
   builds its message as `` `Failed query: ${query}\nparams: ${params}` `` and
   keeps `query`, `params` and `cause` as own properties. The message is
   therefore inside `stack` as well.
2. `node_modules/drizzle-orm/pg-core/session.js:41,48,59,66,81,98` — six throw
   sites, one per branch of `queryWithCache`. **Every** query path wraps, so no
   Drizzle option avoids it.
3. `node_modules/next/dist/server/base-server.js:462-464` — `logError(err)` is
   `_log.error(err)`, and it is the print path for route handlers and for render
   failures alike; `node_modules/next/dist/build/output/log.js:75-101` ends at
   `console.error(prefix, err)`, so the error **object** is inspected, not
   stringified, and the own properties print alongside the message.
4. `node_modules/pg-protocol/dist/messages.d.ts:34-53` — `pg`'s `DatabaseError`
   carries `code` (SQLSTATE) and `detail`, and on a unique violation `detail`
   quotes the conflicting key **value**.

`DrizzleQueryError` is on the package's public root export
(`require("drizzle-orm").DrizzleQueryError` is a `function`), so the check needs
no deep import.

### The label is assembled, not hand-written, prompt 101

`operation` was a free string passed at **98 call sites** across thirteen modules
in `lib/db/`, each written by hand as `"<module>.<function>"` and tied to
neither half of the name it repeated. A module rename, an export rename, or a
query copy-pasted as the basis for a new one desynced the label **silently** —
and the label is the only handle an operator has on which query failed.

Each module now binds its half once:

```ts
const safe = queryErrorScope("report-queries");
export const createReport = safe("createReport", createReportImpl);
```

That removes 97 of the 98 module-name repetitions and puts the remaining
function name on the same line as the `const` it labels.

#### Deriving the function half from `fn.name` was tried and rejected on evidence

The prompt asked for this to be investigated rather than assumed, and the
investigation is the useful part of this record.

**All 98 call sites pass a named `<name>Impl` function declaration** — checked,
not sampled — so `fn.name.replace(/Impl$/, "")` derives the label exactly in
development. It is still wrong, because **the production build mangles those
names**: after `npm run build`, `listReportsImpl`, `insertLeadImpl` and
`readDashboardEvidenceImpl` appear under `.next/server/` only inside `.map`
files and in **no emitted `.js`** (`grep -rl … --include="*.js"` returns
nothing). Deriving from `fn.name` would give correct labels locally and mangled
ones in production — the same defect, hidden in the one environment where it
matters.

So the hand-written function name is an **accepted, recorded limitation**, not
an oversight. `withSafeQueryErrors` itself is unchanged and still exported;
`queryErrorScope` composes it.

#### `operation` reaches no log of ours, and carries no personal data

The prompt required this answered either way (§8.3 rule 2). **Nothing in this
repository reads `DatabaseQueryError.operation`** — checked across `lib/` and
`app/`. It travels on the error object, which a platform error printer may
serialise, and that is what it is for. It cannot carry personal data by
construction: it is a compile-time constant built from a module name and a
function name, and no argument, row, address or id reaches it.

#### All 98 labels verified byte-identical

The acceptance condition was that no emitted string change, so it was measured.
Labels were extracted before the change from the literal strings and after the
change by reassembling the two halves; both sorted with the same sorter and
diffed:

```
98 98
IDENTICAL: all 98 labels byte-for-byte unchanged
```

The extraction commands are now in `docs/automation.md` — including the trap
that shell `sort` and Python's `sorted` disagree on hyphenated module names
under a non-C locale, which produced a one-line phantom diff on the first
comparison.

#### Verification, prompt 101

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **283 passed**, 694 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| the 98-label comparison | identical, above |

The `try`/`catch`/`toSafeQueryError` body is untouched, no operation string
changed value, no query module was split, and no lint rule was added — if one
enforcing the convention would help, it is its own prompt.

### The sanitizer's contract

`lib/db/query-error.ts` is `server-only`, like every other module under
`lib/db/`.

- `DatabaseQueryError` has the fixed message `Database query failed` and two own
  properties beyond `name` and `stack`: `operation`, the caller-supplied
  `<module>.<function>` label, and `sqlState`, accepted only when the driver's
  `code` matches `/^[0-9A-Z]{5}$/`. Neither is customer data, and together they
  keep a failure diagnosable — losing the query text and printing nothing would
  trade one defect for another.
- **`cause` is dropped, not forwarded.** Attaching `pg`'s error would
  reintroduce the disclosure one property further down, through `detail`.
- `toSafeQueryError(error, operation)` replaces a `DrizzleQueryError` and
  **returns everything else by identity**. That pass-through is required, not
  lax: `redirect()` and `notFound()` are implemented as thrown values, and
  Drizzle's own `TransactionRollbackError` is not a `DrizzleQueryError` and must
  keep reaching the transaction that expects it. An already-sanitized error is
  also returned unchanged, so a nested data-layer call keeps the innermost
  label.
- Every property read of the caught object — including the read of `cause`
  itself — is inside a `try`, so a getter that throws cannot turn a sanitized
  failure into a worse one.
- `withSafeQueryErrors(operation, fn)` preserves the wrapped function's
  parameter and return types exactly, optional and defaulted parameters
  included. Every wrapper rethrows; none swallows.

**Applied at the data layer, which is the boundary AGENTS.md §6.2 already
draws** — nothing outside `lib/db/` talks to the database — so the guarantee
holds for a consumer written later that knows nothing about this file. All 89
exported async functions in the twelve modules are wrapped. The one exported
function that is **not** is `buildFactorResolver` in `emission-queries.ts`: it
is synchronous, takes already-read rows and performs no I/O, so it cannot raise
a query error.

**And at the auth catch-all**, because Better Auth's adapter queries bypass
`lib/db/` entirely — the database-backed rate limiter's `consume` is one of
them, and it is the path prompt 79 measured.

### Two alternatives, considered and rejected

- **A `util.inspect.custom` method on `DrizzleQueryError.prototype`.** One file,
  no churn, and it would cover the production printer, which ends at
  `console.error(prefix, err)`. Rejected because `message` and `stack` are own
  properties set in the constructor, so a prototype hook neutralises neither,
  and anything reading `err.message` — the dev printer, a future reporter —
  still sees the parameters. A global monkey-patch on a third party's class that
  is *nearly* complete is worse than an explicit boundary.
- **Moving Better Auth's rate limiter off the database**
  (`rateLimit.storage: "secondary-storage"`, which the
  `better-auth-security-best-practices` skill documents and for which this repo
  already has Upstash). Rejected as a fix: it removes one query that carries an
  IP, not the mechanism, and it changes the shipped limiter's behaviour under
  cover of a logging change — the same objection prompt 79 recorded against
  setting `level`.

### The fault matrix

Two clean trees were built and started on an unused local port — `git archive HEAD`
for the parent, a `tar` of the working tree for the implementation, both with
`.claude/`, `.agents/` and every `.env*` file removed so the two sides read the
same environment. Each ran against a fake loopback database URL, a local
`BETTER_AUTH_URL`, a test-only 44-character secret and a test-only cron secret.
No real secret was read or printed.

The fault is injected by a minimal Postgres wire-protocol stub held outside the
repository — it accepts any startup packet and answers each statement with
either an empty success or an `ErrorResponse` carrying SQLSTATE `57P01`. It is
uncommitted and adds no dependency, route or environment flag. Two modes were
run, because they reach different code:

- **targeted** — only statements naming the session relation fail, which is
  prompt 78's intermittent condition;
- **total outage** — every statement fails, which is the mode prompt 79's record
  measured 60 framework error blocks in.

Seven requests per run, identical on both sides: the marketing home page; the
auth catch-all with a **signed** forged session cookie (`better-call` verifies
an HMAC-SHA256 over the value before the lookup reaches the database, so an
unsigned forgery would prove nothing — the signature was computed with the
probe's own test-only secret); a `/dashboard` Server Component render with the
same cookie; both cron sweeps with their bearer secret; the report export route,
which has no catch of its own; and the newsletter one-click unsubscribe.

| measurement | parent | implementation |
| --- | --- | --- |
| **production, targeted** — statuses and bodies | 200 / 500 / 200 / 200 / 503 / 500 / 200 | identical |
| `Failed query` · `params:` occurrences | 0 · 0 | 0 · 0 |
| server log lines | 24 | 24 |
| **production, total outage** — statuses and bodies | 200 / 500 / 200 / 500 / 503 / 500 / 200 | identical |
| `Failed query` occurrences | **2** | **0** |
| `params:` occurrences | **4** | **0** |
| forged-cookie sentinel occurrences | 0 | 0 |
| fake database user / password / name occurrences | 0 | 0 |
| server log lines | 98 | 42 |
| sanitized replacements | none — the type did not exist | **2**, `operation: auth-handler.GET` and `operation: organization-queries.listAllOrganizationIds`, each with `sqlState: '57P01'` |
| **dev, total outage** — statuses and bodies | as above | identical |
| `Failed query` · `params:` occurrences | **2** · **4** | **0** · **0** |
| server log lines | 106 | 64 |

Response bodies were compared byte for byte after normalising the per-build
script id and chunk names; the two HTML bodies are identical under that
normalisation, and the five non-HTML bodies are identical outright.

**The two parent disclosures, and what each one proves.** The first is Better
Auth's rate limiter on the auth catch-all — `select … from "rate_limit" where
"rate_limit"."key" = $1`, with `params: 127.0.0.1|/get-session,100`. That
parameter is the **client IP address**, which is exactly the finding prompt 79
left open, and it is disclosed on a path that no `lib/db/` wrapper can reach.
The second is `organization-queries.listAllOrganizationIds` escaping the nightly
recalculation sweep, whose route awaits it outside any catch — a `lib/db/` call
reaching the framework printer from a route handler. Between them the two cover
both halves of this change.

**The targeted run is clean on both sides, and that is prompt 79's result, not
this one's.** With only the session relation failing, Better Auth's own catch
turns the error into an `APIError` and the safe logger prints an event code, so
nothing leaks on either side. It is recorded because a run that shows no
difference is evidence about scope: this change is not what stops that path
disclosing.

**Dev is closed too, and that was measured rather than assumed.** Dev prints
through `bundlerService.logErrorWithOriginalStack`
(`node_modules/next/dist/server/dev/next-dev-server.js:451-453`), a different
printer from `_log.error`, and on the parent it printed **more** than
production: the message, the source frame, and then `query:` and `params:` again
as inspected own properties, plus the `[cause]` chain. All of it is gone on the
implementation side.

**One observation outside this change's scope, recorded rather than fixed.** The
dev server's request log prints the request line, so a one-click unsubscribe
URL's `?token=` value appears there once — on both sides, on the parent as well.
It is Next's own dev-only request logging of a value the client supplied in the
URL, not an error path, and closing it is a different change.

**The export route was left unwrapped, deliberately and on the measurement.**
The prompt said to wrap only what a measurement shows can print. Its two
database reads — `getMembership` through `getCurrentMembership`, and
`getReport` — are both wrapped `lib/db/` exports, and neither is reachable
without a session, so with the database failing it answers before it queries.
What escapes it is Better Auth's `APIError`, which carries no query and no
parameters. The three cron and newsletter handlers were checked the same way:
each reaches the database only through `lib/db/`.

### The direct fault probe

`toSafeQueryError` and `withSafeQueryErrors` were exercised in a temporary,
uncommitted probe: a `DrizzleQueryError` carrying distinct sentinels in its
message, its stack, its `query`, its `params` and its `cause`; a `pg`-shaped
cause whose `detail` holds an address-shaped sentinel; eight malformed SQLSTATE
values; a cause whose `code` getter records that it was read and then throws; an
already-sanitized error; a plain `Error`; a `TypeError`; a self-referencing
object; an object with a throwing getter; a Next `redirect()` signal; and a
number, a string, `null` and `undefined`.

**45 assertions, all passing**, exit 0. Every non-Drizzle input came back by
identity — the redirect signal with its `NEXT_REDIRECT` digest intact — and the
pass-through getter was never read. Every Drizzle input produced a
`DatabaseQueryError` whose own properties are exactly `message`, `name`,
`operation`, `sqlState` and `stack`, with **zero** sentinels across
`util.inspect`, `String()`, `.message`, `.stack` and a `JSON.stringify` over all
own property names. The valid SQLSTATE survived; all eight malformed ones were
dropped; the original cause was left unmutated, since it is discarded rather
than edited.

**One probe-harness artefact worth knowing.** Under `tsx` the repository's
modules load as CommonJS while a `.mts` probe is ESM, so the probe had to import
`DrizzleQueryError` from `drizzle-orm/index.cjs` to compare against the same
class object. That is a property of the probe harness, not of the application:
the fault matrix above is the evidence that `instanceof` resolves correctly in
the real Next runtime, since the conversion happened there.

### Prerender impact

`none — no route markup or render-mode changes`, verified rather than assumed.
The comparison was run after this section and the prompt file were on disk, so
Tailwind v4's scan of `docs/` and `prompts/` prose is included on the
implementation side. `docs/automation.md`'s clean two-build procedure, with
`.claude/`, `.agents/` and every `.env*` file removed from both sides and the
build id, JavaScript and CSS chunk names and inline RSC transport normalised:

| measurement | result |
| --- | --- |
| prerendered HTML files | **21** on each side, same set |
| differing after normalisation | **0 of 21** |
| compiled CSS | **68,506 → 68,506 bytes** |
| CSS rules added / removed | **0 / 0** |
| route table | identical, and byte-identical including every First Load JS figure — the wrapper is server-only and reaches no client bundle |

**Remeasure the parent; do not carry a number forward.** Prompt 79's record puts
its clean base at 68,506 bytes, at a different commit.

### Trust boundary

No new request path, and no change to an existing one. The browser-to-server
boundary remains Better Auth's catch-all handler, the four other route handlers
and the Server Actions, each with its existing authorisation. Status, body and
cookie behaviour are unchanged, proven by the identical columns above.

The boundary this change adds is between a thrown database error and the server
log. What crosses it is a caught error object; what is emitted is a fixed
message plus two non-personal fields. No `NODE_ENV` or E2E conditional, no
test-only route, no `disableCSRFCheck`, no auth fallback and no swallowed error:
every wrapper rethrows, and the error still propagates.

### Secrets and data

No new environment variable, no `.env.example` change, no `NEXT_PUBLIC_*`, no
additional secret read, no model call. The change **removes** personal data from
the logs — the bound parameters it stops printing include client IP addresses,
email addresses, user and organisation ids, session tokens and blob references.
Nothing is added to any store.

The probe and the fault matrix used only fake loopback credentials, a test-only
Better Auth secret, a test-only cron secret and non-secret sentinels. No value
from prompt 78's incident, and no real address, token or row, appears in code,
tests, transcripts or this record.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, exit 0 |
| `npm run typecheck` | clean, exit 0 |
| type-preservation probe | a wrong argument type, a missing argument and a wrong return type are all still errors through the wrapper; a defaulted parameter stays optional |
| `npm test` | **10 files, 215 tests passed**, unchanged |
| direct fault probe | **45 assertions passed**, exit 0 |
| production fault matrix, total outage | `Failed query` **2 → 0**, `params:` **4 → 0**, statuses and bodies identical |
| dev fault matrix, total outage | `Failed query` **2 → 0**, `params:` **4 → 0**, statuses and bodies identical |
| `npm run build` | exit 0, compiled in 8.2 s, 32/32 static pages |
| route table | identical to the parent build, diffed line by line |
| prerender/CSS comparison | **0 of 21** HTML files differed; CSS **68,506 → 68,506** bytes, **0 rules added / 0 removed** |
| `npm run test:e2e:local -- --workers=1` | **98 passed in 6.8 min**, Chromium + Firefox, exit 0. Teardown reported `rate_limit` rows 3 before and 3 after |
| `npm run test:e2e:webkit` | did not run: `Podman is required for WebKit on Arch Linux.` `podman` is not installed here. Environment gap, not a pass — unchanged from prompts 78 and 79 |
| `npm run db:generate` | not run; the schema is untouched |

## Provider-free fuzzy factor matching, prompt 76

Prompt 75 reached its first Vercel AI Gateway embedding request and received
`AI Gateway requires a valid credit card on file to service requests.` The user
declined adding a card. No embedding was produced: the live
`emission_factor_embedding` count was read before recovery and was **0**.
Prompt 76 therefore supersedes the uncommitted provider path with PostgreSQL
character-trigram matching. It is deliberately described as wording matching,
not AI, semantic understanding, confidence or synonym matching.

### Finished read path

`/activity/mappings` keeps its escaped, case-insensitive substring search and
adds **Find close wording**. The Server Component awaits `searchParams`, parses
`q` and `mode` through the shared Zod schema, and resolves the Better Auth
membership before calling the data layer. `lexical` remains the default;
`fuzzy` requires a non-empty query; both trim input and cap it at 120
characters. Invalid input becomes a focus-managed visible result rather than an
exception.

The fuzzy query uses PostgreSQL `similarity()` over one shared expression made
from `level_2`, `level_3` and `column_text`. Exact substring results remain first
in their existing deterministic sequence. Other results follow by descending
trigram similarity and then factor id. All five eligibility rules remain on the
database query: tenant visibility; factor and set not deleted; set not
superseded; `result_unit = kg_co2e`; an admissible activity unit. Visible
customer-supplied rows participate under the same tenant predicate. Nothing
leaves Postgres and nothing is logged.

Rows say **Exact text match**, **Close wording**, or **Weak wording match** in
text. The result retains source, dataset version, licence, published unit,
value, scope and gas. The page says that character-group comparison can miss
synonyms. Selection still goes through the existing owner-authorised mapping
action and deterministic recalculation; search never selects, checks or saves a
factor.

### Pure ranking judgement

`lib/domain/factor-match.ts` clamps PostgreSQL's documented zero-to-one score,
orders ties by id and assigns the two wording bands. **0.10 is a product
judgement, not a probability or a fitted accuracy claim.** The first 0.30
judgement was rejected after the behavior probe because a misspelled diesel
query against the publisher's longer label scored 0.147 while nonsense scored
0.030. There is no labelled customer corpus from which to measure precision or
recall. Tests cover the 0.10/0.099 boundary, score clamping, source-label
assembly and stable ordering.

### Migration 0013/0014 recovery

Migration 0013 remains immutable because it had already been applied. It
installs `vector` and creates the embedding table. Migration
`0014_supreme_polaris.sql` then:

1. installs `pg_trgm` before any trigram operator class is referenced;
2. drops the verified-empty embedding table;
3. creates `emission_factor_label_trgm_idx`, a GIN expression index using
   `gin_trgm_ops` over the exact label expression used by the query.

The expression does not use `concat_ws`: PostgreSQL reports that function as
stable, and an expression index requires immutable functions. The shipped
expression uses immutable `nullif`, `coalesce`, conditional expressions and
text concatenation, preserving the same omission of null/empty label parts as
the TypeScript presenter. The whole expression is parenthesised before the
operator class; without that grouping PostgreSQL rejects the generated SQL near
the first concatenation operator.

Both `npm run db:migrate` and the documented IPv4-first CLI retry exited 0 but
applied nothing on this machine. Readback caught it. Drizzle's installed
programmatic migrator, using the direct URL and the existing 2.5-second address
attempt budget, applied the same generated migration files successfully.

Live readback after apply:

- `pg_trgm` installed at **1.6**;
- `emission_factor_embedding` resolves to **null**;
- `emission_factor_label_trgm_idx` exists with the full label expression and
  `gin_trgm_ops`;
- `vector` remains installed at **0.8.0**, idle as required.

### Warm behavior probes

Measured 14 Aug 2026 after one direct connection was established, against
eligible published `litres` → `kg_co2e` rows. These are warm database timings,
not threshold-fit or end-to-end page measurements:

| query | elapsed | top score and shipped band |
| --- | ---: | --- |
| `diesel` | 474.9 ms | 0.280, close wording (the UI's substring pass labels exact rows first) |
| `diesal` | 723.2 ms | 0.147, close wording |
| `zzqv nowhere` | 299.2 ms | 0.030, weak wording match |

Neon network time is included; connection establishment is not. Duplicate
labels across dataset revisions are expected and the factor-id tail keeps their
sequence deterministic.

### Prerender, trust, secrets and checks

**Prerender impact: none, verified.** Both isolated builds retained the same
route table with `/activity/mappings` dynamic. After normalising the build id,
JavaScript/CSS chunk names and RSC flight payloads, **0 of 21 prerendered HTML
files differed**. The first CSS comparison found one 33-byte width utility; the
picker was changed to reuse the existing width. **Final CSS: 68,506 → 68,506
bytes, delta 0; 0 rules added and 0 removed.**

Trust boundary: the browser supplies `category`, `unit`, `q` and `mode` through
an authenticated GET. Category/unit are narrowed against the existing enums;
the shared Zod schema validates query/mode. The server session plus membership
row chooses the organisation, and the data query applies tenant visibility.
There is no BotID or Upstash read: this is an authenticated local database read,
with no provider spend or new Redis key.

Secrets/data: no new environment variable and no `NEXT_PUBLIC_*` value. The app
uses the existing pooled `DATABASE_URL`; migration/readback use the direct URL.
The search text, factor labels, user/session and organisation id are sent to no
new party, stored nowhere new and not logged. `.env.example` and `package.json`
are unchanged. The abandoned provider modules, embedding backfill, model ids
and suggestion limiter are absent from the finished tree.

Checks completed before the final docs rebuild:

| check | result |
| --- | --- |
| embedding-row precheck | exactly 0 |
| `npm run db:generate` | generated `0014_supreme_polaris.sql` from 24 tables |
| generated migration apply | programmatic Drizzle fallback applied; CLI limitation above |
| database readback | extension/table/index/vector results above |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **215 passed, 10 files** |
| `npm run build` | compiled; 32 static-generation entries; route modes unchanged |
| prerender/CSS comparison | 0 of 21 HTML files changed; CSS 68,506 → 68,506 bytes; 0 rules changed |
| `npm run test:e2e:local` | no test result: sandbox port binding failed, then the escalation reviewer timed out twice before startup |
| `npm run test:e2e:webkit` | did not run: `Podman is required for WebKit on Arch Linux.` |
| manual authenticated picker | not run: both installed browser-control skills lacked their required binaries (`agent-browser` and `browser-use`) |

The browser gaps are environment limitations, not passes. The database query,
schema, validation, pure ranking and production compilation were exercised;
interactive focus behavior and the four authenticated browser cases remain to
be checked when a browser-control binary or the Playwright local-server approval
is available.

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

#### The bucket now covers three jobs, and the docblock said one (prompt 94)

`CRON_SWEEP_LIMIT`'s docblock in `lib/rate-limit/index.ts` still read "there is
exactly one job" after two purge crons joined the bucket. Three routes call
`checkCronSweepLimit()` today —
`app/api/cron/recalculate/route.ts`, `app/api/cron/purge-organizations/route.ts`
and `app/api/cron/purge-submissions/route.ts` — and the latter two already
document the sharing at their own call sites, so only the limiter's own comment
was stale (§12 rule 8).

**The limit, the window and the key are unchanged: 6, `"1 h"`, constant key
`cron-sweep`, sliding window.** What changed is the reasoning printed above
them, which no longer computes as written: six an hour across three daily jobs
is **two runs per job per hour** — arithmetic on the two constants, not a new
measurement. That is still ample, and the docblock now says why in those terms.

The "not keyed by IP" conclusion is kept and is stronger under sharing: a
constant key is exactly what makes one bucket cover all three, and it bounds the
endpoint class rather than a caller.

**Hobby scheduling precision re-verified rather than recalled** (§12 rule 7):
`https://vercel.com/docs/cron-jobs/usage-and-pricing`, fetched 16 Aug 2026,
gives Hobby **"Per-hour (±59 min)"** with a minimum interval of once per day —
so the figure the comment carried was right.

**Idempotency verified rather than repeated** (the prompt required stopping and
reporting if any sweep were not idempotent — **checked and clean, nothing to
report**):

| sweep | why a second run in the same hour is safe |
| --- | --- |
| `recalculate` | `recalculateOrganization` → `replaceEmissions` keeps delete-then-insert semantics bounded by the covered record set, so a re-run reproduces the same figures; `raiseAlerts` inserts with `onConflictDoNothing` against the partial unique index and returns only rows actually written, so no duplicate alert and no duplicate email; `resolveAlerts` carries the status predicate in its `WHERE`, so a second pass matches no row |
| `purge-organizations` | `listDueDeletions` selects `pending` requests past their grace window; a purged request is stamped by `markDeletionPurged` and drops out of the next run's list. A failure leaves the row `pending` on purpose, so tomorrow retries |
| `purge-submissions` | every deletion is by a due-date predicate, so a completed run leaves nothing due. The blob-before-row ordering makes the one partial-failure case self-healing: the row stays, still due, and `deleteCvStrict` on an already-deleted object resolves it |

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

### The narrative allowlist — the first of two controls on the hard rule

**This heading and the sentence under it were corrected at prompt 104** (§12
rule 8). Both read as though the allowlist *were* the enforcement of §5.3's hard
rule. It is **one of two controls, and the weaker one**; the other is human
review, and a session reading the old text could reasonably have concluded the
review step was a formality and removed it. See *What the allowlist cannot
check* below — read it before relying on anything in this section.

The instruction in the system prompt tells the model not to invent figures.
**The instruction is not the control.** A system prompt is a request; the
allowlist is a mechanism, and it holds against a model that ignores every word
of the prompt — within the limits stated below.

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

### What the allowlist cannot check, prompt 104

**`validateNarrative` is a membership test. It is not an attribution test**, and
the difference decides how much weight the check can carry.

It asks: *is every numeric token in this prose one of the figures this report
computed?* It never asks: *is this figure attached to the label it belongs to?*
So a model can write a number that is genuinely in the allowlist, against the
wrong label, and every token passes. Using **fictional figures**, because no
tenant data appears in this file:

> "Scope 3 emissions totalled 1,284.6 tCO2e"

— where `1,284.6` is real and computed, and is the **scope 1** total. The
sentence validates. It is also false, and false in a document that will be
filed. The same holds for a real figure attached to the wrong period, the wrong
site or the wrong target.

**This is a deliberate limit, not an oversight, and it is not fixable here.**
Deterministically checking that prose attributes a number to the right label is
natural-language understanding, and there is no allowlist shape that performs
it — the label and the value travel together into the prompt through
`reportSections()`, but a token check only ever sees the value. The obvious
alternative, asking a model to check the model, is **forbidden by §5.3** and is
not a control in any case: it is the same failure mode reviewing itself.

Prompt 103 widened what the check catches to quantities written as words. That
narrowed the gap and did not change its shape: **paraphrase, comparison,
implication and misattribution remain outside any token check.**

#### Human review is the control that closes it

Verified before being cited, because a mitigation asserted from memory is worth
nothing (§12 rule 9). All three checks pass:

| claim | how it was checked |
| --- | --- |
| **there is no `published` state** | `REPORT_NARRATIVE_STATUSES` in `lib/validation/reports.ts` is exactly `not_generated`, `generated`, `rejected`, `failed` |
| **nothing reaches a customer-visible artefact without a human action** | `setReportNarrative` has one caller, the `generateNarrative` action, reached only from `GenerateNarrativeControl`; the export is a GET the reporter requests |
| **the "(draft)" label is on every rendering path** | the export writes `<h2>Narrative (draft)</h2>`; the report page writes `Draft · generated by {model} · review every sentence` above the prose |

So the accurate description of the trust boundary is: generate → truncate →
validate token membership → store `rejected` and discard on failure → **human
review** → nothing auto-publishes. The allowlist stops the specific fabricated
*figure*. The reviewer is what stops the true figure under a false label.

#### A follow-up finding, not fixed here

**Both review surfaces currently describe the check as if it were
comprehensive.** The report page tells a reviewer:

> Every figure in this draft was checked against the report above; a draft
> containing any other number is discarded and never stored.

and the export says the numbers were "checked against this report". Each
sentence is *true* and neither says what the check does not do — a reviewer
reading either could reasonably assume a validated draft is a correct one, which
is the belief this whole section exists to prevent, moved from the docs to the
UI.

Prompt 104 was scoped as documentation and explicitly forbidden from redesigning
the review UI, so **this is recorded as a finding for its own prompt** rather
than changed. The fix is a sentence on both surfaces saying the check confirms
each figure exists in the report, not that it is attached to the right label.


#### Verification, prompt 104

**The checks are near-vacuous for this change and are reported as such** (§12
rule 3): the deliverable is a docblock and two sections of Markdown, so lint,
typecheck, the 302 domain tests and the unchanged route table confirm only that
nothing was broken — they verify nothing about the claims above.

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed**, 745 ms — unchanged from prompt 103 |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |

**The real check was the review-path verification** in the table above, and its
result is the finding this prompt produced: the mitigation is genuinely in place,
and the two review surfaces overstate what the machine checked.

`validateNarrative`'s behaviour is unchanged — no token, no word list, no
refusal and no threshold was touched.

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

### The truncation could cut a figure in half, prompt 102

`draftNarrative` ended with `text.slice(0, NARRATIVE_MAX_CHARS)` — a raw
character cut at 6,000 with no regard for what sat at the boundary. A response
longer than that could be truncated **mid-numeral**: `1,234.5 tCO2e` becoming
`1,23`. That is a number no computed figure produced, **manufactured by our own
code after the model returned**, which is exactly what §5.3's hard rule exists
to prevent.

**It was safe, and this record says so plainly.** `validateNarrative` runs
downstream of the slice, `1,23` is not in the closed allowlist, and the draft was
rejected and stored as `rejected` with its text discarded. Safe **by accident of
ordering**, not by design, with nothing in either file saying the ordering was
load-bearing.

#### The ordering claim was verified before anything was changed

The prompt required this, and required a stop-and-report if any path stored
unvalidated text (§12 rule 9). **No such path exists.** `draftNarrative` has one
caller, `app/reports/actions.ts`; `validateNarrative` runs on its returned text
immediately after; and `setReportNarrative` is reached on three branches, of
which only `outcome.ok` passes `narrative`. The other two store a status and a
reason and no prose.

#### The boundary rule

`truncateNarrative(text, maxChars)` in `lib/domain/reports.ts` — pure, beside
`validateNarrative`, no I/O (§6.2):

1. text at or under the limit is returned **untouched**;
2. else the last **sentence end** within `NARRATIVE_TRUNCATION_LOOKBACK` of the
   limit — 600 characters, **a judgement**, far enough that ordinary prose
   usually contains one and short enough that a long final sentence is not worth
   discarding to reach the one before it;
3. else the **limit itself**, when the next character is whitespace and the last
   token is therefore whole — this exists so a complete figure ending exactly on
   the limit is not thrown away for nothing;
4. else the **last whitespace**. This is the guarantee rather than the nicety: a
   numeric token contains no whitespace, so a whitespace cut cannot fall inside
   one;
5. **the degenerate case** — no whitespace at all in the first 6,000 characters,
   which is not prose but must still be handled: hard cut, then strip any
   trailing run of digits, separators or `%`. **This can discard a complete
   figure sitting on the boundary.** Discarding a real figure from an
   already-truncated draft is the acceptable direction to err; inventing one is
   not. If the result is empty, `validateNarrative` refuses it as `empty`, which
   is an honest outcome and is tested.

The sentence-end pattern requires the terminator to be **followed by
whitespace**, which is what keeps a decimal point out of it: `1,234.5` has a `.`
with a digit after it.

**No narrative under 6,000 characters changes at all**, and that is expected to
be nearly all of them — the model is capped at 1,200 output tokens. That
expectation is **a judgement**, not a measurement.

#### The ordering is now written down at both ends

`narrative.ts`'s truncation site says the caller must still validate after it and
that nothing may be stored between the two; `validateNarrative`'s docblock says
it must run after any step that shortens the text, because shortening can create
a token the model never wrote. Either comment alone would have prevented this
defect.

#### Tests

Seven new cases in `lib/domain/reports.test.ts`: unchanged under the limit; a
figure straddling the boundary; a figure ending exactly on it; the word-boundary
fallback when no sentence end is near enough; the degenerate strip; the empty
result and the `empty` refusal that follows it; and an **exhaustive property
check** that truncates a long draft at *every* limit from 20 to its full length
and asserts the result never carries a token the allowlist rejects.

`NARRATIVE_MAX_CHARS` (6,000), `MAX_OUTPUT_TOKENS`, the model, the temperature
and the system prompt are all unchanged, as is the allowlist and `NUMBER_TOKEN`
(prompt 103's ground). No environment variable is read; there is still no AI env
var (§5.3).

#### Verification, prompt 102

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **290 passed** (283 before, +7), 768 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |

Nothing in the schema layer double-enforces the length — `NARRATIVE_MAX_CHARS`
is a bare constant in `lib/validation/reports.ts` and no Zod schema caps the
narrative — so there is no second truncation to collide with.

### The allowlist saw digits only, and the prompt invited words, prompt 103

The worst finding in the step-13 review, and this record must not overstate its
fix. `NUMBER_TOKEN` matches **digits only**:

```ts
const NUMBER_TOKEN = /(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?%?(?![A-Za-z0-9])/g;
```

So the closed allowlist — which §5.3 names as the enforcement of "an LLM never
produces a number that appears in a disclosure" — was blind to any figure
written out. "emissions fell by roughly a fifth", "around forty per cent of
records", "more than double the prior period" all validated.

**And the system prompt told the model to write exactly that.** Old ABSOLUTE
RULE 3, verbatim:

> 3. If a figure you want to mention is not in the REPORT DATA, describe it in
>    words instead, or leave it out.

The guardrail's blind spot and the instruction to walk into it were in the same
system. A model following rule 3 *correctly* produced an unvalidated
quantitative claim and the allowlist reported success.

#### The system prompt, changed verbatim

> 3. If a figure you want to mention is not in the REPORT DATA, omit the claim
>    entirely. Do not describe it in words, and do not approximate it.
>
> 4. Never state a percentage, a change, a ratio, a total or a year that is not
>    in the REPORT DATA — in digits or in words. Never write a quantity as a
>    word: no 'a fifth', 'forty per cent', 'double', 'twice', 'most', 'the
>    majority', 'nearly all'.

The register instruction and every other rule are untouched. **This is the
request half; it is not the control** — a system prompt never is.

#### The detector, and every part of it is a judgement

`findSpelledQuantity(text)` in `lib/domain/reports.ts` — pure, a string in and a
verdict out. A closed word list in four groups: cardinals, fractions,
multipliers, and vague quantifiers that still assert a magnitude.

**There is no corpus to measure it against.** Step 13's flow has not run against
real tenant data, so it has no false-positive or false-negative rate and this
record does not claim one (§12 rule 4). The list was assembled by hand. The
calls made, and why:

| call | reasoning |
| --- | --- |
| **cardinals start at "two"** | "one" is overwhelmingly structural — "one of the", "no one", "one another" — and a fabricated magnitude of one is close to meaningless. Including it would reject a large share of ordinary careful writing for almost no protection |
| **fractions start at "third", plus "half"** | "first" and "second" are positions, not fractions |
| **"many", "few", "several" excluded** | vague *without* asserting a magnitude against the report's figures. "most", "the majority", "nearly all", "almost all", "the bulk of", "a minority" do assert one, and are in |

Three exclusions, kept deliberately short because each is a hole in the check:
`third part(y|ies)`, `most recent(ly)`, and `(two|three) scopes?`.

**That last one was found by an existing test, not by inspection**, and it
matters: "Emissions were recorded across all three scopes" is unavoidable prose
in a greenhouse gas disclosure, and rejecting it would have made the feature
unusable. It is the **word analogue of the `1`, `2` and `3` that
`allowedNumberTokens` already admits structurally**, for the identical reason.

#### The disposition is rejection, and the alternative is recorded

A spelled quantity returns `refusal: "spelled_figure"` and the draft is stored as
`status: "rejected"` with its text discarded — the existing path, no schema
change, no migration, no new UI.

**`needs_review` was considered and is arguably the more honest answer.** §5.3
asks for a low-confidence result to be *surfaced* rather than silently accepted,
and a third state would let a reporter judge the phrase in context instead of
regenerating blind. It is a schema change, a migration and a UI change, and none
of those belong in a validator fix. It is the obvious follow-up if rejection
proves too blunt in practice.

The digit check runs **first**, so when both faults are present the more specific
message wins. Its lookarounds are untouched — `tCO2e`, `kgCO2e` and `AR5` still
do not read as figures, and that is tested.

#### The residual gap, in plain terms

**This narrows the gap. It does not close it, and nothing can.** A closed word
list is not a natural-language understanding system: "the reduction was
substantial", "emissions were far lower than the baseline", "coverage improved
markedly" are all unvalidated quantitative claims that no token check will ever
catch. Paraphrase, comparison and implication are open-ended in a way an
allowlist is not.

**Human review is what closes it**, and §5.3 already says so — a report is a
reviewed draft and nothing auto-publishes. The token check stops the specific,
citable, fabricated *figure*, which is the failure mode that ends up in a
regulatory filing. It does not stop vague overstatement, and this file should
not be read as claiming otherwise.

#### Tests

Fifteen new cases: one per detector category, the `spelled_figure` refusal and
its message, digit-first precedence when both faults are present, the unchanged
`tCO2e`/`kgCO2e`/`AR5` behaviour, and the four false-positive cases that
matter — "a third party", "no third parties", "the most recent period", "all
three scopes" — plus "one"/"first" left alone deliberately.

#### Verification, prompt 103

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **302 passed** (290 before, +12), 750 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |

No model, temperature or `MAX_OUTPUT_TOKENS` change. No AI environment variable
exists and none was added (§5.3). No model checks the model's output — the check
is deterministic and in `lib/domain/`.

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
   naming reference tables as its exception, in this same change. Three joins
   turned out to be inheriting that predicate rather than stating it — see
   *The three joins that did not state the scope* at the end of this section.
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

`ghgprotocol.org` and `www.gov.uk` are **unreachable through WebFetch**, which
reports that the domain cannot be verified as safe to fetch.

> **Narrowed by prompt 69 (§12 rule 8).** This paragraph originally said the two
> domains were unreachable *from this build environment*. That is a stronger
> claim than the evidence, and as written it would stop a later session even
> trying: `curl` to
> `https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting`
> returned **200** on 12 Aug 2026, and that is how prompt 69 discovered the 2025
> edition's page. The limitation is WebFetch's, not the environment's.
> `ghgprotocol.org` was not re-tested and stays unverified either way.

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
| market-based scope 2 | needs REC/GO capture, supplier rates and a residual-mix fallback. `scope2_method` is built now so it is not a rewrite later. **Closed by prompt 85** — see its section at the end of this file; the prediction held, and the second lane cost a column and two index pairs rather than a schema rewrite |
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

### The three joins that did not state the scope, prompt 99

`visibleFactorScope(organizationId)` — `organization_id IS NULL OR
organization_id = $1` — is what makes decision 1 above safe, and the module
docblock in `lib/db/emission-queries.ts` claims it is "written once … so no query
below can be written that forgets half of it". **Three joins onto
`emission_factor` did not name it**, which made that claim untrue:

| site | join |
| --- | --- |
| `emission-queries.ts`, `countOutOfPeriodRecordsImpl` | `.innerJoin(emissionFactor, and(eq(id, mapping.factorId), isNull(deletedAt)))` |
| `emission-queries.ts`, `listFactorCoverage`'s grouped read | the same, as a `.leftJoin` |
| `report-evidence.ts`, `listPeriodFactorSets` | `.innerJoin(emissionFactor, eq(id, activityEmission.factorId))` |

Twelve other reads in `emission-queries.ts` did name it.

**No data was exposed, and this record must not imply otherwise.** All three
join from `activity_factor_mapping` or `activity_emission`, both strictly
tenant-scoped with a `not null` organisation reference, and both already
filtered on `organizationId` in the same query's `where`. The scope arrived
transitively. This was **defence in depth and legibility**, not a live
vulnerability.

It is worth stating anyway because the transitive guarantee is a property of
*today's* join graph. An edit to either table's filter would remove it with
nothing at the join to notice — and the alternative fix was to weaken the
docblock's claim instead (§12 rule 8), which is the worse of the two.

**`visibleFactorScope` is now exported** rather than moved: `report-evidence.ts`
imports it, and the docblock that explains the predicate stays beside it.

**The `or()` composition was verified, not assumed.** The prompt flagged the
trap — the scope must not widen the surrounding `AND`. Read from
`node_modules/drizzle-orm/sql/expressions/conditions.cjs`: `or()` emits
`StringChunk("(")`, the joined operands, `StringChunk(")")` for any arity above
one, so `and(x, visibleFactorScope(id))` composes as `x and (… is null or … =
$1)`. On the middle site — an **outer** join — a scope miss would null the
factor columns rather than drop the row, which is the coverage surface's
"unmapped" state; no reachable row can miss it today.

#### Row-count equivalence is a **judgement**, not a measurement

The prompt asked for this distinction explicitly (§12 rule 4), and the honest
answer is that the live check came back **vacuous**.

A counting query was run against the development database over the pooled URL
(**cold** — 3,024 ms for the round trip, which is scale-to-zero's first-query
cost, §7.3, not a query cost). Counts only; no organisation id, row body or name
was selected or printed (§8.3 rule 2):

| column | count |
| --- | --- |
| `emission_factor` rows | 14,064 |
| of those, tenant-supplied (`organization_id is not null`) | **0** |
| `activity_factor_mapping` rows | **0** |
| `activity_emission` rows | **0** |
| mappings joining a factor of another organisation | 0 |
| emissions joining a factor of another organisation | 0 |

The two zero "escape" counts are therefore vacuous: with no mappings and no
tenant-supplied factors, no row exists that the predicate could have excluded.
**The equivalence is argued, not measured.** The argument is the one above — the
`not null` organisation reference on both driving tables, plus the existing
`where` filter — and it is a judgement on the schema and the join graph.

What did exercise the changed SQL against seeded tenant data is
`npm run test:e2e:local`, which builds and runs the production app: **109 passed,
12 skipped, one failure** — `submissions.spec.ts:382` on Firefox, "grants and
revokes staff on its own project's target". Re-run in isolation it **passes on
both browsers** (4 passed, 1.9 min), and `submissions.spec.ts` contains no join
onto `emission_factor`. Recorded as an order-dependent flake in a file this
change does not touch, not as a pass.

### Verification, prompt 99

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **283 passed**, 727 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| `npm run test:e2e:local` | 109 passed, 12 skipped, 1 flake — see above |

No migration, no schema change, no change to `visibleFactorScope`'s definition,
and `emission-queries.ts` was not split.

### One strict tenant predicate, and the fourth helper that is not one, prompt 100

Three query modules each declared their own private `visible()`, identical but
for the table:

| module | predicate |
| --- | --- |
| `report-queries.ts` | `and(eq(report.organizationId, id), isNull(report.deletedAt))` |
| `target-queries.ts` | the same over `emissionTarget` |
| `alert-queries.ts` | the same over `targetAlert` |

`lib/db/tenant-scope.ts` now holds it once as `tenantVisible(table, id)`, and
each module keeps a one-line `visible()` naming its own table — which keeps every
call site below it unchanged.

#### The correction that matters more than the dedupe

**The review that raised this counted four copies, including
`visibleFactorScope` in `emission-queries.ts`. It is not a fourth copy — it is a
different predicate**, and merging it is the failure this record exists to
prevent:

|  | `tenantVisible` | `visibleFactorScope` |
| --- | --- | --- |
| operator | `and` | `or` |
| organisation reference | `not null` | **nullable** — `null` is published data |
| soft delete | `isNull(deletedAt)` | none |
| rule | §9.2 rule 6, the default | §9.2 rule 6's sanctioned exception |

Folding the factor predicate into the strict one would **admit `NULL`
organisation ids into three tenant-scoped reads — a cross-tenant read**. Folding
the strict one into the factor predicate would make published factors invisible
to every tenant. A later session "finishing the job" is the risk; both helpers'
docblocks now cross-reference each other and say so.

#### The generic keeps them apart mechanically, not just by docblock

`tenantVisible` is constrained to a table whose `organizationId` is typed
`notNull: true` and which carries a `deletedAt`:

```ts
export type TenantScopedTable = {
  organizationId: PgColumn<ColumnBaseConfig<"string", string> & { notNull: true }>;
  deletedAt: PgColumn;
};
```

**That `notNull` is expressible was verified, not assumed** (§12 rule 2): it is a
member of `ColumnBaseConfig` in `node_modules/drizzle-orm/column.d.ts`. Passing
`emissionFactor` — whose organisation reference is deliberately nullable — is a
**compile error**. Confirmed with a throwaway type test carrying
`@ts-expect-error` on the `emissionFactor` call: `tsc --noEmit` was clean, which
means the three tables were accepted *and* the fourth was rejected (an
unsatisfied `@ts-expect-error` is itself an error).

**The residual risk, stated rather than pretended away:** the constraint checks
the two columns' *shape*, not that they mean what their names say. Any future
table with a `notNull` `organizationId` and a `deletedAt` is accepted — which is
the intent, and is why the docblock carries the boundary in prose as well.

#### The SQL is unchanged, and that was checked

The acceptance condition was identical emitted SQL, so it was measured rather
than argued. Each table's predicate was built both ways and rendered through
`PgDialect.sqlToQuery`:

```
report          IDENTICAL
emissionTarget  IDENTICAL
targetAlert     IDENTICAL
("report"."organization_id" = $1 and "report"."deleted_at" is null)
```

(The check script ran under `tsx --conditions=react-server`, because
`tenant-scope.ts` carries `import "server-only"` and that package throws outside
a server condition. It was deleted afterwards; nothing was added to the repo.)

#### One inline copy deliberately left

`alert-queries.ts`'s `listTargetsForAlertsImpl` inlines the same two predicates
over `emissionTarget` rather than calling a helper. It is a fourth *site* on a
table the prompt's three deletions do not cover, and the prompt's non-goal —
"do not extend the helper to any fourth table in this change" — is explicit.
Noted here so it is a known remainder rather than something missed.

### Verification, prompt 100

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **283 passed**, 860 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| emitted SQL | identical at all three sites, above |

No migration, no schema change, `visibleFactorScope` untouched, no query module
split, and `withSafeQueryErrors` usage unchanged (prompt 101's ground).


---

## Finite retention for phase-one personal data, prompt 81

Implemented on 15 Aug 2026. It closes §8.3 rule 5 — *"Retention is finite and
stated. Do not build a permanent archive by default."* — for the three **public**
phase-one flows, which collect the most sensitive data in the repository: names,
work email addresses, employers, free-text messages, and CV files. Prompt 73
closed the same rule for **tenant** data; before this change a demo request
captured on day one was retained forever, and an admin's removal in
`/submissions` stamped `deleted_at` without ever ending the row's life. Step 7's
record said so in its own words, and that passage is corrected in place above
(§12 rule 8).

Not a step 15. §5.2 remains the ordered plan; this is approved post-sequence
hardening, on the same footing as prompts 63–80.

### The policy, decided with the user

| record | erased when |
| --- | --- |
| `lead` (a demo request) | `created_at` + **24 months** |
| `application` — the row **and** its private CV blob | `created_at` + **12 months** |
| `subscriber`, `status = 'pending'` | `created_at` + **30 days** |
| `subscriber`, `status = 'unsubscribed'` | `unsubscribed_at` + **12 months** |
| `subscriber`, `status = 'confirmed'` | **never by age** — consent is live, and the person holds a working one-click unsubscribe. Unsubscribing starts the 12-month clock above |
| any of the three with `deleted_at` set | `deleted_at` + **30 days**, whichever comes first |

**Every number above is a product decision recorded as a decision, not a
measurement** (§12 rule 4) — exactly as prompt 73's 30-day organisation window
says of itself. There is no traffic behind them and no legal advice behind them.
They are defensible, not derived.

The per-entity reasoning, which is the part a later session needs:

- **A lead gets the longest window, 24 months.** It is the least sensitive of
  the three — a work address and a company, given in order to be contacted about
  a product — and it is the record with a genuine ongoing purpose: a sales
  conversation started from a demo request can reasonably span two annual
  reporting cycles, which is the unit this product's customers work in.
- **An application gets 12 months, and the CV goes with it.** A CV is the most
  sensitive artefact this repository holds — an address, an employment history,
  often a phone number — and its purpose expires with the hiring round. Twelve
  months keeps a candidate reachable for a role that reopens within the year
  without turning the blob store into a permanent CV archive. **The blob is
  named explicitly in the policy** because a row delete that leaves the bytes is
  the failure this design exists to prevent.
- **A `pending` subscriber gets 30 days, the shortest window in the table.**
  That address never completed double opt-in, so there is no consent to hold it
  under: it exists only as evidence that a confirmation link was issued, and
  once the link's own expiry has long passed there is nothing it can be used
  for. Holding an unconfirmed address indefinitely is the exact pattern double
  opt-in exists to avoid.
- **A `confirmed` subscriber never ages out**, and that is deliberate rather
  than an omission. Consent is live, the person holds a working one-click
  unsubscribe in every issue, and expiring a live subscription on a timer would
  silently drop a reader who never asked to leave. The retention question here
  is answered by the opt-out, not by a clock.
- **Unsubscribing is what starts the clock** — 12 months from `unsubscribed_at`,
  not from `created_at`. The row has to outlive the opt-out, because it *is* the
  suppression record: erasing it the same day would let a re-import or a
  re-signup mail an address that asked to stop. Twelve months is the same
  reasoning the `email-best-practices` skill's `compliance.md` records for
  consent records under CASL (three years) applied conservatively downward — we
  keep the suppression evidence, not the subscription.
- **The soft-delete window is 30 days and it can only shorten a life, never
  extend one** — "whichever comes first". An admin's removal in `/submissions`
  starts a grace window and then a hard delete, mirroring prompt 73's
  grace-then-purge rather than inventing a second shape. It is what turns §9.2
  rule 5's soft delete into "one operation with an audit trail" instead of a
  permanent archive of hidden rows.

### The sweep

`app/api/cron/purge-submissions/route.ts` + `sweep.ts`, copying
`purge-organizations`'s shape rather than abstracting over it — the same
reasoning that file already carries, and the same reason it is not shared with
the recalculation handler: the two handlers are eleven lines of gate each, and a
shared wrapper would put the `CRON_SECRET` check one indirection away from the
endpoint that deletes personal data.

- **Fail-closed authorisation.** A constant-time `CRON_SECRET` bearer check that
  also fails closed on an *unset* secret, answering `401` with no body and no
  detail to every rejected caller. No BotID: the caller is not a browser, and
  §7.3 records that a path missing from `initBotId()`'s list makes
  `checkBotId()` **fail** rather than pass.
- **The rate limit fails closed too**, as the organisation purge's does and
  unlike the recalculation's. That one is idempotent, and refusing it during a
  Redis outage costs a night of stale figures; this one deletes personal data
  irreversibly, so a limiter that cannot be consulted is a reason to wait a
  night. **Nothing is lost — every due row is due again tomorrow.** It shares
  `checkCronSweepLimit`'s existing `cron-sweep` bucket: one scheduler, one call
  each per night.
- **Applications: blob first, then the row.** `cv_pathname` is `not null`, so
  prompt 73's "null the pointer as each blob succeeds" trick is unavailable.
  Instead the blob is deleted with `deleteCvStrict()` and the row is deleted
  **only** on `true`; a failed blob delete counts a failure, leaves the row
  standing, and retries tomorrow. Deleting the row first would orphan a person's
  CV in Blob storage permanently with the pointer to it gone — the exact failure
  prompt 73 designed against, and here the orphan is a CV. `deleteCv()`'s
  step-5 best-effort/no-throw contract is untouched.
- **Leads and subscribers are one statement each**, no blobs involved.
- **One record's failure does not end the sweep.** Each is wrapped, counted, and
  the sweep continues.
- **One `now` is threaded in from the caller** rather than `now()` per
  statement, so two records a second apart cannot land on different sides of a
  boundary — the same rule prompt 73's sweep states. The cut-off arithmetic is
  pure and lives in `lib/domain/retention.ts` with tests beside it, which is the
  layer §6.2 requires to be independently testable and the one `npm test` is
  scoped to.
- **The response body is counts only** — leads, subscribers, applications, blobs
  deleted, failures. No id, no address, no pathname: it lands in Vercel's
  function logs, and §8.3 rule 2 forbids all three there. Nothing anywhere in
  the sweep logs an identifier, an address or a pathname.

### The audit trail

One new table, `retention_purge_run`: one row per sweep run, carrying the
per-entity counts, the run's timestamp, its wall-clock duration, and a nullable
error drawn from a **closed vocabulary**, never an exception message — an
exception can quote a person's data, which is the argument prompt 73's
`purge_error` already makes.

**Counts only, and never an identifier.** A table recording *which* addresses
were erased would defeat the change entirely: it would replace a finite archive
of personal data with a permanent one. What the trail has to answer is "did the
sweep run, and how much did it remove", and counts answer it.

It is deliberately **not** the `organization_deletion` shape and must not be
made to copy it. That table tracks a grace window per record because there is
nothing else that could; here the window is a pure function of columns that
already exist on `lead`, `subscriber` and `application`, so a per-record marker
row would be a second source of truth for a date the schema already implies.

### What is stated, and where

"Stated" (§8.3 rule 5) is satisfied in **two places only**, which was the user's
decision:

1. **This document** — the policy table above.
2. **The four person-facing confirmation emails**, one plain sentence each in
   the existing `Shell` `footerText`, saying the window and saying that erasure
   is automatic. Each reads its number from `RETENTION_WINDOW_TEXT` in
   `lib/domain/retention.ts` rather than hand-typing a duplicate, so the copy
   and the sweep that enforces it cannot drift apart — the argument
   `newsletter-confirmation.tsx` already makes for `expiresIn`. The footer prop
   has been a `ReactNode` since step 4, so carrying an interpolation needed no
   change to `shared.tsx`.

| template | sentence added |
| --- | --- |
| `demo-request-confirmation.tsx` | "We keep a demo request for 24 months from the day it is made, and it is then erased automatically." |
| `application-confirmation.tsx` | "We keep an application and the CV file it carries for 12 months from the day it is sent, and both are then erased automatically." |
| `newsletter-confirmation.tsx` | "An address that is not confirmed is erased automatically after 30 days." |
| `newsletter-welcome.tsx` | "A confirmed address is kept for as long as the subscription stands; once you unsubscribe, the record is erased automatically 12 months later." |

The windows in that table are the rendered values of `RETENTION_WINDOW_TEXT`;
the source reads the constant in every case.

**The two internal notification templates get nothing.**
`demo-request-notification.tsx` and `application-notification.tsx` go to
Aetherfield, and the recipient of a retention statement is the data subject —
telling the team its own policy inside a lead alert is noise, not a disclosure.

**No marketing route's markup changes**, so §8.1 is untouched and there was
nothing to re-approve. There is no retention line on `/`, `/journal`,
`/careers` or `/job-listing/[slug]`.

### Measured results

Measured on 15 Aug 2026 against the real Neon database (`neon-purple-candle`),
fixtures seeded and read back over the **direct** connection
(`DATABASE_URL_UNPOOLED`) while the sweep itself ran through the app's pooled
client, from a throwaway `dotenv -e .env.local -- tsx --conditions=react-server`
harness that was deleted afterwards. **Every fixture address was synthetic
(`…@example.invalid`) and no address appears below** (§8.3).

**A pre-check ran first, and it is the reason a live sweep was safe to run at
all**: with the policy's cut-offs applied to the existing data, `0` leads, `0`
subscribers and `0` applications were due (1 real application exists, dated
2026-08-09, well inside its 12-month window and not soft-deleted). No
pre-existing row was erased by any run below, and the fixtures were deleted
afterwards — the tables are back to that same single real application.

#### 1. The live sweep against seeded fixtures

15 fixtures: a due and a surviving row either side of all five boundaries, a
soft-deleted row of each of the three kinds, an `unsubscribed` row with a **null**
`unsubscribed_at` (the `coalesce` fallback), a five-year-old `confirmed`
subscriber, and a `confirmed` subscriber that is soft-deleted past its grace.

**The margin is 300 s either side, not one second, and that is a correction
rather than a shortcut.** The first run planted rows at ±1 s and deleted *every*
survivor: the harness seeds, and only then does `sweep()` take its own clock, so
the measured drift between the fixture clock and the sweep clock was **1,060 ms**
— larger than the margin being tested. That run measured deletion working and
measured nothing about the boundaries. The margin was raised above the drift and
the run repeated; **the exact one-second pinning of both sides of every boundary
is `lib/domain/retention.test.ts`, where `now` is injected and the drift is
zero.** Recording the first run here rather than only the second is the point
(§12 rule 3).

| | fixtures before | after |
| --- | --- | --- |
| `lead` | 4 | 2 |
| `subscriber` | 7 | 3 |
| `application` | 4 | 2 |

Drift on the recorded run: **1,001 ms**, against the 300 s margin. The sweep
returned `{"leads":2,"subscribers":4,"applications":2,"blobsDeleted":2,"failures":0}`.

**The seven survivors, read back, are exactly the seven predicted** — and each
one is a rule:

| survivor | the rule it proves |
| --- | --- |
| `lead-survive` | inside the 24-month window |
| `lead-softdel-survive` | inside the 30-day soft-delete grace |
| `app-survive` | inside the 12-month window |
| `app-softdel-survive` | inside the grace — **and its `cv_pathname` names a blob that was never uploaded**, so a missing object does not drag a live row out |
| `sub-pending-survive` | inside the 30-day pending window |
| `sub-unsub-survive` | dated from `unsubscribed_at`, inside 12 months |
| `sub-confirmed-ancient` | **five years old and untouched** — a `confirmed` subscriber never ages out |

The eight deleted were `lead-due`, `lead-softdel-due`, `sub-pending-due`,
`sub-unsub-due`, `sub-unsub-nullstamp` (the `coalesce` fallback — a row whose
`unsubscribed_at` is null is dated from `created_at` and is not immortal),
`sub-confirmed-softdel` (**live consent does not protect a row an admin removed**
— the soft-delete window is the one thing that reaches a `confirmed` row),
`app-due` and `app-softdel-due`.

The audit row written by that run:

```
{"duration_ms":10413,"leads_deleted":2,"subscribers_deleted":4,
 "applications_deleted":2,"blobs_deleted":2,"failures":0,"error":null}
```

Counts only, exactly as the table's docblock requires. **Neon's scale-to-zero
was not controlled for and the 10.4 s is not a warm figure** — it spans three
blob round trips and several pooled queries against a database that may have
been resuming (§7.3). It is recorded as an observation, not a latency budget.

#### 2. The CV blob is actually gone

Three throwaway PDFs were uploaded through the existing `putCv()` helper and
attached to three applications — one due, one due by soft-delete, one surviving.
`head()` before the sweep reported **5 bytes** for each of the two due ones.
After the sweep:

```
blob HEAD after sweep (due):     GONE BlobNotFoundError :: Vercel Blob: The requested blob does not exist
blob HEAD after sweep (softdel): GONE BlobNotFoundError :: Vercel Blob: The requested blob does not exist
blob HEAD after sweep (survive): PRESENT 5 bytes
```

A row delete that left the bytes is the failure this design exists to prevent,
and the survivor's object proves the sweep is not simply deleting everything.

**One finding worth carrying forward: `del()` does not distinguish a missing
blob.** The `app-softdel-survive` fixture pointed at a pathname that was never
uploaded, and in the first run an equivalent row's `deleteCvStrict()` returned
`true` and counted toward `blobsDeleted`. So `blobs_deleted` is "delete calls
that did not fail", not "objects that existed and are now gone". That is the
right behaviour for a retry-tomorrow sweep — an already-deleted object must not
stall the row forever — but the count should not be read as an object census.

#### 3. The blob-failure path

Induced for real rather than mocked: the same sweep was run in a process whose
`BLOB_READ_WRITE_TOKEN` was well-formed but invalid, so `del()` throws inside
`deleteCvStrict`, which returns `false` by its own contract. Nothing in the
sweep was stubbed. One due application and one due lead were planted.

```
sweep summary: {"leads":1,"subscribers":0,"applications":0,"blobsDeleted":0,"failures":1}
rows left:     {"app_left":"1","lead_left":"0"}
audit row:     {"duration_ms":3826,"leads_deleted":1,"subscribers_deleted":0,
                "applications_deleted":0,"blobs_deleted":0,"failures":1,
                "error":"blob-delete-failed"}
```

All four required properties hold: **the row survived** (`app_left: 1`), the
failure was **counted**, the sweep **continued** past it and still erased the
lead, and the recorded reason is from the closed vocabulary — not an exception
message, and it names no pathname.

#### 4. The 401 path

Against `npm run start` on port 3210, serving the build measured below (the
served CSS chunks were confirmed to match that build first, per
`docs/automation.md`'s stale-server trap). `CRON_SECRET` is 64 characters; **the
value was never printed** (§8.4).

| request | result |
| --- | --- |
| no `authorization` header | `401`, **0 bytes** |
| wrong secret, different length | `401`, **0 bytes** |
| right-length (64-char) wrong secret | `401`, **0 bytes** |
| the secret with no `Bearer ` prefix | `401`, **0 bytes** |
| the correct bearer token | `200`, `{"leads":0,"subscribers":0,"applications":0,"blobsDeleted":0,"failures":0}` |
| `POST` with the correct token | `405` — the handler exports `GET` only |

Every rejection is indistinguishable from the others: same status, no body, no
detail. The authorised call returning all-zero counts is itself correct — the
only fixtures on the database at that moment were the seven survivors, none of
them due.

#### 5. The command checks

| check | result |
| --- | --- |
| `npm run db:generate` | one migration, `lib/db/migrations/0015_organic_alice.sql` — the new type, table and index only; **no existing table altered** |
| `npm run db:migrate` | `[✓] migrations applied successfully!`, and the table was **read back over the direct connection** rather than trusted: nine columns with the right types and defaults, `error` nullable and `USER-DEFINED`/`retention_purge_error`, both indexes present, the enum's three labels in order, `drizzle.__drizzle_migrations` row `id 16`. Prompt 76's "exits 0 having applied nothing" caveat did **not** bite this time |
| `npm run lint` | exit **0**, no output |
| `npm run typecheck` | exit **0**, no output |
| `npm test` | **11 files, 237 tests passed** in 897 ms — the 215 that existed plus the 22 new retention boundary tests |
| `npm run build` | exit **0**; route table below |
| `npm run test:e2e:local` | **98 passed (3.1m)**, Chromium and Firefox. The authenticated matrix is unaffected |
| `npm run test:e2e:webkit` | **exit 1: "Podman is required for WebKit on Arch Linux."** — the same environment gap prompt 81 predicted. **This is not a pass and is not recorded as one** |

The route table, quoted as produced. The one change is the new `ƒ` cron path;
every marketing route is still `○` or `●`:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /about
├ ƒ /account
├ ƒ /activity
├ ƒ /activity/[importId]
├ ƒ /activity/factors
├ ƒ /activity/mappings
├ ƒ /api/auth/[...all]
├ ƒ /api/cron/purge-organizations
├ ƒ /api/cron/purge-submissions
├ ƒ /api/cron/recalculate
├ ƒ /api/newsletter/unsubscribe
├ ● /article/[slug]
│ ├ /article/how-to-build-a-climate-ready-data-stack
│ ├ /article/sustainability-isnt-a-side-project-making-impact-operational
│ ├ /article/inside-the-aetherfield-model-how-we-turn-data-into-action
│ └ [+3 more paths]
├ ○ /careers
├ ƒ /dashboard
├ ○ /design-system
├ ○ /forgot-password
├ ƒ /invitation/[id]
├ ● /job-listing/[slug]
│ ├ /job-listing/data-scientist
│ ├ /job-listing/product-manager
│ └ /job-listing/ux-designer
├ ○ /journal
├ ƒ /newsletter/confirm
├ ƒ /newsletter/unsubscribe
├ ƒ /reports
├ ƒ /reports/[reportId]
├ ƒ /reports/[reportId]/export
├ ○ /reset-password
├ ○ /sign-in
├ ○ /sign-up
├ ƒ /submissions
├ ƒ /submissions/applications/[id]/cv
├ ƒ /targets
└ ○ /verify-email
```

#### 6. The prerender comparison

`docs/automation.md`'s clean two-build procedure, in the same environment on
both sides: build the working tree, snapshot `.next/server/app` and
`.next/BUILD_ID`, `git stash push -u`, rebuild, snapshot, `git stash pop`, then
diff normalising **only** the build id. The JS chunk names were deliberately
left un-normalised.

| | before | after |
| --- | --- | --- |
| prerendered HTML files | 21 | 21 |
| **identical after normalising `BUILD_ID`** | — | **21 of 21** |
| differing | — | **0** |
| files added or removed | — | **none** |
| CSS chunks | `00u7jgtk688mf.css` **11,186 B** + `3qi1cinspn7re.css` **407,960 B** | **identical names, identical bytes** — 419,146 B total |

**The CSS byte count is remeasured, not carried forward** — the 68,506 figure
this prompt warned against does not describe this tree, which builds two chunks
totalling 419,146 B. The chunk names are content-addressed and match across both
builds, so the stylesheet is unchanged: **0 rules added, 0 removed.**

`Prerender impact: none — no route changes`, **verified rather than assumed**.

#### 7. The stated sentences, rendered

Not asserted from the source — the four templates were rendered with
`render()` (there is no email-preview script, and §2 records why) and the
retention sentence extracted from the output:

| template | the sentence, as rendered |
| --- | --- |
| `demo-request-confirmation` | "We keep a demo request for **24 months** from the day it is made, and it is then erased automatically." |
| `application-confirmation` | "We keep an application and the CV file it carries for **12 months** from the day it is sent, and both are then erased automatically." |
| `newsletter-confirmation` | "An address that is not confirmed is erased automatically after **30 days**." |
| `newsletter-welcome` | "A confirmed address is kept for as long as the subscription stands; once you unsubscribe, the record is erased automatically **12 months** later." |
| `demo-request-notification` | *(none — internal)* |
| `application-notification` | *(none — internal)* |

Every number came out of `RETENTION_WINDOW_TEXT` rather than a hand-typed
duplicate, which is what makes the sentence in a person's inbox and the
predicate that actually deletes incapable of drifting apart.

### What prompt 81 deliberately did not do

| not done | why |
| --- | --- |
| a restore UI, or undo for a purged record | the purge is the end of the lifecycle; the 30-day `deleted_at` window *is* the undo, and `/submissions`'s existing controls already stamp it |
| a retention line on `/`, `/journal`, `/careers` or `/job-listing/[slug]` | the user's decision above — it would change prerendered markup and would need its own approved §8.1 deviation |
| a retention sentence in the two internal notification templates | the recipient is Aetherfield, not the data subject |
| a per-record configurable window, or an admin settings screen | one policy, stated once. Not a step, and §5.2's "do not overbuild" is explicit |
| phase-two tenant data | prompt 73 already gave it an exit, on its own window |
| Better Auth's `user`, `session`, `account`, `verification` tables | generated tables with their own lifecycle, and a staff account is not a submission (§9.1) |
| changing `deleteCv`'s best-effort contract | step 5 set it deliberately; the sweep uses `deleteCvStrict` |
| AI factor matching | blocked, not deferred: prompt 75 reached AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, and prompt 76 shipped the provider-free path. Named rather than smuggled past |
| a step 15 | §5.2 remains the ordered plan; this is post-sequence hardening, as prompts 63–80 were |

## Bulk factor-set CSV import, prompt 82

Imports many customer-supplied emission factors into one tenant-owned factor
set from a single CSV, atomically. It closes the deferral `docs/backend.md`
named six separate times: `/activity/factors` accepted **one hand-typed row at
a time**, and a customer supplying its own licensed set had to fill twenty
fields per row.

Post-sequence work, as prompts 63-81 were. **Not a step 15** — AGENTS.md 5.2
remains the complete ordered product build, and every step in it is committed.

### The design fork, settled with the user before the prompt file was written

The user chose **atomic, all rows or none** over a staged-review flow of the
kind step 9 built for activity data. So there is **no staging table, no
migration, no new route and no blob write**.

A file whose rows all validate is inserted in one transaction; a file with any
invalid row writes **nothing** and returns every failing line with its reason.
"Rollback" is the transaction itself, plus the existing per-row retire control.

The earlier deferral text predicted "a parser, staging UI and rollback"; that
prediction is superseded here rather than left standing (AGENTS.md 12 rule 8).
The reason staged review is right for activity data and wrong here: a partial
commit of activity rows is still a usable dataset, whereas a partly-imported
factor set is a set whose licence and provenance describe rows that are not all
present — which is exactly the thing a disclosure cites.

### What was built

| file | what it is |
| --- | --- |
| `lib/domain/factor-import.ts` | **new, pure, tested.** The column contract, the whole-file refusals, per-row coercion, the row identity, and the two cross-row checks |
| `lib/domain/factor-import.test.ts` | 18 tests, under `npm test`'s `lib/domain/` scope |
| `lib/validation/emissions.ts` | `importCustomFactorsSchema`, `FactorImportRowError`, `FactorImportField`, `ImportCustomFactorsResult`, `FACTOR_IMPORT_MAX_ROW_ERRORS`, `formatFactorImportRowFailure`, `FACTOR_IMPORT_ERRORS` |
| `lib/rate-limit/index.ts` | `checkFactorImportLimit` on a new `factor-import` prefix |
| `lib/db/emission-queries.ts` | `importTenantFactors`, the extracted `resolveWritableSet`, and **a pre-existing correlated-subquery defect fixed** (below) |
| `app/activity/actions.ts` | `importCustomFactors(formData)` |
| `app/_components/activity/factor-import-form.tsx` | the client leaf |
| `app/activity/factors/page.tsx` | one new "Import factors" section, inside the existing owner gate |
| `e2e/factor-import.spec.ts` | one authenticated Chromium walk |

### The column contract, as implemented

Header names are matched **trimmed and case-insensitively, in any order**.
`FACTOR_IMPORT_COLUMNS` is the single declaration; `FACTOR_IMPORT_HEADER` is
the same list rendered as the copyable header row on the page, so the hint, the
tests and the parser cannot drift.

| column | required | accepted values |
| --- | --- | --- |
| `scope` | yes | `EMISSION_SCOPES` members verbatim |
| `activity_unit` | yes | `FACTOR_ACTIVITY_UNITS` members verbatim |
| `gas` | yes | `GHG_GASES` members verbatim |
| `gwp_set` | yes | `GWP_SETS` members verbatim |
| `published_uom` | yes | free text |
| `published_ghg_unit` | yes | free text |
| `value` | yes | the decimal grammar `factorDecimal` already enforces |
| `biogenic` | yes | `true`/`false`/`yes`/`no`/`1`/`0`, case-insensitive |
| `scope3_category`, `scope2_method`, `ch4_variant` | no | the matching enum, or empty |
| `level_1`-`level_4`, `column_text`, `region` | no | free text |
| `supersedes_source`, `supersedes_source_row_id` | no | free text; both or neither |

**Enum values are accepted verbatim and never guessed at.** A scope written as
the two-word English phrase is not `scope_1`; it is a legible row error naming
the accepted members, assembled by `describeRowIssue` from the same enum
constants the schema validates against. Guessing would put a value the customer
did not supply into a disclosure (AGENTS.md 5.3).

**The row rules are not restated in the domain module.** The action runs
`customFactorSchema.safeParse` per row — the same schema the single-row form
runs — so the rules exist once and run twice (AGENTS.md 10 rule 1). What lives
in `lib/domain/factor-import.ts` is only what a *file* has and a single form
does not.

**Whole-file refusals, before any row is looked at**: a missing required
column, a duplicate header, or an **unknown header**, each naming the offending
names. Silently ignoring an unknown column is how a customer's intended `region`
column never arrives, with nothing on the page saying so.

**Two cross-row checks**, neither of which can exist on the single-row path:

- **In-file duplicates**, on the identity `source_row_id` is hashed from. Two
  such rows would collide on `(set_id, source_row_id)` and the insert's
  conflict clause would discard the second in silence. The error names **both**
  lines, because either may be the mistake.
- **A mixed file** — combined CO2e rows beside per-gas rows. A set holds one
  `gas_basis`, derived and never asked, so such a file has no honest
  destination. Refused before any write, naming the two lines that disagree.
  The check sits in the domain layer rather than in `lib/db/`, because it needs
  line numbers and `lib/db/` has no business formatting them; the query keeps a
  `mixed_gas_basis` outcome as a defensive backstop.

**The row identity moved into the domain layer.** `factorRowIdentityParts` is
now the one declaration of which fields make a row *that* row, and
`sourceRowIdForCustomFactor` imports it rather than restating the list — so the
in-file duplicate check and the unique index agree by construction. The order,
the normalisation (trimmed, lowercased) and the conditionally-appended
supersession pair are unchanged from prompt 71, so **every hash already stored
still resolves**: a row created before this change re-submits as the idempotent
no-op it got before, not as a duplicate. `published_ghg_unit` stays out of the
identity — it is the publisher's wording for the numerator, not part of what
the row *is*.

### A pre-existing defect this prompt found and fixed

**Three correlated subqueries in `lib/db/emission-queries.ts` had been silently
answering zero**, and the read-back this prompt required is what surfaced them.

Drizzle interpolates a column reference inside a raw `sql` fragment as a bare
quoted column name, not as a table-qualified one. So

```sql
select count(*)::int from "emission_factor"
where "set_id" = "id" and "deleted_at" is null
```

resolved **both** sides against the innermost scope: the predicate was
`emission_factor.set_id = emission_factor.id`, never true, no error raised.

| query | field | was | is |
| --- | --- | --- | --- |
| `listFactorSets` | `factorCount` | 0 for every set | DESNZ 2026 v1.2 **7,035**, 2025 v1 **7,029** |
| `listTenantFactorSets` | `factorCount` | 0 for every set | the real count, read back below |
| `listTenantFactors` | `mappingCount` | 0 for every row | the real count |

So `/activity/factors` reported "0 active" for a set holding thousands of rows,
and "0 mapped pairs" for a row that was mapped — which also made the retire
button's warning under-state what retiring would cost. Fixed by aliasing the
inner table and naming the outer one explicitly. The correction is recorded at
`listFactorSets` and referenced from the two siblings.

### The write path

AGENTS.md 10's stages, in 10's order, copying `stageImport` and
`createCustomFactor`:

- **a. BotID — deliberately absent**, for the reason `stageImport` records
  verbatim: this path needs a live session and a `member` row, which is
  strictly stronger than a bot heuristic, and adding it is a two-file
  commitment in `instrumentation-client.ts` whose half-application makes the
  server call fail rather than pass.
- **b.** session, membership, the `pendingDeletion` lock, then
  `checkFactorImportLimit`, failing closed on a limiter error as every existing
  path does.
- **c.** the set choice through `importCustomFactorsSchema`; then file
  presence, `CSV_MAX_BYTES`, `decodeUtf8`, `parseCsv(text, CSV_MAX_ROWS)`; then
  the header contract; then `customFactorSchema.safeParse` per row; then the
  two cross-row checks.
- **d.** `membership.role !== "owner"` gets `CUSTOM_FACTOR_ERRORS.notOwner`. A
  factor moves every figure in a disclosure, so AGENTS.md 11.2 rule 2 puts the
  check in the action, not in the component that renders the control.
- **e.** `importTenantFactors` — one transaction, chunked at
  `INSERT_BATCH` (500) rows per statement.
- **f.** no email. `revalidatePath` for `/activity/factors`,
  `/activity/mappings` and `/activity`.

**No new limit constant.** The existing `CSV_MAX_BYTES` (2 MB) and
`CSV_MAX_ROWS` (10,000) are reused, because a whole national dataset fits
inside both — `lib/db/seed/defra-2026-factors.csv` is **1.1 MB and 8,740 data
rows** (`du -h`, `wc -l` minus the header).

**No recalculation and no automatic mapping** — prompt 66's decision,
unchanged. An imported row changes no figure until an owner maps a
`(category, unit)` pair to it at `/activity/mappings`, which is the surface
that already recalculates.

**Rows the set already holds are skipped and counted, not failed**, so
re-importing a corrected file is safe. Everything else that fails aborts the
transaction.

### The rate limit, and both numbers are judgements

`FACTOR_IMPORT_LIMIT = 6` per `"1 h"`, keyed by the **user id resolved
server-side**. **A judgement, not a measurement** (AGENTS.md 12 rule 4) — the
flow has never shipped, so there is nothing to fit against. It is tighter than
`FACTOR_MAPPING_LIMIT` (30) and tighter than the activity upload's 20, because
one accepted call writes up to `CSV_MAX_ROWS` rows in a single transaction:
the largest write one form submission can cause in this codebase.

### Measurements

**Every timing below is warm** (AGENTS.md 7.3's scale-to-zero note): the script
resolved an organisation and ran a throwaway query before anything was timed.
Taken against the Neon `main` branch on the free plan, over the pooled
connection, from a residential connection — so the round-trip component is
real and is not a server-side cost.

> **This line used to read "the development Neon branch", and that branch did
> not exist.** Corrected at prompt 89 (AGENTS.md 12 rule 8), which read the
> project's branch list back from the Neon API and found exactly one branch:
> `[default] main`, created 2026-08-07T15:14:44Z. Every measurement in this
> file taken before 16 Aug 2026 was therefore taken against `main` — the same
> database production uses. The `development` branch prompt 89 created is not
> the one this sentence claimed.

| file | parse + per-row validate | write (one transaction) | total |
| --- | --- | --- | --- |
| 100 rows | 13 ms both runs | 2,560 ms / 2,241 ms | 2,573 ms / 2,254 ms |
| 8,740 rows | 168 ms / 176 ms | 64,591 ms / 87,115 ms | 64,759 ms / 87,290 ms |

**Two runs are quoted because the spread between them is larger than anything
they measure.** The pure work — decode, parse, coerce, and 8,740
`safeParse` calls — is **under 180 ms**. Everything else is the database.

**Why the write dominates, and it is a judgement rather than a measured
attribution**: `emission_factor` carries a GIN trigram index on an expression
over the label columns, three btree indexes and two check constraints, and GIN
maintenance on insert is the expensive part of that set. The attribution was
not isolated by dropping an index, so it is stated as a judgement (AGENTS.md 12
rule 4).

**87 s for a maximum-size file sits inside Vercel's 300 s default function
duration** with room, so the path is not at risk today. It is recorded as the
thing to watch if `CSV_MAX_ROWS` is ever raised — that is a note, not a
deferral of work this prompt should have done.

**The row count read back from the database** — as `listTenantFactorSets`
reports it, not as the action returned it:

| after | action returned | database reports |
| --- | --- | --- |
| the 100-row import | `imported=100 skipped=0` | `factorCount` **100** |
| the 8,740-row import | `imported=8740 skipped=0` | `factorCount` **8,740** |
| re-importing the identical 100-row file | `imported=0 skipped=100` | still **100** |
| re-importing the identical 8,740-row file | `imported=0 skipped=8740` | still **8,740** |

**The all-or-nothing proof.** A copy of each file with one row in the middle
made invalid — line 50 of the 100-row file, line 4,370 of the 8,740-row file —
produced one row error, wrote nothing, and left the count where it was: **100**
and **8,740**. The measurement sets were deleted afterwards; nothing this
measurement created remains in the database.

### Trust boundary

What crosses: a multipart POST to the Server Action carrying a CSV file and the
set choice, from a browser with a Better Auth session cookie.

- **Authorised by** a live session, a `member` row for the organisation, a
  non-`pendingDeletion` organisation, and `role === "owner"` — all resolved
  server-side inside the action (AGENTS.md 11.2 rules 1 and 2).
- **Validated by** the file checks above and `customFactorSchema` per row.
  Nothing in the payload names an organisation and nothing may; the tenant
  comes from the session.
- **A submitted set id is a claim, not a capability** — re-read under the
  tenant predicate before a row is written into it, in the extracted
  `resolveWritableSet`. A missing, retired or foreign id is one
  indistinguishable `set_not_found`, so there is no existence oracle.
- **Rejected requests return a typed result** — never a thrown string, never a
  swallowed error, never a silent success (AGENTS.md 8.2 rule 4, 10 rule 2). A
  transaction that aborts leaves zero rows.
- No new route handler, no new public path, no environment conditional, no
  test-only route.

### Secrets and data

No new environment variable, no `.env.example` change, no `NEXT_PUBLIC_*`, no
new secret read, **no model call** (AGENTS.md 5.3: the import performs no
matching and invents no value).

The uploaded file is a customer's commercial reference data. It is **parsed in
memory and never persisted as a file** — no blob write, unlike step 9's staged
import, because there is no staged state to reconstruct. What is stored is the
factor rows themselves, tenant-scoped: `organization_id` is set on every row,
so AGENTS.md 9.2 rule 6 is unchanged.

**Nothing logs a row, a file, a header, a cell value, an address or a tenant
identifier.** The new code adds no `console` call at all, matching every file
under `app/`. `withSafeQueryErrors` covers the new query, so a database failure
cannot print the statement or its bound parameters.

Retention: prompt 81's phase-one sweep is untouched. Imported factors are
tenant data and exit with the organisation under prompt 73's 30-day erasure.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **12 files, 255 tests, all passing** — 11 files and 237 tests before, so the new file contributes 18 |
| `npm run build` | succeeded; route table identical to the parent's, `/activity/factors` still dynamic |
| the prerender comparison | below |
| `npm run test:e2e:local` | **100 passed, 2 skipped**, 4.2 m. The two skips are this file's Firefox copies; the two Chromium walks are in the pass count, and a targeted re-run named them: "imports every row of a valid file into a new set" (15.8 s) and "refuses a file with one bad row and writes nothing" (8.1 s) |
| `npm run test:e2e:webkit` | **not run — an environment gap, not a pass.** `scripts/playwright-webkit.sh` reports "Podman is required for WebKit on Arch Linux", exactly as prompts 78-80 recorded |
| `npm run db:generate` | **not run — the schema is untouched.** No migration belongs to this change |


### The prerender comparison

`docs/automation.md`'s clean two-build procedure: both sides copied out with
`.claude/` and `.agents/` excluded, `node_modules` hard-linked in, built in the
same environment, then normalising the build id, both chunk name patterns and
the inline flight payload. Run **after** this section and the code were both on
disk, so Tailwind v4 scanned the same prose on both sides.

| | base (`eafc364`) | impl |
| --- | --- | --- |
| prerendered HTML files | 21 | 21 |
| **identical after normalising** | — | **21 of 21** |
| differing | — | **0** |
| added or removed | — | **none** |
| CSS chunks | one, **68,506 B** | one, **68,559 B** |
| rules added / removed | — | **1 added, 0 removed** |

**The parent's CSS byte count was remeasured at this commit** rather than
carried forward, as the prompt required. The one added rule is a line-height
utility that the import leaf's copyable header block actually uses — it traces
to a class that was written, not to a word in prose (`docs/automation.md`'s
scanner trap).

`Prerender impact: none — no route markup or render-mode changes`, **verified
rather than assumed**.

### What prompt 82 deliberately did not do

| not done | why |
| --- | --- |
| a staging table, a review route, a blob write, a migration | the user chose the atomic shape; there is no staged state to persist, and the schema is untouched |
| partial import of a file with bad rows | the decision above: a partly-imported set is a set whose licence describes rows that are not all present |
| editing a set's metadata, or retiring a set from the UI | named deferrals, unchanged; the licence text is rendered as disclosure evidence, so a correction path wants its own prompt |
| market-based scope 2 | untouched prior deferral |
| automatic mapping or recalculation after import | prompt 66's decision, unchanged |
| re-pointing existing mappings at newly imported rows | prompt 70's refusal, unchanged: a mapping is a choice and a backfill would silently undo an override |
| AI-assisted column mapping | blocked, not deferred — prompt 75 reached AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, prompt 76 shipped the provider-free path. AGENTS.md 5.3 sanctions the surface and does not schedule it |
| a downloadable template CSV asset | the header contract renders on the page, so there is no second copy to keep in step |
| sharing the set-chooser fields between the two forms on `/activity/factors` | the import leaf repeats them rather than extracting a shared control out of a settled form. Same primitives, same names, same classes — a refactor of `custom-factor-form.tsx` was not this prompt's scope |
| any change to a marketing route, `SiteNav`, `SiteFooter`, `Container` or any GSAP surface | out of scope entirely (AGENTS.md 8.1) |
| a step 15 | AGENTS.md 5.2 remains the ordered plan; this is post-sequence work, as prompts 63-81 were |

## Connection acquisition resilience, prompt 83

Implemented on 15 Aug 2026. `/activity/factors` rendered a `DatabaseQueryError`
from `emission-queries.listSupersedableRows` with `sqlState: undefined`, on a
request the dev server timed at **20.6 s**, while all three of that page's
queries succeeded when run directly. This section is the diagnosis and the fix.
Post-sequence hardening of step 1's data layer, not a step 15 — AGENTS.md §5.2
remains the complete ordered product build.

### What changed

| file | change |
| --- | --- |
| `lib/db/query-error.ts` | third own property `driverFault` on `DatabaseQueryError`; new exported `readDriverFault`, its code allowlist and its name pattern |
| `lib/db/client.ts` | `AcquisitionRetryingPool`; a `pool.on("error")` listener; `connectionTimeoutMillis` re-derived; `min`, `max`, `idleTimeoutMillis` and `maxLifetimeSeconds` set deliberately |

Nothing else. No schema, migration, environment variable, dependency, package
script, route, component or style changed, and `npm run db:generate` was not
run. No query was touched — `listSupersedableRows` was the victim, not the
cause — and `app/activity/factors/page.tsx` still issues its three queries in
parallel, deliberately: collapsing them would have masked this by reducing
concurrency and left every other fan-out page exposed.

### The diagnosis, and its confidence

**Judged, not measured: the failure was a connection-acquisition timeout.**
Every observable is consistent with it and none contradicts it — a cause with no
SQLSTATE yields exactly `sqlState: undefined`, and 20.6 s is beyond the 10 s
ceiling that was in force — but prompt 80 drops `cause` by design, so the cause
was never captured. **The `driverFault` property below exists to turn this
judgement into a measurement the next time it happens**, and this line keeps
saying "judged" until it does.

The second-order finding **is** a measurement: `idleTimeoutMillis` defaults to
**10 s** (`node_modules/pg-pool/index.js:98-100`) while a fresh connection to
the pooled host costs **~2.1 s**, and pg-pool applies that timeout to every
client while `_clients.length > min`, with `min` defaulting to 0
(`index.js:90, 122-124, 409`). A developer moving between pages more than ten
seconds apart therefore paid a full handshake on nearly every render. AGENTS.md
§7.2 chose `pg` over the HTTP driver *for connection reuse*; the defaults undid
it.

### Measurements

Against the pooled Neon host from this machine, 15 Aug 2026. `pg` 8.22.0,
`pg-pool` 3.14.0.

| measurement | value |
| --- | --- |
| fresh connect + `select 1`, 3 concurrent, warm | 1980 / 2137 / 2145 ms |
| the same, 6 concurrent, warm | 2078-2188 ms |
| the same, 10 concurrent, warm | 2058-3743 ms |
| the failing request, from the user's terminal | 20.6 s, `operation: 'emission-queries.listSupersedableRows'`, `sqlState: undefined` |

Re-run **after** the change, with the shipped pool options:

| measurement | value |
| --- | --- |
| 3 concurrent, across a scale-to-zero wake | 3057 / 4039 / **4118** ms |
| 6 concurrent, warm | 2366-2640 ms |
| 10 concurrent, warm | 2015-**3273** ms |
| four `select 1`s **twelve seconds apart** — past the old 10 s idle default | **2051 / 388 / 284 / 409 ms** |
| the pool at the end of that sequence | `totalCount` 1, `idleCount` 1 |

The last two rows are the reuse fix, measured: only the first query pays a
handshake now, where every one of them did before. 4118 ms is the slowest
acquisition ever recorded against this host, and it includes a compute wake.

### The pool's settings, each marked

| option | value | measured or judged |
| --- | --- | --- |
| `connectionTimeoutMillis` | 7000 | **judged** — 1.7x the slowest observed acquisition (4118 ms, cold). One timeout plus the single retry is 14.1 s worst case, under the 20.6 s that provoked this. Replaces an inherited 10000 that was never derived |
| `idleTimeoutMillis` | 60000 | **judged** on the measured 2.1 s handshake and 10 s default — long enough to span a page's fan-out and the navigation after it, short enough that a burst's extra connections are not held for a session |
| `min` | 1 | **judged.** pg-pool applies no idle timeout while `_clients.length <= min`, so this is what makes the first query of a request find a live connection. It does **not** pre-connect: pg-pool creates clients on demand only |
| `max` | 10 | pg-pool's own default, set explicitly so it is a decision. The widest fan-out in the app is three queries |
| `maxLifetimeSeconds` | 240 | **judged** against Neon's **5-minute** idle suspend (AGENTS.md §7.3), which is the server-side cut the connection `min` holds open can otherwise outlive. The pool discards it a minute early, so a wake is paid on a fresh connect rather than discovered on a dead one |
| `ACQUIRE_RETRY_DELAY_MS` | 100 | **judged** — invisible next to a 2.1 s connect, enough that a retry racing a compute wake does not repeat the same instant |

`CONNECT_ATTEMPT_TIMEOUT_MS` (2500) and `attachDatabasePool` are unchanged, as
is the lazy, no-`Proxy` shape of `getDb()`.

### `driverFault` — what a codeless failure may now say

A third own property beside `operation` and `sqlState`, of the shape
`{ name, code }`:

- `name` is the cause's constructor name, accepted only when it matches
  `/^[A-Za-z][A-Za-z0-9_]{0,63}$/` and falling back to `"Error"` otherwise, so a
  cause whose `name` was overwritten with a message cannot smuggle one through.
- `code` is accepted only from a **closed allowlist** of fourteen transport
  codes — `ECONNREFUSED`, `ECONNRESET`, `ECONNABORTED`, `ETIMEDOUT`,
  `EHOSTUNREACH`, `ENETUNREACH`, `ENETDOWN`, `EPIPE`, `EADDRNOTAVAIL`,
  `ENOTFOUND`, `EAI_AGAIN`, `EPROTO`, `ERR_SOCKET_CONNECTION_TIMEOUT`,
  `ERR_SSL_WRONG_VERSION_NUMBER`. Anything else is dropped.

Never `message`, never `detail`, never `query`, never `params`. It is an
allowlist rather than a redaction for prompt 80's reason: a redaction has to be
right about every value it lets through, an allowlist only about the values it
names. Every property read stays inside `readDriverFault`'s `try`, matching
`readSqlState`'s discipline. This **narrows** disclosure relative to the raw
`DrizzleQueryError` and adds nothing to what prompt 80 already permitted.

### The retry, and why it is safe

`Pool#query` (`node_modules/pg-pool/index.js:448-451`) calls `this.connect()`
and returns its error **before dispatching anything**. Every error `connect`
reports is therefore one no statement outlived: nothing reached the server, and
a second attempt cannot repeat a write. `AcquisitionRetryingPool` overrides
`connect` — both the promise and the callback form — and on failure retries once
via `super.connect`, so a dead host costs exactly two attempts and cannot
recurse.

That is what makes the retry scopeable to acquisition **without touching a
single write path**, which the prompt required before allowing it at all. A
retry one layer up — inside `withSafeQueryErrors` — would not be safe: a
data-layer function may complete one statement and then fail to acquire a
connection for the next, so re-running it would repeat the first.

**A subclass, not a wrapper.** AGENTS.md §7.5 forbids a `Proxy` around the
client because Better Auth inspects the adapter object and its request chain
hangs with no error. A subclass is a real `Pool` — `instanceof`, own methods,
own emitter — so nothing that inspects it sees anything different.

**The retry timer is not `unref`ed**, and that is a measured correction: the
first draft called `timer.unref()`, and the verification below showed the
process exiting between the failure and the retry, dropping it silently.

### The `error` listener

`lib/db/client.ts` attached none. `pg-pool/index.js:52-62` emits `error` when an
**idle** client fails — a background disconnect from Neon, which happens
routinely across a compute suspend — and an `EventEmitter` `error` with no
listener throws, so a recovered condition could take the dev server or the
function instance down. The pool has already removed the client before it emits;
the listener logs that fact and the `readDriverFault` shape, never the error's
message, which on a connect failure can quote the host (AGENTS.md §8.3 rule 2).

### Verified, prompt 83

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **255 passed**, 12 files |
| `npm run build` | compiled in 8.8 s; route table **unchanged** — `/`, `/about`, `/careers`, `/journal`, `/design-system` `○ Static`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| retry, against a closed port | `[db] connection acquisition failed; retrying once { name: 'Error', code: 'ECONNREFUSED' }` logged **once**, then the failure surfaced at 112 ms — two attempts plus the 100 ms delay |
| the sanitized error, same run | `operation: 'check.acquisition'`, `sqlState: undefined`, `driverFault: { name: 'Error', code: 'ECONNREFUSED' }`; own properties are `stack`, `message`, `name`, `operation`, `driverFault` and nothing else |
| a real `db.transaction()` through the subclass — the **promise** form of `connect`, which Drizzle uses for transactions and the callback form never exercises | committed and returned `{ one: 1 }` in 2714 ms, and the query after it reused the connection at 253 ms |
| the concurrency and reuse re-measurement | quoted in full above |

The retry and sanitizer checks ran through a temporary ESM script importing
`lib/db/client.ts` under `tsx` with a throwaway tsconfig aliasing `server-only`
to an empty module — the same obstacle prompt 80 recorded, solved without
touching the shipped module. Both the script and the tsconfig were deleted
afterwards; nothing about them is committed.

**Prerender impact: none — no route changes**, verified against the route table
above rather than assumed. No HTML diff was run: this change touches `lib/db/`
only, and no marketing route imports it.

### What prompt 83 deliberately did not do

| not done | why |
| --- | --- |
| retry on writes, or anywhere above acquisition | a data-layer function can be multi-statement; only the acquisition boundary proves nothing was dispatched |
| change any query, or collapse `/activity/factors`' three parallel queries | it would mask the fault by reducing concurrency and leave every other fan-out page exposed |
| move to `@neondatabase/serverless` | AGENTS.md §7.2 settled the driver; a slow handshake argues for reusing connections, not for abandoning them |
| a Neon plan change to defeat scale-to-zero | out of scope, and the 240 s lifetime handles the consequence |
| forward `cause` on `DatabaseQueryError` | prompt 80's decision stands; `driverFault` is two matched identifiers, not the cause |

## The factor set's lifecycle — correcting provenance, retiring a set, prompt 84

Makes `emission_factor_set` correctable and retirable from `/activity/factors`.
It closes the deferral this file named six separate times — prompts 67, 68, 69,
70, 73 and 82 all recorded "editing a set's metadata, and retiring a set from
the UI" as open, and prompt 82's table said it "wants its own prompt".

Post-sequence work, as prompts 63–83 were. **Not a step 15** — AGENTS.md §5.2
remains the complete ordered product build, and every step in it is committed.

### The two gaps it closed

1. **`emission_factor_set.deleted_at` was a column nothing ever wrote.** Eight
   predicates in `lib/db/emission-queries.ts` filter `isNull(deletedAt)` on it
   and `app/activity/factors/page.tsx` derived `activeSets` from it, but no
   action and no query set it. Retirement was designed for, filtered for, and
   unreachable.
2. **A set's provenance was uncorrectable.** `licence`, `licenceUrl`,
   `sourceUrl` and `sourceReference` are selected straight off the set by
   `listPeriodFactorSets` in `lib/db/report-evidence.ts` and rendered as
   disclosure evidence, and the only escape from a typo was to create a second
   set and import every row again. Prompt 82 made that worse: a mistyped set can
   now arrive with thousands of rows behind it.

### The decisions, and their reasons

Each is a decision, not a measurement (AGENTS.md §12 rule 4).

| # | decision | why |
| --- | --- | --- |
| D1 | **Ten editable fields**: `source`, `datasetVersion`, `publicationYear`, `effectiveFrom`, `effectiveTo`, `licence`, `licenceUrl`, `sourceUrl`, `sourceReference`, `notes` | exactly `newFactorSetSchema` minus `mode`, so the edit schema **derives** from it (`.omit({ mode: true }).shape`, spread) rather than restating a field list that could drift |
| D2 | **`gasBasis` is not editable**, and the copy says so rather than rendering a disabled control | the basis is derived from the rows (`co2e` → `combined_co2e`, any other gas → `per_gas`) and `resolveWritableSet` refuses a row whose derived basis differs from its set's. Editing it would relabel every stored row's meaning without touching a row |
| D3 | **Editing the effective window is allowed**, and the surface states what it costs | prompt 68 made selection date-effective, so a corrected window changes which factor applies **at the next recalculation** and nothing before it. It changes no filed report: `report.evidence` is an immutable stored snapshot (`lib/db/schema.ts`) |
| D4 | **Retirement is the set's `deleted_at` and does not cascade to its rows** | every read path already excludes a retired set's rows through the set join, so cascading would add a second source of truth for one fact and make an un-retire a per-row repair. The rows list therefore stops calling such a row "Active" |
| D5 | **Retirement reports its cost from inside the retiring transaction** | a count read before the update can be stale by the time it lands — `retireTenantFactor`'s docblock records exactly this |
| D6 | **A published set is not addressable here.** Missing, already-retired, published and foreign are one indistinguishable `set_not_found` | both queries filter `eq(emissionFactorSet.organizationId, organizationId)`, which is non-null, so `organization_id is null` cannot match. No existence oracle, exactly as `resolveWritableSet` and `getVisibleFactor` treat theirs |
| D7 | **Both operations are owner-only**, checked inside the action after the session and the `pendingDeletion` lock | AGENTS.md §11.2 rule 2. `canManage` on the page stays presentation |

### What was built

| file | what it is |
| --- | --- |
| `lib/validation/emissions.ts` | `editFactorSetSchema` (derived from `newFactorSetSchema`, carrying `createCustomFactorSchema`'s two cross-field rules on **single-segment** paths), `EditFactorSetInput`, `EditFactorSetField`, `EditFactorSetResult`, `retireFactorSetSchema`, `RetireFactorSetResult`; two messages added to `CUSTOM_FACTOR_ERRORS` |
| `lib/db/query-error.ts` | `readSqlState` widened to `unknown` and **exported** — one reader, used twice, rather than a second copy of the shape inside a query module |
| `lib/db/emission-queries.ts` | `updateTenantFactorSet`, `retireTenantFactorSet`, `UpdateTenantFactorSetOutcome`, both wrapped in `withSafeQueryErrors`. No existing query changed |
| `app/activity/actions.ts` | `editFactorSet`, `retireFactorSet`, and `editFactorSetFieldErrors` |
| `app/_components/activity/factor-set-form.tsx` | **new** client leaf, component-only, one instance per set |
| `app/_components/activity/retire-set-button.tsx` | **new** client leaf, `RetireFactorButton`'s arm → confirm → announce pattern |
| `app/activity/factors/page.tsx` | both controls per set inside a `<details>`, owner-only; a retired set marked and stripped of controls; a live row in a retired set reads "Set retired" |
| `e2e/factor-set-lifecycle.spec.ts` | **new**, Chromium-only, three assertions |

**No migration, and `npm run db:generate` was not run** — the schema is
untouched. `deleted_at` and all ten editable columns already existed.

### The two queries

**`updateTenantFactorSet({ organizationId, data })`** →
`{ ok: true } | { ok: false; reason: "set_not_found" } | { ok: false; reason: "set_exists" }`.

One transaction: the set is re-read under `id = $1 and organization_id = $2 and
deleted_at is null` — **a claim, not a capability** — then updated under the same
predicate, `returning({ id })`. A zero-row return is `set_not_found`, so a set
retired between the read and the write answers the same as one that never
existed.

**Drizzle's `update` carries no conflict clause** — only `insert` has
`onConflictDoNothing` — so the `(organization_id, source, dataset_version)`
partial unique index is answered by catching the throw and reading SQLSTATE
`23505` off it through `readSqlState`. A pre-check `select` alone loses the race
with a concurrent create, and the race is what the catch is for. **The catch sits
outside the transaction on purpose**: the failed statement has already aborted
it, so returning a value from inside would try to commit an aborted transaction.

**`retireTenantFactorSet({ organizationId, setId })`** →
`{ retired: false } | { retired: true; mappingCount: number; factorCount: number }`.

One transaction, both counts first and the update second (D5). `mappingCount`
joins `activity_factor_mapping` to `emission_factor` on `factor_id`, filtering
`deleted_at is null` and `organization_id` on **both** sides; `factorCount` is
the set's live rows, which stay live.

### The two actions

Both copy `retireCustomFactor`'s stage order exactly (AGENTS.md §10 rule 3): no
BotID on an authenticated path (the existing comment points at `stageImport`);
session, tenant and the `pendingDeletion` lock; `checkFactorMappingLimit` keyed
by user id; parse with the shared schema; **then** the owner check; then the
write. Typed result throughout, never a throw, never a bare string. No `console`
call anywhere in the new code.

| action | input | success | refusals |
| --- | --- | --- | --- |
| `editFactorSet(input: unknown)` | `setId` + the ten fields of D1 | `{ ok: true }` | field errors from the shared schema; `set_exists` → `datasetVersion: CUSTOM_FACTOR_ERRORS.setRenameExists`; `set_not_found` → `setId: CUSTOM_FACTOR_ERRORS.setNotFound`; `notOwnerSet`; the four tenant-state sentences; the rate-limit sentence |
| `retireFactorSet(input: unknown)` | `setId` | `{ ok: true, mappingCount, factorCount }` | `set_not_found` → `setId`; `notOwnerSet`; the same tenant-state and rate-limit sentences |

**`/reports` is not a fourth `revalidatePath`, and that was checked rather than
assumed.** `app/reports/page.tsx` renders `listReports`, which reads stored
report rows, and a filed report's provenance is the immutable `report.evidence`
snapshot it was built with. The live read of the set — `listPeriodFactorSets` —
runs at generation time, so the next report built picks a correction up with no
cached page to invalidate. The three paths revalidated are
`retireCustomFactor`'s: `/activity/factors`, `/activity/mappings`, `/activity`.

### Verified, prompt 84

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **255 passed**, 12 files, 725 ms — unchanged, as predicted. No `lib/domain/` code was added; the new logic is a query and an action, which `npm test`'s scope deliberately excludes |
| `npm run build` | compiled in 10.1 s; route table **unchanged** — `/`, `/about`, `/careers`, `/journal`, `/design-system` `○ Static`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG`, `/activity/factors` `ƒ` |
| `npm run test:e2e:local` | **103 passed, 5 skipped** (3.5 min), Chromium and Firefox natively |
| `npm run test:e2e:webkit` | "Podman is required for WebKit on Arch Linux." — **an environment gap, not a pass**, as prompts 78–83 recorded |
| `npm run db:generate` | **not run.** The schema is untouched |

**Prerender comparison.** Two builds by `docs/automation.md`'s clean recipe —
`next dev` was running, so both sides were built in `~/.cache/aetherfield-diff`
with `.claude/` and `.agents/` excluded from each. Base is `d9ffbdd`.

| | result |
| --- | --- |
| prerendered HTML files | 21 on each side, same paths |
| identical after normalising `BUILD_ID` and the CSS/JS chunk names | **21 of 21** |
| differing | **0** |
| CSS chunk | `0nfq7xy4zoxgc.css` on **both** sides, 68,559 bytes each, same MD5 — **byte delta 0**, and an identical content hash |

The CSS is unchanged because the two new leaves reuse utilities the workspace
already ships; no new Tailwind class reached the one chunk. The first `impl`
build of the pair failed on six `fonts.gstatic.com` 404s — a transient network
fault in `next/font`, not a code failure — and was rebuilt from clean.

### One test bug found and fixed by the walk

The first run of `e2e/factor-set-lifecycle.spec.ts` failed its third assertion.
Set B's row label was `E2E lifecycle diesel <run> B` — a **superstring** of set
A's — and the rows list is newest first, so `filter({ hasText })` plus `.first()`
read set B's still-active row while asserting about set A's retired one. The two
labels are now unrelated words. The implementation was correct; the locator was
not.

### What prompt 84 deliberately did not do

| not done | why |
| --- | --- |
| un-retiring a set | reversal is a second decision with its own surface. Retirement is the deferral being closed; this is the new one |
| editing `gasBasis` | D2 |
| editing `organizationId`, `supersededBySetId`, `createdAt`, `retrievedAt` | none of them is the owner's to state |
| editing an individual factor **row** | a row is retired and re-added; prompt 67 settled that and it is not reopened |
| a migration | the schema is untouched; `npm run db:generate` was not run |
| cascading retirement onto the set's rows | D4 |
| re-pointing mappings, or recalculating after an edit | prompt 70's refusal and prompt 66's decision, both unchanged. The surface *says* a recalculation is what applies the change; it does not trigger one |
| removing the per-row "Retire" control from a row in a retired set | the row is still a row and retiring it is still valid; only its **state** wording changed |
| market-based scope 2 | untouched prior deferral, unrelated to this path |
| AI-assisted anything | blocked, not deferred — prompt 75 reached AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, and prompt 76 shipped the provider-free path |
| any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface | out of scope entirely (AGENTS.md §8.1) |
| a step 15 | §5.2 remains the ordered plan; this is post-sequence work as prompts 63–83 were |

## Market-based scope 2: the second reporting lane, prompt 85

Implemented on 15 Aug 2026. It closes the largest remaining named deferral on
the path that decides a filed disclosure figure — step 10's own record said
market-based scope 2 "needs REC/GO capture, supplier rates and a residual-mix
fallback", and `docs/backend.md` carried it as open in eleven places. Before
this change a second figure was **structurally impossible**, not merely
unbuilt: one unique index allowed one factor per `(organization, category,
unit)` and another allowed one computed figure per record.

Not a step 15. §5.2 remains the ordered plan; this is post-sequence work on
step 10's surface, on the same footing as prompts 63–84.

### The methodology, quoted rather than recalled

**The primary document was read this session**, not summarised from memory
(AGENTS.md §12 rule 2). Step 13 previously refused this work because "no
verified methodology was read for this step"; that refusal is discharged here.

- **Source**: *GHG Protocol Scope 2 Guidance*, an amendment to the Corporate
  Standard, retrieved **15 Aug 2026** from
  <https://ghgprotocol.org/sites/default/files/2023-03/Scope%202%20Guidance.pdf>
  (3.4 MB, PDF 1.7, 5,798 lines of extracted text). **The landing page
  <https://ghgprotocol.org/scope-2-guidance> could not be fetched** and the PDF
  exceeded `WebFetch`'s 10 MB content limit on its first URL, so it was
  downloaded and read with `pdftotext -layout`. Every quotation below is from
  that file, not from a secondary summary.

**The dual-reporting requirement — §1.5.1, "New reporting requirements":**

> Companies with any operations in markets providing product or
> supplier-specific data in the form of contractual instruments shall report
> scope 2 emissions in two ways and label each result according to the method:
> one based on the location-based method, and one based on the market-based
> method. This is also termed "dual reporting."

> Not having contractual data for every site will not cause noncompliance with
> the GHG Protocol Corporate Standard and Scope 2 Guidance. As with scope 3, a
> range of data may be available. Companies should consult the hierarchy of
> emission factors for both location-based and market-based methods. Any data
> on those hierarchies (including using location-based emission factors in the
> absence of contractual information) is acceptable.

**§7.4, "Dual reporting"** — that the two are two, and neither replaces the
other:

> Dual reporting allows companies to compare their individual purchasing
> decisions to the overall GHG-intensity of the grids on which they operate. In
> addition, reporting two separate scope 2 figures using two different methods
> provides several benefits [...]

**The market-based hierarchy — Table 6.3, "Market-based scope 2 data hierarchy
examples", in the published order, higher precision first:**

| rung | emission factors | indicative examples |
| --- | --- | --- |
| 1 | Energy attribute certificates or equivalent instruments (unbundled, bundled with electricity, conveyed in a contract for electricity, or delivered by a utility) | RECs (US, Canada, Australia), Generator Declarations (UK), Guarantees of Origin (EU), PPAs that also convey RECs or GOs |
| 2 | Contracts for electricity, such as power purchase agreements (PPAs) and contracts from specified sources, where electricity attribute certificates do not exist or are not required for a usage claim | contracts that convey attributes where certificates do not exist |
| 3 | Supplier/Utility emission rates, such as standard product offer or a different product, disclosed (preferably publicly) according to best available information | green energy tariffs, voluntary renewable electricity products |
| 4 | Residual mix (subnational or national) that uses energy production data and factors out voluntary purchases | calculated by EU country under the RE-DISS project |
| 5 | Other grid-average emission factors (subnational or national) — see location-based data | eGRID, "Defra annual grid average emission factor (UK)", IEA national factors |

**And what a reporter does when no contractual instrument and no residual mix
are available — the sentence immediately before Table 6.2:**

> Companies using the market-based method shall ensure that any contractual
> instrument from which an emission factor is derived meets the Scope 2 Quality
> Criteria listed in Chapter 7. Where contractual instruments do not meet the
> Scope 2 Quality Criteria requirements, and no other market-based method data
> are available, the location-based data should be used.

**This last quotation contradicts prompt 85's stated reason for D5, and the
contradiction is recorded rather than smoothed over** (AGENTS.md §12 rule 8).
The prompt justified refusing a grid-average fallback on the ground that it
"would put a number the reporter did not contract for into a disclosure". The
Guidance does not agree: rung 5 of its own hierarchy *is* the grid average, and
it says location-based data **should** be used when nothing better exists.

**D5 is kept, and it is now stated as what it actually is: a product decision
not to make that substitution silently, not a requirement of the standard.**
The reasoning that survives the correction:

- the substitution is a **reporter's judgement**, not a calculation. It asserts
  that no better instrument exists for that consumption, which this product
  cannot know — it knows only that no rate was mapped;
- the Guidance itself requires the result to be **labelled by method**, and a
  figure that is a grid average wearing a market-based label is the one thing
  the labelling requirement exists to prevent;
- the honest intermediate is what shipped: **the coverage is stated beside the
  figure**, on every surface and in the report's caveats, so the reporter can
  see exactly which records carry a contractual rate and decide for themselves.

**Adding rung 5 as an explicit, reporter-chosen fallback is therefore a real
open item**, not a rejected idea. It is listed in the deferrals table below.

### The decisions, D1–D10

Each is a decision, not a measurement (§12 rule 4).

| # | decision | as built |
| --- | --- | --- |
| **D1** | a second lane on `activity_factor_mapping`, not a second table | `scope2_method` column, nullable. `null` is the lane that always existed and keeps its meaning for every scope; `'market_based'` is the new one. `'location_based'` is refused at the boundary — the default lane already carries that figure |
| **D2** | two partial unique indexes replace `activity_factor_mapping_key` | `activity_factor_mapping_default_key` and `activity_factor_mapping_method_key`, below. Partial because Postgres treats NULLs as distinct, so a widened plain index would have permitted unlimited duplicate default mappings |
| **D3** | two partial unique indexes on `activity_emission` | `activity_emission_record_key` (now partial) and `activity_emission_record_market_key`. **Exactly one primary figure and at most one market-based figure per record** — measured as `max_rows_per_record = 2` below |
| **D4** | `ScopeTotals.scope2` and `.total` keep meaning the location-based figures | the market figures are new fields: `scope2MarketBased`, `totalMarketBased`, plus `scope2Records` / `scope2MarketBasedRecords`. `totalsForCoverage` in `lib/domain/targets.ts` reads `scope1/scope2/scope3` and is untouched, so no filed target, alert or stored snapshot restates |
| **D5** | no residual-mix dataset, and no silent grid-average substitution | a scope 2 record with no market-based mapping produces **no** market-based figure. Corrected above: this is a product decision, not a requirement of the Guidance |
| **D6** | the rate is entered through the existing custom-factor surface | `custom-factor-form.tsx` already offered `market_based` on a scope 2 factor, and the CSV importer already accepted a `scope2_method` column. No new capture UI was built |
| **D7** | the market pass runs over the filtered record subset and discards its own `unmatchedPairs` | a record with no contractual rate is the expected state, not a coverage gap. `outOfPeriodYears` is the same gap the default lane reports and is not special-cased |
| **D8** | `ENGINE_VERSION` bumps to **`1.2.0`**; stored emissions are not retroactively rewritten | old rows were produced by 1.1.0 and stay labelled as such until the next recalculation restates them |
| **D9** | the snapshot's new fields are optional | on **`reportEvidenceSchema`**, which is the exported name — the prompt called it `reportSnapshotSchema`, and there is no such export. A report filed before this change keeps parsing |
| **D10** | one owner-gated action for both lanes, with the lane as an input field | `setFactorMapping` unchanged in stage order; the lane is a field on `factorMappingSchema` |

### The lane check, which is the load-bearing server-side rule

`app/activity/actions.ts` refuses **both** directions at stage e, after
re-resolving the factor under the tenant's own visibility:

- a factor that is not a scope 2 row with `scope2_method = 'market_based'`
  cannot be mapped on the market lane — that is the grid-average substitution
  D5 refuses, arriving by hand;
- a market-based row cannot be mapped on the **default** lane — `totalsOf`
  partitions market-based figures out of `scope2` and `total`, so the pair's
  contribution would silently vanish from the location-based reading.

The picker's list is narrowed the same way (`searchFactorsForPair` takes a
`lane`), and that narrowing is a courtesy: the action is the check.

### The migration

`npm run db:generate` produced **`lib/db/migrations/0016_mute_doomsday.sql`**,
read before it was applied, verbatim:

```sql
DROP INDEX "activity_factor_mapping_key";--> statement-breakpoint
DROP INDEX "activity_emission_record_key";--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD COLUMN "scope2_method" "scope2_method";--> statement-breakpoint
CREATE UNIQUE INDEX "activity_emission_record_market_key" ON "activity_emission" USING btree ("activity_record_id") WHERE "activity_emission"."scope2_method" = 'market_based';--> statement-breakpoint
CREATE UNIQUE INDEX "activity_factor_mapping_default_key" ON "activity_factor_mapping" USING btree ("organization_id","category","unit") WHERE "activity_factor_mapping"."scope2_method" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_factor_mapping_method_key" ON "activity_factor_mapping" USING btree ("organization_id","category","unit","scope2_method") WHERE "activity_factor_mapping"."scope2_method" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_emission_record_key" ON "activity_emission" USING btree ("activity_record_id") WHERE "activity_emission"."scope2_method" is distinct from 'market_based';
```

**No `ALTER TABLE` was hand-run** (§9). Read back from `pg_indexes` after
`npm run db:migrate`, both pairs present as declared:

```
CREATE UNIQUE INDEX activity_emission_record_key ON public.activity_emission USING btree (activity_record_id) WHERE (scope2_method IS DISTINCT FROM 'market_based'::scope2_method)
CREATE UNIQUE INDEX activity_emission_record_market_key ON public.activity_emission USING btree (activity_record_id) WHERE (scope2_method = 'market_based'::scope2_method)
CREATE UNIQUE INDEX activity_factor_mapping_default_key ON public.activity_factor_mapping USING btree (organization_id, category, unit) WHERE (scope2_method IS NULL)
CREATE UNIQUE INDEX activity_factor_mapping_method_key ON public.activity_factor_mapping USING btree (organization_id, category, unit, scope2_method) WHERE (scope2_method IS NOT NULL)
```

`information_schema`: `activity_factor_mapping.scope2_method`, `USER-DEFINED`,
udt `scope2_method`, nullable.

**`is distinct from`, not `<>`.** `scope2_method` is null on every scope 1 and
scope 3 figure, and `null <> 'market_based'` is null rather than true — a plain
inequality would have left every scope 1 and 3 row outside both indexes and
unguarded.

**`ON CONFLICT` needs the predicate repeated.** Postgres infers a *partial*
unique index only when the statement restates its `WHERE`, so
`setFactorMapping` passes Drizzle's `targetWhere` on both branches. Without it
the upsert matches no index and raises instead of updating.

### The double-count traps a second lane creates, and where each was closed

Every one of these is a query that counted rows where it meant to count
records. They are the real cost of the second lane and they are listed so a
later join is written with them in mind.

| where | what would have happened | fix |
| --- | --- | --- |
| `listFactorCoverage`'s mapping join | a pair with both lanes joins twice, doubling `recordCount` and `outOfPeriodRecords` for the whole grouped read | `isNull(activityFactorMapping.scope2Method)` on the join; the market lane is read by the new `listMarketBasedMappings` |
| `countOutOfPeriodRecords` | the same, on the inner join | the same predicate |
| `countPeriodRecords` in `report-evidence.ts` | `count(*)` over the emission join counts a dual-reported record twice as *committed* | `scope2_method is distinct from 'market_based'` on the join |
| `EmissionsSummary`'s `calculated` | `parsed.length` counts rows, overstating coverage by the number of market figures | count the primary lane only |
| `buildReportEvidence`'s `coverage.calculatedRecords` | the same | the same |
| `seedDefaultMappings`' existence check | an organisation holding only a market mapping would never be seeded | the check is scoped to the default lane |
| `totalsOf` | market-based figures summed into `scope2` and `total` — the double count that matters, because it reaches a filing | partitioned out before anything is summed |

### Measurements

All from a synthetic organisation built, measured and deleted by a throwaway
script (500 electricity records, one `(electricity, kWh)` pair, a location-based
factor of 0.2 and a market-based rate of 0.01234 — no real supplier, no real
rate). **Warm**, against the free-plan Neon resource with scale-to-zero on
(§7.3).

| what | result |
| --- | --- |
| recalculation, default lane only | **10 queries, 4,873 ms warm**, 500 figures over 500 records |
| recalculation, both lanes | **11 queries, 9,409 ms warm**, 1,000 figures over 500 records |
| the second lane's query cost | **+1 query — one extra insert batch, not a per-record fan-out.** The market pass issues no query of its own: the mappings and siblings are already loaded, the resolver never queries, and both lanes' figures go to one `replaceEmissions` call in one transaction |
| dual figures, by lane | 500 location-based figures and 500 market-based figures |
| the two figures are genuinely independent | summed exactly from `numeric`: **100000.000000000000000000000000 kg** location-based against **6170.000000000000000000000000 kg** market-based (500 × 1000 kWh × 0.2, and × 0.01234) |
| no double counting | **`max_rows_per_record = 2`** — one primary figure and one market-based figure, which is exactly what the two partial indexes permit |

**The wall clock roughly doubles because twice as many rows are written, and
nothing here is a measurement of the second *pass*** — it is a measurement of a
recalculation that persists 1,000 figures instead of 500. Whether that matters
on a large tenant is a question for the nightly sweep, not answered here.

### Prerender impact and verification, prompt 85

**None. Verified, not assumed** (§8.1).

A dev server was running, so both sides were built in copies under
`~/.cache/aetherfield-diff` per `docs/automation.md`'s clean recipe, base at
`8b21f34`.

- **Route table**: `/`, `/about`, `/careers`, `/journal`, `/design-system`
  `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG`;
  every route this change touches — `/activity`, `/activity/mappings`,
  `/dashboard`, `/reports*` — already `ƒ` and still `ƒ`.
- **21 prerendered HTML files on each side, same file set. After normalising
  `.next/BUILD_ID`, both chunk-name patterns and the RSC flight scripts: 0 of
  21 differed.**
- **The CSS chunk is identical by content hash** — `0nfq7xy4zoxgc.css` on both
  sides, 69 KB. No normalisation was needed for it, which is a stronger result
  than the usual byte comparison: nothing this change touched produced a single
  new utility, because every file it edits is behind an authenticated route
  whose utilities were already emitted.

### Checks run

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **268 passed, 12 files** — up from 255, so the new cases are running |
| `npm run db:generate` | `0016_mute_doomsday.sql`, read before applying, quoted above |
| `npm run db:migrate` | applied; indexes read back from `pg_indexes` above |
| `npm run build` | route table above |
| `npm run test:e2e:local` | **107 passed, 9 skipped** (Chromium + Firefox) |
| `e2e/market-based-scope-2.spec.ts` alone, Chromium | **6 passed** (4 tests plus setup and teardown) |
| `npm run test:e2e:webkit` | **did not run** — "Podman is required for WebKit on Arch Linux", the same environment gap prompts 78–84 recorded. **A gap, not a pass** |
| prerender diff | **0 of 21 differed**, CSS chunk identical by hash |

### Trust boundary and data

- **No new public write path.** `setFactorMapping` is authenticated and
  owner-only, checked inside the action after the session, the tenant
  resolution and the `pendingDeletion` lock. No BotID on an authenticated path.
- A submitted factor id remains **a claim, not a capability**: re-read through
  `getVisibleFactor` under the tenant predicate, with missing, deleted,
  superseded and foreign all answering one indistinguishable refusal.
- The lane arrives as a field on the shared schema and is parsed at stage c;
  a value other than `market_based` or absent is a field error, never a third
  lane.
- **No new environment variable and no `NEXT_PUBLIC_*`.** `DATABASE_URL`
  through `lib/db/client.ts`, and the existing Upstash limiter, unchanged.
- **No personal data.** A supplier-specific rate is a customer's commercial
  data: tenant-scoped on every read and write, never logged, never transmitted.
  `app/activity/actions.ts` still has no `console` call. **No model is called** —
  §5.3's phase-two AI surfaces are untouched.

### Corrections made in this change

Three places predicted or asserted something this work falsified, and each is
fixed in place rather than left standing (§12 rule 8):

1. **`SCOPE2_METHODS`' docblock** in `lib/validation/emissions.ts` said
   `market_based` "needs REC and GO capture, supplier-specific rates and a
   residual-mix fallback, none of which the product models yet". One of the
   three now exists (the supplier-specific rate), one does not (REC/GO document
   capture) and one is now a deliberate refusal rather than a gap (residual
   mix). The docblock says which is which.
2. **`EmissionsSummary`'s rule 3** said "this step produces location-based
   only".
3. **`reportSections`' scope 2 label** joined every method present in the
   period. That was right while only one could be present; with two it would
   have labelled a location-based figure as though it were both.

### What prompt 85 deliberately did not do

| not done | why |
| --- | --- |
| **a residual-mix dataset** | needs the separately licensed AIB European Residual Mixes. Same class of block as the IEA licence recorded at step 10 |
| **rung 5 as an explicit, reporter-chosen grid-average fallback** | **a real open item, newly named.** The Guidance permits it and D5 declines to do it *silently*; offering it as a recorded, per-pair choice with its own provenance is a coherent next prompt, and it is not this one |
| **REC / GO certificate document capture** | a blob upload, a retention decision and an evidence-linking surface. The figure is correct without it — the instrument's *rate* is what multiplies, and D6 captures that — but nothing in this product evidences a claim |
| **Scope 2 Quality Criteria enforcement** | Chapter 7's criteria are properties of an instrument this product does not model. Asserting them would be a claim we cannot check |
| **supplier or contract entities** | D6. A contract register is a different product |
| **re-basing targets or alerts on the market-based figure** | D4 keeps `total` location-based on purpose. Which basis a target tracks is a decision with its own surface |
| **restating already-filed reports, or rewriting stored emissions** | D8 and D9. A snapshot is immutable; old rows keep their engine version until the next recalculation |
| **the market lane on categories other than `electricity` and `heat`** | `SCOPE2_MARKET_LANE_CATEGORIES`. `fuel` is combusted on site and is scope 1; nothing else in the list is scope 2 at all |
| **close-wording search on the market lane** | the candidates are the handful of rates a tenant entered itself, and `searchFactorsByWording` has no lane predicate — it would offer rows the action then refuses |
| **un-retiring a factor set** | prompt 84's own deferral, untouched and still open |
| **AI-assisted anything** | blocked, not deferred — prompt 75 reached AI Gateway and got "AI Gateway requires a valid credit card on file to service requests", the user declined the card, and prompt 76 shipped the provider-free path |
| **any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface** | out of scope entirely (AGENTS.md §8.1) |
| **a step 15** | §5.2 remains the ordered plan; this is post-sequence work as prompts 63–84 were |

## Rung 5: the reporter-chosen grid-average fallback, prompt 86

Implemented on 15 Aug 2026. It closes the one open item prompt 85 named as
*newly* open, on the disclosure path, and it closes a stated contradiction
rather than adding a feature: the section above records that D5's original
justification was falsified by the Guidance's own text, that the Guidance's
rung 5 **is** the grid average, and that what survives is a product decision not
to make the substitution **silently**. This prompt builds the non-silent
version, and nothing else.

Not a step 15. §5.2 remains the ordered plan; this is post-sequence work on
step 10's surface, as prompts 63–85 were.

### The standard, verified against the recorded quotation

**Nothing user-facing here was composed from memory** (AGENTS.md §12 rule 2).
The two sentences that authorise rung 5 were already quoted verbatim into this
file by prompt 85 and were re-read before any copy was written:

- **Table 6.3, "Market-based scope 2 data hierarchy examples", rung 5** —
  *"Other grid-average emission factors (subnational or national) — see
  location-based data"*, with eGRID, the Defra annual grid average and IEA
  national factors as its examples;
- **the sentence before Table 6.2** — *"Where contractual instruments do not
  meet the Scope 2 Quality Criteria requirements, and no other market-based
  method data are available, the location-based data should be used."*

No live source was consulted this session, so nothing could disagree with the
recorded quotation; the rung is cited by number and the table by name in the
code comment that justifies the substitution (`app/activity/actions.ts`, the
three-case matrix).

### The enum, and where its names come from

`scope2_market_basis`, two values, **named from the Guidance's own vocabulary
rather than invented**:

| value | rungs | why this word |
| --- | --- | --- |
| `contractual_instrument` | 1–3 | §1.5.1's own term for what rungs 1–3 are: *"markets providing product or supplier-specific data in the form of contractual instruments"*, and the Table 6.2 sentence's *"any contractual instrument from which an emission factor is derived"* |
| `grid_average` | 5 | rung 5's own wording, *"Other grid-average emission factors"* |

**Rung 4, residual mix, is deliberately not a value.** The AIB European Residual
Mixes dataset is separately licensed and is not shipped, so a value here would
be a name with no way to be populated — the same class of block as the IEA
licence at step 10. Recorded in `SCOPE2_MARKET_BASES`' docblock.

### The decisions, E1–E8

Each is a decision, not a measurement (§12 rule 4).

| # | decision | as built |
| --- | --- | --- |
| **E1** | the basis is a stored column, never derived from the factor row | `scope2_market_basis` on `activity_factor_mapping` (nullable, non-null only on the market lane) and denormalised onto `activity_emission`. Two reasons in the schema docblock: a factor row can be superseded or corrected later and a filed figure's provenance must not move with it; and rung 5 is a **reporter's assertion**, which has to be recorded as one rather than inferred |
| **E2** | the market lane has **no default basis** | `factorMappingSchema` refuses a market-lane mapping with no basis and refuses a basis on the default lane, both as field errors. The whole point of rung 5 is that the reporter chose it |
| **E3** | the lane check becomes a three-case matrix | default lane → the factor must not be market-based (prompt 85's rule, unchanged); market + `contractual_instrument` → a scope 2 `market_based` row; market + `grid_average` → a scope 2 row that is **not** market-based. The third case is the substitution prompt 85 refused, permitted only on the explicit basis |
| **E4** | the **lane** labels the figure, not the factor row | `calculateRecordEmission` takes the basis and, when it is present, writes `scope2_method = 'market_based'` regardless of the factor's own method. On the contractual basis that is a no-op; on rung 5 it is the point, because the chosen row is a grid average whose own method says `location_based`. A basis on a non-scope-2 factor is a new typed refusal, `basis_off_scope_2` |
| **E5** | the fallback is **inside** the market-based figure, not a third lane | `ScopeTotals` gains `scope2MarketBasedFallback` and `scope2MarketBasedFallbackRecords`; `scope2MarketBased` and `totalMarketBased` keep meaning the whole market lane, which is what the hierarchy means. `total`, `scope2` and `totalsForCoverage` are untouched, so no filed target, alert or snapshot restates (prompt 85's D4, preserved) |
| **E6** | `ENGINE_VERSION` bumps to **`1.3.0`**; stored rows are not rewritten | a pair on the fallback now produces a figure where 1.2.0 produced none. Old rows keep 1.2.0 until the next recalculation, as D8 established |
| **E7** | the snapshot's two new fields are optional **inside** the optional `marketBased` block | a report filed between prompts 85 and 86 carries `marketBased` without them and must keep parsing (D9). Absent means "filed before the fallback existed"; `"0.000"` means "the fallback exists and this period uses none of it". Every snapshot this engine writes carries them |
| **E8** | close-wording search is **enabled** on the fallback basis and stays off on the contractual one | re-derived, not copied — see below |

### One refusal, not two

The prompt predicted "two new refusals" from the three-case matrix. **There is
one** — `notGridAverage`, for a factor offered on the fallback basis that is not
a scope 2 grid average — because the matrix's other direction is already
`marketBasedOnDefaultLane`, which prompt 85 shipped. Recorded rather than
padded (§12 rule 8). Two *other* new entries exist for E2's schema refusals,
`basisMissing` and `basisOnDefaultLane`, so `FACTOR_MAPPING_ERRORS` gains three
in total.

### E8, re-derived: why the fallback gets close-wording search

Prompt 85 gave **two** reasons for making the market lane lexical-only, and the
prompt for this change required the question to be re-asked rather than either
answer copied. One reason is removed and one does not carry over:

- *"`searchFactorsByWording` has no lane predicate, so it would offer rows the
  action then refuses."* **Removed rather than worked around**: the function now
  takes the lane and the basis and applies the same `marketLaneScope` predicate
  the lexical picker uses, stated once so the two pickers cannot narrow
  differently;
- *"the market lane's candidates are the handful of contractual rates this
  tenant has entered itself."* **True of the contractual basis and false of the
  fallback.** Rung 5's candidates are the same thousands of published scope 2
  rows the default lane searches, which is precisely the haystack close-wording
  ranking was built for.

So: lexical-only on `contractual_instrument`, both modes on `grid_average`. The
mapping page derives it once as `lexicalOnly` and the form reads it rather than
restating the rule beside the button.

### The migration

`npm run db:generate` produced **`lib/db/migrations/0017_mixed_spacker_dave.sql`**,
read before it was applied. The three generated statements, verbatim:

```sql
CREATE TYPE "public"."scope2_market_basis" AS ENUM('contractual_instrument', 'grid_average');--> statement-breakpoint
ALTER TABLE "activity_emission" ADD COLUMN "scope2_market_basis" "scope2_market_basis";--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD COLUMN "scope2_market_basis" "scope2_market_basis";
```

and the backfill, **written by hand into the generated file** rather than run
against the database (§9 forbids the hand-run `ALTER TABLE`, not a custom
statement in a generated migration):

```sql
UPDATE "activity_factor_mapping"
   SET "scope2_market_basis" = 'contractual_instrument'
 WHERE "scope2_method" = 'market_based'
   AND "scope2_market_basis" is null;
```

**The row count was verified rather than assumed.** Before applying:
`select scope2_method, count(*) from activity_factor_mapping group by 1` returned
exactly one row — **`null` → 11**. There are **zero** market-lane mappings on
this database, so the backfill matched **0 rows here**; it is in the migration
because it is the correct statement for any environment that has one, and
because every market-lane row that could exist carries a contractual rate by
construction — prompt 85's lane check has refused anything else since the lane
existed.

**`activity_emission` is deliberately not backfilled**, per E6 and D8. A null
basis on a stored market-based figure reads as "computed before the fallback
existed", which is true, and the next recalculation restates it under 1.3.0.
`buildFactorResolver` reads a null basis on a market-lane *mapping* as
`contractual_instrument` for the same reason, so no unlabelled market figure can
be produced.

Read back after `npm run db:migrate`:

```
scope2_market_basis: activity_emission        USER-DEFINED  udt scope2_market_basis  nullable YES
scope2_market_basis: activity_factor_mapping  USER-DEFINED  udt scope2_market_basis  nullable YES
enum scope2_market_basis: contractual_instrument, grid_average
```

**The four partial unique indexes are unchanged, and that was verified rather
than assumed** (the prompt required it, because `ON CONFLICT` infers a partial
index only from a repeated predicate). All four still read exactly as prompt 85
recorded them:

```
CREATE UNIQUE INDEX activity_emission_record_key ON public.activity_emission USING btree (activity_record_id) WHERE (scope2_method IS DISTINCT FROM 'market_based'::scope2_method)
CREATE UNIQUE INDEX activity_emission_record_market_key ON public.activity_emission USING btree (activity_record_id) WHERE (scope2_method = 'market_based'::scope2_method)
CREATE UNIQUE INDEX activity_factor_mapping_default_key ON public.activity_factor_mapping USING btree (organization_id, category, unit) WHERE (scope2_method IS NULL)
CREATE UNIQUE INDEX activity_factor_mapping_method_key ON public.activity_factor_mapping USING btree (organization_id, category, unit, scope2_method) WHERE (scope2_method IS NOT NULL)
```

Both predicates are on `scope2_method`, so neither index's inference is affected
by the new column. `setFactorMapping` therefore keeps both `targetWhere`
branches unchanged, and the basis rides in the row and in the `set` clause: a
pair has **one** market-lane mapping, and changing its basis changes that
mapping rather than adding a second one.

### Measurements

From a throwaway synthetic organisation built, measured and deleted by a scratch
script — prompt 85's recorded pattern — with **400 records** (200 electricity,
200 heat, 1,000 kWh each, all dated 2026-05-31), a synthetic contractual rate of
`0.01234` on the electricity market lane, and the published DESNZ district-heat
grid average mapped on the heat market lane as the rung-5 fallback. No real
supplier and no real contractual rate (§8.3).

| what | result |
| --- | --- |
| recalculation, both lanes | **11 queries**, 800 figures over 400 records |
| against prompt 85's recorded 11 | **held — the fallback adds no query.** It rides on mappings already loaded and on the resolver, which issues none |
| wall clock, first run of the session | **10,089 ms** — a cold resource (free-plan scale-to-zero, §7.3) |
| wall clock, **warm** — a second identical run in the same process | **6,011 ms**, same 11 queries, same 800 figures |
| `max_rows_per_record` | **2**, with a fallback mapping present. A pair carrying rung 5 produces no third row |
| the three-way split, rows | 400 location-based · 200 market-based contractual · **200 market-based fallback** |
| the three-way split, exact `numeric` sums | **61250.000000000000000000000000 kg** location-based · **2468.000000000000000000000000 kg** contractual · **35058.000000000000000000000000 kg** fallback |
| the fallback is inside the market total and outside `total` | the market lane sums to 2468 + 35058 = 37526 kg and the location-based total is 61250 kg — neither is an addend of the other, and the fallback's 35058 kg is exactly the heat pair's own location-based contribution (200 × 1000 × 0.17529), which is what rung 5 *means*: it restates the location-based reading on the market lane |
| `engine_version` on every written row | **`1.3.0`**, one distinct value |

**That last row is the honest reading of the whole feature**, and it is why the
copy says the market-based total is not comparable to a procured one where it
rests on rung 5.

#### The double-count traps, re-run against a pair carrying a fallback

Every check in prompt 85's trap table, run over the rig's data, where the heat
pair carries **both** a default-lane mapping and a rung-5 market-lane mapping:

| trap | result |
| --- | --- |
| `listFactorCoverage`'s mapping join | **verified** — 200 for electricity and 200 for heat, not 400. The `isNull(scope2Method)` join predicate still holds |
| `countOutOfPeriodRecords`'s inner join | **verified** — 400, not 800 |
| `countPeriodRecords` in `report-evidence.ts` | **verified** — `committed = 400`, `uncalculated = 0`, not 800 committed |
| `EmissionsSummary`'s `calculated` | **verified** — 400 primary-lane rows against 400 records |
| `buildReportEvidence`'s `coverage.calculatedRecords` | **verified**, same count and same predicate |
| `seedDefaultMappings`' existence check | **verified** — the default-lane-scoped count sees 2, so an organisation holding only a market mapping is still seedable |
| `totalsOf` | **verified in the domain tests** — the fallback lands in `scope2MarketBased` and in `scope2MarketBasedFallback`, and in neither `scope2` nor `total` |

Nothing needed fixing: prompt 85's predicates are all on `scope2_method`, and
the fallback is a market-lane row like any other to every one of them.

### Corrections made in this change

Four places asserted something this work falsified. Each is fixed in place
rather than appended to (§12 rule 8):

1. **`lib/domain/reports.ts`'s coverage caveat** said the remainder "carry no
   contractual instrument rate, and no residual mix or grid average has been
   substituted for them". The second clause is now conditional on there being no
   fallback, and a fallback gets **its own caveat naming the count and the
   rung**;
2. **`reportSections`' market-based note** made the same claim; same fix, plus a
   new row stating the fallback's figure and record count;
3. **`app/_components/activity/emissions-summary.tsx`**'s market-based note made
   it a third time; it now states the split instead, and the market-lane total's
   note says the figure restates the location-based reading to the extent it
   rests on a grid average;
4. **`SCOPE2_METHODS`' docblock** in `lib/validation/emissions.ts` said "no grid
   average is ever substituted", full stop. It now says what remains true:
   nothing substitutes one *on the reporter's behalf*, and a figure resting on
   one is labelled everywhere it is shown.

`FACTOR_MAPPING_ERRORS.notMarketBased` was rewritten for the same reason: it
told the reporter their only option was to add a contractual rate, which was
true with one basis and incomplete with two. It now names both.

### Prerender impact and verification, prompt 86

**None. Verified, not assumed** (§8.1).

A dev server was running, so both sides were built in copies under
`~/.cache/aetherfield-diff` per `docs/automation.md`'s clean recipe, base at
`b51c4ea`.

- **Route table**: `/`, `/about`, `/careers`, `/journal`, `/design-system`
  `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG`; every
  route this change touches — `/activity`, `/activity/mappings`, `/dashboard`,
  `/reports*` — already `ƒ` and still `ƒ`.
- **21 prerendered HTML files on each side, same file set. After normalising
  `.next/BUILD_ID`, both chunk-name patterns and the RSC flight scripts: 0 of 21
  differed.**
- **The CSS chunk is identical by content hash** — `0nfq7xy4zoxgc.css` on both
  sides, 68,559 bytes. Same hash as prompt 85's, so no new utility and no new
  prose-scanned rule reached the marketing pages.

### Checks run

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **283 passed, 12 files** — up from 268, so the new domain cases are running |
| `npm run db:generate` | `0017_mixed_spacker_dave.sql`, read before applying, quoted above with its hand-written backfill |
| `npm run db:migrate` | applied; the column, the enum and all four partial indexes read back above |
| `npm run build` | route table above |
| `npm run test:e2e:local` | **107 passed, 12 skipped, 1 failed** — the failure is `factor-picker.spec.ts` on **Firefox**, which **passes in isolation** (`5 passed`). It is the cross-project contention the market-lane specs' own docblocks describe: the three browser projects share one organisation. Not a regression from this change, and reported rather than smoothed over |
| the two market-lane specs, Chromium | **9 passed** — `market-based-scope-2.spec.ts` and the new `scope-2-grid-average-fallback.spec.ts` together, including setup and teardown |
| `npm run test:e2e:webkit` | **did not run** — "Podman is required for WebKit on Arch Linux", the same environment gap prompts 78–85 recorded. **A gap, not a pass** |
| prerender diff | **0 of 21 differed**, CSS chunk identical by hash |

### Trust boundary and data

- **No new public write path.** `setFactorMapping` is authenticated and
  owner-gated, checked inside the action after the session, the tenant
  resolution and the `pendingDeletion` lock. No BotID on an authenticated path,
  and the stage order is unchanged.
- **The basis is parsed at stage c** by the shared schema, which runs in the
  client leaf and again in the action. A value outside the enum, a basis on the
  default lane and a missing basis on the market lane are all field errors —
  never a third lane and never a silent default.
- The factor id stays **a claim**: re-read through `getVisibleFactor` under the
  tenant predicate, with missing, deleted, superseded and foreign answering one
  indistinguishable refusal.
- **The rung-5 permission is narrow by construction**: it admits a scope 2
  grid-average row and nothing else. A scope 1 or scope 3 factor on the market
  lane stays refused on both bases, in the action *and* in the engine, which
  answers `basis_off_scope_2` rather than mislabelling the figure.
- In the query string, `basis` follows the lane's own rule: `fallback` is the
  only value that means anything else, and a forged value selects the
  contractual basis the reporter would have got anyway. The action re-derives it
  from its own input.
- **No new environment variable and no `NEXT_PUBLIC_*`.** `DATABASE_URL` through
  `lib/db/client.ts`; the existing Upstash limiter unchanged.
- **No personal data.** A reporter's methodology choice is a customer's
  commercial data: tenant-scoped on every read and write, never logged, never
  transmitted. `app/activity/actions.ts` still has no `console` call.
  `emission_factor` keeps its narrow published-data exception and every read
  keeps the `organization_id is null or = $1` predicate.
- **No model is called** (§5.3). AI factor matching remains blocked, not
  deferred.

### What prompt 86 deliberately did not do

| not done | why |
| --- | --- |
| **applying the fallback automatically, or defaulting it on** | the entire distinction between this and prompt 85's D5. Silent substitution stays refused, permanently: there is no default basis, and E2 makes its absence a field error rather than a fallback-to-fallback |
| **rung 4, a residual-mix dataset** | needs the separately licensed AIB European Residual Mixes. Not a value in the enum, because a value with no way to be populated is a fabrication |
| **REC / GO certificate document capture** | still open. A blob upload, a §8.3 retention decision and an evidence-linking surface |
| **Scope 2 Quality Criteria enforcement** | Chapter 7's criteria are properties of an instrument this product does not model. Prompt 85's reasoning, unchanged |
| **backfilling `activity_emission`'s basis** | D8. A stored figure keeps the engine version and the provenance it was produced under until the next recalculation restates it |
| **re-basing targets or alerts on the market-based figure** | D4 keeps `total` location-based on purpose |
| **restating filed reports** | D9. The snapshot is immutable and the two new fields are optional so it keeps parsing |
| **the market lane on categories beyond `electricity` and `heat`** | `SCOPE2_MARKET_LANE_CATEGORIES` unchanged |
| **un-retiring a factor set** | prompt 84's deferral, still open and untouched |
| **editing a factor set's metadata** | still open, still wants its own prompt |
| **AI-assisted anything** | blocked, not deferred |
| **any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface** | out of scope entirely (§8.1), and verified by the prerender diff |
| **a step 15** | §5.2 remains the ordered plan; this is post-sequence work as prompts 63–85 were |

---

## Completing the production environment, prompt 87

**Scope: the deployed environment, not the code.** No file under `app/` or
`lib/` was edited, no dependency changed, and no feature was added. This prompt
promoted environment variables that existed only in Development, added ones that
existed nowhere on Vercel, and pushed the five commits production was behind.
It is the first entry here that records a deployment rather than a build.

### What was broken in production, measured 15 Aug 2026

Read from `vercel env ls`, `vercel ls`, `vercel inspect` and
`git ls-remote origin main`, before anything was written. Names only; no value
was echoed at any point (§8.4).

| variable | environments it existed in | consequence in production |
| --- | --- | --- |
| `RESEND_API_KEY` | **none on Vercel** — only in the untracked local `.env.local` | no email at all was sendable |
| `BETTER_AUTH_URL` | Development only | `appBaseUrl()` (`lib/email/config.ts`) throws when unset — newsletter confirm/unsubscribe, organisation invitations and step 14's threshold alerts all fail on it |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Development only | Google sign-in broken on the deployed `/sign-in` and `/sign-up` |
| `LEAD_NOTIFICATION_EMAIL` / `APPLICATION_NOTIFICATION_EMAIL` | none | a supported state — the notification is skipped, logging no address. A demo request was captured and nobody was told |

**The compound consequence was worse than any single row, and neither document
that reasoned about it saw the whole.** `lib/auth/server.ts` sets
`requireEmailVerification: true` with `sendOnSignUp`, so email/password signup
cannot complete without a working Resend key — and this file's step 6 record
gave the mitigation as *"Google remains the available signup path in the
meantime"*, while Google's credentials were Development-only. **Production
therefore had no working signup path at all.** Each document closed the other's
gap on paper and neither closed it in the environment.

### Decisions taken with the user, 15 Aug 2026

- **D1. `LEAD_NOTIFICATION_EMAIL` and `APPLICATION_NOTIFICATION_EMAIL` are both
  `geralddonkor1@gmail.com` in Production.** Chosen deliberately over a
  role-based address: under the sandbox sender it is the *only* recipient Resend
  will deliver to, so it is the sole value that makes an internal notification
  arrive today. Confirmed against the `resend` skill this session rather than
  restated from this file — its documented failure mode is a 403 when sending
  from `resend.dev` to anything but the Resend account's own address. **Two
  variables, not one reused**: collapsing sales and recruiting into a single
  address is a decision nobody has made, and this prompt did not make it either.
- **D2. Google's credentials are promoted to Production, and the Google Cloud
  Console redirect URI is the user's step.** The implementation cannot add
  `https://aetherfield-rho.vercel.app/api/auth/callback/google` to the OAuth
  client. **Both halves are open — see the open items below.**
- **D3. `BETTER_AUTH_URL` is set for Production only; Preview is recorded as a
  known gap rather than guessed at.** A preview deployment's URL is
  per-deployment, so no single stored value is honest for it. The alternative —
  teaching `appBaseUrl()` to fall back to `VERCEL_URL` — is a code change to the
  module resolving every emailed link, on a path this prompt does not exercise.
  It gets its own prompt if preview deploys ever send mail. This is the same
  refusal step 6 made: add the deployed origin, do not invent one.

### The production environment as written

Four of the six intended variables landed. Each value was piped through stdin
rather than passed as `--value`, so no secret appeared in a command line, a
shell history entry or a terminal (§8.4). `vercel env pull` was **not run at any
point** — `RESEND_API_KEY` existed only in `.env.local`, and a pull replaces
that file entirely, which would have destroyed the only copy. After this change
the value is on Vercel and that hazard is closed, which is itself part of why
the promotion was worth doing.

| variable | environment | type | source |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Production | Sensitive | local `.env.local`, unprinted |
| `BETTER_AUTH_URL` | Production | Sensitive | `https://aetherfield-rho.vercel.app` |
| `LEAD_NOTIFICATION_EMAIL` | Production | Sensitive | D1 |
| `APPLICATION_NOTIFICATION_EMAIL` | Production | Sensitive | D1 |

**All four came out Sensitive, including the two that are not secrets.** Only
`RESEND_API_KEY` was added with an explicit `--sensitive`; the CLI applied the
same type to the URL and to both addresses on its own, under a project or team
policy this prompt did not set and did not investigate. Recorded as observed
behaviour, not as an intention. The practical consequence is that these four
cannot be read back off Vercel — `vercel env ls` shows `Hidden` for their
values — so `BETTER_AUTH_URL`'s production value is recoverable only from this
file or the dashboard.

**No `NEXT_PUBLIC_*` variable was added**, which keeps AGENTS.md §8.4's line
true that this project has no public environment variable at all.

### The deployment

`git push origin main`, `eafc364..3e8e42f`. The GitHub integration deploys
production on a push to `main`; **no second deployment path was introduced** and
`vercel --prod` was not run.

- **id** `dpl_9UzcpLqU7UVS9Z7QvYNJDfeZGV8u`
- **target** production, **status** Ready, **build duration** 1m
- **created** Sat 15 Aug 2026 22:14:43 GMT
- **aliases** `https://aetherfield-rho.vercel.app`,
  `https://aetherfield-dgsloxx417s-projects.vercel.app`,
  `https://aetherfield-git-main-dgsloxx417s-projects.vercel.app`

The five commits it carries: `b0f0ef1` bulk factor-set CSV import, `d9ffbdd`
connection-acquisition resilience, `8b21f34` factor-set lifecycle, `b51c4ea`
market-based scope 2, `3e8e42f` the rung-5 grid average.

**Ordering, which matters and is guaranteed rather than inferred:** all four
environment writes completed before `git push` ran, so the build necessarily
started with them in place. The previous production deployment is 21h older,
which corroborates that this deployment is the push's and not a pre-existing
one.

### Verification

Local, at `3e8e42f`, before the push — a failing check would have ended the
prompt:

- `tsc --noEmit` — no diagnostics
- `eslint` — no output
- `vitest run` — `Test Files 12 passed (12)`, `Tests 283 passed (283)`
- `next build` — compiled in 10.0s, 32 static pages generated

The route table AGENTS.md §8.1 fixes was emitted unchanged: `/`, `/about`,
`/careers`, `/journal`, `/design-system` as `○ Static`; `/article/[slug]` (6
paths) and `/job-listing/[slug]` (3) as `● SSG`.

Live, against the production alias after the deployment reached Ready:

| path | status |
| --- | --- |
| `/`, `/journal`, `/about`, `/careers`, `/sign-in`, `/sign-up` | `200` |
| `/api/cron/purge-organizations`, `/api/cron/purge-submissions`, `/api/cron/recalculate` | `401` |

**The three cron paths failing closed to an unauthenticated request is proven on
a real deployment**, not assumed from the code. `CRON_SECRET` is Production and
Preview only.

`vercel logs` on the new deployment returned exactly the nine requests those
checks made, all at level `info`, **no errors and no warnings**. The six
marketing paths were served as `◇` and the three cron paths ran as `λ`
functions, which independently confirms the prerendered pages are still
prerendered as deployed rather than only as built.

**No prerender diff was run here, and none was required.** This prompt adds no
code; the diff that matters was run per-commit by each of the five prompts whose
work was deployed. Saying so explicitly rather than implying a diff happened.

**The E2E matrix was not run.** It builds and serves locally on port 3100 and
tells us nothing about the deployed environment, which is the only thing this
prompt changed. The live checks above are the ones that bear on it.

### Trust boundary — unchanged in code, materially changed in effect

Three write paths that were inert in production because their key was missing
are now live. `RESEND_API_KEY` makes `lib/email/send.ts` able to send, so the
demo-request, newsletter, application, invitation and alert paths reach a real
provider for the first time on this alias. Every one keeps the §10 order it
already had — BotID, rate limit, schema parse, write, then best-effort email —
and this prompt weakened none of it. A failed email still never fails the write.

### Open items this prompt did not close

**`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are still Development-only.**
The promotion was attempted three times and blocked each time by the local
permission classifier, not by Vercel and not by a technical obstacle. **Google
sign-in remains broken in production**, exactly as before this prompt. This is
the one item of prompt 87's stated scope that was not delivered, and it is
recorded as not done rather than as done.

> **Corrected 15 Aug 2026 (§12 rule 8).** Both variables were promoted to
> Production by the user on that date, so the paragraph above is now stale as to
> state — it is kept because the *reason* it was not done in prompt 87 still
> describes that prompt's outcome accurately. `vercel env ls production` lists
> both, Sensitive, and Vercel stamped them Sensitive on its own; the values
> cannot be read back from the platform. **The commands this section originally
> recorded were defective and are corrected below.**

**The quoting trap, which cost one wrong write.** `.env.local` stores both
values *quoted* (`GOOGLE_CLIENT_ID="…"`). Next.js strips surrounding quotes when
it loads that file, so local Google sign-in works; `vercel env add` does not,
and stores them literally. The first promotion attempt therefore wrote a client
ID beginning with `"`, which the CLI warned about in one easily-missed line —
`! Value includes surrounding quotes (these will be stored literally)` — and
which `vercel env ls` cannot reveal afterwards, because the variable is
Sensitive. Production would have failed with `invalid_client` while every
listing looked correct. The variable was removed and re-added with the quotes
stripped:

```
vercel env rm GOOGLE_CLIENT_ID production --yes
grep '^GOOGLE_CLIENT_ID=' .env.local | cut -d= -f2- | sed 's/^"//; s/"$//' | vercel env add GOOGLE_CLIENT_ID production
grep '^GOOGLE_CLIENT_SECRET=' .env.local | cut -d= -f2- | sed 's/^"//; s/"$//' | vercel env add GOOGLE_CLIENT_SECRET production --sensitive
```

**The absence of that warning line is the only check available at write time**,
since a Sensitive value cannot be read back. Any future promotion of a value out
of `.env.local` strips quotes the same way and watches for the same line.

Environment variables apply to deployments built *after* they are set, so a
redeploy is required once they land.

**The Google Cloud Console redirect URI** —
`https://aetherfield-rho.vercel.app/api/auth/callback/google` — must be added to
the OAuth client by hand. **Google sign-in is not to be reported as working
until both this and the two variables above are done and confirmed.**

> **Closed 15 Aug 2026.** All three are done and confirmed. The redirect URI was
> added alongside the existing localhost entry — one OAuth client serves both,
> and Google matches the list exactly, so `https` and no trailing slash matter.
> Production sign-up through Google completed end to end and landed on
> `/account`.

**How each half was confirmed, because they need different evidence.** The
client ID is verifiable without signing in: `POST /api/auth/sign-in/social` with
`{"provider":"google"}` returns Better Auth's authorize URL, and its query
carries the `client_id` and the `redirect_uri` the server will actually send. On
production that returned an `accounts.google.com` URL whose `client_id` ends
`.apps.googleusercontent.com` with **no leading or trailing quote** — which is
what proved the quoting trap above had been cleared, from the running server
rather than from the write command's output. **The secret cannot be reached that
way**: it is used only in the server-to-server token exchange after the
callback, so nothing observable from a browser or a curl exercises it. The
completed sign-in is the only evidence for it, and that is why this item stayed
open until a real one was performed.

**Two Console details that cost time.** The consent screen no longer exists
under that name — Google split it into **Google Auth Platform** in 2025, and
publishing status and test users are at `console.cloud.google.com/auth/audience`.
And **Authorised JavaScript origins is not the field for the callback**; it
rejects any path. It is left **empty** deliberately: `GoogleSignInButton` calls
`authClient.signIn.social`, which posts to our own server and redirects, and the
Google mark is inlined SVG — no browser-side call to a Google endpoint exists,
so an origin entry would be unused permission. Adding One Tap or the rendered
GIS button later would change that.

**Preview has no `BETTER_AUTH_URL`** (D3), so anything on a preview deployment
that resolves an emailed link still throws. Deliberate; wants its own prompt if
preview deploys ever send mail.

**No sending domain, so `FROM` is unchanged.** This is the real blocker on
customer-facing email and it stays open — the three-step procedure is recorded
at step 3 above. **Email is not "working" beyond internal notification to D1's
address**, and under the sandbox sender no other recipient is deliverable. The
practical reading: a demo request from a stranger now notifies the D1 address,
but that stranger's confirmation email does not arrive.

**`requireEmailVerification` was not weakened** to route around the sandbox
sender. Step 6's refusal stands.

**No custom domain** — `vercel domains ls` reports 0. **No `vercel.ts`, no CI
workflow file**; the GitHub integration already deploys `main` and a second path
is the thing to avoid. **Neon branching for preview deployments** remains open
from step 1.

> **Closed at prompt 90.** Prompt 89 did the local half — a `development` branch
> backs local development and the E2E matrix. Prompt 90 did the preview half,
> and **not** by splitting the environment variable as this note once assumed:
> Neon's native preview branching injects a per-deployment connection string
> that overrides the row, so no `vercel env` write was needed at all. Measured
> end to end against a real preview deployment. See "Preview deployments get
> their own database branch, prompt 90" below.

### One standing constraint, discovered here

**The GitHub repository is public** (`gh api repos/gerald-donkor/aetherfield` →
`private: false`). `.env.local` is gitignored and no secret is in the tree, so
this push was safe as it stood — but a public repository is a standing
constraint on every future commit, and it is recorded here because prompt 87 is
where it was discovered.

---

## A development database branch, prompt 89

Built 16 Aug 2026. **Before this, one `DATABASE_URL` served Production, Preview
and Development, so every `npm run dev` session and every E2E run read and wrote
the production database.** `e2e/auth.setup.ts` signs up five identities, creates
organisations, verifies addresses by direct write and grants staff and admin
roles; the teardown deletes them again. That full create/delete cycle ran
against the same rows a real demo request lands in.

**No application source file changed.** The repointing lives in untracked
`.env.local` and in Neon. The tracked change is `.env.example`'s step-1 comments
and this record.

### The topology, read back rather than assumed

`neonctl` is not installed; `npx -y neonctl@latest` (3.2.2) works, and at prompt
89 it authenticated from `NEON_API_KEY`, minted from the console reached by
`vercel integration open neon neon-purple-candle` (Vercel SSO).

> **Corrected at prompt 90 — an API key is not required.** This paragraph used
> to add that the resource was provisioned `--no-claim`, so it sits in the
> Vercel-managed Neon org and "a personal Neon OAuth login does not address it".
> **That is false as of 16 Aug 2026 and is corrected here rather than left
> standing** (§12 rule 8). With `NEON_API_KEY` absent from the environment
> entirely, `npx -y neonctl@latest branches list --project-id
> royal-glade-46788829` authenticated from the cached OAuth credential at
> `~/.config/neon/credentials.json` and listed the Vercel-managed project's
> branches correctly.
>
> **Why it changed is reasoning, not measurement, and is labelled as such.** The
> likely cause is that Neon's docs say a team member only appears in the
> Vercel-managed organization once they "click **Open in Neon** from the Vercel
> integration page and complete authentication" — a one-time step that links the
> Vercel identity to Neon. That step was performed during prompt 90, when the
> Neon Console was opened to revoke the key. Plausible and consistent with the
> observed before/after, but not independently proven.
>
> **The practical rule: run `neonctl auth` once and use the OAuth session.** An
> API key is the fallback for a non-interactive context, not the requirement.
> Prefer OAuth — it is not a long-lived organization-wide credential sitting in
> a file, which is exactly the problem the key turned out to be.

Before the change, `neonctl branches list` returned **exactly one branch**:

| name | id | state | created |
| --- | --- | --- | --- |
| `[default] main` | `br-nameless-salad-auq3ag2h` | ready | 2026-08-07T15:14:44Z |

**That is why line ~10204 of this file was wrong.** It said prompt 82's import
measurements were "taken against the development Neon branch"; no such branch
existed on that date. Corrected in the same change (AGENTS.md 12 rule 8) — every
measurement in this file predating 16 Aug 2026 was taken against `main`.

### The plan allowance, quoted from the API

From `neonctl projects get`, 16 Aug 2026 — read, not recalled (12 rule 7):

| field | value |
| --- | --- |
| `owner.subscription_type` | `free_v3` |
| `owner.branches_limit` | 10 |
| branches in use before | 1 |
| `branch_logical_size_limit_bytes` | 536870912 (512 MiB) |
| `synthetic_storage_size` | 53778480 |
| `pg_version` | 17 |
| `region_id` | `aws-us-east-1` |
| `history_retention_seconds` | 21600 |
| `default_endpoint_settings` | 0.25–0.25 CU, `suspend_timeout_seconds: 0` (global 5-minute default) |

A second branch is well inside the allowance. **No plan change, and none needed.**

### The branch, and why it is schema-only

`development`, `br-dark-scene-auzqda1h`, off `main`, created with
`neonctl branches create --schema-only`. It has its own read-write compute
endpoint at 0.25–0.25 CU, with `pooler_enabled: false` on the endpoint record
(the pooled `-pooler` hostname is still served). **The endpoint id is not
written here**: it is the database hostname's prefix, this repository is public,
and Neon accepts connections from any address. Read it back from
`neonctl branches get development` when it is needed.

**Schema-only, not a full clone, and that is a personal-data decision.** A Neon
branch is a copy-on-write clone and arrives carrying the parent's rows — here
that would have meant a second copy of a real job `application` and its private
CV blob reference. AGENTS.md 8.3 rule 1 says collect only what the flow needs,
and nothing local needs those rows: the E2E fixture provisions every identity it
uses, and the published factor sets are re-seedable from the committed CSV.
Confirmed by measurement, not by assumption — immediately after creation the
branch held all 25 tables and **0 rows in every one of them**.

### `db:migrate` fails on a fresh schema-only branch — and why

**A schema-only branch copies `drizzle.__drizzle_migrations` as an empty table.**
So Drizzle believes nothing has been applied while the tables already exist, and
`npm run db:migrate` re-applies migration 1 onto a live schema. It exits **1**,
and — the part that costs time — it prints **no error at all**: output ends on
the `applying migrations...` spinner. The first run of this prompt read that as
success because the exit code had not been checked.

The fix is to make the branch genuinely empty and migrate from zero:

```
drop schema if exists public cascade;
drop schema if exists drizzle cascade;
create schema public;
```

run behind a guard that counts every row in `public` and `drizzle` first and
refuses at anything but zero — the script cannot run against a database with
data in it. Then:

| command | exit | result |
| --- | --- | --- |
| `npm run db:migrate` | 0 | whole chain applied from zero |
| `npm run db:migrate` again | 0 | no-op, as required |
| `npm run db:seed:factors` | 0 | DESNZ 2025 v1: 7,029 factors · DESNZ 2026 v1.2: 7,035 · 41.1 s |

**The alternative — backfilling the migrations journal to "baseline" the
branch — was rejected**: it hand-writes Drizzle's own bookkeeping, which AGENTS.md
9 keeps exclusively Drizzle's, and it never proves the chain applies.

**Anyone creating a schema-only Neon branch for this repo must do the drop
first.** It is not optional and the failure gives no message.

### The isolation, measured — production did not move

Counts only, over the direct connection, no row contents (8.3 rule 2).
Production counts were taken immediately before the E2E run and again after.

| table | prod before | prod after | dev before | dev after |
| --- | --- | --- | --- | --- |
| `user` | 1 | 1 | 0 | 0 |
| `session` | 7 | 7 | 0 | 0 |
| `account` | 1 | 1 | 0 | 0 |
| `organization` | 2 | 2 | 0 | 0 |
| `member` | 1 | 1 | 0 | 0 |
| `invitation` | 0 | 0 | 0 | 0 |
| `verification` | 1 | 1 | 0 | 0 |
| `lead` | 0 | 0 | 0 | 0 |
| `subscriber` | 0 | 0 | 0 | 0 |
| `application` | 1 | 1 | 0 | 0 |
| `activity_record` | 2 | 2 | 0 | 0 |
| `activity_import` | 1 | 1 | 0 | 0 |
| `activity_import_row` | 2 | 2 | 0 | 0 |
| `activity_factor_mapping` | 11 | 11 | 0 | 0 |
| `activity_emission` | 0 | 0 | 0 | 0 |
| `emission_factor` | 14084 | 14084 | 14064 | 14064 |
| `emission_factor_set` | 4 | 4 | 2 | 2 |
| `emission_target` | 1 | 1 | 0 | 0 |
| `site` | 2 | 2 | 0 | 0 |
| `organization_deletion` | 1 | 1 | 0 | 0 |
| `retention_purge_run` | 5 | 5 | 0 | 0 |
| `report` / `target_alert` / `alert_preference` | 0 | 0 | 0 | 0 |
| **`rate_limit`** | **6** | **6** | **0** | **3** |

**Every production count is unchanged — `diff` of the two full 25-table listings
is empty.** The fixture's own identities were created and torn down on
`development`, which is why its user/session/organisation counts return to zero.

**`rate_limit` is the positive half of the proof, and it matters.** A table of
all-zeros on both sides would be equally consistent with the E2E run never having
touched a database at all. `rate_limit` is the one table the fixture does not
restore — the run prints
`[e2e] rate_limit rows: 0 before, 3 after (not restored — keyed by ip and path,
self-pruning)` — so development moving 0 → 3 while production held at 6 shows the
writes landed, and shows where.

**The two branches differ by 20 factors and 2 sets, deliberately.** Production
carries 14,084 factors across 4 sets; `development` carries the 14,064 published
DESNZ rows across the 2 published sets that the committed CSV seeds. The
difference is customer-supplied and test-created sets on production, which the
seed does not and should not reproduce.

### Timings against the new endpoint — nothing refitted

A branch gets its own compute endpoint, so prompt 83's constants were
re-measured against it. **All warm** (7.3's scale-to-zero note): a throwaway
connect-and-query ran before anything was timed.

| measurement | prompt 83, `main`'s pooled host | prompt 89, `development`'s pooled host |
| --- | --- | --- |
| TCP connect | 319–410 ms | **232 / 232 / 264 ms** |
| 3 concurrent fresh connection + `select 1`, slowest | 2145 ms | **2197 ms** |
| 6 concurrent, slowest | 2188 ms | **2299 ms** |
| 10 concurrent, slowest | 3743 ms | **2452 ms** |

**Every number is inside the existing budgets, so no constant changed** — which
is what the prompt required, and a refit would govern production's connection
behaviour and belongs to its own prompt. `CONNECT_ATTEMPT_TIMEOUT_MS` (2500) and
`CONNECTION_TIMEOUT_MS` (7000) both stand.

One observation worth recording: the pooled host resolves to **6 addresses (3 A,
3 AAAA)** as before, but **none of the three AAAA addresses connected from this
machine** — no IPv6 route here. That is exactly the case
`CONNECT_ATTEMPT_TIMEOUT_MS` exists for, and it is a property of this machine,
not of the branch.

### `NEON_API_KEY` — a local tooling credential, not an application variable

`neonctl` reads it; nothing in `app/` or `lib/` does, and the application runs
without it. It lives in `.env.local` only and is **never** set on Vercel, so it
is recorded in `.env.example` as a comment with no `=` line — a name in that
file with a value slot implies the app needs it, and it does not.

### What this did not do

- **Preview's `DATABASE_URL` is still `main`'s.** `vercel ls` shows every
  deployment this project has ever had is Production, so no preview deployment
  has ever written anything. The variables are also owned by the Neon
  Marketplace integration, and splitting one integration-managed row into
  per-environment values risks the integration overwriting it. Still open.
- No `vercel env` write of any kind, on any environment. No `vercel env pull`
  either — it replaces `.env.local` wholesale and `RESEND_API_KEY` exists there
  for Development and nowhere else.
- No schema change, no new migration, no seed change, no plan change.

### Verification

| check | result |
| --- | --- |
| `npm run typecheck` | exit 0, no output |
| `npm run lint` | exit 0, no output |
| `npm test` | 12 files, **283 passed**, 1.44 s |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, exit 0, 3.6 min, against `development` |
| `npm run test:e2e:webkit` | **not run — blocked** |

**No prerender diff was run, deliberately.** No source file changed, so the diff
would be a build against itself; the route table is the evidence, as the prompt
specified.

**The WebKit third of the matrix did not run: Podman is not installed on this
machine.** `scripts/playwright-webkit.sh` reports `Podman is required for WebKit
on Arch Linux` and exits; `which podman` finds nothing. So `npm run test:e2e` —
the full matrix AGENTS.md 2 defines — has **not** been run in full for this
change, and the isolation measurement rests on the Chromium and Firefox projects
only. Both browsers exercise the same fixture, the same sign-ups and the same
teardown, so the write path under test is the same one; the gap is browser
coverage, not database coverage. Reported rather than routed around
(12 rule 9). Installing Podman would close it.

---

## Preview deployments get their own database branch, prompt 90

Built 16 Aug 2026. **Before this, a preview deployment would have resolved
`DATABASE_URL` to the Neon `main` branch — production's database.** Prompt 89
closed the local half of that exposure and left this half open. It is now
closed, and the exposure was prospective throughout: `vercel ls` confirmed every
deployment this project had ever had was `Production`, so nothing had yet
written to production through a preview. This closed the hole before the first
preview deploy opened it.

**No application source file changed.** The change is a setting on the Vercel
side of the Neon resource, plus `.env.example`'s step-1 comment block and this
record.

### The approach prompt 89 assumed was wrong, and that is why this was cheap

Prompt 89 deferred this because splitting one integration-managed
`DATABASE_URL` row into per-environment values risks the integration
overwriting it. That reasoning was sound and the premise was not: **no split is
needed.** Neon's Vercel-Managed integration branches for previews natively —
Vercel webhooks Neon at deployment time, Neon creates `preview/<git-branch>`,
and the branch's connection variables are injected into that deployment alone,
overriding the row. The `Production, Preview, Development` row is untouched.

Neon's docs are explicit that the injected values "cannot be accessed or viewed
in your Vercel project's environment variable settings", so **their absence from
`vercel env ls` is correct rather than a gap** — a later session looking for a
Preview `DATABASE_URL` will not find one and should not add one.

### The toggle is dashboard-only — verified, not assumed

The CLI does not expose it. Read back before changing anything:

| command | what it showed |
| --- | --- |
| `vercel integration --help` | `add`, `update`, `open`, `list`, `resource`, … — no deployment/branching surface |
| `vercel integration resource --help` | `connect`, `disconnect`, `remove`, `create-threshold`, `claim`, `inspect` |
| `vercel integration resource connect --help` | `-e/--environment`, `--prefix`, `--format`, `--yes`. **Nothing else** |
| `vercel integration resource inspect neon-purple-candle` | `Free · subscription · installation`; `aetherfield (production, preview, development)`; no branching field |

So AGENTS.md §7.4 rule 5 applied: the work stopped, the user made the change in
the dashboard, and it was read back afterwards. **Nothing was routed around.**

### The shipped UI does not match Neon's documentation, and the labels are a trap

Neon's guide says *Advanced Options → Deployments Configuration → Required →
Preview*. The dialog that actually ships (**Storage → neon-purple-candle →
Projects → the row's ⋮ → Configure**) reads differently, and the mismatch cost
a round trip. Its real controls, as read back before the change:

| control | before | after |
| --- | --- | --- |
| Environments | All Environments | **All Environments** (unchanged) |
| Require Active Resource Before Deploy | Not Required | **Required** |
| Create Database Branch For Deployment | Preview ☐ · Production ☐ | **Preview ☑** · Production ☐ |
| Custom Environment Variable Prefix | empty | empty |
| Sensitive | off | off |

**Two controls in that dialog say "Preview" and they do different things.**
`Environments` decides which deployments receive the variables at all;
`Create Database Branch For Deployment` decides which get their own Neon branch.
Only the second was the target. During the change the `Environments` dropdown
was opened and **Production was unchecked**, leaving it reading
`Preview, Development` — saving that would have stripped `DATABASE_URL` and the
`PG*` / `POSTGRES_*` rows from production deployments. Caught before saving.
**Anyone opening this dialog again should confirm `Environments` still reads
`All Environments` before pressing Save.**

**`Create Database Branch For Deployment → Production` stays unchecked.** It
would put production deployments on a per-deployment branch instead of `main`.

**A prefix would rename `DATABASE_URL`** and break `lib/db/client.ts`; it stays
empty. `Sensitive` stays off to match the existing `Non-sensitive` rows.

### Saving re-issues the variables — so production was re-verified, not assumed

After the save, `vercel env ls` showed `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`POSTGRES_HOST`, `PGHOST_UNPOOLED` and `PGPASSWORD` as **created "40s ago"**:
the dialog rewrites the integration-managed rows even when the scoping does not
change. Names and `Production, Preview, Development` scoping survived intact,
but "the row is untouched" was worth proving.

Production's values were pulled to a **scratch path** with
`--environment=production` — never over `.env.local`, which holds the only
Development copy of `RESEND_API_KEY` — and compared structurally against
`neonctl`'s strings for `main`. Hostnames were compared, never printed; the
password was compared as a truncated SHA-256 digest:

| comparison | result |
| --- | --- |
| production `DATABASE_URL` host == `main` **pooled** host | YES |
| production `DATABASE_URL_UNPOOLED` host == `main` **direct** host | YES |
| production `DATABASE_URL` host == `development` host | NO |
| production host carries `-pooler` | YES |
| role and password digest match | YES |

The scratch file was deleted immediately. **Production still resolves to `main`
on the same credential.**

> **One trap worth naming, because it produced a false alarm.** `neonctl
> connection-string <branch>` returns the **direct** string by default.
> Comparing it against `DATABASE_URL`, which is pooled, reports a host mismatch
> that looks exactly like a broken production. Pass `--pooled true` for the
> pooled host and `--pooled false` for the direct one, explicitly, both times.

### The branch allowance, read rather than recalled

| field | value | source |
| --- | --- | --- |
| `owner.branches_limit` | 10 | `neonctl projects get` |
| `owner.subscription_type` | `free_v3` | same |
| branches in use | 2 (`main`, `development`) | `neonctl branches list` |
| free slots | **8** | |
| `expirationDays` | **30** | `vercel api /v9/projects/aetherfield` |
| `deploymentsToKeep` | **10** | same |

**The binding constraint is not the retention period.** Neon's documentation
warns that Vercel's *default* 180-day retention lets preview branches outlive
their pull request by months — but this project already runs a **30-day**
retention, so that warning does not apply as written. What does apply is
`deploymentsToKeep: 10`: Vercel pins the ten most recent deployments regardless
of retention, and a pinned preview deployment pins its Neon branch. Against 8
free slots, **that is the number to watch.**

**Mitigation is manual pruning, not a plan change.** A plan change is billable
and out of scope. `neonctl branches delete preview/<git-branch>` works at any
time, and deleting the Vercel deployment does it automatically (below).

### The parent is `main`, it is not configurable, and that is a §8.3 decision

**Measured, not inferred.** Immediately after creation the preview branch's
25-table count listing was **byte-identical to `main`'s** — `diff` empty. A
preview branch is a full copy-on-write clone, so it carried:

| | on `main`, and therefore on every preview branch |
| --- | --- |
| `user` / `account` / `session` | 1 / 1 / 7 — a real identity and live sessions |
| `application` | **1 — a real job application with its private CV blob reference** |
| `organization` / `member` / `verification` | 2 / 1 / 1 |
| `lead` / `subscriber` | 0 / 0 |

The Vercel-Managed integration exposes **no parent-branch and no schema-only
option** — that choice exists in the *Neon*-Managed integration, which this
project does not use, and in `neonctl branches create --schema-only`, which the
webhook does not call. So unlike prompt 89's `development`, a preview database
cannot be made empty at creation.

**The user was shown this and chose to enable it anyway, on 16 Aug 2026**, on
the reasoning that it is strictly better than the alternative: without preview
branching a preview deployment writes to production itself. Deployment
protection bounds it further — `ssoProtection` is
`all_except_custom_domains`, so a preview URL is not publicly reachable.

**The obligation that follows:** a preview branch holds real personal data, so
deleting it is an AGENTS.md §8.3 duty and not housekeeping. Do not leave preview
branches lying around, and do not treat the 8-slot allowance as the only reason
to prune them.

### No per-preview migration step, and no build-script change

Neon's guide shows adding `npx prisma migrate deploy && npm run build` to the
Vercel build. **This repository must not copy that**, and does not need to.

A full clone carries the parent's `drizzle.__drizzle_migrations` **populated**:

| branch | rows in `drizzle.__drizzle_migrations` |
| --- | --- |
| `main` | 18 |
| `preview/preview-branch-probe` | 18 |

So the schema is already current and the journal already agrees with it —
there is nothing to apply. **`package.json`'s build script is unchanged**, which
keeps the build path untouched and leaves §8.1's prerender guarantee a
formality rather than something needing a diff.

**Prompt 89's silent-failure trap does not apply here, and the distinction is
the point.** That trap — `db:migrate` exiting **1** with no error message —
came from a `--schema-only` branch copying the journal *empty* while the tables
existed. A full clone copies it populated. **The rule is: schema-only branches
need the drop-and-migrate-from-zero dance, cloned branches need nothing.**

### The proof — measured against a real preview deployment

The first preview deployment this project has ever had. Throwaway branch
`preview-branch-probe`, one empty commit, pushed to trigger it.

1. `vercel ls` → the deployment reached `● Ready`, `Preview`, 1 m build.
2. `neonctl branches list` → **`preview/preview-branch-probe`**,
   `br-tiny-heart-auoszk48`, `ready` — named exactly as the docs describe.
3. Its 25-table counts were identical to `main`'s (the clone finding above).
4. A write path was exercised **on the preview URL**.
5. Counts re-taken on both branches.

**The write path used was `/api/auth/sign-in/email`, not the demo form**, and
that is a better probe than the one the prompt proposed. `lib/auth/server.ts`
sets `rateLimit: { enabled: true, storage: "database" }`, so **any** request to
`/api/auth/*` writes a Postgres `rate_limit` row — no credentials, no BotID
path, no CSRF token and no form encoding needed. The request returned
**HTTP 401** (bogus credentials, correctly rejected) having already done its
database write. The deployment is protection-gated, so it was reached with
`vercel curl`.

| | before | after |
| --- | --- | --- |
| `preview/preview-branch-probe` · `rate_limit` | 6 | **7** |
| `main` · all 25 tables | — | **unchanged** (`diff` of the two full listings empty) |

**Pass condition met: the write landed on the preview branch and production did
not move.** `rate_limit` is the positive control prompt 89 established — a
table of all-zeros on both sides would be equally consistent with the request
never having reached a database at all.

### Cleanup, and what it proved about the lifecycle

`vercel remove <deployment> --yes`, then polling `neonctl branches list`:
**the branch was gone within ~15 s.** Deleting the deployment triggers immediate
Neon cleanup, which is the documented manual path and the one to use — waiting
on retention is the slow path. The project is back to 2 branches of 10, and the
throwaway git branch was deleted locally and on `origin`.

**Confirmed again after the production deploy that followed this work.** Pushing
`main` triggered a production deployment (`● Ready`, 1 m), and `neonctl branches
list` afterwards returned **exactly `main` and `development`** — no `preview/*`
left behind, and **no branch created for the production deployment**. That last
part is the check that the `Create Database Branch For Deployment → Production`
box is genuinely off: production still runs on `main`, which is the whole point
of leaving it unchecked.

### A protection bypass token this created — removed

**`vercel curl` silently generated one.** Before the run the project's
`protectionBypass` was `null`; afterwards it held one token,
`{"scope": "automation-bypass", "isEnvVar": true}`. That is a standing
credential that bypasses deployment protection on **every** deployment, and it
was created as a side effect of measurement, not by intent.

**Removed by the user in the dashboard, and read back:**
`vercel api /v9/projects/aetherfield` now reports `protectionBypass` as null,
with `ssoProtection` still `all_except_custom_domains` — so protection itself is
intact and only the bypass is gone. Clearing it from the CLI was not possible
here: `vercel api -X PATCH` was blocked by this environment's permission
classifier, so it went through **Project → Settings → Deployment Protection →
Protection Bypass for Automation**.

**The standing lesson:** `vercel curl` against a protected deployment mints one
of these without asking. Expect to clean it up afterwards, and check
`protectionBypass` rather than assuming.

### `NEON_API_KEY` is revoked — and it could not be revoked with itself

Prompt 90 was the work waiting on the key prompt 89 minted, so it was revoked
here as the last step. **The CLI path the plan assumed does not exist**, and
that is a property of the key rather than an oversight:

```
$ neonctl api-keys list
ERROR: not allowed for organization API keys
```

The resource was provisioned `--no-claim`, so it lives in the Vercel-managed
`Vercel: <team>` Neon organization and the key is an **organization** key.
`neonctl` permits neither `api-keys list` nor `api-keys revoke` for that kind,
so the key cannot revoke itself and there is no CLI path at all.

It was revoked instead in the Neon Console, reached through
`vercel integration open neon neon-purple-candle` (Vercel SSO), and the line was
dropped from `.env.local` — confirmed by `grep`: zero `NEON_API_KEY` lines
remain, and `RESEND_API_KEY` is still present, which is the one that matters
because `.env.local` holds its only Development copy.

**A replacement is not needed, and this file briefly claimed otherwise.** The
first version of this paragraph said minting one was a Console-only operation
that any later branch work must start with. **That is wrong**, and it is
corrected here in the same change rather than left standing (§12 rule 8): with
no `NEON_API_KEY` in the environment at all, `neonctl` authenticates from its
cached OAuth credential and addresses this project fine — see the correction
under "The topology, read back rather than assumed" at prompt 89.

**So the standing guidance is `neonctl auth`, not a key.** An organization-wide
credential in an untracked file is a worse default than an interactive login,
and the key existed only because prompt 89 believed OAuth could not reach the
Vercel-managed org.

### Verification

| check | result |
| --- | --- |
| `npm run typecheck` | exit 0, no output |
| `npm run lint` | exit 0, no output |
| `npm test` | 12 files, **283 passed**, 745 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, exit 0, 3.6 min |
| `npm run test:e2e:webkit` | **not run — blocked.** `podman` is absent on this machine, exactly as at prompt 89 |

**No prerender diff was run, deliberately.** No source file changed and the
build script was not touched, so the diff would be a build against itself; the
route table is the evidence, as at prompt 89.

### What this did not do

- **`BETTER_AUTH_URL` for Preview is still unset**, so an emailed link resolved
  from a preview deployment still throws. Named in prompt 87 as D3 and
  deliberately not folded in here: it changes an auth-critical variable, and a
  preview deployment with an isolated database but no working emailed links is a
  coherent state. **Still open.**
- No `vercel env` write of any kind, on any environment. No `vercel env pull`
  over `.env.local` — production was pulled to a scratch path and deleted.
- No schema change, no migration, no seed change, no plan change, no change to
  `lib/db/client.ts`'s timing constants.
- **No timing re-measurement against a preview endpoint.** Each branch gets its
  own compute, so a preview endpoint is another one again; prompt 89's numbers
  cover `development` only. Measuring is welcome, refitting is its own prompt.

---

## §8.4's variable table reconciled against `.env.example`, prompt 95

AGENTS.md §8.4 calls itself the canonical list of environment variables, and had
drifted **five rows behind** `.env.example`, which carries thirteen names. The
table is the contract, so the fix landed in AGENTS.md itself (§12 rule 8); this
is the record of why, so a later session knows the two were checked against each
other on **16 Aug 2026** and does not re-derive the list.

| row added | step | source, as it actually happened |
| --- | --- | --- |
| `DATABASE_URL_UNPOOLED` | 1 | Neon, auto-provisioned. §7.3 already explained the pooled/direct split at length, which is likely why the table never gained the row |
| `APPLICATION_NOTIFICATION_EMAIL` | 5 | ours; `LEAD_NOTIFICATION_EMAIL`'s sibling, unset supported |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 6, extended by prompt 41 | ours. Better Auth's `socialProviders.google` takes `clientId` / `clientSecret` as **config** and names no variable, so the names are the project's — confirmed against the `better-auth-best-practices` skill rather than assumed. Issued by Google Cloud and added by hand |
| `CRON_SECRET` | build step 14 | generated locally, 64 base64 characters, added with `vercel env add`. Vercel calls the endpoint but does **not** set this |

**Judgement calls made explicitly**, as the prompt required:

- **Ordering** follows the table's existing convention, by step. `CRON_SECRET`
  therefore sorts last.
- **`CRON_SECRET` has no phase-one step**, and inventing one would have been
  §12 rule 6. Its row cites **build step 14**, which is where this file records
  it as new and locally generated; prompt 81's retention purge then reused it
  rather than adding a second secret. The row says so, and the sentence under
  the table now notes that its last row is past phase one.

**Names only were read.** No value was opened, echoed or written anywhere, and
nothing was added to `.env.example` — it was already correct. §8.4's claim that
**phase one needs no `NEXT_PUBLIC_*` at all** survives intact: all five additions
are server-only.

**Checks:** lint and typecheck clean, 283 `lib/domain/` tests passing, and
`npm run build` reproduced the expected route table (`/`, `/about`, `/careers`,
`/design-system`, `/journal` `○ Static`; `/article/[slug]` and
`/job-listing/[slug]` `● SSG`). No source file was touched.

---

## §2's `npm test` bullet now says where the scope lives, prompt 96

The bullet's effect was right and its location was unstated: `package.json`'s
script is a bare `"test": "vitest run"`, so a reader looking there for "scoped to
`lib/domain/`" finds nothing. The scope is one line of `vitest.config.mts`:

```ts
include: ["lib/domain/**/*.test.ts"]
```

§2 now says so in a parenthetical, and every other clause of the bullet is
untouched — why the domain layer is independently testable (§6.2), and that a
test needing a database, a browser or a mock belongs in `npm run test:e2e`.

**The file is `vitest.config.mts`, not `.ts`.** The review that raised this
finding cited the wrong extension, and repeating it would have relocated the
same defect (§12 rule 1).

**The "and nothing else" clause is still true, checked rather than assumed:**
`find . -name "*.test.ts" -not -path "./node_modules/*"` returns twelve files,
all under `lib/domain/` — `alerts`, `dashboard`, `decimal`, `defra`, `emissions`,
`factor-import`, `factor-match`, `factor-selection`, `gwp`, `reports`,
`retention`, `targets`. `npm test`: **12 test files, 283 tests, all passing.**
No script, alias or scope was changed.

---

## One stage **b** for seven authenticated writes, prompt 98 (build steps 9 and 10)

**The finding: security-relevant code in seven copies.** `app/activity/actions.ts`
carried the same ~35-line stage **b** preamble at six of its eleven exported
actions, and `app/account/actions.ts` had a seventh copy inline. A hardening
applied to one silently left six behind — which is the defect, not the line
count.

### The preambles were diffed before they were collapsed

The prompt required this explicitly (§12 rule 9 — a verification asked for is a
verification reported, even when it comes back clean). Read at
`setFactorMapping`, `createCustomFactor`, `importCustomFactors`,
`retireCustomFactor`, `editFactorSet` and `retireFactorSet`. **All six were
structurally identical**: `getCurrentMembership()` in a `try`, the signed-out /
no-organisation split via `getCurrentAccount().catch(() => null)`, the
`pendingDeletion` lock **before** the limit, then the limiter failing closed.

Exactly three things varied, and all three are now parameters:

| varies | value |
| --- | --- |
| the limiter | `checkFactorImportLimit` in `importCustomFactors`; `checkFactorMappingLimit` in the other five |
| the error constants | `FACTOR_MAPPING_*` in `setFactorMapping`; `CUSTOM_FACTOR_*` in the other five |
| the throttle noun | "too many **imports**" in `importCustomFactors`; "too many **changes**" elsewhere |

**No defect was found** — no missing lock check, no reordering, no swallowed
error, no site where the limit was spent before the lock. Nothing was normalised
away, because there was nothing to normalise.

### The helper

`resolveMembershipForWrite(limiter, messages)` in **`lib/auth/tenant.ts`**, beside
`resolveTenant`, which it is the sibling of: `resolveTenant` returns two ids and
cannot serve these callers, because each reads `membership.role` at stage **d**.

It went into the existing module rather than a new one because that file already
carries `import "server-only"`, already owns this exact primitive, and already
has the `TenantMessages` type — four of the five sentences the new helper needs.
Its only importers are `"use server"` action modules (`app/activity`,
`app/targets`, `app/reports`, now `app/account`), so nothing pulls it toward a
client bundle. It is **not** in either action file for the reason the previous
extraction gives: a `"use server"` module's runtime exports must all be async
functions, so a helper cannot be exported from one.

```ts
export type MembershipResolution =
  | { ok: true; membership: CurrentMembership }
  | { ok: false; error: string };

export type MembershipWriteMessages = TenantMessages & {
  throttled: (retry: string) => string;
};
```

- **The limiter is passed as a function**, not selected from a registry or an
  enum. The call site names the limiter it has always spent, and the set of
  limiters stays in `lib/rate-limit/`.
- **`formatRetry` is applied inside the helper**, so seconds-to-prose lives in
  one place and no call site can format it differently. `throttled` receives the
  finished phrase and decides only the sentence around it.
- **The messages stay at the call sites**, for `resolveTenant`'s reason: the copy
  is flow-specific. "Sign in again to change emission factors" is right on
  `/activity/factors` and wrong everywhere else.

### The call sites

Six in `app/activity/actions.ts`, through three message objects declared once —
`FACTOR_MAPPING_MESSAGES`, `CUSTOM_FACTOR_MESSAGES`, and
`CUSTOM_FACTOR_IMPORT_MESSAGES` (the second, spread, with the "imports" noun).
Each preamble is now a call plus a guard:

```ts
const resolved = await resolveMembershipForWrite(
  checkFactorMappingLimit,
  FACTOR_MAPPING_MESSAGES,
);
if (!resolved.ok) return { ok: false, error: resolved.error };
const { membership } = resolved;
```

`const userId` survives only in `setFactorMapping`, which is the one of the six
that uses the id after the limiter (it records the actor on the mapping row).
The other five take `organizationId` alone.

### `app/account/actions.ts` — two collapses and one deliberate refusal

- **`resolveMembershipForWrite()` (the private copy) collapsed**, as the prompt
  allowed. It is a clean specialisation: same shape, `checkInvitationWriteLimit`,
  `MEMBERSHIP_ERRORS`, the "changes" noun. Its lock commentary was about *why*
  the marker is checked on this path, not a behavioural difference, and it is
  kept at the call site. The four membership actions call it unchanged.
- **`setAlertEmailPreference` collapsed too — a seventh copy the prompt did not
  name.** It shares the shape exactly (`checkAlertPreferenceLimit`,
  `ALERT_PREFERENCE_ERRORS`, `MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED` for the
  lock, "changes"). Folding it in is beyond the brief's literal six-plus-one and
  is recorded here as such; leaving a known identical copy of the code the
  prompt exists to de-duplicate would have reproduced the finding.
- **`resolveOwnerForDeletion` left alone, and it must be.** It has **no lock
  check** by design — `restoreOrganization` is the one thing a locked
  organisation may still do, and sharing a helper that refuses a locked
  organisation would make the reversal unreachable the moment the lock is set. It
  also carries an owner check the others do not. Its docblock already says
  "deliberately not `resolveMembershipForWrite`"; that sentence is now true of the
  shared helper as well.

### What did not change

No limit, no window, no key, no prefix, no error string, no stage ordering, no
result type. The lock still runs before the limit at every site; the limiter
still fails closed at every site. **The helper logs nothing** — not the user id,
not the organisation id, not the input, and not in either catch (§8.3 rule 2),
matching the preambles it replaces. No new environment variable; `KV_REST_API_*`
is read transitively exactly as before.

`app/activity/actions.ts` fell 1,610 → **1,510** lines and
`app/account/actions.ts` 810 → **761**; `lib/auth/tenant.ts` grew 104 → **205**.
149 lines left the two action files and 101 arrived in `tenant.ts`, a net of 48 —
far less than the raw deletion, because the seven copies were largely
undocumented and the one helper is not. Reducing the line count was never the
point; having one place to harden was. `activity/actions.ts`
was **not** split into several files — that is a separate finding, deliberately
deferred.

### Verification

| check | result |
| --- | --- |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` | exit 0, no output |
| `npm test` | 12 files, **283 passed**, 746 ms |
| `npm run build` | route table unchanged — `/`, `/about`, `/careers`, `/design-system`, `/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3) `● SSG` |
| `npm run test:e2e:local` | **110 passed, 12 skipped**, 4.0 min — Chromium and Firefox |
| `npm run test:e2e:webkit` | **not run — blocked.** `podman` is absent on this machine, as at prompts 89 and 92 |

**`npm run test:e2e` therefore did not complete as a matrix**, and this prompt
required it. The two native projects passed and WebKit did not run; that is
stated rather than reported as a pass. The E2E suite is what exercises these
seven authenticated write paths end to end — the 283 domain tests cannot see any
of them.

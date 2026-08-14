# 79 — Redact Better Auth database-failure logs

## Scope, and why it is next

**Close prompt 78's observed credential-disclosure path: a failed Better Auth
session lookup must not print the session token or any other database query
parameter.** Prompt 78 captured a transport failure in which Better Auth passed
Drizzle's error object to its default logger. The installed Drizzle error builds
its message from both the query and the parameter array, so the provider output
included a live fixture session token.

This is next because it is an observed secret-bearing production log path, not a
hypothetical enhancement. The ordered build sequence in `AGENTS.md` §5.2 is
already exhausted through step 14, and prompt 78's other open items are either a
separate HTTP-status decision, an environment-specific retry policy, or an
unreproduced failure with no trace. This is approved post-sequence hardening,
not a step 15.

The fix is intentionally narrow: configure Better Auth's public `logger` option
with an Aetherfield-owned safe logger, and prove the session endpoint preserves
its response behavior while the provider log no longer serializes the original
message or arguments. Do not claim this prevents Next.js itself from printing
an unrelated uncaught Drizzle error; audit and record that separate boundary.

## Reference material read for this prompt

- `AGENTS.md` — §1 workflow, §4 prompt contract, §5.3, §6.1–6.3, §7.1–7.5,
  §8.1, §8.3–8.5, §10, §11.2 and §12
- `docs/backend.md` — prompt 78's "Failure-path findings" and its closing
  non-goals table
- `docs/automation.md` — the build/prerender comparison procedure, ignored
  skill-snapshot trap and Tailwind prose-scanning trap
- `docs/skills.md` — installed auth, database, framework and platform skills,
  including the repository's fixed `pg` decision
- `lib/auth/server.ts` — lazy Better Auth construction and the Drizzle adapter
- `lib/db/client.ts` — lazy pooled `pg` client, happy-eyeballs setting,
  connection timeout and `attachDatabasePool`
- `app/api/auth/[...all]/route.ts` — the Better Auth mount
- `e2e/submissions.spec.ts`, `e2e/auth.setup.ts`, `e2e/auth.teardown.ts` and
  `playwright.config.ts` — the forged-cookie gate, real-session fixture and
  current test-server environment
- `node_modules/@better-auth/core/dist/types/init-options.d.mts` — the installed
  public `logger` option
- `node_modules/@better-auth/core/dist/env/logger.d.mts` and
  `node_modules/@better-auth/core/dist/env/logger.mjs` — the installed logger
  contract and the default behavior that forwards every argument to `console`
- `node_modules/better-auth/dist/api/routes/session.mjs` — the installed
  `get-session` catch path, which calls the provider logger with a fixed label
  and the caught error
- `node_modules/drizzle-orm/errors.js` and `errors.d.ts` — the installed
  `DrizzleQueryError`, whose message embeds `query` and `params` and whose
  object retains both properties
- `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`
  and
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`
  — version-exact Next 16 error boundaries and `onRequestError`
- `.agents/skills/tailwind-4-docs/references/docs/detecting-classes-in-source-files.mdx`
  — Tailwind v4 scans source and prose as plain text

## What to build

### 1. One server-only Better Auth logger

Add a small module under `lib/auth/` and pass its exported configuration to
`betterAuth({ logger: ... })` in `lib/auth/server.ts`.

Verify the logger type from the installed package's public exports before
choosing the import. Do not guess a deep import, copy Better Auth's internal
logger, patch `node_modules`, add `patch-package`, or replace the auth library.
The module is server-only and must begin with `import "server-only"`.

The logger contract is fail-closed:

1. Preserve the log level and a fixed Aetherfield/Better Auth source label.
2. Map only exact, static provider labels verified in the installed source to a
   small stable event code. The session failure must map to a fixed internal
   auth event. An unknown message maps to one fixed generic event.
3. Never interpolate, inspect, traverse, stringify or pass through the original
   provider message or any rest argument. In particular, never hand an `Error`,
   its stack/cause, a Drizzle query, a parameter array, a request body, a URL,
   an address, a cookie or a token to `console`.
4. Route error-level output to `console.error`, warnings to `console.warn`, and
   lower levels to the existing general console channel. Emit one line per
   provider call; do not create a second error report.
5. Keep Better Auth's current log threshold unless the installed contract shows
   that the custom handler requires stating it explicitly. Do not disable the
   provider logger wholesale: a safe fixed event must remain observable.
6. The logger itself must not throw, including when it receives a cyclic value,
   a hostile getter or a non-`Error` argument. The simplest way to guarantee
   this is not to touch provider-controlled arguments at all.

Static labels are an allowlist, not a regular expression and not a redaction
pass. Redacting only a cookie-shaped substring is insufficient: the same
Drizzle parameter array can contain names, email addresses, organisation data,
application fields or blob references.

### 2. Preserve the actual failure and success behavior

The logger changes observation only. It must not catch or swallow the provider
error, alter Better Auth's response, retry a database query, change a cookie,
change rate limiting, relax CSRF/origin checks, or change the lazy `getAuth()` /
`getDb()` construction.

Run the existing authenticated E2E suite against the real configured database.
Its owner, staff, admin and role-less sessions must still establish and the
98-case Chromium/Firefox suite must retain its behavior. Use prompt 78's
documented process-only network condition and one worker if the local TCP path
again needs it; record that as a verification condition, not application
configuration.

### 3. A deterministic no-database fault probe

Prove the fix without waiting for a real provider outage and without touching
the project database:

1. Build/start the parent commit and the implementation separately on unused
   local ports with `DATABASE_URL` overridden to a syntactically valid Postgres
   URL on a closed loopback port. Give each process its matching local
   `BETTER_AUTH_URL` and test-only Better Auth secret. Do not read or print any
   real secret.
2. Request the installed Better Auth session endpoint with a forged
   `better-auth.session_token` cookie whose value is an unmistakable,
   non-secret sentinel. Capture status, response body and server stdout/stderr.
3. The parent measurement must demonstrate the finding: the sentinel appears
   in the provider/database output. If it does not, stop and report that the
   reproduction premise no longer holds instead of constructing a different
   failure and calling it equivalent.
4. The implementation must return the same status and public response shape as
   the parent, emit the fixed safe auth event, and contain **zero** occurrences
   of the sentinel, the fake connection credentials, the query-parameter
   payload and the Drizzle error's parameter section.
5. Exercise the custom handler directly in a temporary, uncommitted probe with
   secret-shaped sentinel values in the message, an `Error`, a nested object, a
   cyclic object and an object with a throwing getter. Assert that none appears,
   one fixed event is emitted per call, the chosen console method matches the
   level, and the handler never reads the throwing getter.

The probe may use files under `/tmp`; it adds no test-only route, production
environment flag, committed credential or dependency. Quote only the sentinel
and the safe output in `docs/backend.md`, never a live value from prompt 78.

### 4. Audit the boundary and state what remains

Inspect every `console` call in `app/` and `lib/`, Better Auth's configured
logger path, and the installed Next 16 `onRequestError` contract. Record which
of these statements the evidence supports:

- this change closes Better Auth's provider-logger path for the configured auth
  instance;
- it does not modify Drizzle's error class, so application code that lets an
  unrelated `DrizzleQueryError` reach the framework may still expose its
  message in server logs;
- `onRequestError` is an additional reporting hook, not evidence that Next's
  built-in error output is suppressed or sanitized.

Do not add root instrumentation merely to observe the same error twice, and do
not describe the result as global database-log redaction unless a deterministic
probe actually proves every framework path. If the audit finds a second
reproducible disclosure, record it as the next candidate with its exact path;
do not widen this implementation after approval.

## Measurements and verification procedure

Nothing is eyeballed. Record the command, exit status and exact result:

- **Synthetic failure, before and after:** parent status/body versus
  implementation status/body; count of sentinel occurrences; count and text of
  fixed safe auth events. The public response must be unchanged and the
  implementation's sensitive count must be zero.
- **Direct logger probe:** number of calls per tested level, selected console
  method, zero sentinel occurrences and confirmation that the throwing getter
  was not evaluated.
- **Repository audit:** paths and line numbers for every application `console`
  call relevant to errors, plus the installed provider/framework source lines
  that define this boundary. Do not quote secret-bearing output.
- **`npm run test:e2e:local`:** exact pass count and wall-clock. Prompt 78's
  measured baseline is 98 passed across Chromium and Firefox; explain any
  delta rather than rounding it away.
- **Prerender comparison:** run only after the prompt and final
  `docs/backend.md` section exist. Use `docs/automation.md`'s clean two-build
  procedure, excluding `.agents/` and `.claude/` on both sides, normalising the
  build id and JavaScript/CSS chunk names, and stripping inline RSC transport.
  Expect 21 prerendered HTML files on each side and zero differences. Compare
  compiled CSS by rule as well as bytes; prompt 78 measured 74,718 bytes, but
  remeasure the parent instead of treating that number as current fact.
- **Route table:** unchanged from the parent build; quote both rather than
  restating a remembered table.

## Prerender impact

**`none — no route markup or render-mode changes`, verified rather than
assumed.** The only production edits belong under `lib/auth/`, and the auth
instance remains lazy. All 21 prerendered HTML outputs must compare equal after
the documented normalisation, compiled CSS must gain or lose no rule, and the
parent/implementation route tables must match exactly.

Tailwind v4 scans `prompts/` and `docs/` as plain text. A prose token that maps
to a utility is therefore a product CSS change even though no component was
edited. Run the CSS comparison after writing the final record and reword any
accidental candidate rather than shipping dead CSS.

## Trust boundary

No new request path. The existing browser-to-server boundary is Better Auth's
catch-all Route Handler. For the measured failure, the browser supplies a
cookie-shaped forged token; Better Auth validates/looks it up through its
Drizzle adapter and returns its existing generic internal-error response when
the database is unavailable.

The new boundary is between a caught provider error and server logs. The safe
logger accepts provider-controlled `message` and `...args`, but output is built
only from the level and a fixed allowlisted event code. Rejected requests keep
their existing status, body and cookie behavior. No `NODE_ENV`/E2E bypass,
`disableCSRFCheck`, `disableOriginCheck`, auth fallback, test-only Route Handler
or swallowed error is allowed.

## Secrets and data

No new environment variable and no `.env.example` change. No `NEXT_PUBLIC_*`.
The implementation reads no additional secret and transmits nothing.

The data at risk is broader than the one observed token: Drizzle parameters can
contain session credentials and the personal or tenant data governed by
`AGENTS.md` §8.3. The logger therefore drops provider-controlled messages and
arguments rather than trying to identify particular field shapes. The failure
probe uses only fake loopback credentials and non-deliverable/non-secret
sentinels. Never reproduce prompt 78's invalidated live token in code, a prompt,
a test, a command transcript or documentation. No model is called.

## Non-goals

| not done | why |
| --- | --- |
| database retries, pool tuning or a committed network-family setting | prompt 78 recorded a local transport condition, but resilience policy changes request behavior and needs its own evidence and decision |
| changing `DrizzleQueryError` or patching a dependency | dependency patches are broader and more brittle than the configured provider boundary; unrelated framework errors are audited and recorded honestly |
| adding `instrumentation.ts` / `onRequestError` | that hook reports captured errors; installed docs do not say it suppresses Next's own output, and a second report does not redact the first |
| changing error-page copy or the streamed 200 status on absent reports/CVs | separate shipped behavior, already recorded by prompts 74 and 78 |
| chasing prompt 74's one-off `/activity` 500 | still no reproducible trace; §12 forbids inventing a cause |
| logging hashes, partial tokens, query text, parameter counts or addresses | none is required to identify the fixed auth event, and each creates avoidable sensitive metadata |
| a logging service, OpenTelemetry, Sentry or analytics | no observability provider is selected in §7.2 or §5.2 |
| a schema, migration, route, UI, marketing page, `SiteNav`, `SiteFooter` or GSAP change | outside this security-hardening scope |
| a step 15 | §5.2 remains the complete ordered product build; this is post-sequence hardening |

## Checks to run, and where to record the result

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 10 files and 215 domain tests remain passing; domain code is untouched |
| parent/implementation synthetic auth failure | same public status/body; safe fixed event present; zero sensitive sentinels in implementation output |
| direct logger fault probe | one safe event per call, correct console channel, zero sentinels, hostile getter untouched |
| `npm run build` | exit 0; route table matches the parent |
| prerender/CSS comparison | 0 of 21 HTML files differ; zero CSS rules added or removed |
| `npm run test:e2e:local` | existing Chromium/Firefox auth matrix passes; exact count and time quoted |
| `npm run test:e2e:webkit` | run and quote the result; prompt 78's Podman gap is not a pass and must not be predicted as current without running it |
| `npm run db:generate` | not run; schema is untouched, and saying so belongs in the record |

Record the result in `docs/backend.md` as
`## Better Auth database-failure log redaction, prompt 79`: the original finding
without its secret, installed-source cause, safe logger contract, before/after
fault measurement, direct fault matrix, boundary audit, prerender/trust/secrets
headings, exact checks and remaining open candidates. Do not add a row to
`AGENTS.md`; `docs/backend.md` already owns this area and no new site-wide
invariant is needed.

After the implementation and record are complete, commit the whole approved
change to `main` without pushing.

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `better-auth-best-practices` | the configured Better Auth logger option, lazy auth instance and session endpoint behavior |
| `better-auth-security-best-practices` | secret-safe logging, session-token handling and the requirement not to weaken CSRF/origin/session controls |
| `neon` | parent Neon guidance required by `neon-postgres`, and the existing platform boundary |
| `neon-postgres` | preserving the pooled `pg` application connection and distinguishing a logging fix from retry/pool policy |
| `drizzle-docs` | the repository's fixed Drizzle/`pg` decisions and the rule that database access remains under `lib/db/` |
| `nextjs` | version-exact App Router error behavior and the distinction between error boundaries and server logging |
| `vercel-functions` | the Node/Fluid Compute runtime and production function-log context around the auth Route Handler |
| `tailwind-4-docs` | source detection over prompt/docs prose and the required final CSS rule comparison |

No installed skill specifically owns application log redaction. The exact
Better Auth, Drizzle, Next.js and console contracts must therefore be verified
from the installed package source named above rather than supplied from memory.

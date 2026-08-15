# 80 — Close the Drizzle query-error disclosure at the data layer

## Scope, and why it is next

**Close the disclosure prompt 79 measured and deliberately left open:** a
`DrizzleQueryError` that escapes into Next's own error printer still prints the
failing SQL and its **bound parameters**.

This is not a step 15. AGENTS.md §5.2's fourteen steps are all committed
(resolved from `git log`, not from `prompts/`), and this is post-sequence
hardening in the same class as prompt 79, which named it in its own words:

> **The next candidate, with its exact path.** An unrelated `DrizzleQueryError`
> escaping to the framework — measured above on the rate limiter's
> `consume` path, whose parameters embed the client IP. Closing it is a
> different change from this one (it is Drizzle's error surface and Next's error
> printer, not a provider option) and needs its own evidence and decision.
> — `docs/backend.md`, "Better Auth database-failure log redaction, prompt 79"

Prompt 79 closed **Better Auth's provider-logger** path only, and its own
total-outage measurement against the *implementation* build recorded **60
framework error blocks, each carrying `query` and `params`** — there, the rate
limiter's key, which embeds the client IP address. An IP address is personal
data and AGENTS.md §8.3 rule 2 admits no exception for it.

It outranks the other standing candidate. **AI factor matching** is sanctioned
by §5.3 and explicitly "sanctioned, not scheduled"; prompt 76 shipped a
deterministic, provider-free matcher for the same surface. An open personal-data
disclosure with a measured path beats an optional feature.

## Reference material read while writing this prompt

Every path below was opened this session (§12 rule 1); nothing here is recalled.

| path | what it establishes |
| --- | --- |
| `docs/backend.md:6989-7263` | prompt 79's record: the closed path, the boundary audit, and the open finding quoted above |
| `node_modules/drizzle-orm/errors.js` | `DrizzleQueryError`'s constructor: message is `` `Failed query: ${query}\nparams: ${params}` ``, and `query`, `params`, `cause` are kept as own properties |
| `node_modules/drizzle-orm/pg-core/session.js:41,48,59,66,81,98` | six throw sites, one per branch of `queryWithCache` — **every** query path wraps, so no configuration avoids it |
| `node_modules/drizzle-orm/package.json` (`exports["./errors"]`), verified by `require("drizzle-orm").DrizzleQueryError` → `function` | the class is on the package's **public root export**, so `instanceof` needs no deep import |
| `node_modules/next/dist/server/next-server.js:340-355` | production takes `this.logError(err)`; dev takes `formatServerError` + `logErrorWithOriginalStack` |
| `node_modules/next/dist/server/base-server.js:462-464, 973, 1619, 1830` | `logError(err)` is `_log.error(err)`, and it is the print path for route handlers **and** render failures |
| `node_modules/next/dist/build/output/log.js:75-101` | `prefixedLog` ends at `console.error(prefix, err)` — the error object is inspected, not stringified, on the production path |
| `node_modules/next/dist/server/dev/next-dev-server.js:451-453` | dev delegates to `bundlerService.logErrorWithOriginalStack`, a **different** printer — the dev path must be measured, not assumed |
| `lib/db/client.ts` | `getDb()` over a module-level `let`; the `Proxy` ban and lazy construction are load-bearing |
| `lib/auth/logger.ts`, `lib/auth/server.ts` | prompt 79's allowlist sink and its `logger:` wiring — the pattern this change is a sibling to |
| `app/api/auth/[...all]/route.ts` | the catch-all mount, `toNextJsHandler`, no try/catch |
| `app/reports/[reportId]/export/route.ts` | a route handler with **no** catch at all |
| `app/**/actions.ts` (all nine) | every failure path is a bare `catch {}` — actions do not bind, log or rethrow the error, so **no Server Action leaks**; this is why the fix is not about actions |
| skills `drizzle-docs`, `better-auth-security-best-practices` | loaded before writing this file; see `## SKILLS USED` |

## What must be true when this is done

1. **No `DrizzleQueryError` reaches any log with its `query`, its `params`, or a
   `cause` chain that carries row values** — on the auth catch-all, on any other
   route handler, on a Server Component render, or from a cron sweep.
2. **A failure is still diagnosable.** Losing the query text entirely and
   printing nothing would trade one defect for another. The sanitized error
   carries a **caller-supplied operation label** (`lead-queries.insertLead`) and,
   where the driver supplies one, the **SQLSTATE code** — neither is
   customer data.
3. **Nothing about status codes, response bodies, redirects or cookie behaviour
   changes.** The error still propagates; only its observation changes — the
   same contract prompt 79 held itself to.

## The implementation

### `lib/db/query-error.ts` — new, `server-only`

- `class DatabaseQueryError extends Error` — fixed message
  `Database query failed`, plus two own properties only: `operation` (ours) and
  `sqlState` (the driver's five-character code, accepted **only** when it
  matches `/^[0-9A-Z]{5}$/`, otherwise omitted). **No `query`, no `params`, no
  `cause`.** Dropping `cause` is deliberate and must be commented: `pg`'s own
  error carries `detail`, which on a unique violation quotes the conflicting key
  **value** — an email address, on `subscriber` and `user`.
- `toSafeQueryError(error, operation)` — returns a `DatabaseQueryError` when the
  input is `instanceof DrizzleQueryError`; **returns everything else
  unchanged**. A `redirect()` or `notFound()` signal thrown through a wrapped
  data-layer call must pass through untouched — Next implements both as thrown
  values, and swallowing or re-typing one would break navigation silently. Say
  so in a comment and prove it in the probe.
- `withSafeQueryErrors(operation, fn)` — a generic async wrapper preserving the
  wrapped function's parameter and return types exactly.

### Applying it

**At the data layer, which is the architectural boundary §6.2 already draws**
("nothing else in the codebase talks to the database"). Wrap every exported
function in the twelve modules — `lib/db/*-queries.ts` plus
`lib/db/report-evidence.ts`, **90 exports** by this session's count. This is
mechanical churn and it is the point: the guarantee then holds for a consumer
written next year without that consumer knowing about it.

**At the auth catch-all**, `app/api/auth/[...all]/route.ts` — Better Auth's
adapter queries do not go through `lib/db/`, and the rate-limiter `consume` path
prompt 79 measured is exactly one of them. Wrap the handler so an escaping
Drizzle error is sanitized before it reaches Next.

**Verify, do not assume, the other four route handlers** —
`app/api/cron/purge-organizations/route.ts`,
`app/api/cron/recalculate/route.ts`, `app/api/newsletter/unsubscribe/route.ts`
and `app/reports/[reportId]/export/route.ts`. The first three have catches; the
export route has none. Wrap only what a measurement shows can print.

### Two alternatives, considered and rejected — record both in `docs/backend.md`

- **A `util.inspect.custom` method on `DrizzleQueryError.prototype`.** One file,
  zero churn, and it would cover the production printer, which ends at
  `console.error(prefix, err)`. Rejected: `message` and `stack` are **own**
  properties set in the constructor, so a prototype hook cannot neutralise
  either, and anything reading `err.message` — dev's separate printer, a future
  reporter — still sees the parameters. A global monkey-patch on a third party's
  class that is *nearly* complete is worse than an explicit boundary.
- **Moving Better Auth's rate limiter off the database** (`rateLimit.storage:
  "secondary-storage"`, which the `better-auth-security-best-practices` skill
  documents and for which this repo already has Upstash). Rejected as a fix: it
  removes one query that carries an IP, not the mechanism, and it changes the
  shipped limiter's behaviour under cover of a logging change — the same
  objection prompt 79 recorded against setting `level`.

## Measurement procedure — no number in the record may be eyeballed

Follow prompt 79's recipe, which `docs/automation.md` and `docs/backend.md`
already carry; **reuse it rather than reinventing it.**

1. **Two clean trees**, `git archive HEAD` for the parent and a `tar` of the
   working tree for the implementation, both with `.claude/`, `.agents/` and
   every `.env*` file removed so the two sides read the same environment. Fake
   loopback database URL, local `BETTER_AUTH_URL`, a test-only ≥32-character
   secret. **No real secret is read, and none is printed.**
2. **The minimal Postgres wire stub, held outside the repository**, answering
   one named relation with an `ErrorResponse` and succeeding everything else —
   because prompt 79 measured that a *total* outage does not reproduce the
   finding. Run it three ways, and report each separately:
   - the **auth** path (a signed forged cookie, as prompt 79 did — an unsigned
     one never reaches the database);
   - a **Server Component render** on an authenticated page reading `lib/db/`;
   - the **export route handler**, which today has no catch.
3. **Report, per run, parent vs implementation:** HTTP status, response body,
   non-secret sentinel occurrences in the server output, `Failed query`
   occurrences, `params:` occurrences, and total server log lines. Status and
   body must be **identical** across the two columns; sentinel counts must go to
   **0**.
4. **Measure dev as well as production.** Dev prints through
   `bundlerService.logErrorWithOriginalStack`, a different printer from
   `_log.error`. If the dev path still discloses after this change, that is a
   **stated gap with its measurement**, not an omission (§12 rules 3 and 9).
5. **A direct fault probe on `toSafeQueryError`**, in prompt 79's style and
   likewise uncommitted: a `DrizzleQueryError` carrying sentinels in message,
   stack, `query`, `params` and `cause`; a `pg`-shaped cause with a `detail`
   holding an address-shaped sentinel; a non-Drizzle `Error`; a Next
   `redirect()` signal; a self-referencing object; an object with a throwing
   getter; plus a number, `null` and `undefined`. Assert identity-preservation
   for every non-Drizzle input and zero sentinels for every Drizzle one, and
   report the assertion count and exit code.

**`npm test` is scoped to `lib/domain/` (§2) and this code is not domain
logic** — do not widen that scope, and do not move infrastructure into
`lib/domain/` to get it tested. The probe is the verification, exactly as it was
for `lib/auth/logger.ts`.

## Expected impact

### Prerender impact

`none — no route markup or render-mode changes` is the expected answer and it
must be **verified, not assumed**. Run `docs/automation.md`'s clean two-build
comparison with both sides excluding `.claude/`, `.agents/` and `.env*`, and the
build id, JS and CSS chunk names and inline RSC transport normalised. Report the
count of prerendered HTML files, how many differed, the CSS byte figures and the
rule-level added/removed counts, and diff the route table line by line.

**Remeasure the parent; never carry a byte figure forward** — prompt 79 records
that trap explicitly. The load-bearing result is parent-to-implementation
equality, not either absolute number.

The nine static marketing routes, the two SSG groups and the dynamic
authenticated routes must all keep their current render mode. Nothing in this
change touches a component, a style, `SiteNav`, `SiteFooter` or any GSAP
surface.

### Trust boundary

**No new request path, and no change to an existing one.** The browser-to-server
boundary is unchanged: Better Auth's catch-all handler, the four other route
handlers, and the Server Actions, each with its existing authorisation.

The boundary this change adds is between a thrown database error and the server
log. What crosses it is a caught error object; what is emitted is a fixed
message plus two non-personal fields. **No `NODE_ENV` or E2E conditional, no
test-only route, no `disableCSRFCheck`, no auth fallback, and no swallowed
error** — every wrapper rethrows.

### Secrets and data

- **No new environment variable, no `.env.example` change, no
  `NEXT_PUBLIC_*`, no additional secret read, no model call.**
- `lib/db/query-error.ts` carries `import "server-only"`, like every other
  module under `lib/db/`.
- The change **removes** personal data from the logs — bound parameters
  currently include client IP addresses, email addresses, user and organisation
  ids, session tokens and blob references. Nothing is added to any store.
- The probe uses only fake loopback credentials, a test-only Better Auth secret
  and non-secret sentinels. **No value from prompt 78's incident, and no real
  address, token or row, may appear in code, tests, transcripts or the record.**

## Non-goals

| out of scope | why |
| --- | --- |
| AI factor matching | §5.3 sanctions and does not schedule it; prompt 76 shipped the deterministic matcher. Deferred again, and named rather than dropped |
| moving the Better Auth rate limiter to Upstash | rejected above as a fix; if it is wanted it is a behaviour change and its own prompt |
| an `instrumentation.ts` / `onRequestError` hook | prompt 79 verified against the installed Next 16 docs that it reports and does not suppress |
| patching `node_modules`, or a `Proxy` around the database client | §7.5, and the `Proxy` ban is load-bearing for Better Auth's adapter |
| widening `npm test` beyond `lib/domain/` | §2 |
| any marketing route, `SiteNav`, `SiteFooter`, or any GSAP surface | §8.1 and the front matter's settled surfaces |
| a schema change or a migration | `npm run db:generate` must not run; the schema is untouched |
| installing podman to unblock WebKit | a standing environment gap, reported as such, unchanged by this |

## Checks to run (§2), and where the result goes

`npm run lint` · `npm run typecheck` · `npm test` (expect the existing 10 files /
215 tests, unchanged) · `npm run build` with the route table diffed line by line
· the prerender/CSS comparison above · `npm run test:e2e:local`, and note prompt
78's documented remedy for the local instability at default worker counts:

```sh
NODE_OPTIONS=--network-family-autoselection-attempt-timeout=1000 \
  npm run test:e2e:local -- --workers=1
```

`npm run test:e2e:webkit` will report `Podman is required for WebKit on Arch
Linux`; **record it as the environment gap it is, never as a pass** (§12 rule 3).
`npm run db:generate` is not run.

**Record the result in `docs/backend.md`**, as a new section in prompt 79's
style — the mechanism read from the installed sources, the sanitizer's contract,
both rejected alternatives with their reasons, the three-path fault matrix with
its parent/implementation columns, the dev-path result whichever way it falls,
the prerender comparison, the trust boundary and the secrets-and-data note.
**Nothing goes in `AGENTS.md`**: no index row is needed (`docs/backend.md`
exists) and this adds no site-wide invariant.

## SKILLS USED

Listing is not loading — §4 requires the implementation to invoke each of these
before writing code, not merely to have them named here.

| skill | for |
| --- | --- |
| `drizzle-docs` | `DrizzleQueryError`, the query-execution path, and this project's fixed Drizzle decisions — the `pg` driver, the pooled/unpooled split, and the `Proxy` ban that rules out the tempting single-point wrapper |
| `better-auth-security-best-practices` | the catch-all handler's boundary, and `rateLimit.storage` — the rejected alternative above |
| `better-auth-best-practices` | the `betterAuth()` option surface, to confirm the change needs no further provider option beyond prompt 79's `logger` |
| `nextjs` | Next 16's server error handling, the App Router's route-handler and render error paths, and confirmation that `onRequestError` reports rather than suppresses |
| `vercel-functions` | how a thrown error is observed on Fluid Compute, so the production claim is not a localhost-only claim |
| `neon-postgres` | the driver-side error shape, and whether a connection-level failure differs from a statement-level one |
| `zod-docs` | not expected to be needed — no schema changes — but named because `lib/validation/` sits next to the wrapped layer and any parse-error surface must keep its typed field errors |

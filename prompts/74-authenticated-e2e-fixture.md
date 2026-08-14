# 74 — An authenticated E2E fixture, and the first walk through a signed-in workspace

## Scope, and why it is next

**Scope:** a Playwright fixture that signs a real, verified user into a real
organisation against the built production app, saves the session as
`storageState`, and uses it to walk the authenticated surfaces that no test has
ever entered. Plus the teardown that removes every row it created.

**Why it is next.** §5.2's build sequence is complete — steps 1–14 are all
committed, and prompts 63–73 are approved post-sequence work. So "next" is
resolved from what the repository records as deferred, and the accumulated
deferral list has one item that is not a feature and that every other item
depends on:

> `docs/backend.md`, "Organisation deletion and erasure, prompt 73", *What
> prompt 73 deliberately did not do*:
>
> | an authenticated E2E fixture | it would be the right way to walk the eight redirects, and it is a prompt of its own — the gap is recorded above rather than papered over |

And the gap that row points at, from the same section, *Not exercised, and
stated rather than claimed*:

> the eight `requireOrganization()` redirects and the per-flow action failures
> were **not** driven through a signed-in browser session — the E2E suite covers
> only unauthenticated redirects, and no seeded authenticated fixture exists in
> this repository.

**The ordering argument.** §5.2 orders by what unblocks the most downstream
work, and that principle survives the sequence's completion. Today
`e2e/home.spec.ts` (61 lines, five tests) can assert only that signed-out
callers are redirected; **every phase-two surface built by steps 8–14 and by
prompts 63–73 is verified by type-checking, by `npm test` over `lib/domain/`,
and by hand — never by a browser holding a session.** That is the single
weakest link in this repository's verification story, and §12 rule 3 is the
rule it undermines. Every remaining candidate (AI factor matching, market-based
scope 2, a pre-deletion data export) ships onto authenticated surfaces and would
inherit the same gap; this prompt is the one that closes it for all of them.

**It is explicitly chosen over AI factor matching**, the other standing
candidate. §5.3 sanctions that surface and does not schedule it, it has been
deferred by prompts 65, 68, 69, 70 and 73, and it sits on the path that decides
a filed disclosure figure. Putting a model near factor selection while the
authenticated surfaces have no browser-level verification at all is the wrong
order. It stays deferred, deliberately, for the sixth time.

## Reference material read for this prompt

- `AGENTS.md` — §1 (workflow), §2 (commands), §4 (prompt-file contract),
  §6.2 (hard boundaries), §7.3 (the Next 16 / Better Auth / Neon traps),
  §8.1 (the static site is not collateral), §8.3 (personal data),
  §8.4 (secrets), §11 (roles), §12 (do not fabricate)
- `docs/backend.md` — the prompt 73 section (lines 5251–5670), specifically its
  *Not exercised* and *What prompt 73 deliberately did not do* lists; the
  step 8 section for the organisation model
- `docs/automation.md` — to be re-read at execution time for the build-diff
  procedure and the port/worktree traps
- `playwright.config.ts` — `testDir: ./e2e`, `baseURL http://127.0.0.1:3100`,
  three projects (chromium, firefox, webkit), `webServer` runs
  `npm run build && npm run start -- -p 3100`, `reuseExistingServer: false`
- `e2e/home.spec.ts` — the five existing tests, all unauthenticated
- `scripts/playwright-webkit.sh` — the rootless-Podman WebKit path
- `lib/auth/server.ts` — `requireEmailVerification: true`,
  `emailVerification.sendOnSignUp/sendOnSignIn: true`,
  `rateLimit: { enabled: true, storage: "database" }`,
  `organization({ creatorRole: "owner", allowUserToCreateOrganization: user =>
  user.emailVerified === true, disableOrganizationDeletion: true, … })`,
  `nextCookies()` last
- `lib/auth/organization.ts` — `requireOrganization(callbackURL)` redirects a
  signed-out caller to `/sign-in?callbackURL=…`, a member-less caller to
  `/account`, and a locked organisation to `/account`; `authorizeOrganization`
  is the action-side counterpart
- `lib/auth/tenant.ts` — `resolveTenant`'s four messages and its lock branch
- `lib/db/auth-schema.ts` — the tables `user`, `session`, `account`,
  `verification`, `organization`, `member`, `invitation`, `rate_limit`
- `proxy.ts` — the enumerated matcher: `/account`, `/activity/:path*`,
  `/dashboard/:path*`, `/reports/:path*`, `/submissions/:path*`,
  `/targets/:path*`
- the eight `requireOrganization()` call sites, read by grep:
  `app/dashboard/page.tsx:88`, `app/targets/page.tsx:22`,
  `app/reports/page.tsx:19`, `app/reports/[reportId]/page.tsx:40`,
  `app/activity/page.tsx:70`, `app/activity/[importId]/page.tsx:88`,
  `app/activity/mappings/page.tsx:72`, `app/activity/factors/page.tsx:27`
- `node_modules/better-auth/dist/` — endpoint paths verified by grep, not
  recalled: `sign-up/email` (`api/routes/sign-up.mjs`), `sign-in/email`
  (`api/routes/sign-in.mjs`), `organization/create` and `/organization/set-active`
  (`plugins/organization/organization.mjs`)
- `.env.example` / `.env.local` — **key names only, never values** (§8.4).
  `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED` all exist locally

## The approach

### The fixture is created through the app's own HTTP surface, not by hand-writing rows

**One direct database write, and only one.** The setup:

1. `POST {baseURL}/api/auth/sign-up/email` with a run-scoped email, a name and a
   password — the app's own endpoint, so the password is hashed by Better Auth's
   own hasher and the `account` row is shaped by the library.
2. **Direct `UPDATE "user" SET "emailVerified" = true`** over
   `DATABASE_URL_UNPOOLED`. This is the one row the fixture may not obtain
   honestly: verification arrives by email, and §8.3 forbids the test reaching
   into a mailbox. Everything else goes through an endpoint.
3. `POST {baseURL}/api/auth/sign-in/email`, capturing `Set-Cookie`.
4. `POST {baseURL}/api/auth/organization/create` with that cookie — which makes
   the fixture user the **owner** (`creatorRole: "owner"`) and exercises
   `allowUserToCreateOrganization`'s verified-only gate rather than bypassing it.
5. Write `storageState` to a gitignored path.

**Why not hand-write the rows with Drizzle.** A hand-written `account` row needs
Better Auth's scrypt output and a hand-written `member` row needs the plugin's
role vocabulary; both are the library's business, both are §12 rule 6 territory,
and a fixture that fabricates them stops testing the thing it is meant to test
the moment the library changes shape. **Why not import `lib/auth/server.ts` into
the setup script:** it carries `import "server-only"`, which throws outside the
`react-server` condition — and §6.2's boundary is not something a test may
route around.

### The traps this will meet, named in advance

These are the failure modes to expect. **Where a fix is stated, verify it before
adopting it; where a symptom is stated, do not paper over it.**

- **`BETTER_AUTH_URL` almost certainly does not say `http://127.0.0.1:3100`.**
  Better Auth derives its trusted origin from that value and rejects a
  cross-origin auth POST. Expect the sign-up call to fail on an origin/CSRF
  check. **The fix is to pass `BETTER_AUTH_URL=http://127.0.0.1:3100` in the
  `webServer.env` of `playwright.config.ts`, not to touch `.env.local` and not
  to reach for `advanced.disableCSRFCheck` or `disableOriginCheck`** — both are
  flagged as security risks by the `better-auth-best-practices` skill and both
  would weaken the shipped app to suit a test.
- **`127.0.0.1` and `localhost` are different origins.** Keep every fixture
  request on `baseURL`'s host.
- **`rateLimit.storage: "database"` is on.** Sign in **once** per run and reuse
  `storageState` across the three browser projects; a per-test sign-in will trip
  the limiter and produce a flake that looks like an auth bug.
- **Nothing but Next.js auto-loads `.env.local`** (§7.3). The setup file needs
  `DATABASE_URL_UNPOOLED` and must load it explicitly — `dotenv` is already a
  devDependency (`dotenv-cli` ^11).
- **Unpooled, not pooled**, for the fixture's own database work: it is
  session-shaped script work, which is what §7.3 says PgBouncer breaks.
- **`sendOnSignUp` and `sendOnSignIn` are both `true`** — the fixture will cause
  two real Resend sends per run to the fixture address. Decide this consciously:
  either accept it and use an address that will not bounce (a bounce rate is a
  real deliverability cost — see `email-best-practices`), or suppress it for the
  test run. **State which was chosen and why in `docs/backend.md`; do not leave
  it unmentioned.**
- **`webServer.reuseExistingServer: false`** and a dev server on 3000 — read
  `docs/automation.md`'s port trap before assuming a free port.

### Teardown is part of the deliverable, not a nicety

A Playwright teardown project (or a `globalTeardown`) that removes, in
dependency order, every row the run created: `member`, `organization`,
`session`, `account`, `verification`, `rate_limit` entries for the fixture user,
and the `user` itself. **The fixture email is run-scoped** (a per-run suffix), so
a crashed run cannot collide with the next one, and a leftover row is
identifiable. `npm run test:e2e` must leave the database as it found it, and the
prompt's verification must show that it did.

## What the tests must cover

Two files, so the existing unauthenticated file is not disturbed:

- `e2e/home.spec.ts` — **unchanged.** Its five tests stay exactly as they are and
  must keep passing without a session.
- a new authenticated spec, using the saved `storageState`.

The authenticated spec covers, at minimum:

1. **All eight `requireOrganization()` pages render for a member** — the eight
   call sites listed above. `/activity/[importId]` and `/reports/[reportId]` need
   an id; assert against a **non-existent** id that the page does *not* redirect
   to `/sign-in` and does not leak another tenant's anything, rather than
   inventing a seeded import. This is the walk prompt 73 said it could not do.
2. **`/account` renders**, including for the fixture owner.
3. **A member-less user is redirected to `/account`, not to `/sign-in`** — the
   second branch of `requireOrganization`, which no test has ever entered. This
   needs a **second fixture user with no organisation**, and it is the branch
   most likely to be wrong, because it is the one an ordinary new signup meets.
4. **The tenant boundary holds**: a second organisation's page is not reachable
   by the first fixture's session. Assert on what a **non-member** sees, since
   `resolveTenant` never accepts an organisation id from the request.
5. **The unauthenticated redirects still hold** with an *invalid* session cookie
   — `proxy.ts` is optimistic and lets a forged cookie through, and the
   database-backed check behind it is what must catch it. This is §7.3's
   `getSessionCookie()` trap, asserted rather than trusted.

**If a listed assertion cannot be made to pass because the application is
wrong, report it — do not weaken the assertion to make the suite green** (§12
rule 9). A failing test that names a real defect is the best possible outcome of
this prompt; fixing that defect is a separate change and needs its own decision.

## Measurements this prompt must produce

There is no comp geometry here. The measurements are counts and outcomes,
quoted from real output (§12 rule 3):

- the test count and pass/fail per project, before and after
- `npm run test:e2e` wall-clock, and whether the database was warm or cold
  (§7.3's scale-to-zero note)
- the row count in each touched table before setup and after teardown, read
  back, showing the delta is zero
- the prerender diff result — **file count and how many differed**

## Expected impact

**Prerender impact: `none — no route changes`.** Nothing here touches `app/`,
`motion/`, `home/` or `app/globals.css`. **Verify, do not assume** (§8.1): run
the build diff per `docs/automation.md` and quote the route table and the
"N of 21 differed" figure. **The CSS byte count must not move at all** — this
change adds no markup and no utility, so a non-zero delta means something
unintended was touched. Note that Tailwind v4 scans `.ts` files including test
files, so a **bare English word in a test name or comment that collides with a
utility name will ship dead CSS on every marketing page** — that trap is already
in `docs/automation.md` and this prompt is exactly the kind that trips it.

Expected file changes: `playwright.config.ts` (a setup/teardown project, and
`webServer.env`), one or two new files under `e2e/`, `.gitignore` (the
`storageState` path), possibly `package.json` (a script only if one is genuinely
needed — do not add one that is not run).

## Trust boundary

**No new request path, and no change to any existing one.** Nothing in this
prompt adds a Server Action, a Route Handler, a form or a validation schema, and
**no authorisation check may be relaxed, parameterised or given a test-only
branch.** The fixture is an ordinary client of the app's existing public auth
endpoints, holding an ordinary session, and it must be able to do nothing that a
real signed-in user could not do — with the single, stated exception of the
direct `emailVerified` update, which is a database write by a developer-run
script with no request path, exactly like `db:seed:factors`.

Specifically forbidden: a `NODE_ENV`/`E2E` conditional inside `lib/auth/`,
`proxy.ts` or any page; `disableCSRFCheck`; `disableOriginCheck`; any widening
of `proxy.ts`'s matcher.

## Secrets and data

- **No new environment variable.** The fixture reads `DATABASE_URL_UNPOOLED`
  (already present) and the built server reads what it already reads. A
  `BETTER_AUTH_URL` override in `webServer.env` is a **test-run value for an
  existing variable**, not a new one, and `.env.example` stays unchanged.
- **No `NEXT_PUBLIC_*`.** Phase one needed none; this needs none.
- **No secret is echoed** (§8.4). Key names only in any output or doc.
- **Personal data: none real.** The fixture email is synthetic and run-scoped,
  the password is generated per run and never committed, and **`storageState`
  holds a live session cookie and must be gitignored** — that file is a
  credential.
- **Nothing is logged** — not the fixture address, not the cookie, not the
  password. `docs/backend.md` records the *shape* of the fixture address, never
  an instance of it.
- **No model is called.**

## Non-goals

| not done | why |
| --- | --- |
| **AI factor matching** | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68, 69, 70, 73 and deliberately deferred again here, with the ordering argument above |
| seeding activity records, imports, factors, targets or reports for the fixture | the walk is of the **gates**, not of the workspaces' contents. A data-bearing fixture is a much larger prompt and would bury the authorisation result it is meant to expose |
| an E2E test of the deletion/restore flow or the purge sweep | prompt 73's purge has never run; making it run in a test is a real want and a separate decision, because it deletes blobs |
| an E2E test of `/submissions` and the staff/admin roles | §11.1's roles are orthogonal to tenant membership and need their own fixture with a granted `user.role`. Named as the obvious follow-up, not smuggled in |
| a CI workflow | nothing in this repository runs CI today; adding one is its own decision |
| WebKit's Podman container work | `scripts/playwright-webkit.sh` is unchanged. If Podman is absent on this machine, **say so and report Chromium/Firefox only** — as prompt 71's record did — rather than claiming a matrix that did not run |
| any change to a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | §8.1 and the front matter's settled surfaces |
| relaxing any authorisation check to make a test pass | above; it would defeat the point of the prompt (this cell used a bare English verb that is also the name of a CSS filter utility until execution: Tailwind v4 scans `prompts/` too, and the word shipped that rule to every marketing page — see `docs/automation.md`) |

## Checks to run (§2)

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | unchanged — this prompt touches nothing in `lib/domain/` |
| `npm run build` | 27/27, the same route table |
| prerender diff per `docs/automation.md` | **0 of 21 differed**, CSS byte count unchanged |
| `npm run test:e2e` | the five existing tests plus the new authenticated ones, per project. Quote the real output |
| row-count readback | zero delta after teardown |

No migration is generated and `npm run db:generate` must **not** be run — the
schema is untouched.

## Where the result is recorded

`docs/backend.md`, a new section — **"An authenticated E2E fixture, prompt 74"**
— placed with the other post-sequence prompt sections. It must record:

- the fixture's construction, and the one direct write, with the reasoning;
- the `BETTER_AUTH_URL` origin resolution as it actually landed;
- the email-send decision (accepted or suppressed) and why;
- what is now exercised that was not, **and what is still not** — in particular
  whether the eight redirects are now walked, which closes the gap the prompt 73
  section recorded;
- **a correction to prompt 73's "Not exercised" list**, per §12 rule 8: that
  section says no authenticated fixture exists in this repository, and after this
  change it does. Fix the line in the same commit rather than leaving it standing.

`docs/automation.md` gets any mechanical step this work has to work out by hand
— the standing instruction in §3. The `BETTER_AUTH_URL` origin trap and the
teardown readback query are both candidates.

`AGENTS.md` gets **at most nothing**: no index row (`docs/backend.md` already
exists and is indexed) and no new invariant, unless the run turns one up that
meets the front matter's cap rule. §2's script list changes only if a script is
actually added.

## SKILLS USED

- **`nextjs`** — Next 16 route/render behaviour, `proxy.ts` (not
  `middleware.ts`), and how `next start` resolves env for the E2E server.
- **`better-auth-best-practices`** — the endpoint surface, session and cookie
  configuration, `trustedOrigins`, and the explicit warning that
  `disableCSRFCheck` / `disableOriginCheck` are security risks. Loaded while
  writing this prompt; **must be loaded again at execution.**
- **`better-auth-security-best-practices`** — rate limiting (which is on, with
  database storage, and will bite a naive per-test sign-in), trusted origins,
  session and cookie hardening. The authority on what the fixture may not weaken.
- **`email-and-password-best-practices`** — `requireEmailVerification`, the
  verification flow, and what a test may and may not shortcut around it.
- **`organization-best-practices`** — `creatorRole`,
  `allowUserToCreateOrganization`, membership rows, and the plugin's own
  vocabulary for what the fixture creates.
- **`drizzle-docs`** — the direct `emailVerified` update, the teardown deletes
  in dependency order, and the row-count readback. Also the reminder that no
  migration is involved.
- **`neon-postgres`** — pooled vs direct (`DATABASE_URL_UNPOOLED` for the
  fixture's session-shaped work) and scale-to-zero's effect on any timing figure.
- **`email-best-practices`** — only for the send decision: whether letting the
  fixture trigger two real verification emails per run is acceptable, and what a
  bounce costs.
- **`vercel:env-vars`** — how `.env.local` is (and is not) loaded outside
  Next.js, and how to scope a `BETTER_AUTH_URL` override to the test run.
- **`zod-docs`** — only if a schema is read while asserting an action's field
  errors. No schema is authored by this prompt.

**Not used, deliberately:** no `gsap-*` skill (no motion surface),
no `tailwind-4-docs` (no styling change), no `figma:*` or
`frontend-design:frontend-design` (no design work), no `vercel:ai-*` (§5.3 — no
model). There is **no Playwright skill installed** in this environment; the
Playwright API is verified from `node_modules/@playwright/test` and the existing
`playwright.config.ts`, not recalled (§12 rule 2).

# Organisations and multi-tenancy

## Scope, and why it is next

**Build step 8 — the first step of phase two.** It adds Better Auth's
`organization` plugin, the organisation/membership tables, an explicit
create-organisation flow on `/account`, and **the tenant-scope primitive every
later phase-two query carries** (§9 rule 6).

It is next because phase one is complete and committed — resolved from the
repository and `git log`, not from `prompts/`:

| step | evidence |
| --- | --- |
| 1 data layer | `lib/db/`, three migrations in `lib/db/migrations/` |
| 2 demo capture | `app/_actions/demo-request.ts`, `lib/rate-limit/` |
| 3 email | `lib/email/`, `9778e41` |
| 4 newsletter | `app/_actions/newsletter.ts`, `ff03de8` |
| 5 blob + applications | `lib/storage/cv.ts`, `5d3043c` |
| 6 Better Auth | `lib/auth/server.ts`, `proxy.ts`, `ee27aed` |
| 7 submissions view | `app/submissions/`, `ce84e14` |

§5.2's gate — "do not start any of this while a phase-one step is unbuilt" — is
therefore clear, and step 8 is the sole dependency of steps 9–14.

**The load-bearing deliverable is not the plugin.** It is
`requireOrganization()` and the membership query behind it: the single place
that resolves "which tenant is this request for, and may this user read it",
re-read from Postgres per request. Every phase-two query is written against it,
so it is worth getting right slowly.

### Decisions taken with the user before this file was written (9 Aug 2026)

1. **Organisations are created explicitly**, from a flow on `/account`. Sign-up
   and the settled auth screens are untouched, and the no-organisation state
   stays reachable and therefore testable.
2. **Invitations are deferred to a follow-up prompt.** They block nothing
   downstream and would add an email template, an accept route and a members
   management UI to an already large step.
3. **Tenant roles are `owner` and `member` only**, per §11 — Better Auth's
   default third role, `admin`, is removed by custom access control. §11 is
   explicit, and an org-level `admin` would collide with the staff-level
   `admin` already in `user.role`.

## Reference material read for this prompt

Source, by path — every claim below was read, not recalled (§12 rule 1):

- `AGENTS.md` — §5.2 step 8, §6.2/§6.3, §7.3's Better Auth and Neon traps,
  §8.1, §9 rules 2/3/5/6/7, §10, §11, §12.
- `docs/backend.md` — step 6 (`### Installed APIs and server policy`, line
  2512) and step 7 (`## Step 7 — authenticated submissions`, line 2680;
  `### Authorisation and routing`, line 2688). Step 6's record names the exact
  generation command used for the auth schema (line 275).
- `lib/auth/server.ts` — `createAuth()`, the lazy `getAuth()`, `getCurrentAccount()`,
  `requireSubmissionsAccount()`, the `nextCookies()`-last plugin ordering.
- `lib/db/auth-schema.ts` — the five generated tables plus the **hand-added**
  `index()` calls and the `relations()` block at the end.
- `lib/db/database-schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`,
  `lib/auth/cli.ts`.
- `proxy.ts` — the optimistic cookie check and its two-entry matcher.
- `app/account/page.tsx`, `app/_components/auth/sign-out-button.tsx` (the
  per-component `createAuthClient()` pattern), `app/_components/primitives.tsx`.
- `app/submissions/actions.ts`, `lib/validation/submissions.ts` — the existing
  authenticated action and typed-result shape to copy.
- `node_modules/better-auth` v1.6.26 — verified surface below.

### Verified library surface — read from `node_modules/`, not recalled

| fact | where it was read |
| --- | --- |
| `better-auth` and `@better-auth/drizzle-adapter` are both **1.6.26** | the two `package.json` files |
| the plugin is exported from **`better-auth/plugins/organization`** | `package.json` `exports` |
| role helpers `ownerAc`, `memberAc`, `adminAc`, `defaultAc`, `defaultRoles`, `defaultStatements` come from **`better-auth/plugins/organization/access`** | that subpath's module exports |
| the plugin adds **`activeOrganizationId` to the `session` table** — an ALTER on an existing table, not only new tables | `dist/plugins/organization/organization.mjs:827` |
| the client plugin is `organizationClient()` from `better-auth/client/plugins` | the `organization-best-practices` skill, confirmed against `dist/plugins/organization/client.d.mts` |

**Do not write the organisation DDL from any of this.** The column list is
produced by the generator, per the procedure below.

## The measurement procedure — schema is generated, never authored

§7.3: `npx auth@latest migrate` is Kysely-only. On the Drizzle adapter it is
`generate`, and its output must then be applied by Drizzle Kit.

1. Run the command **step 6 already used**, recorded at `docs/backend.md:275`,
   but **to a scratch path**:

   ```
   npx auth@latest generate --config lib/auth/cli.ts \
     --output /tmp/claude-1000/.../auth-schema.generated.ts --yes
   ```

   **This is the trap of this prompt.** Pointing `--output` at
   `lib/db/auth-schema.ts` overwrites the file, and that file is *not* purely
   generated — it carries four hand-added `index()` calls
   (`session_userId_idx`, `account_userId_idx`, `verification_identifier_idx`,
   and the `user`/`session`/`account` `relations()` block) plus the
   `rate_limit` table. Generate to scratch, **diff against the committed file**,
   and merge only the additions by hand.

2. The additions to merge into `lib/db/auth-schema.ts` are whatever that diff
   shows — expected to be the `organization`, `member` and `invitation` tables
   and the new `session.activeOrganizationId` column. **Take the column names,
   types and nullability from the generated file**, not from this prompt and not
   from the skill's examples (§12 rule 6).
3. Add, by hand and consistent with the existing file: an index on every foreign
   key the new tables introduce, and `relations()` entries wiring
   organisation ↔ member ↔ user. Record each as a judgement, not a measurement.
4. `npm run db:generate` writes migration `0003_*`. **Read the generated SQL
   before applying it** and confirm it contains the `session` ALTER as well as
   the CREATE TABLEs — a missing ALTER means the merge in step 2 dropped the
   column.
5. `npm run db:migrate` applies it over `DATABASE_URL_UNPOOLED` (§7.3). Both
   scripts already carry `dotenv -e .env.local --`.
6. Quote the generated SQL and the `db:migrate` output in `docs/backend.md`.

### One AGENTS.md line is wrong and must be corrected in the same change

§9 rule 7 lists the phase-two entity as **`membership`**. Better Auth's table is
**`member`**, and the name is the library's to choose (§12 rule 6). Per §12
rule 8 this is corrected rather than silently contradicted: change that one word
in §9 rule 7 and note it in `docs/backend.md`. **This is the only edit to
`AGENTS.md` this prompt may make** — no build-step ticking, no record of what
was built (front-matter cap rule).

## What to build

### 1. `lib/auth/server.ts` — the plugin

Added to the existing `createAuth()`, **before** `nextCookies()`, which must
stay last for the reason its comment already gives.

- Roles constrained to `owner` and `member`. Build an access controller with
  `createAccessControl(defaultStatements)` from `better-auth/plugins/access`
  and pass `{ ac, roles: { owner: ownerAc, member: memberAc } }`, omitting
  `adminAc`. Verify the option names against
  `dist/plugins/organization/index.d.mts` before writing them.
- `creatorRole: "owner"`.
- `allowUserToCreateOrganization: async (user) => user.emailVerified === true`.
  The app already requires verification to sign in; this makes the rule explicit
  at the creation boundary rather than assumed.
- `organizationLimit` and `membershipLimit` — **judged numbers, and they must be
  written down as judgements** (§12 rule 4). Nothing measures them; pick
  conservative values and say in `docs/backend.md` that they are a first guess
  bounded by the free Neon plan, not a product requirement.
- `disableOrganizationDeletion: true`. Deletion is out of scope, and §9 rule 5
  wants soft-delete with an audit trail rather than the plugin's cascade.
- **`teams` and `dynamicAccessControl` stay disabled.** Neither is in step 8.

### 2. `lib/db/organization-queries.ts` — the tenant-scope primitive

Server-only, in `lib/db/` like every other query module (§6.2: nothing else
talks to the database). Minimum surface:

- `listMembershipsForUser(userId)` — the organisations a user belongs to, with
  the role, ordered stably.
- `getMembership(userId, organizationId)` — **the function step 9 onwards
  filters on.** Returns `null` for a non-member.
- `getOrganizationBySlug(slug)` for the uniqueness check.

Extend this module for later organisation reads; never fork a parallel one
(§9 rule 7's "extend them, never fork").

### 3. `lib/auth/organization.ts` — resolution and authorisation

Server-only, sitting on the existing `getCurrentAccount()` exactly as
`requireSubmissionsAccount()` does.

- `getCurrentMembership()` → `{ account, organization, role } | null`, resolving
  the active organisation from the session's `activeOrganizationId` and falling
  back to the user's sole membership when exactly one exists.
- `requireOrganization(callbackURL)` → redirects to `/sign-in?callbackURL=…`
  with no session, and to `/account` for a signed-in user with no membership.
- **The membership row is re-read from Postgres on every call** and the role
  comes from that row, never from the session payload (§11.2 rule 5).
- **The orthogonality guard is explicit and commented**: `user.role` being
  `staff` or `admin` grants *nothing* here. An Aetherfield staff member is not a
  member of any customer organisation (§11). Write it as a stated invariant in
  the module, because the temptation to add a staff bypass arrives at step 12.

### 4. `lib/validation/organization.ts`

The name/slug schema, shared by the client leaf and the action so the rules
exist once and run twice (§10 rule 1). **This directory is the deliberate
exception to `server-only` and must stay one** — no secret read, and **no import
from `lib/db/`** (§6.3: `schema.ts` calls `pgEnum` at module scope and would put
`drizzle-orm/pg-core` in a browser bundle).

Slug rules: lowercase, hyphenated, a stated length bound, a reserved-word list
covering the existing route segments so an organisation cannot claim one.

### 5. The `/account` flow

- `app/account/actions.ts` — a Server Action following §10's stages with **d
  doing real work** (§10 rule 6): session required → rate limit keyed by user id
  → parse with the shared schema → `auth.api.createOrganization` → typed result.
  - **Order is b, then c** (§10 rule 3).
  - **BotID is deliberately not applied**, and the prompt records why: §8.2
    covers *public* write paths, and this one requires a verified session. State
    the decision in `docs/backend.md` rather than leaving it to be re-derived.
  - A duplicate slug returns a **typed field error**, never a thrown string
    (§10 rule 2).
- A client leaf under `app/_components/organization/` — takes `children` where
  it can, adds no box, stays component-only (§8.1, bundle rule). Success and
  failure are announced, focus is managed, and legible without colour (§8.2
  rule 5). **No redirect on success** (§10 rule 5) — the page swaps in place.
- `app/account/page.tsx` gains: the organisation and role when one exists, the
  create flow when none does. Its existing staff branch to `/submissions` is
  untouched.
- **A shared auth client** at `app/_components/auth/client.ts` exporting one
  `createAuthClient({ plugins: [organizationClient()] })`, used by the new leaf.
  The six existing components each construct their own client inline; **leave
  them alone** (non-goal below).

Copy register is §5's: measured and operational, evidence-first. Not
startup-cheerful.

## Prerender impact

**Expected: none. It must be verified, not assumed** (§8.1).

`/account` and `/submissions` are already `ƒ Dynamic` (`docs/backend.md`, step
7's route table). The nine marketing routes have no reason to change: **auth
adds no root provider** and this prompt adds none. `proxy.ts`'s matcher stays
exactly `["/account", "/submissions/:path*"]` — it is **not** widened.

Verification is the existing one:

1. `npm run build`, and confirm the §8.1 route table verbatim —
   `/  /journal  /about  /careers  /design-system` as `○ Static`, the six
   `/article/[slug]` and three `/job-listing/[slug]` as `● SSG`.
2. Diff the prerendered HTML against a base build of `HEAD` per
   `docs/automation.md`.
3. **Do not quote a bare page-wide `magick compare -metric AE` for `/`,
   `/journal` or `/careers`** — mask the animated box and report the remainder
   and the box separately (front matter).

## Trust boundary

- **Crossing from the browser:** the organisation name and slug, on the
  create-organisation Server Action, from an authenticated page.
- **Validated:** server-side with `lib/validation/organization.ts` — the same
  schema the leaf ran, re-run as the actual check (§6.2).
- **Authorised by:** a live session from `getCurrentAccount()`, plus
  `emailVerified`, plus the plugin's own `allowUserToCreateOrganization` and
  `organizationLimit`. A signed-out caller is rejected by the action itself, not
  by `proxy.ts` — the proxy redirect is optimistic and is not enforcement
  (§7.3, §11.2 rule 1).
- **A rejected request returns:** `{ ok: false, error, fieldErrors? }`. No
  throw, no bare string, no silent success (§8.2 rule 4).
- Rate limited through the existing `lib/rate-limit/`, keyed by user id rather
  than IP because the path is authenticated. The limit is a **judgement**.

## Secrets and data

- **No new environment variable.** Phase one's set is unchanged and nothing here
  is `NEXT_PUBLIC_*`.
- New modules under `lib/` carry `import "server-only"`, except
  `lib/validation/organization.ts` (§6.3).
- **Personal data:** none new is collected. An organisation name and slug are a
  customer's commercial data. Member email addresses become reachable through
  the membership join — **never log one**, and never log a request body (§8.3
  rule 2). The action logs failures without the payload, as step 2's does.
- No tenant data goes to any third party. No AI (§5.3: phase two's AI surfaces
  begin at step 9, and step 8 has none).

## Non-goals — deliberately out of scope

| not doing | why |
| --- | --- |
| invitations, `sendInvitationEmail`, an accept route, a members UI | the user's decision above; blocks nothing downstream, and is the next prompt |
| teams, `dynamicAccessControl`, custom roles | not in §5.2 step 8; §5.2's "do not overbuild" |
| organisation deletion or renaming | §9 rule 5 wants soft-delete with an audit trail; design it with the erasure path, not ahead of it |
| any phase-two table — `site`, `activity_record`, `emission_factor`, `target`, `report` | steps 9–13 |
| any dashboard route or chart | step 12. `home/dashboard.tsx` stays a marketing illustration |
| refactoring the six existing `app/_components/auth/*` components onto the shared client | settled screens, and the churn buys nothing this step needs |
| touching sign-up | decision 1 above |
| widening `proxy.ts`'s matcher | §8.1 — the marketing routes must stay unmatched |
| adding a staff bypass into tenant data | §11, explicitly |

## Checks to run

All of §2, and **quote the actual output** (§12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm run db:generate`, then read the SQL, then `npm run db:migrate`
- `npm run build` — with the route table confirmed against §8.1
- `npm run test:e2e` — the Chromium/Firefox smoke suite, which builds and starts
  production on port 3100
- The prerendered-HTML diff described under **Prerender impact**

Manual verification against `npm run dev`, recorded as observed behaviour:

1. Signed-out `/account` → sign-in redirect carrying the callback.
2. Verified account with no organisation → the create flow, not an error.
3. Create one → the page swaps in place, the row exists with the creator as
   `owner`, and `session.active_organization_id` is set.
4. A duplicate slug → a field error on the slug input, announced.
5. A second account → `getMembership()` returns `null` for the first
   organisation. **Confirm a `staff` account does too** — that is the §11
   orthogonality guard, and it is the single most important assertion here.

## Where the result is recorded

`docs/backend.md`, a new `## Step 8 — organisations and multi-tenancy` section
following step 7's shape: the generated schema and its migration, the plugin
configuration and which numbers are judgements, the resolution helpers and the
orthogonality invariant, the trust boundary, the prerender verification with its
numbers, and what step 8 deliberately did not do.

**Nothing about what was built goes in `AGENTS.md`** — the only edit there is
the one-word §9 rule 7 correction, plus at most one index row if a new `docs/`
file is created (it should not be). No index row is expected: `docs/backend.md`
is already indexed.

Then commit to `main`, unprompted (§1 step 10). Do not push.

## SKILLS USED

- **`organization-best-practices`** — the plugin's configuration surface,
  `creatorRole`, `allowUserToCreateOrganization`, `organizationLimit`,
  `membershipLimit`, `disableOrganizationDeletion`, active-organisation
  resolution, and the owner-protection rules. Loaded while writing this prompt;
  **load it again before implementing.**
- **`better-auth-best-practices`** — plugin registration order alongside
  `nextCookies()`, the Drizzle adapter, and the schema-generation workflow.
- **`better-auth-security-best-practices`** — session and cookie handling,
  trusted origins, and rate limiting on the auth surface.
- **`drizzle-docs`** — merging the generated tables into `lib/db/auth-schema.ts`,
  indexes, `relations()`, and the `db:generate` / `db:migrate` workflow.
- **`zod-docs`** — the shared name/slug schema and `flattenError` / field-error
  shaping for the typed result.
- **`nextjs`** — Next 16.2 Server Actions, async `headers()`/`cookies()`, and
  `proxy.ts` (**not** `middleware.ts`, §7.3).
- **`neon-postgres`** — the pooled/unpooled split for the migration, and
  scale-to-zero's effect on any latency observed during verification.
- **`vercel:vercel-storage`** — only if a storage question arises; not expected.
- **`frontend-design:frontend-design`** — the `/account` organisation surface is
  design work built from the existing primitives in `app/_components/`, not
  scaffolding (§7.2's accepted cost).

No AI SDK skill, and no `vercel:ai-sdk` — §5.3 forbids installing one before
step 9.

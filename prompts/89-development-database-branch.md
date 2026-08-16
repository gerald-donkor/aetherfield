# 89 — A development database branch, so local work stops writing to production

## Scope, and why it is next

**One `DATABASE_URL` serves Production, Preview and Development, so every local
`npm run dev` session and every `npm run test:e2e` run reads and writes the
production database.** Read from `vercel env ls` on 16 Aug 2026 — `DATABASE_URL`
and `DATABASE_URL_UNPOOLED` each appear as a single row scoped
`Production, Preview, Development`, which is one value in three environments,
not three values.

This is not theoretical. `e2e/auth.setup.ts` signs up five real identities
through the application's own HTTP surface, creates organisations, verifies
email addresses by direct write and grants `staff` and `admin` roles; the
teardown project deletes them again. That is a full create/delete cycle against
the same rows a real customer and a real demo request land in, on every E2E run,
in three browser projects. A teardown that fails part-way leaves fixture users
and organisations in the production database, and prompt 88 recorded a run where
**the Playwright fixture could not reach Neon at all** — the failure modes are
live, not hypothetical.

**Why it is next, over the other open items.** The tail of `docs/backend.md`
leaves five things open: no sending domain (blocked — Aetherfield owns no
domain, AGENTS.md §7.4 is unsatisfiable until it does), AI factor matching
(blocked — prompt 75 hit AI Gateway's credit-card requirement and the user
declined), `BETTER_AUTH_URL` for Preview (D3 — deliberately deferred and only
matters once a preview deployment exists), no custom domain, and **Neon
branching, open since step 1**. Of the five, branching is the only one that is
both unblocked and describes damage happening today: the other four describe
capabilities that are missing, this one describes local test runs mutating
production data.

Not a step 15. AGENTS.md §5.2 remains the complete ordered product build and
every step in it is committed; this is post-sequence hardening, as prompts
63–88 were.

## Reference material read for this prompt

| path / source | what it established |
| --- | --- |
| `vercel env ls` (16 Aug 2026, names only) | one `DATABASE_URL` / `DATABASE_URL_UNPOOLED` row each, spanning all three environments |
| `vercel ls` (16 Aug 2026) | **every deployment this project has ever had is `Production`.** No preview deployment exists, which is what scopes Preview out below |
| `e2e/auth.setup.ts`, `e2e/support/fixture.ts` | what the fixture creates, and that `e2e/.auth/` is a gitignored credential store |
| `playwright.config.ts` | `baseURL` `http://127.0.0.1:3100`, five projects, three of them browsers running `fullyParallel` |
| `lib/db/client.ts` | `CONNECT_ATTEMPT_TIMEOUT_MS = 2500` and the pool lifetime constants, each fitted at prompt 83 to **the current pooled host's** measured behaviour |
| `drizzle.config.ts` | migrations read `DATABASE_URL_UNPOOLED`; every `db:*` script runs behind `dotenv -e .env.local --` |
| `docs/backend.md` step 1 ("no Neon branching setup for preview deployments — worth raising when preview deploys start writing") and prompt 87's open items ("**Neon branching for preview deployments** remains open from step 1") | the item this prompt closes, and that step 1 framed it as a *preview* concern only — the local/E2E half was never named |
| `neon-postgres` skill | branches are instant copy-on-write clones with their own compute endpoint; pooled `-pooler` host for the app, direct for migrations |
| AGENTS.md §7.3, §7.4, §8.4 | two connection strings, the provisioning procedure and its "stop and ask" rule, secrets never echoed |

## What to build

**A Neon branch off the default branch, carrying the same schema, used by local
development and by the E2E matrix. Production keeps the default branch,
untouched.**

### a. Establish the topology first, and do not guess it

Before creating anything, read back the Neon project's actual branch list and
the branch each connection string points at. `neonctl` is **not installed**
(`which neonctl` → not found; `npx neonctl` refused to auto-install). The access
paths, in order of preference:

1. `npx -y neonctl@latest` with `neon auth` — browser OAuth. If it cannot
   authenticate non-interactively, ask the user to run it themselves with the
   `!` prefix rather than working around it.
2. The Neon Console reached through the Vercel-managed resource
   (`vercel integration open neon`, verified against `vercel integration --help`
   before it is run).

**The resource was provisioned `--no-claim` through the Marketplace, so the
console is reached through Vercel SSO.** If either path hands off to a browser
step, AGENTS.md §7.4 rule 5 applies: stop, ask the user to complete it, and
resume. Never route around the handoff, and never substitute a guess about
what the branch list contains.

`docs/backend.md` line 10204 refers in passing to "the development Neon branch",
which prompt 82 wrote while `DATABASE_URL` was — and still is — a single
all-environments value. **Treat that phrase as unverified and correct it in the
same change if the topology says otherwise** (AGENTS.md §12 rule 8).

### b. Read the free plan's branch allowance before creating a branch

Free-plan branch and storage limits are numbers, so they are read from the
console or the CLI and quoted with their source — never recalled (§12 rule 7).
If creating the branch would exceed an allowance or change the plan, **stop and
ask**; a plan change is billable and out of scope.

### c. Create the branch, apply the schema, seed the factors

- Branch name: `development`, off the project's default branch. If a branch of
  that name already exists, adopt it rather than creating a second.
- A branch is a copy-on-write clone, so it arrives carrying the parent's rows —
  **including real leads, subscribers, applications and CVs' blob references.**
  Decide explicitly, and record the decision: either a **schema-only** branch
  (no parent rows, then `npm run db:seed:factors` to restore the published
  factor sets) or a full clone. **Schema-only is the recommendation**, because
  a full clone copies personal data into a second place for no reason
  (AGENTS.md §8.3 rule 1) and the fixture provisions everything the E2E matrix
  needs anyway. The published DESNZ/DEFRA factor sets are the one thing that
  must exist and are re-seedable from the committed CSV.
- Take both connection strings for the new branch — pooled for the app, direct
  for migrations (§7.3).
- Point `.env.local`'s `DATABASE_URL` and `DATABASE_URL_UNPOOLED` at the branch.
  `.env.local` is untracked, so this is a manual step whose *shape* is recorded
  in `docs/backend.md` and whose *values* are never written anywhere.
  **Strip surrounding quotes** if any value is copied through a shell — prompt
  87's quoting trap cost one wrong write.
- `npm run db:migrate`, then `npm run db:seed:factors`. Re-run `db:migrate` and
  confirm it is a no-op at exit 0.

### d. Prove the isolation, do not assert it

The measurement that decides whether this prompt succeeded:

1. Against the **production** branch, over the direct connection, record row
   counts for `user`, `session`, `account`, `organization`, `member`, `lead`,
   `subscriber`, `application` and the phase-two activity tables. Counts only —
   no row contents, no email addresses, nothing logged (§8.3 rule 2).
2. Run the full `npm run test:e2e` matrix against the branch.
3. Re-take the same counts on **both** branches.

Pass condition: **every production count is unchanged**, and the development
branch's counts moved and returned (the fixture creates and tears down). Quote
both tables in `docs/backend.md`. A production count that moved means the
repoint did not take, and that is a failure, not a footnote.

### e. Re-measure the connect and acquisition timings against the new endpoint

`lib/db/client.ts`'s `CONNECT_ATTEMPT_TIMEOUT_MS` and its pool lifetime
constants were fitted at prompt 83 to the **current** pooled host's measured
319–410 ms TCP connect and 2145–4118 ms warm acquisition. A branch gets its own
compute endpoint, so those numbers are re-measured against it, warm, and stated
as warm (§7.3's scale-to-zero note).

**Do not change a constant on the strength of one run.** If the new endpoint
measures inside the existing budgets, record that and change nothing. If it does
not, say so and stop — a change to those constants is its own prompt, because
they govern production's connection behaviour and this prompt is not touching
production's database at all.

## Expected impact

**No application source file is expected to change.** The repointing lives in
untracked `.env.local` and in Neon. The tracked change is documentation:

- `.env.example` — the step-1 comment block gains a line saying which branch
  each environment's value points at, and that local development and E2E use
  the `development` branch. **Comments only; no variable name is added, removed
  or renamed**, and no value ever appears.
- `docs/backend.md` — a new section, "A development database branch, prompt 89",
  and the correction to line 10204's phrasing if the topology contradicts it.
- AGENTS.md gains **nothing**. This is a build-record fact, and the front
  matter's cap rule puts it in `docs/`.

### Prerender impact

**None — no route changes.** To be *verified*, not assumed: `npm run build` must
emit the route table AGENTS.md §8.1 fixes — `/`, `/about`, `/careers`,
`/journal`, `/design-system` as `○ Static`, `/article/[slug]` (6) and
`/job-listing/[slug]` (3) as `● SSG`. If no source file changed, say so and let
the route table be the evidence rather than running a prerender diff against
itself.

### Trust boundary

**Unchanged.** No request path is added, altered or removed; no schema changes;
no authorisation decision moves. What changes is which database the *developer's
own machine* talks to. The production write paths keep the §10 order they have —
BotID, rate limit, schema parse, write, best-effort email — and this prompt
weakens none of it.

### Secrets and data

- Reads and rewrites `DATABASE_URL` and `DATABASE_URL_UNPOOLED` **in the
  untracked local `.env.local` only**. No `vercel env` write of any kind, on any
  environment. No `NEXT_PUBLIC_*` — this project still has none.
- **`vercel env pull` is not to be run.** It replaces `.env.local` wholesale,
  and `RESEND_API_KEY` exists there for Development and nowhere else; a pull
  would destroy the only development copy. If a value must be read off Vercel,
  pull to a scratch path with `--environment=<env>` and delete it after.
- No connection string, token or address is echoed, logged, pasted into
  `docs/backend.md`, or left in a scratch file. `git diff --staged` is grepped
  for host fragments before committing, as step 1 did.
- The branch decision in (c) is a personal-data decision: a full clone copies
  real leads, subscribers and applications into a second database. Schema-only
  avoids it, and whichever is chosen is recorded with its reasoning.
- **The GitHub repository is public** (prompt 87's standing constraint). Nothing
  in this change may carry a value.

## Non-goals

| deliberately out of scope | why |
| --- | --- |
| **Preview's `DATABASE_URL`** | `vercel ls` shows no preview deployment has ever existed — every deployment is Production. The variables are also set by the Neon Marketplace integration, and splitting one integration-managed row into per-environment values risks the integration overwriting it. Named as still open, not smuggled in |
| **`BETTER_AUTH_URL` for Preview / the `VERCEL_URL` fallback** | prompt 87's D3 says it gets its own prompt, and it only matters once a preview deployment sends mail |
| **A sending domain, or anything about `FROM`** | blocked: Aetherfield owns no domain. The three-step procedure is recorded at step 3 |
| **AI-assisted anything** | blocked, not deferred — prompt 75 hit AI Gateway's credit-card requirement, the user declined, prompt 76 shipped the provider-free path |
| **Any change to `lib/db/client.ts`'s timing constants** | (e) measures; it does not refit. A refit governs production and is its own prompt |
| **Any schema change, migration or seed change** | the branch carries the schema that exists |
| **A Neon plan change, or defeating scale-to-zero** | billable, and nothing here needs it |
| **Any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface** | out of scope entirely (§8.1) |
| **A step 15** | §5.2 remains the ordered plan; this is post-sequence work, as prompts 63–88 were |

## Checks to run

All of AGENTS.md §2's, with their exact output quoted:

- `npm run typecheck`
- `npm run lint`
- `npm test` (Vitest, `lib/domain/`)
- `npm run build` — and the route table above
- `npm run test:e2e` — the full matrix, **against the new branch**, which is
  simultaneously the isolation measurement in (d)

Then record the result in **`docs/backend.md`**, and commit to `main`
(workflow step 10). Do not push.

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `neon-postgres` | branching, the branch's own compute endpoint, pooled vs direct connection choice, scale-to-zero's effect on any timing quoted |
| `neon` | the parent skill — CLI/MCP setup and the branch-first workflow, needed before any `neonctl` call |
| `vercel:vercel-storage` | how the Vercel-managed Neon resource is addressed, and what the Marketplace integration owns versus what we own |
| `vercel:env-vars` | `.env` file handling, `vercel env pull`'s replace semantics and the `--environment` scoping used to avoid it |
| `vercel:vercel-cli` | `vercel integration` / `vercel env` subcommand surfaces, read from `--help` rather than recalled |
| `drizzle-docs` | `drizzle-kit migrate` against a new database, and confirming a re-run is a no-op |
| `nextjs` | only if a source file turns out to need changing — Next 16's env loading and the build's route table |

Every one is invoked at execution time, not merely listed (§4).

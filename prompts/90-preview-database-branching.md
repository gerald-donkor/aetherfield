# 90 — Preview deployments get their own database branch

## Scope, and why it is next

**Preview deployments still resolve `DATABASE_URL` to the Neon `main` branch —
production's database.** Prompt 89 closed the local half of step 1's open
branching item (local development and the E2E matrix now run on the
`development` branch, and production's row counts were measured unchanged across
a full fixture run). The preview half was named as still open and deliberately
left, for a reason recorded in prompt 89's non-goals: the variables are owned by
the Neon Marketplace integration, and splitting one integration-managed row into
per-environment values risks the integration overwriting it.

**That reason no longer applies, because the hand-split is the wrong approach.**
Neon's Vercel-managed integration — the one this project has — supports preview
branching natively. Confirmed against Neon's own docs on 16 Aug 2026:

> "Vercel sends a webhook to Neon → Neon creates branch `preview/<git-branch>`."

and, on the environment variables:

> Vercel "injects branch-specific connection variables via webhook at deployment
> time, overriding preview environment variables for this deployment only" —
> and those injected variables "cannot be accessed or viewed in your Vercel
> project's environment variable settings."

So **no `vercel env` write is needed at all.** The existing
`Production, Preview, Development` row stays exactly as the integration set it,
and preview deployments are overridden at deploy time. The whole risk that
deferred this work is gone once the mechanism is understood.

**Why it is next.** Of the items open at the tail of `docs/backend.md`, this is
the only one that is both unblocked and describes a live exposure: a sending
domain is blocked (Aetherfield owns none), AI factor matching is blocked (prompt
75, AI Gateway's credit-card requirement, the user declined), and no custom
domain is a want rather than a risk. `BETTER_AUTH_URL` for Preview (D3) is the
one genuine peer, and it is deliberately **not** folded in — see non-goals.

**The exposure is prospective, and this prompt should say so plainly rather than
overstate it.** `vercel ls` on 16 Aug 2026 shows every deployment this project
has ever had is `Production`; no preview deployment has ever existed, so nothing
has yet written to production through this path. This closes the hole before the
first preview deploy opens it, which is the cheap moment to do it.

Not a step 15. AGENTS.md §5.2 remains the complete ordered product build and
every step in it is committed; this is post-sequence hardening, as prompts 63–89
were.

## Reference material read for this prompt

| path / source | what it established |
| --- | --- |
| `vercel env ls` (16 Aug 2026, names only) | `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are each **one Non-sensitive row** scoped `Production, Preview, Development`, created 8 d ago by the integration |
| `vercel ls` (16 Aug 2026) | every deployment is `Production`; no preview deployment has ever existed |
| `neonctl projects get` (16 Aug 2026) | `owner.branches_limit: 10`, `subscription_type: free_v3` — the allowance this prompt's main risk is measured against |
| `neonctl branches list` (16 Aug 2026) | two branches now: `[default] main` and `development` (prompt 89) |
| <https://neon.com/docs/guides/vercel-overview.md> | the Vercel-Managed integration "Supports preview branches"; the Marketplace "Neon Postgres" native integration **is** the Vercel-Managed option |
| <https://neon.com/docs/guides/vercel-native-integration-previews.md> | the toggle's location, the webhook override mechanism, `preview/<git-branch>` naming, and the deletion-on-deployment-removal lifecycle |
| `docs/backend.md`, "A development database branch, prompt 89" | the branch topology as it stands, and the schema-only migrate trap that also applies to every preview branch |
| AGENTS.md §7.4, §8.1, §8.4 | the provisioning procedure's stop-and-ask rule, the prerender guarantee, secrets never echoed |

## What to build

### a. Read the integration's current configuration back before changing it

The Neon docs describe the toggle as appearing **during project connection**,
under **Advanced Options → Deployments Configuration** — "Required → Preview",
alongside "Resource must be active before deployment". This project was
connected on 7 Aug 2026 without it.

**Do not assume where the setting lives for an already-connected resource, and
do not assume it is absent.** Read the current state first:

1. `vercel integration --help` and `vercel integration resource --help`, to
   establish whether the CLI exposes this at all rather than guessing that it
   does not.
2. Failing that, the Vercel dashboard's integration settings for
   `neon-purple-candle`, reached with
   `vercel integration open neon neon-purple-candle`.

**If the change is only reachable through the dashboard, AGENTS.md §7.4 rule 5
applies: stop, ask the user to make the toggle, and resume.** Never route around
the handoff and never report the setting as enabled without reading it back.

### b. The branch allowance is the real risk, and it must be sized before enabling

**This is the part that can bite, and it is a number, so it is read and not
recalled** (§12 rule 7). `owner.branches_limit` is **10** on `free_v3`, and
`main` + `development` already use 2 — leaving **8**. Preview branches count
against that allowance, and Neon's own documentation warns that they outlive the
pull request:

> branches are "automatically deleted when their corresponding Vercel
> deployments are removed" according to "Vercel's deployment retention policy,
> which retains preview deployments for 6 months by default", so "preview
> branches can persist long after a PR is closed".

**So the failure mode is not a bad connection string — it is a preview deploy
that fails to provision a branch because the ninth one is still alive from a
branch merged in March.** Before enabling, decide and record:

- what happens on the ninth concurrent preview branch, verified against the
  plan's actual behaviour rather than assumed;
- whether a shorter deployment retention, or periodic manual pruning with
  `neonctl branches delete`, is the mitigation;
- that a plan change is **out of scope and billable** — if the allowance cannot
  accommodate the feature, **stop and ask** rather than upgrading.

### c. Decide how a preview branch gets its schema — and do not assume it has one

**A preview branch is a copy-on-write clone of its parent, so it arrives with the
parent's schema and the parent's rows.** That is a different situation from
prompt 89's `development`, which was created `--schema-only` deliberately, and it
raises a question this prompt must answer explicitly rather than inherit:

- **Which branch is the parent, and therefore whose data lands in a preview
  database?** If it is `main`, every preview deployment gets a copy of real
  leads, applications and CV blob references — which is AGENTS.md §8.3 rule 1
  ("collect only what the flow needs") applied to a place nobody thinks of as
  collection. Record the answer and its reasoning; if the parent is
  configurable, prefer a parent that carries no personal data.
- **Do migrations need to run per preview branch?** Neon documents adding a
  migration command to the Vercel build (`npx prisma migrate deploy && npm run
  build` in their example). For this repository the equivalent would touch
  `package.json`'s build script, which is a **build-path change on a repository
  whose nine static routes are byte-stable** — treat it as a decision requiring
  its own justification, not a copy of the docs' example. If the branch is
  cloned from a branch already carrying the current schema, no migration step
  may be needed at all.
- **Prompt 89's trap applies here too**: a schema-only branch copies
  `drizzle.__drizzle_migrations` empty while the tables exist, so `db:migrate`
  re-applies migration 1 and exits **1 with no error message**. Any per-preview
  migration step must be checked for exactly this, by exit code and not by
  output.

### d. Prove it, do not assert it

The measurement that decides whether this prompt succeeded, and it needs a real
preview deployment — the first this project will ever have:

1. Record `main`'s row counts before, over the direct connection, counts only
   (§8.3 rule 2), exactly as prompt 89 did.
2. Push a throwaway branch and let it deploy as a preview.
3. `neonctl branches list` — confirm a `preview/<git-branch>` branch exists.
4. Exercise a write path on the preview URL — the demo-request form is the
   cheapest, and it is public. Confirm the row lands **on the preview branch**
   and that `main`'s counts are **unchanged**.
5. Delete the deployment and the branch; confirm the Neon branch goes with it,
   or record that it does not and that pruning is manual.

**Pass condition: `main`'s counts are unchanged and the preview branch's are
not.** A `main` count that moved means the override did not take, and that is a
failure, not a footnote. **`rate_limit` is the useful positive control**, per
prompt 89 — it is the one table nothing restores, so it shows the write landed
and shows where.

## Expected impact

**No application source file is expected to change**, unless (c) concludes a
per-preview migration step is genuinely required — in which case
`package.json`'s build script changes and that must be called out before it is
done, not discovered in the diff.

- `docs/backend.md` — a new section, "Preview deployments get their own database
  branch, prompt 90", and the half-closed note from prompt 89 updated to closed.
- `.env.example` — the step-1 comment block's branch table gains the Preview
  row. **Comments only; no variable name is added, removed or renamed**, and no
  value ever appears. If the injected variables are genuinely invisible
  (§a's quote says they are), say so there rather than implying a readable value.
- AGENTS.md gains **nothing**. Build-record fact; the front matter's cap rule
  puts it in `docs/`.

### Prerender impact

**None expected — no route changes.** To be *verified*, not assumed: `npm run
build` must emit the route table AGENTS.md §8.1 fixes — `/`, `/about`,
`/careers`, `/journal`, `/design-system` as `○ Static`, `/article/[slug]` (6)
and `/job-listing/[slug]` (3) as `● SSG`. **If (c) changes the build script this
stops being a formality** and the prerendered HTML must be diffed per
`docs/automation.md`, with the standing warning about `/`, `/journal` and
`/careers` in force.

### Trust boundary

**Unchanged in shape, extended in reach.** No request path is added, altered or
removed; no schema change; no authorisation decision moves. What changes is that
a *new class of deployment* — preview — becomes reachable by the public internet
with a database behind it. Two things follow and must be checked rather than
assumed:

- **Preview deployments carry Vercel's deployment protection by default.**
  Confirm it is on; if a preview URL is publicly reachable, then the §10 write
  path — BotID, rate limit, schema parse, write, best-effort email — is running
  against a live database on a URL nobody is watching. BotID's protected-path
  list is per-path, not per-host, so it should carry over; **verify it, because
  §7.3 records that a path missing from that list makes the check fail rather
  than pass.**
- The preview branch's data is whatever (c) decided its parent was. If that is
  production data, a preview URL is an exposure of it.

### Secrets and data

- **No `vercel env` write of any kind, on any environment.** The whole point of
  the native mechanism is that the existing integration-managed row is left
  alone.
- **No `vercel env pull`.** It replaces `.env.local` wholesale, and
  `RESEND_API_KEY` exists there for Development and nowhere else; a pull
  destroys the only development copy. Pull to a scratch path with
  `--environment=<env>` and delete it if a value must ever be read.
- `NEON_API_KEY` in `.env.local` is the local tooling credential prompt 89
  minted; `neonctl` reads it and nothing in `app/` or `lib/` does. **This prompt
  is the one that was waiting on it** — revoke it with
  `neonctl api-keys revoke` as the last step, and record that it was revoked.
- No connection string, endpoint id, token or address is echoed, logged, pasted
  into `docs/backend.md`, or left in a scratch file. **The endpoint id is the
  database hostname's prefix and the repository is public** — prompt 89's rule,
  which stands. `git diff --staged` is grepped for host fragments before
  committing.
- The throwaway branch and deployment in (d) must be deleted afterwards, and any
  row it wrote is test data on a disposable branch — but if (c) chose `main` as
  the parent, **the preview branch held real personal data** and its deletion is
  a §8.3 obligation, not tidiness.

## Non-goals

| deliberately out of scope | why |
| --- | --- |
| **`BETTER_AUTH_URL` for Preview / the `VERCEL_URL` fallback** | prompt 87's D3 says it gets its own prompt. It is a genuine peer of this work and the temptation to fold it in is real — but it changes an auth-critical variable, and a preview deployment with an isolated database but no working emailed links is a coherent, shippable state. Named as still open, not smuggled in |
| **Splitting the `DATABASE_URL` row per environment by hand** | the approach this prompt exists to replace. The native override makes it unnecessary, and writing to an integration-managed row risks the integration overwriting it |
| **A Neon plan change** | billable. If the branch allowance cannot carry preview branching, stop and ask |
| **Any change to `lib/db/client.ts`'s timing constants** | prompt 89 measured the `development` endpoint inside every existing budget and changed nothing. A preview endpoint is another compute again; measuring is welcome, refitting is its own prompt |
| **Any schema change, migration or seed change** | the branch carries the schema that exists |
| **A sending domain, AI-assisted anything, a custom domain** | blocked, and recorded as blocked at `docs/backend.md`'s tail |
| **Any change to a marketing route, `Container`, `SiteNav`, `SiteFooter` or a GSAP surface** | out of scope entirely (§8.1) |
| **A step 15** | §5.2 remains the ordered plan; this is post-sequence work |

## Checks to run

All of AGENTS.md §2's, with their exact output quoted:

- `npm run typecheck`
- `npm run lint`
- `npm test` (Vitest, `lib/domain/`)
- `npm run build` — and the route table above
- `npm run test:e2e` — **and the WebKit third must be reported honestly.**
  Prompt 89 could not run it: Podman is not installed on this machine, so
  `scripts/playwright-webkit.sh` exits with its install message. If that is still
  true, run `npm run test:e2e:local` and **say the matrix was not run in full**,
  rather than quoting `test:e2e` as if it had been (§12 rule 3)

Then record the result in **`docs/backend.md`**, and commit to `main`
(workflow step 10). Do not push.

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `neon-postgres` | branching, each branch's own compute endpoint, pooled vs direct choice, scale-to-zero's effect on any timing quoted |
| `neon` | the parent skill — CLI setup and the branch-first workflow, needed before any `neonctl` call |
| `vercel:marketplace` | what the Marketplace integration owns versus what we own, and the `vercel integration` surface read from `--help` |
| `vercel:vercel-storage` | how the Vercel-managed Neon resource is addressed |
| `vercel:env-vars` | `.env` handling, `vercel env pull`'s replace semantics, and the `--environment` scoping used to avoid it |
| `vercel:deployments-cicd` | preview deployments, deployment protection, and deployment retention — the setting the branch-allowance risk in (b) hangs on |
| `vercel:vercel-cli` | `vercel integration` / `vercel env` / `vercel ls` subcommands, read from `--help` rather than recalled |
| `drizzle-docs` | only if (c) concludes a per-preview migration step is needed — `drizzle-kit migrate` against a fresh branch, and confirming a re-run is a no-op |
| `nextjs` | only if the build script turns out to need changing — Next 16's env loading and the build's route table |

Every one is invoked at execution time, not merely listed (§4).

# 87 — Production readiness: completing the production environment, and deploying current `main`

## Scope, and why it is next

**Every step of AGENTS.md §5.2 is committed**, and prompts 63–86 are
post-sequence work on those steps' surfaces. This is not a step 15. The scope is
**the deployed environment, not the code**: promoting the three variables that
exist only in Development, adding the one that exists nowhere on Vercel, and
pushing the five local commits that production is behind.

It is next because **it is the only open item that makes an already-shipped
feature work rather than adding one**, and because the repository has been
asking for it in writing since step 6. `docs/backend.md`:334 says:

> There is no deployment or assigned production domain yet, verified with
> `vercel ls` and domain inspection. Production and Preview therefore do not yet
> have an honest `BETTER_AUTH_URL`; add their deployed origins before deploying
> auth rather than inventing one now.

**The first sentence of that paragraph is now false** and this prompt corrects
it in the same change (§12 rule 8) — there *is* a deployment, and there has been
one for six days. The instruction in the second sentence was never carried out,
which is what this prompt does.

### What is actually broken in production, measured on 15 Aug 2026

Read from `vercel env ls`, `vercel ls`, `vercel inspect` and
`git ls-remote origin main`. Names only; no value was echoed (§8.4).

| variable | environments it exists in | consequence in production |
| --- | --- | --- |
| `RESEND_API_KEY` | **none on Vercel** — only in the untracked local `.env.local` | no email at all is sendable |
| `BETTER_AUTH_URL` | Development only | `appBaseUrl()` (`lib/email/config.ts`:79) throws when unset — newsletter confirm/unsubscribe, organisation invitations and step 14's threshold alerts all fail on it |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Development only | Google sign-in is broken on the deployed `/sign-in` and `/sign-up` |
| `LEAD_NOTIFICATION_EMAIL` / `APPLICATION_NOTIFICATION_EMAIL` | none | supported state — the notification is skipped, logging no address. A demo request is captured and nobody is told |

**The compound consequence is the reason this is urgent, and it is worse than
any single row.** `lib/auth/server.ts`:45 sets `requireEmailVerification: true`
with `sendOnSignUp`, so email/password signup cannot complete without a working
Resend key — and `docs/backend.md`:2623 records the mitigation as *"Google
remains the available signup path in the meantime"*. Google's credentials are
Development-only. **So production today has no working signup path at all**,
which neither of the two documents that reasoned about this foresaw, because
each closed the other's gap on paper.

### Deployment state

- Production alias `https://aetherfield-rho.vercel.app` returns 200, as does
  `/sign-in`. Deployment `dpl_4LwTgTpdpZas2BgwUtHKTd7FDzUj`, target production,
  Ready, created 15 Aug 2026 01:01 UTC.
- `git ls-remote origin main` is `eafc364`, **the same commit that deployment
  runs**, and the local branch is five commits ahead of it. The alias
  `aetherfield-git-main-…` and that exact correspondence establish that the
  GitHub integration deploys production on a push to `main`.
- **So "deploy" in this prompt is `git push origin main`, not `vercel --prod`.**
  Do not introduce a second deployment path; the one that exists is working.
- `vercel domains ls` reports 0 domains. That is unchanged by this prompt and is
  the subject of the non-goal below.

The five undeployed commits: `b0f0ef1` bulk factor-set CSV import, `d9ffbdd`
connection-acquisition resilience, `8b21f34` factor-set lifecycle, `b51c4ea`
market-based scope 2, `3e8e42f` the rung-5 grid average.

## Reference material read for this prompt

- `AGENTS.md` §7.3 (the Neon two-connection trap), §8.1, §8.4 and its variable
  table, §12
- `docs/backend.md`:325–338 (step 6's secrets-and-gaps paragraph, the stale one),
  :920–945 (the sending-domain prerequisite), :2610–2624 (required verification
  and the Google mitigation), :8018–8027 (prompt 82's correction of the same
  docblock)
- `docs/automation.md`:713–795 (the prerender-diff traps)
- `lib/email/config.ts`, `lib/auth/server.ts`:40–95, `vercel.json`
- `vercel:env-vars` and `vercel:deployments-cicd` skills, both loaded while
  writing this file

## Decisions taken with the user, 15 Aug 2026

- **D1. `LEAD_NOTIFICATION_EMAIL` and `APPLICATION_NOTIFICATION_EMAIL` are both
  `geralddonkor1@gmail.com` in Production.** Chosen deliberately over a
  role-based address: under the sandbox sender that is the *only* recipient
  Resend will deliver to, so it is the sole value that makes an internal
  notification arrive today. Two variables, not one reused — AGENTS.md's
  `.env.example` records that collapsing sales and recruiting is a decision
  nobody has made, and this prompt does not make it either.
- **D2. Google's credentials are promoted to Production, and the Google Cloud
  Console redirect URI is the user's step.** The implementation cannot add
  `https://aetherfield-rho.vercel.app/api/auth/callback/google` to the OAuth
  client; it must say so and must not report Google sign-in as working until the
  user confirms it.
- **D3. `BETTER_AUTH_URL` is set for Production only, and Preview is recorded as
  a known open gap rather than guessed at.** A preview deployment's URL is
  per-deployment, so no single stored value is honest for it, and the
  alternative — teaching `appBaseUrl()` to fall back to `VERCEL_URL` — is a code
  change to the module that resolves every emailed link, on a path this prompt
  does not exercise. It gets its own prompt if preview deploys ever send mail.
  This is the same refusal `docs/backend.md`:336 already made: add the deployed
  origin, do not invent one.

## What to implement

Ordered. Steps 3 and 4 are irreversible-ish and outward-facing; do not reorder
them ahead of the verification in step 2.

1. **Re-read the environment before writing to it.** `vercel env ls` — do not
   trust this file's table, which was measured before the prompt was approved.
   If a variable has appeared or moved since, say so and stop.

2. **Verify the build is clean at `3e8e42f` before deploying it.**
   `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`. Quote the
   real output (§12 rule 3). A failing check here ends the prompt; do not deploy
   past one.

3. **Write the production environment.** Never echo a value (§8.4); pipe it.
   - `RESEND_API_KEY` → Production, `--sensitive`, its value read out of the
     local `.env.local` without printing it.
   - `BETTER_AUTH_URL` → Production, `https://aetherfield-rho.vercel.app`.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` → Production, the secret
     `--sensitive`, values from `.env.local`, unprinted.
   - `LEAD_NOTIFICATION_EMAIL`, `APPLICATION_NOTIFICATION_EMAIL` → Production,
     per D1.
   - Then `vercel env ls production` and confirm **by name** that all six landed.

   **The `.env.local` hazard, from the `vercel:env-vars` skill: `vercel env pull`
   replaces the entire file.** `RESEND_API_KEY` currently exists *only* there,
   so a pull before step 3 destroys the only copy. **Do not run `vercel env
   pull` at any point in this prompt.** After step 3 the value is on Vercel and
   the hazard is closed — which is itself a reason to do step 3 at all.

4. **Deploy: `git push origin main`.** Then poll `vercel ls` until the new
   production deployment is Ready, and record its id, URL and build duration.

5. **Verify the deployment, and verify it as deployed rather than as built.**
   - The route table from step 2's build: the nine marketing routes stay `○
     Static` / `● SSG` exactly as AGENTS.md §8.1 lists them.
   - `curl` the status of `/`, `/journal`, `/about`, `/careers`, `/sign-in`,
     `/sign-up` on the production alias.
   - Confirm the three `vercel.json` cron paths return **401**, not 200, to an
     unauthenticated request — `CRON_SECRET` is Production-only and fails closed,
     and that is worth proving once on a real deployment rather than assuming.
   - `vercel logs` on the new deployment, scanned for errors. Report what is
     there, including nothing.

6. **Record it in `docs/backend.md`**, in a new section for prompt 87, and
   **correct `docs/backend.md`:334 in the same change** (§12 rule 8) — the
   "There is no deployment" sentence, and any other line the deploy falsifies.
   Record the Preview gap from D3 and the Google Console step from D2 as open
   items, not as done.

## Prerender impact

**None — no route changes, and no file under `app/` or `lib/` is edited.** This
prompt changes environment variables, pushes existing commits, and writes
`docs/backend.md`. The five commits being deployed were each verified for
prerender impact by their own prompt; this one adds no code and therefore no new
impact of its own. **Verify, do not assume**: step 2's build must emit the route
table §8.1 states, and step 5 re-checks it against the live deployment. A
full prerender diff against the parent is *not* required, because the diff that
matters was run per-commit — say that explicitly rather than implying a diff was
run here.

## Trust boundary

Unchanged by this prompt in code, but **materially changed in effect**, and that
is worth stating plainly: three write paths that were inert in production
because their key was missing become live. `RESEND_API_KEY` makes
`lib/email/send.ts` able to send; the demo-request, newsletter, application,
invitation and alert paths all reach a real provider for the first time on this
alias. Every one of them keeps the §10 order it already had — BotID, rate limit,
schema parse, write, then best-effort email — and this prompt weakens none of
it. The cron endpoints stay behind `CRON_SECRET`, and step 5 proves it.

## Secrets and data

Reads and writes `RESEND_API_KEY`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `LEAD_NOTIFICATION_EMAIL`,
`APPLICATION_NOTIFICATION_EMAIL` — all six server-only, **no `NEXT_PUBLIC_*`
added**, which keeps true AGENTS.md §8.4's line that the project has no public
variable at all. No value is printed to the terminal, to a log or into
`docs/backend.md`; only names are quoted, which is the only listing §8.4 permits.

**One thing the user should know and this prompt does not change: the GitHub
repository is public** (`gh api repos/gerald-donkor/aetherfield` → `private:
false`). `.env.local` is gitignored and no secret is in the tree, so the push is
safe as it stands — but a public repository is a standing constraint on every
future commit, and it is recorded here because it was discovered here.

`LEAD_NOTIFICATION_EMAIL` and `APPLICATION_NOTIFICATION_EMAIL` are personal
addresses stored as environment variables, server-only, exactly as §8.4's table
specifies. No personal data is stored, logged or transmitted by this change
itself.

## Non-goals

- **Acquiring or verifying a sending domain, and changing `FROM`.** This is the
  real blocker on customer-facing email and it stays open. `docs/backend.md`:924
  states the three-step procedure; none of it is in scope, and this prompt must
  not report email as "working" beyond internal notification to D1's address.
- **Weakening `requireEmailVerification`** to route around the sandbox sender.
  `docs/backend.md`:2621 already refused this and the refusal stands.
- **A `BETTER_AUTH_URL` for Preview**, or a `VERCEL_URL` fallback in
  `appBaseUrl()` — D3.
- **A custom domain, `vercel.ts`, or a CI workflow file.** The GitHub
  integration already deploys `main`; a second path is the thing to avoid.
- **Any code change, any new feature.** New feature scope is the *next* prompt,
  deliberately separated — an environment promotion and a feature share no risk
  profile and should not share a rollback.
- **Neon branching for preview deployments**, still open from
  `docs/backend.md`:233.

## Checks to run

Section 2's, in step 2, with real quoted output: `npm run typecheck`,
`npm run lint`, `npm run build`, `npm test`. The E2E matrix is **not** run —
it builds and serves locally on port 3100 and tells us nothing about the
deployed environment, which is what this prompt changes; step 5's live checks
are the ones that bear on it. Say that rather than silently skipping it.

Recorded afterwards in **`docs/backend.md`**, with the correction to :334.

## SKILLS USED

- **`vercel:env-vars`** — `vercel env add/ls` mechanics, per-environment
  scoping, and the `vercel env pull` overwrite hazard that step 3 turns on.
- **`vercel:deployments-cicd`** — `vercel ls` / `inspect` / `logs`, the
  promote-vs-deploy distinction, and the deploy-summary format step 4 reports in.
- **`vercel:vercel-cli`** — flag and subcommand verification before any command
  is run, so no flag is guessed (§12 rule 6).
- **`resend`** — to confirm the sandbox-sender behaviour this prompt relies on
  when it claims D1's address is the only deliverable recipient, rather than
  restating it from `docs/backend.md`.
- **`better-auth-best-practices`** — to confirm what Better Auth does when
  `BETTER_AUTH_URL` is set for Production only, before claiming step 3 fixes the
  auth path.
- **`nextjs`** — the route table and static/SSG classification read in step 2.

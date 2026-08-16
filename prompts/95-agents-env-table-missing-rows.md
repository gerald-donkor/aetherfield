# 95 — AGENTS.md §8.4's variable table is five rows short

## Scope, and why it is next

The Spec axis's staleness finding, and the one place in the whole review where
**AGENTS.md itself** is the thing that is wrong. §12 rule 8 makes this
obligatory rather than optional: the repository disagrees with the file, so the
repository is the fact and the line gets fixed in the same change that notices
it. The review noticed it; this is that change.

AGENTS.md §8.4's table ("Expected by the end of phase one, by the step that
introduces each") lists eight variables and ends at `BETTER_AUTH_URL`.
`.env.example` carries **thirteen**, verified this session by reading it:

| in `.env.example`, missing from §8.4 | notes |
| --- | --- |
| `DATABASE_URL_UNPOOLED` | step 1. **The review missed this one** — it counted four. §7.3 already explains the pooled/direct split at length, which is probably why the table never gained the row, but the table is the canonical list and §8.4 says so |
| `APPLICATION_NOTIFICATION_EMAIL` | step 5, sibling of `LEAD_NOTIFICATION_EMAIL` |
| `GOOGLE_CLIENT_ID` | step 6, Google OAuth |
| `GOOGLE_CLIENT_SECRET` | step 6, Google OAuth |
| `CRON_SECRET` | the retention purge cron |

All five are server-only, so §8.4's standing claim that **"phase one needs no
`NEXT_PUBLIC_*` at all"** survives intact and must be left standing.

## Reference material read

- `AGENTS.md` §8.4 — the table as it stands
- `.env.example` — **names only**, per §8.4. No value was read or echoed
- `docs/backend.md` — for the step number and provisioning source of each of the
  five, which is what the table's second and third columns require

## What the implementation must do

Add the five rows to §8.4's table, each with its **step** and its **source**,
matching the existing rows' format. The source column must say what actually
happened, read from `docs/backend.md` — not what would be tidy. `RESEND_API_KEY`'s
existing row is the model here: it records that the name matched the prediction
but the source did not, and why.

Two judgement calls the implementation must make explicitly rather than
silently:

- **Ordering.** The table is ordered by step. Put each new row at its step.
- **`CRON_SECRET`'s step.** It is not obviously a phase-one numbered step. Read
  `docs/backend.md` for which prompt added the retention purge and cite that
  rather than inventing a step number (§12 rule 6).

**This is an edit to AGENTS.md, and the front matter caps that file.** The cap
rule permits it: §8.4's table is explicitly part of the contract, not the build
record, and five rows in an existing table is not growth of the kind the cap
forbids. Do **not** take the opportunity to add anything else to AGENTS.md.

## Measurements

None. Every value here is a variable **name** copied from `.env.example`.

## Expected impact

**Zero on the application.** A Markdown file that ships in no bundle.

## Prerender impact

`none — no route changes`. No source file is touched. Run `npm run build`
anyway and quote the route table, because the sequence's baseline is quoted at
every step.

## Trust boundary

`none` — documentation only.

## Secrets and data

**Names only.** No secret value is read, echoed, or written into any file.
`vercel env ls` may be run to confirm which names exist in the project (it shows
names only, and §8.4 names it as the one sanctioned listing); its **output must
not be pasted wholesale** — quote only the names relevant to the five rows.

## Non-goals

- **Do not add any variable to `.env.example`.** It is already correct; the
  table is what is behind.
- **Do not add a `NEXT_PUBLIC_*` anything**, and do not soften §8.4's claim that
  phase one needs none. It is still true.
- Do not restructure §8.4, and do not move any of it into `docs/`.
- Do not touch §2's `npm test` line — that is prompt 96.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

**This one is the exception that proves the rule.** The fix *is* an AGENTS.md
edit, so the change lands there — but the record of *why* still goes in
`docs/backend.md`, in §8.4's own terms: one line saying the table had drifted
five rows behind `.env.example` and was reconciled, so a later session knows the
two were checked against each other on this date.

## SKILLS USED

- `vercel:env-vars` — to confirm the provisioning source of `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` and `CRON_SECRET` before writing a source column for
  them, rather than assuming (§12 rule 6).
- `better-auth-best-practices` — Google OAuth provider config, to state
  correctly which of the two Google variables Better Auth requires and at which
  step.

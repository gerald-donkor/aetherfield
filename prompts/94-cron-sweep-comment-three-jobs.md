# 94 — `CRON_SWEEP` no longer bounds "exactly one job"

## Scope, and why it is next

Third documentation-accuracy finding, same file as 92's sibling prompt 93 but a
separate commit because it is a separate claim about a separate constant.

`lib/rate-limit/index.ts:358-377`, the `CRON_SWEEP_LIMIT` docblock, says:

> **Not keyed by IP.** Vercel's scheduler calls from its own infrastructure and
> there is exactly one job, so an IP key would bound nothing an id key does not.

**Three routes now share that bucket**, verified this session:

- `app/api/cron/recalculate/route.ts:81`
- `app/api/cron/purge-organizations/route.ts:94`
- `app/api/cron/purge-submissions/route.ts:108`

Two of the three already carry their own comment acknowledging the sharing —
`purge-organizations/route.ts:90` says "It shares `checkCronSweepLimit`'s bucket
deliberately — the two jobs are…" and `purge-submissions/route.ts:103` says
"…the three jobs are…". So the callers know; only the limiter's own docblock is
stale. AGENTS.md §12 rule 8.

There is a second, sharper problem the review did not name and this prompt must
resolve rather than paper over: the docblock justifies **six an hour** as
"deliberately loose … against a once-daily schedule". With three daily jobs
sharing one bucket, the real headroom is **two runs per job per hour**, not six.
The number may well still be right — but the *reasoning printed above it* no
longer computes, and under §12 rule 4 a judgement has to state what it is a
judgement about.

## Reference material read

- `lib/rate-limit/index.ts:358-380`
- `app/api/cron/recalculate/route.ts`, `.../purge-organizations/route.ts`,
  `.../purge-submissions/route.ts` — the three callers and their own comments
- `docs/backend.md` — build step 14 (the recalculation sweep), and whichever
  steps added the two purge crons

## What the implementation must do

1. Correct the "exactly one job" clause to name the three jobs that share the
   bucket, and keep the "not keyed by IP" conclusion — which is still right, and
   is now *more* right, since a constant key is what makes the bucket shared on
   purpose.
2. Restate the six-an-hour justification in terms of three daily jobs. Say
   explicitly that the headroom is two runs per job per hour and that this is
   still ample for the ±59-minute Hobby scheduling precision and for a deploy
   retriggering a job, **given every sweep is idempotent**.
3. **Verify the idempotency claim before repeating it** — read each of the three
   route handlers and confirm a second run in the same hour is genuinely safe.
   If any one of them is not idempotent, **stop and report it**: that is a real
   defect and it is out of this prompt's scope to fix (§12 rule 9). Do not
   quietly soften the comment to avoid the question.

If step 3 shows the limit should change, **do not change it here.** Report it
and let it get its own prompt.

## Measurements

`CRON_SWEEP_LIMIT = 6` and `CRON_SWEEP_WINDOW = "1 h"` are **unchanged**. The
"two runs per job per hour" figure is arithmetic on those two values, not a new
measurement, and must be presented as such.

## Expected impact

**Zero at runtime.** Comment only.

## Prerender impact

`none — no route changes`. Verify with `npm run build` and quote the route
table.

## Trust boundary

`none` in this change. For context, the boundary these routes sit on is
unchanged: each is a Route Handler for an external caller (Vercel's scheduler),
authorised by `CRON_SECRET`, then rate-limited on the shared constant key.

## Secrets and data

Reads none in this change. The routes involved read `CRON_SECRET`; that is
untouched and its value is never echoed.

## Non-goals

- **Do not change the limit, the window, or the key.**
- Do not give each cron job its own limiter. The shared bucket is deliberate and
  is documented as such at two of the three call sites.
- Do not touch the invitation-write docblock — that is prompt 93.
- Do not refactor the three route handlers.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, build step 14's section. Record the corrected reasoning and,
separately, the outcome of the idempotency verification in step 3 — including if
it turned up nothing, since "checked and clean" is itself the useful record.

## SKILLS USED

- `upstash-ratelimit-js` — fixed-window semantics, to state the shared-bucket
  arithmetic correctly rather than from intuition.
- `vercel-functions` — Cron Jobs: to verify the ±59-minute Hobby scheduling
  precision claim the docblock makes before re-committing to it, rather than
  recalling it (§12 rules 2 and 7).

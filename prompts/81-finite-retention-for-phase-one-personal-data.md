# 81 — Finite retention for phase-one personal data

## Scope, and why it is next

**Give leads, subscribers, job applications and their private CV blobs a finite,
stated retention period, enforced by a nightly sweep.**

AGENTS.md §8.3 rule 5 says: *"Retention is finite and stated. Do not build a
permanent archive by default."* Today it is neither. `docs/backend.md`, step 7's
record, says so in its own words:

> There is no bulk action, restore UI, scheduled retention job or permanent row
> purge. This is a manual active-workspace control, **not a finite retention
> policy**; that open policy question remains unresolved.

Prompt 73 closed the same rule for **tenant** data — an organisation's rows and
its private CSV blobs now have an exit. The three **public** phase-one flows,
which collect the most sensitive data in the repository (names, work email
addresses, employers, free-text messages and CV files), still have none: a demo
request captured on day one is retained forever, and an admin's removal in
`/submissions` stamps `deleted_at` without ever ending the row's life.

It is next because the two other named follow-ups are **blocked, not deferred**,
which was established from the record rather than assumed:

- **AI factor matching** (§5.3, deferred by prompts 65, 68, 69, 70, 73 and 76) —
  prompt 75 reached AI Gateway and got *"AI Gateway requires a valid credit card
  on file to service requests"*; the user declined the card, and prompt 76
  shipped the provider-free path instead. Nothing has changed that.
- **The WebKit E2E leg** — `npm run test:e2e:webkit` reports *"Podman is required
  for WebKit on Arch Linux"* and `podman` is not installed. An environment gap,
  not work.

**Not a step 15.** AGENTS.md §5.2 remains the complete ordered product build;
this is approved post-sequence hardening, on the same footing as prompts 63–80.

## The policy, decided with the user

Asked before this file was written, because the answers change what gets built.
**These are product decisions recorded as decisions, not measurements**
(§12 rule 4) — exactly as prompt 73's 30-day organisation window says of itself.
There is no traffic and no legal advice behind them.

| record | erased when |
| --- | --- |
| `lead` | `created_at` + **24 months** |
| `application` (row **and** CV blob) | `created_at` + **12 months** |
| `subscriber`, `status = 'pending'` | `created_at` + **30 days** |
| `subscriber`, `status = 'unsubscribed'` | `unsubscribed_at` + **12 months** |
| `subscriber`, `status = 'confirmed'` | **never by age** — consent is live, and the person holds a working one-click unsubscribe. Unsubscribing starts the 12-month clock above |
| any of the three with `deleted_at` set | `deleted_at` + **30 days**, whichever comes first |

The soft-delete rule is the second decision: an admin's removal in
`/submissions` starts a 30-day grace window and then a hard delete, mirroring
prompt 73's grace-then-purge rather than inventing a second shape. It is what
turns §9.2 rule 5's soft delete into "one operation with an audit trail" instead
of a permanent archive of hidden rows.

**"Stated" is satisfied in `docs/backend.md` and in the confirmation emails
only** — the user's third decision. **No marketing route's markup changes**, so
§8.1 is untouched and there is nothing to re-approve.

## Reference material read for this prompt

By path, all opened this session:

- `AGENTS.md` §§6.2, 6.3, 8.1, 8.3, 8.4, 9.1, 9.2, 10, 12
- `docs/backend.md` — step 7's "Staff controls and removal" (the open policy
  question, lines ~2765–2790); prompt 73's "Organisation deletion and erasure",
  in full, for the sweep shape, the blobs-first order, the closed error
  vocabulary and the cron-hour reasoning; prompt 80's record, for the
  `withSafeQueryErrors` contract every new data-layer export must adopt
- `lib/db/schema.ts:85–205` — `lead`, `subscriber`, `application`: every column,
  index and check constraint the sweep predicates on
- `app/api/cron/purge-organizations/route.ts` and `./sweep.ts` — the handler
  gate and the sweep body being copied
- `vercel.json` — the two existing crons and their `maxDuration` entries
- `lib/rate-limit/index.ts:346–353, 705–712` — `checkCronSweepLimit`, its
  6-per-hour sliding window and its shared `cron-sweep` bucket
- `lib/storage/cv.ts` — `deleteCv` (best-effort) vs `deleteCvStrict` (boolean)
- `lib/db/{lead,subscriber,application}-queries.ts` — the existing export list
- `lib/email/templates/shared.tsx` — `Shell`'s `footerText: ReactNode` prop

## What to build

### 1. The audit trail — one new table

`retention_purge_run`: one row per sweep run. **Counts only, never an
identifier** — a table of "which email addresses we erased" would defeat the
change. Per-entity counts, the run's timestamp, the wall-clock duration, and a
nullable error from a closed vocabulary. Column types, the enum and the DDL go
in `docs/backend.md`, not here (AGENTS.md front matter's cap rule).

This is not the `organization_deletion` shape and must not copy it: there is no
grace window to track per record, because the window is a function of columns
that already exist.

### 2. The data layer — `lib/db/retention-queries.ts`

New module, `server-only`, and **every exported async function wrapped in
`withSafeQueryErrors` with a `retention-queries.<name>` label** (prompt 80's
contract — an unwrapped export reintroduces the disclosure it closed).

- `listDueApplications(now)` — id **and `cv_pathname`** only. No name, no email.
- `deleteApplicationRow(id)`, `deleteDueLeads(now)`, `deleteDueSubscribers(now)`
  — hard deletes, returning affected counts.
- `recordPurgeRun(summary)`.

The boundary predicates live **in SQL, in this module**, expressed against the
existing columns; nothing outside `lib/db/` constructs a query (§6.2). Prefer
one `now` value threaded in from the caller over `now()` in each statement, so
two records a second apart cannot land on different sides of a boundary — the
same rule prompt 73's sweep states.

Whether the age arithmetic is done in SQL (`created_at < $1::timestamptz`, with
the cut-off computed in TypeScript) or with an interval literal is an
implementation call; **compute the cut-offs in one place** and export the window
constants so the emails, the docs and the tests all read the same numbers.

### 3. The sweep

`app/api/cron/purge-submissions/route.ts` + `sweep.ts`, copying
`purge-organizations`'s shape rather than abstracting over it — the same
reasoning that file already carries, and the same reason it is not shared with
the recalculation handler.

- **`CRON_SECRET` bearer check, constant-time, failing closed on an unset
  secret.** Copy the existing `authorized()` / `unauthorized()` pair verbatim in
  behaviour; a `401` with no body for every rejected caller.
- **The rate limit fails closed**, as the organisation purge's does and unlike
  the recalculation's: this deletes personal data irreversibly, so a limiter
  that cannot be consulted is a reason to wait a night. Nothing is lost — every
  due row is due again tomorrow. Share `checkCronSweepLimit`'s existing bucket.
- **Applications: blob first, then the row.** `cv_pathname` is `not null`, so
  prompt 73's "null the pointer as each blob succeeds" trick is unavailable;
  instead delete the blob with `deleteCvStrict()`, and delete the row **only**
  on `true`. A failed blob delete counts a failure, leaves the row, and retries
  tomorrow. Deleting the row first would orphan a person's CV in Blob storage
  permanently with the pointer gone — the exact failure prompt 73 designed
  against, and here the orphan is a CV.
- **Leads and subscribers: one statement each**, no blobs involved.
- **One record's failure must not end the sweep.** Wrap each, count it, continue.
- **The response body is counts only** — `{ leads, subscribers, applications,
  blobsDeleted, failures }`. No id, no address, no pathname; it lands in
  Vercel's function logs (§8.3 rule 2).
- **Nothing in the sweep logs an identifier, an address or a pathname**, and the
  recorded error is from a closed two- or three-value vocabulary, never an
  exception message.

### 4. The schedule, and a constraint to verify before writing it

Intended: a third `vercel.json` cron at **`0 4 * * *`** with `maxDuration: 300`,
an hour clear of the 03:00 organisation purge, which is itself an hour clear of
the 02:00 recalculation. Same judgement-from-a-constraint as prompt 73's, not a
measurement.

**Verify the project's plan allows a third cron job before writing that entry**
— read it from the Vercel CLI or live docs this session, not from memory
(§12 rule 7). If the plan caps cron jobs below three, **do not silently drop the
sweep or fake a schedule**: extend `purge-organizations`'s handler to run this
sweep as a second, independently-summarised stage after the organisation purge,
and record the deviation and its cause in `docs/backend.md` (§12 rule 9).

### 5. Stating it

- **`docs/backend.md`** — the policy table above, per entity, with the reasoning
  and the fact that the numbers are judgements.
- **The person-facing confirmation emails** — one plain sentence each, in the
  existing `Shell` `footerText`, in the site's measured, operational register:
  `lib/email/demo-request.ts`, `lib/email/application.ts`, and the newsletter's
  confirmation and welcome messages in `lib/email/newsletter.ts`. Say the
  window and say it is automatic. **Read the window from the exported
  constants**, never a hand-typed duplicate.
- The two **internal** notification templates get nothing — they are not the
  data subject.

## Measurements the implementation must produce

None of these may be eyeballed or carried forward from an earlier prompt's
record.

1. **Boundary tests in `lib/domain/`.** The cut-off arithmetic is pure and goes
   in `lib/domain/retention.ts` with a `.test.ts` beside it — the layer §6.2
   requires to be independently testable, and `npm test` is scoped to it. Cover
   each window's exact boundary on both sides, the `deleted_at` window winning
   when it is sooner, a `confirmed` subscriber never ageing out, and an
   `unsubscribed` row dated from `unsubscribed_at` rather than `created_at`.
2. **A live sweep against seeded fixtures**, on the direct connection: rows
   planted one second either side of every boundary, plus a soft-deleted row of
   each kind and a `confirmed` subscriber. Read back which survived. Quote the
   before/after counts. Use synthetic addresses only — no real submission, and
   no address in the record.
3. **A CV blob actually gone.** Upload a throwaway file through the existing
   helper, plant an application past its window, run the sweep, and show the
   pathname 404s afterwards. A row delete that leaves the bytes is the failure
   mode this design exists to prevent.
4. **The blob-failure path**: with `deleteCvStrict` returning `false`, the row
   must survive, the failure must count, and the sweep must continue.
5. **The 401 path**: no `authorization` header, a wrong secret, and a
   right-length wrong secret each answer `401` with no body.
6. **Prerender comparison** per `docs/automation.md`'s clean two-build
   procedure, run after this file and the docs section are on disk. Remeasure
   the parent's CSS byte count; do not carry 68,506 forward.

## Expected impact

**Prerender impact: `none — no route changes`, and it must be verified, not
assumed.** All 21 prerendered HTML files identical, the route table unchanged
apart from the new `ƒ` cron path, CSS byte-identical with 0 rules added or
removed. Nothing under `app/(marketing)` routes, `SiteNav`, `SiteFooter` or any
GSAP surface is touched.

**Trust boundary.** One new request path: `GET /api/cron/purge-submissions`,
whose only caller is Vercel's scheduler and whose only authorisation is the
constant-time `CRON_SECRET` bearer check. No BotID (the caller is not a
browser, and §7.3 records that an unlisted path makes `checkBotId()` **fail**).
`proxy.ts`'s matcher is enumerated deliberately and must **not** be widened to
cover it. No browser-reachable surface changes; `/submissions`'s existing
actions and authorisation are untouched. A rejected request gets `401` with no
body and no detail.

**Secrets and data.** No new environment variable. `CRON_SECRET`,
`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are all already present and already
read by existing code; `.env.example` is unchanged. No `NEXT_PUBLIC_*`, and
phase one still has none. No model call. The change **removes** personal data —
names, work addresses, employers, free-text messages and CV bytes — and adds
only per-run counts. Nothing personal is written to any store or log.

## Non-goals

| out of scope | why |
| --- | --- |
| a restore UI, or undo for a purged record | the purge is the end of the lifecycle; the 30-day `deleted_at` window *is* the undo, and `/submissions`'s existing controls already stamp it |
| a retention line on `/`, `/journal`, `/careers` or `/job-listing/[slug]` | the user's decision above — it would change prerendered markup and needs its own approved §8.1 deviation |
| a per-record configurable window, or an admin settings screen | one policy, stated once. Not a step, and §5.2's "do not overbuild" is explicit |
| phase-two tenant data | prompt 73 already gave it an exit, on its own window |
| Better Auth's `user`, `session`, `account`, `verification` tables | generated tables, their own lifecycle, and a staff account is not a submission (§9.1) |
| AI factor matching | blocked on the declined card, above — deferred for the seventh time and named rather than smuggled past |
| changing `deleteCv`'s existing best-effort contract | step 5 set it deliberately; the sweep uses `deleteCvStrict` |
| a step 15 | §5.2 remains the ordered plan; this is post-sequence hardening |

## Checks to run (AGENTS.md §2)

Report each command's exact output; never claim a pass without running it
(§12 rule 3).

| check | note |
| --- | --- |
| `npm run db:generate` | one new migration; **read it back before applying** |
| `npm run db:migrate` | over the **direct** connection; prompt 76 records that the CLI can exit 0 having applied nothing on this machine — **read the table back** and fall back to the programmatic migrator if so |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm test` | the existing 215 must still pass, plus the new retention tests |
| `npm run build` | quote the route table |
| prerender/CSS comparison | `docs/automation.md`'s clean two-build procedure |
| `npm run test:e2e:local` | the authenticated matrix must be unaffected |
| `npm run test:e2e:webkit` | expected to report the missing `podman` binary — **an environment gap, not a pass**, and it must be recorded as one |

Record the result in **`docs/backend.md`**, as a new section in the same style
as prompt 73's. **No new `docs/` file, and no new AGENTS.md index row** — this
belongs to the backend record. AGENTS.md gets **no edit at all** unless the
plan's cron cap forces the §5.2-adjacent deviation in item 4, and even then the
record goes in `docs/backend.md`.

Then commit to `main`, unprompted, and do not push.

## SKILLS USED

- **`drizzle-docs`** — the new table and its enum, the migration workflow, and
  the delete/returning syntax for the hard-delete statements.
- **`neon-postgres`** — pooled vs direct connection for the migration and the
  live readback, and the scale-to-zero caveat on any latency quoted.
- **`nextjs`** — Route Handler shape on 16.2, `dynamic = "force-dynamic"`, and
  the `proxy.ts` matcher rule.
- **`vercel-functions`** — Cron Jobs: the schedule syntax, `maxDuration`, the
  `CRON_SECRET` bearer contract, and **the plan's cron-count limit**, which
  item 4 turns on.
- **`vercel-storage`** — Blob deletion semantics: what `del()` does to a missing
  pathname, and whether a failed delete is distinguishable.
- **`upstash-ratelimit-js`** — confirm a third caller on the shared `cron-sweep`
  bucket stays inside the 6-per-hour sliding window.
- **`react-email`** and **`email-best-practices`** — the retention sentence in
  the existing `Shell` footer, and the compliance framing for stating retention
  to a data subject.
- **`zod-docs`** — only if the sweep gains any parsed input. It should not; if
  no schema is written, say so rather than claiming the skill was used.
- **`vercel-cli`** / **`env-vars`** — reading the project's plan and confirming
  `CRON_SECRET` exists in the deployed environment (names only, never values,
  §8.4).

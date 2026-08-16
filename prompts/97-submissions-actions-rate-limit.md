# 97 — The two admin submission actions have no rate limiter

## Scope, and why it is next

The highest-consequence Standards finding, and first of the behavioural changes
because it is the only one that touches an unprotected write path.

`app/submissions/actions.ts` exports exactly two mutating Server Actions and
**neither is rate-limited** — verified this session by reading the whole file
(86 lines):

- `changeStaffRole` (line 34) — grants or revokes the `staff` role
- `removeSubmission` (line 55) — soft-deletes a lead, a subscriber or an
  application, and for an application **deletes the CV blob** via
  `deleteCvStrict`

Both call `getAdminAccount()` and refuse anyone who is not `admin`, so this is
**not** an AGENTS.md §8.2 breach — §8.2 governs *public* write paths and these
are neither public nor unauthenticated. The finding is about consistency and
about what is written down:

1. **Every other authenticated mutating action in this repository is
   limited.** `app/account/actions.ts`'s `resolveMembershipForWrite()` spends
   `checkInvitationWriteLimit`; `app/activity/actions.ts` spends a named limiter
   in all six of its write paths. These two are the only exceptions.
2. **Every other absence is written into the file as a decision.** The BotID
   omissions in `activity/actions.ts` each carry `// -- a. BotID: absent on an
   authenticated path. See stageImport. ----`. This omission is silent, and
   nothing in `docs/backend.md` endorses it.
3. `removeSubmission` **deletes a blob per call** and, on the application
   branch, performs a compensating restore if the blob delete fails. That is the
   most expensive unbounded loop an admin session can drive here.

## Reference material read

- `app/submissions/actions.ts` — whole file
- `app/account/actions.ts:195-255` — `resolveMembershipForWrite()`, the shape
  this repository already uses for exactly this job
- `lib/rate-limit/index.ts:295-380` — the existing named limiters, their
  windows, and the docblock convention every one of them follows
- `lib/storage/cv.ts` — `deleteCvStrict`, to state the blob cost accurately
- `docs/backend.md` — build step 7 (the submissions view) and its recorded
  decisions

## What the implementation must do

Add a named limiter for these two actions, following the file's own conventions
exactly:

- **A new named limiter in `lib/rate-limit/index.ts`**, not a reuse of an
  existing one. Every limiter in that file records why it is named rather than
  shared; this one's reason is that the callers are Aetherfield admins, a
  different population from every tenant-side limiter in the file.
- **Keyed by user id**, not IP — consistent with every other authenticated
  limiter here, and the session is already resolved before the key is needed.
- **A docblock stating the window as a judgement, not a measurement** (§12
  rule 4). The flow's real traffic is unknown; say so, in the words the
  neighbouring docblocks use.
- **Fails closed** on a limiter error, as `resolveMembershipForWrite()` and all
  six `activity/actions.ts` paths do. An unlimited admin write path is worse
  than a control that is briefly unavailable.

**Order matters.** §10 rule 3 puts the limit at stage **b**, before parsing at
stage **c**. Both existing actions currently parse *first* (line 35, line 56)
and authorise second. That ordering is already wrong against §10 and this prompt
must fix it while it is here: resolve the admin session, spend the limit, then
parse. The key does not exist without the session, which is the same constraint
`resolveMembershipForWrite()` documents.

**Both actions share one bucket.** They are reached by the same person from the
same page and neither has honest high-frequency use. Say so in the docblock.

## Measurements

The limit and window are **judgements**, and the prompt must not pretend
otherwise. Choose them against the neighbouring limiters' reasoning and state
the comparison. There is no traffic to fit against — build step 7's view has
never shipped to real admins.

## Expected impact

Two admin actions gain a rejection path returning the file's existing typed
`SubmitResult` shape with a retry-timing message, matching `formatRetry`'s use
elsewhere. No success path changes.

## Prerender impact

`none — no route changes`. `/submissions` is an authenticated route and was
never prerendered. **Verify, do not assume**: `npm run build`, confirm the nine
marketing routes still read `○ Static` / `● SSG` exactly as §8.1 states.

## Trust boundary

- **Crosses:** an admin's form submission from `/submissions` — a role change
  (`staffMutationSchema`) or a removal (`submissionRemovalSchema`).
- **Validated:** server-side in the action, by the same schemas the leaves run,
  at stage **c** — now *after* the limit rather than before it.
- **Authorises:** `getAdminAccount()`, which requires `role === "admin"`, re-read
  server-side per call. Unchanged by this prompt.
- **A rejected request returns:** `{ ok: false, error }` — `FORBIDDEN` for a
  non-admin, and the new limiter message with retry timing for a throttled
  admin. Never a throw, never a bare string (§10 rule 2).

## Secrets and data

Reads `KV_REST_API_URL` / `KV_REST_API_TOKEN` transitively through
`lib/rate-limit/`, both already provisioned and server-only. **No new variable.**
Stores nothing new. **Logs nothing** — in particular, the limiter must not log
the user id, the submission id, or anything from the parsed input (§8.3 rule 2).

## Non-goals

- **Do not add BotID.** These are authenticated paths and the repository's
  standing decision, written at every comparable site, is that BotID is absent
  there. Add the same explanatory comment instead.
- Do not change what either action does on success, or the compensating-restore
  logic in the application branch.
- Do not extract a shared preamble helper here — `activity/actions.ts` is prompt
  98 and merging the two would make both diffs unreviewable.
- Do not touch `getAdminAccount()`'s semantics.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, build step 7's section: the new limiter's name, its window,
that the window is a judgement and against what it was judged, the shared
bucket, and the stage-ordering correction.

## SKILLS USED

- `upstash-ratelimit-js` — the limiter's construction, fixed-window semantics
  and the shape of the `allowed` / retry response, verified rather than copied
  from a neighbouring call site.
- `better-auth-best-practices` — session and role resolution, to keep
  `getAdminAccount()`'s re-read-per-request behaviour intact when the ordering
  changes.
- `zod-docs` — the two schemas move relative to the limiter; confirm
  `safeParse` and the typed-result shape stay as §10 rule 2 requires.
- `nextjs` — Server Actions, and `revalidatePath` behaviour on the new early
  return path.

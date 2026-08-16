# 98 — Six copies of the auth-and-rate-limit preamble in `activity/actions.ts`

## Scope, and why it is next

Second of the two security-relevant Standards findings, and the larger one.
Follows 97 because 97 establishes that the ordering rule (§10 rule 3, stage
**b** before stage **c**) is being enforced in this sequence, and this prompt
applies the same shape at scale.

`app/activity/actions.ts` is 1,610 lines and exports eleven Server Actions. Six
of them open with the **same ~40-line preamble**, verified this session at:

- `setFactorMapping` — line 653, preamble at 656-700
- `createCustomFactor` — line 863
- `importCustomFactors` — line 983
- `retireCustomFactor` — line 1230
- `editFactorSet` — line 1330
- `retireFactorSet` — line 1439

The shape is identical in all six: `getCurrentMembership()` in a `try`, the
signed-out / no-organisation split via `getCurrentAccount()`, the
`pendingDeletion` lock check, then a named limiter spent on
`membership.account.user.id`, failing closed. Only two things vary — **which
limiter** is spent, and **which error-message constants** are returned.

`app/account/actions.ts:209` already extracts precisely this shape as
`resolveMembershipForWrite()`. It is not directly reusable: it hard-codes
`checkInvitationWriteLimit` and the `MEMBERSHIP_ERRORS` constants, and it is
deliberately not exported (a `"use server"` module's runtime exports must all be
async functions). So the work is a parameterised extraction, not a call-site
swap.

**This is security-relevant code in six copies.** That is the finding: a fix or
a hardening applied to one copy silently leaves five behind.

## Reference material read

- `app/activity/actions.ts` — all eleven exported actions; the six preambles
  read in full, and the five that differ read closely enough to be sure they are
  genuinely different (`stageImport`, `updateImportMapping`, `commitImport`,
  `discardImport`, `recalculate`)
- `app/account/actions.ts:195-255` — `resolveMembershipForWrite()` and its
  docblock, which already argues the ordering and the fail-closed choice
- `lib/auth/organization.ts` — `getCurrentMembership`, `CurrentMembership`
- `lib/auth/server.ts` — `getCurrentAccount`
- `lib/rate-limit/index.ts` — the six named limiters involved
- `docs/backend.md` — build steps 9 and 10, prompt 73's lock

## What the implementation must do

Extract one helper, parameterised by the two things that vary, and call it from
all six sites.

**Where it goes.** Not in either `"use server"` module — the runtime-export
constraint that keeps `resolveMembershipForWrite()` unexported applies equally
here. Put it in `lib/auth/` (which §6.3 names as "session, role and organisation
resolution — one module; every authorisation decision reads from it") and give
it `import "server-only"`. Confirm the chosen file does not already re-export in
a way that would pull it into a client bundle.

**What it takes.** The limiter function and the error strings, passed in. Do not
invent a registry or an enum of limiters — pass the function.

**What it returns.** The same discriminated shape
`resolveMembershipForWrite()` uses: `{ ok: true, membership }` or
`{ ok: false, error }`. Every call site already handles that shape, so the
diff at each of the six is a deletion plus a guard.

**What must not change, per site:**

- the exact error string returned in each of the four failure cases
- which limiter is spent
- fail-closed on limiter error
- the `pendingDeletion` lock check, including that it runs **before** the limit
- the stage ordering: session and tenant, then limit, then parse

**Verify all six really are identical before collapsing them.** Diff the
preambles against each other explicitly. If any one differs in a way that is not
just the limiter or the strings — a missing lock check, a different ordering, a
swallowed error — that is a **defect**, and it must be **reported separately,
not silently normalised away** (§12 rule 9). Extraction would hide it.

**Then consider `resolveMembershipForWrite()`.** Once the general helper exists,
`app/account/actions.ts`'s private copy is a specialisation of it. Collapsing it
too is in scope *if* it is a clean call with no behaviour change; if the lock
comment there ("A locked organisation may do exactly one thing, and it is
`restoreOrganization`") makes it genuinely different, leave it and say why.

## Measurements

None. **No limit, window, key or error string may change.**

## Expected impact

`app/activity/actions.ts` loses roughly 200 lines. Every one of the six actions
behaves identically — same failures, same strings, same order, same limiter.

## Prerender impact

`none — no route changes`. `/activity` and its children are authenticated and
were never prerendered. **Verify, do not assume**: `npm run build`, confirm the
nine marketing routes are unchanged. The new `lib/auth/` module carries
`server-only`, so a mistaken client import fails the build rather than leaking.

## Trust boundary

Unchanged, and that is the whole point of the prompt. Per site: a tenant user's
form input crosses from the browser; the helper resolves and re-reads the
membership from Postgres (never from the session payload, §11.2 rule 5),
enforces the deletion lock, and spends the limit; the action then parses with
its Zod schema and authorises on the role at stage **d**. A rejected request
returns a typed `{ ok: false, error }` — signed out, no organisation,
organisation locked, throttled with retry timing, or generic. Never a throw.

## Secrets and data

Reads `KV_REST_API_URL` / `KV_REST_API_TOKEN` transitively, as today. **No new
variable.** No new storage. **The helper must log nothing** — not the user id,
not the organisation id, not the input (§8.3 rule 2). Note that the existing
preambles log nothing either; keep it that way.

## Non-goals

- **Do not split `activity/actions.ts` into multiple files.** File size is a
  separate finding, deliberately deferred.
- **Do not touch the five actions that do not share the shape.**
- Do not change any limiter's value, or introduce a shared bucket.
- Do not add BotID — authenticated paths, per the file's existing comments.
- Do not reshape the `FactorMappingResult` or any other result type.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- `npm run test:e2e` — **required for this prompt specifically.** Six
  authenticated write paths change shape at once; the domain tests cannot see
  any of it, and the E2E matrix is the only check in §2 that exercises these
  actions end to end. Quote the result. If the matrix cannot run in this
  environment, **say so plainly** rather than reporting the prompt as verified.

## Where the result is recorded

`docs/backend.md`, build steps 9 and 10: the helper's name and location, what it
is parameterised by, the six call sites, the per-site diff of the preambles that
proved them equivalent, and the decision taken about
`resolveMembershipForWrite()`.

## SKILLS USED

- `better-auth-best-practices` — session resolution and the per-request re-read.
- `organization-best-practices` — membership and role resolution through the
  organization plugin; `CurrentMembership`'s shape.
- `upstash-ratelimit-js` — passing a limiter as a value, and the `allowed` /
  `retryAfterSeconds` contract the helper must preserve.
- `nextjs` — the `"use server"` runtime-export constraint that determines where
  the helper may live, and Server Action semantics generally.
- `vercel-react-best-practices` — the call sites are consumed by client leaves;
  confirm the returned shape stays serialisable across the boundary.
- `zod-docs` — parsing stays at stage **c**, after the helper returns.

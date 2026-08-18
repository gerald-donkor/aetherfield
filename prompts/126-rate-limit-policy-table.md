# 126 — `lib/rate-limit/` — twenty wrappers become one policy table

Architecture candidate **5** of the review of 17 Aug 2026
(`docs/architecture.md`), *Worth exploring · ports & adapters*.

---

## 1 · Scope, and why it is next

The review's recommended order is **1 → 3 → 2 → 4, 5, 6**. Candidates 1, 3, 2
and 4 are landed — resolved from `git log` and the files on disk, never from
`prompts/` (§12 rule 5): `622c6b2` (prompt 121), `3ac8c64` (prompt 122),
`4be68c8` / `557f6f1` (prompts 123–124), `44f6666` (prompt 125). Candidate 6 is
blocked on a design answer the user has not given (`docs/architecture.md`
line 229 — whether `WorkspaceNav` should persist through a `loading.tsx`).

**Candidate 5 depends only on candidate 3, which is done. It is the only
unblocked candidate remaining**, and `docs/architecture.md` line 987 already
says so.

---

## 2 · The problem, restated from what is on disk

Every figure below was measured this session, not recalled.

| measured | command | result |
| --- | --- | --- |
| module size | `wc -l lib/rate-limit/index.ts` | **856** |
| exported limiters | `grep -c "^export async function check" lib/rate-limit/index.ts` | **20** |
| gate call sites | `grep -rn "limiter: check" app lib` | **14** |
| direct call sites | `grep -rn "check[A-Za-z]*Limit(" app lib` minus `lib/rate-limit/` | **12** |
| importing files | distinct files with an `import … from "…/lib/rate-limit"` | **16** |

> **The review's "18 wrappers" is stale and is corrected here rather than left
> standing** (§12 rule 8). There are twenty; `checkOrganizationDeletionLimit`
> (prompt 73) and `checkInvitationResponseLimit` (prompt 63) post-date the
> review's count. Fix the two occurrences in `docs/architecture.md` (its
> candidate-5 heading and its first line) in the same change, with a one-line
> note saying what the count is today and why it moved.

Each of the twenty exports forwards a fixed prefix, limit and window to the
private `consume()` helper. Three properties are therefore per-export decisions
spread across ~400 lines of docblock rather than declared in one place:

1. **the limit and the window**, as a pair of `SCREAMING_CASE` constants;
2. **whether the identifier is hashed before it reaches Redis** — the thing
   §8.3 rule 2 actually depends on, currently visible only by reading the body
   of `checkNewsletterAddressLimit` (line 519) and
   `checkNewsletterOneClickLimit` (line 558);
3. **whether the caller supplies an identifier at all** —
   `checkCronSweepLimit()` takes none and keys on the constant `"sweep"`
   (line 803).

---

## 3 · The call sites, enumerated

**Verified by reading every one. Do not re-derive these from the review.**

### 3a · Fourteen gate sites — `limiter:` passed to `resolveTenant`

| file | line | limiter |
| --- | --- | --- |
| `app/targets/actions.ts` | 59 | `checkTargetWriteLimit` |
| `app/activity/actions.ts` | 173 | `checkActivityImportLimit` |
| `app/activity/actions.ts` | 182 | `checkActivityCommitLimit` |
| `app/activity/mappings/actions.ts` | 130 | `checkFactorMappingLimit` |
| `app/activity/factors/actions.ts` | 151 | `checkFactorMappingLimit` |
| `app/activity/factors/actions.ts` | 249 | `checkFactorImportLimit` |
| `app/activity/factors/actions.ts` | 459 | `checkFactorMappingLimit` |
| `app/activity/factors/actions.ts` | 536 | `checkFactorMappingLimit` |
| `app/activity/factors/actions.ts` | 622 | `checkFactorMappingLimit` |
| `app/reports/actions.ts` | 78 | `checkReportWriteLimit` |
| `app/reports/actions.ts` | 110 | `checkReportNarrativeLimit` |
| `app/account/actions.ts` | 225 | `checkInvitationWriteLimit` |
| `app/account/actions.ts` | 492 | `checkAlertPreferenceLimit` |
| `app/account/actions.ts` | 597 | `checkOrganizationDeletionLimit` |

`app/activity/factors/actions.ts` holds **five**, not the four an earlier draft
of this prompt claimed.

### 3b · Twelve direct sites — the caller builds its own refusal

| file | line | call |
| --- | --- | --- |
| `app/_actions/demo-request.ts` | 72 | `checkDemoRequestLimit(ip)` |
| `app/_actions/application.ts` | 92 | `checkApplicationLimit(ip)` |
| `app/_actions/newsletter.ts` | 84 | `checkNewsletterIpLimit(ip)` |
| `app/_actions/newsletter.ts` | 119 | `checkNewsletterAddressLimit(email)` |
| `app/_actions/newsletter.ts` | 233 | `checkNewsletterTokenLimit(ip)` |
| `app/api/newsletter/unsubscribe/route.ts` | 53 | `checkNewsletterOneClickLimit(token)` |
| `app/account/actions.ts` | 115 | `checkOrganizationCreateLimit(account.user.id)` |
| `app/invitation/[id]/actions.ts` | 61 | `checkInvitationResponseLimit(account.user.id)` |
| `app/submissions/actions.ts` | 73 | `checkSubmissionWriteLimit(admin.user.id)` |
| `app/api/cron/recalculate/route.ts` | 81 | `checkCronSweepLimit()` |
| `app/api/cron/purge-submissions/route.ts` | 108 | `checkCronSweepLimit()` |
| `app/api/cron/purge-organizations/route.ts` | 94 | `checkCronSweepLimit()` |

`checkOrganizationCreateLimit` is direct rather than gated because it runs
*before* an organisation exists, so there is no tenant for `resolveTenant` to
resolve.

### 3c · The sixteen importing files

Fifteen under `app/` plus `lib/auth/tenant.ts`. **Six also import
`formatRetry`** and keep doing so: `app/_actions/{demo-request,application,
newsletter}.ts`, `app/account/actions.ts`, `app/invitation/[id]/actions.ts`,
`app/submissions/actions.ts`.

`lib/auth/server.ts` and `lib/email/send.ts` match `grep -rln "rate-limit"` but
**import nothing from it** — both only mention the module in prose. Leave both
alone.

---

## 4 · The module to build

### 4a · Where the code lives — one decision to make explicitly

Split `lib/rate-limit/` into two files:

- **`lib/rate-limit/policies.ts`** — the `RateLimitPolicy` union, the `POLICIES`
  record, and every one of the ~400 lines of docblock, moved onto its policy's
  entry. **No I/O, no Redis import** — this is the "testable as a pure table"
  the review names as the win.
- **`lib/rate-limit/index.ts`** — `getRedis()`, `getLimiter()`, `consume()`,
  the exported `checkLimit()` and `formatRetry()`, re-exporting
  `RateLimitPolicy` and `RateLimitOutcome`. Keeps `import "server-only"`.

Every existing import specifier stays `…/lib/rate-limit`, so no call site's
module path changes. If the split turns out to fight the docblocks in practice,
one file is acceptable — but say which was done and why in the record.

### 4b · The shape

One string-literal union, one record, one exported check:

```ts
export type RateLimitPolicy =
  | "demo-request" | "newsletter-ip" | "newsletter-address" | …;

type Stage = { prefix: string; limit: number; window: Duration };

type Policy = {
  /** `"plain"` — the identifier reaches Redis as given (an IP, or a user id,
      neither of which is personal data under §8.3 rule 2).
      `"hash"` — sha256 first; the value itself must never be a Redis key.
      `"constant"` — the caller supplies nothing and the key is fixed. */
  key: "plain" | "hash" | { constant: string };
  /** One stage for nineteen policies; two for `newsletter-address`. */
  stages: readonly [Stage, ...Stage[]];
};

export const POLICIES: Record<RateLimitPolicy, Policy> = { … };
```

`checkLimit` walks `stages` in order and returns the first rejection without
touching a later stage. That is not a new behaviour — it is exactly what
`checkNewsletterAddressLimit` does today at line 527, and its docblock's reason
("a rejected double-click does not consume one of the three hourly sends") is
preserved by the ordering rather than by an `if`.

**Hashing moves out of the call path and into the declaration.** `checkLimit`
applies it when `key` is `"hash"`, so `checkLimit("newsletter-one-click", token)`
still passes the raw token and Redis still sees only the digest. This is the
review's stated win — "hashing becomes a declared field" — and the property
§8.3 rule 2 depends on becomes greppable.

### 4c · The two shapes that do not fit "one limit, one window"

1. **`newsletter-address` carries two stages.** Model it in the table, not as an
   `if` inside `checkLimit` — a second two-stage limiter added later must reuse
   the same code path. Its two Redis prefixes are
   **`newsletter-address-burst`** (1 / 60 s) then **`newsletter-address`**
   (3 / 1 h), and both stay byte-identical.
2. **`cron-sweep` takes no caller identifier.** Enforce that with a `checkLimit`
   overload — one signature requiring `identifier: string` for every policy
   except `"cron-sweep"`, a second taking `"cron-sweep"` alone. This is the
   technique candidate 3 already used for `throttled`, and it makes the wrong
   call a **compile** error rather than a runtime surprise. Verify it the way
   prompt 122 verified `throttled`: write a probe module calling
   `checkLimit("cron-sweep", "x")` and `checkLimit("factor-mapping")`, compile
   it, confirm both fail with the expected `tsc` error, then delete it.

### 4d · The policy table

Copied from `lib/rate-limit/index.ts` as it stands. **Re-verify every row
against the file at implementation time and correct whichever side is wrong**
(§12 rule 8) — this table is a plan, the file is the fact.

| policy (= Redis prefix) | limit | window | key | source constant |
| --- | --- | --- | --- | --- |
| `demo-request` | 5 | 1 h | plain (IP) | line 29 |
| `newsletter-ip` | 5 | 1 h | plain (IP) | line 38 |
| `newsletter-address` | 1 / 60 s **then** 3 / 1 h | — | hash (lowercased address) | lines 54–57 |
| `newsletter-token` | 20 | 1 h | plain (IP) | line 65 |
| `newsletter-one-click` | 10 | 1 h | hash (unsubscribe token) | line 77 |
| `application` | 5 | 1 h | plain (IP) | line 98 |
| `organization-create` | 10 | 1 h | plain (user id) | line 127 |
| `activity-import` | 20 | 1 h | plain (user id) | line 151 |
| `activity-commit` | 60 | 1 h | plain (user id) | line 164 |
| `factor-mapping` | 30 | 1 h | plain (user id) | line 189 |
| `factor-import` | 6 | 1 h | plain (user id) | line 213 |
| `target-write` | 30 | 1 h | plain (user id) | line 238 |
| `report-write` | 20 | 1 h | plain (user id) | line 262 |
| `report-narrative` | 10 | 1 h | plain (user id) | line 281 |
| `alert-preference` | 30 | 1 h | plain (user id) | line 297 |
| `organization-deletion` | 10 | 1 h | plain (user id) | line 320 |
| `invitation-write` | 20 | 1 h | plain (user id) | line 340 |
| `invitation-response` | 30 | 1 h | plain (user id) | line 355 |
| `cron-sweep` | 6 | 1 h | constant `"sweep"` | line 392 |
| `submission-write` | 30 | 1 h | plain (user id) | line 425 |

**Redis prefixes stay byte-identical.** Changing one silently resets whatever
counters are live in Upstash, and nothing in a refactor's scope justifies that
even though these forms have never carried production traffic.

**Every docblock moves verbatim.** The ~400 lines explaining why each number is
a *judgement, not a measurement* (§12 rule 4) are the majority of the file and
none of it is stale. This prompt does not re-derive, shorten, merge or reword a
single one — including `CRON_SWEEP_WINDOW`'s own §12 rule 8 correction at
lines 368–370 and its cited Vercel docs URL.

---

## 5 · `lib/auth/tenant.ts` — the collision candidate 3 deferred

`docs/architecture.md` line 226 named this in advance, and
`lib/auth/tenant.ts:134-137` says so at the site: *"the set of limiters stays in
`lib/rate-limit/`. Architecture candidate 5 changes that, and this gate
deliberately does not pre-empt it."* Candidate 3 landed first, so candidate 5
rewrites the signature. Four edits, all in that one file:

1. **`TenantGateOptions`, line 138** — `limiter: (identifier: string) =>
   Promise<RateLimitOutcome>` becomes `limiter: RateLimitPolicy`. Rewrite the
   docblock at lines 134–137: it currently explains why a *function* was passed
   and points forward to this candidate; it should now explain that the call
   site names a policy key and that the review's stated cost (§ below) was
   accepted.
2. **`resolveTenant`, line 206** — `await options.limiter(membership.account.user.id)`
   becomes `await checkLimit(options.limiter, membership.account.user.id)`.
3. **The import, line 3** — today
   `import { formatRetry, type RateLimitOutcome } from "../rate-limit"`.
   `RateLimitOutcome` becomes unused the moment the field is a string and
   **will fail `npm run lint`**; replace it with `checkLimit` and the
   `RateLimitPolicy` type. Confirm no other reference to `RateLimitOutcome`
   survives in the file before removing it.
4. **Verify the union narrowing still holds.** Lines 122–123 state that
   ``` `limiter?: undefined` on the first shape is what makes
   `if (options.limiter)` narrow to the second ```. Truthiness narrowing
   continues to work for a non-empty string-literal union, but **confirm it
   against `tsc` rather than assuming**, and if it does not, switch line 204 to
   an explicit `options.limiter !== undefined` and say so in the record.

**Two things that do not change.** The
`throttled`-required-exactly-when-`limiter`-is-passed enforcement is about the
*shape* of the union, not the *type* `limiter` holds — re-run prompt 122's probe
(a `TenantGateOptions` with `limiter: "factor-mapping"` and no `throttled`
should still fail to compile) to prove it. And the gate's fail-closed `catch`
at lines 215–217 is untouched.

**One new coupling, stated rather than smuggled.** `lib/auth/` gains a *value*
import from `lib/rate-limit/` where it previously took only `formatRetry` and a
type. Both are `server-only` modules under `lib/`, neither imports the other's
caller, and no cycle is created — but it is a real edge on the module graph and
belongs in the record.

---

## 6 · The rewrite at the call sites

- Each of the **14** gate sites: `limiter: checkFactorMappingLimit` →
  `limiter: "factor-mapping"`.
- Each of the **12** direct sites: `checkXLimit(id)` → `checkLimit("x", id)`;
  the three cron routes become `checkLimit("cron-sweep")`.
- Each of the **15** app-side import statements collapses to `checkLimit`
  (plus `formatRetry` where it is already imported). Several are multi-line
  named imports that become one or two specifiers — let the formatter settle
  them.

**Nothing else at a call site changes**: no message string, no `revalidatePath`
target, no `catch`, no surrounding control flow, no ordering of the write
path's stages. This is a reshape of how a limiter is *named*, never of when or
whether it is *spent*.

### The cost the review stated, accepted here

> *"Named exports let a call site be wrong only by importing the wrong symbol;
> a policy key is a lookup and loses that."*

Accepted, and it is narrower than it reads: `RateLimitPolicy` is a closed
string-literal union, so an **unknown** key is still a compile error and only a
*plausible-but-wrong* key (`"target-write"` where `"report-write"` was meant)
gets through — which was equally true of importing the wrong function. Record
this as the trade-off consciously taken, not as a win.

---

## 7 · Measurements the implementation must hit

**There is no numeric target here beyond equivalence** — say so rather than
inventing one, as prompt 125 did for the same kind of change.

1. `wc -l` on `lib/rate-limit/*.ts` before and after, reported as measured, with
   the two-file split's total called out separately from `index.ts` alone.
2. **A twenty-row equivalence table** — policy, prefix, limit, window, key
   treatment — quoting both the old constant and the new table entry, confirming
   every one identical.
3. `grep -rn "check[A-Za-z]*Limit(" app lib` after the change → **zero matches**
   outside `lib/rate-limit/` itself.
4. `grep -c "^export async function" lib/rate-limit/index.ts` → **1**
   (`checkLimit`; `formatRetry` is sync), down from 21.
5. `grep -rn "aetherfield:" lib/rate-limit/` → the 21 prefixes (20 policies,
   `newsletter-address` contributing two) unchanged.
6. **Three `tsc`-rejection probes**, each written, compiled, confirmed to fail
   with the expected error, then deleted — not asserted:
   `checkLimit("cron-sweep", "x")`, `checkLimit("factor-mapping")`, and a
   `TenantGateOptions` with `limiter` but no `throttled`.

---

## 8 · Prerender impact

**none — no route changes.** `lib/rate-limit/` and `lib/auth/tenant.ts` are
both `server-only` and reached only from `app/*/actions.ts`,
`app/_actions/*.ts` and `app/api/*/route.ts`, none of which is prerendered.

**Verify, do not assume:** run `npm run build`, confirm the route table in
§8.1 is unchanged, then run the prerender diff from `docs/automation.md` and
expect byte-identical marketing HTML — with the standing mask on `/`,
`/journal` and `/careers` (the scrubbed capabilities cloth, the stamp's
perforation drift, the marching dashes), whose page-wide `-metric AE` must
never be quoted bare.

## 9 · Trust boundary

Unchanged at all 26 sites and inside the gate. Every write still resolves the
session and organisation server-side, still enforces the deletion lock, still
runs `authorize` before the limiter, still fails closed when the limiter throws,
and still returns a typed `{ ok: false, error }` rather than throwing (§10
rule 2). The stage order **a → b → c** is untouched everywhere. This prompt
changes *which value identifies a limiter at a call site* — never what crosses
from the browser, what authorises a write, or what a rejection returns.

## 10 · Secrets and data

Reads the same two variables as today, `KV_REST_API_URL` / `KV_REST_API_TOKEN`
(§8.4), in the same one place — `getRedis()`, unmoved, including its docblock
explaining why `Redis.fromEnv()` is not used. No `NEXT_PUBLIC_*`. No personal
data is stored, transmitted or newly logged: sha256 treatment for
`newsletter-address` and `newsletter-one-click` is preserved exactly and becomes
*more* auditable by being declared (§8.3 rule 2). Nothing is logged, as today.

---

## 11 · Non-goals

- **Any change to a limit, a window, a key treatment, or which limiter a call
  site spends.** A mechanical collapse of the interface, not a policy review —
  if a number looks wrong while reading it, note it for a future prompt.
- **Any change to a Redis prefix**, for the counter-reset reason in §4d.
- **`formatRetry`** — signature, behaviour and location unchanged.
- **`consume()`, `getRedis()`, `getLimiter()`** — internals kept as they are
  beyond taking their arguments from the table.
- **Candidate 6's boundary shell** — blocked on the open design question.
- **`lib/auth/server.ts`, `lib/auth/organization.ts`** and every query module —
  none calls a limiter and none is expected to change.
- **The WebKit e2e container gap** — see the checks table. Shared
  infrastructure this candidate does not own.

---

## 12 · Checks

| check | expectation |
| --- | --- |
| `npm run lint` | clean — and note that removing `RateLimitOutcome` from `lib/auth/tenant.ts` is required to get there (§5) |
| `npm run typecheck` | clean |
| `npm test` | unchanged pass count — nothing in scope is under `lib/domain/` |
| `npm run build` | route table unchanged, per §8 |
| prerender diff | byte-identical, per `docs/automation.md`, masks in force |
| `npm run test:e2e` | run the full matrix — this touches every authenticated write path's limiter call, the widest blast radius of the five candidates landed so far. **Expect Chromium + Firefox to pass and WebKit not to run**: prompts 123, 124 and 125 all recorded the same container failure — the pinned image's own auth-setup fixture dies on `browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1234/…` before WebKit starts. Report it as the standing gap it is; **do not investigate or fix it here** |

---

## 13 · Where the result is recorded

**`docs/architecture.md`**, and nowhere else:

1. Fill candidate 5's row in the landed table at the foot of the file — `126`,
   and the date.
2. Correct the candidate-5 heading and its first line from "18 wrappers" to
   twenty, with a one-line note on why the review's count was low (§12 rule 8).
3. Add **"Prompt 126 — the record"** beside prompts 121/122/125's, carrying: the
   twenty-row equivalence table, the measured line counts, the `grep` and
   `tsc`-probe confirmations, the file-split decision and its reason, the new
   `lib/auth` → `lib/rate-limit` value edge, the union-narrowing verification
   result, and the two interface decisions (the multi-stage table entry, the
   overloaded arity for `cron-sweep`) stated the way prompt 122 stated its four.
4. Close with a "where this leaves candidate 5" paragraph and the status of
   candidate 6.

**`docs/backend.md` gets no cross-reference** — no message, schema, environment
variable or externally observable behaviour changes. **Nothing is added to
`AGENTS.md`** — `docs/architecture.md` is already indexed, §5.4's candidate-5
row is a plan row and is not ticked (§5.2's rule), and this introduces no
site-wide invariant.

Then commit to `main`, unprompted (§1 step 10). Do not push.

---

## SKILLS USED

- **`upstash-ratelimit-js`** — confirm `Ratelimit.slidingWindow`, `.limit()`,
  the `prefix` option and the `Duration` type of the window argument are
  unchanged from what `lib/rate-limit/index.ts` already calls. This refactor
  reaches no new SDK surface; the skill is here to keep the reshaped types
  honest against the real signatures rather than against memory (§12 rule 2).
- **`upstash-redis-js`** — `getRedis()`'s explicit `new Redis({ url, token })`
  construction moves unchanged; confirm nothing in the current SDK makes that
  construction stale before copying it forward.
- **`nextjs`** — confirm that a `"use server"` module's every runtime export
  must still be an async function, which is why `formatRetry` lives in
  `lib/rate-limit/` and not in an action, and why a plain server-only module
  may export the `POLICIES` const at all.
- **`vercel:vercel-functions`** — only if the cron routes' 429 branches need
  re-reading; the three are edited, so confirm nothing about their response
  shape is being disturbed.
- **`zod-docs`** — none expected; no schema in scope changes. Listed so a run
  that finds one has a loaded reference rather than a guess.
- **`drizzle-docs`** — none expected; no query in scope changes. Listed for the
  same reason.

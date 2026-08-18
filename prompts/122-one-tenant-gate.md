# 122 — One tenant gate that also spends the limiter

Architecture candidate **3** of the review of 17 Aug 2026
(`docs/architecture.md`), *Strong · local-substitutable*.

## Scope, and why it is next

The recommended order is **1 → 3 → 2 → 4, 5, 6**. Candidate 1 landed as prompt
121 (`622c6b2`, `lib/validation/result.ts`), resolved from `git log` and the
file on disk, not from this directory. Candidate 3 is next, and two of the
review's own constraints say so rather than a preference:

- **3 before 5** — candidate 3's gate takes a limiter *function*; candidate 5
  replaces every limiter function with a *policy key*. Whichever lands second
  rewrites the other's signature.
- **3 before 4** — candidate 3 removes ~100 lines of preamble from
  `app/activity/actions.ts` and may change how its three parts want to divide.

Candidate 2 is sequenced after 3 in the review's order, and its own scope
warning puts three of its leaves inside §8.1 marketing territory. Candidate 6 is
blocked on an open design question the user has not answered.

## The problem, restated from what is on disk

`lib/auth/tenant.ts` exports two functions that were cut on **what they return**
rather than **what they enforce**:

- `resolveTenant(messages)` → `{ ok, userId, organizationId }`, no limiter.
- `resolveMembershipForWrite(limiter, messages)` → `{ ok, membership }`, spends
  a limiter, fails closed.

So the limiter half — security-relevant, fail-closed, and the half a hardening
would want to reach every write — is re-implemented outside the module that owns
it. Read from the files, not from the review:

| site | shape | limiter |
| --- | --- | --- |
| `app/targets/actions.ts:50` `consumeWriteLimit` | 15-line helper | `checkTargetWriteLimit` |
| `app/reports/actions.ts:65` `consumeLimit` | 17-line helper, takes the limiter and a prefix | `checkReportWriteLimit`, `checkReportNarrativeLimit` |
| `app/activity/actions.ts:1410` `consumeCommitLimit` | 17-line helper | `checkActivityCommitLimit` |
| `app/activity/actions.ts:298` | **inline block** in `stageImport` | `checkActivityImportLimit` |
| `app/account/actions.ts:558` `resolveOwnerForDeletion` | **45-line helper** — session, tenant, owner check, then the limiter | `checkOrganizationDeletionLimit` |

**The fifth row is not in the review and is a correction to it** (AGENTS.md §12
rule 8). `docs/architecture.md` names four re-implementations; there are five.
`resolveOwnerForDeletion` re-implements the session resolve, the two-state
signed-out/no-organisation split *and* the fail-closed limiter block, because it
must **not** enforce the deletion lock — restoring a locked organisation is the
one thing a locked organisation may do. That is a real constraint, and it is the
reason this prompt's gate takes a lock mode rather than hard-coding the lock.

**Correcting the review's counted wins as well:**

- The review says "a hardening reaches all 13 writes". The counted figure from
  the call sites is **21**: `resolveTenant` has 10 callers (targets 2, reports 3,
  activity 5) and `resolveMembershipForWrite` has 11 (activity 6, account 5).
- The review says "`formatRetry` keeps one caller". It cannot. After this change
  `formatRetry` still has legitimate callers with no tenant to resolve:
  `app/_actions/{demo-request,newsletter,application}.ts` (public phase-one
  forms), `app/submissions/actions.ts` (staff/admin, session-only), and
  `app/invitation/[id]/actions.ts` (a session with no membership yet, by
  definition). What this change removes is its **four tenant-path callers** —
  `targets`, `reports`, `activity`, `account`.

## The gate to build

One export in `lib/auth/tenant.ts`, replacing both:

```ts
export type TenantGate =
  | {
      ok: true;
      membership: CurrentMembership;
      userId: string;
      organizationId: string;
    }
  | { ok: false; error: string };

export async function resolveTenant(options: {
  messages: TenantMessages & { throttled?: (retry: string) => string };
  /** Omitted where the caller spends no token — today only the read-shaped
      paths that already call `resolveTenant()` with no limiter. */
  limiter?: (identifier: string) => Promise<RateLimitOutcome>;
  /** `"enforce"` (default) refuses a pending-deletion organisation before the
      limiter is touched. `"allow-locked"` is `resolveOwnerForDeletion`'s case
      and must be spelled at the call site. */
  lock?: "enforce" | "allow-locked";
  /** Stage **d**, run after the lock and **before** the limiter, so a refusal
      spends no token. Returns an error sentence, or `null` to proceed. */
  authorize?: (membership: CurrentMembership) => string | null;
}): Promise<TenantGate>;
```

Four interface decisions, each with its reason, to be written into the
docblock:

1. **It returns the membership *and* the two ids.** They are the same value at
   different widths — the ids *are* `membership.account.user.id` and
   `membership.organization.id` — so returning both costs nothing derived and
   leaves the ten existing `tenant.userId` / `tenant.organizationId` call-site
   bodies untouched. The diff stays in the preamble, which is the point of the
   change.
2. **The limiter stays a function, not a policy key.** Candidate 5 changes that,
   and this prompt must not pre-empt it — the review's own sequencing note says
   the two fight.
3. **`throttled` is optional and required exactly when `limiter` is passed.**
   Type it so that is enforced by the signature (a discriminated pair of option
   shapes) rather than by a runtime check, so a limiter with no sentence is a
   compile error.
4. **Order is fixed inside the gate: session → tenant → lock → `authorize` →
   limiter.** `@upstash/ratelimit`'s `limit()` spends a token on the call, so
   every cheap refusal must precede it. This is the one documented departure
   from AGENTS.md §10's stage order — the limit is keyed by the user id and
   there is no key without the session — and `tenant.ts` already records it.

`formatRetry` stays applied **inside** the gate, as `resolveMembershipForWrite`
already does, so the seconds-to-prose rule keeps one home.

## Call sites to rewrite

All 21, plus the five re-implementations. Each becomes a message object and one
`await resolveTenant({ ... })`.

- **`app/targets/actions.ts`** — delete `consumeWriteLimit`; the local
  `resolveTenant()` wrapper becomes one options builder carrying
  `checkTargetWriteLimit` and `TOO_MANY_WRITES`. Drop the `formatRetry` import.
- **`app/reports/actions.ts`** — delete `consumeLimit`; **two** builders, one per
  limiter (`checkReportWriteLimit` / `TOO_MANY_WRITES`,
  `checkReportNarrativeLimit` / `TOO_MANY_DRAFTS`). Drop `formatRetry` and the
  `RateLimitOutcome` type import if it has no other use.
- **`app/activity/actions.ts`** — delete `consumeCommitLimit` and `stageImport`'s
  inline block; the file ends with **five** message objects (import, commit,
  factor-mapping, custom-factor, custom-factor-import) where it has three today.
  The six `resolveMembershipForWrite` sites become `resolveTenant` sites with no
  behaviour change. Drop the `formatRetry` import.
- **`app/account/actions.ts`** — the local `resolveMembershipForWrite()` wrapper
  becomes an options builder; `setAlertEmailPreference`'s inline options move to
  one; **`resolveOwnerForDeletion` collapses to a gate call** with
  `lock: "allow-locked"`, `authorize: (m) => m.role === "owner" ? null :
  ORGANIZATION_DELETION_ERRORS.NOT_OWNER`, and
  `checkOrganizationDeletionLimit`. Drop the `formatRetry` import.

## Deliberately unchanged

- **`createOrganization`** (`app/account/actions.ts`) spends
  `checkOrganizationCreateLimit` against a session with **no membership yet**.
  There is no tenant to resolve, so it is not a gate caller and its block stays.
- **`app/submissions/actions.ts`'s `resolveAdminForWrite`** — Aetherfield's own
  `admin` role, no organisation, no tenant. AGENTS.md §11.1 keeps the two role
  systems orthogonal and this prompt must not merge them.
- **`app/invitation/[id]/actions.ts`** — a session responding to an invitation
  is by definition not yet a member.
- The three public phase-one forms in `app/_actions/`.

## Measurements the implementation must hit

There is no measurement instrument here beyond equivalence, and this section
says so rather than inventing one.

1. **A per-site equivalence table, produced by reading the before and after**,
   covering all 21 call sites and all five re-implementations, with four columns:
   the limiter spent, the four (or five) sentences returned, whether the lock is
   enforced, and where `authorize` runs. Every row must be *identical* before and
   after, with one exception, which must be listed explicitly if it occurs and
   argued:
   - **`resolveOwnerForDeletion`'s owner check must still run before the
     limiter.** That is exactly why `authorize` exists. If the implementation
     cannot preserve that order, it must leave `resolveOwnerForDeletion` alone
     and say so, not silently move the check after the token spend — a non-owner
     probing the control would then consume the owner's deletion budget.
2. **Line count before and after** for `lib/auth/tenant.ts` and the four action
   modules, reported as measured `wc -l`, not estimated.
3. **`formatRetry`'s caller list before and after**, produced by `grep`, to
   confirm the four tenant-path callers are gone and the five legitimate ones
   remain.

`lib/auth/` is outside `vitest.config.mts`'s `include`
(`lib/{domain,validation}/**/*.test.ts`) and is `server-only`, so **there is no
unit test to add here** — widening the vitest scope to a module that reads a
session and Redis is the thing that scope exists to prevent. Equivalence is
established by inspection and by the E2E matrix; say that plainly in the record
rather than implying a test proved it.

## Prerender impact

**none — no route changes.** Everything touched is `server-only`
(`lib/auth/tenant.ts`) or a `"use server"` module inside an authenticated route
tree. **Verify, do not assume**: run `npm run build`, confirm the route table is
unchanged, and run the two-build prerender diff from `docs/automation.md`.
Unlike prompt 121, no client module's bytes change, so the expectation is
**byte-identical prerendered HTML with no shared-chunk renaming at all** — if a
chunk name moves, something client-side was touched and the change has exceeded
its scope.

## Trust boundary

Unchanged, and this module *is* the boundary. What crosses from the browser is
unchanged at every one of the 21 sites; the organisation id continues to be
resolved from the session's membership row and is never accepted from a request
(the whole reason `getCurrentMembership()` is the primitive rather than
`authorizeOrganization(id)`). Authorisation stays inside the action
(AGENTS.md §11.2 rules 1–2), the role is still re-read from Postgres per request
(rule 5), and a rejected request still returns a typed `{ ok: false, error }` —
never a throw, never a redirect (§10 rule 2). The deletion lock keeps its one
sanctioned bypass and that bypass is now spelled at its call site instead of
being implicit in a private helper.

## Secrets and data

Reads no environment variable directly. `lib/rate-limit/` reads
`KV_REST_API_URL` / `KV_REST_API_TOKEN`; `lib/auth/` reads the Better Auth
secret. **No `NEXT_PUBLIC_*` is involved.** No personal data is stored,
transmitted or logged by this change, and the gate must keep logging **nothing**
on every path and in every catch — not a user id, not an organisation id, not an
input (AGENTS.md §8.3 rule 2). The existing bare `catch {}` blocks stay bare.

## Non-goals

- **Candidate 5's policy table.** The limiter stays a function. Sequenced after
  this one deliberately.
- **Candidate 4's split of `app/activity/actions.ts`.** This prompt removes
  preamble from that file; it does not divide it.
- **Candidate 2's submit lifecycle.** No client leaf is touched.
- Merging the staff/admin gate with the tenant gate (§11.1 keeps them
  orthogonal).
- Any change to a message a user reads. Every sentence ships verbatim.
- Any change to a limiter's window, prefix or key treatment.

## Checks

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | unchanged pass count from prompt 121's 318 — nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged |
| prerender diff | byte-identical, per `docs/automation.md`; no chunk renaming expected |
| `npm run test:e2e` | Chromium and Firefox. **WebKit will not run** — `scripts/playwright-webkit.sh` needs Podman, which is absent; the wrapper still exits 0, so report it as the standing environment gap and never as a pass |

## Where the result is recorded

**`docs/architecture.md`** — tick candidate 3 in the landed table at the foot of
the file, and add a **"Prompt 122 — the record"** section beside prompt 121's,
carrying: the interface decisions above and which of them survived, the
equivalence table, the measured line counts, the `formatRetry` caller diff, the
correction that there were five re-implementations and not four, the corrected
"21 writes" and "formatRetry keeps five callers" figures, and the checks with
their actual output.

`docs/backend.md` gets a cross-reference only if a message or a behaviour
changed, which it should not. **Nothing is added to `AGENTS.md`** — no new index
row is needed (`docs/architecture.md` is already indexed) and this change
introduces no site-wide invariant.

## SKILLS USED

- **`upstash-ratelimit-js`** — the limiter's semantics, and specifically that
  `limit()` spends a token on the call, which is what fixes the gate's internal
  order (lock and `authorize` before the limiter). Loaded while writing this
  prompt.
- **`nextjs`** — Server Actions in Next 16: a `"use server"` module's runtime
  exports must all be async entry points, which is why every gate wrapper in
  these four files is a non-exported helper.
- **`better-auth-best-practices`** — `getSession` / membership resolution
  semantics behind `lib/auth/organization.ts`, to confirm nothing in the collapse
  changes how a session is read.
- **`organization-best-practices`** — the organization plugin's membership and
  role model, for the `authorize` hook's owner check.
- **`zod-docs`** — not for a new schema; only to confirm nothing in the parse
  stage moves when the preamble changes shape.
- **`drizzle-docs`** — `None expected`, listed only because
  `getCurrentMembership` reads through `lib/db/`; invoke it only if a query is
  touched, which this prompt says it must not be.

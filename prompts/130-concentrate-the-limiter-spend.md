# 130 — Concentrate the limiter spend

## Scope, and why it is next

**Deepening candidate 1 from the 18 Aug 2026 review** (`docs/architecture.md`,
"A second review, over the remediation itself"), which that review named its top
recommendation and the user has chosen. One prompt covers one candidate.

`lib/auth/tenant.ts:15-19` states the finding prompt 122 was written to close,
in its own words:

> the limiter half was the security-relevant, fail-closed half, and it was
> re-implemented at five sites outside the module that owns it. A hardening
> applied here now reaches all 21 authenticated writes rather than the ten that
> happened to pick the limiter-bearing sibling.

It closed that for the **tenant-bearing half only**. Twelve sites still call
`checkLimit` directly, and each one restates the same four-step shape:
`checkLimit` → `!allowed` → a retry sentence built with `formatRetry` → a
`catch` that decides the failure posture. The posture is the part that matters
and the part that is least visible: it lives in a comment above a `catch`, not
in anything a caller is obliged to state.

**This is not a claim that any current posture is wrong.** Every one of the
twelve is deliberate and carries a written rationale. The defect is that the
decision is *documented* rather than *expressed in the interface*, so a
thirteenth site — or a dropped `catch` at an existing one — reads as neither and
fails silently in whichever direction the code happens to take.

## A correction to the review that produced this candidate

**The Phase B scan said the three cron routes fail open. Two of them do not.**
Checked at every site rather than assumed, and corrected here rather than
carried forward (§12 rule 8):

- `app/api/cron/recalculate/route.ts:86` — `catch { /* Deliberately continues. */ }` — **fails open**
- `app/api/newsletter/unsubscribe/route.ts:56` — `catch { /* Deliberately continues. */ }` — **fails open**
- `app/api/cron/purge-organizations/route.ts:99` — `catch` returns `503 limiter-unavailable` — **fails closed**
- `app/api/cron/purge-submissions/route.ts:113` — `catch` returns `503 limiter-unavailable` — **fails closed**

So the split is **ten fail-closed, two fail-open**, not eight and four. The two
purge routes state the asymmetry explicitly (`purge-submissions/route.ts:95-101`:
"this one deletes personal data irreversibly, so a limiter that cannot be
consulted is a reason to wait a night rather than to proceed unmetered"), and
that asymmetry is exactly what the new interface must be able to express.
`docs/architecture.md`'s candidate-1 record must be corrected in the same change.

## The twelve sites, with the posture and the refusal shape each needs

Produced by `grep -rn "checkLimit" app lib | grep -v "^lib/rate-limit/"` and
reading every hit. **The refusal shapes are not uniform, and that is the central
design constraint** — a module that returns a finished sentence fits the eight
Server Actions and fits neither the routes nor the fail-open pair.

| # | site | policy | key | on throttle | on limiter error |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/submissions/actions.ts:70` | `submission-write` | admin user id | `{ok:false}` "…too many **changes**…" | closed → `GENERIC_FAILURE` |
| 2 | `app/account/actions.ts:109` | `organization-create` | user id | `{ok:false}` "…too many **attempts**…" | closed → `GENERIC_FAILURE` |
| 3 | `app/invitation/[id]/actions.ts:58` | `invitation-response` | user id | `{ok:false}` "…too many **attempts**…" | closed → `MEMBERSHIP_ERRORS.GENERIC` |
| 4 | `app/_actions/demo-request.ts:72` | `demo-request` | IP | `{ok:false}` "…too many **requests**…" | closed → `GENERIC_FAILURE` |
| 5 | `app/_actions/application.ts:92` | `application` | IP | `{ok:false}` "…too many **requests**…" | closed → `GENERIC_FAILURE` |
| 6 | `app/_actions/newsletter.ts:79` | `newsletter-ip` | IP | `{ok:false}` "…too many **requests**…" | closed → `GENERIC_FAILURE` |
| 7 | `app/_actions/newsletter.ts:114` | `newsletter-address` | email (hashed) | `{ok:false}` "**A confirmation was already sent to that address.**…" | closed → `GENERIC_FAILURE` |
| 8 | `app/_actions/newsletter.ts:228` | `newsletter-token` | IP | `{ok:false}` "…too many **requests**…" | closed → `TOKEN_FAILURE` |
| 9 | `app/api/cron/purge-organizations/route.ts:94` | `cron-sweep` | constant | `429 {skipped:"rate-limited"}` | **closed** → `503 limiter-unavailable` |
| 10 | `app/api/cron/purge-submissions/route.ts:108` | `cron-sweep` | constant | `429 {skipped:"rate-limited"}` | **closed** → `503 limiter-unavailable` |
| 11 | `app/api/cron/recalculate/route.ts:81` | `cron-sweep` | constant | `429 {skipped:"rate-limited"}` | **open** → continues |
| 12 | `app/api/newsletter/unsubscribe/route.ts:53` | `newsletter-one-click` | token | `ok()` — 200, silent | **open** → continues |

Plus the gate itself, `lib/auth/tenant.ts:217`, which is site thirteen and
becomes a caller of the new module rather than a copy of it.

**Four distinct throttle sentences** across the eight actions ("changes",
"attempts", "requests", and the newsletter-address one that is not of that
family at all). They are not normalised — that is prompt 126's equivalence rule
and it stands.

## What the implementation does

**One module owns the spend; every caller states its posture.** The module goes
in `lib/rate-limit/` — it is `server-only`, it touches Redis, and §6.3 puts it
there. Do **not** put it in `lib/validation/`.

The interface returns a **three-state discriminated outcome**, not a sentence:

- `allowed` — proceed
- `throttled` — carries `retryAfterSeconds` **and** the `formatRetry`-formatted
  string, so no caller calls `formatRetry` itself
- `unavailable` — the limiter could not be consulted

**Why three states rather than a sentence or a boolean.** A sentence fits the
eight actions and neither the routes nor the fail-open pair. A boolean collapses
`throttled` and `unavailable`, which is precisely the distinction the twelve
sites make and the one the current `catch` hides. Three states make the posture
a value the caller must handle, so a site that forgets `unavailable` is a
compile error rather than a silent fail-open — the same technique
`lib/rate-limit/index.ts`'s overload pair and `TenantGateOptions`'s
`throttled`-with-`limiter` requirement already use in this codebase.

**The `try`/`catch` moves inside the module and disappears from twelve sites.**
`unavailable` is what a caught limiter error becomes; the caller decides what it
means. Do not swallow anything, and do not log — `checkLimit`'s failure can
carry connection detail (§8.3 rule 2).

**`lib/auth/tenant.ts` adopts it too.** Its current `try`/`catch` at :216-228
becomes a call to the new module mapping `throttled` onto
`options.messages.throttled(...)` and `unavailable` onto `messages.failure`.
Its stage ordering — lock, then `authorize`, then the limiter last so a refusal
spends no token (:189-217) — must not change.

**Every one of the twelve keeps the behaviour it has today**, byte-for-byte in
its user-visible output:

- the four throttle sentence families stay exactly as written, per site;
- the two purge routes keep `503 limiter-unavailable`;
- `recalculate` and `unsubscribe` keep continuing, but now by naming the
  `unavailable` case and falling through **explicitly**, with the rationale
  comment kept and pointed at the new state;
- `unsubscribe` keeps returning 200 on throttle.

This is a **pure refactor of the spend**. If any sentence, status code or
posture changes, the implementation has exceeded its scope.

## Measurements this prompt must produce, and how

No number is eyeballed; each has a procedure.

| measurement | procedure |
| --- | --- |
| sites before | `grep -rn "checkLimit" app lib \| grep -v "^lib/rate-limit/"` — **12 outside the gate, 13 including it**; quote the output |
| `formatRetry` callers before | `grep -rn "formatRetry" app lib` — 9 call sites across 6 files today; quote it |
| `formatRetry` callers after | the same command; **expected: `lib/rate-limit/` only** |
| `try`/`catch`-around-`checkLimit` blocks removed | count before and after, per file |
| sentence equivalence | a per-site table: every throttle string and every limiter-error result, before and after, shown identical. **This is the check that the refactor is pure** |
| posture equivalence | the same table's last column — ten closed, two open, unchanged |
| prerender impact | see below |

## Prerender impact

**`none — no route changes` is the expected answer, and it must be verified, not
assumed** (§4, §8.1).

Every file in scope is `server-only` or a `"use server"` module or an
`app/api/*` route handler. **No client leaf is touched**, and no prerendered
page renders any file in scope. So:

- run `npm run build` and confirm the route table matches §8.1 — `/ /_not-found
  /about /careers /design-system /forgot-password /journal /reset-password
  /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6) and
  `/job-listing/[slug]` (3) as `●`, the workspace routes `ƒ`;
- the full two-build prerender diff is **not** required, and the reason must be
  stated rather than the step silently skipped;
- **if the implementation finds itself editing anything under
  `app/_components/`, it has left this prompt's scope** — stop and say so.

## Trust boundary

**No new request path, and no change to an existing one.** Every one of the
twelve sites keeps the same trigger, the same caller and the same authentication.

What crosses the boundary is unchanged: stage **a** BotID and stage **b** the
rate limit, then **c** the shared Zod parse, then **d** authorisation, then the
write (§10). **The refactor may not reorder them**, and specifically:

- the limiter must stay **after** the deletion lock and `authorize` in
  `lib/auth/tenant.ts`, so a refusal still spends no token;
- `newsletter-address` must stay **after** the parse, because it keys on the
  canonical lowercased address stage c produces (`app/_actions/newsletter.ts:105-112`);
- the key for `newsletter-address` and `newsletter-one-click` stays **hashed**
  inside `lib/rate-limit/` — the address and the token never reach Redis as
  themselves;
- every action must still return `{ ok: true } | { ok: false, error, fieldErrors? }`
  and must never throw to the client (§10 rule 2);
- the cron routes' `CRON_SECRET` check stays **before** the spend.

## Secrets and data

**No environment variable is read, added or changed.** No `.env.example` change,
no `NEXT_PUBLIC_*`, no model call.

**Nothing is logged, and this is the rule most at risk in this change.** The
twelve `catch` blocks being collapsed today log nothing; the module that
replaces them must log nothing either — not the caught error, not the
identifier, not the policy. The identifiers passing through it include an IP, a
user id, an email address and a live unsubscribe token (§8.3 rule 2, and the
prompt-78 incident at `docs/backend.md`). A `console.error(err)` added "just
while developing" is the failure mode; the module returns `unavailable` and says
nothing.

## Non-goals — what this prompt deliberately does not do

- **No change to any policy, window, prefix or key treatment.** `POLICIES` in
  `lib/rate-limit/policies.ts` is untouched. This prompt moves the *spend*, not
  the table prompt 126 landed.
- **No change to any user-visible sentence, status code or posture.** See the
  equivalence table above. Normalising the four throttle families is explicitly
  refused — prompt 126's equivalence rule stands.
- **No adoption of `lib/auth/tenant.ts`'s `authorize` hook at the nine sites
  that check the role inline.** That is a separate finding from the same review,
  recorded there, and it is a redesign of stage **d**, not of stage **b**.
- **Not candidates 2–6.** Candidate 4 (the public write path has no gate) is
  adjacent and tempting — four of these twelve sites are its subject — but it
  also owns BotID and IP resolution, and folding it in here would make one
  prompt out of two candidates. **The spend module this prompt builds is what
  candidate 4 would later call**, which is the dependency, not a reason to merge.
- **No widening of `vitest.config.mts`'s scope.** The new module touches Redis
  and is not pure, so it does not belong in `lib/{domain,validation}`.
- **No new test infrastructure**, no mock of Redis, and no e2e spec added.
- **No GSAP, no change to `SiteFooter` or `SiteNav`, no client leaf edited.**

## Checks to run

| check | expected |
| --- | --- |
| `npm run lint` | clean — quote the output |
| `npm run typecheck` | clean — quote the output |
| `npm test` | **318 passed, 13 files** is the baseline; nothing in scope is under `lib/domain/` or `lib/validation/`, so any change to it is a finding to explain, not a number to update silently |
| `npm run build` | exit 0, route table matching §8.1 |
| prerender diff | skipped, **with the reason stated** — see *Prerender impact* |
| `grep -rn "formatRetry" app lib` | `lib/rate-limit/` only |
| `grep -rn "checkLimit" app lib` | `lib/rate-limit/` and the new module only |
| `npm run test:e2e` | the full matrix. **Baseline is 110 passed / 12 skipped for Chromium + Firefox**; prompt 129 measured 107/3/12 under load and confirmed all three were flake by re-running the two specs alone (23 passed). A failure here must be triaged the same way — re-run the spec alone before calling it a regression |
| `npm run test:e2e:webkit` | prompt 129 **could not run this** — the pinned container had no outbound network that session. Attempt it; if it fails on infrastructure again, report that rather than claiming a pass (§12 rule 9) |

Every one of these is quoted from its own output. **Never claim a check passed
without running it** (§2, §12 rule 3).

## Where the result is recorded

**`docs/architecture.md`**, as a new dated section appended after the 18 Aug 2026
review, recording: the module and its three-state interface; the per-site
equivalence table; the before/after counts; and every check's real output.

**The candidate-1 record in the 18 Aug 2026 section must also be corrected** —
it repeats the scan's "cron x3 fail-open", and the truth is ten closed / two
open (§12 rule 8). Correct the line; do not append a contradiction beside it.

**Nothing is added to `AGENTS.md`.** No index row is needed and no new
site-wide invariant meets the front matter's cap rule. If the implementation
finds a line in it stale, correct that line in the same change.

Finish with §1 step 9 (how to exercise a limiter refusal locally) and step 10
(**commit to `main`, unprompted; do not push**).

## SKILLS USED

Listing is not loading — §4. Every skill below is invoked by the implementation
before it writes code, not merely named here.

| skill | what it is for |
| --- | --- |
| `upstash-ratelimit-js` | the limiter's real surface. `Ratelimit.limit(identifier)` takes a string and any string keys a bucket — verify before changing anything about how a key is derived or an error is caught |
| `upstash-redis-js` | the client's error surface, which is what `unavailable` is being derived from — confirm what a Redis failure actually throws rather than assuming |
| `nextjs` | Next 16.2's Server Action and Route Handler contracts, and `NextResponse` for the four `app/api/*` sites. §7.3's traps contradict most tutorials |
| `better-auth-best-practices` | `lib/auth/tenant.ts` is site thirteen; session and membership resolution around the spend it is adopting |
| `better-auth-security-best-practices` | the same file on the authorisation axis — §11.2 requires the role be re-read per request, and the limiter must stay after `authorize` |
| `vercel-functions` | the three cron routes and their `maxDuration`; confirm nothing in the refactor disturbs the Fluid Compute assumptions in §7.1 |
| `zod-docs` | only where a site's parse sits adjacent to the spend — `newsletter-address` must stay after stage c, and the ordering has to survive the edit |

`code-review` and `improve-codebase-architecture` are **not** listed: this prompt
is the implementation of a candidate they already produced, not another review.

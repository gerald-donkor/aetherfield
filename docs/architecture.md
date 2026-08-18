# Architecture — the review of 17 Aug 2026 and its remediation sequence

This file exists because the review that produced it was an HTML report in a
session scratchpad, and a scratchpad does not survive a `/clear`. Everything
below is transcribed from that report so a later session can resolve **which
candidate is next** without re-running the review.

**Taken:** 17 Aug 2026 · **against:** `2337ab1` · 158 commits · `main` ·
produced by the `improve-codebase-architecture` skill (`.agents/skills/`), whose
glossary supplies the terms used here — *module*, *seam*, *leakage*, *deep
module*, and the *deletion test* each candidate is scored against.

`AGENTS.md` §5.4 carries the one-line-per-candidate version of this table. This
file is the detail; that section is what a session reads first.

## Two inputs the review could not read

Quoting the report:

> No `CONTEXT.md` and no `docs/adr/` exist in this repository, and the
> `codebase-design`, `grilling` and `domain-modeling` skills are not installed.
> Domain nouns below are taken from `AGENTS.md` §5–§11; no candidate has been
> checked against an ADR, because there are none.

Creating either file is a separate decision the user has not made. Do not treat
their absence as a task.

## Where the review looked

> The last forty commits concentrate on the factor surface, the report and target
> modules, the workspace forms, and `lib/rate-limit`. Those paths pulled first.
> The marketing routes are settled and byte-stable (`AGENTS.md` §8.1) and were
> read only where a write-path leaf sits inside one.
>
> The data layer and the validation layer have already been deepened hard —
> `queryErrorScope`, `tenantVisible`, `SubmitResult`, `FormStatus` are all
> recent, deliberate collapses. Nothing below re-suggests one of those. What is
> left sits almost entirely in the write path — the stages of `AGENTS.md` §10
> that no module owns yet.

Every count in the report was produced by reading the files. **No check was run
by the review; nothing in it claims a build or test result.**

---

## The six candidates

### 1 · Map a `ZodError` once — *Strong · in-process* — **implemented, prompt 121**

`lib/validation/result.ts` · 10 client leaves · 7 action modules.

**Problem.** One shared schema produces a `ZodError` that seventeen modules turn
into `fieldErrors` five different ways, and the only named adapter is private to
one leaf.

> **Correction to the review, applied here (§12 rule 8).** There are **four**
> named adapters, not one, and the true inventory is **23 mapping sites across 17
> modules** — ten client leaves in **six** distinct shapes, **ten**
> `z.flattenError` call sites, and four named adapters. Two of those four
> implemented character-for-character the same rule for the same field type on
> opposite sides of the seam (`fieldErrorsFromIssues` in
> `app/_components/activity/custom-factor-form.tsx` and `customFactorFieldErrors`
> in `app/activity/actions.ts`). That is the strongest evidence for the
> candidate, not a detail. The review's own figures — "17 sites, 5 shapes", "12
> mapping sites" in prompt 121's first inventory — are both superseded by this
> line.

**Solution.** Promote `custom-factor-form.tsx`'s local `fieldErrorsFromIssues`
into `lib/validation/result.ts`, beside `SubmitResult` whose shape it produces.

**Wins**, as the review states them: leverage — one interface, 17 sites; the
first testable write-path unit; delete 1 local adapter and 4 loops; leaf and
action agree by construction; the interface shrinks to two arguments.

**Deletion test: concentrates.** The rule "the first issue on a path wins, keyed
by field" exists nowhere today; deleting the copies gives it one home. **§8.1
note:** the module must stay free of `server-only` and import nothing — three of
the ten leaves sit inside prerendered marketing routes.

*What prompt 121 actually built is recorded under **Prompt 121 — the record** at
the foot of this file.*

### 2 · The submit lifecycle is a module, not a habit — *Strong · in-process*

24 client leaves importing `NETWORK_ERROR` · `app/_components/form-status.tsx`.

The six stages each leaf copies today: clear message and errors → `safeParse`
and map issues (5 shapes) → `setPending(true)` → `await action(input)` → `!ok` →
`fieldErrors` + `error` → `catch` → `NETWORK_ERROR` (4 finally shapes) →
`<FormStatus />`. **The last stage was collapsed at prompt 105. The six above it
were not** — each leaf still owns four `useState` calls and its own
`try`/`catch`/`finally`.

**Problem.** §10's client half is a convention held by 24 copies, so it is
exactly as strong as the least careful one — the failure mode `FormStatus` and
`resolveMembershipForWrite` were both written to end.

**Solution.** One client-only module beside `form-status.tsx` owning the six
stages; the leaf supplies schema, action, fields and its own success copy. The
review sketches it as `useWrite(schema, action, FIELDS)` returning
`{ submit, pending, message, errors }`, with the 24 leaves keeping markup and
copy only — "each leaf keeps what genuinely varies: its fields, its success
sentence, its reset. Nothing that varies today is normalised away."

**Wins.** Locality — a lifecycle bug has one home; leverage — one interface, 24
sites; `pending` can no longer strand; testable without a browser; the interface
shrinks and the leaves absorb nothing.

> **Scope warning, verbatim.** `demo-request-dialog`, `subscribe-dialog` and
> `apply-dialog` live inside `/`, `/journal`, `/careers` and
> `/job-listing/[slug]` — §8.1 territory. Prerendered HTML must stay
> byte-identical, verified by the build diff in `docs/automation.md`, with the
> standing mask on `/`, `/journal` and `/careers`. Take candidate 1 first, then
> adopt this on the eight workspace leaves before the three marketing ones.

### 3 · One tenant gate that also spends the limiter — *Strong · local-substitutable* — **implemented, prompt 122**

`lib/auth/tenant.ts` · `app/{targets,reports,activity,account}/actions.ts`.

**Problem.** The seam was cut on what the function returns rather than what it
enforces, so the limiter half — security-relevant, fail-closed — is written four
more times outside the module that owns it. `resolveTenant()` returns ids only
and spends no limiter; `resolveMembershipForWrite()` returns membership and
spends one. `targets`, `reports`, `activity`'s commit path and `activity`'s
inline `stageImport` block each re-implement "spend the limiter, fail closed,
format the retry" against `resolveTenant()`.

**Solution.** Collapse the two into one gate taking an optional limiter and
returning the whole membership; callers wanting ids destructure them. The review
notes the two existing returns are the same value at different widths — the ids
*are* `membership.account.user.id` and `membership.organization.id`.

**Wins.** Locality — fail-closed lives once; a hardening reaches all 13 writes;
delete 3 helpers and 1 inline block; `formatRetry` keeps one caller; the
interface shrinks from 2 exports to 1.

**Deletion test: concentrates.** `tenant.ts`'s own docblock already records why
the seven copies were collapsed at prompt 98 — "security-relevant code in seven
copies is code where a hardening applied to one silently leaves six behind".
That argument covers the remaining four unchanged.

*Three of the figures above are wrong, and the corrections are argued under
**Prompt 122 — the record** at the foot of this file: there were **five**
re-implementations and not four, the writes a hardening reaches number **21**
and not 13, and `formatRetry` keeps **five** callers rather than one.*

### 4 · Cut `app/activity/actions.ts` along its three routes — *Worth exploring · in-process*

`app/activity/actions.ts` — 1512 lines, 11 exports, 3 owning routes ·
`lib/validation/emissions.ts` — 754 lines.

**Problem.** §6.3's colocation rule assumes one owning route; this module serves
three, and their message sets, limiters and resolve modes are interleaved rather
than separated.

**Solution.** Three action modules matching the three route trees — the split
`lib/db/factor-*` and `app/_components/activity/` already made below and above
it.

**Wins.** Locality — one route, one file; each message set has one reader;
matches the layers either side; 12 constants become 3 sets of 4.

> **Deletion test: weaker, and this is why it is not Strong.** A split relocates
> complexity rather than concentrating it, so it earns its place on locality
> alone. Do it after candidate 3, which removes about 100 lines of preamble from
> this file first and may change how the three parts want to divide.
> `lib/validation/emissions.ts` (754 lines) splits along the same three lines and
> should move in the same change or not at all.

### 5 · `lib/rate-limit/` — twenty wrappers over one call — *Worth exploring · ports & adapters* — **implemented, prompt 126**

`lib/rate-limit/index.ts` — 856 lines, 18 exported `check*Limit` functions.
**Corrected at prompt 126: there were twenty, not eighteen.** The review's count
predates `checkOrganizationDeletionLimit` (prompt 73) and
`checkInvitationResponseLimit` (prompt 63), both landed after 17 Aug 2026's
review and both counted in the 856-line total it cites.

**Problem.** Eighteen exports each forward four arguments to `consume()`.
Whether a key is hashed is a per-export decision spread over 400 lines, and
hashing is what keeps personal data out of Redis (§8.3 rule 2).

**Solution.** One `POLICIES` record carrying prefix, limit, window and key
treatment; one exported `checkLimit(policy, identifier)`. Docblocks move onto the
table's entries.

**Wins.** Every window readable at once; hashing becomes a declared field; the
interface shrinks 18 → 1; testable as a pure table.

> **Real cost, stated.** Named exports let a call site be wrong only by importing
> the wrong symbol; a policy key is a lookup and loses that.
> `checkNewsletterAddressLimit` also spends two windows in sequence, so the table
> needs a compound entry. And `resolveMembershipForWrite` currently takes a
> limiter function deliberately — its docblock says "the call site names the
> limiter it has always spent" — so candidate 3's gate would need to accept a
> policy instead. **Sequence this after 3, or the two fight.**

### 6 · One workspace boundary shell — *Worth exploring · in-process*

`app/{dashboard,targets,reports,submissions}/loading.tsx` and the four matching
`error.tsx`.

**Problem.** Eight near-identical boundary shells, and the copies have already
drifted: `WorkspaceNav` renders in `dashboard/loading.tsx` and in none of the
other three, with no comment giving a reason.

**Solution.** One shell in `app/_components/` taking the eyebrow, the heading,
the status line and the current nav item. Each boundary becomes three strings
and, for `error.tsx`, a reset handler.

**Wins.** The nav divergence gets decided; 189 lines become ~40; a ninth route
inherits the shell; no marketing route touched.

> **Read the divergence before collapsing it.** Whether the workspace nav should
> persist through a `loading.tsx` is a design question on a comp-measured site,
> not a refactor's to answer silently. The value here is that the shell forces
> the question; pick the answer with the user, then encode it. Smallest blast
> radius of the six — no server code, no prerendered route, no schema.

---

## The order, and the constraint behind each step

The review's recommendation is **1 → 3 → 2 → 4, 5, 6**, and its top line is
candidate 1: "the smallest change with the widest reach, and it touches no
server code, no schema and no prerendered markup."

| constraint | why |
| --- | --- |
| **1 before 2** | candidate 2 stands on candidate 1 — with the mapping already collapsed, the submit-lifecycle module has one fewer decision to make |
| **3 before 5** | they disagree about the limiter's interface. Candidate 3's gate takes a limiter *function*; candidate 5 replaces every limiter function with a *policy key*. Whichever lands second rewrites the other's signature |
| **3 before 4** | candidate 3 removes about 100 lines of preamble from `app/activity/actions.ts` and may change how the three parts want to divide |
| **4 moves `lib/validation/emissions.ts` with it, or not at all** | it splits along the same three lines |
| **6 needs a design answer from the user first** | whether `WorkspaceNav` should persist through a `loading.tsx` — today it does in `app/dashboard/loading.tsx` and in none of `targets`, `reports` or `submissions`. **This question is open.** Ask it before writing candidate 6's prompt; do not answer it inside a refactor |

**This is a plan. Nothing in it is ticked here** — which candidate is built is
resolved from `git log` and the repository (`AGENTS.md` §12 rule 5), and the
table below is appended to as prompts land, after the fact.

| candidate | prompt | landed |
| --- | --- | --- |
| 1 · map a `ZodError` once | 121 | 18 Aug 2026 |
| 2 · the submit lifecycle | 123, 124 | 18 Aug 2026 |
| 3 · one tenant gate | 122 | 18 Aug 2026 |
| 4 · cut `app/activity/actions.ts` | 125 | 18 Aug 2026 |
| 5 · `lib/rate-limit/` policies | 126 | 18 Aug 2026 |
| 6 · one workspace boundary shell | — | — |

---

## Prompt 121 — the record

`fieldErrorsFrom<TField>(error, fields)` in `lib/validation/result.ts`. Its
docblock carries the three rules and the two interface decisions; this section
carries what the equivalence check found.

### The two interface decisions

1. **The `error` parameter is structurally typed, not `import type { ZodError }`.**
   Erasure was verified as a non-issue — `isolatedModules` is on and TypeScript
   elides an `import type` unconditionally — so cost was never the argument. It
   stayed structural so the module keeps its stated "imports nothing" property,
   and because a parameter that cannot see an issue's `input` cannot leak a
   submitted email address or CV filename into a log line (§8.3 rule 2).
2. **`fields` accepts either a `readonly TField[]` or any record keyed by the
   fields**, so the six existing `NO_*_FIELD_ERRORS` constants pass straight
   through with no cast at 9 call sites.

Four runtime field lists were added, **each derived from its schema's `.shape`,
never restated**: `CUSTOM_FACTOR_FIELDS`, `FACTOR_IMPORT_FIELDS`,
`EDIT_FACTOR_SET_FIELDS` (`lib/validation/emissions.ts`) and
`FACTOR_MAPPING_FIELDS` (`lib/validation/activity.ts`). That `.shape` survives
`.superRefine()` was probed against the installed **Zod 4.4.3** rather than
recalled — the v3 habit says otherwise.

### Equivalence, per site

**All 23 sites reproduce today's rendered output.** The four divergences the
prompt named were each checked, and each is pinned by a test in
`lib/validation/result.test.ts` rather than argued:

| divergence | finding |
| --- | --- |
| **`z.flattenError` keys only by `path[0]`** (10 action sites) | every field those actions declare is top-level, so the prefix rule is a strict generalisation that changes nothing. Pinned by a test asserting `fieldErrorsFrom` equals `z.flattenError(...).fieldErrors[f]?.[0]` field-for-field on a real schema |
| **`factor-picker.tsx` used `path.includes(field)`** — any depth, any position | `factorMappingSchema`'s issues, including the two its `superRefine` adds, are single-segment. Pinned by a test that asserts the emitted path *is* `["scope2MarketBasis"]` before asserting the mapping |
| **`delete-organization-panel.tsx` ignored the path**, so a schema-level issue showed on `confirmSlug` | `deleteOrganizationSchema` emits no empty-path issue today, so the rendered text is unchanged. **The literal fallback was kept deliberately**, with a comment saying so — an empty-path issue belongs to no field, and this form has one control to say it against |
| **`\|\|=` in the four `for…of` leaves vs `??=` in the adapters** | these differ only for an empty-string message, and no schema in `lib/validation/` produces one. First-wins is preserved either way; pinned by a test that an empty first message wins rather than being treated as absent |

`z.flattenError` now has **no caller anywhere in the repository**, and the
`import * as z` it needed was removed from five action modules as a result.

### Two sites considered and deliberately left alone

- `app/activity/actions.ts:1066` — takes `issues[0]` and feeds
  `describeRowIssue(issue.path.join("."), issue.message)`. It keys a **CSV row
  number**, not a form field, and has a different output type.
- `app/activity/mappings/page.tsx:92` — `issues[0]?.message` for a search-param
  message. No field errors exist on that path.

### The test-scope change

`vitest.config.mts`'s `include` was widened from `lib/domain/**/*.test.ts` to
`lib/{domain,validation}/**/*.test.ts`, with the argument written into that
file's docblock. The existing docblock argued the narrow scope guards against
"tests that need a database or a browser"; `lib/validation/` is the one `lib/`
module already forbidden to be `server-only` or to read a secret (§6.3), so it is
as pure as `lib/domain/` and the guard is not weakened.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | 318 passed, 13 files; `lib/validation/result.test.ts` present in the run (15 tests), confirmed with `npx vitest list --filesOnly` |
| `npm run build` | route table unchanged — `/ /_not-found /about /careers /design-system /forgot-password /journal /reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) as `●` |
| prerender diff | pass — see below |
| `npm run test:e2e` | **110 passed, 12 skipped (4.0m)** across Chromium and Firefox. **WebKit did not run**: `scripts/playwright-webkit.sh` printed `Podman is required for WebKit on Arch Linux.` and `which podman` finds nothing. That is the standing environment gap `docs/backend.md` records against every prior E2E run, reported as a gap rather than as a pass — note the wrapper still exits 0, so the matrix's exit code is not evidence WebKit ran |

**The prerender diff, and why it is a pass.** Two-build method per
`docs/automation.md`: snapshot `.next/server/app`, `git stash push` the changed
files, rebuild, snapshot, `git stash pop` — `vitest.config.mts` and the new test
file were left unstashed on purpose, so they are present on both sides and cannot
skew the result. 21 prerendered HTML files compared, normalising only
`.next/BUILD_ID` and the CSS chunk name. 19 differed **solely in five shared JS
chunk filenames**, which are content-derived and expected to move when a shared
module's bytes change:

```
281v351mo4m3x -> 3l3695v-_-27j   (7 pages)
3fmym952vybtw -> 0kd61-nlegn7x   (7 pages)
1vwnkhaa6bkb0 -> 0vp3m2d8lemwq   (1 page)
04a9o0sj0po00 -> 0tlam85b7l2e_   (5 pages)
3p2xn5a50cdql -> 2ukzdc27d-z_0   (3 pages)
```

Substituting each base name for its new counterpart makes **all 21 files
byte-identical**, and the **chunk count per page is unchanged on every page** —
the script asserted the equal count before mapping, and the explicit
`grep -o '/_next/static/chunks/[A-Za-z0-9_-]*\.js'` comparison per page confirmed
no chunk was added or removed on a marketing route. So no markup, no copy and no
script moved. This comparison is HTML, not pixels, so the standing
`magick compare` mask warning on `/`, `/journal` and `/careers` does not apply to
it.

---

## Prompt 122 — the record

`resolveTenant(options)` in `lib/auth/tenant.ts` — one export where there were
two. Its docblock carries the ordering argument and the interface decisions;
this section carries the equivalence check, the measurements, and three
corrections to the review above.

### Three corrections to the review

1. **There were five re-implementations of the limiter half, not four.** The
   review named `app/targets/actions.ts`'s `consumeWriteLimit`,
   `app/reports/actions.ts`'s `consumeLimit`, `app/activity/actions.ts`'s
   `consumeCommitLimit` and `stageImport`'s inline block. It missed
   `app/account/actions.ts`'s `resolveOwnerForDeletion` — 45 lines
   re-implementing the session resolve, the signed-out / no-organisation split
   *and* the fail-closed limiter block, because it must **not** enforce the
   deletion lock. That constraint is real (restoring a locked organisation is
   the one thing a locked organisation may do), and it is why the gate takes a
   `lock` mode rather than hard-coding the lock.
2. **A hardening now reaches 21 writes, not 13.** Counted from the call sites:
   `resolveTenant` had 10 callers (targets 2, reports 3, activity 5) and
   `resolveMembershipForWrite` had 11 (activity 6, account 5). With
   `resolveOwnerForDeletion`'s two callers folded in, the gate has **23 call
   sites** across the four action modules, reached by **24 calls** — see
   `generateNarrative` below for the twenty-fourth.
3. **`formatRetry` keeps five callers, not one**, and one of them is a file the
   prompt expected to lose it. `app/_actions/{demo-request,newsletter,application}.ts`,
   `app/submissions/actions.ts` and `app/invitation/[id]/actions.ts` have no
   tenant to resolve and are untouched — but **`app/account/actions.ts` keeps
   its import too**, for `createOrganization`, which spends
   `checkOrganizationCreateLimit` against a session with no membership yet and
   is listed in the prompt's own "deliberately unchanged" section. So three
   tenant-path callers were removed (`targets`, `reports`, `activity`), not
   four, and the prompt was internally inconsistent on this point.

Measured, before and after:

```
before: app/{account,activity,invitation/[id],reports,submissions,targets}/actions.ts
        app/_actions/{application,demo-request,newsletter}.ts
        lib/{auth/tenant.ts,rate-limit/index.ts}
after:  app/{account,invitation/[id],submissions}/actions.ts
        app/_actions/{application,demo-request,newsletter}.ts
        lib/{auth/tenant.ts,rate-limit/index.ts}
```

### The four interface decisions, and how each fared

1. **The gate returns the membership *and* the two ids.** Survives as written.
   They are the same value at two widths, so all 23 call-site bodies below the
   preamble are untouched — the whole diff is in the preamble, which was the
   point.
2. **The limiter stays a function, not a policy key.** Survives. Candidate 5
   replaces every limiter function with a policy key and would rewrite this
   signature; nothing here pre-empts it.
3. **`throttled` is required exactly when `limiter` is passed, enforced by the
   signature.** Survives, and was **verified rather than asserted**: a probe
   module passing a limiter with a `throttled`-less message set was compiled
   and `tsc` rejected it with `TS2345 … Property 'throttled' is missing in type
   … but required`, then the probe was deleted. The mechanism is a two-member
   union with `limiter?: undefined` on the first member, which is also what
   makes `if (options.limiter)` narrow to the second.
4. **Order inside the gate: session → tenant → lock → `authorize` → limiter.**
   Survives, and it is what makes `resolveOwnerForDeletion`'s owner check
   collapse safely — see the equivalence table.

One decision the prompt did not anticipate: **`organizationLocked` stays
required even under `lock: "allow-locked"`, where it is unreachable.** Making it
conditional on the lock mode would cross a second axis into the union and give
four option shapes for no behavioural gain. The deletion pair passes
`MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED` with a comment saying it cannot be
reached.

### Equivalence, per site

Read off the before and after. **Every row is identical in all four columns.**
The rows are grouped where the sites are literally the same call; the site count
is given per row and totals 23.

| sites | limiter spent | sentences | lock | `authorize` |
| --- | --- | --- | --- | --- |
| `targets`: `createTarget`, `retireTarget` (2) | `checkTargetWriteLimit` | 4 + `TOO_MANY_WRITES` prefix, verbatim | enforced | none |
| `reports`: `createReport`, `deleteReport` (2) | `checkReportWriteLimit` | 4 + `TOO_MANY_WRITES` prefix, verbatim | enforced | none |
| `reports`: `generateNarrative`, stage b (1) | **none** | 4 | enforced | none |
| `reports`: `generateNarrative`, narrative spend (the 24th call) | `checkReportNarrativeLimit` | 4 + `TOO_MANY_DRAFTS` prefix, verbatim | enforced | none |
| `activity`: `stageImport` (1) | `checkActivityImportLimit` | 4 + "too many uploads", verbatim | enforced | none |
| `activity`: `updateImportMapping`, `commitImport`, `discardImport`, `recalculate` (4) | `checkActivityCommitLimit` | 4 + "too many requests", verbatim | enforced | none |
| `activity`: `setFactorMapping` (1) | `checkFactorMappingLimit` | `FACTOR_MAPPING_MESSAGES`, unchanged | enforced | none — the role check stays at stage d in the action body, as before |
| `activity`: `createCustomFactor`, `retireCustomFactor`, `editFactorSet`, `retireFactorSet` (4) | `checkFactorMappingLimit` | `CUSTOM_FACTOR_MESSAGES`, unchanged | enforced | none — role checks stay at stage d, as before |
| `activity`: `importCustomFactors` (1) | `checkFactorImportLimit` | `CUSTOM_FACTOR_IMPORT_MESSAGES`, unchanged | enforced | none |
| `account`: `inviteMember`, `cancelInvitation`, `removeMember`, `leaveOrganization` (4) | `checkInvitationWriteLimit` | `MEMBERSHIP_ERRORS` set, unchanged | enforced | none — role checks stay at stage d, as before |
| `account`: `setAlertEmailPreference` (1) | `checkAlertPreferenceLimit` | `ALERT_PREFERENCE_ERRORS` set, unchanged | enforced | none |
| `account`: `requestOrganizationDeletion`, `restoreOrganization` (2) | `checkOrganizationDeletionLimit` | `ORGANIZATION_DELETION_ERRORS` set + "too many attempts", verbatim | **not enforced — `allow-locked`** | **owner check, before the limiter** |

**The last row is the one the prompt said to argue.** `resolveOwnerForDeletion`
ran session → tenant → owner → limiter, and the gate runs session → tenant →
lock (skipped) → `authorize` → limiter. The owner refusal therefore still
precedes the token spend, which is the property that matters: a non-owner
probing the control cannot consume the owner's deletion budget. It was preserved,
so the prompt's fallback — leave that helper alone and say so — was not needed.

**One behavioural nuance, stated rather than glossed.** The old
`resolveTenant()` resolved the account first and the membership second; the old
`resolveMembershipForWrite()` resolved the membership first and consulted the
account only to tell signed-out from no-organisation apart. The gate keeps the
second shape, and the two are equivalent because `getCurrentMembership()` itself
calls `getCurrentAccount()`: a throwing session lookup throws out of the
membership call and lands in the same `failure` catch either way, and the
account is only re-read on a path where that lookup has already returned
without throwing.

**The one cost, and it is `generateNarrative`'s.** Its narrative limiter is
deliberately spent *after* the report is known to exist and to be this tenant's,
so a probe for a report that does not exist cannot consume the narrative budget.
Routing that spend through the gate therefore means a second gate call, and the
second call re-resolves the session and the membership — roughly three extra
queries on that path. It is paid deliberately: the alternative is keeping a
second inline fail-closed limiter block in `app/reports/actions.ts`, which is
the thing this candidate exists to remove, and the path it sits on then makes a
model call measured in seconds. Every sentence it can return is unchanged.

### Measured line counts

`wc -l`, before at `622c6b2` and after:

| file | before | after | delta |
| --- | --- | --- | --- |
| `lib/auth/tenant.ts` | 205 | 226 | +21 |
| `app/targets/actions.ts` | 189 | 182 | −7 |
| `app/reports/actions.ts` | 289 | 304 | +15 |
| `app/activity/actions.ts` | 1453 | 1428 | −25 |
| `app/account/actions.ts` | 760 | 757 | −3 |
| **total** | **2896** | **2897** | **+1** |

**So this candidate is not a line-count win, and the review never claimed it as
one.** Three helpers and one inline limiter block are gone; what replaced them
is one gate with a docblock arguing its order, three documented builders in
`app/reports/actions.ts` where there was one, and two more in
`app/activity/actions.ts`. The win is the one the review named — *locality*: the
fail-closed limiter exists once, and a hardening applied to it reaches all 21
authenticated writes instead of the ten that happened to call the
limiter-bearing sibling. Counting lines here would score the wrong thing.

Also removed: `MembershipResolution`, `TenantResolution` and
`resolveMembershipForWrite` from `lib/auth/tenant.ts`'s exports, and
`MembershipWriteMessages` renamed to `TenantWriteMessages` — the module no
longer has a "membership" function for the old name to refer to. Its one
importer is `app/activity/actions.ts`.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **318 passed, 13 files**, unchanged from prompt 121 — nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged, both sides of the comparison below |
| prerender diff | **21 of 21 prerendered HTML files byte-identical with only `.next/BUILD_ID` normalised** — see below |
| `npm run test:e2e` | **110 passed, 12 skipped (3.7m)** across Chromium and Firefox. **WebKit did not run**: `scripts/playwright-webkit.sh` printed `Podman is required for WebKit on Arch Linux.` That is the standing environment gap, reported as a gap and not as a pass — the wrapper still exits 0, so the matrix's exit code is not evidence WebKit ran |

**The prerender diff, and why it is the strongest form of pass.** Two-build
method per `docs/automation.md`: a `tar` of the working tree excluding `.next`,
`node_modules`, `.git`, `.agents` and `.claude` as the implementation side, and
`git archive HEAD` as the base, both with `node_modules` hard-linked in, built
under the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. The untracked prompt file
was copied into the base tree as well, since `prompts/` is inside Tailwind's
scan root and its absence on one side would move the CSS on its own.

The result needed **no chunk normalisation at all**, which is what the prompt
predicted and what a change touching no client module should produce:

- 21 HTML files each side, same set; **0 differ** with only `.next/BUILD_ID`
  normalised.
- One CSS chunk each side, **the same filename and the same 68,814 bytes**, and
  a rule-level diff of **0 added, 0 removed** — run after this record was
  written, per the standing trap that `docs/` is inside the scan root.
- The JS chunk filename sets are **identical**; nothing was added, removed or
  renamed.

The route table is unchanged on both sides, `/ /_not-found /about /careers
/design-system /forgot-password /journal /reset-password /sign-in /sign-up
/verify-email` as `○` and `/article/[slug]` (6) and `/job-listing/[slug]` (3) as
`●`. This comparison is HTML, not pixels, so the standing `magick compare` mask
warning on `/`, `/journal` and `/careers` does not apply to it.

**No unit test was added, and that is the decision.** `lib/auth/` sits outside
`vitest.config.mts`'s `include` and is `server-only`; widening the scope to a
module that reads a session and Redis is exactly what that scope exists to
prevent. Equivalence here is established by inspection — the table above — and
by the E2E matrix. Nothing proved it by test.

---

## Prompt 123 — the record

`app/_components/use-write.ts` — the six-stage submit lifecycle, collapsed from
26 hand-rolled copies across 21 files into one hook. **This is the workspace
half of candidate 2 only** — the three marketing dialogs
(`demo-request-dialog.tsx`, `subscribe-dialog.tsx`, `apply-dialog.tsx`) are
prompt 124's, per the review's own scope warning quoted above. Candidate 2 is
not complete until that prompt lands.

### The measured inventory, corrected

The review's description of this candidate said "5 shapes" for the parse stage
and "4 finally shapes." This session's count, from reading all 24 files that
imported `NETWORK_ERROR`:

- **24 files, 29 `catch` sites** — a file is not one submit path.
  `members-panel.tsx` has 4, `submissions/action-controls.tsx` and
  `delete-organization-panel.tsx` have 2–3 apiece, `report-controls.tsx` has 2
  components sharing one shape.
- Removing the three marketing dialogs (1 site each) left this prompt's scope:
  **21 files, 26 submit paths** — confirmed again mechanically at
  implementation time by counting `write.submit(` call sites, which also
  came to 26 across 21 files.
- **4 files hand-cleared `pending` on every branch** instead of using
  `try/finally`: `create-target-form.tsx`, `mapping-form.tsx`,
  `upload-form.tsx`, `factor-picker.tsx` (the review missed the last one —
  `pendingId` there is per-row, not a boolean, and every branch cleared it by
  hand for that reason).
- The singular/plural "Check the marked field(s) and try again." split, and
  every success sentence, were carried over **verbatim** — none were
  normalised.

### The interface decisions, and how each fared

1. **The review's literal `useWrite(schema, action, FIELDS)` sketch was not
   implemented.** Three things ruled it out, each confirmed by a real site:
   `updateImportMapping(importId, draft)` and `stageImport(FormData)` show the
   call signature is not uniform; `upload-form.tsx` and `mapping-form.tsx`
   hand-check required fields with no schema at all; `stageImport`'s
   `onSuccess` reads `result.importId` off the action's own result. `call` is a
   thunk instead — the leaf closes over whatever its own action needs, and
   `parse` is optional.
2. **`onSuccess`'s return value carries the settle stage**, and it is the one
   real addition to the review's shape: a plain `string` is the announced
   sentence (the common case, all but two of the 26 paths); `{ message, hold:
   true }` is `upload-form.tsx`'s one site, which deliberately holds `pending`
   across a `router.push`; `void` is `token-action.tsx`'s, whose success drives
   a separate `state` value rather than an announced sentence.
3. **`onSettled` is the second addition**, found adopting `report-controls.tsx`:
   `ReportAction` calls `router.refresh()` on both a successful and a refused
   draft (either changes the report's narrative status) but not on a
   network-error catch (nothing server-side changed to refresh from).
   `submit()`'s own boolean return could not express "ran, whichever way" — only
   "succeeded."
4. **`submit` resolves to a `boolean`, not `void`.** Four sites collapse an
   inline confirm state only on failure
   (`action-controls.tsx`'s `RemoveSubmissionControl`, `retire-target-control.tsx`,
   `members-panel.tsx`'s `RemoveMemberControl` and `LeaveControl`) — the review
   never named a way to observe that, and a boolean is the whole surface those
   four sites need.
5. **`invalid(fieldErrors, message)` is the non-Zod courtesy check.**
   `upload-form.tsx` and `mapping-form.tsx` hand-check file presence/size and
   required columns respectively; both produce field errors and a message
   without a `ZodError` ever existing, so they call `invalid()` directly rather
   than going through `submit`'s `parse` stage.
6. **`setMessage` and `setErrors` are exported**, against the prompt's own
   default of not exporting speculatively — justified by two recurring shapes,
   not one: arming/cancelling a confirm step clears or sets `message` outside
   any submit (six sites), and `create-target-form.tsx` / `factor-import-form.tsx`
   clear one field's error functionally, which `invalid`'s whole-object
   replacement cannot express.
7. **The `parse` type is structural** (`{ issues: readonly { path, message }[]
   }`), not `import type { ZodError }` — the same argument
   `lib/validation/result.ts` makes for `fieldErrorsFrom`: a parameter that
   cannot see an issue's `input` cannot leak a submitted value. Verified against
   the installed Zod that `.safeParse()` returns exactly this shape on `error`.

### The one rule read and refused, and why it survived contact

`rendering-usetransition-loading` (`vercel-react-best-practices`) argues for
`useTransition`'s `isPending` over a manual flag. `useState` was kept, and
adopting 26 sites confirmed both of the prompt's reasons were real, not
theoretical: `upload-form.tsx`'s held-pending case genuinely cannot be
expressed with `isPending`, which React owns; and a transition would have made
every one of the 26 sites' surrounding updates non-urgent, a behavioural change
the equivalence rule forbids. No render timing was measured — this is a
judgement, not a measurement (§12 rule 4).

### Divergences found and closed at adoption time

Three sites could not adopt `submit`'s own failure branch unmodified without
changing what was announced, because they read the failure message from
`fieldErrors` rather than `error`:

| site | original fallback | how it is expressed now |
| --- | --- | --- |
| `retire-set-button.tsx` | `result.fieldErrors?.setId ?? result.error` | `call` wraps `retireFactorSet` and substitutes `error` before returning, so `submit`'s own branch reads the corrected text |
| `retire-factor-button.tsx` | `result.fieldErrors?.factorId ?? result.error` | same wrapper pattern, on `retireCustomFactor` |
| `factor-set-form.tsx` | `result.fieldErrors?.setId ?? result.error` | same wrapper pattern, on `editFactorSet` |

Two sites read the *parsed input*, not the action's `{ ok: true }` result, in
their success sentence — `onSuccess` only sees the result, so the parsed value
is captured by the `call` closure and read back in `onSuccess`:

| site | what is read | why |
| --- | --- | --- |
| `create-organization-form.tsx` | `parsedData` (name, slug) | `createOrganization` resolves `{ ok: true }` with no payload; the settled panel renders what was submitted |
| `members-panel.tsx`'s `InviteForm` | `invitedEmail` | `inviteMember` resolves `{ ok: true }` with no `email`; the original read `parsed.data.email` |

One site's `pending` is per-row, not a single boolean — `factor-picker.tsx`'s
`FactorPicker` keeps its own `pendingId` state, set and cleared inside `call`'s
own `try/finally` (so a parse failure never touches it, matching the original:
no row-level pending state exists until the request is actually made). The
hook's own `pending` is unused there.

One site's `pending` is a union of *which* action is in flight, not a boolean —
`invitation-response.tsx`'s `InvitationResponse` keeps its own
`"accept" | "decline" | null` state, set inside `call` for the same reason.

`delete-organization-panel.tsx`'s `DeleteForm` runs its parse manually rather
than through `submit`'s `parse` stage, because its fallback message
(`"Type the identifier to confirm."`) and its second check (the typed
identifier against the organisation's slug) have no generic `submit` branch to
live in; both call `invalid()` directly, and `submit()` is used only for the
actual deletion request.

### Equivalence, per site

Read off the before and after, all 21 files. **Every row is identical in
message wording, field-error keys, reset behaviour and `finally` shape**,
except the seven rows above, which are recorded as arguable rather than
normalised.

| file | leaves | fields | notes |
| --- | --- | --- | --- |
| `app/submissions/action-controls.tsx` | `StaffRoleControl`, `RemoveSubmissionControl` | none | `ok` boolean collapses confirm on failure |
| `app/_components/targets/retire-target-control.tsx` | `RetireTargetControl` | none | `ok` boolean collapses confirm |
| `app/_components/activity/import-controls.tsx` | `ActivityImportControls` | none | `confirming` cleared unconditionally, as before |
| `app/_components/activity/recalculate-control.tsx` | `RecalculateControl` | none | — |
| `app/_components/activity/retire-set-button.tsx` | `RetireSetButton` | `setId` | `call` wraps the fallback message (above) |
| `app/_components/activity/retire-factor-button.tsx` | `RetireFactorButton` | `factorId` | `call` wraps the fallback message (above) |
| `app/_components/reports/report-controls.tsx` | `ReportAction` (2 callers) | none | `onSettled` runs `router.refresh()` |
| `app/_components/activity/factor-set-form.tsx` | `FactorSetForm` | `EditFactorSetField` | `call` wraps the fallback message (above) |
| `app/_components/activity/custom-factor-form.tsx` | `CustomFactorForm` | `CustomFactorField` | standard `parse` + `call` |
| `app/_components/targets/create-target-form.tsx` | `CreateTargetForm` | `TargetField` | `write.setErrors` functional update on "Use calculated figure" |
| `app/_components/activity/mapping-form.tsx` | `ActivityMappingForm` | `ActivityField` | `invalid()` for the required-column check |
| `app/_components/activity/upload-form.tsx` | `ActivityUploadForm` | `"file"` | `invalid()` ×2; `{ hold: true }` on success |
| `app/_components/activity/factor-import-form.tsx` | `FactorImportForm` | `FactorImportField` | `invalid()` ×2; `rowErrors` set inside `call` alongside the result |
| `app/_components/activity/factor-picker.tsx` | `FactorPicker` | `FactorMappingField` | per-row `pendingId`, set/cleared inside `call` (above) |
| `app/_components/newsletter/token-action.tsx` | `NewsletterTokenAction` | none | `onSuccess` returns `void`; drives local `state` |
| `app/_components/reports/create-report-form.tsx` | `CreateReportForm` | `ReportField` | standard `parse` + `call` |
| `app/_components/organization/create-organization-form.tsx` | `CreateOrganizationForm` | `CreateOrganizationField` | captured `parsedData` closure (above) |
| `app/_components/organization/delete-organization-panel.tsx` | `RestoreControl`, `DeleteForm` | none / `DeleteOrganizationField` | `DeleteForm`'s manual parse (above) |
| `app/_components/organization/members-panel.tsx` | `RemoveMemberControl`, `CancelInvitationControl`, `LeaveControl`, `InviteForm` | none / none / none / `InviteMemberField` | `ok` booleans on the first and third; captured `invitedEmail` closure on the fourth (above) |
| `app/_components/organization/invitation-response.tsx` | `InvitationResponse` | none | union `pending` state (above) |
| `app/_components/alerts/alert-preference-control.tsx` | `AlertPreferenceControl` | none | standard |

### Measured line counts

`wc -l`, before at `3ac8c64` and after, the 21 adopted files:

| | before | after | delta |
| --- | --- | --- | --- |
| 21 adopted files, summed | 4,114 | 3,865 | −249 |
| `app/_components/use-write.ts` | — | 214 | +214 |
| **net** | **4,114** | **4,079** | **−35** |

As at prompt 122, this is not the measure — the review's own win is locality,
not line count, and a hook with a 100-line docblock arguing seven judgement
calls is not a smaller artifact than the 26 copies it replaces. It is a single
one.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output (one real finding fixed first: `react-hooks/refs` on a ref mutated during render — resolved by not memoising `submit`, see the module's own comment) |
| `npm run typecheck` | clean, no output |
| `npm test` | **318 passed, 13 files**, unchanged from prompt 122 — nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged: `/ /_not-found /about /careers /design-system /forgot-password /journal /reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) as `●`, everything else `ƒ` |
| prerender diff | **21 of 21 prerendered HTML files byte-identical with only `.next/BUILD_ID` normalised, no chunk normalisation needed** — two-build method, `git stash push -u` on the 22 changed/new files then rebuild in place, matching this prompt's own prediction |
| `npm run test:e2e:local` (Chromium, Firefox) | First run: **109 passed, 12 skipped, 1 failed (5.4m)**. Re-run after the investigation below: **110 passed, 12 skipped, 0 failed (5.9m)** |
| `npm run test:e2e:webkit` | **Did not run — a different failure than the standing gap recorded at prompts 121 and 122.** Those found `which podman` empty; this session's `podman` container launched (its `/work/...` paths show the run reached the container), but failed inside it: `browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1234/…` — the pinned image's own setup fixture needs a Chromium the image does not carry, before WebKit itself ever runs. **Not investigated further or fixed**: out of this prompt's scope, and the container image is shared infrastructure this candidate does not own. Reported as a gap, corrected from the stale "Podman not installed" description rather than repeating it silently (§12 rule 8) |

**The one e2e failure, investigated rather than waved off (§12 rule 3).** It
failed once in the full run, on `action-controls.tsx`'s `StaffRoleControl` —
exactly the file this prompt touches first. Re-run 7× more on the adopted code:
2 further failures (3/8 total). The control: `git stash push -u` on all 22
changed/new files, rebuilding the *pre-adoption* code, run 8×: **5 failures**,
a higher rate on code this prompt never touched. The flake is in
`changeStaffRole`'s revalidation timing under `--repeat-each` load, pre-dating
this prompt, and adopting `useWrite` did not make it worse. Not filed as a
separate finding — no `docs/` file owns build-step-7's E2E suite, and
`docs/automation.md`'s standing warnings do not yet cover it.

**Two things this record states as unverified rather than invents (§12 rule
9).** No render-timing measurement backs the `useTransition` refusal above —
restated as a judgement. And whether the flake's root cause is specifically
`revalidatePath("/submissions")` racing the client `setMessage` is diagnosed by
elimination (baseline is worse, so this prompt did not introduce it), not by
tracing the actual race — that would be its own investigation, unprompted by
this candidate.

### Where this leaves candidate 2

The landed table's candidate-2 row is filled with `123` and today's date, and
marked **workspace half only** — the three marketing dialogs remain prompt
124's, per the scope warning this file already carries. Candidate 2 is not
complete until that prompt lands.

---

## Prompt 124 — the record

`use-write.ts` adopted on the three marketing dialogs
(`app/_components/lead/demo-request-dialog.tsx`,
`app/_components/newsletter/subscribe-dialog.tsx`,
`app/_components/application/apply-dialog.tsx`), closing out candidate 2. §8.1
territory throughout — the leaves live inside `/`, `/journal`, `/careers` and
`/job-listing/[slug]`, all prerendered — so the whole prompt is graded on the
prerender diff below, not on the equivalence table alone.

### The interface decision: `apply-dialog.tsx`'s merged `parse`

`applicationFieldsSchema` has no `cv` entry — the CV's rules live in the action
because a browser-declared `File.type` is attacker-controlled
(`lib/validation/application.ts`'s documented reason) — but `cv` is a rendered
field the courtesy check still needs to fail on. The prompt's proposed shape
survived unmodified:

```ts
parse: () => {
  const parsed = applicationFieldsSchema.safeParse(raw);
  const cvError = checkCv(file);
  if (!parsed.success || cvError || !file) {
    return {
      success: false as const,
      error: {
        issues: [
          ...(parsed.success ? [] : parsed.error.issues),
          ...(cvError ? [{ path: ["cv"], message: cvError }] : []),
        ],
      },
    };
  }
  return { success: true as const, data: { ...parsed.data, cv: file } };
},
```

Verified against `use-write.ts`'s structural `Issues` type and
`fieldErrorsFrom`'s first-wins rule rather than assumed: a synthetic
`{ path: ["cv"], message: cvError }` issue satisfies `Issues` exactly (a
`readonly PropertyKey[]` path and a `string` message — `zod-docs` skill
confirmed `.safeParse()`'s discriminated union carries this same shape on
`error`), and `cv` cannot collide with a Zod-declared field because the schema
declares none — the two issue lists are on disjoint field names by
construction, so first-wins never has to arbitrate between them. `npm run
typecheck` passing with no cast confirms the shape compiles as written.

### The two `write.reset()` substitutions, checked rather than assumed

The prompt flagged one candidate divergence in advance — `onClose`'s bare
`setPending(false)` becoming `write.reset()` — and asked that it be checked
against all three dialogs, not just `demo-request-dialog.tsx`. All three
`openDialog` functions already call `write.reset()` (or, before adoption,
cleared `message` and `errors` by hand) before the next `showModal()`, so none
of the three relies on `message` or `errors` surviving a close. The
substitution is behaviourally identical on all three, applied uniformly.

### Equivalence, per site

| file | fields | notes |
| --- | --- | --- |
| `lead/demo-request-dialog.tsx` | `DemoRequestField` (`NO_FIELD_ERRORS`) | standard `parse` + `call`; `call` composes `source` onto the parsed data exactly as before; GSAP hover/spin/fan untouched |
| `newsletter/subscribe-dialog.tsx` | `NewsletterField` | the simplest of the three — one field, no courtesy-check wrinkle, standard `parse` + `call` |
| `application/apply-dialog.tsx` | `ApplicationField` | merged `parse` above; `onFileChange`'s functional `cv` clear moved to `write.setErrors(...)` — the second real call site for that export, after `create-target-form.tsx`'s at prompt 123 |

Every user-visible sentence — the singular/plural fields message on each
dialog, each success sentence and body paragraph, and `apply-dialog.tsx`'s
role-line heading — is unchanged, confirmed by reading the JSX after adoption
rather than only the submit path.

### Measured line counts

`wc -l`, before (prompt 123's committed state) and after, the three dialogs:

| file | before | after |
| --- | --- | --- |
| `lead/demo-request-dialog.tsx` | 579 | 561 |
| `newsletter/subscribe-dialog.tsx` | 230 | 212 |
| `application/apply-dialog.tsx` | 402 | 408 |
| **total** | **1,211** | **1,181** |

`apply-dialog.tsx` grew by 6 lines despite the state removal — the merged
`parse`'s explanatory comment is longer than the code it replaced. As at
prompts 121–123, line count is not the measure; the win is one lifecycle
across all 24 write-path leaves now, not 21.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | 318 passed, 13 files — unchanged from prompts 122/123's baseline, nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged: `/ /_not-found /about /careers /design-system /forgot-password /journal /reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) as `●`, everything else `ƒ` |
| prerender diff | **21 of 21 byte-identical after chunk-name substitution** — two-build method (`git stash push` the three changed files, rebuild, `git stash pop`), normalising `.next/BUILD_ID`, the CSS chunk name and Server Action ids. 19 of 21 files differed solely in 5 shared JS chunk filenames (17 chunk names identical, 5 moved); substituting the 5 makes all 21 byte-identical, and the JS chunk **count** per page is unchanged on every page — no markup, no copy and no script moved |
| `npm run test:e2e` | Chromium + Firefox: **110 passed, 12 skipped (4.0m)** — same totals as prompt 123's re-run, all three dialogs exercised (`/` hero + CTA band, `/journal`'s subscribe band, `/careers`'s open-application card, a `/job-listing/[slug]` apply flow). **WebKit did not run** — the same gap prompt 123's record already found: `podman` launches the pinned container, but its own auth-setup fixture fails on `browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1234/…` before WebKit itself runs. Not a new finding; not investigated further here for the same reason prompt 123 gave — shared container infrastructure this candidate does not own |

### Where this leaves candidate 2

The landed table's candidate-2 row now reads `123, 124` with today's date, and
the "workspace half only" qualifier is dropped — **candidate 2 is complete**.

---

## Prompt 125 — the record

`app/activity/actions.ts`'s eleven exports, split along the three route trees
that owned them: the import flow kept the original file, and two new
`"use server"` modules — `app/activity/mappings/actions.ts` and
`app/activity/factors/actions.ts` — took `setFactorMapping` and the five
factor-management actions respectively.

### One correction to the prompt itself

The prompt file named `setChoiceFrom` **and** `stageRows` as the two private
helpers moving to `app/activity/factors/actions.ts`. Read from the file rather
than assumed, per the prompt's own instruction to confirm before moving
anything: `grep -n "stageRows\|setChoiceFrom" app/activity/actions.ts` showed
`stageRows` called only at the import flow's two sites — `stageImport` (was
line 373) and `updateImportMapping` (was line 477) — and never inside
`createCustomFactor`, `importCustomFactors`, `retireCustomFactor`,
`editFactorSet` or `retireFactorSet`. `setChoiceFrom` is called only inside
`importCustomFactors`. **`stageRows` stayed in `app/activity/actions.ts`**
with the import flow it actually serves; only `setChoiceFrom` moved to
`app/activity/factors/actions.ts`. The prompt's own warning — "a wrong guess
here is a silent behaviour change" — is exactly what this correction avoids:
following the prompt's literal text would have made `stageImport` and
`updateImportMapping` import a helper from a sibling route's action file for
no reason, and split it from the domain call (`coerceRow`) it wraps.

### A second, smaller correction: `lib/validation/emissions.ts`'s importer count

The prompt cited **25 importers**, measured at the 17 Aug 2026 review. Re-run
today (`grep -rl "validation/emissions" --include="*.ts" --include="*.tsx" .`,
excluding `node_modules`) returns **28**, of which **27** predate this prompt —
the review's figure had already drifted by two intervening prompts that added
`lib/domain/reports.ts` and `lib/validation/targets.ts` as importers, neither
part of this change. This prompt adds exactly **one**:
`app/activity/factors/actions.ts`, which needs the six factor-management
schemas and result types. `app/activity/mappings/actions.ts` is **not** an
importer of `emissions.ts` — `setFactorMapping` and its messages live entirely
on `lib/validation/activity.ts`'s `factorMappingSchema` /
`FACTOR_MAPPING_ERRORS` / `FACTOR_MAPPING_FIELDS`. `lib/validation/emissions.ts`
itself is untouched, confirming the "not touched" half of the prompt's
decision independent of the exact count.

### Per-export equivalence

All 11 original exports, their new file, and confirmation that every message
string, limiter and `revalidatePath` target is copied verbatim.

| export | new file | limiter | messages | `revalidatePath` targets |
| --- | --- | --- | --- | --- |
| `stageImport` | `app/activity/actions.ts` (unchanged) | `checkActivityImportLimit` | `IMPORT_MESSAGES`, verbatim | `/activity` |
| `updateImportMapping` | `app/activity/actions.ts` (unchanged) | `checkActivityCommitLimit` | `COMMIT_MESSAGES`, verbatim | `/activity/${id}` |
| `commitImport` | `app/activity/actions.ts` (unchanged) | `checkActivityCommitLimit` | `COMMIT_MESSAGES`, verbatim | `/activity`, `/activity/${id}` |
| `discardImport` | `app/activity/actions.ts` (unchanged) | `checkActivityCommitLimit` | `COMMIT_MESSAGES`, verbatim | `/activity`, `/activity/${id}` |
| `recalculate` | `app/activity/actions.ts` (unchanged) | `checkActivityCommitLimit` | `COMMIT_MESSAGES`, verbatim | `/activity`, `/activity/${importId}` (conditional) |
| `setFactorMapping` | `app/activity/mappings/actions.ts` (new) | `checkFactorMappingLimit` | `FACTOR_MAPPING_MESSAGES`, verbatim | `/activity`, `/activity/mappings` |
| `createCustomFactor` | `app/activity/factors/actions.ts` (new) | `checkFactorMappingLimit` | `CUSTOM_FACTOR_MESSAGES`, verbatim | `/activity/factors`, `/activity/mappings`, `/activity` |
| `importCustomFactors` | `app/activity/factors/actions.ts` (new) | `checkFactorImportLimit` | `CUSTOM_FACTOR_IMPORT_MESSAGES`, verbatim | `/activity/factors`, `/activity/mappings`, `/activity` |
| `retireCustomFactor` | `app/activity/factors/actions.ts` (new) | `checkFactorMappingLimit` | `CUSTOM_FACTOR_MESSAGES`, verbatim | `/activity/factors`, `/activity/mappings`, `/activity` |
| `editFactorSet` | `app/activity/factors/actions.ts` (new) | `checkFactorMappingLimit` | `CUSTOM_FACTOR_MESSAGES`, verbatim | `/activity/factors`, `/activity/mappings`, `/activity` |
| `retireFactorSet` | `app/activity/factors/actions.ts` (new) | `checkFactorMappingLimit` | `CUSTOM_FACTOR_MESSAGES`, verbatim | `/activity/factors`, `/activity/mappings`, `/activity` |

`tooManyChanges` is the one string duplicated across two files rather than
shared — `FACTOR_MAPPING_MESSAGES` (mappings) and `CUSTOM_FACTOR_MESSAGES`
(factors) both throttle on it, and the prompt's "no shared helper module for
three files this small" rule means each file restates the identical function
rather than importing it from the other.

### Measured line counts

```
before: app/activity/actions.ts                    1428 lines (1 file)
after:  app/activity/actions.ts                      595 lines
        app/activity/mappings/actions.ts              277 lines
        app/activity/factors/actions.ts               674 lines
                                                total 1546 lines (3 files)
```

The total grew by 118 lines even though nothing was rewritten — each new file
carries its own docblock, its own "BotID: absent" comment repeated at five
call sites (three in `factors/actions.ts`, one in `mappings/actions.ts`), and
its own copy of `tooManyChanges`. Per the prompt: no numeric target was set
beyond equivalence, and line count is not the measure here, matching prompts
121–124's own note on the same point.

### Call sites, confirmed after the change

```
$ grep -rl "activity/actions" app/_components/
app/_components/activity/mapping-form.tsx
app/_components/activity/upload-form.tsx
app/_components/activity/import-controls.tsx
app/_components/activity/recalculate-control.tsx
```

The four import-flow components — the ones the prompt said stay unchanged —
are the only remaining importers of the old path.

```
$ grep -rl "activity/mappings/actions\|activity/factors/actions" app/_components/
app/_components/activity/retire-set-button.tsx
app/_components/activity/factor-set-form.tsx
app/_components/activity/factor-import-form.tsx
app/_components/activity/custom-factor-form.tsx
app/_components/activity/factor-picker.tsx
app/_components/activity/retire-factor-button.tsx
```

All six moved call sites resolved to the correct new file — `factor-picker.tsx`
to `mappings/actions.ts`, the other five to `factors/actions.ts`.

### Deliberately unchanged, verified rather than assumed

- `app/activity/mappings/page.tsx` and `app/activity/factors/page.tsx` — neither
  imports `actions.ts` (or either new file) directly; both read through
  `lib/db/` as Server Components. Confirmed empty `grep` result.
- `app/api/cron/recalculate/sweep.ts`'s comment naming
  `app/activity/actions.ts` — still accurate: `recalculate` and
  `recalculateOrganization`'s other in-request caller both stayed in that file.
- `lib/validation/emissions.ts` — untouched; see the importer-count correction
  above.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | 318 passed, 13 files — unchanged from prompt 124's baseline, nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged: `/ /_not-found /about /careers /design-system /forgot-password /journal /reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) as `●`, `/activity`, `/activity/[importId]`, `/activity/mappings`, `/activity/factors` all `ƒ` as before |
| prerender diff | **all five static marketing pages, all six article pages and all three job-listing pages byte-identical** after normalising only `.next/BUILD_ID` (two-build method: `git stash push` the eight changed/new files, rebuild, snapshot, `git stash pop`, rebuild, diff). No JS-chunk-name substitution was even needed — unlike prompts 121–124, which touched shared client leaves reached from marketing routes, nothing under `app/activity/` is imported by any prerendered page's bundle, so the normalised HTML matched exactly with no further substitution |
| `npm run test:e2e:local` | Chromium + Firefox: **110 passed, 12 skipped (3.8m)**, including `reaches /activity`, `/activity/mappings`, `/activity/factors` and the factor-picker/factor-import/factor-set-lifecycle/market-based-scope-2/scope-2-grid-average-fallback specs that exercise all eleven moved actions end to end. **WebKit did not run** — the standing Podman/Playwright fixture gap prompts 122–124 already recorded, not investigated further here |

### Where this leaves candidate 4

The landed table's candidate-4 row now reads `125` with today's date.
Candidates 5 and 6 remain open — 5 depends only on candidate 3 (done) and is
unblocked; 6 is still waiting on the user's `WorkspaceNav`/`loading.tsx`
design answer recorded at line 229.

---

## Prompt 126 — the record

`lib/rate-limit/policies.ts`'s `POLICIES` record and `lib/rate-limit/index.ts`'s
`checkLimit(policy, identifier?)` replace twenty exported `check*Limit`
functions with one lookup. This section carries the equivalence check, the
measurements, the file-split decision, and one interface addition the prompt
did not anticipate.

### The measured inventory, re-verified at implementation time

Every count in the prompt was re-run against the file as it stood, per §12
rule 8, and all five matched exactly: `wc -l lib/rate-limit/index.ts` → 856;
`grep -c "^export async function check"` → 20; `limiter: check` gate sites →
14; direct `check*Limit(` sites → 12; importing files → 16 (15 under `app/`
plus `lib/auth/tenant.ts`). `app/activity/factors/actions.ts` holds five gate
sites, confirmed by reading the file rather than recounted from the prompt.

### The file-split decision

**Two files, as the prompt proposed** — `lib/rate-limit/policies.ts` (the
`RateLimitPolicy` union, the `POLICIES` record, every docblock, **no I/O, no
Redis import**) and `lib/rate-limit/index.ts` (`getRedis()`, `getLimiter()`,
`consume()`, the exported `checkLimit()` and `formatRetry()`, re-exporting
`RateLimitPolicy`). The split held up in practice — no docblock fought the
table shape, because each policy's prose already read as "here is the
judgement behind this entry" rather than as prose needing a home separate from
its constants. `policies.ts` imports only the `Duration` **type** from
`@upstash/ratelimit` (erased at compile time under `isolatedModules`, so no
runtime import crosses into the pure file), rather than hand-rolling the
`` `${number} ${Unit}` `` literal the prompt sketched — the SDK already exports
it, and restating it would drift the moment the SDK's own type changed.

Every existing import specifier stayed `…/lib/rate-limit`, so no call site's
module path changed — only what each imported from it.

### The two interface decisions, and one the prompt did not anticipate

1. **`newsletter-address`'s two stages are modelled in the table**, not as an
   `if` inside `checkLimit`. `checkLimit` walks a policy's `stages` in order and
   returns the first rejection without touching the next — exactly what
   `checkNewsletterAddressLimit` did inline at the old file's line 527, and its
   "a rejected double-click does not consume one of the three hourly sends"
   reasoning is preserved by the ordering rather than restated as a comment.
2. **`cron-sweep`'s missing identifier is enforced by an overloaded
   signature**, verified rather than assumed (below): one signature requires
   `identifier: string` for every policy but `"cron-sweep"`; a second takes
   `"cron-sweep"` alone.
3. **Not anticipated by the prompt: `TenantGateOptions["limiter"]` had to
   narrow to `Exclude<RateLimitPolicy, "cron-sweep">`, not the full
   `RateLimitPolicy`.** `lib/auth/tenant.ts`'s gate always calls
   `checkLimit(options.limiter, membership.account.user.id)` — it supplies an
   identifier unconditionally, because a tenant-scoped write always has a
   signed-in user id to key on. Left as the full `RateLimitPolicy`, that call
   failed to typecheck: `checkLimit`'s first overload excludes `"cron-sweep"`
   and its second takes no identifier, so a type that still included
   `"cron-sweep"` matched neither. The fix narrows the field at its
   declaration, which is a **stronger** result than the prompt asked for, not a
   weaker one — passing `"cron-sweep"` to `resolveTenant` is now a compile
   error at the gate's own call sites, not only inside `checkLimit`. Recorded
   here because a prompt file is a plan (§12 rule 5) and this is where the plan
   met the type checker.

### The `tsc`-rejection probes, run and deleted per the prompt's instruction

Three probe modules were written, compiled against the project's `tsconfig.json`,
confirmed to fail with the expected diagnostic, then removed — none survives in
the repository:

| probe | expected | got |
| --- | --- | --- |
| `checkLimit("cron-sweep", "x")` | `TS2345`, argument not assignable to the first overload's identifier-taking policy union | `TS2345: Argument of type '"cron-sweep"' is not assignable to parameter of type '"demo-request" \| … \| "submission-write"'` |
| `checkLimit("factor-mapping")` | `TS2345`, argument not assignable to the second overload's `"cron-sweep"`-only signature | `TS2345: Argument of type '"factor-mapping"' is not assignable to parameter of type '"cron-sweep"'` |
| `TenantGateOptions` with `limiter: "factor-mapping"` and no `throttled` | `TS2322`, object literal not assignable to the union | `TS2322: Type '{ messages: {...}; limiter: "factor-mapping"; }' is not assignable to type 'TenantGateOptions'` |

The first run also surfaced the interface addition above: before narrowing
`TenantGateOptions["limiter"]`, `lib/auth/tenant.ts:210` itself failed
`tsc -p tsconfig.json` with the same `TS2345` shape as probe 1 — a genuine
compile error in the gate, not a probe. It cleared once the field was narrowed
to `Exclude<RateLimitPolicy, "cron-sweep">`.

### Union narrowing, verified rather than assumed

`if (options.limiter)` still narrows `TenantGateOptions` to its
`limiter`-bearing member with `limiter` typed as
`Exclude<RateLimitPolicy, "cron-sweep">` (a non-empty string-literal union, so
truthiness narrowing behaves the same as it did for the function type it
replaces — no member of the union is `""`). Confirmed by the full-project
`tsc -p tsconfig.json` run reporting zero errors outside the three probes
above; `resolveTenant`'s body needed no edit beyond replacing
`options.limiter(membership.account.user.id)` with
`checkLimit(options.limiter, membership.account.user.id)`, which would not
compile if the narrowing had stopped working.

### The one new coupling, stated rather than smuggled

`lib/auth/tenant.ts` now imports `checkLimit` — a **value**, not only
`RateLimitPolicy`'s type — from `lib/rate-limit/`, where it previously imported
only `formatRetry` and the `RateLimitOutcome` type. Both modules stay
`server-only`, neither imports the other's caller, and no cycle is created:
`lib/rate-limit/` still imports nothing from `lib/auth/`. This is a real new
edge on the module graph, not a re-statement of the existing one, and it exists
because the gate now looks a policy up rather than invoking a function it was
handed.

### Twenty-policy equivalence, old constant against new table entry

Every value below was read from `lib/rate-limit/index.ts` as it stood before
this prompt (`git show HEAD:lib/rate-limit/index.ts`, prompt `44f6666`) and
compared against `policies.ts`'s `POLICIES` record. **All twenty are
identical** — limit, window and key treatment unchanged, and no Redis prefix
was touched.

| policy (= prefix) | old constants | new table entry | key |
| --- | --- | --- | --- |
| `demo-request` | `DEMO_REQUEST_LIMIT` 5, `_WINDOW` 1 h | 5, 1 h | plain |
| `newsletter-ip` | `NEWSLETTER_IP_LIMIT` 5, `_WINDOW` 1 h | 5, 1 h | plain |
| `newsletter-address` | burst 1/60 s, then 3/1 h | burst 1/60 s, then 3/1 h | hash |
| `newsletter-token` | `NEWSLETTER_TOKEN_LIMIT` 20, `_WINDOW` 1 h | 20, 1 h | plain |
| `newsletter-one-click` | `NEWSLETTER_ONE_CLICK_LIMIT` 10, `_WINDOW` 1 h | 10, 1 h | hash |
| `application` | `APPLICATION_LIMIT` 5, `_WINDOW` 1 h | 5, 1 h | plain |
| `organization-create` | `ORGANIZATION_CREATE_LIMIT` 10, `_WINDOW` 1 h | 10, 1 h | plain |
| `activity-import` | `ACTIVITY_IMPORT_LIMIT` 20, `_WINDOW` 1 h | 20, 1 h | plain |
| `activity-commit` | `ACTIVITY_COMMIT_LIMIT` 60, `_WINDOW` 1 h | 60, 1 h | plain |
| `factor-mapping` | `FACTOR_MAPPING_LIMIT` 30, `_WINDOW` 1 h | 30, 1 h | plain |
| `factor-import` | `FACTOR_IMPORT_LIMIT` 6, `_WINDOW` 1 h | 6, 1 h | plain |
| `target-write` | `TARGET_WRITE_LIMIT` 30, `_WINDOW` 1 h | 30, 1 h | plain |
| `report-write` | `REPORT_WRITE_LIMIT` 20, `_WINDOW` 1 h | 20, 1 h | plain |
| `report-narrative` | `REPORT_NARRATIVE_LIMIT` 10, `_WINDOW` 1 h | 10, 1 h | plain |
| `alert-preference` | `ALERT_PREFERENCE_LIMIT` 30, `_WINDOW` 1 h | 30, 1 h | plain |
| `organization-deletion` | `ORGANIZATION_DELETION_LIMIT` 10, `_WINDOW` 1 h | 10, 1 h | plain |
| `invitation-write` | `INVITATION_WRITE_LIMIT` 20, `_WINDOW` 1 h | 20, 1 h | plain |
| `invitation-response` | `INVITATION_RESPONSE_LIMIT` 30, `_WINDOW` 1 h | 30, 1 h | plain |
| `cron-sweep` | `CRON_SWEEP_LIMIT` 6, `_WINDOW` 1 h | 6, 1 h | constant `"sweep"` |
| `submission-write` | `SUBMISSION_WRITE_LIMIT` 30, `_WINDOW` 1 h | 30, 1 h | plain |

Cross-checked mechanically, not only read by eye: the 21 distinct Redis prefix
strings (20 policies, `newsletter-address` contributing two) extracted from the
old file's `consume("…", …)` call sites and from `policies.ts`'s `prefix:`
fields were diffed as sorted sets and found identical.

### Call sites, confirmed after the change

- `grep -rn "check[A-Za-z]*Limit(" app lib | grep -v lib/rate-limit/` → **13
  matches, every one `checkLimit(`** — the intended zero-*named*-wrapper result
  under a pattern that also matches the new function's own name; no
  `checkXLimit(` survives anywhere in `app/` or `lib/`.
- `grep -c "^export async function" lib/rate-limit/index.ts` → **1**
  (`checkLimit`'s implementation signature; its two overload declarations are
  `export function`, not `export async function`, and `formatRetry` is sync),
  down from **20** — confirmed against `git show HEAD:lib/rate-limit/index.ts`,
  matching the corrected twenty-wrapper count above rather than the review's
  eighteen.
- The 14 gate sites now read `limiter: "<policy>"`; the 12 direct sites now
  read `checkLimit("<policy>", identifier)`, and the three cron routes read
  `checkLimit("cron-sweep")`. Two prose docblock references to a since-removed
  function name (`app/activity/mappings/actions.ts:110`,
  `app/activity/factors/actions.ts:107,240`) were also updated, since a comment
  naming a symbol that no longer exists is exactly what §12 rule 1 says not to
  leave standing.

### Measured line counts

```
before: lib/rate-limit/index.ts                    856 lines (single file)
after:  lib/rate-limit/index.ts                     147 lines
        lib/rate-limit/policies.ts                  511 lines
        total                                        658 lines
```

The total fell rather than grew despite the added overload signatures and the
new coupling documentation, because twenty near-identical five-line function
bodies (`export async function checkXLimit(id) { return consume("x", X_LIMIT,
X_WINDOW, id); }`) collapsed into one 20-entry record plus one loop.

### Checks

| check | result |
| --- | --- |
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output — confirmed separately with a bare `npx tsc --noEmit -p tsconfig.json` before and after the `TenantGateOptions` narrowing fix, isolating that one error from the rest of the change |
| `npm test` | 318 passed, 13 files — unchanged from prompt 125's baseline; nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged: `/ /_not-found /about /careers /design-system /forgot-password /journal /reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) as `●`, every authenticated route `ƒ` as before |
| prerender diff | **all 21 prerendered files byte-identical** after normalising `.next/BUILD_ID` and the two chunk-name patterns (two-build method: `git stash push --include-untracked` the 19 changed/new files, rebuild, snapshot, `git stash pop`, rebuild, diff). 19 of 21 pages differed only in shared JS chunk filenames before normalising — the same shape prompt 121 recorded — with equal chunk counts per page on both sides confirmed before substitution |
| `npm run test:e2e` / `test:e2e:local` | Chromium + Firefox: **110 passed, 12 skipped**, on a clean rerun. One earlier run in this session recorded a single flaky failure on `submissions.spec.ts`'s staff-grant test (`toHaveText` timed out on a still-in-flight "Updating…" button) after the suite had already been run twice in quick succession against the same live Neon/Upstash instances; re-run alone it passed in 2.1m, and the full matrix re-run clean passed 110/110, so this is recorded as session-local flake under load, not a regression, per §12 rule 4 (a judgement, not a re-run into silence). **WebKit did not run**: the same pinned-container `browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1234/…` gap prompts 122–125 already recorded, not investigated further here, exactly as the prompt anticipated |

### Where this leaves candidate 5

The landed table's candidate-5 row is filled with `126` and today's date. Five
of six candidates are now landed — 1, 2, 3, 4 and 5. **Candidate 6 remains the
only open one**, still waiting on the user's `WorkspaceNav`/`loading.tsx`
design answer recorded at line 229; nothing in this prompt bears on it.

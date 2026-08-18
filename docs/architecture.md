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

### 3 · One tenant gate that also spends the limiter — *Strong · local-substitutable*

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

### 5 · `lib/rate-limit/` — 18 wrappers over one call — *Worth exploring · ports & adapters*

`lib/rate-limit/index.ts` — 856 lines, 18 exported `check*Limit` functions.

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
| 2 · the submit lifecycle | — | — |
| 3 · one tenant gate | — | — |
| 4 · cut `app/activity/actions.ts` | — | — |
| 5 · `lib/rate-limit/` policies | — | — |
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

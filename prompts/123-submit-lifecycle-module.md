# 123 — The submit lifecycle is a module, not a habit (candidate 2, workspace half)

## Scope, and why it is next

**Architecture candidate 2** — `docs/architecture.md`, "2 · The submit lifecycle
is a module, not a habit" (*Strong · in-process*). The review of 17 Aug 2026
recommends **1 → 3 → 2 → 4, 5, 6**, and both of candidate 2's predecessors are
committed:

| candidate | prompt | commit |
| --- | --- | --- |
| 1 · map a `ZodError` once | 121 | `622c6b2` |
| 3 · one tenant gate | 122 | `3ac8c64` |

Candidate 2's only stated dependency is candidate 1 — "with the mapping already
collapsed, the submit-lifecycle module has one fewer decision to make"
(`docs/architecture.md`, the constraint table). That is `fieldErrorsFrom` in
`lib/validation/result.ts`, and it is in place. Candidates 4 and 5 both sequence
*after* 3 but the review ranks them *Worth exploring*, below candidate 2's
*Strong*; candidate 6 is blocked on an open design question the review says must
be put to the user first. So candidate 2 is next, unambiguously.

### This prompt takes the workspace half only, and that is the review's own instruction

`docs/architecture.md` carries this **verbatim scope warning** under candidate 2:

> `demo-request-dialog`, `subscribe-dialog` and `apply-dialog` live inside `/`,
> `/journal`, `/careers` and `/job-listing/[slug]` — §8.1 territory. Prerendered
> HTML must stay byte-identical, verified by the build diff in
> `docs/automation.md`, with the standing mask on `/`, `/journal` and
> `/careers`. Take candidate 1 first, then adopt this on the eight workspace
> leaves before the three marketing ones.

So this prompt builds the module and adopts it across the **21 non-marketing
leaves**, and the **three marketing dialogs are a non-goal**, deferred to prompt
124. That splits one candidate across two prompts, against AGENTS.md §5.4's
"one prompt covers one candidate" — **stated here rather than done quietly**
(§12 rule 8). The reason is the one the review gives: with the marketing dialogs
out, this change touches no module any prerendered route imports, so its
prerender impact is *none* and the byte-stability question is answered by
construction rather than by a diff that must be argued. Candidate 2 is not
complete until prompt 124 lands, and `docs/architecture.md`'s landed-table row
for candidate 2 must say so.

## Reference material read for this prompt

By path, all read this session:

- `docs/architecture.md` — the whole file; candidate 2 at lines 83–114, the
  order and its constraint table at 217–233, the landed table at 235–243.
- `AGENTS.md` §6.2, §8.1, §8.2, §10 — the write path this module is the client
  half of.
- `lib/validation/result.ts` — `SubmitResult`, `NETWORK_ERROR`,
  `fieldErrorsFrom`, and the `FieldIssues` structural type.
- `app/_components/form-status.tsx` — the stage already collapsed, at prompt
  105, and the docblock arguing why it is not in `primitives.tsx`.
- The leaves read in full: `app/_components/activity/recalculate-control.tsx`,
  `app/_components/reports/create-report-form.tsx`,
  `app/_components/targets/create-target-form.tsx`,
  `app/_components/activity/upload-form.tsx`,
  `app/_components/activity/mapping-form.tsx`.
- The leaves profiled by grep (state counts, `try`/`catch`/`finally` shapes):
  the remaining 19.
- `.claude/skills/vercel-react-best-practices/rules/rendering-usetransition-loading.md`
  — read, and deliberately **not** applied; see "The one rule read and refused".

## The measured inventory

Produced this session by reading the files, not recalled. **Re-derive every
figure at execution time before changing anything** and correct this section in
`docs/architecture.md` if it has moved (§12 rule 8) — prompt 121 and prompt 122
each found the review's counts wrong, and this prompt's counts are equally
subject to that.

Commands used:

```bash
grep -rln "NETWORK_ERROR" app/ lib/
grep -c "NETWORK_ERROR" <each>          # minus 1 for the import line = catch sites
grep -rhoP '"Check the marked[^"]*"' app/ | sort | uniq -c
```

- **24 client leaves import `NETWORK_ERROR`** (25 files match, the 25th being
  `lib/validation/result.ts`, which declares it). The review said 24; it is
  right.
- **29 `catch` sites across those 24 files** — a file is not one submit path.
  `members-panel.tsx` has 4, `submissions/action-controls.tsx` and
  `delete-organization-panel.tsx` have 3 apiece counted by `NETWORK_ERROR`
  references, `report-controls.tsx` has 2 components.
- Removing the three marketing dialogs (1 site each) leaves this prompt's scope:
  **21 files, 26 submit paths.**
- **The `finally` shape genuinely varies.** 19 files use `try/catch/finally`;
  **4 clear `pending` on every branch by hand instead** —
  `create-target-form.tsx`, `mapping-form.tsx`, `upload-form.tsx`,
  `factor-picker.tsx`. That is not sloppiness in at least one case:
  `upload-form.tsx` carries a comment saying pending is **held deliberately**
  across `router.push`, because "re-enabling the button first invites a second
  upload of the same file". **The module must be able to express that hold**, or
  adopting it at that site is a behaviour change.
- **The client-side "the fields are wrong" sentence exists at 24 sites in 2
  shapes** — `"Check the marked field and try again."` × 9 and
  `"Check the marked fields and try again."` × 13, plus the two constants
  `REPORT_ERRORS.fields` and `TARGET_ERRORS.fields` in `lib/validation/`. The
  singular/plural split is **correct per form** (one control versus several) and
  is **not to be normalised** — the module takes the sentence as a parameter.
- **No leaf uses `useTransition`, `startTransition` or `useActionState`.** Every
  one of the 26 paths is `useState` + `async` handler. Verified by grep.

## The module to build

`app/_components/use-write.ts` — beside `form-status.tsx`, for the reason that
file's docblock already gives: it needs React state, and `primitives.tsx` has no
`"use client"` and every primitive in it is stateless.

The review sketches `useWrite(schema, action, FIELDS)`. **That sketch does not
fit the measured sites and must not be implemented literally**, for three
reasons found by reading them:

1. **The action's signature is not uniform.** `createReport(input)` takes parsed
   data; `updateImportMapping(importId, draft)` takes two arguments;
   `stageImport(body)` takes a `FormData`; `leaveOrganization()` takes none;
   `recalculate(importId)` takes a nullable id. A hook that owns the *call* has
   to own all five shapes. It should own the *invocation*, taking a thunk.
2. **Not every path parses with a schema.** `upload-form.tsx` hand-checks file
   presence and size; `mapping-form.tsx` hand-checks required columns. Both
   produce field errors and the fields sentence without a `ZodError` existing.
3. **Some success handlers read the result.** `stageImport` returns
   `{ ok: true, importId }` and the leaf navigates with it, so the success
   callback must receive the narrowed success result, not `void`.

The shape to implement, subject to the equivalence rule below:

```ts
const write = useWrite({ fields: REPORT_FIELDS, fieldsMessage: REPORT_ERRORS.fields });

await write.submit({
  parse: () => createReportSchema.safeParse({ title }),   // optional
  call: (data) => createReport(data),
  onSuccess: () => {
    setTitle("");
    return "Report built. It appears below with its figures.";
  },
});
```

It owns exactly the six stages the review names, and nothing else:

| stage | what the module does |
| --- | --- |
| clear message and errors | `setMessage("")`, `setErrors(empty)` |
| parse and map issues | runs `parse`, and on failure `fieldErrorsFrom(error, fields)` + `fieldsMessage`, then returns without setting pending |
| `setPending(true)` | after the parse gate, never before — this is the order all 26 sites already have |
| `await call(data)` | the thunk |
| `!ok` | `setErrors(result.fieldErrors ?? empty)`, `setMessage(result.error)` |
| `catch` | `setMessage(NETWORK_ERROR)` |
| `finally` | `setPending(false)` **unless the success handler asked to hold** |

Required surface beyond `submit`:

- `pending`, `message`, `errors` — read by the leaf's markup and `FormStatus`.
- `invalid(fieldErrors, message)` — the non-Zod courtesy check
  (`upload-form`, `mapping-form`).
- `reset()` — `subscribe-dialog` and the confirm-step controls clear their state
  on close; this must exist even though the dialogs are out of scope here,
  because `delete-organization-panel` and the confirm controls need it.
- `setMessage` / `setErrors` — only if a site genuinely writes them outside a
  submit. **Do not export them speculatively**; export them only if adoption
  proves a site needs them, and say which.
- A way for `onSuccess` to hold pending, for `upload-form`'s navigation.

**Typing constraints:**

- `fields` accepts `readonly TField[]` *or* a record keyed by them — the same
  two forms `fieldErrorsFrom` already accepts, so the six `NO_*_FIELD_ERRORS`
  constants pass straight through.
- `parse`'s return is typed structurally as
  `{ success: true; data: T } | { success: false; error: FieldIssues }`, **not**
  `import type { ZodSafeParseResult }`. `lib/validation/result.ts` already made
  this decision and wrote the argument into its docblock: a parameter that
  cannot see an issue's `input` cannot leak a submitted email address or CV
  filename (§8.3 rule 2). Verified this session against the installed Zod that
  `.safeParse()` returns a discriminated union (`zod-docs` skill, "API notes
  worth checking rather than recalling").
- `call` is generic over its result so `onSuccess` receives the narrowed
  `{ ok: true, … }` including any extra payload.

### The one rule read and refused

`rendering-usetransition-loading` in the `vercel-react-best-practices` skill
says to prefer `useTransition`'s `isPending` over a manual `useState` loading
flag. **This prompt keeps `useState`, deliberately**, and the module's docblock
must say so with the reason:

1. This is an equivalence refactor across 26 sites. A transition makes the
   surrounding state updates non-urgent, which changes *when* React commits
   them, and that is a behavioural change 26 times over for a rule the skill
   itself marks **impact: LOW**.
2. `upload-form.tsx` deliberately holds pending across a `router.push`.
   `isPending` is owned by React and cannot be held.

This is a **judgement, not a measurement** — no render timing was taken (§12
rule 4).

## The equivalence rule this prompt is graded on

**Adopting the module must change no rendered output and no observable
behaviour at any of the 26 sites.** The method is prompt 121's and prompt 122's,
and it is the deliverable as much as the module is:

1. Before touching a leaf, write down its six stages as they are — the exact
   sentences, the reset behaviour, the `finally` shape, whether pending is held.
2. After adoption, diff that against what the module produces.
3. **Every divergence is either eliminated or recorded in `docs/architecture.md`
   with the argument for why it is safe** — the per-site equivalence tables at
   prompt 121 and prompt 122 are the format.
4. Nothing that varies today is normalised away. Specifically: the
   singular/plural fields sentence stays per-site, each success sentence stays
   verbatim, each `FormStatus` prop set stays as it is, and each leaf keeps its
   own reset.

**If a leaf cannot adopt the module without changing behaviour, leave it
unadopted and say which and why** (§12 rule 9). A partial adoption reported
honestly is the correct outcome; a normalised sentence is not.

## Expected impact

- **New:** `app/_components/use-write.ts`.
- **Changed:** 21 client leaf files, 26 submit paths.
- **Unchanged:** every Server Action, every schema, `lib/validation/result.ts`,
  `app/_components/form-status.tsx`, the database, every route's data.
- Line count is **not** the measure here, exactly as at prompt 122 — the win the
  review names is locality: "a lifecycle bug has one home" and "`pending` can no
  longer strand". Report the `wc -l` delta as a fact, not as the result.

### Prerender impact

**`none — no route changes`, and it must be verified rather than assumed.** The
21 leaves in scope are all rendered by authenticated or dynamic workspace routes
(`/dashboard`, `/activity/*`, `/targets`, `/reports`, `/submissions`,
`/account`, `/invitation/[id]`, `/newsletter/*`). The three leaves that sit
inside prerendered marketing routes are the three marketing dialogs, and they
are out of scope. The auth routes' forms (`app/_components/auth/*`) do not
import `NETWORK_ERROR` at all — they call Better Auth's client, not a Server
Action — so `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` and
`/verify-email` are untouched too. Verified by grep this session.

The verification is still the full one: `npm run build`, confirm the route table
(`/ /_not-found /about /careers /design-system /forgot-password /journal
/reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6)
and `/job-listing/[slug]` (3) as `●`), then the two-build prerender diff per
`docs/automation.md` — including its traps at "Two more prerender-diff traps,
found at prompt 105", "The build id appears in the flight payload too", "Chunk
names and Server Action ids are per-build too — normalise both", "Tailwind v4
scans prose, and an English word can ship as CSS", and "Two traps in building
the baseline somewhere else, found at prompts 115-120". **Read those sections
before running the diff.**

The expected result is prompt 122's, not prompt 121's: **21 of 21 HTML files
byte-identical with no chunk normalisation needed**, because no module a
prerendered route imports changes. If chunk names move, that is a finding to
investigate, not to normalise away.

### Trust boundary

**Nothing changes.** This is the client half of §10 only. Every stage that
enforces anything — BotID, the rate limit, the server-side parse, the tenant
gate, the write — is in the Server Actions, and no action is touched. The
client-side parse this module runs is what §6.2 calls it: "a courtesy to the
user; it is not a check". The module must not be given any power to skip the
server call, and it stays out of `lib/` because it is a component-layer hook.

### Secrets and data

**No environment variable is read, and none is added.** The module handles
submitted form values in memory in the browser and **must not log anything** —
§8.3 rule 2, the same reason `form-status.tsx`'s docblock ends with "Nothing
here logs." Add that line to this module's docblock too. The structural `parse`
type is the type-level half of the same rule.

## Non-goals

- **The three marketing dialogs** — `demo-request-dialog.tsx`,
  `subscribe-dialog.tsx`, `apply-dialog.tsx`. Prompt 124, per the review's own
  scope warning. Do not touch them, not even the import ordering.
- **The auth forms** — they are a different lifecycle (Better Auth's client, not
  a Server Action) and are not in the candidate.
- **Candidates 4, 5 and 6.** In particular do not touch `lib/rate-limit/` or
  split `app/activity/actions.ts`; candidate 5 would fight this change's
  neighbours and is sequenced after 3, not after 2.
- **Normalising any user-visible sentence**, the singular/plural fields message
  included. This is a refactor, not a copy pass.
- **`useTransition` / `useActionState` adoption.** See above.
- **Restyling anything.** No `FormStatus` prop, no class string, no markup.
- **Widening `vitest.config.mts`'s `include`.** `app/` is not `lib/domain/` or
  `lib/validation/`, and a hook needs a renderer to test — see below.

## Tests

**A unit test for this hook is out of scope, and that is a decision to state
rather than a gap to hide.** `vitest.config.mts` scopes the run to
`lib/{domain,validation}/**/*.test.ts`, and prompt 121's docblock argument for
widening it was that `lib/validation/` is as pure as `lib/domain/` — no
database, no browser. A React hook needs a renderer, which is exactly what that
scope exists to keep out, and no renderer is installed. The review's claim that
the module is "testable without a browser" is true of the *design* and not of
this repository's current test setup; **say so in `docs/architecture.md` rather
than claiming the win**. Equivalence here is established by the per-site tables
and by the E2E matrix, which does exercise these forms.

## Checks to run (AGENTS.md §2)

Run all of these and quote the exact output; never claim a pass without it
(§12 rule 3).

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | unchanged from the 318 passed / 13 files at prompt 122 — nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged, as listed above |
| prerender diff | 21 of 21 byte-identical, no chunk normalisation |
| `npm run test:e2e` | Chromium and Firefox. **WebKit will not run** — `scripts/playwright-webkit.sh` needs Podman, which is not installed, and the wrapper still exits 0. Report that as the standing environment gap, never as a pass |

## Where the result is recorded

**`docs/architecture.md`**, as a new `## Prompt 123 — the record` section at the
foot, in the shape prompts 121 and 122 already set: the interface decisions and
how each fared, the per-site equivalence table, the measured line counts, and
the checks table. Then:

- Fill the landed table's candidate-2 row with `123` and the date, **and mark it
  as the workspace half only**, with prompt 124 named as the remainder.
- Correct any figure in candidate 2's description that this session's inventory
  disproves (the review says "5 shapes" and "4 finally shapes"; this session
  measured 29 catch sites across 24 files and 4 hand-cleared `pending` sites).

`AGENTS.md` gets **nothing** — no new invariant, no index row. `docs/architecture.md`
is already in the index, and the cap rule in the front matter forbids the build
record going in `AGENTS.md`.

## SKILLS USED

- **`vercel-react-best-practices`** — hook design and the pending-state rule.
  Read `rules/rendering-usetransition-loading.md`,
  `rules/rerender-split-combined-hooks.md`,
  `rules/rerender-functional-setstate.md` and
  `rules/advanced-use-latest.md` before writing the hook. The first is
  deliberately refused above; read it anyway so the refusal is informed.
- **`zod-docs`** — the `safeParse` discriminated-union shape the `parse`
  callback is typed against, and this project's fixed rules on the shared
  schema. Load `references/docs/07-formatting-errors.md` if any question about
  issue shape arises; do not recall it.
- **`nextjs`** — Server Actions called from a client component, and what a
  `"use client"` module may export in Next 16.2. Needed to confirm the module
  can be a plain `.ts` hook module rather than a component file, and that a
  client-imported hook does not change any route's render mode.
- **`tailwind-4-docs`** — only if a class string is touched. It should not be;
  if the adoption tempts one, that is a signal the refactor has exceeded scope.

**None of the provider skills apply** — this change touches no database, no
email, no blob, no limiter and no auth call. Saying so explicitly rather than
listing them, per AGENTS.md §1 step 2.

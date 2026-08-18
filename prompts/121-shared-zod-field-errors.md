# 121 — Map a `ZodError` once, and record the remediation sequence

## Scope, and why it is next

Two things, in one change:

1. **Promote the `ZodError` → `fieldErrors` mapping into `lib/validation/result.ts`**
   and adopt it at every site that does it today.
2. **Record the six-candidate architecture remediation sequence** — as
   `docs/architecture.md`, one index row in `AGENTS.md`, and a `§5.4` table in
   `AGENTS.md` — so a session opened after a `/clear` can resolve which
   candidate is next without re-running the review.

It is next because it is candidate 1 of the architecture review taken at
`2337ab1` on 17 Aug 2026, whose recommended order is **1 → 3 → 2 → 4, 5, 6**.
Candidate 1 leads on three grounds the review states: it has the widest reach
per line changed, it touches no server-side authorisation, no schema and no
prerendered markup, and **candidate 2 (the submit-lifecycle module) stands on
it** — collapsing the mapping first leaves that module one fewer decision to
make.

The user approved one prompt per candidate, and asked that the whole sequence be
written into `AGENTS.md` so new sessions can continue it. That is part 2 above,
and it is why this prompt is larger than candidate 1 alone.

## Reference material read for this prompt

Read in full or in the cited range while writing this file — nothing below is
recalled (§12 rule 1):

- `/tmp/claude-1000/-home-gdk26-Documents-nextjs-aetherfield/c33e2d7e-2b7f-4af1-95d7-2fe74b12ff16/scratchpad/architecture-review-20260817.html`
  — the review this candidate comes from. **It is in a session scratchpad and
  will not survive**; part 2 of this prompt is what moves its content into the
  repository.
- `lib/validation/result.ts` — the whole file: `SubmitResult<TField>` and
  `NETWORK_ERROR`, and the two docblocks that state why this module is
  deliberately not `server-only` and imports nothing.
- `.claude/skills/zod-docs/references/docs/07-formatting-errors.md` — the
  behaviour of `z.flattenError`, `z.treeifyError`, `z.prettifyError`, and the
  shape of `error.issues` in Zod 4.
- `node_modules/zod/package.json` — **Zod 4.4.3**.
- `vitest.config.mts` — the whole file, including the docblock arguing for the
  `lib/domain/`-only `include`.
- The mapping sites themselves, listed in the inventory below, at the line
  numbers given.

## What is actually there — the inventory

Produced by `grep -rn --include='*.ts' --include='*.tsx' -e 'fieldErrorsFromIssues' -e 'flattenError' -e '\.issues' app lib`
and by opening each hit. **The implementation must re-run that grep and
reconcile against this table before editing**, because a site added since this
prompt was written is a site that would otherwise keep its own copy.

### Client leaves — 10 modules, 5 shapes

| # | file:line | shape |
| --- | --- | --- |
| 1 | `app/_components/activity/custom-factor-form.tsx:85`, used at `:191` | named local `fieldErrorsFromIssues`; `path[0].path[1]` joined with `.`; skips `path.length < 2`; first wins (`??=`) |
| 2 | `app/_components/activity/factor-picker.tsx:95–107` | five separate `issues.find((issue) => issue.path.includes(<field>))?.message` |
| 3 | `app/_components/application/apply-dialog.tsx:215` | `for…of`, `path[0]`, guarded by `field in next`, first wins (`\|\|=`) |
| 4 | `app/_components/lead/demo-request-dialog.tsx:423` | same `for…of` shape |
| 5 | `app/_components/newsletter/subscribe-dialog.tsx:118` | same `for…of` shape |
| 6 | `app/_components/organization/create-organization-form.tsx:92` | same `for…of` shape |
| 7 | `app/_components/organization/members-panel.tsx:260` | same `for…of` shape |
| 8 | `app/_components/organization/delete-organization-panel.tsx:97` | `issues[0]?.message` with a literal fallback; **ignores the path entirely** |
| 9 | `app/_components/reports/create-report-form.tsx:46` | `issues.find((i) => i.path[0] === "title")` |
| 10 | `app/_components/targets/create-target-form.tsx:61` | `z.flattenError` + `Object.fromEntries` over `fieldErrors`, taking `[0]` |

### Server actions — 7 modules, 12 mapping sites

`z.flattenError(parsed.error)` then hand-keying `fieldErrors.<name>?.[0]`:

- `app/account/actions.ts:133`, `:304`, `:638`
- `app/_actions/application.ts:127`
- `app/_actions/demo-request.ts:89`
- `app/_actions/newsletter.ts:101`
- `app/activity/actions.ts:431`, `:726`
- `app/reports/actions.ts:109`
- `app/targets/actions.ts:79`

Plus **three named local adapters in `app/activity/actions.ts`**:

- `:1183` `factorImportFieldErrors` — `set.<key>` only, skips `path.length < 2`
  and `path[0] !== "set"`, first wins
- `:1445` `editFactorSetFieldErrors` — `path.length !== 1` skipped, first wins
- `:1457` `customFactorFieldErrors` — **character-for-character the same rule as
  `custom-factor-form.tsx:85`**, for the same `CustomFactorField` type

> **This corrects the review.** It reports "the only named adapter is private to
> one leaf". There are **four** named adapters, and two of them implement the
> identical rule for the identical field type on opposite sides of the seam —
> which is the strongest evidence for this candidate, not a detail. Fix that
> sentence when the review is transcribed into `docs/architecture.md` (§12
> rule 8).

### Deliberately out of scope — two sites that are not this

- `app/activity/actions.ts:1075` — takes `issues[0]` and feeds
  `describeRowIssue(issue.path.join("."), issue.message)`. This keys a **CSV row
  number**, not a form field, and has a different output type.
- `app/activity/mappings/page.tsx:92` — `issues[0]?.message` for a search-param
  message. No field errors exist on that path.

Leave both, and say in `docs/architecture.md` that they were considered and why
they stayed.

## The rule the one adapter must implement

Every shape above reduces to the same three decisions, and they agree on all
three today:

1. **A field is identified by its issue path joined with `"."`** — so a
   top-level issue keys `"name"` and a nested one keys `"factor.name"`.
2. **The longest declared prefix of that path wins**, so a schema whose error
   lands deeper than the declared field still reaches the field that owns it.
3. **The first issue to claim a field wins**; later issues on the same field are
   dropped.

Signature, to be written against `SubmitResult`'s existing `TField` convention
in the same module:

```ts
export function fieldErrorsFrom<TField extends string>(
  error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] },
  fields: readonly TField[],
): Partial<Record<TField, string>>;
```

The parameter is structurally typed rather than `z.ZodError` **deliberately**:
`lib/validation/result.ts` today imports nothing, and three of the ten leaves
above sit inside prerendered marketing routes (§8.1). Verify at implementation
time whether `import type { ZodError } from "zod"` is fully erased by the
compiler — if it provably is, a named type is better and may be used; if that
cannot be established, keep the structural type and record the reason in the
docblock. **Do not guess** (§12 rule 2).

### Equivalence is verified per site, not assumed

For each of the 22 sites, the implementation must state whether the unified rule
produces **identical output** and, where it does not, name the difference and
decide it explicitly rather than absorbing it silently. The four known
divergences to resolve:

- **`z.flattenError` keys only by `path[0]`** — the docs page read for this
  prompt shows `favoriteNumbers[1]`'s message landing under `favoriteNumbers`,
  and an issue with an empty path landing in `formErrors`, not `fieldErrors`.
  The prefix rule is a strict generalisation of this, so the seven
  `flattenError` action sites keep their behaviour **only if** every declared
  field is top-level. Check each; a nested field would newly receive a message
  it does not get today, which is an improvement but is still a change.
- **`factor-picker.tsx` uses `path.includes(field)`**, which matches at *any*
  depth and in any position, not as a prefix. Confirm `factorMappingSchema`'s
  issues are top-level; if any is not, the prefix rule changes that leaf.
- **`delete-organization-panel.tsx` ignores the path**, so it currently shows a
  schema-level issue on the `confirmSlug` field. Under the rule an empty-path
  issue keys nothing. Its literal fallback covers that case; confirm the
  rendered text is unchanged, or keep the fallback.
- **`apply-dialog.tsx` and friends use `||=`, the adapters use `??=`.** These
  differ only for an empty-string message. Confirm no schema in
  `lib/validation/` produces one.

### Deletions this must produce

Not a target for its own sake — it is how "concentrates rather than relocates"
is checked:

- `fieldErrorsFromIssues` in `custom-factor-form.tsx`
- `factorImportFieldErrors`, `editFactorSetFieldErrors` and
  `customFactorFieldErrors` in `app/activity/actions.ts`
- the four hand-rolled `for…of` loops in the dialogs, `create-organization-form`
  and `members-panel`
- the five `issues.find` calls in `factor-picker.tsx`
- the `Object.fromEntries` block in `create-target-form.tsx`

If `z.flattenError` ends up with **no remaining caller**, the `import * as z`
in the affected action modules must go too. Check; do not leave an unused
import.

## The test scope decision — needs the user's answer

The review claims this produces "the first testable write-path unit". It does:
the adapter is a pure function over typed inputs with no I/O. But
`vitest.config.mts` scopes `npm test` to `lib/domain/**/*.test.ts`, and its
docblock argues for that scope on purpose — "an `include` that reached wider
would invite tests that need a database or a browser".

**Recommendation: widen the include to
`["lib/{domain,validation}/**/*.test.ts"]` and add
`lib/validation/result.test.ts` covering the three rules and the four
divergences above.** The argument the docblock makes is against tests that need
a mock, and `lib/validation/` is the one `lib/` module that is already forbidden
to be `server-only` or to touch a secret (§6.3) — it is as pure as
`lib/domain/`. Approving this prompt approves that widening; say so if you want
the adapter shipped untested instead.

## Part 2 — recording the sequence

New file **`docs/architecture.md`**, holding:

- the review's date, the commit it was taken against (`2337ab1`), and the two
  inputs it could not read (there is no `CONTEXT.md` and no `docs/adr/` in this
  repository, and the `codebase-design`, `grilling` and `domain-modeling` skills
  are not installed)
- all six candidates in the review's own terms — the problem, the solution, the
  wins, and each one's stated cost or warning. Transcribe, do not summarise, and
  **apply the correction above about the four named adapters**
- the ordering constraints, each with its reason: **3 before 5** (they disagree
  on whether the limiter is passed as a function or a policy key), **3 before
  4** (candidate 3 removes preamble from `app/activity/actions.ts` and may
  change how its three parts want to divide), **1 before 2**, and **candidate 6
  needs a design answer from the user first** — whether `WorkspaceNav` should
  persist through a `loading.tsx`, which today it does in
  `app/dashboard/loading.tsx` and in none of the other three
- which candidate each prompt number implemented, appended as they land

**`AGENTS.md` gets exactly two additions**, and no more (the file's own cap
rule):

1. One index row: `` `docs/architecture.md` | the architecture review of 17 Aug
   2026, its six candidates, their order and their dependencies ``
2. A short **`§5.4 Architecture remediation sequence`** — a table of the six
   candidates, one line each, in order, with the dependency column, and the
   three sentences that make it resolvable: that it is a **plan** and nothing in
   it is ticked; that "done" is resolved from `git log` and the repository
   (§12 rule 5); and that the detail lives in `docs/architecture.md`.

`§5.4` belongs in `AGENTS.md` rather than only in `docs/` because §5.2's build
sequence is already there for the same reason — a session resolving "what is
next" reads it *before* opening any `docs/` file. It carries the plan, never the
record, which is what keeps it inside the cap rule.

## Prerender impact

**Expected: none — no route changes.** This is a required heading and the answer
must be *verified*, not assumed.

The risk is real rather than theoretical: seven of the ten leaves are client
components inside routes that must stay byte-stable (§8.1) — `apply-dialog`
(`/careers`, `/job-listing/[slug]`), `demo-request-dialog` (`/`,
`/design-system`) and `subscribe-dialog` (`/journal`). Their **markup and copy
must not change at all**; only the code that computes `errors` before the first
paint's state does.

Verification, in this order:

1. `npm run build`, and confirm the route table still reads exactly as §8.1
   states it: `/  /journal  /about  /careers  /design-system` as `○ Static`, the
   six `/article/[slug]` and three `/job-listing/[slug]` as `● SSG`.
2. Diff the prerendered HTML against the pre-change build, per the procedure in
   `docs/automation.md`. **The standing mask applies** — never quote a bare
   page-wide `magick compare -metric AE` for `/`, `/journal` or `/careers`; mask
   the scrubbed capabilities cloth, the stamp's perforation drift and the open
   application card's marching dashes, and report the remainder and the box
   separately.

## Trust boundary

**Unchanged, and that is the requirement.** Nothing crosses the browser/server
boundary that did not before; no schema is edited; no authorisation decision
moves.

The one thing to keep true: this change touches the *presentation* of a
validation failure on both sides of the seam. §6.2 and §10 rule 1 still hold —
the client copy is a courtesy, the server copy is the check, and the adapter
runs **after** `safeParse` on both sides, never in place of it. A rejected
request returns the same typed `SubmitResult` it returns today, with the same
`error` string; only the `fieldErrors` computation is shared.

## Secrets and data

**No environment variable is read, and no personal data is stored, logged or
transmitted.** `lib/validation/result.ts` stays free of `server-only` and free of
imports that read a secret (§6.3) — that constraint is load-bearing here, since
the module is about to be imported by three leaves inside marketing routes.

§8.3 rule 2 is a live concern in this change: a `ZodError`'s issues can carry an
`input` value on some issue codes. **The adapter reads `path` and `message` and
nothing else**, and must never widen to a shape that could put a submitted email
address or CV filename into a log line.

## Non-goals

- **Candidates 2 through 6.** Each gets its own prompt file. In particular, do
  not start the submit-lifecycle module here even though it will call this
  adapter — that is prompt 122's successor, and the review sequences candidate 3
  before it.
- **No schema in `lib/validation/` is edited.** Not a message, not a refinement,
  not a field. If a site's messages look wrong, record it and leave it.
- **No change to any `SubmitResult`, `*FieldErrors` or `*Field` type.** The
  adapter is written to fit them.
- **No change to visible copy** — not an error sentence, not a success sentence,
  not a label. `NETWORK_ERROR` is untouched.
- **No new dependency**, and no `zod` runtime import added to a client leaf that
  does not already have one.
- **No `docs/adr/` and no `CONTEXT.md`.** The review noted their absence;
  creating them is a separate decision the user has not made.
- **Splitting `app/activity/actions.ts`** — that is candidate 4, and the review
  says explicitly to do it after candidate 3.

## Checks to run

Per §2, with exact output quoted and nothing claimed unrun (§12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — and if the include is widened, confirm
  `lib/validation/result.test.ts` actually appears in the run's file list
- `npm run build`, with the route table quoted
- the prerendered-HTML diff described under **Prerender impact**
- `npm run test:e2e` — the write paths are what this change touches, and the
  three marketing dialogs are covered there rather than by `npm test`

## Where the result is recorded

- **`docs/architecture.md`** — created by this prompt: the six candidates, the
  ordering constraints, and a line saying prompt 121 implemented candidate 1,
  what the equivalence check found at each of the 22 sites, and which
  divergences were decided rather than preserved.
- **`AGENTS.md`** — the one index row and `§5.4`, and nothing else.
- No other `docs/` file changes. If the build diff turns up a byte difference on
  a marketing route, that is a **stop**, not a footnote: report it before
  committing.

## SKILLS USED

- **`zod-docs`** — the `ZodError` issue shape, `path` element types, and the
  exact behaviour of `z.flattenError` versus `z.treeifyError` in Zod 4.
  `references/docs/07-formatting-errors.md` is the page; the rest of the
  snapshot is not needed.
- **`nextjs`** — to confirm nothing about the client-leaf boundary or the
  prerender contract changes when a shared module gains an export that a client
  component imports, and to read the route table's meaning in `npm run build`
  output.
- **`tailwind-4-docs`** — only if a leaf's markup is touched at all. It should
  not be; if the implementation finds itself loading this skill, it has left
  scope.
- **`improve-codebase-architecture`** (`.agents/skills/`) — the review that
  produced this candidate came from it; its HTML-REPORT glossary is the source
  of the "deep module", "seam" and "deletion test" vocabulary used in
  `docs/architecture.md`.
- **None for the providers** — this change reaches no database, no email, no
  blob, no Redis and no auth surface. Do not load `neon-postgres`, `drizzle-docs`,
  `resend` or `better-auth-*` for it.

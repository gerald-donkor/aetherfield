# 124 — The submit lifecycle is a module, not a habit (candidate 2, marketing half)

## Scope, and why it is next

**Architecture candidate 2**, its second and final half. Prompt 123 built
`app/_components/use-write.ts` and adopted it across the 21 non-marketing
write-path leaves — the "workspace half" — and deferred the three marketing
dialogs to this prompt by the review's own scope warning
(`docs/architecture.md`, candidate 2):

> `demo-request-dialog`, `subscribe-dialog` and `apply-dialog` live inside `/`,
> `/journal`, `/careers` and `/job-listing/[slug]` — §8.1 territory. Prerendered
> HTML must stay byte-identical, verified by the build diff in
> `docs/automation.md`, with the standing mask on `/`, `/journal` and
> `/careers`. Take candidate 1 first, then adopt this on the eight workspace
> leaves before the three marketing ones.

`docs/architecture.md`'s landed table already names this prompt as candidate
2's remainder:

```
| 2 · the submit lifecycle | 123 (workspace half only — the three marketing dialogs are prompt 124's) | 18 Aug 2026 |
```

Candidates 4, 5 and 6 all sequence after candidate 3 (`3ac8c64`), which is
committed, but none is *Strong* and candidate 6 is blocked on an open design
question the review says must go to the user first (`docs/architecture.md`,
"6 needs a design answer from the user first"). Finishing candidate 2 — already
*Strong*, already three-quarters landed, already scoped by the review itself —
is next, unambiguously, and closes out a candidate rather than opening a new
one.

## Reference material read for this prompt

By path, all read this session:

- `docs/architecture.md` — candidate 2's description and scope warning, the
  order/constraint table, the landed table, and Prompt 123's full record
  (interface decisions, the measured inventory method, the equivalence-table
  format, the prerender-diff result).
- `AGENTS.md` §6.2, §8.1, §8.2, §10 — the write path this module is the client
  half of, and §8.1's "adding `app/api/*` changes no route's HTML" standard
  extended here to "adopting a shared hook changes no route's HTML".
- `app/_components/use-write.ts` — the whole file, in full: the six-stage
  `submit`, `invalid`, `reset`, the exported `setMessage`/`setErrors`, and its
  docblock's account of why `onSuccess` can return `{ message, hold: true }`
  and why `submit` resolves to a boolean.
- The three leaves, read in full: `app/_components/lead/demo-request-dialog.tsx`
  (579 lines), `app/_components/newsletter/subscribe-dialog.tsx` (230 lines),
  `app/_components/application/apply-dialog.tsx` (402 lines).
- `lib/validation/lead.ts`, `lib/validation/newsletter.ts`,
  `lib/validation/application.ts` — each schema, each `NO_FIELD_ERRORS`
  constant and field type, and `application.ts`'s documented reason the CV has
  no schema entry (the server reads `%PDF-` bytes; `File.type` is
  attacker-controlled).
- `lib/validation/result.ts` — `fieldErrorsFrom`, `NETWORK_ERROR`,
  `SubmitResult`, confirming the three actions' return shapes fit
  `use-write.ts`'s `WriteResult<TField>`.

## The measured inventory

Produced this session by reading and grepping the three files, not recalled or
carried over from prompt 123's count (which explicitly excluded these three).

```bash
grep -n "useState\|NETWORK_ERROR\|catch\|finally\|setPending\|setMessage\|setErrors" \
  app/_components/lead/demo-request-dialog.tsx \
  app/_components/newsletter/subscribe-dialog.tsx \
  app/_components/application/apply-dialog.tsx
```

- **3 files, 3 submit paths** — one `onSubmit` each, unlike the workspace half's
  24 files / 26 paths. `NETWORK_ERROR` is imported and caught exactly once per
  file.
- **The `finally` shape is uniform across all three**: `try { … } catch {
  setMessage(NETWORK_ERROR); } finally { setPending(false); }`. None of the four
  workspace divergences (hand-cleared `pending`, a held `pending` across
  navigation) appear here — no dialog navigates on success, all three swap the
  body in place per §10 rule 5.
- **The fields sentence is 2 shapes across 3 sites**, exactly as the workspace
  half found: `"Check the marked fields and try again."` on `demo-request-dialog`
  and `apply-dialog` (3+ fields), `"Check the marked field and try again."` on
  `subscribe-dialog` (1 field). Per-form, not to be normalised — the module
  takes it as `fieldsMessage`.
- **`apply-dialog.tsx` is the one site that does not fit `submit`'s `parse`
  cleanly**, and this prompt's one real decision is here. Its `onSubmit`
  (lines 206–222) runs `applicationFieldsSchema.safeParse(raw)` *and* the
  non-Zod `checkCv(file)` courtesy check, then merges both into one
  `errors` object and one shared message — `cv` has no schema entry
  (`lib/validation/application.ts`'s documented reason) but is a rendered
  field. Neither `submit`'s `parse` alone (Zod-only) nor `invalid` alone
  (drops the Zod fields) expresses "both together, one message". The fix is a
  `parse` that runs both checks and folds `cv`'s failure into a synthetic issue
  before returning, so `fieldErrorsFrom` sees one list and the merge behaviour
  — `cv` set from `checkCv`, the rest from Zod — falls out of the same
  first-wins rule prompt 121 already proved correct, rather than being
  hand-merged a second way:

  ```ts
  parse: () => {
    const parsed = applicationFieldsSchema.safeParse(raw);
    const cvError = checkCv(file);
    if (!parsed.success || cvError) {
      return {
        success: false,
        error: {
          issues: [
            ...(parsed.success ? [] : parsed.error.issues),
            ...(cvError ? [{ path: ["cv"], message: cvError }] : []),
          ],
        },
      };
    }
    return { success: true, data: { ...parsed.data, cv: file } };
  },
  ```

  **Verify this against `use-write.ts`'s `Issues` structural type and
  `fieldErrorsFrom`'s actual behaviour before writing it** — this prompt states
  the intended shape, it does not certify it compiles or that first-wins still
  picks `cv`'s synthetic issue correctly when Zod also fails on `cv` (it
  cannot — `cv` is not in the schema — but confirm no other field name
  collides).
- **`apply-dialog.tsx`'s `onFileChange` clears one field's error on change**
  (`setErrors((current) => (current.cv ? { ...current, cv: "" } : current))`,
  line 192) — the exact second case `use-write.ts`'s docblock names for why
  `setErrors` is exported rather than kept private. This is the first real call
  site for that export; confirm the functional-update form still type-checks
  against the hook's `Partial<Record<TField, string>>` state.
- **None of the three uses `useTransition`, `startTransition` or
  `useActionState`.** Verified by grep; consistent with prompt 123's finding
  for the workspace half.

## What adopting the module changes, per file

State removed from each: three `useState` calls (`pending`, `message`,
`errors`) become one `useWrite<TField>({ fields, fieldsMessage })` call.
`open`, `done`, and `apply-dialog`'s `file` stay local — the hook does not own
dialog-open state or the `done` swap, exactly as `use-write.ts`'s docblock
scopes it: the six stages of §10, nothing else.

- **`demo-request-dialog.tsx`**: `onSubmit` becomes a `write.submit({ parse,
  call: () => submitDemoRequest({ ...data, source }), onSuccess: () => { … }
  })`. `onClose` currently does `setPending(false)` only (not a full reset,
  because `openDialog` already re-clears `message`/`errors` on the next open)
  — replacing it with `write.reset()` is behaviourally identical (it clears
  `pending`, `message` and `errors`, and `openDialog` was already about to
  clear the latter two anyway) but **write down the substitution as an
  equivalence claim and check it**, per the rule below. `errors.name`-style
  reads against `write.errors` need the hook's `{}` default in place of
  `NO_FIELD_ERRORS`'s all-empty-string record — confirm
  `errors.field || undefined` still reads `undefined` from a missing key
  (it does; an absent key and an empty string both fail `||`), so no visible
  change.
- **`subscribe-dialog.tsx`**: the simplest of the three, one field, no
  courtesy-check wrinkle. `onSubmit` becomes `write.submit({ parse: () =>
  newsletterFieldsSchema.safeParse(raw), call: (data) =>
  subscribeToNewsletter(data), onSuccess: () => { setDone(true); return
  "Confirmation sent."; } })`.
- **`apply-dialog.tsx`**: the `parse` above, `call: (data) =>
  submitApplication(assemblePayload(data))` (the existing `FormData`
  assembly, unchanged — §10's flow does not touch how the request is built,
  only how pending/message/errors are tracked), `onFileChange`'s functional
  clear kept as a direct `write.setErrors(...)` call.

## The equivalence rule this prompt is graded on

**Unchanged from prompt 123 — read it there rather than restated in full
here.** In short: before touching a leaf, write down its six stages as they
are today (the exact sentences, the reset behaviour, the `finally` shape);
after adoption, diff that against what the module produces; every divergence
is either eliminated or recorded in `docs/architecture.md` with the argument
for why it is safe, in the per-site table format prompts 121, 122 and 123 each
used. Nothing that varies today is normalised away — the singular/plural
fields sentence, each success sentence, and each dialog's own `done`/`Seal`
handling all stay exactly as they render now.

The one candidate divergence flagged in advance (`onClose`'s `setPending(false)`
→ `write.reset()` on `demo-request-dialog.tsx`) must be checked against the
other two dialogs too — confirm neither `subscribe-dialog.tsx` nor
`apply-dialog.tsx`'s `onClose` relies on `message` or `errors` surviving a
close that `openDialog` doesn't already overwrite.

## Expected impact

- **Changed:** `app/_components/lead/demo-request-dialog.tsx`,
  `app/_components/newsletter/subscribe-dialog.tsx`,
  `app/_components/application/apply-dialog.tsx` — 3 files, 3 submit paths.
- **Unchanged:** `app/_components/use-write.ts` itself (built at prompt 123;
  this prompt is adoption only — if a gap in its surface is found, e.g. the
  `Issues` shape not accepting a synthetic non-Zod issue cleanly, name the gap
  and fix `use-write.ts` narrowly rather than routing around it in the leaf),
  every Server Action (`submitDemoRequest`, `subscribeToNewsletter`,
  `submitApplication`), every schema, the database, `FormStatus`,
  `app/_components/lead/demo-request-dialog.tsx`'s GSAP hover/spin/fan (no
  stage of that lives in the six the module owns).
- Line count is not the measure, per prompts 122 and 123's precedent — the win
  is one home for the lifecycle across the last three sites that lacked it.

### Prerender impact

**Expected: no HTML byte changes, chunk names may move — verify, do not
assume.** This is the opposite risk profile from prompt 123 (which touched no
module a prerendered route imports at all): all three leaves here render
inside `/`, `/journal`, `/careers` and `/job-listing/[slug]`, which are exactly
the prerendered/SSG routes §8.1 lists. `use-write.ts` is already in the bundle
graph (it shipped at prompt 123 with no importer on these routes); after this
prompt it gains three importers that are themselves inside marketing routes,
so client JS shifts and shared chunk filenames may move — prompt 121 hit
exactly this and resolved it by substitution, not by treating a moved chunk
name as a failure.

Run the full verification: `npm run build`, confirm the route table (`/
/_not-found /about /careers /design-system /forgot-password /journal
/reset-password /sign-in /sign-up /verify-email` as `○`, `/article/[slug]` (6)
and `/job-listing/[slug]` (3) as `●`), then the two-build prerender diff per
`docs/automation.md` — its traps at "Two more prerender-diff traps, found at
prompt 105", "The build id appears in the flight payload too", "Chunk names
and Server Action ids are per-build too — normalise both", "Tailwind v4 scans
prose, and an English word can ship as CSS", and "Two traps in building the
baseline somewhere else, found at prompts 115-120" all apply here and must be
read before running the diff. **The standing warning against a bare
page-wide `magick compare -metric AE` on `/`, `/journal` and `/careers`**
(AGENTS.md front matter) applies to any pixel comparison attempted alongside
the HTML diff — mask the scrubbed-cloth/stamp-perforation/dashed-card boxes
and report the remainder and the box separately, if a pixel check is run at
all. The HTML diff itself is unaffected by that warning (it is markup, not
pixels), same as prompt 121's note.

If any of the 21 files land non-identical after chunk-name substitution, that
is a finding to investigate — most likely a rendered-copy divergence in one of
the three dialogs — not something to normalise away.

### Trust boundary

**Nothing changes.** Client half of §10 only, exactly as prompt 123's trust
boundary states. BotID, the rate limit, the server-side parse, and the write
all live in `submitDemoRequest`, `subscribeToNewsletter` and
`submitApplication`, none of which this prompt touches. The client-side
`parse` these three leaves run — including `apply-dialog`'s merged
schema-plus-`checkCv` check — remains a courtesy per §6.2: it decides nothing
the server does not re-decide, and `checkCv`'s own comment already says the
client should err toward letting a file through.

### Secrets and data

**No environment variable is read, and none is added.** `use-write.ts`'s
docblock already states "nothing here logs" (§8.3 rule 2); this prompt adds no
new log line and passes the same submitted values (name, email, company/role
message, CV `File` object) through the hook's `call` thunk that the actions
already receive today. No new field crosses the client/server boundary that
does not already cross it.

## Non-goals

- **Rebuilding or reshaping `use-write.ts`.** This prompt adopts it; a
  narrowly-scoped fix is in bounds only if the merge in "the measured
  inventory" above genuinely does not fit its current surface, and any such
  change must be named, not silently done.
- **The demo dialog's GSAP hover/spin/fan** (`HOVER_DUR`, `SPIN_EASE`, the
  `fan()` WebAudio graph) and its granted 7.5 exception. None of that is part
  of the six stages; do not touch it.
- **Restyling anything.** No `FormStatus`/status-`div` prop, no class string,
  no markup, no `Seal` sizing on `apply-dialog.tsx`'s success state.
- **Normalising any user-visible sentence** — the singular/plural fields
  message, each dialog's distinct success copy
  (`"Request received."` / `"Confirmation sent."` / `"Application received."`
  and their body paragraphs), and `apply-dialog.tsx`'s `role`-line heading
  stay exactly as written.
- **Candidates 4, 5 and 6.** Do not touch `lib/rate-limit/` or
  `app/activity/actions.ts`, and do not pre-empt candidate 6's open
  `WorkspaceNav` design question.
- **The auth forms** (`app/_components/auth/*`) — a different lifecycle
  (Better Auth's client, not a Server Action), confirmed out of scope at
  prompt 123 and unchanged here.
- **Widening `vitest.config.mts`'s `include`.** Same reasoning as prompt 123:
  a hook needs a renderer to unit-test and none is installed; equivalence here
  is established by the per-site table and the E2E matrix.

## Checks to run (AGENTS.md §2)

Run all of these and quote the exact output; never claim a pass without it
(§12 rule 3).

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | unchanged from prompt 123's baseline — nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged, as listed above |
| prerender diff | 21 of 21 byte-identical after chunk-name substitution (per prompt 121's method); report which chunk names moved |
| `npm run test:e2e` | Chromium and Firefox exercise all three dialogs (`/` hero + CTA band, `/journal`'s subscribe band, `/careers`'s open-application card, a `/job-listing/[slug]` apply flow). **WebKit will not run** — `scripts/playwright-webkit.sh` needs Podman, not installed; report as the standing environment gap, never as a pass |

## Where the result is recorded

**`docs/architecture.md`**, as a new `## Prompt 124 — the record` section at
the foot, in the shape prompts 121–123 already set: the interface decision for
`apply-dialog.tsx`'s merged `parse` and how it fared, the per-site equivalence
table for all three dialogs, the measured line counts, the prerender-diff
result, and the checks table. Then:

- Update the landed table's candidate-2 row to read `123, 124` with both
  dates, and drop the "workspace half only" qualifier — candidate 2 is
  complete as of this prompt.

`AGENTS.md` gets **nothing** — no new invariant, no index row. `docs/architecture.md`
is already indexed there, and the cap rule in the front matter forbids the
build record going in `AGENTS.md`.

## SKILLS USED

- **`zod-docs`** — verify `.safeParse()`'s discriminated-union shape and that a
  hand-built `{ issues: [...] }` object satisfies what `fieldErrorsFrom` reads,
  for the `apply-dialog.tsx` merged-`parse` decision above. Load
  `references/docs/07-formatting-errors.md` if any question about issue shape
  arises; do not recall it.
- **`nextjs`** — confirm a shared client hook imported into three leaves that
  sit inside prerendered/SSG routes changes no route's render mode, and that
  the bundle-graph reasoning in "Prerender impact" above is correct for Next
  16.2's App Router before relying on it.
- **`tailwind-4-docs`** — only if a class string is touched. It should not be;
  if adoption tempts one, that is a signal the refactor has exceeded scope.

**None of the provider skills apply** — this change touches no database, no
email, no blob, no limiter and no auth call, exactly as prompt 123. Saying so
explicitly rather than listing them, per AGENTS.md §1 step 2.

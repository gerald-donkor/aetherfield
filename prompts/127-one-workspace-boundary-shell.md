# 127 — One workspace boundary shell

Architecture candidate **6** of the review of 17 Aug 2026
(`docs/architecture.md`), *Worth exploring · in-process* — the last of the six.

---

## 1 · Scope, and why it is next

Candidates 1, 3, 2, 4 and 5 are landed — resolved from `git log` and the files
on disk, never from `prompts/` (§12 rule 5): `622c6b2` (121), `3ac8c64` (122),
`4be68c8` / `557f6f1` (123–124), `44f6666` (125), `af77a82` (126). Candidate 6
was the only one left, blocked on a design question this file's line 233 named
as open: **whether `WorkspaceNav` should persist through a `loading.tsx` and an
`error.tsx`.**

**That question is now answered, by the user, this session:** yes — the shared
shell renders `WorkspaceNav` on the loading and error states of the three
tenant-workspace routes that already render it on their settled page
(`dashboard`, `targets`, `reports`), matching the settled UI instead of
dropping navigation mid-fetch or on failure. `submissions` stays without it —
it is a staff-only route (`AGENTS.md` §11.1), not one of `WorkspaceNav`'s four
items, and its settled page (`app/submissions/page.tsx`) already renders no
`WorkspaceNav` today. Verified, not assumed:

```
$ grep -n "WorkspaceNav" app/{dashboard,targets,reports,submissions}/page.tsx
app/dashboard/page.tsx:  <WorkspaceNav current="dashboard" />
app/targets/page.tsx:    <WorkspaceNav current="targets" />
app/reports/page.tsx:    <WorkspaceNav current="reports" />
(no match in app/submissions/page.tsx)
```

With the design question closed, this is the only remaining candidate, and
nothing else blocks it.

---

## 2 · The eight files, measured

`wc -l`, this session:

| file | lines | renders `WorkspaceNav` today |
| --- | --- | --- |
| `app/dashboard/loading.tsx` | 24 | yes (`current="dashboard"`) |
| `app/targets/loading.tsx` | 19 | no |
| `app/reports/loading.tsx` | 22 | no |
| `app/submissions/loading.tsx` | 19 | no (correct — stays excluded) |
| `app/dashboard/error.tsx` | 26 | no |
| `app/targets/error.tsx` | 23 | no |
| `app/reports/error.tsx` | 33 | no |
| `app/submissions/error.tsx` | 23 | no (correct — stays excluded) |
| **total** | **189** | — |

**The divergence the review named is exactly this table's third column**:
`app/dashboard/loading.tsx` is the one file of the eight that already renders
`WorkspaceNav`, with no comment explaining why it alone does. This prompt
resolves that by making the rule explicit and applying it uniformly, rather
than by picking a side silently.

`app/activity/` has **no** `loading.tsx` or `error.tsx` — confirmed this
session (`ls` on both paths errored `No such file or directory`). It is not
one of the review's eight and this prompt does not add either file to it; that
would be a new boundary, not a collapse of existing ones (`AGENTS.md` §5.2
"Do not overbuild").

---

## 3 · The shell to build

`app/_components/workspace-boundary.tsx` — no `"use server"`, no `"use
client"` at module scope, since it holds no state and no handler of its own;
whichever caller needs it (`loading.tsx`, staying a Server Component, or
`error.tsx`, which Next.js requires to be a Client Component boundary — verify
this against the `nextjs` skill rather than assumed) pulls it in as a plain
component.

**Shape**, following the review's own sketch ("the eyebrow, the heading, the
status line and the current nav item... three strings and, for `error.tsx`, a
reset handler") with the resolved design answer folded in:

```tsx
type WorkspaceBoundaryCurrent = "dashboard" | "targets" | "reports";

export function WorkspaceBoundary({
  eyebrow,
  heading,
  current,
  children,
}: {
  eyebrow: string;
  heading: string;
  current?: WorkspaceBoundaryCurrent;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        {current ? <WorkspaceNav current={current} /> : null}
        <p className="font-mono text-caption text-muted">{eyebrow}</p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] md:text-[64px]">
          {heading}
        </h1>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
```

`current` is **omitted** by `app/submissions/loading.tsx` and
`app/submissions/error.tsx` — not passed as some fourth `"submissions"` value
`WorkspaceNav` doesn't recognise. `WorkspaceNav`'s own `ITEMS` union
(`app/_components/workspace-nav.tsx`) stays exactly `"dashboard" | "activity" |
"targets" | "reports"`; do not add a `"submissions"` entry to it or invent one
here — the two unions describe different things (which routes the shell
serves vs. which routes appear in the nav) and collapsing them would be a
silent scope change.

**`error.tsx`'s heading is identical across all four routes** —
`"This view isn't available just now."` — so it is realistic that the shell
absorbs it as a fixed string rather than a prop, with only the body paragraph
and the eyebrow varying. Decide this once real code is in front of you and say
which was chosen; either is a valid reading of "three strings," and the
`reports/error.tsx` docblock quoted below is a fourth piece of prose that has
nowhere to live but that file regardless of which way this falls.

**`app/reports/error.tsx`'s docblock survives, verbatim, in
`app/reports/error.tsx`** — it explains a real product invariant (a report is
a disclosure; showing half of one because a read failed would be worse than
showing none), not a boundary-shell implementation detail, and it is not
`WorkspaceBoundary`'s to carry:

```
/**
 * The unexpected-error state for the whole `/reports` subtree.
 *
 * **It reveals no partial figure.** A report is a disclosure; showing half of
 * one because a read failed would be worse than showing none, so this state
 * says what did not happen and offers the request again.
 */
```

---

## 4 · The four `loading.tsx` files, after

Each becomes the eyebrow, the heading, `current` (or its absence), and the one
status sentence — read verbatim from today's file, not reworded:

| route | eyebrow | heading | `current` | status sentence |
| --- | --- | --- | --- | --- |
| `dashboard` | `OVERVIEW` | `Loading current evidence.` | `"dashboard"` | `Checking access and reading the reporting window...` |
| `targets` | `TARGETS` | `Loading targets.` | `"targets"` | `Checking access and reading the current commitments...` |
| `reports` | `REPORTS` | `Loading reports.` | `"reports"` | `Checking access and reading the stored snapshots...` |
| `submissions` | `OPERATIONS` | `Loading submissions.` | *(omitted)* | `Checking access and reading the current view...` |

The status sentence's markup
(`<div className="mt-12 border-y border-border py-14 font-serif text-p2 text-muted" role="status">…</div>`)
is identical across all four today — confirm that at implementation time
before deciding whether it also folds into the shell as a `status` prop or
stays as each file's one line of `children`. Either is defensible; state which
and why.

## 5 · The four `error.tsx` files, after

Each is `"use client"`, takes `reset: () => void`, and keeps its own body
paragraph and the `Button`:

| route | eyebrow | body paragraph |
| --- | --- | --- |
| `dashboard` | `OVERVIEW` | `No activity, emissions, energy or target figures were displayed. Try the request again.` |
| `targets` | `TARGETS` | `No target or emissions figures were displayed. Try the request again.` |
| `reports` | `REPORTS` | `No report, figure or narrative was displayed, and nothing was changed. Try the request again.` (plus the docblock above) |
| `submissions` | `OPERATIONS` | `No submission details were displayed. Try the request again.` |

`current` follows the same table as §4: `"dashboard"`, `"targets"`,
`"reports"`, omitted for `submissions`.

---

## 6 · Non-goals

- **`app/activity/`** gets no `loading.tsx` or `error.tsx`. It is not one of
  the review's eight files and adding either would be a new boundary, not a
  collapse of existing ones.
- **No wording changes.** Every eyebrow, heading, status sentence, error body
  and the `reports` docblock move verbatim; this is a structural collapse, not
  a copy edit.
- **No change to `WorkspaceNav` itself** — its `ITEMS` union, its markup, its
  `aria-current` behaviour are all untouched. §6.4's own overflow and GSAP
  invariants don't apply here (`WorkspaceNav` carries no motion).
- **No change to any settled `page.tsx`** — `dashboard`, `targets`, `reports`
  and `submissions`' actual pages keep rendering `WorkspaceNav` (or not)
  exactly as they do today; only their `loading.tsx` / `error.tsx` siblings
  change.
- **No new nav item, no new route.** `submissions` is confirmed staff-only and
  orthogonal to the tenant workspace loop (`AGENTS.md` §11.1); this prompt
  does not fold it into `WorkspaceNav`.
- **Candidate 6 was the last one.** This prompt does not reopen 1–5.

---

## 7 · Measurements the implementation must hit

**No numeric target is invented here** (§12 rule 7) — the review's own "189
lines become ~40" is a judgement, not a target to hit exactly; report the real
`wc -l` before and after and let the number be what it is.

1. `wc -l` on all eight files before, and on the eight-plus-shell set after,
   reported as measured.
2. An eight-row equivalence table — eyebrow, heading, `current`, and the
   varying middle content — confirming every route's rendered output is
   unchanged from §4/§5 above.
3. `grep -rn "WorkspaceNav" app/{dashboard,targets,reports,submissions}/{loading,error}.tsx`
   after the change → four matches (`dashboard`, `targets`, `reports`, both
   files each), zero in either `submissions` file.

---

## 8 · Prerender impact

**none — no route changes.** `dashboard`, `targets`, `reports` and
`submissions` are all authenticated, dynamic (`ƒ`) routes today — confirmed
across every prior prompt's build-route-table check (121–126) — never part of
the five static marketing pages, the six `/article/[slug]` or the three
`/job-listing/[slug]` SSG routes. `WorkspaceBoundary` is reached from no
marketing route.

**Verify, do not assume:** run `npm run build`, confirm the route table is
unchanged from prompt 126's, then run the prerender diff from
`docs/automation.md` and expect the marketing side byte-identical — with the
standing mask on `/`, `/journal` and `/careers` still in force, though nothing
in this prompt is expected to touch a shared client chunk those pages import.

## 9 · Trust boundary

**none.** This is a display-only collapse of four loading states and four
error boundaries; no Server Action, no form, no mutation, no new data read.
Every protected page's server-side authorisation (§11.2) is unchanged —
`WorkspaceBoundary` renders what a page or its boundary already decided to
show; it decides nothing itself.

## 10 · Secrets and data

None read, none newly logged. No environment variable, no personal data.

---

## 11 · Checks

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | unchanged pass count — nothing in scope is under `lib/domain/` or `lib/validation/` |
| `npm run build` | route table unchanged, per §8 |
| prerender diff | byte-identical on the marketing side, per `docs/automation.md`, masks in force |
| `npm run test:e2e` | run the full matrix — `dashboard`, `targets`, `reports` and `submissions` are all exercised by existing specs, and this touches every one of their loading/error states. **Expect Chromium + Firefox to pass and WebKit not to run**, per the standing container gap prompts 123–126 all recorded (`browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1234/…`) — report it, do not re-investigate it here |

---

## 12 · Where the result is recorded

**`docs/architecture.md`**, and nowhere else:

1. Fill candidate 6's row in the landed table — `127`, and the date.
2. Add **"Prompt 127 — the record"** beside 121/122/123/124/125/126's, carrying:
   the eight-row equivalence table, the measured line counts, the `current`
   vs. omitted decision for `submissions`, whichever "three strings vs. four"
   call was made for the error heading and the status-line markup (§3, §4),
   and the confirmation that `app/reports/error.tsx`'s docblock survived
   verbatim.
3. Close with a short "all six candidates are landed" paragraph — this was the
   last one, so say so plainly rather than leaving the next session to
   re-derive it from the landed table.

**`docs/backend.md` gets no cross-reference** — no schema, endpoint or
environment variable changes. **`AGENTS.md` gets nothing beyond what §5.2's
rule already allows** — no new invariant is created; `WorkspaceBoundary`'s
existence is a `docs/architecture.md` fact, resolved from the repository, not
a line to add to the front matter.

Then commit to `main`, unprompted (§1 step 10). Do not push.

---

## SKILLS USED

- **`nextjs`** — confirm the `loading.tsx` / `error.tsx` special-file
  contract on Next.js 16: that `error.tsx` must be a Client Component
  boundary (`"use client"`, a `reset` prop) while `loading.tsx` has no such
  requirement, and what actually happens when a Client Component (`error.tsx`)
  imports a plain component that carries neither directive — confirm this
  against the installed framework rather than recalled, per §12 rule 2, before
  deciding whether `WorkspaceBoundary` needs any directive of its own.
- **`tailwind-4-docs`** — no new utility is introduced; every class in
  `WorkspaceBoundary` and its callers is copied from the eight files as they
  stand today. Listed so a run that finds a real divergence between them (there
  should be none) has a loaded reference rather than a guess.
- **`vercel-react-best-practices`** / **`nextjs`** — confirm there's no
  penalty to a Server Component (`loading.tsx`) and a Client Component
  (`error.tsx`) sharing one leaf component the way `WorkspaceBoundary` is
  proposed to, before committing to that shape over two near-identical shells.

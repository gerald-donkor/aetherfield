# 109 — Thirteen leaves call `router.refresh()` after an action that already revalidates

## Scope, and why it is next

Last of the write-path UI group, and deliberately after 105-108 so it runs on
leaves whose status handling has already settled.

Thirteen client leaves call `router.refresh()` in their success branch, verified
this session:

`auth/sign-in-form.tsx:77`, `auth/sign-out-button.tsx:34`,
`activity/factor-import-form.tsx:148`, `activity/custom-factor-form.tsx:223`,
`activity/import-controls.tsx:80`, `activity/retire-set-button.tsx:75`,
`activity/factor-set-form.tsx:105`, `activity/factor-picker.tsx:134`,
`activity/recalculate-control.tsx:55`, `activity/retire-factor-button.tsx:73`,
`reports/create-report-form.tsx:66`, `reports/report-controls.tsx:56`,
`activity/mapping-form.tsx:94`.

Meanwhile `app/activity/actions.ts` calls `revalidatePath` **29 times**, and
`app/_components/organization/members-panel.tsx:33` documents the opposite
convention explicitly:

> **No redirect on success** (AGENTS.md 10 rule 5) — every action revalidates
> `/account` and the section re-renders in place.

So the codebase holds two conventions for the same job. Where the action already
revalidates the path the leaf sits on, the `router.refresh()` is a second round
trip for data the first one already invalidated.

## Reference material read

- The thirteen call sites above, each in its success branch
- `app/activity/actions.ts` — all 29 `revalidatePath` calls and which paths they
  name
- `app/_components/organization/members-panel.tsx:20-45` — the stated convention
- `app/reports/actions.ts`, `app/targets/actions.ts`, `app/account/actions.ts` —
  their revalidation, for the leaves outside `activity/`
- AGENTS.md §10 rule 5 — no redirect on success, swap in place

## What the implementation must do

**This is not a blanket deletion, and treating it as one would break pages.**
The work is a site-by-site determination.

For each of the thirteen, establish:

1. Which Server Action it calls.
2. Whether that action calls `revalidatePath`, and **for which path**.
3. Whether that path is the one the leaf is rendered on.

Only where all three line up is the `router.refresh()` redundant. Remove it
there. Where the action revalidates a *different* path, or none, **keep the
refresh and add a one-line comment saying why it is needed** — that is as
valuable as the deletions, because it converts a silent inconsistency into a
stated one.

**The two auth leaves need separate thought.** `sign-in-form.tsx` and
`sign-out-button.tsx` refresh to pick up a *session* change, not a data change,
and a Server Action's `revalidatePath` is not obviously equivalent for that.
**Verify what Better Auth's client actually requires here** (§12 rule 2) and
default to leaving both alone unless the evidence is clear. A broken sign-out is
a much worse outcome than a redundant refresh.

**Record the determination table** — thirteen rows, action, revalidated path,
rendered path, verdict. That table is the deliverable as much as the code is.

## Measurements

If a request-count or timing difference is observed for a removed refresh,
report it and **say whether the database was warm** — §7.3's scale-to-zero rule
makes any cold measurement meaningless. If no measurement is taken, say the
benefit is judged rather than measured (§12 rule 4). Do not claim a latency
improvement that was not observed.

## Expected impact

Up to thirteen fewer client-initiated refreshes. **The rendered result after
every action must be identical** — the same data visible, the same section
updated in place, no stale row anywhere. That is the acceptance condition and it
is the risk: a wrongly removed refresh shows the user stale data after a
successful write, which is close to §8.2 rule 4's "silent success" failure.

## Prerender impact

`none — no route changes`. All thirteen are authenticated-area leaves. Verify
with `npm run build` and quote the route table.

## Trust boundary

`none` — no server behaviour changes. Every action keeps its `revalidatePath`
calls exactly as they are; only the client's extra refresh is reconsidered.

## Secrets and data

None. No new variable, no logging.

## Non-goals

- **Do not remove or add any `revalidatePath` call in any action.** The server
  side is the reference, not the thing under revision.
- **Do not introduce a redirect on success** — §10 rule 5 forbids it, and these
  pages' scroll and motion state depend on it.
- Do not touch the two auth leaves unless the evidence is clear.
- Do not restructure any leaf beyond deleting the call and its now-unused
  `useRouter` import where that applies.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- `npm run test:e2e` — **the load-bearing check for this prompt.** Stale-data
  regressions are exactly what an E2E pass catches and a unit test cannot. Quote
  the result; if the matrix cannot run here, **say so and treat the prompt as
  unverified** rather than reporting it complete.

## Where the result is recorded

`docs/backend.md`, write-path UI section: the thirteen-row determination table,
which refreshes were removed, which were kept and why, and the outcome for the
two auth leaves.

## SKILLS USED

- `nextjs` — `revalidatePath` semantics, Server Action revalidation, and what
  `router.refresh()` actually does in the App Router. The interaction of the two
  is the entire prompt and must be verified, not recalled.
- `next-cache-components` — this project is on Next 16.2, where `use cache` and
  Cache Components change revalidation behaviour from the `unstable_cache` era.
  AGENTS.md's front matter names this skill specifically before touching
  revalidation; that instruction applies squarely here.
- `vercel-react-best-practices` — client-side refresh patterns and their cost.
- `better-auth-best-practices` — the two auth leaves: what the client needs
  after a session change.

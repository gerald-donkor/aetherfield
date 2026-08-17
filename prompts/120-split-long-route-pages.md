# 120 — Three route pages carry unrelated edit reasons

## Scope, and why it is next

**Last in the sequence.** Deferred by the user on 2026-08-16 alongside 119, for
the same reason: a large mechanical diff with no behaviour change, best run once
everything else is committed and verified.

Three authenticated route pages, with the line counts the review measured:

| file | lines |
| --- | --- |
| `app/activity/mappings/page.tsx` | 729 |
| `app/dashboard/page.tsx` | 550 |
| `app/submissions/page.tsx` | 412 |

Each mixes several unrelated concerns in one file — Divergent Change, the same
smell as 119 but on the render side rather than the query side.

**This prompt is at the greatest risk of becoming scope creep of the three
structural ones**, because "split a page component" has no natural stopping
point. The constraints below exist to give it one.

**Prompts 105-111 must be committed before this runs** — they reshape the
components these pages render, and splitting first would guarantee conflicts.

## Reference material read

- The three page files, **each in full**
- `app/_components/activity/`, `app/_components/organization/`,
  `app/_components/reports/` — the existing component layout and naming
  conventions these splits must match
- `app/account/page.tsx` — a shorter page in the same area, as the model for how
  a page in this codebase is expected to be organised
- `docs/backend.md`, build steps 7, 9, 10 and 12

## What the implementation must do

**Take one page per commit.** Three findings, three commits, in ascending order
of size so the smallest establishes the pattern:

1. `app/submissions/page.tsx` (412)
2. `app/dashboard/page.tsx` (550)
3. `app/activity/mappings/page.tsx` (729)

For each, in order:

1. **Name the concerns in the file** and map every declaration to one. Produce
   the map before moving anything; it is what justifies the cut and it goes in
   the recorded result.
2. **Extract to `app/_components/<area>/`**, following the existing convention
   there rather than inventing a layout.
3. **The page keeps its data fetching.** §6.2: only Server Components fetch
   initial page data, and the page is the composition root. Extracting a
   *presentational* section is in scope; **pushing a query down into a component
   is not**, and would breach the layering.
4. **Every extracted piece stays a Server Component unless it already was not.**
   Adding a client boundary while "tidying" a page is the failure mode here —
   it changes what ships to the browser and can quietly disable streaming.
   **If an extraction would require `"use client"`, do not make it.**
5. **Move code; do not edit it.** No renamed prop, no reordered JSX, no changed
   class. Anything that is not pure relocation is called out explicitly.

**Stopping condition, and it is binding:** a page is done when each remaining
concern is one cohesive unit. **Not** when it hits a line count. Do not chase a
number, do not extract single-use three-line components, and do not create a
component whose only purpose is to make a file shorter.

**If a page does not decompose cleanly, leave it and say why** (§12 rule 9).
Two clean splits and one honest "this one is cohesive despite its length" is a
better outcome than three forced ones.

## Measurements

**Every page's rendered output must be byte-identical.** That is the acceptance
condition. Line counts before and after may be quoted as context but are **not**
the benefit and must not be presented as one.

## Expected impact

Three pages become a page plus several components each. Identical rendered
output, identical data fetching, identical client/server split.

## Prerender impact

`none — no route changes`. All three are authenticated and none was ever
prerendered. Verify with `npm run build` and quote the route table — the nine
marketing routes must be unchanged, and no new client boundary may appear.

**Check the build output for any change in what these routes ship**, since an
accidental client boundary is the specific risk and the route table alone will
not show it.

## Trust boundary

**No change, and this must be verified rather than assumed.** Every one of these
pages is behind auth and each authorises server-side before reading tenant data.
Moving JSX must not move an authorisation check, and must not create a component
that renders tenant data without the page having authorised first. §11.2 rule 1:
`proxy.ts`'s redirect is optimistic and is never the enforcement.

**Confirm for each page that the authorisation call stays in the page**, above
everything it renders.

## Secrets and data

Reads `DATABASE_URL` transitively through the query layer, as today. No new
variable. **No logging may be added.** `/submissions` renders leads,
subscribers and applications — real personal data (§8.3) — so nothing extracted
from it may log, serialise to an attribute, or embed a CV link that is not the
existing short-lived signed URL (§8.3 rule 4, §11.2 rule 4).

## Non-goals

- **Do not change any rendered output.**
- **Do not move data fetching out of the page.**
- **Do not add a client boundary.**
- **Do not split any other page**, however long. Three files, named above.
- Do not merge the two role-label maps at `submissions/page.tsx:233` and
  `account/page.tsx:38`. **The review proposed this and it is wrong** — verified
  this session: `submissions/page.tsx` maps the **staff** role
  (`admin` / `staff` / `null` → Admin / Staff / Customer) and `account/page.tsx`
  maps the **organization** role via `ORGANIZATION_ROLE_LABELS`. AGENTS.md §11.1
  makes these two role systems **orthogonal** and warns against a role spanning
  both. Merging the maps would conflate them. Leave both.
- Do not touch `emission-queries.ts` — prompt 119.

## Checks

Per commit, not once at the end:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table and confirm no new client boundary
- `npm run test:e2e` — **required.** These three pages are the main authenticated
  surfaces and nothing else verifies them. Quote the result, or say plainly if
  the matrix could not run and treat the commit as unverified.

## Where the result is recorded

`docs/backend.md`, build steps 7 and 12. Per page: the concern map, the
components extracted, the authorisation-placement verification, and — for any
page left alone — the argument for leaving it.

## SKILLS USED

- `nextjs` — Server Components versus client components, where data fetching
  belongs (§6.2), and how an accidental `"use client"` changes a route's output.
- `vercel-react-best-practices` — component decomposition without widening the
  client boundary; the "keep fetching at the composition root" pattern.
- `better-auth-best-practices` — session and role resolution stays in the page,
  above everything it renders.
- `organization-best-practices` — the tenant-side role labels on
  `/account`, and why they must not be merged with the staff-role map.
- `tailwind-4-docs` — moved class strings must resolve identically under v4's
  config-less `@theme`.

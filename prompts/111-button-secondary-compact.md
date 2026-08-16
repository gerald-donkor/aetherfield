# 111 — `Button`'s `secondary` and `compact` sizes are byte-identical

## Scope, and why it is next

Smallest finding in the sequence, and last of the `primitives.tsx` group so it
lands on a file already settled by 107 and 110.

`app/_components/primitives.tsx:143-147`, read this session:

```ts
type ButtonSize = "primary" | "secondary" | "compact";

const buttonSizing: Record<ButtonSize, string> = {
  primary: "h-[46px] pl-4 pr-5 gap-2.5",
  secondary: "h-[38px] px-3",
  compact: "h-[38px] px-3",
};
```

`secondary` and `compact` produce **the same string**. Two names, one
appearance. A caller choosing between them is making a distinction the component
does not honour, and a future change to one will silently diverge two call sets
that currently look identical — which is the actual risk, not the duplicated
literal.

**This one genuinely might be intentional**, and the prompt must find out before
changing anything. Two names for one current value is a legitimate way to record
that two *roles* exist and may diverge later. If that is the intent, it is
undocumented — and documenting it is then the whole fix.

## Reference material read

- `app/_components/primitives.tsx:138-190` — `ButtonSize`, `buttonSizing`,
  `BUTTON_BASE`, `Button` and `ButtonLink`
- `grep -rn 'size="secondary"' app/` and `grep -rn 'size="compact"' app/` — every
  call site of each, to see whether the two names track a real distinction
- `docs/chrome.md`, `docs/site-affordances.md` and the `docs/` file owning
  `primitives.tsx` — for any recorded reasoning about button sizes
- `app/design-system/page.tsx` — whether the exhibit shows both

## What the implementation must do

**First, determine intent — this is the substance of the prompt.**

- Enumerate the call sites of each name. If they cluster meaningfully (one for
  compact table-row actions, one for secondary page actions, say), the
  distinction is real.
- Search `docs/` and `git log` for the commit that introduced `compact` and what
  it said. **`git log` is the authority on what was built and why** (§12
  rule 5).

**Then take exactly one of two paths**, and say which and why:

**Path A — the distinction is real.** Keep both names. Add a comment above
`buttonSizing` stating that the two currently resolve to the same string, that
this is deliberate, and what each is for. Nothing else changes. **This is the
likely and the safe outcome.**

**Path B — no distinction is discoverable.** Collapse to one name, migrate the
call sites, and record the removal. **Only take this path if the call-site
evidence is clear**; ambiguity resolves to Path A, because deleting a name is
irreversible in a way that adding a comment is not.

**Under either path the rendered output must be unchanged.** No button's classes
may differ by a single character.

## Measurements

The class strings are already measured and settled by the comps; **neither may
change**. `h-[38px] px-3` and `h-[46px] pl-4 pr-5 gap-2.5` stay exactly as they
are. This prompt does not re-open any button geometry.

## Expected impact

Path A: one comment. Path B: one type member and one record entry removed, plus
call-site renames. Either way, **zero visual change**.

## Prerender impact

`Button` and `ButtonLink` render on **every prerendered route** — the "Get
started" affordance, "Request a demo", "Sign up to newsletter", "Apply now",
"View open roles".

`none — no route changes` is the required outcome and it must be **proven**, not
assumed: `npm run build`, quote the route table, then **diff the prerendered
HTML of all nine routes** per `docs/automation.md` and show them byte-identical.
Standing warning in force for `/`, `/journal` and `/careers` — mask the moving
boxes, report the remainder and the box separately.

Under Path B this is the entire risk: a missed call site renders a button with
no sizing class at all.

## Trust boundary

`none` — presentational.

## Secrets and data

None.

## Non-goals

- **Do not change any button's height, padding, gap, or any part of
  `BUTTON_BASE`.**
- **Do not add a new size.**
- **Do not touch `SiteFooter` or `SiteNav`** — settled surfaces, and both render
  buttons.
- Do not touch `describedBy` (110) or `SelectField` (107).
- Do not restyle `/design-system`'s button exhibit; if Path B removes a name the
  exhibit shows, update the exhibit minimally and note it as a prerender change.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it. Byte-identical is the pass
  condition.

## Where the result is recorded

The `docs/` file owning `primitives.tsx`, named from AGENTS.md's index. Record
the call-site enumeration, what `git log` said about `compact`'s introduction,
the path taken and why, and the prerender diff result.

## SKILLS USED

- `tailwind-4-docs` — confirm `h-[38px] px-3` and `h-[46px] pl-4 pr-5 gap-2.5`
  resolve identically under v4's config-less `@theme` after any change to how
  the record is keyed.
- `frontend-design:frontend-design` — the intent question is a design question:
  whether two button roles exist here is about the system, not the string.

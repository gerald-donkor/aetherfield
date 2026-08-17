# 118 — `RetireTargetControl` retires on a single click

## Scope, and why it is next

Last of the 26 actionable findings, and the only user-facing behaviour change in
the set that is not a copy or a metadata edit.

`app/_components/targets/retire-target-control.tsx:20-31`, read in full this
session: the component renders one `Button` whose `onClick` is `retire`, which
calls the `retireTarget` action immediately. No confirmation, no arming step, no
undo.

**Every other destructive control in this codebase confirms first.**
`app/_components/organization/members-panel.tsx:28-31` states the convention
explicitly:

> **The confirm/cancel step on a destructive control is step 7's, matched not
> reinvented**: `app/submissions/action-controls.tsx` established "Remove" ->
> inline question -> "Confirm remove" / "Cancel", and Remove and Leave both use
> it here so the site has one confirmation idiom.

So there is a named idiom, established at build step 7, adopted by the
organisation panel, and this control does not use it. Retiring a target is
consequential — a target is what "you're 16% off your 2027 goal" is measured
against (§5), and retiring one changes what the dashboard reports.

## Reference material read

- `app/_components/targets/retire-target-control.tsx` — whole file, 45 lines
- `app/submissions/action-controls.tsx` — the canonical arm → confirm → announce
  idiom, read in full, since matching it is the deliverable
- `app/_components/organization/members-panel.tsx` — the second adopter, and its
  docblock naming the convention
- `app/targets/actions.ts` — `retireTarget`: what it does, whether it is a soft
  delete, and therefore how recoverable the action actually is
- `docs/backend.md` — build steps 7 and 11, for the idiom's origin and the
  target lifecycle

## What the implementation must do

1. **Establish whether retiring is reversible.** Read `retireTarget` and the
   schema. If it is a soft delete with a restore path, the confirmation is a
   courtesy; if it is terminal from the UI, the confirmation is a safeguard.
   **This changes the wording**, and it must be established from the code rather
   than assumed (§12 rule 1).
2. **Adopt the existing idiom exactly.** "Retire target" → inline question →
   "Confirm retire" / "Cancel". Match `action-controls.tsx`'s structure,
   element choices, class strings and focus handling — **matched, not
   reinvented**, in the convention's own words. Do not design a third variant,
   and do not use a native `confirm()` dialog: a browser modal blocks the page
   and is not the site's idiom.
3. **Keep the result region's behaviour**, including the focus effect. If prompt
   105 has landed, use `FormStatus` rather than the inline `<p>`; if it has not,
   leave the existing element alone and let 105 pick it up.
4. **Cancel must restore the initial state cleanly** — no lingering message, no
   stuck `pending`, focus returned somewhere sensible rather than lost to the
   document body.
5. **Announce the outcome**, as today. The arm step itself should not be
   announced as a result; only the completed action is.

## Measurements

None. The idiom's geometry and classes are taken from
`app/submissions/action-controls.tsx`, which is the existing measured
implementation. **Do not re-fit anything** — copy the established treatment.

## Expected impact

Retiring a target takes two clicks instead of one. A user who clicks "Retire
target" and stops is left with an armed control and no change, where previously
the target was already retired.

## Prerender impact

`none — no route changes`. `/targets` is authenticated and was never
prerendered. Verify with `npm run build` and quote the route table.

## Trust boundary

**Unchanged, and this is the point that must not be misunderstood.** The confirm
step is **presentation**, and §6.2 and §11.2 rule 2 are explicit that hiding or
gating a control in the UI is never enforcement. `retireTarget` must keep
authorising server-side exactly as it does today — re-resolving the tenant,
re-reading the role from Postgres, spending its rate limit, predicating the
write on the organisation. **This prompt adds no security and must not be
recorded as if it did.** It reduces accidental clicks.

A rejected request keeps returning the existing typed `{ ok: false, error }`.

## Secrets and data

None. No new variable, no logging, no personal data.

## Non-goals

- **Do not change `retireTarget`** — not its authorisation, its rate limit, its
  validation, or what it writes.
- **Do not add an undo.** If step 1 finds retiring is terminal and an undo would
  be valuable, **report it** as a separate finding (§12 rule 9).
- **Do not invent a new confirmation pattern**, and do not use `confirm()`.
  Native dialogs also block the automation used elsewhere in this project.
- Do not audit the other destructive controls for the same gap — worth doing,
  its own prompt.
- **No GSAP.** §7.5 forbids it in backend UI; the one granted exception is the
  demo dialog's close-button hover and this is not it.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- `npm run test:e2e` — **the load-bearing check.** A two-step control has states
  a type check cannot see: arm, cancel, confirm, error-while-armed. Quote the
  result, or say plainly if the matrix could not run rather than reporting the
  prompt verified.
- Confirm keyboard operability: the armed state must be reachable and
  dismissible by keyboard, and focus must not be lost on cancel. Say how this
  was checked.

## Where the result is recorded

`docs/backend.md`, build step 11's section. Record whether retiring is
reversible and how that shaped the wording, that the idiom was matched from
`action-controls.tsx` rather than reinvented, and the explicit note that this is
presentation and adds no enforcement.

## SKILLS USED

- `vercel-react-best-practices` — the two-step control's state handling and
  focus management.
- `nextjs` — client leaf boundaries and Server Action invocation from the
  confirm step.
- `tailwind-4-docs` — the copied class strings must resolve identically under
  v4's config-less `@theme`.

No installed skill covers ARIA. Focus behaviour on arm and cancel follows WAI
guidance **fetched this session** if any question arises (§12 rule 2); otherwise
it follows `action-controls.tsx`, which is the repository's own answer.

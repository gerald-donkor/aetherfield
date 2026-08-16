# 108 — Nine status regions are assertive, thirty are polite, with no stated rule

## Scope, and why it is next

Directly follows 105, which puts every one of these regions behind a single
`FormStatus` component while deliberately preserving each site's current `role`.
This prompt is the accessibility decision that 105 kept out of its mechanical
diff, and it is far easier to make once the roles are props at one call site
each rather than markup in thirty files.

**105 must be committed before this prompt runs.**

Counted this session: `role="alert"` in **9** files under `app/`,
`role="status"` in **30**, for what is the same
success-or-error region after a Server Action returns.

Two problems, and the second is the real one:

1. **No discernible rule** separates the nine from the thirty. Nothing in
   `docs/` states one, and the nine are not obviously the more urgent paths.
2. **Each assertive region also moves focus into itself** — the shared
   `useEffect(() => { if (message) ref.current?.focus() }, [message])`. A screen
   reader announces an `alert` on insertion *and* announces the element again
   when focus lands on it. **The nine sites announce their message twice.** The
   thirty polite ones do not have this problem in the same way, because a
   `status` region's polite announcement is superseded by the focus move rather
   than duplicated.

AGENTS.md §8.2 rule 5 requires the result to be "announced, focus managed, and
legible without colour alone". Announcing twice is a defect in the first clause,
caused by the interaction of the other two.

## Reference material read

- `grep -rln 'role="alert"' app/` and `grep -rln 'role="status"' app/` — the
  nine and the thirty
- `app/_components/activity/recalculate-control.tsx:38-82` — the canonical
  polite region and its focus effect
- All nine assertive sites — read individually, to find any stated reason
- `app/_components/primitives.tsx` — `FormStatus` as it exists after 105
- ARIA guidance on `role="alert"` versus `role="status"`, and on moving focus
  into a live region — **fetched this session, not recalled** (§12 rule 2)

## What the implementation must do

1. **Read all nine and look for a reason.** If any carries a docblock or comment
   justifying assertive, that reason stands and the site is excluded. Record
   what was found — including "none of the nine gave a reason", which is the
   likely answer and is the useful record.
2. **Decide the rule, and write it down.** The defensible default for a result
   region that also takes focus is `role="status"` / `aria-live="polite"`:
   the focus move is what guarantees the user reaches the message, so the
   assertive interruption buys nothing and costs a duplicate announcement.
   Reserve `alert` for a message that appears **without** focus moving to it.
   State the rule in one place — `FormStatus`'s docblock — so the next component
   inherits it instead of guessing.
3. **Apply it.** Expected outcome: the nine become polite, and `FormStatus`
   defaults to polite. **If the rule implies keeping an assertive site, keep
   it** — the deliverable is a consistent stated rule, not uniformity for its
   own sake.
4. **Verify the double-announcement claim before fixing it, and after.** This is
   the part that must not be asserted from theory. If it cannot be verified with
   a real screen reader in this environment, **say so plainly and label the
   claim a judgement** (§12 rules 3 and 4) — do not write "verified" for
   something reasoned from the spec.

## Measurements

Screen-reader announcement behaviour, if it can be observed. If it cannot, the
recorded result says so and the change rests on a stated judgement about ARIA
semantics. **Do not present spec-reading as measurement.**

## Expected impact

Up to nine regions change from assertive to polite. No visual change. No change
to focus management, message text, or timing.

## Prerender impact

`none — no route changes` expected. If `FormStatus`'s default changes and it
lives in `primitives.tsx`, confirm no prerendered route renders one — and if any
does, diff that page's HTML per `docs/automation.md`. `npm run build`, quote the
route table.

## Trust boundary

`none` — presentational. No action, validation or authorisation changes.

## Secrets and data

None.

## Non-goals

- **Do not change any message text**, timing, or the focus effect itself.
- Do not add `aria-atomic`, `aria-relevant`, or any other live-region attribute
  not already present — each would be a separate judgement needing its own
  reasoning.
- Do not revisit the class string or the component's shape — 105 settled those.
- Do not touch the `role` on anything that is not a form-result region.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- `npm run test:e2e` — quote the result, or say plainly if it could not run.

## Where the result is recorded

`docs/backend.md`, write-path UI section: the rule as stated, the nine sites and
their disposition, whether any gave a reason, and **how the double-announcement
claim was established** — observed or judged, said explicitly.

## SKILLS USED

- `vercel-react-best-practices` — live-region and focus-management patterns in
  React.
- `nextjs` — client leaf boundaries, unchanged from 105.

No installed skill covers ARIA specifically. The authority here is the ARIA
specification and WAI guidance, **fetched live this session** rather than
recalled — say in the recorded result which sources were read and on what date
(§12 rule 2).

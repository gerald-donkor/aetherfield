# 88 — The application row's two controls stop reading as one broken block

## Scope, and why it is next

`/submissions?view=applications` renders the CV download link and the Remove
control flush against each other, left-aligned and of different widths, so the
two black blocks read as a single mis-shapen object rather than two controls.
Reported from production with a screenshot on 15 Aug 2026.

It is next because it is a defect in shipped work, not new scope. AGENTS.md
§5.2's fourteen build steps are complete, and §5.2 forbids inventing a
fifteenth; fixing a reported fault in step 7's view needs no new step.

## The cause, established before writing this file

`app/submissions/page.tsx:198` wraps both controls in a bare
`<div className="min-w-0">`:

```tsx
<div className="min-w-0">
  <ButtonLink … className="max-w-full wrap-anywhere">{row.cvFilename}</ButtonLink>
  {admin ? <RemoveSubmissionControl kind="application" … /> : null}
</div>
```

That div sets no gap, no flex direction and no alignment, so the two are
block-level siblings touching at the edge.

**`RemoveSubmissionControl` supplies its own spacing, and only as a grid child.**
`app/submissions/action-controls.tsx:112` opens with
`mt-4 border-t border-border pt-4 lg:mt-0 lg:border-0 lg:pt-0` — a rule that
separates it from content *above* on mobile and relies on occupying its own grid
column on desktop, where `lg:mt-0` deliberately removes the margin. Nested one
level down it keeps `lg:mt-0` and loses the column, so on desktop it has no
separation at all. This is why the fault is desktop-only and why it appears in
this list alone.

**The other two lists are correct and must not be touched.** `LeadList`
(`page.tsx:120`) and `SubscriberList` (`page.tsx:161`) place
`RemoveSubmissionControl` directly in the grid, which is the arrangement its
classes were written for.

## What to implement

Give the wrapper an explicit vertical rhythm and alignment so the two controls
read as two, at every width:

- make it a column flex container with `items-start`, so neither control
  stretches to the other's width — they have different jobs and equal width
  would imply equal weight;
- give it a gap that holds on desktop, where `RemoveSubmissionControl`
  contributes none;
- keep `min-w-0` — it is what allows `max-w-full wrap-anywhere` on the CV link
  to wrap a long filename instead of forcing the grid column wider.

**The gap is a judgement, not a measurement**, and must be recorded as one
(AGENTS.md front matter). There is no comp for this route — it is step 7 work
built from existing primitives. Take the value from the spacing the page already
uses between stacked controls rather than inventing one: the grid's own
`gap-5` and the control's `mt-4` are the two candidates already on this row, and
the chosen value must be one of them with a one-line reason, not a new number.

Do not restyle either control, do not change `ButtonLink`'s size or bullet, and
do not alter `RemoveSubmissionControl` — its classes are correct for its two
existing call sites and changing them would break those.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test` — all must pass and their
  output be quoted.
- `npm run build`, confirming §8.1's route table is unchanged.
- Visually confirm at desktop width and at a narrow width that the two controls
  are separated and that a long filename still wraps rather than widening the
  row. `/submissions` is authenticated, so this needs a signed-in session;
  `docs/automation.md` covers screenshotting.

## Prerender impact

**none — no route changes.** `/submissions` is authenticated and already
dynamic; this touches one client-side layout wrapper inside it. To be
*verified* against the build's route table, not assumed.

## Trust boundary

**none.** No request path changes. The `admin` conditional at `page.tsx:207`
that decides whether Remove renders at all is untouched, and it is presentation
only — `app/submissions/actions.ts` re-checks the admin role server-side inside
each action (AGENTS.md §11.2 rule 2), which this prompt does not go near.

## Secrets and data

Reads no environment variable. Stores, logs and transmits nothing. The row
displays an applicant's name, email and CV filename, which the view already
showed; **no screenshot taken for verification may be committed**, because those
are real applicant details (§8.3).

## Non-goals

- Not restyling the submissions view generally. One wrapper.
- Not touching `LeadList` or `SubscriberList`, which are already correct.
- Not changing `RemoveSubmissionControl`'s own classes.
- Not the confirm-step copy or the removal flow's behaviour.
- Not the two items still open elsewhere — the sending domain and Preview's
  missing `BETTER_AUTH_URL`. Both are recorded in `docs/backend.md` and neither
  is related.

## Record in

`docs/backend.md`, under step 7's submissions-view section — the fault, the
cause (`RemoveSubmissionControl`'s spacing assuming a grid column), the fix, and
the gap value marked as a judgement.

## SKILLS USED

- **`tailwind-4-docs`** — the fix is flex direction, alignment and a gap
  utility in Tailwind v4, whose spacing scale and `items-*` behaviour are read
  from the docs rather than recalled. This project is config-less v4 with tokens
  in `@theme`.
- **`nextjs`** — to confirm the change stays inside the existing client/server
  split for this route and that no render mode moves.
- **`frontend-design:frontend-design`** — the alignment decision (start vs
  stretch) and the gap choice are design judgements on a settled surface.

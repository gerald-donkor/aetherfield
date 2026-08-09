# 50 — Brand the job-application success dialog

## Scope, and why it is next

**Not a build-sequence step.** Build step 5 is already present in the repository
and committed as `5d3043c`; this is the user's requested design refinement to
that shipped application flow. The target is only the successful state of
`ApplyDialog`, which currently has the correct content and behavior but reads as
an uncomposed stack of heading, status strip, paragraph and button.

Use the existing measured Aetherfield `Seal` to give the state a clear branded
centre, improve its hierarchy and spacing, and keep completion quiet and
decisive. Do **not** add another action: a completed application needs one exit,
not another decision.

## Reference material read

| path | what it gives |
| --- | --- |
| `/home/gdk26/Pictures/Screenshots/Screenshot_20260809_190450.png` | the user's marked running state at `/job-listing/ux-designer#apply`; identifies the raw-looking success composition. It is a visual brief, not a geometry comp |
| `app/_components/application/apply-dialog.tsx` | the exact client leaf and successful-state branch to refine; its native-dialog behavior, focus management, live status, role caption, copy and close controls remain the contract |
| `app/_components/primitives.tsx` | the existing `Seal`, `Wordmark` and `Button`; `Seal` is the measured company mark already used by the job-listing surface |
| `app/_components/job/sections.tsx` | confirms that `Seal` already belongs to the listing's visual language |
| `app/_components/newsletter/subscribe-dialog.tsx` | the shared dialog vocabulary; this prompt must not accidentally restyle its success state |
| `app/_components/lead/demo-request-dialog.tsx` | the other shared dialog vocabulary and the user-authorised motion exception that must not spread here |
| `docs/job-listing.md` | the `Seal` drawing, scale discipline and job-listing invariants |
| `docs/backend.md`, “Step 5 — blob upload and job applications” | the application dialog's shipped behavior, measured prerender impact and remaining verification gaps |
| `docs/automation.md` | the production screenshot and prerender-diff procedures |
| `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` | installed Next 16.2 client-boundary behavior: imports rendered by this `use client` leaf enter its client module graph |
| `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` | installed Next 16.2 Tailwind CSS setup and utility-class usage |
| `.agents/skills/tailwind-4-docs/references/engineering-playbook.md` | local Tailwind v4 implementation discipline |
| `.agents/skills/tailwind-4-docs/references/docs/hover-focus-and-other-states.mdx` | verified `focus-visible` and reduced-motion variants; no new motion is required here |

## Design decision

Use `Seal`, not a new icon, bitmap or second logo component. It is the richer
Aetherfield mark the user is asking for, it already belongs to this route, and
it stays crisp at every pixel density as an inline SVG.

The successful state should read in this order:

1. existing heading row with `Application received`, the role caption and the
   existing top-right close button;
2. a centred, accent-blue `Seal` as the branded focal point;
3. the existing announced status, visually restyled as a small centred mono
   confirmation line rather than the current left-border error/status strip;
4. the existing thank-you copy, centred with a controlled readable measure;
5. the existing full-width `Close` button.

This is a composition change, not a content change. Keep the exact title,
`SUCCESS_BODY`, role string, status string and both close controls. The top-right
`✕` remains available for experienced dialog users; the full-width `Close`
remains the explicit completion action.

## Layout specification

There is no supplied comp for this state. Every number below is therefore a
**design judgement against the supplied screenshot and the existing spacing
scale**, not a measurement. Record it that way after implementation.

- Change only the `done` branch and only the classes/structure necessary to
  distinguish its composition. The form, error and pending states retain their
  current geometry and status treatment.
- Render `Seal` only when `done` is true. Give it `mx-auto`, `h-auto`, and an
  authored width of **160px on mobile and 184px from `sm` upward**. Those widths
  preserve its `283:144` viewBox ratio and leave generous air inside the
  dialog's 24/32px padding.
- Place the seal **28px below the heading block on mobile and 32px at `sm`**.
  Do not rotate, redraw or alter the SVG; its measured +7° tilt is internal.
- In the done state, restyle the status from the left rule to a centred mono
  line in `text-accent`, with **16px above it**. Keep `role="status"`,
  `aria-live="polite"`, `tabIndex={-1}`, `statusRef`, and the focus effect
  unchanged. The outcome remains legible without colour because the text says
  “Application received.”
- Centre `SUCCESS_BODY`, constrain it to approximately **440px**, and place it
  **20px below the status**. Retain the current serif size/leading and muted
  colour unless a screenshot proves the hierarchy fails at 375px.
- Keep the Close button full width and **32px below the body**.
- The dialog stays `w-[min(560px,calc(100vw-32px))]`, with its existing border,
  padding and blurred backdrop. Do not turn it into a card within a card, add a
  shadow, round corners, or change the backdrop.
- At 375px the dialog must fit without horizontal scrolling, clipping the seal,
  or overlapping the top-right close button. Long role names continue to wrap
  naturally in the heading block.

## Interaction and accessibility

- No animation, GSAP, CSS entrance transition, confetti, checkmark or sound.
  `AGENTS.md` §7.5 forbids GSAP in backend UI outside the one explicitly granted
  demo close-button exception, and this state does not need motion to read as
  complete.
- Preserve native `<dialog>`, `showModal()`, Escape close, backdrop-click close,
  focus return to the trigger, focus on the heading when opened, and focus on
  the status after submission.
- Preserve both close buttons' keyboard focus styles and accessible names.
- The `Seal` already has `role="img"` and an `aria-label`; keep that semantic
  identity. Do not add duplicate hidden logo text.
- Do not make colour the only confirmation channel: the heading, status and
  prose all carry the state in text.

## Expected file impact

Expected implementation file:

- `app/_components/application/apply-dialog.tsx`

Expected record after implementation:

- `docs/backend.md`, under build step 5, with the design judgements, screenshots
  inspected, route/build result and accessibility behavior actually verified.

Do not edit `app/globals.css`, `app/_components/primitives.tsx`, the job-listing
sections, any Server Action, validation, database, storage, email, rate-limit,
BotID or content file unless the approved scope is first revised.

## Prerender impact

**Expected: no prerendered HTML change and no render-mode change; verify rather
than assume.**

The success content is nested under `open ? … : null`; the closed dialog emitted
at prerender time remains empty. `/careers` and all three
`/job-listing/[slug]` routes import this client leaf, so their client chunk is
expected to change, but their prerendered HTML should stay byte-identical.

The route table must remain:

- `/careers` static;
- all three `/job-listing/[slug]` pages SSG;
- every unrelated marketing and auth route unchanged.

Run the production build and use the `docs/automation.md` prerender comparison
procedure against `HEAD` if the implementation produces any doubt about emitted
markup. At minimum, inspect the generated HTML for `/careers` and each job
listing and confirm that the dialog is still empty while closed.

## Trust boundary

**Unchanged.** The browser still submits the same `FormData` to the same Server
Action; the same shared Zod schema, BotID check, rate limit, slug validation,
private PDF checks, storage write, database insert and typed results remain in
place. This prompt changes only how an existing `{ ok: true }` result is drawn.
No new input crosses the browser/server boundary, and rejected requests retain
their existing visible and announced errors.

## Secrets and data

**Unchanged.** The UI change reads no environment variable and introduces no
`NEXT_PUBLIC_*` value. It collects, stores, logs and transmits no additional
personal data. Existing application data and the CV follow build step 5's
unchanged private path.

## Non-goals

- No new feature, secondary CTA, account-creation link, careers link, download,
  social share or next-job recommendation.
- No changes to application submission, email delivery, storage, retention or
  the open Resend-domain blocker.
- No redesign of the form, its error state, the newsletter dialog, the demo
  dialog, the auth cards, `SiteNav` or the settled `SiteFooter`.
- No new asset, generated image, icon package, component library or design
  token.
- No attempt to make the success dialog match a nonexistent comp. The supplied
  screenshot is the before-state and the authored values are judgements.

## Verification and checks

1. Run `npm run lint` and quote the exact result.
2. Run `npm run typecheck` and quote the exact result.
3. Run `npm run build` and quote the exact route table relevant to `/careers`
   and `/job-listing/[slug]`, plus any warnings.
4. Confirm the closed-dialog prerender described above for `/careers` and all
   three listings. If a base comparison is run, follow `docs/automation.md` and
   report exact differing regions, never a bare whole-page metric.
5. Inspect the successful state at **375px and 1280px**, `deviceScaleFactor: 1`.
   Capture screenshots with the production server on a free port as documented
   in `docs/automation.md`. Record whether the seal fits, the text wraps without
   collision, both close controls remain visible, and no horizontal overflow is
   introduced.
6. In a real browser, verify the visible state after an actual successful test
   submission, not by editing React state or DOM in devtools. Use a clearly
   synthetic applicant and valid small PDF; remove the test row and private blob
   afterwards through the project's existing verified server-side helpers or
   report explicitly if cleanup cannot be performed without adding out-of-scope
   tooling. Do not log or quote the submitted address or CV contents.
7. Verify keyboard behavior: focus lands on the announced success status, Tab
   reaches both close controls, Escape closes, and focus returns to the trigger.
   Also verify backdrop-click close and each explicit Close control.
8. Confirm the form, pending and error compositions are visually unchanged.
9. There is no test script in this repository; do not claim tests were run.
10. Record the implemented design and observed results in `docs/backend.md`, then
    commit the completed prompt to `main` without pushing.

## SKILLS USED

- `nextjs` — verify the Next 16.2 client boundary, prerender behavior and App
  Router constraints for the existing interactive leaf.
- `tailwind-4-docs` — select and verify Tailwind CSS v4 utilities, responsive
  variants and focus-visible behavior against the local docs snapshot.
- `design-handoff` — turn the supplied screenshot and design direction into an
  implementation-ready responsive, interaction and accessibility specification.

# 105 — The form-status scaffold is copied into roughly twenty client leaves

## Scope, and why it is next

The largest Standards finding by file count, and the one the review named as
carrying the most leverage. First of the shared-UI group.

Around twenty client leaves each end in the same block. Read in full this
session from `app/_components/activity/recalculate-control.tsx:38-82`, and
matching in substance across the rest:

```tsx
const resultRef = useRef<HTMLParagraphElement>(null);

useEffect(() => {
  if (message) resultRef.current?.focus();
}, [message]);

…

<p
  ref={resultRef}
  role="status"
  aria-live="polite"
  tabIndex={-1}
  className={`max-w-[34rem] border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
    message ? "mt-5 block" : "hidden"
  }`}
>
  {message}
</p>
```

That class string appears **29 times** across `app/`. Thirty files carry an
`aria-live` region.

**This block is AGENTS.md §8.2 rule 5**, not incidental styling: "Success and
failure are both accessible: the result is announced, focus is managed, and the
state is legible without colour alone." The contract is implemented by
copy-paste in twenty places, so it is exactly as strong as the least careful
copy — and prompt 108 exists because the copies have already diverged on
`role`.

## Reference material read

- `app/_components/activity/recalculate-control.tsx` — whole file, the canonical
  shape and its docblock
- `app/_components/activity/import-controls.tsx`,
  `app/_components/targets/retire-target-control.tsx`,
  `app/_components/reports/report-controls.tsx`,
  `app/_components/organization/members-panel.tsx` — four more, to establish
  what genuinely varies
- `app/_components/primitives.tsx` — the existing primitives and their prop
  conventions; `Field`, `TextareaField`, `FileField` are the models to follow
- `grep -rn 'aria-live' app/` — the thirty files
- AGENTS.md §8.2 rule 5, §8.1's client-leaf rule, and the front matter's bundle
  rule

## What the implementation must do

Extract a `FormStatus` component and adopt it everywhere the shape matches.

**Before writing it, diff the twenty-odd copies against each other** and record
what actually varies: the `role`, the element type, the `max-w`, the spacing,
whether focus moves. Anything that varies is either a prop or a divergence to be
normalised — and **normalising is a behaviour change that must be listed**, not
absorbed silently. Where a copy differs for a reason its own docblock gives,
keep the difference and say so.

**Where it goes.** `app/_components/primitives.tsx` is the existing primitives
module and §7.5 forbids a second design system, so that is the default. It is a
client component; confirm the file's existing directive situation supports that
without pulling anything new into a marketing bundle.

**The focus `useEffect` moves into the component.** That is the part most likely
to be got wrong in a copy and the part §8.2 rule 5 most depends on.

**Adopt incrementally within this one prompt**, but adopt *all* of the matching
sites — leaving half converted is worse than either end state. If a site cannot
adopt cleanly, leave it, and **list it explicitly** in the recorded result with
the reason.

**Do not touch `role` values in this prompt.** Every site keeps the role it has
today, even where that means `FormStatus` is called with `role="alert"` at nine
sites and `role="status"` at the rest. Normalising them is prompt 108, kept
separate so the accessibility decision is reviewed on its own rather than buried
in a twenty-file mechanical diff.

## Measurements

**The rendered output must be byte-identical at every adopted site.** The class
string, the element, the attributes and the conditional `mt-5 block` / `hidden`
switch all reproduce exactly. This is the acceptance condition and it is
checkable — diff the rendered markup, do not eyeball it.

## Expected impact

Twenty-odd leaves shorten by roughly ten lines each. One implementation of
§8.2 rule 5 instead of twenty. No visual change, no behavioural change.

## Prerender impact

`none — no route changes` **expected, and this is the prompt in the sequence
most able to break that**, because it edits `primitives.tsx`, which the
marketing routes import.

**Verify hard.** `npm run build`, confirm `/`, `/journal`, `/about`,
`/careers`, `/design-system` still `○ Static` and `/article/[slug]` (6) /
`/job-listing/[slug]` (3) still `● SSG`. Then **diff the prerendered HTML** of
all nine per `docs/automation.md` — with the standing warning in force: do not
quote a bare page-wide `magick compare -metric AE` for `/`, `/journal` or
`/careers`; mask the scrubbed capabilities cloth, the stamp perforation and the
marching dashes, and report the remainder and the box separately.

**If adding `FormStatus` to `primitives.tsx` would make any marketing route
carry client JavaScript it does not carry today, stop and report it.** Putting
it in a separate module is the fallback, and that is a judgement worth making
visibly rather than discovering in a bundle diff.

## Trust boundary

`none` — presentational. `FormStatus` renders a message a Server Action already
returned. It performs no validation and makes no authorisation decision; every
action keeps authorising server-side (§6.2).

## Secrets and data

None. **The component must never log the message it renders** — several of these
messages are formatted from user input (§8.3 rule 2).

## Non-goals

- **Do not normalise `role`** — prompt 108.
- **Do not extract `NETWORK_ERROR`** — prompt 106.
- **Do not add a `SelectField`** — prompt 107.
- **Do not remove `router.refresh()`** — prompt 109.
- Do not change any message text.
- Do not restyle. The class string is settled by twenty-nine existing uses.
- Do not touch `SiteFooter` or `SiteNav`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- The nine-route prerendered HTML diff described above — quote it
- `npm run test:e2e` — twenty authenticated leaves change at once and the domain
  tests see none of it. Quote the result, or **say plainly if the matrix could
  not run** rather than reporting this prompt as verified.

## Where the result is recorded

`docs/backend.md`, in the section covering the write-path UI. Record the
component's location and props, the per-site variance diff, every site adopted,
every site skipped and why, and the prerender diff result.

## SKILLS USED

- `vercel-react-best-practices` — the extraction itself, and keeping the client
  boundary from widening.
- `nextjs` — client leaves, `"use client"` placement, and whether
  `primitives.tsx` can host a client component without changing what the
  marketing routes bundle.
- `tailwind-4-docs` — the class string is reproduced verbatim; confirm nothing
  about v4's config-less `@theme` makes a moved utility resolve differently.

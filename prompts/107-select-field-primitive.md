# 107 — `primitives.tsx` has no `SelectField`, so fourteen selects are hand-styled

## Scope, and why it is next

Third of the shared-UI group. Independent of 105 and 106 in mechanism but
sequenced after them because it touches four of the same files and the smaller
diffs should land first.

`app/_components/primitives.tsx` exports `Field`, `TextareaField` and
`FileField` — verified this session at lines 274, 322 and 402 — but **no
`SelectField`**. So every `<select>` in the app is styled by hand, and four
files each declare their own copy of the class string:

- `app/_components/targets/create-target-form.tsx:22`
- `app/_components/activity/factor-import-form.tsx:73`
- `app/_components/activity/mapping-form.tsx:38`
- `app/_components/activity/custom-factor-form.tsx:93`

The string, read from the first of them:

```
mt-2 h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px]
text-ink outline-none transition-[border-color,box-shadow] focus:border-accent
focus:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed
disabled:bg-surface
```

The review counted fourteen hand-styled `<select>` elements across the app. The
missing primitive is the cause; the four copied constants are the symptom.

The cost is not only duplication. `Field` and its siblings carry the label, the
hint, the error, and the `aria-describedby` wiring that ties them together. A
hand-rolled `<select>` gets whatever its author remembered — which is how
accessibility contracts erode.

## Reference material read

- `app/_components/primitives.tsx:274-460` — `Field`, `TextareaField`,
  `FileField` in full: their props, their label/hint/error structure, their
  `describedBy` composition, their id generation
- The four `SELECT_CLASS` declarations above, compared for drift
- Every `<select>` in `app/` — to establish the true count and how many follow
  the same label/hint/error shape
- `app/design-system/page.tsx` — whether the exhibit shows the form primitives,
  and therefore whether a new one belongs in it
- AGENTS.md §7.5 — no second design system, no component library that is not
  these primitives

## What the implementation must do

1. **Verify the count and the drift first.** Enumerate every `<select>`, compare
   the four class strings byte for byte, and record any that differ. A silent
   difference is a design decision someone made and it must not be flattened
   without being named.
2. **Add `SelectField` to `primitives.tsx`**, matching its siblings exactly:
   the same prop shape, the same label/hint/error structure, the same id and
   `aria-describedby` wiring, the same disabled treatment. It should read as
   though it had always been there — a reviewer comparing it to `Field` should
   find no gratuitous difference.
3. **Adopt it at every `<select>` whose shape matches**, and delete the four
   constants. Any select that does not fit — a bare inline one with no label,
   say — is left alone and **listed** with the reason.
4. **Decide about `/design-system`.** The exhibit is a **prerendered marketing
   route** (`○ Static`, §8.1). If it shows the other form primitives, adding
   `SelectField` to it changes that page's markup — which §8.1 puts out of scope
   *unless the prompt says so up front and the user approves*. **This prompt
   says so now**: adding the new primitive to the exhibit is **in scope and
   approved**, because a primitive absent from the exhibit is how the next
   session concludes there isn't one and hand-rolls a fifteenth select. Every
   other prerendered route stays byte-identical.

## Measurements

The class string is the measurement, and it is taken from the existing four
declarations rather than re-derived. **Every adopted select must render
byte-identically** to what it renders today — same classes, same height, same
focus ring. Diff the markup; do not eyeball it.

## Expected impact

One new primitive. Four constants deleted, fourteen (or however many the count
establishes) selects re-expressed. `/design-system` gains a section. No visual
change anywhere.

## Prerender impact

**`/design-system` changes** — stated up front and approved above. Its markup
gains the new exhibit section; it stays `○ Static`.

Every other route is unchanged and must be **verified**: `npm run build`,
confirm `/`, `/journal`, `/about`, `/careers` still `○ Static` and
`/article/[slug]` (6) / `/job-listing/[slug]` (3) still `● SSG`, then diff the
prerendered HTML of those eight per `docs/automation.md` and show them identical.
The standing warning applies to `/`, `/journal` and `/careers` — mask the moving
boxes and report the remainder separately.

## Trust boundary

`none` — presentational. A `<select>`'s value is still validated server-side by
the same Zod schema at stage **c** (§10 rule 1); a client-side control is never
the check.

## Secrets and data

None. No option list in this change contains personal data; the primitive
receives its options as props.

## Non-goals

- **Do not restyle the select.** Reproduce the existing string.
- **Do not change any other primitive.** `describedBy` dedupe is prompt 110 and
  the `secondary`/`compact` collapse is prompt 111.
- Do not add any other missing primitive, however tempting.
- **Do not touch `SiteFooter` or `SiteNav`** — settled surfaces.
- Do not change `/design-system` beyond adding the new primitive's section.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Prerendered HTML diff of the eight unchanged routes — quote it
- `npm run test:e2e` — the selects sit in authenticated forms. Quote the result
  or say plainly if the matrix could not run.

## Where the result is recorded

`docs/backend.md` for the form-side adoption, **and** `docs/site-affordances.md`
or the nearest doc owning `primitives.tsx` for the new primitive itself and the
`/design-system` addition — name whichever it is in the index at the top of
AGENTS.md, adding a row only if a genuinely new file is needed.

## SKILLS USED

- `tailwind-4-docs` — v4 is config-less with tokens in `@theme`; the class
  string uses `var(--color-accent)` inside an arbitrary shadow value and
  `border-border` / `bg-surface` tokens, all of which must resolve identically
  from the new location.
- `nextjs` — client/server boundary; whether `SelectField` needs `"use client"`
  and what that means for `/design-system` staying static.
- `vercel-react-best-practices` — prop shape and avoiding a needless client
  boundary.
- `frontend-design:frontend-design` — the exhibit section is design work under
  the front matter's rules, not scaffolding.

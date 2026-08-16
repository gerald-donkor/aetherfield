# 110 — `describedBy` is composed three times in `primitives.tsx`

## Scope, and why it is next

Small, contained, and sequenced after 107 because that prompt adds a fourth
field primitive to the same file — which would otherwise become a fourth copy of
this expression the moment it lands.

**107 must be committed before this prompt runs**, so the dedupe covers
`SelectField` too and the count goes from four back to one.

`app/_components/primitives.tsx` composes the `aria-describedby` id list three
times, verified this session:

- `:289` in `Field` — `[props["aria-describedby"], hintId, errorId]`
- `:338` in `TextareaField` — identical
- `:425` in `FileField` — `[props["aria-describedby"], hintId, statusId, errorId]`

Consumed at `:310`, `:360` and `:447` respectively as
`aria-describedby={describedBy || undefined}`.

Two are byte-identical; the third inserts `statusId` before `errorId`. So it is
not a pure three-way duplication — a shared helper has to accommodate a variable
number of ids while keeping their **order** stable, because that order is the
order a screen reader reads the descriptions in.

This is the accessibility wiring that makes the field primitives correct. One
implementation is worth having for the same reason `FormStatus` is (105).

## Reference material read

- `app/_components/primitives.tsx:274-460` — `Field`, `TextareaField`,
  `FileField` in full: id generation, hint and error rendering, and the three
  `describedBy` compositions with their surrounding context
- `SelectField` as added by prompt 107
- `app/design-system/page.tsx` — the exhibit, to confirm the fields' rendered
  output is pinned there and will catch a regression

## What the implementation must do

Extract one small helper that takes the ids in order and returns the string or
`undefined`, and call it from all four primitives.

**Preserve the exact id order at every call site.** `FileField`'s
`hintId, statusId, errorId` is not an accident — the status describes the chosen
file and belongs before the error. A helper that sorts, dedupes, or reorders is
wrong.

**Preserve the `|| undefined` behaviour.** An empty string as
`aria-describedby` is not the same as omitting the attribute, and the current
code is careful about it. Whether the helper returns `undefined` itself or the
call sites keep the `||` is a judgement — pick one, apply it uniformly, say
which.

**Handle the falsy-id case identically.** The current expression relies on
`filter(Boolean)`-style behaviour over a sparse array where `hintId` or
`errorId` may be absent. Read exactly what the current code does — including
whatever sits between line 289 and line 291, which the grep did not show — and
reproduce it, rather than writing a helper that is merely similar.

Keep it in `primitives.tsx`. It is an implementation detail of four
neighbouring components and does not want a module.

## Measurements

**Every field's rendered `aria-describedby` must be byte-identical**, for every
combination of hint present/absent, error present/absent, status present/absent,
and a caller-supplied `aria-describedby` present/absent. That is the acceptance
condition. Enumerate the combinations and check them; do not spot-check one.

## Expected impact

Three (four after 107) expressions become one helper and four calls. No rendered
output changes anywhere.

## Prerender impact

**`/design-system` renders these primitives and is `○ Static`** — its
prerendered HTML must come out **byte-identical**. So must `/careers` and
`/job-listing/[slug]`, and any other prerendered route rendering a `Field`.

`npm run build`, quote the route table, then **diff the prerendered HTML of all
nine routes** per `docs/automation.md` and show them unchanged. The standing
warning applies to `/`, `/journal` and `/careers` — mask the moving boxes,
report the remainder and the box separately. A non-empty diff on
`/design-system` means the extraction changed output and the prompt has failed.

## Trust boundary

`none` — presentational. Field values are validated server-side by the shared
Zod schema regardless of what the client renders (§10 rule 1).

## Secrets and data

None.

## Non-goals

- **Do not change any id's value or generation.**
- **Do not reorder ids.**
- **Do not touch `secondary`/`compact`** — prompt 111, same file, separate
  commit.
- Do not change the hint or error rendering, or any label wiring.
- Do not add a fifth primitive.
- **Do not touch `SiteFooter` or `SiteNav`.**

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it; `/design-system` byte-identical
  is the specific evidence this prompt needs
- The combination enumeration described under Measurements

## Where the result is recorded

The `docs/` file that owns `primitives.tsx` — named from the index at the top of
AGENTS.md rather than assumed. Record the helper, the preserved id order, the
combination check, and the `/design-system` diff result.

## SKILLS USED

- `vercel-react-best-practices` — prop composition and avoiding a behaviour
  change in a shared component.
- `nextjs` — these primitives render on prerendered routes; confirm nothing
  about the extraction moves a boundary.

No installed skill covers ARIA. `aria-describedby`'s multiple-id semantics and
the significance of id order are read from the ARIA specification **fetched this
session** (§12 rule 2); cite the source and date in the recorded result.

# 116 — `TEAM` is twelve positional tuples living in a component file

## Scope, and why it is next

Second-to-last of the marketing-site group. Independent of the others; sequenced
after 114 so both `/about` edits do not collide.

`app/_components/about/sections.tsx:294-309`:

```ts
const TEAM = [
  ["Eunji Park", "Founder", "e.park@aetherfield.com"],
  ["Al Gorithm", "Senior Systems Architect", "a.gorithm@aetherfield.com"],
  …
] as const;
```

Twelve rows, each a positional `[name, title, email]` tuple. Two problems, and
they are separate:

1. **Positional tuples.** `row[0]`, `row[1]`, `row[2]` at the render site. A
   transposed pair puts a job title in the email column and nothing catches it —
   not TypeScript, since all three are strings. Twelve rows of three
   interchangeable strings is exactly the shape that rots quietly.
2. **Page content in a component file.** `ARTICLES` and `JOBS` live in
   `app/_content/`, and AGENTS.md §8.1 makes that placement a standing decision
   ("**ARTICLES and JOBS stay as typed constants in `app/_content/`**"). `TEAM`
   is the same kind of thing in a different place.

One detail must survive intact — the comment at lines 303-304:

```
// "Earth Systems Research" and "Earth Systems Researcher" are both in the
// comp, on consecutive rows. Transcribed as drawn.
```

That is a recorded comp transcription decision. Under the front matter's
"record, don't chase" rule it is **not** a typo to fix, and a move that quietly
normalises the two titles would destroy the record.

## Reference material read

- `app/_components/about/sections.tsx:290-330` — `TEAM` and `TeamTable` in full,
  including the render site and how the tuples are destructured
- `app/_content/articles.ts` and `app/_content/jobs.ts` — the established shape
  for site content: named fields, exported types, file layout, comment style
- `docs/about.md` — `/about`'s sections and the team table's measured geometry
- AGENTS.md §8.1 — the standing decision about `app/_content/`
- The front matter's content conventions — straight apostrophes throughout,
  which `["Will O'Watt", …]` depends on

## What the implementation must do

1. **Move `TEAM` to `app/_content/`**, in a file named to match the existing
   convention there.
2. **Convert the tuples to named fields** — `{ name, title, email }` — with an
   exported type, matching how `ARTICLES` and `JOBS` are declared. Update
   `TeamTable`'s render site to destructure by name.
3. **Carry the comp-transcription comment across verbatim**, attached to the
   same two rows.
4. **Preserve every string byte for byte.** Straight apostrophe in
   `Will O'Watt`. Exact email addresses. Exact titles, including the
   Research/Researcher pair. Exact row order — the table's order is the comp's.

**These are real-looking addresses on a public page.** They are fictional
personas for a portfolio site and are already published in the shipped HTML, so
moving them between source files changes nothing about their exposure. Do not
add any new personal data, do not add a real address, and do not introduce any
field the page does not already render (§8.3 rule 1).

## Measurements

None taken. The team table's geometry is recorded in `docs/about.md` and **is
not touched** — this prompt moves a data declaration and renames its access
pattern. Not one class, spacing value or column width may change.

## Expected impact

`sections.tsx` loses sixteen lines. A new `app/_content/` module. **`/about`'s
prerendered HTML byte-identical.**

## Prerender impact

`none — no route changes`. `/about` stays `○ Static` and its HTML must come out
**byte-identical** — that is the acceptance condition and it is a strong one,
because any transposed field or altered string shows up immediately in the diff.

`npm run build`, quote the route table, diff all nine routes per
`docs/automation.md`. `/about` has no moving element, so its diff must be
**exactly zero** and must be quoted as such. Standing warning still applies to
`/`, `/journal` and `/careers`.

## Trust boundary

`none` — static content on a prerendered page. No form, no input, no request
path.

## Secrets and data

No environment variable. The email addresses are fictional personas already
present in the shipped HTML; **no new personal data is collected, stored,
transmitted or logged**, and none may be added.

## Non-goals

- **Do not "fix" "Earth Systems Research" / "Earth Systems Researcher".**
  Transcribed as drawn; the comment says so.
- **Do not change any name, title, email or row order.**
- **Do not restyle `TeamTable`** or touch its geometry.
- Do not move any other content out of `sections.tsx` in this prompt — if other
  page content is sitting in that file, **report it** and let it be its own
  prompt (§12 rule 9).
- Do not add fields the page does not render — no photo, no bio, no social link.
- Do not introduce curly quotes anywhere.

## Checks

- `npm run lint`
- `npm run typecheck` — the named-field conversion's main safety net
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it; **`/about` exactly zero**
- `grep` the built output for one distinctive string (`Will O'Watt`) and confirm
  the straight apostrophe survived

## Where the result is recorded

`docs/about.md` — it owns `/about`. Record the move, the new module's path, the
named-field shape, and that the comp-transcription comment travelled with the
two rows it describes.

## SKILLS USED

- `nextjs` — `app/_content/` is a private folder convention (underscore-prefixed,
  not routable); confirm the new module cannot be mistaken for a route and that
  a server component importing it adds no client boundary.

No other installed skill covers this. The shape to match is established by
`app/_content/articles.ts` and `app/_content/jobs.ts`, read directly from the
repository rather than from any external source.

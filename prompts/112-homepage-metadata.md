# 112 — The homepage's browser tab reads "Aetherfield — Design System"

## Scope, and why it is next

First of the marketing-site group, and the only finding in the whole review that
a visitor to the shipped site can see.

`app/layout.tsx:24-28`:

```ts
export const metadata: Metadata = {
  title: "Aetherfield — Design System",
  description:
    "Foundations and components for Aetherfield, derived from the Styles reference.",
};
```

`app/page.tsx` exports **no `metadata`** — verified this session by grep. So the
root default applies, and the homepage's tab, its bookmark, its search result
and every social unfurl read as the internal styleguide.

The root default is a leftover from when `/design-system` was the only route.
Seven routes later it is the wrong default for all of them, and it happens to be
right for exactly one.

`/account` sets `title: "Account — Aetherfield"`, so the `"<Page> — Aetherfield"`
convention already exists in the repository.

## Reference material read

- `app/layout.tsx` — the whole file, including the font setup the metadata sits
  beside
- `app/page.tsx` — confirming no `metadata` export
- Every other route's `page.tsx` — to establish which already set their own
  metadata and which inherit the default. **This enumeration is the first task**;
  the finding is about the homepage but the blast radius is every route that
  inherits
- `app/account/page.tsx:41-44` — the existing naming convention
- `app/_content/` — the site's own copy, which is where the homepage description
  should be drawn from rather than invented
- `docs/chrome.md` — the site's voice and the wordmark

## What the implementation must do

1. **Enumerate which routes currently inherit the default.** Report the list.
   Any route inheriting "Aetherfield — Design System" has the same defect.
2. **Change the root default** to something correct for the site as a whole —
   the brand, not one page. Follow the existing `"<Page> — Aetherfield"`
   convention.
3. **Give `/` its own `metadata`**, with a title and a description drawn from
   the site's own positioning. §5 states the thesis and forbids re-deriving it;
   the homepage's existing copy in `app/_components/home/` is the source. **Do
   not write new marketing prose** — this is a metadata fix, not a copywriting
   exercise.
4. **Give `/design-system` its own `metadata`** carrying the string that is
   being moved off the root. It is the page that description was written for and
   it should keep it.
5. **Fix any other route the enumeration turns up**, using the same convention.
   If that is more than two or three, **stop and report** — it becomes its own
   prompt rather than swelling this one (§12 rule 9).

**Register.** §5: measured and operational, evidence-first. Never campaigning,
never startup-cheerful, never alarmist about climate. A description that reads
like a tagline is wrong here.

## Measurements

None. The title and description are **editorial judgements** (§12 rule 4) and
must be labelled as such. There is no comp for a `<title>`.

## Expected impact

**The prerendered HTML of `/` changes** — `<title>` and `<meta name="description">`.
Same for `/design-system` and any other route given metadata.

## Prerender impact

**Stated up front and requiring approval, per §8.1: this prompt changes the
prerendered `<head>` of `/`, of `/design-system`, and of any other route the
enumeration covers.** That is the deliverable, not a side effect.

What must **not** change: the render mode of anything. `npm run build`, quote
the route table, confirm `/`, `/journal`, `/about`, `/careers`,
`/design-system` still `○ Static` and `/article/[slug]` (6) /
`/job-listing/[slug]` (3) still `● SSG`.

And the **`<body>` must be byte-identical on every route.** Diff the prerendered
HTML per `docs/automation.md` and show the only differences are inside `<head>`.
Standing warning in force for `/`, `/journal` and `/careers`.

## Trust boundary

`none` — static metadata, no request path, no input.

## Secrets and data

None. **No `NEXT_PUBLIC_*` is introduced** — §8.4 records that phase one needs
none and that adding one is a decision to make a value public. Metadata strings
are literals in source, not environment values.

## Non-goals

- **Do not add Open Graph or Twitter card metadata, and do not generate an OG
  image.** Both are real gaps and both are worth doing — as their own prompt,
  with the design attention an OG image needs. Adding them here would smuggle a
  design deliverable into a one-line fix.
- **Do not add a favicon, `metadataBase`, canonical URLs, or robots directives.**
- Do not change any visible on-page copy.
- Do not touch the font setup in `layout.tsx`.
- **Do not touch `SiteFooter` or `SiteNav`.**

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it, and show `<body>` unchanged
  everywhere
- Quote the resulting `<title>` of each affected route from the built output —
  that is the direct evidence the fix worked

## Where the result is recorded

`docs/chrome.md` — it owns the site chrome and the wordmark, and the tab title
is chrome. Record the enumeration of inheriting routes, each new title and
description, that they are editorial judgements, and the deliberate deferral of
OG metadata to its own prompt.

## SKILLS USED

- `nextjs` — the Metadata API: static `metadata` versus `generateMetadata`,
  how route metadata merges with the root default in Next 16, and the title
  template option if it turns out to fit the convention better than repeating
  the suffix.
- `frontend-design:frontend-design` — the title and description are voice work
  and the register is measured (§5).

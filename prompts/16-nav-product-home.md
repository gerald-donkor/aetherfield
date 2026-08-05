# 16 — Point the navbar's "Product" link at the home page

## Scope

One line of data in `app/_components/chrome.tsx`. `NAV_ITEMS`' first entry still
carries the placeholder `href: "#"` it was authored with:

```ts
const NAV_ITEMS = [
  { label: "Product", href: "#" },
  ...
```

Product is the last nav item without a destination (AGENTS.md records this in
both the `/careers` and `/about` notes: "Product and About are still the only
unbuilt destinations", then "Only Product still sits on `#`"). There is no
`/product` route and none is in scope here, so the link resolves to the home
page.

## Change

`app/_components/chrome.tsx:11` — `{ label: "Product", href: "/" }`.

Nothing else. `NAV_ITEMS` is consumed by three places and all three follow
automatically:

- the desktop nav (`chrome.tsx:51`) — a `next/link`, so it gets client-side
  navigation to `/` for free;
- the mobile panel (`chrome.tsx:95`) — same `Link`, and its existing
  `onClick={() => setOpen(false)}` already closes the overlay on navigation;
- the footer nav (`chrome.tsx:155`) — **maps labels only** and hardcodes
  `href="#"` for every item, so it is untouched by this change and stays as it
  is. Wiring the footer's links is a separate decision (it would change the
  settled `SiteFooter`, which AGENTS.md marks do-not-restyle) and is explicitly
  **out of scope**.

## Non-goals

- No new `/product` route, no `SiteNav` restyle, no footer edits.
- No active/current-page styling for the nav item.

## Expected impact

Every page renders `SiteNav`, so the prerendered HTML for `/`, `/journal`, the
six articles, `/careers`, the three job listings, `/about` and `/design-system`
each gain exactly one diff: the desktop and mobile Product `<a href="#">`
becoming `<a href="/">`, with the same class string. No layout row moves at any
breakpoint — the label's text and type are unchanged, so no measurement against
the comps is needed.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Manually: click **Product** in the desktop nav and in the mobile panel at 375
  and confirm it lands on `/` (and that the mobile panel closes).

Then update AGENTS.md — the two lines that say Product is the one nav item still
on `"#"` (the `/careers` and `/about` sections) — and commit to `main`.

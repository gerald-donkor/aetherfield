# 03 — Wire the nav to real routes

## Why

`/journal` ships (commit `49c9f9c`) but nothing links to it. Every item in
`NAV_ITEMS` is still `href="#"`, so the **Journal** link in the header nav — the
one circled in the user's screenshot — goes nowhere.

## Scope

Routing only. No visual change at any breakpoint: same markup, same classes,
same type, same hover states. If a screenshot diff of `/` shows any pixel move,
something is wrong.

## Files

- `app/_components/chrome.tsx` — `SiteNav` (and the footer's Journal link, see
  "Decision needed" below)

Nothing else. Do not touch `app/_components/journal/sections.tsx`,
`app/_components/home/sections.tsx`, or the journal page.

## What to do

### 1. Give `NAV_ITEMS` hrefs

Replace the string tuple with an object list so a label and its route travel
together:

```tsx
const NAV_ITEMS = [
  { label: "Product", href: "#" },
  { label: "Journal", href: "/journal" },
  { label: "About", href: "#" },
  { label: "Careers", href: "#" },
] as const;
```

`Product`, `About` and `Careers` stay `"#"` — those pages do not exist yet, and
linking them to 404s is worse than linking them nowhere. They get real hrefs in
the prompt that builds them.

Update both `.map()` calls in `SiteNav` (the desktop `<nav>` and the mobile
panel) to read `item.label` / `item.href` and key on `item.label`.

### 2. Use `next/link` for internal routes

Per `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`,
`<Link>` is the way to navigate between routes — a bare `<a>` forces a full
document load and gets no prefetch. `SiteNav` is already `"use client"`, so
importing it is free.

The placeholder `"#"` items are not routes. Rather than branch per item, render
every nav item with `<Link>`: `href="#"` on a `<Link>` behaves as an in-page
anchor and Next.js will not prefetch it. Keep the `className` strings byte-for-byte
as they are today.

### 3. Close the mobile panel on navigation

The mobile menu is `useState` in `SiteNav`. Navigating client-side does not
unmount it, so tapping **Journal** would land on `/journal` with the menu still
open over the page. Add `onClick={() => setOpen(false)}` to the mobile panel's
links. Desktop links need nothing.

### 4. Wordmark to `/`

`<Wordmark />` in the header is inert text. Wrap it in a `<Link href="/">` with
an accessible label ("Aetherfield, home") so the logo behaves the way every
visitor expects. The wrapper must not add padding, margin or display changes —
`Wordmark` keeps its own `text-[26px]`.

Do **not** touch the footer's oversized SVG wordmark; it is settled artwork, not
navigation.

## Decision needed before executing

The footer nav in `SiteFooter` renders the same `NAV_ITEMS` list, so its
**Journal** link is dead too. `AGENTS.md` says the footer is settled and to ask
before editing it. What is proposed here is a link target, not a restyle: the
`<a>` becomes a `<Link>` with the same `className`, so the yellow field, the
olive ink, the fabric band and the wordmark are all untouched and the rendered
footer is pixel-identical.

Reply `y` to approve including the footer link; say "header only" to leave the
footer's Journal link dead for now.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Manually: from `/`, click **Journal** in the header → lands on `/journal`
  without a full page reload. Same at 375px through the mobile menu, and confirm
  the menu is closed on arrival. Confirm `/` looks unchanged at 375 / 800 / 1280.

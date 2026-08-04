# 04 — Article page (`/article/[slug]`) + article links

Build the article reading page from the comps in
`public/assets/pages/03-article1/screen-sizes/` (`Desktop.png` 1280w,
`Tablet.png` 800w, `Mobile.png` 375w — all 1x, so comp pixels are CSS pixels),
and point the existing article lists at it.

The first route is `/article/how-to-build-a-climate-ready-data-stack`.

## Scope

1. A shared article content module, so one list feeds `/`, `/journal` and the
   article route.
2. `app/article/[slug]/page.tsx` — the reading page, statically generated.
3. Wire the homepage "From the journal" rows and the `/journal` grid to
   `/article/<slug>`.
4. The hero asset.

Out of scope: the `Product` / `About` / `Careers` routes, the footer's dead
Journal link, and any change to the homepage's or journal page's visual design.

## 1. Content module — `app/_content/articles.ts`

`ARTICLES` is currently duplicated: three entries in `app/_components/home/sections.tsx`
and six in `app/_components/journal/sections.tsx`, with the home three being the
journal's first three. Linking by slug needs one list, so lift it.

```ts
export type Article = {
  slug: string;
  title: string;
  category: string;
  readTime: string;
  description: string;
  src: string;
  alt: string;
};
```

Six entries, in the journal page's current order and with its current copy,
images and alt text — this is a move, not a rewrite. Slugs are the kebab-cased
titles, so entry one is `how-to-build-a-climate-ready-data-stack`.

Both section files import from here and drop their local constants. The home
list takes `ARTICLES.slice(0, 3)`, which is what it already renders. `Article`
in `app/_components/cards.tsx` becomes a re-export or an import of this type —
do not leave two competing `Article` types in the tree.

**This is a data move only.** `/` and `/journal` must render pixel-identically
afterwards; the only intended visual change is that rows and cards become
links. Verify before moving on.

The body of the one written article lives in the same module (`ARTICLE_BODY`
keyed by slug, or a `body` field on the entry — your call, but keep the list
usable by the cards without pulling prose in). Copy, verbatim from the comp:

- **Published** May 7, 2028 · **Author** Lana Terra
- Lede: *Climate action is only as strong as the data that informs it. But most
  data stacks weren't designed with emissions, supply chains, or climate
  modeling in mind. Teams are often stuck retrofitting existing systems or
  relying on brittle workarounds to generate insights. It's time to rethink our
  infrastructure—starting with the foundation.*
- Then five `h2` + paragraph sections: **Built for Another Era**, **Bridging the
  Gaps**, **Stack With Strategy**, **Bake in Flexibility**, **From Stack to
  Story**. Transcribe each paragraph from `Desktop.png` exactly, em dashes and
  curly apostrophes included.

## 2. The route

`app/article/[slug]/page.tsx`, a server component. Read
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` and
the dynamic-routes guide first — in this version `params` is a Promise and must
be awaited, and the route needs `generateStaticParams` to stay prerendered.

- `generateStaticParams` returns only slugs that have a body — one, today.
- Unknown slug → `notFound()`.
- `generateMetadata` sets `title: "<title> — Aetherfield"` and the article's
  description.

The other five articles will 404 until they are written. That is expected and
approved.

## 3. Page structure

Nav is `SiteNav` inside `Container`, exactly as `/journal` does it. Footer is
`SiteFooter`. **There is no `CtaBand` on this page** — the comp goes straight
from the recent-articles band to the footer.

### Masthead (white)

Centred, inside `Container`:

- Meta line `Insights · 4 min` — **serif, muted**, not the mono `Meta`
  primitive the cards use. Top of the type sits at y 143 (desktop and tablet),
  y 122 (mobile).
- Title, sans bold, centred, measured at **36 / 64 / 80px** at 375 / 800 / 1280
  with line-height ~1.0. No existing token steps that way, so add a
  `@utility` next to `display-fluid-h4` in `app/globals.css`:
  `36px`, `≥768px: 64px`, `≥1024px: clamp(64px, 6.25vw, 80px)` — 6.25vw hits
  exactly 64 at 1024 and 80 at 1280.

### Hero

Full container width, constant **62:25** aspect at every breakpoint (measured
1240×500 / 760×307 / 335×136). `priority`, since it is the LCP element.

### Body

A two-column grid on desktop only:

- **Desktop (lg):** an inner wrapper inset 80px inside the container, split
  `[260px, 740px]` with an 80px column gap — comp has the rail label at x 101
  and the body column at x 440…1180.
- **Tablet (md):** one column, inner inset 60px (comp body runs x 80…720).
- **Mobile:** one column, container gutter only.

The rail holds Published and Author as label-over-value pairs — that is the
existing `MetaPair` primitive (serif muted label, sans value). Check the value's
weight against the comp; if it reads bolder than `MetaPair` renders, add an
optional prop rather than restyling every existing use.

Below `lg` the rail is not a rail: the two pairs sit side by side in one row
above the lede (comp mobile puts Published at x 20 and Author at x 194).

Body column: lede paragraph, a hairline rule spanning the body column only
(desktop y 1119), then the five sections. Section headings are sans bold
`text-p1`; paragraphs are serif. Measure the leading — desktop line pitch is
28px against the design system's 24px `--text-p2` line-height, so the reading
column needs its own leading. Do not change `--text-p2` itself.

### Recent articles (surface band)

`bg-surface`, full-bleed. Heading **Recent articles** sans bold, with a
**View all articles** link — serif, underlined, pointing at `/journal`.

- Desktop / tablet: heading left, link right, on one line.
- Mobile: both centred, link under the heading.

Heading measures ~32 / 48 / 62px across the three comps; nothing in the scale
steps that way either, so add a second `@utility` or extend the first — say
which you did and why in a comment.

The three cards are the first three articles rendered with the existing
`ArticleCardStacked` (its 612:356 image ratio already matches the comp's
402×234 cells) in a 3-up grid on desktop, stacking on mobile, each linking to
its own `/article/<slug>`.

## 4. Hero asset

The comp's hero photograph — a person with a laptop, blue halftone over cream —
is not in `public/assets/images`. Approved approach: crop it out of the comp.

```
magick public/assets/pages/03-article1/screen-sizes/Desktop.png \
  -crop 1240x500+20+380 +repage \
  public/assets/generated/article-climate-hero.png
```

Keep PNG: the image is a hard halftone dot screen and JPEG will ring on it.
Check the file size; if it is heavy, try a quantised PNG before reaching for
JPEG. This is a 1x asset, so it will be soft on a 2x display — note that in
AGENTS.md as a known limitation with the recipe, the way the journal texture is
documented.

## 5. Linking

Every article row and card links to `/article/<slug>` with `next/link`:

- `app/_components/home/sections.tsx` — the "From the journal" `<li>` rows
  (currently `href="#"` on a bare `<a>`).
- `app/_components/journal/sections.tsx` — the six-card grid (currently
  `href="#"`).
- The article page's own recent-articles cards.

`ArticleCardStacked` already takes `href` and renders a bare `<a>`; switch it to
`next/link` so all three lists prefetch consistently.

## Checks

- `npm run lint`, `npm run typecheck`, `npm run build` — `/article/...` must
  appear in the route table as prerendered static, not dynamic.
- Screenshot the page at 375 / 800 / 1280 against the three comps and compare
  section boundaries: masthead type positions, hero band, the body rule, the
  surface band top and bottom, and the footer. Report the numbers, and say where
  they miss.
- No horizontal scroll at 320 / 375 / 800 / 1280.
- `/` and `/journal` unchanged apart from the new links.

## Known constraints to respect

- `Container`'s `lg:px-6` gives a 24px desktop gutter where the comps use 20px.
  That deviation already ships on `/` and `/journal`; do not fork `Container` to
  fix it here.
- `--text-p1` / `--text-p2` are a fixed 20px, so mobile body copy runs larger
  than the comp, as recorded in AGENTS.md. Same call as the journal page:
  follow the system, do not special-case this page.
- `SiteFooter` is settled. Render it, don't touch it.

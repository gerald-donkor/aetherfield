# 10 — About page (`/about`)

Build the About page at `/about` and point the header's **About** nav item at it.
The comp is `public/assets/pages/09-about/screen-sizes/{Desktop,Mobile,Tablet}.png`
(1280×4216 / 375×4774 / 800×4041).

This is a **new route with new sections**, unlike articles 2–6 which were data
changes. It reuses `SiteNav`, `Container`, `CtaBand` and `SiteFooter` as-is, and
adds one section file plus one generated hero portrait.

---

## 1. Files

| file | change |
| --- | --- |
| `app/about/page.tsx` | new — assembles the sections |
| `app/_components/about/sections.tsx` | new — `AboutHero`, `Values`, `FounderStory`, `TeamTable` |
| `app/_components/chrome.tsx` | `NAV_ITEMS` About → `/about`; `CtaBand` gains a `tone` prop |
| `app/_components/primitives.tsx` | add `ButtonLink` (the `Button` look on an `<a>`) |
| `app/_components/home/sections.tsx` | `export` the existing `PRINCIPLES` constant |
| `public/assets/generated/about-founder.png` | new — blue halftone cut-out portrait |

No changes to `SiteFooter`, the type scale, or any settled page's rendered
output. Exporting `PRINCIPLES` is additive; `/` must be pixel-identical after.

---

## 2. Page order

1. **Hero** — sky band with the floating Forecast card, mission copy beside it
2. **Our values** — heading + three cards
3. **Founder's story** — halftone portrait + seal + copy
4. **Meet the team** — full-bleed surface panel with the roster table
5. **`CtaBand`** — "We're hiring! Want to join the team?" / "View open roles"
6. **`SiteFooter`**

---

## 3. Measured geometry

All numbers below were read off the comps with pixel probes and
`-connected-components`, at 375 / 800 / 1280.

### 3.1 Hero sky band

| | mobile | tablet | desktop |
| --- | --- | --- | --- |
| band | `375×320 +0+0` | `800×480 +0+0` | **`632×800 +0+0`** |

Full-bleed from the page top on mobile and tablet; on desktop it is the **left
half only** — 632 of 1280 = **49.375 %**. Like the homepage sky it must be a
document-level `absolute inset-x-0 top-0 -z-10` sibling, **not** a child of a
`relative isolate` wrapper: `SiteNav` is sticky and any positioned ancestor
unpins it. Reuse the `hero-sky` utility unchanged.

Sampling the comp's gradient at 0/25/50/74/99 % of each band: all three artboards
pass through exactly `#D3E3EF` at 50 %, and the desktop band runs
`#AAD4FE → #FEF4DF`, which is `hero-sky` (`#ABD4FE → #FEF3DF`) to within a level.
The tablet and mobile artboards compress the range around that same midpoint
(tablet foot `#E8EBE7`, mobile foot `#F0EEE4`) — the designer re-fitted the
gradient per artboard. **Use the shared token and record the drift**; do not add
a second sky utility for it. Report the measured foot colour per breakpoint.

### 3.2 Forecast card

The card is **centred in the sky band at all three breakpoints** and scales with
it — it is not a per-breakpoint layout:

| | box | band | width ÷ band | aspect |
| --- | --- | --- | --- | --- |
| mobile | `269×96 +53+112` | 375×320 | 0.717 | 2.80 |
| tablet | `574×204 +113+138` | 800×480 | 0.718 | 2.81 |
| desktop | `460×164 +86+318` | 632×800 | 0.728 | 2.80 |

`(375−269)/2 = 53`, `(320−96)/2 = 112` — exact at all three, horizontally and
vertically.

So build it as an **`@container` component sized in `cqw`**, the way
`HeroDashboard` is: one panel at **71.8 % of the band width**, aspect **2.80**,
with everything inside in `em` against a `1cqw` root. Interior, measured:

- square photo thumbnail at **31.3 %** of card width (`144/460`, `180/574`,
  `85/269`), inset **~2.1 %** from the card's edges (10 / 12 / 5 px)
- photo is `/assets/images/Image-7.png` — the same one the dashboard's Forecast
  tile and the impact article's card already use
- `Forecast` pill: `bg-brand` / `text-brand-ink`, mono
- headline "You're 16% off your 2027 emissions goal", sans bold
- footer line "Adjust your targets →", mono, muted

Behind it sits a **second sheet**, inset on both sides and peeking below the
card, giving the stacked-paper look, plus a soft drop shadow. Measure the
inset and the peek off `Desktop.png -crop 640x260+0+300` before writing it;
do not eyeball.

Reuse the Forecast tile's markup from `home/dashboard.tsx` as the starting
point, but **do not import it** — the dashboard tile is a fixed-height grid
cell inside the hero mockup and this is a standalone panel with a different
aspect and an extra footer line. Copying ~20 lines is cheaper than making that
tile configurable for one caller.

### 3.3 Hero mission column

Desktop: text column runs **x 712 → 1256**, i.e. **544 wide**, right-aligned to
the page gutter. `Container` content is 24…1256, so this is
`lg:grid lg:grid-cols-[1fr_544px]` — the 1fr column absorbs the gap.

Below `lg` the layout stacks: sky band + card on top (full-bleed), then the
mission block in the white area beneath it.

Content:

- eyebrow `Our mission` — serif, `text-p2`, muted
- headline `Climate action starts with better information. We help organizations
  turn complex data into measurable, meaningful change.` — sans bold,
  `display-fluid-h4`
- `Meet the team` — primary `Button` with the bullet, linking to `#team`

Measured headline line pitch: **24 / 32 / 40**. `display-fluid-h4` steps
**24 / 30 / 40**, so tablet runs 2px tight. Take the utility — a third heading
curve for one 2px difference is not worth it. Record it.

`Meet the team` is a link, not a form control, so add **`ButtonLink`** to
`primitives.tsx`: an `<a>` carrying the exact `Button` class string (extract the
shared classes into a constant so the two cannot drift). Do **not** nest a
`<button>` inside an `<a>`.

### 3.4 Our values

- heading `Our values`, centred, sans bold, `display-fluid-h4` (cap heights
  measured 19 / 23 / 30 → 24 / 30 / 40, the utility's curve exactly)
- three cards, `bg-surface`, `rounded-card`:

| | boxes |
| --- | --- |
| desktop | `403×246` at x **20 / 439 / 857**, y **1000** — 16px gutter |
| tablet | `760×222 +20+982`, `+20+1220`, `+20+1458` — stacked, 16px apart |
| mobile | `335×246 +20+684`, `335×290 +20+946`, `335×294 +20+1252` |

The 16px desktop gutter is the same one `RecentArticles` already uses
(`lg:gap-x-4`). Cards will render 400 wide against the comp's 403 because
`Container`'s desktop gutter is 24 and the comp's is 20 — the drift already
recorded for the article page. Record, don't chase.

Card interior: 48px outlined icon, then title (sans, `text-p1`, bold), then body
(serif, `text-p2`).

**The three items are verbatim the homepage's `PRINCIPLES`** — same titles,
same bodies, same three icons (crosshair circle, globe, arrow-up-right circle).
Export that constant from `home/sections.tsx` and consume it here rather than
retyping the copy. The heading, background and card fill differ; the data does
not.

### 3.5 Founder's story

| | portrait |
| --- | --- |
| desktop | **`612×700 +20+1406`** |
| tablet | `372×426 +20+1795` (verify) |
| mobile | full-gutter width, above the copy |

Desktop text column starts at **x 753** (gap ~120 from the portrait) and the
body wraps at ~400px, so `lg:grid-cols-[612px_1fr]` with a ~120px gap and the
copy capped around 400px. Tablet keeps the two columns; mobile stacks with the
portrait on top.

Copy:

- eyebrow `Founder's story` — serif, `text-p2`, muted
- name `Eunji Park` — sans bold, **`display-band-h2`** (cap heights measured
  24 / 37 / 44 → 32 / 50 / 60, which is that utility's curve exactly)
- body — serif, `text-p2`:
  > Eunji founded Aetherfield with one goal: to help companies take climate
  > action without waiting for a perfect plan. With a background in
  > environmental systems and software design, she's spent the past decade
  > building tools that turn impact goals into real-world outcomes. She still
  > insists on biking to every investor meeting.

#### The seal

An `Aetherfield` mark overlaps the portrait's top-left corner and **hangs off
the left page gutter** — the same trick `JournalMark` uses on the homepage
(`md:-ml-24`). Measured on the desktop comp: visible box **x 0…277, y 1327…1478**,
clipped at the canvas edge; the mark's centre sits at x ≈ 148, so roughly 20px
of it is off-page. Right-tip crossings at the vertical centre are at
**x 26 / 65 / ~104 / 190 / 229 / 272**, i.e. concentric ellipses of
**rx ≈ 123 / 82 / 43** about that centre, with tops at y ≈ 1330 / 1338 / 1341 /
1347.

It is **not** the homepage's diamond `JournalMark` — it is a set of concentric
ellipses of decreasing width and increasing height (widest is flattest), with
`earth` at the top, `data` at the right, `tech` at the left (clipped to "ch"),
`Aether` / `field` set in accent-blue sans bold across the middle, and `®` low
and centred.

Build it as **`AetherfieldSeal`, one scaling SVG on a single measured
`viewBox`**, in the same spirit as `JournalStamp` on `/journal`: nothing sized
per breakpoint. Before writing it, fit the ellipse radii and the type positions
against `Desktop.png -crop 300x170+0+1320` scaled 3×, and state the fitted
values in the code comment. Colour is `--color-accent` at ~1.5px stroke.

**The seal is dropped on mobile** — `Mobile.png` shows the portrait with no
mark over it. Hide it below `md`, as the homepage does with `JournalMark`.

#### `about-founder.png`

Source is **`public/assets/images/Image-1.png`** (768×768) — the portrait the
comp treats. The treatment is the article-2 composite adapted: blue halftone
subject, a rough white cut-out ring around the silhouette, over the **sky
gradient** (not cream). Three layers:

1. **mask** — threshold the studio backdrop, `Close`/`Open` to clean it, then
   floodfill from the corners so bright highlights in the hair and coat are not
   picked up. `-alpha off` first: these PNGs carry a 1-bit alpha that flattens
   greyscale probes to white. `-type TrueColor` before any coloured floodfill.
2. **ink** — greyscale, `-sigmoidal-contrast 8,50%`, `-ordered-dither h4x4a`,
   `+level-colors '#2683EB','#FFFFFF'` (`#2683EB` is `--color-accent`; no new
   token).
3. **field** — the sky gradient rendered to 612×700, with the white ring drawn
   as the mask dilated by the ring width before compositing.

Fit the **crop** with the honest metric from `AGENTS.md` §3: generate the
candidate through the full recipe and score it against the comp's hero crop,
both blurred and downsampled to ~124×50, sweeping coarse → fine → fine over
width / x / height / y. Fit the **ring width and backdrop threshold** against a
coverage fraction, not RMSE — downsampled RMSE cannot separate a flat field from
sparse halftone dots. Finish with `-colors 64 -define png:compression-level=9`.

Record the exact final `magick` command in `AGENTS.md`, and record honestly
whether the comp's silhouette is reproducible from the source or was hand-
composed in Figma, as articles 2 and 3 do.

### 3.6 Meet the team

Full-bleed `bg-surface` panel, `1280×1044 +0+2226` desktop / `800×955 +0+2306`
tablet / `375×1896 +0+2290` mobile. Give the section `id="team"` — the hero
button targets it.

- heading `Meet the team`, sans bold, **`display-band-h2`** (60 / 50 / 32,
  matching the measured cap heights 44 / 37 / 24)
- **desktop and tablet: a real `<table>`** — mono `text-caption` header row
  `Name` / `Title` / `Contact`, hairline `border-rule` under the header and
  under every row, ~55px row pitch. Name column at x 20, Title at x 433,
  Contact right-aligned to the gutter. Name is sans `text-p1` bold; Title and
  Contact are serif `text-p2`; Contact is a `mailto:` link, underlined.
- **mobile: the header row is dropped** and each person becomes a stacked block
  — name, title, email on three lines, hairline between people. Do this with
  responsive CSS on the same table (or a `<dl>`-style block list); do not ship
  two copies of the data.

Roster, transcribed from `Desktop.png`:

| Name | Title | Contact |
| --- | --- | --- |
| Eunji Park | Founder | e.park@aetherfield.com |
| Al Gorithm | Senior Systems Architect | a.gorithm@aetherfield.com |
| Cassandra Query | Head of Data Platforms | c.query@aetherfield.com |
| Sue Logic | Principal Software Engineer | s.logic@aetherfield.com |
| Dash Bordman | Product Manager | d.bordman@aetherfield.com |
| Greta Watt | Director of Climate Strategy | g.watt@aetherfield.com |
| Gail Force | Environmental Risk Analyst | g.force@aetherfield.com |
| Polly Nation | UX Designer | p.nation@aetherfield.com |
| Will O'Watt | Clean Energy Solutions Manager | w.owatt@aetherfield.com |
| Lana Terra | Earth Systems Research | l.terra@aetherfield.com |
| Ella Vation | Earth Systems Researcher | e.vation@aetherfield.com |
| Phil Scope | Lifecycle Assessment Lead | p.scope@aetherfield.com |

"Earth Systems Research" and "Earth Systems Researcher" are both in the comp on
consecutive rows. **Transcribe as drawn** — do not normalise them.

### 3.7 CTA band

`1280×358 +0+3270` desktop — the same box `CtaBand` already renders, but on
**white**, not `bg-surface`: the surface fill above it is the team panel and the
comp runs the CTA on the page background so the two read as separate blocks.

Add a `tone?: "surface" | "white"` prop to `CtaBand`, defaulting to `"surface"`
so `/` and every settled caller is untouched. Headline
`We're hiring! Want to join the team?`, action `View open roles`.

---

## 4. Nav

`NAV_ITEMS` in `chrome.tsx`: `About` → `/about`. Update the comment above it —
it currently explains that Product, About and Careers stay on `"#"`; after this
only Product and Careers do. The footer's link list is label-only pending
review, per the existing comment; leave it alone.

---

## 5. Verification

1. `npm run lint` and `npm run typecheck` — report exact output.
2. `npm run build` — confirm `/about` prerenders.
3. Screenshot the **production** build at 375 / 800 / 1280,
   `deviceScaleFactor: 1`, `fullPage: true`, per `AGENTS.md` §3 (drive
   `playwright-core` out of the npx cache; **check port 3000 first** and start
   on 3001 so the user's dev server is left alone).
4. Diff the connected-components box list of render against comp at each
   breakpoint (area threshold 15000 / 40000 / 25000). Report the sky band,
   Forecast card, values cards, portrait, team panel and CTA band boxes.
5. Confirm `/` is **pixel-identical** before and after — the `PRINCIPLES` export
   and the `CtaBand` prop must be inert there.
6. Confirm the sticky nav still pins on `/about` past the fold, and that `About`
   is the live route.

Expect the two inherited drifts already recorded in `AGENTS.md` — the wide
Archivo cut making prose wrap a line early, and the 20px `--text-p1`/`--text-p2`
floor making mobile run long. **Report them; do not chase them.**

---

## 6. After

Add an `## About page (/about)` section to `AGENTS.md` covering: the half-width
desktop sky band and why it is a document-level sibling; the Forecast card's
single `cqw` scaling rule (71.8 % of the band, aspect 2.80, centred) and the
per-breakpoint boxes that establish it; the `AetherfieldSeal` viewBox and its
fitted ellipse radii, plus that it is dropped on mobile; the exact
`about-founder.png` recipe with the load-bearing details and the fitted crop;
the shared `PRINCIPLES` data; the `CtaBand` `tone` prop; and the measured
deviations (tablet mission headline 32 vs 30, the 403→400 card width, the
tablet/mobile sky foot colour).

Then commit to `main`, unprompted. Do not push.

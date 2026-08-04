# 11 — Careers page (`/careers`)

Build the route the header's **Careers** link points at. Comps:
`public/assets/pages/10-careers/screen-sizes/{Desktop,Tablet,Mobile}.png`
(1280×1912 / 800×1802 / 375×1812).

Scope is one page plus the nav wiring. `SiteNav`, `Container` and `SiteFooter`
are reused as-is; there is **no `CtaBand`** — the last job card runs into the
footer, the same way `/article/[slug]` does.

---

## 0. Commit the pending article 4/5/6 work first

The tree currently carries the finished (and already documented) articles 4, 5
and 6 as uncommitted changes. Workflow step 10 says every executed prompt ends
in a commit, and leaving it uncommitted makes "what is already built?" resolve
wrong in the next session. So the first action is a commit of that work on its
own, before any careers code is written:

```
git add AGENTS.md app/_components/article/sections.tsx app/_content/articles.ts \
  prompts/09-articles-4-5-6.md public/assets/generated/article-*-hero.png \
  public/assets/pages/06-article4 public/assets/pages/07-article5 \
  public/assets/pages/08-article6 public/assets/pages/09-about \
  public/assets/pages/10-careers
git commit -m "Write articles four, five and six and generate their heroes"
```

(The `09-about` and `10-careers` comp folders come along as design source; the
about page is *not* in scope here.)

---

## 1. What the comp is

A single-column page over one full-height sky gradient, with four job cards.
No new photography, no generated assets, no `magick` — this is layout only.

```
┌──────────────────────────────────────────┐
│  SiteNav (sticky glass, gradient behind) │
│                                          │
│              Careers at        ← serif   │
│              Aetherfield       ← sans    │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │ UX Designer            [View role]│  │  white, radius 16
│   │ Contract · San Francisco, CA      │  │
│   │ <serif body>                      │  │
│   └──────────────────────────────────┘   │
│              …two more…                  │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│     Open application       [Apply now]   │  transparent, 1px black
│   │ Full-time · Denver, CO            │  │  dashes, radius 16
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                          │
├──────────────────────────────────────────┤
│  SiteFooter                              │
└──────────────────────────────────────────┘
```

### The background is `hero-sky`, stretched over the whole page

Sampled down the desktop comp's left gutter, the gradient is **exactly the
existing `hero-sky` utility**, run from the page top to the footer:

| y | comp | `hero-sky` stop |
| --- | --- | --- |
| 0 | `#A9D3FF` | `#abd4fe` @ 0 % |
| 490 (37 %) | `#C9DFF4` | `#c8dff3` @ 37 % |
| 980 (74 %) | `#E8EBE7` | `#e9ebe7` @ 74 % |
| 1323 (100 %) | `#FFF4DF` | `#fef3df` @ 100 % |

Within 1–2 levels at every stop. **Do not author a second gradient** — reuse
`hero-sky` and let it size to the element.

It must paint *behind* the sticky bar, so it cannot be a wrapper around
`SiteNav` (that unpins the bar the moment the wrapper scrolls off — the reason
already recorded for the homepage sky). Put it on `<main>` and pull `main` up
under the bar instead:

```tsx
<SiteNav />
<main className="hero-sky -mt-[60px] pt-[60px] pb-[120px]">…</main>
```

`main` is a *sibling* of the sticky header, so the bar stays pinned; `z-50` on
the header keeps it over the overlap. The gradient's 100 % stop then lands on
the footer's top edge, as in all three comps.

The 120px foot is measured: the gap from the dashed card's bottom border to the
footer is **121px at 375, 800 and 1280** — one of the few numbers this page
holds constant across breakpoints.

---

## 2. New `@utility display-careers-title` in `app/globals.css`

The masthead steps **36 / 64 / 80** — the same sizes as `display-article-title`
— but with a different, much tighter leading, so it is a separate utility
rather than `display-article-title` plus `leading-*` overrides (two same-weight
utility classes on one element leave the winner to source order, which Tailwind
does not pin down).

Measured baselines, line 1 → line 2: **29 / 59 / 77**.

```css
/* Careers masthead. Sizes are the article-title curve (36 / 64 / 80), but the
   comps set the two lines much tighter than that page does — baseline pitch
   measured 29 / 59 / 77, i.e. 0.81 / 0.92 / 0.96 em. The curve is not one
   ratio, so the leading is authored per step alongside the size. */
@utility display-careers-title {
  font-size: 36px;
  line-height: 29px;
  @media (width >= 768px) {
    font-size: 64px;
    line-height: 59px;
  }
  @media (width >= 1024px) {
    font-size: clamp(64px, 6.25vw, 80px);
    line-height: 77px;
  }
}
```

---

## 3. `app/_content/jobs.ts` — the listings

New content module, mirroring `app/_content/articles.ts`: the page renders a
list, so the list is data.

```ts
export type Job = {
  role: string;
  type: string;
  location: string;
  body: string;
  /** Label on the card's action. */
  action: string;
  /** The open-application card is drawn as a dashed outline, not a white card. */
  open?: boolean;
};
```

Transcribed from `Desktop.png` at 200 % zoom — **straight apostrophes**, per the
convention already recorded for the six articles:

1. **UX Designer** — `Contract` · `San Francisco, CA` — "Shape the tools that
   drive climate intelligence. You'll lead cross-functional teams to build
   thoughtful, scalable solutions for sustainability-forward organizations." —
   action `View role`
2. **Data Scientist** — `Full-time` · `Denver, CO` — "Help build the
   intelligence layer for climate action. You'll turn complex sustainability
   data into clear, actionable insights for enterprise teams." — `View role`
3. **Product Manager** — `Part-time` · `Seattle, WA` — same body as (1), which
   is what the comp repeats — `View role`
4. **Open application** — `Full-time` · `Denver, CO` — "Don't see your role
   available? Apply for an open application!" — `Apply now`, `open: true`

> **Flag, shipped as drawn:** the open-application card carries a real job's
> meta — "Full-time · Denver, CO" — which reads like comp placeholder left in
> by mistake. The comp is the source of truth, so it ships as written; say so
> in the completion report so the user can drop that line if they want.

---

## 4. `JobCard` in `app/_components/cards.tsx` — three edits

The component already exists (820×194, radius 16, `text-p1` bold role, `Meta`,
serif body, compact `Button`), built for the styleguide and rendered only
there. Careers is its first real use, so it gets fitted to the comp:

1. **Padding is `p-6 sm:p-10`, not a flat `p-10`.** Measured content inset:
   40px at 1280 and 800, **24px at 375** (mobile card `335×276+20+216`, first
   ink at x 44 / y 242, button bottom 467 against a card bottom of 492).
2. **Drop `ring-1 ring-border sm:ring-0`.** No comp ever showed it — at
   `p{19,300}` the mobile comp goes straight from sky to white with no ring
   row. Removing it also changes `/design-system`, which is the styleguide and
   should show what the page ships.
3. **Two new optional props: `action = "View role"` and `open = false`.**
   `open` swaps the white fill for the dashed outline (below).

### The dashed outline is an SVG, not `border-dashed`

Measured on the top border at y 1010: dashes run **7px on / 9px off, pitch 16,
solid black (`#000`), 1px, radius 16, and the interior is transparent** — the
page gradient reads through it identically inside and out (`p{640,1020}` ==
`p{100,1020}` == `#EBECE6`). CSS `border-dashed` gives Chrome's own ~2/2 pattern
at 1px and cannot be tuned, so draw the frame:

```tsx
<svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
  <rect
    x="0" y="0" width="100%" height="100%" rx="16"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeDasharray="7 9"
  />
</svg>
```

`strokeWidth="2"` with the rect on the viewport boundary is deliberate: the SVG
clips the outer half, leaving exactly the 1px the comp draws, with no fractional
`x="0.5"` / `calc()` geometry that browsers disagree on. The card wrapper becomes
`relative` and, when `open`, carries no `bg-white`.

---

## 5. `app/_components/careers/sections.tsx`

Follows the `journal/` and `article/` shape — the page file stays a composition,
the sections file holds the measurements.

**`CareersMasthead`** — the two-line title, centred, with a hard `<br>`:

```tsx
<h1 className="display-careers-title text-center font-serif">
  Careers at
  <br />
  <span className="font-sans font-medium">Aetherfield</span>
</h1>
```

The mixed setting is the page's one signature move and it is what the comp
draws: **line 1 is Newsreader, line 2 is Archivo** (verified on a 3× crop of
`Desktop.png -crop 400x150+450+140` — line 2 has Archivo's flat-terminal `a`
and the same `fi` ligature shape as the wordmark, at a much lighter weight than
the extrabold footer wordmark).

**`JobList`** — `max-w-[820px] mx-auto` inside `Container`, a `<ul>` of `<li>`
with a **16px gap** (`space-y-4`). 820 is the desktop cap; at 800 and 375 the
container gutters take over (760 and 335), which is exactly what the comp
measures.

---

## 6. `app/careers/page.tsx`

```tsx
export const metadata: Metadata = {
  title: "Careers — Aetherfield",
  description:
    "Open roles at Aetherfield — design, data, and product work on the tools that turn climate measurement into action.",
};
```

Body: `<SiteNav />` outside any wrapper, then the `hero-sky` `<main>` holding
`CareersMasthead` + `JobList` inside a `Container`, then `<SiteFooter />`.

---

## 7. `SiteNav` wiring

In `app/_components/chrome.tsx`, `NAV_ITEMS`: `Careers` moves from `"#"` to
`"/careers"`, and the comment above the list is narrowed to Product and About,
which are still the only unbuilt destinations. **Nothing else in `chrome.tsx`
changes** — not the glass, not the footer, and not the footer's `href="#"`
links (their targets are on hold pending review, per the existing comment).

---

## 8. Target geometry — what to verify against

Screenshot the production build at 375 / 800 / 1280 (`deviceScaleFactor: 1`,
`fullPage`) per the automation notes — check port 3000 first and run
`npx next start -p 3001` — then diff the connected-components box list against
the comps (area threshold 25000 / 40000 / 15000).

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| title line 1, cap top | y 149 | y 147 | y 123 |
| title line 1 / 2 ink width | 326 / 354 | 261 / 295 | 146 / 169 |
| card 1 box | `820×218+230+332` | `760×218+20+300` | `335×276+20+216` |
| card 2 box | `820×194+230+566` | `760×218+20+534` | `335×276+20+508` |
| card 3 box | `820×218+230+776` | `760×218+20+768` | `335×276+20+800` |
| dashed card | `820×194+230+1010` | `760×170+20+1002` | `335×218+20+1092` |
| footer top | y 1324 | y 1292 | y 1430 |

Fit the masthead's top padding and the title→list gap against the first two
rows, iterating on the screenshots; everything below follows from the 16px gaps
and the card padding.

### Deviations to expect and record rather than chase

- **Card role and body type.** The comp sets the desktop role at ~25px
  (cap 18) over a ~17px serif body (line pitch 24 measured, but the glyphs are
  smaller than 20px Newsreader draws). The system's `--text-p1` / `--text-p2`
  are a fixed 20px and every settled page ships that way, so the cards will run
  slightly larger and wrap differently. Same call as `/journal` and articles
  1–6. Mobile is closest to the comp (role cap 15.5 ⇒ ~20px there already).
- **The desktop dashed card is 194px tall in the comp but ~170 natural.** At
  800 the same card measures 170 and its padding closes exactly (top 40,
  bottom 41) on one body line; at 1280 the designer appears to have reused
  card 2's 194px frame, leaving 24px of unexplained air. Ship the natural
  height and note the 24px.
- Page height will drift from the comps for the two reasons already on file
  (the wide Archivo cut; the 20px `--text-p1` / `--text-p2` floor).

---

## 9. Checks and close-out

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. Screenshot-verify against section 8.
5. Add a `## Careers page (/careers)` section to `AGENTS.md`: the `hero-sky`-on-
   `main` trick and why it is not a wrapper, `display-careers-title` and its
   measured 29 / 59 / 77 leading, the mixed serif/sans masthead, the three
   `JobCard` edits, the SVG dashed frame with its `7 9` dash and
   `strokeWidth="2"` clipping trick, the constant 121px foot, and the
   deviations above. Add any repeated-by-hand step to section 3 (Automation).
6. Commit to `main` (do not push).

## Out of scope

`/about` (the `09-about` comp folder), the Product nav link, the footer's
`href="#"` links, and any change to the header glass or the footer.

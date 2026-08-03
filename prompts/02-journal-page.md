# 02 — Journal page (`/journal`)

Build the Journal index page from the comps in
`public/assets/pages/02-journal/screen-sizes/` (`Desktop.png` 1280w,
`Tablet.png` 800w, `Mobile.png` 375w).

Every number below was measured off those PNGs with pixel scans, not eyeballed.
Comp pixels == CSS pixels at each comp width.

---

## 0. Rules for this build

1. **Reuse the design system first.** `app/_components/primitives.tsx`,
   `cards.tsx` and `chrome.tsx` already carry the tokens for everything on this
   page. Add a prop to an existing component rather than forking it. Only write
   new components for things the system genuinely does not have (the stamp).
2. **`SiteFooter` is settled** (AGENTS.md). Import and render it. Do not touch it.
3. **`SiteNav` is reused as-is** — it is transparent and sits on white here.
4. Read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
   before writing any `<Image>`, and
   `.../01-getting-started/14-metadata-and-og-images.md` for the page metadata
   export. This Next.js is 16.2.12 — do not write from memory.
5. Light-only, no dark mode. No new npm dependencies.
6. Skills to run: `frontend-design` (already loaded, for judgement calls the
   comps leave open) and `vercel:react-best-practices` as a review pass over the
   finished TSX. No third-party skill needs installing — the brief is a fixed
   comp, so the design-generation skills on the marketplace (Taste, etc.) would
   only invent choices the comps already make.

---

## 1. Page shell

`app/journal/page.tsx` — a server component, no `"use client"`.

```tsx
export const metadata = { title: "Journal — Aetherfield", description: … };

<Container><SiteNav /></Container>
<main>
  <JournalStamp />
  <LatestArticles />
  <CtaBand headline="Subscribe to Aetherfield Journal" action="Sign up to newsletter" />
</main>
<SiteFooter />
```

`Container` is the existing export from `app/_components/home/sections.tsx`
(`max-w-page`, `px-5 lg:px-6`). Move nothing; import it. If the import path
reads oddly for a non-home page, that is acceptable — do **not** refactor
`sections.tsx` in this prompt.

New file for the page's own sections: `app/_components/journal/sections.tsx`.

---

## 2. The masthead stamp (the one new component)

The signature element. A full-container postage stamp: blue halftone-screened
fabric, perforated top and bottom edges, a hand-drawn inner rule frame, and a
lozenge holding the masthead.

### Geometry (measured)

| | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| stamp width | 1240 (gutter 20) | 760 | 335 |
| stamp height | 477 | 292 | 128 |
| aspect | 2.60 | 2.60 | 2.62 |
| perf pitch | 50 | 30.5 | 14 |
| perf radius | ~14.3 | ~7.5 | ~3.2 |
| inner frame inset | 20 | 12 | 6 |

Everything scales with the stamp width: the perforation **count is constant at
25**, the frame inset is a constant 1.6 % of width, the lozenge is 74.7 % wide
and 74 % tall, and the type inside it scales with the artwork (desktop
"Aetherfield Journal" ≈ 66 px → mobile ≈ 18 px, "earth/tech/data" 26 → 7 px).

So: **draw the whole stamp interior as one SVG** with
`viewBox="0 0 1240 477"` filling a wrapper with `aspect-[1240/477]`. One
artwork, three breakpoints, no per-breakpoint type sizing. This is the reason
the comps agree so exactly — treat any temptation to hand-size the type per
breakpoint as a signal you have drifted from the comp.

### Layers, bottom to top

1. **Fabric.** `<Image src="/assets/generated/texture-journal.png" fill
   className="object-cover" alt="" aria-hidden />`.
2. **SVG overlay**, absolutely positioned, `w-full h-full`, `aria-hidden` on the
   decorative parts:
   - **Perforations** — 26 white circles along `y=0` and 26 along `y=477`,
     `cx = 24.8 + 49.6n`, `r = 13.4`. Painted white (the page behind is white),
     which is simpler and pixel-identical to masking.
   - **Frame** — rectangle inset 20 from the stamp edge, `stroke="currentColor"`
     (ink), `stroke-width≈2.6`, `fill="none"`. Give the path a slight hand-drawn
     wobble (2–3 px of deviation across each run, drawn as an explicit path, not
     a `<rect>`) — the comp's rule is visibly not machine-straight.
   - **Lozenge** — a flattened diamond, tips at `x=180` and `x=1100`, apexes at
     `y=118` and `y=470` in a 1240×477 box, i.e. centred. The left and right
     tips are **rounded** (quadratic curve caps, radius ≈ 12), the top and
     bottom apexes are sharp. Same stroke as the frame.
   - **Type inside the lozenge**, all `fill="currentColor"`, centred with
     `text-anchor="middle"`:
     - `Aetherfield` / `Journal` — two lines, sans (`font-family:
       var(--font-sans)`), weight 700, size 66, baselines at y=272 and y=338.
     - `earth` (y=166), `tech` (x=268, y=305), `data` (x=1012, y=305) — serif
       (`var(--font-serif)`), size 26.
     - `®` — serif, size 26, y=438. Draw it as the glyph, not a nested circle.
   - The SVG carries `role="img"` and `aria-label="Aetherfield Journal"` on the
     outer element so the masthead is announced once; nothing inside repeats it.
3. Stamp sits directly under the 60 px nav with **no top margin** (comp: nav
   0–60, blue starts at exactly 60).

### The fabric texture

Generate `public/assets/generated/texture-journal.png` from the existing
`public/assets/images/Footer image.png` (3720×840 draped fabric — the same
source `texture-brand.png` was made from; the hero in the comp is that same
cloth, same diagonal fold direction, duotoned blue).

Recipe (ImageMagick is installed):

```
magick "public/assets/images/Footer image.png" \
  -colorspace Gray -resize 1800x692^ -gravity center -extent 1800x692 \
  -ordered-dither h8x8a \
  +level-colors '#4E9FF7','#C2E0FF' \
  public/assets/generated/texture-journal.png
```

Then **check it against the comp** by cropping
`Desktop.png -crop 500x200+700+80` and comparing: base blue should land near
`#73B9FF`, highlights near `#A8D3FF`, and the dot screen should be fine, not a
visible grid. Tune the dither matrix (`h4x4a`/`h8x8a`/`o8x8`) and the level
colours until it matches; do not ship the first render unchecked. Keep it under
~400 KB, matching `texture-brand.png`.

---

## 3. "Latest articles" grid

Section heading: `display-fluid-h4` (24 / 30 / 40 — already matches the comp's
measured 24 / 30 / 38-40), sans bold, centred, at all three sizes.

Spacing measured on desktop: stamp ends 537 → heading 72 px below → grid starts
60 px under the heading → 190 px of air before the subscribe band. Express as
`py`/`mt` utilities in that ballpark; scale down on mobile/tablet with the
project's usual `md:` / `lg:` steps.

**Grid.** `grid grid-cols-1 gap-y-20 lg:grid-cols-2 lg:gap-x-4`.
- Desktop: two columns, card 612 wide, **16 px column gap** (measured: image
  runs 20–631 and 648–1259).
- Tablet and mobile: one column, image full-bleed to the gutters.
- Row pitch 570 desktop, i.e. ~80 px between the end of one card's description
  and the next card's image. `gap-y-20`.

**Card.** Extend `ArticleCardStacked` in `app/_components/cards.tsx` to take an
optional `src` (and keep `Placeholder` as the fallback so the styleguide page
keeps working). Everything else about it is already correct: image at
`aspect-[612/356]`, `mt-6` title sans/20/700, `mt-2` `Meta` mono/14/muted with
the middot, `mt-5` description serif/20. Drop the `max-w-[612px]` cap (or make
it not fight the grid) so the card fills its column at every width.

Images use `sizes="(max-width: 1024px) 100vw, 612px"`. Give each a real
descriptive `alt` — these are editorial photographs, not decoration. The first
two images (above the fold on desktop) get `priority`.

**Content** — six articles, in comp order, with the image each comp cell shows:

| # | Title | Category | Read | Image |
| --- | --- | --- | --- | --- |
| 1 | How to Build a Climate-Ready Data Stack | Insights | 4 min | `Image-3.png` (sheer fabric against sky) |
| 2 | Sustainability Isn't a Side Project: Making Impact Operational | Strategy | 7 min | `Image-7.png` (moss on rock) |
| 3 | Inside the Aetherfield Model: How We Turn Data Into Action | Insights | 5 min | `Image-6.png` (turbines at dusk) |
| 4 | From Spreadsheets to Systems: The Evolution of Climate Reporting | Tooling | 6 min | `Image-8.png` (glacial meltwater) |
| 5 | Carbon Accounting: Myths, Models, and Must-Haves | Tooling | 6 min | `Image-5.png` (mountain and lake) |
| 6 | Seeing Clearly: Designing Feedback Loops for Sustainable Growth | Strategy | 4 min | `Image-9.png` (mirror panel held over a rice field) |

Descriptions, transcribed from the comp:

1. A practical guide for sustainability teams on integrating emissions, waste, and energy data into modern workflows.
2. Why climate goals belong in your core roadmap—not just in the annual ESG report.
3. A behind-the-scenes look at our platform logic, system architecture, and sustainability reasoning.
4. Why legacy tools aren't enough—and what the next generation of reporting looks like.
5. Debunking common assumptions and offering a framework for getting it right.
6. Building responsive systems that keep sustainability strategy adaptive and actionable.

Cards link to `#` for now (no article routes exist yet); the whole card is one
`<a>` with the title underlining on hover, matching the Journal list on `/`.

---

## 4. Subscribe band

The comp's band is exactly the existing `CtaBand` — `bg-surface`, ~110 px
vertical padding, centred `display-fluid-h4` bold headline, primary `Button`
with the bullet — except the label reads **"Sign up to newsletter"** instead of
the hardcoded "Request a demo".

Add an optional `action?: string` prop to `CtaBand` defaulting to
`"Request a demo"`, so `/` is unchanged. Do not fork the component, and do not
otherwise restyle it.

---

## 5. Responsive summary

| | Mobile (375) | Tablet (800) | Desktop (1280) |
| --- | --- | --- | --- |
| gutters | 20 | 20 | 20–24 (`Container`) |
| nav | wordmark + `+` toggle | full links | full links |
| stamp | 335×128, 25 perfs | 760×292 | 1240×477 |
| grid | 1 col | 1 col | 2 col, 16 px gap |
| heading | 24 | 30 | 40 |
| card image | 335×195 | 760×442 | 612×356 |

Card image ratio is 612/356 = 1.72 at **all three** sizes — verified against
each comp.

---

## 6. Quality floor

- Keyboard focus visible on every card link and the button (the `Button`
  primitive already carries `focus-visible:outline-accent`; cards need the same
  treatment).
- No horizontal scroll at 320 px.
- `alt` text on the six photographs; `alt=""` + `aria-hidden` on the fabric.
- No layout shift: every `<Image>` has explicit dimensions or `fill` inside a
  ratio box.
- No animation beyond the hover states the system already uses. The stamp is
  the loud element; everything else stays quiet.

---

## 7. Checks and close-out

1. `npm run lint`
2. `npx tsc --noEmit` — note that `package.json` has **no `typecheck` script**
   despite AGENTS.md section 2 claiming one. Add
   `"typecheck": "tsc --noEmit"` to `package.json` as part of this change so the
   documented command exists.
3. `npm run build`
4. `npm run dev` and compare `/journal` against all three comps at 375 / 800 /
   1280 — screenshot and diff the stamp, the grid gaps, and the type sizes
   before declaring it done. Report the real output of each command.
5. Update `AGENTS.md` with what was built: the `/journal` route, the stamp
   component and why it is one scaling SVG, the new `texture-journal.png` and its
   recipe, the `ArticleCardStacked` `src` prop, the `CtaBand` `action` prop, and
   the `typecheck` script.
6. Commit to `main`, unprompted (AGENTS.md workflow step 10). Do not push.

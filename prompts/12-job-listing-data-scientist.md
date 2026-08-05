# 12 — Job listing page (`/job-listing/[slug]`), first role: Data Scientist

Wire the **View role** button on `/careers` to a real job listing page and build
that page for the Data Scientist role at `/job-listing/data-scientist`.

Comp: `public/assets/pages/11-job-listing1/screen-sizes/{Desktop,Mobile,Tablet}.png`
(1280×2562 / 375×2896 / 800×2596).

This is a **new route with a new section file**, plus one new brand mark. It
reuses `SiteNav`, `Container` and `SiteFooter` as-is. **There is no `CtaBand`** —
the closing call-to-action lives *inside* the white card, and the card runs into
the footer exactly as `/careers` does.

`12-job-listing2` and `13-job-listing3` are the other two roles. They must end up
being pure data changes (one `JOB_BODIES` key each), so build the route that way.

---

## 1. Files

| file | change |
| --- | --- |
| `app/job-listing/[slug]/page.tsx` | new — route, metadata, `generateStaticParams` |
| `app/_components/job/sections.tsx` | new — `BackToCareers`, `JobMasthead`, `JobProse`, `JobCta` |
| `app/_content/jobs.ts` | `Job` gains `slug`; new `JOB_BODIES` + `WRITTEN_JOB_SLUGS` |
| `app/_components/primitives.tsx` | finish the staged `ButtonLink`; add `Seal` |
| `app/_components/cards.tsx` | `JobCard` gains optional `href` |
| `app/_components/careers/sections.tsx` | pass `href` for roles that have a body |
| `app/globals.css` | new `@utility display-job-h2` |

No generated imagery, no `magick`: the only picture on the page is the seal, and
it is drawn as SVG. Nothing on `/`, `/journal` or `/article/[slug]` changes.

### 1a. Finish the staged `primitives.tsx` edit first

`app/_components/primitives.tsx` currently carries an **uncommitted, unfinished**
edit: `BUTTON_BASE` and `Bullet()` are defined but nothing uses them, so
`npm run lint` will flag them. Complete it rather than reverting:

- `Button` renders `BUTTON_BASE` + `buttonSizing[size]` + `className`, and
  `<Bullet />` when `bullet`.
- New `ButtonLink` — the same look on `next/link`, same `size` / `bullet` props,
  spreading `ComponentProps<typeof Link>`.

`BUTTON_BASE` is byte-identical to the string `Button` inlines today, so the
rendered class attribute must not change. **Verify** `/`, `/journal`, `/careers`
and one article are unchanged (`diff` the prerendered HTML before and after).

Prompt 10 (`/about`, not yet built) also asks for `ButtonLink`; it lands here
because the groundwork is already in the tree.

---

## 2. Data shape

`Job` gains `slug: string` (the AGENTS.md slug rule: `"Data Scientist"` →
`"data-scientist"`). Prose is kept out of `JOBS` for the reason
`ARTICLE_BODIES` exists — `/careers` renders cards, not prose:

```ts
export type JobBody = {
  /** Standfirst above the rule. Same string as the card body in the comp. */
  lede: string;
  sections: { heading: string; body?: string; items?: string[] }[];
  cta: string;
};

export const JOB_BODIES: Record<string, JobBody> = { "data-scientist": { … } };
export const WRITTEN_JOB_SLUGS = Object.keys(JOB_BODIES);
```

`generateStaticParams` returns `WRITTEN_JOB_SLUGS`; anything else `notFound()`s,
exactly as `/article/[slug]` does for the unwritten slugs.

### Prose (transcribed from `Desktop.png` at 190 %)

**Straight apostrophes, not curly** — the comp draws curly, articles 1–6 ship
straight, and consistency wins (already recorded in AGENTS.md).

- **lede** — "Help build the intelligence layer for climate action. You'll turn
  complex sustainability data into clear, actionable insights for enterprise
  teams." (the same sentence `JOBS[1].body` already holds — reference it rather
  than retyping, so the two cannot drift)

- **Company description** — "At Aetherfield, we build software that empowers
  companies to lead with climate accountability. Our platform helps
  sustainability and operations teams make sense of complex environmental
  data—transforming emissions, waste, and energy metrics into measurable,
  meaningful action. We're a mission-driven team of technologists, designers,
  and scientists working to accelerate the shift toward a low-carbon future."
  (em dash, no spaces, as drawn)

- **About the role** — "As a Data Scientist at Aetherfield, you'll help shape the
  analytical engine behind our platform. You'll collaborate with product and
  engineering teams to design models that interpret environmental impact,
  forecast future trends, and uncover actionable insights for our customers.
  Your work will directly influence how companies plan, report, and act on their
  sustainability strategies."

- **Requirements**
  1. 3+ years of experience in data science or applied analytics (Python, SQL, etc.)
  2. Experience working with climate, sustainability, or supply chain datasets is a plus
  3. Strong foundation in statistics and data modeling
  4. Ability to communicate complex insights clearly to both technical and non-technical teams
  5. Curiosity, clarity, and care in how you approach messy data
  6. Passion for solving real-world problems with purpose and precision

- **Company benefits**
  1. Competitive salary and equity options
  2. Flexible, hybrid work environment
  3. Generous PTO and paid volunteer days
  4. Annual sustainability stipend
  5. Team offsites and climate-focused retreats
  6. A mission-first culture that values clarity, impact, and integrity

- **cta** — "Ready to help build the future of climate intelligence?"

---

## 3. Page shell

Identical to `/careers`, and for the same reasons already recorded there:

```tsx
<SiteNav />
<main className="hero-sky -mt-[60px] pt-[60px] pb-[120px]">
  <Container>…</Container>
</main>
<SiteFooter />
```

- **`hero-sky` on `main`, not a wrapper** — a wrapper round `SiteNav` unpins the
  sticky bar. Sampled at 1280: page top `#ABD4FE`, y 1970 `#FFF4DF` — the
  utility's own first and last stops, unchanged.
- **`pb-[120px]`** — the card→footer gap measures **121 at 375, 800 and 1280**,
  the same constant `/careers` holds.

---

## 4. Measured geometry

All numbers are comp pixels. Card box, from a 99.6 % threshold:

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1650+230+204` | `720×1762+40+204` | `335×2228+20+166` |
| card padding | 40 | 40 | **24** |
| footer top | 1974 | 2086 | 2514 |

The card is `rounded-card` (measured radius 16 on the top-left corner) and
`bg-white`. **Tablet gutters are 40, not the usual 20** — the card is 720 wide
on an 800 viewport. Desktop caps at 820, centred, like the `/careers` job cards.
Mobile is the standard 335 + 20.

**The card must not be `overflow-hidden`** — the seal deliberately spills past
its right edge onto the sky (§6).

### Back to Careers

Centred on the page, above the card. Serif, ink, with a leading `←`.

| | ink box | |
| --- | --- | --- |
| 1280 | `x 569..710`, `y 143..157` | centre 639.5 |
| 800 | `x 329..470`, `y 143..157` | centre 399.5 |
| 375 | `x 122..252`, `y 123..135` | centre 187 |

Ships at `font-serif text-p2` (the comp sets ~18 on mobile — the usual 20px
floor, §8). Starting values, then fit the cap tops: `pt-[58px] sm:pt-[78px]` on
the link block and `mt-6 sm:mt-[42px]` on the card.

### Inside the card

Content-box top is card top + padding, and both the title and the button start
there — 244 at 1280/800, 190 at 375. Measured ink rows at 1280:

| element | rows | note |
| --- | --- | --- |
| title cap | 248–278 | cap 28 |
| meta | 296–309 | serif, muted |
| lede | 343, 367 | pitch **24** |
| rule | 435 | 1px, `#DBE0EC` = `--color-border`, full content width |
| heading 1 | 486–504 | cap 15 |
| body | 537, 565, 593, 621, 649 | pitch **28** |
| heading 2 | 730 | 81 below the previous body line |
| heading 3 | 974 | |
| bullets | 1025, 1061, 1097, 1133, (wrap 1166), 1197, 1233 | item pitch **36**, wrap pitch **28** |
| heading 4 | 1314 | |
| benefits | 1365 … 1545 | |
| rule 2 | 1615 | |
| CTA line 1 / 2 | 1669, 1708 | pitch **39** |
| CTA button | 1768–1813 | h46, centred (`x 579..700`) |
| card bottom | 1854 | 41 below the button |

Derived spacing, consistent at all three sizes: **48px above and below each
rule**, **52px between sections**, **28px from a heading to its first line**,
**8px between list items** (36 − 28).

### Type

| element | class |
| --- | --- |
| title | `display-job-h2 font-sans font-bold` |
| meta | `font-serif text-p2 text-muted` with the system middot |
| lede | `font-serif text-p2` (20/24 — the comp's 24 pitch, no override) |
| section heading | `font-sans text-p1 font-bold` |
| body + list items | `font-serif text-p2 leading-[28px]` |
| CTA heading | `display-job-h2 font-sans font-bold text-center` |

**The meta line is serif, not the mono `Meta` component** the `/careers` cards
use — verified on a 300 % crop of `Desktop.png -crop 400x80+265+240`. Set it
inline (`font-serif text-p2 text-muted`) with the `·` separator; do not reach
for `Meta`.

### `@utility display-job-h2`

Cap heights measure **17 / 22 / 28** → **24 / 30 / 40**, i.e. exactly
`display-fluid-h4`'s sizes. Only the leading differs: measured line pitch is
**24 / 32 / 39**, against that utility's 1.1 (26.4 / 33 / 43.7). It is a
separate utility rather than `display-fluid-h4` + `leading-*` for the reason
`display-careers-title` already records — two same-weight utility classes on one
element leave the winner to source order.

```css
@utility display-job-h2 {
  font-size: 24px;
  line-height: 24px;
  letter-spacing: -0.01em;
  @media (width >= 768px) { font-size: 30px; line-height: 32px; }
  @media (width >= 1024px) { font-size: clamp(30px, 3.1vw, 40px); line-height: 39px; }
}
```

### Bullets

Measured at 1280: marker `x 283..286`, `y 1031..1035` — a **4×4 dot**, 13px in
from the content edge; text starts at **31px** in. That is 12px below the line
box top of a 28px line. `list-disc` cannot be pinned to those numbers, so draw
it, keeping real `ul`/`li`:

```tsx
<li className="relative ps-[31px] font-serif text-p2 leading-[28px]">
  <span aria-hidden className="absolute left-[13px] top-3 size-1 rounded-full bg-ink" />
  {item}
</li>
```

---

## 5. The two Apply buttons

- **Top right of the card at 800/1280, below the lede at 375.** Both measure
  `x …` 100px wide × 38 tall → the existing `<Button size="compact">Apply now</Button>`
  (`h-[38px] px-3`, mono 14) with no changes. Right edge sits on the content
  padding (`x 910..1009` at 1280, `620..719` at 800); at 375 it is
  **left-aligned at the content edge** (`x 44..143`), between the lede and the
  rule.
- **The closing one** is `x 579..700` × 46 tall, centred — the default primary
  `Button` with its bullet, unchanged.

**No destination exists in any comp.** Ship the top one as a `ButtonLink` to
`#apply` (the CTA block carries `id="apply"`), so it does something honest, and
leave the closing one as an inert `Button`, exactly as the `/careers`
open-application card's "Apply now" ships today. **Flag this for the user** —
both want a real application URL or mailto once one exists.

---

## 6. The seal — `Seal` in `primitives.tsx`

A blue line-art mark: three concentric ellipses of equal height, all tangent at
the same top and bottom vertices, labelled `tech` / `earth` / `data`, with the
wordmark set over two lines in the middle and an `®` beneath it. It goes in
`primitives.tsx` beside `Wordmark` — it is a brand mark, and prompt 10's
founder's-story section wants it too.

**One scaling SVG, `viewBox="0 0 283 144"`**, nothing sized per breakpoint — the
same discipline as `JournalStamp`. Measured off `Desktop.png` (bbox
`283×144+839+1399`, isolated with `-fx "(b-r)>0.15?1:0"`), local coordinates:

- **Ellipses** — `cx 141`, `cy 72`, `ry 71.25`; `rx` **137 / 95.75 / 58.75**
  (mid-height crossings at absolute x 842/883/920 and 1039/1076/1117, all
  sharing centre 979.75). `stroke="#2683EB"` — exactly `--color-accent`, no new
  token — `stroke-width 1.5`, `fill="none"`.
- **`tech`** serif, ink centre x 19.5, baseline y 62, ink width 23
- **`earth`** serif, centre x 147, baseline y 22, ink width 30
- **`data`** serif, centre x 263, baseline y 93, ink width 24
- **Wordmark** Archivo bold **26 / 26**, centre x 143, baselines y **65** and
  **91**, on two lines `Aether` / `field`; line-1 ink runs x 103..183
- **`®`** centre x **134** (it centres under the wordmark, not under the
  ellipses), ink box y 118..134. Draw it — a `circle r≈7.6` plus a serif `R` —
  rather than relying on Newsreader's `®` glyph, whose size and baseline are not
  fittable at this scale.

Fit the three serif labels to the ink widths above (≈16px start); do not
hand-size anything per breakpoint.

### Placement

| | size | left edge | top |
| --- | --- | --- | --- |
| 1280 | 283×144 | content-left + 569 of 740 = **76.9 %** | benefits item 1 cap top + 34 |
| 800 | 223×113 | content-left + 491 of 640 = **76.7 %** | + 31 |
| 375 | — | **not drawn** | — |

The two aspect ratios agree (1.965 / 1.973), so one SVG scales. The mark
**overflows the card's right edge** — 1121 against a card right of 1050 at 1280,
793 against 760 at 800 — landing on the sky. That is the design, so:
`relative` on the benefits list, then

```tsx
<Seal className="pointer-events-none absolute left-[76.8%] top-[31px] hidden w-[223px] sm:block lg:top-[34px] lg:w-[283px]" />
```

and no `overflow-hidden` anywhere above it.

---

## 7. Linking `/careers` → the listing

- `JobCard` gains optional `href`. When present the action renders as
  `ButtonLink` to `href`; when absent it stays the inert `Button` it is today,
  so the open-application card and the two unwritten roles are unchanged.
- `JobList` passes `href={`/job-listing/${job.slug}`}` **only for slugs in
  `WRITTEN_JOB_SLUGS`** — the UX Designer and Product Manager comps
  (`12-job-listing2`, `13-job-listing3`) are not built yet, and a link to a
  `notFound()` is worse than an inert button. Same rule `/journal` uses.

Nothing else on `/careers` moves: the card box, padding, dashed frame and
measured geometry all stay as committed.

---

## 8. Known deviations to record, not chase

- **Mobile runs long.** The comp sets the mobile lede at pitch 22 and the mobile
  body at pitch **25**, i.e. ~17px type; `--text-p1` / `--text-p2` are a fixed
  20px and every settled page ships that way. Mobile body leading ships at 28,
  so the page runs materially longer than the comp's 2896. Same call as
  `/journal`, articles 1–6 and `/careers`.
- **Wide Archivo.** The shipped cut runs ~18 % wider per unit of cap height than
  the comp's, so the title and CTA heading measure wider and headings may wrap a
  line earlier. Already on file for the article pages.
- **The comp draws curly apostrophes**; the site ships straight.

---

## 9. Verification

1. `npm run lint` and `npm run typecheck` — report exact output.
2. `npm run build`, then `npx next start -p 3001` (check port 3000 first; leave
   the user's dev server alone).
3. Screenshot `/job-listing/data-scientist` at 375 / 800 / 1280,
   `deviceScaleFactor: 1`, `fullPage: true`, via the cached `playwright-core`.
4. Diff connected-component box lists against the comps (area threshold 25000 /
   40000 / 15000). Report card box, rule y, seal bbox, both button boxes and
   footer top against §4.
5. Confirm `/`, `/journal`, `/careers` and `/article/how-to-build-a-climate-ready-data-stack`
   are byte-identical HTML to before (the `ButtonLink` refactor is the risk).
6. Confirm `/job-listing/ux-designer` 404s.
7. Update `AGENTS.md` with a `## Job listing page` section, then commit to `main`.

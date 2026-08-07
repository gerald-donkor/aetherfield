# Job listing page (`/job-listing/[slug]`)


`app/job-listing/[slug]/page.tsx` with its sections in
`app/_components/job/sections.tsx` and its prose in `app/_content/jobs.ts`.
Comps: `public/assets/pages/11-job-listing1/screen-sizes/` (Data Scientist);
`12-job-listing2` and `13-job-listing3` are the other two roles. Reuses
`SiteNav`, `Container` and `SiteFooter`; **there is no `CtaBand`** — the closing
call to action lives *inside* the white card, and the card runs into the footer
exactly as `/careers` does. Layout only: no generated imagery, no `magick`. The
only picture on the page is the seal, and it is drawn as SVG.

**The whole page is one white card on the `hero-sky` shell `/careers` already
uses** — `hero-sky -mt-[60px] pt-[60px] pb-[120px]` on `main` as a *sibling* of
the header, for the reason recorded there (a wrapper round `SiteNav` unpins the
sticky bar). The 120px foot is the same measured constant: the card→footer gap
is 121px at 375, 800 *and* 1280.

**The card is 335 / 720 / 820 wide, and tablet gutters are 40, not 20.** So the
cap is authored at `md` as well as `lg` (`md:max-w-[720px] lg:max-w-[820px]`)
rather than letting `Container` decide; mobile is the standard 335 + 20 and
desktop centres 820 in the 1232 content box, landing on the comp's x 230.
Padding is `p-6 sm:p-10` — 24 at 375, 40 at 800 and 1280, the same split
`JobCard` measures. **The card must not be `overflow-hidden`**: the seal
deliberately spills past its right edge onto the sky.

**The top Apply button is absolutely positioned, not a flex row.** The comp runs
the lede the full 740px content width *underneath* the button, not beside it;
putting the two in one `sm:flex … justify-between` row shortens the measure to
~600 and costs the lede a whole line — 24px that then propagates through the
entire card, and moves the seal with it. So the button is
`sm:absolute sm:top-10 sm:right-10` on a `relative` card, and drops back into
flow (`mt-6`, left-aligned on the content edge) at 375, which is what the mobile
comp draws.

**Derived spacing, one set of numbers at all three sizes**: 48px above and below
each rule, 52px between sections, 28px from a heading to its first line, 8px
between list items (the comp's 36px item pitch minus the 28px line). Everything
inside the card follows from these four — nothing else is fitted.

**`@utility display-job-h2`** in `app/globals.css`, for the role title and the
closing CTA heading: cap heights measure 17 / 22 / 28, i.e. exactly
`display-fluid-h4`'s 24 / 30 / 40, but the leading is 24 / 32 / 39 against that
utility's 1.1 (26.4 / 33 / 43.7). A separate utility rather than
`display-fluid-h4` + `leading-*`, for the reason `display-careers-title`
already records.

**The meta line is serif, not the mono `Meta` component** the `/careers` cards
use — verified on a 300 % crop of `Desktop.png -crop 400x80+265+240`. Set inline
as `font-serif text-p2 text-muted` with the system middot.

**The bullets are drawn.** Measured at 1280 the marker is a 4×4 dot 13px in from
the content edge with the text at 31px, 12px below the line box top; `list-disc`
cannot be pinned to that. So a `<span>` dot inside a real `ul`/`li`.

### Data shape

`Job` gains `slug` (the AGENTS.md slug rule: `"Data Scientist"` →
`"data-scientist"`). Prose is a separate `JOB_BODIES` map, keyed by slug, for the
reason `ARTICLE_BODIES` exists — `/careers` renders cards, not prose, and should
not ship copy it never draws. `WRITTEN_JOB_SLUGS` feeds `generateStaticParams`;
everything else `notFound()`s, so **`/job-listing/ux-designer` and
`/job-listing/product-manager` 404 by design** until comps 12 and 13 are built.

`JobBody.lede` is **optional and falls back to `Job.body`** — the comp's
standfirst is the card body verbatim, so the two cannot drift.

**Adding roles 2 and 3 is a pure data change**: one `JOB_BODIES` key each, no
components touched.

### Shared-component changes

- **`Seal` in `primitives.tsx`** — the company mark, one scaling SVG on
  `viewBox="0 0 283 144"`, nothing sized per breakpoint (the `JournalStamp`
  discipline). Three ellipses share `cx 141.5`, `cy 72` and one `ry` — so all
  three are tangent at the same top and bottom vertices — at `stroke-width 1.5`
  in `#2683EB`, which is exactly `--color-accent`, no new token. The ® is
  **drawn** (a ring plus a serif R) because Newsreader's ® glyph is not fittable
  at this size. **The whole mark is rotated +7°** — see "The seal's tilt" below,
  which supersedes the original upright numbers. **The /about founder's-story
  mark is a different drawing at a different angle and stays local to that
  page.**
- **`ButtonLink` moved from a bare `<a>` to `next/link`** so in-app destinations
  get client-side navigation. `BUTTON_BASE` is shared with `Button`, so the
  rendered class attribute is byte-identical either way.
- **`JobCard` gains optional `href`.** With one the action renders as
  `ButtonLink`; without one it stays the inert `Button` it is today. `JobList`
  passes an href **only for slugs in `WRITTEN_JOB_SLUGS`** — a link to a
  `notFound()` is worse than an inert button, the same rule `/journal` uses.
  Nothing else on `/careers` moves.

`/`, `/journal`, `/article/[slug]` and `/design-system` are **byte-identical**
prerendered HTML across this change (verified by diffing a build of `HEAD` in a
worktree against the working tree, normalising chunk hashes). `/careers`'
only diff is the Data Scientist card's `<button>` becoming an `<a>` with the
same class string.

### Measured against the comps

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1650+230+204` → `+1657` | `720×1762+40+204` → `+1748` | `335×2228+20+166` → `335×2746` |
| seal | `283×144+839+1399` → `276×144+841+1403` | `223×113+571+1524` → `218×113+574+1505` | not drawn |
| top Apply | `100×38+910+244` → `96×38+914+244` | — | `100×38+44+402` → `96×38+44+414` |
| closing Apply | `122×46+579+1768` → `+1775` | — | — |
| footer top | 1974 → **1981** | 2086 → **2072** | 2514 → 3032 |

Card x, y and width are **exact at all three**. The desktop interior is exact
too: every ink row — title, meta, both lede lines, the rule, all four headings,
all eleven body lines, all thirteen bullet lines, both CTA lines and the button
— lands within **7px**, most within 4, with identical line counts and identical
wraps.

Deviations, all inherited:

- **Mobile runs +518.** The comp sets the mobile lede at pitch 22 and the body
  at 25 (~17px type); `--text-p1` / `--text-p2` are a fixed 20px and every
  settled page ships that way. Same call as `/journal`, articles 1–6 and
  `/careers`.
- **Tablet runs −14**, because the shipped Newsreader wraps the lede to two
  lines where the comp takes three at the same 640px measure. The mirror image
  of the wide-Archivo note, on the serif.
- **The CTA heading breaks one word later** — "…build the future / of climate
  intelligence?" against the comp's "…build the / future of climate
  intelligence?". Both are two balanced centred lines; forcing the comp's break
  needs a max-width inside a 2px window, so it is recorded, not chased.
- **"Back to Careers" measures 165 wide against the comp's 142 / 142 / 131** —
  the 20px `--text-p2` floor again. Its ink sits 2px high at all three sizes;
  the card top below it is exact, so the padding is left alone.
- **Both Apply buttons measure 96 wide against the comp's 100**, the mono cut.
  The right edge is exact at 800 and 1280 and the left edge is exact at 375, so
  the button is pinned on the side the comp pins it.
- ~~**The seal's ink is 276 wide against the comp's 283.**~~ **Fixed** — see
  "Fix — the seal's tilt" below. The 7px was the missing rotation, not
  measurement noise; the seal now measures `283×144` against the comp's
  `283×143`.

**Flag:** **no comp gives either Apply button a destination.** The top one ships
as a `ButtonLink` to `#apply` (the CTA block carries `id="apply"`) so it does
something honest; the closing one ships inert, exactly as the `/careers`
open-application card's "Apply now" does today. Both want a real application URL
or `mailto:` once one exists.

### Role 3 — Product Manager (`/job-listing/product-manager`)

**A pure data change, as promised above.** One `JOB_BODIES` key from
`public/assets/pages/13-job-listing3/screen-sizes/` — same four sections
(Company description / About the role / Requirements / Company benefits, two
`body` and two `items`), same closing CTA, `lede` omitted so it falls back to
`Job.body`. **No component, utility or asset touched.** Company description and
Company benefits are byte-identical to the Data Scientist entry because the comp
repeats them verbatim; keep the two in step. Adding the key is what puts
`product-manager` in `WRITTEN_JOB_SLUGS`, which turns the `/careers` card's
action into a `ButtonLink` and adds the slug to `generateStaticParams`.

**`/job-listing/ux-designer` was the one slug still 404ing** at the time this
was written; it is built below.

Prerendered HTML is **byte-identical** for `/`, `/journal`, all six articles,
`/design-system`, `/about` and `/job-listing/data-scientist` — verified by
building the working tree twice, once with `jobs.ts` reverted and once with the
new key, and normalising the CSS chunk name and the build id. That isolates
*this* change; it holds nothing else in the tree fixed. `/careers`' only diff is
the Product Manager card's `<button>` becoming an
`<a href="/job-listing/product-manager">` with the same class string.

#### Measured against the comps

**These numbers were taken against a working tree that already carried the
bottom-anchored `Seal` refactor** (the `relative` wrapper around the whole prose
block in `job/sections.tsx`), not against `dd13557`'s top-anchored seal. Every
seal figure below therefore describes the bottom-anchored behaviour.

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1842+230+204` → `820×1685+230+204` | `720×1902+40+204` → `720×1800+40+204` | `335×2428+20+166` → `335×2826+20+166` |
| seal | `281×143+840+1591` → `274×144+842+1431` | `221×112+572+1664` → `216×113+575+1557` | not drawn |
| top Apply | `100×38+910+244` → `96×38+914+244` | `100×38+620+244` → `96×38+624+244` | `100×38+44+402` → `96×38+44+438` |
| closing Apply | `122×46+579+1960` → `+1803` | `122×46+339+2020` → `+1918` | `121×46+127+2516` → `122×46+127+2922` |
| footer top | 2166 → 2009 | 2226 → 2124 | 2714 → 3112 |

Card x, y and width are **exact at all three**, and the card→footer gap is 120px
in both the comp and the render at all three — the measured constant `/careers`
and job listing 1 already record. Both Apply buttons' x is exact at every size
(96 against 100 wide is the mono cut, already on file).

Deviations, all inherited or comp-side:

- **The desktop card runs −157 and the tablet −102, and it is comp-side air, not
  a layout drift.** Comp 13 draws **214px** between the last benefits bullet and
  the closing rule where the layout gives the `Rule`'s own 48 — and comp 11
  measures 46 at exactly the same place (last bullet ink ends 1564, rule ≈1610).
  So comp 13 alone carries ~166px more air there. **The seal anchoring is not
  the cause and was not changed**: it holds seal-bottom → closing-rule at 69px
  against comp 13's 74, the same invariant fitted on comps 11 and 12. What
  differs is that comp 13's designer drew the seal *below* the benefits list
  (1591–1733, clear of the last bullet at 1588) where comp 11 overlaps it. Same
  call as article 6's −216. Record, don't chase.
- **The desktop lede wraps to two lines where the comp takes three**, at the same
  740px measure — the shipped Newsreader cut, the mirror of the wide-Archivo
  note. Job listing 1 records this on tablet; this role's lede is longer, so it
  reaches desktop.
- **Two Requirements bullets wrap where the comp wraps one** ("Familiarity with
  sustainability…" takes a second line), +28. Same font-cut cause.
- **Mobile runs +398** on the fixed 20px `--text-p1` / `--text-p2` floor, which
  also puts the mobile top Apply 36px low (`+438` against `+402`) — one extra
  lede line above it.
- **The CTA heading breaks one word later**, "…build the future / of climate
  intelligence?" against the comp's "…build the / future of climate
  intelligence?" — the identical drift already recorded for job listing 1.

Everything else on desktop is line-for-line: identical headings, identical body
line counts and wraps through both prose sections, identical bullet order.

### Role 2 — UX Designer (`/job-listing/ux-designer`)

One `JOB_BODIES` key from `public/assets/pages/12-job-listing2/screen-sizes/`
plus **one shared-component fix** — the seal's anchoring. With it, all three real
roles have prose, so no `/careers` role card links at a 404; the
open-application card has no listing page by design and keeps its inert action.

The comp is the same page at the same geometry: card `820×1522+230+204`, rules
at y **459** and **1487**, footer top **1846** — the same 120px card→footer gap.
`lede` is omitted so it falls back to `Job.body`. Company description is verbatim
identical to the Data Scientist entry and is **transcribed again rather than
shared**: `JOB_BODIES` is per-slug copy, and a shared constant would invite
editing one role's boilerplate and silently moving the other's.

**"Company benefits" is a paragraph here, not a list** — the only shape
difference across the three listings, and the whole reason for the fix below.

**The `Seal` is bottom-anchored to the prose block, not top-anchored to the last
list.** It used to render *inside* the `items` branch of the last section, so on
this comp — whose last section has `body` — it would not have rendered at all.
It now sits once, outside the `sections.map`, in a single `relative` wrapper
around the whole prose block. (The offsets recorded here — `bottom-[55px] …
lg:bottom-[24px]` — were later moved by the user's reference; see "Fix — the
seal's offsets" below. The *anchoring* is unchanged.)

**Bottom-anchoring is measured, not chosen.** Seal bottom minus closing rule is
**−73px on all three desktop comps** (11: 1542/1615, 12: 1414/1487, 13:
1734/1807) even though the prose above it differs in length and in shape. Top-
anchoring cannot fit that: held at the old `top-[36px]` against comp 12's last
*list* it lands ~180px high. `left-[76.8%]`, the widths, `pointer-events-none`,
`hidden sm:block` and the spill past the card's right edge are unchanged — the
seal is still drawn outside the card, so nothing in that chain may become
`overflow-hidden`.

The move is worth ~4px on the settled Data Scientist page and improves it:
desktop `+841+1403` → `+841+1404` against the comp's `+840+1399`, tablet
`+574+1505` → `+575+1509` against `+572+1524`.

#### Measured against the comps

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| card | `820×1522+230+204` → `820×1533+230+204` | `720×1666+40+204` → `720×1677+40+204` | `335×2113+20+166` → `335×2618+20+166` |
| seal | `282×143+840+1271` → `276×144+841+1280` | `221×112+572+1428` → `217×113+575+1437` | not drawn |
| top Apply | `100×38+910+244` → `96×38+914+244` | `100×38+620+244` → `96×38+624+244` | `100×38+44+402` → `96×38+44+438` |
| closing Apply | `122×46+579+1640` → `+1651` | `122×46+339+1784` → `+1794` | `121×46+127+2201` → `122×46+127+2714` |
| footer top | 1846 → **1857** | 1990 → **2000** | 2399 → 2904 |
| page height | 2434 → 2456 | 2500 → 2479 | 2781 → 3255 |

Card x, y and width are **exact at all three**, and the card→footer gap holds at
120px in comp and render at every size.

Deviations, all already on file:

- **Desktop and tablet run +11**, one line's worth, and it lands on every row
  below it — card bottom, closing Apply, footer. The mono/serif cuts, not a
  spacing error.
- **Mobile runs +505** on the fixed 20px `--text-p1` / `--text-p2` floor, which
  also puts the mobile top Apply 36px low (`+438` against `+402`) from one extra
  lede line above it. Same call as `/journal`, articles 1–6, `/careers` and the
  other two listings.
- **Both Apply buttons measure 96 wide against the comp's 100** — the mono cut.
  x is exact at every size.
- ~~**The seal's ink is 276 wide against the comp's 282**, height and x exact.~~
  **Fixed** — the missing rotation; see "Fix — the seal's tilt" below.
- **The tablet footer measures 479 tall against the comp's 510**, which is why
  the page runs −21 there while every row above the footer runs +10. Pre-
  existing and shared with every page.

**Flag, unchanged:** no comp gives either Apply button a destination, so this
role inherits the same `#apply` top link and inert closing button. Both still
want a real application URL or `mailto:`.

Prerendered HTML for `/`, `/journal`, `/design-system`, `/about` and the articles
is **identical** across this change apart from the CSS chunk name and the build
id — verified against a worktree build of the parent commit. `/careers`' only
diff is the UX Designer card's `<button>` becoming an
`<a href="/job-listing/ux-designer">` with the same class string.

### Fix — the seal's tilt (`Seal` in `primitives.tsx`)

**The mark shipped upright; all three comps draw it rotated.** It is now one
`<g transform="rotate(7 141.5 72)">` around a symmetric drawing, the discipline
`AetherfieldSeal` on /about already follows. Nothing else on the page moved —
the seal is absolutely positioned, so no layout row shifted.

**How the first cut missed it.** The original fit measured the three ellipses'
**mid-height chord** (absolute x 842/883/920 and 1039/1076/1117, symmetric about
979.5) and read those half-chords as `rx`. **A mid-height chord cannot reveal a
tilt**: an ellipse is centrally symmetric, so the chord at `y = cy` is centred on
`cy` for *any* rotation. It only pins `a` once θ is known. The two "asymmetries"
the fit then baked into the type — `data` set 31px below `tech`, the ® set 7px
left of the wordmark's axis — were the rotation showing up in the one place the
chord measurement could not explain it.

**The measurement that does reveal it: the outer ellipse's extreme-x points.**
Isolate the mark (`-fuzz 28%` around `#2683EB`, threshold, negate) and take the
min/max-x columns' vertical midpoints. On all three desktop comps the ink bbox
is `283×143` with the left tip at `y 87.5` and the right at `y 113` — **25.5px
of drop across the mark**, i.e. right-hand side low, a *positive* (clockwise) SVG
rotation. Tablet measures `222×113` with a 20.5px drop, the same slope at
0.7845×. Comps 11, 12 and 13 are byte-identical here.

**Solving for the geometry.** For semi-axes `a`, `b` rotated θ, the ink half-box
is `√(a²cos²θ + b²sin²θ)` × `√(a²sin²θ + b²cos²θ)`, and the extreme-x point sits
at `t` where `tan t = −(b/a)tanθ`. Those three equations in `a`, `b`, θ solve
cleanly — but they are **sensitive**: ±1px on the measured tip drop moves θ by
±0.5° (12.0 → 6.43°, 12.75 → 6.81°, 13.5 → 7.20°). Two independent type
constraints break the tie: un-rotating the fitted type so `tech` and `data` land
on one line gives **7.25°**, and so `earth` and the ® land on one vertical axis
gives **7.13°**. The mark therefore ships at **7°**, with `a` and `b` solved
exactly there.

Shipped numbers, all on `cx 141.5`, `cy 72`, `ry 69.13`:

| | outer | middle | inner |
| --- | --- | --- | --- |
| comp extreme-x (local) | 29 | 72.5 | 109.5 |
| `rx` | 141.55 | 97.11 | 59.60 |
| predicted mid-height chord | 138.5 | 96.4 | 59.7 |
| measured mid-height chord | 137.5 | 96.5 | 59.5 |

The last two rows are the check, not the fit: the chord the first cut measured
falls out of the rotated solution to within a pixel, so both readings of the comp
are satisfied at once.

**The type is symmetric in the unrotated frame**, which is the tell that the comp
is one rigid rotation rather than a hand-tilted ellipse set. Un-rotating the
previously fitted anchors by −7° about `(141.5, 72)` puts `earth` at x 140.87,
the ® at 140.64, `Aether` at 141.64 and `field` at 141.83 — one axis, ~141.5 —
and `tech`/`data` at y 76.94 / 78.04, one line. It also independently confirms
the wordmark: the comp sets `field`'s ink centre **3px left of `Aether`'s**
(168.5 against 171.5), and 26px of line pitch × sin 7° = 3.17. The first cut had
both at the same x, so `field` was ~3.5px right of the comp. Shipped anchors:
`tech (18.8, 77.5)`, `data (264.2, 77.5)`, `earth (141.5, 21.7)`,
`Aether (141.5, 64.9)`, `field (141.5, 91.1)`, ® ring `(141.5, 126.5)`.

**The tablet width is now `222px`, not `223px`.** The upright mark drew 276 ink
in a 283 box, so the tablet width was padded to make the ink land near the comp's
221. The rotated mark's ink fills its box exactly, so the width *is* the ink
width, and the comp measures `222×113`. `lg:w-[283px]` is unchanged.

#### Measured against the comps

| | desktop comp → render | tablet comp → render |
| --- | --- | --- |
| seal box | `283×143+839+1399` → `283×144+838+1404` | `222×112+572+1524` → `222×113+572+1509` |
| tip drop | 25.5 → **25.5** | 20.5 → **21.0** |

**Size is exact at both breakpoints and tablet x is exact** (desktop x is 1px,
inside the `Container` gutter already on file). The previously recorded −7px on
the seal's width is gone — it was the missing rotation, not measurement noise, so
strike that line from job listing 1's deviation list. A channel overlay of render
against comp at `300x160+830` traces both marks within 1–2px everywhere, with the
® landing exactly. Vertical placement is unchanged from the bottom-anchored fit
(`+1404` against `+1399`); that was not touched.

Only `/job-listing/[slug]` renders `Seal`, so `/`, `/journal`, `/about`,
`/careers`, `/design-system` and the articles are untouched by this change.

### Fix — the seal's offsets (`bottom-[73px] left-[75.95%] lg:bottom-[42px]`)

**This one is fitted on a user-supplied reference, not on the comps, and it
overrides the −73px invariant recorded above.** Reference:
`~/Pictures/Screenshots/Screenshot_20260805_113838.png`, a 1263×575 window of
the Product Manager listing. Only the offsets moved — the bottom-anchoring, the
widths, `pointer-events-none`, `hidden sm:block` and the spill past the card's
right edge are all unchanged.

**The reference is not a comp export, and identifying that is the whole
measurement.** It renders at viewport 1263 (card `820+221`, which is
`24 + (1215−820)/2` — the render's own geometry, not the comps' `+230` at 1280),
so it is unscaled and directly comparable to a 1263-wide screenshot of ours. But
its benefits list runs at a **28px item pitch** where ours runs 36, and its
closing CTA breaks as `…build the / future of climate intelligence?` — both the
comps' ~17px body, not the shipped 20px `--text-p2`. So it is a faithful
implementation of the design, and its prose block is **44px shorter** than ours
for identical copy. **That difference is not fixable here** and is the same
`--text-p2` floor already recorded for every page since the article; do not try
to close it by moving the seal.

**What is fixable is the seal's two offsets**, and both are measured against the
card and the closing rule, which are scale-free landmarks:

| | reference | before | after |
| --- | --- | --- | --- |
| seal left − card left | 602 | 608 | **602** |
| seal bottom → closing rule | 91 | 73 | **91** |

`left-[76.8%]` → `left-[75.95%]`: the offsets resolve against the prose wrapper,
which is the card minus its `p-10`, i.e. 740 wide at `lg`, so 602 from the card
edge is `(602 − 40)/740 = 75.95 %`. `lg:bottom-[24px]` → `lg:bottom-[42px]` is
the same +18 as the gap.

**Tablet moves by the same +18 (`bottom-[55px]` → `bottom-[73px]`), and that is
an inference, not a measurement** — the reference is desktop-only. +18 rather
than 18×0.7845 because the prose leading that sets the vertical rhythm is the
same at both breakpoints; only the mark scales. Revisit if a tablet reference
turns up.

#### Measured after the change

All three listings, production build:

| | 1280 | 800 |
| --- | --- | --- |
| seal left − card left | **602** (x 832, card 230) | **526** (x 566, card 40) |
| seal bottom → closing rule | **91** | **122** |

Identical on Data Scientist, UX Designer and Product Manager — the anchoring
still holds one invariant across three differently shaped prose blocks, which is
the property the original fit was chosen for. Against the reference at 1263, the
seal lands at `+824+247` where the reference has `+823+247` (cards at 222 and
221), and the closing rule at 481 against 479 — i.e. **both offsets exact.**

For the record, the comps' own numbers are 609 / 73 (desktop) and 532 / ~107
(tablet); the shipped values now sit 7 left and 18 high of those. That is a
deliberate override on the user's reference.


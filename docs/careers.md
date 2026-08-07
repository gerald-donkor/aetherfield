# Careers page (`/careers`)


`app/careers/page.tsx` with its sections in `app/_components/careers/sections.tsx`
and its listings in `app/_content/jobs.ts`. Comps:
`public/assets/pages/10-careers/screen-sizes/`. Reuses `SiteNav`, `Container`
and `SiteFooter`; **there is no `CtaBand`** — the last card runs into the
footer, as on `/article/[slug]`. Layout only: no new photography, no generated
assets, no `magick`.

**The background is `hero-sky` on `<main>`, not a wrapper.** Sampled down the
desktop comp's left gutter the gradient *is* the existing utility (`#A9D3FF` /
`#C9DFF4` / `#E8EBE7` / `#FFF4DF` at 0 / 37 / 74 / 100 %, within 1–2 levels of
`hero-sky`'s stops) — do not author a second gradient. It has to paint behind
the sticky bar, and a wrapper around `SiteNav` unpins the bar the moment the
wrapper scrolls off (the reason already recorded for the homepage sky). So
`main` is a *sibling* of the header, pulled up under it and padded back down:
`hero-sky -mt-[60px] pt-[60px] pb-[120px]`. `z-50` on the header keeps it over
the overlap and the 100 % stop lands on the footer's top edge, as in all three
comps. The 120px foot is measured — the dashed card → footer gap is 121px at
375, 800 *and* 1280, one of the few numbers this page holds constant.

**`@utility display-careers-title`** in `app/globals.css`: the article-title
sizes (36 / 64 / 80) with a much tighter, per-step leading — measured baseline
pitch **29 / 59 / 77**, i.e. 0.81 / 0.92 / 0.96 em, so the leading is authored
alongside each size rather than derived from one ratio. A separate utility
rather than `display-article-title` + `leading-*`, because two same-weight
utility classes on one element leave the winner to source order.

**The masthead is two `block` spans, not one `<br>`.** Line 1 is Newsreader and
line 2 Archivo — the page's one signature move, and what the comp draws
(verified on a 3× crop of `Desktop.png -crop 400x150+450+140`: Archivo's
flat-terminal `a` and the wordmark's `fi`, at a much lighter weight than the
extrabold footer wordmark). With both fonts on **one** line box Chrome unions
the Newsreader strut with the taller Archivo inline box and the pair runs 8px
past the authored leading (h1 measured 251 tall where 89 + 77 + 77 = 243). One
block per line puts each line box back at exactly the leading.

**The masthead padding and the title→list gap are fitted, and only these two.**
Everything below follows from the 16px card gaps. `pt-[66px] sm:pt-[89px]
lg:pt-[88px]` on the `h1` — the three are *not* one number because the cap-top
inset from the content box differs per step (+1 / −2 / −3 at 1280 / 800 / 375).
`mt-8` on the list: solving each breakpoint alone wants 30 / 33 / 32, and a flat
32 lands every card-1 top within 2px, so it ships as one token.

**`JobCard` got three edits** (`app/_components/cards.tsx`) — it existed for the
styleguide and `/careers` is its first real use:

1. **`p-6 sm:p-10`, not a flat `p-10`.** Measured content inset is 40 at 1280
   and 800 but **24 at 375**.
2. **`ring-1 ring-border sm:ring-0` dropped.** No comp ever showed it; the
   mobile comp goes straight from sky to white with no ring row. This also
   changes `/design-system`, which is the styleguide and should show what ships.
3. **New optional `action = "View role"` and `open = false`.**

**The dashed frame is an SVG, not `border-dashed`.** Measured on the comp's top
border at y 1010: **7px on / 9px off, pitch 16, solid `#000`, 1px, radius 16,
interior transparent** (the gradient reads through identically inside and out —
verified on the render too, `p{640,1120}` == `p{100,1120}`). CSS
`border-dashed` gives Chrome's own ~2/2 pattern at 1px and cannot be tuned.
`strokeWidth="2"` with the rect on the viewport boundary is deliberate: the SVG
clips the outer half, leaving exactly 1px, with no fractional `x="0.5"` /
`calc()` geometry browsers disagree on. Verified in the render — a single row of
ink at y 1036, runs 26–32 then 42–48.

`SiteNav`'s `Careers` item moved from `"#"` to `"/careers"`; Product and About
were still the only unbuilt destinations at the time (both are wired now — see
"Nav — Product points at the home page" below). Nothing else in `chrome.tsx`
changed.

### Measured against the comps

| | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| title line 1, cap top | 149 → **149** | 147 → **147** | 123 → **123** |
| card 1 | `820×218+230+332` → `+334` | `760×218+20+300` → `+299` | `335×276+20+216` → `335×320+20+216` |
| card 2 | `820×194+230+566` → `820×218+230+568` | `+534` → `+533` | `+508` → `+552` |
| card 3 | `820×218+230+776` → `+802` | `+768` → `+767` | `+800` → `+864` |
| dashed card | `820×194+230+1010` → `820×170+230+1036` | `760×170+20+1002` → `+1001` | `+1092` → `335×224+20+1200` |
| footer top | 1324 → **1326** | 1292 → **1291** | 1430 → 1544 |

Tablet is essentially exact everywhere. The deviations are the two already on
file plus one comp artefact:

- **Card role and body type.** The comp sets the desktop role at ~25px over a
  ~17px serif body; `--text-p1` / `--text-p2` are a fixed 20px and every settled
  page ships that way, so cards run larger and wrap differently — card 2 takes
  one extra line at 1280 (218 against the comp's 194), which is where card 3's
  +26 comes from. Mobile cards run 320/296/320/224 against 276/276/276/218, and
  that is the whole +114 at the footer. Same call as `/journal` and articles 1–6.
- **Title ink runs wide** — 341 / 392 at 1280 against the comp's 326 / 354 — the
  wide Archivo cut recorded for the article pages.
- **The desktop dashed card is 194 in the comp but 170 natural.** At 800 the
  same card measures 170 and its padding closes exactly on one body line; at
  1280 the designer appears to have reused card 2's 194px frame, leaving 24px
  unexplained. The natural height ships.

**Flag, shipped as drawn:** the open-application card carries a real role's meta
— "Full-time · Denver, CO" — which reads like comp placeholder left in by
mistake. The comp is the source of truth, so it ships; drop the line if the
designer confirms.

### The open-application card's marching dashes

Prompt 31. The user circled the dashed frame in
`~/Pictures/Screenshots/Screenshot_20260806_203153.png` and asked for the dashes
to move around it. It is the site's fourth continuous loop, after the
capabilities asterisk and counter and the journal stamp's perforation drift —
and the only one that is **not** GSAP.

**CSS keyframes, not GSAP**, at the user's choice, and it is the cheaper route:
`cards.tsx` stays a server component, `/careers` gains no client reference, and
the loop needs no `matchMedia`, no `useGSAP` and no on-screen gate. One
`@keyframes` plus one class in `app/globals.css`, and `className="job-frame-march"`
on the existing `<rect>`. Nothing else.

**The loop is seamless because the dash pitch is uniform.** 7 on + 9 off = 16, so
a `stroke-dashoffset` of exactly `-16` lands every dash where its neighbour
started: the frame at `t + duration` is pixel-identical to the frame at rest and
`infinite` has no seam. Identical argument to the journal stamp's `1240/25 =
49.6` perforation pitch — **the pitch is what makes it seamless, not the
duration**, so a speed change cannot break it. **Verified, not assumed**: under
`prefers-reduced-motion: reduce` (animation not running), the dashed card's box
screenshotted at rest and again with `stroke-dashoffset: -16px` forced onto the
rect compares at **`AE` 0 at 375, 800 and 1280.**

- **Negative, i.e. clockwise** — a decreasing offset advances the pattern along
  the path's own direction, and the rect is drawn from its top-left corner
  clockwise, so the dashes travel left-to-right along the top edge. The user's
  choice, and it matches the journal stamp's top row.
- **`0.8s` per pitch = 20 px/s is a judgement, not a measurement.** The user
  picked "brisk" from three offered paces (0.5 / 0.8 / 1.2 s). Half the
  perforation drift's ~41 px/s, which is right for a 1px hairline against that
  loop's 15px circles. Say *judgement* if it is ever revisited.
- **`linear`.** A conveyor must not accelerate; any easing makes the wrap read as
  a stutter. Same reason the perforation drift ships `ease: "none"`.
- **No on-screen gate, deliberately.** The GSAP loops carry a `ScrollTrigger`
  `onToggle` because their ticker runs regardless. A CSS animation on an
  off-screen element is the browser's own problem, and this one repaints a single
  1px stroke. Do not add a gate, and do not convert this to GSAP to get one.
- **It sits OUTSIDE the `(scripting: enabled)` block.** That block exists to hide
  GSAP's start states; this animation needs no script and is authored to run with
  JavaScript off. It is gated on `prefers-reduced-motion: no-preference` alone.

**No geometry changed.** The 7/9 pattern, the `strokeWidth="2"`-clipped 1px, the
radius 16 and the interior transparency are all comp-measured and untouched.
`/design-system` renders `JobCard` **without** `open`, so it draws no frame and
contains the class zero times.

Confirmed in the **built** stylesheet, the discipline every CSS mechanic here
follows: `@keyframes job-frame-march{to{stroke-dashoffset:-16px}}` at top level
and `@media (prefers-reduced-motion:no-preference){.job-frame-march{animation:.8s
linear infinite job-frame-march}}` — Lightning CSS keeps both and adds the `px`.
Content detection does not strip a hand-authored class used in a `className`.

#### Measured in the production build

Against a worktree build of `ec70823`.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| drift rate | **19.95 px/s** | **19.95 px/s** | **20.10 px/s** |
| seam check (`AE`, rest vs −16 forced) | **0** | **0** | **0** |
| dashed card box | `335×224+20+1200` | `760×170+20+1001` | `820×170+230+1036` |
| page height | **1895** | **1770** | **1925** |
| reduced motion | `animation-name: none`, `stroke-dashoffset: 0px` | same | same |
| JS off | animation runs; card box unchanged | same | same |

Card boxes and page heights are the recorded numbers **unchanged**, and
connected components on `/careers` gives an **identical box list** against the
base build at all three widths. Reduced motion also keeps `stroke-dasharray:
7px, 9px` and `stroke-width: 2px`. With JavaScript off, two shots of the card
box 400 ms apart differ (`AE` 1548) — the animation is genuinely running without
script. An ink-row profile across the top border at rest is a **single row of
ink** with runs of 7 separated by 9, i.e. the comp's pattern intact.

**Scoped `AE` at 5 % fuzz is `0` outside the dashed card's box at all three
widths**; inside it, 449 / 294 / 859 (0.2–0.6 % of the box's pixels) — the dashes
at a different loop phase. **Never report a bare page-wide `AE` for `/careers`
now**, for the same reason `/journal` and `/` already carry that warning.

`/careers` is the only route whose prerendered HTML changes and its only diff is
the one `class="job-frame-march"` attribute; the other **15 pages are
byte-identical** once the build id and the CSS and JS chunk names are normalised.
Every route keeps its chunk set (`/`, `/journal` and `/about` 10, the rest 9, the
two error pages 8).


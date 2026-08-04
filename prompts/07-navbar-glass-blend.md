# 07 — Make the header glass blend with what is behind it

Correct the tint fitted in `05-navbar-sticky-glass.md`. The bar currently lifts
the background it sits on: at the top of `/` it reads as a lighter band across
the hero sky instead of disappearing into it.

Source of truth: `/home/gdk26/Videos/Screencasts/Screencast_20260804_115028.webm`
— 31.7s at 1264×573, the homepage scrolled down through the dashboard and back
to the top, with the pointer sweeping down the sky gradient behind the bar.

---

## What is wrong

`05` fitted the tint on `/article/[slug]`, against the t=88s frame of
`navbar-demo.webm`, and landed on `bg-white/30`. That page's backdrop is
photographs, where a lift is hard to read as wrong. The homepage's backdrop is a
single smooth gradient, where it is obvious.

Measured on the shipped build, `/` at 1280, unscrolled, sampling x 340–940:

| | in the bar (y 20–40) | below it (y 70–90) |
|---|---|---|
| shipped `bg-white/30` | `#C7E1FD` | `#B3D7FB` |
| the screencast | `#A3CDF5` | `#ADD2FA` |

The shipped bar is ~14 levels **lighter** than the sky under it. In the
screencast the bar is, if anything, a shade darker — i.e. it is not lifting the
sky at all.

## The measurement to fit against

Not the screencast's absolute values — it is VP9, and its whole frame sits a few
levels below our render. Fit against **the page with no bar at all**: render `/`
with `background:none; backdrop-filter:none` on the `<header>`, then compare each
candidate to it row by row down the 60px the bar occupies. A bar that blends is
one whose pixels match the bare gradient.

Mean absolute error against that reference, over y 6–54 (already measured):

| tint | mean err | max err |
|---|---|---|
| `bg-white/6` | 2.3 | 3.0 |
| `bg-white/10` | 4.2 | 5.0 |
| `bg-white/15` | 5.9 | 6.7 |
| `bg-white/20` | 8.2 | 9.0 |
| `bg-white/30` (shipped) | ~14 | — |

The error falls monotonically toward zero tint: over a near-linear gradient a
pure `blur(32px)` reproduces the gradient almost exactly.

## The change

In `app/_components/chrome.tsx`, `SiteNav`:

- **`bg-white/30` → `bg-white/10`.** Blur radius stays `32px`; the
  `bg-white/85` no-`backdrop-filter` fallback stays as it is.
- Nothing else changes — still `sticky top-0 z-50`, still full-bleed, still no
  border and no shadow.

**Why 10 % and not 0.** Zero is the best blend, but there is a real cost on
`/article/[slug]`: where the bar crosses the third card's sunset photograph the
backdrop is nearly black, and at zero tint the black `Journal` and `About` links
sit on it at roughly 1.5:1. At 10 % they stay readable, and 10 % is 4 levels out
of 255 on the sky — below the threshold where the band is visible, as the
render comparison below will confirm. If the check shows the band is still
visible at 10 %, drop to `bg-white/6`; do not go back up.

This is a deliberate departure from the `navbar-demo.webm` fit recorded in
`AGENTS.md`. That video only ever showed the bar over photographs, where the
tint is unconstrained; this one shows it over a flat gradient, which pins it.
The homepage is the stronger constraint and wins.

## Out of scope

- Blur radius, geometry, z-order, the sticky mechanics, the mobile panel — all
  settled in `05`.
- Any per-page or scroll-state variation of the tint. Still one constant bar.
- The footer, and anything inside the nav row.

## Verification

1. `npm run lint`, `npm run typecheck`, `npm run build`.
2. Render `/` at 1280 unscrolled twice — once as shipped, once with the
   `<header>`'s background and `backdrop-filter` forced off — and diff the top
   140px. Report the mean and max per-row error over y 6–54; it must be ≤ 5.
3. Confirm `/` below y=60 is still pixel-identical to `main` at 375, 800 and
   1280 — the tint change must not touch anything but the bar.
4. Re-render the `/article/[slug]` recent-articles band at the same scroll
   position as the `navbar-demo.webm` t=88s frame and confirm the four nav links
   are still legible over the sunset photograph.
5. Scroll `/`, `/journal` and the article page at 1280 and confirm the bar still
   never unpins.

## On completion

Amend the "Site header" note in `AGENTS.md`: the tint is `bg-white/10`, fitted
against the bare-gradient reference on `/` rather than the article band, and
record why that supersedes the `navbar-demo.webm` fit. Keep the blur's 28–36px
derivation — only the tint changes. Then commit to `main`.

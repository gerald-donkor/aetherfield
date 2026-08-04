# 05 — Sticky frosted-glass header

Correct the feel and look of `SiteNav` to match `navbar-demo.webm`: the header
pins to the top of the viewport and the page scrolls underneath it through a
frosted-glass bar.

Source of truth: `/home/gdk26/Videos/Screencasts/navbar-demo.webm` — a 92s
screencast of the Figma prototype at 1280×575, covering `/article/[slug]` and
the recent-articles band on both article pages.

---

## What the demo shows

1. **The bar is pinned.** Through every scroll, up and down, across page
   transitions, the header stays at the top of the frame. It never hides on
   scroll-down and never re-animates in.

2. **Content passes under it, blurred.** Where the bar crosses the three
   recent-article images, the sky/moss/sunset read as a heavy horizontal smear
   inside the bar; where it crosses body prose, the type dissolves to a faint
   grey wash. This is a backdrop blur with a light tint — **not** an opaque
   fill. Over the white page top the bar is invisible.

3. **No edge treatment.** No bottom hairline, no shadow, no rounded corners.
   The blur simply stops at the bar's bottom edge.

4. **The bar is full-bleed.** The glass runs the full frame width while the
   wordmark and links keep the page gutters.

5. **Height is unchanged.** Measured off the video at t=88s: the frame's top
   edge and the bar's bottom edge are 60 video-px apart at a 0.987 frame scale
   — 60px, matching the shipped `h-[60px]`.

6. **Content is not pushed down.** The bar overlays; the first content sits at
   the same y it does today.

7. **Nothing else changes.** Wordmark size, the four links, the 28px gap and
   the `Get started →` link-button all already match the demo frames.

## What it does not show

The screencast is desktop-only at 1280. The mobile toggle and panel are
untested by it — carry them forward, adjusting only what pinning forces
(below).

---

## Changes

### 1. `app/_components/chrome.tsx` — `SiteNav`

- Make the `<header>` `sticky top-0 z-50`, full-bleed, and move the existing
  `Container` **inside** it so the glass spans the viewport while the row keeps
  its `max-w-page px-5 lg:px-6` gutters. `Container` lives in
  `app/_components/home/sections.tsx`; import it, or inline the same
  `mx-auto w-full max-w-page px-5 lg:px-6` — do not create a second container
  primitive.
- Give the header the glass: a translucent white fill plus
  `backdrop-blur`. **Start at `bg-white/60` with `backdrop-blur-[20px]`**, then
  verify per the check below and adjust — these two numbers are the one thing
  in this prompt not measured exactly off the video, because the content behind
  the bar differs at every scroll position and there is no clean sample pair.
  The blur must read as a smear of the image beneath, not a frosted white slab:
  at t=88s the moss image under the bar still samples around `#818770`, so the
  tint is light.
- No border, no shadow.
- Add `supports-[backdrop-filter]:bg-white/60` with a more opaque
  `bg-white/85` fallback so the bar stays legible where `backdrop-filter` is
  unsupported.
- The mobile panel now overlays content instead of pushing it, so give the open
  panel an opaque `bg-white` (it must not show prose through it) and let it
  scroll if it exceeds the viewport. Keep the 40px items, hairline separators
  and full-width CTA exactly as they are.

### 2. The three pages — hoist `SiteNav` out of `Container`

`sticky` only travels within its parent, so `<Container><SiteNav /></Container>`
would unpin as soon as that one-child wrapper scrolls off. In each page, drop
the wrapper and render `<SiteNav />` directly.

- `app/journal/page.tsx` and `app/article/[slug]/page.tsx`: straight swap.
  Both nav blocks are already the first child of the fragment.
- `app/page.tsx`: `SiteNav` sits inside `<div className="relative isolate">`
  alongside the `hero-sky` band, which would unpin the header after the hero.
  Take the sky out of that wrapper — as a document-level `absolute inset-x-0
  top-0 -z-10` sibling it still starts at the page top and still paints behind
  the nav and hero. Then render `SiteNav` and `Hero` as plain siblings.

  **This touches the settled homepage.** The hero must not move by a pixel;
  verify per the check below before committing, and if the sky cannot be
  detached cleanly, stop and report rather than restyling the hero.

### 3. `z-index`

`z-50` on the header must clear the article hero, the journal stamp and the
homepage dashboard overhang. Confirm on all three pages that nothing crosses
over the bar.

---

## Out of scope

- The footer (`AGENTS.md`: settled).
- Any type, spacing, colour or link-target change inside the nav row.
- Hide-on-scroll, shrink-on-scroll, or a scrolled/unscrolled state change. The
  demo shows one constant bar.
- Mobile redesign beyond the panel background and z-order that pinning forces.

---

## Verification

1. `npm run lint` and `npm run typecheck`.
2. `npm run build`.
3. Screenshot `/article/how-to-build-a-climate-ready-data-stack` at 1280 wide,
   scrolled so the header crosses the three recent-article images, and compare
   against the extracted demo frame at t=88s. The bar's smear should have
   comparable tone and comparable blur softness at the image boundaries. Adjust
   the tint and blur radius to match; report the final values.
4. Screenshot `/` at 375, 800 and 1280 **before and after**, unscrolled, and
   diff. The hero, sky band and dashboard overhang must be unchanged.
5. Scroll each of `/`, `/journal` and the article page top to bottom at 1280
   and confirm the bar never unpins and nothing paints over it.
6. At 375, open the mobile menu, confirm it is opaque over the page beneath and
   that tapping a link closes it and navigates.

## On completion

Record in `AGENTS.md` under a new "Site header" note: that the header is
sticky, full-bleed glass over a gutter-aligned row; the final tint and blur
values and that they were matched against the screencast rather than a comp;
that the pages render `SiteNav` outside `Container` **because** sticky needs a
tall parent; and that the homepage sky was detached from the `relative isolate`
wrapper for the same reason. Then commit to `main`.

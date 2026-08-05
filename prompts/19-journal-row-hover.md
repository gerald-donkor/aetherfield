# 19 — The homepage journal rows' hover

## Scope, and why it is next

The homepage's "From the journal" rows (`app/_components/home/journal.tsx`) are
the one interactive surface the user has a reference recording for, and today
they do not match it. Hovering a row snaps an underline under the title and does
nothing else — `journal.tsx:132` sets `group-hover:underline` with no
`transition` class anywhere near it. The user supplied a second recording of how
it should look and said *"It should be looking like this."*

Prompt 17 built the homepage's scroll motion and prompt 18 tuned its speed; this
is the same page's hover vocabulary, which neither touched. **CSS only — no
GSAP, no `motion`, no new component.**

## Reference material

- `~/Videos/Screencasts/Screencast_20260805_193215.webm` (1352×655, 60 fps) —
  the **current** behaviour. Sampled at 30 fps: the underline goes from absent
  to full width in a single frame, so it is instant, not animated.
- `~/Videos/Screencasts/Screencast_20260805_193354.webm` (1270×570, 60 fps) —
  the **target**. All the measurements below come from this file.
- `app/_components/home/journal.tsx` — the only file to edit.
- `app/_components/chrome.tsx:159` — `SiteFooter`'s existing `hover:opacity-70`,
  the idiom this change follows.
- AGENTS.md, "Homepage motion (`/` only)" and "The component split".

## The measurements the implementation must hit

Extract at 30 fps (`ffmpeg -v error -ss 0 -to 1.5 -i <ref> -vf fps=30 -q:v 2
h%03d.jpg`) and probe with `magick`. Do **not** diagnose off a 1 fps sample.

**The recording is 1:1 with CSS pixels** — the thumbnail column measures
x 325→490 = 165 px against the authored `md:grid-cols-[164px_1fr]` — so
distances read off it are CSS pixels directly. Establish this first; every
number below depends on it.

| what | at rest | on hover | how it was measured |
| --- | --- | --- | --- |
| whole row (image + title + meta) | — | **slides right 10 px** | title ink box in a fixed crop: left edge 6 → 16, **width constant at 365** — a translation, not a scale |
| title colour | `#000` | **≈ 84/255 ink ≈ 0.67 opacity** | aligned crop mean 198.87 → 217.27; ink fraction 0.220 solves to 84 |
| meta line | — | **unchanged** | aligned crop mean 240.81 → 240.73 |
| thumbnail | — | **unchanged** — no zoom, no fade | aligned crop mean 186.65 → 186.66, ink box height constant |
| the row's `border-b` rule | — | **does not move** | static pixels — so the transform belongs on the `<Link>`, not the `<li>` |
| underline | none | **none** | title ink box height constant at 19 px in every frame |
| a non-hovered row | — | **identical** | control crop 254.937 → 254.937 |

**Timing.** Title left edge per frame from onset: `6,6,6,7,7,9,10,12,13,15,16,
16,16,16`; mouse-out mirrors it (`16→6` over ~8 frames). Fitting named curves:

| curve | best duration | SSE |
| --- | --- | --- |
| linear | 230 ms | 0.0153 |
| **`ease-in-out`** | **300 ms** | **0.0157** |
| `ease-out` (CSS) | 270 ms | 0.0211 |
| `ease` | 360 ms | 0.0334 |
| `ease-out` (Tailwind's `cubic-bezier(0,0,.2,1)`) | 330 ms | 0.0518 |

Linear and `ease-in-out` are tied at the top and **Tailwind's default `ease-out`
is measurably the worst fit**, so the easing is authored explicitly rather than
left to the default. ±1 px on a 10 px travel is ±10 % of progress; claim no more
precision than that.

## The change

Two class strings in `app/_components/home/journal.tsx`. Nothing else.

The row `<Link>` (line 119) — it is a **child** of the `data-reveal-item` `<li>`,
so it never collides with the inline transform GSAP writes during the reveal:

```
  group grid gap-4 md:grid-cols-[164px_1fr] md:items-start md:gap-6
+ transition-transform duration-300 ease-in-out motion-reduce:transition-none
+ hover:translate-x-2.5
```

The title `<h3>` (line 132):

```
- font-sans text-p1 font-bold group-hover:underline
+ font-sans text-p1 font-bold transition-opacity duration-300 ease-in-out
+ motion-reduce:transition-none group-hover:opacity-70
```

Four mechanics, all verified against the **built** stylesheet rather than
assumed — re-check them if Tailwind is ever upgraded:

- `translate-x-2.5` is `2.5 × --spacing`, and `--spacing` is not overridden in
  `@theme`, so it is exactly **10 px**.
- Tailwind v4 emits translate utilities as the `translate` property, **not**
  `transform`. `.transition-transform` compiles to
  `transition-property: transform, translate, scale, rotate`, so it does cover
  it — but `transition-[transform]` would not.
- v4 already wraps every `hover:` / `group-hover:` rule in
  `@media (hover:hover)`, so nothing sticks on touch and no extra guard is
  needed.
- `opacity-70` predicts a crop mean of 215.7 against the measured 217.3;
  `opacity-65` predicts 218.5. The two straddle the measurement and cannot be
  told apart, so **70 wins on idiom** — `SiteFooter` already ships
  `hover:opacity-70`. `text-muted` (`#6c6c6c`) predicts 222.6 and is **ruled
  out** by 5 grey levels.

`motion-reduce:transition-none` leaves the hover state intact but instant, which
is how the project already treats reduced motion (the GSAP reduce branch sets
the final state and returns).

## Expected impact

- **`/` is the only route whose prerendered HTML may change**, and its only
  diffs must be those two `class` attributes. `/journal`, `/careers`, `/about`,
  `/design-system`, all six articles and all three job listings must come back
  byte-identical. Verify with the build-diff helper (AGENTS.md § 3), normalising
  the build id and the CSS chunk name.
- **No layout row moves.** `translate` and `opacity` are compositor properties
  and neither is applied at rest, so `/`'s settled state is pixel-identical.
- `journal.tsx` stays a **server component** — no `"use client"`, so the
  `home/sections.tsx` barrel rule and the GSAP bundle boundary are untouched.

## Non-goals

- **`ArticleCardStacked` in `cards.tsx` is not touched.** It carries the same
  `group-hover:underline` idiom and feeds `/journal`, the `/article` recent-
  articles band and `/design-system`, but those were fitted against their own
  comps and there is no reference recording for them. Confirmed with the user.
- No change to `JobCard`, the nav links, the footer links, "Back to Careers" or
  the "View all articles" link — the rest of the site's hover states stay as
  they are, inconsistent or not. Unifying them is a separate decision.
- No change to the scroll reveals, their timings, or `motion/register.ts`.
- No GSAP and no `motion` for this — the hover is CSS, which is what keeps the
  section a server component. AGENTS.md's "do not mix the two libraries on one
  page" still stands.
- No focus-visible ring added to the row link; that is a separate accessibility
  pass across every link on the page, not a hover change.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Prerendered-HTML diff against a build with `journal.tsx` reverted (above).
- In the real browser — `npx next start -p 3001` (check `ss -ltn` first; port
  3000 is usually the user's dev server), driving `playwright-core` from
  `/home/gdk26/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core`
  (CommonJS: `import pkg from '…/index.js'; const { chromium } = pkg;`) at 1280,
  assert:
  - the row `<Link>`'s `getBoundingClientRect().x` differs by **10.0 px**
    between rest and `page.hover()`;
  - the `<h3>`'s computed `opacity` goes `1` → `0.7`;
  - its computed `text-decoration-line` stays `none` in both states;
  - the `<li>`'s rect x is **unchanged** — the rule must not move;
  - a mid-transition sample of the link's x is strictly between the two, i.e. it
    animates rather than snapping.
- Confirm the journal section still fades and rises on scroll-in and is not left
  with a stray transform.

## Record in AGENTS.md

A new `### The journal rows' hover` subsection inside "Homepage motion
(`/` only)": the measured 10 px / ~0.67 opacity / 300 ms `ease-in-out`, the
curve-fit table and why Tailwind's default `ease-out` was rejected, the
`opacity-70` vs `opacity-65` vs `text-muted` reasoning, the four Tailwind v4
mechanics above, that the transform sits on the `<Link>` inside the
`data-reveal-item` `<li>` on purpose, and that this is CSS rather than GSAP so
the section stays a server component. Note explicitly that `cards.tsx` was left
alone and why.

## SKILLS USED

- `tailwind-4-docs` — v4 variant and transition semantics: that translate
  utilities emit the `translate` property, what `transition-transform` expands
  to, the `@media (hover:hover)` gating of `hover:`, and the `motion-reduce:`
  variant.
- `gsap-react` — only to confirm the reveal is untouched: `Reveal` writes GSAP's
  inline transform on the `data-reveal-item` `<li>`, so a CSS `translate` on the
  `<Link>` inside it cannot conflict.

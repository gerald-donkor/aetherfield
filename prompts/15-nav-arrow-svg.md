# 15 — Draw the navbar's "Get started" arrow as an SVG

## Why

`LinkButton` (`app/_components/primitives.tsx:184`) renders its arrow as the
Unicode glyph `→` inside a `<span>`. **Archivo has no `→`**, so the glyph is
served by whatever fallback the browser picks, and the shape is therefore not
under our control: it differs machine to machine.

Measured, same page (`/about`), same 1262-wide viewport, ink bounding box of the
arrow alone:

| source | arrow ink | shape |
| --- | --- | --- |
| the reference screenshot (`Screenshot_20260805_105535.png`) | **12 × 9** | 2px shaft, chevron head, head ≈ 60 % of the width |
| headless Chromium against the dev server | **15 × 6** | long flat shaft, tiny 3px head |

Same markup, same CSS, two different arrows — that is the fallback, not a layout
bug. The user's instruction is: **render exactly what the screenshot shows**, on
every browser. A drawn arrow is the only way to hold that, and it is the rule
this project already follows wherever a glyph is not fittable (the `Seal`'s ®,
the job-listing bullets, the dashed card frame).

## The target, measured

Ink map of the screenshot's arrow, crop `26x18+1220+21`, threshold 60 %
(`#` = ink; column 1–2 is the `d` of "started", kept for the baseline reference):

```
 4 .##.......................
 5 .##.......................
 6 .##..........###..........
 7 .##...........###.........
 8 ###............###........
 9 .##.............###.......
10 .##.....############......
11 .##.....###########.......
12 .##............###........
13 .##...........###.........
14 ###..........###..........
15 .##.......................
```

Reading it:

- **Arrow ink is 12 wide × 9 tall** — columns 8…19, rows 6…14.
- **The shaft is 2px** (rows 10–11) and spans the full 12px width.
- **The head is a 45° chevron**: arms run from `(13, 6)` and `(13, 14)` to the
  tip at `(19, 10)` — 6px of horizontal run against ±4px of rise, drawn ~2px
  thick (3px on the diagonal, which is one 2px stroke antialiased).
- **Vertical placement**: the arrow's centreline is row 10.5. The `d` stem runs
  rows 4…15, i.e. cap top 4 and baseline 15, so the arrow centres on
  **cap-height mid**, 1.5px above the optical centre of the lowercase.
- `--text-nav` is 16px, so at 1em the arrow is **0.75em wide × 0.5625em tall**
  with a **0.125em** stroke.

## Scope

**One file: `app/_components/primitives.tsx`, `LinkButton` only.**

Replace the `<span aria-hidden>→</span>` with an inline `<svg aria-hidden>` on
`viewBox="0 0 12 9"`, sized `w-3` (12px) and drawn with
`stroke="currentColor" strokeWidth="2"` — shaft `M0 5h11`, head `M13 6`-style
chevron `M7.5 1.5 11 5l-3.5 3.5`, with `strokeLinecap`/`strokeLinejoin` left at
`butt`/`miter` so the tip stays sharp, exactly as the pixel map shows (the tip
is a single 1px column, not a rounded cap).

Geometry notes for the implementation:

- The viewBox is the **ink box**, not a padded square — the 2px stroke is
  centred on the path, so the shaft sits at `y=5` giving rows 4–6 of a 9-tall
  box, and the chevron's outer extents land on `y=0.5` and `y=8.5`. Author the
  path so the *stroke*, not the path, fills 0…9.
- Keep the wrapper `<span>`'s existing `ml-1.5` gap and the
  `transition-transform duration-200 group-hover:translate-x-1.5` hover slide —
  neither changes.
- Centre on cap height with `align-middle` plus the measured `-mt` nudge rather
  than baseline alignment; verify against the ink map above, do not eyeball it.

**Out of scope, flag only:** `app/_components/about/sections.tsx:56` ("Adjust
your targets →") uses the same bare glyph and carries the same fallback risk. It
is not the navbar and the user asked for the navbar. Raise it after this ships.

## Verification

1. `npm run lint` and `npm run typecheck` — report exact output.
2. Production build on a free port (**check 3000 and 3007 first; both are in use
   by the user's servers — use 3001**), screenshot `/about` at 1262 wide,
   `deviceScaleFactor: 1`, and re-run the ink map:

   ```
   magick render.png -crop 26x18+1220+21 +repage -colorspace Gray -threshold 60% \
     -negate -depth 8 txt:- | awk 'NR>1{gsub(/[,:]/," ");y=$2; \
     v=(substr($3,2)+0>0)?"#":".";g[y]=g[y] v} END{for(y=0;y<18;y++) printf "%2d %s\n", y, g[y]}'
   ```

   The arrow must land **12 × 9 at columns 8…19, rows 6…14**, with the 2px shaft
   on rows 10–11. Diff it against the map above and report any row that differs.
3. Confirm `/`, `/journal`, `/careers` and `/about` are otherwise unchanged —
   the only pixels that may move are inside the two `LinkButton`s (navbar on
   every page, plus the `/design-system` sample).
4. Hover the nav CTA and confirm the arrow still slides 6px.

## Then

Record it in `AGENTS.md` under the site-header section — the measured ink map,
why the glyph was dropped, and the fact that `about/sections.tsx` still carries
one. Commit to `main`.

**Note:** the working tree already carries uncommitted changes to
`app/_content/jobs.ts` and `app/_components/job/sections.tsx` (prompt 14, UX
Designer). **Commit only `primitives.tsx` and `AGENTS.md`** — do not sweep that
work into this commit.

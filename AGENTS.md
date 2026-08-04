# AGENTS.md

You are a **principal-level design engineer, full-stack engineer with several years of experience and AI implementation agent** working on **Aetherfield**.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes

## The footer is fixed

`SiteFooter` in `app/_components/chrome.tsx` is **settled — do not restyle it.**
It matches the comps at all three breakpoints and is committed. Treat it as
done when building new pages: import and render it, don't fork or adjust it.

This covers the whole footer block — the yellow `--color-brand` field, the
olive `--color-brand-ink` text, the halftone fabric band
(`/assets/generated/texture-brand.png`), and the oversized SVG wordmark. The
wordmark is drawn as SVG `<text>` with `textLength` on purpose, so it fills the
block width exactly at any viewport; a viewport-unit font size clips it.

**The wordmark block is measured, not eyeballed.** `viewBox="0 0 1000 165"` is
the tight glyph box — cap height plus the round letters' overshoot at
`fontSize` 222 — so the SVG carries no padding of its own and the surrounding
`px-5` / `pb-5` / `mt-4 sm:mt-5` are the only spacing. That is what holds the
comps' constant 20px gutter and 20px of yellow below the baseline at 375, 800
and 1280 while the type scales with the viewport. `textLength` is 1013 from
`x="-1.6"`, not 1000 from 0: 1000 is the *advance* width, so a flat 1000 leaves
the ink inset ~14px on the right by the `d`'s side bearing. Verified against all
three comps — glyph height 55 / 125 / 204, insets 20 on both sides at each.

If a design genuinely calls for a different footer, ask first rather than
editing this one.

## Site header (`SiteNav`)

The header is **sticky, full-bleed frosted glass**: `sticky top-0 z-50` on a
full-width `<header>`, with the row inside it holding the page gutters. It
never hides, shrinks or changes state on scroll — one constant bar.

**The glass is `bg-white/30` over `backdrop-blur-[32px]`**, no border and no
shadow, with a `bg-white/85` fallback where `backdrop-filter` is unsupported.
Those two numbers are **matched against the screencast
`~/Videos/Screencasts/navbar-demo.webm`, not a comp** — there is no static comp
of the bar over content. Method, so it can be redone: extract the t=88s frame
(`ffmpeg -ss 88`, 1280-wide prototype at frame scale 0.987), render
`/article/how-to-build-a-climate-ready-data-stack` scrolled to the same place,
then sweep tint × radius against two metrics — the bar's average tone across
its width (16×1 downsample, isolates tint from structure) and the softness of
the card-image edge under it (a horizontal profile across the first image
gutter, isolates radius). Tone bottoms out at 30 % white, edge softness at
28–36px; 32px is the midpoint. At the matched frame the moss under the bar
samples `#7C7E6D` against the demo's `#8A8E79`.

**The pages render `SiteNav` outside `Container`.** `sticky` only travels
within its parent, so a one-child `<Container><SiteNav /></Container>` wrapper
unpins the bar the moment that wrapper scrolls off. `SiteNav` therefore carries
its own gutters: the `Container` class string is **inlined** in `chrome.tsx` as
`CONTAINER` rather than imported, because `chrome.tsx` is a client module and
importing from `home/sections.tsx` would pull the hero dashboard and the
article list into the client bundle. Keep the two in step.

**The homepage sky was detached from its `relative isolate` wrapper** for the
same reason — `SiteNav` sat inside it alongside the hero and would have unpinned
below the fold. The band is now a document-level `absolute inset-x-0 top-0
-z-10` sibling: with no positioned ancestor it resolves against the initial
containing block, so `top-0` is still the page top and it still paints behind
the nav and hero. Verified: `/` at 375, 800 and 1280 is **pixel-identical below
the 60px bar** before and after.

**Known consequence:** the bar is invisible over white, but on `/` at scroll 0
it sits over the hero sky, so its 30 % white tint reads as a slightly lighter
band across the top 60px. That is inherent to a constant translucent bar — the
demo has no unscrolled/scrolled state to switch between — and it is the only
homepage pixel change.

The mobile panel now overlays content instead of pushing it, so it is opaque
`bg-white` and scrolls at `max-h-[calc(100dvh-60px)]`. Items, separators and
CTA are unchanged.

## Journal index (`/journal`)

`app/journal/page.tsx` with its sections in `app/_components/journal/sections.tsx`.
Reuses `SiteNav`, `Container`, `CtaBand` and `SiteFooter` as-is.

**The masthead stamp is one scaling SVG.** `JournalStamp` draws the whole stamp
interior — perforations, hand-drawn frame, lozenge and all six pieces of type —
on a single `viewBox="0 0 1240 480"`, inside a wrapper holding that exact ratio.
That is why the three comps agree: nothing is sized per breakpoint. Hand-sizing
type here means you have drifted from the comp. Measured off `Desktop.png`:
26 perforations at pitch 1240/25, r 15, centred on the corners; frame inset
20 across / 30 down at stroke 3; lozenge at stroke **6** (twice the frame) with
tips at x 160 / 1080 and apexes at y 62 / 415, rounded left and right tips only.

**`texture-journal.png`** is the stamp's fabric — the same draped cloth as the
footer band, duotoned blue and halftone-screened:

```
magick "public/assets/images/Footer image.png" \
  -colorspace Gray -resize x743 -gravity center -extent 1920x743 \
  -sigmoidal-contrast 8,50% \
  -ordered-dither h4x4a \
  +level-colors '#63AAF6','#9DCCFF' \
  public/assets/generated/texture-journal.png
```

The sigmoidal contrast is load-bearing: without it the dither lands near 50 %
everywhere and the folds disappear into a flat crosshatch. Verified against the
comp at `Desktop.png -crop 130x380+55+100` — mean `#8AC3FE`, tones `#9CCCFF` /
`#6AAEF7`.

**Shared-component extensions made here** (both additive, `/` unchanged):
`ArticleCardStacked` takes optional `src`/`alt` (falling back to `Placeholder`),
`href` (which makes the whole card one link), `priority` and `className`; the
`max-w-[612px]` cap moved out of the component so it fills a grid column.
`CtaBand` takes an optional `action` label defaulting to `"Request a demo"`.

**Known deviation:** the comps set card titles and descriptions around 16px on
mobile, but `--text-p1` / `--text-p2` are a fixed 20px in the design system and
`/` ships that way. The journal page follows the system, so mobile titles and
descriptions wrap one line more than the comp. Changing it is a type-scale
decision that would also move the settled homepage — raise it before doing so.

## Article content lives in `app/_content/articles.ts`

`ARTICLES` is the one list behind `/`, `/journal` and `/article/[slug]` — the
`Article` type lives there too and `app/_components/cards.tsx` re-exports it.
Do not reintroduce a per-page copy. `FEATURED_ARTICLES` is the homepage's first
three.

Prose is separate: `ARTICLE_BODIES`, keyed by slug. Only slugs with a body are
prerendered (`WRITTEN_SLUGS` feeds `generateStaticParams`); the other five
articles are card copy and **404 by design** until their prose is written.
Keeping bodies out of `ARTICLES` is what stops the two index pages shipping
article prose they never render.

## Article page (`/article/[slug]`)

`app/article/[slug]/page.tsx` with its sections in
`app/_components/article/sections.tsx`. Reuses `SiteNav`, `Container` and
`SiteFooter`. **There is no `CtaBand`** — the comp runs the recent-articles band
straight into the footer.

Two `@utility` steps were added in `app/globals.css` because neither curve
already existed: `display-article-title` (36 / 64 / 80) for the masthead, and
`display-band-h2` (32 / 50 / 60) for "Recent articles". They are separate
utilities, not one with modifiers, because the two step differently.

**The reading column's 28px leading is set on the prose, not on the token.**
`--text-p2` is a fixed 20/24 and the settled pages depend on it, so the article's
line pitch is a `leading-[28px]` on the prose elements. Verified against the
desktop and tablet comps, where the pitch is 28 in both.

**`article-climate-hero.png`** is cropped out of the desktop comp — the
photograph is not in `public/assets/images`:

```
magick public/assets/pages/03-article1/screen-sizes/Desktop.png \
  -crop 1240x500+20+380 +repage -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-climate-hero.png
```

PNG, not JPEG: the image is a hard halftone dot screen and JPEG rings on it.
Quantising to 64 colours takes it from 791 KB to 179 KB with no visible change.
**Known limitation:** this is a 1x asset, so it is soft on a 2x display. Replace
it with the source photograph when one is available.

**Measured against the comps** at 375 / 800 / 1280. Masthead meta, both title
lines and the hero top all land within 1px at all three; the rail, lede, body
rule, band heading and card images land within 2px at 1280. Two drifts, both
inherited rather than introduced:

- The shipped Archivo runs ~18 % wider per unit of cap height than the comps'
  cut, so paragraphs wrap a line earlier — the desktop body ends ~24px low.
  This is visible on the settled `/journal` too (its "Latest articles" measures
  257px wide against the comp's 235 at the same size), so it is a font-loading
  question for the whole site, not this page.
- Mobile runs ~380px long, for the 20px `--text-p1` / `--text-p2` reason already
  recorded above.

`MetaPair`'s built-in 7px label→value gap sits ~6px below the comp on this page.
It was left alone rather than made configurable, since it is correct where it
already ships.

# 1. Workflow

For every implementation request:

1. Read `AGENTS.md` and follow its instructions as the highest priority project guidance. `AGENTS.md` is the source of truth for implementation decisions. User requests may override these rules only when the user explicitly requests a deviation, explains why, and the relevant rule is intentionally changed.
2. Read the skills explicitly mentioned by the user.
3. Inspect only the code, files, and dependencies relevant to the request. Do not inspect, modify, or reason about unrelated parts of the repository unless they directly affect the approved implementation.
4. Ask a focused question only if the task has meaningful ambiguity. Do not ask questions when reasonable assumptions can be made without affecting the implementation outcome.
5. Create a detailed prompt file in `prompts/` per the contract in section 4.
6. Ask: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. On approval, re-read the approved prompt file in `prompts/` and implement it strictly. Implement only after user approval. Entering `y` or `Y` = `Approved. Execute.`  
8. Run available checks (section 2). Then finally, add all that was implemented to this `AGENTS.md`
9. Share exact steps to test or run the completed feature.
10. Commit the resulting change to `main`, unprompted. Every executed prompt ends in a commit—never leave implemented work uncommitted. Do not push unless asked.

Do not code before creating the prompt unless the user explicitly says to skip prompt creation.

**Why step 10 matters.** Resolving what is already built (below, and on any resume) reads the files on disk and `git log`, never the prompt files. Work left uncommitted makes that resolution wrong and invites a duplicate prompt for a feature that already exists.

**Resuming in a new session.** Entering `I` or `i` = `Work out what comes next and write its prompt file.` It runs steps 1–6 of this workflow and stops at the approval question. It never implements anything—`i` writes the prompt, `y` executes it.

Resolving what "next" means, in a session with no prior context:

1. **The number** is the highest existing prompt number in `prompts/` plus one. Never renumber, never overwrite, never reuse a number (section 4).
2. **The scope** is the next unbuilt item from section 1's build list, ordered by what unblocks the most downstream work. The spec's four-phase roadmap (section 7 of the spec) is the narrative for why that order exists; use it as context, not as a checklist to walk mechanically.
3. **Establish what is already built from the repository**—the files on disk and `git log`—not from the existing prompt files. A committed prompt file is evidence that a prompt was written, never that it was executed. Writing a prompt for work that already exists is the main failure mode here.
4. **Name the chosen scope and say why it is next in the first line of the reply**, before writing the file, so a wrong call is visible immediately.
5. If two candidates are genuinely equally unblocking, write neither yet—name both, state the trade-off, and ask.

Then finish with step 6's question as written.

# 2. Commands and checks

Scripts that currently exist in `package.json`:

- `npm run dev` — start the Next.js dev server (Turbopack); watch its terminal for job and pipeline logs
- `npm run build` — Next.js production build
- `npm run start` — run the production build locally after `npm run build`
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`

Report the exact command output; never claim a check passed without running it.

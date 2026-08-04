# 06 — Second article: “Sustainability Isn’t a Side Project: Making Impact Operational”

**Scope.** Make the circled row in the homepage “From the journal” list — the
second article — resolve instead of 404. The link markup already exists
(`app/_components/home/sections.tsx:363` renders `/article/${a.slug}` for every
card) and the slug
`sustainability-isnt-a-side-project-making-impact-operational` is already in
`ARTICLES`. What is missing is the **prose body** and its **hero asset**, which
is what `WRITTEN_SLUGS` gates on. So this is a content + asset change against the
settled `/article/[slug]` route — **no new components, no layout changes.**

Design source: `public/assets/pages/04-article2/screen-sizes/{Desktop,Mobile,Tablet}.png`.

Plus three rules the user asked to be written into `AGENTS.md` (section 6 below).

---

## 1. What the comp confirms is already built

Measured on `Desktop.png` (1280), `Tablet.png` (800), `Mobile.png` (375):

| Element | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Hero box | `1240×500 +20+460` | `760×307 +20+412` | `335×136 +20+306` |
| Recent-articles cards | `403×235` ×3 | `760×443` stacked | `335×195` stacked |

Same geometry, same aspect (≈2.48) and same three recent cards as
`/article/how-to-build-a-climate-ready-data-stack`. The masthead (`Strategy · 7
min` eyebrow over the three-line title), the Published/Author rail, the lede +
rule, the five `heading + body` sections, `Recent articles` and the footer are
all rendered by the existing `ArticleMasthead` / `ArticleBodyLayout` /
`RecentArticles`. Nothing in the comp asks for a new element.

Verify at the end; do not pre-emptively restyle anything.

## 2. Asset — `public/assets/generated/article-impact-hero.png`

The hero is **`public/assets/images/Image-7.png`** (the moss-and-fern rock face —
the same photograph this article’s card already uses) put through a blue duotone
halftone. Confirmed by structural match: blurred/normalised 62×25 comparison of
the comp’s hero against every file in `public/assets/images` scores Image-7 at
RMSE 0.300, the next best (`Footer image.png`) at 0.366 — a clear win.

Sampled off the comp:

- dot colour `#2683EB` — exactly `--color-accent`, no new token
- paper/highlight `#F2E9D6`, corner field `#EDE5D2` — i.e. the cream family
  (`--color-cream` is `#eee8d7`)

So this is one two-tone `+level-colors` pass, not a cutout: the photograph’s own
beige studio backdrop is what makes the cream wedges in the comp’s top-right and
bottom-left corners.

Starting recipe (same family as the settled `texture-journal.png` — the
sigmoidal contrast is what stops the dither flattening to 50 % everywhere):

```
magick public/assets/images/Image-7.png \
  -crop 768x420+0+336 +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% \
  -ordered-dither h4x4a \
  +level-colors '#2683EB','#F2E9D6' \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-impact-hero.png
```

**The crop window is the one open number.** `768x420+0+336` is the best of a
swept search but only at RMSE 0.282, so settle it during implementation by eye
against `Desktop.png -crop 1240x500+20+460`, adjusting the crop offset/height
(and, if the comp turns out to squash the full square, dropping the `-crop`
entirely) until the rock’s diagonal and both cream corners land in the same
place. Record the final command in `AGENTS.md`.

PNG not JPEG, and quantised to 64 colours, for the reason already recorded for
`article-climate-hero.png`: a hard dot screen rings under JPEG, and the palette
cut is free at this dot count. Target well under 200 KB.

**This is a genuine improvement over article 1’s hero,** which was cropped out of
the comp at 1x because the photograph was unavailable. Here the source is a 768²
original, so the generated asset is resolution-honest at the sizes the page
requests.

## 3. Content — `app/_content/articles.ts` only

Add one entry to `ARTICLE_BODIES`, keyed
`"sustainability-isnt-a-side-project-making-impact-operational"`. That alone puts
the slug into `WRITTEN_SLUGS`, so `generateStaticParams` prerenders it and the
homepage row stops 404-ing. Touch nothing else in the file.

- `published`: the comp reads **May 31, 2028**. The working tree has an
  uncommitted edit pulling article 1 from `May 7, 2028` → `May 7, 2026`, so this
  entry will use **May 31, 2026** to stay consistent with that. Say so at
  approval if the comp’s 2028 is wanted instead.
- `author`: `Gail Force`
- `hero`: `/assets/generated/article-impact-hero.png`, alt “Ferns and moss on a
  shaded rock face, rendered as a blue halftone over cream”
- `lede`: “Too often, sustainability lives on the edge of the org
  chart—under-resourced, reactive, and disconnected from the core business. But
  real impact isn’t an initiative, it’s an operating principle. From product
  decisions to procurement flows, we’ll explore what it takes to embed
  sustainability into the systems that shape everyday work.”

Five sections, transcribed from the comp:

1. **The Risk of Isolation** — “When sustainability is framed as a special
   project, it stays optional. It doesn’t scale, and it rarely survives resource
   cuts. Real impact demands more than executive sponsorship or a glossy strategy
   deck—it requires integration into the systems that run the business.”
2. **Connect to Core Workflows** — “The most successful sustainability programs
   live inside decision-making, not adjacent to it. That means embedding carbon
   data in procurement reviews, emissions factors in product roadmaps, and impact
   metrics in business KPIs. Alignment isn’t just helpful—it’s how things get
   done.”
3. **Mind the Gaps** — “Even teams with good intentions can fall into operational
   gaps. Sustainability may be owned by one team, but its success hinges on
   others—like finance, legal, ops, and product—adopting the same standards and
   workflows. Clear roles, shared tooling, and open feedback loops close the gap
   between ambition and execution.”
4. **Systems Over Sprints** — “Impact doesn’t come from one-off campaigns. It
   comes from systems that make the right choice the easy choice—again and again.
   Whether through automation, governance, or smart defaults, sustainability
   needs to show up where decisions are made, not just where reports are
   written.”
5. **Make It Stick** — “Operationalizing sustainability means designing for
   durability. It means building programs that don’t require daily heroics to
   sustain and that evolve with the business over time. When impact becomes part
   of how work works, momentum follows.”

Use the same curly apostrophes and em dashes as the existing entry.

## 4. Verification

- `npm run lint`, `npm run typecheck`, `npm run build` — the build must list
  `/article/sustainability-isnt-a-side-project-making-impact-operational` as a
  prerendered path.
- Screenshot the route at 375 / 800 / 1280 and diff against the three comps:
  hero box, rail, lede, body rule and the recent-articles band should land within
  the same tolerances already recorded for article 1. The two known drifts (the
  wide Archivo cut, the 20px `--text-p1`/`--text-p2` floor on mobile) are
  inherited — record, don’t chase.
- Click the circled homepage row and confirm it lands on the article.

## 5. Out of scope

The other four unwritten articles. `/`, `/journal` and every shared component
stay byte-identical apart from the one new `ARTICLE_BODIES` key.

## 6. `AGENTS.md` additions (the user asked for these explicitly)

**a. New “Content and asset conventions” section**, placed directly before
`# 1. Workflow`, holding two standing rules:

- *Photography comes from `public/assets/images`.* Every image a page needs is
  sourced from that folder, treated in-repo into `public/assets/generated` when a
  comp shows a duotone/halftone/crop, with the exact `magick` command recorded.
  Cropping artwork out of a comp is a fallback for when the source photograph
  genuinely is not in that folder (as with `article-climate-hero.png`), not the
  default.
- *An article title referenced by its image/design is a slug.* When the user
  points at an article by its title or its comp, its route is
  `/article/<slugified title>` — lowercased, apostrophes and punctuation dropped,
  spaces and colons to hyphens (e.g. “Sustainability Isn’t a Side Project: Making
  Impact Operational” →
  `sustainability-isnt-a-side-project-making-impact-operational`). Do not invent a
  shorter slug; match the entry already in `ARTICLES` when one exists.

**b. New `# 3. Automation` section**, after `# 2. Commands and checks`, seeded
with what this task shows is mechanical and should not be re-derived by hand
each session:

- *A comp folder maps to a route by name.* `public/assets/pages/NN-<name>/screen-sizes/`
  is the design source; `04-article2` is the second article, so the work is a
  content entry, not a new route. Read the folder before asking what to build.
- *Comp geometry is measured, never eyeballed* — the connected-components sweep
  (`-threshold 95% -connected-components 8` with an area threshold) yields hero
  and card boxes at all three breakpoints in one command.
- *Identifying which photograph a treated comp image came from is a search, not a
  guess* — blur, normalise and downsample both to ~62×25 and rank
  `compare -metric RMSE` across `public/assets/images`.
- *Article prose is transcribed from the desktop comp at 200 % zoom*, split into
  two crops so the text is legible in one pass.
- *A new article that reuses `/article/[slug]` is a data change*: one
  `ARTICLE_BODIES` key plus one generated hero. Reach for new components only
  when the comp shows an element the route does not already render.
- *Standing instruction:* each session, watch for steps repeated by hand and add
  the mechanical ones to this section, so later sessions start from the command
  rather than the investigation.

Both additions are new sections; nothing existing is rewritten or removed.

## 7. Commit

One commit on `main` per workflow step 10: the `ARTICLE_BODIES` entry, the
generated hero, this prompt file, and the `AGENTS.md` additions. The uncommitted
`May 7, 2028 → 2026` edit rides along, since it is the same date convention.
Do not push.

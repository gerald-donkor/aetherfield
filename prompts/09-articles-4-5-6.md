# 09 — Articles 4, 5 and 6

Write the last three articles so every card on `/journal` (and the "View all
articles" route out of the homepage journal band) leads to a real page instead
of a 404.

| # | comp | slug | hero asset |
| --- | --- | --- | --- |
| 4 | `public/assets/pages/06-article4/screen-sizes/` | `from-spreadsheets-to-systems-the-evolution-of-climate-reporting` | `article-reporting-hero.png` |
| 5 | `public/assets/pages/07-article5/screen-sizes/` | `carbon-accounting-myths-models-and-must-haves` | `article-carbon-hero.png` |
| 6 | `public/assets/pages/08-article6/screen-sizes/` | `seeing-clearly-designing-feedback-loops-for-sustainable-growth` | `article-loops-hero.png` |

All three `ARTICLES` entries already exist with the right title, category and
read time — the comps' meta lines (`Tooling · 6 min`, `Tooling · 6 min`,
`Strategy · 4 min`) match them exactly. So this is **three `ARTICLE_BODIES`
keys plus three generated heroes**, the article 2 / article 3 pattern.

## 1. Scope — what is and isn't touched

**Touched**

- `app/_content/articles.ts` — three new `ARTICLE_BODIES` entries, and one
  small type widening (section 3).
- `app/_components/article/sections.tsx` — render a multi-paragraph lede.
- `public/assets/generated/article-{reporting,carbon,loops}-hero.png` — new.
- `AGENTS.md` — record the three recipes and the measurements (workflow step 8).

**Not touched.** No new components, no new routes, no layout edits, no
`globals.css`. `SiteNav`, `SiteFooter`, `Container`, `ArticleCardStacked` and
the recent-articles band are all reused as they ship. Adding the bodies is what
puts the three slugs into `WRITTEN_SLUGS`, which is what makes
`generateStaticParams` prerender them.

## 2. The comps are the same page at the same geometry

Measured with the connected-components command from `AGENTS.md` §3:

| | article 4 | article 5 | article 6 |
| --- | --- | --- | --- |
| desktop hero | `1240x500+20+460` | `1240x500+20+380` | `1240x500+20+460` |
| tablet hero | `760x307+20+412` | `760x307+20+348` | `760x307+20+412` |
| mobile hero | `335x136+20+342` | `335x136+20+306` | `335x136+20+342` |
| desktop cards | `403x235` ×3 at y 2464 | ×3 at y 2776 | ×3 at y 2632 |
| tablet cards | `760x443` ×3 | ×3 | ×3 |
| mobile cards | `335x195` ×3 | ×3 | ×3 |

The hero's y varies only because the masthead title is three lines (4, 6) or two
(5) — the page renders that already. Nothing here needs a per-article override.

## 3. The one code change: a two-paragraph lede

Article 5's standfirst is **two paragraphs** — the long "Carbon accounting is no
longer a 'nice-to-have'…" block, then a one-line "Let's clear the fog." — both
above the rule. `ArticleBody.lede` is a single `string` and
`sections.tsx:82` renders one `<p>`.

Widen it to `lede: string | string[]` in `app/_content/articles.ts` and render
an array as consecutive `<p className={PROSE}>` in `sections.tsx`, with the
paragraph gap measured off `07-article5/screen-sizes/Desktop.png` (it reads as
one blank line at the prose pitch — confirm, don't assume). Articles 1–3 keep
passing a plain string and must render byte-identically; verify by screenshot
diff of `/article/how-to-build-a-climate-ready-data-stack` before and after.

Prefer the union over a second optional field: the lede is one thing that
happens to have two paragraphs.

## 4. Prose

Transcribed from the desktop comps at 200 % zoom. Dates ship as **2026**, not
the comps' 2028, for the site-wide convention already applied to articles 1–3.
Em dashes are em dashes; the comps use curly quotes and apostrophes.

### Article 4 — published July 1, 2026 · author Dash Bordman

Lede: *The first wave of climate reporting was built in spreadsheets—manual,
patchy, and often siloed. But as expectations rise, so does the need for rigor,
scale, and repeatability. We're tracing the journey from reactive carbon
tracking to integrated, audit-ready systems that support real-time insight and
strategic decisions.*

1. **Born in Excel** — In the early days, climate reporting was an exercise in
   scrappiness. Teams pulled together fragmented data from across the business,
   stitched it into spreadsheets, and hoped it would hold up under scrutiny. But
   what worked at pilot scale doesn't scale.
2. **The Trust Gap** — As reporting grew more important—to investors,
   regulators, and customers—the cracks began to show. Manual processes
   introduced errors. Inconsistent methods made year-over-year comparisons
   unreliable. Spreadsheets weren't just inefficient—they undermined trust.
3. **Enter the Platform Era** — Modern sustainability teams are shifting to
   purpose-built platforms. These systems automate data ingestion, standardize
   calculations, and offer controls for audit-readiness. More importantly, they
   allow teams to focus on interpretation and strategy—not just reconciliation.
4. **Build Once, Report Often** — The evolution isn't just about tools—it's
   about process. Strong reporting systems create reusable infrastructure:
   central data sources, shared assumptions, and templated disclosures. That
   infrastructure makes reporting faster, easier, and more resilient.
5. **From Reporting to Readiness** — When reporting is treated as an outcome,
   it's a burden. When treated as infrastructure, it becomes an advantage.
   Organizations with robust systems can respond to new standards, evolving
   regulations, and stakeholder questions with confidence—not scramble.

### Article 5 — published July 11, 2026 · author Al Gorithm

Lede, paragraph 1: *Carbon accounting is no longer a "nice-to-have" for
mission-driven organizations—it's a strategic necessity. But while awareness has
grown, clarity hasn't always followed. Between evolving standards, patchy data,
and inconsistent terminology, many teams are still unsure where to begin, what's
required, or how to do it well.*
Lede, paragraph 2: *Let's clear the fog.*

1. **The Confusion Behind the Numbers** — Carbon accounting has quickly become a
   cornerstone of climate strategy—but it's also one of the most misunderstood.
   As organizations race to report emissions, misconceptions often lead to
   missteps. From overestimating data requirements to underestimating system
   design, many teams are navigating without a clear map. Without demystifying
   the process, even well-intentioned efforts can stall or steer in the wrong
   direction.
2. **It's Not Just About the Math** — One persistent myth is that carbon
   accounting is purely a technical task. In reality, it's a cross-functional
   process that requires collaboration across finance, operations, procurement,
   and product teams. Technical accuracy matters, but organizational alignment is
   what makes carbon data useful—not just reportable. Treating it as a shared
   responsibility sets the foundation for action—not just analysis.
3. **There's No Universal Template** — Another common trap is the belief that a
   one-size-fits-all model exists. Effective carbon accounting needs to reflect
   your business model, industry, and maturity level. Whether you're estimating
   Scope 3 emissions or integrating real-time data from suppliers, the right
   approach balances ambition with feasibility. Customization isn't a
   compromise—it's a prerequisite for relevance.
4. **Build a Framework That Scales** — To navigate the complexity, every team
   needs a framework. That includes a shared vocabulary, clear boundaries between
   scopes, and an agreed-upon method for prioritizing data sources. A strong
   model helps teams scale their efforts while maintaining credibility and
   auditability. Consistency across teams and time zones makes scaling possible
   without sacrificing integrity.
5. **Turn Data Into Decisions** — Ultimately, carbon accounting is not just about
   reporting past impact—it's about informing future decisions. With the right
   mindset and foundation, organizations can turn their carbon data into a
   strategic asset, enabling smarter trade-offs, stronger compliance, and more
   meaningful progress. When embedded into business rhythms, carbon data becomes
   not just a metric, but a driver of momentum.

Note the comp mixes straight and curly apostrophes inside this article ("It's
Not Just About the Math" and "There's No Universal Template" are straight in the
headings, "it's" is curly in the body). Transcribe headings as the comp draws
them and use curly apostrophes in the prose, matching articles 1–3.

### Article 6 — published August 4, 2026 · author Greta Watt

Lede: *Climate strategy isn't static—it's dynamic, iterative, and shaped by
feedback. Yet many sustainability teams operate without the tools to observe,
learn, and adapt in real time. To grow sustainably, organizations need loops,
not lines. Let's explore how reflection systems can unlock smarter, faster, more
resilient progress.*

1. **The Loop Advantage** — Progress doesn't come from acting once—it comes from
   learning continuously. Feedback loops create a rhythm of observe, reflect,
   adjust. Without them, climate programs risk drifting off course or missing
   opportunities to scale what's working.
2. **Make Reflection Measurable** — You can't improve what you can't observe.
   Effective loops start with instrumentation—defining clear metrics, setting
   thresholds, and creating space to interpret results. Loops thrive when
   reflection is structured, not just anecdotal.
3. **Close the Gap Between Action and Insight** — Too often, insights arrive long
   after decisions are made. By embedding sensors, alerts, and review rituals
   directly into business systems, organizations can respond in real time—not
   retroactively. The faster the loop, the faster the progress.
4. **Design for Participation** — Feedback loops aren't just for analysts—they're
   for everyone. Create pathways for frontline employees, customers, and partners
   to contribute insights. When everyone has a seat at the table, blind spots
   shrink and ownership grows.
5. **Momentum Through Awareness** — Clarity fuels motivation. When teams can see
   the impact of their work—and where they can improve—they engage more deeply.
   Feedback loops don't just optimize outcomes—they build a culture of continuous
   progress.

## 5. Heroes

All three are 1240×500 PNGs quantised to 64 colours, ink `#2683EB`
(= `--color-accent`), `-sigmoidal-contrast 8,50% -ordered-dither h4x4a`, and
`-alpha off` first — the same treatment as articles 2 and 3.

**Sources are identified, not guessed.** Blur-and-downsample RMSE plus a coarse
crop sweep over every file in `public/assets/images`:

- article 4 → **`Image-8.png`** (the second aerial glacial texture), best coarse
  window `320x129+448+300` at RMSE 0.118; `Image-4` does not place in the top 8.
- article 5 → **`Image-5.png`** (the peak above the lake), 0.278 full-frame,
  clear of the field.
- article 6 → **`Image-4.png`** (the braided meltwater channels), confirmed by
  eye against the comp's diagonal streaks; the RMSE shortlist alone was
  ambiguous between Image-4 and Image-8, so the visual check is the verdict.

Note articles 4 and 6 do **not** reuse their own card photograph the way
articles 2 and 3 did — the card for article 4 is `Image-4` and the card for
article 6 is `Image-9`. That is what the comps show; do not "fix" it.

### 4 and 6 — ink on white, no cream

Both comps' hero corners sample as flat `#2683EB` / `#FFFFFF` with no cream
anywhere (article 4 all four corners blue; article 6 blue except a white
bottom-left). So these are the **ink layer alone** — no mask, no cream field,
one command:

```
magick public/assets/images/Image-8.png -alpha off -crop <W>x<H>+<X>+<Y> +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-reporting-hero.png
```

Fit `<W>x<H>+<X>+<Y>` with the **end-to-end sweep** from `AGENTS.md` §3 —
generate the candidate through the full recipe, blur and downsample both to
124×50, score RMSE — three passes coarse → fine → fine over width / x / height /
y. Start from `320x129+448+300` (article 4) and `768x309+0+200` (article 6).
Report the final RMSE and the width of the plateau; do not report more precision
than the plateau supports.

### 5 — the article 2 / 3 three-layer composite

The sky is cream, the snow is white and the mountain and lake are blue-on-white
halftone, so this is ink + cream + mask, exactly article 2's recipe:

```
C="<W>x<H>+<X>+<Y>"
magick public/assets/images/Image-5.png -alpha off -crop $C +repage \
  -colorspace Gray -threshold <T>% \
  -morphology Close Disk:3 -morphology Open Disk:3 \
  -resize 1240x500! -threshold 50% mask.png
magick public/assets/images/Image-5.png -alpha off -crop $C +repage \
  -colorspace Gray -resize 1240x500! \
  -sigmoidal-contrast 8,50% -ordered-dither h4x4a \
  +level-colors '#2683EB','#FFFFFF' ink.png
magick public/assets/generated/texture-cream.jpg \
  -resize 1240x500^ -gravity center -extent 1240x500 \
  \( +clone -blur 0x10 \) -compose blend -define compose:args=75 -composite cream.png
magick ink.png cream.png mask.png -composite \
  -colors 64 -define png:compression-level=9 \
  public/assets/generated/article-carbon-hero.png
```

Two parameters, two metrics, per article 3's lesson:

- **crop** — end-to-end RMSE sweep as above.
- **threshold `<T>`** — fitted against a **dot-aware** cream mask of the comp
  (`-statistic Minimum 5x5` then `-fx "(r-b)>0.02?1:0"`), matching the comp's
  cream *area fraction*. Downsampled RMSE cannot tell cream from sparse dots and
  will flood the sky.

Verify the cream field's grain lands at σ 2.5–3.2 at its mean, like articles 2
and 3, and that the corner cream reads around `#EDE5D2`–`#F9F0DD` against the
comp's `srgba(240,232,213)`.

The `alt` text for each hero follows the house pattern — the photograph
described, then "rendered as a blue halftone" (article 5 adds "over cream").

## 6. Verification

1. `npm run lint` and `npm run typecheck`.
2. `npm run build` — confirm the build log lists all six `/article/[slug]`
   paths as prerendered.
3. Screenshot the production build at 375 / 800 / 1280 (`npx next start -p 3001`,
   `playwright-core` out of the npx cache, `deviceScaleFactor: 1`,
   `fullPage: true` — and check port 3000 first, per `AGENTS.md` §3).
4. Run the connected-components command over render and comp at each breakpoint
   and diff the box lists: hero box and the three card boxes.
5. Re-screenshot `/article/how-to-build-a-climate-ready-data-stack` and confirm
   the lede change left it pixel-identical.
6. Click through `/journal` → each of the three new cards and confirm no 404.

Expect the two inherited drifts already recorded for articles 1–3 — the wide
Archivo cut shortening desktop pages, and the 20px `--text-p1`/`--text-p2` floor
lengthening mobile ones. **Record them, don't chase them.**

## 7. AGENTS.md

Add one section per article, in the shape of the article 2 and 3 sections:
comp folder, geometry, the exact `magick` recipe with its fitted numbers, what
is load-bearing about it, the measured deviations, and the 2028 → 2026 date
note. Also record under §3 Automation, if the sweeps confirm it, that **a hero
with no cream in its corners is the ink layer alone** — one command, no mask —
so a later session checks the corners before reaching for the three-layer
composite.

# Automation


Steps that have already been worked out by hand. Start from the command, not the
investigation.

**A comp folder maps to a route by name.** `public/assets/pages/NN-<name>/screen-sizes/`
is the design source. `04-article2` is the second article, so the work is a
content entry against `/article/[slug]`, not a new route. Read the folder before
asking what to build.

**Comp geometry is measured, never eyeballed.** One command gives the hero and
card boxes at a breakpoint:

```
magick <comp>.png -colorspace Gray -threshold 95% -negate \
  -define connected-components:verbose=true \
  -define connected-components:area-threshold=25000 \
  -connected-components 8 null:
```

Run it against the render and the comp and diff the box list. Area threshold
25000 at 1280, 40000 at 800, 15000 at 375.

**Screenshotting the render** — Playwright is not a project dependency but its
browsers are cached; drive `playwright-core` out of the npx cache
(`/home/gdk26/.npm/_npx/*/node_modules/playwright-core`) against `npm run start`,
`deviceScaleFactor: 1`, `fullPage: true`, at 375 / 800 / 1280.

`playwright-core` is CommonJS — `import { chromium } from …/index.js` throws
`Named export 'chromium' not found`. Use
`import pkg from '…/index.js'; const { chromium } = pkg;`.

**Check port 3000 before starting a server.** A `next dev` may already be
running there; `npm run start` then dies with `EADDRINUSE` and every screenshot
silently comes from the dev server instead (the dev-tools badge shows up in the
render and can land in the connected-components list). Start production on a
free port — `npx next start -p 3001` — and leave the user's dev server alone.

**Identifying which photograph a treated comp image came from is a search, not a
guess.** Blur, greyscale and downsample both to ~124×50 and rank
`magick compare -metric RMSE` across `public/assets/images`. Note the ranking is
whole-image against a crop, so read it as a shortlist, not a verdict — confirm
by eye.

**RMSE cannot answer "which photograph", and will confidently lie.** On comp 4
it ranked `Image-8` first at 0.118 and `Image-9` — a hand holding a mirror in a
grass field — third, because at 124×50 the score is dominated by mean tone. Use
**scale-invariant NCC on a coarse tone grid** instead. Dump every source to a
192×192 ascii PGM (`-compress none -depth 8`) and the comp to a 16×7 tone grid,
then in plain Python sweep every 62:25 window at every scale with a summed-area
table and score zero-mean normalised cross-correlation against that grid. NCC is
invariant to the brightness and contrast the duotone imposes, which is exactly
what RMSE is not. About 10s per source image at a 4px step; there is no numpy in
this environment, and none is needed.

Read the result as a **gap, not a ranking**. A true match is unmistakable:
comp 6 → `Image-4` at 0.980 with second place 0.513; comp 5 → `Image-5` at
0.996 with second 0.915. Comp 4's field ran 0.90 / 0.89 / 0.88 with the best
windows collapsing to 32×13 — the overfit signature — and forcing a minimum
window killed it (0.90 for `Image-6`, a sunset silhouette). **No gap means the
photograph is not in the folder**; fall back to cropping the comp, as article 1
and article 4 both do. Always run a comp with a known answer as a control.

**Check the hero's corners before choosing a recipe.** Four flat `#2683EB` /
`#FFFFFF` corners means the **ink layer alone** — one command, no mask and no
cream field (articles 4 and 6). Cream in any corner means the three-layer
composite (articles 2, 3 and 5).

**Fitting a crop is a sweep, and the metric matters.** Run three passes,
coarse → fine → fine, over width / x / height / y, scoring each candidate. Two
weaker metrics and the one to trust:

- *blurred greyscale, `-normalize` on both sides* — usable when the treatment is
  a plain duotone, useless without the normalize (a halftone's greyscale range
  is nothing like the photograph's).
- *a binary feature mask* — for a cream/ink composite, `-fx "(r-b)>0.05?1:0"`.
  Overlay it in red over the comp before trusting it.
- **generate the candidate through the full recipe and compare it to the comp**,
  both blurred and downsampled to 124×50. This is the honest one: it scores the
  thing actually being shipped. Article 3's three metrics disagreed by ~12px of
  crop; only this one is worth reporting.

Downsampled RMSE cannot tell a cream field from sparse halftone dots, so fit
*coverage-like* parameters (the cream/ink threshold) against a dot-aware mask
and a target area fraction instead — see article 3.

**`-alpha off` first on `public/assets/images/*.png`.** They carry a 1-bit alpha
channel that silently flattens greyscale probes and thresholds to white.

**`txt:` pixel dumps are depth-dependent.** `magick … txt:-` prints 0–255 for an
8-bit image and 0–65535 for 16-bit. Add `-depth 16` before `txt:-` so probes can
assume one scale.

**Article prose is transcribed from the desktop comp at 200 % zoom**, split into
two crops so the text is legible in one pass.

**A new article that reuses `/article/[slug]` is a data change**: one
`ARTICLE_BODIES` key plus one generated hero. Reach for new components only when
the comp shows an element the route does not already render.

**Measuring an ellipse from a comp: use the extreme-x columns, never the
mid-height chord.** The chord at `y = cy` is centred for *any* rotation, so it
can never reveal a tilt — it reads a rotated ellipse as an upright one with a
smaller `rx`, which is exactly how the job-listing `Seal` shipped upright. Take
the ink bbox and the vertical midpoints of the min-x and max-x columns instead;
a drop between the two tips *is* the tilt. One command:

```
magick <img> -crop WxH+X+Y +repage -alpha off \
  -fuzz 28% -fill white +opaque '#2683EB' -fill black -opaque '#2683EB' \
  -colorspace Gray -threshold 50% -negate txt:- \
  | awk -F'[,:( ]+' 'NR>1 && $3>200 {print $1, $2}' \
  | awk '{if(NR==1||$1<a)a=$1; if($1>b)b=$1
          if(!($1 in m)||$2<m[$1])m[$1]=$2; if(!($1 in M)||$2>M[$1])M[$1]=$2}
         END{printf "w %d  Ltip %.1f  Rtip %.1f  drop %.1f\n", b-a+1,
             (m[a]+M[a])/2, (m[b]+M[b])/2, (m[b]+M[b])/2-(m[a]+M[a])/2}'
```

Then solve `hw = √(a²cos²θ + b²sin²θ)`, `hh = √(a²sin²θ + b²cos²θ)` and the tip
offset for `a`, `b`, θ. **θ is sensitive** — ±1px of drop is ±0.5° — so confirm
it against type landmarks (labels that should sit on one line, or on one axis)
before shipping a number. **A `-fx` mask over a whole page screenshot picks up
the sky and the accent links**; always crop to the mark first.

**Fitting a heading's top padding needs an ink-row profile, not a box list.**
Connected components gives card boxes but not a cap top. Count ink pixels per
row over a crop, and read the first non-zero row:

```
magick <img> -alpha off -crop WxH+X+Y +repage -colorspace Gray -threshold 50% \
  -negate txt:- | awk 'NR>1 { split($1,a,","); if (substr($2,2)+0>0) r[a[2]]++ } \
  END { for (k in r) printf "%d %d\n", k, r[k] }' | sort -n
```

Run it on the comp and the render at the same crop. **The cap-top inset from
the element's content box is not one number across breakpoints** — on the
careers masthead it is +1 / −2 / −3 at 1280 / 800 / 375, so solve the padding
per step rather than fitting one and scaling it.

**Cap tops across two different fonts are not a baseline pitch.** A serif line
over a sans line have different cap-height-to-baseline offsets, so an ink-top
difference overstates the leading. Measure ink *bottoms* on lines with no
descenders instead.

**Measuring a rise *through* a fade: subtract a per-row background, and make the
crop tall enough.** An ink centroid — `Σ(bg − I)·y / Σ(bg − I)` — is invariant to
a uniform opacity scale, which is exactly what you want when an element fades and
translates at once. But on this site's `hero-sky` pages a naive
`bg = max(crop)` makes **the sky itself carry weight**, and a crop sized to the
settled ink **clips the glyph band at its starting offset**. Both errors pull the
answer down. Prompt 30 hit both at once and measured the `/careers` masthead at
**8.5 px** where the true amplitude is **38–46 px** — a 5× under-read that would
have shipped a quarter of the intended travel.

Take the background per row from a **text-free column band at the same rows**,
subtract a noise floor, and size the crop to hold the glyphs at their full
starting offset:

```python
bg  = median(background_band[y].values())          # per row, not per crop
wgt = max(0, bg - v - 4)                           # 4 levels of JPEG noise
cy  = sum(wgt*y) / sum(wgt)
```

Sanity-check it: the weighted ink total must be ~0 on the first painted frame and
must rise monotonically with α. If frame 1 already reports half the settled ink,
the sky is in the weights.

**Prefer a hard edge to a centroid where one exists** — a black button on a white
card, or a white card against the sky. Those need no background model at all.
And expect the amplitude to **climb** when you hold the fade's fitted ease and
solve frame by frame (70 → 75 → 85 → 89 → 117 on one job-listing channel): the
position keeps moving after the opacity lands, so no single power curve fits
amplitude, onset and duration together. **Report the observed floor as the
measurement and the shipped value as a judgement on it**, the way `/careers` and
`/job-listing/[slug]` both do.

**`pkill -f "next start"` kills the tool's own shell** (exit 144, and the rest
of the command never runs). Kill by port instead:
`PID=$(ss -ltnp | grep ':3001' | sed -n 's/.*pid=\([0-9]*\).*/\1/p'); kill $PID`.

**Define shell helpers as files, not functions.** The tool shell is zsh and
`name() { … }` collides with its aliases (`cc`, and others) — write the helper
to the scratchpad with `chmod +x` and call it by path.

**Reading a reference recording: sample it, don't scrub it.** Extract frames
with `ffmpeg` and read them as a contact sheet rather than opening the video:

```
ffprobe -v error -show_entries stream=width,height,duration -of default=nw=1 ref.webm
ffmpeg -v error -i ref.webm -vf fps=1 -q:v 2 frames/f%03d.jpg           # whole pass
ffmpeg -v error -ss 4.2 -to 7.4 -i ref.webm -vf fps=15 -q:v 2 hero/h%03d.jpg  # one beat
magick montage frames/f0*.jpg -tile 6x -geometry +2+2 -resize 320x sheet.png
```

1 fps first, to find where each pass and each section starts; then 12–15 fps
over the two or three seconds that matter. **A 1 fps sample makes clean opacity
fades look like blur** — do not diagnose an effect off the coarse pass.

**Fitting rotation on a symmetric glyph needs a synthetic template and an
unwrap.** A `✕` looks identical every 90 degrees, so centroid tracking aliases
one full turn into four false oscillations. Crop the glyph to greyscale rawvideo
at source resolution first:

```
ffmpeg -v error -i ref.webm -vf "crop=26:26:436:15" \
  -pix_fmt gray -f rawvideo glyph.gray
```

Fit the settled crop to a supersampled two-bar `✕` template, solving ink
amplitude for each arm-length/width candidate. Then fit each frame over rotation
and scale against that fixed template. When a black cursor crosses a grey glyph,
mask pixels below the separating threshold (150/255 in the prompt-49 reference)
and dilate that mask by one pixel before scoring; otherwise cursor motion wins
the fit. Finally unwrap the fitted angle monotonically modulo the glyph's
symmetry period — 90 degrees for a `✕` — before reading total travel or ease.
Always quote the crop, threshold, search grids and clean frame/time windows so
the fit can be rerun. On `Screencast_20260809_172923.webm`, this procedure
separated one 360-degree turn from the aliased four-quarter reading.

**A variable-frame-rate capture must be extracted once and indexed against its
own `pts_time` list.** `~/Videos/Screencasts/*.webm` from this user's recorder is
VFR: a `-ss/-to` slice returns a **different frame count** from the matching
`ffprobe` window, so every frame number is silently mis-timed and every fitted
onset is wrong. Extract everything once and build the timestamp table:

```
ffprobe -v error -select_streams v -show_entries frame=pts_time \
  -of csv=p=0 ref.webm > pts.csv
ffmpeg -v error -i ref.webm -fps_mode passthrough -q:v 2 all/f%04d.jpg
```

Frame *n* (1-based) is then line *n* of `pts.csv`. Quote frame numbers alongside
times so a later session can re-derive the reading.

**Measuring a rise on a page that is NOT scrolling: use a half-max row-profile
edge crossing, not an ink centroid.** The centroid is the right channel for a
*scroll-pass* recording, where everything moves; on a load-entrance it is
confounded on any multi-line element, because at low α the heavier line
dominates and the centroid moves for reasons that are not travel. Take the ink
count per row over a crop, find where the profile crosses half its settled
maximum, and track that row. For a solid block against a gradient (a white card
on the sky) the half-*contrast* crossing is cleaner still and is the most
sensitive channel on the page. Both are opacity-invariant. Corroborate with
normalised row-profile cross-correlation against the settled frame — the lag
should decay to 0 as the element lands. **Report the observed travel as a floor**,
since the first measurable frame is already part-way in.

**Telling a drop from a fade: watch the ink bbox's *shape*, not its position.**
An element entering from behind the viewport's top edge is clipped by the window,
so its ink box first appears **short and pinned to the top of the crop**, grows
downward to full height, and only then translates down. A fade holds the box
still at full height; a rise moves it the other way. Threshold the crop at ~60 %
and report the box per frame:

```
magick f0232.jpg -crop WxH+X+Y +repage -colorspace Gray -threshold 60% -negate \
  -define connected-components:verbose=true -connected-components 8 null: | head -3
```

Run it on two independent recordings before believing it. Sibling elements (the
wordmark and the nav links) reproducing the same growth in the **same frames** is
what says one element is translating rather than its contents staggering. The
travel is a **floor** — the element is off-screen and unmeasurable before the
first ink frame — so a free fit for amplitude will not resolve; author the
self-evident value (`yPercent: -100`) and record it as a judgement.

**Measuring a rise off a scroll-pass recording: use an ink-weighted centroid,
relative to a settled neighbour.** A recording of a continuous scroll moves
*everything*, so an element's absolute y tells you nothing about its tween. Two
properties make the centroid the right channel:

- **It is opacity-invariant.** Opacity scales every pixel's weight uniformly, so
  the centroid does not move as an element fades — it isolates the rise from the
  fade, which a bbox-top or a first-ink-row reading cannot.
- **Differencing it against a neighbour that has already settled removes the
  page scroll**, which is common to both.

Take the centroid over a crop containing one element, per frame, and report
`element_centroid − landmark_centroid`. On `about.webm` this gave 34.2 px and
32.4 px on two independent blocks against an authored 36 — see "`/about`'s
reveals". The same trace also tests for a **sibling stagger**: sample all
siblings per frame and look at the spread. Under 1 px at a ~70 px/s rise is
under 10 ms, i.e. no stagger; `Reveal`'s own stagger is 0.08 s and is
unmistakable.

**Ink *mass* over the same crop is the opacity channel** — sum the ink weights
rather than their centroid. Two elements sharing one tween show the same α at
every frame *and* constant mutual gaps; three separate tweens do not.

**Fitting a duration to such a trace usually fails, and saying so is the
result.** Solve for `D` frame by frame under a candidate ease; if the fitted `D`
*drifts* across the window under `power2/3/4.out` and `expo.out` alike, the
recording does not resolve it. Report the band and reuse the site's existing
`DUR`/`EASE` rather than inventing a number — and record "measurement could not
separate 0.5 from 0.7", never "0.5 was measured".

**Check whether a reference recording is even your build before fitting motion
to it.** Run connected components on a settled frame and compare the box list to
your render. `about.webm`'s values cards are 246 tall against ours at 276, so it
is a *different implementation* of the same comps — usable for motion, useless
for geometry. Establish this first; it is what stops a later session "fixing"
a deliberate deviation to a recording.

**Comparing two builds' prerendered HTML is a script, not an eyeball.** The
pages are single-line, so `diff` prints the whole file for a one-character
change. Normalise the build id (`.next/BUILD_ID`) and the CSS chunk name
(`/_next/static/chunks/*.css` — Next puts CSS under `chunks/`, not `css/`) and
report differing *regions* with `difflib.SequenceMatcher`. Keep the helper in
the scratchpad; it is ~20 lines of Python.

**The CSS chunk name is not hex, and `difflib.SequenceMatcher` on these files
times out.** Two traps in the build-diff helper, both hit again in prompt 20:
the chunk is `/_next/static/chunks/0fxyh0j19zdp7.css`, so a `[a-f0-9]+`
normalisation silently matches nothing and reports all 16 pages as differing;
use `[A-Za-z0-9_-]+`. And `SequenceMatcher` over a 200 KB single-line page runs
for minutes — scan the common prefix and suffix instead (two `while` loops) and
print only the middle. For the one page that legitimately differs, re-split on
`(?<=>)` and run `unified_diff` over the tags, which is fast and readable.

**A class-string change makes pages differ far beyond the class string, and it
is not a real diff.** The prerendered HTML carries the RSC flight payload inline
as `<script>self.__next_f.push([1,"…"])</script>`; changing a string's length
shifts where Next splits those rows, so the row labels renumber (`8:I[…]` →
`a:I[…]`) and a naive prefix/suffix scan reports tens of kilobytes. **Strip the
flight scripts and compare the markup instead** — that is the thing that
renders:

```python
markup = re.sub(r'<script>self\.__next_f\.push\(.*?\)</script>', '', html, flags=re.S)
```

Then substitute the old class string for the new one in the *base* side and the
16 pages come back identical. Report the two results separately: which pages are
byte-identical untouched, and that the rest differ only in the class strings
plus flight-row segmentation.

**Screenshotting for `AE` must wait on `document.fonts.ready` before the scroll
pass, not just after it.** The footer's split blur-in is driven by a
ScrollTrigger, and `autoSplit` re-splits on font load; if the 400px scroll pass
races the fonts, the footer's reveal never fires and the whole footer stays at
`opacity: 0` in the shot. It is intermittent, it looks exactly like a
regression, and it bit both sides of a comparison independently. The procedure
that is deterministic:

```js
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(2000);                      // fonts + autoSplit settle
for (let y = 0; y < H + 900; y += 400) { await p.evaluate(y => scrollTo(0, y), y);
                                         await p.waitForTimeout(150); }
await p.waitForTimeout(4000);                      // settle AT the footer
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(3000);
```

Assert it rather than trusting it — read
`[...document.querySelectorAll('footer [data-footer-split]')].map(e => getComputedStyle(e).opacity)`
and require all `1` before the shot.

**`cd <dir>` alone can be swallowed by the shell's `zoxide` alias** (`zoxide: no
match found`, and the directory never changes), so a follow-up `ls`/`git status`
silently describes the *old* directory. `cd X && cmd` short-circuits correctly,
but a bare `cd` does not. Use absolute paths, `git -C`, or `(cd X && …)`.

**Another session may be committing to `main` while you work.** In prompt 27 a
concurrent agent committed, rebuilt `.next`, and removed this session's
`../aetherfield-base` worktree mid-comparison — which showed up as a base server
returning 500 for its CSS chunk and screenshots of an unstyled page. Re-check
`git log --oneline -1` and `git worktree list` before trusting a
parent-commit comparison, and rebuild against the *current* parent if HEAD has
moved.

**A local docs snapshot can contaminate Tailwind's production CSS while a clean
worktree does not have it.** The Tailwind and Drizzle skills initialise
gitignored `references/docs/` trees. A build in the main workspace saw those
files and emitted 411639 bytes across two CSS chunks; the detached parent
worktree, correctly lacking ignored files, emitted one 61752-byte chunk. That
is not an implementation diff and makes every prerendered page appear to gain
an extra stylesheet.

For a build comparison, temporarily move these four ignored paths to a `mktemp
-d` directory, install an EXIT trap that restores every one, build, then confirm
the directories exist again before trusting the output:

```
.agents/skills/tailwind-4-docs/references/docs/
.agents/skills/tailwind-4-docs/references/docs-index.tsx
.agents/skills/drizzle-docs/references/docs/
.agents/skills/drizzle-docs/references/docs-index.md
```

Prompt 38's clean implementation build emitted one 64385-byte CSS chunk. Also:
Turbopack rejects a `node_modules` symlink that points outside the worktree's
filesystem root, and `/tmp` may be a different filesystem so `cp -al` fails
with `Invalid cross-device link`; use a regular `cp -a` for that temporary
worktree when either condition applies.

**`page.accessibility.snapshot()` is gone from the cached `playwright-core`.**
It throws `Cannot read properties of undefined`. Use
`await page.locator("h1").ariaSnapshot()` instead — it returns the YAML form
(`- heading "…" [level=1]`), which is what you want for checking that a split or
otherwise mangled element still reads as one string.

**Splitting text changes its rasterisation, and `magick compare` will catch
it.** Word pieces need `display: inline-block` for a transform to render, and an
inline-block box rounds each word's advance to a whole pixel — the desktop hero
heading measured 2 px of extra ink and 4007 differing pixels against the parent
build. Set the display for the tween's duration only and list it in
`clearProps` alongside the filter; the settled render then goes back to 0. Check
element rects *and* `-metric AE`: rects can be identical to two decimal places
while the glyphs have moved.

**`playwright-core`'s npx cache hash changes.** Do not copy a path out of an
older note — resolve it each session with
`ls -d /home/gdk26/.npm/_npx/*/node_modules/playwright-core`.

**There are two "Energy consumption" cards on `/`, and a `.first()` probe hits
the wrong one.** The hero dashboard carries one and the Capabilities section
carries the other, with the *same* markup — `svg[viewBox="0 0 24 24"]` matches
six elements on the page and `span:text("Energy consumption") ~ svg` matches two.
A probe of the capabilities card that silently read the hero's reported the
asterisk at `transform: none` and the counter frozen, i.e. a working animation
looking broken. Anchor on the section instead:

```js
const sec = [...document.querySelectorAll('section')]
  .find(s => s.textContent.includes('Everything you need'));
```

**`img.naturalWidth` is density-corrected and is NOT the delivered pixel
count.** When an image is chosen out of a `srcset` with `w` descriptors, Chrome
gives the resource an intrinsic density of `candidate_w / sizes_w` and
`naturalWidth` returns `real_pixels / density`. So a 768px file selected from a
`w=1920` candidate at `sizes=720px` reports **288**, and a *larger* request
appears to deliver a *smaller* image. A sharpness check built on it is garbage.
Read `currentSrc` for the candidate and confirm the real bytes against the
optimizer directly:

```
curl -s -H 'Accept: image/avif,image/webp,image/*' \
  "http://localhost:3001/_next/image?url=%2Fassets%2Fimages%2FX.png&w=1920&q=90" -o o.bin
magick identify -format '%wx%h %m %B bytes' o.bin
```

The optimizer caps output at the source's own width, so `delivered =
min(requested_w, source_w)`; compare that against `rendered_css_width × DPR`.

**Verifying a dash-pattern loop is seamless is one command, so do it rather than
argue it.** Any looping `stroke-dashoffset` (or perforation row, or conveyor)
is seamless *iff* one period of travel maps the pattern onto itself. Force
exactly one period onto the element with the animation stopped — emulate
`prefers-reduced-motion: reduce`, screenshot the element's box, set the offset
inline, screenshot again — and require `magick compare -metric AE -fuzz 5%` = 0.
It caught nothing on `/careers`' frame, which is the point: the claim is now
measured rather than reasoned. Note the clipped screenshot needs
`{ clip, fullPage: true }` when the element is below the fold — a bare `clip` in
page coordinates throws *"Clipped area is either empty or outside the resulting
image."*

**A CSS animation's rate is read off `getComputedStyle`, unwrapped modulo the
period.** Sample the animated property at two timestamps ~2 s apart; the raw
difference is only correct modulo one period, so add `round((expected × dt −
raw) / period) × period` before dividing. Expect ~2 % of sampling jitter — the
frame's authored 20 px/s measures 19.95 / 19.95 / 20.10.

**A page-wide `magick compare` is the wrong instrument once anything is
scroll-linked.** A scrubbed element sits wherever the screenshot's scroll put it,
so the whole-page `AE` is never 0 again and tells you nothing. Mask the animated
box in *both* renders and compare the remainder, then score the box on its own:

```
magick new.png -fill black -draw "rectangle X1,Y1 X2,Y2" m-new.png   # same for base
magick compare -metric AE -fuzz 5% m-new.png m-base.png null:        # must be 0
magick compare -metric AE -fuzz 5% \( new.png -crop WxH+X+Y +repage \) \
                                   \( base.png -crop WxH+X+Y +repage \) null:
```

Report the two numbers separately. Screenshot the *settled* state by stepping the
scroll down the whole page (400px at a time) to fire every reveal, then returning
to 0 and waiting, before the `fullPage` shot. **Wait at least 6 s** — the
footer's split blur-in is authored at 3.02 s, and at 2.5 s it shows up as a few
hundred `AE` at the very bottom of the page that reads like a regression.

**GSAP consumes an element's independent `rotate` / `translate` / `scale`.**
`_parseTransform` folds them into one `transform` and sets all three to `none`
(`node_modules/gsap/CSSPlugin.js:859-866`), unconditionally. So a Tailwind v4
`-rotate-[8deg]` class is **not** safe from a tween that writes `transform`: any
tween on that element must land on the authored angle explicitly. Probe
`getComputedStyle(el).rotate` before and after the tween to see it happen.
Corollary: a CSS start state that combines a perspective with an authored
`rotate` decomposes into a spurious `rotationX` the tween never clears.

**`gsap.quickTo` does not work at `duration: 0`.** Its tween is created paused
with a `"+=0.1"` placeholder and driven by `resetTo`
(`gsap-core.js:4179`); at zero duration the value is simply never written. A
reduced-motion branch that "keeps the readout and drops the motion" must write
the value with `gsap.set` instead — a plain `gsap.to` at `duration: 0` is fine.
Measured on the emissions chart's hover: the pill sat 308.59 px from the
hovered column while its text and the bar dim both landed.

**Every GSAP callback runs with its creating context active.** `_callback`
(`gsap-core.js:981`) does `context && (_context = context)` before invoking
`onStart` / `onUpdate` / `onComplete`, where `context` is `animation._ctx`. So
"it fires on a later tick, so no context is active" is never a valid reason to
reach for `contextSafe` — and in this codebase `contextSafe` has no valid use
at all. See "Fix — the journal mark's `contextSafe`".

**Building the parent commit needs a sibling worktree with hard-linked
`node_modules`.** Turbopack rejects a symlinked `node_modules` outright
(`Symlink [project]/node_modules is invalid, it points out of the filesystem
root`), and a worktree under `/tmp` cannot hard-link to one under `/home`:

```
git worktree add ../aetherfield-base HEAD
cp -al node_modules ../aetherfield-base/node_modules
(cd ../aetherfield-base && npm run build)
```

Run the two servers side by side (`3001` new, `3002` base) and screenshot both.
Remove the worktree and `git worktree prune` when done.

**A left-over `../aetherfield-base` poisons the comparison twice over, and both
failures are silent.** Hit in prompt 37. `git worktree add` prints
`fatal: '../aetherfield-base' already exists` and *stops* — but a following
`&& npm run build` in the same chain still runs, so the "base" build is an
older commit's. And `cp -al node_modules ../aetherfield-base/node_modules` with
the destination **already present** copies *into* it
(`…/node_modules/node_modules`), leaving the previous session's stale tree in
place; the base build then differs in Next's own framework chunks — two
219,239-byte chunks against 148,868 — which looks exactly like a bundle
regression from the change under test. So, before trusting a base build:

```
git worktree list                      # confirm the path and the commit
git -C ../aetherfield-base log --oneline -1
rm -rf ../aetherfield-base/node_modules && cp -al node_modules ../aetherfield-base/node_modules
```

With a clean base at the right commit, an `app/`-free change is **byte-identical
on all 16 prerendered pages with only `.next/BUILD_ID` normalised** — the chunk
filenames match too, because Turbopack's names are deterministic for the same
commit and the same `node_modules`. Anything less than that is a finding.

**A client component reached from a shared barrel lands in every page's
`<script>` list.** After adding one, always check the chunk graph, not just the
markup:

```
grep -o '/_next/static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/<page>.html | sort -u
```

Diff that list against the parent build's. To identify an unexpected chunk,
grep it for a distinctive string from the suspect module.

**Auditing an inherited property site-wide (`cursor`, `color`, `font`) needs an
ancestor resolution, not a tag count.** Enumerating every element whose computed
`cursor` is `pointer` returns every span and image *inside* a link. Attribute
each hit to the element that actually set it:

```js
const m = {};
for (const el of document.querySelectorAll('*'))
  if (getComputedStyle(el).cursor === 'pointer') {
    const src = el.closest('button, [role="button"], a[href]');
    const k = src ? src.tagName : 'UNEXPECTED:' + el.tagName;
    m[k] = (m[k] || 0) + 1;
  }
```

Any `UNEXPECTED:` key is the finding. This is the cheap way to check a
site-wide affordance change on every route.

**Isolating a CSS-only change when the tree already carries someone else's
uncommitted work.** The usual parent-commit worktree build is confounded. Build
the working tree twice instead — once with the new block removed — and diff the
two `.next/server/app/**/*.html` sets, normalising the build id and the CSS
chunk name. It isolates exactly the one change and costs two ~10 s builds.

**Ports 3000, 3001 *and* 3002 can all be occupied.** `npx next start` prints
`EADDRINUSE` into its log and exits, but an *older* server on that port keeps
answering, so `curl` returns 200 and every probe silently reads a stale build.
Always confirm the served CSS chunk matches the build you just made:
`curl -s localhost:PORT/careers | grep -o '/_next/static/chunks/[A-Za-z0-9_-]*\.css'`.
Free ports: `ss -ltn | awk 'NR>1{print $4}' | grep -oE '[0-9]+$' | sort -un`.

**An `AggregateError` of `ETIMEDOUT`s from `pg` is a happy-eyeballs budget, not
a dead database — and one loop turns it into a number.** The error carries no
timing and no address, so it reads as "Neon is down" when the truth is "the
connect was 20 ms too slow". The count of inner errors equals the count of
addresses the host resolves to (`getent ahosts <host>` — the pooled Neon host
gives six, three A and three AAAA). Time the connects directly:

```bash
node -e 'const net=require("net");
console.log("budget",net.getDefaultAutoSelectFamilyAttemptTimeout(),"ms");
const host="<the -pooler host>";
(async()=>{for(let i=0;i<4;i++){await new Promise(r=>{const t=Date.now();
  const s=net.connect({host,port:5432},()=>{console.log("ok",Date.now()-t,"ms",s.remoteAddress);s.destroy();r();});
  s.on("error",e=>{console.log("err",Date.now()-t,e.code);r();});});}})();'
```

If the successful connects land near the printed budget, that is the fault. A
before/after A-B is the proof: the same loop wrapped in a `pg` `Pool`, run once
at the default budget and once after `net.setDefaultAutoSelectFamilyAttemptTimeout(n)`.
**Require a *fresh* `Pool` per iteration** — a warm pool reuses its socket and
never reconnects, so a reused pool shows six passes and proves nothing. Run the
script through `./node_modules/.bin/dotenv -e .env.local --`, not `npx dotenv`,
and require `pg` by absolute path when the script lives in the scratchpad.

**Standing instruction:** each session, watch for steps repeated by hand and add
the mechanical ones here, so later sessions start from the command rather than
the investigation.

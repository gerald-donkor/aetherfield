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

**Playwright is a first-party project dependency.** Prompt 51 installed
`@playwright/test` 1.62.1; prompt 55 completed the desktop matrix with Chromium,
Firefox and WebKit. `playwright.config.ts` builds and starts the production
application on port 3100, refuses to reuse an existing server, and shuts its
managed server down when the run ends. `npm run test:e2e:local` runs Chromium
and Firefox natively. `npm run test:e2e:webkit` runs WebKit headlessly in the
pinned rootless Podman image, and `npm run test:e2e` runs both phases. The
interactive `npm run test:e2e:ui` intentionally remains Chromium / Firefox only.

**WebKit crosses a container boundary on Arch.** Playwright 1.62.1's Arch
fallback is an Ubuntu build that needs Ubuntu's ICU, libxml2 and Flite ABIs;
`npx playwright install-deps --dry-run webkit` tries `apt-get`, which is not an
Arch package-management path. Do not replace Arch's system ICU, copy foreign
shared libraries into the browser cache, or patch the browser. Install Podman
from Arch's official repository instead:

```sh
sudo pacman -S --needed podman
podman info --format 'rootless={{.Host.Security.Rootless}}'
```

The second command must report `rootless=true`. No privileged daemon or host
port is involved: `tools/playwright-webkit/Containerfile` installs only WebKit
and its Debian dependencies from Playwright 1.62.1 over Node 22 Bookworm slim;
`scripts/playwright-webkit.sh` bind-mounts the repository, keeps the caller's
UID / GID, and runs the existing production build, server and test inside one
container. The small image build context is only `tools/playwright-webkit/`, so
the repository, `.env.local`, `node_modules` and generated output never enter an
image layer.

The first `npm run test:e2e:webkit` builds
`localhost/aetherfield-playwright-webkit:1.62.1`; later runs reuse it. The first
successful slim build on 10 Aug 2026 fetched 225 MB of Debian packages in 4 min
37 s, WebKit's 102.2 MB archive and FFmpeg's 2.3 MB archive. One WebKit mirror
timed out after 30 s and Playwright retried the next mirror successfully. The
final image's measured virtual size is 1,231,512,576 bytes (1.232 GB), reduced
from the rejected full-Bookworm trial's 3,247,248,725 bytes.

The Playwright package version and the Containerfile's
`PLAYWRIGHT_VERSION` must remain identical; the runner rejects a mismatch. On a
Playwright upgrade, update both, run `npx playwright install chromium firefox`,
then run `npm run test:e2e` to build the new version-tagged WebKit image. If the
Containerfile itself changes without a version bump, remove only its
reproducible image before rerunning:

```sh
podman image rm localhost/aetherfield-playwright-webkit:1.62.1
```

That command is optional cleanup and deletes only the local, reproducible test
image. It does not touch reports, browser caches, application data or system
packages.

**Prompt 51 verification (9 Aug 2026).** `npx playwright --version` reported
`1.62.1`; `npx playwright test --list` found exactly two cases in one file, one
each for Chromium and Firefox. `npm run lint` and `npm run typecheck` completed
with no diagnostics. `npm run test:e2e` built the production application,
started it on port 3100, passed both projects in 18.9 s, and left no server on
3100. The final standalone `npm run build` compiled successfully and generated
26 / 26 pages with the existing static / SSG / dynamic route modes.

The final prerender comparison used a clean worktree at `ce84e14`, after two
unrelated backend commits landed during verification. Both builds had the four
ignored skill-doc snapshots excluded and used the same in-memory
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (Next 16 otherwise generates a unique key
per build and changes Server Action IDs). The two path sets were identical at
21 HTML files; after normalising only `.next/BUILD_ID`, **0 files differed**.
The key was neither printed nor written to disk.

**Prompt 55 verification (10 Aug 2026).** The Arch package was Podman 6.0.2;
`podman info` reported `rootless=true`. Because this automation process could
not answer the workstation's sudo password prompt, verification unpacked those
same signature-checked Arch packages into `/tmp` instead of installing them;
the normal workstation prerequisite remains the `pacman` command above.
`npx playwright --version` reported `1.62.1`, and
`npx playwright test --list` found exactly three cases in one file. The final
standalone slim-container `npm run test:e2e:webkit` passed WebKit in 16.5 s. The
complete cached `npm run test:e2e` passed Chromium and Firefox in 17.7 s, then
WebKit in 15.4 s. Rootless `--rm` left no test container running. The temporary
package extraction, its runtime overrides and its image store were never added
to the repository. `sh -n scripts/playwright-webkit.sh`, `npm run lint` and
`npm run typecheck` all exited 0 with no diagnostics. `npm run build` compiled
in 5.6 s, finished TypeScript in 4.0 s and generated all 26 static pages; the
route table retained the same static / SSG / dynamic classifications. A final
isolated parent-versus-prompt build used one unprinted, unwritten Server Actions
encryption key: both sides produced the same 21 `app/**/*.html` paths and,
after replacing only each side's `.next/BUILD_ID`, **0 files differed**.

**Screenshotting the render** — import from `@playwright/test` or the installed
`playwright` package rather than resolving `playwright-core` from npm's transient
cache. Keep the established `deviceScaleFactor: 1`, `fullPage: true`, and 375 /
800 / 1280 viewport procedure. Wait on `document.fonts.ready`, settle the
motion, and apply the page-specific masking rules below before comparing a
render.

**Check the target port before starting an ad-hoc server.** A `next dev` may
already be running on 3000; `npm run start` then dies with `EADDRINUSE` and every
screenshot silently comes from the dev server instead (the dev-tools badge
shows up in the render and can land in the connected-components list). The
committed Playwright suite isolates itself on 3100 and refuses stale reuse. For
ad-hoc production probes, start on a confirmed-free port — for example
`npx next start -p 3001` — and leave the user's dev server alone.

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

**`page.accessibility.snapshot()` is gone from the installed Playwright API.**
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

**But a worktree base no longer works at all on this repository, and the symptom
looks like a catastrophic regression.** Found in prompt 64. Tailwind v4 scans
the project's files, and the main tree carries **gitignored** files a fresh
worktree does not — above all the `drizzle-docs` skill's 484-file, ~4.5 MB
markdown snapshot under `.claude/skills/`. So the two trees do not generate the
same stylesheet: the worktree built **one 74 KB CSS chunk** where the main tree
built **11 KB + 407 KB**, every page gained a second `<link rel="stylesheet">`,
and 20 of 21 pages differed on a change that touched no markup. Confirm it with
`ls -la */.next/static/chunks/*.css` before believing any large diff.

**Use the two-build method instead, which is now the default here**: snapshot
`.next/server/app` and `.next/BUILD_ID`, `git stash push <the changed files>`,
rebuild, snapshot again, `git stash pop`, then diff the two snapshots
normalising only the build id and the CSS chunk name. Same environment on both
sides, two ~12 s builds, and it isolates exactly the change. **Leave the JS
chunk names un-normalised** — they are deterministic across the two builds, so
matching them for free is a stronger result than normalising them away.

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

## Regenerating Better Auth's schema, and diffing a build against the parent

**Schema generation is a script now — `scripts/generate-auth-schema.py`.** The
Better Auth CLI refuses to evaluate a config module carrying `server-only`
("Please remove import 'server-only' from your auth config file temporarily"),
and every module under `lib/` that touches a secret carries it. Step 6 stripped
and restored the guards by hand; prompt 56 made it a script, because a
generator that throws between the two halves leaves the guards off and the next
commit ships a codebase with no client-import protection. The script holds every
guarded file body in memory, restores in a `finally`, and refuses an `--output`
of `lib/db/auth-schema.ts`. Run it, then diff the scratch output and merge.

**The generated file may be a strict superset — check before transcribing.**
For the organization plugin, `diff` showed 0 removed lines and 80 added, so the
output was copied wholesale instead of hand-merged. Confirm with
`diff old new | grep -c '^<'` before assuming a hand-merge is needed; a copy
that the diff has proven lossless is safer than transcription.

**Three traps sit between you and a trustworthy prerender diff. All three are
silent, and all three were hit in one session.**

1. **The gitignored docs snapshots contaminate the CSS**, as recorded above —
   two chunks with them present, one without. Stash the four paths behind a
   restoring `EXIT` trap before any build you intend to compare.
2. **JS chunk names are content-hashed and rename on an unrelated change.**
   Normalising only `BUILD_ID` and the CSS chunk reported 19 of 21 pages as
   differing, every one at *identical byte length* — the signature of a pure
   rename. Normalise `/_next/static/chunks/[A-Za-z0-9_-]+\.js` too. Equal byte
   lengths on both sides is the tell that a "difference" is a rename.
3. **A running `next dev` rewrites `.next` underneath the comparison.** A page
   that existed for the first script run was gone for the second. Check
   `pgrep -af "next dev"` first. Do **not** kill the user's server: copy the
   working tree to the scratchpad (`tar` excluding `.next`, `node_modules`,
   `.git`, `.agents`, `.claude`), hard-link `node_modules` in, and build there.
   That also sidesteps trap 1, since the copy excludes the snapshots.

A clean pair of builds at this commit is one CSS chunk and 21 HTML files each.

### Three more prerender-diff traps, found at step 10

All three are silent, and together they turned a clean result into an apparent
20-page regression before they were resolved.

4. **The CSS chunk is emitted to `.next/static/chunks/`, not
   `.next/static/css/`.** A normaliser that looks in `static/css/` finds no
   chunk to normalise, leaves the content-hashed name in place, and reports
   every non-trivial page as differing — **at identical byte length**, which is
   trap 2's signature and is the tell. Normalise
   `/_next/static/chunks/[A-Za-z0-9_-]+\.css` alongside the `.js` pattern.

5. **`git archive HEAD` includes the tracked `.claude/` skills; a `tar` of the
   working tree that excludes them does not.** Tailwind v4 scans those files, so
   the two sides disagree on CSS by ~6 KB for no implementation reason: the base
   built to 70,917 bytes against the implementation's 64,826. **Both sides must
   exclude `.claude/` and `.agents/`.** With that done, the base at `4541641`
   builds to exactly **64,513 bytes**, which is the number to check the method
   against before trusting any comparison.

6. **`/tmp` is tmpfs, so `cp -al node_modules` degrades or fails there.** Build
   copies belong on the same filesystem as `/home` —
   `/home/<user>/.cache/aetherfield-diff/` works and survives a scratchpad
   cleanup.

The whole comparison, once those are handled:

```bash
D=~/.cache/aetherfield-diff
rm -rf $D && mkdir -p $D/impl $D/base
tar -cf - --exclude=.next --exclude=node_modules --exclude=.git \
          --exclude=.agents --exclude=.claude . | tar -xf - -C $D/impl
git archive HEAD | tar -xf - -C $D/base
rm -rf $D/base/.claude $D/base/.agents          # trap 5
cp -al node_modules $D/impl/node_modules
cp -al node_modules $D/base/node_modules
export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="ZmFrZWtleWZha2VrZXlmYWtla2V5ZmFrZWtleWZha2U9"
(cd $D/base && npx next build) && (cd $D/impl && npx next build)
```

Then normalise `BUILD_ID`, both chunk patterns, strip
`<script>self\.__next_f\.push\(.*?\)</script>`, and compare the 21 files under
`.next/server/app/`.

### Tailwind v4 scans prose, and an English word can ship as CSS

A text-overflow utility appeared in the production CSS at step 10 from **a bare
English verb in a doc comment that matched the utility's name** in
`lib/domain/decimal.ts` and `lib/domain/decimal.test.ts`.
The scanner extracts candidate class names from any scanned file — comments and
test files included — so a bare word that collides with a utility name becomes
dead CSS on every page of the site.

Check a CSS delta by rule, not by byte count, before accepting it:

```bash
python3 - <<'EOF'
import re, glob
a = open(glob.glob('base/.next/static/chunks/*.css')[0]).read()
b = open(glob.glob('impl/.next/static/chunks/*.css')[0]).read()
ra = set(re.findall(r'[^{}]+\{[^{}]*\}', a))
rb = set(re.findall(r'[^{}]+\{[^{}]*\}', b))
for r in sorted(rb - ra): print(" +", r.strip()[:120])
for r in sorted(ra - rb): print(" -", r.strip()[:120])
EOF
```

Every added rule should trace to a class you actually wrote. Reword the comment
rather than shipping the utility.

**Two extensions to this, both found at prompt 70, both silent.**

- **A string literal leaks as readily as a comment.** A test fixture whose value
  happened to be a `grid-row` utility's name shipped that rule to every page.
  The scanner does not care that the string is data — check *values* in new test
  fixtures, not only prose.
- **`docs/` is inside the scan root.** So the paragraph recording the leak
  re-shipped the same rule from `docs/backend.md` when it quoted the offending
  token. **Describe the token, do not spell it**, and always re-run the CSS diff
  *after* writing the record, not only after writing the code — otherwise the
  documentation of the fix reintroduces the defect and the check that would have
  caught it has already been run.

### A stale `tsconfig.tsbuildinfo` masks a `tsconfig.json` change

Raising `target` at step 10 had no effect on `npm run typecheck`, which kept
reporting the old target's error, while `npx tsc --showConfig` correctly
reported the new one. `incremental: true` caches the result in
`./tsconfig.tsbuildinfo`. Delete it after any `tsconfig.json` edit:

```bash
rm -f tsconfig.tsbuildinfo && npm run typecheck
```

### Reading an `.xlsx` without a spreadsheet dependency

An `.xlsx` is a zip of XML, so `zipfile` plus `ElementTree` reads one from the
Python standard library — `scripts/defra-xlsx-to-csv.py` is the worked example.
Three things a naive conversion gets wrong, each silent:

- **Cells are addressed, not positional.** A row's XML omits empty cells
  entirely, so reading `<c>` elements in order shifts columns. Parse the `r`
  attribute (`"C7"` → index 2).
- **Text lives in `xl/sharedStrings.xml`**, referenced by index from cells with
  `t="s"`. Resolve sheet *names* through `xl/_rels/workbook.xml.rels`; sheet
  order and `sheetN.xml` numbering are not the same thing.
- **Numbers are binary doubles serialised with up to 17 significant digits.**
  `repr(float(raw))` gives the shortest decimal that round-trips, recovering the
  published `1.74296` from `1.7429600000000001`. Where the stored double is
  itself computed, the shortest form keeps all 17 and those digits are the
  publisher's own float noise — check the distribution of significant digits for
  a gap before choosing a rounding precision, and report how many rows the round
  actually moved.

Convert the DEFRA workbook with:

```bash
python3 scripts/defra-xlsx-to-csv.py <workbook>.xlsx \
        lib/db/seed/defra-2026-factors.csv --report
```

### `pdftotext -layout` recovers a table whose glyphs do not survive extraction

The DEFRA methodology report's Table 1 marks each row with a tick in either an
AR4 or an AR5 column. The glyphs are in a symbol font and extract as nothing —
but their **column position** survives `-layout`, which is enough to read the
table:

```bash
pdftotext -layout -f 17 -l 18 method.pdf - | python3 -c "
import sys
for line in sys.stdin:
    r = line.rstrip('\n')
    marks = [i for i, ch in enumerate(r) if i > 55 and not ch.isspace()]
    if marks: print(f'{r[:56].strip():<45} {marks}')
"
```

Two distinct mark columns came out (63 and 86), which is the two table columns.

### Top-level `await` in a one-off `tsx` script needs `.mts`

`npx tsx foo.ts` transforms to CJS and fails with "Top-level await is currently
not supported with the cjs output format". Name the file `.mts` — already in
`tsconfig.json`'s `include`. And a throwaway script must live **inside the
project**, not in the scratchpad, or `pg` and every other dependency fails to
resolve.

### `npm run db:migrate` can exit 0 having applied nothing

Found at step 13. The command printed its spinner and exited cleanly; the
readback then found `relation "report" does not exist`.

It is the **IPv6 happy-eyeballs trap prompt 46 already recorded** for the app's
own pool, in a place the earlier fix does not reach. `lib/db/client.ts` calls
`net.setDefaultAutoSelectFamilyAttemptTimeout(2500)` before constructing the
`Pool`; `drizzle-kit` constructs its own connection and does no such thing, so
against a Neon host that resolves to unreachable IPv6 addresses it stalls and
gives up quietly. The same trap hits any one-off `tsx` script.

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" npm run db:migrate
```

For a throwaway script, the in-process equivalent — and it must come before the
`pg` import, which is why the import order below is not accidental:

```ts
import net from "node:net";
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);
import { Client } from "pg";
```

**Always read the schema back from `information_schema` after a migration on
this machine. A clean exit is not evidence.**

## Three source files are `data` to `file(1)`, and `grep` skips them silently

`grep` finds **nothing** in `lib/db/emission-queries.ts` or
`lib/domain/emissions.ts` and prints no warning, because both contain literal
`NUL` bytes and `grep` treats a file with one as binary. `file` reports them as
`data` rather than TypeScript, which is the tell.

The bytes are deliberate: they are the composite map-key separator in the factor
resolver — `` `${mapping.category}\0${mapping.unit}` `` — chosen so no category
or unit string can collide by containing the separator. **Do not "fix" them.**

Verified this session, so the count is measured rather than assumed:

| file | `NUL` bytes | where |
| --- | --- | --- |
| `lib/db/emission-queries.ts` | 2 | `buildFactorResolver`'s `byPair.set` and `byPair.get` |
| `lib/domain/emissions.ts` | 1 | `aggregate`'s `const key` |

**`grep -a` is the workaround**, on every search that might touch `lib/db/` or
`lib/domain/`. To find the offenders after an edit:

```bash
python3 -c "
import sys
for f in sys.argv[1:]:
    b=open(f,'rb').read()
    n=b.count(0)
    if n: print(f, n)
" $(git ls-files '*.ts' '*.tsx')
```

This cost time in two separate sessions.

**Standing instruction:** each session, watch for steps repeated by hand and add
the mechanical ones here, so later sessions start from the command rather than
the investigation.

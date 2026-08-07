# Journal index (`/journal`)


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


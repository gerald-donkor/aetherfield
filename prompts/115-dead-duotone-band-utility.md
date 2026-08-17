# 115 — `@utility duotone-band` is 32 lines of CSS nothing uses

## Scope, and why it is next

Smallest marketing-site finding, and placed before 116 and 117 because it is the
only one that can be settled with a single grep.

`app/globals.css:314-345` defines a Tailwind v4 `@utility`:

```css
/* Footer duotone band — the reference uses a halftone-screened photograph of
   draped fabric. Rebuilt in CSS so the page carries no external image:
   soft diagonal folds in brand-ink, overprinted with a yellow dot screen. */
@utility duotone-band { … }
```

32 lines: a radial-gradient halftone screen plus two interfering
repeating-linear-gradients at 107° and 119°, with a three-part `background-size`.

**`grep -rn "duotone-band" app/ lib/ docs/` returns exactly one hit — the
definition itself.** No `className` uses it, and no `docs/` file mentions it.

The comment says "Footer duotone band", and `SiteFooter` is a **settled surface**
the front matter forbids restyling. So the first question is not whether to
delete it but **what the footer's texture band actually uses today** — because
there are two very different explanations and they lead to opposite actions.

## Reference material read

- `app/globals.css:308-350` — the utility and its neighbours
- `grep -rn "duotone-band" app/ lib/ docs/` — the single hit
- `app/_components/chrome.tsx` — `SiteFooter` and its texture band, to find what
  class or technique it really uses
- `docs/chrome.md` — the footer's settled geometry, type, colours, texture band
  and SVG wordmark, which is where the band's history is recorded

## What the implementation must do

**Establish which of these is true, and say so explicitly:**

- **(a) The footer uses a different technique now** — an image, an inline style,
  a differently-named utility — and `duotone-band` is a superseded earlier
  attempt. **Then delete it**, and note in `docs/chrome.md` that it was the
  earlier approach and what replaced it.
- **(b) The footer renders nothing where this was meant to go** — the utility
  was written and never wired up. **Then this is not dead code, it is an
  unfinished feature.** Do **not** delete it. Report it, and let the user decide
  whether the band should be wired in — that is a change to a settled surface
  and needs their say-so.
- **(c) It is reachable by some route the grep missed** — a dynamic class name,
  a `@apply`, a string built at runtime. **Then keep it** and record why the
  grep was misleading.

**Do not delete on the strength of the grep alone.** A Tailwind v4 `@utility`
can be referenced in ways a plain string search misses, and the footer is the
one surface in this repository the front matter singles out as settled and
off-limits. Read `chrome.tsx` and `docs/chrome.md` before touching a line.

If the answer is (a) and the deletion goes ahead, delete the comment with it —
a comment explaining a rule that no longer exists is the §12 rule 8 problem this
sequence has already fixed four times.

## Measurements

The band's colours and angles are comp-fitted values recorded in
`docs/chrome.md`. **Nothing here may be re-fitted.** If the outcome is deletion,
the values are preserved in `git` history and in the `docs/` note — say so, so a
later session knows where to find them rather than re-deriving them from the
comp.

## Expected impact

Outcome (a): `globals.css` loses 32 lines and the built CSS shrinks by whatever
an unused `@utility` contributes — **measure it, do not assume it is zero and do
not assume it is meaningful**. Tailwind v4 may already be tree-shaking it, in
which case the built CSS is unchanged and the benefit is purely legibility. Say
which.

Outcomes (b) and (c): no code change.

## Prerender impact

`none — no route changes`. `SiteFooter` ships on **every** route, so the
prerendered HTML of all nine must be **byte-identical** — an unused CSS utility
appears in no markup, and if any route's HTML changes, something other than dead
code was removed.

`npm run build`, quote the route table, diff all nine per `docs/automation.md`.
Standing warning in force for `/`, `/journal` and `/careers`. **Additionally
compare the built CSS before and after** and quote the byte difference.

## Trust boundary

`none` — a stylesheet.

## Secrets and data

None.

## Non-goals

- **Do not restyle `SiteFooter`.** Settled surface — geometry, type, colours,
  texture band and SVG wordmark are all done. This prompt removes an unused
  definition or reports a gap; it does not touch the footer's appearance under
  any outcome.
- **Do not wire `duotone-band` in** if outcome (b) holds. Report and stop.
- Do not audit `globals.css` for other unused utilities. Worth doing, its own
  prompt.
- Do not touch `@theme` or any design token.
- **Do not touch `SiteNav`.**

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it; byte-identical everywhere is the
  pass condition
- Built-CSS size before and after — quote both figures

## Where the result is recorded

`docs/chrome.md` — it owns the footer and its texture band. Record which of
(a), (b) or (c) was found, the evidence for it, and under (a) both the deletion
and a pointer to where the fitted values now live.

## SKILLS USED

- `tailwind-4-docs` — **essential here.** v4's `@utility` at-rule, how it
  differs from v3's `@layer utilities`, and specifically whether an unreferenced
  `@utility` is emitted into the built stylesheet at all. That determines
  whether the deletion has any measurable effect, and it must be verified rather
  than assumed (§12 rule 2).

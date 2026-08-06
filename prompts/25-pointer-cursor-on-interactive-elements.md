# 25 — A pointer cursor on every button and link

## Scope, and why it is next

The user's request: *"Every button and link I hover on or point to should change
the mouse pointer to cursor pointer property signaling the element is
clickable."*

It is next because it is a site-wide affordance bug, not a page feature: it
affects every route at once, costs no layout, and is independent of anything on
the build list.

**The actual gap is `<button>`, not `<a>`.** Browsers' UA stylesheets already
give `cursor: pointer` to an `<a>` **with an `href`**, and every anchor in the
tree has one (`grep -rn "<a " app/` finds a single literal anchor, the
`mailto:` in `about/sections.tsx:329`; everything else is `next/link`, which
always emits `href`). What is missing is the `<button>` case: **Tailwind v4
dropped v3's preflight rule** `button, [role="button"] { cursor: pointer }`, so
buttons now fall back to the UA's `cursor: default`. `tailwindcss` here is
**4.3.3** (`node_modules/tailwindcss/package.json`), so this project is on the
affected side of that change.

The affected elements, all of them:

| element | file | note |
| --- | --- | --- |
| `Button` | `app/_components/primitives.tsx:174` | a real `<button type="button">`; ships inert on `/careers`' open-application card and on the job listings' closing Apply |
| mobile menu toggle | `app/_components/chrome.tsx:64` | `<button type="button">` with `onClick` |
| `ButtonLink`, `LinkButton`, `SiteNav` / `SiteFooter` items, card links | various | already pointer via the UA `a[href]` rule — **verify, do not restyle** |

## The fix

**One rule in `app/globals.css`, not a class on `BUTTON_BASE`.** A class would
cover `Button` only and would have to be repeated on the chrome toggle and on
every future button; the rule is Tailwind's own documented v4 replacement for
the removed preflight and covers the whole tree at once:

```css
@layer base {
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

- **`@layer base`**, so any future `cursor-*` utility still wins — utilities
  outrank base in Tailwind v4's cascade layers.
- **`:not(:disabled)` is load-bearing.** A disabled control must keep the
  default cursor; without the guard, the inert `Button`s would advertise
  themselves as clickable while doing nothing on click. (Note the site's
  currently inert buttons are not `disabled` — they are enabled buttons with no
  handler — so they *will* get the pointer. That matches the request as
  written; the honest fix for those is a destination, which is already flagged
  in `AGENTS.md` for both Apply buttons.)
- **`[role="button"]` is included for completeness**; nothing in the tree uses
  it today.
- Place the rule near the top of `globals.css`, after the `@theme` block and
  before the motion start-state block, with a short comment recording *why* it
  exists (the v4 preflight change) so a later reader does not delete it as
  redundant.

**Do not add `cursor-pointer` to `BUTTON_BASE`, `chrome.tsx` or any component**
— no component file is edited by this prompt.

## Measurements to hit

No geometry changes, so there is nothing to fit against a comp. The checks are
computed-style probes, run against a production build on a free port
(`npx next start -p 3001`; check port 3000 first — `AGENTS.md` §3), driving
`playwright-core` out of the npx cache (resolve the path with
`ls -d /home/gdk26/.npm/_npx/*/node_modules/playwright-core` — the hash
changes).

Read `getComputedStyle(el).cursor` and require **`pointer`** for each:

| page | selector |
| --- | --- |
| `/` at 375 | the mobile menu `<button aria-label="Open menu">` |
| `/` | `SiteNav`'s "Get started" `LinkButton`, a nav `Link`, a journal row `<a>`, the footer's nav items |
| `/careers` | the open-application card's inert `Button` ("Apply now") |
| `/careers` | a role card's `ButtonLink` ("View role") |
| `/job-listing/data-scientist` | both Apply controls — top `ButtonLink`, closing inert `Button` |
| `/about` | the `mailto:` anchor and the "Meet the team" `ButtonLink` |
| `/design-system` | every `<button>` on the page |

And one negative check: assert **no element anywhere gains `cursor: pointer`
that is not a `<button>`, `[role="button"]` or `a[href]`** — enumerate
`document.querySelectorAll("*")`, filter on computed `cursor === "pointer"`,
and confirm the tag set is exactly `{A, BUTTON}`.

Also confirm the rule survives Lightning CSS into the built stylesheet, the
same way the `scripting: enabled` block is checked:

```
grep -o 'cursor:pointer' .next/static/chunks/*.css
```

## Expected impact

- **All 16 routes' prerendered HTML stays byte-identical** apart from the CSS
  chunk name and the build id — no markup is edited. Verify with the
  scratchpad build-diff helper against a worktree build of the parent commit
  (`AGENTS.md` §3: normalise the chunk with `[A-Za-z0-9_-]+`, **not** `[a-f0-9]+`,
  and scan common prefix/suffix rather than running `SequenceMatcher` over a
  200 KB line).
- **Every page keeps an identical chunk set** — no new module, so nothing can
  leak into a bundle.
- **Renders are pixel-identical** at 375 / 800 / 1280 on a settled page: the
  cursor is not painted into a screenshot. `/` is the one exception and only
  for the reason already on file — the scrubbed cloth sits wherever the scroll
  put it, so score `/` as `AE = 0` **outside** the capabilities image box and
  report the box separately (`AGENTS.md` §3). Page heights must stay
  **6350 / 6006 / 5595**.

## Non-goals

- **No hover *styling* changes.** The site's three hover idioms
  (`hover:text-muted`, `hover:opacity-70`, `hover:underline` /
  `hover:no-underline`) stay exactly as they are; this is the cursor only.
- **No `cursor` on non-interactive elements** — not on cards, not on the
  journal mark, not on the capabilities photograph. A pointer on something that
  does nothing is worse than no pointer.
- **The inert buttons stay inert.** Giving the two Apply buttons and the
  open-application "Apply now" a real destination is a separate decision that
  needs a URL from the user; it is already flagged in `AGENTS.md`.
- **`SiteFooter` is not touched**, per the standing rule — its `href="#"` items
  already get the UA pointer and need no change.
- No `cursor: none`, no custom cursor image, no `cursor: not-allowed` on the
  inert controls.

## Checks

```
npm run lint
npm run typecheck
npm run build
```

Report the exact output of each (`AGENTS.md` §2).

## What to record in `AGENTS.md`

A short subsection under a site-wide heading (not under any one page), stating:

- Tailwind v4 removed v3's `button { cursor: pointer }` preflight rule, this
  project is on 4.3.3, and the rule is authored back in `globals.css`'s
  `@layer base` — with the `:not(:disabled)` guard and why it is there;
- that `a[href]` is covered by the UA stylesheet and needs no rule, so the fix
  is deliberately scoped to `button` / `[role="button"]`;
- that it is CSS-only: no component edited, all 16 pages byte-identical apart
  from the CSS chunk name, chunk sets unchanged;
- the probe results table above, as measured.

Add to §3 (Automation) if it proves mechanical: the one-liner that enumerates
every element whose computed `cursor` is `pointer` and reports the tag set — it
is the cheap way to check this class of change site-wide.

## SKILLS USED

- **tailwind-4-docs** — confirm, against the v4 docs rather than memory, that
  the `button` preflight rule was removed in v4, that `@layer base` is the
  documented replacement, and that base loses to utilities in v4's cascade
  layer order.
- **run** — start the production build on a free port and drive the computed-
  style probes against the real app.

Nothing else. No GSAP skill: this change adds no animation and touches no
motion module.

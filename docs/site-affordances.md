# Site-wide affordances


## The pointer cursor on buttons

**Tailwind v4 removed v3's Preflight rule `button, [role="button"] { cursor:
pointer }`.** Confirmed against the installed copy, not from memory:
`tailwindcss` here is **4.3.3** and `node_modules/tailwindcss/preflight.css`
carries only the Safari spinner note at `:384` — no `cursor` on `button`. So a
`<button>` fell back to the UA's `cursor: default` and stopped advertising
itself as clickable. The rule is authored back in `app/globals.css`, directly
after the `body` block:

```css
@layer base {
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

- **`@layer base`, so any future `cursor-*` utility still wins.**
  `node_modules/tailwindcss/index.css:1` declares
  `@layer theme, base, components, utilities;` — utilities come last.
- **`:not(:disabled)` is load-bearing**: a disabled control must keep the
  default cursor. The site's currently *inert* buttons (the `/careers`
  open-application "Apply now", the job listings' closing Apply) are not
  `disabled` — they are enabled buttons with no handler — so they do get the
  pointer. That matches the request; the honest fix for those is a destination,
  already flagged above for both Apply buttons.
- **`a[href]` needs no rule** — the UA stylesheet already gives it a pointer,
  and every link in the tree has an href (`next/link` always emits one; the
  only literal anchor is the `mailto:` in `about/sections.tsx`). The fix is
  deliberately scoped to `button` / `[role="button"]`; `[role="button"]` is in
  for completeness and nothing uses it today.

**CSS-only — no component file was edited.** Verified by building the working
tree twice, once with the block removed: **all 16 prerendered pages are
byte-identical** once the build id and the CSS chunk name are normalised, so
every JS chunk name is literally unchanged and no chunk set moved. Renders are
untouched by construction — the HTML is identical and `cursor` paints nothing —
so no screenshot comparison was run.

The rule survives Lightning CSS into the built stylesheet as
`button:not(:disabled),[role=button]:not(:disabled){cursor:pointer}`, sitting
immediately before `@layer components` — i.e. still inside `base`.

Measured in the production build, `getComputedStyle(el).cursor`:

| page | element | before | after |
| --- | --- | --- | --- |
| `/` @375 | mobile menu `<button>` | `default` | **`pointer`** |
| `/` @1280 | nav links, "Get started", journal row links, footer nav | `pointer` | `pointer` |
| `/careers` | inert "Apply now" `Button` | `default` | **`pointer`** |
| `/careers` | role card `ButtonLink` | `pointer` | `pointer` |
| `/job-listing/data-scientist` | top Apply `ButtonLink` | `pointer` | `pointer` |
| `/job-listing/data-scientist` | closing inert `Button` | `default` | **`pointer`** |
| `/about` | `mailto:` anchor, "Meet the team" | `pointer` | `pointer` |
| `/design-system` | all six `<button>`s | `default` | **`pointer`** |
| `/journal` | all six card links | `pointer` | `pointer` |

**`cursor` is an inherited property, so a naive negative check reads wrong.**
Enumerating every element with computed `cursor: pointer` on `/` returns
`{A, SPAN, IMG, DIV, H3, P, svg, path}` — the spans and images are *inside*
anchors. Resolve each hit to `el.closest('button, [role="button"], a[href]')`
instead; the tag set is then exactly `{A, BUTTON}` on all seven pages probed,
with no unattributed hit anywhere.

**Aside, harmless:** the built stylesheet also contains a `.cursor-pointer`
utility. Nothing in `app/` uses it — v4's automatic content detection picked the
class name out of the prose in `prompts/25-*.md`.


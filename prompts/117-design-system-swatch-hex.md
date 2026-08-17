# 117 — Nine hex values in the styleguide are hand-synced against `@theme`

## Scope, and why it is next

Last of the marketing-site group. It is the one finding whose whole point is
that a page *documenting* the design system can lie about it.

`app/design-system/page.tsx:20-30`:

```ts
const SWATCHES = [
  { name: "ink",         hex: "#000000", role: "Primary text, fills" },
  { name: "muted",       hex: "#6C6C6C", role: "Meta, captions" },
  { name: "border",      hex: "#DBE0EC", role: "Hairlines, placeholders" },
  { name: "surface",     hex: "#F6F8FB", role: "Tinted bands" },
  { name: "white",       hex: "#FFFFFF", role: "Page, cards" },
  { name: "accent-soft", hex: "#ADD5FD", role: "Tints" },
  { name: "accent",      hex: "#2683EB", role: "Links, focus" },
  { name: "brand",       hex: "#FFF546", role: "Footer field" },
  { name: "brand-ink",   hex: "#66640F", role: "Ink on brand" },
];
```

Nine literals, each duplicating a token defined in `@theme` in
`app/globals.css`. Tailwind v4 is config-less and `@theme` is the single source
of truth (front matter), so these are a hand-maintained mirror of it.

Change a token and the styleguide keeps printing the old value — **as a label
next to a swatch rendered from the new one**, so the page shows the right colour
beside the wrong number. A styleguide that misreports its own tokens is worse
than no styleguide, because it is what the next session will trust.

## Reference material read

- `app/design-system/page.tsx:20-40` — `SWATCHES` and the swatch renderer, to
  see whether the rendered colour comes from the token or from the `hex` string
- `app/globals.css` — the `@theme` block and all nine token definitions
- `docs/site-affordances.md` and `docs/chrome.md` — for any recorded reasoning
  about the swatch list
- AGENTS.md front matter — Tailwind v4 is config-less, tokens live in `@theme`,
  there is no `tailwind.config.js`

## What the implementation must do

**First, verify the nine literals still match `@theme` today.** Read both and
compare. **If any pair already disagrees, that is the live bug** — report it
prominently, fix the displayed value, and note which one drifted. Do not fold a
discovered drift silently into a refactor.

**Then decide how to stop it recurring, and this is the substance of the
prompt.** Establish what is actually possible before choosing:

- **Read the token at runtime** — `getComputedStyle` on a probe element — is
  wrong here. `/design-system` is `○ Static` and must stay so; this would need a
  client component and would show nothing in the prerendered HTML.
- **Read `@theme` at build time** and generate the list. Verify whether this is
  practical in a Turbopack build without adding a build step, and **say what was
  found** — a `@theme` block is CSS, and parsing it from a server component is
  not obviously supported.
- **Derive the swatch from the token in CSS** and stop printing a hex at all —
  render the colour from `bg-<token>` or `var(--color-<token>)` and show only
  the token name and role. **This is the strongest option**: the styleguide can
  no longer contradict `@theme` because it no longer restates it. The cost is
  that a reader loses the hex, which is a genuine loss for a styleguide.
- **Keep the literals and add a check** — a test asserting the nine match
  `@theme`. But `npm test` is scoped to `lib/domain/` (§2) and a test needing to
  parse CSS does not belong there, so this needs somewhere to live.

**Recommend one, argue it, and state what it costs.** If the honest answer is
that every option is worse than the status quo, **say that and change nothing
but add a comment** at `SWATCHES` warning that it mirrors `@theme` by hand and
must be updated in lockstep. Recording the hazard is a legitimate outcome; a
half-built generator is not.

**Do not change any colour value.** Every one of the nine is comp-fitted.

## Measurements

The nine hex values are existing measurements from the comps, recorded in
`@theme`. **This prompt takes no new measurement and changes no colour.** The
comparison of `SWATCHES` against `@theme` is a verification, and its result —
match or drift — is the prompt's first finding.

## Expected impact

Depends on the option chosen. Under the CSS-derived option, `/design-system`'s
markup changes: the hex text disappears from each swatch.

## Prerender impact

**`/design-system` is `○ Static`. Whether its HTML changes depends on the option
chosen, and the prompt must state which before implementing:**

- comment-only, or generated-list-producing-identical-output: **byte-identical**
- CSS-derived swatches: **`/design-system`'s markup changes** — stated up front
  and **approved**, since the page is the styleguide and this is a correction to
  what it reports about itself

**Every other route must be byte-identical**, and `/design-system` must stay
`○ Static` under every option. `npm run build`, quote the route table, diff all
nine routes per `docs/automation.md`. Standing warning in force for `/`,
`/journal` and `/careers`.

**If the chosen option would make `/design-system` dynamic or add a client
boundary to it, abandon that option.** §8.1 is not negotiable for a styleguide
tidy-up.

## Trust boundary

`none` — a static page with no input.

## Secrets and data

None.

## Non-goals

- **Do not change any token value in `@theme`.**
- **Do not add a `tailwind.config.js`.** Tailwind v4 is config-less here and
  reintroducing a config to make token reading easier would be a far larger
  decision than this finding warrants.
- **Do not make `/design-system` dynamic or client-rendered.**
- Do not add or remove a swatch, or change the token names or role text.
- Do not touch the other hand-maintained lists on this page — if the same
  pattern appears for type scales or spacing, **report it** as a sibling finding
  rather than absorbing it here.
- **Do not touch `SiteFooter` or `SiteNav`** — `brand` and `brand-ink` are the
  footer's colours and this prompt does not go near it.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it; the eight non-styleguide routes
  byte-identical is the pass condition
- **Quote the `SWATCHES`-versus-`@theme` comparison in full** — nine rows, match
  or drift. That table is the prompt's primary evidence.

## Where the result is recorded

The `docs/` file owning `/design-system` — named from AGENTS.md's index, adding
a row only if a genuinely new file is needed. Record the nine-row comparison,
the options considered, the one chosen and why, and what it costs.

## SKILLS USED

- `tailwind-4-docs` — **the deciding skill.** `@theme`, how tokens become CSS
  custom properties, whether a `@theme` value is readable at build time, and
  what `bg-<token>` resolves to. Every option above depends on facts that must
  be verified here rather than assumed (§12 rule 2).
- `nextjs` — keeping `/design-system` `○ Static`; what a server component may do
  at build time without a client boundary or a build step.
- `frontend-design:frontend-design` — whether a styleguide swatch should show a
  hex at all is a design decision, not just a plumbing one.

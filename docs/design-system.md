# The design system exhibit — `/design-system`

The styleguide route. `app/design-system/page.tsx` is a single server component
that renders every foundation and every primitive the site ships, and it is
`○ Static` like the five other marketing routes. Two rules govern it, and they
pull in opposite directions: it must **show what ships** (`docs/careers.md:53`
puts it that way — a change to a primitive changes this page, and that is
correct), and it must **not claim anything it cannot keep true**.

This file records the second rule's first real application.


## The nine colour swatches, and the hex values that used to sit beside them

**The finding, from prompt 117.** `SWATCHES` in `app/design-system/page.tsx`
carried a `hex` literal per row, and nine literals is nine hand-kept copies of
`@theme` in `app/globals.css`. Tailwind v4 is config-less; `@theme` is the only
place a colour is valued; so the exhibit was a mirror with nothing keeping it in
step.

### The comparison, run first — all nine matched

The prompt's primary evidence, and the reason the change is a hardening rather
than a bug fix. Read from `app/globals.css:5-13` against
`app/design-system/page.tsx:34-42` as they stood at `2f0eef8`:

| token | `@theme` | `SWATCHES.hex` | verdict |
| --- | --- | --- | --- |
| `ink` | `#000000` | `#000000` | match |
| `muted` | `#6c6c6c` | `#6C6C6C` | match |
| `border` | `#dbe0ec` | `#DBE0EC` | match |
| `surface` | `#f6f8fb` | `#F6F8FB` | match |
| `white` | `#ffffff` | `#FFFFFF` | match |
| `accent-soft` | `#add5fd` | `#ADD5FD` | match |
| `accent` | `#2683eb` | `#2683EB` | match |
| `brand` | `#fff546` | `#FFF546` | match |
| `brand-ink` | `#66640f` | `#66640F` | match |

**Nine of nine matched.** `@theme` is lowercase throughout and `SWATCHES` was
uppercase throughout — a consistent difference of casing, not of value, and the
comparison is case-insensitive on purpose. **No token had drifted**, so nothing
displayed was wrong on the day. The hazard was live, the defect was not.

### The hazard was worse than the prompt assumed

The prompt described the failure as "the right colour beside the wrong number" —
a swatch painted from the token with a stale label next to it. **It was not
that.** The renderer read `style={{ backgroundColor: s.hex }}`, so the *swatch
itself* was painted from the literal:

```tsx
<div
  style={{ backgroundColor: s.hex }}
  className="aspect-square w-full border border-border"
/>
```

So re-fitting a colour in `@theme` moved **nothing** on this page — not the
label and not the block. The page would have gone on showing the retired colour,
in both places, with nothing to notice. A stale label beside a live swatch at
least contradicts itself visibly; this contradicted only the rest of the site.

### The options, and what was established about each

| option | verdict |
| --- | --- |
| read the token at runtime with `getComputedStyle` | **rejected, and it is the documented JS route** — `.agents/skills/tailwind-4-docs/references/docs/theme.mdx:659-665` and `upgrade-guide.mdx:858-864` both name it. It needs a client component, and it resolves in the browser, so the prerendered HTML would ship an empty label. §8.1 forbids it and the prompt ruled it out up front |
| read `@theme` at build time and generate the list | **rejected as unavailable, not as unattractive.** Tailwind v4 removed v3's `resolveConfig` and ships no replacement: `upgrade-guide.mdx:844-848` — *"In v3 we exported a `resolveConfig` function … We've removed this in v4 in hopes that people can use the CSS variables we generate directly instead."* There is no supported way to ask Tailwind for a theme value from JS. What is left is hand-parsing `app/globals.css` with `node:fs` from the server component — a homemade CSS parser, depending on that file's path surviving the bundle, to re-derive a string the CSS already holds. It would remove the drift and add a parser, which is a worse trade than removing the restatement |
| **derive the swatch from the token and stop printing a hex** | **chosen.** See below |
| keep the literals and add a check | **rejected on where it would live.** `npm run test` is scoped to `lib/domain/` (AGENTS.md §2) and a CSS-parsing test does not belong in a pure-domain suite. It would need a new suite, a new script, and the same homemade parser as the option above — machinery to guard a restatement that need not exist |

### What shipped

`SWATCHES` rows are now `{ name, utility, role }`, and the swatch paints itself
with the utility the token generates:

```tsx
<div className={`aspect-square w-full border border-border ${s.utility}`} />
```

The `font-mono text-[11px]` line that printed the hex is **gone**. Each cell is
now two lines of text — the token name in bold sans, the role in serif muted —
under the block.

**`utility` is a literal string per row, and that is load-bearing.**
`theme.mdx:520` — *"By default only used CSS variables will be generated in the
final CSS output"* — and the same scanning rule governs utilities. A
`` `bg-${s.name}` `` template appears in no scanned source, so the class would
never be generated and the swatch would paint nothing. Verified in the built
CSS after the change: all nine `--color-*` variables are defined and all nine
`.bg-*` rules exist.

**Why losing the hex is acceptable, and it is a design call rather than a
concession.** Nothing in this codebase consumes a colour as a hex. A caller
types `bg-accent` or `var(--color-accent)`; the hex is the token's private
implementation, valued once in `@theme`. The exhibit's job is to name the nine
tokens and say what each is for, and it still does both. What it no longer does
is keep a second copy of a value it does not own — which is the only way it
could ever have been wrong about one.

### CSS impact — three new utilities, nothing removed

The switch from an inline `style` to `bg-*` classes adds three rules, because
six of the nine were already generated by the rest of the site:

```
+ .bg-accent-soft{background-color:var(--color-accent-soft)}
+ .bg-brand-ink{background-color:var(--color-brand-ink)}
+ .bg-muted{background-color:var(--color-muted)}
```

**68,656 → 68,814 bytes, +158, and zero rules removed.** `text-[11px]` survives
the removal of its only use here — it is used across the authenticated routes —
so no rule was lost with the hex line.


## The prerender result

`/design-system` stays `○ Static`, and the build's route table is unchanged from
the one AGENTS.md §8.1 pins: `/`, `/about`, `/careers`, `/design-system`,
`/journal` `○ Static`; `/article/[slug]` (6) and `/job-listing/[slug]` (3)
`● SSG`.

Diffed per `docs/automation.md` — two trees on the repo's own filesystem, both
excluding `.claude/` and `.agents/`, with the build id, both chunk patterns and
the Server Action ids normalised (traps 2, 4, 5, 9, 10):

| result | |
| --- | --- |
| **20 of 21 prerendered files byte-identical** | every route but the styleguide |
| `design-system.html` | **changed, and approved up front** — it is the page being corrected |

**The 20 identical files needed the CSS chunk reference collapsed**, because the
stylesheet legitimately gained the three rules above, so its content hash moves
and every page's `<link>` points somewhere new. That is one shared-asset change
propagating, not 20 page changes: with the reference collapsed to a constant, 20
of 21 are byte-identical, and the chunk's own +158 bytes is accounted for
separately above. **A CSS-only change makes every page's chunk reference differ
at delta 0** — the same identical-byte-length signature `docs/automation.md`
records for renames, from a different cause.

Inside `design-system.html`, with the flight payload stripped: the markup
**before** the swatch grid is byte-identical, the markup **after** it is
byte-identical, and the grid itself is **-744 bytes**. No hex literal survives
anywhere in the file.


## Sibling findings — reported, deliberately not fixed

Prompt 117 was scoped to the nine colour hexes and its non-goals forbade
absorbing the rest. These are the same class of hazard on the same page:

1. **The ten type specs restate `@theme`'s type scale by hand.** `TypeSpec`'s
   `spec` strings — `"Serif · 80 / 1.05"`, `"Sans · 20 / 24 · Bold"` and eight
   more, at `app/design-system/page.tsx:185-220` — are hand-written copies of
   `--text-h1` … `--text-caption` and their `--line-height` pairs. Identical
   failure mode to the hexes and a strictly harder one to fix, because a type
   spec has no `bg-*` equivalent to derive it from and the string is prose, not
   a value. Note that two of these are *already* inherited comp deviations
   (AGENTS.md front matter: `--text-p1` / `--text-p2` ship at 20px where the
   comps set ~17), so the specs read `20 / 24` and are correct about the code
   while differing from the comp on purpose.
2. **Three colour tokens in `@theme` are not exhibited at all.**
   `--color-rule` (`#e9e9e9`, and the page's own section dividers use it),
   `--color-dawn` (`#fef3df`) and `--color-cream` (`#eee8d7`). The exhibit shows
   nine of twelve colour tokens. Adding a swatch was an explicit non-goal, so
   the gap is recorded rather than closed — but a styleguide that omits a
   quarter of its palette is the mirror of the problem this prompt fixed: not
   wrong about what it shows, incomplete about what exists.
3. **The `Row note=` strings restate component geometry by hand** — `"164×46"`,
   `"400×246, radius 16"`, `"820×194"`. Measured numbers, copied into prose next
   to the component they describe, with nothing tying them to it.

None of the three is wrong today. All three are copies.

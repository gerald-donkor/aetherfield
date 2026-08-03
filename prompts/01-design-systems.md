# Aetherfield — Design System

Derived from `public/design-ref/Styles.pdf` (Figma frame, 1400 px wide × 10793 px tall).
All values below were extracted from the PDF content stream (text matrices, path geometry,
fill operators), so sizes, colours and box dimensions are exact rather than eyeballed.

Source template: "Modern & Clean SaaS Company" (Figma Community). Photography credits in the
file point at Unsplash / Pexels.

---

## 1. Foundations

### 1.1 Colour

Nine swatches, laid out at `x = 20 + 120n`, each `105 × 105`.

| Token | Hex | Role |
| --- | --- | --- |
| `--color-ink` | `#000000` | Primary text, button fills, wordmark |
| `--color-muted` | `#6C6C6C` | Meta text, captions, labels, hover-dimmed button text |
| `--color-border` | `#DBE0EC` | Hairlines, dividers, image-placeholder fill, list separators |
| `--color-surface` | `#F6F8FB` | Tinted card + CTA band background |
| `--color-white` | `#FFFFFF` | Page background, card background, on-ink text |
| `--color-accent-soft` | `#ADD5FD` | Light blue — supporting accent / tints |
| `--color-accent` | `#2683EB` | Blue — links, focus, interactive accent |
| `--color-brand` | `#FFF546` | Signature yellow — footer field, highlight blocks |
| `--color-brand-ink` | `#66640F` | Olive — the **only** text colour used on `--color-brand` |

Supporting values found in the layouts (not swatches):

| Token | Hex | Role |
| --- | --- | --- |
| `--color-rule` | `#E9E9E9` | Full-bleed section rules between styleguide sections |
| `--color-dawn` | `#FEF3DF` | Warm foot of the home hero gradient (top is `--color-accent-soft`) |
| `--color-cream` | `#EEE8D7` | Base under the home page's textured principles section |

**Rules**

- The palette is monochrome-first. Black, white and the two greys carry ~95 % of the UI.
- `--color-brand` never carries black text. Yellow and olive are a locked pair.
- Blue is an accent, not a brand colour — it never fills a large surface.
- There is no dark mode in the source file. Ship light-only.

### 1.2 Typography

Three families, each with a fixed job. This split is the defining feature of the system.

| Role | Family | Where it is used |
| --- | --- | --- |
| **Display serif** | High-contrast transitional serif | `H1` only, plus all long-form body copy (`Paragraph 2`) |
| **Grotesk sans** | Tight neo-grotesk, heavy weights | `H2`–`H4`, `Paragraph 1`, nav links, the wordmark |
| **Mono** | Geometric monospace | Button text, captions, all metadata (`Full-time · Denver, CO`) |

The PDF embeds Type 3 outlines with no font names, so the exact originals are not recoverable.
Visually the sans is Helvetica Now Display, the serif reads as Freight/Tiempos-class, and the
mono as JetBrains Mono. Implementation substitutes, all available through `next/font/google`:

- Sans → **Archivo**
- Serif → **Newsreader**
- Mono → **JetBrains Mono**

#### Type scale

Sizes are in px at the 1400 px desktop frame. Line-heights were measured from consecutive
text-matrix baselines.

| Token | Family | Size | Weight | Line-height | Notes |
| --- | --- | --- | --- | --- | --- |
| `h1` | serif | 80 | 400 | 1.05 | Editorial display. Never bolded. |
| `h2` | sans | 80 | 700 | 1.0 | Same size as `h1` — the contrast is the *family*, not the scale. |
| `h3` | sans | 56 | 700 | 1.0 | |
| `h4` | sans | 40 | 700 | 1.0 | Section + CTA headlines |
| `p1-bold` | sans | 20 | 700 | 24 px (1.2) | Card titles, value titles, job titles |
| `p1` | sans | 20 | 400 | 24 px (1.2) | Metadata values, UI copy |
| `p2` | serif | 20 | 400 | 24 px (1.2) | All prose. Card descriptions, value bodies, job bodies. |
| `nav` | sans | 16 | 700 | 1.0 | Header nav; footer nav renders at 20 px |
| `button` | mono | 14 | 500 | 1.0 | |
| `caption` | mono | 14 | 400 | 1.0 | Colour `--color-muted` |

**Rules**

- `H1` and `H2` are both 80 px. Choose between them by voice: serif `H1` for editorial and
  brand moments, sans `H2` for product and marketing statements.
- Prose is *always* serif at 20/24. Sans at 20 px is reserved for labels and titles.
- Anything that is machine-ish — a timestamp, a job type, a location, a read-time, a button —
  is mono. This is what makes the system feel like Aetherfield rather than a generic SaaS site.
- One metadata separator: a mono middot `·` in `--color-muted`, 17 px of space either side.

### 1.3 Layout

| Token | Value |
| --- | --- |
| Styleguide frame | 1400 px |
| Marketing page container | 1232 px content, capped at a 1280 px frame |
| Gutter | 20 px to tablet, 24 px on desktop |
| Comp breakpoints | 375 / 800 / 1280 |
| Tailwind breakpoints used | `md` 768, `lg` 1024 |

Display type does not follow a single fluid curve. The comps step it per
breakpoint, so the utilities do too:

| Role | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| Hero H1 (serif) | 36 | 64 | 80 |
| Split heading (`Built for clarity`) | 36 | 62 | 76 |
| Section heading (`display-fluid-h4`) | 24 | 30 | 40 |

### 1.4 Radius, border, elevation

| Token | Value | Applies to |
| --- | --- | --- |
| `--radius-none` | `0` | Buttons, CTA bands, footer, nav, image placeholders |
| `--radius-card` | `16px` | Value cards, job cards |
| Hairline | `1px solid --color-border` | Dividers, list separators |
| Section rule | `1px solid --color-rule` | Full-bleed styleguide separators |

Square corners are the default. Rounding is the exception, reserved for the two card types
that sit on a tinted or white surface. There are no shadows in the resting state; the only
elevation in the file is a soft drop-shadow on the button hover state.

---

## 2. Components

Measurements are the exact box geometry from the PDF.

### 2.1 Header nav

- Bar `1320 × 60`, sitting in the 1400 frame (40 px gutters). Background white, no border.
- Wordmark left, sans **800/900**, ~26 px, tight tracking (`-0.02em`).
- Links right: `Product · Journal · About · Careers · Get started →`, nav style (sans 16/700),
  measured x-positions give a **~28 px** gap between items.
- The final item `Get started →` is a link-button: same type, trailing `→`.

**Mobile (375)**

- Header row `375 × 60`, wordmark left, `+` toggle right (rotates to `×` when open).
- Open panel `375 × 508`. Items are sans **40 px/700**, stacked, each separated by a
  `335 × 1` `--color-border` hairline inset 20 px from each edge.
- Panel foot: full-width primary button `335 × 52`.

### 2.2 Buttons

All buttons are **square** (radius 0), black fill, white mono text.

| Variant | Box | Type | Detail |
| --- | --- | --- | --- |
| Primary | `164 × 46` | mono 14 | Leading `4 × 4` white square bullet at 16 px from the left edge, 10 px gap before the label |
| Secondary | `159 × 38` | mono 14 | No bullet, 12 px horizontal padding |
| Compact | `100 × 38` | mono 14 | Used inside cards (`View role`) |
| Link | — | sans 16/700 | No fill. Trailing `→`. |

**States**

- Hover (primary/secondary): label fades to `--color-muted` and a soft drop shadow appears.
- Hover (link): the `→` slides right ~6 px, the gap widens.

The 4 px bullet is the system's signature detail — it marks the single highest-intent action
on a page. Do not put it on secondary or compact buttons.

### 2.3 Article card

Three layouts off one content model (image, title, category, read-time, description).

**Stacked / feature** — image `612 × 356` (`--color-border` placeholder), then:

| Element | Style | Offset from previous baseline |
| --- | --- | --- |
| Title | `p1-bold` | — |
| Meta `Tooling · 4 min` | `caption` (mono 14, muted) | 23 px |
| Description | `p2` (serif 20/24) | 44 px |

The compact variant of this card drops the description.

**Horizontal** — `620 × 150` on `--color-border`, image `165 × 100` left, title (sans 18/700)
and meta stacked right.

**Mobile stacked** — card `375 × 335`, image `375 × 227`.

### 2.4 Metadata pair

Label / value stack used for `Published`, `Author`.

- Label: **serif 20**, `--color-muted`
- Value: **sans 20/400**, `--color-ink`
- 27 px baseline-to-baseline

Desktop lays pairs out in a row; mobile stacks them at 18 px. A `1px --color-border` rule
runs above the group.

### 2.5 Byline row

`1240 × 57`, hairline top and bottom. Three columns: name (sans 20/700), title
(serif 20, muted), email (serif 20, muted) pushed right.

### 2.6 Value card

`400 × 246`, radius **16**. Two variants: transparent, or `--color-surface` filled.

- Icon: `48 × 48` circle, `1px` ink stroke, containing a `↗` glyph. 40 px from top/left.
- Title: `p1-bold`, 80 px below the icon top.
- Body: `p2`, 24 px line-height, 29 px below the title baseline.

### 2.7 Job card

`820 × 194`, radius **16**, white.

- Title `p1-bold`; meta `caption` mono (`Full-time · Denver, CO`) 23 px below.
- Body `p2`, 44 px below the meta.
- Compact button `100 × 38` pinned top-right at 40 px inset.
- Mobile: `335 × 288`, button moves to the bottom-left of the card.

### 2.8 CTA band

- `1280 × 358`, `--color-surface`, **square corners**, contents centred.
- Headline `h4` (sans 40/700), primary button `164 × 46` centred 38 px below.
- Tablet `800 × 318`, mobile `375 × 318` — the headline wraps to 2–4 lines at the same 40 px
  size with a 40 px line-height (LH 1.0).

### 2.9 Footer

The one full-colour moment in the system.

- Block `1280 × 588`, background `--color-brand` (`#FFF546`). **All** content is
  `--color-brand-ink` (`#66640F`).
- Top row: nav links (sans **20**/700) left; `© 2025 · All rights reserved` in **serif 20** right.
- Middle: a wide duotone image band (yellow/olive halftone), full card width, ~430 px tall.
- Bottom: the wordmark set enormous (~230 px), tracking `-0.03em`, bleeding to both edges of
  the block and optically cropped at the baseline.
- Mobile: `375 × 387`; nav stacks, wordmark scales to fit the width.

### 2.10 Icons

Line icons on a 24 px grid, `1px` stroke, ink coloured: `↗` (in a circle for value cards),
`+`, `×`, `→`, plus a small set of glyph marks. Stroke weight never changes with size.

---

## 3. Implementation notes

- Tokens live in `app/globals.css` under Tailwind v4's `@theme`, which exposes each one as a
  utility (`bg-brand`, `text-muted`, `font-serif`, `text-h2`, …).
- Fonts are loaded with `next/font/google` in `app/layout.tsx` and bound to
  `--font-sans` / `--font-serif` / `--font-mono`.
- Type tokens are registered as `--text-*` so `text-h1`, `text-p2`, `text-caption` etc. carry
  their size *and* line-height together, keeping the 20/24 relationship intact.
- Light mode only — do not add a `prefers-color-scheme` block.
- Image placeholders use `--color-border`; the footer band uses a CSS-generated duotone
  halftone so the page has no external image dependencies.

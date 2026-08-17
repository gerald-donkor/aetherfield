# 114 — The principle card is written twice, with four measured differences

## Scope, and why it is next

Follows 113, which clears the dead re-export out of the same file first.

The same card renders in two places over the same `PRINCIPLES` array:

- `app/_components/home/principles.tsx:27-48`
- `app/_components/about/sections.tsx:139-158`

Both map `PRINCIPLES`, both render a 24×24 stroke SVG at `size-12` with
identical `strokeWidth="1.3"`, `strokeLinecap`, `strokeLinejoin`, `fill="none"`
and `aria-hidden`, then an `h3` in `font-sans text-p1 font-bold` and a `p` in
`font-serif text-p2`.

**But they are not identical, and the differences are measured, not accidental**
— read this session:

| | `/` | `/about` |
| --- | --- | --- |
| list wrapper | `<ul>` inside `<Reveal as="section" stagger>` | `<Reveal as="ul">` |
| grid | `mt-10 grid gap-6 md:mt-12 lg:grid-cols-3` | `mt-8 grid gap-4 md:mt-10 lg:grid-cols-3` |
| card | `rounded-card bg-white p-8 md:p-10` | `rounded-card bg-surface p-10` |
| heading spacing | `mt-8` | `mt-5` |
| stagger hook | `data-reveal-item` | absent |

So this is **not** a copy-paste to be collapsed. It is one component with a
real variant axis — background, density, and whether the card participates in a
parent's stagger. Every one of those numbers is comp-fitted, and the front
matter is explicit that comp deviations are recorded rather than chased.

The finding stands anyway: the **SVG attribute block and the heading/body
structure** are duplicated, and that is the part with no variance. A change to
the icon rendering has to be made twice, and one of the two will eventually be
missed.

## Reference material read

- `app/_components/home/principles.tsx:25-50` — in full
- `app/_components/about/sections.tsx:135-162` — in full
- `app/_components/home/principles-data.tsx` — the shared array and the shape of
  `p.icon`
- `docs/motion-homepage.md` — `Reveal`, `stagger`, and what `data-reveal-item`
  does
- `docs/about.md` — the `/about` sections and their measured spacing
- `docs/motion-site.md` — `/about`'s reveal behaviour, which differs from `/`'s

## What the implementation must do

**Extract only the invariant part.** A `PrincipleCard` component taking the
principle plus the variant props that genuinely differ — background, padding,
heading margin, and whether to emit `data-reveal-item`. The grid and the
`Reveal` wrapper stay at each call site, because they differ structurally, not
just by a class.

**Every rendered class string must come out byte-identical at both sites.** The
extraction may not "tidy" `p-8 md:p-10` into `p-10`, may not unify `gap-6` and
`gap-4`, and may not normalise `mt-8` against `mt-5`. Those five differences are
the measured record and the front matter forbids chasing them.

**If the variant surface turns out to be as large as the shared surface, do not
extract.** Say so, and instead add a comment at each site pointing at the other,
so a change to one is at least visible from the other. A component with five
props to serve two call sites is not an improvement, and choosing not to extract
is a legitimate outcome of this prompt — it must just be an argued one, not a
default.

**`data-reveal-item` is a GSAP hook.** Whatever is extracted must keep the
attribute on the same element on `/`, and keep it absent on `/about`. Getting
this wrong breaks the homepage's stagger silently — the cards would still
render, just without their reveal.

## Measurements

The five differences tabulated above are the measurements, taken from the source
this session. They are **preserved, not re-derived and not re-fitted**. This
prompt takes no new measurement and must not adjust a single spacing value.

## Expected impact

One shared card component. Two call sites shorten. **Zero visual change on
either page**, and zero change to the homepage stagger.

## Prerender impact

**`/` and `/about` are both `○ Static` and their prerendered HTML must be
byte-identical after this change.** That is the acceptance condition.

`npm run build`, quote the route table, then diff all nine routes per
`docs/automation.md`. For `/`, the standing warning is in force and matters
here specifically: **mask the scrubbed capabilities cloth** before reporting a
number, and report the masked remainder and the box separately. Never quote a
bare page-wide `magick compare -metric AE` for `/`.

`/about` has no such moving element, so its diff should be exactly zero and
should be quoted as such.

## Trust boundary

`none` — static marketing content.

## Secrets and data

None.

## Non-goals

- **Do not change any spacing, colour, padding, gap or margin.** The five
  differences are inherited measurements.
- **Do not unify the two `Reveal` usages.** `/`'s section-level `stagger` and
  `/about`'s list-level reveal are documented separately in `docs/motion-site.md`
  and behave differently on purpose.
- **Do not touch `PRINCIPLES`' contents** or its module.
- Do not extract the `TeamTable` or any other `/about` section — 116 is the
  `TEAM` prompt and it is separate.
- **No GSAP changes.** No new tween, no `markers`, no `contextSafe`, no
  `clearProps` on `opacity` or `transform`.
- **Do not touch `SiteFooter` or `SiteNav`.**

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- Nine-route prerendered HTML diff — quote it, with `/`'s capabilities box
  masked and reported separately
- **Manually confirm the homepage principle stagger still runs**, since a
  prerendered-HTML diff cannot see a GSAP failure. Say how it was confirmed, and
  if it could not be, say that (§12 rule 3).

## Where the result is recorded

`docs/motion-homepage.md` for the `/` side and the stagger hook,
`docs/about.md` for the `/about` side. One entry each, cross-referenced, with
the five-difference table so the next session does not have to re-derive it.

## SKILLS USED

- `tailwind-4-docs` — v4 is config-less with `@theme` tokens; `rounded-card`,
  `bg-surface`, `text-p1` and `text-p2` are project tokens and must resolve
  identically from the new component's location.
- `gsap-react` — `data-reveal-item` and `useGSAP` scoping: confirm a selector in
  the parent's scope still matches the attribute once the element is emitted by
  a child component.
- `nextjs` — server component composition; the extracted card must stay a server
  component so neither page gains a client boundary.
- `frontend-design:frontend-design` — the extract-or-don't judgement is a design
  systems question.

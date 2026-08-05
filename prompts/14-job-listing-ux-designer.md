# 14 — Job listing 2: UX Designer (`/job-listing/ux-designer`)

Wire the `/careers` **UX Designer** card's "View role" button to a real page, by
building the second job listing from
`public/assets/pages/12-job-listing2/screen-sizes/`.

Today that button is inert: `JobList` passes an `href` only for slugs in
`WRITTEN_JOB_SLUGS`, `WRITTEN_JOB_SLUGS` is `Object.keys(JOB_BODIES)`, and
`JOB_BODIES` has only `data-scientist`. Adding the `ux-designer` key is what
turns the button into a link and stops `/job-listing/ux-designer` 404ing — no
change to `chrome.tsx`, `cards.tsx` or `careers/sections.tsx`.

## What the comp is

**The same page as `11-job-listing1` at the same geometry.** Measured on
`12-job-listing2/screen-sizes/Desktop.png`:

- card white field `+230+204` → bottom `1726`, i.e. `820×1522+230+204`
- rules at y **459** and **1487**
- footer top **1846** — a 120px card→footer gap, the shell's measured constant
- closing CTA is the same two balanced centred lines plus the same Apply button

So: the `hero-sky` shell, the card, `display-job-h2`, the drawn bullets, both
rules and the closing CTA are all reused untouched. **This is a data change plus
one anchoring fix** (below).

## 1. The data — `app/_content/jobs.ts`

Add one `JOB_BODIES` key. `lede` is **omitted**: the comp's standfirst is the
`JOBS` card body verbatim, and `JobBody.lede` already falls back to `Job.body`,
which is what stops the two drifting.

```ts
"ux-designer": {
  sections: [
    {
      heading: "Company description",
      body: "At Aetherfield, we build software that empowers companies to lead with climate accountability. Our platform helps sustainability and operations teams make sense of complex environmental data—transforming emissions, waste, and energy metrics into measurable, meaningful action. We're a mission-driven team of technologists, designers, and scientists working to accelerate the shift toward a low-carbon future.",
    },
    {
      heading: "About the role",
      body: "As a UX Designer at Aetherfield, you'll help turn raw climate data into clear, confident decision-making tools. You'll design end-to-end experiences that make complex systems feel approachable—shaping everything from data visualization to system flows to interaction patterns. Your work will help enterprise users feel informed, empowered, and aligned in their climate action.",
    },
    {
      heading: "Requirements",
      items: [
        "3+ years of experience designing for web-based products or platforms",
        "Portfolio that demonstrates systems thinking, design craft, and user empathy",
        "Experience designing data-dense interfaces or enterprise tools",
        "Strong skills in Figma (or equivalent), plus familiarity with accessible design practices",
        "Ability to partner closely with product, data, and engineering teams",
        "Curiosity about climate systems and care for usability in high-stakes workflows",
      ],
    },
    {
      heading: "Company benefits",
      body: "This is a contract position and does not include employee benefits. However, you'll work closely with our core team, have flexible hours, and contribute meaningfully to high-impact climate work alongside mission-driven collaborators.",
    },
  ],
  cta: "Ready to help build the future of climate intelligence?",
},
```

Notes on the transcription, all read off `Desktop.png` at 200 %:

- **"Company description" is verbatim identical to the Data Scientist listing.**
  It is transcribed again rather than shared, because `JOB_BODIES` is per-slug
  copy and a shared constant would invite editing one role's boilerplate and
  silently moving the other's.
- **"Company benefits" is a paragraph, not a list** — the only shape difference
  between the two listings, and the reason for the fix in §2.
- **Straight apostrophes, em dashes kept.** The comp draws curly `'`; every
  shipped article and the Data Scientist listing use straight `'`, and
  consistency across the set wins (the rule AGENTS.md records for articles 4–6).
  `data—transforming` and `approachable—shaping` are real em dashes, as the
  Data Scientist body already ships.
- `WRITTEN_JOB_SLUGS` derives from `JOB_BODIES`, so nothing else needs editing.
  `/job-listing/product-manager` still 404s by design until `13-job-listing3`.

## 2. The one code change — anchor the `Seal` to the end of the prose

`app/_components/job/sections.tsx` renders the seal **inside the `items` branch**
of the last section:

```tsx
{section.items ? (
  <div className="relative">
    <Bullets items={section.items} />
    {i === body.sections.length - 1 ? <Seal className="… top-[36px] …" /> : null}
  </div>
) : null}
```

On this comp the last section has `body`, not `items`, so **the seal would not
render at all**. It has to move out of that branch.

**Bottom-anchored, not top-anchored — this is measured, not chosen.** Seal ink
boxes and the last body line's ink bottom, across both comps:

| | comp 11 (Data Scientist) | comp 12 (UX Designer) |
| --- | --- | --- |
| seal, desktop | `282×143+840+1399` | `282×143+840+1271` |
| seal, tablet | `221×112+572+1524` | `221×112+572+1428` |
| desktop: seal bottom − last ink bottom | −22 | −23 |
| tablet: seal bottom − last ink bottom | −56 | −51 |
| desktop: seal bottom − closing rule | −74 | −74 |
| tablet: seal bottom − closing rule | −107 | −107 |

`x` and the box size are identical between the two comps; only `y` moves, and it
moves with the end of the prose. **Top-anchoring cannot fit both** — holding the
current `top-[36px]` against the last *list* would put comp 12's seal at ~1091
against the comp's 1271, 180px out.

So wrap the whole `sections.map(...)` in one `relative` container and place the
seal against **that container's bottom**, once, outside the map:

```tsx
<div className="relative">
  {body.sections.map(…)}
  {/* Bottom-anchored: the seal follows the end of the prose, not any one
      section's shape. Both comps put its bottom 74 (desktop) / 107 (tablet)
      above the closing rule, i.e. ~24 / ~55 above the last section's bottom
      edge once the Rule's own mt-12 is taken off. */}
  <Seal className="pointer-events-none absolute bottom-[55px] left-[76.8%] hidden w-[223px] sm:block lg:bottom-[24px] lg:w-[283px]" />
</div>
```

- `left-[76.8%]`, the widths, `pointer-events-none`, `hidden sm:block` and the
  spill past the card's right edge are **unchanged** — the seal is still drawn
  outside the card, so nothing in the chain may become `overflow-hidden`.
- The tablet offset being *larger* than the desktop one is what the comps draw
  (the seal is also smaller at tablet, so it is not a scale of one number).
  Record it, don't rationalise it.
- The `<div className="relative">` that currently wraps `Bullets` goes away with
  the seal; `Bullets` returns to being rendered directly.

**This moves `/job-listing/data-scientist`'s seal**, from top-anchored to
bottom-anchored. Comp 11 says it should land within a few px of where it does
today (`+841+1403` against the comp's `+839+1399`) — verify, and if it drifts
more than ~5px, report the number rather than adding a per-page override.

## 3. Checks

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. Screenshot the production build at 375 / 800 / 1280 per the AGENTS.md recipe
   (`playwright-core` out of the npx cache, `deviceScaleFactor: 1`,
   `fullPage: true`, **on a free port — check 3000 first**, `npx next start -p 3001`).
5. Measure against the comps and report as a table: card box, seal box, both
   Apply buttons, footer top, page height — for **`/job-listing/ux-designer` and
   `/job-listing/data-scientist` both**, since §2 touches the shared component.
6. Confirm `/careers`' UX Designer action is now an `<a href="/job-listing/ux-designer">`
   with the same class string the `<button>` had, and that `/`, `/journal`,
   `/article/[slug]` and `/design-system` are unchanged.

Expect the drifts already on file, and record rather than chase them: mobile runs
long from the 20px `--text-p1` / `--text-p2` floor; the Apply buttons measure 96
against the comp's 100 from the mono cut; "Back to Careers" measures 165 against
131–142.

## 4. Afterwards

Add a `## Job listing 2 — UX Designer` section to `AGENTS.md` under the existing
job-listing notes, covering the paragraph-shaped "Company benefits", the
bottom-anchored seal and its measurements, and the measured table. Then commit
to `main`.

**Flag to carry forward:** neither Apply button has a destination in this comp
either, so `/job-listing/ux-designer` inherits the same `#apply` link and inert
closing button `11-job-listing1` records. Both still want a real application URL
or `mailto:`.

**Note on working tree:** `app/about/`, `app/_components/about/`,
`public/assets/generated/about-founder.png` and edits to `chrome.tsx` and
`home/sections.tsx` are uncommitted at the time of writing. They are unrelated to
this prompt and must not be swept into its commit — commit only `jobs.ts`,
`job/sections.tsx` and `AGENTS.md`.

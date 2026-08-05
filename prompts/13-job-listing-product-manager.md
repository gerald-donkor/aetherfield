# 13 — Job listing 3: Product Manager

## Scope

Make `/job-listing/product-manager` a real page, so the **"View role" button on the
Product Manager card at `/careers`** (circled in the user's screenshot) stops being
an inert `<button>` and becomes a working link.

Comps: `public/assets/pages/13-job-listing3/screen-sizes/` (1280×2754 / 800×2736 /
375×3096).

**This is a pure data change.** The comp is the same page as `11-job-listing1` at
the same geometry — the sky shell, the single white card, the absolutely-positioned
top Apply button, the lede + rule, four `heading + body|items` sections, the seal
spilling past the card's right edge, and the centred closing CTA with its inert
Apply button. Verified against the comp:

- the top button reads **"Apply now"** and the closing button reads **"Apply now"** —
  both already the labels `app/_components/job/sections.tsx` hardcodes at lines 107
  and 150;
- the section headings are **Company description / About the role / Requirements /
  Company benefits**, in that order — the same four `JobBody.sections` shapes
  (two `body`, two `items`) the Data Scientist entry already has;
- the closing CTA reads **"Ready to help build the future of climate
  intelligence?"** — identical to the Data Scientist entry;
- the lede repeats the `/careers` card body verbatim, so `JobBody.lede` stays
  **omitted** and falls back to `Job.body`, exactly as `JobBody` was designed for.

So: **one `JOB_BODIES` key in `app/_content/jobs.ts`. No components touched, no new
utilities, no generated imagery, no `magick`.** Adding the key is what puts
`product-manager` in `WRITTEN_JOB_SLUGS`, which is what makes `JobList` render the
card's action as a `ButtonLink` instead of a `Button` and what puts the slug in
`generateStaticParams`.

`/job-listing/ux-designer` still **404s by design** until `12-job-listing2` is built.

## Copy

Transcribed from `13-job-listing3/screen-sizes/Desktop.png` at 200 %. **Straight
apostrophes**, per the convention the six articles and the Data Scientist entry
already ship — the comp draws curly ones; do not "fix" this.

Company description and Company benefits are **verbatim identical** to the Data
Scientist entry (the comp repeats them). About the role and Requirements are new.

```ts
"product-manager": {
  sections: [
    {
      heading: "Company description",
      body: "At Aetherfield, we build software that empowers companies to lead with climate accountability. Our platform helps sustainability and operations teams make sense of complex environmental data—transforming emissions, waste, and energy metrics into measurable, meaningful action. We're a mission-driven team of technologists, designers, and scientists working to accelerate the shift toward a low-carbon future.",
    },
    {
      heading: "About the role",
      body: "As a Product Manager at Aetherfield, you'll define and drive the roadmap for climate intelligence tools used by leading sustainability teams. You'll work closely with engineering, design, and customers to turn complex workflows into intuitive, impactful solutions. From shaping product strategy to refining launch details, your work will guide how enterprises operationalize their climate goals.",
    },
    {
      heading: "Requirements",
      items: [
        "5+ years of experience in product management for SaaS or data platforms",
        "Strong customer instincts with a track record of shipping thoughtful, user-centered products",
        "Ability to translate complex problems into clear product requirements",
        "Familiarity with sustainability, climate tech, or enterprise reporting systems is a plus",
        "Excellent collaboration and communication skills",
        "Drive to work on mission-aligned technology that moves the needle",
      ],
    },
    {
      heading: "Company benefits",
      items: [
        "Competitive salary and equity options",
        "Flexible, hybrid work environment",
        "Generous PTO and paid volunteer days",
        "Annual sustainability stipend",
        "Team offsites and climate-focused retreats",
        "A mission-first culture that values clarity, impact, and integrity",
      ],
    },
  ],
  cta: "Ready to help build the future of climate intelligence?",
},
```

Note the em dash in "data—transforming": it is drawn as an unspaced em dash in the
comp and ships that way in the Data Scientist entry. Keep the two byte-identical so
they cannot drift.

## Files

- `app/_content/jobs.ts` — add the key above to `JOB_BODIES`, after
  `"data-scientist"`. Update the `WRITTEN_JOB_SLUGS` comment, which currently says
  "the other two roles 404 by design until `12-job-listing2` and `13-job-listing3`
  are built" — it is now one role and one comp.

Nothing else. If the implementation wants to touch a component, stop and report why
instead — the comp says it should not need to.

## Verification

1. `npm run lint` and `npm run typecheck`, then `npm run build`. Confirm
   `/job-listing/product-manager` appears in the prerender list and
   `/job-listing/ux-designer` does not.
2. Screenshot the render at 375 / 800 / 1280 per AGENTS.md §3 — `playwright-core`
   out of the npx cache, `deviceScaleFactor: 1`, `fullPage: true`, against
   `npx next start -p 3001` (check port 3000 first; leave any dev server alone).
3. Diff the connected-components box list against each comp
   (`area-threshold` 25000 / 40000 / 15000) and record card box, seal, both Apply
   buttons and footer top in AGENTS.md, in the same table shape the Data Scientist
   section uses.
4. Confirm `/careers`' only diff is the Product Manager card's `<button>` becoming
   an `<a>` with the same class string, and that `/`, `/journal`,
   `/article/[slug]`, `/job-listing/data-scientist` and `/design-system` are
   byte-identical prerendered HTML.

**Expect the same inherited drifts, and record rather than chase them**: mobile runs
long on the fixed 20px `--text-p1` / `--text-p2` floor; the shipped Newsreader and
Archivo cuts wrap differently from the comps' cuts. Both are already on file for
`/careers` and job listing 1.

## AGENTS.md

Extend the existing **"Job listing page (`/job-listing/[slug]`)"** section — do not
open a new top-level one. It already says "Adding roles 2 and 3 is a pure data
change: one `JOB_BODIES` key each, no components touched"; add a short subsection
recording that role 3 shipped, what the measurements were, and that `ux-designer`
is the one slug still 404ing.

## Flag (carried forward, not introduced here)

**No comp gives either Apply button a destination.** The top one links to `#apply`;
the closing one is inert, as on `/careers`. Both still want a real application URL
or `mailto:` once one exists.

## Out of scope

`/job-listing/ux-designer` (comp `12-job-listing2`), and the uncommitted `/about`
work currently sitting in the working tree — leave both alone.

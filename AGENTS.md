# AGENTS.md

You are a **principal-level design engineer, full-stack engineer with several years of experience and AI implementation agent** working on **Aetherfield**.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes — where the detail lives

**This file is the index and the invariants. The build record is in `docs/`,
and it is not summarised here — read the file that covers what you are touching,
before you touch it.** Every number in those files is measured against a comp, a
recording or a production build; none of it is decoration, and a session that
skips the read will re-derive it by hand or silently break it.

| file | covers |
| --- | --- |
| `docs/chrome.md` | `SiteFooter` (settled — do not restyle), `SiteNav`'s frosted glass and its fitted blur/tint, the drawn "Get started" arrow, `NAV_ITEMS` |
| `docs/journal.md` | `/journal`, the scaling `JournalStamp`, `texture-journal.png`, the shared-component extensions made there |
| `docs/articles.md` | `ARTICLES` / `ARTICLE_BODIES`, `/article/[slug]`, all six articles and their generated heroes |
| `docs/careers.md` | `/careers`, `JobCard`, the dashed frame and its CSS march |
| `docs/job-listing.md` | `/job-listing/[slug]`, all three roles, the `Seal`'s tilt and its offsets |
| `docs/about.md` | `/about`, the half-width sky band, the Forecast card, `AetherfieldSeal`, `about-founder.png` |
| `docs/motion-homepage.md` | GSAP on `/` — `Reveal`, the emissions chart and its hover readout, the journal mark, the hero split, the Capabilities section |
| `docs/motion-site.md` | motion everywhere else — `/journal`, the card hovers, the footer's split blur-in, `/about`, `/careers`, the navbar drop-in, `/job-listing` |
| `docs/site-affordances.md` | the pointer cursor on buttons |
| `docs/automation.md` | **read before measuring anything** — comp geometry, crop fitting, `magick` recipes, screenshotting, reading reference recordings, build diffing, GSAP source traps, port and worktree gotchas |

# Invariants

These hold across the whole site. Each one is derived in the `docs/` file that
owns it; break one only with the user's explicit say-so.

**Settled surfaces.** `SiteFooter` is done — geometry, type, colours, texture band
and SVG wordmark. `SiteNav`'s `bg-white/10` over `backdrop-blur-[32px]` is fitted.
Ask before changing either.

**`sticky` only travels within its parent.** `SiteNav` renders *outside*
`Container` and carries its own gutters; page sky bands are document-level
`absolute inset-x-0 top-0 -z-10` siblings, and on `/careers` and
`/job-listing/[slug]` `main` is a **sibling** of the header pulled up under it.
Wrapping the header in anything that scrolls off unpins the bar.

**Two comp deviations are inherited and are never chased.** `--text-p1` /
`--text-p2` are a fixed 20px where the comps set ~17, so mobile runs long; the
shipped Archivo cut runs ~18 % wide, so headings and paragraphs wrap a line
early. `Container`'s 24px desktop gutter puts renders 4px right of the comps'
`+20`. Record, don't chase.

**Bundle rule.** Nothing outside `home/` may import `home/sections.tsx` or any
`home/` client module; `motion/` is the shared surface. Client leaves stay
**component-only** — export a constant or a type from one and GSAP lands in that
page's bundle. Sections stay server components by taking `children` as a prop.

**GSAP discipline.** `DUR` / `EASE` from `motion/register.ts`, never restated;
plugins registered once at module scope; `useGSAP(fn, { scope: ref })` with
`gsap.matchMedia()`, **every condition named** (a lone `reduce` query never
fires for anyone else), and `mm.revert()` as cleanup. No `markers: true` in
committed code.

- **`contextSafe` has no valid use in this codebase.** Every GSAP callback runs
  with its creating context active, so wrapping anything — inline in an
  `mm.add` handler or in an `onComplete` — makes two contexts reference each
  other and `revert()` blows the stack on unmount. It crashed the page twice.
- **No tween may `clearProps` `opacity` or `transform`.** The hidden start
  states live in `globals.css` under
  `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`;
  clearing hands the element back to them and it vanishes.
- **`fromTo`, never `from`, on any element that block hides** — `from` reads the
  element's current value as the tween's *end* value, so it animates 0 → 0.
- **GSAP consumes Tailwind v4's independent `translate` / `rotate` / `scale`.**
  It folds all three into one `transform` and sets them to `none`, so any tween
  on such an element must author the resting value explicitly — including `y: 0`
  alongside a `yPercent`.
- **Overflow.** Nothing in the ancestor chain of the `Seal`, the journal mark or
  the emissions chart's pill may become `overflow-hidden`; each deliberately
  spills its box.

**Reporting a render comparison.** **Never quote a bare page-wide
`magick compare -metric AE` for `/`, `/journal` or `/careers`** — the scrubbed
capabilities cloth, the stamp's perforation drift and the open-application
card's marching dashes sit at a different phase in any two shots. Mask the box,
report the remainder and the box separately.

**Measured or judged, and say which.** Where a recording cannot resolve a
number, record the observed floor as the measurement and the shipped value as a
judgement on it. Never write "0.5 was measured" for a value the fit could not
separate from 0.7.

**Content conventions.** Dates ship as **2026** even where a comp reads 2028.
Straight apostrophes and quotes throughout, never curly. Article prose is
transcribed from the desktop comp.
# Content and asset conventions

**Photography comes from `public/assets/images`.** Every image a page needs is
sourced from that folder and treated in-repo into `public/assets/generated` when
the comp shows a duotone, halftone or crop, with the exact `magick` command
recorded in that page's `docs/` file. Cropping artwork straight out of a comp is a fallback for when
the source photograph genuinely is not in that folder (as with
`article-climate-hero.png`), not the default.

**An article title referenced by its image or its comp is a slug.** When the
user points at an article by title or by pointing at a comp, its route is
`/article/<slugified title>` — lowercased, apostrophes and punctuation dropped,
spaces and colons to hyphens, e.g. "Sustainability Isn't a Side Project: Making
Impact Operational" → `sustainability-isnt-a-side-project-making-impact-operational`.
Do not invent a shorter slug; match the entry already in `ARTICLES` when one
exists.

# 1. Workflow

For every implementation request:

1. Read `AGENTS.md` and follow its instructions as the highest priority project guidance. `AGENTS.md` is the source of truth for implementation decisions. User requests may override these rules only when the user explicitly requests a deviation, explains why, and the relevant rule is intentionally changed.
2. Read the skills explicitly mentioned by the user.
2b. Read the `docs/` file that covers what the request touches, per the index above — plus `docs/automation.md` if any measurement, screenshot or build comparison is involved. The build record lives there, not here; working from this file alone means working without the measurements.
3. Inspect only the code, files, and dependencies relevant to the request. Do not inspect, modify, or reason about unrelated parts of the repository unless they directly affect the approved implementation.
4. Ask a focused question only if the task has meaningful ambiguity. Do not ask questions when reasonable assumptions can be made without affecting the implementation outcome.
5. Create a detailed prompt file in `prompts/` per the contract in section 4.
6. Ask: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. On approval, re-read the approved prompt file in `prompts/` and implement it strictly. Implement only after user approval. Entering `y` or `Y` = `Approved. Execute.`  
8. Run available checks (section 2). Then finally, record all that was implemented in the `docs/` file that owns the area — a new one, added to the index above, if the work does not belong to an existing one. Only invariants that hold site-wide, and the index row itself, go in this file.
9. Share exact steps to test or run the completed feature.
10. Commit the resulting change to `main`, unprompted. Every executed prompt ends in a commit—never leave implemented work uncommitted. Do not push unless asked.

Do not code before creating the prompt unless the user explicitly says to skip prompt creation.

**Why step 10 matters.** Resolving what is already built (below, and on any resume) reads the files on disk and `git log`, never the prompt files. Work left uncommitted makes that resolution wrong and invites a duplicate prompt for a feature that already exists.

**Resuming in a new session.** Entering `I` or `i` = `Work out what comes next and write its prompt file.` It runs steps 1–6 of this workflow and stops at the approval question. It never implements anything—`i` writes the prompt, `y` executes it.

Resolving what "next" means, in a session with no prior context:

1. **The number** is the highest existing prompt number in `prompts/` plus one. Never renumber, never overwrite, never reuse a number (section 4).
2. **The scope** is the next unbuilt item from section 1's build list, ordered by what unblocks the most downstream work. The spec's four-phase roadmap (section 7 of the spec) is the narrative for why that order exists; use it as context, not as a checklist to walk mechanically.
3. **Establish what is already built from the repository**—the files on disk and `git log`—not from the existing prompt files. A committed prompt file is evidence that a prompt was written, never that it was executed. Writing a prompt for work that already exists is the main failure mode here.
4. **Name the chosen scope and say why it is next in the first line of the reply**, before writing the file, so a wrong call is visible immediately.
5. If two candidates are genuinely equally unblocking, write neither yet—name both, state the trade-off, and ask.

Then finish with step 6's question as written.

# 2. Commands and checks

Scripts that currently exist in `package.json`:

- `npm run dev` — start the Next.js dev server (Turbopack); watch its terminal for job and pipeline logs
- `npm run build` — Next.js production build
- `npm run start` — run the production build locally after `npm run build`
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`

Report the exact command output; never claim a check passed without running it.

# 3. Automation

**Moved to `docs/automation.md` — read it before measuring, screenshotting,
cropping, fitting a recording or diffing two builds.** It is the accumulated
list of steps already worked out by hand, so a session starts from the command
rather than the investigation.

**Standing instruction:** each session, watch for steps repeated by hand and add
the mechanical ones to `docs/automation.md`, so later sessions start from the
command rather than the investigation.

# 4. Prompt files

Every implementation request gets a file in `prompts/`, written before any code
(section 1, step 5) and re-read verbatim at execution time (step 7).

**Numbering.** `NN-<kebab-case-scope>.md`, where `NN` is the highest existing
number in `prompts/` plus one. Never renumber, never overwrite, never reuse a
number — the sequence is the project's build history and a gap or a reused
number makes "what is already built" unresolvable in a later session.

**A prompt file must state**, in whatever order the work makes natural:

- the scope, and why it is next;
- the reference material read for it — comps, screenshots, recordings, source
  files — by path;
- the measurements the implementation must hit, or the measurement procedure
  that will produce them, never eyeballed numbers;
- the expected impact, including which routes' prerendered HTML must stay
  identical;
- non-goals — what is deliberately out of scope, and why;
- the checks to run (section 2), and which `docs/` file the result must be
  recorded in afterwards.

**`## SKILLS USED`** — required, in every prompt file. List every skill the
implementation should invoke, by its exact name from the skill listing, with one
line each saying what it is for. Include skills already loaded while writing the
prompt as well as ones only the implementation will need. Write `None` if the
work genuinely needs no skill, rather than omitting the section.

**Why it is required.** The prompt file is the whole brief on execution — after
a `/clear`, an approving `y` is answered by re-reading the file and nothing
else. A skill that was loaded while writing the prompt is not loaded when the
prompt runs, so an unlisted skill is a skill the implementation will silently
work without. Naming them in the file is what makes the run reproducible.

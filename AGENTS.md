# AGENTS.md

You are a **principal-level design engineer, full-stack engineer with several years of experience and AI implementation agent** working on **Aetherfield**.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes

## The footer is fixed

`SiteFooter` in `app/_components/chrome.tsx` is **settled — do not restyle it.**
It matches the comps at all three breakpoints and is committed. Treat it as
done when building new pages: import and render it, don't fork or adjust it.

This covers the whole footer block — the yellow `--color-brand` field, the
olive `--color-brand-ink` text, the halftone fabric band
(`/assets/generated/texture-brand.png`), and the oversized SVG wordmark. The
wordmark is drawn as SVG `<text>` with `textLength` on purpose, so it fills the
block width exactly at any viewport; a viewport-unit font size clips it.

If a design genuinely calls for a different footer, ask first rather than
editing this one.

## Journal index (`/journal`)

`app/journal/page.tsx` with its sections in `app/_components/journal/sections.tsx`.
Reuses `SiteNav`, `Container`, `CtaBand` and `SiteFooter` as-is.

**The masthead stamp is one scaling SVG.** `JournalStamp` draws the whole stamp
interior — perforations, hand-drawn frame, lozenge and all six pieces of type —
on a single `viewBox="0 0 1240 480"`, inside a wrapper holding that exact ratio.
That is why the three comps agree: nothing is sized per breakpoint. Hand-sizing
type here means you have drifted from the comp. Measured off `Desktop.png`:
26 perforations at pitch 1240/25, r 15, centred on the corners; frame inset
20 across / 30 down at stroke 3; lozenge at stroke **6** (twice the frame) with
tips at x 160 / 1080 and apexes at y 62 / 415, rounded left and right tips only.

**`texture-journal.png`** is the stamp's fabric — the same draped cloth as the
footer band, duotoned blue and halftone-screened:

```
magick "public/assets/images/Footer image.png" \
  -colorspace Gray -resize x743 -gravity center -extent 1920x743 \
  -sigmoidal-contrast 8,50% \
  -ordered-dither h4x4a \
  +level-colors '#63AAF6','#9DCCFF' \
  public/assets/generated/texture-journal.png
```

The sigmoidal contrast is load-bearing: without it the dither lands near 50 %
everywhere and the folds disappear into a flat crosshatch. Verified against the
comp at `Desktop.png -crop 130x380+55+100` — mean `#8AC3FE`, tones `#9CCCFF` /
`#6AAEF7`.

**Shared-component extensions made here** (both additive, `/` unchanged):
`ArticleCardStacked` takes optional `src`/`alt` (falling back to `Placeholder`),
`href` (which makes the whole card one link), `priority` and `className`; the
`max-w-[612px]` cap moved out of the component so it fills a grid column.
`CtaBand` takes an optional `action` label defaulting to `"Request a demo"`.

**Known deviation:** the comps set card titles and descriptions around 16px on
mobile, but `--text-p1` / `--text-p2` are a fixed 20px in the design system and
`/` ships that way. The journal page follows the system, so mobile titles and
descriptions wrap one line more than the comp. Changing it is a type-scale
decision that would also move the settled homepage — raise it before doing so.

# 1. Workflow

For every implementation request:

1. Read `AGENTS.md` and follow its instructions as the highest priority project guidance. `AGENTS.md` is the source of truth for implementation decisions. User requests may override these rules only when the user explicitly requests a deviation, explains why, and the relevant rule is intentionally changed.
2. Read the skills explicitly mentioned by the user.
3. Inspect only the code, files, and dependencies relevant to the request. Do not inspect, modify, or reason about unrelated parts of the repository unless they directly affect the approved implementation.
4. Ask a focused question only if the task has meaningful ambiguity. Do not ask questions when reasonable assumptions can be made without affecting the implementation outcome.
5. Create a detailed prompt file in `prompts/` per the contract in section 4.
6. Ask: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. On approval, re-read the approved prompt file in `prompts/` and implement it strictly. Implement only after user approval. Entering `y` or `Y` = `Approved. Execute.`
8. Run available checks (section 2).
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

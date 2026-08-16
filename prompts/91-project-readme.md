# 91 — The project README

## Scope, and why it is next

Write the repository's `README.md`: the front door for a person who lands on
the GitHub page and has read none of `AGENTS.md`, none of `docs/`, and none of
`prompts/`.

`README.md` today is the untouched `create-next-app` boilerplate — verified by
reading it: 37 lines, "bootstrapped with `create-next-app`", a `yarn dev` /
`pnpm dev` / `bun dev` block, and a "Deploy on Vercel" footer. Every sentence in
it is either wrong for this repository or irrelevant to it. That is the entire
justification for this prompt: the repository's most-read file currently
describes a different project.

This is **not** a build step. §5.2's sequence is a backend dependency graph and
the README is not on it; this is documentation work requested directly by the
user, and it adds no code, no route, no dependency and no environment variable.

## The user's brief

- Write the GitHub README and "document everything there".
- Use best-practice README structure, researched from the web.
- Use the two installed skills: `create-readme` and
  `readme-blueprint-generator`.

### How the two skills are reconciled

They disagree, and the disagreement is resolved here rather than at execution
time.

- **`create-readme`** — the governing skill. Its constraints are adopted whole:
  a header with the project's logo if one exists, GFM throughout, GitHub
  admonition syntax (`> [!NOTE]`, `> [!WARNING]`) where it earns its place,
  emoji used sparingly or not at all, and **no `LICENSE`, `CONTRIBUTING` or
  `CHANGELOG` sections** — those get their own files.
- **`readme-blueprint-generator`** — its *section list* is used as a checklist;
  its *sources are absent*. It instructs a scan of `.github/copilot/*` and
  `.github/copilot-instructions.md`. **Neither exists** — verified:
  `ls -R .github` returns nothing at all. The equivalent material in this
  repository is `AGENTS.md` and `docs/`, and those are the sources the section
  list is filled from. This substitution is a deliberate deviation from that
  skill, and the implementation states it rather than silently pretending the
  scan happened (§12 rule 9).
- Where they conflict, `create-readme` wins: the blueprint's **License** and
  **Contributing** sections are **dropped**, because the governing skill
  forbids them and neither `LICENSE` nor `CONTRIBUTING.md` exists in the
  repository to link to (verified with `ls -A1` at the root).

### Web research, done while writing this prompt

`https://www.skills.sh/` was fetched and searched: it hosts no README-authoring
skill, so it contributes nothing and is not cited in the README. A web search
for current README practice returned consistent guidance across several 2026
write-ups, and these four points are what the implementation must honour:

1. **Inverted pyramid** — what the project is, then how to run it, then depth.
   The first screen must be scannable in about thirty seconds.
2. **A quick start inside the first screen**, three steps at most, every step a
   copy-pasteable command.
3. **Badges are functional, not decorative** — four or so that answer a real
   question, never a badge wall.
4. **Contributor-specific material moves out of the README.** Here that is
   already true: `AGENTS.md` is the contributor contract and the README links
   to it rather than restating it.

## Reference material read for this prompt

Read while writing this file, and to be re-read at execution as noted:

- `README.md` — the boilerplate being replaced.
- `AGENTS.md` — §5 (what Aetherfield is, and the four-verb loop), §5.2 (the
  fourteen build steps), §6 (code layers and hard boundaries), §7 (the stack,
  the chosen providers, the traps), §8 (standing rules), §9 (the data model),
  §10 (the write path), §11 (roles), §2 (the commands).
- `package.json` — the authoritative script list and dependency versions.
- `.env.example` — the authoritative environment-variable list.
- `docs/backend.md` — its `##` headings, which are the build record's own map
  of what shipped. **Re-read at execution**, at least the headings, to keep the
  feature list honest.
- `docs/` — the twelve files and the index table at the top of `AGENTS.md`.
- The repository tree: `app/` routes (`find app -name page.tsx`), `lib/`
  subdirectories, `lib/domain/`'s pure modules and their colocated `.test.ts`
  files.

## What the README must say, and where each fact comes from

Facts are **read from the repository at execution time**, never recalled from
this prompt file. Everything below is the shape; the values are re-verified.

### Header

Project name, a one-line description, and a short paragraph. Aetherfield is a
**B2B sustainability-intelligence platform** — the description comes from §5
and from the site's own copy, not from invention. The product is the four-verb
loop: **Track, Model, Report, Act**.

### The logo

`create-readme` asks for a logo in the header if one exists. **There is no logo
file** — verified: `public/` holds only `assets/` and `design-ref/`, and
`app/favicon.ico` is the create-next-app default. The wordmark is inline SVG
inside `app/_components/chrome.tsx` (the `viewBox="0 0 1000 165"` path, whose
comment records that 165 units is exactly cap height).

**Do this:** extract that path verbatim into `docs/assets/wordmark.svg` — the
same `viewBox`, the same path data, copied, not redrawn — and reference it from
the README header with an `<img>` tag at a modest width. GitHub does not render
inline `<svg>` in Markdown, so a file is required. Pick a fill that reads on
both GitHub themes and say in `docs/` that the fill is a README-only choice.
**Do not** crop a logo out of a comp in `public/assets/pages/`, and do not
generate one.

If the path data cannot be extracted cleanly, **ship the README with no logo**
and say so — a wrong wordmark is worse than none.

### Badges

Four, functional only, and **only ones that are true**:

- Next.js version — `16.2.12`, from `package.json`.
- React version — `19.2.4`, from `package.json`.
- TypeScript.
- Postgres / Neon.

> Do **not** add a build-status badge, a coverage badge, an npm badge or a
> license badge. There is no CI workflow in this repository (`ls -R .github`
> is empty), the package is `"private": true`, and there is no `LICENSE` file.
> A badge pointing at a service that is not wired up is a fabricated claim
> (§12 rule 7).

### Quick start — the first screen

Three steps, copy-pasteable, in this order:

```
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Followed immediately by an admonition that the app needs a real Neon database
and that `npm run db:migrate` must run before anything authenticated works.
The exact commands come from `package.json` — quote them, do not paraphrase.

### The sections, in order

1. **What it is** — §5's thesis, briefly. Scattered emissions/energy/waste data
   across procurement, sensors, vendor spreadsheets; reporting that ends up
   manual, retrospective and annual; the four-verb loop as the answer.
2. **Features** — split honestly into the **public marketing site** (seven
   routes, prerendered, content as typed constants in `app/_content/`) and the
   **authenticated platform** (organisations, activity-data import, factor
   matching, the calculation engine, targets and forecasting, the dashboard,
   ESG report generation, scheduled recalculation and alerts). Derived from the
   `##` headings of `docs/backend.md` and the route list — **not** from §5.2,
   which is a plan and says nothing about what exists (§12 rule 5).
3. **Tech stack** — a table: Next.js 16.2 App Router / React 19.2 / TypeScript
   / Tailwind CSS 4 (config-less, `@theme` in `app/globals.css`) / Drizzle over
   `pg` against Neon Postgres / Better Auth / Resend + React Email / Upstash
   Redis rate limiting / Vercel Blob / Vercel BotID / Zod / GSAP + Motion /
   Vitest + Playwright. Versions from `package.json`, and **only** versions
   from `package.json`.
4. **Architecture** — §6.1's layers and §6.3's directory map, plus the two
   rules a newcomer will otherwise break: Server Actions are the only mutation
   path for the app's own forms, and Route Handlers are for external callers
   only. Include §10's write-path diagram, or a faithful compression of it.
5. **Project structure** — an annotated tree of `app/`, `lib/`, `docs/`,
   `prompts/`, `e2e/`, `motion/`, `public/`, `scripts/`. One line per entry.
6. **Getting started, in full** — prerequisites (Node, a Neon database, the
   Vercel CLI for `vercel env pull`), the environment table, and the migration
   and seed workflow.
7. **Environment variables** — every name in `.env.example`, one line each on
   what it is for and which provider sets it. **Names only, never a value**
   (§8.4). Note that phase one uses no `NEXT_PUBLIC_*` at all.
8. **Commands** — the `package.json` scripts as a table, each with one line.
   Include the WebKit/Podman note for `test:e2e:webkit`.
9. **Testing** — Vitest scoped to `lib/domain/` and *why* it is scoped there
   (the pure engine whose output lands in disclosures), plus Playwright across
   Chromium, Firefox and WebKit.
10. **Deployment** — Vercel, Fluid Compute, the Node.js runtime, and the
    standing "not `runtime = edge`" decision from §7.1.
11. **Documentation map** — the `docs/` index table, reproduced with links, and
    a pointer to `AGENTS.md` as the contributor contract and to `prompts/` as
    the build history.

### Two things the README must state plainly

- **The AI rule.** §5.3: an LLM never produces a number that appears in a
  disclosure. All arithmetic is deterministic in `lib/domain/`; a model may
  select a factor, it never multiplies by one. This belongs in the README
  because it is the product's central integrity claim, and a reader evaluating
  the project will want it before anything else about AI.
- **Personal data.** §8.3, briefly: CVs are private blob storage behind
  short-lived signed URLs, newsletter signup is double opt-in, request bodies
  and email addresses are never logged.

### Tone

§5's register — evidence-first, "clarity and confidence", never campaigning and
never startup-cheerful. Concise, per `create-readme`. No emoji, or at most one
in the header. Target the 800–1,500 word band the research names; go over only
if the documentation map and the environment table push it there.

## The anti-fabrication constraint on this prompt specifically

A README is the single easiest file in this repository to fill with
plausible-sounding invention, and §12 applies to it in full. At execution:

- **Every path named in the README is opened first** (§12 rule 1). A route, a
  directory, a script, a doc file that does not exist must not appear.
- **Every version number is read from `package.json`** (§12 rule 7). None is
  recalled.
- **Every environment variable name is read from `.env.example`** (§12 rule 6).
- **What is built is resolved from the repository and `git log`**, never from
  §5.2 and never from `prompts/` (§12 rule 5). If a phase-two step's route
  exists on disk, it is a feature; if it does not, it is not mentioned — not
  even as "planned".
- **No badge, link or claim pointing at something not wired up**: no CI, no
  coverage, no licence, no published demo URL, no npm package.
- If the README ends up wanting a fact that cannot be verified, **leave it out
  and say so in the reply**, rather than writing a confident guess.

## Expected impact

- `README.md` replaced in full.
- `docs/assets/wordmark.svg` added (new directory), if the extraction succeeds.
- `docs/skills.md` gains a short note recording that `create-readme` and
  `readme-blueprint-generator` are installed, where they came from, and the
  `.github/copilot` substitution above — that file owns the skills record.
- One index row added to `AGENTS.md`'s table **only if** a new `docs/` file is
  created. The expectation is that no new `docs/` file is needed and
  **`AGENTS.md` is not edited at all**, which is the front matter's cap rule
  working as intended.

### Prerender impact

**none — no route changes.** The change touches `README.md`, `docs/`, and
nothing under `app/` or `lib/`. To be *verified*, not assumed: `npm run build`
must produce the same route table, with `/  /journal  /about  /careers
/design-system` still `○ Static` and `/article/[slug]` (6) and
`/job-listing/[slug]` (3) still `●  SSG`.

### Trust boundary

**none.** No request path is added, changed or documented into existence. The
README describes the write path in §10's terms; it does not create one.

### Secrets and data

The README **names** every variable in `.env.example` and **prints no value**
(§8.4). No `NEXT_PUBLIC_*` is introduced. `docs/assets/wordmark.svg` is vector
path data from a committed source file and carries no personal data. No
personal data is stored, logged or transmitted by this change.

## Non-goals

- **No `LICENSE`, `CONTRIBUTING.md` or `CHANGELOG.md`** — `create-readme`
  excludes those sections, and inventing a licence for someone else's project
  is not a call this prompt gets to make. If the user wants one, it is a
  separate request.
- **No CI workflow, and no badge implying one.**
- **No code change of any kind.** No route, no component, no dependency, no
  script, no environment variable.
- **No screenshot or demo GIF.** The research recommends a hero image;
  producing one means running the app and capturing `/`, which is real work
  under `docs/automation.md` and is out of scope here. The wordmark stands in.
  Say so in the reply so the user can ask for it as a follow-up.
- **No rewrite of `AGENTS.md` or any `docs/` file** beyond the `docs/skills.md`
  note named above.
- **No restatement of `AGENTS.md`'s rules in the README.** The README links to
  it. Two documents stating the same rule is how one of them goes stale.

## Checks to run

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build` — and confirm the route table is unchanged, per **Prerender
   impact** above.

`npm test` and `npm run test:e2e` are **not** required: no source file is
touched. Say so in the reply rather than skipping silently. Quote the exact
output of every check that is run (§2, §12 rule 3).

Link-check every relative link in the finished README by resolving it against
the filesystem — a broken `docs/` link is the most likely defect in this change.

## Where the result is recorded

`docs/skills.md`, per the expected impact above: the two README skills, their
origin, the `.github/copilot` substitution, and the wordmark extraction. **Not
in `AGENTS.md`** — this work adds no invariant and no new `docs/` file.

## SKILLS USED

- **`create-readme`** — the governing README skill. Its structure, tone,
  GFM/admonition and no-LICENSE/CONTRIBUTING constraints are the brief.
- **`readme-blueprint-generator`** — its section checklist, with `AGENTS.md`
  and `docs/` substituted for the absent `.github/copilot` sources.
- **`nextjs`** — to describe the App Router architecture, Server Actions,
  Route Handlers and the render modes correctly for 16.2 rather than from
  training data.
- **`tailwind-4-docs`** — to state the config-less v4 setup accurately
  (`@theme` in `app/globals.css`, no `tailwind.config.js`).
- **`drizzle-docs`** — for the migration workflow the getting-started section
  documents (`db:generate`, `db:migrate`, `db:studio`).
- **`neon-postgres`** — for the pooled/direct connection split, which the
  environment-variable section must get right.
- **`better-auth-best-practices`** — to describe the auth setup and its mount
  point accurately.
- **`vercel:vercel-functions`** — for the deployment section: Fluid Compute,
  the Node.js runtime, and why not Edge.

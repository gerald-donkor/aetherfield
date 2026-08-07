# AGENTS.md

You are a **principal-level design engineer, full-stack engineer with several years of experience and AI implementation agent** working on **Aetherfield**.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

The same rule binds the rest of the stack. **Tailwind CSS 4** is config-less —
tokens live in `@theme` in `app/globals.css` and there is no
`tailwind.config.js`. **Cache Components / `use cache`** is not the
`unstable_cache` of training data; load `vercel:next-cache-components` before
touching revalidation. The database, email and auth SDKs are **not chosen yet**
(section 7) — read the installed package once one exists. If an API cannot be
verified from `node_modules/`, a skill, or live docs, say so instead of guessing.

**Sections 5–8 are the backend contract** — product and build list,
architecture, stack, standing rules. Read them before writing any server code.
Everything above them is the *site* contract and still applies in full: the
backend is being added to a finished, measured, byte-stable marketing site, and
nothing in sections 5–8 licenses breaking it.

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

**This file is capped, and the cap is on the build record — not on the
contract.** It holds the index, these invariants, the workflow, the commands,
the prompt-file contract, and sections 5–8 (product, architecture, stack,
standing rules). It does **not** grow with the build: a finished prompt adds at
most one index row here, and everything it measured or built goes in `docs/`. An
invariant earns its place here only if a session could break it *without*
opening the `docs/` file that owns it, and a new one replaces or subsumes an
existing line rather than stacking on it.

Sections 5–8 are the exception to the growth rule, because they are what a
session needs *before* it opens any `docs/` file — but the same discipline
applies inside them: they carry decisions and boundaries, never the record of
what was built against those decisions. A schema, a measured latency, a
migration, an endpoint's field list belongs in `docs/backend.md`. If the front
matter above section 5 passes ~250 lines, something in it belongs in `docs/`.

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
8. Run available checks (section 2). Then finally, record all that was implemented in the `docs/` file that owns the area — a new one, added to the index above, if the work does not belong to an existing one. **Never in this file**: the only things a finished prompt may add here are one index row, and a site-wide invariant that meets the cap rule above.
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

**Backend prompts carry three extra headings** (section 8 explains each):

- **Prerender impact** — name every route whose prerendered HTML or render mode
  changes, and why. `none — no route changes` is the expected answer for a
  prompt that only adds `app/api/*`, and it must be *verified*, not assumed.
- **Trust boundary** — what crosses from the browser to the server, where it is
  validated, what authorises it, and what a rejected request returns. If the
  task has no request path, write `none` and say why.
- **Secrets and data** — which environment variables the change reads, which are
  `NEXT_PUBLIC_*` and therefore public, and what personal data the change
  stores, logs or transmits.

---

# 5. Product — what Aetherfield is, and what the backend adds

Keep the client in context on every task. **Aetherfield is a B2B
sustainability-intelligence platform.** Its thesis is stated in the site's own
copy and should not be re-derived: emissions, energy and waste data live
scattered across procurement systems, building sensors, vendor spreadsheets and
departmental silos, inside stacks built to optimise for sales and cost rather
than carbon. So sustainability reporting becomes manual, retrospective and
error-prone — an annual ESG document instead of an operational input. The
product's answer is the four-verb loop in `home/capabilities.tsx`:

**Track** emissions, energy and waste across the value chain · **Model**
performance and goal alignment · **Report** ESG disclosures and automate
frameworks · **Act** on surfaced insights and operational next steps.

`home/dashboard.tsx` is the product mockup that makes that concrete, and it is
the closest thing to a specification the phase-two work has: a tenant sees a
tCO₂e total, MWh consumption with a period-over-period delta, a forecast card
("You're 16% off your 2027 emissions goal"), and a monthly emissions trend.
**Treat it as intent, not as a comp** — it is a marketing illustration, and its
numbers are traced from a design file.

**Register is measured and operational.** The site's voice is
evidence-first — "clarity and confidence", "progress over perfection". Server
copy, error messages and emails match it. Never campaigning, never
startup-cheerful, never alarmist about climate.

## What is already built

A complete, static marketing site: seven routes, all prerendered, content
hand-authored as typed constants in `app/_content/`, and thirty-six prompts of
comp-matched design engineering behind it. **There is no backend of any
kind** — no `app/api`, no database, no auth, no environment variables, no server
actions. Every call to action is deliberately inert (`chrome.tsx` "Get started",
`journal/page.tsx` "Sign up to newsletter", `job/sections.tsx` "Apply now",
`home/hero.tsx` "Request a demo").

## Build only

**Phase one — the marketing backend.** Makes the shipped site's dead CTAs real,
and lays the database, auth and email foundations phase two runs on.

- data layer and schema — leads, subscribers, applications
- demo-request capture — the hero, the nav's "Get started", and the `CtaBand`
- newsletter signup with double opt-in — `/journal`'s subscribe band
- job applications with CV upload — `/job-listing/[slug]` and the
  open-application card on `/careers`
- transactional email — submitter confirmations and internal notifications
- spam and abuse protection on every public write path
- staff authentication and roles
- an authenticated submissions view — leads, subscribers, applications

**Phase two — the platform.** The authenticated product the hero mocks up.

- organisations and multi-tenancy
- activity-data ingestion — CSV import, then connectors
- emission factors and the calculation engine — scopes 1, 2 and 3
- targets, goal tracking and forecasting
- the dashboard routes, behind auth
- ESG report generation and export
- scheduled recalculation and threshold alerts

**Do not overbuild.** In particular: no second design system, no separate
backend service or framework, no admin panel beyond the submissions view, no
public API, no billing, no AI features, and no marketing-automation platform.

**Phases are narrative, not structure.** They explain why the list is ordered as
it is and roughly when value lands. Every rule in this file applies on every
task regardless of phase. Actual sequencing happens through the numbered files
in `prompts/`, and "what is next" is resolved from the repository per section 1.

---

# 6. Backend architecture

## 6.1 Code layers

- **UI** — routes, Server Components, client components, forms. Renders data and
  calls Server Actions.
- **Server Actions** — the only mutation path for this app's own forms.
  Validation, authorisation, orchestration. Colocated with the routes that use
  them.
- **Route Handlers** — thin, and for *external* callers only: webhooks, upload
  callbacks, cron endpoints, health checks. No business logic.
- **Data** — the query layer. Nothing else in the codebase talks to the
  database, and no SQL is written outside it.
- **Email** — template rendering and send. Server-only.
- **Storage** — blob upload and signed access, for CVs and, later, imported
  data files.
- **Auth** — session, role and organisation resolution. One module; every
  authorisation decision reads from it.
- **Domain** (phase two) — emission-factor lookup, scope calculation,
  forecasting. Pure functions over typed inputs, no I/O.

## 6.2 Hard boundaries

- **Server Actions are the only mutation path for the app's own forms.** The UI
  does not mutate through Route Handlers. Route Handlers exist for callers that
  are not this application.
- **Only Server Components fetch initial page data.** No client-side
  data-fetching library on primary read paths.
- Database queries, email sends, blob writes and secret reads never run in
  browser code.
- The UI never constructs a query. It calls the data layer or an action.
- **Every mutation authorises server-side, inside the action.** Hiding a control
  in the UI is presentation and never enforcement.
- **Every mutation validates its input server-side with a schema**, even when
  the same schema ran in the browser. Client validation is a courtesy to the
  user; it is not a check.
- Phase two's domain layer stays pure and independently testable — no
  database handle, no `fetch`, no `Date.now()` passed implicitly.

## 6.3 Where the code goes

```
app/
  api/<external-caller>/route.ts   webhooks, callbacks, cron — thin
  <route>/actions.ts               Server Actions, colocated
lib/
  db/      schema, client, queries        server-only
  email/   templates and send             server-only
  storage/ blob upload and signed reads   server-only
  auth/    session, roles, org resolution server-only
  domain/  phase two, pure                no I/O
```

`lib/` is new and does not exist yet. Every module under it that touches a
secret carries `import "server-only"` at the top — the import exists to make a
mistaken client import a **build** error rather than a leaked key at runtime.

---

# 7. Tech stack

## 7.1 Settled

- **Next.js 16.2** — App Router, Turbopack, React 19.2. Server Actions and Route
  Handlers; **no separate backend service.**
- **TypeScript** throughout.
- **Tailwind CSS 4** — config-less, `@theme` in `app/globals.css`.
- **Zod** — one schema per input, shared between the client form and the Server
  Action so the rules exist once.
- **Vercel Blob** — CV and document upload. Native to the platform, not a
  Marketplace integration, and private by default.
- **Vercel BotID** — bot protection on public write paths.
- **Vercel** — hosting. Fluid Compute (the default), Node.js runtime.

**Not `runtime = "edge"`.** Fluid Compute runs in the same regions at the same
price with full Node.js, streaming and SSE included. Edge is a downgrade here.

## 7.2 Unresolved — and the procedure that resolves them

**Three providers are deliberately not named yet.** Naming one from memory is
the failure mode this section exists to prevent, and hardcoding a vendor SDK is
forbidden (section 8).

| need | resolved by | status |
| --- | --- | --- |
| database | the **`vercel:vercel-storage`** skill | **pending** |
| transactional email | **`vercel:marketplace`**, category `messaging` | **pending** |
| authentication | the **`vercel:auth`** skill | **pending** |

The procedure, in order, and it is not optional:

1. The Vercel CLI must be installed — `npm i -g vercel` — and the project
   linked. Without it, steps 2–4 cannot run.
2. Load the skill named above for that need. Storage, auth and AI have
   **dedicated skills** and do not go through the Marketplace catalog;
   everything else does.
3. For a Marketplace need: `vercel integration categories`, then
   `vercel integration discover --category <slug>`. Both are read-only and need
   no auth. Take the top relevant result unless the user names another provider.
4. Provision it for real — `vercel integration add <name> --yes --no-claim`,
   then `vercel env pull --yes`. If the provider hands off to a browser or
   dashboard step, **stop and ask the user to finish it**, then continue.
5. Build against the real environment variables. Record the choice and the
   reasoning in `docs/backend.md`, and replace that row above with the decision.

**A mock is not a resolution.** A `.env.example` with sample data behind it is
not an installed integration, and scaffolding a stand-in "to wire up later" is
throwaway work — the integration provides the backend, and it is not
provider-agnostic. Provision first, then build.

## 7.3 Do not use

- a separate backend framework or service, or a separate API server
- `runtime = "edge"` (see 7.1)
- a hand-wired provider SDK installed with `npm install` instead of provisioned
  through the resolution procedure above
- an ORM, query builder or raw SQL outside `lib/db/`
- a client-side data-fetching library on primary read paths
- local JSON or filesystem storage for application data
- a second design system, or a component library that is not the existing
  primitives in `app/_components/`
- GSAP for anything in the backend UI — `motion/` is the shared surface and its
  discipline (front matter) is unchanged
- `localStorage` or a cookie for anything an authorisation decision reads

---

# 8. Standing backend rules

These apply to every backend task, in every phase, permanently.

## 8.1 The static site is not collateral

The marketing site is finished, measured and byte-stable, and thirty-six prompts
of comp-fitting sit behind it. **ARTICLES and JOBS stay as typed constants in
`app/_content/`** — that decision is made, and the routes stay prerendered:

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

- **Adding `app/api/*` changes no route's HTML.** A backend prompt that alters a
  prerendered page's markup or render mode has exceeded its scope unless the
  prompt said so up front and the user approved it.
- A form is a **client leaf** taking `children`, exactly as `Reveal`,
  `NavDrop` and `FooterMotion` do — it takes the settled element over and adds
  no box. The bundle rule in the front matter applies unchanged: client leaves
  stay component-only.
- The verification is the existing one — `npm run build`, confirm the route
  table above, then diff the prerendered HTML per `docs/automation.md`, with the
  standing warning about `/`, `/journal` and `/careers` still in force.

## 8.2 Every public write path is hostile input

1. Validate server-side with the shared Zod schema. Reject with a typed,
   handled result — never a thrown string, never a swallowed error.
2. Rate-limit it, and protect it with BotID. Every one of these endpoints is an
   unauthenticated `POST` on a public marketing site.
3. Uploads are constrained by **type and size, checked server-side**, and stored
   privately. A CV is personal data, not a public asset.
4. An honest failure is a visible state. **Never a silent success** — a form
   that appears to submit while the write failed is worse than an error.
5. Success and failure are both accessible: the result is announced, focus is
   managed, and the state is legible without colour alone.

## 8.3 Personal data

The three phase-one flows collect real personal data — names, work emails,
employers, CVs. It is the users' data and mishandling it is not recoverable.

1. Collect only what the flow needs. No speculative fields.
2. **Never log a request body, an email address, or a CV's contents** — not to
   the console, not to an error report, not to analytics.
3. Newsletter signup is **double opt-in**, and every marketing email carries a
   working one-click unsubscribe.
4. A CV is private-by-default blob storage read through short-lived signed URLs.
   Never a public URL, never a guessable path.
5. Retention is finite and stated. Do not build a permanent archive by default.

## 8.4 Secrets

- Only `NEXT_PUBLIC_*` reaches browser code. Everything else is server-only, and
  every module reading one imports `server-only`.
- The canonical list lives in `.env.example`, which is committed. **Real values
  never are** — they come from `vercel env pull`.
- Never echo a secret's value. `vercel env ls` shows names only, and that is the
  only listing to quote.

## 8.5 Recording the result

Backend work is recorded in **`docs/backend.md`** — created by the first backend
prompt and added to the index at the top of this file in that same change. The
schema, every endpoint and its fields, the provider decisions and their
reasoning, the environment variables and the measured behaviour all live there.
**Never in this file** (see the cap rule in the front matter): sections 5–8 hold
decisions and boundaries; `docs/backend.md` holds what was built against them.

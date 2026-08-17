# Skills

The agent skills installed for this repository, where each came from, and why
the ones that were left out were left out. `AGENTS.md` §12 rule 2 requires an
API to be verified in `node_modules/`, a loaded skill, or live docs before it is
written; this file is the record of what "a loaded skill" currently covers.

Added at prompt 39 (7 Aug 2026), which installed nine first-party skills and
authored two. Extended at prompt 40, which initialized Tailwind's local docs,
installed seven first-party Vercel skills, and audited the remaining coverage.

---

## How skills are installed here

The mechanism is the **`skills` CLI** (`skills` on npm, `vercel-labs/skills`,
v1.5.22 at the time of writing). It writes a real directory into
`.agents/skills/<name>` and symlinks it into `.claude/skills/<name>` — which is
why both directories exist and why the second is nothing but links.

```bash
npx -y skills@latest add <owner>/<repo> -s <skill> -s <skill> -y   # install
npx -y skills@latest add <owner>/<repo> -l                          # list what a repo offers
npx -y skills@latest list                                           # what is installed
```

**`-s` does not accept a comma-separated list.** `-s a,b,c` fails with "No
matching skills found" even when every name is correct; the flag must be
repeated. This cost one run and is the sort of thing the CLI's own `--help`
does not say.

Install **project-level** (the default), never `--global`. The skill set is part
of this repository's contract and has to survive a clone.

`skills-lock.json` at the repository root is maintained by the CLI and records
each skill's source repo, its path inside that repo, and a content hash. It is
committed. `npx skills update` refreshes against it — see the warning at the
bottom of this file before running it.

## The ownership test

A skill is installed only when the GitHub **owner is the vendor** — `resend/…`,
`upstash/…`, `better-auth/…`, `neondatabase/…`. Install counts on skills.sh are
not the test: the top Drizzle result there is community-authored with 4,357
installs, and under §12 that is not a resolution. Where no first-party pack
exists, the answer is an authored snapshot of the vendor's own docs (below),
not a stranger's `SKILL.md`.

Ownership was checked against `https://api.github.com/repos/<owner>/<repo>` and,
for Better Auth, against its own documentation page at
`https://better-auth.com/llms.txt/docs/ai-resources/skills.md`, which names
`better-auth/skills` as the official pack.

## What is installed

### First-party, added at prompt 39

| skill | source | serves |
| --- | --- | --- |
| `better-auth-best-practices` | `better-auth/skills` | build step 6 — server and client config, database adapters, sessions, plugins, env vars |
| `better-auth-security-best-practices` | `better-auth/skills` | step 6 — rate limiting, secrets, CSRF, trusted origins, cookie and session hardening |
| `email-and-password-best-practices` | `better-auth/skills` | step 6 — verification, password reset, password policy, hashing |
| `organization-best-practices` | `better-auth/skills` | phase-two step 8 — organizations, membership, custom roles, RBAC |
| `resend` | `resend/resend-skills` | step 3 — the Resend API, SDK setup, idempotency keys, webhook verification |
| `react-email` | `resend/resend-skills` | step 3 — building the templates themselves |
| `email-best-practices` | `resend/resend-skills` | steps 3 and 4 — SPF/DKIM/DMARC, deliverability, transactional vs marketing, CAN-SPAM/GDPR, accessibility |
| `upstash-redis-js` | `upstash/skills` | step 2 — the `@upstash/redis` SDK |
| `upstash-ratelimit-js` | `upstash/skills` | step 2 — `@upstash/ratelimit`, its algorithms and traffic protection |

### First-party, already present

| skill | source | serves |
| --- | --- | --- |
| `neon` | `neondatabase/agent-skills` | the Neon platform overview |
| `neon-postgres` | `neondatabase/agent-skills` | connections, pooling, branching, scale-to-zero |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | React and Next.js patterns on Vercel |
| `gsap-*` (8) | `greensock/gsap-skills` | the site's motion work |
| `tailwind-4-docs` | `Lombiq/Tailwind-Agent-Skills` | Tailwind v4 — **community-authored**, predates the ownership test above, kept because it is a docs snapshot rather than advice. **Initialized at prompt 40**; see below |
| `design-handoff` | `anthropics/knowledge-work-plugins` | comp work |
| `motion` | local, `.claude/skills/motion` only | the Motion library |

### Authored here, because no first-party skill exists

No `drizzle-team/*` and no `colinhacks/*` skills repository exists. Both of
these follow the `tailwind-4-docs` pattern — `SKILL.md` + `scripts/sync_*.py` +
`references/docs-source.txt` — and both carry, alongside the vendor's docs,
this project's own decisions that the general docs contradict.

| skill | source feed | pages | snapshot committed? |
| --- | --- | --- | --- |
| `drizzle-docs` | `https://orm.drizzle.team/llms-full.txt` | 484 | **no** — ~4.5 MB, gitignored |
| `zod-docs` | `https://zod.dev/llms-full.txt` | 16 | **yes** — ~292 KB, works on a fresh clone |

Neither vendor serves per-page markdown — `orm.drizzle.team/docs/overview.md`
and `zod.dev/api.md` both return 404 — so splitting the concatenated feed is the
only route to a file-per-topic snapshot. Do not "fix" either script to fetch
individual pages.

```bash
python .agents/skills/drizzle-docs/scripts/sync_drizzle_docs.py   # required once per clone
python .agents/skills/zod-docs/scripts/sync_zod_docs.py           # only to refresh
```

Each writes `references/docs/`, `references/docs-index.md` and a
`references/docs-source.txt` stanza carrying the source URL, the page count and
the snapshot date.

### Splitting the feeds, and the bug that was in the first version

**Prompt 39 shipped both splitters with a defective fence tracker, and prompt 40
found and fixed it. The counts it recorded — 240 Drizzle pages and 13 Zod pages
— were both wrong.** The record is kept here rather than quietly overwritten,
because the failure is instructive and the naive version looks correct.

The original split was on top-level `#` headings, skipping any found inside a
fenced code block, with the fence state flipped by a boolean on every ``` seen.
That toggle desynchronises permanently at the first malformed fence — and the
Drizzle feed has one, an orphan bare ``` at feed line 1101 whose apparent closer
is a ```` ```ts ````. Everything after it, roughly 119,000 lines, was tracked
inverted. The damage was not a crash but a plausible-looking snapshot:

- 10 pages invented out of `#` shell comments inside `bash` blocks;
- 82+ real pages merged into their predecessors — **one file silently held 81
  pages**;
- `Drizzle <> Neon Postgres`, the single most relevant page to this stack,
  missing altogether.

The fixes differ per feed, because the feeds differ:

- **Drizzle now splits on the feed's own `Source: <url>` stamps**, not on
  headings. There are 484 of them, they are immune to fences entirely, and each
  carries the page's canonical URL. That URL is also what disambiguates titles:
  `drizzle-kit generate` exists six times, once per dialect, and the slug is now
  `293-pg-drizzle-kit-generate.md` rather than a bare title collision. **This
  project is Postgres — take the `pg-` file.** The old split routed
  `drizzle-kit generate` to the CockroachDB page.
- **Zod has no such stamps**, so it keeps a heading split with a **CommonMark**
  fence tracker: a fence closes only on the same character, at least as long as
  the opener, with nothing after it. That recovers `Versioning` and `Zod Core`,
  which the toggle had buried inside the migration guide.

**442 is not a page count.** It is the number of `#` lines in the Drizzle feed,
and prompt 39 misreported the difference between it and 240 as evidence the
fence tracking worked.

Seven Drizzle pages still end with an unclosed fence (`*-perf-queries.md`).
That is upstream MDX indenting a fence four spaces inside a component, not a bad
split — their content is complete, and it does not affect page boundaries now
that the split no longer depends on fences.

## Tailwind's local documentation snapshot

Prompt 40 initialized `tailwind-4-docs` with the license-gated sync its own
`SKILL.md` requires. The successful script is silent; success must be checked
from the three generated artefacts rather than inferred from terminal output:

- `references/docs-source.txt` pins the upstream commit, its date, and a
  `Snapshot-Date`. **It carries no `Status:` line** — this file claimed one until
  17 Aug 2026, describing a format the script does not write, so do not go
  looking for it. Re-synced that day from `6393f18` (28 Jul 2026) to
  `bd868a314bd05ca78acd047e3da289274dd6ccd7` (11 Aug 2026);
- `references/docs/` contains **236 files / 5.0 MB**, unchanged across that
  re-sync. Count them with `find … -type f`: a bare `ls | wc -l` sees only the
  199 top-level entries and under-reports by whatever the three subdirectories
  hold;
- `references/docs-index.tsx` exists and is 12 KB.

**The skill treats a snapshot older than one week as stale** and asks before
answering from it. That is a real gate, not a formality — but it is also not an
automatic blocker: prompt 114 proceeded on a 10-day-old snapshot because it
introduced no utility and was verified by byte-identical prerendered output, and
said so. Re-sync when the answer depends on what the docs say; record the
judgement when it does not.

The snapshot is deliberately **not committed**. `tailwindcss.com` is
source-available, not open-source, and the sync requires the user to accept its
docs license. The generated docs and index are therefore gitignored rather than
redistributed. They are also excluded from ESLint: they are upstream-generated
source, and linting them made the repository check fail on upstream style rules.
On a fresh clone, initialize them once with:

```bash
python .agents/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py --accept-docs-license
```

The script prints nothing when it succeeds. Verify the three artefacts above,
especially the `Status: Initialized` line, before relying on the skill.

## What was deliberately not installed

Each exclusion is a decision, not an oversight.

| skipped | from | why |
| --- | --- | --- |
| `neon-drizzle`, `neon-serverless` | `neondatabase/ai-rules` | **the important one.** `neon-serverless` installs `@neondatabase/serverless`, which §7.3 rejects for this project in favour of `pg`; `neon-drizzle` provisions credentials and generates a schema over the top of the one build step 1 already committed. Both are correct for a generic Neon project and wrong for this one. |
| `create-auth`, `create-auth-skill` | `better-auth/skills` | scaffolders. §7.2 already fixes the adapter (Drizzle), the mount (`app/api/auth/[...all]/route.ts`) and the fact that we own the sign-in screens; a scaffolder fights all three. |
| `two-factor-authentication-best-practices` | `better-auth/skills` | 2FA is not in §5.2. Install it with the step that adds it, if one ever does. |
| `agent-email-inbox`, `resend-cli` | `resend/resend-skills` | inbound email processing and terminal operation. Phase one sends four transactional emails and receives none. |
| QStash, Vector, Search, Workflow, `upstash-redis-start` | `upstash/skills` | not in the stack. `upstash-redis-start` provisions an unclaimed throwaway database, which §7.4 forbids. |
| every Drizzle and Zod result on skills.sh | community | fails the ownership test above. |

## Vercel — seven skills, now in the repository

Prompt 39 recorded that Vercel's skills came only from a user-level plugin and
so would not survive a clone. Prompt 40 fixed that.

**The upstream is `github.com/vercel/vercel-plugin`** — first-party Vercel,
Apache-2.0 — named in the official marketplace's own entry for the plugin. The
`skills` CLI installs from it directly with `--full-depth`, which finds 40
skills. That is a tracked install with `skills-lock.json` provenance; **no file
was hand-copied out of `~/.claude/plugins/cache/`**, and none should be.

**`vercel-labs/agent-skills` is not the source and does not have these.** It
offers nine skills and none of the five `AGENTS.md` cites. Recorded so the dead
end is not walked twice.

Seven were installed, chosen rather than swept:

After installation, `npx -y skills@latest list` reports **32 project-visible
skills**: 31 directories under `.agents/skills/` plus the existing local
`.claude/skills/motion` skill.

| skill | why this one |
| --- | --- |
| `nextjs` | the framework. **296K / 43 files — the only heavy one**, with a 124K `references/` tree |
| `vercel-storage` | §7.4's storage resolution; Blob at step 5 |
| `vercel-firewall` | platform-layer security — **not BotID, see below** |
| `marketplace` | §7.4 provisioning |
| `next-cache-components` | named in the front matter, before touching revalidation |
| `env-vars` | §8.4's whole subject |
| `vercel-functions` | §7.1's Fluid Compute decision; `attachDatabasePool` |

Excluded from the other 33: `ai-sdk` and `ai-gateway` (step 9 only, §5.3
forbids scaffolding before it), `shadcn` and `next-forge` (a second design
system, which §7.5 rejects), and `eve`, `microfrontends`, `vercel-sandbox`,
`chat-sdk`, `workflow` and the `benchmark-*` / `release` / `plugin-audit`
internals.

**The user-level plugin stays installed** — it also supplies commands, hooks and
MCP surfaces the skills alone do not. So each of the seven is now listed twice,
as `nextjs` and as `vercel:nextjs`. Skills match lazily on their descriptions,
so this costs listing space rather than loaded context. It is expected, not a
bug.

One further collision to know about: upstream also ships
`vercel-react-best-practices`, and a skill of that exact name is already
installed from `vercel-labs/agent-skills`. It was not in the seven, so nothing
clashed — but a future sweep from `vercel/vercel-plugin` would hit it.

### Traps inside these skills

These are installed *and* partly wrong for this project. Same class as the
`neon-serverless` exclusion above, except now in-repo.

- **`vercel-functions` and `vercel-storage` recommend
  `@neondatabase/serverless`** — the driver §7.3 rejects in favour of `pg`.
  `vercel-storage` names it 18+ times; `vercel-functions` line 481 prescribes it
  for connection pooling and never mentions `attachDatabasePool`. The
  `skipIfFileContains` guards mostly spare `lib/db/client.ts`, but the narrative
  guidance is unguarded. **`neon-postgres` is the skill that gets this right**,
  and it agrees with §7.2.
- **`nextjs` chains to the `auth` skill's Clerk recommendation**, which §7.2
  overrides. Its trigger regex is `next-auth|@auth/core|NextAuth\(|getServerSession\(`,
  so it will not fire on Better Auth code — but it is a second source of
  pressure toward Clerk, and §7.2 says not to silently revert.
- ~~`nextjs`'s `proxy.ts` guidance chains to `routing-middleware`, which is not
  installed.~~ **Resolved** — `routing-middleware` was installed on the user's
  say-so once step 6 actually shipped `proxy.ts`. See below.
- **`nextjs`'s internal links are broken upstream** — the body links
  `./file-conventions.md` etc., but every file lives in `references/`. Vercel's
  bug, present in their `upstream/SKILL.md` too. Look in `references/`.

### It does not replace `node_modules/next/dist/docs/`

The `nextjs` skill is a **linter and router**: a short index plus ~280 lines of
`validate` and `chainTo` regex rules. It is genuinely Next 16-aware — it encodes
the `middleware()` → `proxy()` rename, async `cookies()` / `headers()` /
`params` / `searchParams`, the single-arg `revalidateTag` deprecation and the
`cacheHandler` → `cacheHandlers` change as machine-checkable rules.

But the reference is the **425-file, 3.8 MB tree in
`node_modules/next/dist/docs/`**, shipped version-exact with `next@16.2.12`,
which carries `01-app/01-getting-started/16-proxy.md` and
`01-app/03-api-reference/03-file-conventions/proxy.md` by name. The front
matter's instruction to read it **stands unchanged**. Installing the skill is
not licence to skip the docs.

## Coverage audit after prompt 40

The settled stack is covered, but "covered" does not always mean one dedicated
skill per package. The exact package shipped in `node_modules/` remains the
stronger source where a broad provider skill is thin or misleading.

| surface | result | source to use |
| --- | --- | --- |
| `pg` and `@vercel/functions` | **covered; no standalone skill warranted.** `neon-postgres` gives this project's correct `pg` + Fluid Compute pairing and names `attachDatabasePool`. The newly installed `vercel-functions` skill does not document that API and recommends the rejected HTTP driver for pooling. | Read `neon-postgres`, then verify the exact API in `node_modules/@vercel/functions/docs/index/functions/attachDatabasePool.md` and the installed `pg` types. |
| React 19.2 | **covered at the useful level.** `vercel-react-best-practices` covers React/Next.js performance patterns; framework behavior is also constrained by `nextjs` and the version-exact Next docs. A generic React skill would duplicate those sources. | Use `vercel-react-best-practices`, then installed package types/docs for version-specific APIs. |
| TypeScript | **correctly has no dedicated skill.** It is the language layer, not a provider integration, and the compiler plus installed declarations are the authoritative check. | Run `npm run typecheck`; verify APIs in the package declarations. |
| Next.js 16.2 | **covered alongside, not superseded by, the Vercel skill.** The skill catches known breaking patterns, while the repository rule still requires the 425-file, 3.8 MB docs tree shipped with `next@16.2.12`. | Read the relevant file in `node_modules/next/dist/docs/` before writing code. |
| `@vercel/blob` | **covered well enough for step 5.** `vercel-storage` documents server and client uploads, `put`, `del`, `list`, and `get`, while its unrelated Neon advice must be ignored. | Load `vercel-storage`, then verify against the installed package when step 5 adds it. |
| BotID | **still uncovered.** `vercel-firewall` contains no BotID guidance; it covers WAF rules, IP blocking, Attack Mode, and the firewall CLI. Calling that BotID coverage was a factual error in prompt 39 and is corrected here. | At build step 2, use first-party live docs or the installed BotID package surface. Do not infer the application-layer SDK from `vercel-firewall`. |

The audit raised one candidate — `routing-middleware`, because `nextjs` chains
to it for `proxy.ts`. It was deferred as a step 6 decision at the time, and
installed once step 6 shipped `proxy.ts` for real.

## The eighth Vercel skill — `routing-middleware`

Installed after prompt 40, from the same `vercel/vercel-plugin` upstream and
tracked in `skills-lock.json` like the other seven. 16K, a single `SKILL.md`.

It closes the dead-end chain and carries three things the `nextjs` skill only
gestures at:

- **The rename and its reason.** `middleware.ts` → `proxy.ts` in Next 16, the
  exported function renamed `middleware` → `proxy`, motivated partly by
  CVE-2025-29927 (middleware auth bypass via the `x-middleware-subrequest`
  header). `middleware.ts` is still accepted in 16 but deprecated and warned
  about.
- **The codemod**: `npx @next/codemod@latest middleware-to-proxy`.
- **Next 16 proxy is Node.js runtime only**, unlike framework-agnostic Vercel
  Routing Middleware, which also runs on Edge and Bun.

### Read its "NOT for auth" line correctly

The skill's comparison table describes Next 16 Proxy as *"Network-boundary proxy
needing full Node APIs. NOT for auth."* **That is a warning against
*enforcement* in the proxy, and this repository already obeys it.** `proxy.ts`
does call `getSessionCookie`, but only to redirect optimistically, with a
comment saying so; `/account` performs the authoritative database-backed check.
That is exactly what §7.3's `getSessionCookie()` trap and §11.2 rule 1
prescribe.

So the shipped `proxy.ts` is correct as written. **Do not read "NOT for auth" as
licence to delete a working optimistic redirect** — and do not read it as
permission to move the real check into the proxy either.

Its `config.matcher` is `["/account"]` — a positive match, which is what §8.1
requires ("skip the marketing routes rather than match all and exclude"), and
which the skill's own guidance agrees is preferred because unmatched paths skip
invocation entirely.

## Prompt 40 verification

Run on 7 Aug 2026 after all four streams were merged:

- `npx -y skills@latest list` — passed; 32 project-visible skills, including all
  seven new entries sourced from `vercel/vercel-plugin`.
- Snapshot integrity — Drizzle index: 484 rows / 0 missing files; Zod index: 16
  rows / 0 missing files. All seven Vercel `.claude/skills/` links resolve.
- `git check-ignore -v` — the generated Tailwind docs and index resolve to
  `.gitignore` lines 63–64; Drizzle's generated docs and index resolve to lines
  53–54. Zod's 16-page snapshot is committed instead.
- `npm run lint` — passed with no ESLint findings.
- `npm run typecheck` — passed with no TypeScript diagnostics.
- `npm run build` — Next.js 16.2.12 compiled successfully in 8.3 s, finished
  TypeScript in 2.3 s, and generated 17 static pages. The route table is
  unchanged: `/`, `/about`, `/careers`, `/design-system`, and `/journal` are
  static; `/article/[slug]` still emits six SSG paths and
  `/job-listing/[slug]` still emits three.

## The two README skills, prompt 91

Installed for prompt 91, which replaced the untouched `create-next-app`
`README.md` with the project's own. Both come from **`github/awesome-copilot`**
— GitHub's own repository, so the ownership test above is satisfied, though
note that neither vendor here is a vendor of anything *in this stack*: these are
authoring skills, not API references, and nothing in §12 rule 2 rests on them.

| skill | source | serves |
| --- | --- | --- |
| `create-readme` | `github/awesome-copilot` | the governing README skill — structure, tone, GFM, GitHub admonition syntax, sparing emoji, and no LICENSE / CONTRIBUTING / CHANGELOG sections |
| `readme-blueprint-generator` | `github/awesome-copilot` | a section checklist: name and description, technology stack, architecture, getting started, project structure, key features, workflow, standards, testing |

**They disagree, and `create-readme` wins.** The blueprint's **License** and
**Contributing** sections were dropped: the governing skill forbids them, and
neither `LICENSE` nor `CONTRIBUTING.md` exists in this repository to link to
(`ls -A1` at the root, prompt 91).

### The `.github/copilot` substitution

`readme-blueprint-generator` instructs a scan of `.github/copilot/*` and
`.github/copilot-instructions.md` and treats those files as the source of every
fact it emits. **Neither exists here** — `.github` is absent from the repository
root entirely. The equivalent material is `AGENTS.md` and `docs/`, and those are
what the section list was filled from.

This is a deliberate deviation from that skill rather than a silent one
(§12 rule 9). A later session running the same skill will hit the same absent
directory; the answer is the same substitution, not an invented scan.

### The logo: the fallback was taken

`create-readme` asks for the project's logo in the header, and prompt 91
budgeted for extracting the footer wordmark into `docs/assets/wordmark.svg`,
copied verbatim.

**It was not extracted, and the README ships with no logo.** The prompt assumed
path data; there is none. The wordmark in `app/_components/chrome.tsx` is an
SVG **`<text>`** element — `viewBox="0 0 1000 165"`, `fontSize="222"`,
`textLength="1013"` from `x="-1.6"`, `fill="currentColor"`, and
`fontFamily: var(--font-sans)`. Its shape therefore depends on Archivo, which
arrives through `next/font/google` in `app/layout.tsx`; there is no font file in
the repository, and no `.svg` file anywhere in `public/` or `app/` (verified
with `find`). Copied into a standalone file, that markup renders in whatever
fallback face the viewer's browser picks, and GitHub loads no webfont for it.

Converting the text to outlines would mean fetching the font and running a
tracer — that is redrawing, not copying, and prompt 91's own instruction is
explicit: *"If the path data cannot be extracted cleanly, ship the README with
no logo and say so — a wrong wordmark is worse than none."* That branch was
taken. `docs/assets/` was not created.

A real logo asset is a separate piece of work. So is the hero screenshot the
README research recommends, which prompt 91 also placed out of scope.

## Before running `npx skills update`

It updates every skill in `skills-lock.json`, including the eight GSAP skills
and `tailwind-4-docs`, which sit underneath 36 prompts of fitted motion and
comp-matched design work. Update named skills, not all of them, and read the
diff. This is the same reason prompt 39 installed new skills without touching
the existing ones.

# 39 — Agent skills for the stack

## Scope, and why it is next

Install the agent skills that cover the technologies §7 settles on, so that every
later backend prompt executes against **verified provider surfaces** rather than
recalled ones. This is tooling, not a build step: it sits outside §5.2's
sequence and blocks nothing, but §12 rule 2 ("never write an API you have not
verified in `node_modules/`, a loaded skill, or live docs") is materially easier
to obey once the skills for Better Auth, Resend, Upstash and Drizzle are on
disk. Step 2 (demo-request capture) needs Upstash and Zod; step 3 needs Resend;
step 6 needs Better Auth. All three currently have **no skill installed at all**.

The request is the user's, not a derived next step, and it is deliberately
non-invasive: it adds skill files and documentation, and touches no application
code.

## Reference material read for this prompt

Read this session, by path or URL:

- `.agents/skills/` — the 13 skills already vendored, and `.claude/skills/`'s
  symlinks into them: the install layout this prompt must match
- `.agents/skills/tailwind-4-docs/SKILL.md`,
  `.agents/skills/tailwind-4-docs/references/docs-source.txt` — the
  authored-snapshot pattern for a technology with no first-party skill
- `.agents/skills/neon/SKILL.md`, `.agents/skills/neon-postgres/SKILL.md` — the
  first-party install pattern, and the `npx skills add` command they document
- `/home/gdk26/.claude/plugins/installed_plugins.json` and the `skills/`
  directory of `claude-plugins-official/vercel/0.45.1` — the 30 Vercel skills
  already available, which this prompt must not duplicate
- `package.json` — the dependencies actually installed
- `https://better-auth.com/llms.txt/docs/ai-resources/skills.md` — Better Auth's
  own page naming `better-auth/skills` as its official skill pack
- `https://skills.sh/api/search?q=…` — the registry the `skills` CLI queries,
  used to establish first-party ownership for each candidate
- `https://orm.drizzle.team/llms.txt`, `https://orm.drizzle.team/llms-full.txt`,
  `https://zod.dev/llms.txt`, `https://zod.dev/llms-full.txt` — the official doc
  feeds the two authored skills sync from

## What was established, and what it decides

**The install mechanism is the `skills` CLI** (`skills` on npm, v1.5.22,
`vercel-labs/skills`). It writes a real directory into `.agents/skills/<name>`
and symlinks it into `.claude/skills/<name>` — exactly the layout already on
disk, so the existing 13 skills were installed this way and the new ones must
be too. Install **project-level** (the default), never `--global`: the skill set
is part of this repository's contract and has to survive a clone.

**Four of the six needs have a first-party skill.** Ownership was checked
against the GitHub org, not against install counts:

| need | repo | owner is the vendor |
| --- | --- | --- |
| Better Auth | `better-auth/skills` | yes — named on better-auth.com's own AI-resources page |
| Resend + React Email | `resend/resend-skills` | yes |
| Upstash Redis + Ratelimit | `upstash/skills` | yes |
| Neon / Lakebase Postgres | `neondatabase/agent-skills` | **already installed** — no action |

**Two have none.** No `drizzle-team/*` and no `colinhacks/*` skill repository
exists; every Drizzle and Zod result in the registry is community-authored.
Under §12 those are not a resolution, so this prompt **authors** two
snapshot-backed skills from the vendors' own `llms.txt` feeds instead.

**Vercel's own surfaces are already covered and must not be duplicated.** The
`vercel@claude-plugins-official` plugin supplies 30 skills including `nextjs`,
`vercel-storage`, `vercel-functions`, `vercel-firewall` (BotID),
`next-cache-components`, `env-vars`, `marketplace` and `auth`. Nothing in this
prompt re-installs any of them.

## The work

### A. Install the four first-party packs

Run from the repository root, project scope, non-interactive:

```bash
npx -y skills@latest add better-auth/skills --skill better-auth-best-practices,better-auth-security-best-practices,email-and-password-best-practices,organization-best-practices -y
npx -y skills@latest add resend/resend-skills --skill resend,react-email,email-best-practices -y
npx -y skills@latest add upstash/skills --skill upstash-redis-js,upstash-ratelimit-js -y
```

**The skill lists are exact** — each was read back from
`npx skills add <repo> -l` this session, not guessed (§12 rule 6). Verify each
name again at execution time from `-l` before installing; if a name has moved,
report it rather than substituting a near-match.

**Deliberately excluded, each for a stated reason:**

- `better-auth/skills` → `create-auth` and `create-auth-skill` — scaffolding
  skills that generate an auth setup. §7.2 already fixes the adapter (Drizzle),
  the mount (`app/api/auth/[...all]/route.ts`) and the fact that **we own the
  sign-in screens**; a scaffolder would fight all three.
- `resend/resend-skills` → `agent-email-inbox` and `resend-cli` — inbound email
  processing and terminal operation. Phase one sends four transactional emails
  and receives none.
- `upstash/skills` → QStash, Vector, Search, Workflow, `upstash-redis-start`.
  Not in the stack; `upstash-redis-start` provisions an unclaimed throwaway
  database, which §7.4 forbids.
- `neondatabase/ai-rules` → `neon-drizzle` and `neon-serverless`. **This is the
  one worth stating loudly:** `neon-serverless` installs
  `@neondatabase/serverless`, which §7.3 explicitly rejects for this project in
  favour of `pg`, and `neon-drizzle` provisions credentials and generates a
  schema over the top of the one build step 1 already committed. Both are
  correct advice for a generic Neon project and wrong for this one.

### B. Author `drizzle-docs`

`.agents/skills/drizzle-docs/`, following the `tailwind-4-docs` pattern:

- `SKILL.md` — frontmatter `name` / `description` matching the house format
  (see the existing skills; `description` states the triggers). Body routes the
  reader to the right reference file and carries the project's own Drizzle
  constraints, sourced from `AGENTS.md` and `docs/backend.md`, not invented:
  Drizzle owns schema and migrations exclusively (§9), `drizzle-kit` gets
  `DATABASE_URL_UNPOOLED` and the app never does (§7.3), and any script
  reaching the database is written `dotenv -e .env.local -- …` (§2).
- `scripts/sync_drizzle_docs.py` — downloads
  `https://orm.drizzle.team/llms-full.txt`, splits it on its top-level headings
  into `references/docs/*.md`, and writes `references/docs-index.md`. Drizzle
  serves **no per-page `.md`** (verified: `…/docs/overview.md` returns 404), so
  splitting the full feed is the only route.
- `references/docs-source.txt` — the `Status: / Source: / Snapshot-Date:`
  stanza, mirroring `tailwind-4-docs`'s.
- The downloaded snapshot is **not committed** (~3.5 MB) — same call
  `tailwind-4-docs` makes. Add the ignore rule alongside the skill.

### C. Author `zod-docs`

Same shape, from `https://zod.dev/llms-full.txt`. It is ~260 KB / 8,587 lines,
small enough that the sync script may commit the split output rather than
ignoring it — **make that call at execution time and state which was done**.
The SKILL.md body carries §6.2's rule that one schema is shared between the
client leaf and the Server Action, and §10's rule that the client copy is a
courtesy and the server copy is the check.

### D. Record it

New `docs/skills.md`, added as one row to the index table in `AGENTS.md` — that
row and nothing else is the permitted `AGENTS.md` change (front-matter cap
rule). It records: every skill now installed and where it came from, the
first-party-ownership test used to choose it, the exclusions above **with their
reasons**, the fact that the Vercel plugin covers Next.js/Blob/BotID/storage,
the `npx skills add`/`update` commands, and how to re-run the two sync scripts.

## Measurements

There is nothing geometric to measure. The verifiable facts this prompt must
report back, each read from a command rather than asserted:

1. `npx skills list` — the full skill inventory after install.
2. `ls -la .claude/skills/` — every new entry is a symlink into `.agents/skills/`.
3. `git status --short` — the new files are tracked, and the ignored snapshot is
   not.
4. The exact skill names installed, quoted from the CLI's own output.

## Expected impact

**Prerender impact: none — no route changes.** This prompt adds no file under
`app/`, `lib/` or `motion/`, and changes no dependency in `package.json`. All
nine prerendered routes' HTML is untouched by construction. `npm run build` is
still run to confirm the route table is unchanged.

**Trust boundary: none.** Nothing here adds a request path, an action or a
handler.

**Secrets and data: none.** No environment variable is read, added or renamed;
no personal data is touched. The sync scripts fetch public documentation over
HTTPS and write only inside the skill directory.

## Non-goals

- **No application code.** Not a schema change, not a `lib/` module, not a form.
  Installing a Better Auth skill is not build step 6.
- **No dependency installs.** `better-auth`, `resend`, `@upstash/redis`,
  `@upstash/ratelimit` and `zod` are installed by the build steps that need
  them, against real provisioned environment variables (§7.4). A skill is
  documentation; it is not a resolution.
- **No provisioning.** Upstash and Resend are decisions on record only (§7.2);
  this prompt does not run `vercel integration add`, which is billable and
  needs the user's say-so.
- **No community skills.** Where no first-party pack exists, the answer is an
  authored snapshot of the vendor's own docs, not a stranger's SKILL.md.
- **No duplication of the Vercel plugin's 30 skills.**
- **No `AGENTS.md` growth** beyond the single index row.
- **No changes to the 13 skills already installed**, and no `skills update` run
  across them — that would move GSAP and Tailwind guidance underneath 36 prompts
  of fitted work, in a prompt that is not about them.

## Checks to run

- `npx skills list` — quote the output
- `npm run lint`
- `npm run typecheck`
- `npm run build` — confirm the route table matches §8.1's, verbatim
- `git status --short`

Record the result in **`docs/skills.md`** (new), and add its one row to the
index table in `AGENTS.md`.

## SKILLS USED

- **`skills` CLI (`npx skills`)** — not an agent skill, but the mechanism the
  whole prompt runs on; `add`, `list` and `-l`.
- **`neon` / `neon-postgres`** (installed) — read for the house SKILL.md
  frontmatter format and the install command they document.
- **`tailwind-4-docs`** (installed) — read as the template for an authored
  snapshot skill: `SKILL.md` + `scripts/sync_*.py` + `references/docs-source.txt`
  with the snapshot itself uncommitted.
- **`vercel:marketplace`** — load only if provisioning comes up. It should not:
  §7.4 provisioning is explicitly a non-goal here, and this line exists so a
  later session sees the boundary was deliberate.

None of the newly installed skills are invoked by this prompt — it installs
them; the build steps that need them load them.

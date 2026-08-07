# Skills

The agent skills installed for this repository, where each came from, and why
the ones that were left out were left out. `AGENTS.md` §12 rule 2 requires an
API to be verified in `node_modules/`, a loaded skill, or live docs before it is
written; this file is the record of what "a loaded skill" currently covers.

Added at prompt 39 (7 Aug 2026), which installed nine first-party skills and
authored two.

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
| `tailwind-4-docs` | `Lombiq/Tailwind-Agent-Skills` | Tailwind v4 — **community-authored**, predates the ownership test above, kept because it is a docs snapshot rather than advice |
| `design-handoff` | `anthropics/knowledge-work-plugins` | comp work |
| `motion` | local, `.claude/skills/motion` only | the Motion library |

### Authored here, because no first-party skill exists

No `drizzle-team/*` and no `colinhacks/*` skills repository exists. Both of
these follow the `tailwind-4-docs` pattern — `SKILL.md` + `scripts/sync_*.py` +
`references/docs-source.txt` — and both carry, alongside the vendor's docs,
this project's own decisions that the general docs contradict.

| skill | source feed | pages | snapshot committed? |
| --- | --- | --- | --- |
| `drizzle-docs` | `https://orm.drizzle.team/llms-full.txt` | 240 | **no** — ~4 MB, gitignored |
| `zod-docs` | `https://zod.dev/llms-full.txt` | 13 | **yes** — ~288 KB, works on a fresh clone |

Neither vendor serves per-page markdown — `orm.drizzle.team/docs/overview.md`
and `zod.dev/api.md` both return 404 — so splitting the concatenated feed is the
only route to a file-per-topic snapshot. Do not "fix" either script to fetch
individual pages.

Both scripts split on top-level `#` headings **while tracking code fences**,
because a `#` shell comment inside a ``` block is not a page break. On the
Drizzle feed this matters a great deal: a naive split finds 442 headings, the
fence-aware one finds the real 240.

```bash
python .agents/skills/drizzle-docs/scripts/sync_drizzle_docs.py   # required once per clone
python .agents/skills/zod-docs/scripts/sync_zod_docs.py           # only to refresh
```

Each writes `references/docs/`, `references/docs-index.md` and a
`references/docs-source.txt` stanza carrying the source URL, the page count and
the snapshot date.

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

## Vercel is covered by a plugin, not by these

The `vercel@claude-plugins-official` plugin (v0.45.1, user-level) supplies 30
skills, invoked as `vercel:<name>`. Nothing in `.agents/skills/` duplicates
them. The ones this project's contract already names:

`vercel:vercel-storage` (§7.4 storage resolution) · `vercel:auth` (§7.2
overrides its Clerk recommendation) · `vercel:marketplace` (§7.4 provisioning)
· `vercel:next-cache-components` (front matter, before touching revalidation) ·
`vercel:ai-sdk` (§5.3, not before step 9). Also available and relevant:
`vercel:nextjs`, `vercel:vercel-functions`, `vercel:vercel-firewall` (BotID),
`vercel:env-vars`, `vercel:vercel-cli`, `vercel:react-best-practices`.

Because it is a user-level plugin it is **not** in this repository and a fresh
clone on another machine will not have it. `AGENTS.md` §7.4 step 1 already
requires the Vercel CLI and a linked project; the plugin is the same class of
prerequisite.

## Before running `npx skills update`

It updates every skill in `skills-lock.json`, including the eight GSAP skills
and `tailwind-4-docs`, which sit underneath 36 prompts of fitted motion and
comp-matched design work. Update named skills, not all of them, and read the
diff. This is the same reason prompt 39 installed new skills without touching
the existing ones.

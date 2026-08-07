# 40 — The Tailwind snapshot, and Vercel skills that survive a clone

## Scope, and why it is next

Prompt 39 installed the stack's skills and, in doing so, exposed two gaps in the
set it did not touch:

1. **`tailwind-4-docs` is installed but inert.** Its
   `references/docs-source.txt` reads `Status: Not initialized` and
   `references/docs/` does not exist. Its own SKILL.md instructs an agent to
   *stop and ask* before answering a Tailwind question in that state — so the
   skill covering the site's entire styling layer currently answers nothing.
2. **Vercel's skills are not in this repository.** `vercel:nextjs`,
   `vercel:vercel-storage`, `vercel:vercel-firewall`, `vercel:marketplace` and
   `vercel:next-cache-components` — all five cited by name in `AGENTS.md` — come
   from a **user-level plugin**. A clone on another machine has none of them.

Both are tooling, not build steps. Neither blocks §5.2 and neither touches
application code.

## Reference material read for this prompt

- `.agents/skills/tailwind-4-docs/SKILL.md`,
  `.agents/skills/tailwind-4-docs/references/docs-source.txt`,
  `.agents/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py` — the skill,
  its uninitialized state, and the sync it needs
- `docs/skills.md` — prompt 39's record, which this prompt extends
- `skills-lock.json` — provenance for the 24 currently installed skills
- `/home/gdk26/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`
  — where the `vercel` plugin entry names its real upstream
- `/home/gdk26/.claude/plugins/cache/claude-plugins-official/vercel/0.45.1/LICENSE`
  — Apache-2.0, Copyright 2026 Vercel, Inc.
- `npx skills add vercel/vercel-plugin --full-depth -l` — the 40 skills that
  repository offers, read this session
- `npx skills add vercel-labs/agent-skills -l` — the 9 it offers, which do
  **not** include the five cited above

## The finding that shapes the work

**`vercel-labs/agent-skills` is not the source.** It offers nine skills
(`vercel-composition-patterns`, `deploy-to-vercel`, `vercel-react-best-practices`,
`vercel-react-native-skills`, `vercel-react-view-transitions`,
`vercel-cli-with-tokens`, `vercel-optimize`, `web-design-guidelines`,
`writing-guidelines`) and none of the five `AGENTS.md` cites.

The plugin's marketplace entry names its upstream as
`https://github.com/vercel/vercel-plugin.git` — first-party Vercel, Apache-2.0 —
and the `skills` CLI installs from it directly with `--full-depth`, which finds
40 skills. **That is the route: a tracked install with lockfile provenance, not
a hand-copied fork of the plugin cache.** Copying files out of
`~/.claude/plugins/cache/` is explicitly not the plan; it would drift silently
and `skills-lock.json` would not know about it.

**The accepted cost, stated up front.** Installing these puts `nextjs` and
`vercel:nextjs` (and four more pairs) in the listing at once. Skills are matched
lazily against their descriptions, so the duplication costs listing space rather
than loaded context — but it is real, it is the reason to install a **subset**
rather than all 40, and it must be recorded in `docs/skills.md` so a later
session does not "discover" it as a bug.

## The work

### Stream A — initialize the Tailwind snapshot

```bash
python .agents/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py --accept-docs-license
```

The user has approved accepting the docs license. The script shallow-clones
`tailwindlabs/tailwindcss.com` and copies `src/docs` plus the docs index.

Afterwards, **verify rather than assume**: `references/docs-source.txt` must no
longer say `Not initialized`, `references/docs/` must be non-empty, and
`references/docs-index.tsx` must exist — the SKILL.md's quick start names all
three, and a sync that half-succeeds leaves the skill just as inert.

Then decide, and **state which was done**: the Tailwind docs are
source-available, not open-source, which is why the script gates on a license
flag and why the skill ships without the snapshot. **Do not commit the
snapshot.** Add a gitignore rule for it alongside the Drizzle one, matching the
reasoning already written there, and note in `docs/skills.md` that this skill —
unlike `zod-docs` — needs a sync on a fresh clone.

Measure and report the snapshot's file count and size.

### Stream B — install the cited Vercel skills into the repository

```bash
npx -y skills@latest add vercel/vercel-plugin --full-depth -s nextjs -s vercel-storage -s vercel-firewall -s marketplace -s next-cache-components -s env-vars -s vercel-functions -y
```

**`-s` must be repeated; a comma-separated list silently fails** (`docs/skills.md`
records this).

Seven skills, and the subset is chosen, not swept: the five `AGENTS.md` cites by
name, plus `env-vars` (§8.4's whole subject) and `vercel-functions` (§7.1's
Fluid Compute decision and the `attachDatabasePool` surface step 1 already
uses). **Everything else in those 40 stays out** — `ai-sdk` and `ai-gateway`
belong to step 9 and §5.3 forbids scaffolding before it; `shadcn` and
`next-forge` propose a second design system, which §7.5 rejects outright;
`eve`, `microfrontends`, `vercel-sandbox`, `chat-sdk`, `workflow` and the
`benchmark-*` / `release` / `plugin-audit` internals are not this project.

Verify each name against `-l` before installing, and confirm afterwards that
`skills-lock.json` gained seven entries sourced from `vercel/vercel-plugin`.

### Stream C — audit what is still uncovered, read-only

Produce a findings list, change nothing. For each item of §7.1's settled stack
**not** covered by a skill after streams A and B, say whether that is a gap or
correctly nothing:

- `pg` (node-postgres) and `@vercel/functions` — `attachDatabasePool` was
  verified from `node_modules/` at step 1, which §12 accepts as a source; is a
  skill warranted, or is the node_modules read the better answer?
- React 19.2 and TypeScript — presumed correctly uncovered; confirm.
- Next.js 16.2 — `node_modules/next/dist/docs/` is what the front matter
  actually mandates reading. Does stream B's `nextjs` skill supersede that, sit
  alongside it, or contradict it? Read both before answering.
- `@vercel/blob` and BotID — covered by `vercel-storage` / `vercel-firewall`
  after stream B, or still thin? These land at build steps 5 and 2.

**Do not install anything.** The output is a list with a recommendation per
item, and §12 rule 9 applies: report uncertainty, do not route around it.

### Stream D — verify prompt 39's two authored skills hold up

Read-only except for re-running the two sync scripts, which are idempotent.

- Re-run `sync_drizzle_docs.py` and `sync_zod_docs.py`; confirm the page counts
  still come out at 240 and 13. A different number means the upstream feed moved
  and the split needs re-checking, which is a finding, not a failure to hide.
- Confirm the fence-tracking split is sound: spot-check three Drizzle pages that
  contain fenced shell blocks and confirm no page begins mid-code-block.
- Confirm `git check-ignore` still resolves the Drizzle snapshot to the
  `.gitignore` rules, and that the Zod snapshot is tracked.
- Confirm both skills' `references/docs-index.md` rows all resolve to files that
  exist.

Report discrepancies; do not fix anything outside the two skill directories
without saying so.

## On running this with four subagents

The user asked for four. **A and B are genuinely independent** — different
directories, different tools, no shared file. **C and D are independent
read-only passes** that depend on nothing either writes, so all four can run at
once.

What must **not** be delegated, because four agents editing one file collide:
**`docs/skills.md`, the checks, and the commit are done once, afterwards, by the
main session**, merging the four reports. No subagent edits `docs/skills.md`, no
subagent commits, and no subagent runs `npm run build`.

Each subagent is given: this file's path, its own stream, the instruction to
read `AGENTS.md` §12 first, and the instruction to report what it verified with
the command output rather than asserting it.

## Measurements

Read from a command, never asserted:

1. Tailwind snapshot: file count and total size, plus the new
   `references/docs-source.txt` stanza quoted verbatim.
2. `npx skills list` — the inventory after both installs (24 before).
3. `git diff --stat skills-lock.json` — seven new entries, sourced from
   `vercel/vercel-plugin`.
4. `git check-ignore -v` on one file inside each ignored snapshot.
5. The Drizzle and Zod page counts from the re-run.

## Expected impact

**Prerender impact: none — no route changes.** No file under `app/`, `lib/` or
`motion/` is touched and `package.json` is unchanged, so all nine prerendered
routes are untouched by construction. `npm run build` is still run and its route
table compared against §8.1's.

**Trust boundary: none.** No request path, action or handler is added.

**Secrets and data: none.** No environment variable is read, added or renamed.
The syncs fetch public documentation over HTTPS and write only inside skill
directories.

## Non-goals

- **No application code**, no dependency installs, no provisioning.
- **No hand-copied fork of the plugin cache** — the install is tracked through
  `skills-lock.json` or it does not happen.
- **No uninstalling the `vercel@claude-plugins-official` plugin.** It also
  supplies commands, hooks and MCP surfaces that the skills alone do not, and
  removing it to dodge the name duplication would lose more than it saves.
- **No installing all 40 Vercel skills** — the subset is the point.
- **No `skills update`** across the existing set; prompt 39's reasoning is
  unchanged.
- **No AGENTS.md change at all.** `docs/skills.md`'s index row already exists
  from prompt 39, and this prompt adds no invariant that meets the cap rule.
- **Stream C installs nothing.** It reports.

## Checks to run

Once, by the main session, after all four streams report:

- `npx skills list`
- `npm run lint`
- `npm run typecheck`
- `npm run build` — route table compared to §8.1's, verbatim
- `git status --short` and `git check-ignore -v` on both ignored snapshots

Record the result in **`docs/skills.md`** — extending prompt 39's file, not
replacing it. It must gain: the Tailwind initialization and its fresh-clone
requirement, the seven Vercel skills and why that subset, the name-duplication
note, stream C's findings, and the `vercel/vercel-plugin` upstream discovery
(so no later session repeats the `vercel-labs/agent-skills` dead end).

## SKILLS USED

- **`skills` CLI (`npx skills`)** — `add`, `add -l`, `list`; the mechanism for
  stream B.
- **`tailwind-4-docs`** (installed, being initialized) — stream A reads its
  SKILL.md for the three artefacts a successful sync must produce.
- **`drizzle-docs`** and **`zod-docs`** (installed at prompt 39) — stream D's
  subjects; it reads both SKILL.md files for the claims it is verifying.
- **`vercel:marketplace`** — *not* to be loaded. Provisioning is a non-goal and
  this line records that the boundary was deliberate.

No newly installed skill is invoked by this prompt; the build steps that need
them load them.

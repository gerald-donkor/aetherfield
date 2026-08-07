# 37 — The data layer and the phase-one schema

## SKILLS USED

- **`neon-postgres`** — the installed Neon skill. Owns the pooled/direct
  connection split, the driver choice, scale-to-zero behaviour and the
  "migrations as code, never ad hoc" rule this prompt is built on.
- **`neon`** — the parent overview skill. Read for the branch-first workflow and
  CLI/MCP routing before touching the project.
- **`vercel:vercel-storage`** — Neon provisioning and the lazy-init / no-`Proxy`
  gotchas. **Note it names the wrong driver** for this platform; §7.2 corrects it
  and the correction is not negotiable here.
- **`vercel:env-vars`** — `.env.local` vs `.env.example`, `vercel env pull`, and
  which values may ever be `NEXT_PUBLIC_*`.
- **`vercel:nextjs`** — App Router conventions in 16.2, and `server-only`.
- **`vercel:vercel-cli`** — `vercel env ls` / `pull` for verifying what actually
  landed rather than asserting it.

Not needed, deliberately: `vercel:ai-sdk` (§5.3 — no AI before step 9),
`vercel:auth` (step 6 generates its own tables), `vercel:marketplace` (Neon is
already provisioned), every `gsap-*` skill (no motion, no client code at all).

## Scope, and why it is next

**This is build step 1 of §5.2** — the data layer and the phase-one schema. It is
next because **every other phase-one step depends on it** and nothing depends on
anything else: steps 2, 4 and 5 all write rows, step 6 generates its tables into
the same database, and step 7 reads all three. It is also the only step that can
be built and verified with no request path at all, which makes it the safest
place to get the connection handling right.

Neon is already provisioned — resource `neon-purple-candle`, plan `free_v3`,
region `iad1`, `auth=false`, connected to `dgsloxx417s-projects/aetherfield`, with
17 variables pulled into a gitignored `.env.local`. **Do not re-provision, do not
re-link, and do not run `vercel integration add` again.**

## Reference material to read first

| path | what it is |
| --- | --- |
| `AGENTS.md` §5.2, §6, §7.2, §7.3, §8.1, §8.4, §9, §12 | the contract this implements — §9 is the schema's brief, §7.3 the traps |
| `.claude/skills/neon-postgres/SKILL.md` | pooled vs direct, driver, scale-to-zero |
| `app/_content/jobs.ts` | `JOBS` and the `Job` type — `job_slug`'s validation source (§9 rule 1) |
| `app/_content/articles.ts` | the existing typed-constant pattern the schema must not duplicate |
| `.env.local` | **read to confirm names only; never echo a value** (§8.4) |
| `node_modules/next/dist/docs/` | before writing anything that Next evaluates at build time |
| `node_modules/drizzle-orm/` and `node_modules/drizzle-kit/` | **after installing** — the installed API, not the remembered one (§12 rule 2) |

## What ships

### Dependencies

`pg`, `drizzle-orm`, `@vercel/functions`, `server-only` as dependencies;
`drizzle-kit`, `@types/pg`, `dotenv-cli` as dev dependencies. **`pg`, not
`@neondatabase/serverless`** — §7.2 explains why, and installing the serverless
driver here is a defect, not a preference.

### `lib/db/client.ts`

- `import "server-only"` first line (§6.3).
- A `pg` `Pool` built **lazily** in a `getDb()` over a module-level `let` —
  never at import time (§7.3: `next build` evaluates top-level module code), and
  **never behind a `Proxy`** (§7.3: it hangs Better Auth's request chain with no
  error at step 6).
- `attachDatabasePool` from `@vercel/functions` on the pool, for connection reuse
  across Fluid invocations and graceful shutdown.
- Reads **`DATABASE_URL`** — the pooled URL. The app never uses the direct one.

### `lib/db/schema.ts`

Drizzle definitions for the three §9.1 entities. **Enums are declared once here
and imported everywhere** (§9 rule 2) — never re-declared as a string union in UI
code.

- **`lead`** — name, work email, company, message, and `source` as an enum over
  the three surfaces that feed it (`hero`, `nav`, `cta_band`), because §9.1
  requires "which CTA converts" to be answerable.
- **`subscriber`** — email, `status` as an enum `pending | confirmed |
  unsubscribed` (**not** a boolean, §9.1), the confirmation token, and a separate
  timestamp per transition (§9 rule 3).
- **`application`** — `job_slug` as a **plain column, not a foreign key**
  (§9 rule 1), the applicant's fields, and the CV's private blob reference —
  **never the CV's bytes** (§9.1).

Applying to all three: `created_at` on every table (§9 rule 3); a soft-delete
column, since all three hold data a person may ask to have erased (§9 rule 5);
and **email stored lowercased** with the uniqueness constraint on the lowercased
value (§9 rule 4) — a subscriber list that treats two casings as two people is a
compliance problem.

**Not tenant-scoped.** Leads and applications belong to Aetherfield, not to a
customer (§9 rule 6). Do not add an organisation column in anticipation of step 8.

### `drizzle.config.ts` and the migration workflow

- Points at **`DATABASE_URL_UNPOOLED`** — the direct URL. Running a migration
  over PgBouncer can fail confusingly or leave a partial apply (§7.3).
- `package.json` scripts, each wrapped in `dotenv -e .env.local --` because only
  Next.js auto-loads that file (§7.3): a generate, a migrate, and a studio.
  **Add them to `AGENTS.md` §2 in this same change** — §2's standing note
  forbids citing a script before it exists.
- The generated SQL is **committed**. Migrations are code (`neon-postgres`);
  never hand-run DDL against the database.

### `.env.example`

Names only, never values (§8.4). Covers what exists now and is extended by the
step that provisions each remaining variable. `.gitignore` was already fixed to
stop `.env*` swallowing this file — verify with `git check-ignore` that it is
tracked, rather than assuming.

## Prerender impact

**`none — no route changes`, and it must be verified, not assumed.**

Nothing here is imported by any route. After `npm run build` the table must be
**exactly** what §8.1 records, unchanged:

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

17 prerendered pages. **If any route's marker changes, or the count moves, a
server module has leaked into a client graph — stop and fix that before
continuing.** Diff the prerendered HTML per `docs/automation.md`, honouring the
standing warning about `/`, `/journal` and `/careers`.

## Trust boundary

**`none` — this step adds no request path.** No route handler, no server action,
no form, no user input. The only caller of the database in this change is the
migration runner, invoked from the developer's shell against a direct connection.

This is precisely why the step is first: the connection handling gets settled
where nothing can reach it. Step 2 opens the first public path and inherits it.

## Secrets and data

- Reads **`DATABASE_URL`** (pooled, app) and **`DATABASE_URL_UNPOOLED`** (direct,
  migrations). Both already provisioned; both server-only.
- **No `NEXT_PUBLIC_*` is added.** Phase one needs none (§8.4), and introducing
  one is a decision to make a value public.
- **No personal data is stored by this step** — it creates empty tables. It does
  define where personal data will live, which is why the soft-delete and
  lowercasing rules land here rather than being retrofitted.
- Never echo a connection string, in output, in a comment, or in `docs/`.

## Non-goals

- **No forms, no server actions, no route handlers.** Step 2 owns the first
  write path and the pattern in §10.
- **No query functions without a caller.** §5.2 step 1 is the client, the schema
  and the migration workflow; queries land with the step that needs them.
- **No auth tables.** Step 6 generates user/session/account/verification with
  `npx auth@latest generate` — hand-authoring them now guarantees a conflict
  (§9.1).
- **No phase-two entities.** No `organization`, no `activity_record`, nothing
  tenant-scoped (§9 rule 6, §5.2).
- **No seed data, and no fake rows.** An empty table is the correct end state.
- **No UI of any kind**, no change to any existing component, and no change to
  `app/_content/`.
- **No Upstash, Resend or Blob provisioning.** Steps 2, 3 and 5 own those.
- **No Neon branching setup.** Real capability, but not this step — raise it if
  preview deployments need it later.

## Checks to run

Section 2 in full, reporting exact output: `npm run lint`, `npm run typecheck`,
`npm run build`.

Then, and none of these may be asserted without running them (§12 rule 3):

1. **The route table above, quoted from the actual build output.**
2. **The migration applied** — run it, then confirm the three tables and their
   enums exist by querying the database, quoting the result.
3. **Re-running the migration is a no-op**, not an error.
4. **`git check-ignore`** on `.env.local` (ignored) and `.env.example` (tracked).
5. **No secret in the diff** — grep the staged change for a connection string
   before committing.
6. **`npm run build` with `DATABASE_URL` unset still succeeds** — this is the
   lazy-init trap (§7.3), and it is the one failure mode that only appears on a
   clean deploy.

## Recording

Create **`docs/backend.md`** and add its index row to `AGENTS.md`'s table in the
same change (§8.5). It records the column types, the enum values, the migration
filename, the connection split and which URL each consumer uses, and the
provisioned Neon resource. **The schema's detail goes there, not in `AGENTS.md`**
— §9 keeps the rules, `docs/backend.md` keeps what was built against them.

Add the new `package.json` scripts to `AGENTS.md` §2, and mark step 1 nowhere:
§5.2 records the plan, and completion is resolved from `git log` (§12 rule 5).

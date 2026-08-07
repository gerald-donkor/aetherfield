---
name: drizzle-docs
description: >-
  Locally synced snapshot of the official Drizzle ORM documentation, plus this
  project's fixed Drizzle decisions. Covers schema declaration, column types,
  enums, indexes and constraints, queries and CRUD, relations, transactions,
  prepared statements, and the whole Drizzle Kit migration workflow (generate,
  migrate, push, pull, check, studio). Use when writing or changing anything in
  lib/db/, when a migration is involved, or when the user mentions "Drizzle",
  "drizzle-orm", "drizzle-kit", "pgTable", "schema.ts", "db:generate",
  "db:migrate", "migration", or "ORM".
compatibility: Requires Python 3 and internet access to initialize the docs snapshot from orm.drizzle.team.
---

# Drizzle ORM docs

Drizzle is this project's ORM (`AGENTS.md` §7.2) and it owns schema and
migrations **exclusively**. There is no first-party Drizzle skill; this one is a
snapshot of the vendor's own `llms-full.txt` feed, split one file per page.

## Quick start

1. Check the snapshot is initialized — `references/docs-source.txt` says
   `Status: Initialized` and `references/docs/` is non-empty.
2. If it is missing, or the `Snapshot-Date` is more than a month old, run the
   sync in "Initialization" before answering.
3. Find the topic in `references/docs-index.md`.
4. Load **only** that file from `references/docs/`. The snapshot is ~4 MB across
   240 pages; never read it wholesale.
5. Read "This project's decisions" below before writing code — several of them
   contradict what the general docs recommend.

The pages are the Drizzle site's own, so they carry site-relative links
(`/docs/...`) and MDX components (`<Callout>`, `<Tabs>`, `<Prerequisites>`).
Read through them; they are not part of the API.

## Initialization

```bash
python .agents/skills/drizzle-docs/scripts/sync_drizzle_docs.py
```

It downloads `https://orm.drizzle.team/llms-full.txt`, splits it on top-level
headings (tracking code fences, so a `#` shell comment is not mistaken for a
page break), and rewrites `references/docs/`, `references/docs-index.md` and
`references/docs-source.txt`.

**The snapshot is not committed** — it is ~4 MB and regenerable. `references/docs/`
and `references/docs-index.md` are gitignored; the script and the source stanza
are tracked. A fresh clone must run the sync once.

Drizzle serves no per-page markdown — `https://orm.drizzle.team/docs/overview.md`
returns 404 — so splitting the full feed is the only route to a file-per-topic
snapshot. Do not "fix" the script to fetch individual pages.

## This project's decisions

These are settled. They come from `AGENTS.md` §§7.2, 7.3, 9 and `docs/backend.md`,
and the general docs will happily suggest otherwise.

- **The driver is `pg` (node-postgres), never `@neondatabase/serverless`.**
  Vercel Fluid keeps functions warm long enough to reuse TCP connections, which
  is the case the HTTP driver does not serve. Any docs page or scaffolder that
  reaches for `@neondatabase/serverless`, or for the sunset `@vercel/postgres`,
  is wrong for this repository.
- **Two connection strings, and the wrong one fails silently.** `DATABASE_URL`
  is pooled (PgBouncer, the `-pooler` host) and is read only by
  `lib/db/client.ts` — the application. `DATABASE_URL_UNPOOLED` is direct and is
  read only by `drizzle.config.ts` — migrations and Studio. PgBouncer breaks
  session state, so a migration over the pooled host can leave a partial apply.
- **Never wrap the client in a `Proxy`.** The idiomatic-looking lazy `Proxy`
  breaks any library that inspects the adapter object, and Better Auth is one;
  the request chain hangs with no error. Use a plain `getDb()` over a
  module-level `let`, and construct the pool lazily so `next build` does not
  evaluate it against an unset URL.
- **Migrations are generated, never hand-run.** `npm run db:generate` writes
  the migration from `lib/db/schema.ts`; `npm run db:migrate` applies it. A
  hand-written `ALTER TABLE` against the database is out of bounds (§9). Do not
  reach for `drizzle-kit push` — this project generates and applies files.
- **Every db script is `dotenv -e .env.local -- …`.** Nothing but Next.js
  auto-loads `.env.local`, so `drizzle-kit` sees an undefined URL without it.
  The three scripts in `package.json` are already written this way; a new one
  must be too.
- **Nothing outside `lib/db/` writes SQL or builds a query** (§6.2). The UI
  calls the data layer or a Server Action.
- **Status columns are enums defined once and imported** (§9 rule 2), email is
  stored and compared lowercased (rule 4), every table carries `created_at`
  (rule 3), and `job_slug` is a validated reference, not a foreign key (rule 1).

## Where things are

| what | file |
| --- | --- |
| the schema | `lib/db/schema.ts` |
| the client and pool | `lib/db/client.ts` |
| generated migrations | `lib/db/migrations/` |
| Drizzle Kit config | `drizzle.config.ts` |
| the build record | `docs/backend.md` |

Read `docs/backend.md` before changing the schema — it holds the phase-one
column types, the enums and the migration history, and this skill does not
duplicate them.

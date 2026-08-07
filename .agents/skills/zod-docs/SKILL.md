---
name: zod-docs
description: >-
  Locally synced snapshot of the official Zod 4 documentation, plus this
  project's fixed rules for how a schema is shared between a client form and a
  Server Action. Covers defining schemas, string formats, objects, unions,
  refinements, transforms, codecs, error customization and error formatting
  (treeifyError / flattenError), metadata and registries, and the v3 to v4
  migration. Use when writing or changing a validation schema, when parsing form
  input in a Server Action, or when the user mentions "Zod", "z.object",
  "safeParse", "schema", "validation", "field errors" or "form errors".
compatibility: Requires Python 3 and internet access only to refresh the snapshot; the snapshot itself is committed.
---

# Zod docs

Zod is this project's validation library (`AGENTS.md` §7.1): **one schema per
input, shared between the client form and the Server Action, so the rules exist
once.** There is no first-party Zod skill; this one is a snapshot of the
vendor's own `llms-full.txt` feed, split one file per page.

## Quick start

1. Find the topic in `references/docs-index.md` — 16 pages.
2. Load **only** that file from `references/docs/`.
3. Read "This project's decisions" below before writing a schema; the shape of
   the result the action returns is fixed by §10 and is not a free choice.

`references/docs/02-defining-schemas.md` is the large one (schema types and
their options); `07-formatting-errors.md` is what a Server Action needs.

## Refreshing

The snapshot **is committed** — 16 pages, ~292 KB — so it works on a fresh
clone with no setup. To refresh it:

```bash
python .agents/skills/zod-docs/scripts/sync_zod_docs.py
```

Zod serves no per-page markdown (`https://zod.dev/api.md` returns 404), so
splitting `llms-full.txt` is the only route. Do not "fix" the script to fetch
individual pages.

**Do not simplify the fence tracking back to a boolean toggle.** It follows
CommonMark — a fence closes only on the same character, at least as long as the
opener, with nothing after it — because a plain toggle treats a ```` ```ts ````
seen inside a fence as a close and desynchronises for the rest of the file. That
bug buried `Versioning` and `Zod Core` inside the migration guide and reported
13 pages where there are 16.

## This project's decisions

- **Zod is not installed yet.** It arrives with build step 2 (demo-request
  capture), which is the step that establishes the whole write-path pattern.
  Do not `npm install zod` outside the step that needs it.
- **The schema exists once and runs twice** (§6.2, §10 rule 1). The client copy
  is a courtesy to the user; the server copy is the check. A schema declared
  inline in a form component, or re-declared in the action, is the mistake this
  rule exists to prevent.
- **Never re-declare a status union in UI code.** Status is a database enum
  defined once and imported (§9 rule 2); a Zod enum over it derives from that
  constant, it does not restate its members.
- **Order inside the action is fixed: BotID, then rate limit, then parse**
  (§10 rule 3). Parsing is the expensive step and the cheap rejections come
  first. Parsing happens before any write.
- **The action returns a typed result and never throws to the client** (§10
  rule 2): `{ ok: true } | { ok: false, error, fieldErrors? }`. A thrown error
  is a bug, not a validation outcome.
- **Email is lowercased before it is stored or compared** (§9 rule 4).
- **Never log a parsed body or an email address** (§8.3 rule 2) — not on a
  validation failure, not in an error report.

## API notes worth checking rather than recalling

Verified against this snapshot, because the v3 habits are wrong:

- The import is `import * as z from "zod"` (`references/docs/03-basic-usage.md`).
- `.safeParse()` returns a discriminated union — use it, not `try`/`catch`
  around `.parse()`.
- `z.flattenError(result.error)` produces `{ formErrors, fieldErrors }`, which
  is exactly the shape §10's typed result wants. **`error.flatten()` is
  deprecated in v4** — as is `error.format()`, replaced by `z.treeifyError()`
  (`references/docs/07-formatting-errors.md`).
- Async refinements or transforms require `.safeParseAsync()`.

When an API is not in this snapshot, say so rather than recalling it (§12
rule 2).

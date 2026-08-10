# 57 — Activity-data ingestion (build step 9)

## Scope, and why it is next

**Build step 9 of AGENTS.md §5.2 — activity-data ingestion.** CSV import first,
staged rows, validation, and a visible import outcome, tenant-scoped from its
first line.

It is next because it is the next unbuilt step in §5.2's ordered sequence and
the one that unblocks the most downstream work: steps 10 (emission factors and
the calculation engine), 11 (targets and forecasting), 12 (the dashboard
routes) and 13 (report generation) all read `activity_record`, and none of them
can begin until rows exist in it.

Resolved from the repository and `git log`, not from `prompts/` (§1, §12
rule 5):

- Phase one steps 1–7 are committed — `lib/db/`, `lib/email/`, `lib/storage/`,
  `lib/rate-limit/`, `lib/auth/`, the three public forms in `app/_actions/`,
  and `/submissions`.
- Step 8 is committed at `246decd` — Better Auth's `organization` plugin,
  `organization` / `member` / `invitation`, `lib/auth/organization.ts` and
  `lib/db/organization-queries.ts`.
- No phase-two data table exists: `lib/db/schema.ts` holds `lead`, `subscriber`
  and `application` and nothing else, and `docs/backend.md`'s step 8 record
  lists `site`, `activity_record`, `emission_factor`, `target` and `report` as
  deliberately not done.

**Two candidates were considered and the choice was put to the user.** The
other was finishing step 8's deferred organisation invitations, which
`docs/backend.md` describes as "the next prompt" while also recording that they
"block nothing downstream". The user chose step 9. Per §12 rule 8 the
contradicted line is not left standing: this prompt corrects it (see
"Documentation" below).

**The user also chose the deterministic scope.** §5.3 sanctions an AI surface
for this step — mapping arbitrary vendor CSV headers onto the schema via
structured extraction — but sanctions it without scheduling it. This prompt
builds explicit header mapping with a fixed alias table and a human review step.
The AI mapper drops in behind the same review UI later with no rework. **No AI
SDK is installed, no model is named, and no prompt is scaffolded** (§5.3).

## Reference material read for this prompt

By path, all opened this session:

| path | what was taken from it |
| --- | --- |
| `AGENTS.md` | §5.2 step 9 and its dependency; §5.3's AI rules; §6.2 boundaries; §6.3's directory contract; §8.1–8.4; §9.2 rules 2, 3, 5, 6, 7; §10's lettered stages; §11's orthogonality invariant; §12 |
| `docs/backend.md` lines 2855–3210 | the whole step 8 record — the plugin options, the generated tables, the tenant gate, the prerender verification method, and the two open items this step inherits |
| `lib/db/schema.ts` | the phase-one table idiom: `uuid().defaultRandom()` primary keys, `timestamp({ withTimezone: true })`, `pgEnum` declared once, `check()`, `index()`, `$inferSelect` / `$inferInsert` type exports, the docblock density |
| `lib/db/organization-queries.ts` | `getMembership()` — the tenant-scope primitive every query here filters on, and the reason its predicate reads no role column |
| `lib/auth/organization.ts` | `getCurrentMembership()`, `requireOrganization(callbackURL)`, `authorizeOrganization(organizationId)` and the stated orthogonality invariant |
| `lib/auth/organization-access.ts` | the `owner` / `member` role set, and why organisation-level `admin` is absent |
| `app/_actions/application.ts` | the write path's canonical `FormData` implementation — stage letters, fail-closed catches, server-side file gates including the byte-signature check, the put-then-insert ordering and its compensating delete |
| `app/account/actions.ts` | the authenticated variant of the same path — session before rate limit, user-id key, no BotID and the recorded reason, `z.flattenError` onto `fieldErrors`, `revalidatePath`, no redirect on success |
| `lib/rate-limit/index.ts` | the lazy limiter construction, the `aetherfield:` prefix convention, `formatRetry()`, and the standing "every window is a judgement" rule |
| `lib/storage/cv.ts` | `put()` with a required `access: 'private'`, `addRandomSuffix`/`allowOverwrite` defaulting to `false` in `@vercel/blob@2.7.0`, `issueSignedToken` + `presignUrl` for a short-lived read, `sanitiseFilename()`, and the no-`console` rule |
| `lib/validation/result.ts` | `SubmitResult<TField>` — the one result vocabulary, not one per flow |
| `lib/validation/organization.ts` | the trim/lowercase-before-shape idiom, and `RESERVED_SLUGS`, which must gain this step's new top-level segment |
| `app/submissions/page.tsx` | the authenticated read-view idiom — `Detail`, `RecordCard`, `Intl.DateTimeFormat` on UTC, `aria-label`ed lists, `EmptyState`, the paging helpers |
| `app/_components/organization/create-organization-form.tsx` | the client-leaf idiom — `Field` / `Button` primitives, the focused announcement region, client parse as a courtesy, component-only exports, no GSAP |
| `proxy.ts` | the matcher, `["/account", "/submissions/:path*"]`, and that it is enumerated rather than match-and-exclude |
| `package.json` | the installed set — no CSV library is present, and no test script exists |
| skill `drizzle-docs` → `references/docs/272-pg-column-types.md` | `numeric({ precision, scale })` returns a **string** unless `mode` is set; `date({ mode: "string" })`; `timestamp` modes |
| skill `zod-docs` | `import * as z from "zod"`, `.safeParse()`, `z.flattenError()` producing `{ formErrors, fieldErrors }`, and that `error.flatten()` / `error.format()` are deprecated in v4 |

## What this step builds

### The directory contract is not extended

Everything lands in the directories §6.3 already names. **No new top-level
`lib/` directory**, and in particular no `lib/import/`:

| module | role | `server-only`? |
| --- | --- | --- |
| `lib/db/schema.ts` (extended) | the four new tables and their enums | yes (transitively — it is already in `lib/db/`) |
| `lib/db/activity-queries.ts` | every read and write of them | yes |
| `lib/domain/csv.ts` | RFC 4180 parsing — pure, no I/O | no import needed; it reads no secret |
| `lib/domain/activity-import.ts` | header mapping and per-row coercion — pure | as above |
| `lib/validation/activity.ts` | the shared Zod schemas, the unit and category vocabularies, the upload constraints | **no** — the deliberate exception (§6.3) |
| `lib/storage/activity-import.ts` | the raw CSV's private blob write, delete and signed read | yes |
| `lib/rate-limit/index.ts` (extended) | two new limiters | yes |

**`lib/domain/` is created by this step and it is the phase-two domain layer
§6.2 specifies: pure functions over typed inputs, no database handle, no
`fetch`, no implicit `Date.now()`.** Step 10's calculation engine lands beside
these two modules. Anything in `lib/domain/` that needs the current time takes
it as a parameter.

`lib/validation/activity.ts` must import nothing from `lib/db/` — `schema.ts`
calls `pgEnum` at module scope and an import there puts `drizzle-orm/pg-core`
into a browser bundle (§6.3). The enum *members* therefore live in
`lib/validation/activity.ts` and `lib/db/schema.ts` builds its `pgEnum` from
them, exactly as `ORGANIZATION_ROLES` and `lib/auth/organization-access.ts`
are arranged — declared once (§9.2 rule 2), in the module that is safe to
import from either side.

### The tables

Four, all carrying an organisation reference and `created_at`, all read through
a query that filters on the organisation id (§9.2 rules 3 and 6).

**`site`** — the facility an activity is attributed to. §9.2 rule 7 names it as
a phase-two entity and this step makes it real, but **there is no site
management UI**: sites are created implicitly by an import, upserted by
normalised name within the organisation. A CRUD screen is not in step 9 and
"do not overbuild" covers it.

- `id` uuid pk, `organization_id` text not null → `organization.id`,
  `name` text not null, `normalized_name` text not null, `created_at`,
  `deleted_at`.
- unique index on `(organization_id, normalized_name)` — two spellings of one
  building must not become two sites, which is §9.2 rule 4's reasoning applied
  to a name instead of an address.

**`activity_import`** — one row per uploaded file.

- `id` uuid pk, `organization_id` text not null → `organization.id`,
  `uploaded_by` text not null → `user.id`, `filename` text not null (sanitised),
  `blob_pathname` text not null, `status` `activity_import_status` not null,
  `row_count` / `valid_row_count` / `invalid_row_count` integer not null,
  `column_mapping` text not null (JSON), `created_at`, `committed_at`,
  `discarded_at`, `deleted_at`.
- index on `(organization_id, created_at)`.

**`activity_import_row`** — the staged row, which is what makes this an
*import* rather than a parse-and-hope.

- `id` uuid pk, `import_id` uuid not null → `activity_import.id` cascade,
  `organization_id` text not null → `organization.id` (denormalised **on
  purpose**: every tenant filter then reads one table's own column, so no read
  of staged data can be written that forgets the join), `row_number` integer not
  null, `raw` text not null (the source line's fields as JSON), the coerced
  columns nullable, `status` `activity_import_row_status` not null, `error`
  text, `created_at`.
- unique index on `(import_id, row_number)`; index on `(import_id, status)`.

**`activity_record`** — the committed fact steps 10–13 read.

- `id` uuid pk, `organization_id` text not null → `organization.id`,
  `site_id` uuid not null → `site.id`, `activity_date` date not null,
  `category` `activity_category` not null, `description` text,
  `quantity` numeric not null, `unit` `activity_unit` not null,
  `import_id` uuid → `activity_import.id`, `import_row_id` uuid →
  `activity_import_row.id`, `created_at`, `deleted_at`.
- index on `(organization_id, activity_date)`; index on `(organization_id,
  category)`.

**`quantity` is `numeric`, never a float, and it is read back as a string.**
The `drizzle-docs` snapshot's pg column-types page states that `numeric()`
without a `mode` yields a string; leave it that way. These figures end up in
regulatory disclosures (§5.3's hard rule) and binary floating point is the
wrong representation for a number that must survive a round trip exactly.
Choose an explicit precision and scale and record the choice and its reasoning
in `docs/backend.md`; **it is a judgement, not a measurement** (§12 rule 4).

**Provenance is kept.** `activity_record.import_id` and `import_row_id` are what
let step 13 trace a disclosed figure back to the row a customer uploaded. Do not
drop them as redundant.

### The enums

Declared once in `lib/validation/activity.ts` and turned into `pgEnum`s in
`lib/db/schema.ts` (§9.2 rule 2):

- `activity_import_status` — `staged`, `committed`, `discarded`, `failed`. A
  state, not a boolean, and `failed` exists because a file that cannot be parsed
  at all still deserves a row a person can see (§8.2 rule 4).
- `activity_import_row_status` — `valid`, `invalid`, `committed`.
- `activity_category` — the activity kinds the four-verb loop names:
  `electricity`, `fuel`, `heat`, `waste`, `water`, `travel`, `freight`,
  `other`. **A judgement, not a measurement**, and step 10 may need to extend
  it; extending an enum is cheap, forking a parallel column is not (§9.2
  rule 7).
- `activity_unit` — `kWh`, `MWh`, `L`, `m3`, `kg`, `t`, `km`, `tkm`. Also a
  judgement. Units are what was *measured*; emission factors are step 10's and
  no factor, coefficient or tCO₂e value is written by this step.

### The pure layer

`lib/domain/csv.ts` — a hand-written RFC 4180 parser, and the choice is
deliberate rather than incidental. **No CSV package is installed and none is to
be installed for this step.** The reasoning, to be recorded rather than
re-derived: the parser must be pure, deterministic and independently testable to
sit in `lib/domain/` at all, the grammar it must handle is small and fully
specified, and §12 rule 2 makes an unverified third-party API a cost rather than
a saving. Its supported grammar must be **stated in the module docblock and
bounded explicitly**: comma delimiter, `"`-quoted fields with `""` escaping,
`CRLF` or `LF` line endings, a leading UTF-8 BOM stripped, a required header
row. Anything outside that grammar is a parse failure with a row number, never
a silent mis-parse. If a file cannot be decoded as UTF-8, that is a whole-file
failure with a legible message.

`lib/domain/activity-import.ts` — two pure functions:

1. **header mapping.** A fixed alias table maps common vendor headers onto the
   canonical fields (`site`, `date`, `category`, `description`, `quantity`,
   `unit`), matching on a normalised form of the header — lowercased, trimmed,
   punctuation and whitespace collapsed. It returns a *proposal* per canonical
   field: the matched column index or none. It never guesses beyond the table
   and never invents a column.
2. **row coercion.** Given a mapping and a raw row, produce either a coerced row
   or a per-field error. Dates are parsed to an unambiguous `YYYY-MM-DD`; a
   quantity is validated as a decimal string and **never passed through
   `Number`** — the string is what reaches `numeric` (see above); category and
   unit are matched case-insensitively against the enum members.

Both take everything they need as arguments. Neither reads the clock, the
database or the environment.

### The flow

New authenticated tenant area at **`/activity`**, gated by
`requireOrganization("/activity")`.

```
/activity              upload form + this organisation's import history
/activity/[importId]   the staged import: mapping, counts, invalid rows, commit
```

Server Actions colocated at `app/activity/actions.ts` (§6.3's default —
this area is the single owner, unlike `app/_actions/`'s multi-surface forms):

**`stageImport(formData)`** — the upload. Stage letters exactly as §10 orders
them, copying `app/account/actions.ts`'s authenticated variant:

- **a. BotID — deliberately absent**, and written into the shipped action as a
  decision rather than an omission, exactly as step 8 records it. §8.2's rule
  covers *public* write paths; this one requires a live session, a verified
  email and a membership row, which is a strictly stronger gate, and adding it
  would mean listing `/activity` in `instrumentation-client.ts` — a two-file
  commitment whose half-application makes the server call fail rather than pass
  (§7.3).
- **b.** `getCurrentMembership()` first (there is no rate-limit key without the
  user id), then `checkActivityImportLimit(userId)`. A signed-out or
  organisation-less caller gets a handled `{ ok: false }` — never a redirect
  and never a throw (§10 rule 2).
- **c.** Server-side file gates, cheapest first, on the model of
  `app/_actions/application.ts`: presence, size against a stated maximum,
  declared type, then the bytes — decode as UTF-8 and require a parseable header
  row. **The declared `type` is not trusted on its own**; browsers report CSV
  inconsistently, so the parse is the real check.
- **d.** The organisation id comes from `getCurrentMembership()`, never from the
  form. This is stage d doing real work (§10 rule 6).
- **e.** Put the raw file privately, then write `activity_import` and its rows in
  **one transaction**. A failed write deletes the blob, exactly as the CV path
  compensates. Rows are inserted in batches rather than one statement per row.
- **f.** No email. Nothing on this path notifies anyone.

Returns the new import's id so the leaf can navigate to the review page. **This
is the one sanctioned navigation on a write path in this repository**: §10
rule 5 forbids a redirect because the phase-one forms sit inside settled,
measured marketing pages whose scroll and motion state a navigation would
discard. `/activity` is neither — moving to the staged import *is* the outcome.
Record the deviation and its reasoning in `docs/backend.md`; do not let it be
read later as licence to redirect a marketing form.

**`commitImport(importId)`** — `authorizeOrganization()` first, then a
re-read of the import scoped to that organisation. Inserts every `valid` row
into `activity_record`, marks those rows `committed` and the import `committed`,
in one transaction. Idempotent: an already-committed import returns a handled
result and writes nothing. Invalid rows are never committed and are never
silently dropped — they stay visible on the import.

**`discardImport(importId)`** — marks the import `discarded`, deletes the blob,
writes nothing to `activity_record`.

**`updateImportMapping(importId, mapping)`** — the human override that stands in
for the AI mapper. Re-validates every staged row under the new mapping and
rewrites the row statuses and the counts. Rejected once an import is committed.

Every one of the four re-resolves the tenant server-side from the session and
re-reads the import scoped to that organisation. **Passing an `importId` that
belongs to another organisation must be indistinguishable from passing one that
does not exist** — the same handled failure, no existence oracle.

### The visible outcome

§5.2's step 9 requires it explicitly, and §8.2 rules 4 and 5 fix its shape.
`/activity/[importId]` shows, built from the existing primitives and the
`/submissions` read idiom:

- the file, who uploaded it and when, and the import's status;
- the resolved column mapping, each canonical field naming the source header it
  came from or reading as unmapped, with the override control;
- the three counts — total, valid, invalid;
- the invalid rows with their row number and the reason, paged;
- commit and discard controls, present only when the import is `staged` —
  **and the actions authorise regardless**, because hiding a control is
  presentation and never enforcement (§6.2, §11.2 rule 2).

Success and failure are announced, focus is managed, and every state is legible
without colour (§8.2 rule 5), copying the announcement region in
`create-organization-form.tsx`.

**Register is measured and operational** (§5). "3 of 412 rows need attention",
not "Oops!" and not "Success! 🎉".

### The four small edits outside the new area

1. `proxy.ts`'s matcher gains `"/activity/:path*"`. **Enumerated, not
   widened** — the marketing routes must stay unmatched (§8.1).
2. `lib/validation/organization.ts`'s `RESERVED_SLUGS` gains `"activity"`,
   following that set's stated rule of covering every top-level route segment
   that exists.
3. `app/account/page.tsx` gains an "Import activity data" `ButtonLink` in the
   organisation section when a membership exists — the same treatment
   `/submissions` already gets. `/account` is already `ƒ Dynamic`.
4. `lib/rate-limit/index.ts` gains `checkActivityImportLimit(userId)` and
   `checkActivityCommitLimit(userId)`, both keyed by user id for the reason the
   organisation limiter records. **Both windows are judgements, not
   measurements**, and must say so in their docblocks like every window beside
   them.

`SiteNav` and `SiteFooter` are untouched (front matter: settled surfaces).

## Prerender impact

**Expected: none — no marketing route changes.** It must be *verified*, not
assumed (§8.1).

- `/activity` and `/activity/[importId]` are new `ƒ Dynamic` routes.
- `/account` is already `ƒ Dynamic` and stays so; its markup changes by one
  button, which is inside an authenticated route and therefore not prerendered
  HTML.
- No root provider is added, and none may be (§8.1).
- The nine static routes and the nine SSG routes must be byte-identical.

Verification, per `docs/automation.md` and the method step 8 used:

1. `npm run build` and confirm the route table matches §8.1 — `/`, `/about`,
   `/careers`, `/design-system`, `/journal` plus `/_not-found`,
   `/forgot-password`, `/reset-password`, `/sign-in`, `/sign-up`,
   `/verify-email` as `○ Static`; six `/article/[slug]` and three
   `/job-listing/[slug]` as `● SSG`.
2. Diff the prerendered HTML against a parent worktree at `HEAD`, **through the
   scratchpad copy**, and clear all three traps `docs/backend.md` records:
   stash the gitignored docs snapshots behind a restoring `EXIT` trap or the CSS
   chunking differs, normalise content-hashed JS chunk names as well as
   `BUILD_ID` and the CSS chunk, and never run the comparison while a
   `next dev` server is rewriting `.next`.
3. Quote the "N compared, M differed" number. **Do not quote a bare page-wide
   `magick compare -metric AE`** for `/`, `/journal` or `/careers` (front
   matter) — and if no markup changed there is no render to compare at all.

## Trust boundary

| what crosses | from | validated where | authorised by | rejection |
| --- | --- | --- | --- | --- |
| a CSV file + its filename | an authenticated browser | `stageImport` stage c — size, declared type, UTF-8 decode, parse | a live session **and** a `member` row for the target organisation | typed `SubmitResult` with a field error on the file input |
| `importId` | an authenticated browser | parsed as a uuid, then re-read scoped to the resolved organisation | `authorizeOrganization()` | the same handled failure as a non-existent id — no existence oracle |
| a column mapping | an authenticated browser | `updateImportMapping`'s schema — every index must exist in the stored header row | as above | typed field errors per canonical field |

**The organisation id never crosses the boundary.** It is resolved server-side
from the session's membership on every call. A form field carrying one would be
the whole multi-tenancy failure in a single line, and it must not appear
anywhere in this change.

**The staff/tenant orthogonality invariant holds unchanged** (§11.1): nothing
in this step reads `account.role`, and being `staff` or `admin` grants no read
of any tenant's activity data. The temptation §11 predicts arrives at step 12,
not here.

## Secrets and data

- **No new environment variable.** The change reads `DATABASE_URL` through
  `lib/db/client.ts`, `KV_REST_API_URL` / `KV_REST_API_TOKEN` through the
  limiter, and `BLOB_READ_WRITE_TOKEN` through `@vercel/blob` — all existing,
  all server-only.
- **No `NEXT_PUBLIC_*`.** Phase one needed none and this step needs none.
- Every new `lib/` module carries `import "server-only"` **except**
  `lib/validation/activity.ts`, which is the deliberate exception (§6.3) and
  must import nothing from `lib/db/`.
- **Personal and commercial data.** A customer's activity CSV is their
  commercial data (§5.3's last bullet, and §8.3's reasoning). It is stored
  privately, read only through a short-lived signed URL minted per authorised
  request, and **never sent to any third party** — no AI provider is involved in
  this step at all.
- **Nothing is logged.** No filename, no blob pathname, no cell value, no
  organisation name, no row body — not on success, not in a catch. As with
  `lib/storage/cv.ts`, there must be no `console` call on these paths.
- **Retention is finite and stated** (§8.3 rule 5). The raw blob is deleted when
  an import is discarded; state the retention intent for committed imports in
  `docs/backend.md` rather than building a permanent archive by default.

## Two inherited items, both to be resolved rather than carried forward

`docs/backend.md`'s step 8 record leaves these explicitly to this step:

1. **"Demonstrating it with a real staff account and a real organisation is the
   first thing step 9 should do."** Do it: create a staff account and an
   organisation it is not a member of, and show that a staff session cannot read
   that organisation's imports or activity records. If it cannot be demonstrated
   in this session, say so plainly as a gap (§12 rules 3 and 9) — do not report
   the structural argument as a demonstration.
2. **"`member` carries no unique constraint on `(organization_id, user_id)` …
   Worth revisiting with the library before step 9 relies on one row per
   pair."** This step's `getMembership()` calls do rely on it. Read Better
   Auth's own behaviour in `node_modules/better-auth` (§12 rule 2), record what
   is actually guaranteed, and state whether duplicate rows are possible. Do
   **not** hand-add a constraint to the generated `auth-schema.ts` without
   saying so — the auth schema is generated (§9).

## Non-goals

Deliberately out of scope, with the reason:

| not doing | why |
| --- | --- |
| emission factors, scope 1/2/3 calculation, any tCO₂e figure | step 10. This step writes what was *measured*, never a computed emission |
| targets, forecasting, the "16% off your 2027 goal" reading | step 11 |
| any dashboard route or chart; `home/dashboard.tsx` stays a marketing illustration | step 12 |
| report generation or export | step 13 |
| scheduled recalculation, threshold alerts | step 14 |
| **AI header mapping** — no AI SDK, no provider, no model, no prompt | §5.3: sanctioned but not scheduled, and the user chose deterministic. The review UI built here is what it would drop in behind |
| connectors, an ingestion API, a webhook | §5.2 says "CSV import first, connectors later" |
| a site management UI (create, rename, merge, delete) | sites are created implicitly by an import; a CRUD screen is not in step 9 |
| editing or deleting a committed `activity_record` | provenance matters more than convenience here; design it with the erasure path, as step 8 did for organisation deletion |
| organisation invitations, a members UI | step 8's deferred work, unchanged by this |
| a CSV parsing package, XLSX support, delimiter sniffing | stated grammar, stated bounds; anything else is a parse failure with a row number |
| touching `SiteNav`, `SiteFooter`, or any marketing route's markup | §8.1 and the front matter's settled surfaces |
| widening `proxy.ts`'s matcher beyond an enumerated `/activity/:path*` | §8.1 |
| any staff bypass into tenant data | §11, explicitly |

## Checks to run

All of §2, with **exact output quoted** and nothing claimed that was not run
(§12 rule 3):

1. `npm run db:generate` — quote the table count and the migration filename it
   writes. The migration is generated, never hand-authored, and no `ALTER TABLE`
   is run by hand (§9).
2. `npm run db:migrate` — quote the result. It goes over `DATABASE_URL_UNPOOLED`
   through `drizzle.config.ts`; **never the pooled URL** (§7.3).
3. Read the applied schema back from `information_schema` — the four tables,
   their column types, the enums, the foreign keys and the unique indexes — and
   quote it. A generated migration is not evidence that it applied.
4. `npm run lint`.
5. `npm run typecheck`.
6. `npm run build`, with the route table and the prerender diff under
   "Prerender impact" above.
7. `npm run test:e2e:local` for the native Chromium / Firefox matrix. WebKit
   needs Podman; if it is unavailable, say so as a gap rather than reporting the
   matrix as green.
8. Exercise the flow against a running app with a real organisation: a good
   file, a file with invalid rows, a mapping override, a commit, a discard, and
   a cross-tenant `importId`. Anything not exercised is reported as not
   exercised.

Note that **there is no unit-test script in this repository** (§2's gaps note).
`lib/domain/`'s two modules are pure and are the first thing here that wants
one. Do not invent a script name or claim a test run; if a harness is worth
adding, say so and let it be its own decision.

## Documentation

Record the result in **`docs/backend.md`** as a new "Step 9 — activity-data
ingestion" section, in the shape the step 8 section uses: the decisions taken
and what each one bounds, the column types and enums as applied, every action
and its full field list, the two limiter windows marked as judgements, the
precision and scale chosen for `quantity` and why, the CSV grammar the parser
accepts, the redirect-on-success deviation from §10 rule 5 and its reasoning,
the prerender verification with its numbers, and what was deliberately not done.

**Nothing goes in `AGENTS.md`** beyond the two things the cap rule allows
(front matter), and this step needs neither a new index row nor a new invariant —
`docs/backend.md` is already indexed.

**One correction is owed under §12 rule 8.** `docs/backend.md`'s step 8 record
says organisation invitations are "the next prompt". They are not; this is.
Amend that line in the same change to say they remain deferred, rather than
leaving a statement the repository contradicts.

## SKILLS USED

Every skill below must be **invoked at execution time** (§1 step 7, §4) — the
ones already loaded while writing this prompt are not loaded when it runs.

- **`drizzle-docs`** — the four new tables, the enums, the foreign keys and the
  composite unique indexes; `numeric` precision/scale and its string return
  mode; the `db:generate` → `db:migrate` workflow and the pooled/unpooled split.
  Take the `pg-` pages; titles repeat across six dialects.
- **`zod-docs`** — the shared schemas in `lib/validation/activity.ts`, the
  per-row coercion, `safeParse`, and `z.flattenError` onto `fieldErrors`
  (`error.flatten()` is deprecated in v4).
- **`nextjs`** — Server Actions, the `app/activity/` route tree, `async`
  `headers()` / `cookies()`, `revalidatePath`, and `proxy.ts` (**not**
  `middleware.ts` — the file is renamed in Next 16 and a `middleware.ts` here
  is never loaded).
- **`vercel-storage`** — the raw CSV's private blob write and its short-lived
  signed read. Verify the API against `node_modules/@vercel/blob`'s
  `dist/index.d.ts` as `lib/storage/cv.ts` did, not from the skill's prose.
- **`neon-postgres`** — the transaction over the pooled connection, and the
  scale-to-zero cold start, which any latency figure quoted here must say
  whether it paid.
- **`organization-best-practices`** — resolving the membership and the active
  organisation, and confirming what Better Auth guarantees about one `member`
  row per `(organization_id, user_id)` pair.
- **`better-auth-security-best-practices`** — the authorisation checks inside
  every action, and that `proxy.ts`'s redirect is optimistic and never
  enforcement.
- **`tailwind-4-docs`** — the two new views' layout. Config-less; tokens live in
  `@theme` in `app/globals.css` and there is no `tailwind.config.js`.
- **`frontend-design:frontend-design`** — the import review view is real design
  work on a settled system, built from the existing primitives in
  `app/_components/`. No second design system (§7.5).
- **`vercel-functions`** — the upload's body size and the function duration a
  large import consumes. Fluid Compute, Node.js runtime, **never
  `runtime = "edge"`** (§7.1).

Deliberately **not** used: `vercel:ai-sdk` and any AI skill (§5.3 — no AI in
this step); `resend` / `react-email` (this path sends no mail); `gsap-*` (§7.5
forbids GSAP in backend UI, and the one granted exception is the demo dialog's
close button).

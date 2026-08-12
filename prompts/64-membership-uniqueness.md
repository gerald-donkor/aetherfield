# 64 — One membership row per (organisation, user)

## Scope, and why it is next

**AGENTS.md §5.2's build sequence is exhausted.** Steps 1–14 are committed, and
step 8's deferred invitations were closed by prompt 63 (`127fa8f`). Resolved
from the repository and `git log`, not from this file or `prompts/` (§12 rule 5).
So "next" is no longer a row of §5.2, and this prompt deliberately adds **no
feature** — §5.2's "do not overbuild" forbids inventing a step 15.

What it closes is an open item the build record itself raised and never
resolved. `docs/backend.md`, in the step 8 section:

> **`member` carries no unique constraint on `(organization_id, user_id)`.** That
> is Better Auth's generated schema as it stands, not an omission made here, and
> it is left alone because the auth schema is generated and never hand-authored
> (§9). Worth revisiting with the library before step 9 relies on one row per
> pair.

Steps 9–14 now all rely on exactly that. `getMembership()` in
`lib/db/organization-queries.ts:50` — described in its own doc comment as
"**This is the tenant check**" — reads `.limit(1)` off `member` with no
uniqueness guarantee behind it. A duplicate pair makes the row it returns, and
therefore the **role** it reports, arbitrary. That is the authorisation path for
every tenant-scoped read and write in phase two.

### What was verified in `node_modules/`, and what the actual exposure is

Read this session, per §12 rule 2, at
`node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs`:

- `createInvitation` (line 127) refuses when the invitee is **already a member**
  (`USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION`), and line 130 refuses a
  second pending invitation unless `resend` or
  `cancelPendingInvitationsOnReInvite` is set — the latter **is** set here
  (prompt 63), so it suppresses that error and cancels the prior pending ones.
- `acceptInvitation` (from line 264) checks status, expiry, recipient address,
  verified email and the membership limit — and then creates the member row.
  **It performs no already-a-member check at all.** Its only concurrency guard
  is `updateInvitation({ ..., fromStatus: "pending" })`, which prevents the same
  invitation being accepted twice, not two invitations being accepted once each.

**State the exposure honestly: this is a race, not an ordinary path.** Every
single-threaded sequence is already guarded at the application layer by the two
checks above. Reaching a duplicate needs concurrency — two `createInvitation`
calls interleaving around the pending-invitation read, or an accept interleaving
with an invite. The argument for fixing it is not that it is likely; it is that
the database currently has **no** defence under the one check the whole tenancy
model rests on, and a uniqueness invariant belongs in the schema rather than in
three call sites that happen to agree.

`app/invitation/[id]/actions.ts` was read in full: it re-checks status, expiry
and recipient before delegating, and maps four of the plugin's API error codes.
It does not check existing membership, and a unique-violation would currently
fall through to `MEMBERSHIP_ERRORS.GENERIC`.

## Reference material read for this prompt

- `AGENTS.md` §§5.2, 6.2, 8.1, 9, 9.2, 11, 12 — the sequence, the boundaries, the
  data-model rules, the anti-fabrication rules
- `docs/backend.md` — the step 8 section (generated schema, the `member` note
  quoted above), the step 8-invitations section closed by prompt 63, and the
  step 10 / 11 / 12 non-goals tables
- `lib/db/auth-schema.ts:95–112` — the `member` table and its two existing
  hand-added `index()` calls
- `lib/db/organization-queries.ts:40–90` — `getMembership`, `listMembershipsForUser`
- `app/invitation/[id]/actions.ts` — the accept/decline action in full
- `node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs`
  — `createInvitation` and `acceptInvitation`, cited by line above
- `drizzle.config.ts`, `lib/db/migrations/` (through `0008_unique_mystique.sql`)
- `drizzle-docs` skill, `references/docs/305-pg-indexes-constraints.md:366–384`
  — the Postgres `uniqueIndex(name).on(...)` form, in the same third-argument
  array as the existing `index()` calls
- `scripts/generate-auth-schema.py` and the "The generated schema" subsection —
  which establish that `auth-schema.ts` is **already not purely generated**

## The work

### 1. The pre-check — run this first, and let it decide step 2

A unique index cannot be created over existing duplicates. Before generating
anything, read the live table over the **direct** connection:

```bash
dotenv -e .env.local -- npx tsx -e "<a read-only query grouping member by
(organization_id, user_id) having count(*) > 1, printing pair counts only>"
```

**Print counts and ids only — never an email, a name or an organisation name**
(§8.3 rule 2). Quote the exact output in the commit and in `docs/backend.md`.

- **No duplicates** — the expected result — proceed to step 2 unchanged.
- **Duplicates exist** — **stop and report** (§12 rule 9). Do not write a
  dedupe migration on your own judgement: choosing which of two membership rows
  survives is a decision about someone's role in a tenant, and it is the user's.

### 2. The constraint

In `lib/db/auth-schema.ts`, add to `member`'s existing third-argument array:

```ts
uniqueIndex("member_organizationId_userId_unique").on(
  table.organizationId,
  table.userId,
),
```

Import `uniqueIndex` from `drizzle-orm/pg-core` alongside the existing `index`.

**Comment it as hand-added, next to the two `index()` calls that already are.**
The record says `auth-schema.ts` "is not purely generated, carrying hand-added
`index()` calls, the `relations()` block and the `rate_limit` table", so this
follows an established precedent rather than breaking §9's
"generated, never hand-authored" rule — but a future `scripts/generate-auth-schema.py`
run produces output without it, and the comment is what stops the next merge
dropping it silently.

Then `npm run db:generate` and `npm run db:migrate`. **Do not hand-write the
migration and do not use `drizzle-kit push`.** Quote the generated file's name
and its SQL.

### 3. The application-layer message

In `app/invitation/[id]/actions.ts`, before the `acceptInvitation` call and
after the recipient check (stage **d**, where the other refusals already sit),
read the caller's membership of `invitation.organizationId` through the existing
`getMembership()` and return a typed refusal if one exists.

- It is a **typed result, never a throw** (§10 rule 2), using a new
  `MEMBERSHIP_ERRORS` constant in `lib/validation/organization.ts` alongside the
  existing ones — voice per §5: measured, no exclamation, no apology.
- It keeps the file's existing lettered stage order and its comment idiom.
- Nothing personal is logged.
- `decline` is unchanged.

This is the same shape as the recipient check the file already documents as
refusing "first so a mismatch is a sentence rather than an exception". It closes
the ordinary path; the index closes the race. **Both, not either.**

## Prerender impact

**none — no route changes.** `/invitation/[id]` is already dynamic and its
markup is untouched; this changes a schema file, a migration, one action and one
validation constant. **Verify, do not assume** (§4): run `npm run build`, confirm
the route table matches, and diff the 21 prerendered pages against `127fa8f` per
`docs/automation.md` — with the standing warning that `/`, `/journal` and
`/careers` are never quoted as a bare page-wide `AE`.

## Trust boundary

No new request path and no new endpoint. The one change on an existing path is a
**tightening**: an authenticated, rate-limited, session-gated accept action gains
one more server-side refusal before its write. Nothing new crosses from the
browser — the invitation id was already re-read server-side and the organisation
id comes from the invitation row, never from the client. A rejected request
returns the existing `SubmitResult` shape. The database constraint authorises
nothing; it makes an invariant the authorisation check already assumed true.

## Secrets and data

- No new environment variable, and no `NEXT_PUBLIC_*`.
- The migration and the pre-check use the existing `DATABASE_URL_UNPOOLED`
  through `dotenv -e .env.local`; the app keeps the pooled `DATABASE_URL` (§7.3).
- No personal data is stored, transmitted or logged. **The pre-check prints
  counts and ids only** — no address, no name.
- No email, blob or AI provider is involved.

## Non-goals

| not doing | why |
| --- | --- |
| a step 15, or any new product feature | §5.2 is exhausted and "do not overbuild" is explicit. If something seems necessary, ask |
| a unique constraint anywhere else in the auth schema | this one is the tenant check; the others were not flagged and speculative constraints on a generated schema are how it drifts |
| regenerating `auth-schema.ts` through `scripts/generate-auth-schema.py` | the generated output would not contain this index. Regeneration is its own change, and this prompt only adds the comment that survives it |
| a dedupe or merge migration | conditional on the pre-check, and it is the user's decision, not this prompt's (step 1) |
| a members-UI change, or any new organisation surface | prompt 63 shipped those and they are unaffected |
| touching `getMembership()`'s `.limit(1)` | with the index it is exact. Changing it would hide the invariant rather than assert it |
| any marketing route, `SiteNav`, `SiteFooter` or GSAP | §8.1 and the front matter's settled surfaces |

## Checks

Run every one and quote its exact output (§2, §12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — the domain suite must stay green; it is untouched by this
- `npm run build` — plus the route table and the prerender diff above
- `npm run test:e2e:local` — Chromium and Firefox
- **`npm run test:e2e:webkit` cannot run here: `which podman` returns
  "podman not found".** Say that plainly; the last commit had the same gap. Do
  not claim WebKit passed and do not silently omit it.

Record the result in **`docs/backend.md`** — a new section after "Step 8's
deferred invitations, closed by prompt 63", carrying the pre-check output, the
generated migration's name and SQL, the verified `crud-invites.mjs` findings with
their line numbers, and the honest statement that the exposure was a race rather
than an ordinary path. **Correct the step 8 note quoted at the top of this file
in the same change** rather than leaving it standing as an open question (§12
rule 8). Nothing goes in `AGENTS.md`: this adds no index row and no new
site-wide invariant.

## SKILLS USED

- **`drizzle-docs`** — the Postgres `uniqueIndex().on()` form and the
  generate/migrate workflow. Take the `pg-` file; the title repeats across six
  dialects
- **`organization-best-practices`** — Better Auth's membership model, to confirm
  one-row-per-pair is the library's intent and that a unique index does not
  fight the plugin's own writes
- **`better-auth-best-practices`** — the Drizzle adapter and the generated-schema
  boundary, before hand-adding anything to `auth-schema.ts`
- **`neon-postgres`** — the pooled/direct split for the migration and the
  pre-check, and scale-to-zero when reading any timing
- **`nextjs`** — Next 16 Server Action conventions before editing the accept
  action, since almost every tutorial predates them
- **`zod-docs`** — only if the validation change touches a schema rather than
  adding a plain error constant

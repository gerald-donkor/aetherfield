# 73 — Organisation deletion and erasure

## Scope, and why it is next

Every step of AGENTS.md §5.2 is committed — steps 1–14, resolved from the
repository and `git log` (`f9e102b` is step 14; prompts 63–72 are approved
post-sequence work). So scope comes from the recorded deferrals, and one of them
is named as the leading item twice over:

- `docs/backend.md:5244` — "organisation soft-delete and erasure | the largest
  open item, but deferred scope with a recorded reason, and it wants its own
  prompt".
- `lib/auth/server.ts:126-132` — `disableOrganizationDeletion: true`, with the
  reason recorded in the source: "Deletion is out of scope for step 8, and off
  rather than merely unbuilt: the plugin's delete cascades members and
  invitations, while §9.2 rule 5 wants a soft-delete with an audit trail so an
  erasure request is one reversible operation. Design the two together, later."

This is a **standing contract gap, not a new feature**. AGENTS.md §9.2 rule 5
requires soft-delete with an audit trail for anything a person can ask to have
removed; §8.3 rule 5 requires retention to be finite and stated. An organisation
today can be created and never removed, and a customer's commercial data — sites,
imports, activity records, computed emissions, targets, reports, and the private
CSV blobs behind the imports — has no exit. Both rules are currently unmet for
the largest object in the schema.

It is also **not a step 15**. §5.2 remains the ordered plan; this is approved
post-sequence work, on the same footing as prompts 63–72.

### The shape, decided with the user on 13 Aug 2026

Asked before this file was written, because the two answers change what gets
built:

- **Grace window, then purge.** An owner requests deletion; the workspace locks
  immediately (every tenant read and write refuses) but is restorable, and a
  sweep then hard-deletes the tenant rows and their private blobs.
- **The window is 30 days**, stated in the confirmation copy and in the locked
  notice.

Both are the user's decision, taken over "immediate erasure" and "soft-delete
only". The 30 days is a **product decision recorded as such**, not a measurement
(§12 rule 4) — there is no traffic to fit it against, exactly as
`organizationLimit` and `invitationExpiresIn` in `lib/auth/server.ts` say of
themselves.

## Reference material read for this prompt

Read in full, by path, before this file was written:

| path | what it settled |
| --- | --- |
| `AGENTS.md` §§6.2, 6.3, 8.1, 8.3, 9.1, 9.2, 10, 11, 12 | the contract this obeys |
| `docs/backend.md:5234-5250` | prompt 71's deferral table, naming this item |
| `lib/auth/server.ts:92-191` | the organization plugin block, `disableOrganizationDeletion: true` and its recorded reason |
| `lib/auth/organization.ts` (whole) | `getCurrentMembership`, `requireOrganization`, `authorizeOrganization` — the tenant gate |
| `lib/auth/tenant.ts` (whole) | `resolveTenant()`, the action-side gate, and why it takes no organisation id |
| `lib/auth/organization-access.ts` | the two tenant roles; `owner` is the only one that may do this |
| `lib/db/organization-queries.ts` (whole) | `getMembership`, `listMembershipsForUser`, `listAllOrganizationIds` |
| `lib/db/auth-schema.ts` (whole) | the generated auth tables, and the hand-added indexes that must survive a regeneration |
| `lib/db/schema.ts` | every tenant table, its `organization_id` nullability, its `onDelete` mode and its `deleted_at` |
| `lib/storage/activity-import.ts` | `deleteActivityImport(pathname)`, already written and already the discard path |
| `app/account/page.tsx`, `app/account/actions.ts:1-120` | the surface this lands on, and the action shape it copies |
| `app/api/cron/recalculate/route.ts`, `.../sweep.ts`, `vercel.json` | the existing cron, its `CRON_SECRET` gate and its 02:00 schedule |
| `node_modules/better-auth/dist/plugins/organization/types.d.mts:250-286` | `schema.organization.additionalFields` exists in 1.6.26 — the alternative design, and why it is rejected below |

### The facts verified, so the implementation does not re-derive them

1. **`emission_factor_set.organization_id` and `emission_factor.organization_id`
   are `onDelete: "cascade"`** (`lib/db/schema.ts:516-518`, `602-604`), not
   `set null`. So deleting the `organization` row deletes a customer's private
   factor set rather than orphaning it into the published set every tenant reads
   (§9.2 rule 6's narrow exception). **This is verified-safe, not a fix to make**
   — but the implementation must re-confirm it rather than trust this line, since
   a `set null` there would be a silent cross-tenant leak of exactly the kind
   that rule exists to prevent.
2. **The only tenant blob is `activity_import.blob_pathname`**
   (`lib/db/schema.ts:297-300`). `report` stores its evidence as text
   (`lib/db/schema.ts:1037+`), not a blob; `lib/storage/cv.ts` is a phase-one
   job-application concern and belongs to Aetherfield, not to a tenant.
3. **There are exactly two tenant chokepoints**, which is what makes this
   lockable in two functions instead of at thirty call sites:
   - pages — `requireOrganization()`, 8 callers (`app/dashboard/page.tsx`,
     `app/activity/page.tsx`, `app/activity/[importId]/page.tsx`,
     `app/activity/mappings/page.tsx`, `app/activity/factors/page.tsx`,
     `app/targets/page.tsx`, `app/reports/page.tsx`,
     `app/reports/[reportId]/page.tsx`);
   - actions — `resolveTenant()` in `lib/auth/tenant.ts`.

## The design

### A. The marker lives in our own table, not on Better Auth's `organization`

New table `organization_deletion` in `lib/db/schema.ts`, and **no column is
added to the generated `organization` table**.

`schema.organization.additionalFields` does exist in better-auth 1.6.26
(verified at `types.d.mts:257-261`), so this is a choice between two workable
designs and the reasoning is recorded rather than assumed:

- §9.1 says Better Auth's tables are generated and not to be extended by hand,
  and `lib/db/auth-schema.ts:112-125` already records what a regeneration costs —
  the hand-added `member` unique index survives only because someone remembers it.
- §9.2 rule 5 asks for **an audit trail**, which is who requested, when, when the
  purge is due, whether it was cancelled and by whom, and when it completed. That
  is a row with a lifecycle, not a nullable timestamp.
- Decisively: **the audit row must outlive the purge.** The purge deletes the
  `organization` row; a column on it is destroyed by the very operation it is
  supposed to record.

Columns, following §9.2 rules 2 and 3 and the naming already in `schema.ts`:

| column | type | note |
| --- | --- | --- |
| `id` | `uuid` pk `defaultRandom()` | as every phase-two table |
| `organization_id` | `text` not null | **deliberately no foreign key** — the row must survive the purge that deletes the organisation. Document this inline; it is the one place in the schema where the absence of an FK is the point |
| `organization_name`, `organization_slug` | `text` not null | snapshot, so the trail is readable once the organisation is gone |
| `status` | `organization_deletion_status` enum | `pending` \| `cancelled` \| `purged`, defined once with `pgEnum` and imported (§9.2 rule 2) |
| `requested_at` | `timestamptz` not null | |
| `requested_by` | `text` not null | the user id, no FK, same reasoning |
| `scheduled_purge_at` | `timestamptz` not null | `requested_at` + the window. Stored rather than computed, so changing the constant later never moves a promise already made to a customer |
| `cancelled_at`, `cancelled_by` | nullable | |
| `purged_at` | nullable | |
| `purge_error` | `text` nullable | a failed sweep leaves the row `pending` and records why, so the next night retries rather than silently giving up |
| `created_at` | `timestamptz` not null default now | §9.2 rule 3 |

Indexes: a **partial unique index on `organization_id` where `status = 'pending'`**
— one open request per organisation, enforced in the schema rather than by the
action happening to check first (the same argument `lib/db/auth-schema.ts:112-125`
makes for the `member` unique index). Plus an index on
`(status, scheduled_purge_at)` for the sweep's due-rows read.

The window constant lives in `lib/validation/organization.ts` as
`ORGANIZATION_DELETION_WINDOW_DAYS = 30`, so the action, the confirmation copy
and the locked notice all read one value.

### B. The locked state — two functions, and every page and action follows

`lib/db/organization-queries.ts`:

- `Membership` gains `pendingDeletion: { scheduledPurgeAt: Date } | null`, filled
  by a left join to `organization_deletion` on `status = 'pending'`, in both
  `getMembership()` and `listMembershipsForUser()`.
- new `getPendingDeletion(organizationId)`, `createDeletionRequest(...)`,
  `cancelDeletionRequest(...)`, `listDueDeletions(now)`, `markPurged(...)`,
  `recordPurgeError(...)` — all tenant-predicated except `listDueDeletions`,
  which is the sweep's read and carries the same justification
  `listAllOrganizationIds()` already carries in its docblock.
- **`listAllOrganizationIds()` must exclude organisations with a pending
  deletion.** Recalculating a workspace that is being erased is wasted work, and
  step 14's threshold alerts would email a customer about a target inside a
  workspace they have asked to have removed.

`lib/auth/organization.ts`:

- `CurrentMembership` gains `pendingDeletion`, and `getCurrentMembership()`
  keeps returning the membership when it is set — `/account` is the one surface
  that must still render for a locked organisation, or the owner can never
  reverse it.
- **`requireOrganization()` redirects to `/account` when `pendingDeletion` is
  set.** That locks all eight pages with no call-site edit.
- **`authorizeOrganization()` returns `null` when it is set**, and
  `resolveTenant()` in `lib/auth/tenant.ts` returns its handled
  `{ ok: false, error: messages.noOrganization }`. That locks every authenticated
  action with no call-site edit — but the copy is then wrong ("create one"), so
  `TenantMessages` gains a fourth message, `organizationLocked`, and each of the
  three action files passes its own sentence, exactly as the existing three are
  passed per-flow.

The two new actions themselves must **not** go through the lock: `restore` is
the only thing a locked organisation can do. They resolve membership directly
and require `role === "owner"`.

### C. Erasure

New route `app/api/cron/purge-organizations/route.ts`, plus its `sweep.ts`,
copying `app/api/cron/recalculate/`'s shape — including the fail-closed
`CRON_SECRET` check, which is not optional on an endpoint that deletes tenant
data. `vercel.json` gains a second cron at **`0 3 * * *`**, an hour after the
recalculation, so a purge never races a recalculation of the same tenant, and a
`maxDuration` entry alongside the existing one.

Order, and the order is the design:

1. **Blobs first.** For each `activity_import` of the organisation with a
   non-null `blob_pathname`, call `deleteActivityImport(pathname)` and null the
   column as each succeeds — so a sweep that dies partway is resumable and never
   loses the pointer to a blob it has not yet deleted. Blobs are not in Postgres
   and no cascade reaches them; deleting the rows first would orphan a customer's
   commercial data in storage permanently.
2. **Then one statement**: delete the `organization` row. Every tenant table's
   `organization_id` is `onDelete: "cascade"`, so members, invitations, sites,
   imports, staged rows, activity records, mappings, computed emissions, targets,
   reports, alerts, alert preferences and the tenant's own factor sets and factor
   rows all go with it. The implementation must **confirm this against
   `lib/db/schema.ts` at execution time** and list what it confirmed in
   `docs/backend.md` — a table added later with a different `onDelete` mode is
   the failure this step cannot detect by itself.
3. `status = 'purged'`, `purged_at = now`. The audit row remains.

A failure at any stage records `purge_error`, leaves the row `pending`, and the
next night retries.

### D. The surface

`/account`, below the members panel, owner-only:

- **Not locked** — a "Delete organisation" section stating what is removed and
  that it is restorable for 30 days, behind a confirm dialog that requires typing
  the organisation's slug. Reuse `app/_components/primitives.tsx` and the shape
  of `app/_components/organization/members-panel.tsx`; no new design system
  (§7.5), no GSAP (§7.5 — the demo dialog's close button remains the one granted
  exception and this is not it).
- **Locked** — the organisation section is replaced by a notice giving the purge
  date and a "Restore organisation" control. `MembersPanel`, the alert control
  and the "Open overview" link do not render, and `CreateOrganizationForm` must
  **not** appear: a locked organisation is not "no organisation yet".
- A member who is not an owner sees the locked notice without the restore
  control, and no delete control at all — presentation only; the actions
  authorise server-side regardless (§6.2, §11.2 rule 2).

### E. Email

One best-effort message to every owner on a deletion request, through
`lib/email/`, stating the purge date and how to restore. Extends
`lib/email/organization.ts` rather than adding a parallel module. **A failed send
never fails the write** (§10 rule 4), it is not awaited into the result path, and
nothing about it is logged (§8.3 rule 2). No message on the purge itself — by
then there is no workspace to link to and the address was already told the date.

## Measurements

This prompt is mostly logic, and it is honest about that: **there is no comp and
nothing here is fitted to a recording.** The numbers it does carry are stated as
what they are (§12 rule 4, and the front matter's "measured or judged, and say
which"):

- **30 days** — the user's product decision, recorded as a decision.
- **`0 3 * * *`** — a judgement, derived from a constraint rather than measured:
  it must not overlap the existing 02:00 sweep, whose `maxDuration` is 300s.
- The `/account` layout follows the spacing already in `app/account/page.tsx`
  (`mt-20 md:mt-24` between sections, `mt-7` under a caption) — **read from the
  file, not chosen**.

What must be **measured, not asserted**, at execution time:

1. The full `onDelete` mode of every `organization_id` reference in
   `lib/db/schema.ts`, enumerated in the record.
2. The prerender check below, run rather than assumed.
3. A locked-organisation walk: with a `pending` row present, each of the eight
   `requireOrganization()` pages redirects to `/account`, and one action per
   action file returns its handled failure. Record what was exercised and what
   was not (§12 rules 3 and 9).

## Expected impact

### Prerender impact

**`none — no route changes`, and it must be verified rather than assumed**
(§8.1). Nothing here touches a marketing route, `SiteNav`, `SiteFooter` or a GSAP
surface. The nine static and SSG routes must come back from `npm run build`
byte-identical:

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

`/account` is already `ƒ` and stays `ƒ`. The two new cron routes are new `ƒ`
entries. Diff the prerendered HTML per `docs/automation.md`, with the standing
warning about `/`, `/journal` and `/careers` in force — mask the box, report the
remainder and the box separately, and **never quote a bare page-wide
`magick compare -metric AE`** for those three.

### Trust boundary

Two new Server Actions in `app/account/actions.ts` and one new cron route.

- **`requestOrganizationDeletion`** — crosses: the typed organisation slug, as a
  confirmation. Authorised by: a live session **plus** a membership row with
  `role === "owner"`, re-read from Postgres (§11.2 rule 5). The organisation id
  is **resolved server-side from the membership row and never accepted from the
  request** (`lib/auth/tenant.ts`'s rule). Validated by a shared Zod schema in
  `lib/validation/organization.ts`, run in the leaf as a courtesy and in the
  action as the check (§6.2). Rejected requests return the existing typed
  `SubmitResult` — never a throw, never a bare string (§10 rule 2). Rate-limited
  by user id through `lib/rate-limit/`, as `createOrganization` is. No BotID: the
  path requires a live verified session, which is strictly stronger, and adding
  `/account` to `instrumentation-client.ts` is the two-file commitment §7.3
  records.
- **`restoreOrganization`** — same authorisation, no payload beyond the action
  call; must bypass the lock, as §B says.
- **`/api/cron/purge-organizations`** — an external caller (§6.2's sanctioned
  category), gated fail-closed on `CRON_SECRET` exactly as
  `app/api/cron/recalculate/route.ts` is, holding no business logic beyond
  calling its sweep.

A non-owner member, a signed-out caller, and a caller naming another
organisation all get the same handled failure. Nothing in the copy discloses
anything about another tenant.

### Secrets and data

- **No new environment variable.** `CRON_SECRET` already exists and is read by
  the existing cron; no `NEXT_PUBLIC_*` is added, and `.env.example` is
  unchanged. Confirm with `vercel env ls` (names only — never a value, §8.4).
- **Personal data**: the audit row stores a user id and the organisation's name
  and slug. It stores **no email address and no personal name**, which is the
  minimum that makes the trail readable after the purge (§8.3 rule 1). The
  organisation-owner email addresses the notification goes to are read at send
  time and not stored by this change.
- **Nothing is logged** — not a request body, not an address, not a slug, on no
  path and in no catch (§8.3 rule 2). `purge_error` records a failure reason and
  must be written so it cannot carry a customer's data.
- **This is the change that makes retention finite** (§8.3 rule 5), which is the
  point of it.
- Every new `lib/` module carries `import "server-only"`; the shared schema and
  the window constant go in `lib/validation/organization.ts`, which stays the
  deliberate exception and must not import from `lib/db/` (§6.3).

## Non-goals

| not doing | why |
| --- | --- |
| enabling Better Auth's `deleteOrganization` endpoint | `disableOrganizationDeletion: true` stays. Its cascade is immediate and unaudited, which is the mismatch `lib/auth/server.ts:126-132` recorded. This builds our own path instead |
| a `beforeDelete` hook that throws to archive | the skill's suggested soft-delete pattern. Rejected: it works by making a documented endpoint fail, and §10 rule 2's "never throw" is the house rule |
| adding a column to any Better Auth table | §9.1, and §A's reasoning |
| deleting a **user** account, or Aetherfield's own `lead` / `subscriber` / `application` erasure | a different subject with different rules; those three already soft-delete. This prompt is about the organisation |
| an admin-side control to delete another tenant's organisation | §11.1's orthogonality — staff are not members, and a staff bypass is the failure `lib/auth/organization.ts:23-35` exists to prevent |
| a data export before deletion | genuinely wanted, genuinely separate: step 13's report export already exists, and "download everything" is its own prompt with its own format decisions |
| changing the 02:00 recalculation sweep's schedule or logic | beyond excluding locked organisations from `listAllOrganizationIds()`, which is required |
| set-metadata editing, retiring a set from the UI, bulk CSV import, market-based scope 2 | untouched prior deferrals |
| AI factor matching | §5.3 sanctions it and does not schedule it; deferred by prompts 65, 68, 69, 70 and still deferred |
| re-pointing existing organisations' mappings at a newer set | prompt 70's deferral, unchanged |
| any change to a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | out of scope entirely |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work, as prompts 63–72 were |

## Checks

Run every one and quote its exact output (§2, §12 rule 3):

- `npm run db:generate` — one new migration from `lib/db/schema.ts`, never a
  hand-written `ALTER TABLE` (§9)
- `npm run db:migrate` — applied over the **direct** connection
- `npm run lint`
- `npm run typecheck`
- `npm test` — `lib/domain/` is untouched here, so this is a regression check
- `npm run build` — and the route table, quoted, with the nine prerendered routes
  confirmed and diffed per `docs/automation.md`
- `npm run test:e2e` — WebKit will report `Podman is required for WebKit on Arch
  Linux`, which is the known environment gap on this machine. **State it as a
  gap, not a pass** (§12 rule 3), exactly as prompts 69–72 did

## Record the result

`docs/backend.md`, as a new section — **"Organisation deletion and erasure,
prompt 73"** — following the shape of "Superseding a published factor row,
prompt 71". It must carry the new table's column types, the enum, the indexes,
the migration number, the two new actions and their fields, the cron path and
schedule, the enumerated `onDelete` audit from §C step 2, the measured/judged
split, the check output, and its own "what prompt 73 deliberately did not do"
table carrying the deferrals above forward.

**Nothing goes in `AGENTS.md`** beyond, at most, nothing — no index row is owed
(`docs/backend.md` is already indexed), and no invariant here meets the front
matter's cap rule. One line in `AGENTS.md` §5.2 or §9 would be warranted only if
this change contradicts something written there; if it does, say so and fix that
line in the same change (§12 rule 8).

Then commit to `main`, unprompted, and do not push (§1 step 10).

## SKILLS USED

Invoke each of these at execution time — listing is not loading (§4).

- **`drizzle-docs`** — the new table, the `pgEnum`, the partial unique index, and
  the `db:generate` / `db:migrate` workflow. Postgres pages only; the index rows
  carry the dialect
- **`zod-docs`** — the shared deletion-confirmation schema in
  `lib/validation/organization.ts`, and the typed field errors the action returns
- **`better-auth-best-practices`** — the organization plugin block in
  `lib/auth/server.ts`, and confirming `disableOrganizationDeletion` stays set
- **`organization-best-practices`** — the plugin's own deletion, hooks and
  schema-customisation surfaces, all of which this prompt deliberately declines;
  loaded so the decline is informed rather than assumed
- **`better-auth-security-best-practices`** — the session and authorisation
  posture on a destructive owner-only path
- **`nextjs`** — Server Actions, the Route Handler, `revalidatePath`, and the
  async `headers()` / `cookies()` trap (§7.3)
- **`vercel-functions`** — the second cron entry, its schedule and its
  `maxDuration` in `vercel.json`
- **`vercel-storage`** — Vercel Blob deletion semantics behind
  `deleteActivityImport`, and confirming a private blob's removal
- **`vercel-env-vars`** — confirming `CRON_SECRET` exists and that no new
  variable is owed, by name only (§8.4)
- **`tailwind-4-docs`** — the `/account` section's utilities, config-less, tokens
  from `@theme` in `app/globals.css`
- **`react-email`** and **`email-best-practices`** — the owner notification in
  `lib/email/organization.ts`
- **`resend`** — the send path it goes out on

Not loaded, deliberately: any `gsap-*` skill (§7.5 forbids GSAP here), any
`figma:*` skill (there is no comp for this surface), and `vercel:ai-sdk` (no
model is called — §5.3's phase-one-style bar applies: nothing here benefits from
one).

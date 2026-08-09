# 48 — Blob upload and job applications (build step 5)

## Scope, and why it is next

**Build step 5 of §5.2** — `lib/storage/`, private CV upload, and the apply flow
on `/job-listing/[slug]` and `/careers`'s open-application card.

Resolved from the repository and `git log`, never from `prompts/` (§1, §12
rule 5):

| step | state | evidence |
| --- | --- | --- |
| 1 data layer | built | `lib/db/`, three migrations, `ff03de8` back to `6f120b2` |
| 2 demo capture | built | `app/_actions/demo-request.ts`, `26ad46c` |
| 3 email | built | `lib/email/`, `9778e41` |
| 4 newsletter | built | `app/_actions/newsletter.ts`, `app/newsletter/`, `ff03de8` |
| 6 Better Auth | **built, out of order** | `lib/auth/`, `app/sign-in`, `app/sign-up`, `4e0afb2` + `bddc456` + `7041706` |
| **5 applications** | **unbuilt** | no `lib/storage/`, no `@vercel/blob` in `package.json`, no application action, both "Apply now" buttons still inert |
| 7 submissions view | unbuilt | depends on 5 for applications to exist |

Step 5's dependencies (1 and 3) are both satisfied. It is the last unbuilt write
path, and step 7 — the only thing after it in phase one — reads all three
tables, so building 7 first would ship a view with an empty third section. The
`application` table already exists in `lib/db/schema.ts:147-169`, authored by
step 1 against exactly this step.

## Reference material — read before writing code

- `AGENTS.md` §§6.2, 6.3, 8.1–8.4, 9.1, 9.2, 10, 11 — the contract.
- `docs/backend.md` step 2, "The contract, in file order" (line 468) through
  "The dialog" (line 588) — **the files this step copies.** §5.2 calls step 2
  load-bearing and step 2's record says in terms that step 5 copies it.
- `docs/backend.md` step 3, "The two templates" (line 1019), "Idempotency"
  (1004) and "`waitUntil`, not `await`" (984) — the email pattern.
- `docs/backend.md` step 4, "Two accessibility defects" (2016) and "The leaf
  lands in every page's bundle" (1995) — both apply again here.
- `docs/careers.md` — the dashed frame, the marching dashes, and the measured
  card boxes and page heights the build diff must reproduce.
- `docs/job-listing.md` — the `Seal`'s tilt and offsets, and the overflow rule.
- `docs/automation.md` — build diffing and screenshot procedure.
- Source: `lib/validation/lead.ts`, `lib/validation/newsletter.ts`,
  `lib/validation/result.ts`, `app/_actions/demo-request.ts`,
  `app/_actions/newsletter.ts`, `lib/rate-limit/index.ts`,
  `lib/db/lead-queries.ts`, `lib/db/subscriber-queries.ts`, `lib/email/send.ts`,
  `lib/email/demo-request.ts`, `lib/email/templates/shared.tsx`,
  `app/_components/lead/demo-request-dialog.tsx`,
  `app/_components/newsletter/subscribe-dialog.tsx`,
  `app/_components/primitives.tsx` (`Field`, `Textarea`, `Button`),
  `app/_components/cards.tsx` (`JobCard`, lines 154-222),
  `app/_components/job/sections.tsx` (lines 128-183 — both Apply buttons),
  `app/_content/jobs.ts`, `instrumentation-client.ts`, `.env.example`.

## Prerequisite — provisioning, and it needs the user

`vercel env ls` on 9 Aug 2026 lists **no `BLOB_READ_WRITE_TOKEN`** (the Neon,
Upstash, Better Auth and Google names are all there; Blob's is not). So a Blob
store does not exist on `dgsloxx417s-projects/aetherfield` and **the flow cannot
be built against a real environment until one does** (§7.4: a mock is not a
resolution; §12 rule 9: report a blocked step, do not route around it).

Vercel Blob is **first-party, not a Marketplace integration**, so §7.4's
`vercel integration add` procedure does not apply — `vercel:vercel-storage` is
the skill that owns it. Provisioning creates a billable resource, so §7.4 rule 5
applies unchanged:

1. Read `vercel blob --help` and `vercel blob store add --help` **first** —
   the subcommand name and its flags are read back, never guessed (§12 rule 6).
2. **Stop and ask the user before running it**, quoting the exact command.
3. `vercel env pull .env.local` afterwards, then confirm the token's name with
   `vercel env ls` and write **that** name into `.env.example` — not the name
   §8.4's table predicts.

If the user declines, stop and report; do not build against a stubbed token.

## What gets built

### The contract, in file order

| file | role | server-only |
| --- | --- | --- |
| `lib/validation/application.ts` | shared Zod schema, field-error record, `ApplicationSubmitResult` | **no — deliberately** |
| `lib/storage/cv.ts` | the private blob write, and nothing else | yes |
| `lib/db/application-queries.ts` | `insertApplication()` — the only Drizzle caller for this table | yes |
| `lib/email/application.ts` + two templates | confirmation and internal notification | yes (templates: no, per step 3) |
| `lib/rate-limit/index.ts` | **edited** — one new limiter | yes |
| `app/_actions/application.ts` | the action, stages a–f | yes (`"use server"`) |
| `app/_components/application/apply-dialog.tsx` | the client leaf | client |
| `instrumentation-client.ts` | **edited** — BotID's path list | client |
| `.env.example`, `next.config.ts` | **edited** | — |

`SubmitResult` is imported from `lib/validation/result.ts`, never restated.
`formatRetry` is imported from `lib/rate-limit`.

### `lib/validation/application.ts`

Fields: `name`, `email`, `message?`. Trim and lowercase the email **before** the
format check, exactly as `lead.ts` and `newsletter.ts` do, so
`application_email_lowercase` can never be what catches a missed
`toLowerCase()` (§9.2 rule 4). A whitespace-only message parses to `undefined`,
not `""` — `application.message` is nullable.

**`jobSlug` is composed onto the schema in the action, not here**, exactly as
step 2 composes `source` (`docs/backend.md:493`). It is validated against
`JOBS` from `app/_content/jobs.ts` at write time — §9.2 rule 1: a reference, not
a foreign key, and an application must survive the role being removed from that
file. It is not a user-facing field, so a bad slug produces no field error: that
is a forged request, not a typo.

**The file is validated on the server side only.** Whether a `File` constraint
belongs in the shared schema at all is to be settled against the `zod-docs`
skill (`z.file()` exists in Zod 4 — confirm its behaviour and its browser cost
before importing it into a leaf); if it does not go in the shared module, the
client leaf does a courtesy `accept` + size check and the action does the real
one. Either way the server check is authoritative (§6.2).

### File constraints — every number here is a judgement, not a measurement

There is no traffic and no comp to fit against; say **judgement** if these are
ever revisited (front matter's measured-or-judged rule).

- **`application/pdf` only.** A single format keeps the reader in step 7 simple
  and is what a CV is normally sent as. Offer `.doc`/`.docx` only if the user
  asks.
- **5 MB maximum.**
- **Both checked server-side**, and the declared MIME type is **not** trusted on
  its own: the action also checks the leading `%PDF-` signature on the bytes it
  received. A browser-declared `type` is attacker-controlled (§8.2 rule 3).

### The upload path — Server Action, not a client upload token

The file travels in the Server Action's `FormData`. **This is the decision, and
the alternative is explicitly rejected:** `@vercel/blob/client`'s `upload()`
would need a Route Handler that hands a *write capability* to an unauthenticated
browser on a public marketing page, and §6.2 reserves Route Handlers for callers
that are not this application. The server-side `put()` keeps one mutation path
and never gives the browser a token.

The cost is Next's Server Action body limit — **`serverActions.bodySizeLimit`
defaults to 1 MB**, which a 5 MB CV exceeds. Verify that default in
`node_modules/next/dist/docs/` (§12 rule 2), then raise it in `next.config.ts`
to a value just above the file cap and record both numbers. The Zod cap, not the
body limit, is what produces the user-facing error.

### `lib/storage/cv.ts`

- `import "server-only"` at the top (§6.3).
- `put()` with **`access: 'private'`** (§7.3, §8.3 rule 4). **Verify `put`'s
  options and the private-access surface in `node_modules/@vercel/blob/` after
  installing** — the skill calls private access a public beta, and §12 rule 2
  forbids writing it from the skill's snippet alone. Record what the installed
  version actually exposes.
- **The pathname is non-guessable and carries no personal data**:
  `cv/<crypto.randomUUID()>.pdf`. Never the applicant's name, never their
  filename, never a sequential id. The applicant's own filename is stored in
  `application.cv_filename` for display and is sanitised before it is stored.
- `addRandomSuffix` and any cache/`contentDisposition` options are set only
  after reading what the installed package does with them.
- **Only the write.** Minting a signed read URL is step 7's; do not add an
  unused reader (§5.2, "do not overbuild").

### `app/_actions/application.ts` — the stages, in §10's order

`a` BotID → `b` rate limit by IP → `c` parse (schema + slug + file) → `d`
skipped, public by design → `e` **blob put, then insert** → `f` two emails,
best-effort.

- Stage e is ordered put-then-insert because `cv_pathname` is `notNull` and the
  insert needs it. **If the insert fails, `del()` the blob** best-effort so a
  failed submission leaves no orphaned CV, and log neither the pathname's
  contents nor any address.
- **Fails closed** on a BotID or limiter infrastructure error, returning the
  generic message, as steps 2 and 4 do.
- Returns `{ ok: true } | { ok: false, error, fieldErrors? }`. Never throws to
  the client. `z.flattenError()`, **not** the Zod-3 `error.flatten()`.
- Retry timing in words via `formatRetry`.
- **No `console` call anywhere in the file** — the same guarantee step 2 made,
  and the easiest one to verify.

### The limiter

One new `checkApplicationLimit(ip)` in `lib/rate-limit/index.ts`, prefix
`aetherfield:application`, `analytics: false`, sliding window. **Five per hour
per IP is a judgement**, matching the demo-request limiter: a person may
genuinely apply to two roles in a sitting, and an upload endpoint is more
expensive to abuse than a form. No per-address limiter — the newsletter's exists
because a confirmation email is a capability sent to a stranger's inbox, and
nothing here is.

### The two emails

Copy `lib/email/demo-request.ts` and its two templates; do not invent a second
pattern.

- **Applicant confirmation** — acknowledges the role by name. Register is
  measured and operational (§5): no "we're excited!", no promise of a timeline
  the company has not made.
- **Internal notification** — role, name, email, message. **Never the CV as an
  attachment and never a link to it**: the CV is read through a signed URL by an
  authorised session in step 7, and an emailed link is neither (§8.3 rule 4).
- `waitUntil`, not `await` — a failed email never fails the write (§10 rule 4).
- Idempotency keyed on the new row's id, as step 3 does.
- Both templates get `PreviewProps` and are inspected with `render()` directly.
  **There is still no email-preview script** and this step does not add one (§2).
- Every link sets `textDecorationLine` **and** `textDecoration`, and no anchor
  ships react-email's default `#067df7` — both defects step 4 found by rendering
  rather than by reading (`docs/backend.md:2016`).
- **New environment variable: `APPLICATION_NOTIFICATION_EMAIL`.** Ours, so the
  name is chosen here; server-only; **unset is supported** and skips the
  notification, logging no address — exactly `LEAD_NOTIFICATION_EMAIL`'s
  contract. It is a separate variable rather than a reuse because applications
  go to a recruiting inbox and demo requests to a sales one, and collapsing them
  is a decision nobody made.

### The UI — three trigger sites, one leaf, and two of them change

`app/_components/application/apply-dialog.tsx`, copied from
`demo-request-dialog.tsx`: native `<dialog>` + `showModal()`, focus to the
heading on open, focus back to the trigger on every route out, `role="status"`
+ `aria-live="polite"` announcement, success swaps the body in place with **no
redirect** (§10 rule 5), errors legible without colour alone.

It **takes the settled `<Button>` over and adds no box** — it renders the button
with the same props so the class string is unchanged and nothing enters the
measured layout.

| site | today | after |
| --- | --- | --- |
| `/job-listing/[slug]`, top button (`sections.tsx:132`) | `ButtonLink href="#apply"` | **unchanged** — it is an in-page anchor that works without JavaScript, and it already leads to the trigger below |
| `/job-listing/[slug]`, bottom button (`sections.tsx:182`) | inert `<Button>` | the dialog trigger, `jobSlug={job.slug}` |
| `/careers`, open-application card | inert `<Button>` inside `JobCard` | the dialog trigger, `jobSlug="open-application"` |

**`JobCard`'s default must not change.** `/design-system` renders it and its HTML
is to stay byte-identical, so the trigger is passed *in* — an optional
`actionSlot?: ReactNode` (or equivalent) that replaces the inert `<Button>` only
when `/careers` supplies it. Do not make `JobCard` a client component and do not
import the leaf inside `cards.tsx`.

Do **not** import the leaf from `chrome.tsx`. Step 4 recorded that doing so puts
it in the shared chunk on all eighteen pages (`docs/backend.md:1995`); these two
routes can import it directly and should.

**`Field` gains a file input, extended rather than forked** — the precedent is
step 2's textarea (`docs/backend.md:707`). It keeps the same label, hint and
error mechanics, and the chosen-file name is announced.

### BotID

Add the new trigger paths to `instrumentation-client.ts` — **a path missing from
that list makes `checkBotId()` fail rather than pass.** They are page paths: a
Server Action POSTs to the page it was invoked from. `/careers` is literal;
`/job-listing/[slug]` is dynamic, and **whether `initBotId`'s `protect` accepts a
pattern there, and in what syntax, must be verified in `node_modules/botid/`**
before it is written (§12 rules 2 and 6). If it does not, say so and take the
three literal paths from `JOBS`.

`next.config.ts` already wraps the config in `withBotId()`; nothing there
changes beyond the body-size limit.

## Prerender impact

**Two routes' prerendered HTML changes, and §5.2's step-5 row authorises exactly
these two:** `/careers` and `/job-listing/[slug]` (all three: `data-scientist`,
`product-manager`, `ux-designer`) gain a client leaf. Verified, not assumed:

- `/design-system` must stay **byte-identical** — it renders `JobCard` without
  `open` and without the new slot.
- `/`, `/journal`, `/about`, the six `/article/[slug]` pages, the newsletter and
  auth routes: **byte-identical** once the build id and content-hashed chunk
  names are normalised, per `docs/automation.md`.
- The route table stays as §8.1 records it — nine `○ Static`, the two SSG
  groups, and **no route may go dynamic**.
- Chunk-name churn on other pages is expected only if a shared chunk's *content*
  changes; script counts per page must be unchanged. Report it as step 4 did.

**Never quote a bare page-wide `magick compare -metric AE` for `/careers`** —
the open-application card's marching dashes sit at a different phase in any two
shots (front matter; `docs/careers.md:179`). Mask the dashed card's box, report
the remainder and the box separately.

## Trust boundary

An unauthenticated `POST` from a public marketing page, carrying a file.

- **Crosses:** name, email, optional message, job slug, and a PDF.
- **Validated:** in `app/_actions/application.ts` with the same Zod schema the
  leaf ran (§10 rule 1), plus the slug against `JOBS` and the file's type, size
  and `%PDF-` signature server-side.
- **Authorises:** nothing — the path is public by design (§11), and stage d is
  skipped for that reason and says so in a comment.
- **A rejected request returns** `{ ok: false, error, fieldErrors? }` — a typed,
  rendered, announced state. Never a throw, never a bare string, and **never a
  silent success** (§8.2 rule 4).
- Ahead of validation: BotID, then a five-per-hour-per-IP limiter, in that order
  (§10 rule 3).

## Secrets and data

- **Reads:** `BLOB_READ_WRITE_TOKEN` (name to be confirmed from `vercel env ls`
  after provisioning), `DATABASE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
  `RESEND_API_KEY`, `BETTER_AUTH_URL` (for absolute links in email),
  `APPLICATION_NOTIFICATION_EMAIL` (new).
- **`NEXT_PUBLIC_*`: none.** Phase one still needs none, and adding one would be
  a decision to make a value public (§8.4).
- Every new `lib/` module that reads one carries `import "server-only"`;
  `lib/validation/application.ts` deliberately does not, reads no secret, and
  **must not import `lib/db/`** — `schema.ts` calls `pgEnum` at module scope and
  an import there puts `drizzle-orm/pg-core` in `/careers`'s browser bundle.
- **Stores:** name, email (lowercased), optional message, job slug, the blob
  pathname and the applicant's filename — nothing else (§8.3 rule 1). The CV's
  bytes live only in private blob storage.
- **Logs:** nothing personal, on any path, including catches — no body, no
  address, no filename, no blob pathname. The email module's warning lines carry
  a template name, an error class and a row uuid, as step 3's do.
- **Retention** is stated, not enforced: `application.deleted_at` exists for
  soft-delete and is honoured on every read in the new query module; there is no
  scheduled deletion and no erasure endpoint, and step 7 is where a real control
  would land. Say this plainly in `docs/backend.md` rather than implying a
  mechanism exists (step 4's precedent, `docs/backend.md:1923`).
- **The sending-domain blocker is unchanged and still open.**
  `lib/email/config.ts` sends from Resend's sandbox sender, which delivers only
  to the account holder's address, so an applicant confirmation cannot reach a
  stranger today. Record it again as a known blocker; do not work around it.

## Non-goals

- **No signed read URL and no submissions view** — step 7 owns both, and an
  unused reader in `lib/storage/` is speculative work.
- **No application status workflow** (reviewed / rejected / hired). Not in the
  `application` table, not in §5.2, and not to be added.
- **No CV parsing, no text extraction, no AI of any kind** — §5.3: phase one
  uses none.
- **No `/design-system` exhibit** for the apply dialog. Step 4 declined the same
  thing for the same reason: this leaf is a copy, and it would change a settled
  page's HTML for no gain.
- **No GSAP.** The demo dialog's close-button hover is a user-granted exception
  for one surface (§7.5) and is not a licence to spread. This dialog's close
  button is the same markup with the same `transition-colors` and no tween.
- **No client-upload token endpoint**, per the rejected alternative above.
- **No change to the top "Apply now" anchor**, to `JobCard`'s default rendering,
  to the dashed frame's geometry, or to any measured number on either page.
- No `.doc`/`.docx` unless the user asks.
- No Resend webhook, no bounce handling — still a later decision with its own
  endpoint.

## Checks (§2)

Run every one and quote its exact output; never claim a pass without it.

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build` — quote the route table and confirm it matches §8.1's.
4. Prerender diff per `docs/automation.md`: `/design-system` and the twelve
   untouched pages byte-identical after normalising the build id and chunk
   names; `/careers` and the three job listings diffing **only** by the leaf.
5. `grep -rn "console\."` across the new action, leaf, storage, query and
   validation modules — expect nothing.
6. Against `npm run dev` with a real Blob token: submit a valid PDF and confirm
   the row, the private blob (`access` reported by `list()`/`get()`, **not**
   assumed), and both emails. Then confirm each rejection renders a visible,
   announced state: over-size file, non-PDF, a `.pdf` that is not a PDF, a bad
   email, a missing file, and a sixth submission inside the hour.
7. Reduced-motion and JavaScript-off pass on `/careers` — the marching dashes
   and the card boxes are unchanged by this step, and the diff must show it.

## Record the result

**`docs/backend.md`, a new `## Step 5` section** — the file contract, the blob
pathname scheme, every judged number said to be judged, the verified
`@vercel/blob` API surface, the provisioned variable's real name, the body-size
limit, the prerender diff, and the open blockers. **Never in `AGENTS.md`** (§8.5
and the cap rule); at most one index row there, and only if a new `docs/` file
is created, which this prompt does not expect. Then commit to `main`, unprompted
(§1 step 10).

## SKILLS USED

- **`vercel:vercel-storage`** — Vercel Blob: `put`, `del`, `access: 'private'`,
  and the provisioning path. Already loaded while writing this prompt; load it
  again at execution.
- **`vercel:env-vars`** — pulling and confirming `BLOB_READ_WRITE_TOKEN`, and
  the `.env.example` discipline.
- **`vercel:vercel-cli`** — `vercel blob store add` and `vercel env ls`, read
  from `--help` before running.
- **`vercel:nextjs`** — `serverActions.bodySizeLimit`, Server Actions with
  `FormData` and a `File`, and Next 16's async `headers()`.
- **`zod-docs`** — `z.file()` if it is used, `safeParse`, `z.flattenError`, and
  the trim/lowercase pipe order.
- **`drizzle-docs`** — the insert in `lib/db/application-queries.ts`. No schema
  change and **no new migration** is expected: `application` already exists.
- **`resend`** — the send call and idempotency keys.
- **`react-email`** — the two templates against the existing `shared.tsx` shell.
- **`email-best-practices`** — transactional-vs-marketing framing (both of these
  are transactional), and the link-accessibility rules step 4 was caught by.
- **`upstash-ratelimit-js`** — the new limiter's construction.
- **`upstash-redis-js`** — the lazily constructed client it sits on.
- **`neon-postgres`** — the pooled/direct split, unchanged, and the cold-start
  caveat on any latency number quoted.
- **`tailwind-4-docs`** — any class on the file field or dialog body.
- **`frontend-design:frontend-design`** — the dialog and the file field are
  design work on a measured site, not scaffolding.
- **`vercel:vercel-firewall`** — consulted only if BotID's coverage of the two
  new page paths raises a question this step must answer; otherwise skip and say
  so.

**Not used, deliberately:** `vercel:auth` (§7.2 — this project uses Better Auth,
and the skill recommends Clerk), `vercel:ai-sdk` and every AI skill (§5.3 —
phase one uses no AI), and the `gsap-*` skills (§7.5, and the non-goal above).

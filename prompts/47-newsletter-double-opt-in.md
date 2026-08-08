# 47 — Newsletter signup, double opt-in

## Scope, and why it is next

**Build step 4 of AGENTS.md §5.2** — `/journal`'s subscribe band, and the
confirm and unsubscribe routes behind it. It is next because it is the first
unbuilt row of the phase-one sequence: steps 1, 2 and 3 are committed
(`6f120b2`, `26ad46c`, `9778e41`), step 6's sign-in/sign-up is committed ahead
of sequence (`4e0afb2`, `bddc456`, `7041706`), and step 4's stated dependency —
"double opt-in cannot exist before email" — is satisfied by step 3.

**This step is a copy, not an invention.** Step 2 set the write path and step 3
set the email pattern; §5.2 says in terms that "steps 4 and 5 copy this file's
shape rather than inventing their own". Every deviation from
`app/_actions/demo-request.ts` and `lib/email/demo-request.ts` below is named
and justified; anything not named must match them.

### One prerequisite that is not this prompt's

`prompts/46-database-connect-happy-eyeballs-timeout.md` is **written and
unexecuted** (untracked in `git status`). It fixes an `ETIMEDOUT` on every
database query from the dev server on this machine — happy-eyeballs giving each
of the Neon pooler's six addresses 500 ms against a measured 320–410 ms RTT.
Nothing in this prompt depends on it at build time, but **every local
verification below touches the database**, so 46 should execute first or the
verification will fail for a reason that has nothing to do with step 4. Say so
rather than working around it (§12 rule 9).

## Reference material read for this prompt

Read this session, by path:

- `AGENTS.md` — §5.2 step 4, §6.2, §6.3, §8.1–8.4, §9.1–9.2, §10, §12
- `docs/backend.md` — step 1 (`lib/db/schema.ts`, the migration workflow),
  step 2 (§461–855: the contract in file order, the limiter, the action's
  stages, BotID's two halves, the dialog, `CtaBand`'s `demo` prop, the two API
  traps), step 3 (§856–1183: the send helper, `templates/`, idempotency, the
  sending-domain prerequisite)
- `docs/automation.md` — the prerendered-HTML diff helper and its traps
- `lib/db/schema.ts`, `lib/db/lead-queries.ts`, `lib/db/client.ts`,
  `lib/db/database-schema.ts`
- `lib/validation/lead.ts`, `lib/rate-limit/index.ts`
- `lib/email/config.ts`, `lib/email/send.ts`, `lib/email/demo-request.ts`,
  `lib/email/templates/demo-request-confirmation.tsx`
- `app/_actions/demo-request.ts`, `app/_components/lead/demo-request-dialog.tsx`
- `app/_components/chrome.tsx` (`CtaBand`), `app/journal/page.tsx`,
  `instrumentation-client.ts`, `.env.example`
- skills: `email-best-practices` (`references/email-capture.md`,
  `references/compliance.md`), `nextjs` (`references/route-handlers.md`)

## What to build

### 1. Schema — two columns and one migration

`subscriber` already exists (step 1) with `status`, `confirmationToken`,
`createdAt`, `confirmedAt`, `unsubscribedAt`, `deletedAt`. It is short two
things, and both are additive:

- **`confirmation_token_sent_at`** (`timestamp` with timezone, nullable) — the
  confirmation link expires, and `created_at` cannot date it once a resend
  rotates the token. Expiry is read from this column, never from `created_at`.
- **`unsubscribe_token`** (`text`, not null, unique) — **a second, stable
  token.** It must not be the confirmation token: that one is single-use and
  rotated on every resend, so an unsubscribe link built from it would break the
  moment it rotates and would leak a confirmation capability into a marketing
  footer that lives in an inbox for years.

Both go in `lib/db/schema.ts` with the reasoning in the docblock, then
`npm run db:generate` writes `0002_*.sql`. **Do not hand-write the SQL and do
not hand-run an `ALTER TABLE`** (§7.2). The unique index on
`unsubscribe_token` must be generated the same way `subscriber_confirmation_token_key`
was. Existing rows: the table is empty in every environment (nothing has ever
written it) — verify that with a `select count(*)` before generating, and if it
is not empty, stop and report rather than guessing a backfill.

No other column. No `source`, no `ip`, no `user_agent` — §8.3 rule 1.

### 2. `lib/validation/newsletter.ts`

The second module in `lib/validation/`, and the same rules apply: **not
`server-only`**, imports nothing from `lib/db/`, reads no secret. One field —
the email — trimmed and lowercased before the format check, exactly as
`workEmail` in `lib/validation/lead.ts` does it, with the same 254-character
bound and the site's register in the messages.

Export the schema, the field-error type, its `NO_FIELD_ERRORS` constant and
reuse `SubmitResult` from `lib/validation/lead.ts` if its shape fits; if the
field-error map makes that awkward, **move the shared result type to a shared
module rather than declaring a second one** — the point of the folder is that
the vocabulary exists once.

### 3. `lib/db/subscriber-queries.ts`

The only module that touches the `subscriber` table (§7.5). It needs:

- **an upsert-by-email** that returns the row's id, its resulting status, and
  the token to send. The behaviour is the interesting part and it is stated in
  the schema's own docblock: one row per address, so
  - no row → insert `pending` with a fresh confirmation token and a fresh
    unsubscribe token;
  - row `pending` → rotate the confirmation token, stamp
    `confirmation_token_sent_at`, send again;
  - row `unsubscribed` → back to `pending` with a fresh confirmation token
    (re-subscribing is not a second identity);
  - row `confirmed` → **no token, no state change, no email.** The action
    still returns success — see the trust-boundary section on enumeration.
  - `deleted_at is not null` is filtered on every read and treated as "no row"
    for the purposes above, per the schema's soft-delete rule.
- **confirm by token** — `pending` → `confirmed`, stamping `confirmed_at`,
  single-use (the update must be conditional on the current status so a
  replayed link cannot re-confirm), and rejecting a token whose
  `confirmation_token_sent_at` is older than the expiry window.
- **unsubscribe by token** — any status → `unsubscribed`, stamping
  `unsubscribed_at`. **Idempotent**: unsubscribing twice is a success, not an
  error. Never reveals whether the token matched a confirmed or a pending row.

Use Drizzle's `onConflictDoUpdate` on the unique email index rather than a
read-then-write, so two simultaneous submissions cannot both insert. Verify the
exact API against the `drizzle-docs` skill before writing it.

### 4. `app/_actions/newsletter.ts`

Copies `app/_actions/demo-request.ts` stage for stage (§10 a–f), including:

- **a.** `checkBotId()`, same try/catch, same generic failure.
- **b.** the rate limit, keyed by `ipAddress({ headers: await headers() })` —
  **wrapped, not bare**, per the trap `docs/backend.md` step 2 records.
- **c.** the same schema the leaf ran.
- **d.** skipped, public by design.
- **e.** the upsert, through `lib/db/subscriber-queries.ts`.
- **f.** the confirmation send, handed to `waitUntil`, never awaited, never able
  to fail the write.
- the same `formatRetry` register ("4 minutes", not "241s") — **import it
  rather than restating it**; move it to a shared module if that is what import
  requires.

Two actions more than step 2 had, both invoked from the new routes and both
subject to the same stages a–c:

- **`confirmSubscription(token)`** — from the confirm page's button.
- **`unsubscribe(token)`** — from the unsubscribe page's button.

Both take a token, not an address, and both return the same typed result shape.

### 5. Rate limiting — three limiters, and one of them is keyed by address

`lib/rate-limit/index.ts` gains, alongside the existing demo-request limiter:

- **per IP**, sliding window, for the signup action;
- **per address**, for the confirmation send specifically — the
  `email-best-practices` skill's `email-capture.md` gives "limit verification
  emails (3/hour per email)" and "allow resend after 60 seconds". Without it,
  one IP behind a limit of five can still be pointed at five different
  strangers' inboxes.

**The address is hashed before it becomes a Redis key.** `sha256` of the
already-lowercased address, hex, with the limiter's own prefix. A Redis key is
a store, and §8.3 rule 2's "never log an address" is about not scattering
addresses through systems that are not `subscriber` — an unhashed key would put
every submitted address in Upstash's console. State this in the docblock.

**Every number here is a judgement, not a measurement, and must say so** — the
form has never shipped, there is no traffic to fit against, and the existing
limiter's docblock is the model for how to write that down. Record the
reasoning, not just the value.

### 6. Email — one changed helper, two new templates

**`lib/email/send.ts` gains an optional `headers` passthrough.** Marketing mail
needs `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
(the `compliance.md` reference: Gmail, Yahoo and Microsoft require them of bulk
senders). **Verify the option's exact name and shape against
`node_modules/resend/` before writing it** — the step-3 record shows this SDK's
surface contradicting its own docs twice, and §12 rule 2 applies. If the
installed version has no such option, say so and stop rather than inventing one.

Nothing else about `send.ts` changes: both parts still rendered here, `react`
still never passed, failures still logged with a class and a template name and
never an address.

`lib/email/newsletter.ts` mirrors `lib/email/demo-request.ts` — the sends behind
one call, returning void, throwing nothing.

Two templates, both on `Shell` and its exported styles, neither forking the
vocabulary:

- **`newsletter-confirmation.tsx`** — the double opt-in request. Carries the
  confirm link, the expiry in words, an "if this wasn't you, ignore this
  message" line, and **no unsubscribe** — there is nothing to unsubscribe from
  yet, and the confirmation template's own docblock already argues that a
  transactional message carrying an unsubscribe is the hybrid the skill warns
  against.
- **`newsletter-welcome.tsx`** — sent on confirmation. This one **is
  marketing**, so it carries the visible unsubscribe link *and* the
  `List-Unsubscribe` headers, and it is the first email in this repository that
  does.

Idempotency keys follow step 3's `<event-type>/<entity-id>` format keyed on the
subscriber row's id — but **the confirmation send rotates its token**, so a
resend must key differently from the first send or Resend's 24-hour window will
swallow the second one. Key it on something that changes per send (the token
itself, or the row id plus the send timestamp) and record which, and why, in
`docs/backend.md`.

### 7. Routes

`/journal`'s band, plus the two routes §5.2 names:

- **`app/newsletter/confirm/page.tsx`** — reads `?token=`, renders a page in the
  site's existing primitives with one button, which invokes
  `confirmSubscription`. **The transition does not happen on render**, and that
  is a deliberate decision with two reasons: §6.2 puts mutations in Server
  Actions, and corporate mail scanners follow links in email, so a GET that
  confirms lets a scanner opt someone in. The cost is one extra click, and the
  alternative — confirming on render — is the more common industry choice.
  **If the user prefers one-click confirmation, this is the line to change at
  approval time.**
- **`app/newsletter/unsubscribe/page.tsx`** — same shape, one button, invoking
  `unsubscribe`. Reached from the visible link in the welcome email's footer.
- **`app/api/newsletter/unsubscribe/route.ts`** — the one-click endpoint named
  in the `List-Unsubscribe` header. **A Route Handler here is correct and not a
  §6.2 violation**: the caller is Gmail's or Yahoo's infrastructure, not this
  application. `POST` performs the unsubscribe and returns `200` with an empty
  body, per `compliance.md`; `GET` redirects to the page above so a client that
  follows the header as a link still lands somewhere designed. No business
  logic beyond calling the query layer.

Both pages are new routes and must render sensibly for **every** outcome:
confirmed, already confirmed, expired token, unknown token, unsubscribed,
already unsubscribed, and missing token. Enumerate them in the implementation
rather than collapsing them into "something went wrong" — §8.2 rules 4 and 5.

### 8. The band, and the client leaf

- **`CtaBand` gains `newsletter?: boolean`, opt-in, defaulting to false** —
  exactly the shape and the reasoning `demo` already carries. Do not infer it
  from the `action` string.
- `app/journal/page.tsx` passes it. This is the **only** settled page edited by
  this prompt.
- **`app/_components/newsletter/subscribe-dialog.tsx`** — the client leaf,
  copying `demo-request-dialog.tsx`'s structure: it renders the `<Button>`
  itself and takes the class string over, adds no box, uses native `<dialog>` +
  `showModal()`, focuses the heading in an effect (not in the click handler —
  the step-2 trap), announces through a focused `role="status"`, swaps to a
  success state in place with no redirect, and parses client-side as a courtesy
  only.
- **It does not copy the close button's GSAP hover or its tone.** The §7.5
  exception granted on 7 Aug 2026 was granted for the demo dialog after the user
  was shown the rule and offered a CSS-only alternative; it is not a licence to
  spread GSAP into the next piece of backend UI. This dialog's close button is
  the same markup with the same `transition-colors` and no tween. **If the user
  wants the affordance here too, that is a decision to make at approval time,
  not an assumption to implement.**
- The success copy says what actually happened — a confirmation email is on its
  way and the subscription is not active until the link is clicked. A success
  state that implies subscription completed would be a silent failure of the
  double opt-in.

### 9. BotID

`instrumentation-client.ts` gains the paths that now host an action:
`/journal` (the band), `/newsletter/confirm` and `/newsletter/unsubscribe`.
**A path missing from that list makes `checkBotId()` fail rather than pass**, so
this is not optional bookkeeping — it is half the feature, in a second file.
`/design-system` stays as it is unless the exhibit gains the newsletter band,
which it should not in this prompt.

## Prerender impact

**`/journal` changes, and it is the only settled page that may.** §5.2's step-4
row authorises exactly this ("`/journal` form leaf; two new routes"). Expected
shape of the change, from what step 2 measured on `/`: the band's `<button>` is
replaced by the leaf's own button plus an empty `<dialog>` element, so the diff
is the dialog's class string and nothing else — the dialog's body lives behind
`open ? … : null` and is absent from the prerender.

**Every other route's HTML must be byte-identical**, and `CtaBand`'s new
defaulted prop is what guarantees `/` and `/about` need no edit.

Three new routes appear in the table: `/newsletter/confirm`,
`/newsletter/unsubscribe` (both dynamic — they read a token) and
`/api/newsletter/unsubscribe`. The nine existing static routes and the nine SSG
routes must keep their render modes.

**Verify, do not assume**: `npm run build`, compare the route table against the
one in `docs/backend.md` step 2's verification, then run the prerendered-HTML
diff per `docs/automation.md` — including its traps (normalise `BUILD_ID` and
chunk names, strip the RSC flight payload, re-split on `(?<=>)` for the page
that legitimately differs, and never quote a bare page-wide `magick compare` for
`/`, `/journal` or `/careers`).

## Trust boundary

- **Crossing the boundary:** an email address from a public form, and two
  opaque tokens from URLs in email. Nothing else.
- **Validated:** the address by `lib/validation/newsletter.ts` inside the
  action, after BotID and the rate limit (§10 rule 3's ordering). The tokens are
  validated by lookup — a token is either a row or it is nothing; never parsed,
  never trusted for its shape, never used to build SQL outside the query layer.
- **Authorises:** nothing. All three paths are deliberately unauthenticated
  (§11), and the tokens are capabilities: possession of the confirmation token
  proves inbox access, which is the entire mechanism of double opt-in.
- **Rejections return** the typed `SubmitResult`, never a throw and never a bare
  string. The one-click POST endpoint returns `200` even for an unknown token —
  a mail provider does not want a 4xx, and a distinguishable failure would turn
  the endpoint into an oracle.
- **Enumeration:** the signup action returns the **same** success state for a
  new address, a pending address and an already-confirmed one. Telling a
  stranger "that address is already subscribed" leaks membership of the list.
  The skill's "You're already subscribed!" copy is written for logged-in
  preference centres and is not adopted here — record the deviation.
- **Tokens** are generated with `crypto.randomBytes` (verify the exact call
  before writing it), URL-safe, and long enough that guessing is not a strategy.
  Never a uuid derived from the row, never a hash of the address.

## Secrets and data

- **Reads:** `DATABASE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
  `RESEND_API_KEY` — all existing, all server-only.
- **No new variable, and specifically no `NEXT_PUBLIC_*`.** Phase one still has
  none. The absolute URLs in the emails resolve against **`BETTER_AUTH_URL`**,
  which is already the application's base URL and already in `.env.example`;
  reusing it beats inventing `APP_URL` (§8.4: do not invent a variable name).
  A helper in `lib/email/config.ts` reads it and throws when unset, in the same
  register as `getResend()`'s error. **If the user would rather have a
  purpose-named variable, that is a one-line change at approval time.**
- **Stored:** one lowercased email address per subscriber, its status, two
  tokens and the lifecycle timestamps — exactly `subscriber`'s columns. In
  Redis: an IP, and a **sha256 of an address**, never the address.
- **Logged:** nothing personal, on any path, in any catch. The email module's
  failure lines carry a template name and the subscriber row's uuid.
- **Retention** is stated, not enforced — the same honest position step 2
  recorded. `subscriber.deletedAt` exists for an erasure request; no scheduled
  deletion is implemented and the doc must say so rather than implying one.

## Non-goals

- **No preference centre and no send infrastructure.** Nothing in this step
  sends an actual newsletter issue — the list is captured, confirmed and
  unsubscribable, and that is the whole of §5.2's row.
- **No `/design-system` exhibit** for the subscribe band. Step 2 put the dialog
  in the exhibit because the dialog was the new thing; this leaf is a copy, and
  adding it changes a second settled page's HTML for no gain.
- **No webhook handling** (bounces, complaints, suppression). `webhooks-events.md`
  and `list-management.md` are real requirements for a sender at volume and they
  are a later decision with their own endpoint and its own verification.
- **No physical postal address in the welcome email.** CAN-SPAM requires one and
  Aetherfield has none — this is the same class of unclosed prerequisite as the
  sending domain, and it is **recorded in `docs/backend.md` as a blocker for
  sending marketing mail in production**, not invented (§12 rule 7). Do not put
  a placeholder address in a template.
- **No email-preview script.** The templates are inspected with `render()`
  directly, per AGENTS.md §2's corrected note.
- **No change to the demo-request flow**, and no refactor of it beyond extracting
  what this step genuinely shares (`formatRetry`, the result type). A shared
  extraction must leave `/`'s prerendered HTML byte-identical.
- **No GSAP**, per §7.5 and the point made above.
- **Nothing from step 5 or step 7.**

## Checks

Run every one, and quote the exact output (§12 rule 3):

1. `npm run lint`
2. `npm run typecheck`
3. `npm run db:generate` — must produce exactly one new migration, and its SQL
   must be read and quoted
4. `npm run db:migrate` — over the **unpooled** connection, via
   `dotenv -e .env.local --` as the existing script does
5. `npm run build` — quote the route table
6. The prerendered-HTML diff per `docs/automation.md`, reporting `/journal` as
   the one expected difference and every other page as identical
7. An end-to-end run against `npm run dev`: submit the band, read the
   confirmation email (the Resend sandbox sender delivers only to the account's
   own address — that constraint from step 3 is unchanged and must be stated in
   the result), click through to `/newsletter/confirm`, confirm, receive the
   welcome email, unsubscribe through the visible link, and `POST` the
   one-click endpoint with `curl` to confirm it returns `200` and is idempotent.
   Query the `subscriber` row's status after each transition and quote it.
   **Blocked by prompt 46 on this machine** — if the database still times out,
   report that rather than reporting a pass.

## Recording the result

**`docs/backend.md`, a new `## Step 4 — newsletter signup, double opt-in`
section**, in the shape steps 2 and 3 use: the contract in file order, the
decisions and their reasoning, every judgement labelled as a judgement, the
migration's SQL, the environment and personal-data section, the enumeration and
one-click decisions, the postal-address gap, and a "Verified, prompt 47" block
containing only commands that were actually run.

**Nothing goes in `AGENTS.md`** except a correction if this prompt contradicts
it (§12 rule 8) — and one is already known: `lib/validation/` will hold a second
schema module, which §6.3's tree describes generically and therefore does not
contradict. §8.4's variable table needs no row: this step adds no variable.

Then commit to `main`, unprompted (§1 step 10).

## SKILLS USED

- **`drizzle-docs`** — the two new columns, the unique index, the generated
  migration, and `onConflictDoUpdate`'s exact API for the upsert.
- **`zod-docs`** — the newsletter schema, and `flattenError` for the field
  errors, matching how `lib/validation/lead.ts` and the demo action do it.
- **`resend`** — the `headers` option on `emails.send` for `List-Unsubscribe`,
  and the idempotency-key semantics that make a rotated-token resend send.
- **`react-email`** — the two new templates on the existing `Shell`, and
  `render()` for inspecting them without a preview server.
- **`email-best-practices`** — `email-capture.md` (double opt-in timing,
  expiry, resend limits), `compliance.md` (the `List-Unsubscribe` pair, the
  one-click endpoint's contract, consent recording), `accessibility.md` for the
  templates.
- **`upstash-ratelimit-js`** — the second and third limiters and their
  algorithms.
- **`nextjs`** — Next 16 Route Handlers, async `searchParams` on the two new
  pages, async `headers()`, and `redirect` from the one-click `GET`.
- **`tailwind-4-docs`** — the two new pages built from `@theme` tokens and the
  existing primitives only.
- **`vercel-functions`** — `waitUntil` and `ipAddress` semantics under Fluid
  Compute, both already load-bearing in step 2.
- **`vercel-storage`** — only if the Upstash client's construction needs
  revisiting; the `KV_REST_API_*` naming is already settled and recorded.

Not used, deliberately: `better-auth-*` (nothing here is authenticated),
`gsap-*` (§7.5), `figma:*` and `frontend-design` (no new comp — the two pages
are assembled from settled primitives).

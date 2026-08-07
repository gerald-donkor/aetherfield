# 43 — Transactional email, and §10 stage f

## SKILLS USED

- **`resend`** — the provider's own skill. SDK setup, the send call's real
  signature, **idempotency keys**, error shapes, and the domain/verification
  surface. Its own description warns it carries gotchas that a "just send an
  email" implementation hits; read it before writing a line of `lib/email/`.
- **`react-email`** — the templates themselves, and `render()` to HTML. Neither
  package is installed yet; this prompt installs what it uses.
- **`email-best-practices`** — deliverability (SPF/DKIM/DMARC), transactional
  vs. marketing, the plain-text part, and accessibility of the HTML. **§8.3's
  double-opt-in and unsubscribe rules are step 4's**, but this skill is what
  step 4 will copy from, so read it now and record what it settles.
- **`vercel:marketplace`** — Resend **is** a Marketplace integration (§7.2
  resolved it through `discover --category messaging`, where it was the only
  result). Unlike Upstash it has no dedicated skill, so §7.4 rules 3–5 apply in
  full: `categories`, `discover`, then `add <name> --help` **before** `add`.
- **`vercel:env-vars`** and **`vercel:vercel-cli`** — `vercel env ls` / `pull`
  to read back the variable name Resend actually sets, rather than asserting
  `RESEND_API_KEY` because §8.4 predicts it.
- **`vercel:nextjs`** — Server Actions on 16.2, and specifically **what happens
  to work started but not awaited in an action** before the response is
  returned. `waitUntil` from `@vercel/functions` is already a dependency; verify
  its behaviour rather than assuming it.
- **`zod-docs`** — only if the notification recipient or any new input needs a
  schema. The lead schema itself is unchanged.
- **`tailwind-4-docs`** — **only for the site**, never for the email. Email HTML
  is inline styles and table layout; Tailwind classes do not survive a mail
  client. Read it only if a site-side surface changes, which it should not.

Not needed, deliberately: `drizzle-docs` (**no schema change, no migration** —
see non-goals), `upstash-*` (the limiter already exists and is reused as-is),
the `better-auth-*` skills and `email-and-password-best-practices` (password
reset and email verification are **out of scope by the user's decision of
7 Aug 2026** — see "The scope decision" below), every `gsap-*` skill (§7.5), and
`frontend-design:frontend-design` (this prompt renders no new site UI).

## Scope, and why it is next

**This is build step 3 of §5.2 — transactional email.** Resolved from the
repository and `git log`, not from §5.2 and not from `prompts/`:

- Step 1 is committed (`6f120b2`): `lib/db/` with `getDb()`, the three
  phase-one tables, two migrations applied.
- Step 6 is committed (`4e0afb2`, extended by `bddc456`): it was pulled ahead at
  the user's direction.
- Step 2 is committed (`26ad46c`): `lib/validation/lead.ts`,
  `lib/rate-limit/index.ts`, `lib/db/lead-queries.ts`,
  `app/_actions/demo-request.ts`, the dialog leaf and `instrumentation-client.ts`.
- **Nothing else exists.** `lib/` has no `email/`, `package.json` has no
  `resend` and no `react-email`, and `vercel integration list` reports exactly
  two resources — `neon-purple-candle` and `upstash-kv-camel-lamp`. **Resend is
  not provisioned.**

Step 3 depends only on steps 1 and 2, both of which are done. **Step 4 is
blocked on it absolutely** — §5.2 states "double opt-in cannot exist before
email" — and step 5 lists it as a dependency too. Step 7 sits behind all of
them. Nothing else in phase one is unblocked and unbuilt.

`app/_actions/demo-request.ts:118-122` is the marker: stage f is a comment
naming this step, and closing it is the point of this prompt.

**§5.2 calls this the second load-bearing step**: step 2 set the pattern every
later form copies, and **step 3 sets the pattern every later email copies**.
Steps 4 and 5 will import `lib/email/`'s send helper rather than calling
`resend` directly, exactly as they will import `SubmitResult` rather than
restating it. Get it right slowly.

### The scope decision, taken 7 Aug 2026

§5.2's step 6 row says "Password reset and email verification land with step 3,
which can send their email". **The user scoped prompt 43 to the email layer and
the demo-request emails only.** Password reset and email verification — the
`sendResetPassword` / `sendVerificationEmail` hooks on `lib/auth/server.ts`,
flipping `requireEmailVerification` off `false` at `lib/auth/server.ts:28`, and
the two new screens and routes that go with them — are **prompt 44**, because
they add routes, screens and an auth-config change on top of the infrastructure
and would stop this prompt being the clean pattern steps 4 and 5 copy.

Recorded here so a later session does not treat their absence as an oversight.
**Leave `lib/auth/server.ts:27-28`'s comment in place, updated to say that the
sender now exists and that prompt 44 wires it** — do not silently flip the flag.

### The sending-domain decision, taken 7 Aug 2026

`docs/backend.md:337-340` records that there is **no deployment and no assigned
production domain**, verified at prompt 38. Resend can only send from a verified
domain; its default sender delivers to the account's own address and nowhere
else.

**The user's decision: build against Resend's default sender, and record the
gap.** Do not invent a domain, do not write a plausible `from` address for a
domain nobody controls, and do not skip the send to avoid the problem (§12
rule 9). Verify the real constraint from the `resend` skill and Resend's own
dashboard rather than from this paragraph, then state in `docs/backend.md`:

- the exact sender used, and that it is a development sender;
- that a verified domain plus published SPF, DKIM and DMARC records is an
  **unclosed prerequisite for deploying**, and that until it exists these emails
  reach only the account address;
- what step 4 will additionally need (List-Unsubscribe, per `email-best-practices`).

## Reference material to read first

| path | what it is |
| --- | --- |
| `AGENTS.md` §5 (the register), §6.1, §6.3, §7.4, §8.1, §8.2, §8.3, §8.4, §10 rule 4, §12 | the contract. **§10 rule 4 is the specification for the failure behaviour here** |
| `docs/backend.md` "Step 2 — demo-request capture, and the write path" (line 461) | **read the whole section.** "The contract, in file order" (line 468) is the table this step extends by one row |
| `docs/backend.md:651` "Environment and personal data" | how step 2 recorded a provisioned resource, the variable-name correction, and the retention statement — write step 3's equivalent to the same standard |
| `docs/backend.md:337` | the no-domain / no-deployment finding this prompt has to work around honestly |
| `docs/skills.md:64-66` | `resend`, `react-email` and `email-best-practices` are already installed, at prompt 39, **for this step** |
| `app/_actions/demo-request.ts:118-122` | stage f's placeholder — the exact insertion point |
| `app/_actions/demo-request.ts:39-40`, `:106-116` | `GENERIC_FAILURE`, and the write's `try`/`catch`. The email goes **after** this block and must not be able to change its outcome |
| `lib/validation/lead.ts:84-91` | `SubmitResult`. **It does not change.** A lead whose email failed still returns `{ ok: true }` (§10 rule 4) |
| `lib/rate-limit/index.ts` | the shape a new `lib/` module takes here: `import "server-only"` first, lazy construction, an explicit env read with a real error, and the judgement recorded in the docblock |
| `lib/db/client.ts:15` | why every client in this codebase is lazy — `next build` evaluates top-level module code |
| `lib/db/lead-queries.ts` | the query-module shape, if the notification needs anything read back (it should not) |
| `.env.example` | the file this prompt extends, names only |
| `node_modules/resend`, `node_modules/@react-email/*` | **after installing** — the installed API, never the remembered one (§12 rule 2) |

Nothing about Resend's or React Email's API is asserted in this prompt on
purpose. Read them at implementation time.

## What ships

### Provisioning — ask before running it

Resend is a **Marketplace** integration and §7.4's full procedure applies
(unlike Upstash, which had a dedicated skill):

1. `vercel integration categories`, then
   `vercel integration discover --category messaging` — both read-only.
2. **`vercel integration add resend --help` first**, to learn that provider's
   real `--plan` IDs and `-m KEY=VALUE` metadata keys. Do not guess them, and do
   not carry over Neon's or Upstash's flags. Note that **`--yes` is not a valid
   option** on `integration add` in CLI 58.7.1.
3. **Stop and ask the user before running `add`** — it creates a billable
   resource (§7.4 rule 5).
4. If it hands off to the browser, as Neon and Upstash both did
   (`integration_terms_acceptance_required`), **stop, ask them to complete it,
   and retry the command the CLI returns in `next[]`.** Never work around the
   handoff.
5. `vercel env ls` afterwards, **names only**, and correct §8.4's table in the
   same change if the name differs from `RESEND_API_KEY` (§12 rules 6 and 8) —
   §8.4 predicted Upstash's names wrongly and the table already carries that
   correction as precedent.
6. `vercel env pull .env.local` so local development has the key.

### Dependencies

`resend`, and whatever `react-email` genuinely requires — read the skill for the
current package split rather than installing a remembered list. Nothing else.

### `lib/email/` — new, server-only

§6.3's tree has an `email/` slot already ("template rendering and send,
server-only"), so no `AGENTS.md` amendment is needed for the directory itself.
Every module in it carries `import "server-only"` at the top.

**The send helper** — the module steps 4 and 5 import instead of calling
`resend` directly:

- The Resend client, **constructed lazily**, for the same reason
  `lib/rate-limit/index.ts:26-44` and `lib/db/client.ts:15` are lazy. An
  explicit env read with a real error message, never a `!` assertion.
- **A typed result, and it never throws to its caller.** Model it on
  `RateLimitOutcome` (`lib/rate-limit/index.ts:56-60`): the caller decides what
  a failure means, and for a lead the answer is "nothing" (§10 rule 4).
- **Idempotency.** The `resend` skill flags idempotency keys as a production
  gotcha; read what it says and either use them with a derivable key or record
  explicitly why not. Do not leave it unconsidered.
- **The `from` address, the reply-to, and the internal recipient are
  configuration, not literals scattered through templates.** One place.
- **Never log a recipient address, a subject line containing one, or a rendered
  body** (§8.3 rule 2). A failure logs the provider's error class and the
  template name, and nothing that identifies a person.

**The templates** — two, both plain and both in the site's register (§5:
measured, evidence-first, "clarity and confidence"; never "Awesome, we'll be in
touch!"):

| template | to | says |
| --- | --- | --- |
| confirmation | the requester | that the request was received, what happens next, and who it came from. No marketing, no unsubscribe (a transactional confirmation is not a marketing email — confirm that reading against `email-best-practices`) |
| internal notification | Aetherfield | the lead's name, work email, company, message and **`source`** — the whole reason `lead_source` exists |

Both ship a **plain-text part** alongside the HTML, and the HTML is accessible
per `email-best-practices` (real headings, meaningful link text, adequate
contrast, no information carried by colour alone).

**Do not build an email design system.** These are two transactional messages,
not a brand surface, and §7.5 forbids a second design system. Match the site's
voice and typography *in spirit* — a wordmark and readable type — without
attempting to reproduce `SiteFooter` in table layout.

### The internal recipient

The notification needs an address. **It is ours, not the provider's**, so it may
be named here: add one server-only variable to `.env.example` and read it in
`lib/email/`'s configuration. **Not `NEXT_PUBLIC_*`** — phase one still has none
(§8.4), and an internal address in a browser bundle is a spam target.

If it is unset, the notification is **skipped with a log line naming no
address**, not crashed and not sent to a guessed fallback.

### `app/_actions/demo-request.ts` — stage f

Replace the placeholder at `:118-122`, and nothing else in the file.

**§10 rule 4 is the whole specification: a failed email never fails the write.**
Concretely:

- Both sends run **after** the insert has succeeded.
- Their outcome **cannot change the returned `SubmitResult`**. The function
  still returns `{ ok: true }` on a successful write with a failed send.
- A send failure is logged **without the address** (§8.3 rule 2) and is
  otherwise invisible to the person who filled the form.
- The confirmation failing must not prevent the notification, and vice versa.
- **Decide, and record, whether the sends are awaited or handed to `waitUntil`.**
  `@vercel/functions` is already a dependency. Awaiting adds the provider's
  latency to the dialog's success state; not awaiting on Fluid Compute needs
  `waitUntil` to be correct rather than a bare floating promise. **Verify the
  behaviour from the skill and `node_modules/`, state which you chose and why,
  and say whether the choice is measured or judged** (front matter's rule).

**The BotID list does not change.** `instrumentation-client.ts` protects `/` and
`/design-system` because a Server Action POSTs to its own page; adding an email
adds no surface. If you find yourself editing that file, something has gone
wrong.

### `.env.example`

Extend with a `# --- Step 3: Resend (provisioned) ---` block, following the
existing per-step convention: the provider's variable **as `vercel env ls`
reports it**, plus the internal-recipient variable. Names only, with the comment
saying what reads each and why neither is public.

## Prerender impact

**`none` — no route changes.** This prompt adds `lib/email/` and edits one
Server Action's body. It renders nothing, adds no client module, touches no
component, and imports nothing into a page's graph.

**This must be verified, not assumed** (§8.1 and the backend-prompt heading
rule): run `npm run build` and confirm every route keeps its existing ○ / ●
marker against the table in §8.1. A prerender HTML diff is not required if the
route table is unchanged **and** `git diff --stat` shows no file under `app/`
other than `_actions/demo-request.ts`; if either is untrue, run the full diff
per `docs/automation.md`, including its stale-worktree section.

## Trust boundary

**No new request path.** Nothing new crosses from the browser: the demo form's
boundary is unchanged and is already documented at `docs/backend.md:461`.

What is new is an **outbound** boundary — personal data leaving this system for
a third party:

- **Crossing out:** the requester's name, work email, company and message, to
  Resend, over TLS, on every successful demo request.
- **Authorised by:** the API key, server-only, read inside `lib/email/`.
- **Triggered by:** a request that has already passed BotID, the rate limit,
  the schema and the insert. **The email is unreachable by an unvalidated
  request**, which is a direct consequence of §10's a-b-c-then-write ordering
  and is worth stating.
- **A failure returns:** nothing to the client. The user sees the success state
  because the lead was captured (§10 rule 4).
- **Rate limiting:** inherited. The existing five-per-hour-per-IP limiter caps
  the send rate at the same number, so the form cannot be used as a relay to
  mail an arbitrary address repeatedly. **Confirm that reasoning holds** — the
  confirmation goes to an attacker-supplied address, which makes this endpoint
  a potential mail amplifier, and if the existing limit is not sufficient
  protection, **say so rather than quietly adding a second limiter.**

## Secrets and data

- **Reads:** the Resend API key (name read back from `vercel env ls`), the
  internal-recipient address, and — unchanged — `DATABASE_URL` and the two
  `KV_REST_API_*` variables through the existing modules.
- **Adds no `NEXT_PUBLIC_*`.** Phase one still has none, and adding one is a
  decision to make a value public (§8.4).
- **Transmits personal data to a third party for the first time in this
  project's history**, which is the notable fact of this step: a name, a work
  email, a company and free text now reach Resend, which retains them in its
  own logs under its own policy. **Record that in `docs/backend.md`** alongside
  step 2's retention statement — including that we do not control Resend's
  retention and have not configured anything about it.
- **Stores nothing new.** No new column, no new table, no `send` audit table.
- **Never log a recipient, a rendered body, or a subject containing an
  address** (§8.3 rule 2) — not on success, not in a catch, not in the
  `waitUntil` path if that is chosen.
- Never echo the API key — not in output, not in a comment, not in `docs/`.
  `vercel env ls` shows names only and that is the only listing to quote.

## Non-goals

- **No password reset and no email verification.** The user's decision above;
  they are prompt 44. Do not add `sendResetPassword` or
  `sendVerificationEmail` to `lib/auth/server.ts`, and **do not flip
  `requireEmailVerification` at `:28`** — flipping it with no screen behind it
  locks people out of the accounts step 6 already ships.
- **No newsletter.** Step 4 owns `/journal`'s band, the `subscriber` table,
  double opt-in, the confirm and unsubscribe routes, and List-Unsubscribe.
  **`subscriber` must not be written by this prompt**, and its
  `confirmationToken` must not be generated here.
- **No job-application email.** Step 5.
- **No submissions view.** Step 7.
- **No inbound email, no webhooks.** `docs/skills.md:185` records
  `agent-email-inbox` as deliberately excluded: phase one sends and never
  receives. Do not add a Resend webhook route, a delivery-event handler, or a
  bounce processor.
- **No email preview script yet — and §2's gap note is the exception.** §2 says
  "Build step 3 adds the email one, updating this list **in the same change**".
  So: **if** a preview script ships, it is written as
  `dotenv -e .env.local -- <command>` from day one and §2's script list is
  updated in the same commit. **If it does not**, correct §2's sentence rather
  than leaving it predicting something that did not happen (§12 rule 8). Either
  outcome is acceptable; a stale §2 is not.
- **No migration.** Nothing in `lib/db/schema.ts` changes. If
  `npm run db:generate` produces a file, investigate rather than commit it.
- **No retry queue, no scheduled resend, no outbox table.** A best-effort send
  with a logged failure is what §10 rule 4 specifies; durable delivery is not a
  phase-one step and adding it is the "no feature that is not a step" rule.
- **No AI.** §5.3: phase one uses none, and an email is exactly the surface
  where it would be tempting.
- **No site UI change of any kind.** No new component, no restyle, no copy edit
  on a prerendered page.

## Checks to run

Section 2 in full, quoting exact output: `npm run lint`, `npm run typecheck`,
`npm run build`. Then, none of which may be asserted without running it (§12
rule 3):

1. **The route table from the actual build output**, showing every route's
   ○ / ● marker unchanged against §8.1's table and nothing newly dynamic.
2. **`git diff --stat`**, demonstrating that the only file under `app/` is
   `_actions/demo-request.ts` — the evidence behind the "prerender impact:
   none" claim.
3. **A real submission end to end** against the dev server: quote whether the
   row landed, whether both emails were accepted by Resend, and **quote the
   received confirmation's subject and first line** rather than describing it.
   Say plainly if the default sender means only one address could receive it.
   **Delete the test row afterwards and say that you did.**
4. **A send failure does not fail the write** — force one (an invalid key, an
   unroutable recipient, or whatever the SDK lets you provoke honestly), submit,
   and quote: the row present in the database, `{ ok: true }` reaching the
   dialog, the user seeing the success state, and the failure logged.
5. **Nothing personal in the logs** — grep the dev server's output from checks 3
   and 4 for the test email address and quote the empty result.
6. **The plain-text part exists** — quote it, or the header proving it, from a
   received message.
7. **`vercel env ls`** confirming what landed, **names only**.
8. **No secret in the diff** — grep the staged change for an API key and for a
   connection string before committing.
9. **`npm run build` with `.env.local` moved aside still succeeds** — the lazy
   construction in `lib/email/` must hold the same guarantee `getDb()` and the
   limiter do. This is the check that catches a client built at module scope.

## Recording

Extend **`docs/backend.md`** with a step 3 section, written to the standard of
its step 2 section (line 461) — **as the thing steps 4 and 5 will copy**, naming
the files and the contract rather than narrating what happened:

- the Resend resource as provisioned (name, product, region, date, and the
  browser handoff if there was one), mirroring `docs/backend.md:651`;
- the variable name as `vercel env ls` reports it, and whether it matched §8.4's
  prediction;
- **add `lib/email/`'s send helper as a row in "The contract, in file order"
  (line 468)**, and say which of the six existing rows a later form still
  changes;
- the templates, the register they are written in, and the plain-text part;
- **the awaited-vs-`waitUntil` decision and its reasoning**, marked measured or
  judged;
- the idempotency decision, either way;
- **the sending-domain gap**, stated as an unclosed prerequisite for deploying,
  with what a verified domain requires;
- the outbound personal-data statement — what now leaves this system, to whom,
  and that we control none of its retention;
- every check's real output.

`AGENTS.md` amendments — **in the same change** (§12 rule 8), and only these:

1. **§2's script list and its "Gaps to flag" note** — per the non-goal above,
   either add the preview script or correct the sentence that promises it.
2. **§8.4's table** — only if `vercel env ls` reports a name different from
   `RESEND_API_KEY`, and to add the internal-recipient variable, which the table
   does not currently list.
3. Nothing else. The cap rule stands, `docs/backend.md` takes the detail, and
   **step 3 is marked done by `git log`, never by editing §5.2**.

Then commit to `main`, unprompted (§1 step 10).

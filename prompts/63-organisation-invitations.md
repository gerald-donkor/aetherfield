# 63 — Organisation invitations: the members surface step 8 deferred

## Scope, and why it is next

**Every row of AGENTS.md §5.2 is committed.** `git log` shows step 14 at
`f9e102b` ("Build step 14: scheduled recalculation and threshold alerts"),
step 13 at `8196d09`, step 12 at `f16e86f`, step 11 at `b13bc02`, step 10 at
`60def3c`, step 9 at `4541641`, step 8 at `246decd`, and phase one at
`ce84e14` and below. There is no unbuilt *row*.

There is one unbuilt piece **inside** a row. `docs/backend.md:3202`, in step 8's
"What step 8 deliberately did not do" table, reads:

> invitations, `sendInvitationEmail`, an accept route, a members management UI |
> the user's decision above; blocks nothing downstream, and **remains
> deferred**. This line originally read "and is the next prompt". It was not:
> the user chose step 9 over it, and prompt 57 implemented step 9.

That is the scope of this prompt, and it is the correct next one because it is
the **last named piece of §5.2 still outstanding**. Everything else a session
could reach for now is either a new feature (§5.2 "Do not overbuild" forbids
it), an environment gap that no code closes (`podman` for WebKit; a domain
Resend can verify — `docs/backend.md:4003`), or an open policy question the user
must answer first (the finite retention policy, `docs/backend.md:2783`).

**Today the product has a hard hole because of it.** An organisation is created
by exactly one person (`app/account/actions.ts:57`), `creatorRole` is `owner`
(`lib/auth/server.ts:106`), and there is no path by which a second human being
ever reaches a tenant's data. Every phase-two surface built since — `/activity`,
`/dashboard`, `/targets`, `/reports`, the nightly alert sweep that mails *the
organisation's owners* — is single-user in practice. The `invitation` table has
existed and been empty since step 8 (`lib/db/auth-schema.ts:114`).

## Reference material read while writing this prompt

- `AGENTS.md` — §5.2 step 8, §6.2, §6.3, §8.1, §8.3, §9.2, §10, §11, §12
- `docs/backend.md` — step 8 in full (the decisions table at :2874, the plugin
  configuration table, "What step 8 deliberately did not do" at :3195); step 7's
  staff-control and removal record at :2755; step 14's alert-recipient record
- `lib/auth/server.ts:101-134` — the `organization()` plugin as configured, and
  the comment block that names `sendInvitationEmail`'s absence
- `lib/auth/organization.ts:84-166` — `getCurrentMembership`,
  `requireOrganization`, `authorizeOrganization`
- `lib/db/organization-queries.ts` — `getMembership`, `listMembershipsForUser`
- `lib/db/auth-schema.ts:86-134` — `organization`, `member`, `invitation` as
  generated, with their real column names
- `app/account/actions.ts` — `createOrganization` and `setAlertEmailPreference`,
  the two authenticated write paths this one must copy stage-for-stage
- `app/account/page.tsx` — the page the members section lands in
- `app/_components/organization/create-organization-form.tsx` — the client-leaf
  shape to copy
- `lib/validation/organization.ts` — `ORGANIZATION_ROLES`, `RESERVED_SLUGS`,
  the field-error vocabulary
- `lib/email/alerts.ts` and `lib/email/templates/target-alert.tsx` — the most
  recent sender + template pair, and the idempotency-key convention
- `lib/email/config.ts` — `FROM`, `appBaseUrl()`, `replyTo()`
- `lib/rate-limit/index.ts:428-548` — the authenticated limiters and their shape
- `proxy.ts:22-29` — the matcher, which lists protected segments explicitly
- `node_modules/better-auth/dist/plugins/organization/routes/crud-invites.d.mts`
  and `crud-members.d.mts` — the **server** endpoint names, read rather than
  recalled (§12 rule 2)
- `node_modules/better-auth/dist/plugins/organization/error-codes.mjs` — the
  invitation error codes

## The API, verified — and the trap in it

`auth.api.*` exposes, from `crud-invites`: **`createInvitation`**,
`acceptInvitation`, `rejectInvitation`, `cancelInvitation`, `getInvitation`,
`listInvitations`. From `crud-members`: `listMembers`, `removeMember`,
`updateMemberRole`, `leaveOrganization`, `getActiveMember`.

**The server method is `createInvitation`, not `inviteMember`.** `inviteMember`
is the *client* plugin's name for it, and it is what the
`organization-best-practices` skill and every tutorial show. This project has no
`organizationClient()` anywhere (grep of `lib` and `app` returns nothing) —
every organisation mutation goes through a Server Action calling `auth.api`,
which is §6.2. Do not add the client plugin to reach a nicer method name.

Invitation error codes to translate into this path's own vocabulary:
`INVITATION_NOT_FOUND`, `INVITATION_LIMIT_REACHED`,
`YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION`,
`YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE`. Read the full list from
`error-codes.mjs` at implementation time and handle each reachable one — an
unhandled code must still fall through to the generic message, never throw
(§10 rule 2).

## What to build

### 1. `lib/validation/organization.ts` — extended, not forked

- `inviteMemberSchema` — `email` (trimmed, **lowercased**, §9.2 rule 4) and
  `role` constrained to `ORGANIZATION_ROLES`. The email rules must match
  `lib/validation/lead.ts`'s treatment; read it and reuse, do not restate.
- `invitationIdSchema` and `memberIdSchema` — the ids Better Auth generates are
  the bounded `^[A-Za-z0-9]{32}$` contract step 7 already established and
  recorded (`docs/backend.md:2755` region). **Verify that against a real
  generated id before writing the regex**; if it does not hold, record what does
  rather than writing the expected one.
- Add **`invitation`** (and `invitations`) to `RESERVED_SLUGS` in the same
  change, because this prompt introduces a top-level route segment and that set
  is documented as listing every one that exists.
- Field-error types and the `NO_*` constants, in the existing style.
- Still **not** `server-only`, still importing nothing from `lib/db/` or
  `better-auth` — the module comment states both and must stay true.

### 2. `lib/email/templates/organization-invitation.tsx` + `lib/email/organization.ts`

One template, built on `Shell` and the shared style constants like every
existing template; one sender, shaped like `sendTargetAlert`:

- returns whether the message left; **throws nothing**;
- idempotency key `organization-invitation/<invitation-id>` — one invitation is
  one message. The recipient does not need folding in as `sendTargetAlert` does,
  because one invitation has exactly one recipient; say so in the comment rather
  than copying the hash without reason;
- the accept URL is `${appBaseUrl()}/invitation/<id>`;
- **transactional, so no `List-Unsubscribe`** — the same reasoning step 14
  recorded for the alert email. Someone invited by name to a workspace is not on
  a marketing list.
- Copy in the site's register: measured, evidence-first, never campaigning. It
  states who invited them, to which organisation, that the link expires, and
  what Aetherfield is in one line — an invitation may be the recipient's first
  contact with the product.

### 3. `lib/auth/server.ts` — `sendInvitationEmail`

Wire the plugin option to the sender above, inside the existing
`organization({...})` block. Also set, each as a **judgement recorded as one**
(§12 rule 4), in the style of the `organizationLimit` comment already there:

- `invitationExpiresIn` — the default is 48 hours; state whether it is kept or
  changed and why.
- `invitationLimit` — a bound against runaway pending invitations on a free Neon
  plan, not a product requirement.
- `cancelPendingInvitationsOnReInvite` — decide and justify; re-inviting the
  same address is the obvious user behaviour when the first mail is missed.

**A failed invitation email must not fail the write** (§10 rule 4) — but read
the plugin source to establish whether a throw inside `sendInvitationEmail`
rolls back or surfaces, and make the behaviour match the rule deliberately
rather than by assumption. Record what the source actually does.

### 4. `app/account/actions.ts` — four actions

`inviteMember`, `cancelInvitation`, `removeMember`, `leaveOrganization`. Every
one copies the stage order of `createOrganization` directly above them, in
§10's letters:

- **a. BotID — deliberately absent**, for the reason already written at
  `app/account/actions.ts` stage a. Reference it; do not restate the argument.
- **b.** session and membership via `getCurrentMembership()`, then a new
  limiter keyed by user id, failing closed.
- **c.** `safeParse` with the shared schema.
- **d.** **Owner-only, checked in the action.** `membership.role === "owner"` is
  the gate for invite, cancel and remove. Hiding the controls on the page is
  presentation and is not enforcement (§11.2 rule 2). `leaveOrganization` is the
  exception — a member may leave; the last owner may not, and the plugin
  enforces that, so translate its error rather than duplicating the rule.
- **e.** `auth.api.*` with `headers: await headers()`.
- **f.** the email, via the plugin.
- `revalidatePath("/account")`, **no redirect** (§10 rule 5), typed result.

**No organisation id and no user id is ever taken from the browser** — both come
from the resolved membership. That line is the whole multi-tenancy failure mode
and `setAlertEmailPreference` already says so.

### 5. `lib/rate-limit/index.ts` — the new limiters

`checkInvitationWriteLimit` (invite / cancel / remove, keyed by user id) and
`checkInvitationResponseLimit` (accept / decline, keyed by user id). Windows are
**judgements in the same footing as every window already in that file** — say
so, and place them next to the authenticated limiters, not among the public ones.

### 6. `app/_components/organization/members-panel.tsx` — the client leaf

A **component-only** client leaf (front matter's bundle rule — no constant and
no type may be exported from it), built from `Field`, `Button` and the existing
primitives, copying `create-organization-form.tsx`'s typed-result handling,
announcement region and focus management. **No GSAP** (§7.5). It renders:

- the member list — name, email, role, and for an owner a Remove control with
  the explicit confirm/cancel state step 7's `action-controls.tsx` established
  (read it and match; do not invent a second confirmation vocabulary);
- pending invitations — address, role, expiry, and an owner's Cancel;
- the invite form, owner-only;
- a Leave control for a non-owner.

Every state is announced, focus is managed, and legible without colour (§8.2
rule 5).

### 7. `app/account/page.tsx` — a MEMBERS section

Placed after the ORGANISATION section and before TARGET ALERTS, following the
existing `font-mono text-caption text-muted` heading pattern exactly. The page
is already dynamic and already reads membership; it gains the member and
invitation reads.

**The reads go through a Server Component and the data layer** (§6.2). Prefer
`lib/db/organization-queries.ts` for the list reads over `auth.api.listMembers`,
because §6.3 says nothing but that layer talks to the database and the tables
are already imported there — but the read must be **tenant-predicated on the
resolved organisation id**, and the prompt's reviewer should check exactly that.
Reads must be composed into the existing `Promise.all` pattern where one exists,
not added as serial awaits.

### 8. `app/invitation/[id]/page.tsx` — the accept route

A page, not an API route (§6.2: route handlers are for external callers; the
browser following a link is not one), modelled on
`app/newsletter/confirm/page.tsx` — read it first.

- Signed out → redirect to `/sign-in?callbackURL=/invitation/<id>`, so the link
  survives a sign-in and a sign-up. Verify the callback round-trips.
- Signed in → show who invited them, to what, and Accept / Decline, through a
  colocated `app/invitation/[id]/actions.ts`.
- **The invited address is the only address that may accept.** The plugin
  enforces it; the page must not present an acceptable-looking button to a
  signed-in person it will reject — tell them which address the invitation is
  for, without disclosing anything else about the organisation.
- Expired, already-accepted, cancelled and not-found are **four distinct handled
  states with honest copy**, not one error page.
- `proxy.ts`'s matcher is **not** widened for this route. It is optimistic
  convenience only (§7.3) and the page does its own database-backed check; a
  matcher entry would buy nothing and the marketing routes must stay unmatched
  (§8.1). State this in the record rather than leaving it looking forgotten.

## Prerender impact

**Expected: none.** Every route this touches is already dynamic (`/account`) or
new (`/invitation/[id]`, which is request-time by construction). The nine
marketing routes must stay byte-identical and the route table unchanged:

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

**This must be verified, not assumed** — `npm run build`, confirm the table,
then diff the prerendered HTML per `docs/automation.md`, with the standing
warning about `/`, `/journal` and `/careers` in force (mask the box, report the
remainder and the box separately).

## Trust boundary

| crossing | validated where | authorised by | rejection |
| --- | --- | --- | --- |
| invite form → `inviteMember` | `inviteMemberSchema` in the action | live session + `role === "owner"`, re-read from Postgres | typed `{ ok: false, fieldErrors }` |
| cancel / remove controls | id schema in the action | same | typed result; ids never trusted, always re-checked against the resolved tenant |
| Leave control | id-free | live session + membership | typed result; plugin's last-owner rule translated |
| invitation link → `/invitation/[id]` | `invitationIdSchema` | live session; the plugin matches the invited email | four distinct handled states, no stack trace, no organisation detail leaked to a non-invitee |

No public unauthenticated write path is added, so BotID's protected-path list
(`instrumentation-client.ts`) is **not** touched — which is a two-file
commitment when it is (§7.3), and this prompt deliberately does not make it.

## Secrets and data

- **No new environment variable.** `RESEND_API_KEY` and `BETTER_AUTH_URL` are
  already read by the modules this uses; `.env.example` does not change.
- **No `NEXT_PUBLIC_*`.**
- Personal data stored: an **invited email address** in the existing
  `invitation` table, plus the inviter's user id — both columns already exist.
- **Nothing personal is logged** (§8.3 rule 2): no address, no name, no
  organisation name, no payload, in any catch block, any warning, or any
  idempotency key. The invitation id is the only identifier that may appear.
- An invitation is deleted or expires by the plugin's own lifecycle; this prompt
  adds **no permanent archive** (§8.3 rule 5), and the open retention-policy
  question stays open and unclaimed.

## Non-goals

| not done | why |
| --- | --- |
| teams, `dynamicAccessControl`, custom roles | not in §5.2 step 8; still out |
| a third tenant role | §11.1 fixes the tenant side at `owner` and `member` |
| `organizationClient()` on the browser | §6.2 — every mutation is a Server Action |
| organisation deletion or renaming | still coupled to the erasure path (§9.2 rule 5), still deferred deliberately |
| ownership transfer as a first-class flow | `updateMemberRole` exists; a transfer UI is a separate decision. If the last-owner rule makes Leave unreachable for a sole owner, say so in the copy rather than building the transfer to dodge it |
| `/[org]` routing, an org switcher, multi-org sessions | the slug is still not in a URL; `organizationLimit: 3` is not a product statement |
| touching sign-up, sign-in or any settled auth screen | settled surfaces |
| widening `proxy.ts`'s matcher | §8.1 |
| any staff bypass into tenant data | §11, explicitly |
| an email preview script | none exists; §2 says do not reference one |

## Checks

Run all of these and quote the exact output (§12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — the domain suite. This prompt adds no `lib/domain/` code, so the
  expectation is that the existing 170 pass unchanged; if a test is added it
  must be pure and belong there.
- `npm run build` — and the route table, reported verbatim
- the prerendered-HTML diff per `docs/automation.md`
- `npm run test:e2e` — Chromium and Firefox. **WebKit will not run** (podman is
  not installed on this machine); report that as the known environment gap it
  is, not as a pass.

Record the result in **`docs/backend.md`**, as a new section under step 8 —
"Step 8's deferred invitations, closed by prompt 63" — and **correct the
deferred line at `docs/backend.md:3202` in the same change** rather than leaving
it standing against what the repository then shows (§12 rule 8). Nothing goes in
`AGENTS.md`: this adds no index row and no site-wide invariant.

## SKILLS USED

- **`organization-best-practices`** — the Better Auth organization plugin's
  invitation options, `sendInvitationEmail`, member management, and the
  owner-protection rules. **Note its client-side bias**: it shows
  `authClient.organization.inviteMember`, and this project's server-side name is
  `createInvitation`.
- **`better-auth-best-practices`** — server config, `auth.api` usage, session
  handling on Next 16's async `headers()`.
- **`better-auth-security-best-practices`** — invitation security, rate
  limiting, trusted origins, and what must not be trusted from a link.
- **`resend`** — the send path, idempotency keys, and the gotchas that module
  already encodes.
- **`react-email`** — the template, and `render()` for inspecting it (there is
  no preview script and none is to be added).
- **`email-best-practices`** — transactional vs marketing, and accessibility of
  the message itself.
- **`zod-docs`** — the shared schema, `safeParse`, `z.flattenError` field errors.
- **`drizzle-docs`** — only if a query is added to
  `lib/db/organization-queries.ts`. **No migration is expected**: the
  `invitation` and `member` tables already exist.
- **`nextjs`** — the dynamic route, `redirect()`, Server Actions,
  `revalidatePath`, and the async request APIs.
- **`next-cache-components`** — only to confirm nothing here needs `use cache`
  and that no caching decision is made by accident.
- **`tailwind-4-docs`** — utilities and variants for the members panel, against
  the tokens in `@theme`.
- **`frontend-design:frontend-design`** — the members section and the invitation
  page are new visual surfaces on a comp-matched site; they must read as part of
  it rather than as scaffolding.
- **`upstash-ratelimit-js`** — the two new limiters.
- **`vercel:env-vars`** — to confirm the expectation that no variable is added
  holds, via `vercel env ls` (names only, §8.4).

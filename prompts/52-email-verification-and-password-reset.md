# Complete Better Auth email verification and password reset

## Scope and why this is next

Complete the unfinished email/password portion of build step 6 by requiring
email verification, sending verification and password-reset messages through
the existing Resend/React Email layer, and adding the public verification,
forgot-password, and reset-password experiences around Better Auth's built-in
endpoints.

This is next because the repository, not the prompt sequence, shows that build
step 6 is incomplete: `lib/auth/server.ts` still sets
`requireEmailVerification: false` with a comment deferring it until step 3,
there is no password-reset or email-verification UI, and prompt 43 expressly
deferred both to a later prompt. Step 3 is now committed and can send their
mail, but prompt 44 became the Google sign-in extension instead. Build step 7
depends on the completed auth foundation, so it must not begin until this gap
is closed.

This prompt is numbered 52 because 51 is the highest existing prompt number.
Prompt 51 and its Playwright files are currently unrelated working-tree work:
preserve them exactly, do not absorb them into this implementation, and stage
and commit only prompt-52-owned files unless that work has been committed by
the time this prompt executes.

## Reference material read

- `AGENTS.md`, especially the workflow and prompt contract in sections 1-4;
  build step 6 in section 5.2; the UI, Server Action, Route Handler, data,
  email, and auth boundaries in section 6; the settled stack and provider
  constraints in section 7; the static-site, security, personal-data, secret,
  and anti-fabrication rules in sections 8-12.
- `docs/backend.md`, especially the existing step 6 Better Auth implementation,
  the Google auth extensions, step 3's email contract, the Resend sandbox and
  unverified-domain prerequisite, the `waitUntil` judgement, the no-personal-
  data logging rule, and the established env-less build/prerender checks.
- `docs/automation.md` for clean-worktree build comparisons, isolated ports,
  provider-backed verification, and synthetic-record cleanup. Re-read it
  before running any browser, screenshot, build-diff, or clean-worktree check.
- `prompts/38-auth-sign-in-and-sign-up.md`,
  `prompts/43-transactional-email.md`, and
  `prompts/44-google-sso-on-sign-in.md` as historical scope evidence only. Do
  not treat a prompt as proof of implementation.
- `lib/auth/server.ts`, `lib/email/config.ts`,
  `lib/email/send.ts`, `lib/email/templates/shared.tsx`, the existing email
  templates, `app/api/auth/[...all]/route.ts`, `proxy.ts`, the current auth
  pages/forms, `AuthShell`, and the shared `Button`, `ButtonLink`, and `Field`
  primitives.
- The installed Next.js 16.2 documentation in `node_modules/next/dist/docs/`,
  especially the authentication, Server Actions, redirects, Server/Client
  Component boundaries, and `useSearchParams` guides. A statically prerendered
  route whose client leaf calls `useSearchParams()` needs a nearby `Suspense`
  boundary in production.
- The installed Better Auth 1.6.26 implementation and declarations in
  `node_modules/@better-auth/core/dist/types/init-options.d.mts` and
  `node_modules/better-auth/dist/api/routes/{sign-up,sign-in,password,email-verification}.mjs`.
  These verify the option names, the one-hour defaults, generic reset response,
  constant-time verification resend floor, single-use reset-token consumption,
  callback query parameters, origin checks, and background-task hook.
- The installed Resend 6.18.1 and React Email 6.9.2 code and types already
  recorded in `docs/backend.md`: Resend returns `{ data, error }`, and the
  project must continue rendering explicit HTML and plain-text parts through
  `sendEmail()`.
- No comp, screenshot, or recording defines these new auth states. Their layout
  is inherited from the already measured `AuthShell`; the exact criteria below
  are behavioural and structural, not eyeballed geometry.

## SKILLS USED

- `nextjs` - preserve the installed Next.js 16 App Router, prerendering, and
  Server/Client Component rules for the new public auth pages.
- `next-cache-components` - verify that no cache directive or request-time API
  is introduced accidentally; Cache Components is not enabled in this project.
- `better-auth-best-practices` - configure the installed Better Auth email
  verification and password-reset hooks and use its generated client methods.
- `better-auth-security-best-practices` - preserve origin checks, database rate
  limiting, enumeration resistance, secret handling, and secure session policy.
- `email-and-password-best-practices` - implement required verification,
  reset-token expiry, password limits, session revocation, and safe reset UX.
- `resend` - route both transactional messages through the existing send helper
  with event-specific idempotency keys and correct `{ data, error }` handling.
- `react-email` - build accessible named-export templates compatible with the
  project's deliberate direct-`render()` workflow.
- `email-best-practices` - keep the messages transactional, accessible,
  unambiguous about expiry and unsolicited requests, and free of marketing or
  unsubscribe content.
- `vercel-functions` - configure Better Auth's verified
  `advanced.backgroundTasks.handler` with Vercel `waitUntil` for hooks Better
  Auth marks as background work.
- `tailwind-4-docs` - use existing Tailwind 4 tokens and primitives without a
  config file, new design system, or settled chrome restyle.
- `vercel-react-best-practices` - keep interactive code in narrow client leaves
  and avoid moving static auth-shell content into the browser bundle.

`zod-docs` is deliberately not required: these forms call Better Auth's own
generated client endpoints, whose installed server implementation validates
the request bodies. Do not create a parallel application Server Action or a
second schema just to wrap those endpoints. Drizzle, Neon, storage, Upstash,
GSAP, organisation, and marketplace skills are also outside this no-schema,
no-provider-provisioning scope.

## Implementation requirements

1. Re-read this approved prompt and load every skill in `SKILLS USED` before
   editing implementation files. Re-check `git status`, the highest prompt
   number, repository files, and recent `git log`; preserve all concurrent and
   unrelated changes.

2. Re-verify every Better Auth client method, callback shape, option, and error
   code against installed 1.6.26 declarations/implementation before using it.
   The expected methods are `requestPasswordReset`, `resetPassword`, and
   `sendVerificationEmail`, but installed code is authoritative. Do not invent
   an auth API, token format, redirect, or error name.

3. Extend `lib/auth/server.ts` without losing any existing database, Google,
   role, rate-limit, token-encryption, lazy-construction, or `nextCookies()`
   behaviour:

   - set `emailAndPassword.requireEmailVerification: true`;
   - configure `sendResetPassword` through a server-only helper in
     `lib/email/`, using the exact provider-created `url` and `token` passed to
     the hook rather than reconstructing either;
   - keep the verified 8-128 password limits and explicitly set the reset token
     lifetime to one hour so configuration and email copy cannot drift;
   - set `revokeSessionsOnPasswordReset: true`;
   - configure `emailVerification.sendVerificationEmail`, one-hour expiry,
     automatic send after email/password signup, resend on a valid-password
     sign-in attempt by an unverified user, and automatic sign-in only after a
     verification link succeeds;
   - configure Better Auth's installed
     `advanced.backgroundTasks.handler: waitUntil`. Let Better Auth decide
     which hook calls are deferred; do not wrap the hook itself in a second
     `waitUntil` or throw email-provider failures back through public auth
     responses;
   - keep `plugins: [nextCookies()]` last.

   The one-hour values match Better Auth's installed defaults and are made
   explicit because the message promises that duration. That is a shipped
   judgement on a verified provider default, not a measurement from a comp.

4. Add two pure React Email templates beside the existing templates: account
   verification and password reset. Follow the current named-export plus
   `Shell` pattern; do not reshape the directory for `email dev` and do not add
   an email-preview script. Each message must:

   - be transactional, with no marketing, audience/contact creation,
     unsubscribe header, or newsletter language;
   - use one `<h1>`, a specific primary action, accessible link contrast and
     text, a visible fallback URL, and a plain-text part produced by the
     existing `sendEmail()` path;
   - state that the link expires in one hour;
   - say that no action is needed if the recipient did not request the account
     or password change;
   - match Aetherfield's measured, calm register and straight-quote content
     convention.

5. Add a server-only auth-email orchestration module that calls the existing
   `sendEmail()` helper. Use event-specific Resend idempotency keys that change
   for each newly issued credential but remain stable when the same hook is
   retried. Never put an email address, raw verification/reset token, signed
   URL, password, or subject in the key or logs. Derive the key from a safe
   fixed prefix, stable user id, and a SHA-256 digest of the provider token;
   keep it within Resend's verified limits. A send failure may log only the
   template/event and safe error class already returned by `sendEmail()` and
   must not change Better Auth's public success/failure semantics.

6. Change email/password signup only as required for verification:

   - pass an absolute same-origin callback URL for the new verification result
     page, with a fixed success marker rather than `/account`;
   - after a successful or synthetic duplicate-safe email signup response, do
     not navigate to `/account`. Replace the form with an accessible, focused
     confirmation state that tells the person to check their inbox and does not
     reveal whether the address was newly created or already existed;
   - leave Google signup and its `/account` destination unchanged;
   - do not store the password or token in component state beyond what the
     request itself requires.

7. Extend email/password sign-in with a clear `Forgot password?` link next to
   the password affordance. Preserve the Google path. When Better Auth rejects
   an unverified credential account, present safe guidance that a verification
   link may have been sent without exposing raw provider errors or weakening
   the generic invalid-credential response. Do not claim a message was sent
   for a random address/password pair.

8. Add `/forgot-password` as a public static Server Component page using
   `AuthShell` and a narrow client form. It accepts and locally validates one
   email address, calls Better Auth's reset-request method with an absolute
   same-origin `/reset-password` callback, and always settles on the same
   accessible message for a syntactically valid known or unknown address:
   `If an account matches that address, we sent a reset link.` Do not branch
   the UI, timing, status, or copy on account existence. Better Auth's existing
   database rate limit remains the server-side abuse control.

9. Add `/reset-password` as a public static shell with a `Suspense`-wrapped
   client leaf that reads `token` or `error` through `useSearchParams()`. This
   keeps the credential out of Server Component props and preserves a
   prerenderable shell. Requirements:

   - render no reset form without a token;
   - map missing, invalid, or expired states to one safe message and a route
     back to request a fresh link; never render the raw query value or Better
     Auth error code;
   - collect a new password and confirmation, enforce 8-128 characters and an
     exact match as client courtesy, then call Better Auth's reset endpoint,
     which remains the authoritative validation and single-use-token check;
   - after success, remove the credential-bearing query string with a replace
     navigation/history operation, show an accessible success state, and link
     to sign in;
   - map token replay and provider rejection to the same expired/invalid state;
     never log or persist the token.

10. Add `/verify-email` as a public static shell with a `Suspense`-wrapped
    client result/resend leaf that reads only the fixed success marker and
    Better Auth callback `error` through `useSearchParams()`:

    - the successful callback state states that the address is verified and
      links to `/account`, because `autoSignInAfterVerification` creates the
      session only after proof of address control;
    - missing, expired, and invalid callback states never display raw provider
      codes and offer a resend form;
    - the resend form accepts an email, calls Better Auth's installed
      verification-send method with the same absolute callback URL, and always
      shows generic completion copy for syntactically valid input. It must not
      reveal whether an account exists or is already verified;
    - remove credential/error query parameters from the visible URL once the
      client has derived the display state, without changing the derived state;
    - direct navigation to a fixed success marker is presentation only and
      never authority: `/account` must continue to enforce the real session.

11. Reuse `AuthShell`, existing fields/buttons/links, tokens, type scale, and
    status/focus conventions. Keep `SiteNav` and `SiteFooter` byte-stable and do
    not alter their class strings or geometry. Do not add GSAP, a root provider,
    a component library, a Tailwind config, or a second design system. Public
    verification/reset routes stay outside `proxy.ts`; `/account` remains its
    only matcher and retains authoritative server-side session enforcement.

12. Do not change the Drizzle schema or generate a migration. Better Auth's
    existing `verification`, `user`, `account`, and `session` tables already
    support this flow. No application code may query them directly for these
    mutations; Better Auth's handler owns them.

13. Update `docs/backend.md` after implementation with a step 6 completion
    section. Record the installed APIs actually used, exact expiry and session
    policy, callback/query flow, idempotency construction, enumeration and log
    protections, route table, Resend sandbox limitation, personal data sent,
    checks actually run, measured outputs, and any deviation from this prompt.
    Correct the old `requireEmailVerification: false`/deferred-gap text in the
    existing step 6 record instead of leaving contradictory current-state
    claims. Do not edit historical prompt files.

14. Commit the completed prompt-52 implementation to `main` without prompting
    and do not push. Stage only files owned by this prompt. If prompt 51's
    unrelated Playwright work is still dirty, leave it unstaged and report that
    explicitly.

## Measurements and acceptance criteria

There is no comp-derived visual target. The existing `AuthShell` geometry is
the design measurement and must not be refitted. Acceptance is behavioural and
must be demonstrated against installed/runtime code:

- email/password signup creates no session before verification and returns the
  same visible completion state for a newly created address and Better Auth's
  duplicate-safe synthetic response;
- the verification message has HTML and plain-text parts, one-hour copy, one
  working provider URL, and an event-specific hashed-token idempotency key;
- a valid verification link marks the address verified, creates a session,
  lands on the fixed success state, and allows `/account`; expired/invalid
  links expose no raw error and can request a generic resend;
- an unverified email/password sign-in does not create a session and, for valid
  credentials, Better Auth's configured resend-on-sign-in path is exercised;
- known-address and unknown-address reset requests return indistinguishable
  public status and copy;
- a reset link exposes its token only in the provider/browser callback path,
  never in application logs or server-rendered props; the form removes it from
  the visible URL after deriving/successfully using it;
- password reset accepts 8-128 matching characters, updates the credential,
  consumes the token once, revokes existing sessions, rejects token replay and
  the old password, and accepts the new password;
- Google sign-in/sign-up, role input protection, OAuth token encryption,
  database rate limiting, `/account` enforcement, and `nextCookies()` ordering
  remain unchanged;
- no schema/migration, new environment variable, provider resource, email
  audience/contact, webhook, queue, or delivery log is added.

## Prerender impact

- `/sign-in` is expected to change because its static HTML gains the forgot-
  password affordance and safe verification guidance surface.
- `/sign-up` may change in its client bundle/interactive state; any initial
  static HTML difference must be accounted for rather than assumed.
- `/forgot-password`, `/reset-password`, and `/verify-email` are new public
  auth routes. They should remain statically prerendered shells; query-dependent
  content belongs under client `useSearchParams()` plus `Suspense`, not a
  request-time Server Component API.
- `/account` remains dynamic and protected exactly as before.
- `/`, `/about`, `/careers`, `/design-system`, `/journal`, all article routes,
  and all job-listing routes must retain byte-equivalent prerendered HTML after
  the documented normalisation/masking procedure. No marketing route is in
  scope.

Verify this with the production route table and a clean parent-build comparison
using `docs/automation.md`; do not infer it from changed filenames. Keep prompt
51's unrelated dirty files out of the comparison baseline or wait until they
are committed so the baseline is resolvable.

## Trust boundary

Public browser input crosses to Better Auth's catch-all handler through its
generated client API:

- signup/sign-in: name, email, password, and an absolute same-origin callback;
- forgot password: email and an absolute same-origin reset callback;
- reset: a provider-issued opaque token and new password;
- verification resend: email and an absolute same-origin verification
  callback;
- verification callbacks: Better Auth's signed token and callback URL.

The client validates only for usable feedback. Better Auth 1.6.26 performs the
authoritative schema/password/token validation, trusted-origin/origin checks,
database-backed rate limiting, token expiry/consumption, user update, session
creation, and session revocation inside its server handler. The UI never reads
auth tables or authorises a result from query text. `/account` remains the
authoritative post-auth check.

Rejected reset/verification credentials produce safe invalid-or-expired UI;
invalid credentials retain generic sign-in copy; reset and unauthenticated
verification-send requests do not disclose address membership. Never echo raw
provider errors, query values, tokens, passwords, or addresses into logs.

BotID is not added to Better Auth's catch-all in this prompt. It remains the
recorded auth-endpoint gap; the installed Better Auth database rate limiter,
origin checks, duplicate synthetic response, reset dummy work, and verification
resend constant-time floor are the verified controls here. Do not invent a
BotID wrapper or replace Better Auth endpoints with application Server Actions
to broaden this scope.

## Secrets and data

This change reads existing server-only variables only:

- `DATABASE_URL` through the existing pooled auth adapter;
- `BETTER_AUTH_SECRET` to sign/verify email credentials and sessions;
- `BETTER_AUTH_URL` as Better Auth's public origin and existing email link
  base;
- `RESEND_API_KEY` through the lazy existing send helper;
- `LEAD_NOTIFICATION_EMAIL` only as the existing optional reply-to policy;
- existing Google client variables remain used by the unchanged social path.

No `NEXT_PUBLIC_*` variable and no new environment-variable name is added.
Never expose, print, or commit values.

The existing Better Auth tables store expiring verification/reset values,
email-verification state, password hashes, and sessions; reset consumes its
value and revokes sessions. No new table or column is added. Verification and
reset sends transmit the user's name/email plus a credential-bearing signed URL
to Resend over TLS; Resend may retain message content and metadata under its own
policy. The application stores no send audit and logs no address, password,
token, signed URL, subject, or body.

The current `onboarding@resend.dev` sender delivers only to the Resend account
holder. Enabling required verification therefore makes arbitrary
email/password signups unable to complete outside that sandbox recipient until
an owned domain is acquired, SPF/DKIM/DMARC are published, and `FROM` is changed
as already recorded in `docs/backend.md`. This is a deployment prerequisite,
not permission to weaken verification. Google signup remains available and the
live email flow must be tested only with the authorised Resend account address.

## Non-goals

- Do not start build step 7's submissions view or any phase-two organisation,
  tenant, dashboard, calculation, reporting, or AI work.
- Do not change Google OAuth semantics, add another provider, allow public role
  input, or broaden `proxy.ts`.
- Do not provision a domain or provider integration, alter `FROM` to an
  invented address, add an outbox/retry queue, webhook, email audit table,
  contact/audience, password-changed notification, or marketing email.
- Do not add a custom auth Route Handler, application Server Action, Zod schema,
  Drizzle query, migration, Upstash limiter, or Blob storage path for Better
  Auth-owned operations.
- Do not restyle `SiteNav`, `SiteFooter`, `AuthShell`, Google buttons, or settled
  marketing pages; do not add animation.
- Do not modify, stage, or commit prompt 51's Playwright setup as part of this
  implementation.

## Checks to run

Run and record exact output; never report a pass without executing it:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. An env-less `npm run build` using the safe `.env.local` move/restore process
   in `docs/automation.md`, proving auth/email construction remains request-lazy.
5. Inspect the production route table and perform the prerender comparison in
   **Prerender impact**, separately accounting for intended auth-route changes.
6. Run `npm run db:generate` only as a no-schema-change guard. It must produce
   no migration; do not keep an empty or unrelated migration.
7. Render both new templates directly with React Email `render()` to HTML and
   plain text. Inspect the one-hour copy, one `<h1>`, CTA/fallback URL, safe
   footer, and accessible link styling. There is intentionally no preview
   script.
8. Exercise the full flow against a production build on an isolated documented
   port with real Development env and the authorised Resend account address:
   signup, no pre-verification session, received verification message, verify,
   auto-session, `/account`, generic resend, generic known/unknown reset
   requests, received reset message, password update, prior-session revocation,
   old-password rejection, new-password success, and token-replay rejection.
   Inspect the received email, not only provider acceptance. Do not quote the
   address or credential in docs/output.
9. Exercise expired/invalid/missing verification and reset states and confirm
   raw error codes/tokens never render or enter application logs. Confirm the
   credential query is removed after the client derives the state and after a
   successful reset.
10. Confirm existing Google sign-in and sign-up still initiate with their
    distinct semantics and callback; do not require a new external consent flow
    if the existing authorised account can verify it.
11. If prompt 51 has been committed and `npm run test:e2e` exists in the clean
    repository, run it. If it remains unrelated dirty work, do not use or commit
    it as evidence for prompt 52; report that condition exactly instead.
12. Inspect staged paths and grep staged content for secret/connection-string
    shapes before committing. Delete every synthetic auth user, credential,
    verification value, and session created by the checks, then verify the
    cleanup.

Finally update `docs/backend.md`, commit only the completed prompt-52 change to
`main`, and report exact reproduction/testing steps plus the Resend-domain
deployment prerequisite. Do not push.

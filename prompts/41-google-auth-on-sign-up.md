# 41 — Google authentication on `/sign-up`

## SKILLS USED

- **`better-auth-best-practices`** — verify Better Auth 1.6.26's Google
  `socialProviders` configuration and the `signIn.social()` client call.
- **`better-auth-security-best-practices`** — preserve CSRF/origin checks,
  review account linking, and encrypt stored OAuth tokens.
- **`nextjs`** — keep `/sign-up` prerendered, keep secrets server-only, and
  leave Better Auth's existing catch-all Route Handler as the sole OAuth mount.
- **`env-vars`** — add names-only Google OAuth variables to `.env.example` and
  configure real values outside the repository with correct environment scope.
- **`tailwind-4-docs`** — fit the Google control and separator with the existing
  Tailwind CSS 4 tokens and state variants; do not introduce configuration or a
  second styling system.
- **`vercel-react-best-practices`** — extend the existing client leaf without a
  root provider, extra client boundary, or avoidable state/effect work.

## Scope, and why it is next

Extend the committed Better Auth implementation from prompt 38 (`4e0afb2`) so
people can create or access an Aetherfield customer account with Google from
`/sign-up`. This is a user-requested extension of build step 6, not a new build
step and not Better Auth's enterprise SSO plugin: Google is a built-in social
OAuth provider, and `signIn.social({ provider: "google" })` handles both a new
Google-backed account and a returning Google account.

The email/password path stays available. A Google-created account receives the
same nullable, non-input `role` as any public signup, so it cannot grant itself
`staff` or `admin` and cannot read the submissions view.

## External prerequisite — resolve before writing code

This cannot be made operational with placeholder credentials. Before the
implementation starts, verify that the user has created a **Web application**
OAuth client in a Google Cloud project and has configured the real credentials
outside git. If either credential is unavailable, stop and ask the user to
complete this prerequisite; do not ship a mock or claim the OAuth flow works.

Google Cloud must contain the exact authorized redirect URI for every supported
origin:

- Development: `http://localhost:3000/api/auth/callback/google`
- Production/Preview: `<that environment's exact BETTER_AUTH_URL>/api/auth/callback/google`

The scheme, host, port, path, case, and trailing-slash choice must match exactly.
The repository currently records no deployed production domain, so do not
invent one. Add production or preview redirect URIs only after their real
`BETTER_AUTH_URL` values exist.

Store the credentials as server-only `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` values in the local/Vercel environment. Never paste,
print, log, or commit their values. Confirm names only with `vercel env ls`.

## Reference material read for this prompt

| reference | what it establishes |
| --- | --- |
| `AGENTS.md` §6, §7.2–§7.5, §8, §9, §11, §12 | layer boundaries, Better Auth/Next 16 traps, static-site contract, secrets, auth schema, roles, and anti-fabrication rules |
| `docs/backend.md:238` onward | the committed Better Auth configuration, generated schema, route modes, current env state, and verified auth behavior |
| `app/sign-up/page.tsx` | the static signup Server Component and settled `AuthShell` copy |
| `app/_components/auth/sign-up-form.tsx` | the existing email/password client leaf, status/focus behavior, and shared auth client construction |
| `lib/auth/server.ts` | lazy Better Auth construction, Drizzle adapter, non-input role, database limiter, and `nextCookies()` ordering |
| `app/api/auth/[...all]/route.ts` | the existing Better Auth catch-all mount; no new Route Handler is needed |
| `app/_components/primitives.tsx:138` onward | the existing button and field geometry, tokens, hover/focus, and disabled states |
| `app/globals.css` | Tailwind CSS 4 `@theme` tokens and the project-wide pointer rule |
| `node_modules/@better-auth/core/src/social-providers/google.ts` | installed Google provider options, default `openid email profile` scopes, PKCE requirement, and verified Google profile fields |
| `node_modules/better-auth/dist/api/routes/sign-in.d.mts` | installed `signIn.social` request shape, including `callbackURL`, `errorCallbackURL`, and provider `google` |
| `node_modules/@better-auth/core/dist/types/init-options.d.mts` | installed `socialProviders` and OAuth-token encryption options |
| `node_modules/next/dist/docs/01-app/02-guides/authentication.md` | current Next 16 auth boundaries |
| `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` | current Route Handler behavior |
| `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` | current server-only environment behavior |
| `https://better-auth.com/docs/authentication/google` | exact Better Auth Google setup, callback path, env names, and client call, checked 7 Aug 2026 |
| `https://better-auth.com/docs/concepts/users-accounts` | default verified-email account linking behavior, checked 7 Aug 2026 |
| `https://developers.google.com/identity/protocols/oauth2/web-server` | Google Web application credentials and exact redirect-URI matching, checked 7 Aug 2026 |

## What ships

### Server configuration

In `lib/auth/server.ts`, add:

- `socialProviders.google.clientId` from `GOOGLE_CLIENT_ID`;
- `socialProviders.google.clientSecret` from `GOOGLE_CLIENT_SECRET`;
- `account.encryptOAuthTokens: true`, using Better Auth's existing secret to
  protect OAuth access/ID/refresh tokens at rest.

Use only Google's default `openid`, `email`, and `profile` scopes. Aetherfield
does not need Drive, Gmail, Calendar, offline access, or refresh-token forcing.
Do not add Google One Tap, the SSO plugin, a Google SDK, or another package.

Keep Better Auth request-lazy so `next build` still succeeds without local
secrets at module evaluation. Do not weaken CSRF/origin validation, add wildcard
trusted origins, or move credentials into browser code. Keep `nextCookies()`
last in the plugin array.

Default Better Auth account linking remains enabled: when Google returns a
verified email matching an existing credential user, Better Auth may attach the
Google provider account to that same user. Do **not** add Google to
`trustedProviders`; Google already returns a verified-email claim, and forcing
unverified linking would broaden account-takeover risk. Do not enable different-
email linking or copy Google profile fields over an existing local profile.

No schema generation or migration is expected: the existing generated
`account` table already has provider and OAuth-token columns. Verify this from
the installed schema before implementation; if Better Auth reports a schema
change, stop and resolve it through `auth generate` + Drizzle rather than
hand-authoring DDL.

### `/sign-up` client leaf

Extend `app/_components/auth/sign-up-form.tsx`; do not add a root provider or
turn `app/sign-up/page.tsx` dynamic.

- Add a full-width, semantic `type="button"` control labelled **Continue with
  Google** above the email fields.
- Use a small inline, decorative Google mark only if its geometry and source are
  recorded; otherwise the text label is sufficient. Do not generate a bitmap
  or add a remote image/script.
- Add a labelled visual separator, **OR CREATE WITH EMAIL**, between the Google
  control and the existing form fields.
- Reuse the existing 52px field/control height, square corners, `border-border`,
  white/surface/ink colors, mono button typography, and accent focus outline.
  The new control needs hover, focus-visible, pending, and disabled states that
  remain legible without color.
- Replace the boolean pending state with the smallest state that distinguishes
  Google from email submission. While either path is pending, disable both
  paths so two auth attempts cannot race. Use **Connecting to Google...** for
  the Google pending label and preserve **Creating account...** for email.
- On activation, call the installed API
  `authClient.signIn.social({ provider: "google", ... })` with `/account` as the
  successful destination for both new and returning users.
- Supply an error callback to `/sign-up` and render a generic, accessible error
  in the existing focused live-status region when Google denies or the OAuth
  callback fails. Do not display raw provider error descriptions, credentials,
  email addresses, or tokens. Remove/replace the handled error query from the
  visible URL without adding a Next navigation hook that forces a CSR bailout.
- Preserve all current client validation and email/password behavior.

The user's request names `/sign-up` only, so `/sign-in` does not gain a Google
button in this prompt. A returning Google user can still authenticate from the
`/sign-up` control because Better Auth's social method is sign-in-or-create.

## Measurements and acceptance criteria

This route has no external comp. The existing implementation is the measured
baseline; changes are constrained to the right-hand auth card:

- auth shell grid, gutters, card padding, typography, sky band, nav, and footer
  class strings remain unchanged;
- the provider control is exactly `52px` high and full card width, matching the
  existing fields;
- the separator uses existing spacing and border tokens, with no new `@theme`
  token or global CSS;
- at mobile and desktop widths, no horizontal overflow, clipped label, or focus
  outline clipping;
- keyboard order is Google control, name, email, password, email submit, then
  the existing sign-in link;
- `/sign-up` remains `○ Static`; `/account` and the auth handler retain their
  existing dynamic behavior.

For visual verification, capture `/sign-up` at one narrow and one desktop
viewport after an approved implementation. This is a layout/state check, not a
comp comparison, so report dimensions as inspected facts and design choices as
judgements.

## Prerender impact

`/sign-up` changes prerendered markup by adding the Google control and email
separator. No other route's prerendered HTML or render mode may change.

Verify with `npm run build`, record the route table, and compare prerendered HTML
against parent commit using `docs/automation.md`. All pre-existing marketing
routes, `/sign-in`, and `/design-system` must be byte-identical after normalising
known build artifacts. `/account` and `/api/auth/[...all]` remain dynamic.

## Trust boundary

The browser sends only a provider identifier and trusted callback destinations
to Better Auth's existing `/api/auth/[...all]` handler. Better Auth generates
and validates OAuth state/PKCE, performs origin checks, exchanges Google's code
server-side, validates the returned Google identity, and writes through its
existing Drizzle adapter. Google receives the standard identity scopes and
returns name, verified email, profile image, and OAuth tokens.

Rejected initiation errors and callback failures produce a generic visible
message on `/sign-up`; they do not expose provider diagnostics to the user.
Google signup creates no staff role. Protected `/account` continues to validate
the session server-side and re-read role data from Postgres.

## Secrets and data

- `GOOGLE_CLIENT_ID` — server-only OAuth client identifier; not
  `NEXT_PUBLIC_*`.
- `GOOGLE_CLIENT_SECRET` — server-only OAuth secret; not `NEXT_PUBLIC_*`.
- `BETTER_AUTH_URL` — existing server-only base URL; determines the exact
  callback origin and must match the Google Cloud redirect registration.
- `BETTER_AUTH_SECRET` — existing server-only key; also protects encrypted
  OAuth tokens.

Extend `.env.example` with names and explanatory comments only. Real values
live in `.env.local`/Vercel and never enter the repository or output.

Google authentication stores or updates the existing Better Auth `user` and
`account` records: Google subject/provider identity, name, lower-cased verified
email, optional profile image URL, and encrypted OAuth tokens. It also creates
the normal session. Do not log any of those values, request bodies, callback
codes, tokens, or provider error descriptions. Do not request additional Google
data.

## Expected impact

- New users can create a null-role customer account through Google from
  `/sign-up` and land on `/account`.
- Returning Google users can use the same control and land on `/account`.
- An existing email/password user with the same verified Google email resolves
  to the existing user under Better Auth's verified-email linking behavior,
  rather than receiving staff privileges or a second local identity.
- Email/password signup remains unchanged and usable.
- No dependency, route, database table, migration, root provider, or marketing
  page change is expected.

## Non-goals

- No enterprise OIDC/SAML SSO plugin, Google Workspace domain restriction, One
  Tap, popup flow, or additional OAuth provider.
- No Google API access, additional scopes, offline access, refresh-token
  forcing, or profile synchronization.
- No Google button on `/sign-in`, because the user scoped this request to
  `/sign-up`.
- No account settings UI for linking/unlinking providers and no account merge
  tool.
- No email verification/reset work (build step 3), BotID work (step 2),
  dashboard/product UI, staff grants, or role-model change.
- No nav/footer restyle, auth-shell redesign, design-system addition, GSAP, or
  image-generation work.

## Checks and operational verification

Run and quote exact output from:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`

Then, with real Development credentials and a Google test user:

4. Confirm `/sign-up` starts a Google redirect whose callback is exactly
   `http://localhost:3000/api/auth/callback/google`.
5. Complete a new-user Google flow; verify `/account` returns 200 and the new
   database user has no staff role.
6. Sign out, repeat through the same control, and verify the same user/account
   is used rather than duplicated.
7. Cancel/deny at Google and verify `/sign-up` shows the generic focused live
   status without exposing the raw provider description.
8. Exercise email/password signup or sign-in to confirm it still works.
9. Delete only the synthetic/test user, provider account, and sessions created
   by these checks; report that cleanup. Do not touch real users.

If real credentials or the Google consent configuration are unavailable, report
the exact blocked checks and do not claim end-to-end success.

Read `docs/automation.md` before screenshots or HTML comparison. Record the
implementation, env names, callback origins actually configured, account-
linking decision, token encryption, route table, check output, and honest test
coverage in `docs/backend.md`. Commit the completed change to `main`; do not
push.

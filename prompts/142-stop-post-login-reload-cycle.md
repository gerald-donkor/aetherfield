# 142 — Stop the post-login reload cycle

## Scope and why this is next

Correct the repeated navigation/session-loading cycle visible immediately after
email/password sign-in. This is the user's current reported regression and is
independent of the completed backend build sequence and architecture-remediation
sequence.

The browser auth client is currently constructed separately in every auth leaf
and once more in `SiteNav`. A successful `signIn.email()` therefore notifies a
session store that the mounted navbar does not use. `SignInForm` compensates by
starting `router.replace("/account")` and immediately calling
`router.refresh()`. The destination then mounts the navbar's separate session
store, which performs its own session request. Against the dynamic `/account`
page, those overlapping requests show up in development as repeated
`Compiling...` cycles while the navbar repeatedly presents its unauthenticated
fallback before returning to `Account`.

Make the browser-side Better Auth client one shared instance, let Better Auth's
documented session signal update every subscriber, and reduce successful login
to one client-side navigation. Preserve the authoritative server-side session
check on `/account`; the shared client is presentation and client coordination,
never authorisation.

## Reference material read

- User recording:
  `/home/dgk/Videos/screenrecording-2026-09-21_20-47-07.mp4` — 1342×718,
  constant 60 fps, 21.133 seconds. The account body remains present while the
  development indicator repeatedly returns to `Compiling...` and the navbar's
  final label alternates between `Get started` and `Account`.
- `AGENTS.md`, especially the Next.js 16, settled chrome, client-leaf, static
  marketing, auth trust-boundary, prompt, verification and anti-fabrication
  rules.
- `docs/backend.md`, especially step 6, Better Auth's request-lazy server
  configuration, the auth-leaf navigation notes, and prompt 109's per-site
  `router.refresh()` determination.
- `docs/chrome.md`, especially the settled `SiteNav` and prompt 131's auth-aware
  CTA contract.
- `docs/motion-site.md`, especially the navbar drop-in and the auth-label-aware
  `NavLinkWave` rebuild and cleanup.
- `docs/automation.md`, especially reference-recording inspection, production
  browser checks, authenticated Playwright environment overrides, and the
  warning not to disturb a user's running development server.
- `app/_components/chrome.tsx`.
- All current `createAuthClient()` call sites under `app/_components/auth/`.
- `app/_components/auth/sign-in-form.tsx` and
  `app/_components/auth/sign-out-button.tsx`.
- `app/account/page.tsx`, `lib/auth/server.ts`, `lib/auth/organization.ts`, and
  `proxy.ts` for the authoritative request-time boundary.
- Installed Better Auth 1.6.26 sources:
  `node_modules/better-auth/dist/client/config.mjs`,
  `session-atom.mjs`, and `session-refresh.mjs`. The installed client registers
  `/sign-in/email` and `/sign-out` as `$sessionSignal` mutations; one shared
  client therefore gives the navbar the mutation signal directly. Its refetch
  preserves existing non-null session data while refetching.
- Installed Next.js 16.2.12 docs:
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`.
  `router.replace()` performs the destination navigation; `router.refresh()`
  separately requests and re-renders the current Server Component route.

## Implementation contract

1. Add one browser-only Better Auth client module under `lib/auth/` and export
   exactly one `createAuthClient()` result. It must read no secret, import no
   server module, add no provider, and carry no organisation or staff
   authorisation logic.
2. Replace every component-local `createAuthClient()` instance with the shared
   client, including the navbar, sign-in, sign-out, sign-up, Google sign-in,
   password-reset, forgot-password and verification leaves. Do not leave two
   browser session stores behind under different import paths.
3. After a successful email/password sign-in, keep the single
   `router.replace("/account")` navigation and remove the immediately adjacent
   `router.refresh()`. Update the stale prompt-109 comment: the shared Better
   Auth client now invalidates its own session atom, while the uncached
   destination navigation performs the authoritative `/account` render against
   the newly written HttpOnly cookie.
4. Re-evaluate sign-out against the same installed-source evidence. If the
   shared `$sessionSignal` and the navigation make its refresh redundant too,
   remove it and record the measured behavior; otherwise keep it and state the
   observed reason. Do not make a blanket `router.refresh()` deletion anywhere
   else.
5. Keep `getCurrentAccount()`, `proxy.ts`, `/account` redirects, Better Auth's
   catch-all Route Handler, cookie settings, CSRF/origin checks, rate limiting,
   email verification and server configuration unchanged. A client session is
   never accepted as authorisation.
6. Preserve `SiteNav`'s exact geometry, glass classes, destinations, mobile
   behavior, five `data-nav-wave` markers, `NavDrop`, SplitText configuration,
   auth-label key/dependency cleanup and all existing motion timings. Do not
   restyle the settled nav or footer.
7. Add a regression check at the narrowest maintainable level. It must cover a
   real successful email/password sign-in through the browser form and prove
   that the client reaches `/account`, the navbar settles on `Account`, and no
   second account refresh/navigation follows. Reuse the existing authenticated
   fixture/cleanup machinery or an equally bounded ephemeral user; never commit
   a password or leave synthetic rows behind.

## Measurement and acceptance

Reproduce against `npm run dev`, because the reported symptom includes Next's
development `Compiling...` indicator, and verify the same flow against the
production server used by Playwright.

Start counting immediately before submitting valid credentials and record:

- one successful `POST /api/auth/sign-in/email`;
- the number and timing of `GET /api/auth/get-session` calls caused by the
  successful mutation;
- the number of `/account` document/RSC navigation requests;
- `performance.getEntriesByType("navigation")` before and after the client
  transition;
- the visible final navbar label after the route and session settle.

Acceptance is one intentional transition to `/account`, no subsequent
`router.refresh()`-driven account request, no repeated authenticated-to-fallback
navbar cycle, and a stable `Account` label. A Better Auth session refetch is
expected; repeated route refreshes are not. Report observed request counts and
timings as measurements, and describe any perceived smoothness only as a
judgement.

Also verify sign-out once: it must land on `/sign-in`, clear the live session,
show `Get started`, and make a direct visit to `/account` redirect back to
sign-in. Verify Google initiation and the verification/password-reset leaves
still call the same Better Auth endpoints after their import-only change.

## Expected impact

- Runtime change: auth leaves share one client-side Better Auth store, and
  email/password login no longer starts an extra route refresh after navigation.
- Server boundary: unchanged. `/account` remains dynamic and database-backed;
  `proxy.ts` remains optimistic only.
- Prerendered HTML: no visible markup or render-mode change is expected. The
  shared client module changes JavaScript module composition only. The static
  marketing/auth routes must remain static, article/job routes SSG, and
  authenticated routes dynamic exactly as before.
- Bundle impact: one shared auth-client module may re-segment hashed chunks, but
  must not add a second Better Auth implementation, GSAP/SplitText copy,
  dependency or client provider. Measure route chunk counts and relevant gzip
  deltas rather than assuming them.

## Non-goals

- No auth provider, credential policy, email, database, schema, migration,
  organisation, role, proxy matcher, rate-limit or environment-variable change.
- No server-side session provider around `app/layout.tsx`; the marketing site
  must remain prerendered.
- No weakening of CSRF, origin, secure-cookie or authoritative session checks.
- No navbar/footer redesign, motion retiming, new loading UI, persistence in
  `localStorage`/`sessionStorage`, or suppression of Next's development
  indicator.
- No changes to unrelated Server Actions or their deliberate
  `router.refresh()`/`revalidatePath()` behavior.
- Do not modify the unrelated existing working-tree change in
  `.agents/skills/tailwind-4-docs/references/docs-source.txt`.

## Prerender impact

Expected: none in rendered HTML or route mode. Verify the complete route table
and compare normalized prerendered HTML against the parent commit using
`docs/automation.md`. Every existing marketing/auth route must keep its current
`○ Static` marker; the six articles and three job listings remain `● SSG`; all
authenticated and API routes remain `ƒ Dynamic`. If any visible HTML changes,
stop and report it rather than widening this prompt.

## Trust boundary

The email and password cross from the browser directly to Better Auth's existing
`/api/auth/sign-in/email` handler, which validates credentials and writes the
HttpOnly session cookie. The shared client only coordinates Better Auth's own
session signal in the browser. `/account` continues to call
`getCurrentAccount()` with request headers and re-read server-side role data;
its rejected request continues to redirect to `/sign-in`. No browser session
value authorises a read or write.

## Secrets and data

The change introduces no variable and reads no new secret. Existing
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, database and provider values stay
server-only. The same name/email/session data travels through Better Auth; no
new personal data is stored, logged or transmitted. Browser/network evidence
must redact credentials, cookie values, session tokens and email addresses.

## Verification and documentation

Run and quote exact output for:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:local
git diff --check
```

Perform the development and production browser measurements above with a
bounded synthetic user, clean it up, and verify the database fixture readback.
Compare normalized prerendered HTML, route modes, emitted CSS, representative
route chunk counts, and Better Auth/GSAP-containing chunks against the parent
commit. Record the auth-client/navigation correction and measurements in
`docs/backend.md`, and the auth-aware navbar's now-stable session transition in
`docs/chrome.md`. Update `docs/automation.md` only if this investigation finds a
repeatable mechanical step not already documented. Commit the approved prompt
and implementation to `main`; do not push.

## SKILLS USED

- `agent-browser` — reproduce and measure the browser login transition,
  requests, navbar state and navigation stability.
- `nextjs` — follow installed App Router navigation, dynamic-route and
  prerender behavior.
- `next-cache-components` — verify that removing `router.refresh()` is not
  confused with Cache Components or server cache invalidation; this project
  still has Cache Components disabled.
- `better-auth-best-practices` — centralize the installed Better Auth browser
  client and use its documented session signal correctly.
- `better-auth-security-best-practices` — preserve cookies, CSRF/origin checks,
  session enforcement and the server trust boundary.
- `email-and-password-best-practices` — verify the successful credential
  sign-in and email-verification callback behavior after navigation changes.
- `gsap-core` — preserve the navbar's named media conditions and explicit
  resting transforms while the auth label changes.
- `gsap-react` — verify the auth-label rebuild retains scoped `useGSAP`
  lifecycle and cleanup.
- `gsap-timeline` — preserve the prebuilt per-link hover timelines across the
  one session-label transition.
- `gsap-plugins` — preserve SplitText ARIA, ignored arrow and reversion behavior
  when `Get started` becomes `Account`.

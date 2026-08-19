# 131 — Auth-aware navbar "Get started" button

Make the site navigation header (`SiteNav` in `app/_components/chrome.tsx`) auth-aware so that when a user is logged in with an active Better Auth session, the "Get started" button (which points to `/sign-in`) is replaced with an "Account" link (pointing to `/account`) across both desktop and mobile navigation.

## SKILLS USED

- `nextjs` — App Router client component conventions, hydration, and static prerendering invariants.
- `better-auth-best-practices` — Client-side session consumption via `createAuthClient` and `useSession` from `better-auth/react`.
- `tailwind-4-docs` — Styling and typography consistency with existing navbar classes.

---

## 1. Context & Reference Material

- User report and screenshot: `/home/gdk26/Pictures/Screenshots/Screenshot_20260819_184839.png` showing `SiteNav` rendering "Get started →" while the user has an active session.
- `app/_components/chrome.tsx` — `SiteNav`, `NAV_ITEMS`, desktop nav (`LinkButton`), and mobile nav panel (`ButtonLink`).
- `app/_components/primitives.tsx` — `LinkButton` (desktop link-with-arrow primitive) and `ButtonLink` (mobile full-width button primitive).
- `docs/chrome.md` — Invariants for `SiteNav`, fitted blur/tint, `LinkButton` SVG arrow, settled `SiteFooter`.
- `AGENTS.md` — §1 Workflow, §2 Commands, §4 Prompt files, §8 Backend contract.

---

## 2. Implementation Scope

1. **Client session consumption in `SiteNav`**:
   - In `app/_components/chrome.tsx`, initialize `authClient` via `createAuthClient()` from `"better-auth/react"`.
   - In `SiteNav`, subscribe to session state using `authClient.useSession()`.
   - Derive `isAuthenticated = Boolean(session?.user)`.

2. **Desktop navigation CTA**:
   - When `isAuthenticated` is false (logged out / SSR default): render `<LinkButton href="/sign-in">Get started</LinkButton>`.
   - When `isAuthenticated` is true (logged in): render `<LinkButton href="/account">Account</LinkButton>`.

3. **Mobile navigation panel CTA**:
   - When `isAuthenticated` is false (logged out / SSR default): render `<ButtonLink href="/sign-in" onClick={() => setOpen(false)} className="mt-6 h-[52px] w-full">Get started</ButtonLink>`.
   - When `isAuthenticated` is true (logged in): render `<ButtonLink href="/account" onClick={() => setOpen(false)} className="mt-6 h-[52px] w-full">Account</ButtonLink>`.

4. **Preserve existing layout & motion invariants**:
   - `SiteNav` dimensions (1320×60 bar), gutters (`CONTAINER`), sticky frosted glass (`bg-white/85 backdrop-blur-[32px] supports-[backdrop-filter]:bg-white/10`), and `NavDrop` wrapper remain completely untouched.
   - `SiteFooter` is settled and remains untouched.

---

## 3. Non-goals

- Do not alter the footer navigation items or `SiteFooter` (settled invariant).
- Do not modify marketing page content or server components' static generation.
- Do not add or change any server actions or API endpoints.

---

## 4. Prerender impact

- **Prerender HTML**: No change to static prerendered HTML output at build time. During static generation and SSR (where no session cookie is present), `useSession()` evaluates to unauthenticated state and emits `<LinkButton href="/sign-in">Get started</LinkButton>` / `<ButtonLink href="/sign-in">Get started</ButtonLink>`, maintaining identical static HTML for all prerendered marketing pages.
- **Client Hydration**: In the browser with an active session cookie, Better Auth's reactive store updates and swaps the CTA to `Account` (`/account`).

---

## 5. Trust boundary

- The client reads session data through Better Auth's existing client hook (`useSession()`), which communicates with `/api/auth/get-session` using standard HttpOnly session cookies. No unvalidated user inputs cross the trust boundary.

---

## 6. Secrets and data

- No new environment variables.
- No new personal data stored, transmitted, or logged.

---

## 7. Checks & Documentation

1. Run verification checks:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
2. Update `docs/chrome.md` to document the auth-aware `SiteNav` behavior.
3. Commit the change to `main`.

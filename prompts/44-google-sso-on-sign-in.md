# 44 — Google SSO on `/sign-in`, and the Google mark on both auth cards

## SKILLS USED

- **`better-auth-best-practices`** — the auth client surface. `signIn.social()`
  already works on `/sign-up`; this prompt reuses it rather than re-deriving it,
  and the skill is what confirms the option names (`callbackURL`,
  `errorCallbackURL`, `newUserCallbackURL`) against v1.6 rather than memory.
- **`better-auth-security-best-practices`** — read **before** changing anything
  about the sign-in path. Specifically: whether adding a social control to
  `/sign-in` changes account-linking exposure, and whether `trustedProviders`
  or `disableSignUp` on the social provider should be reconsidered now that the
  same provider is reachable from two pages.
- **`vercel:nextjs`** — Next 16.2 client components and static rendering. The
  one thing that must be verified, not assumed: that the new control keeps
  `/sign-in` and `/sign-up` **`○ Static`**. `useSearchParams` in a client leaf
  is what would opt a page out, and the existing `/sign-up` leaf deliberately
  reads `window.location` instead for exactly that reason.
- **`frontend-design:frontend-design`** — this prompt renders real UI on two
  settled, measured pages. The Google mark is the first colour to enter the
  auth card, and where it sits relative to the label is a design decision, not
  a default.
- **`tailwind-4-docs`** — the class strings. Tokens live in `@theme` in
  `app/globals.css`; there is no `tailwind.config.js`.
- **`design-handoff`** — optional, and only if the button's states need to be
  specified before they are built rather than after.

Not needed, deliberately: every `gsap-*` skill and `motion` (§7.5 — no GSAP in
backend UI, and this control has no motion beyond the existing CSS transition);
`drizzle-docs` (**no schema change, no migration** — see non-goals); `resend`,
`react-email` and `email-best-practices` (step 3 is committed and this sends no
mail); `zod-docs` (no new input crosses the boundary); `vercel:marketplace` and
`vercel:vercel-storage` (nothing is provisioned).

## Scope, and why it is next

**User-directed, on 7 Aug 2026, from a screenshot of `/sign-in` with the auth
card circled.** Two things were asked for:

1. **Google single sign-on on `/sign-in`**, which does not exist today.
2. **The Google logo displayed properly** on that control **and on `/sign-up`'s
   existing one**, which today is text only.

**This is not a §5.2 build step.** Like prompt 41, it extends the committed step
6 work; it adds no package, no route, no table and no migration. Resolved from
the repository and `git log`, not from §5.2 and not from `prompts/`:

- Step 6 is committed (`4e0afb2`), extended by prompt 41 (`bddc456`) which put
  Google on `/sign-up` only.
- Step 3 is committed (`9778e41`, `7f53872`).
- `app/_components/auth/sign-in-form.tsx` has **no social control at all** — its
  `pending` is a bare `boolean` and it imports nothing from Better Auth beyond
  `signIn.email`.
- `app/_components/auth/sign-up-form.tsx:128-137` is the existing Google
  control: a 52px full-width button whose entire content is the string
  `Continue with Google`. **There is no image, no SVG and no `next/image`** —
  `docs/backend.md:401` records that as a deliberate choice at prompt 41, which
  is what this prompt revisits.

### The displaced work, recorded so it is not read as dropped

`prompts/43-transactional-email.md` states that password reset and email
verification "are **prompt 44**". **They are not — this file is 44**, at the
user's direction. That work is still unbuilt and still wanted: the
`sendResetPassword` / `sendVerificationEmail` hooks on `lib/auth/server.ts`,
flipping `requireEmailVerification` off `false` at `lib/auth/server.ts:28`, and
the two screens behind them. It moves to a later number. **The sender it needs
now exists** (`lib/email/`, step 3), so nothing blocks it but sequencing.

## Reference material to read first

| path | what it is |
| --- | --- |
| `AGENTS.md` §5 (the register), §6.2, §7.3 (Better Auth traps), §7.5, §8.1, §11.2, §12 | the contract. **§8.1 is the one this prompt deliberately spends**, and it must be spent knowingly |
| `docs/backend.md:371-410` "Step 6 extension — Google authentication on `/sign-up`" | **read the whole section.** It records the provider config, the linking decisions, the pending-state discipline and the `?error=` handling this prompt generalises |
| `docs/backend.md:411-457` | prompt 41's verification, including the prerender diff method and the three Google outcomes it could **not** exercise |
| `app/_components/auth/sign-up-form.tsx` | the source this prompt factors from — `PendingPath`, `onGoogleSignIn`, the `?error=` cleanup effect, the button's class string |
| `app/_components/auth/sign-in-form.tsx` | the target. Its `pending` is a `boolean` and must become a discriminated path, or Google and email attempts can race |
| `app/_components/auth/auth-shell.tsx` | the card both forms render into. **It is not changed by this prompt** |
| `app/_components/primitives.tsx` | `Button`, `Field`, `Wordmark` — the existing vocabulary. No component library, no second design system (§7.5) |
| `app/globals.css` `@theme` | the tokens. The Google mark's four brand colours are the **only** values in this change that are not from that block, and that is the point of the exception |
| `lib/auth/server.ts` | the provider config. **Read it; do not assume this prompt needs to change it** |
| Google's current Sign-In branding guidelines, fetched live | see below — **not** recalled |

### The one thing this prompt refuses to specify from memory

**Google owns the mark, and its rules move.** Icon size, clear space, minimum
button height, permitted background variants, permitted label strings
("Sign in with Google" vs "Continue with Google") and whether a custom-styled
button is permitted at all are **Google's to state, not this file's**. §12 rule
7 applies directly.

**Fetch the current guidelines at implementation time and record what they say
in `docs/backend.md`, with the date.** If a rule cannot be verified, say so and
choose the more conservative option rather than inventing a number. Do not copy
a pixel value out of this paragraph, because there is none.

What *is* decided here: the mark ships as an **inline SVG**, four paths, the
official multi-colour "G", unmodified and never recoloured, never used as a
background image and never fetched over the network. That follows from the
existing constraints rather than from taste — a remote asset is a request the
auth card does not currently make, and `docs/backend.md:401` records "no Google
SDK, remote script, image" as the standing position.

## What ships

### A shared Google control, not a copy-paste

`sign-up-form.tsx`'s handler, its `?error=` cleanup effect and its button are
duplicated into `sign-in-form.tsx` **only if this prompt fails.** Extract them
into one client module — `app/_components/auth/google-sign-in-button.tsx` is
the expected path — which both forms render.

Constraints on the extraction:

- **Component-only export** (the front matter's bundle rule). One component,
  no exported constant, no exported type that pulls the module into a server
  graph.
- **The parent still owns the pending state.** Both attempts must not race,
  which is what `sign-up-form.tsx`'s `PendingPath` already prevents.
  `sign-in-form.tsx`'s `pending: boolean` therefore becomes the same
  discriminated union. The button takes `disabled` and reports its own
  transitions upward; it does not hold a second, independent pending flag.
- **The `?error=` cleanup moves with it.** Today it lives in `sign-up-form.tsx`
  and hardcodes nothing about the page, but the `errorCallbackURL` does — so
  the error destination becomes a prop, `/sign-in` for one caller and
  `/sign-up` for the other.
- **`window.location`, never `useSearchParams`.** This is the whole reason both
  pages are still `○ Static`, and it is the single easiest thing in this prompt
  to break.
- The generic failure message stays generic. The machine-readable `error` and
  provider `error_description` parameters are stripped with
  `history.replaceState` and **never rendered** — that is prompt 41's decision
  and it is not reopened.

### The label differs per page, and the reason is not cosmetic

`/sign-up`'s control creates an account; `/sign-in`'s signs into an existing
one. Better Auth's `signIn.social()` does both — an unrecognised Google account
signing in from `/sign-in` will **create** a user unless the provider is
configured otherwise. **Decide deliberately, and record the decision:** either
that is the intended behaviour and the labels say something honest about it, or
`disableSignUp` belongs on the provider and `/sign-in` needs an error state for
"no account with that Google address". Read
`better-auth-security-best-practices` before choosing, and do not leave it
implicit.

The separator string is currently `OR CREATE WITH EMAIL`. `/sign-in`'s
equivalent must read as sign-in, not creation.

### The mark on both buttons

Both controls gain it — that is the second half of the request. The layout
question is real and belongs to `frontend-design`: the existing button centres
its label, and a mark plus a centred label is a different composition from a
mark pinned left with the label centred in the remainder (which is what Google's
own button does). **Choose one, apply it to both pages identically, and say
which and why.**

Accessibility: the mark is decorative beside a text label, so it takes
`aria-hidden` and the button keeps its accessible name from the text. It must
**not** become the button's only content. Focus-visible, hover, disabled and
pending treatments already exist on the sign-up control and carry over
unchanged; the mark must not disappear or recolour in any of them.

### `lib/auth/server.ts`

**Expected to need no change**, because the provider is already configured and
`signIn.social()` is provider-level, not page-level. **Verify that rather than
assuming it** — and if the `disableSignUp` decision above goes the other way,
this is the file it lands in, and it is a deliberate behaviour change to record.

## Prerender impact

**Not `none`, and this is the prompt's one approved §8.1 exception.**

- **`/sign-in`** — its prerendered HTML **changes**: a new button, a new
  separator, and a new inline SVG. Requested by the user.
- **`/sign-up`** — its prerendered HTML **changes**: the inline SVG is added
  inside the existing button. Requested by the user.
- **Every other route must be byte-identical.** `/`, `/about`, `/careers`,
  `/journal`, `/design-system`, the six articles and the three job listings are
  not in scope and must not move. `auth-shell.tsx` is shared with nothing else,
  but `primitives.tsx` is shared with everything — **an edit there is how this
  prompt would silently change nine other pages**, so prefer not to touch it,
  and if it must be touched, say so and diff for it.
- **Both pages must stay `○ Static`.** A page that goes `ƒ` has failed this
  prompt even if it looks right.

Verification is the existing one: `npm run build`, confirm the route table, then
diff the prerendered HTML against the parent commit per `docs/automation.md`,
including its stale-worktree note. **`sign-in.html` and `sign-up.html` are the
only two files permitted to differ**, and the diff for each must be explainable
line by line.

## Trust boundary

**No new server-side request path, and no new mutation.** The action already
exists: `signIn.social()` posts to Better Auth's own catch-all handler at
`app/api/auth/[...all]/route.ts`, the §7.3-sanctioned exception to §6.2. This
prompt adds a second *page* that initiates it, not a second endpoint.

- **Crossing out:** the browser is redirected to Google's consent screen. No
  Aetherfield credential and no form input crosses.
- **Crossing back:** Google's authorisation code, to Better Auth's callback,
  exchanged server-side. `account.encryptOAuthTokens: true` is already set
  (`docs/backend.md:385`) and is not reopened.
- **Authorised by:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, server-only,
  unchanged.
- **A rejected request returns:** the user to `errorCallbackURL` with one
  generic message; the provider's `error_description` is stripped and never
  rendered.
- **What this genuinely widens:** a second public page can now start an OAuth
  flow, so **`redirect_uri` and origin configuration must be re-checked**, and
  the "does signing in create an account" question above must be answered
  rather than inherited.
- **Rate limiting:** Better Auth's own, unchanged. The Upstash limiter guards
  the demo form and does not cover auth; **say so plainly rather than implying
  coverage this path does not have.**

## Secrets and data

- **Reads:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `DATABASE_URL` — all already present, all server-only,
  **none read by this change directly**; it renders a button.
- **Adds no environment variable, and no `NEXT_PUBLIC_*`.** Phase one still has
  none. `.env.example` is **not** edited by this prompt.
- **Stores nothing new.** No column, no table, no migration. `npm run
  db:generate` producing a file is a signal to investigate, not to commit.
- **Logs nothing.** No `console` call is added, and no OAuth error string,
  email address or provider payload is logged (§8.3 rule 2).
- **The mark is the only third-party asset**, it is inlined, and it makes no
  network request — so no new origin, no CSP question and no referrer leak.

## Non-goals

- **No password reset and no email verification**, despite prompt 43 naming
  them "prompt 44". They are displaced to a later number (above). **Do not flip
  `requireEmailVerification` at `lib/auth/server.ts:28`** — flipping it with no
  screen behind it locks people out of accounts step 6 already ships.
- **No second social provider.** Not GitHub, not Microsoft, not Apple.
- **No `/design-system` exhibit for the button.** The two auth pages are where
  it lives; adding a third render site is a third page whose HTML changes.
- **No change to `auth-shell.tsx`, and none to the settled chrome.** `SiteNav`
  and `SiteFooter` are untouched (front matter).
- **No `next/image`, no remote SVG, no icon library, no Google SDK or GSI
  script.** Inline paths only.
- **No motion.** No GSAP, no Motion, no entrance animation on the button
  (§7.5).
- **No account-management UI** — no "disconnect Google", no linked-accounts
  view. That is step 7 territory at the earliest.
- **No new route, no new API handler, no new package.**

## Checks to run

Section 2 in full, quoting exact output: `npm run lint`, `npm run typecheck`,
`npm run build`. Then, none of which may be asserted without running it (§12
rule 3):

1. **The route table from the actual build output**, showing `/sign-in` and
   `/sign-up` still **`○ Static`** and nothing newly dynamic anywhere.
2. **A prerender diff against the parent commit**, demonstrating that
   `sign-in.html` and `sign-up.html` are the **only** two files that differ, and
   explaining each difference. The standing warning about `/`, `/journal` and
   `/careers` still applies to any page-wide `magick compare`.
3. **The rendered control, screenshotted at 375px and 1280px** on both pages —
   the same widths prompt 41 measured at — showing the mark, its alignment and
   its size. Quote the measured height and the mark's rendered size rather than
   describing them.
4. **Every visual state exercised**: rest, hover, focus-visible, disabled and
   pending, on both pages, with the mark still correct in each.
5. **A live Google initiation from `/sign-in`**, reaching Google's own account
   surface with **neither `redirect_uri_mismatch` nor `invalid_client`** — the
   same bar prompt 41 met from `/sign-up`. If interactive Google account access
   is unavailable, **say exactly that and list what stays unverified**, as
   `docs/backend.md:453-457` already does. Do not claim a completed login that
   did not happen.
6. **The `?error=` path still behaves** on both pages: one generic message,
   `error` and `error_description` stripped from the URL, status region focused.
7. **Neither page uses `useSearchParams`** — grep for it and quote the empty
   result. This is the check that catches the static-to-dynamic regression
   before the route table has to.
8. **`npm run db:generate` reports no schema changes.**
9. **No secret in the diff**, grepped before committing.

## Recording

Extend **`docs/backend.md`**'s existing "Step 6 extension — Google
authentication" section, or add a sibling section beside it — **not a new file**,
because this is the same feature and splitting it makes the linking and
`disableSignUp` decisions hard to find. Record:

- **what Google's branding guidelines actually say, fetched and dated**, and
  which of their rules the shipped button meets, which it deliberately deviates
  from, and why;
- the shared-component factoring, and which module now owns the `?error=`
  cleanup;
- **the "does Google sign-in from `/sign-in` create an account" decision**, the
  reasoning, and whether `disableSignUp` was set — this is the most consequential
  line in the change and the easiest to lose;
- the label and separator strings on each page;
- the prerender diff result, file by file;
- the measured control geometry at both widths, marked **measured**, and any
  judgement marked as a judgement;
- everything that stayed unverified for want of an interactive Google account.

`AGENTS.md` amendments — **none are expected.** This adds no variable, no
script, no invariant and no index row. If something here genuinely contradicts
the file, fix that line in the same change and say so (§12 rule 8); do not
extend §5.2, and do not mark anything done there.

Then commit to `main`, unprompted (§1 step 10).

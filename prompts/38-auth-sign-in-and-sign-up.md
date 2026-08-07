# 38 — Better Auth: sign-in and sign-up, and the two CTAs that lead there

## SKILLS USED

- **`vercel:auth`** — the platform's authentication skill. **It recommends
  Clerk and this project does not use Clerk** (§7.2). Read it for the Next.js
  auth *shape* — route mount, session reads, protecting a route — and discard
  its provider recommendation. Do not let it revert the decision.
- **`vercel:nextjs`** — App Router conventions on 16.2: `proxy.ts` (not
  `middleware.ts`), async `headers()` / `cookies()`, route groups, and what
  keeps a route static.
- **`neon-postgres`** — the pooled/direct split the auth tables are created
  over, and the migrations-as-code rule.
- **`vercel:env-vars`** — `.env.example` vs `.env.local`, and why
  `BETTER_AUTH_SECRET` is generated locally rather than provisioned.
- **`tailwind-4-docs`** — the config-less `@theme` tokens in `app/globals.css`,
  for the new field primitive. There is no `tailwind.config.js`.
- **`frontend-design:frontend-design`** — the sign-in and sign-up screens are
  design work on a comp-matched site, not scaffolding. Read before laying them
  out.
- **`vercel:vercel-cli`** — `vercel env ls` / `add` to verify what actually
  landed rather than asserting it.

Not needed, deliberately: `vercel:marketplace` and `vercel:vercel-storage`
(Better Auth is a library, not an integration — §7.2 — and Neon is already
provisioned), `vercel:ai-sdk` (§5.3), every `gsap-*` skill (the auth screens
carry no GSAP; §7.5 forbids it in backend UI).

## Scope, and why it is next

**This is build step 6 of §5.2 — Better Auth — pulled ahead of steps 2–5 at the
user's explicit direction on 7 Aug 2026:** *"Get started and explore the
platform should lead to auth."* Those two CTAs are on the site's most valuable
surfaces, and §5.2's order had them waiting behind three steps that do not
unblock them. Step 6 depends only on step 1, which is committed (`6f120b2`), so
nothing else has to move.

Resolved from the repository, not from this list: `lib/` contains only `db/`,
there is no `app/api`, no `actions.ts` and no `proxy.ts`. Nothing of step 6
exists.

**What the user decided, and what each decision costs:**

| decision | consequence |
| --- | --- |
| auth before demo capture | the §10 write path arrives at step 2, so this prompt cannot copy it — it establishes only what Better Auth's own handler needs. See "the §8.2 gap" below. |
| **"sign in and sign up"** — public self-registration | **an explicit deviation from §11.2 rule 3**, which says there is no public registration route in phase one. Rewrite that rule in this change (§12 rule 8); do not leave the file contradicting the repository. |
| both hero CTAs share one destination | `/sign-in`, from "Get started" *and* "Explore the platform". Two adjacent hero buttons then do the same thing — that is the user's call, recorded here so a later session does not "fix" it. |

## Three amendments this change must make to `AGENTS.md`

Not optional, and not a separate change (§12 rule 8):

1. **§11.2 rule 3** — rewrite. Public sign-up exists. State what a self-signed-up
   user *is*: a customer account with **no staff role**. Staff and admin remain
   admin-granted and remain the only roles that can read the submissions view
   (step 7). A signup must never be able to grant itself staff.
2. **§5.2 step 2's row** — it names "the nav's 'Get started'" as a demo-request
   surface. It is not one any more. Amend it to the hero's "Request a demo" and
   the `CtaBand`. Note that `lead_source`'s `nav` value (`lib/db/schema.ts:38`)
   is consequently expected to go unwritten; **do not drop it here** — that is a
   migration, and it belongs to step 2 which may yet put a demo CTA in the
   mobile drawer.
3. **§5.2 step 6's row** — it reads "sign-in / reset / verify screens". Password
   reset and email verification both *send email*, and Resend is step 3. Amend
   the row to say sign-in and sign-up land here, reset and verify land with
   step 3.

## Reference material to read first

| path | what it is |
| --- | --- |
| `AGENTS.md` §6, §7.3, §8.1, §8.4, §11, §12 | the contract — §7.3's Better Auth and Next 16 traps are the load-bearing part |
| `docs/backend.md` | step 1's record: the connection split, `getDb()`, the migration workflow, the scripts |
| `app/_components/chrome.tsx:67,114` | the nav's two "Get started" controls, desktop and mobile |
| `app/_components/home/hero.tsx:46-47` | "Request a demo" and "Explore the platform" |
| `app/_components/primitives.tsx:163-256` | `Button`, **`ButtonLink`** (the Button look on a link, already exists), `LinkButton` |
| `docs/chrome.md` | `SiteNav` is fitted and `SiteFooter` is settled — neither may be restyled |
| `app/design-system/page.tsx:214-228` | where a new primitive is exhibited |
| `node_modules/better-auth/` and `node_modules/@better-auth/drizzle-adapter/` | **after installing** — the installed API, never the remembered one (§12 rule 2) |

**Verified live this session (7 Aug 2026), so the prompt does not guess:**

- `better-auth` **1.6.26**; `@better-auth/drizzle-adapter` **1.6.26**, whose peer
  is `drizzle-orm ^0.45.2` — exactly what step 1 installed.
- The adapter is imported from **`@better-auth/drizzle-adapter`**, not from
  `better-auth/adapters/drizzle`, and takes the drizzle instance:
  `drizzleAdapter(db, { provider: "pg" })`.
- Mount is `app/api/auth/[...all]/route.ts` with
  `export const { GET, POST } = toNextJsHandler(auth)` from `better-auth/next-js`.
- **`nextCookies()` must be the last entry in the `plugins` array.**
- Server-side session read is
  `auth.api.getSession({ headers: await headers() })`.
- The client reset method is **`requestPasswordReset`**, not `forgetPassword` —
  older docs and training data say the latter. Not used by this prompt, but
  recorded so step 3 does not write the dead name.
- `requireEmailVerification` defaults to **false**: users can sign in
  immediately after registering. That default is what makes sign-up shippable
  before Resend exists.

Everything else about the API is to be read out of `node_modules/` at
implementation time.

## What ships

### Dependencies

`better-auth`, `@better-auth/drizzle-adapter`. Nothing else — Better Auth is a
library, not a Marketplace integration, so §7.4's provisioning procedure does
not run and there is nothing to bill.

### `lib/auth/`

- `import "server-only"` at the top of every module (§6.3).
- `betterAuth({ … })` over `drizzleAdapter(getDb(), { provider: "pg" })` —
  **`getDb()`, never a `Proxy`**: §7.3 records that a `Proxy`-wrapped client
  hangs Better Auth's request chain with no error, and this is the step where
  that would finally bite.
- `emailAndPassword: { enabled: true }`. `requireEmailVerification` stays at its
  default `false` **and the prompt says so deliberately** — turning it on before
  step 3 exists would lock every new account out permanently, since nothing can
  send the verification mail.
- `plugins: [nextCookies()]`, last in the array.
- **Rate limiting is configured here, not skipped.** §8.2 requires it on every
  public write path and sign-in is one. Use Better Auth's own limiter with
  **database storage** — the in-memory default resets per instance and is
  useless on Fluid. Read the option's real name out of `node_modules/`; do not
  write it from memory.
- Session resolution helpers the rest of the app calls, so no route re-derives
  it. **The role is read from the database per request, never from the session
  payload or a cookie** (§11.2 rule 5).

### The auth tables

Generated with **`npx auth@latest generate`**, never hand-authored (§9.1).
§7.3's trap applies: `migrate` is Kysely-only, `generate` writes the schema for
us to apply, and it does not touch the database. So the sequence is:

1. `npx auth@latest generate` → Drizzle schema for user / session / account /
   verification.
2. Place it where step 1's config already looks — `lib/db/schema.ts` or a
   sibling the config's `schema` glob picks up. **Do not add columns to these
   tables by hand.**
3. `npm run db:generate` → the `0001_*.sql` migration, committed.
4. `npm run db:migrate` → applied over `DATABASE_URL_UNPOOLED`.

### `app/api/auth/[...all]/route.ts`

`toNextJsHandler(auth)`. This is the **one sanctioned exception** to §6.2's
"Route Handlers are for external callers only" (§7.3) — it is the library's own
mount point, and **no business logic of ours goes in it.**

### The screens — `/sign-in` and `/sign-up`

Design work under the front-matter rules, not scaffolding. Built from the
existing primitives in `app/_components/`, in the site's own voice — measured
and operational, never startup-cheerful.

**A text-field primitive does not exist.** `primitives.tsx` has `Button`,
`ButtonLink`, `LinkButton`, `Meta`, `Placeholder` and the rest, and **no input,
label or field**. Add one to `primitives.tsx` against the `@theme` tokens in
`app/globals.css` — it is a new member of the settled design system, so it gets
exhibited in `/design-system` alongside the buttons, and it is what step 2's
demo form and step 4's newsletter field will reuse. Do not invent a second
styling vocabulary for it, and do not add a component library (§7.5).

Both screens are **server components rendering a client leaf form**, per §8.1's
rule: the leaf takes the settled elements over and adds no box. Each announces
its result, manages focus, and is legible without colour (§8.2 rule 5).

### The landing after sign-in — `/account`

**A decision, stated so it can be overruled at approval.** The dashboard those
CTAs imply is step 12, deep in phase two. Shipping sign-in with nowhere to land
is a dead end, so this prompt adds the smallest honest destination: an
authenticated `/account` showing the signed-in name and email and a sign-out
control, and nothing else. It is not a dashboard, it gets no product data, and
§5.2's "do not overbuild" applies to every temptation to grow it. **Say so at
approval if you would rather the CTAs land somewhere else.**

### `proxy.ts` — not `middleware.ts`

§7.3's first trap, and the one that silently enforces nothing: on Next 16.2 a
`middleware.ts` is a file the framework never loads.

- The matcher **matches `/account` only** — it does not match-all-and-exclude.
  §8.1 is explicit that the difference is whether the nine static marketing
  routes pay for auth per request.
- It uses `getSessionCookie()` for an **optimistic redirect and nothing more**.
  That function performs no validation and the cookie is forgeable; the real
  check is `auth.api.getSession` inside `/account` itself (§7.3, §11.2 rule 1).

### The four CTAs

| file:line | now | becomes |
| --- | --- | --- |
| `chrome.tsx:67` | `<LinkButton href="#">Get started</LinkButton>` | `href="/sign-in"` — an attribute change, nothing else |
| `chrome.tsx:114` | `<Button className="mt-6 h-[52px] w-full">` | the `ButtonLink` equivalent to `/sign-in`, keeping the class string byte-identical, and still closing the mobile panel |
| `hero.tsx:46` | `<Button>Request a demo</Button>` | **unchanged** — it is step 2's, not this prompt's |
| `hero.tsx:47` | `<Button>Explore the platform</Button>` | `<ButtonLink href="/sign-in">`, same classes |

`ButtonLink` already exists and draws from the same `BUTTON_BASE` constant as
`Button`, so the two cannot drift — no new styling is written for any of this.

### `.env.example` and the secrets

Extend the committed file with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`,
names only. Both are **server-only**; neither is `NEXT_PUBLIC_*`.
`BETTER_AUTH_SECRET` is **generated locally**, ≥ 32 characters (§7.3), added to
`.env.local` and to the Vercel project with `vercel env add`. Rotation is
`BETTER_AUTH_SECRETS`, plural — record it, do not configure it.

## Prerender impact

**Not `none`. This prompt changes prerendered markup on every route, and that is
the approval being asked for.** §8.1 permits it only when the prompt says so up
front — this is that statement.

| what changes | where |
| --- | --- |
| the nav's "Get started" href, desktop and mobile | **all 16 prerendered pages** — `chrome.tsx` is on every route |
| the hero's second button becomes an `<a>` | `/` only |
| a new field primitive exhibited | `/design-system` only |
| three new routes | `/sign-in`, `/sign-up`, `/account` |

**The verification is that the diff contains *only* those changes.** Build, then
diff the prerendered HTML against a base worktree at the parent commit per
`docs/automation.md` — including its new section on the stale-worktree traps,
which made exactly this comparison wrong once already. Expected result: the 16
pages differ **only** in the `href`/element swap and the class-string-driven
flight-row segmentation the automation file describes, and `/careers`,
`/about`, the six articles and the three job listings are byte-identical.

**The route table must stay static.** All existing routes keep their ○ / ●
markers; the three new ones must be **○ Static** too. If any marketing route
goes dynamic, a session provider or a `headers()` call has leaked into the
shared tree — §8.1 names that as the usual way auth knocks a whole site off its
prerender. **Stop and fix it rather than accepting the new table.**

**Auth adds no root provider.** Nothing wraps `app/layout.tsx`. Better Auth
reads the session server-side, and that is most of why it survives §8.1 at all.

## Trust boundary

The first request path this project has ever had.

- **Crossing in:** email and password, unauthenticated, from a public marketing
  site, to `POST /api/auth/*` — Better Auth's own handler.
- **Validated by:** Better Auth's own schema validation server-side, plus its
  password rules (default minimum 8, maximum 128 — verify against
  `node_modules/`, do not assume). The client-side form validation is a courtesy
  and is not a check (§6.2).
- **Authorised by:** nothing — sign-in and sign-up are deliberately public.
  `/account` is the first authorised surface, and it authorises **server-side,
  inside the page**, not in `proxy.ts`.
- **A rejected request returns:** the library's typed error, rendered by the
  leaf as a visible, announced state. **Never a silent success** (§8.2 rule 4),
  and never a raw exception string on screen.
- **Rate limited:** yes, by Better Auth's own limiter over database storage.

### The §8.2 gap, named rather than papered over

§8.2 requires **BotID** on every public write path. BotID arrives with step 2,
which is where §10's whole write-path pattern is established, and wiring
`@vercel/botid` into a third-party library's catch-all handler is a different
problem from wiring it into our own Server Action. **This prompt does not add
BotID**, and that is a real, stated gap on `/api/auth/*` between this step and
step 2 — not an oversight, and not something to route around by inventing a
half-measure (§12 rule 9). Rate limiting is in place in the meantime. If that
trade is not acceptable, say so at approval and BotID moves into this prompt.

## Secrets and data

- **Reads:** `DATABASE_URL` (pooled, via step 1's `getDb()`),
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. All server-only.
- **Adds no `NEXT_PUBLIC_*`.** Phase one needs none (§8.4).
- **Stores personal data for the first time in this project's history:** a name,
  an email address, and a password hash, in Better Auth's own tables. Only what
  the flow needs — no speculative fields on top of the generated schema (§8.3
  rule 1).
- **Never log a request body, an email address or a password**, to the console,
  an error report or analytics (§8.3 rule 2). This includes the failure paths on
  the auth screens.
- Never echo a connection string or the auth secret — not in output, not in a
  comment, not in `docs/`.

## Non-goals

- **No password reset, and no email verification.** Both send email; Resend is
  step 3. A reset screen that cannot send is a dead end, and
  `requireEmailVerification` turned on before step 3 locks every new account out
  permanently. Both land with step 3, and §5.2's step 6 row is amended to say so.
- **No dashboard.** `/account` shows a name, an email and a sign-out. Step 12
  owns the product surface, and §5.2 forbids building ahead of it.
- **No organisations, no membership, no tenant scope.** That is step 8. Do not
  install the organization plugin "while we're here".
- **No submissions view.** Step 7, and it needs steps 2/4/5 to have anything to
  show.
- **No demo-request form, no newsletter, no uploads.** Steps 2, 4 and 5.
- **No social or SSO providers.** Email and password only; nothing in §5.2 asks
  for more.
- **No admin UI for granting staff.** The role is set in the database until step
  7 needs otherwise.
- **No restyling of `SiteNav` or `SiteFooter`** — both are settled, and the nav
  CTA change is an `href`, not a design change.
- **No GSAP anywhere in the auth screens** (§7.5).

## Checks to run

Section 2 in full, quoting exact output: `npm run lint`, `npm run typecheck`,
`npm run build`. Then, none of which may be asserted without running it
(§12 rule 3):

1. **The route table from the actual build output**, showing the three new
   routes as ○ Static and every existing route's marker unchanged.
2. **The prerender diff** against a base worktree at the parent commit, per
   `docs/automation.md`, demonstrating that only the CTA changes appear and that
   the untouched routes are byte-identical.
3. **The auth migration applied**, then the generated tables confirmed by
   querying the database and quoting the result. Re-running `db:migrate` is a
   no-op.
4. **A real sign-up, sign-in and sign-out end to end** against the dev server,
   reported honestly — including whether the account row landed. Delete the test
   account afterwards and say that you did.
5. **`/account` while signed out redirects**, and — the check that matters —
   **`/account` with a forged session cookie still refuses**, because
   `getSessionCookie()` validates nothing. If it does not refuse, the
   server-side check is missing and §11.2 rule 1 is broken.
6. **`vercel env ls`** to confirm the two new variables landed, **names only**.
7. **No secret in the diff** — grep the staged change for a connection string
   and for the auth secret before committing.
8. **`npm run build` with `.env.local` moved aside still succeeds** — step 1's
   lazy-init guarantee must survive Better Auth importing the client.

## Recording

Extend **`docs/backend.md`** with a step 6 section: the auth configuration and
every option set, the generated tables and the migration filename, the rate-limit
storage, the `proxy.ts` matcher and why it is an allow-list, the two new
environment variables, the CTA wiring, and the new field primitive. The screens'
design decisions go in `docs/chrome.md` if they touch the nav, otherwise in the
step 6 section.

Make the three `AGENTS.md` amendments listed above **in this same change** —
they are corrections to a now-stale contract, not new build record, and §12
rule 8 forbids leaving them silent. Add no other line to `AGENTS.md`: the cap
rule stands, `docs/backend.md` takes the detail, and step 6 is marked done by
`git log`, never by editing §5.2.

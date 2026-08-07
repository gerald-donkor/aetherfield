# 42 — Demo-request capture, and the write path every later form copies

## SKILLS USED

- **`zod-docs`** — the shared schema is the centre of this prompt. Zod 4 API,
  `safeParse`, and this project's fixed rules for a schema shared between a
  client form and a Server Action, including `treeifyError` / `flattenError`
  for field errors. Zod is **not yet installed**; this prompt installs it.
- **`vercel:vercel-storage`** — the skill that owns Upstash Redis (§7.4 rule 2:
  storage does **not** go through the Marketplace catalog). Read it for the
  provisioning command and the variable names it sets.
- **`upstash-ratelimit-js`** — `@upstash/ratelimit` setup, the algorithm choice,
  and what `limit()` actually returns. Do not write the return shape from
  memory.
- **`upstash-redis-js`** — `@upstash/redis` client construction from the
  provisioned REST variables.
- **`vercel-firewall`** — the skill covering Vercel BotID. Read it for the real
  `@vercel/botid` API on Next 16 (the client-side script component and the
  server-side verification call) before writing a line of it.
- **`vercel:nextjs`** — Server Actions on 16.2: `"use server"`, `useActionState`
  vs. a plain async call, and what keeps a page static when a client leaf is
  added to it.
- **`drizzle-docs`** — the insert in the new query module, and the fact that
  **no migration is needed**: `lead` already exists from step 1.
- **`tailwind-4-docs`** — the dialog is styled against the `@theme` tokens in
  `app/globals.css`. There is no `tailwind.config.js`.
- **`frontend-design:frontend-design`** — the dialog is design work on a
  comp-matched site. Read before laying it out.
- **`vercel:env-vars`** and **`vercel:vercel-cli`** — `vercel env ls` / `pull`
  to verify what actually landed rather than asserting it.

Not needed, deliberately: `vercel:marketplace` (Upstash has a dedicated skill,
§7.4 rule 2), `resend` / `react-email` / `email-best-practices` (step 3 — this
prompt sends nothing), `vercel:auth` and the `better-auth-*` skills (this path
is deliberately unauthenticated), every `gsap-*` skill (§7.5 forbids GSAP in
backend UI, and the dialog carries none).

## Scope, and why it is next

**This is build step 2 of §5.2 — demo-request capture.** Resolved from the
repository and `git log`, not from §5.2 and not from `prompts/`:

- Step 1 is committed (`6f120b2`) — `lib/db/schema.ts` holds `lead`,
  `subscriber` and `application`, and `lib/db/client.ts` exports `getDb()`.
- Step 6 is committed (`4e0afb2`, extended by `bddc456`) — it was pulled ahead
  at the user's direction, and it is the only other backend step that exists.
- Nothing else does: `lib/` contains `db/` and `auth/` only, `app/api` holds
  only Better Auth's catch-all, there is no `actions.ts` anywhere, and
  `package.json` has no `zod`, no `@upstash/*` and no `@vercel/botid`.

Steps 3, 4, 5 and 7 all sit behind this one — 4 and 5 through step 3, and 7
through all of them. Step 2 depends only on step 1. **It is also the step §5.2
calls load-bearing:** it establishes §10's write path in full, and steps 4 and 5
copy it rather than inventing their own. Get it right slowly.

### The user's decision on presentation, taken 7 Aug 2026

The demo form is a **modal dialog opened from the existing button**, and success
swaps the dialog's body in place. Two alternatives were offered and declined: an
inline disclosure under the button (it pushes the hero dashboard and the band's
measured height while open), and a dedicated `/demo` route (it contradicts
§5.2's stated shape for this step and discards the page's scroll and motion
state). Recorded here so a later session does not revisit it.

## Reference material to read first

| path | what it is |
| --- | --- |
| `AGENTS.md` §6.2, §6.3, §7.3, §8.1, §8.2, §8.3, §8.4, §10, §12 | the contract. **§10 is the specification for this prompt** — its stages a–f and its six rules |
| `docs/backend.md` "Step 1 — the data layer and the phase-one schema" (line 12) | the connection split, `getDb()`, and what step 1 deliberately did not do (line 229) |
| `docs/backend.md` "Step 6 — Better Auth" (line 238) | the shape already shipped for a public form — read "UI and CTA wiring" (line 316) |
| `lib/db/schema.ts:38-70` | `leadSource` (`hero` / `nav` / `cta_band`), the `lead` table, its lowercase `CHECK` and its soft-delete column |
| `lib/db/schema.ts:144-145` | `LeadSource`, exported by step 1 with the comment "for the shared Zod schema in step 2" — **use it; do not re-declare the union** (§9.2 rule 2) |
| `lib/db/client.ts:35` | `getDb()` — the only way to a connection, and never a `Proxy` |
| `lib/db/auth-queries.ts` | the query-module shape step 6 established, which the new lead module mirrors |
| `app/_components/auth/sign-up-form.tsx` | **the client-leaf precedent** — the `role="status"` / `aria-live="polite"` / `tabIndex={-1}` announcement block at :117-127, focus moved on message change at :26-28, per-field error state, and a `pending` flag disabling every control |
| `app/_components/primitives.tsx:218` | `Field` — the label / hint / error primitive step 6 added. **The demo form reuses it; no second field vocabulary** (§7.5) |
| `app/_components/primitives.tsx:163` | `Button`, and the `BUTTON_BASE` constant it shares with `ButtonLink` |
| `app/_components/home/hero.tsx:46` | `<Button>Request a demo</Button>` — untouched by step 6, deliberately left for this prompt |
| `app/_components/chrome.tsx:132-156` | `CtaBand`, its `action` and `tone` props, and the `<Button className="mt-[38px]">` at :153 |
| `app/page.tsx:40`, `app/about/page.tsx:46`, `app/journal/page.tsx:30-32`, `app/design-system/page.tsx:341` | the four `CtaBand` call sites. **`/journal`'s passes `action="Sign up to newsletter"` and belongs to step 4** |
| `docs/chrome.md` | `SiteNav` is fitted, `SiteFooter` is settled — neither is touched here |
| `docs/automation.md` | the prerender-diff procedure and its stale-worktree traps |
| `node_modules/` for `zod`, `@upstash/ratelimit`, `@upstash/redis`, `@vercel/botid` | **after installing** — the installed API, never the remembered one (§12 rule 2) |

Nothing about any of these four packages' APIs is asserted in this prompt on
purpose. Read them at implementation time.

## What ships

### Provisioning — ask before running it

`@upstash/redis` and `@upstash/ratelimit` are libraries, but **the Redis
database behind them is a provisioned Marketplace resource and it is billable**
(§7.4 rule 5). The sequence is: read the skill, run
`vercel integration add <name> --help` **first** to learn that provider's real
`--plan` and `-m` values rather than guessing them, **stop and ask the user
before running `add`**, and if the provider hands off to a browser step, stop
and ask them to finish it rather than working around it.

Do not invent the variable names it sets. §8.4 expects
`UPSTASH_REDIS_REST_URL` / `_TOKEN`; **read them back from `vercel env ls`** and
correct §8.4 in the same change if they differ (§12 rules 6 and 8).

### Dependencies

`zod`, `@upstash/redis`, `@upstash/ratelimit`, `@vercel/botid`. Nothing else.

### `lib/validation/lead.ts` — the shared schema

**New directory, and the one module under `lib/` that is deliberately not
server-only:** it is imported by the client leaf *and* by the Server Action,
which is the whole point (§10 rule 1 — validation runs twice, the schema exists
once). It reads no secret, so it carries no `import "server-only"`; every other
new module here does.

- One `z.object` covering name, work email, company, optional message, and the
  source.
- **`source` is validated against `LeadSource` from `lib/db/schema.ts`**, not a
  re-declared union (§9.2 rule 2).
- **The email is lowercased in the schema's transform**, so the database's
  `lead_email_lowercase` CHECK can never be the thing that catches it (§9.2
  rule 4).
- Export the inferred input type; the action and the leaf both use it.

### `lib/rate-limit/index.ts` — new, server-only

§6.3's list of `lib/` modules does not have a slot for this, because §6.3
predates the choice. Add one, `import "server-only"` at the top, and **amend
§6.3's tree in the same change** (§12 rule 8) — a new `lib/` directory that the
architecture section does not list is exactly the drift that section exists to
prevent.

- The Redis client and the limiter, both **constructed lazily** — `next build`
  evaluates top-level module code, and step 1's `getDb()` (`lib/db/client.ts:15`)
  records what happens otherwise.
- Keyed by IP. Read the IP from the request headers available inside a Server
  Action on Next 16; verify how, do not assume `x-forwarded-for` handling.
- The algorithm and window are a **judgement, and must be recorded as one**
  (front matter's measured-or-judged rule) — there is no measurement to make
  here. Pick something defensible for a marketing demo form and say why in
  `docs/backend.md`.
- Returns enough for the action to tell the user **when to retry**, per §10
  stage b.

### `lib/db/lead-queries.ts` — server-only

The insert, and nothing else. **No SQL and no Drizzle call outside `lib/db/`**
(§7.5). Mirrors `lib/db/auth-queries.ts`. **No migration is generated** — `lead`
shipped with step 1's `0000_empty_starjammers.sql`, and if this prompt produces
a migration, something has been changed that should not have been.

### `app/_actions/demo-request.ts` — the Server Action

**A stated deviation from §6.3, to be overruled at approval if you disagree.**
§6.3 colocates actions at `app/<route>/actions.ts`, which assumes one owning
route. This form is on `/`, `/about` and `/design-system` through shared chrome,
so there is no owning route to colocate under. `app/_actions/` follows the
existing `app/_components/` and `app/_content/` convention for shared,
non-routable code. **Amend §6.3 to name it** if it ships.

The body is §10's stages in §10's order — **a, b, then c, and c before any
write** (§10 rule 3):

| stage | what |
| --- | --- |
| a | BotID verification → reject |
| b | rate limit by IP → reject, with retry timing |
| c | `safeParse` with the **same** schema the leaf used → typed field errors |
| d | skipped — this path is public by design (§11) |
| e | write through `lib/db/lead-queries.ts` |
| f | **deliberately absent — step 3 owns it.** See non-goals |

It returns `{ ok: true } | { ok: false, error, fieldErrors? }` and **never
throws to the client, and never returns a bare string** (§10 rule 2). Define
that result type once and export it; step 4 and step 5 import the same shape.

**Never log the request body, the email, the name or the company** — not on the
success path, not in the catch, not in a rate-limit rejection (§8.3 rule 2).

### The dialog — a new client leaf

`app/_components/lead/demo-request-dialog.tsx` (new directory, alongside
`auth/`). One component, used by all three trigger sites.

- **It takes the existing button as `children` and adds no box** (§8.1). The
  hero's `<Button>Request a demo</Button>` and the band's
  `<Button className="mt-[38px]">` keep their class strings byte-identical; the
  leaf attaches the click handler and renders the dialog as a sibling.
- The client-side `safeParse` is **a courtesy to the user, not a check** (§6.2).
- The result is announced, focus is managed, and it is legible without colour
  (§8.2 rule 5) — copy the mechanics from `sign-up-form.tsx:117-127` and
  `:26-28` rather than inventing a second pattern. Additionally, being a dialog:
  focus moves in on open, is trapped while open, and returns to the trigger on
  close. Escape closes it.
- **Success swaps the dialog's body in place. No redirect** (§10 rule 5).
- **An honest failure is a visible state — never a silent success** (§8.2
  rule 4).
- Voice: measured and operational (§5). Not "Awesome, we'll be in touch!"

**Bundle rule (front matter):** the leaf is component-only. Export a constant or
a type from it and it lands in `/`'s bundle. The shared schema and the result
type live in `lib/`, which is why they are separate files above.

### BotID

Its client-side component and its server-side verification are two halves and
**both are required** — verification alone protects nothing. Read
`vercel-firewall` and `node_modules/@vercel/botid` for the real API on Next 16.
Mount the client half so it covers the three trigger surfaces **without wrapping
`app/layout.tsx`** — §8.1 is explicit that nothing may go around the root
layout, and a provider there is the usual way a whole site loses its prerender.
**If the package's own documented mounting requires a root-level component,
stop and report it rather than routing around it** (§12 rule 9); it is a real
conflict with §8.1 and it is the user's call, not this prompt's.

### The three trigger sites

| file:line | now | becomes |
| --- | --- | --- |
| `hero.tsx:46` | `<Button>Request a demo</Button>` | wrapped by the leaf, `source="hero"`, classes unchanged |
| `chrome.tsx:153` | `<Button className="mt-[38px]">{action}</Button>` | wrapped by the leaf when the band is the demo band, `source="cta_band"`, class string byte-identical |
| `design-system/page.tsx:341` | the exhibited `CtaBand` | inherits the above; it is an exhibit, not a fourth surface |

**`/journal`'s band must not become a demo trigger.** It passes
`action="Sign up to newsletter"` (`app/journal/page.tsx:32`) and belongs to
step 4. Give `CtaBand` an **explicit** prop for this rather than inferring it
from the `action` string, and have `/journal` opt out. **`/journal`'s
prerendered HTML must come out byte-identical**, and the diff is what proves it.

Note that §5.2's step 2 row predicts a form leaf on `/journal`. It is wrong —
that band is the newsletter's. **Amend the row** (§12 rule 8).

### `lead_source`'s `nav` value stays unwritten

The nav's "Get started" went to `/sign-in` at step 6, so nothing writes `nav`.
§5.2 already records that the value stays for a possible mobile-drawer demo CTA.
**Do not drop it — that is a migration, and it is not this prompt's.**

### `.env.example`

Extend with the Upstash variable names as `vercel env ls` reports them, names
only. Both server-only; **neither is `NEXT_PUBLIC_*`** — phase one needs none
(§8.4). Check whether BotID requires a variable at all before adding one.

## Prerender impact

**Not `none`.** This prompt changes prerendered markup, and that is part of the
approval being asked for. §5.2 flags this as the only phase-one step that does.

| what changes | where |
| --- | --- |
| the hero's demo button gains a client-leaf wrapper and a dialog sibling | `/` |
| the CtaBand's button, same | `/`, `/about`, `/design-system` |
| the BotID client half | wherever it mounts — enumerate it honestly after building |
| **nothing** | `/journal`, `/careers`, the six articles, the three job listings, `/sign-in`, `/sign-up`, `/account` |

**The route table must stay static.** Every existing route keeps its ○ / ●
marker. A client leaf does not make a page dynamic; a `headers()` call or a
provider leaking into the shared tree does. If any marketing route goes dynamic,
**stop and fix it rather than accepting the new table** (§8.1).

**The verification is that the diff contains only the above** — build, then diff
the prerendered HTML against a base worktree at the parent commit per
`docs/automation.md`, heeding its stale-worktree section. The standing warning
about page-wide `magick compare -metric AE` on `/`, `/journal` and `/careers`
is unchanged: mask the box, report the remainder and the box separately.

## Trust boundary

The first write path this project has ever had that is **ours** — step 6's was
Better Auth's own handler.

- **Crossing in:** name, work email, company, an optional message, and a source
  discriminator — unauthenticated, from a public marketing site, to a Server
  Action.
- **Validated by:** `lib/validation/lead.ts` server-side, inside the action, on
  every request. The client copy of the same schema is a courtesy and is not a
  check (§6.2). **The `source` is validated too** — it arrives from the browser
  and is therefore hostile input like everything else; a request may not write
  an arbitrary enum value.
- **Authorised by:** nothing. This path is deliberately public (§11).
- **A rejected request returns:** the typed result above, rendered by the leaf
  as a visible, announced state. Never a thrown error, never a raw exception
  string on screen.
- **Rate limited:** yes, Upstash, keyed by IP, before parsing.
- **Bot protection:** yes, BotID, before the rate limit. **This step also closes
  the gap prompt 38 named on `/api/auth/*`** only if BotID's mounting happens to
  cover it — it probably does not, and if it does not, say so plainly rather
  than implying the gap closed.

## Secrets and data

- **Reads:** `DATABASE_URL` (pooled, via `getDb()`), the two Upstash REST
  variables, and whatever BotID requires. All server-only.
- **Adds no `NEXT_PUBLIC_*`** (§8.4).
- **Stores personal data:** a name, a work email, a company, and free-text
  message — only what the flow needs, and the `lead` table already defines
  exactly that. **No speculative fields, and no new columns** (§8.3 rule 1).
- **Never log a request body or an email address** (§8.3 rule 2), including on
  every failure path.
- Never echo a connection string or a token — not in output, not in a comment,
  not in `docs/`.
- Retention is finite and stated (§8.3 rule 5): `lead.deletedAt` exists for
  erasure. State the intended retention in `docs/backend.md` even though nothing
  enforces it yet, and say that nothing enforces it yet.

## Non-goals

- **No email, at all.** The confirmation to the requester and the internal
  notification are **step 3**, which provisions Resend. §10 stage f is therefore
  absent from this action, and §10 rule 4 ("a failed email never fails the
  write") has nothing to apply to yet. Do not install `resend`, do not write a
  template, and do not stub a send "to wire up later" (§7.4, §12 rule 9).
- **No newsletter, no uploads, no submissions view.** Steps 4, 5 and 7.
- **No demo CTA in the mobile nav drawer.** `lead_source`'s `nav` stays unused;
  adding a fourth surface is a scope increase, not a freebie.
- **No migration.** `lead` exists. If `npm run db:generate` produces a file,
  investigate rather than committing it.
- **No admin view of the captured leads** — that is step 7, and it needs auth
  that already exists but a view that does not.
- **No restyling of `SiteNav`, `SiteFooter`, `CtaBand`'s geometry, or the hero.**
  The buttons keep their class strings; the leaf adds no box.
- **No new field vocabulary** — `Field` from `primitives.tsx:218` is reused
  as-is. If the dialog needs a textarea the `Field` primitive cannot express,
  extend `Field` and exhibit the extension in `/design-system`; do not fork it.
- **No GSAP** (§7.5). The dialog's open and close are CSS.
- **No client-side data-fetching library** (§6.2).

## Checks to run

Section 2 in full, quoting exact output: `npm run lint`, `npm run typecheck`,
`npm run build`. Then, none of which may be asserted without running it (§12
rule 3):

1. **The route table from the actual build output**, showing every existing
   route's marker unchanged and no route newly dynamic.
2. **The prerender diff** against a base worktree at the parent commit per
   `docs/automation.md`, demonstrating that only the trigger sites changed and
   that `/journal`, `/careers`, the articles and the job listings are
   byte-identical.
3. **A real submission end to end** against the dev server, reported honestly —
   including whether the row landed, queried back and quoted. **Delete the test
   row afterwards and say that you did.**
4. **The rate limit actually rejecting** — submit past the threshold and quote
   what the user sees, including the retry timing.
5. **A rejected invalid submission** — quote the field errors as rendered, and
   confirm the request did **not** write a row.
6. **The action refuses a forged `source`** — a value outside `LeadSource` is
   rejected, not written.
7. **Nothing personal in the logs** — grep the dev server's output from the
   above for the test email address and quote the empty result.
8. **`vercel env ls`** to confirm the Upstash variables landed, **names only**.
9. **No secret in the diff** — grep the staged change for a connection string
   and for a token before committing.
10. **`npm run build` with `.env.local` moved aside still succeeds** — the lazy
    construction in `lib/rate-limit/` must hold the same guarantee step 1's
    `getDb()` does.

## Recording

Extend **`docs/backend.md`** with a step 2 section: the Upstash resource as
provisioned, the limiter's algorithm and window **and that it is a judgement**,
the shared schema and where it lives, the action's stages and its result type,
the query module, the dialog and its accessibility mechanics, the BotID
mounting, the environment variables as provisioned, the retention statement, and
every check's real output.

**Because this step establishes §10's pattern, write that section as the thing
steps 4 and 5 will copy** — name the files and the contract, not just what
happened.

Make these `AGENTS.md` amendments **in the same change** (§12 rule 8), and no
others — the cap rule stands, `docs/backend.md` takes the detail, and step 2 is
marked done by `git log`, never by editing §5.2:

1. **§6.3's tree** — add `lib/validation/`, `lib/rate-limit/` and `app/_actions/`
   if they ship as proposed.
2. **§5.2's step 2 row** — it predicts a form leaf on `/journal`. That band is
   step 4's newsletter. Correct it.
3. **§8.4's table** — only if `vercel env ls` reports names different from the
   two it predicts, or if BotID needs a variable it does not list.

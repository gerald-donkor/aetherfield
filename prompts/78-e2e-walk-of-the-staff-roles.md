# 78 — An E2E walk of `/submissions` and the staff roles

## Scope, and why it is next

**`/submissions` and Aetherfield's own `staff` / `admin` roles have never been
exercised by a browser.** Prompt 74 built the authenticated fixture and named
this gap; prompt 77 walked the factor picker and named it again, unchanged, in
its own record:

> `docs/backend.md:6278` — | an E2E walk of `/submissions` and the staff/admin
> roles | §11.1's roles are orthogonal to tenant membership and want their own
> identity with a granted `user.role`. Named by prompt 74, named again here, and
> still the obvious follow-up |

It is next because it is the last authenticated surface with **no** browser-level
verification, and because of what sits behind that surface: `/submissions` is the
only route in the repository that reads leads, subscribers, applications and
verified accounts, and `/submissions/applications/[id]/cv` is the only route that
mints a signed URL for a CV. That is every category of personal data §8.3 governs,
behind one gate — `requireSubmissionsAccount` — whose second branch (a signed-in
caller **without** a staff role) no test has ever entered.

**The build sequence in §5.2 is exhausted** — steps 1–14 are committed
(`git log`, `246decd` through `f9e102b`), so "next" is read from the open items
recorded in `docs/backend.md` rather than from that listing. This is approved
post-sequence work, as prompts 63–77 were, and it is **not** a step 15.

The two other standing candidates are deliberately not this prompt: prompt 74's
finding 1 (`/reports/[reportId]` answering an absent report at HTTP 200) is a
change to shipped behaviour and wants its own decision, and finding 2 (the
one-off `/activity` 500) has no captured trace to work from.

### The dependency this scope has, and it is a real one

**There is no honest path to the first staff account.** §11.2 rule 3 states that
`staff` and `admin` are admin-granted only, and `changeStaffRole` in
`app/submissions/actions.ts` enforces it: the actor must already hold `admin`,
and `setStaffRole` in `lib/db/auth-queries.ts` will not write `admin` at all —
its `role` parameter is `"staff" | null`. So an `admin` row cannot come from the
application, by design, and bootstrapping one is out-of-band work exactly as
`db:seed:factors` is.

This prompt therefore adds the fixture's **second** kind of direct database
write, alongside prompt 74's single `email_verified` update, and it must be
recorded as plainly as that one was. The write is narrow: it sets `role` on a
user id the fixture itself created through sign-up, and nothing else. **No
authorisation check in the application may be relaxed, parameterised or given a
test-only branch** — the point of the walk is that the real gate turns the wrong
callers away.

Everything else stays honest. In particular, granting and revoking `staff`
through `StaffRoleControl` is the application's own path, and this walk asserts
it rather than reproducing it.

## Reference material read for this prompt

- `AGENTS.md` — §1 workflow, §4 prompt contract, §6.2, §8.1, §8.2, §8.3, §8.4,
  §11.1, §11.2, §12
- `docs/backend.md` — "An authenticated E2E fixture, prompt 74" (line 5810),
  "An E2E walk of the factor picker, prompt 77" (line 6073), "Step 7 —
  authenticated submissions" (line 2680)
- `docs/automation.md` — the prerender comparison procedure and its two traps
- `playwright.config.ts` — the setup / teardown projects and `webServer.env`
- `e2e/support/fixture.ts`, `e2e/support/database.ts`, `e2e/auth.setup.ts`,
  `e2e/auth.teardown.ts`, `e2e/authenticated.spec.ts`, `e2e/factor-picker.spec.ts`
- `app/submissions/page.tsx`, `app/submissions/actions.ts`,
  `app/submissions/action-controls.tsx`,
  `app/submissions/applications/[id]/cv/page.tsx`
- `lib/auth/server.ts` — `getCurrentAccount`, `requireSubmissionsAccount`
- `lib/db/auth-queries.ts` — `getStaffRole`, `listVerifiedAccounts`, `setStaffRole`
- `lib/validation/submissions.ts` — `parseSubmissionView`, `parseSubmissionPage`,
  `submissionIdSchema`, `authUserIdSchema`, `staffMutationSchema`

## What to build

Everything lands under `e2e/`. **No file in `app/` or `lib/` changes.**

### 1. The identities the walk needs

Extend `e2e/auth.setup.ts` to provision, in addition to prompt 74's owner and
orphan:

| identity | how it is obtained | why |
| --- | --- | --- |
| `admin` | sign-up + `markEmailVerified`, then the new direct role write setting `role = 'admin'` | there is no other way to obtain the first admin (above) |
| `staff` | the same, setting `role = 'staff'` | so the staff-versus-admin difference is asserted from two live sessions rather than inferred |
| one grant target per browser project | sign-up + `markEmailVerified`, `role` left null | the grant/revoke assertion is a **mutation**, and `chromium` / `firefox` / `webkit` run in parallel against one database |

**The per-project targets are not optional and the reason is concurrency.**
Prompt 77 already met parallel projects racing on shared state at the commit
step. A single grant target mutated by two projects at once would produce a
flake that reads as an authorisation bug. Provision one target per configured
browser project name, record them in `run.json` keyed by that name, and have
each test resolve its own through `test.info().project.name`. Read the project
list from the config rather than restating it, so adding a project later cannot
silently leave a test without a target.

Both new sessions get their own `storageState` file next to
`owner.json` / `orphan.json`, saved once in setup — Better Auth's sign-in limiter
is the reason prompt 74 signs in once per identity, and two more identities must
not change that arithmetic. Verify the limiter's window and count against
`node_modules/better-auth` before assuming the added sign-ups still fit; if they
do not, the retry helper already in `auth.setup.ts` is the mechanism, not a
weakened limit.

Add the direct role write to `e2e/support/database.ts` as a single narrow
helper beside `markEmailVerified`, documented in the same register: what it
writes, why the application cannot, and that it touches only ids this fixture
created.

### 2. The cases the walk asserts

A new `e2e/submissions.spec.ts`. Every case is a gate or a role difference; none
asserts the **contents** of any row.

**The gate — `requireSubmissionsAccount`:**

1. Signed out, `/submissions` redirects to
   `/sign-in?callbackURL=%2Fsubmissions`, and a query-carrying URL round-trips
   its parameters through `requestedCallback` into that `callbackURL`.
2. The **owner** — a verified, organisation-owning user with no staff role — is
   sent to `/account`, not to `/sign-in`. This is the branch no test has entered
   and the one an ordinary customer meets.
3. The **orphan** is sent to `/account` too, so "no staff role" is what decides
   it rather than "no organisation".
4. The same three outcomes on `/submissions/applications/<absent id>/cv`, which
   calls the same gate before it parses anything.

**The role difference — `staff` versus `admin`:**

5. The staff session renders `/submissions` at 200 with the three views it is
   allowed and **no Staff link in the view nav**.
6. `?view=staff` from the staff session renders the leads view instead, per
   `SubmissionsPage`'s `parsedView === "staff" && account.role !== "admin"`
   fallback. A rejected view falling back is the assertion; the status is not.
7. The staff session renders none of the removal controls, on each of its three
   views.
8. The admin session renders four views including Staff, and the controls are
   present.
9. `?view=<not a view>` and `?page=<not a page>` fall back to the leads view and
   page 1 for both sessions, per `parseSubmissionView` / `parseSubmissionPage`.

**The CV path:**

10. From the staff session, `/submissions/applications/<absent id>/cv` renders
    the not-found markup — past the gate, into the page's own branch. Assert the
    markup, **not** the status: prompt 74's finding 1 recorded that a `loading.tsx`
    above a route commits the status early, and `app/submissions/loading.tsx`
    exists. Whether it applies here is to be **observed and recorded**, not
    predicted in this file.
11. A syntactically invalid id (`submissionIdSchema` is `z.uuid()`) takes the
    same branch, so a malformed id never reaches the storage layer.

**The grant path, through the application:**

12. From the admin session, on `?view=staff`, locate the project's own grant
    target by its run-scoped address, grant `staff`, and assert the row's
    rendered role changes. Then revoke, and assert it changes back. The target
    is left with `role` null, which is how it was provisioned.
13. The admin's own row offers no control on itself — `StaffList` takes
    `actingAdminId` and `setStaffRole`'s `WHERE` carries `ne(user.id, actorId)`.

The grant target is provisioned in the same run and `listVerifiedAccounts`
orders by `created_at desc`, so it is on page 1. **State that dependency at the
test**; if a concurrent real signup ever displaces it the test fails loudly,
which is the right failure.

### 3. What this walk must not do

`/submissions` reads the project's one real database, and the leads,
subscribers and applications it lists are **real people's data**. So:

- **No assertion reads a row's contents.** Headings, view labels, control
  presence, the pagination sentence's shape — never a name, an address, an
  employer or a message body. Nothing is logged (§8.3 rule 2).
- **`removeSubmission` is never invoked**, from any session. It soft-deletes a
  real lead, subscriber or application, and for an application it deletes the CV
  blob. The control's presence is asserted; the control is not operated. The
  only mutation this walk performs is the grant and revoke of case 12, on a row
  the fixture created.

### 4. Teardown that still proves "left as it found it"

`COUNTED_TABLES` already carries `user`, `session` and `account`, so the new
identities are counted by the existing readback. Confirm nothing else is
written: the grant is an `UPDATE` on an existing row, and the row is deleted
with its user. Extend `removeFixture` to cover the new users through the same
recorded-id path — no `LIKE` over an address pattern — and keep the counted
readback as the measurement of success.

## Measurements, and the procedure that produces them

Nothing here is eyeballed. Each is a command's output, quoted in the record:

- **`npm run test:e2e:local`, twice.** Report the test count and wall-clock for
  both runs. Prompt 77's baseline is **54 passed** across Chromium and Firefox;
  the delta must equal the new cases × 2, and if it does not, the difference is
  explained rather than rounded.
- **The row-count readback**, on both runs. The teardown asserts each relation
  back to its before-count, so its pass *is* the measurement. Report the
  thirteen relations and the `rate_limit` delta, which is reported and not
  restored, as prompt 74 established.
- **Any wait budget the walk needs** is a named constant with its reason at the
  constant, as `COMMIT_WAIT` is. **No timing is asserted as a threshold** — the
  database is scale-to-zero (§7.3) and a threshold on a cold first query is a
  flake generator.
- **The observed status of case 10** — recorded as measured, alongside whether
  `app/submissions/loading.tsx` produces prompt 74's finding-1 effect on this
  route. If it does, that is a **second instance of a known finding**, recorded
  and not fixed here.
- Warm versus cold is stated for each run (§7.3).

## Prerender impact

**`none — no route changes`, and it is to be verified, not assumed** (§8.1).
Nothing outside `e2e/` is edited, so the expected result is exact:

- the route table unchanged — the marketing routes still `○`, the six articles
  and three job listings still `●`, `/submissions` and its CV route still `ƒ`;
- **0 of 21 prerendered HTML files differ** after normalising the build id, both
  chunk-name patterns and the flight payloads;
- **CSS 68,506 → 68,506 bytes, 0 rules added or removed** against prompt 77's
  baseline.

**Run the comparison after this file and the `docs/` section are written**, not
only after the code is. Tailwind v4 scans `prompts/` and `docs/`, and a rare word
in prose has shipped dead CSS on every page twice already — once from prompt 74's
own prompt file. If a delta appears, reword the source rather than restating the
offending token while explaining it, which is the extension `docs/automation.md`
records.

## Trust boundary

**No new request path, and no existing one changed.** No Server Action, Route
Handler, form or schema is added or altered.

What crosses from the browser in this walk is what already crossed: `view` and
`page` as an authenticated GET, both already parsed server-side by
`lib/validation/submissions.ts` with a total fallback rather than an error; an
application id in a path segment, parsed by `submissionIdSchema` after the gate
has already run; and `changeStaffRole`'s `{ userId, role }`, validated by
`staffMutationSchema` and authorised inside the action against a freshly read
`user.role` — never from the session payload (§11.2 rule 5).

**The fixture gains one new privilege and it is stated plainly**: a direct write
setting `role` on its own users, because §11.2 rule 3 makes the first admin
unobtainable through the application. No `NODE_ENV` or `E2E` conditional may
appear in `lib/auth/`, in `proxy.ts`, in `app/submissions/` or on any page;
neither `disableCSRFCheck` nor `disableOriginCheck` may appear. **Verify all of
that by inspection and quote the result** — the walk exists to prove the gate
works, and a gate loosened to make its own test pass proves nothing.

A rejected request returns what it already returns: a redirect to
`/sign-in?callbackURL=…` for the signed-out caller, a redirect to `/account` for
the signed-in caller without a staff role, the not-found branch for an absent or
malformed id, and `FORBIDDEN` from the action for a non-admin actor.

## Secrets and data

**No new environment variable, and no change to `.env.example`.** The fixture
reads `DATABASE_URL_UNPOOLED` for its own pool, as it already does;
`BETTER_AUTH_URL` and `RESEND_API_KEY` stay overridden for the test run only, as
`playwright.config.ts` already sets them. No `NEXT_PUBLIC_*`. No secret is
echoed — key names only (§8.4).

**Personal data is the sensitive part of this prompt, and the rules are the
ones already in §3 above.** The identities are prompt 74's run-scoped
`example.com` addresses, which cannot reach a person (RFC 2606). The run's mail
stays suppressed. Nothing is logged — not an address, not a cookie, not a row.
No real submission is read into an assertion, no CV is downloaded, and no
removal control is operated. The new rows are written to the project's one real
Neon database, as prompt 74's already are, and the counted readback is what
keeps that acceptable. No model is called (§5.3 — phase-one surfaces use none,
and this is a test).

## Non-goals

| not done | why |
| --- | --- |
| fixing prompt 74's finding 1, the report not-found status | a change to shipped behaviour with its own decision. If case 10 shows the same effect on `/submissions`, that is recorded as a second instance, not fixed here |
| chasing prompt 74's finding 2, the one-off `/activity` 500 | still not reproducible and still no captured trace; inventing a cause would be worse than the record |
| invoking a Server Action over raw HTTP to assert its server-side rejection | the action id is a build-scoped hash and an assertion on it would break on every build. The action's authorisation is read from `getAdminAccount` in the source and asserted through the UI difference instead — and the gap is named here rather than dressed up |
| operating any removal control, or downloading a real CV | real people's data, §8.3. Presence is asserted; the control is not operated |
| a tenant-side assertion, or any claim that staff can read tenant data | §11.1's roles are orthogonal to membership and `lib/auth/tenant.ts` already says staff grants nothing there. Asserting the negative belongs with the tenant walk, not here |
| WebKit | `scripts/playwright-webkit.sh` still exits with `Podman is required for WebKit on Arch Linux.` An environment gap, reported as one, not a pass (§12 rule 3) |
| a CI workflow | nothing in this repository runs CI today |
| any change to `app/`, `lib/`, a marketing route, `SiteNav`, `SiteFooter` or any GSAP surface | §8.1 and the front matter's settled surfaces |
| a step 15 | §5.2 remains the ordered plan; this is approved post-sequence work |

## Checks to run, and where the result is recorded

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **215 passed, 10 files**, unmoved — `lib/domain/` is untouched |
| `npm run build` | exit 0, route table above |
| prerender comparison | 0 of 21 differ; CSS delta 0 |
| `npm run test:e2e:local` | twice; count and wall-clock quoted for both |
| row-count readback | zero delta on all thirteen counted relations, both runs |
| `npm run test:e2e:webkit` | expected to report the Podman gap; quote it |
| `npm run db:generate` | **not run** — the schema is untouched, and saying so is part of the record |

Quote every command's real output; never claim a pass without running it (§2,
§12 rule 3).

**Record the result in `docs/backend.md`**, as a new section
`## An E2E walk of /submissions and the staff roles, prompt 78`, following the
shape of prompt 77's section: what was asserted and which branch each case
enters, the direct role write and its justification, any findings, the prerender
/ trust / secrets headings, the checks table, and a closing "what prompt 78
deliberately did not do" table. **No new row in `AGENTS.md`** — `docs/backend.md`
is already in the index, and nothing here is a site-wide invariant.

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `better-auth-best-practices` | session resolution, `storageState` reuse and what a fifth and sixth identity does to the setup project's request budget |
| `better-auth-security-best-practices` | the `/sign-in*` and `/sign-up*` rate-limit rules before adding sign-ups, and the standing refusal to weaken CSRF or origin checking for a test |
| `email-and-password-best-practices` | the verification flow the fixture must not route around any further than the one existing write |
| `organization-best-practices` | the membership vocabulary the owner identity holds, so the staff roles are asserted as orthogonal to it rather than tangled with it |
| `nextjs` | App Router behaviour the walk asserts against — awaited `searchParams`, `redirect` / `notFound` inside a Server Component, and what a `loading.tsx` boundary does to a response status |
| `zod-docs` | `submissionIdSchema`, `authUserIdSchema` and the total-fallback parsers, so the invalid-input cases assert what the schemas actually do |
| `drizzle-docs` | reading `lib/db/auth-queries.ts` and `auth-schema.ts` for the `role` column and `setStaffRole`'s `WHERE`, so the direct write matches the column the application reads |
| `neon-postgres` | pooled versus direct connections for the fixture's pool, and scale-to-zero as the reason no timing is asserted |
| `tailwind-4-docs` | the v4 scanner's behaviour over `prompts/` and `docs/`, which is what makes the CSS comparison a real check |
| `vercel:vercel-storage` | Blob's signed-read behaviour on the CV route, read before concluding the absent-id case reaches no store |

**No skill covers Playwright**, and none is installed for it (`docs/skills.md`
records what was installed and what was excluded). Its API is verified from
`node_modules/@playwright/test` and from the four existing E2E files — never
from memory (§12 rule 2). The three browser-control skills (`agent-browser`,
`browser-use`, `claude-in-chrome`) are not the harness here: this walk belongs
in the committed suite rather than in a session.

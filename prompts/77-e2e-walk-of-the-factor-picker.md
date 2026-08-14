# 77 — An E2E walk of the factor picker, and the import that makes it reachable

## Scope, and why it is next

**Prompt 76 shipped `/activity/mappings`'s wording search with no browser-level
verification at all.** Its own record in `docs/backend.md` ("Provider-free fuzzy
factor matching, prompt 76") says so in the checks listing:

> `npm run test:e2e:local` | no test result: sandbox port binding failed, then
> the escalation reviewer timed out twice before startup
> …
> The browser gaps are environment limitations, not passes. … interactive focus
> behavior and the four authenticated browser cases remain to be checked when a
> browser-control binary or the Playwright local-server approval is available.

That is the newest and largest verification gap in the repository, it sits on
the surface that decides which factor multiplies a disclosure figure, and the
harness that closes it already exists and already passes: prompt 74's fixture
ran **48 tests, Chromium and Firefox, three full runs** with a zero row-count
delta each time.

**The build sequence in AGENTS.md §5.2 is exhausted** — steps 1–14 are all
committed (`git log`: `6f120b2` through `f9e102b`), so "next" is no longer read
from that listing. Among the open items named in `docs/backend.md`, this one is
chosen because it verifies work already shipped rather than adding new surface.

### The dependency this scope has, and it is not optional

`/activity/mappings` renders the picker **only when the organisation has
committed activity records.** `app/activity/mappings/page.tsx:253` answers
`coverage.length === 0` with the "No committed activity records yet." section
and renders neither the coverage column nor the "Choose a factor" section, and
`lib/db/emission-queries.ts:1396`'s `listFactorCoverage` derives every pair from
`activity_record`. Supplying `?category=…&unit=…` does **not** route around it:
`selected` is only consulted inside the non-empty branch.

Prompt 74's fixture deliberately seeds no activity data ("the walk is of the
**gates**, not of the workspaces' contents"). So this prompt's enabling work is
one committed import for the owner's organisation — and it is obtained
**through the application's own UI**, not written into the database, which is
the same discipline prompt 74 applied to sign-up and organisation creation.

## Reference material read for this prompt

- `AGENTS.md` — §1 workflow, §4 prompt contract, §6.2, §8.1, §8.2, §8.3, §10, §12
- `docs/backend.md` — "Provider-free fuzzy factor matching, prompt 76" (line 6547),
  "An authenticated E2E fixture, prompt 74" (line 5810), "Step 9 — activity-data
  ingestion" (line 6073), "Factor-mapping surface, prompt 65" (line 3639)
- `docs/automation.md` — the prerender comparison procedure and its two traps
  (the CSS chunk location; excluding `.claude/` and `.agents/` from both sides)
- `playwright.config.ts` — the setup/teardown projects, `webServer.env`
- `e2e/support/fixture.ts`, `e2e/support/database.ts`, `e2e/auth.setup.ts`,
  `e2e/auth.teardown.ts`, `e2e/authenticated.spec.ts`
- `app/activity/mappings/page.tsx`, `app/_components/activity/factor-picker.tsx`
- `app/_components/activity/upload-form.tsx`, `app/_components/activity/import-controls.tsx`
- `app/activity/actions.ts` — `stageImport`, `commitImport`, `setFactorMapping`
- `lib/validation/activity.ts` — `factorSearchSchema`, `ACTIVITY_CATEGORIES`,
  `ACTIVITY_UNITS`, `ACTIVITY_FIELDS`, `REQUIRED_ACTIVITY_FIELDS`
- `lib/domain/activity-import.ts` — the header alias set
- `lib/db/emission-queries.ts` — `listFactorCoverage`, `searchFactorsForPair`,
  `searchFactorsByWording`

## What to build

### 1. A committed import, obtained honestly

In a new spec file, `e2e/factor-picker.spec.ts`, using
`test.use({ storageState: OWNER_STATE_PATH })` exactly as
`e2e/authenticated.spec.ts` does. The chain runs once, in a
`test.describe.serial` so the search assertions cannot start before the import
that makes them reachable:

1. go to `/activity`, set the file input `#activity-import-file` with
   `setInputFiles` from an in-memory buffer, and submit "Stage import";
2. on the staged import's page, confirm the proposed header mapping is what the
   alias set produces, then use the commit control ("Commit N …");
3. assert the committed state is reported on the page.

**The CSV is written by the test, not committed as an asset**, so its content
sits beside the assertions that depend on it. Two rows, both in one
`(category, unit)` pair, headers named canonically
(`site,date,category,description,quantity,unit`) so the alias resolution has
nothing to guess at:

```
site,date,category,description,quantity,unit
E2E Fixture Site,2026-03-31,fuel,Diesel for the fixture generator,100,L
E2E Fixture Site,2026-04-30,fuel,Diesel for the fixture generator,120,L
```

`fuel` + `L` is chosen because DEFRA publishes many `litres` rows, which is what
gives the wording search something to rank. The date sits inside the seeded
2026 set's activity window (prompt 68's date-effective selection).

### 2. The four cases prompt 76 left unchecked

On `/activity/mappings` with the pair selected:

| case | assertion |
| --- | --- |
| exact-text search | submit `diesel` with "Search exact text"; results appear under the `Eligible emission factors` list, and at least one row is labelled `Exact text match` |
| wording search | submit `diesal` (misspelled) with "Find close wording"; at least one row carries `Close wording` or `Weak wording match`, and the caveat line about character groups is present |
| the invalid path | submit an empty query with "Find close wording"; the message `Enter a description before finding close wording.` is announced through the `alert` role, **and the browser's active element is that message** — `factor-picker.tsx`'s `searchStatusRef` focus effect is exactly what has never been exercised |
| search never mutates | after all three, the pair's mapping is unchanged — the coverage column still reports it as it did before the searches |

Every locator is by accessible role or by visible text, never by a utility
class name — the class names are settled design output and a test must not pin
them.

**Timings are not asserted.** Prompt 76 measured 299–723 ms warm against a
scale-to-zero database (§7.3); a threshold on that is a flake generator, and it
would be a judgement dressed as a measurement (§12 rule 4).

**No band threshold is asserted as a number.** `0.10` is a recorded product
judgement, not a fitted accuracy claim. The assertion is that a band label is
rendered, never that a particular query lands in a particular band.

### 3. Teardown that still proves "left as it found it"

`e2e/support/fixture.ts`'s `COUNTED_TABLES` gains the relations this walk now
creates, and `e2e/support/database.ts` gains the matching deletes in dependency
order, scoped to the run's organisation ids:

`activity_emission`, `activity_factor_mapping`, `activity_record`,
`activity_import`

The existing contract is unchanged and is what proves the addition: the setup
project counts every relation before writing anything, the teardown counts them
again, and each delta must be zero. **A leftover row fails the run.**

If the commit path writes to any relation not in that list, add it rather than
narrowing the count — verify by reading `commitImport` and `recalculate` in
`app/activity/actions.ts`, not by assuming.

## Measurements, and the procedure that produces them

Nothing here is a comp measurement. The numbers this prompt must produce, each
by running the thing rather than by estimating it:

1. **The test count and wall-clock of `npm run test:e2e:local`**, before and
   after — prompt 74's baseline is 48 passed in ~1.5 min warm.
2. **The row-count delta on every counted relation**, read back by the teardown
   project. Must be zero on every relation, on every run. Run the whole matrix
   at least twice; a fixture that passes once proves less than one that repeats.
3. **The prerender comparison**, per `docs/automation.md`: the route listing on
   both sides, the count of prerendered HTML files that differ after
   normalising the build id, both chunk-name patterns and the RSC flight
   scripts, and the CSS byte count on both sides with the rule-level difference.
   Expected: 0 of 21, and a CSS delta of 0 against prompt 76's 68,506 bytes.
4. **Whether the run was warm or cold** stated alongside any timing (§7.3).

**Re-run the CSS comparison after this prompt file and the documentation are
written, not only after the code is.** Tailwind v4 scans `prompts/` and `docs/`,
so a rare word in prose that collides with a utility name ships dead CSS on
every page — it has fired twice, once from prompt 74's own file. A word already
present elsewhere in the repository is already in the baseline and cannot move
it; a word new to the repository can.

## Prerender impact

**`none — no route changes` — and it must be verified, not assumed.**

Nothing under `app/` or `lib/` changes. The change is confined to `e2e/` and, if
the counted relations need it, `e2e/support/`. `playwright.config.ts` needs no
new project — the existing browser projects pick a new spec file up through
`testDir` and their `dependencies: ["setup"]`.

If any file under `app/` or `lib/` turns out to need a change to make this walk
possible, **stop and report it** rather than making it — a test-shaped change to
shipped behaviour is a different prompt, and §8.1 is the reason.

## Trust boundary

**No new request path, and no existing one changes.** No Server Action, no Route
Handler, no schema, no form.

**No authorisation check may be relaxed, parameterised, or given a test-only
branch.** No `NODE_ENV` or `E2E` conditional in `lib/auth/`, in `proxy.ts`, or on
any page; no `disableCSRFCheck`, no `disableOriginCheck`. The fixture is an
ordinary signed-in client of surfaces a real owner reaches, and it must be able
to do nothing a real owner could not.

What crosses from the browser in this walk: a CSV file part and the staged
import's mapping to `stageImport` / `updateImportMapping`; an import id to
`commitImport`; and `category`, `unit`, `q`, `mode` as an authenticated GET on
`/activity/mappings`. Each is already validated server-side by the shared Zod
schemas, and each already resolves its organisation from the session rather than
from the request. **The one write the fixture may not obtain honestly stays the
single `email_verified` update prompt 74 recorded; this prompt adds no second
one.**

Two limiters are on this path and both stay untouched: Better Auth's three
requests per ten seconds on `/sign-in*` and `/sign-up*` (which is why the
fixture signs in once per run and the browser projects reuse `storageState`),
and `checkActivityCommitLimit`, keyed by user id, on the commit. One import per
run per identity sits well inside it; if a repeated local run trips it, report
the observed limit rather than raising it.

## Secrets and data

- **No new environment variable**, and no change to `.env.example`. The fixture
  reads `DATABASE_URL_UNPOOLED`, already present; `BETTER_AUTH_URL` and
  `RESEND_API_KEY` stay overridden for the test run only, in
  `playwright.config.ts`.
- **No `NEXT_PUBLIC_*`.** Adding one would be a decision to make a value public.
- **No secret is echoed** — key names only, in the code and in the write-up.
- **No real personal data.** The CSV's site name, description and quantities are
  synthetic, and the identities stay prompt 74's run-scoped `example.com`
  addresses (RFC 2606). `e2e/.auth/` remains gitignored; it holds live session
  cookies and is a credential.
- **Nothing is logged** — not an address, not a cookie, not a search term, not a
  figure (§8.3 rule 2).
- **No model is called.** There is none in this repository.
- Worth stating plainly in the write-up: these rows are written to the project's
  one real Neon database, as prompt 74's already are. The teardown's counted
  readback is what keeps that acceptable.

## Non-goals

| not doing | why |
| --- | --- |
| an E2E walk of `/submissions` and the staff/admin roles | §11.1's roles are orthogonal to tenant membership and want their own identity with a granted `user.role`. Named by prompt 74 and still the obvious follow-up |
| fixing prompt 74's finding 1, `/reports/[reportId]` answering an absent report at 200 | a change to shipped behaviour, with its own decision. This walk touches neither route |
| chasing prompt 74's finding 2, the one-off `/activity` 500 | not reproducible in three attempts and no trace was captured |
| asserting a similarity score, a band threshold, or a query latency | judgements and warm-database timings; see above |
| exercising the customer-supplied factor path, superseding, or retirement | prompts 66, 67 and 71's surfaces. This walk is prompt 76's gap, and widening it buries the result |
| the deletion lock, the restore control, or the purge sweep | prompt 73's purge deletes blobs when it runs; a real want and a separate decision |
| a CI workflow | nothing in this repository runs CI today |
| any change to `app/`, `lib/`, a marketing route, `SiteNav`, `SiteFooter`, or any GSAP surface | §8.1 and the settled surfaces in the front matter |
| a new `package.json` script | the three existing E2E scripts already pick up a new spec file |

## Checks to run, and where the result is recorded

| check | note |
| --- | --- |
| `npm run lint` | quote the output |
| `npm run typecheck` | quote the output |
| `npm test` | `lib/domain/` is untouched; the count must not move from prompt 76's 215 in 10 files |
| `npm run build` | route listing quoted from the run, not recalled |
| prerender comparison | per `docs/automation.md`, both sides excluding `.claude/` and `.agents/` |
| `npm run test:e2e:local` | **the point of the prompt.** Chromium and Firefox; run it at least twice and quote both |
| `npm run test:e2e:webkit` | run it. It has reported "Podman is required for WebKit on Arch Linux" on every prompt since 71 — if that is still true, say so as an environment gap, never as a pass (§12 rule 3) |
| `npm run db:generate` | **not run.** The schema is untouched, and saying so is part of the record |

**Record the result in `docs/backend.md`**, as a new section titled
"An E2E walk of the factor picker, prompt 77", placed beside prompt 74's
section. It must carry: what is now exercised and which branch each assertion
enters; the counted-relation additions and the measured deltas; the two
verification gaps prompt 76 left and which of them this closes; anything the
walk found and is reporting rather than fixing; the prerender comparison; and
what this prompt deliberately did not do. **Nothing goes in `AGENTS.md`** — the
cap rule in its front matter, and there is no new site-wide invariant here.

Then commit to `main`, unprompted, and do not push.

## SKILLS USED

| skill | what it is for |
| --- | --- |
| `nextjs` | App Router behaviour this walk asserts against — awaited `searchParams`, Server Component reads, Server Actions invoked from a client leaf, and why a GET-submitted form re-renders the page rather than mutating |
| `better-auth-best-practices` | how `storageState` reuse, session resolution and the organisation plugin's membership actually behave, before asserting on them |
| `better-auth-security-best-practices` | the rate-limit rules on `/sign-in*` and `/sign-up*`, and the standing refusal to weaken CSRF or origin checking for a test |
| `organization-best-practices` | the membership and role vocabulary the fixture's owner identity holds |
| `zod-docs` | `factorSearchSchema`'s `superRefine` message and `.catch("lexical")` behaviour, which the invalid-path assertion depends on |
| `neon-postgres` | pooled versus direct connections for the fixture's readback, and scale-to-zero as the reason no timing is asserted |
| `drizzle-docs` | reading `lib/db/schema.ts` for the relations the commit path writes, so the counted list is complete rather than guessed |
| `upstash-ratelimit-js` | `checkActivityCommitLimit`'s key and window, before concluding one import per run is inside it |
| `tailwind-4-docs` | the v4 scanner's behaviour over `prompts/` and `docs/`, which is what makes the CSS comparison a real check |
| `vercel:vercel-storage` | only if the import path turns out to touch Blob; read before assuming it does not |

**No skill covers Playwright**, and none is installed for it (`docs/skills.md`
records what was installed and what was excluded). Its API is therefore verified
from `node_modules/@playwright/test` and from the existing three E2E files —
never from memory (§12 rule 2). The three browser-control skills
(`agent-browser`, `browser-use`, `claude-in-chrome`) are **not** the harness
here and are not used: prompt 76 found the first two lacked their binaries, and
this walk belongs in the committed suite rather than in a session.

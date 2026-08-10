# 59 — Targets and forecasting

## Scope, and why it is next

**Build step 11 of AGENTS.md §5.2** — "Targets and forecasting: goal tracking,
the '16% off your 2027 goal' reading". It depends on step 10, and step 10 is
committed (`60def3c`, "Build step 10: emission factors and the calculation
engine"). Steps 1–10 are all in the repository; step 11 is the lowest unbuilt
row, and steps 12, 13 and 14 all list step 11 in their dependency column, so it
unblocks the whole rest of phase two.

Resolved from the repository and `git log`, not from `prompts/` and not from
§5.2 (§12 rule 5).

### The four forks, settled with the user before this file was written

| question | answer |
| --- | --- |
| where the visible outcome lives | **a new authenticated `/targets` route**, beside `/activity` and `/submissions`. Not a third section on `/activity`, and not a dashboard — step 12 owns those |
| target types | **absolute only** — base year, baseline figure, target year, percentage reduction. Intensity targets need a denominator series the schema does not carry and would be their own step |
| the baseline | **stated by the reporter, with the computed figure for that year offered as a suggestion.** Stored on the target row, so a later recalculation or a newly committed import cannot silently move a filed baseline |
| the forecast | **trajectory and run-rate projection, both shown.** The trajectory is the plan; the projection is where the observed rate lands in the target year; the reading is the gap between them |

## Reference material read for this prompt

Everything below was opened this session. Nothing here is recalled (§12 rule 1).

| path | what was taken from it |
| --- | --- |
| `AGENTS.md` | §5.2 step 11 and its dependency, §5.3 (AI is **not** sanctioned at this step), §6.2, §6.3, §8.1, §8.4, §9.2, §10, §11, §12 |
| `docs/backend.md` lines 3678–4204 | the whole of step 10 — the engine, its four refusals, the coverage measurement, the prerender-diff procedure, and its "what step 10 deliberately did not do" row that names targets as step 11 |
| `lib/domain/decimal.ts` | `Decimal`, `RoundingMode`, `rescale`, `multiply`, `multiplyByInteger`, `sum`, `toFixed`, `fromUnits`, `parseDecimal`. **Lines 190–196 are the finding this prompt is built around** — see below |
| `lib/domain/emissions.ts` | `ENGINE_VERSION`, `ScopeTotals`, `RecordEmission`, `totalsOf`, `totalsByPeriod`, `monthOf`, `toTonnes`, `toStoredKgCo2e` |
| `lib/db/emission-queries.ts` | `PersistedEmission`, `listEmissions(organizationId, importId)`, `countUncalculatedRecords`, `listFactorSets`, and `visibleFactorScope`'s tenant predicate |
| `lib/db/schema.ts` | `site` (the tenant-scoped table shape to copy), `activityRecord`, `activityEmission` and its derived `numeric(50, 24)` docblock, the enum-from-validation-constant idiom |
| `app/activity/actions.ts` | the stage order every action in this repository follows, `resolveTenant()`, `consumeCommitLimit()`, and the docblock explaining why stage a is absent on an authenticated path |
| `app/activity/page.tsx` | the read idiom — `Detail`, the bordered list, `Intl.DateTimeFormat` on UTC, the empty state, the paging nav |
| `app/_components/activity/emissions-summary.tsx` | the three presentation rules, `parseStored`, `Figure`, the attribution block |
| `lib/rate-limit/index.ts` | `RateLimitOutcome`, `checkActivityCommitLimit`, `formatRetry` — the shape a new limiter copies |
| `lib/validation/activity.ts`, `lib/validation/organization.ts`, `lib/validation/result.ts` | the validation-module idiom: vocabularies as `as const` arrays, labels, `SubmitResult<TField>`, field-error records |
| `lib/auth/organization.ts` | `requireOrganization`, `getCurrentMembership`, `authorizeOrganization`, `CurrentMembership` |
| `proxy.ts` line 22 | `matcher: ["/account", "/activity/:path*", "/submissions/:path*"]` — an explicit list, which is what keeps §8.1's "skip the marketing routes" true |
| `app/_components/home/dashboard.tsx` line 85 | the marketing card's reading, "You're 16% off your 2027 emissions goal". **Intent, not a comp** (§5) |
| `docs/automation.md` | the prerender-diff procedure, the CSS-chunk trap, the `.claude/` archive trap, the stale `tsbuildinfo` trap |

## The finding that shapes this step: there is no division

`lib/domain/decimal.ts` lines 190–193 say it outright:

> Exact, for the integer unit ratios in `lib/domain/emissions.ts` (`MWh` to
> `kWh` is ×1000). Deliberately not a general division: **there is no `divide`
> in this module.** Division is where an inexact result would have to be rounded
> silently, and nothing in the calculation path needs one.

Step 11 needs three quotients that are **not** powers of ten:

1. **The trajectory** — a linear allowance from baseline to target divides the
   gap by the year span, an arbitrary integer.
2. **The reading** — "16% off" is `(projection − target) / target × 100`.
3. Anything expressing a figure as a share of another figure.

Two of the three are only presentational, but the trajectory's per-year
allowance is a figure a reporter may quote. So:

**Add `divide(a, b, scale, mode)` to `lib/domain/decimal.ts`**, and make the
inexactness explicit rather than silent:

- Long division on `BigInt` at a **caller-declared scale**, with a
  **caller-declared `RoundingMode`** — no default for either. It reuses the
  existing half-up / half-even / down semantics `rescale` already implements;
  the rounding decision must be made in one place, not reimplemented.
- **Division by zero returns a typed refusal**, never `Infinity`, never `NaN`,
  never a thrown string. Shape it like `DecimalParseResult`.
- **No `Number` on the value path**, unchanged.
- **The docblock at lines 190–196 is now wrong and must be corrected in the same
  change** (§12 rule 8). It should say what is still true: the *calculation*
  path — `lib/domain/emissions.ts` — uses no division, every unit ratio there is
  an exact power of ten, and `divide` exists for the derived target figures
  only, each of which names its scale and its mode at the call site.
- `lib/domain/emissions.ts` **must not gain a `divide` call.** A disclosure
  figure stays exact and unrounded until presentation; that is step 10's whole
  shape and this step does not soften it.

## What to build

### 1. Schema — `lib/db/schema.ts`, migration `0006_*`

One new table, **strictly tenant-scoped**. §9.2 rule 6's reference-data
exception is for published third-party datasets and **does not apply here**: a
target is a customer's own commitment, so `organization_id` is `not null` and
every query filters on it.

- `emission_target` — id, `organizationId` (not null, cascade), `name`,
  `coverage`, `baseYear`, `targetYear`, `reductionPercent`, `baselineKgCo2e`,
  `baselineSource`, `computedBaselineKgCo2e` (nullable), `createdBy`,
  `createdAt`, `retiredAt`, `deletedAt`.
- Three enums, each **defined once in `lib/validation/targets.ts`** and spread
  into `pgEnum` exactly as step 10's eight are (§9.2 rule 2):
  `target_coverage` (`scope_1`, `scope_2`, `scope_3`, `scope_1_2`,
  `scope_1_2_3`), `target_status` (`active`, `retired`), `target_baseline_source`
  (`stated`, `computed_at_creation`).
- **Status is not a stored derivation.** Whether a target has been *met* is
  computed from the data every time; only `active` / `retired` — a human
  decision — is stored, with `retiredAt` as its transition timestamp (§9.2
  rule 3). Do not add an `achieved` value.
- **Soft delete** (`deletedAt`), and every read excludes it (§9.2 rule 5).
- **Both numeric precisions must be derived and the derivation written into the
  column's docblock**, in the style of `activityEmission.kgCo2e`'s. Do not copy
  `numeric(50, 24)` — that scale is what the *product* of a quantity, a factor
  and a GWP can produce, and a human-entered baseline is a different quantity.
  Derive from the input bound the Zod schema enforces (below) and state it.
- Indexes: at least `(organization_id, target_year)`. State whether a uniqueness
  constraint is wanted; if none, say why in the docblock.
- Migration via `npm run db:generate` only. **No hand-written `ALTER`** (§7.2).
  The migration must contain **no `ALTER` on any existing table** — if it does,
  something was changed that this prompt did not ask for.

### 2. Validation — `lib/validation/targets.ts`

Not `server-only`, and **imports nothing from `lib/db/`** (§6.3). Holds the
three vocabularies and their labels, `createTargetSchema`, `targetIdSchema`, the
field-error record, `TARGET_ERRORS`, and the result types over
`SubmitResult<TField>`.

Bounds the schema must enforce, all server-side and all with a message in the
site's register:

- `baseYear` and `targetYear` — integers, plausible range, and **`targetYear` must
  be strictly greater than `baseYear`**. A zero span is the divide-by-zero case
  and it is rejected at the boundary rather than refused in the engine.
- `reductionPercent` — greater than 0 and at most 100, at most 3 decimal places.
- `baseline` — entered in **tCO2e**, positive, with a stated maximum number of
  decimal places. That bound is what the column's scale is derived from.
- `name` — trimmed, non-empty, bounded length.

### 3. Domain — `lib/domain/targets.ts`, pure

No database handle, no `fetch`, no implicit `Date.now()` (§6.2). Every clock or
period the functions need is a **parameter**, exactly as `totalsByPeriod` takes
`periodOf` rather than reading one.

- `totalsForCoverage(totals, coverage)` — sums only the scopes a target covers.
  Biogenic and outside-of-scopes are **never** included, whatever the coverage.
- `targetFigure(baselineKg, reductionPercent)` — `baseline × (100 − pct) / 100`.
  **The ÷100 is a power of ten and must be a scale shift, not a `divide` call**,
  in the manner of `toTonnes`. Exact.
- `trajectory({ baseYear, baselineKg, targetYear, targetKg, scale, mode })` —
  the per-year allowance, one entry per year inclusive. Uses `divide`, and names
  its scale and mode.
- `projectTargetYear(...)` — the run-rate projection, defined precisely and
  testably:
  - A **complete month** is a calendar month strictly earlier than the month
    containing the caller-supplied `asOf`.
  - `W1` = the latest 12 complete months. `W0` = the 12 before those.
  - Projection = `W1 + (W1 − W0) × (yearsFromW1EndToTargetYear)`. **Linear, and
    deliberately not compounding** — a compounded rate from two windows implies
    a confidence two windows cannot support, and it needs a division this
    formulation does not.
- **Typed refusals, on the model of step 10's four.** Each keeps the number out
  of the output, is surfaced rather than defaulted, and is never a zero:
  - fewer than 12 complete months → no projection at all
  - 12 to 23 complete months → a **flat run-rate** carried forward, labelled as
    having no trend behind it — not a trend of zero presented as a trend
  - the target year has already elapsed relative to `asOf`
  - the target figure is zero, so no percentage reading exists
- `readingAgainstTarget(projectionKg, targetKg, scale, mode)` — the signed
  percentage, and the input to the "16% off your 2027 goal" sentence. The sign
  is what separates "off" from "ahead of"; the copy must read from it rather
  than assuming a direction.

### 4. Data — `lib/db/target-queries.ts`

`import "server-only"`. `createTarget`, `listTargets`, `getTarget`,
`retireTarget`. **Every one takes `organizationId` and predicates on it**, and
`getTarget` answers the same "not found" for another tenant's id as for a
non-existent one — no existence oracle, exactly as step 9's `getImport` does.

The emissions the page reads come from the **existing** `listEmissions(orgId,
null)` grouped with the **existing** `totalsByPeriod` and `monthOf`. Do not
write a second aggregation in SQL. If reading an organisation's emissions into
memory is judged a scale problem, say so as a judgement and record it — do not
pre-optimise it here (§12 rule 4).

### 5. The write path — `app/targets/actions.ts`

`createTarget` and `retireTarget`, in **AGENTS.md §10's letters, in §10's
order**, copied from `app/activity/actions.ts` rather than invented:

- **stage a — BotID deliberately absent**, for the reason `stageImport`'s
  docblock records at length. Do not add `/targets` to
  `instrumentation-client.ts`.
- **stage b** — `resolveTenant()`, then a rate limit keyed by **user id**,
  **failing closed**.
- **stage c** — `safeParse` with the shared schema, returning typed field errors.
- **stage d** — the organisation id comes from the membership row and **never
  from the request**. No form field names an organisation, and none may.
- **stage e** — the tenant-predicated write.
- **stage f** — no email. Nothing here notifies anyone.
- Then `revalidatePath("/targets")`, and a typed result. **No redirect on
  success** (§10 rule 5), and never a throw to the client (§10 rule 2).

Two supporting decisions this prompt takes deliberately:

1. **`resolveTenant()` is extracted to a shared server-only module and
   `app/activity/actions.ts` is re-pointed at it.** Duplicating an
   authorisation primitive across two action files is the worse outcome. The
   extraction must be **behaviour-identical** and must preserve the existing
   `SIGNED_OUT` / `NO_ORGANIZATION` / `GENERIC_FAILURE` copy verbatim. This is a
   deliberate touch of step 9's file and is called out here so it is not a
   surprise at review.
2. **A new named limiter** — `checkTargetWriteLimit(userId)` — added to
   `lib/rate-limit/index.ts` in the existing shape, rather than reusing
   `checkActivityCommitLimit`. Its window must be recorded in `docs/backend.md`.

### 6. The route — `app/targets/`

- `page.tsx`, a **Server Component**, gated by `requireOrganization("/targets")`
  — the database-backed check. `proxy.ts` is optimistic and is not enforcement
  (§7.3, §11.2 rule 1).
- The read idiom is `/activity`'s and `/submissions`', deliberately: `Detail`,
  bordered blocks, `Intl.DateTimeFormat` on UTC, the mono caption, the empty
  state. Match `/submissions`' `loading.tsx` / `error.tsx` where they apply.
- `app/_components/targets/` — the create form as a **client leaf**,
  component-only, taking no more than it needs (§8.1, the bundle rule). The
  reading, the trajectory and the projection render in **Server Components**.
- **No GSAP anywhere in this route** (§7.5). The one granted exception is the
  demo dialog's close button and it is not this.
- A reciprocal text link between `/activity` and `/targets`. Both are dynamic
  authenticated routes; **no marketing chrome, no `NAV_ITEMS`, no `SiteNav` or
  `SiteFooter` change**.
- `proxy.ts`'s matcher gains `"/targets/:path*"`. It stays an **explicit list** —
  never a match-all with exclusions (§8.1).

Three presentation rules, carrying step 10's forward:

1. **A projection is never shown as a fact.** It is labelled a projection, it
   states the window it came from and how many complete months that was, and a
   refusal renders as the refusal rather than as a blank or a zero.
2. **The coverage caveat travels.** If the underlying emissions total is
   incomplete — `countUncalculatedRecords` is non-zero — the target reading says
   so, above the figure. A target read against a partial total is a misleading
   number, which is the exact failure step 10's rule 1 exists to prevent.
3. **The stated baseline and the computed-at-creation figure are both visible**
   when they differ, so a reporter can see that their filed baseline is not what
   the engine currently computes for that year. That divergence is information,
   not an error to hide.

## Measurements this implementation must produce

Numbers, not impressions — and each labelled measured or judged (§12 rule 4).

1. **`divide`'s behaviour, by test**: exact quotients; each rounding mode at
   exactly the half; negative operands; scale 0; a repeating quotient truncated
   at the declared scale; the divide-by-zero refusal.
2. **A worked target, computed by hand and recorded as a table** in the style of
   step 10's four-row factor check: baseline, reduction, target figure,
   the per-year trajectory, `W0`, `W1`, the projection, and the reading —
   with the hand arithmetic beside the produced value.
3. **The reading is measured over a synthetic set, and must be reported as
   such.** `docs/backend.md` records that this database holds **zero committed
   activity records**; confirm that is still true at execution time and say so.
   A synthetic monthly series presented as production data would be exactly the
   fabrication §12 rule 3 forbids.
4. **Every refusal exercised**, each with the input that triggers it.
5. Any latency figure must state **warm or cold** — Neon scale-to-zero is on
   (§7.3).

## Prerender impact

**Expected: none. It must be verified, not assumed** (§8.1).

`/targets` is a new **Dynamic** route. The nine static routes and the two SSG
route groups must be untouched in both HTML and render mode.

Verification, following `docs/automation.md` exactly:

- `npm run build` on both sides, in copies under `/home/gdk26/.cache/…` — **not
  `/tmp`**, which is tmpfs and degrades `cp -al` — leaving any running dev
  server alone.
- The baseline route table is step 10's: **27 routes — 11 Static, 2 SSG (6 + 3
  paths), 9 Dynamic, plus Proxy (Middleware)**. The implementation side should
  differ only by the new dynamic route(s). Quote both tables in full.
- **21 prerendered HTML files per side**, normalised for `BUILD_ID`, the CSS
  chunk name and `/_next/static/chunks/[A-Za-z0-9_-]+\.js`, with the RSC flight
  scripts stripped. **The target is 0 of 21 differing.** Pin the same
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on both sides.
- **Exclude `.claude/` and `.agents/` on both sides.** With them excluded the
  base built to exactly **64,513 bytes** of CSS at step 10; confirm that number
  reproduces before trusting any delta.
- The CSS chunk lives in **`.next/static/chunks/`**, not `.next/static/css/`.
- Expect the CSS to grow. Report a **rule-level diff** — utilities added and
  removed, by name — not just a byte delta, and check that step 10's prose-word
  leak does not return (a bare English word in a doc comment collided with a
  text-overflow utility name).
- Never quote a bare page-wide `magick compare -metric AE` for `/`, `/journal`
  or `/careers` (front matter).

## Trust boundary

- **What crosses**: the create form's fields — name, coverage, base year, target
  year, reduction percent, baseline in tCO2e — and a target id on retire. That
  is all.
- **What never crosses**: the organisation id. It is resolved server-side from
  the membership row on every call.
- **Where it is validated**: `lib/validation/targets.ts`, in the browser as a
  courtesy and again in the action as the check (§6.2, §10 rule 1).
- **What authorises it**: a live session plus a `member` row for the
  organisation, re-read per request. Aetherfield's `staff` / `admin` roles grant
  **nothing** here (§11.1) — nothing in this change may read `account.role`.
- **What a rejected request returns**: a typed
  `{ ok: false, error, fieldErrors? }`, announced, focus managed, legible
  without colour (§8.2 rule 5). Another tenant's target id and a non-existent
  one return the same message.

## Secrets and data

- **No new environment variable**, and **no `NEXT_PUBLIC_*`** — adding one is a
  decision to make a value public (§8.4).
- New `lib/db/` and `lib/rate-limit/` modules carry `import "server-only"`.
  `lib/domain/targets.ts` and `lib/validation/targets.ts` **do not**, for the
  reasons step 10 records.
- **Personal data**: none beyond the `createdBy` user id, which is a foreign key
  to a row that already exists. A target is a customer's commercial data, so it
  is tenant-scoped and soft-deletable (§8.3, §9.2 rule 5).
- **Nothing is logged** — no organisation name, no target, no figure, not on a
  catch. There must be no `console` call in the new action file.
- **Nothing reaches a third party. There is no AI in this step** — §5.3
  sanctions models at steps 9, 10 and 13, and step 11 is not among them. Do not
  install an AI SDK, name a model, or scaffold a prompt.

## Non-goals

| not doing | why |
| --- | --- |
| intensity targets, and any business-metric series | settled with the user: absolute only. A denominator series needs its own table and import path |
| per-site or per-scope-3-category targets | the coverage enum is deliberately coarse; a finer one is a schema change with a real UI behind it |
| SBTi pathway validation, sector pathways, 1.5°C alignment checks | each is a published methodology that would have to be read and cited, not remembered (§12 rule 7) |
| dashboard routes, charts, the four-verb loop | **step 12.** `home/dashboard.tsx` stays a marketing illustration |
| ESG report narrative | step 13 |
| scheduled recalculation, threshold alerts, "you crossed your trajectory" email | **step 14**, explicitly |
| market-based scope 2 | still deferred; `scope2_method` already exists so it is not a rewrite |
| editing the `(category, unit)` factor mapping | step 10 left it read-only and named step 12 as its home |
| any change to `/`, `/journal`, `/about`, `/careers`, `/article/*`, `/job-listing/*`, `/design-system`, `SiteNav`, `SiteFooter`, `NAV_ITEMS` | §8.1 and the front matter's settled surfaces |
| GSAP, a second design system, a new primitive | §7.5 |
| a `divide` call anywhere in `lib/domain/emissions.ts` | the calculation path stays exact and unrounded |

## Checks to run, and where the result goes

Run every one and **quote its exact output** (§2, §12 rule 3):

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean. If it disagrees with `tsc --showConfig`, delete `tsconfig.tsbuildinfo` — the trap is in `docs/automation.md` |
| `npm run db:generate` | one new migration, new enums and one new table, **no `ALTER` on any existing table** |
| `npm run db:migrate` | applied over the **unpooled** URL |
| `information_schema` / `pg_indexes` readback | the columns, types and indexes as applied, quoted |
| `npm test` | the existing **81** pass, plus the new `targets` and `divide` tests |
| `npm run build` | the route table, quoted in full, against step 10's 27 |
| prerender diff | **0 of 21 differ**, plus the rule-level CSS diff |
| `npm run test:e2e` | Chromium and Firefox. **If podman is still absent, WebKit does not run — state that as the environment gap it is, do not paper over it** |

**Record the result in `docs/backend.md`**, as `## Step 11 — targets and
forecasting`, following step 10's headings: the decisions taken, what was built
and where, the finding about division, the tables as applied, the precisions and
their derivations, what is judged rather than measured, the worked example, the
visible outcome, prerender impact and verification, checks run, secrets and
data, and what step 11 deliberately did not do.

**AGENTS.md gets nothing.** `docs/backend.md` is already in the index, and
nothing here is a site-wide invariant a session could break without opening it —
so no index row and no new invariant (the front matter's cap rule). The one
exception: if the `resolveTenant` extraction or anything else contradicts a line
already in AGENTS.md, fix that line in the same change and say so (§12 rule 8).

Then commit to `main`, unprompted (§1 step 10). Do not push.

## SKILLS USED

Invoke every one of these **before writing code**, at execution time. Listing is
not loading (§4).

- **`drizzle-docs`** — the new table, the three `pgEnum`s, `numeric` precision
  and scale, indexes, soft-delete predicates, and the `db:generate` /
  `db:migrate` workflow over the unpooled connection.
- **`zod-docs`** — `lib/validation/targets.ts`: the cross-field refinement that
  makes `targetYear > baseYear`, decimal-place bounds, and `flattenError` /
  `treeifyError` for the typed field errors the action returns.
- **`nextjs`** — the new authenticated route, Server Components as the only
  initial read path, Server Actions, `revalidatePath`, `proxy.ts`'s matcher, and
  async `headers()` / `cookies()`.
- **`next-cache-components`** — to confirm what a new dynamic authenticated
  route does to the build's render modes, and that nothing here should carry
  `use cache`. Verified, not assumed.
- **`tailwind-4-docs`** — the route's utilities, config-less, against the
  `@theme` tokens in `app/globals.css`. Also the scanner behaviour behind the
  step 10 prose-word leak.
- **`neon-postgres`** — pooled versus direct connection for the migration, and
  the scale-to-zero cold start any latency note must account for.
- **`upstash-ratelimit-js`** — `checkTargetWriteLimit`, its algorithm and window,
  and reading `retryAfterSeconds` back for `formatRetry`.
- **`better-auth-best-practices`** — the server-side session read behind
  `requireOrganization`, and confirming no root provider is introduced.
- **`organization-best-practices`** — membership resolution and the tenant scope
  every query in this step carries.
- **`frontend-design:frontend-design`** — `/targets` is design work built from
  the existing primitives in `app/_components/`, in the site's measured,
  evidence-first register. Not scaffolding.

Deliberately **not** loaded, and why: `vercel:ai-sdk` and anything AI (§5.3 does
not sanction a model at step 11); `resend` / `react-email` / `email-best-practices`
(this step sends no email); `vercel-storage` (no blob, no new provisioning);
every `gsap-*` skill (§7.5 forbids GSAP in backend UI).

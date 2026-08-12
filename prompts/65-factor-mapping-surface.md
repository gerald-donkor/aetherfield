# 65 — The factor-mapping surface

## Scope, and why it is next

**§5.2's build sequence is exhausted** — steps 1–14 are committed, prompt 63
closed step 8's deferred invitations (`127fa8f`) and prompt 64 closed the
`member` uniqueness note (`bd7cf4b`). Resolved from the repository and `git log`,
not from `prompts/` (§12 rule 5). So this is not a row of §5.2, it is a **new
feature**, and §5.2's "do not overbuild" required asking rather than adding it.
**Asked and chosen by the user on 12 Aug 2026**, from three candidates (this,
E2E coverage of steps 8–14, and one of §5.3's sanctioned AI surfaces).

What it closes is a loop the shipped product already tells a tenant is broken,
with nowhere to go and fix it.

### What was verified this session, by path and line

- `app/_components/activity/emissions-summary.tsx:147-153` renders, to a
  reporter, *"N of M committed records are included. K records have no emission
  factor mapped and contribute nothing to the figures below — this total is not
  complete."*
- `lib/domain/defra.ts:380` — `DEFAULT_FACTOR_MAPPINGS` seeds **11 of the 64
  possible `(category, unit)` pairs**. Its own docblock (`:350-378`) says the
  rest are "deliberately empty — an unmapped pair is surfaced as unmatched,
  which is a legible gap, where a wrong default is an invisible error", and that
  each seeded row "is meant to be overridden by a reporter who knows their own
  fuel, grid or waste stream". **There is no surface that surfaces the gap, and
  none that performs the override.**
- `lib/db/emission-queries.ts` is the only module that touches
  `activity_factor_mapping` at all. `seedDefaultMappings` (`:544`) is its only
  writer and inserts **only when the organisation has none**; `listFactorMappings`
  (`:164`) is read solely by `recalculateOrganization` (`:387`). Nothing under
  `app/` imports either — checked with `rg` across `app/` and `lib/`.
- `activity_factor_mapping.created_by` (`lib/db/schema.ts:701`) is documented as
  "Who chose it, for the provenance line. Null for the seeded defaults, which no
  person chose." **Every row in the table today is null**, because no person can
  choose one.
- `hasAnyFactorMapping` (`lib/db/emission-queries.ts:516`) has **zero callers**.
  Its docblock says "The surface uses it to tell the difference between 'nothing
  is mapped yet' … and 'these particular records did not match'". No surface
  does. That is a stale claim and this prompt either makes it true or corrects it
  (§12 rule 8).
- `lib/domain/emissions.ts:331-346` already defines `UnmatchedPair` and
  `CoverageReport`, with `unmatchedPairs` described as "What the coverage surface
  lists, so a person sees the *shape* of the gap rather than a thousand identical
  row errors", and `aggregate()` (`:392`) computes both on every run.
  **`recalculateOrganization` discards `coverage` entirely** (`:404`, which
  destructures `{ emissions }` only). The data this surface needs is already
  computed and thrown away once a day.

**The exposure, stated honestly.** Nothing here is broken arithmetic and nothing
produces a wrong figure — the engine refuses rather than guesses, which is
step 10's whole shape. The gap is that a tenant whose records fall outside the
eleven seeded pairs has a permanently incomplete total, is told so on screen, and
has no action available. That is a dead end in the product, not a defect in the
engine.

## Reference material read for this prompt

- `AGENTS.md` §§5.2, 5.3, 6.2, 6.3, 8.1, 8.2, 9.2, 10, 11, 12
- `docs/backend.md` — the step 10 section and its non-goals table (which defers
  "editing the `(category, unit)` mapping in the UI" to step 12), the step 12
  non-goals table (which defers "factor-mapping edits" back to "existing/later
  owning surfaces"), and step 9's action idiom
- `lib/db/emission-queries.ts` in full — `visibleFactorScope`, `listFactorSets`,
  `listFactorMappings`, `buildFactorResolver`, `recalculateOrganization`,
  `countUncalculatedRecords`, `hasAnyFactorMapping`, `seedDefaultMappings`
- `lib/db/schema.ts:685-720` — `activity_factor_mapping`, its
  `activity_factor_mapping_key` unique index and its `deleted_at`
- `lib/domain/emissions.ts:118-459` — `convertQuantity`, `calculateRecordEmission`,
  `EmissionRefusal`, `CoverageReport`, `aggregate`
- `lib/domain/defra.ts:289-420` — `normaliseDefraRow`, `DEFAULT_FACTOR_MAPPINGS`
- `app/activity/actions.ts` in full — the lettered stage idiom, `resolveTenant`,
  `consumeCommitLimit`
- `app/account/actions.ts:300-340` — `resolveMembershipForWrite()` and the
  `membership.role !== "owner"` refusal at stage **d**
- `app/activity/page.tsx:1-80` — `requireOrganization`, `searchParams`, the read
  idiom shared with `/submissions`
- `app/_components/activity/emissions-summary.tsx` in full
- `lib/auth/tenant.ts`, `lib/rate-limit/index.ts` (the `check*Limit` family),
  `app/_components/workspace-nav.tsx`, `proxy.ts:22-29`
- `drizzle-docs` skill — `references/docs/305-pg-indexes-constraints.md`,
  `306-pg-insert.md` (`onConflictDoUpdate`), `330-pg-transactions.md`

## The decisions this prompt makes

Each is a judgement, not a measurement, and each is flagged so the user can flip
it before approving.

1. **Owner-only writes.** Reading the mapping surface is open to any member;
   changing a factor is `membership.role !== "owner"` refused at stage **d**,
   exactly as `inviteMember` does. A factor choice moves every figure in a
   disclosure, which puts it with the owner-only operations rather than with
   importing data.
2. **The action recalculates inline, and does not leave stale figures behind.**
   After a successful mapping write it calls the existing
   `recalculateOrganization(organizationId, null)` — **the one definition of
   what a recalculation is** (its own docblock), never a second one. The
   alternative, a "your figures are stale" notice beside the existing
   `RecalculateControl`, leaves an already-calculated record showing a figure
   derived from a factor that is no longer mapped, with nothing on screen saying
   so. The cost is a slower action on a large tenant; it is bounded by the same
   rate limit and by the 300 s function timeout, and `docs/backend.md`'s standing
   note about revisiting query cost against real tenant volume applies.
3. **Set and change only — no unmap, no clear.** `activity_factor_mapping` has a
   `deleted_at`, but `activity_factor_mapping_key` is a **plain unique index, not
   a partial one** (`lib/db/schema.ts:713`), so a soft-deleted row still occupies
   its `(organization_id, category, unit)` slot and re-mapping that pair later
   would violate it. Writing the upsert to also clear `deleted_at` is required
   for correctness; offering an unmap control is a separate decision about what a
   removed mapping means, and it is out of scope here.
4. **The factor picker is server-rendered over a `?q=` search param**, not a
   client combobox. §6.2 forbids a client-side data-fetching library on primary
   read paths, the DEFRA set is thousands of rows, and `/submissions` and
   `/activity` already establish the searchParams-driven server-rendered list
   idiom. Every result row is a form whose submit sets that factor.
5. **A new route, `/activity/mappings`.** It sits inside `proxy.ts`'s already
   enumerated `/activity/:path*` (`proxy.ts:24`), so **the matcher does not
   widen** — §8.1's requirement is already satisfied. It is a sibling of
   `app/activity/[importId]/`; confirm with the `nextjs` skill that a static
   segment takes precedence over a dynamic one at the same level before relying
   on it, rather than assuming the routing rule from memory (§12 rule 2).

## The work

### 1. The domain predicate — pure, and tested

**Which factors may be offered for a pair is the engine's rule, and it must be
read from the engine rather than re-derived in a query.** A factor whose
`result_unit` is `kwh` is refused by `calculateRecordEmission`
(`lib/domain/emissions.ts:272`) as `factor_is_not_an_emission`, and one whose
`activityUnit` does not convert from the pair's unit is refused as
`unit_mismatch` (`:291`). Offering either in the picker would let an owner "fix"
a gap and change nothing but the refusal reason.

Add a pure exported predicate to `lib/domain/emissions.ts` — built on the
existing `convertQuantity` and the same `result_unit` check, not a second copy of
either — that answers whether a given factor can produce a figure for a given
activity unit. Cover it in `lib/domain/emissions.test.ts`: a convertible pair, a
cross-dimension pair (`km` against `tonne.km`, which `:33` already names), and a
`kwh`-result factor. `npm test` is scoped to `lib/domain/` and this is exactly
the kind of rule it exists for.

### 2. The query layer — `lib/db/emission-queries.ts` only

Nothing outside `lib/db/` writes SQL (§6.2, §7.5). Three additions, each
tenant-predicated, each following the module's existing `visibleFactorScope`
discipline for the reference tables:

- **The coverage gaps.** Committed, non-deleted `activity_record` rows grouped by
  `(category, unit)` with a record count, left-joined against the organisation's
  live mappings, so the surface can list mapped and unmapped pairs together
  without running the engine. Predicated on `organization_id = $1`.
- **The factor search.** Visible (`organization_id is null or = $1`),
  non-deleted, non-superseded factors, filtered to the ones the step-1 predicate
  admits for the pair's unit, matched against the search text over the
  publisher's own description columns (`level2`, `level3`, `column_text` — the
  three `listFactorMappings` already joins into `factorLabel`). Bounded result
  count; state the bound in the code as a judgement.
- **The upsert.** `insert … onConflictDoUpdate` on the
  `activity_factor_mapping_key` target, setting `factor_id`, `created_by`,
  `updated_at` **and `deleted_at: null`** (decision 3). Verify the
  `onConflictDoUpdate` form against `drizzle-docs`
  `references/docs/306-pg-insert.md` before writing it; do not recall it.

The chosen `factor_id` must be re-resolved under `visibleFactorScope` inside the
write path. **A factor id arriving from the browser is untrusted**: one belonging
to another tenant's private set must be indistinguishable from one that does not
exist, exactly as `getImport` treats a foreign `importId` (`app/activity/actions.ts:76-79`).

### 3. The action — `app/activity/actions.ts`

One new action, in the file's own lettered stage order and its comment idiom:

- **a.** BotID deliberately absent on an authenticated path — reference
  `stageImport`'s existing reasoning rather than restating it.
- **b.** Resolve the session and tenant, then the rate limit. The role is needed,
  so resolve the membership the way `app/account/actions.ts` does rather than
  through `resolveTenant()`, which returns ids only. Reuse
  `checkActivityCommitLimit` unless a reason to add a limiter emerges; if a new
  one is added it goes in `lib/rate-limit/` beside the others and is recorded.
  **Fails closed**, like every path beside it.
- **c.** Parse with a new shared schema in `lib/validation/activity.ts` — the
  category, the unit and the factor id. The leaf runs the same schema (§10
  rule 1). Category and unit parse against the existing `ACTIVITY_CATEGORIES` /
  `ACTIVITY_UNITS` unions, never a free string.
- **d.** Authorise: `membership.role !== "owner"` → a typed refusal from a new
  constant. Aetherfield `staff` and `admin` grant nothing here (§11.1).
- **e.** Re-resolve the factor under the tenant scope, re-check the step-1
  predicate server-side, then upsert. A factor that fails either check returns a
  typed field error, never a throw (§10 rule 2).
- **f.** No email. Then `recalculateOrganization(…, null)` per decision 2,
  `revalidatePath("/activity")` and `revalidatePath("/activity/mappings")`, and a
  typed result. **No redirect on success** (§10 rule 5).

Nothing is logged — no category, no factor label, no organisation name, on no
path and in no catch (§8.3 rule 2, extended to commercial data by §5.3).

### 4. The surface — `app/activity/mappings/page.tsx`

A Server Component gated by `requireOrganization("/activity/mappings")`, in the
read idiom `/activity` and `/submissions` share — the existing primitives in
`app/_components/`, no new design system, no GSAP (§7.5). It lists every
`(category, unit)` pair the organisation's committed records actually use,
each showing either the mapped factor with its `factorLabel`, source and dataset
version, or an unmapped state with the record count behind it. The Open
Government Licence attribution renders wherever factors are surfaced, from the
set rather than hard-coded, as `emissions-summary.tsx:216-233` does.

The picker is one client leaf — component-only, taking `children`, adding no box
— rendering the search results and the typed result of the action, announced and
focus-managed, legible without colour (§8.2 rule 5), matching
`app/_components/activity/mapping-form.tsx` and the targets forms.

Add the route to `app/_components/workspace-nav.tsx` only if it belongs in the
top-level workspace nav; a link from `/activity` and from the coverage line may
be the better placement. Decide it on the page, and say which was chosen.

### 5. Two corrections in the same change (§12 rule 8)

- **`emissions-summary.tsx:147-153` over-claims.** `countUncalculatedRecords`
  (`lib/db/emission-queries.ts:486`) counts every committed record with no
  `activity_emission` row, whatever the reason — a newly mapped pair awaiting a
  recalculation, or a record the engine refused for `unit_mismatch`, counts the
  same as an unmapped one. The sentence attributes all of them to "no emission
  factor mapped". Correct the copy to say what the number actually is, keeping
  the measured register, and link to the new surface.
- **`hasAnyFactorMapping`'s docblock** claims a surface uses it. Either this
  surface does, or the docblock is corrected to say it has no caller.

## Prerender impact

**Expected none — no marketing route changes.** Every route touched is
authenticated and dynamic: `/activity`, the new `/activity/mappings`, and no
other. `proxy.ts`'s matcher does **not** widen (decision 5).

**Verify, do not assume** (§4, §8.1). Run `npm run build`, confirm the route
table — the nine static marketing routes still `○`/`●`, 30 static pages, the new
route `ƒ` — and diff the prerendered HTML.

**Use the two-build method, not a worktree.** Prompt 64 recorded that a
`git worktree` comparison on this repository is confounded: the main tree carries
gitignored files a fresh worktree does not — notably the `drizzle-docs` skill's
~4.5 MB markdown snapshot under `.claude/skills/`, which Tailwind v4 scans — so
the two trees do not generate the same stylesheet at all, and 20 of 21 pages
differed for reasons unrelated to the change. Build the working tree twice,
once with the change stashed, in an identical environment, normalising only
`.next/BUILD_ID` and the CSS chunk name. The standing warning stands: never quote
a bare page-wide `AE` for `/`, `/journal` or `/careers`.

## Trust boundary

| what crosses | from | validated | authorised by | rejection |
| --- | --- | --- | --- | --- |
| category, unit, factor id | the picker leaf, as a Server Action argument | the shared Zod schema at stage **c**, then the factor re-resolved under `visibleFactorScope` and re-checked against the step-1 predicate at stage **e** | a live session, a `member` row for the organisation, and `role === "owner"` at stage **d** | a typed `{ ok: false, error, fieldErrors? }`, never a throw |
| the `?q=` search text | the URL | parsed and bounded server-side; it selects rows, it never names an organisation | the page's `requireOrganization` gate | an empty result list |

**The organisation id never crosses the boundary** — it is resolved server-side
from the membership row on every call, as every authenticated action in this
repository already does. A factor id belonging to another tenant's private set is
answered identically to one that does not exist: **no existence oracle.**

## Secrets and data

- **No new environment variable, and no `NEXT_PUBLIC_*`.**
- No new provider, no email, no blob, **and no AI** — §5.3's factor-matching
  surface is sanctioned at step 10 and stays unbuilt; this prompt is the
  deterministic surface a person uses, and it is what a model would one day
  propose *into*, never around.
- The change stores one new kind of fact: **which user chose a factor for a
  pair**, in the existing `created_by` column that was built for it. No personal
  data beyond that user id, which the `member` row already holds.
- Nothing is logged on any path (§8.3 rule 2).
- The migration is generated, not hand-written, **only if the schema changes** —
  and it should not need to: every column this uses already exists.

## Non-goals

| not doing | why |
| --- | --- |
| an unmap or clear control | decision 3 — the unique index is not partial, and what a removed mapping means is its own decision |
| a custom factor: letting a tenant type a value | that is a customer-supplied factor *set*, which `emission_factor.organization_id` already anticipates and which needs a provenance and licence story of its own |
| AI factor matching | §5.3: sanctioned at step 10, "sanctioned, not scheduled". Deterministic first, and the user has chosen deterministic twice |
| a second publisher, market-based scope 2, halocarbon GWPs | step 10's non-goals, unchanged by this |
| editing or re-running a committed import, or a site-management UI | step 9's non-goals, unchanged |
| a per-record factor override | the mapping is per `(category, unit)` by design; a per-record override is a different data model |
| persisting `CoverageReport` in a table | the gaps are derivable from a grouped query; a stored copy is a second source of truth for a disclosure input |
| E2E coverage of this surface, or of steps 8–14 | the candidate the user did not choose. WebKit cannot run here anyway (`which podman` → not found) |
| a new primitive, a second design system, or GSAP | §7.5 |
| any marketing route, `SiteNav`, `SiteFooter`, or `proxy.ts`'s matcher | §8.1 and the front matter's settled surfaces |

## Checks

Run every one and quote its exact output (§2, §12 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm test` — including the new pure predicate's cases
- `npm run build` — plus the route table and the two-build prerender diff above
- `npm run test:e2e:local` — Chromium and Firefox
- **`npm run test:e2e:webkit` cannot run here: `which podman` returns "podman not
  found".** Say so plainly; the last two commits had the same gap. Do not claim
  WebKit passed and do not silently omit it.

Record the result in **`docs/backend.md`**, in a new section after "One
membership row per `(organisation, user)`, prompt 64": the verified findings
above with their line numbers, the five decisions and which are judgements, the
new queries and their predicates, the two corrections, and the prerender
verification with the method used. Nothing goes in `AGENTS.md` — this adds no
index row and no site-wide invariant, and §5.2 is **not** edited to add a
step 15 (the file records the plan, not the progress).

## SKILLS USED

- **`drizzle-docs`** — `onConflictDoUpdate` (`references/docs/306-pg-insert.md`),
  the unique-index form (`305-pg-indexes-constraints.md`) and transactions
  (`330-pg-transactions.md`). Take the `pg-` files; the titles repeat across six
  dialects
- **`zod-docs`** — the shared schema for category / unit / factor id, and
  `z.flattenError` for the field errors, as the existing actions use
- **`nextjs`** — Next 16 Server Action and `searchParams` conventions, and the
  static-vs-dynamic route-precedence rule decision 5 depends on. Almost every
  tutorial predates these
- **`tailwind-4-docs`** — the config-less `@theme` tokens for the new surface;
  no `tailwind.config.js` exists
- **`neon-postgres`** — the pooled/direct split if any migration runs, and
  scale-to-zero before quoting any timing as measured
- **`better-auth-best-practices`** and **`organization-best-practices`** — the
  membership and role read at stage **d**, and that `owner` is the plugin's own
  role string rather than an invented one
- **`upstash-ratelimit-js`** — only if a new limiter is added rather than
  `checkActivityCommitLimit` reused
- **`frontend-design:frontend-design`** — the new authenticated surface is design
  work under the front matter's rules, built from the existing primitives

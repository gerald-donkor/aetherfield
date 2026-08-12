# 66 — Custom factor sets

## Scope, and why it is next

**§5.2's build sequence is exhausted**, and prompt 65 closed the first post-sequence product loop by letting an owner map committed `(category, unit)` pairs to visible factors. Resolved from the repository and `git log`, not from `prompts/`: `b170d8e Add factor mapping surface` is `HEAD`, and `docs/backend.md` records prompt 65 as implemented.

This prompt is the next dependency-sized continuation because prompt 65 deliberately stopped at choosing among already-visible factors. Its own non-goal names **custom customer-supplied factors** as a separate factor-set problem needing provenance, licence and validation. The schema already anticipated that: `emission_factor_set.organization_id` and `emission_factor.organization_id` are nullable reference-data columns where `null` means published shared data and a non-null value means a customer-supplied tenant-owned set. There is no way to create such a set today, so an owner whose correct supplier factor is not in DEFRA still has to choose the nearest published row or leave the pair unmapped. Both are wrong for a disclosure; the right next step is deterministic tenant-owned factor entry.

## Reference material read for this prompt

- `AGENTS.md` §§5.2, 5.3, 6.1, 6.2, 6.3, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 9.2, 10, 11, 12
- `docs/backend.md` — prompt 65's factor-mapping section, step 10's reference-data design, step 9's activity action idiom, and the non-goals that defer custom factors, AI factor matching, connectors, site management and erasure
- `prompts/65-factor-mapping-surface.md` — especially the non-goal: "a custom factor: letting a tenant type a value" is a customer-supplied factor set with provenance and licence requirements
- `lib/db/schema.ts` — `emission_factor_set`, `emission_factor`, `activity_factor_mapping`, `activity_emission` and the nullable reference-data exception
- `lib/db/emission-queries.ts` — `visibleFactorScope`, `listFactorSets`, `searchFactorsForPair`, `getVisibleFactor`, `setFactorMapping`, `recalculateOrganization`
- `lib/validation/emissions.ts` — factor vocabularies, scope labels, result units, activity units and the existing recalculate schema
- `lib/validation/activity.ts` — `factorMappingSchema` and action-result copy
- `app/activity/actions.ts` — the lettered action order and owner-only `setFactorMapping`
- `app/activity/mappings/page.tsx` and `app/_components/activity/factor-picker.tsx` — the existing factor surface and client-leaf pattern
- `app/_components/primitives.tsx`, `app/_components/targets/create-target-form.tsx`, `app/_components/reports/create-report-form.tsx`, `app/_components/workspace-nav.tsx`
- `lib/rate-limit/index.ts` — authenticated, user-id keyed limiter pattern
- `drizzle-docs` skill — `references/docs/272-pg-column-types.md`, `306-pg-insert.md`, and reload `305-pg-indexes-constraints.md` / `330-pg-transactions.md` before implementation if schema/indexes or transactions change
- `zod-docs` skill — shared schema and `z.flattenError` guidance
- `nextjs` skill plus `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` — Server Actions are untrusted POSTs, return values are serialized, `revalidatePath` gives the current route read-your-own-write
- `tailwind-4-docs` skill — `references/engineering-playbook.md`; snapshot date `2026-08-07`
- `neon-postgres`, `better-auth-best-practices`, `organization-best-practices`, `upstash-ratelimit-js`, `vercel-react-best-practices`

## Decisions this prompt makes

Each decision below is a judgement, not a measurement.

1. **Manual single-factor entry first.** Add one factor row at a time through a form. Do not build CSV upload for factor sets yet; a factor dataset import needs its own grammar, row-level validation and rollback story, and it is larger than the product gap this closes.
2. **One tenant-owned set per organisation per source/version.** Reuse `emission_factor_set_organization_key (organization_id, source, dataset_version)` rather than forking another table. A manually created factor belongs to a named customer set such as `Supplier tariff` / `2026 contract`, not to a global published dataset.
3. **Source and licence are required.** A custom factor without provenance is not a disclosure input. The form requires source name, dataset/version label, licence or contractual basis, source URL or internal reference, and an effective date range. If the source is private or contractual and has no public URL, store a short text reference rather than inventing a URL.
4. **Only factors that directly produce `kg_co2e`.** Custom rows may not create `result_unit = "kwh"` factors. They exist to compute emissions from activity rows, and the existing picker filters to emissions-producing rows.
5. **Owner-only writes.** Any member may read the factor list and mappings; only `membership.role === "owner"` may create or retire tenant-owned factor rows. A factor can move every figure in a disclosure, exactly like prompt 65's mapping write.
6. **Retire, do not hard-delete.** A customer-owned factor set or row that has been used in `activity_emission` must remain re-derivable. Use `deleted_at` for current visibility. Do not delete rows.
7. **No automatic remapping.** Creating a factor makes it visible in `/activity/mappings`; it does not immediately assign it to a pair. The owner still chooses it through the existing mapping flow, which rechecks engine eligibility and recalculates.
8. **A new route under Activity.** Add `/activity/factors` as an Activity sub-flow, not a top-level `WorkspaceNav` item. Link it from `/activity/mappings` and from the Activity page near the emissions summary. `proxy.ts` already covers `/activity/:path*`, so the matcher must not widen.

## The work

### 1. Validation

Add shared schemas and copy to `lib/validation/emissions.ts` rather than `lib/db/`:

- `customFactorSetSchema` for the set metadata: `source`, `datasetVersion`, `publicationYear`, `effectiveFrom`, `effectiveTo`, `licence`, `licenceUrl` or `sourceReference`, `sourceUrl` if public, optional `notes`.
- `customFactorSchema` for one row: the publisher description fields this app already renders (`level1` through `level4`, `columnText`, `publishedUom`, `publishedGhgUnit`), the normalized fields (`scope`, optional `scope3Category`, optional `scope2Method`, `activityUnit`, `gas`, optional `ch4Variant`, `gwpSet`, optional `region`, `biogenic`, `value`).
- A combined action schema for creating a tenant-owned factor in a named set.

The schema must enforce the important cross-field rules before any write:

- `value` is a decimal string, positive, with at most 5 integer digits and 17 decimal places unless the implementation deliberately changes the measured `numeric(24,17)` contract and records why.
- `resultUnit` is fixed server-side to `kg_co2e`; do not accept it from the browser.
- `scope3Category` is required for `scope_3` and absent for every other scope.
- `scope2Method` is required for `scope_2` and absent for every other scope.
- `ch4Variant` is required when `gas === "ch4"` and absent otherwise.
- `effectiveTo` is not before `effectiveFrom`.
- All strings are trimmed and bounded. Empty strings become validation errors, not nulls, unless the database column is genuinely optional.

Use `z.flattenError`, not deprecated Zod v3 methods. The client leaf runs the same schema as a courtesy; the action runs it as the check.

### 2. Query layer

All SQL stays in `lib/db/emission-queries.ts`.

Add tenant-predicated helpers:

- list tenant-owned factor sets and row counts for `/activity/factors`;
- list tenant-owned factors within one set, newest/most recent first;
- find or create the tenant-owned factor set for `(organization_id, source, dataset_version)` in a transaction;
- insert one tenant-owned factor row with `organization_id = organizationId`, `set_id` from that tenant's set, a tenant-stable `source_row_id`, and `result_unit = "kg_co2e"`;
- soft-retire a tenant-owned factor row only when it belongs to the resolved organisation, setting `deleted_at`;
- optional: soft-retire a set only when it belongs to the resolved organisation, if the UI offers set retirement.

The tenant-owned `source_row_id` must be deterministic enough to keep duplicate form submissions from creating two identical rows, but must not create a cross-tenant identifier. Prefer a stable hash over the normalised set identity plus row identity inside the organisation. If that would require a schema change for idempotence, generate it through Drizzle; do not hand-write SQL.

Every read of reference data continues to use the existing visible predicate where appropriate:

```sql
organization_id is null or organization_id = $1
```

Every write to tenant-owned rows is strict equality:

```sql
organization_id = $1
```

Do not let a submitted `setId` or `factorId` act as a capability. Re-read it under the tenant predicate or do not accept it at all.

### 3. Action

Add actions in `app/activity/actions.ts`, following the existing lettered stages:

- **a.** BotID absent on an authenticated path, with the same reasoning as `stageImport` and `setFactorMapping`.
- **b.** Resolve session, organisation and role with `getCurrentMembership()` because stage d needs the role. Add a named rate limiter if this work differs materially from `checkFactorMappingLimit`; otherwise reuse the existing limiter and record why.
- **c.** Parse the shared schema.
- **d.** Authorise owner-only. Return typed errors; do not throw to the client.
- **e.** Write only through `lib/db/emission-queries.ts`, inside the transaction where set creation and factor insertion must be atomic. Re-check all tenant ownership server-side.
- **f.** No email. Revalidate `/activity/factors`, `/activity/mappings`, and `/activity`. Do not recalculate merely because a factor was created; recalculation belongs to the explicit mapping change.

The result shape stays `{ ok: true } | { ok: false, error, fieldErrors? }`. Nothing is logged: not a factor value, source name, organisation name, row description or caught payload.

### 4. UI surface

Add `/activity/factors`.

It is a Server Component gated by `requireOrganization("/activity/factors")`. It shows:

- the organisation's tenant-owned factor sets;
- each set's source, dataset/version, effective range, licence/reference and row count;
- the current tenant-owned rows with scope, activity unit, gas, value, region and retired state;
- a create-factor form using the existing primitives and the same compact operational register as `/targets` and `/reports`;
- links back to `/activity/mappings` to use the factor after creating it.

Add one client leaf, component-only, with no exported constants or types and no data fetching. It owns only pending state, courtesy validation, focus management and the announced result. It adds no card or boxed design system of its own.

Update `/activity/mappings` so a search result from a tenant-owned set is clearly marked as customer-supplied and carries the tenant set's provenance. Do not hard-code DEFRA/OGL copy for custom sets; attribution must read from the set row.

Add a link to `/activity/factors` from `/activity/mappings`. Add a secondary link from `/activity` only if it fits near the coverage line without turning the Activity index into a settings page. Record the choice in `docs/backend.md`.

### 5. Tests and verification harness

Add focused tests where they fit existing coverage:

- pure validation/domain tests for decimal/value and cross-field rules if they can stay in `lib/domain/` or validation without database access;
- a live database harness only if the repository already has one for this area; otherwise state that query/action stages are not browser-verified.

Do not add broad E2E coverage in this prompt. The existing E2E command is blocked before tests because `next start` cannot find `.next/BUILD_ID` after the current Turbopack build, and prompt 65 records that gap. Fixing that harness is its own prompt.

## Prerender impact

Expected: **none**. `/activity/factors` is authenticated and dynamic; `/activity` and `/activity/mappings` are already dynamic. No marketing route should change markup or render mode, and `proxy.ts`'s matcher must not widen because `/activity/:path*` already covers the new route.

Verify, do not assume:

- run `npm run build`;
- confirm the marketing route table remains static/SSG;
- compare prerendered HTML with the two-build method recorded in prompt 65 and `docs/automation.md`, normalising only the known generated build id and chunk filenames.

## Trust boundary

| what crosses | from | validated | authorised by | rejection |
| --- | --- | --- | --- | --- |
| factor-set metadata and one factor row | `/activity/factors` client leaf | shared Zod schema in `lib/validation/emissions.ts`, then server-side cross-field and tenant checks | live session, membership row for the active organisation, and `role === "owner"` | typed `{ ok: false, error, fieldErrors? }` |
| factor/set ids for retire actions, if added | client button | UUID shape first, then re-read under `organization_id = $1` | same owner-only membership check | identical not-found for missing and foreign ids |
| search/list params | URL | bounded server-side | page's `requireOrganization` gate | empty list or redirect to canonical page, not a throw |

The organisation id never crosses the browser boundary. It is resolved server-side from the membership row on every page render and action call.

## Secrets and data

- No new environment variables and no `NEXT_PUBLIC_*`.
- Reads existing `DATABASE_URL` through `lib/db/client.ts` and, if a limiter is added/reused, `KV_REST_API_URL` / `KV_REST_API_TOKEN` through `lib/rate-limit/`.
- No email, no Blob, no AI and no third-party model call.
- Stores customer-supplied factor provenance and numeric factor values. Treat those as tenant commercial data: never log them, never send them to a third party, and always tenant-filter reads.
- A custom factor can become a disclosure input after mapping and recalculation. No LLM produces or alters any value.

## Non-goals

| not doing | why |
| --- | --- |
| bulk factor-set CSV import | needs a separate parser, staging surface and rollback story |
| AI factor matching | §5.3 sanctions suggestions, but this prompt creates deterministic tenant-owned rows only |
| automatic mapping to a new custom factor | prompt 65's mapping flow is the explicit choice and recalculation point |
| editing a factor that has already been used | restatement semantics are separate; retire and add a replacement instead |
| market-based scope 2 certificate capture | needs REC/GO evidence and residual-mix fallback, not just a factor row |
| EPA/eGRID/IEA dataset import | step 10 recorded provider/licence decisions; IEA remains licence-blocked |
| E2E harness repair | prompt 65 recorded the blocker; fix it separately |
| site management, activity-record deletion, organisation erasure/retention | separate unresolved data-lifecycle decisions |
| a top-level workspace nav item, a new primitive, GSAP, or marketing-route changes | this is an Activity sub-flow and backend UI |

## Checks

Run every applicable check and quote the exact output:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run db:generate` if the schema changes
- `npm run db:migrate` if a migration is generated
- `npm run build` and route-table verification
- the two-build prerender HTML diff from `docs/automation.md`
- `npm run test:e2e:local` only if the existing `.next/BUILD_ID` blocker has been fixed; otherwise rerun enough to quote the same blocker honestly
- `npm run test:e2e:webkit` only if `podman` exists; otherwise quote the script's `podman` requirement as the gap

Record the implementation in `docs/backend.md`, in a new section after prompt 65. Include: the chosen manual-entry scope, schema/table changes if any, column precision decisions and which are measured vs judged, tenant predicates, authorisation and rate-limit choice, prerender verification, exact check outputs, and non-goals left open. Do not edit `AGENTS.md` unless the implementation creates a true site-wide invariant or corrects a stale contract line.

## SKILLS USED

- **`drizzle-docs`** — schema/table updates, `numeric` column typing, generated migrations, transactions and inserts/upserts
- **`zod-docs`** — shared validation schemas, cross-field validation and `z.flattenError`
- **`nextjs`** — Next 16 Server Actions, Server Components, `searchParams`, `revalidatePath` and route behaviour
- **`tailwind-4-docs`** — Tailwind v4 utility usage and existing token discipline for the new authenticated UI
- **`neon-postgres`** — pooled/direct connection split, migration constraints and scale-to-zero caveats
- **`better-auth-best-practices`** — server-side session handling and Better Auth database-backed role reads
- **`organization-best-practices`** — owner/member role semantics and organisation membership checks
- **`upstash-ratelimit-js`** — user-id keyed limiter if the action needs a named bucket
- **`vercel-react-best-practices`** — component-only client leaf, minimal serialized props and no client data-fetching path

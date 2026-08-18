# 125 — Cut `app/activity/actions.ts` along its three routes

Architecture candidate **4** of the review of 17 Aug 2026
(`docs/architecture.md`), *Worth exploring · in-process*.

## Scope, and why it is next

The recommended order is **1 → 3 → 2 → 4, 5, 6**. Candidates 1, 3 and 2 are all
landed — resolved from `git log` and the files on disk, not from `prompts/`
(`622c6b2` prompt 121, `3ac8c64` prompt 122, `4be68c8`/`557f6f1` prompts
123–124). Candidates 4 and 5 both depend only on candidate 3, which is done;
candidate 6 is blocked on a design answer the user has not given
(`docs/architecture.md` line 229). Between 4 and 5, `docs/architecture.md`'s own
constraint table lists **"3 before 4"** and **"3 before 5"** as siblings with no
ordering between them — this prompt takes 4 first, matching the `4, 5, 6`
sequence in `AGENTS.md` §5.4's table and in the review's own numbering.

## The problem, restated from what is on disk

`app/activity/actions.ts` is **1428 lines** today (the review's count of 1512
was against `2337ab1`; candidate 3, prompt 122, already cut ~85 lines of
preamble — `consumeCommitLimit` and `stageImport`'s inline limiter block are
both gone). It still has **11 exports** serving **three owning routes** under
one file:

| route | actions | client callers |
| --- | --- | --- |
| `/activity` + `/activity/[importId]` (the import flow — one nested tree) | `stageImport`, `updateImportMapping`, `commitImport`, `discardImport`, `recalculate` | `upload-form.tsx`, `mapping-form.tsx`, `import-controls.tsx`, `recalculate-control.tsx` (the last via `emissions-summary.tsx`, rendered from both routes) |
| `/activity/mappings` | `setFactorMapping` | `factor-picker.tsx` (via `factor-choice-panel.tsx`) |
| `/activity/factors` | `createCustomFactor`, `importCustomFactors`, `retireCustomFactor`, `editFactorSet`, `retireFactorSet`, plus the private helpers `setChoiceFrom` and `stageRows` | `custom-factor-form.tsx`, `factor-import-form.tsx`, `retire-factor-button.tsx`, `factor-set-form.tsx`, `retire-set-button.tsx` |

Confirmed by reading every caller (`grep -rl "activity/actions"`), not assumed:
`recalculate` is the one action reached from two page files
(`app/activity/page.tsx` and `app/activity/[importId]/page.tsx`, both through
`EmissionsSummary`), which is why the import flow is treated as **one** owning
route tree rather than two — `[importId]` is `/activity`'s nested route, not a
sibling.

**§6.3's colocation rule assumes one owning route; this module serves three,**
and their message sets, limiters and resolve helpers are interleaved rather
than separated: `IMPORT_MESSAGES` / `COMMIT_MESSAGES` /
`FACTOR_MAPPING_MESSAGES` / `CUSTOM_FACTOR_MESSAGES` /
`CUSTOM_FACTOR_IMPORT_MESSAGES` and `resolveImportTenant` /
`resolveCommitTenant` (candidate 3 left the mappings and factors gates as
inline `resolveTenantFor({...})` calls, not named helpers) all live in one file
whether or not the reader is touching that route.

## The split to build

Three action modules matching the three route trees, each `"use server"`,
each carrying only the messages, resolve helpers and exports its own route
needs:

1. **`app/activity/actions.ts`** (kept in place — the import flow's own route)
   — `stageImport`, `updateImportMapping`, `commitImport`, `discardImport`,
   `recalculate`; `IMPORT_MESSAGES`, `COMMIT_MESSAGES`, `resolveImportTenant`,
   `resolveCommitTenant`; the module docblock trimmed to this flow only.
2. **`app/activity/mappings/actions.ts`** (new) — `setFactorMapping`;
   `FACTOR_MAPPING_MESSAGES`; its own docblock.
3. **`app/activity/factors/actions.ts`** (new) — `createCustomFactor`,
   `importCustomFactors`, `retireCustomFactor`, `editFactorSet`,
   `retireFactorSet`, and the two private helpers `setChoiceFrom` and
   `stageRows`; `CUSTOM_FACTOR_MESSAGES`, `CUSTOM_FACTOR_IMPORT_MESSAGES`; its
   own docblock.

Each file imports only what its own exports use from `lib/db/`,
`lib/domain/`, `lib/validation/`, `lib/rate-limit/` and `lib/auth/tenant.ts` —
no file re-exports from another, and no shared helper module is introduced for
three files this small. `GENERIC_FAILURE`, `SIGNED_OUT`, `NO_ORGANIZATION`,
`ORGANIZATION_LOCKED`, `NOT_FOUND`, `NOT_STAGED`, `FIELD_FAILURE` and
`NOTHING_TO_CALCULATE` are used only by the import flow today (confirm this by
reading every reference before moving anything, since a wrong guess here is a
silent behaviour change) and move with it; `FACTOR_MAPPING_*` and
`CUSTOM_FACTOR_*` message strings move with their own groups.

`recalculateInputSchema`, `type RecalculateInput`, `type RecalculateResult`
stay imported from `lib/validation/emissions.ts` unchanged (see below) — only
the action functions move, not the schemas.

## `lib/validation/emissions.ts` does **not** move — "or not at all," taken

The review's own note says this file "splits along the same three lines and
should move in the same change or not at all." Read from the file, not
assumed: **`lib/validation/emissions.ts` has 25 importers**
(`grep -rl "validation/emissions"`), spanning `lib/domain/{emissions,defra,gwp,
factor-import}.ts`, `lib/domain/*.test.ts`, five `lib/db/*-queries.ts` modules,
`lib/db/schema.ts`, `lib/validation/{activity,targets}.ts`, and six
`app/_components/activity/*` client leaves — not only the three actions groups.
Most of that traffic is against the file's **first half**: `EMISSION_SCOPES`,
`SCOPE3_CATEGORIES` and their labels, `SCOPE2_METHODS`, `SCOPE2_MARKET_BASES`,
`GWP_SETS`, `GHG_GASES`, `CH4_VARIANTS`, `FACTOR_RESULT_UNITS`,
`FACTOR_ACTIVITY_UNITS` — shared domain vocabulary the calculation engine, the
DEFRA importer and the schema itself all depend on, not something owned by one
of the three action groups. Only the back half — the six schemas and their
result types (`recalculateInputSchema`, `newFactorSetSchema` /
`existingFactorSetSchema` / `factorSetChoiceSchema`, `customFactorSchema` /
`createCustomFactorSchema`, `importCustomFactorsSchema`,
`retireCustomFactorSchema`, `editFactorSetSchema`, `retireFactorSetSchema`) maps
cleanly onto the three action groups, and cutting only that half out from under
25 importers — some of which need both halves — is not the "same three lines"
the review describes; it is a second, differently-shaped refactor. This prompt
takes the escape hatch the review itself names: **split the actions, leave the
validation file whole**, and records that choice rather than silently doing
half of what candidate 4 described.

## Call sites to update

Only the two moved groups change their import path — the import flow's five
components keep importing from `../../activity/actions` unchanged.

- **`app/_components/activity/factor-picker.tsx`** —
  `import { setFactorMapping } from "../../activity/actions"` →
  `"../../activity/mappings/actions"`.
- **`app/_components/activity/custom-factor-form.tsx`** — `createCustomFactor`
  → `"../../activity/factors/actions"`.
- **`app/_components/activity/factor-import-form.tsx`** — `importCustomFactors`
  → `"../../activity/factors/actions"`.
- **`app/_components/activity/retire-factor-button.tsx`** —
  `retireCustomFactor` → `"../../activity/factors/actions"`.
- **`app/_components/activity/factor-set-form.tsx`** — `editFactorSet` →
  `"../../activity/factors/actions"`.
- **`app/_components/activity/retire-set-button.tsx`** — `retireFactorSet` →
  `"../../activity/factors/actions"`.

## Deliberately unchanged

- **`lib/validation/emissions.ts`** — see above.
- **`app/activity/mappings/page.tsx`** and **`app/activity/factors/page.tsx`**
  — Server Components reading through `lib/db/`; neither imports `actions.ts`
  directly today (confirmed by `grep`) and neither needs to change.
- **`app/api/cron/recalculate/sweep.ts`** — its comment names
  `app/activity/actions.ts` in prose; the recalculation it triggers stays in
  that file, so the comment stays accurate. Verify at implementation time and
  correct the comment only if this split moves what it refers to.
- Every message string, every limiter, every authorisation check, every
  `revalidatePath` call — copied verbatim into their new file, not
  rewritten.
- Candidate 5's rate-limit policy table and candidate 6's boundary shell —
  untouched.

## Measurements the implementation must hit

No numeric target beyond equivalence — say so rather than inventing one.

1. **`wc -l` before and after** for `app/activity/actions.ts` and the two new
   files, reported as measured, not estimated.
2. **A per-export equivalence table**: all 11 exports, their new file, and
   confirmation the message strings, limiter, and `revalidatePath` targets are
   byte-identical to what is on disk today.
3. **`grep -rl "activity/actions"` and `grep -rl "activity/mappings/actions\|activity/factors/actions"`**
   run after the change, to confirm every caller resolved above points at the
   right file and nothing still imports a moved export from the old path.
4. `lib/validation/emissions.ts`'s importer count (25) quoted again after the
   change, to confirm it is unchanged — the file is not touched.

## Prerender impact

**none — no route changes.** `/activity`, `/activity/[importId]`,
`/activity/mappings` and `/activity/factors` are all authenticated routes
already outside prerendering; this only moves `"use server"` files between
directories. Verify, don't assume: run `npm run build` and confirm the route
table is unchanged, then run the two-build prerender diff from
`docs/automation.md` — expect byte-identical marketing-route HTML, since
nothing under `app/activity/` touches a client bundle any prerendered page
imports.

## Trust boundary

Unchanged at all 11 call sites. Every gate still resolves the session and
organisation server-side, still enforces the deletion lock and the limiter
candidate 3 collapsed into `resolveTenant`, still authorises inside the
action rather than in the component, and still returns a typed
`{ ok: false, error }` — never a throw. Nothing about what crosses from the
browser changes; this prompt only moves which file the check lives in.

## Secrets and data

Reads no environment variable directly. The moved code still reaches
`lib/rate-limit/` (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) and
`lib/auth/tenant.ts` (the Better Auth secret, indirectly) exactly as before.
No `NEXT_PUBLIC_*` involved. No personal data is stored, transmitted or logged
by this change, and the existing bare `catch {}` blocks and the "nothing is
ever logged" rule in the file's own docblock (AGENTS.md §8.3 rule 2) carry
over verbatim into all three files.

## Non-goals

- **`lib/validation/emissions.ts`** stays whole — see above.
- **Candidate 5's policy table** — `lib/rate-limit/` is untouched.
- **Candidate 6's boundary shell** — blocked on the open design question.
- Any change to a message a user reads, a limiter's window or key, or a
  `revalidatePath` target.
- Any change to `app/activity/mappings/page.tsx` or
  `app/activity/factors/page.tsx` beyond what colocating `actions.ts` requires
  (none is expected).

## Checks

| check | expectation |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | unchanged pass count (318, per prompt 122's record) — nothing in scope is under `lib/{domain,validation}` |
| `npm run build` | route table unchanged |
| prerender diff | byte-identical, per `docs/automation.md` |
| `npm run test:e2e` | Chromium and Firefox exercising the activity/mappings/factors flows; WebKit reported as the standing environment gap (Podman/Playwright fixture issue recorded at prompts 122–124), never claimed as a pass |

## Where the result is recorded

**`docs/architecture.md`** — tick candidate 4 in the landed table at the foot
of the file, and add a **"Prompt 125 — the record"** section beside prompts
121/122's: the per-export equivalence table, the measured line counts, the
`grep` call-site confirmation, and the reasoning for leaving
`lib/validation/emissions.ts` whole (quoted above, with the actual 25-importer
list). `docs/backend.md` gets no cross-reference — no message, schema or
behaviour changes. Nothing is added to `AGENTS.md` — `docs/architecture.md` is
already indexed and this introduces no site-wide invariant.

## SKILLS USED

- **`nextjs`** — Server Actions in Next 16: a `"use server"` module's runtime
  exports must all be async entry points, which constrains how `setChoiceFrom`
  and `stageRows` (non-exported helpers) move with `factors/actions.ts` rather
  than becoming exports of their own. Loaded while writing this prompt.
- **`zod-docs`** — not for a new schema; only to confirm `safeParse` call sites
  and `fieldErrorsFrom` usage are unaffected by which file imports the schema.
- **`drizzle-docs`** — `None expected` — every `lib/db/*-queries.ts` call in
  the moved code is copied verbatim; invoke only if a query import needs to
  change, which this prompt says it must not.
- **`upstash-ratelimit-js`** — `None expected` — the limiter functions and
  their windows are copied verbatim from `lib/rate-limit/`; invoke only if a
  policy needs re-checking, which candidate 5 (not this prompt) owns.

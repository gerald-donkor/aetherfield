import "server-only";

import { eq, isNull, or } from "drizzle-orm";

import { emissionFactor } from "./schema";
import { factorMatchSourceText } from "../domain/factor-match";

/**
 * The two things every factor read needs before it can scope or name a row —
 * which rows this tenant may see, and how one is described.
 *
 * **This module is the seam prompt 119's split turns on.** Build step 10 put
 * every factor and emission read in one 2,571-line `emission-queries.ts`, and
 * the paragraph below was that file's module docblock. Splitting it along its
 * eight edit reasons left the predicate needed by five of them, so the
 * predicate and the paragraph that explains it moved here together rather than
 * being scattered or restated. `docs/backend.md`, build step 10, records the
 * map.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so `app/activity/actions.ts` and the pages under `app/activity/` go
 * through the modules that import this one and nowhere else.
 *
 * ---
 *
 * ## The tenant predicate, and the one place it is not a plain equality
 *
 * `activity_factor_mapping` and `activity_emission` are strictly tenant-scoped
 * and every predicate on them is `organization_id = $1`, exactly as
 * `activity-queries.ts` records.
 *
 * `emission_factor_set` and `emission_factor` are **reference data**, and their
 * `organization_id` is nullable: `null` is published data shared by every
 * tenant, non-null is a set a customer supplied. Every read of them therefore
 * filters
 *
 * ```sql
 * organization_id is null or organization_id = $1
 * ```
 *
 * which is the approved deviation from AGENTS.md 9.2 rule 6 — approved by the
 * user on 10 Aug 2026, with the rule amended in the same change to name
 * reference tables as its exception. **No cross-tenant read is possible**,
 * which is what rule 6 exists to guarantee: a tenant sees published rows and
 * its own, and no others.
 *
 * The predicate is written once, in {@link visibleFactorScope}, and **this
 * module is the only place `emissionFactor.organizationId` is compared for
 * visibility**, so no query in any importing module can be written that forgets
 * half of it. The strict `eq(emissionFactor.organizationId, id)` that appears in
 * `factor-queries.ts` and `factor-set-queries.ts` is a different question —
 * "this tenant's own rows, and not published ones" — and is not this predicate.
 *
 * ---
 *
 * **Nothing in this module or any importer of it logs.** Not an organisation
 * name, not a figure, not a row count — on no path and in no catch
 * (AGENTS.md 8.3 rule 2, extended to a customer's commercial data by 5.3).
 */

/**
 * Published reference data, or this organisation's own. Written once so no
 * query can filter on half of it — see the module docblock.
 *
 * **Exported for `report-evidence.ts` at prompt 99**, which joins
 * `emission_factor` too and had been stating no scope at all. That prompt kept it
 * inside `emission-queries.ts` because the module docblock there was what
 * explained it, and the predicate belongs beside the explanation; prompt 119
 * moved the two here together, for the same reason and with the same result — the
 * explanation is still the paragraph above it.
 *
 * **Safe inside a join condition as well as a `where`.** `or()` emits its
 * operands wrapped in literal parentheses for any arity above one — read from
 * `node_modules/drizzle-orm/sql/expressions/conditions.cjs` at prompt 99, not
 * assumed — so `and(x, visibleFactorScope(id))` composes as
 * `x and (… is null or … = $1)` and cannot widen the surrounding `AND`. That is
 * the same trap `coverage-queries.ts`'s `listFactorCoverage` warns about.
 */
export function visibleFactorScope(organizationId: string) {
  return or(
    isNull(emissionFactor.organizationId),
    eq(emissionFactor.organizationId, organizationId),
  );
}

/** The publisher's own description of a factor row, assembled the one way
    `listFactorMappings` already assembles it, so the picker, the coverage list
    and the calculation seam all name a row identically. **Exported at prompt
    119**, because three of the split modules assemble a label and a second copy
    of this alias is the divergence it exists to prevent. */
export const factorLabelOf = factorMatchSourceText;

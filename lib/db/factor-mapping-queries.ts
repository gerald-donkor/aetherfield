import "server-only";

import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";

import { getDb } from "./client";
import {
  activityFactorMapping,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import { visibleFactorScope } from "./factor-scope";
import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import { preferredBySourceRow } from "../domain/factor-selection";
import type {
  Scope2MarketBasis,
  Scope2Method,
} from "../validation/emissions";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("factor-mapping-queries");

/**
 * `activity_factor_mapping` — choosing the factor for a `(category, unit)` pair,
 * and seeding an organisation's defaults.
 *
 * One of the eight edit reasons prompt 119 split `emission-queries.ts` along.
 * The two writes are deliberately different: a set overwrites a reporter's
 * choice because it *is* the reporter's choice, and a seed never does. What is
 * mapped is read back by `coverage-queries.ts`; what a mapping resolves to is
 * `emission-queries.ts`'s. The visibility predicate and the no-logging rule are
 * `factor-scope.ts`'s.
 */

/**
 * Sets the organisation's factor for one `(category, unit)` pair.
 *
 * **`deleted_at` is cleared, and that is required for correctness rather than
 * tidiness.** The lane's unique index does not filter on `deleted_at`
 * (`lib/db/schema.ts`), so a soft-deleted row still occupies its slot: an
 * upsert that left `deleted_at` set would resurrect nothing and re-mapping the
 * pair would keep failing the conflict silently. Prompt 65 sets and changes a
 * mapping and deliberately offers no unmap — what a removed mapping means is a
 * decision of its own.
 *
 * **Two indexes, so two conflict targets** (prompt 85). The default lane
 * conflicts on `(organization_id, category, unit) where scope2_method is
 * null` and the market lane on the four-column index; Postgres infers a
 * *partial* index only when the statement repeats its predicate, so
 * `targetWhere` is not decoration — without it the statement matches no index
 * and raises rather than upserting.
 *
 * **This is a `set`, not a `seed`.** `seedDefaultMappings` refuses to overwrite
 * a reporter's own choice, for the reason its docblock records; this *is* the
 * reporter's own choice, made deliberately, so it overwrites.
 */
export const setFactorMapping = safe("setFactorMapping", setFactorMappingImpl);

async function setFactorMappingImpl(input: {
  organizationId: string;
  category: ActivityCategory;
  unit: ActivityUnit;
  factorId: string;
  /** `null` is the default lane; `"market_based"` is the second scope 2 lane. */
  lane: Scope2Method | null;
  /** Which rung the market lane asserts — prompt 86. Null on the default lane.
      **Part of the updated row, not of the conflict target**: a pair has one
      market-lane mapping and changing its basis changes that mapping rather
      than adding a second one. The four-column index is unchanged and still
      the one inferred. */
  marketBasis: Scope2MarketBasis | null;
  /** The person who chose it, for the provenance line. */
  userId: string;
}): Promise<void> {
  const set = {
    factorId: input.factorId,
    scope2MarketBasis: input.marketBasis,
    createdBy: input.userId,
    updatedAt: new Date(),
    deletedAt: null,
  };

  const insert = getDb()
    .insert(activityFactorMapping)
    .values({
      organizationId: input.organizationId,
      category: input.category,
      unit: input.unit,
      scope2Method: input.lane,
      scope2MarketBasis: input.marketBasis,
      factorId: input.factorId,
      createdBy: input.userId,
    });

  if (input.lane === null) {
    await insert.onConflictDoUpdate({
      target: [
        activityFactorMapping.organizationId,
        activityFactorMapping.category,
        activityFactorMapping.unit,
      ],
      targetWhere: sql`${activityFactorMapping.scope2Method} is null`,
      set,
    });
    return;
  }

  await insert.onConflictDoUpdate({
    target: [
      activityFactorMapping.organizationId,
      activityFactorMapping.category,
      activityFactorMapping.unit,
      activityFactorMapping.scope2Method,
    ],
    targetWhere: sql`${activityFactorMapping.scope2Method} is not null`,
    set,
  });
}

/**
 * Seeds an organisation's default `(category, unit)` mappings, if it has none.
 *
 * **Only if it has none.** Re-running must never overwrite a reporter's own
 * choice of factor — the defaults are a starting point, and a later
 * `ON CONFLICT DO UPDATE` would silently undo a deliberate override. Called
 * once, when an organisation first reaches the totals surface.
 *
 * `isNotNull` on the resolved factor is what keeps a default that names a
 * `source_row_id` the seeded set does not contain from inserting a broken row:
 * the join simply produces nothing for it.
 *
 * **Which set's copy of a row a default names is decided by
 * `preferredBySourceRow`, not by the order Postgres happens to return.** Two
 * published DESNZ sets are loaded, so every default's `source_row_id` matches a
 * row in each; before prompt 70 the last row of an unordered result won, and
 * two otherwise identical organisations could show a different dataset version
 * for the same default. Resolution is unaffected either way — prompt 68's path
 * follows the mapped row's siblings when its own window does not cover the
 * date — so this is which provenance a reporter sees, not which figure is
 * filed.
 */
export const seedDefaultMappings = safe("seedDefaultMappings", seedDefaultMappingsImpl);

async function seedDefaultMappingsImpl(
  organizationId: string,
  defaults: readonly { category: ActivityCategory; unit: ActivityUnit; sourceRowId: string }[],
): Promise<{ inserted: number }> {
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ n: sql<number>`1` })
      .from(activityFactorMapping)
      .where(
        and(
          eq(activityFactorMapping.organizationId, organizationId),
          /* The defaults are default-lane rows, so it is the default lane that
             decides whether they have already been seeded. An organisation
             holding only a market-based mapping has not been seeded. */
          isNull(activityFactorMapping.scope2Method),
        ),
      )
      .limit(1);
    if (existing) return { inserted: 0 };

    const wanted = defaults.map((d) => d.sourceRowId);
    if (wanted.length === 0) return { inserted: 0 };

    const factors = await tx
      .select({
        id: emissionFactor.id,
        sourceRowId: emissionFactor.sourceRowId,
        setId: emissionFactorSet.id,
        setOrganizationId: emissionFactorSet.organizationId,
        publicationYear: emissionFactorSet.publicationYear,
        setCreatedAt: emissionFactorSet.createdAt,
      })
      .from(emissionFactor)
      .innerJoin(
        emissionFactorSet,
        eq(emissionFactorSet.id, emissionFactor.setId),
      )
      .where(
        and(
          inArray(emissionFactor.sourceRowId, wanted),
          isNull(emissionFactor.deletedAt),
          isNull(emissionFactorSet.deletedAt),
          isNull(emissionFactorSet.supersededBySetId),
          visibleFactorScope(organizationId),
          isNotNull(emissionFactor.id),
        ),
      );

    const byRowId = preferredBySourceRow(factors);
    const values = defaults
      .map((d) => {
        const factorId = byRowId.get(d.sourceRowId)?.id;
        return factorId
          ? { organizationId, category: d.category, unit: d.unit, factorId }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (values.length === 0) return { inserted: 0 };

    await tx.insert(activityFactorMapping).values(values);
    return { inserted: values.length };
  });
}

import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { getDb } from "./client";
import {
  activityFactorMapping,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import type { EditFactorSetInput } from "../validation/emissions";
import { queryErrorScope, readSqlState } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("factor-set-queries");

/**
 * `emission_factor_set` — the catalogue reads and the set lifecycle.
 *
 * Two of the eight edit reasons prompt 119 split `emission-queries.ts` along,
 * kept together because they are one table and one surface: what a set says
 * about its provenance, and correcting or retiring it. The tenant predicate and
 * the no-logging rule are `factor-scope.ts`'s, which this module's reads follow.
 */

/* -------------------------------------------------------------------------- */
/*  Factor sets                                                                */
/* -------------------------------------------------------------------------- */

export type ListedFactorSet = {
  id: string;
  source: string;
  datasetVersion: string;
  publicationYear: number;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  factorCount: number;
};

/**
 * The factor sets an organisation can see, newest publication first.
 *
 * Read by the totals surface so the **attribution** can be rendered from the
 * data rather than hard-coded in a component — the Open Government Licence
 * requires it, and a second dataset would make a hard-coded line wrong.
 *
 * Superseded sets are excluded: a superseded set's rows stay readable through
 * an existing `activity_emission.factor_id`, so an old figure still re-derives,
 * but the set is no longer offered as current.
 */
export const listFactorSets = safe("listFactorSets", listFactorSetsImpl);

async function listFactorSetsImpl(
  organizationId: string,
): Promise<ListedFactorSet[]> {
  return getDb()
    .select({
      id: emissionFactorSet.id,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      publicationYear: emissionFactorSet.publicationYear,
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
      /**
       * **A correlated subquery has to qualify both sides by hand, and
       * Drizzle's column interpolation does not** — found at prompt 82, and it
       * had been silently answering zero.
       *
       * `${emissionFactor.setId}` renders as a bare `"set_id"` inside a raw
       * `sql` fragment, not as `"emission_factor"."set_id"`, and
       * `${emissionFactorSet.id}` renders as a bare `"id"`. Inside the
       * subquery, Postgres resolves both against the innermost scope, so the
       * predicate became `emission_factor.set_id = emission_factor.id` — never
       * true, no error, and every set on `/activity/factors` reported **0
       * active** while the table held thousands of rows.
       *
       * Aliasing the inner table and naming the outer one is what makes each
       * reference unambiguous. The same correction is applied to the two
       * sibling subqueries below.
       */
      factorCount: sql<number>`(
        select count(*)::int from ${emissionFactor} f
        where f.set_id = ${emissionFactorSet}.id
          and f.deleted_at is null
      )`,
    })
    .from(emissionFactorSet)
    .where(
      and(
        or(
          isNull(emissionFactorSet.organizationId),
          eq(emissionFactorSet.organizationId, organizationId),
        ),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
      ),
    )
    .orderBy(sql`${emissionFactorSet.publicationYear} desc`);
}

export type FactorGasBasis = (typeof emissionFactorSet.gasBasis)["_"]["data"];

export type TenantFactorSet = ListedFactorSet & {
  effectiveFrom: string;
  effectiveTo: string;
  notes: string | null;
  gasBasis: FactorGasBasis;
  createdAt: Date;
  deletedAt: Date | null;
};

export const listTenantFactorSets = safe("listTenantFactorSets", listTenantFactorSetsImpl);

async function listTenantFactorSetsImpl(
  organizationId: string,
): Promise<TenantFactorSet[]> {
  return getDb()
    .select({
      id: emissionFactorSet.id,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      publicationYear: emissionFactorSet.publicationYear,
      effectiveFrom: emissionFactorSet.effectiveFrom,
      effectiveTo: emissionFactorSet.effectiveTo,
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
      notes: emissionFactorSet.notes,
      gasBasis: emissionFactorSet.gasBasis,
      createdAt: emissionFactorSet.createdAt,
      deletedAt: emissionFactorSet.deletedAt,
      /* `and deleted_at is null`, matching `listFactorSets` above. Without it
         `/activity/factors` counted retired rows and `/activity/mappings` did
         not, so the two surfaces disagreed about the same set. The aliasing is
         prompt 82's correction — see `listFactorSets` for what a bare column
         reference does inside a correlated subquery. */
      factorCount: sql<number>`(
        select count(*)::int from ${emissionFactor} f
        where f.set_id = ${emissionFactorSet}.id
          and f.deleted_at is null
      )`,
    })
    .from(emissionFactorSet)
    .where(eq(emissionFactorSet.organizationId, organizationId))
    .orderBy(desc(emissionFactorSet.createdAt));
}

/* -------------------------------------------------------------------------- */
/*  A set's lifecycle                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What correcting a set can answer with besides success.
 *
 * Both refusals are **expected outcomes, not exceptions** (AGENTS.md 10 rule 2):
 * the action turns each into a typed field error, so a throw from here is a bug.
 */
export type UpdateTenantFactorSetOutcome =
  | { ok: true }
  | { ok: false; reason: "set_not_found" }
  | { ok: false; reason: "set_exists" };

/**
 * Corrects one tenant-owned set's provenance and applicability — prompt 84.
 *
 * **The set id is a claim, not a capability.** It is re-read inside the
 * transaction under `organization_id = $1` — which is non-null, so a published
 * set is not addressable at all — and `deleted_at is null`. A missing, retired,
 * published or foreign id is one indistinguishable `set_not_found`, exactly as
 * {@link resolveWritableSet} and {@link getVisibleFactor} treat theirs. No
 * existence oracle (decision 6).
 *
 * **`gas_basis` is not writable here** (decision 2): the basis is derived from
 * the rows, and editing it would relabel every stored row's meaning without
 * touching a row.
 *
 * **The unique violation is caught, not pre-checked.** Drizzle's `update` has no
 * conflict clause — only `insert` carries `onConflictDoNothing` — so the
 * `(organization_id, source, dataset_version)` collision is answered by reading
 * the driver's SQLSTATE off the throw. A select before the update would lose the
 * race with a concurrent create, and losing that race is what the catch is for.
 * The catch sits **outside** the transaction on purpose: the failed statement has
 * already aborted it, so returning a value from inside would try to commit an
 * aborted transaction.
 */
export const updateTenantFactorSet = safe("updateTenantFactorSet", updateTenantFactorSetImpl);

/** Postgres' `unique_violation` (Appendix A). */
const UNIQUE_VIOLATION = "23505";

async function updateTenantFactorSetImpl(input: {
  organizationId: string;
  data: EditFactorSetInput;
}): Promise<UpdateTenantFactorSetOutcome> {
  const data = input.data;

  try {
    return await getDb().transaction(async (tx) => {
      const [set] = await tx
        .select({ id: emissionFactorSet.id })
        .from(emissionFactorSet)
        .where(
          and(
            eq(emissionFactorSet.id, data.setId),
            eq(emissionFactorSet.organizationId, input.organizationId),
            isNull(emissionFactorSet.deletedAt),
          ),
        )
        .limit(1);

      if (!set) return { ok: false as const, reason: "set_not_found" as const };

      const rows = await tx
        .update(emissionFactorSet)
        .set({
          source: data.source,
          datasetVersion: data.datasetVersion,
          publicationYear: data.publicationYear,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
          licence: data.licence,
          licenceUrl: data.licenceUrl ?? null,
          sourceUrl: data.sourceUrl ?? null,
          sourceReference: data.sourceReference ?? null,
          notes: data.notes ?? null,
        })
        .where(
          and(
            eq(emissionFactorSet.id, set.id),
            eq(emissionFactorSet.organizationId, input.organizationId),
            isNull(emissionFactorSet.deletedAt),
          ),
        )
        .returning({ id: emissionFactorSet.id });

      /* Retired between the read and the write. The same answer the read gives,
         so the two orderings are indistinguishable from outside. */
      if (rows.length === 0) {
        return { ok: false as const, reason: "set_not_found" as const };
      }
      return { ok: true as const };
    });
  } catch (error) {
    if (readSqlState(error) === UNIQUE_VIOLATION) {
      return { ok: false, reason: "set_exists" };
    }
    throw error;
  }
}

/**
 * Soft-retires one tenant-owned factor set and **reports what it cost**.
 *
 * **It does not cascade to the set's rows** (decision 4). Every read path
 * already excludes a retired set's rows through the set join, so writing
 * `deleted_at` onto each row would add a second source of truth for one fact and
 * make an un-retire a per-row repair rather than one update. The rows stay live
 * and the surface says so.
 *
 * Both counts are taken **inside the same transaction as the update**, for the
 * reason {@link retireTenantFactor} records: a count read before the write can
 * be stale by the time the write lands.
 */
export const retireTenantFactorSet = safe("retireTenantFactorSet", retireTenantFactorSetImpl);

async function retireTenantFactorSetImpl(input: {
  organizationId: string;
  setId: string;
}): Promise<
  | { retired: false }
  | { retired: true; mappingCount: number; factorCount: number }
> {
  return getDb().transaction(async (tx) => {
    /* Active mappings pointing at any live row of the set. Both sides carry the
       tenant predicate and both filter `deleted_at is null`. */
    const [mapped] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(activityFactorMapping)
      .innerJoin(
        emissionFactor,
        eq(emissionFactor.id, activityFactorMapping.factorId),
      )
      .where(
        and(
          eq(emissionFactor.setId, input.setId),
          eq(emissionFactor.organizationId, input.organizationId),
          isNull(emissionFactor.deletedAt),
          eq(activityFactorMapping.organizationId, input.organizationId),
          isNull(activityFactorMapping.deletedAt),
        ),
      );

    const [factors] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(emissionFactor)
      .where(
        and(
          eq(emissionFactor.setId, input.setId),
          eq(emissionFactor.organizationId, input.organizationId),
          isNull(emissionFactor.deletedAt),
        ),
      );

    const rows = await tx
      .update(emissionFactorSet)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(emissionFactorSet.id, input.setId),
          eq(emissionFactorSet.organizationId, input.organizationId),
          isNull(emissionFactorSet.deletedAt),
        ),
      )
      .returning({ id: emissionFactorSet.id });

    if (rows.length === 0) return { retired: false };
    return {
      retired: true,
      mappingCount: mapped?.count ?? 0,
      factorCount: factors?.count ?? 0,
    };
  });
}

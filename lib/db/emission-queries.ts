import "server-only";

import { createHash } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";

import { user } from "./auth-schema";
import { getDb, type Db } from "./client";
import {
  activityEmission,
  activityFactorMapping,
  activityRecord,
  emissionFactor,
  emissionFactorLabelSql,
  emissionFactorSet,
} from "./schema";
import type { ActivityCategory, ActivityUnit } from "../validation/activity";
import { DEFAULT_FACTOR_MAPPINGS } from "../domain/defra";
import {
  factorMatchSourceText,
} from "../domain/factor-match";
import {
  admissibleFactorUnits,
  aggregate,
  toStoredKgCo2e,
  type ActivityInput,
  type FactorInput,
  type FactorResolution,
  type FactorResolver,
} from "../domain/emissions";
import {
  factorSiblingKeys,
  preferredBySourceRow,
  selectFactorForDate,
  type FactorCandidate,
  type FactorRowIdentity,
} from "../domain/factor-selection";
import type { CreateCustomFactorInput } from "../validation/emissions";

/**
 * Every read and write of the four factor and emission tables — build step 10.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so `app/activity/actions.ts` and the pages under `app/activity/` go
 * through here and nowhere else.
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
 * The predicate is written once, in {@link visibleFactorScope}, so no query
 * below can be written that forgets half of it.
 *
 * ---
 *
 * **Nothing here logs.** Not an organisation name, not a figure, not a row
 * count — on no path and in no catch (AGENTS.md 8.3 rule 2, extended to a
 * customer's commercial data by 5.3).
 */

/** Rows per `INSERT`. Postgres caps a statement at 65,535 bound parameters and
    a computed emission binds thirteen columns, so 500 rows is ~6,500 — the
    same batch size and the same reasoning `activity-queries.ts` records. */
const INSERT_BATCH = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Published reference data, or this organisation's own. Written once so no
    query can filter on half of it — see the module docblock. */
function visibleFactorScope(organizationId: string) {
  return or(
    isNull(emissionFactor.organizationId),
    eq(emissionFactor.organizationId, organizationId),
  );
}

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
export async function listFactorSets(
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
      factorCount: sql<number>`(
        select count(*)::int from ${emissionFactor}
        where ${emissionFactor.setId} = ${emissionFactorSet.id}
          and ${emissionFactor.deletedAt} is null
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

export type TenantFactorRow = {
  id: string;
  setId: string;
  label: string;
  publishedUom: string;
  publishedGhgUnit: string;
  scope: FactorInput["scope"];
  scope3Category: FactorInput["scope3Category"];
  scope2Method: FactorInput["scope2Method"];
  activityUnit: FactorInput["activityUnit"];
  resultUnit: FactorInput["resultUnit"];
  gas: FactorInput["gas"];
  ch4Variant: FactorInput["ch4Variant"];
  gwpSet: FactorInput["gwpSet"];
  region: string | null;
  biogenic: boolean;
  value: string;
  /** Active `(category, unit)` mappings pointing at this row. Retiring it
      leaves that many pairs unmapped, which is what the surface must say
      before the click (prompt 67 finding 2). */
  mappingCount: number;
  createdAt: Date;
  deletedAt: Date | null;
};

export async function listTenantFactorSets(
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
         not, so the two surfaces disagreed about the same set. */
      factorCount: sql<number>`(
        select count(*)::int from ${emissionFactor}
        where ${emissionFactor.setId} = ${emissionFactorSet.id}
          and ${emissionFactor.deletedAt} is null
      )`,
    })
    .from(emissionFactorSet)
    .where(eq(emissionFactorSet.organizationId, organizationId))
    .orderBy(desc(emissionFactorSet.createdAt));
}

export async function listTenantFactors(
  organizationId: string,
): Promise<TenantFactorRow[]> {
  const rows = await getDb()
    .select({
      id: emissionFactor.id,
      setId: emissionFactor.setId,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      publishedGhgUnit: emissionFactor.publishedGhgUnit,
      scope: emissionFactor.scope,
      scope3Category: emissionFactor.scope3Category,
      scope2Method: emissionFactor.scope2Method,
      activityUnit: emissionFactor.activityUnit,
      resultUnit: emissionFactor.resultUnit,
      gas: emissionFactor.gas,
      ch4Variant: emissionFactor.ch4Variant,
      gwpSet: emissionFactor.gwpSet,
      region: emissionFactor.region,
      biogenic: emissionFactor.biogenic,
      value: emissionFactor.value,
      /* One correlated subquery rather than a second round trip per row. */
      mappingCount: sql<number>`(
        select count(*)::int from ${activityFactorMapping}
        where ${activityFactorMapping.factorId} = ${emissionFactor.id}
          and ${activityFactorMapping.organizationId} = ${organizationId}
          and ${activityFactorMapping.deletedAt} is null
      )`,
      createdAt: emissionFactor.createdAt,
      deletedAt: emissionFactor.deletedAt,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(emissionFactor.organizationId, organizationId),
        eq(emissionFactorSet.organizationId, organizationId),
      ),
    )
    .orderBy(desc(emissionFactor.createdAt));

  return rows.map((row) => ({
    id: row.id,
    setId: row.setId,
    label: factorLabelOf([row.level2, row.level3, row.columnText]),
    publishedUom: row.publishedUom,
    publishedGhgUnit: row.publishedGhgUnit,
    scope: row.scope,
    scope3Category: row.scope3Category,
    scope2Method: row.scope2Method,
    activityUnit: row.activityUnit,
    resultUnit: row.resultUnit,
    gas: row.gas,
    ch4Variant: row.ch4Variant,
    gwpSet: row.gwpSet,
    region: row.region,
    biogenic: row.biogenic,
    value: row.value,
    mappingCount: row.mappingCount,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  }));
}

function normaliseHashPart(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The row's identity inside its set, as a stable hash.
 *
 * **Keyed on the resolved `setId`, not on the typed source and version** —
 * prompt 66 hashed the two set columns, which do not exist on a submission that
 * chooses an existing set. The set is the same thing either way, and
 * `(set_id, source_row_id)` is the unique index this backs, so the id is the
 * honest key. It is what makes a double submission idempotent rather than a
 * second identical row.
 */
function sourceRowIdForCustomFactor(
  organizationId: string,
  setId: string,
  input: CreateCustomFactorInput,
): string {
  const identity = [
    organizationId,
    setId,
    input.factor.level1,
    input.factor.level2,
    input.factor.level3,
    input.factor.level4,
    input.factor.columnText,
    input.factor.publishedUom,
    input.factor.scope,
    input.factor.scope3Category,
    input.factor.scope2Method,
    input.factor.activityUnit,
    input.factor.gas,
    input.factor.ch4Variant,
    input.factor.gwpSet,
    input.factor.region,
    input.factor.biogenic ? "biogenic" : "non-biogenic",
    input.factor.value,
  ].map(normaliseHashPart);

  /* **Appended only when declared** (prompt 71). Two rows identical in every
     other field but restating different published rows are different rows, and
     without the pair here they collide on `(set_id, source_row_id)` and the
     `onConflictDoNothing` below discards the second in silence. Appending it
     unconditionally would instead move the hash of every non-superseding
     submission, so a row created before this change would re-submit as a
     duplicate rather than as the idempotent no-op it gets today. */
  if (input.factor.supersedes) {
    identity.push(
      normaliseHashPart(input.factor.supersedes.source),
      normaliseHashPart(input.factor.supersedes.sourceRowId),
    );
  }

  return `custom:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

/**
 * What a create can answer with besides success.
 *
 * The three refusals are **expected outcomes, not exceptions** — the action
 * turns each into a typed field error (AGENTS.md 10 rule 2), so a thrown error
 * from here is a bug rather than a validation result.
 */
export type CreateTenantFactorOutcome =
  | { ok: true; factorId: string }
  | { ok: false; reason: "set_exists" }
  | { ok: false; reason: "set_not_found" }
  | { ok: false; reason: "gas_basis_mismatch"; setGasBasis: FactorGasBasis };

/**
 * Writes one tenant-owned factor row into a tenant-owned set.
 *
 * **The set is the submitter's explicit choice** (prompt 67 decision 1): an
 * existing set is re-read under the tenant predicate — a missing, retired or
 * foreign id is one indistinguishable `set_not_found`, exactly as
 * {@link getVisibleFactor} treats a foreign factor id — and a new set is
 * inserted, with the `(source, dataset_version)` collision answered as
 * `set_exists` rather than silently reusing the stored set and discarding the
 * licence, effective range and references the submission carried.
 *
 * **`gas_basis` is derived, never asked** (decision 6): `co2e` is a combined
 * figure, every other gas is a per-gas sibling. A set holds one basis, so a row
 * of the other kind cannot go into it and is refused rather than mislabelled
 * (decision 7).
 */
export async function createTenantFactor(input: {
  organizationId: string;
  data: CreateCustomFactorInput;
}): Promise<CreateTenantFactorOutcome> {
  const setInput = input.data.set;
  const factorInput = input.data.factor;
  const derivedGasBasis: FactorGasBasis =
    factorInput.gas === "co2e" ? "combined_co2e" : "per_gas";

  return getDb().transaction(async (tx) => {
    let set: { id: string; gasBasis: FactorGasBasis } | undefined;

    if (setInput.mode === "existing") {
      /* A submitted set id is a claim, not a capability. */
      [set] = await tx
        .select({ id: emissionFactorSet.id, gasBasis: emissionFactorSet.gasBasis })
        .from(emissionFactorSet)
        .where(
          and(
            eq(emissionFactorSet.id, setInput.setId),
            eq(emissionFactorSet.organizationId, input.organizationId),
            isNull(emissionFactorSet.deletedAt),
          ),
        )
        .limit(1);

      if (!set) return { ok: false, reason: "set_not_found" };
    } else {
      [set] = await tx
        .insert(emissionFactorSet)
        .values({
          organizationId: input.organizationId,
          source: setInput.source,
          datasetVersion: setInput.datasetVersion,
          publicationYear: setInput.publicationYear,
          effectiveFrom: setInput.effectiveFrom,
          effectiveTo: setInput.effectiveTo,
          licence: setInput.licence,
          licenceUrl: setInput.licenceUrl ?? null,
          sourceUrl: setInput.sourceUrl ?? null,
          sourceReference: setInput.sourceReference ?? null,
          retrievedAt: new Date(),
          gasBasis: derivedGasBasis,
          notes: setInput.notes ?? null,
        })
        .onConflictDoNothing({
          target: [
            emissionFactorSet.organizationId,
            emissionFactorSet.source,
            emissionFactorSet.datasetVersion,
          ],
          where: sql`${emissionFactorSet.organizationId} is not null`,
        })
        .returning({
          id: emissionFactorSet.id,
          gasBasis: emissionFactorSet.gasBasis,
        });

      /* Nothing inserted means the set already exists — including the race
         where a concurrent submission created it a moment ago, which gets the
         same answer rather than diverging. */
      if (!set) return { ok: false, reason: "set_exists" };
    }

    if (set.gasBasis !== derivedGasBasis) {
      return {
        ok: false,
        reason: "gas_basis_mismatch",
        setGasBasis: set.gasBasis,
      };
    }

    const sourceRowId = sourceRowIdForCustomFactor(
      input.organizationId,
      set.id,
      input.data,
    );
    const [inserted] = await tx
      .insert(emissionFactor)
      .values({
        setId: set.id,
        organizationId: input.organizationId,
        sourceRowId,
        /* A claim, not a capability: every read of the pair runs under
           `visibleFactorScope`, so it can only ever resolve to published data or
           this tenant's own rows. */
        supersedesSource: factorInput.supersedes?.source ?? null,
        supersedesSourceRowId: factorInput.supersedes?.sourceRowId ?? null,
        level1: factorInput.level1 ?? null,
        level2: factorInput.level2 ?? null,
        level3: factorInput.level3 ?? null,
        level4: factorInput.level4 ?? null,
        columnText: factorInput.columnText ?? null,
        publishedUom: factorInput.publishedUom,
        publishedGhgUnit: factorInput.publishedGhgUnit,
        scope: factorInput.scope,
        scope3Category: factorInput.scope3Category ?? null,
        scope2Method: factorInput.scope2Method ?? null,
        activityUnit: factorInput.activityUnit,
        resultUnit: "kg_co2e",
        gas: factorInput.gas,
        ch4Variant: factorInput.ch4Variant ?? null,
        gwpSet: factorInput.gwpSet,
        region: factorInput.region ?? null,
        biogenic: factorInput.biogenic,
        value: factorInput.value,
      })
      .onConflictDoNothing({
        target: [emissionFactor.setId, emissionFactor.sourceRowId],
      })
      .returning({ id: emissionFactor.id });

    if (inserted) return { ok: true, factorId: inserted.id };

    const [existing] = await tx
      .select({ id: emissionFactor.id })
      .from(emissionFactor)
      .where(
        and(
          eq(emissionFactor.organizationId, input.organizationId),
          eq(emissionFactor.setId, set.id),
          eq(emissionFactor.sourceRowId, sourceRowId),
        ),
      )
      .limit(1);

    if (!existing) tx.rollback();
    return { ok: true, factorId: existing.id };
  });
}

/**
 * Soft-retires one tenant-owned factor row and **reports what it cost**.
 *
 * Every join filters `deleted_at is null`, so a retired row's
 * `(category, unit)` pairs become unmapped at the next recalculation. Degrading
 * to a visible gap is the right failure mode; saying nothing is not, so the
 * count of active mappings that pointed at the row is taken **inside the same
 * transaction as the update** — a count read before it could be stale by the
 * time the row is retired.
 *
 * The mapping rows themselves are left in place: not soft-deleted, not
 * repointed (prompt 66 decision 6, prompt 67 decision 5). The coverage surface
 * already renders the gap, and historical `activity_emission` rows stay
 * re-derivable.
 */
export async function retireTenantFactor(input: {
  organizationId: string;
  factorId: string;
}): Promise<{ retired: false } | { retired: true; mappingCount: number }> {
  return getDb().transaction(async (tx) => {
    const [counted] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(activityFactorMapping)
      .where(
        and(
          eq(activityFactorMapping.factorId, input.factorId),
          eq(activityFactorMapping.organizationId, input.organizationId),
          isNull(activityFactorMapping.deletedAt),
        ),
      );

    const rows = await tx
      .update(emissionFactor)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(emissionFactor.id, input.factorId),
          eq(emissionFactor.organizationId, input.organizationId),
          isNull(emissionFactor.deletedAt),
        ),
      )
      .returning({ id: emissionFactor.id });

    if (rows.length === 0) return { retired: false };
    return { retired: true, mappingCount: counted?.count ?? 0 };
  });
}

/* -------------------------------------------------------------------------- */
/*  The mapping                                                                */
/* -------------------------------------------------------------------------- */

export type ResolvedMapping = {
  category: ActivityCategory;
  unit: ActivityUnit;
  factor: FactorInput;
  /** The publisher's own description of the chosen row, for the surface. */
  factorLabel: string;
  source: string;
  datasetVersion: string;
  /** The publisher's stable row id. **How a mapping travels to another year's
      set** (prompt 68): DEFRA republishes the same row under the same id each
      year, so "the factor this tenant chose, in the year the activity happened"
      is `(source, source_row_id)` looked up in that year's set. No schema change
      and no per-period mapping table. */
  sourceRowId: string;
  /** The chosen row's own set window, so {@link buildFactorResolver}'s fast
      path can answer without consulting a sibling. */
  effectiveFrom: string;
  effectiveTo: string;
};

/** A published row an organisation's mappings currently point at — the only
    rows a customer-supplied row has any reason to supersede. */
export type SupersedableRow = {
  source: string;
  sourceRowId: string;
  label: string;
  datasetVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
};

/**
 * The published rows this organisation's active mappings point at — prompt 71's
 * candidate list for a declared supersession.
 *
 * **Mapped and published, not every published row.** A supersession has an
 * effect only where a mapping already names the row, and the alternative is
 * offering thousands of DEFRA rows in a `<select>`. A row the organisation
 * supplied itself is excluded: `organization_id is null` on the set is the whole
 * filter, and a tenant row restating another tenant row is a link with no
 * meaning.
 *
 * Distinct on `(source, source_row_id)`, because eight seeded mappings
 * routinely share four rows.
 */
export async function listSupersedableRows(
  organizationId: string,
  db: Db = getDb(),
): Promise<SupersedableRow[]> {
  const rows = await db
    .selectDistinct({
      source: emissionFactorSet.source,
      sourceRowId: emissionFactor.sourceRowId,
      datasetVersion: emissionFactorSet.datasetVersion,
      effectiveFrom: emissionFactorSet.effectiveFrom,
      effectiveTo: emissionFactorSet.effectiveTo,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
    })
    .from(activityFactorMapping)
    .innerJoin(
      emissionFactor,
      eq(emissionFactor.id, activityFactorMapping.factorId),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        isNull(activityFactorMapping.deletedAt),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactor.organizationId),
      ),
    );

  return rows.map((row) => ({
    source: row.source,
    sourceRowId: row.sourceRowId,
    datasetVersion: row.datasetVersion,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    label:
      [row.level2, row.level3, row.columnText].filter(Boolean).join(" · ") ||
      row.sourceRowId,
  }));
}

/**
 * One visible factor row that shares a mapping's `(source, source_row_id)`.
 * **Loaded once per recalculation**, never per record.
 *
 * A `FactorCandidate` — the pure shape `lib/domain/factor-selection.ts` decides
 * over — plus the columns that say which mapping it belongs to: its own row
 * identity, and the published one a customer-supplied row declares it restates
 * (prompt 71). `factorSiblingKeys` turns the four into the keys the resolver
 * files it under.
 */
export type FactorSibling = FactorCandidate & FactorRowIdentity;

/**
 * Every `(category, unit)` this organisation has a factor for.
 *
 * Returned as a list rather than a map so the caller decides the key shape;
 * {@link buildFactorResolver} turns it into the pure `FactorResolver` the
 * engine takes. The engine never sees a database handle — that boundary is
 * AGENTS.md 6.2's, and this function is the seam.
 */
export async function listFactorMappings(
  organizationId: string,
  db: Db = getDb(),
): Promise<ResolvedMapping[]> {
  const rows = await db
    .select({
      category: activityFactorMapping.category,
      unit: activityFactorMapping.unit,
      id: emissionFactor.id,
      scope: emissionFactor.scope,
      scope3Category: emissionFactor.scope3Category,
      scope2Method: emissionFactor.scope2Method,
      gas: emissionFactor.gas,
      ch4Variant: emissionFactor.ch4Variant,
      gwpSet: emissionFactor.gwpSet,
      value: emissionFactor.value,
      activityUnit: emissionFactor.activityUnit,
      resultUnit: emissionFactor.resultUnit,
      biogenic: emissionFactor.biogenic,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      sourceRowId: emissionFactor.sourceRowId,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      effectiveFrom: emissionFactorSet.effectiveFrom,
      effectiveTo: emissionFactorSet.effectiveTo,
    })
    .from(activityFactorMapping)
    .innerJoin(
      emissionFactor,
      eq(emissionFactor.id, activityFactorMapping.factorId),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        isNull(activityFactorMapping.deletedAt),
        isNull(emissionFactor.deletedAt),
        visibleFactorScope(organizationId),
      ),
    );

  return rows.map((row) => ({
    category: row.category,
    unit: row.unit,
    factorLabel: [row.level2, row.level3, row.columnText]
      .filter(Boolean)
      .join(" · "),
    source: row.source,
    datasetVersion: row.datasetVersion,
    sourceRowId: row.sourceRowId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    factor: {
      id: row.id,
      scope: row.scope,
      scope3Category: row.scope3Category,
      scope2Method: row.scope2Method,
      gas: row.gas,
      ch4Variant: row.ch4Variant,
      gwpSet: row.gwpSet,
      value: row.value,
      activityUnit: row.activityUnit,
      resultUnit: row.resultUnit,
      biogenic: row.biogenic,
    },
  }));
}

/**
 * Every visible factor row sharing a `(source, source_row_id)` with one of these
 * mappings — **one query, for the whole recalculation**.
 *
 * `recalculateOrganization` runs over an entire organisation and the nightly
 * sweep runs it for every organisation, so a per-record lookup here would be a
 * production problem rather than a style note. The rows come back once and
 * {@link buildFactorResolver} does all the interval matching in memory.
 *
 * **The same three predicates `searchFactorsForPair` applies**, plus the tenant
 * scope: nothing can be selected here that the picker would not have offered,
 * and a sibling resolved across the tenant boundary would be a cross-tenant leak
 * into a filed number, which is why the predicate is the shared helper rather
 * than a restatement of it.
 */
export async function listFactorSiblings(
  organizationId: string,
  mappings: readonly ResolvedMapping[],
  db: Db = getDb(),
): Promise<FactorSibling[]> {
  /* Distinct pairs — eight seeded mappings routinely share four factor rows,
     and `(category, unit)` is capped at 64 by the two enums, so the OR list is
     bounded and fully parameterised. */
  const pairs = new Map<string, { source: string; sourceRowId: string }>();
  for (const mapping of mappings) {
    pairs.set(`${mapping.source}${mapping.sourceRowId}`, {
      source: mapping.source,
      sourceRowId: mapping.sourceRowId,
    });
  }
  if (pairs.size === 0) return [];

  const rows = await db
    .select({
      source: emissionFactorSet.source,
      sourceRowId: emissionFactor.sourceRowId,
      supersedesSource: emissionFactor.supersedesSource,
      supersedesSourceRowId: emissionFactor.supersedesSourceRowId,
      id: emissionFactor.id,
      scope: emissionFactor.scope,
      scope3Category: emissionFactor.scope3Category,
      scope2Method: emissionFactor.scope2Method,
      gas: emissionFactor.gas,
      ch4Variant: emissionFactor.ch4Variant,
      gwpSet: emissionFactor.gwpSet,
      value: emissionFactor.value,
      activityUnit: emissionFactor.activityUnit,
      resultUnit: emissionFactor.resultUnit,
      biogenic: emissionFactor.biogenic,
      effectiveFrom: emissionFactorSet.effectiveFrom,
      effectiveTo: emissionFactorSet.effectiveTo,
      setId: emissionFactorSet.id,
      setOrganizationId: emissionFactorSet.organizationId,
      publicationYear: emissionFactorSet.publicationYear,
      setCreatedAt: emissionFactorSet.createdAt,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
        /* **Either key** (prompt 71): the row's own published identity, or the
           published row a customer-supplied row declares it restates.
           `visibleFactorScope` stays an outer `AND` over the whole `where` and
           is deliberately not folded in here — it is what stops one tenant's
           superseding row entering another tenant's sibling set. */
        or(
          ...[...pairs.values()].flatMap((pair) => [
            and(
              eq(emissionFactorSet.source, pair.source),
              eq(emissionFactor.sourceRowId, pair.sourceRowId),
            ),
            and(
              eq(emissionFactor.supersedesSource, pair.source),
              eq(emissionFactor.supersedesSourceRowId, pair.sourceRowId),
            ),
          ]),
        ),
      ),
    );

  return rows.map((row) => ({
    source: row.source,
    sourceRowId: row.sourceRowId,
    supersedesSource: row.supersedesSource,
    supersedesSourceRowId: row.supersedesSourceRowId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    setId: row.setId,
    setOrganizationId: row.setOrganizationId,
    publicationYear: row.publicationYear,
    setCreatedAt: row.setCreatedAt,
    factor: {
      id: row.id,
      scope: row.scope,
      scope3Category: row.scope3Category,
      scope2Method: row.scope2Method,
      gas: row.gas,
      ch4Variant: row.ch4Variant,
      gwpSet: row.gwpSet,
      value: row.value,
      activityUnit: row.activityUnit,
      resultUnit: row.resultUnit,
      biogenic: row.biogenic,
    },
  }));
}

/**
 * Turns the mapping rows into the pure resolver `aggregate()` takes — **now
 * selecting by the record's own date** (prompt 68).
 *
 * Keeping this here rather than in `lib/domain/` is what lets the engine stay
 * free of any notion of where a factor came from. It is **pure and synchronous**
 * and issues no query: every candidate it can return is already in `siblings`.
 *
 * **The rule it applies is not written here.** Which set wins for a date is
 * `selectFactorForDate` in `lib/domain/factor-selection.ts` — pure, and under
 * test, because it decides which published value multiplies a customer's
 * activity. This function does the two things that are genuinely about storage:
 * index the mappings by pair, and index the siblings by the publisher's row
 * identity. `no_mapping` is decided here because only this layer knows what a
 * mapping is.
 */
export function buildFactorResolver(
  mappings: readonly ResolvedMapping[],
  siblings: readonly FactorSibling[] = [],
): FactorResolver {
  const byPair = new Map<string, ResolvedMapping>();
  for (const mapping of mappings) {
    byPair.set(`${mapping.category}.${mapping.unit}`, mapping);
  }

  /* Nested rather than a composite string key, so no separator has to be
     chosen and no source or row id can collide with one.

     **Filed under every key `factorSiblingKeys` returns**, which for a
     customer-supplied row that declares a supersession is two (prompt 71). The
     rule is in `lib/domain/` rather than here because it decides which value
     multiplies a customer's activity. */
  const bySourceRow = new Map<string, Map<string, FactorSibling[]>>();
  for (const sibling of siblings) {
    for (const key of factorSiblingKeys(sibling)) {
      let bySource = bySourceRow.get(key.source);
      if (!bySource) {
        bySource = new Map();
        bySourceRow.set(key.source, bySource);
      }
      const existing = bySource.get(key.sourceRowId);
      if (existing) existing.push(sibling);
      else bySource.set(key.sourceRowId, [sibling]);
    }
  }

  return (record: ActivityInput): FactorResolution => {
    const mapping = byPair.get(`${record.category}.${record.unit}`);
    if (!mapping) return { ok: false, gap: "no_mapping" };

    const factor = selectFactorForDate(
      mapping,
      bySourceRow.get(mapping.source)?.get(mapping.sourceRowId) ?? [],
      record.activityDate,
    );

    return factor
      ? { ok: true, factor }
      : { ok: false, gap: "out_of_period" };
  };
}

/* -------------------------------------------------------------------------- */
/*  Activity records, as the engine needs them                                 */
/* -------------------------------------------------------------------------- */

/**
 * The committed records to calculate over — the whole organisation, or one
 * import.
 *
 * `importId` is an additional predicate, never a replacement for the tenant
 * one: an id belonging to another organisation matches no rows and returns an
 * empty list, which is the same answer a nonexistent id gets. No existence
 * oracle on this path.
 */
export async function listRecordsForCalculation(
  organizationId: string,
  importId: string | null,
  db: Db = getDb(),
): Promise<ActivityInput[]> {
  return db
    .select({
      id: activityRecord.id,
      activityDate: activityRecord.activityDate,
      category: activityRecord.category,
      unit: activityRecord.unit,
      quantity: activityRecord.quantity,
    })
    .from(activityRecord)
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        importId ? eq(activityRecord.importId, importId) : undefined,
      ),
    );
}

/* -------------------------------------------------------------------------- */
/*  Writing computed emissions                                                 */
/* -------------------------------------------------------------------------- */

export type StoredEmission = {
  activityRecordId: string;
  factorId: string;
  kgCo2e: string;
  scope: FactorInput["scope"];
  scope3Category: FactorInput["scope3Category"];
  scope2Method: FactorInput["scope2Method"];
  gwpSet: FactorInput["gwpSet"];
  biogenic: boolean;
  outsideOfScopes: boolean;
  engineVersion: string;
};

/**
 * Replaces the computed emissions for a scope of records, in one transaction.
 *
 * **Delete-then-insert, not upsert, and the delete is bounded by the same
 * record set the insert covers.** A recalculation must leave no stale row
 * behind: a record whose `(category, unit)` mapping was removed now produces no
 * figure, and an upsert would leave its previous emission in place to be summed
 * into the next total. Scoping the delete to `recordIds` rather than to the
 * whole organisation is what lets a single import be recalculated without
 * discarding every other import's figures.
 *
 * The unique index on `activity_record_id` is the backstop: a double-run cannot
 * append a second figure for one record even if this transaction were wrong.
 */
export async function replaceEmissions(
  organizationId: string,
  recordIds: readonly string[],
  emissions: readonly StoredEmission[],
): Promise<{ written: number }> {
  if (recordIds.length === 0) return { written: 0 };

  return getDb().transaction(async (tx) => {
    for (const batch of chunk(recordIds, INSERT_BATCH)) {
      await tx
        .delete(activityEmission)
        .where(
          and(
            eq(activityEmission.organizationId, organizationId),
            inArray(activityEmission.activityRecordId, batch),
          ),
        );
    }

    for (const batch of chunk(emissions, INSERT_BATCH)) {
      await tx.insert(activityEmission).values(
        batch.map((emission) => ({
          organizationId,
          activityRecordId: emission.activityRecordId,
          factorId: emission.factorId,
          kgCo2e: emission.kgCo2e,
          scope: emission.scope,
          scope3Category: emission.scope3Category,
          scope2Method: emission.scope2Method,
          gwpSet: emission.gwpSet,
          biogenic: emission.biogenic,
          outsideOfScopes: emission.outsideOfScopes,
          engineVersion: emission.engineVersion,
        })),
      );
    }

    return { written: emissions.length };
  });
}

/* -------------------------------------------------------------------------- */
/*  The recalculation seam                                                     */
/* -------------------------------------------------------------------------- */

export type RecalculationOutcome = {
  /** Committed records the run covered. Zero means there was nothing to
      calculate — a state the caller describes, not a failure this reports. */
  records: number;
  /** Computed emissions written for them. */
  written: number;
};

/**
 * One recalculation, from seeding the default mappings to writing the figures —
 * **the definition of what a recalculation is, in one place.**
 *
 * Build step 10 inlined this orchestration in `app/activity/actions.ts`'s
 * `recalculate`; build step 14 added a second caller, the nightly sweep in
 * `app/api/cron/recalculate/route.ts`, and **two implementations would be two
 * definitions of a disclosure figure**. So the action calls this and the cron
 * calls this, and neither restates the chain.
 *
 * **A query module composing a pure domain function is the established idiom
 * here, not a new smear**: `target-queries.ts`'s `readTargetEvidence` and
 * `dashboard-queries.ts`'s `readDashboardEvidence` already compose a
 * tenant-predicated read with `totalsByPeriod`. `lib/domain/` stays free of
 * every database handle, which is the boundary AGENTS.md 6.2 actually names —
 * `aggregate()` below is handed pure values and hands back pure values.
 *
 * **The factor is selected by the record's own date** (prompt 68), not by
 * whichever row the mapping happens to point at: `listFactorSiblings` loads the
 * mapped rows' `(source, source_row_id)` siblings once, and the resolver picks
 * the set whose window contains the activity date. A record no visible set
 * covers produces no figure and is reported in the coverage report's
 * `outOfPeriodYears`.
 *
 * **The behaviour is otherwise step 10's, unchanged.** `replaceEmissions` keeps its
 * delete-then-insert semantics bounded by the covered record set, for the reason
 * its own docblock records: a record whose mapping was removed must lose its
 * figure rather than keep a stale one.
 *
 * @param importId `null` recalculates the whole organisation; an id scopes the
 * run to one import. It is an additional predicate, never a replacement for the
 * tenant one.
 */
export async function recalculateOrganization(
  organizationId: string,
  importId: string | null,
): Promise<RecalculationOutcome> {
  /* A new organisation starts with the default `(category, unit)` mappings so
     its first calculation produces a total rather than a blank screen. It runs
     only when the organisation has none — a reporter's own choice is never
     overwritten (see `seedDefaultMappings`). */
  await seedDefaultMappings(organizationId, DEFAULT_FACTOR_MAPPINGS);

  const [records, mappings] = await Promise.all([
    listRecordsForCalculation(organizationId, importId),
    listFactorMappings(organizationId),
  ]);

  if (records.length === 0) return { records: 0, written: 0 };

  /* Sequential, and only once there is something to calculate: the sibling
     lookup is keyed by the mappings, and an organisation with no records pays
     for neither. Still a constant number of queries in the record count — the
     resolver below never issues one. */
  const siblings = await listFactorSiblings(organizationId, mappings);

  const { emissions } = aggregate(
    records,
    buildFactorResolver(mappings, siblings),
  );

  const { written } = await replaceEmissions(
    organizationId,
    records.map((record) => record.id),
    emissions.map((emission) => ({
      activityRecordId: emission.recordId,
      factorId: emission.factorId,
      kgCo2e: toStoredKgCo2e(emission.kgCo2e),
      scope: emission.scope,
      scope3Category: emission.scope3Category,
      scope2Method: emission.scope2Method,
      gwpSet: emission.gwpSet,
      biogenic: emission.biogenic,
      outsideOfScopes: emission.outsideOfScopes,
      engineVersion: emission.engineVersion,
    })),
  );

  return { records: records.length, written };
}

/* -------------------------------------------------------------------------- */
/*  Reading computed emissions back                                            */
/* -------------------------------------------------------------------------- */

export type PersistedEmission = {
  recordId: string;
  activityDate: string;
  kgCo2e: string;
  scope: FactorInput["scope"];
  scope3Category: FactorInput["scope3Category"];
  scope2Method: FactorInput["scope2Method"];
  gwpSet: FactorInput["gwpSet"];
  biogenic: boolean;
  outsideOfScopes: boolean;
  calculatedAt: Date;
};

/**
 * The stored figures for an organisation, or for one import.
 *
 * The totals surface reads these rather than recalculating on render: a
 * disclosure figure is a thing that was computed at a moment, by a named engine
 * version, against a named factor row, and re-deriving it on every page view
 * would make "what did we file" unanswerable.
 */
export async function listEmissions(
  organizationId: string,
  importId: string | null,
): Promise<PersistedEmission[]> {
  return getDb()
    .select({
      recordId: activityEmission.activityRecordId,
      activityDate: activityRecord.activityDate,
      kgCo2e: activityEmission.kgCo2e,
      scope: activityEmission.scope,
      scope3Category: activityEmission.scope3Category,
      scope2Method: activityEmission.scope2Method,
      gwpSet: activityEmission.gwpSet,
      biogenic: activityEmission.biogenic,
      outsideOfScopes: activityEmission.outsideOfScopes,
      calculatedAt: activityEmission.calculatedAt,
    })
    .from(activityEmission)
    .innerJoin(
      activityRecord,
      eq(activityRecord.id, activityEmission.activityRecordId),
    )
    .where(
      and(
        eq(activityEmission.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        importId ? eq(activityRecord.importId, importId) : undefined,
      ),
    );
}

/**
 * How many committed records currently have no computed figure — the number the
 * surface needs to say "this total is not complete" without recalculating.
 */
export async function countUncalculatedRecords(
  organizationId: string,
  importId: string | null,
): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(activityRecord)
    .leftJoin(
      activityEmission,
      eq(activityEmission.activityRecordId, activityRecord.id),
    )
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        isNull(activityEmission.id),
        importId ? eq(activityRecord.importId, importId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

/**
 * How many committed records are mapped but dated outside every visible factor
 * set's window — **the part of the uncalculated figure that has a specific
 * answer.**
 *
 * `countUncalculatedRecords` is honest but undifferentiated: it counts records
 * with no computed figure, whatever the reason. This names the one reason a
 * reporter resolves by loading a year's factor set rather than by mapping a
 * pair, which is why the coverage line prints it separately.
 *
 * Answered from the rows themselves rather than by running the engine — the
 * reason {@link listFactorCoverage} exists, applied to the same question. The
 * predicate is the shared one, so this and the pair list agree by construction.
 */
export async function countOutOfPeriodRecords(
  organizationId: string,
  importId: string | null,
): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(activityRecord)
    .innerJoin(
      activityFactorMapping,
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        eq(activityFactorMapping.category, activityRecord.category),
        eq(activityFactorMapping.unit, activityRecord.unit),
        isNull(activityFactorMapping.deletedAt),
      ),
    )
    .innerJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityFactorMapping.factorId),
        isNull(emissionFactor.deletedAt),
      ),
    )
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
        importId ? eq(activityRecord.importId, importId) : undefined,
        outOfPeriodPredicate(organizationId),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Whether this organisation has any factor mapping at all.
 *
 * **It has no caller, and this docblock used to claim otherwise.** Build step 10
 * wrote that "the surface uses it to tell the difference between 'nothing is
 * mapped yet' … and 'these particular records did not match'". No surface ever
 * did, and prompt 65 — which built the surface that would have — does not
 * either: {@link listFactorCoverage} answers the same question *per pair* and
 * from the same round trip, which is strictly more than this can say. Corrected
 * rather than left predicting something that did not happen (AGENTS.md 12
 * rule 8).
 *
 * Kept rather than deleted because the question is a real one for a caller that
 * holds no coverage list — the nightly sweep would have to ask it to distinguish
 * an unseeded organisation from an idle one. It is not called today.
 */
export async function hasAnyFactorMapping(
  organizationId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: sql<number>`1` })
    .from(activityFactorMapping)
    .where(
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        isNull(activityFactorMapping.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/* -------------------------------------------------------------------------- */
/*  The mapping surface — prompt 65                                            */
/* -------------------------------------------------------------------------- */

/** The publisher's own description of a factor row, assembled the one way
    `listFactorMappings` already assembles it, so the picker, the coverage list
    and the calculation seam all name a row identically. */
const factorLabelOf = factorMatchSourceText;

/**
 * "This record is mapped, and no visible set's window contains its date" — in
 * SQL, **as one expression, written once**.
 *
 * It mirrors {@link buildFactorResolver} stage for stage, and it has to: this is
 * what the two coverage surfaces render, and the resolver is what actually
 * decides the figure. A predicate that answered differently would tell a
 * reporter a gap was closed while the engine still refused the record.
 *
 * - the mapped row's **own** set window first, exactly as the resolver's fast
 *   path — which is why a superseded mapped set still counts as covering, there
 *   and here;
 * - then the `(source, source_row_id)` siblings, under the tenant predicate and
 *   the same three `deleted` / `superseded` filters `listFactorSiblings` and
 *   `searchFactorsForPair` apply.
 *
 * The subquery's two tables are aliased in literal SQL because they are the same
 * two tables the outer query already joins; the interpolations are the outer
 * columns and the bound organisation id.
 *
 * It reads `activityRecord`, `emissionFactor` and `emissionFactorSet` from the
 * enclosing query, so it is only valid where all three are in scope.
 */
function outOfPeriodPredicate(organizationId: string) {
  return sql`${activityRecord.activityDate} not between ${emissionFactorSet.effectiveFrom} and ${emissionFactorSet.effectiveTo}
    and not exists (
      select 1
      from emission_factor sibling_factor
      join emission_factor_set sibling_set
        on sibling_set.id = sibling_factor.set_id
      where sibling_factor.source_row_id = ${emissionFactor.sourceRowId}
        and sibling_set.source = ${emissionFactorSet.source}
        and (
          sibling_factor.organization_id is null
          or sibling_factor.organization_id = ${organizationId}
        )
        and sibling_factor.deleted_at is null
        and sibling_set.deleted_at is null
        and sibling_set.superseded_by_set_id is null
        and ${activityRecord.activityDate}
          between sibling_set.effective_from and sibling_set.effective_to
    )`;
}

export type FactorCoveragePair = {
  category: ActivityCategory;
  unit: ActivityUnit;
  /** Committed records sitting behind this pair. */
  recordCount: number;
  /** Of those, how many are dated outside every window the mapped factor's
      `(source, source_row_id)` is published in — mapped, and still contributing
      nothing. Always `0` for an unmapped pair, whose records are counted by the
      `mapping === null` gap instead. */
  outOfPeriodRecords: number;
  /** `null` is the gap the surface exists to close. */
  mapping: {
    factorId: string;
    factorLabel: string;
    publishedUom: string;
    source: string;
    datasetVersion: string;
    customerSupplied: boolean;
    chosenAt: Date;
    /** The person who chose it, or `null` for a seeded default — which no
        person chose, exactly as the column's own docblock says. */
    chosenBy: string | null;
  } | null;
};

/**
 * Every `(category, unit)` the organisation's committed records actually use,
 * with the factor mapped to it or nothing.
 *
 * **The gap, without running the engine.** `aggregate()` already computes an
 * identical shape in `CoverageReport.unmatchedPairs`, but obtaining it means a
 * full recalculation, and a page render must not recompute a disclosure input
 * (`listEmissions`' docblock says why). This is the same question asked of the
 * rows themselves.
 *
 * **Pairs with no records are deliberately absent.** All 64 are possible and
 * eight are seeded by default; listing the 53 a tenant has never recorded
 * against would bury the handful that matter. What a reporter is owed is the
 * shape of their own data.
 *
 * Predicated on `organization_id = $1` throughout — on the records, and again on
 * the mapping join, so a pair can never pick up another tenant's choice.
 *
 * **Two questions since prompt 68, not one.** "Is there a mapping" was the whole
 * of it, and a mapped pair whose records all fell outside every published window
 * read as fully covered while contributing nothing. `outOfPeriodRecords` answers
 * the second, through {@link outOfPeriodPredicate} — the same expression
 * {@link countOutOfPeriodRecords} uses, so the pair list and the coverage line
 * cannot disagree.
 */
export async function listFactorCoverage(
  organizationId: string,
): Promise<FactorCoveragePair[]> {
  const rows = await getDb()
    .select({
      category: activityRecord.category,
      unit: activityRecord.unit,
      recordCount: sql<number>`count(*)::int`,
      /* A `FILTER` rather than a second query: its expression is evaluated per
         input row, like an aggregate's argument, so the ungrouped columns it
         reads need no `GROUP BY` entry. */
      outOfPeriodRecords: sql<number>`count(*) filter (
        where ${activityFactorMapping.factorId} is not null
          and ${outOfPeriodPredicate(organizationId)}
      )::int`,
      factorId: activityFactorMapping.factorId,
      chosenAt: activityFactorMapping.updatedAt,
      chosenBy: user.name,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      setOrganizationId: emissionFactorSet.organizationId,
    })
    .from(activityRecord)
    .leftJoin(
      activityFactorMapping,
      and(
        eq(activityFactorMapping.organizationId, organizationId),
        eq(activityFactorMapping.category, activityRecord.category),
        eq(activityFactorMapping.unit, activityRecord.unit),
        isNull(activityFactorMapping.deletedAt),
      ),
    )
    .leftJoin(
      emissionFactor,
      and(
        eq(emissionFactor.id, activityFactorMapping.factorId),
        isNull(emissionFactor.deletedAt),
      ),
    )
    .leftJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .leftJoin(user, eq(user.id, activityFactorMapping.createdBy))
    .where(
      and(
        eq(activityRecord.organizationId, organizationId),
        isNull(activityRecord.deletedAt),
      ),
    )
    /* Every non-aggregated column, listed rather than leaning on Postgres's
       functional-dependency rule: that rule is stated for a grouped primary
       key, and three of these tables sit on the nullable side of an outer
       join. Explicit is one line longer and cannot surprise us. */
    .groupBy(
      activityRecord.category,
      activityRecord.unit,
      activityFactorMapping.factorId,
      activityFactorMapping.updatedAt,
      user.name,
      emissionFactor.level2,
      emissionFactor.level3,
      emissionFactor.columnText,
      emissionFactor.publishedUom,
      emissionFactorSet.source,
      emissionFactorSet.datasetVersion,
      emissionFactorSet.organizationId,
    )
    /* Unmapped first, then the biggest gap — the same reading order
       `aggregate()` sorts `unmatchedPairs` into, so the two agree on which gap
       is the one to look at. */
    .orderBy(
      sql`(${activityFactorMapping.factorId} is not null)`,
      sql`count(*) desc`,
      asc(activityRecord.category),
      asc(activityRecord.unit),
    );

  return rows.map((row) => ({
    category: row.category,
    unit: row.unit,
    recordCount: row.recordCount,
    outOfPeriodRecords: row.outOfPeriodRecords,
    mapping:
      row.factorId && row.source && row.datasetVersion
        ? {
            factorId: row.factorId,
            factorLabel: factorLabelOf([
              row.level2,
              row.level3,
              row.columnText,
            ]),
            publishedUom: row.publishedUom ?? "",
            source: row.source,
            datasetVersion: row.datasetVersion,
            customerSupplied: row.setOrganizationId !== null,
            chosenAt: row.chosenAt ?? new Date(0),
            chosenBy: row.chosenBy,
          }
        : null,
  }));
}

/**
 * How many rows a search returns.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4). The 2026 set holds
 * 7,035 rows and a reporter scanning a list to choose one factor is doing
 * careful work, not browsing: 50 is more than a screen and far short of a page
 * nobody reads to the end of. Narrowing the search is the way to see a
 * different fifty.
 */
export const FACTOR_SEARCH_LIMIT = 50;

export type FactorSearchRow = {
  id: string;
  label: string;
  publishedUom: string;
  scope: FactorInput["scope"];
  gas: FactorInput["gas"];
  value: string;
  source: string;
  datasetVersion: string;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  customerSupplied: boolean;
};

/** Postgres reads `%` and `_` as wildcards and `\` as the default escape, so a
    reporter typing "Diesel_100%" would otherwise run a much broader search than
    they asked for. Escaping is a correctness fix, not a safety one — the
    pattern is a bound parameter either way. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The factors that can be offered for one `(category, unit)` pair.
 *
 * **Narrowed by the engine's own rule, not by a second copy of it.**
 * `admissibleFactorUnits` derives the admissible denominators from
 * `factorEligibility`, and `result_unit = 'kg_co2e'` is the same check
 * `calculateRecordEmission` performs first. Offering a row the engine would
 * refuse lets an owner "fix" a gap and change nothing but the refusal reason.
 *
 * Visible reference data only (`organization_id is null or = $1`), non-deleted,
 * and from a set that has not been superseded — the same three predicates
 * `seedDefaultMappings` applies, so nothing can be chosen here that the seeder
 * would not have chosen. That sentence was **false** between prompts 68 and 70:
 * the seeder omitted `emission_factor_set.deleted_at is null`. Prompt 70 added
 * it there rather than removing it here, which is the direction that cannot
 * widen what a default may name.
 *
 * The match is over the publisher's own description columns, which are the three
 * `listFactorMappings` already joins into `factorLabel`.
 *
 * **The ordering carries a deterministic tail.** Two published sets hold rows
 * with identical labels, so the three label columns alone leave the pair's
 * sequence — and therefore which of them survives `FACTOR_SEARCH_LIMIT` — to
 * Postgres. The tail is `preferCandidate`'s own reading order: customer-supplied
 * ahead of published, then the later publication year, then the set id. The
 * label columns keep their precedence, so the list a reporter reads does not
 * re-sequence.
 */
export async function searchFactorsForPair(
  organizationId: string,
  unit: ActivityUnit,
  query: string,
): Promise<FactorSearchRow[]> {
  const admissible = admissibleFactorUnits(unit);
  if (admissible.length === 0) return [];

  const trimmed = query.trim();
  const pattern = trimmed === "" ? null : `%${escapeLike(trimmed)}%`;

  const rows = await getDb()
    .select({
      id: emissionFactor.id,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      scope: emissionFactor.scope,
      gas: emissionFactor.gas,
      value: emissionFactor.value,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
      setOrganizationId: emissionFactorSet.organizationId,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
        eq(emissionFactor.resultUnit, "kg_co2e"),
        inArray(emissionFactor.activityUnit, admissible),
        pattern
          ? or(
              ilike(emissionFactor.level2, pattern),
              ilike(emissionFactor.level3, pattern),
              ilike(emissionFactor.columnText, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(emissionFactor.level2),
      asc(emissionFactor.level3),
      asc(emissionFactor.columnText),
      asc(sql`${emissionFactorSet.organizationId} is null`),
      desc(emissionFactorSet.publicationYear),
      asc(emissionFactorSet.id),
    )
    .limit(FACTOR_SEARCH_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    label: factorLabelOf([row.level2, row.level3, row.columnText]),
    publishedUom: row.publishedUom,
    scope: row.scope,
    gas: row.gas,
    value: row.value,
    source: row.source,
    datasetVersion: row.datasetVersion,
    licence: row.licence,
    licenceUrl: row.licenceUrl,
    sourceUrl: row.sourceUrl,
    sourceReference: row.sourceReference,
    customerSupplied: row.setOrganizationId !== null,
  }));
}

export type FuzzyFactorSearchRow = FactorSearchRow & {
  similarity: number;
};

/**
 * Character-trigram wording search for one admissible activity pair. It keeps
 * the lexical picker's five eligibility rules and includes visible customer
 * rows: all ranking happens inside the tenant-scoped Postgres query.
 */
export async function searchFactorsByWording(
  organizationId: string,
  unit: ActivityUnit,
  query: string,
): Promise<FuzzyFactorSearchRow[]> {
  const admissible = admissibleFactorUnits(unit);
  if (admissible.length === 0) return [];

  const label = emissionFactorLabelSql(emissionFactor);
  const similarity = sql<number>`similarity(${label}, ${query.trim()})`;

  const rows = await getDb()
    .select({
      id: emissionFactor.id,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      publishedUom: emissionFactor.publishedUom,
      scope: emissionFactor.scope,
      gas: emissionFactor.gas,
      value: emissionFactor.value,
      source: emissionFactorSet.source,
      datasetVersion: emissionFactorSet.datasetVersion,
      licence: emissionFactorSet.licence,
      licenceUrl: emissionFactorSet.licenceUrl,
      sourceUrl: emissionFactorSet.sourceUrl,
      sourceReference: emissionFactorSet.sourceReference,
      setOrganizationId: emissionFactorSet.organizationId,
      similarity,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
        eq(emissionFactor.resultUnit, "kg_co2e"),
        inArray(emissionFactor.activityUnit, admissible),
      ),
    )
    .orderBy(desc(similarity), asc(emissionFactor.id))
    .limit(FACTOR_SEARCH_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    label: factorLabelOf([row.level2, row.level3, row.columnText]),
    publishedUom: row.publishedUom,
    scope: row.scope,
    gas: row.gas,
    value: row.value,
    source: row.source,
    datasetVersion: row.datasetVersion,
    licence: row.licence,
    licenceUrl: row.licenceUrl,
    sourceUrl: row.sourceUrl,
    sourceReference: row.sourceReference,
    customerSupplied: row.setOrganizationId !== null,
    similarity: row.similarity,
  }));
}

export type VisibleFactor = {
  id: string;
  label: string;
  activityUnit: FactorInput["activityUnit"];
  resultUnit: FactorInput["resultUnit"];
};

/**
 * One factor, re-resolved under the tenant's own visibility.
 *
 * **A factor id arriving from the browser is a claim, not a capability.** One
 * belonging to another tenant's private set answers `null`, which is
 * indistinguishable from one that does not exist — the same stance `getImport`
 * takes on a foreign `importId`. No existence oracle.
 */
export async function getVisibleFactor(
  organizationId: string,
  factorId: string,
): Promise<VisibleFactor | null> {
  const [row] = await getDb()
    .select({
      id: emissionFactor.id,
      level2: emissionFactor.level2,
      level3: emissionFactor.level3,
      columnText: emissionFactor.columnText,
      activityUnit: emissionFactor.activityUnit,
      resultUnit: emissionFactor.resultUnit,
    })
    .from(emissionFactor)
    .innerJoin(emissionFactorSet, eq(emissionFactorSet.id, emissionFactor.setId))
    .where(
      and(
        eq(emissionFactor.id, factorId),
        visibleFactorScope(organizationId),
        isNull(emissionFactor.deletedAt),
        isNull(emissionFactorSet.deletedAt),
        isNull(emissionFactorSet.supersededBySetId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    label: factorLabelOf([row.level2, row.level3, row.columnText]),
    activityUnit: row.activityUnit,
    resultUnit: row.resultUnit,
  };
}

/**
 * Sets the organisation's factor for one `(category, unit)` pair.
 *
 * **`deleted_at` is cleared, and that is required for correctness rather than
 * tidiness.** `activity_factor_mapping_key` is a plain unique index, not a
 * partial one (`lib/db/schema.ts`), so a soft-deleted row still occupies its
 * `(organization_id, category, unit)` slot: an upsert that left `deleted_at`
 * set would resurrect nothing and re-mapping the pair would keep failing the
 * conflict silently. Prompt 65 sets and changes a mapping and deliberately
 * offers no unmap — what a removed mapping means is a decision of its own.
 *
 * **This is a `set`, not a `seed`.** `seedDefaultMappings` refuses to overwrite
 * a reporter's own choice, for the reason its docblock records; this *is* the
 * reporter's own choice, made deliberately, so it overwrites.
 */
export async function setFactorMapping(input: {
  organizationId: string;
  category: ActivityCategory;
  unit: ActivityUnit;
  factorId: string;
  /** The person who chose it, for the provenance line. */
  userId: string;
}): Promise<void> {
  await getDb()
    .insert(activityFactorMapping)
    .values({
      organizationId: input.organizationId,
      category: input.category,
      unit: input.unit,
      factorId: input.factorId,
      createdBy: input.userId,
    })
    .onConflictDoUpdate({
      target: [
        activityFactorMapping.organizationId,
        activityFactorMapping.category,
        activityFactorMapping.unit,
      ],
      set: {
        factorId: input.factorId,
        createdBy: input.userId,
        updatedAt: new Date(),
        deletedAt: null,
      },
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
export async function seedDefaultMappings(
  organizationId: string,
  defaults: readonly { category: ActivityCategory; unit: ActivityUnit; sourceRowId: string }[],
): Promise<{ inserted: number }> {
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ n: sql<number>`1` })
      .from(activityFactorMapping)
      .where(eq(activityFactorMapping.organizationId, organizationId))
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

import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb, type Db } from "./client";
import {
  activityFactorMapping,
  emissionFactor,
  emissionFactorSet,
} from "./schema";
import { factorLabelOf } from "./factor-scope";
import { chunk, INSERT_BATCH } from "./insert-batch";
import type { FactorGasBasis } from "./factor-set-queries";
import { factorRowIdentityParts } from "../domain/factor-import";
import type { FactorInput } from "../domain/emissions";
import type { CreateCustomFactorInput } from "../validation/emissions";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("factor-queries");

/**
 * `emission_factor` — a tenant's own factor rows: authoring them one at a time
 * or in bulk, reading them back, and retiring one.
 *
 * One of the eight edit reasons prompt 119 split `emission-queries.ts` along.
 * The whole tenant boundary of the factor write path is
 * {@link resolveWritableSet}, so the single-row and the bulk path cannot diverge
 * on it. The visibility predicate and the no-logging rule are
 * `factor-scope.ts`'s.
 */

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

export const listTenantFactors = safe("listTenantFactors", listTenantFactorsImpl);

async function listTenantFactorsImpl(
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
      /* One correlated subquery rather than a second round trip per row.
         Aliased and qualified for the reason `listFactorSets` records: bare
         column references bound to the inner table and this count answered
         zero for every row. */
      mappingCount: sql<number>`(
        select count(*)::int from ${activityFactorMapping} m
        where m.factor_id = ${emissionFactor}.id
          and m.organization_id = ${organizationId}
          and m.deleted_at is null
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
  factor: TenantFactorInput,
): string {
  /* **The field list moved to `lib/domain/factor-import.ts` at prompt 82** and
     is imported rather than restated, so the bulk importer's in-file duplicate
     check and the `(set_id, source_row_id)` unique index this backs agree by
     construction. The order, the normalisation and the conditional supersession
     pair are unchanged, so every hash already stored still resolves — a row
     created before that change re-submits as the idempotent no-op it got
     before, not as a duplicate. */
  const identity = [
    normaliseHashPart(organizationId),
    normaliseHashPart(setId),
    ...factorRowIdentityParts(factor),
  ];

  return `custom:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

/** One tenant-owned factor row, as the two write paths carry it. The single
    form and the bulk importer submit the identical object — `customFactorSchema`
    parses both — so the row type is the schema's, named once here. */
type TenantFactorInput = CreateCustomFactorInput["factor"];

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
export const createTenantFactor = safe("createTenantFactor", createTenantFactorImpl);

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Resolves the set a write is going into, inside the caller's transaction.
 *
 * **Extracted at prompt 82 so the single-row and bulk paths cannot diverge on
 * it** — this is the whole tenant boundary of the factor write path, and two
 * copies of it is two places for a predicate to go missing. Behaviour is
 * unchanged from prompt 67's: an existing id is re-read under the tenant
 * predicate and a missing, retired or foreign id is one indistinguishable
 * `set_not_found`; a new set is inserted and the
 * `(organization_id, source, dataset_version)` collision is answered as
 * `set_exists` rather than silently reusing the stored set and discarding the
 * licence the submission carried.
 */
async function resolveWritableSet(
  tx: Tx,
  organizationId: string,
  setInput: CreateCustomFactorInput["set"],
  derivedGasBasis: FactorGasBasis,
): Promise<
  | { ok: true; set: { id: string; gasBasis: FactorGasBasis } }
  | { ok: false; reason: "set_exists" }
  | { ok: false; reason: "set_not_found" }
  | { ok: false; reason: "gas_basis_mismatch"; setGasBasis: FactorGasBasis }
> {
  let set: { id: string; gasBasis: FactorGasBasis } | undefined;

  if (setInput.mode === "existing") {
    /* A submitted set id is a claim, not a capability. */
    [set] = await tx
      .select({ id: emissionFactorSet.id, gasBasis: emissionFactorSet.gasBasis })
      .from(emissionFactorSet)
      .where(
        and(
          eq(emissionFactorSet.id, setInput.setId),
          eq(emissionFactorSet.organizationId, organizationId),
          isNull(emissionFactorSet.deletedAt),
        ),
      )
      .limit(1);

    if (!set) return { ok: false, reason: "set_not_found" };
  } else {
    [set] = await tx
      .insert(emissionFactorSet)
      .values({
        organizationId,
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
    return { ok: false, reason: "gas_basis_mismatch", setGasBasis: set.gasBasis };
  }

  return { ok: true, set };
}

async function createTenantFactorImpl(input: {
  organizationId: string;
  data: CreateCustomFactorInput;
}): Promise<CreateTenantFactorOutcome> {
  const setInput = input.data.set;
  const factorInput = input.data.factor;
  const derivedGasBasis: FactorGasBasis =
    factorInput.gas === "co2e" ? "combined_co2e" : "per_gas";

  return getDb().transaction(async (tx) => {
    const resolved = await resolveWritableSet(
      tx,
      input.organizationId,
      setInput,
      derivedGasBasis,
    );
    if (!resolved.ok) return resolved;
    const set = resolved.set;

    const sourceRowId = sourceRowIdForCustomFactor(
      input.organizationId,
      set.id,
      factorInput,
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
 * What a bulk import can answer with besides success.
 *
 * The set refusals are {@link CreateTenantFactorOutcome}'s verbatim, so the
 * action maps them once. `mixed_gas_basis` is the file-level one:
 * `lib/domain/factor-import.ts` refuses a mixed file before this is called and
 * names the two lines, so reaching it here is a bug rather than a submission —
 * it exists because deriving one basis from rows that disagree would mislabel
 * the ones on the other side of the split.
 */
export type ImportTenantFactorsOutcome =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; reason: "set_exists" }
  | { ok: false; reason: "set_not_found" }
  | { ok: false; reason: "gas_basis_mismatch"; setGasBasis: FactorGasBasis }
  | { ok: false; reason: "mixed_gas_basis" };

/**
 * Writes many tenant-owned factor rows into one tenant-owned set — prompt 82.
 *
 * **One transaction, all rows or none.** The user chose the atomic shape over
 * step 9's staged review, and the reason is the licence: a partly-imported set
 * is a set whose provenance describes rows that are not all present, and that
 * provenance is rendered as disclosure evidence. "Rollback" is this transaction
 * plus the existing per-row retire control, so there is no staging table and no
 * migration.
 *
 * **Rows the set already holds are skipped and counted, not failed.**
 * `(set_id, source_row_id)` is the unique index and `source_row_id` is the
 * row's own identity hash, so re-running the same file writes nothing and says
 * so. Anything else that fails aborts the transaction and leaves zero rows.
 */
export const importTenantFactors = safe("importTenantFactors", importTenantFactorsImpl);

async function importTenantFactorsImpl(input: {
  organizationId: string;
  set: CreateCustomFactorInput["set"];
  factors: readonly TenantFactorInput[];
}): Promise<ImportTenantFactorsOutcome> {
  const first = input.factors[0];
  if (!first) return { ok: true, imported: 0, skipped: 0 };

  /* Derived from the file, never asked (prompt 67 decision 6). */
  const derivedGasBasis: FactorGasBasis =
    first.gas === "co2e" ? "combined_co2e" : "per_gas";
  const mixed = input.factors.some(
    (factor) =>
      (factor.gas === "co2e" ? "combined_co2e" : "per_gas") !==
      derivedGasBasis,
  );
  if (mixed) return { ok: false, reason: "mixed_gas_basis" };

  return getDb().transaction(async (tx) => {
    const resolved = await resolveWritableSet(
      tx,
      input.organizationId,
      input.set,
      derivedGasBasis,
    );
    if (!resolved.ok) return resolved;
    const set = resolved.set;

    const values = input.factors.map((factor) => ({
      setId: set.id,
      organizationId: input.organizationId,
      sourceRowId: sourceRowIdForCustomFactor(
        input.organizationId,
        set.id,
        factor,
      ),
      /* A claim, not a capability: every read of the pair runs under
         `visibleFactorScope`. */
      supersedesSource: factor.supersedes?.source ?? null,
      supersedesSourceRowId: factor.supersedes?.sourceRowId ?? null,
      level1: factor.level1 ?? null,
      level2: factor.level2 ?? null,
      level3: factor.level3 ?? null,
      level4: factor.level4 ?? null,
      columnText: factor.columnText ?? null,
      publishedUom: factor.publishedUom,
      publishedGhgUnit: factor.publishedGhgUnit,
      scope: factor.scope,
      scope3Category: factor.scope3Category ?? null,
      scope2Method: factor.scope2Method ?? null,
      activityUnit: factor.activityUnit,
      resultUnit: "kg_co2e" as const,
      gas: factor.gas,
      ch4Variant: factor.ch4Variant ?? null,
      gwpSet: factor.gwpSet,
      region: factor.region ?? null,
      biogenic: factor.biogenic,
      value: factor.value,
    }));

    let imported = 0;
    /* Chunked for the reason `INSERT_BATCH` records: Postgres caps a statement
       at 65,535 bound parameters, and a factor row binds 23 columns — so a
       500-row statement binds 11,500, well inside it. */
    for (const batch of chunk(values, INSERT_BATCH)) {
      const inserted = await tx
        .insert(emissionFactor)
        .values(batch)
        .onConflictDoNothing({
          target: [emissionFactor.setId, emissionFactor.sourceRowId],
        })
        .returning({ id: emissionFactor.id });
      imported += inserted.length;
    }

    return { ok: true, imported, skipped: values.length - imported };
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
export const retireTenantFactor = safe("retireTenantFactor", retireTenantFactorImpl);

async function retireTenantFactorImpl(input: {
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
export const listSupersedableRows = safe("listSupersedableRows", listSupersedableRowsImpl);

async function listSupersedableRowsImpl(
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

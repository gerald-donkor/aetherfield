import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { ColumnBaseConfig } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * The **strict** tenant predicate: this organisation's rows, not soft-deleted.
 *
 * `and(organization_id = $1, deleted_at is null)` — AGENTS.md §9.2 rule 6's
 * default, plus rule 5's soft delete. `report-queries.ts`, `target-queries.ts`
 * and `alert-queries.ts` each declared their own identical copy of it until
 * prompt 100; each now keeps a one-line `visible()` that names its own table and
 * calls this.
 *
 * ---
 *
 * **This is not `visibleFactorScope`, and the two must never be merged.**
 * That helper, in `lib/db/emission-queries.ts`, is §9.2 rule 6's sanctioned
 * *published-reference-data exception*:
 *
 * ```
 * or(isNull(emissionFactor.organizationId), eq(emissionFactor.organizationId, id))
 * ```
 *
 * `or`, not `and`; a **nullable** organisation reference, where `null` means a
 * dataset every tenant shares; and no `deletedAt` clause. A review counted the
 * two shapes as four copies of one helper. They are not:
 *
 * - folding the factor predicate into this one would **admit `NULL` organisation
 *   ids into three strictly tenant-scoped reads**, which is a cross-tenant read;
 * - folding this one into the factor predicate would make published factors
 *   invisible to every tenant.
 *
 * Both directions are wrong, and the first is the failure rule 6 exists to
 * prevent. A later session "finishing the job" is the risk this paragraph is
 * here to stop.
 *
 * ---
 *
 * **The generic is what keeps the two apart mechanically**, not just by
 * docblock. It admits only a table whose `organizationId` is typed `notNull:
 * true` and which carries a `deletedAt`, so passing `emissionFactor` — whose
 * organisation reference is deliberately nullable — is a **type error** rather
 * than a silently wrong query. Verified at prompt 100 against
 * `drizzle-orm/column.d.ts`, where `notNull` is part of `ColumnBaseConfig` and
 * is therefore expressible in a constraint; it was not assumed (§12 rule 2).
 *
 * The residual risk is narrow and worth stating: the constraint checks the
 * *shape* of the two columns, not that they mean what their names say. A future
 * table with a `notNull` `organizationId` and a `deletedAt` is accepted, which
 * is the intent.
 */
export type TenantScopedTable = {
  organizationId: PgColumn<
    ColumnBaseConfig<"string", string> & { notNull: true }
  >;
  deletedAt: PgColumn;
};

export function tenantVisible<T extends TenantScopedTable>(
  table: T,
  organizationId: string,
) {
  return and(
    eq(table.organizationId, organizationId),
    isNull(table.deletedAt),
  );
}

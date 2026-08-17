import "server-only";

/**
 * Batched multi-row `INSERT`, shared by `factor-queries.ts`'s bulk factor import
 * and `emission-queries.ts`'s computed-emission write — prompt 119 moved both
 * out of the single module that used to hold them.
 *
 * `activity-queries.ts` keeps its own copy, unchanged and deliberately: it was
 * a copy before this split and consolidating it is not this prompt's scope.
 */

/** Rows per `INSERT`. Postgres caps a statement at 65,535 bound parameters and
    a computed emission binds thirteen columns, so 500 rows is ~6,500 — the
    same batch size and the same reasoning `activity-queries.ts` records. */
export const INSERT_BATCH = 500;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Which factor a record's **own date** selects — prompt 68.
 *
 * **Pure** (AGENTS.md 6.2): no database handle, no `fetch`, no implicit clock.
 * `lib/db/emission-queries.ts` loads the candidates and composes this into the
 * `FactorResolver` the engine takes; nothing here knows a query exists.
 *
 * ---
 *
 * ## Why this is its own module rather than part of the engine
 *
 * `lib/domain/emissions.ts` deliberately has no notion of where a factor came
 * from — not a set, not a publisher, not an organisation — which is what keeps
 * `resolveFactor` a parameter and keeps the seam AGENTS.md 5.3 sanctions a model
 * for explicit. Set selection needs all three, so it sits beside the engine
 * rather than inside it.
 *
 * ## And why it is not in `lib/db/` with the query that feeds it
 *
 * It decides which published value multiplies a customer's activity, so it
 * decides a filed number. AGENTS.md 6.2 requires the layer that does that to be
 * pure and independently testable, and `lib/db/` is neither: it is
 * `server-only` and outside `npm test`'s `lib/domain/` scope. The rule is here,
 * under test in `factor-selection.test.ts`; the query and the composition stay
 * in `lib/db/emission-queries.ts`.
 *
 * ## The rule itself
 *
 * DEFRA publishes the 2026 factors "for use with activity data that falls
 * entirely or mostly within 2026". So a restatement of an earlier year selects
 * against **that** year's set, and activity no visible set covers is **refused**
 * — never costed at the nearest year, which would put a wrong number in a
 * disclosure rather than leave one missing.
 */

import type { FactorInput } from "./emissions";

/**
 * One factor row a record could be calculated against, with the set window and
 * the provenance the tie-break reads.
 *
 * The candidates handed to {@link selectFactorForDate} all share one
 * `(source, source_row_id)` — the publisher's stable row identity, which is how
 * a tenant's single choice per `(category, unit)` travels to another year's
 * revision of the same row.
 */
export type FactorCandidate = {
  factor: FactorInput;
  /** The set's activity window, as `YYYY-MM-DD` strings. */
  effectiveFrom: string;
  effectiveTo: string;
  setId: string;
  /** `null` is published reference data shared by every tenant; non-null is a
      set this customer supplied under its own licence. */
  setOrganizationId: string | null;
  publicationYear: number;
  setCreatedAt: Date;
};

/**
 * Does this window contain the date?
 *
 * Both sides are `YYYY-MM-DD` from a `date(..., { mode: "string" })` column, so
 * the comparison is lexicographic and **no `Date` is constructed** — parsing
 * would introduce a timezone into data that has none, which is the same reason
 * `monthOf` slices rather than parses. Inclusive at both ends: DEFRA's windows
 * are stated as whole calendar years and `2026-12-31` is inside 2026.
 */
export function covers(
  window: Pick<FactorCandidate, "effectiveFrom" | "effectiveTo">,
  activityDate: string,
): boolean {
  return (
    window.effectiveFrom <= activityDate && activityDate <= window.effectiveTo
  );
}

/**
 * The four fields {@link preferCandidate} reads, and nothing else.
 *
 * A caller that is choosing between rows rather than calculating with them —
 * `seedDefaultMappings` picking one row per `source_row_id` — has the set's
 * provenance and no window, so the tie-break is typed against what it actually
 * needs. {@link FactorCandidate} satisfies it.
 */
export type CandidateProvenance = Pick<
  FactorCandidate,
  "setId" | "setOrganizationId" | "publicationYear" | "setCreatedAt"
>;

/**
 * Which of several covering sets wins — **a total order, because it decides a
 * filed number.**
 *
 * Decided with the user on 12 Aug 2026 (`docs/backend.md`, prompt 68):
 *
 * 1. **Tenant-owned before published.** A customer supplying a set under its own
 *    licence is a deliberate act, and the alternative — published always wins —
 *    would make the custom-factor-set surface unable to supply a year the
 *    published data does not cover.
 * 2. **`publicationYear` descending.** Two sets covering the same date is a
 *    republication; the later one is the publisher's current word on it.
 * 3. **The set's `createdAt` descending**, then
 * 4. **the set's id ascending.**
 *
 * Steps 3 and 4 exist so no tie is ever left to arrival order. A figure that
 * moves between two runs over unchanged data, for no recorded reason, is exactly
 * what this ordering is written to prevent.
 */
export function preferCandidate(
  a: CandidateProvenance,
  b: CandidateProvenance,
): number {
  const published = (candidate: CandidateProvenance) =>
    candidate.setOrganizationId === null ? 1 : 0;
  return (
    published(a) - published(b) ||
    b.publicationYear - a.publicationYear ||
    b.setCreatedAt.getTime() - a.setCreatedAt.getTime() ||
    a.setId.localeCompare(b.setId)
  );
}

/**
 * One winner per `source_row_id`, chosen by {@link preferCandidate}.
 *
 * **The seeder and the resolver agree by construction.** Two published sets are
 * now loaded, so a publisher's stable row identity returns one row per set, and
 * "which of those does a new organisation's default name" is the same question
 * {@link selectFactorForDate} answers for a date it must resolve. Reusing the
 * one total order is what makes the two answers the same answer; an `ORDER BY`
 * restating its four tiers in SQL would be a second copy of a rule that decides
 * a filed number's provenance.
 *
 * Because that order is total, the winner does not depend on the input's
 * sequence — the comparison is strict, so an equally-ranked later row never
 * displaces an earlier one, and no two distinct rows rank equally.
 *
 * A `source_row_id` no candidate carries is simply absent from the map, which
 * is what keeps a default naming a row the visible sets do not contain from
 * seeding anything.
 */
export function preferredBySourceRow<
  T extends CandidateProvenance & { sourceRowId: string },
>(candidates: readonly T[]): Map<string, T> {
  const winners = new Map<string, T>();
  for (const candidate of candidates) {
    const held = winners.get(candidate.sourceRowId);
    if (held === undefined || preferCandidate(candidate, held) < 0) {
      winners.set(candidate.sourceRowId, candidate);
    }
  }
  return winners;
}

/**
 * The publisher's row identity a candidate carries, plus the one it declares it
 * restates — prompt 71.
 *
 * `supersedes*` is a **pair, both or neither**, which the database enforces with
 * a check constraint. A row that declares one half is a row that supersedes
 * nothing, and {@link factorSiblingKeys} treats it that way rather than
 * inventing the missing half.
 */
export type FactorRowIdentity = {
  source: string;
  sourceRowId: string;
  supersedesSource?: string | null;
  supersedesSourceRowId?: string | null;
};

/**
 * Every `(source, source_row_id)` a row is reachable under — **the keying rule
 * that closes prompt 71's gap.**
 *
 * A mapping names one published `(source, source_row_id)`, and the resolver
 * looks its candidates up under exactly that pair. A customer-supplied row lives
 * in a set carrying the customer's own `source` and holds a hashed `custom:` row
 * id, so filing it under its own pair alone leaves it unreachable no matter how
 * wide the query that loaded it — widening the query is necessary and is not
 * sufficient.
 *
 * So a row is filed under **both**: its own pair, so a mapping pointing directly
 * at it still finds its siblings, and the declared pair, so a mapping pointing at
 * the published row it restates finds it too. Identical pairs collapse to one
 * key, because a duplicate would only make the same candidate compete with
 * itself.
 *
 * It is here rather than in `lib/db/` for the reason the module docblock gives:
 * it decides which value multiplies a customer's activity, and `lib/db/` is
 * `server-only` and outside `npm test`'s scope.
 */
export function factorSiblingKeys(
  row: FactorRowIdentity,
): { source: string; sourceRowId: string }[] {
  const keys = [{ source: row.source, sourceRowId: row.sourceRowId }];

  const { supersedesSource, supersedesSourceRowId } = row;
  if (
    supersedesSource != null &&
    supersedesSourceRowId != null &&
    !(
      supersedesSource === row.source &&
      supersedesSourceRowId === row.sourceRowId
    )
  ) {
    keys.push({
      source: supersedesSource,
      sourceRowId: supersedesSourceRowId,
    });
  }

  return keys;
}

/**
 * The factor to calculate this record with, or `null` for out-of-period.
 *
 * `null` is the fourth of the engine's five refusals reaching this module: the
 * pair **is** mapped, and no visible set's window contains the activity date.
 * The caller turns it into `{ ok: false, gap: "out_of_period" }`.
 *
 * **The mapped row's own set is checked first and wins outright.** The tenant's
 * explicit choice is the answer for the year it was made for, the fast path
 * costs nothing, and it is the one place a superseded set still calculates — a
 * mapping is a deliberate choice and superseding a set does not un-make it.
 *
 * `siblings` may include `mapped` itself; a duplicate cannot change the outcome,
 * because the fast path has already returned by then.
 *
 * `mapped` is asked for **only its window and its factor**, and the narrow type
 * says so: a row that wins outright never enters the tie-break, so its
 * publication year and ownership are not inputs to this decision.
 */
export function selectFactorForDate(
  mapped: Pick<FactorCandidate, "factor" | "effectiveFrom" | "effectiveTo">,
  siblings: readonly FactorCandidate[],
  activityDate: string,
): FactorInput | null {
  if (covers(mapped, activityDate)) return mapped.factor;

  const covering = siblings.filter((sibling) => covers(sibling, activityDate));
  if (covering.length === 0) return null;

  return [...covering].sort(preferCandidate)[0].factor;
}

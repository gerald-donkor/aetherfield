/**
 * Pure ordering and wording labels for PostgreSQL trigram matches.
 *
 * This module sees only ids and similarity scores. It has no database handle, no
 * network access and no implicit clock, and it never selects or applies a
 * factor. A person still chooses through the existing mapping action.
 */

export const FACTOR_MATCH_BANDS = ["close", "weak"] as const;
export type FactorMatchBand = (typeof FACTOR_MATCH_BANDS)[number];

export type FactorMatchScore = {
  id: string;
  similarity: number;
};

export type RankedFactorMatch = FactorMatchScore & {
  score: number;
  band: FactorMatchBand;
};

/** The publisher-label projection used by the picker and fuzzy query. */
export function factorMatchSourceText(
  parts: readonly (string | null)[],
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * A judged threshold, not a measurement or probability. PostgreSQL similarity
 * is character-trigram overlap, so the UI calls the lower band weak wording
 * and keeps it visible for review rather than treating it as a default.
 */
export function factorMatchBand(score: number): FactorMatchBand {
  return score >= 0.1 ? "close" : "weak";
}

export function rankFactorMatches(
  candidates: readonly FactorMatchScore[],
): RankedFactorMatch[] {
  return candidates
    .map((candidate) => {
      const score = Math.max(0, Math.min(1, candidate.similarity));
      return {
        ...candidate,
        score,
        band: factorMatchBand(score),
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

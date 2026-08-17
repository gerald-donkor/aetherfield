import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_UNITS,
  type ActivityCategory,
  type ActivityUnit,
} from "../../../lib/validation/activity";
import type { Scope2MarketBasis } from "../../../lib/validation/emissions";

/**
 * How `/activity/mappings` encodes and reads its selection — which pair, which
 * reporting lane, and which rung of the market-based hierarchy.
 *
 * Moved out of `app/activity/mappings/page.tsx` by prompt 120. It is one concern
 * and it had been eight loose top-level declarations: the page reads the query
 * string through it and the coverage list and the picker panel write links with
 * it, so the encoding and the decoding stay in the same file and cannot drift
 * apart.
 *
 * **Nothing here trusts the query string, and nothing here needs to.** A forged
 * `lane` or `basis` selects the lane or the basis a reporter would have got
 * anyway, and the action re-derives both from its own input and re-checks the
 * factor against them before writing (AGENTS.md 6.2).
 */

export function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function isCategory(value: string): value is ActivityCategory {
  return ACTIVITY_CATEGORIES.includes(value as ActivityCategory);
}

export function isUnit(value: string): value is ActivityUnit {
  return ACTIVITY_UNITS.includes(value as ActivityUnit);
}

export function label(value: string): string {
  return value.replaceAll("_", " ");
}

/** The lane, as it travels in the query string. `market` is the only value that
    means anything other than the default lane, and anything else reads as the
    default — a forged value selects the lane a reporter would have got anyway,
    and the action re-derives it from its own input regardless. */
export type Lane = "market_based" | null;

export function laneOf(value: string): Lane {
  return value === "market" ? "market_based" : null;
}

/** The basis, on the same footing as the lane — prompt 86. `fallback` is the
    only value that means anything other than a contractual instrument, and
    anything else reads as the contractual basis, which is the one a reporter
    reaching the market lane would have got anyway. The action re-derives it
    from its own input and re-checks the factor against it regardless. */
export function basisOf(value: string): Scope2MarketBasis {
  return value === "fallback" ? "grid_average" : "contractual_instrument";
}

export function pairHref(
  category: ActivityCategory,
  unit: ActivityUnit,
  q = "",
  lane: Lane = null,
  basis: Scope2MarketBasis = "contractual_instrument",
): string {
  const params = new URLSearchParams({ category, unit });
  if (q.trim() !== "") params.set("q", q.trim());
  if (lane === "market_based") {
    params.set("lane", "market");
    if (basis === "grid_average") params.set("basis", "fallback");
  }
  return `/activity/mappings?${params.toString()}`;
}

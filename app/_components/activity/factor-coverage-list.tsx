import Link from "next/link";

import {
  offersMarketLane,
  type ActivityCategory,
  type ActivityUnit,
} from "../../../lib/validation/activity";
import {
  SCOPE2_MARKET_BASIS_LABELS,
  type Scope2MarketBasis,
} from "../../../lib/validation/emissions";
import { label, pairHref } from "./mapping-selection";

/**
 * Every committed category-and-unit pair, the factor mapped to it, and what is
 * still missing. Moved out of `app/activity/mappings/page.tsx` by prompt 120,
 * together with the market-based lane it renders beside each eligible pair.
 *
 * **A Server Component, and it fetches nothing.** The coverage rows, the market
 * mappings and the current selection all arrive as props; the page owns the reads
 * (AGENTS.md 6.2). Its props are structural rather than the query layer's row
 * types on purpose — this file needs no `lib/db` import at all, so nothing about
 * how the rows are read can reach it.
 *
 * **Three things a pair can be, and the list says which**: unmapped, mapped, and
 * mapped but dated outside every loaded factor set's activity dates. The third
 * is the one that reads as covered if it is not stated, so it is stated.
 */

/** The mapping a pair carries, on either lane. */
type CoverageMapping = {
  factorLabel: string;
  source: string;
  datasetVersion: string;
  customerSupplied: boolean;
  chosenBy: string | null;
};

type CoveragePair = {
  category: ActivityCategory;
  unit: ActivityUnit;
  recordCount: number;
  outOfPeriodRecords: number;
  mapping: CoverageMapping | null;
};

type MarketMapping = CoverageMapping & { basis: Scope2MarketBasis };

export function FactorCoverageList({
  coverage,
  selected,
  marketByPair,
}: {
  coverage: readonly CoveragePair[];
  selected: { category: ActivityCategory; unit: ActivityUnit } | null;
  marketByPair: ReadonlyMap<string, MarketMapping>;
}) {
  return (
    <section aria-labelledby="factor-coverage-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <h2
          id="factor-coverage-heading"
          className="font-sans text-[28px] leading-8 font-bold"
        >
          Coverage
        </h2>
        <p className="font-mono text-caption text-muted">
          Unmapped first
        </p>
      </div>
      <ul aria-label="Activity pairs and mapped factors">
        {coverage.map((pair) => {
          const current =
            selected?.category === pair.category &&
            selected.unit === pair.unit;
          return (
            <li
              key={`${pair.category}.${pair.unit}`}
              className={`border-b border-border py-5 first:border-t ${
                current ? "border-l-2 border-l-ink pl-4" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-sans text-[17px] leading-6 font-bold text-ink">
                    {label(pair.category)} · {pair.unit}
                  </p>
                  <p className="mt-2 font-mono text-[11px] leading-[18px] text-muted">
                    {pair.recordCount.toLocaleString("en-GB")}{" "}
                    {pair.recordCount === 1 ? "record" : "records"}
                  </p>
                </div>
                <Link
                  href={pairHref(pair.category, pair.unit)}
                  aria-current={current ? "true" : undefined}
                  className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {pair.mapping ? "Change" : "Map factor"}
                </Link>
              </div>
              {pair.mapping ? (
                <div className="mt-4">
                  <p className="wrap-anywhere font-serif text-[16px] leading-6 text-ink">
                    {pair.mapping.factorLabel}
                  </p>
                  <p className="mt-2 font-mono text-[11px] leading-[18px] text-muted">
                    {pair.mapping.source}{" "}
                    {pair.mapping.datasetVersion}
                    {pair.mapping.customerSupplied
                      ? " · customer-supplied"
                      : ""}
                    {pair.mapping.chosenBy
                      ? ` · chosen by ${pair.mapping.chosenBy}`
                      : " · seeded default"}
                  </p>
                  {/* Mapped and still contributing nothing. Without
                      this the pair reads as covered. */}
                  {pair.outOfPeriodRecords > 0 ? (
                    <p className="mt-3 max-w-[34rem] border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
                      {`${pair.outOfPeriodRecords.toLocaleString(
                        "en-GB",
                      )} of ${
                        pair.recordCount === pair.outOfPeriodRecords
                          ? "these"
                          : "them"
                      } fall outside every loaded factor set's activity dates and produce no figure.`}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 max-w-[34rem] font-serif text-[16px] leading-6 text-muted">
                  No factor is mapped, so records in this pair do not
                  contribute to the emissions total.
                </p>
              )}
              {/* The market-based lane — prompt 85. Shown beside the
                  grid-average mapping, never in place of it: the Scope
                  2 Guidance asks for both figures, and a pair with no
                  contractual rate says so rather than borrowing the
                  grid average. */}
              {offersMarketLane(pair.category) ? (
                <MarketLane
                  mapping={
                    marketByPair.get(
                      `${pair.category}.${pair.unit}`,
                    ) ?? null
                  }
                  /* "Change rate" lands on the basis the pair is
                     already mapped under, so changing a fallback does
                     not silently offer a contractual list. */
                  href={pairHref(
                    pair.category,
                    pair.unit,
                    "",
                    "market_based",
                    marketByPair.get(`${pair.category}.${pair.unit}`)
                      ?.basis ?? "contractual_instrument",
                  )}
                  fallbackHref={pairHref(
                    pair.category,
                    pair.unit,
                    "",
                    "market_based",
                    "grid_average",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One pair's market-based lane — prompt 85, extended by prompt 86.
 *
 * **Three states, and the panel says which**: a mapped contractual rate, a
 * mapped grid-average fallback, and an unmapped lane. None of them reads as an
 * error — an absent market-based rate is the expected state for most reporters.
 *
 * **The fallback is a second, separately-worded choice, never a toggle that
 * silently changes what the picker returns.** It is the Scope 2 Guidance's
 * rung 5, and offering it wordlessly beside rung 1–3 would be exactly the
 * silent substitution prompt 85's D5 refuses. So it is named, its consequence
 * is stated in the same sentence as the offer, and choosing it records an
 * assertion rather than picking a filter.
 */
function MarketLane({
  mapping,
  href,
  fallbackHref,
}: {
  mapping: {
    basis: Scope2MarketBasis;
    factorLabel: string;
    source: string;
    datasetVersion: string;
    customerSupplied: boolean;
    chosenBy: string | null;
  } | null;
  href: string;
  fallbackHref: string;
}) {
  const fallback = mapping?.basis === "grid_average";
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="font-mono text-[11px] leading-[16px] text-muted uppercase">
          Market-based lane
        </p>
        <Link
          href={href}
          className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {mapping ? "Change rate" : "Map a rate"}
        </Link>
      </div>
      {mapping ? (
        <>
          <p className="mt-3 wrap-anywhere font-serif text-[16px] leading-6 text-ink">
            {mapping.factorLabel}
          </p>
          <p className="mt-2 font-mono text-[11px] leading-[18px] text-muted">
            {SCOPE2_MARKET_BASIS_LABELS[mapping.basis]} ·{" "}
            {mapping.source} {mapping.datasetVersion}
            {mapping.customerSupplied ? " · customer-supplied" : ""}
            {mapping.chosenBy ? ` · chosen by ${mapping.chosenBy}` : ""}
          </p>
          {fallback ? (
            <p className="mt-3 max-w-[34rem] border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
              This pair&apos;s market-based figure is a grid average, recorded
              as the hierarchy&apos;s rung 5. It is labelled as a fallback
              wherever it is shown and in the report&apos;s caveats. Map a
              contractual rate to replace it.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[34rem] font-serif text-[16px] leading-6 text-muted">
            No market-based rate is mapped, so this pair contributes to the
            location-based figure only. Nothing is substituted for it.
          </p>
          <p className="mt-3 max-w-[34rem] font-serif text-[16px] leading-6 text-muted">
            If you hold no contract, certificate or supplier rate for this
            consumption, you can report the grid average on the market lane as
            the hierarchy&apos;s rung 5. It is a statement that no better
            instrument exists, it is labelled as a fallback everywhere it
            appears, and it does not make the market-based figure comparable to
            a procured one.{" "}
            <Link
              href={fallbackHref}
              className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Use the grid-average fallback
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import type { ComponentProps } from "react";

import {
  offersMarketLane,
  type ActivityCategory,
  type ActivityUnit,
} from "../../../lib/validation/activity";
import type { Scope2MarketBasis } from "../../../lib/validation/emissions";
import { Button } from "../primitives";
import { FactorPicker } from "./factor-picker";
import { label, pairHref, type Lane } from "./mapping-selection";

/**
 * Choosing the factor for the selected pair — the heading that says which choice
 * is being made, the prose that says what the list holds, the links to the other
 * lane and the other basis, and the search form. Moved out of
 * `app/activity/mappings/page.tsx` by prompt 120.
 *
 * **A Server Component wrapping the one client leaf**, exactly as the page did.
 * The search `<form method="get">` is passed to `FactorPicker` as `children`, so
 * it stays server-rendered and searching remains a navigation the page re-reads —
 * the leaf owns only the mutation state (AGENTS.md 8.1). Nothing here fetches:
 * the rows arrive already searched.
 *
 * **The factor rows are typed off `FactorPicker`'s own prop**, not off the query
 * layer. `FactorPicker` is component-only and exports no type (the bundle rule),
 * and reading its prop type back keeps this file free of any `lib/db` import.
 *
 * **The two bases are two choices, not a filter toggle.** Each link says what the
 * other one asserts, because reporting a grid average on the market lane is a
 * statement about what instruments exist and not a way to narrow a list.
 */

export function FactorChoicePanel({
  selected,
  lane,
  basis,
  search,
}: {
  selected: { category: ActivityCategory; unit: ActivityUnit };
  lane: Lane;
  basis: Scope2MarketBasis;
  search: {
    q: string;
    factors: ComponentProps<typeof FactorPicker>["factors"];
    message: string;
    invalid: boolean;
    lexicalOnly: boolean;
  };
}) {
  return (
    <section aria-labelledby="factor-picker-heading">
      <h2
        id="factor-picker-heading"
        className="font-sans text-[28px] leading-8 font-bold"
      >
        {lane !== "market_based"
          ? "Choose a factor"
          : basis === "grid_average"
            ? "Choose a grid-average factor as the fallback"
            : "Choose a market-based rate"}
      </h2>
      <p className="mt-4 max-w-[700px] font-serif text-p2 text-muted">
        {lane !== "market_based"
          ? `Showing factors whose denominator can calculate activity measured in ${selected.unit}. Search the publisher level and column descriptions to narrow the list.`
          : basis === "grid_average"
            ? `Showing scope 2 grid-average factors whose denominator can calculate activity measured in ${selected.unit} — the same published factors the location-based lane uses. Choosing one records that no contract, certificate or supplier rate covers this consumption, and reports the grid average on the market lane as the hierarchy's rung 5. It is labelled as a fallback on every surface and in the report's caveats.`
            : `Showing scope 2 factors recorded as market-based whose denominator can calculate activity measured in ${selected.unit}. A market-based rate comes from a contract, a supplier disclosure or an energy attribute certificate you hold. Add one under Add customer factor if the rate you need is not listed.`}
      </p>
      {offersMarketLane(selected.category) ? (
        <p className="mt-4 font-sans text-nav font-bold">
          <Link
            href={pairHref(
              selected.category,
              selected.unit,
              "",
              lane === "market_based" ? null : "market_based",
            )}
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {lane === "market_based"
              ? "Choose the location-based factor instead"
              : "Choose the market-based rate instead"}
          </Link>
          {/* The two bases are two choices, not a filter toggle: each
              link says what the other one asserts. */}
          {lane === "market_based" ? (
            <>
              <span className="mx-4 font-mono text-caption text-muted">
                /
              </span>
              <Link
                href={pairHref(
                  selected.category,
                  selected.unit,
                  "",
                  "market_based",
                  basis === "grid_average"
                    ? "contractual_instrument"
                    : "grid_average",
                )}
                className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {basis === "grid_average"
                  ? "Map a contractual rate instead"
                  : "Use the grid-average fallback instead"}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <FactorPicker
        category={selected.category}
        unit={selected.unit}
        lane={lane}
        basis={basis}
        factors={search.factors}
        searchMessage={search.message}
        searchInvalid={search.invalid}
      >
        <form method="get" className="mt-8 border-y border-border py-6">
          <input
            type="hidden"
            name="category"
            value={selected.category}
          />
          <input type="hidden" name="unit" value={selected.unit} />
          {/* Without this the search would drop the reporter back to
              the default lane on every submit. */}
          {lane === "market_based" ? (
            <input type="hidden" name="lane" value="market" />
          ) : null}
          {/* And the basis with it, for the same reason. */}
          {lane === "market_based" && basis === "grid_average" ? (
            <input type="hidden" name="basis" value="fallback" />
          ) : null}
          <label
            htmlFor="factor-search"
            className="block font-sans text-nav font-bold text-ink"
          >
            Search factors for {label(selected.category)} ·{" "}
            {selected.unit}
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              id="factor-search"
              name="q"
              defaultValue={search.q}
              maxLength={120}
              className="h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)]"
              placeholder="Diesel, electricity, landfill..."
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                name="mode"
                value="lexical"
                bullet={false}
              >
                Search exact text
              </Button>
              {search.lexicalOnly ? null : (
                <Button
                  type="submit"
                  name="mode"
                  value="fuzzy"
                  size="secondary"
                  bullet={false}
                >
                  Find close wording
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 max-w-[40rem] font-mono text-[11px] leading-[18px] text-muted">
            {search.lexicalOnly
              ? "This list holds only the market-based rates recorded in this workspace, so it is searched by exact text."
              : "Close-wording search compares character groups in this database. It can help with misspellings, but it can miss synonyms and does not choose a factor for you."}
          </p>
        </form>
      </FactorPicker>
    </section>
  );
}

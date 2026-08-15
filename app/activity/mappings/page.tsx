import type { Metadata } from "next";
import Link from "next/link";

import { FactorPicker } from "../../_components/activity/factor-picker";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { Button } from "../../_components/primitives";
import { WorkspaceNav } from "../../_components/workspace-nav";
import { requireOrganization } from "../../../lib/auth/organization";
import {
  type FactorSearchRow,
  listFactorCoverage,
  listFactorSets,
  listMarketBasedMappings,
  searchFactorsByWording,
  searchFactorsForPair,
} from "../../../lib/db/emission-queries";
import {
  rankFactorMatches,
  type RankedFactorMatch,
} from "../../../lib/domain/factor-match";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_UNITS,
  factorSearchSchema,
  offersMarketLane,
  type ActivityCategory,
  type ActivityUnit,
} from "../../../lib/validation/activity";
import {
  SCOPE2_MARKET_BASIS_LABELS,
  type Scope2MarketBasis,
} from "../../../lib/validation/emissions";

/**
 * The factor-mapping surface — prompt 65.
 *
 * A Server Component owns the read path: tenant resolution, coverage grouping
 * and factor search. The one client leaf below owns only the mutation state, and
 * the action re-resolves the tenant and the factor before writing. No
 * organisation id crosses from the browser.
 *
 * The route is deliberately not a top-level `WorkspaceNav` tab. It is an
 * Activity sub-flow: a reporter comes here from the coverage line or the
 * Activity page when committed records are outside the current mapping.
 */

export const metadata: Metadata = {
  title: "Emission factors — Aetherfield",
  description: "Review and change the emission factor mapped to each activity pair.",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

type PresentedFactor = FactorSearchRow & {
  exactTextMatch?: boolean;
  wordingMatch?: Pick<RankedFactorMatch, "band">;
};

type SearchPresentation = {
  factors: PresentedFactor[];
  message: string;
  invalid: boolean;
  /** Whether close-wording ranking is offered for this lane and basis — see
      {@link presentSearch}, which derives it. The form reads it rather than
      re-deriving the rule beside the button. */
  lexicalOnly: boolean;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isCategory(value: string): value is ActivityCategory {
  return ACTIVITY_CATEGORIES.includes(value as ActivityCategory);
}

function isUnit(value: string): value is ActivityUnit {
  return ACTIVITY_UNITS.includes(value as ActivityUnit);
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

/** The lane, as it travels in the query string. `market` is the only value that
    means anything other than the default lane, and anything else reads as the
    default — a forged value selects the lane a reporter would have got anyway,
    and the action re-derives it from its own input regardless. */
type Lane = "market_based" | null;

function laneOf(value: string): Lane {
  return value === "market" ? "market_based" : null;
}

/** The basis, on the same footing as the lane — prompt 86. `fallback` is the
    only value that means anything other than a contractual instrument, and
    anything else reads as the contractual basis, which is the one a reporter
    reaching the market lane would have got anyway. The action re-derives it
    from its own input and re-checks the factor against it regardless. */
function basisOf(value: string): Scope2MarketBasis {
  return value === "fallback" ? "grid_average" : "contractual_instrument";
}

function pairHref(
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

async function presentSearch(
  organizationId: string,
  unit: ActivityUnit,
  rawQ: string,
  rawMode: string,
  lane: Lane,
  basis: Scope2MarketBasis,
): Promise<SearchPresentation & { q: string; mode: "lexical" | "fuzzy" }> {
  const checked = factorSearchSchema.safeParse({ q: rawQ, mode: rawMode });
  if (!checked.success) {
    const issue =
      checked.error.issues[0]?.message ?? "Check the search and try again.";
    return {
      q: rawQ.slice(0, 120),
      mode: rawMode === "fuzzy" ? "fuzzy" : "lexical",
      factors: [],
      message: issue,
      invalid: true,
      lexicalOnly: lane === "market_based" && basis !== "grid_average",
    };
  }

  const { q, mode: requested } = checked.data;
  /* **The contractual basis is lexical only; the fallback is not** — prompt 85,
     re-derived by prompt 86 rather than copied either way.

     Prompt 85 gave two reasons for refusing close-wording ranking on the market
     lane, and prompt 86 removes one and finds the other does not hold on the
     new basis. The removed one: `searchFactorsByWording` had no lane predicate,
     so it would have offered rows the action refuses — it takes the lane and
     the basis now, through the same `marketLaneScope` predicate the lexical
     picker uses. The one that does not carry over: a contractual rate is one of
     the handful this tenant entered itself, and ranking a list a reporter can
     read whole helps nobody — but rung 5's candidates are the same thousands of
     published scope 2 rows the default lane searches, which is the haystack
     close-wording ranking was built for. So it stays off for the contractual
     basis and is offered for the fallback. */
  const lexicalOnly = lane === "market_based" && basis !== "grid_average";
  const mode = lexicalOnly ? ("lexical" as const) : requested;
  const lexical = await searchFactorsForPair(
    organizationId,
    unit,
    q,
    lane,
    basis,
  );
  if (mode === "lexical") {
    return {
      q,
      mode,
      factors:
        q === ""
          ? lexical
          : lexical.map((factor) => ({ ...factor, exactTextMatch: true })),
      message: "",
      invalid: false,
      lexicalOnly,
    };
  }

  const fuzzy = await searchFactorsByWording(
    organizationId,
    unit,
    q,
    lane,
    basis,
  );
  const ranked = rankFactorMatches(
    fuzzy.map((factor) => ({
      id: factor.id,
      similarity: factor.similarity,
    })),
  );
  const fuzzyById = new Map(fuzzy.map((factor) => [factor.id, factor]));
  const exactIds = new Set(lexical.map((factor) => factor.id));
  const exact = lexical.map((factor) => ({
    ...factor,
    exactTextMatch: true,
  }));
  const wordingMatches = ranked
    .filter((match) => !exactIds.has(match.id))
    .flatMap((match) => {
      const factor = fuzzyById.get(match.id);
      return factor
        ? [
            {
              ...factor,
              wordingMatch: { band: match.band },
            },
          ]
        : [];
    });
  return {
    q,
    mode,
    factors: [...exact, ...wordingMatches],
    message:
      "Close-wording ranking compares character groups and can miss synonyms. Review every factor's source, dataset version, licence, unit, value, scope and gas before choosing.",
    invalid: false,
    lexicalOnly,
  };
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

export default async function ActivityMappingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const membership = await requireOrganization("/activity/mappings");
  const query = await searchParams;
  const [coverage, sets, marketMappings] = await Promise.all([
    listFactorCoverage(membership.organization.id),
    listFactorSets(membership.organization.id),
    listMarketBasedMappings(membership.organization.id),
  ]);
  const marketByPair = new Map(
    marketMappings.map((mapping) => [
      `${mapping.category}.${mapping.unit}`,
      mapping,
    ]),
  );

  const requestedCategory = first(query.category);
  const requestedUnit = first(query.unit);
  const requested =
    isCategory(requestedCategory) && isUnit(requestedUnit)
      ? { category: requestedCategory, unit: requestedUnit }
      : null;
  const selected =
    requested ??
    coverage.find((pair) => pair.mapping === null) ??
    coverage[0] ??
    null;
  /* The market lane is only ever selected on a category that has one. A `lane`
     parameter on any other pair reads as the default lane rather than as an
     error: it selects the lane the reporter would have got anyway. */
  const lane: Lane =
    selected && offersMarketLane(selected.category)
      ? laneOf(first(query.lane))
      : null;
  /* And the basis, under the same rule: it is read only where the lane is, and
     a forged value selects the contractual basis a reporter reaching the market
     lane would have got anyway. */
  const basis: Scope2MarketBasis =
    lane === "market_based"
      ? basisOf(first(query.basis))
      : "contractual_instrument";
  const search = selected
    ? await presentSearch(
        membership.organization.id,
        selected.unit,
        first(query.q),
        first(query.mode),
        lane,
        basis,
      )
    : {
        q: "",
        mode: "lexical" as const,
        factors: [],
        message: "",
        invalid: false,
        lexicalOnly: false,
      };

  const unmapped = coverage.filter((pair) => pair.mapping === null).length;
  const recordsBehindGaps = coverage
    .filter((pair) => pair.mapping === null)
    .reduce((total, pair) => total + pair.recordCount, 0);
  /* A mapped pair can still contribute nothing, if its records are dated
     outside every window the mapped row is published in. Prompt 68 — before
     it, such a pair read as fully covered here. */
  const recordsOutOfPeriod = coverage.reduce(
    (total, pair) => total + pair.outOfPeriodRecords,
    0,
  );

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="activity" />
        <p className="font-mono text-caption text-muted">EMISSION FACTORS</p>
        <h1 className="mt-6 max-w-[900px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          Map each activity pair to the factor it should calculate with.
        </h1>
        <p className="mt-7 max-w-[760px] font-serif text-p2 text-muted">
          {membership.organization.name} has{" "}
          {coverage.length.toLocaleString("en-GB")} committed category and unit{" "}
          {coverage.length === 1 ? "pair" : "pairs"} in use.{" "}
          {unmapped === 0
            ? "Every pair has a current factor mapping."
            : `${unmapped.toLocaleString("en-GB")} ${
                unmapped === 1 ? "pair is" : "pairs are"
              } unmapped, covering ${recordsBehindGaps.toLocaleString("en-GB")} committed ${
                recordsBehindGaps === 1 ? "record" : "records"
              }.`}
        </p>
        {recordsOutOfPeriod > 0 ? (
          <p className="mt-4 max-w-[760px] font-serif text-p2 text-muted">
            {`${recordsOutOfPeriod.toLocaleString("en-GB")} mapped ${
              recordsOutOfPeriod === 1 ? "record is" : "records are"
            } dated outside every loaded factor set's activity dates, so ${
              recordsOutOfPeriod === 1 ? "it contributes" : "they contribute"
            } nothing. A factor is chosen by the date the activity happened, not by today's date. Add the factor set for that year to bring ${
              recordsOutOfPeriod === 1 ? "it" : "them"
            } in.`}
          </p>
        ) : null}
        <p className="mt-5">
          <Link
            href="/activity"
            className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to activity
          </Link>
          <span className="mx-4 font-mono text-caption text-muted">/</span>
          <Link
            href="/activity/factors"
            className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Add customer factor
          </Link>
        </p>

        {coverage.length === 0 ? (
          <section className="mt-16 border-y border-border py-14">
            <h2 className="font-sans text-[24px] leading-7 font-bold">
              No committed activity records yet.
            </h2>
            <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
              Commit an import first. The category and unit pairs from those
              records will appear here.
            </p>
          </section>
        ) : (
          <div className="mt-16 grid gap-12 xl:grid-cols-[0.9fr_1.3fr] xl:items-start">
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

            {selected ? (
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
            ) : null}
          </div>
        )}

        {sets.length > 0 ? (
          <p className="mt-16 max-w-[760px] font-mono text-[11px] leading-[18px] text-muted">
            {sets.map((set) => (
              <span key={set.id} className="block">
                Emission factors: {set.source} {set.datasetVersion} (
                {set.factorCount.toLocaleString("en-GB")} factors).{" "}
                {set.licenceUrl ? (
                  <>
                    Contains public sector information licensed under the{" "}
                    <a
                      href={set.licenceUrl}
                      className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {set.licence}
                    </a>
                    .
                  </>
                ) : (
                  <>
                    {set.licence}
                    {set.sourceReference ? ` · ${set.sourceReference}` : ""}.
                  </>
                )}
              </span>
            ))}
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { FactorChoicePanel } from "../../_components/activity/factor-choice-panel";
import { FactorCoverageList } from "../../_components/activity/factor-coverage-list";
import {
  basisOf,
  first,
  isCategory,
  isUnit,
  laneOf,
  type Lane,
} from "../../_components/activity/mapping-selection";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { WorkspaceNav } from "../../_components/workspace-nav";
import { requireOrganization } from "../../../lib/auth/organization";
import {
  listFactorCoverage,
  listMarketBasedMappings,
} from "../../../lib/db/coverage-queries";
import { listFactorSets } from "../../../lib/db/factor-set-queries";
import {
  type FactorSearchRow,
  searchFactorsByWording,
  searchFactorsForPair,
} from "../../../lib/db/factor-search-queries";
import {
  rankFactorMatches,
  type RankedFactorMatch,
} from "../../../lib/domain/factor-match";
import {
  factorSearchSchema,
  offersMarketLane,
  type ActivityUnit,
} from "../../../lib/validation/activity";
import type { Scope2MarketBasis } from "../../../lib/validation/emissions";

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
 *
 * **The composition root.** Prompt 120 moved the coverage list with its
 * market-based lane, the factor-choice panel with its search form, and the
 * query-string vocabulary into `app/_components/activity/`. What stays here is
 * every read — `listFactorCoverage`, `listFactorSets`,
 * `listMarketBasedMappings` and `presentSearch`'s two factor searches — because
 * only a Server Component fetches this page's data and the page is where it is
 * fetched (AGENTS.md 6.2). Neither extracted component imports `lib/db` at all.
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
            <FactorCoverageList
              coverage={coverage}
              selected={selected}
              marketByPair={marketByPair}
            />

            {selected ? (
              <FactorChoicePanel
                selected={selected}
                lane={lane}
                basis={basis}
                search={search}
              />
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

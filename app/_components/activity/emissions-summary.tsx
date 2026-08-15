import Link from "next/link";

import {
  listEmissions,
  countOutOfPeriodRecords,
  countUncalculatedRecords,
  listFactorSets,
} from "../../../lib/db/emission-queries";
import { parseDecimal, toFixed } from "../../../lib/domain/decimal";
import { totalsOf, toTonnes, type RecordEmission } from "../../../lib/domain/emissions";
import {
  EMISSION_SCOPE_LABELS,
  SCOPE2_METHOD_LABELS,
  SCOPE3_CATEGORY_LABELS,
} from "../../../lib/validation/emissions";
import { RecalculateControl } from "./recalculate-control";

/**
 * The emissions total, its scope split, and its coverage — build step 10's
 * visible outcome.
 *
 * **A Server Component.** Only a Server Component fetches this data
 * (AGENTS.md 6.2), and every query it calls is predicated on the organisation
 * the membership row resolved. The only client code in the section is the
 * recalculate button, which is a leaf.
 *
 * ---
 *
 * ## Three rules this component exists to hold
 *
 * 1. **No total is ever presented as complete while records are uncalculated.**
 *    The coverage line renders beside the figure, always — not behind a
 *    disclosure, not only when something is wrong. A total over 40 of 100
 *    records is not a total, and saying so is the whole difference between this
 *    and a number that misleads a filing.
 * 2. **Biogenic and outside-of-scopes are shown separately and are never in the
 *    total.** The Corporate Standard requires biomass CO2 to be "reported
 *    separately"; `totalsOf` partitions them out and this renders them in their
 *    own block so no one reads them as part of the scope figures.
 * 3. **Every scope 2 figure carries its method, and both figures are shown.**
 *    The Scope 2 Guidance requires the method to travel with the number and
 *    requires dual reporting where contractual instruments exist. This
 *    docblock used to end "and this step produces location-based only";
 *    prompt 85 built the second lane, so it is corrected here rather than left
 *    standing (AGENTS.md 12 rule 8). The market-based figure is an addend of
 *    no total above it, and its coverage is stated beside it.
 *
 * **Attribution is rendered from the data, not hard-coded.** The Open
 * Government Licence requires it wherever the factors are surfaced, and reading
 * the licence and its URL off the set means a second dataset cannot make a
 * hard-coded line wrong.
 *
 * The read idiom — `Detail`, the bordered blocks, the register of the prose —
 * is `/activity`'s and `/submissions`', deliberately.
 */

/** Tonnes, to one decimal place. **The only rounding on the whole path**: the
    stored figure keeps every digit the arithmetic produced, and this is the
    presentation step (`lib/domain/decimal.ts`). */
function tonnes(kgCo2e: RecordEmission["kgCo2e"]): string {
  return toFixed(toTonnes(kgCo2e), 1);
}

export async function EmissionsSummary({
  organizationId,
  importId = null,
  headingId,
}: {
  organizationId: string;
  /** `null` summarises the organisation; an id scopes it to one import. */
  importId?: string | null;
  headingId: string;
}) {
  const [emissions, uncalculated, outOfPeriod, sets] = await Promise.all([
    listEmissions(organizationId, importId),
    countUncalculatedRecords(organizationId, importId),
    countOutOfPeriodRecords(organizationId, importId),
    listFactorSets(organizationId),
  ]);

  /* The persisted rows come back as decimal strings and are re-parsed into the
     exact representation before anything is summed — never through `Number`. */
  const parsed: RecordEmission[] = [];
  for (const row of emissions) {
    const value = parseStored(row.kgCo2e);
    if (!value) continue;
    parsed.push({
      recordId: row.recordId,
      activityDate: row.activityDate,
      kgCo2e: value,
      factorId: "",
      scope: row.scope,
      scope3Category: row.scope3Category,
      scope2Method: row.scope2Method,
      scope2MarketBasis: row.scope2MarketBasis,
      gwpSet: row.gwpSet,
      biogenic: row.biogenic,
      outsideOfScopes: row.outsideOfScopes,
      engineVersion: "",
    });
  }

  const totals = totalsOf(parsed);
  /* **The primary lane is what "a calculated record" means.** A record carrying
     a market-based figure as well is one record, not two, and counting the rows
     would overstate coverage by exactly the number of market-based figures
     (prompt 85). */
  const calculated = parsed.filter(
    (row) => row.scope2Method !== "market_based",
  ).length;
  const covered = calculated + uncalculated;
  const complete = uncalculated === 0 && calculated > 0;

  /* The location lane's own label. The market-based figure is rendered
     separately below and carries its own, so joining both methods into one
     label here would put "location-based, market-based" on a figure that is
     only one of them. */
  const scope2Label = SCOPE2_METHOD_LABELS.location_based;
  const marketBased = totals.scope2MarketBasedRecords > 0;
  /* Rung 5's share of that figure — prompt 86. Zero is the common case and it
     is a different statement from "no market-based figure at all". */
  const fallbackRecords = totals.scope2MarketBasedFallbackRecords;

  return (
    <section className="mt-20" aria-labelledby={headingId}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <h2 id={headingId} className="font-sans text-[28px] leading-8 font-bold">
          Emissions
        </h2>
        <p className="font-mono text-caption text-muted">
          Deterministic · tCO2e
        </p>
      </div>

      {calculated === 0 ? (
        <div className="border-y border-border py-14">
          <h3 className="font-sans text-[24px] leading-7 font-bold">
            {covered === 0
              ? "Nothing to calculate yet."
              : "These records have not been calculated."}
          </h3>
          <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
            {covered === 0
              ? "Commit an import and its emissions will be calculated here."
              : `${uncalculated.toLocaleString("en-GB")} committed ${
                  uncalculated === 1 ? "record is" : "records are"
                } waiting. Run a calculation to see the scope split and where the gaps are.`}
          </p>
          {outOfPeriod > 0 ? (
            <p className="mt-3 max-w-[34rem] font-mono text-[12px] leading-[18px]">
              {`${outOfPeriod.toLocaleString("en-GB")} of ${
                outOfPeriod === 1 ? "them is" : "them are"
              } mapped to a factor, but no loaded factor set covers the date the activity happened on. Load the factor set for that year to bring ${
                outOfPeriod === 1 ? "it" : "them"
              } into the total.`}
            </p>
          ) : null}
          <RecalculateControl importId={importId} className="mt-8" />
        </div>
      ) : (
        <>
          {/* Rule 1: the coverage line sits above the figure, not beside it as
              a footnote, and it is the first thing read. */}
          <div
            className={`border-l-2 py-1 pl-4 ${
              complete ? "border-border" : "border-ink"
            }`}
          >
            <p className="font-mono text-[12px] leading-[18px]">
              {complete
                ? `All ${calculated.toLocaleString("en-GB")} committed ${
                    calculated === 1 ? "record is" : "records are"
                  } included in this total.`
                : `${calculated.toLocaleString("en-GB")} of ${covered.toLocaleString(
                    "en-GB",
                  )} committed records are included. ${uncalculated.toLocaleString(
                    "en-GB",
                  )} ${
                    uncalculated === 1 ? "record has" : "records have"
                  } no calculated emission yet and contribute nothing to the figures below — this total is not complete.`}
            </p>
            {/* The one gap with a specific answer, named separately from the
                undifferentiated count above it: these records are mapped, and
                what is missing is the factor set for the year they happened
                in. Prompt 68. */}
            {outOfPeriod > 0 ? (
              <p className="mt-3 font-mono text-[12px] leading-[18px]">
                {`${
                  outOfPeriod === uncalculated
                    ? `All ${outOfPeriod.toLocaleString("en-GB")}`
                    : `${outOfPeriod.toLocaleString("en-GB")} of them`
                } ${
                  outOfPeriod === 1 ? "is" : "are"
                } mapped to a factor, but no loaded factor set covers the date the activity happened on. Load the factor set for that year to bring ${
                  outOfPeriod === 1 ? "it" : "them"
                } into the total.`}
              </p>
            ) : null}
            {!complete ? (
              <p className="mt-3 font-sans text-nav font-bold">
                <Link
                  href="/activity/mappings"
                  className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Review factor mappings
                </Link>
              </p>
            ) : null}
          </div>

          <dl className="mt-8 grid gap-6 border-y border-border py-7 md:grid-cols-4">
            <Figure label="Total, scopes 1-3" value={tonnes(totals.total)} lead />
            <Figure
              label={EMISSION_SCOPE_LABELS.scope_1}
              value={tonnes(totals.scope1)}
            />
            <Figure
              label={`${EMISSION_SCOPE_LABELS.scope_2} (${scope2Label})`}
              value={tonnes(totals.scope2)}
            />
            <Figure
              label={EMISSION_SCOPE_LABELS.scope_3}
              value={tonnes(totals.scope3)}
            />
          </dl>

          {/* Rule 3, made dual — prompt 85. The Scope 2 Guidance requires both
              figures where contractual instruments exist, and neither replaces
              the other in a total: this block sits beside the scope split
              rather than inside it, and states the market lane's own coverage
              so the second figure is never read as complete when it is not. */}
          {marketBased ? (
            <dl className="mt-6 grid gap-6 border-b border-border pb-7 md:grid-cols-2">
              <Figure
                label={`${EMISSION_SCOPE_LABELS.scope_2} (${SCOPE2_METHOD_LABELS.market_based})`}
                value={tonnes(totals.scope2MarketBased)}
                /* **This note used to end "and no grid average is substituted
                   for them", unconditionally.** Since prompt 86 a reporter can
                   map the grid average as an explicit rung-5 fallback, so the
                   claim is made only where it is true and the split is stated
                   where it is not (AGENTS.md 12 rule 8). */
                note={`Dual reporting. ${totals.scope2MarketBasedRecords.toLocaleString(
                  "en-GB",
                )} of ${totals.scope2Records.toLocaleString("en-GB")} scope 2 ${
                  totals.scope2Records === 1 ? "record has" : "records have"
                } a market-based rate mapped. ${
                  fallbackRecords === 0
                    ? "Records without one produce no market-based figure and no grid average is substituted for them."
                    : `Of those, ${fallbackRecords.toLocaleString("en-GB")} ${
                        fallbackRecords === 1 ? "rests" : "rest"
                      } on a grid-average factor chosen here as the hierarchy's rung 5, contributing ${tonnes(
                        totals.scope2MarketBasedFallback,
                      )} tCO2e. Records with no market-based rate mapped produce no market-based figure.`
                }`}
              />
              <Figure
                label="Total, scopes 1-3 (market-based)"
                value={tonnes(totals.totalMarketBased)}
                note={
                  fallbackRecords === 0
                    ? "The same inventory read on the market lane. It is comparable to the total above only where every scope 2 record carries a contractual rate."
                    : "The same inventory read on the market lane. Where it rests on a grid-average factor it restates the location-based reading rather than measuring a procurement decision, so read it against the split beside it."
                }
              />
            </dl>
          ) : null}

          {/* Rule 2: reported separately, and said so in words as well as in
              layout, so the separation survives a screen reader. */}
          <dl className="mt-6 grid gap-6 border-b border-border pb-7 md:grid-cols-2">
            <Figure
              label="Outside of scopes"
              value={tonnes(totals.outsideOfScopes)}
              note="Biomass CO2. Reported separately and not included in the total above."
            />
            <Figure
              label="Biogenic"
              value={tonnes(totals.biogenic)}
              note="Also reported separately, and also not in the total above."
            />
          </dl>

          {totals.byScope3Category.length > 0 ? (
            <div className="mt-8">
              <h3 className="font-mono text-[11px] leading-[16px] text-muted uppercase">
                Scope 3, by category
              </h3>
              <dl className="mt-4">
                {totals.byScope3Category.map((entry) => (
                  <div
                    key={entry.category}
                    className="flex items-baseline justify-between gap-5 border-b border-border py-3 first:border-t"
                  >
                    <dt className="font-serif text-[16px] leading-6 text-ink">
                      {SCOPE3_CATEGORY_LABELS[entry.category]}
                    </dt>
                    <dd className="font-mono text-[13px] leading-5 tabular-nums">
                      {tonnes(entry.kgCo2e)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <RecalculateControl importId={importId} className="mt-10" />
        </>
      )}

      {/* Attribution — a licence condition, rendered from the set. */}
      {sets.length > 0 ? (
        <p className="mt-10 max-w-[700px] font-mono text-[11px] leading-[18px] text-muted">
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
    </section>
  );
}

function Figure({
  label,
  value,
  note,
  lead = false,
}: {
  label: string;
  value: string;
  note?: string;
  lead?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 tabular-nums ${
          lead
            ? "font-serif text-[40px] leading-[1.05]"
            : "font-serif text-[28px] leading-[1.1]"
        }`}
      >
        {value}
      </dd>
      {note ? (
        <p className="mt-2 max-w-[26rem] font-mono text-[11px] leading-[16px] text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Re-reads a stored `numeric` back into the exact representation. A row that
    cannot be parsed is dropped from the total rather than coerced to zero — a
    silent zero in a disclosure is the failure this whole step is shaped
    against. */
function parseStored(value: string) {
  const result = parseDecimal(value);
  return result.ok ? result.value : null;
}

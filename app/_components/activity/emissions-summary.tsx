import Link from "next/link";

import {
  listEmissions,
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
 * 3. **Every scope 2 figure carries its method.** The Scope 2 Guidance requires
 *    the method to travel with the number, and this step produces
 *    location-based only.
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
  const [emissions, uncalculated, sets] = await Promise.all([
    listEmissions(organizationId, importId),
    countUncalculatedRecords(organizationId, importId),
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
      gwpSet: row.gwpSet,
      biogenic: row.biogenic,
      outsideOfScopes: row.outsideOfScopes,
      engineVersion: "",
    });
  }

  const totals = totalsOf(parsed);
  const calculated = parsed.length;
  const covered = calculated + uncalculated;
  const complete = uncalculated === 0 && calculated > 0;

  const scope2Label =
    totals.scope2Methods.length > 0
      ? totals.scope2Methods
          .map((method) => SCOPE2_METHOD_LABELS[method])
          .join(", ")
      : SCOPE2_METHOD_LABELS.location_based;

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
              {set.factorCount.toLocaleString("en-GB")} factors). Contains public
              sector information licensed under the{" "}
              <a
                href={set.licenceUrl}
                className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {set.licence}
              </a>
              .
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

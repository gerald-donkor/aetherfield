import type { Metadata } from "next";
import Link from "next/link";

import { FactorPicker } from "../../_components/activity/factor-picker";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { Button } from "../../_components/primitives";
import { WorkspaceNav } from "../../_components/workspace-nav";
import { requireOrganization } from "../../../lib/auth/organization";
import {
  listFactorCoverage,
  listFactorSets,
  searchFactorsForPair,
} from "../../../lib/db/emission-queries";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_UNITS,
  type ActivityCategory,
  type ActivityUnit,
} from "../../../lib/validation/activity";

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

function pairHref(
  category: ActivityCategory,
  unit: ActivityUnit,
  q = "",
): string {
  const params = new URLSearchParams({ category, unit });
  if (q.trim() !== "") params.set("q", q.trim());
  return `/activity/mappings?${params.toString()}`;
}

export default async function ActivityMappingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const membership = await requireOrganization("/activity/mappings");
  const query = await searchParams;
  const [coverage, sets] = await Promise.all([
    listFactorCoverage(membership.organization.id),
    listFactorSets(membership.organization.id),
  ]);

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
  const q = first(query.q).slice(0, 120);
  const factors = selected
    ? await searchFactorsForPair(
        membership.organization.id,
        selected.unit,
        q,
      )
    : [];

  const unmapped = coverage.filter((pair) => pair.mapping === null).length;
  const recordsBehindGaps = coverage
    .filter((pair) => pair.mapping === null)
    .reduce((total, pair) => total + pair.recordCount, 0);

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
                        </div>
                      ) : (
                        <p className="mt-4 max-w-[34rem] font-serif text-[16px] leading-6 text-muted">
                          No factor is mapped, so records in this pair do not
                          contribute to the emissions total.
                        </p>
                      )}
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
                  Choose a factor
                </h2>
                <p className="mt-4 max-w-[700px] font-serif text-p2 text-muted">
                  Showing factors whose denominator can calculate activity
                  measured in {selected.unit}. Search the publisher level and
                  column descriptions to narrow the list.
                </p>
                <FactorPicker
                  category={selected.category}
                  unit={selected.unit}
                  factors={factors}
                >
                  <form method="get" className="mt-8 border-y border-border py-6">
                    <input
                      type="hidden"
                      name="category"
                      value={selected.category}
                    />
                    <input type="hidden" name="unit" value={selected.unit} />
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
                        defaultValue={q}
                        className="h-[52px] w-full border border-border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)]"
                        placeholder="Diesel, electricity, landfill..."
                      />
                      <Button type="submit" bullet={false}>
                        Search
                      </Button>
                    </div>
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

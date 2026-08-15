import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter, SiteNav } from "../_components/chrome";
import { WorkspaceNav } from "../_components/workspace-nav";
import { requireOrganization } from "../../lib/auth/organization";
import { readDashboardEvidence } from "../../lib/db/dashboard-queries";
import {
  dashboardActions,
  dashboardWindows,
  emissionsForWindow,
  emissionsTrend,
  recordedEnergy,
  selectDashboardTarget,
  trendTotal,
  type TrendMonth,
} from "../../lib/domain/dashboard";
import {
  ZERO,
  compare,
  divide,
  parseDecimal,
  toFixed,
  type Decimal,
} from "../../lib/domain/decimal";
import {
  monthOf,
  toTonnes,
  totalsByPeriod,
  type RecordEmission,
} from "../../lib/domain/emissions";
import {
  projectTargetYear,
  readingAgainstTarget,
  targetFigure,
  totalsForCoverage,
} from "../../lib/domain/targets";
import { TARGET_COVERAGE_LABELS } from "../../lib/validation/targets";

export const metadata: Metadata = {
  title: "Dashboard — Aetherfield",
  description:
    "Review current sustainability evidence, targets and next actions.",
};

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function monthName(month: string) {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

function tonnes(value: Decimal, places = 1) {
  return toFixed(toTonnes(value), places, "half-even");
}

function mwh(value: Decimal) {
  return toFixed(value, 1, "half-even");
}

function storedEmissions(
  rows: Awaited<ReturnType<typeof readDashboardEvidence>>["emissions"],
) {
  return rows.map((row): RecordEmission => {
    const value = parseDecimal(row.kgCo2e);
    if (!value.ok)
      throw new Error("A stored emission could not be read as a decimal.");
    return {
      recordId: row.recordId,
      activityDate: row.activityDate,
      kgCo2e: value.value,
      factorId: "",
      scope: row.scope,
      scope3Category: row.scope3Category,
      scope2Method: row.scope2Method,
      scope2MarketBasis: row.scope2MarketBasis,
      gwpSet: row.gwpSet,
      biogenic: row.biogenic,
      outsideOfScopes: row.outsideOfScopes,
      engineVersion: "",
    };
  });
}

export default async function DashboardPage() {
  const membership = await requireOrganization("/dashboard");
  const asOf = new Date().toISOString().slice(0, 10);
  const evidence = await readDashboardEvidence(membership.organization.id);
  const emissions = storedEmissions(evidence.emissions);
  const windows = dashboardWindows(asOf);
  const currentEmissions = emissions.filter(
    (row) =>
      row.activityDate >= windows.primary.startDate &&
      row.activityDate <= windows.primary.endDate,
  );
  const totals = emissionsForWindow(emissions, windows.primary);
  const trend = emissionsTrend(emissions, windows.primary);
  const energy = recordedEnergy(evidence.energy, windows, 1, "half-even");
  const target = selectDashboardTarget(evidence.targets, asOf);

  const monthly = totalsByPeriod(emissions, monthOf);
  let targetView: null | {
    figure: Decimal;
    projection: ReturnType<typeof projectTargetYear>;
    reading: ReturnType<typeof readingAgainstTarget> | null;
  } = null;
  if (target) {
    const baseline = parseDecimal(target.baselineKgCo2e);
    const reduction = parseDecimal(target.reductionPercent);
    if (!baseline.ok || !reduction.ok)
      throw new Error("A stored target could not be read as a decimal.");
    const figure = targetFigure(baseline.value, reduction.value);
    const projection = projectTargetYear({
      monthly: monthly.map((period) => ({
        month: period.period,
        kgCo2e: totalsForCoverage(period.totals, target.coverage),
      })),
      asOf,
      targetYear: target.targetYear,
      scale: 3,
      mode: "half-even",
    });
    targetView = {
      figure,
      projection,
      reading: projection.ok
        ? readingAgainstTarget(
            projection.projection.kgCo2e,
            figure,
            1,
            "half-even",
          )
        : null,
    };
  }

  const targetOffTrack = Boolean(
    targetView?.reading?.ok && compare(targetView.reading.percent, ZERO) > 0,
  );
  const actions = dashboardActions({
    activityRecords: evidence.activityRecords,
    uncalculatedRecords: evidence.uncalculatedRecords,
    hasTarget: Boolean(target),
    targetOffTrack,
  });

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="dashboard" />
        <p className="font-mono text-caption text-muted">OVERVIEW</p>
        <h1 className="mt-6 max-w-[900px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          {membership.organization.name}, this is the evidence in view.
        </h1>
        <p className="mt-7 max-w-[760px] font-serif text-p2 text-muted">
          Latest 12 complete months: {monthName(windows.primary.startMonth)} to{" "}
          {monthName(windows.primary.endMonth)}. Comparison:{" "}
          {monthName(windows.comparison.startMonth)} to{" "}
          {monthName(windows.comparison.endMonth)}. The current partial month is
          excluded.
        </p>

        <section
          className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Current evidence summary"
        >
          <article className="border border-border p-6 md:p-7">
            <p className="font-mono text-[11px] leading-4 text-muted uppercase">
              Latest emissions
            </p>
            {currentEmissions.length === 0 ? (
              <EmptyCard
                text="No calculated emissions exist in this reporting window."
                href="/activity"
              />
            ) : (
              <>
                <p className="mt-5 font-serif text-[40px] leading-none tabular-nums md:text-[48px]">
                  {tonnes(totals.total)}{" "}
                  <span className="text-[18px]">tCO2e</span>
                </p>
                <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-border pt-5">
                  <MiniFigure label="Scope 1" value={tonnes(totals.scope1)} />
                  <MiniFigure label="Scope 2" value={tonnes(totals.scope2)} />
                  <MiniFigure label="Scope 3" value={tonnes(totals.scope3)} />
                </dl>
                {/* Dual reporting — prompt 85. Shown only where a contractual
                    rate is actually mapped, with the coverage it rests on, and
                    never folded into the figure above it. */}
                {totals.scope2MarketBasedRecords > 0 ? (
                  <p className="mt-5 border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
                    Market-based: scope 2 {tonnes(totals.scope2MarketBased)}{" "}
                    tCO2e, scopes 1-3 {tonnes(totals.totalMarketBased)} tCO2e,
                    over {totals.scope2MarketBasedRecords.toLocaleString("en-GB")}{" "}
                    of {totals.scope2Records.toLocaleString("en-GB")} scope 2
                    records. The figures above are location-based.
                  </p>
                ) : null}
                <p className="mt-5 font-mono text-[11px] leading-[18px] text-muted">
                  Biogenic {tonnes(totals.biogenic)} tCO2e · outside scopes{" "}
                  {tonnes(totals.outsideOfScopes)} tCO2e, reported separately.
                </p>
                <GapCaveat count={evidence.uncalculatedRecords} />
              </>
            )}
          </article>

          <article className="border border-border p-6 md:p-7">
            <p className="font-mono text-[11px] leading-4 text-muted uppercase">
              Recorded energy
            </p>
            {energy.currentReadings === 0 ? (
              <EmptyCard
                text="No eligible electricity or heat readings exist in this window."
                href="/activity"
              />
            ) : (
              <>
                <p className="mt-5 font-serif text-[40px] leading-none tabular-nums md:text-[48px]">
                  {mwh(energy.currentMWh)}{" "}
                  <span className="text-[18px]">MWh</span>
                </p>
                <p className="mt-5 font-mono text-[12px] leading-[18px]">
                  {energy.change.ok
                    ? `${compare(energy.change.percent, ZERO) > 0 ? "+" : ""}${toFixed(energy.change.percent, 1, "half-even")}% against the previous complete 12 months.`
                    : energy.change.reason}
                </p>
                <p className="mt-3 font-serif text-[16px] leading-6 text-muted">
                  Eligible committed electricity and heat readings only. This is
                  not a whole-estate coverage claim.
                </p>
              </>
            )}
          </article>

          <article className="border border-border p-6 md:col-span-2 md:p-7 xl:col-span-1">
            <p className="font-mono text-[11px] leading-4 text-muted uppercase">
              Nearest active target
            </p>
            {!target || !targetView ? (
              <EmptyCard
                text="No active future target has been set."
                href="/targets"
              />
            ) : (
              <>
                <h2 className="mt-5 font-sans text-[24px] leading-7 font-bold">
                  {target.name}
                </h2>
                <p className="mt-2 font-serif text-[16px] leading-6 text-muted">
                  {TARGET_COVERAGE_LABELS[target.coverage]} ·{" "}
                  {target.targetYear} · target {tonnes(targetView.figure, 3)}{" "}
                  tCO2e
                </p>
                {targetView.projection.ok ? (
                  <>
                    <p className="mt-6 font-serif text-[32px] leading-none tabular-nums">
                      {tonnes(targetView.projection.projection.kgCo2e)} tCO2e
                    </p>
                    <p className="mt-2 font-mono text-[11px] leading-[18px] text-muted">
                      {targetView.projection.projection.basis === "trend"
                        ? "Linear run-rate"
                        : "Flat run-rate"}{" "}
                      projection · latest window ending{" "}
                      {targetView.projection.projection.windowEnd}
                    </p>
                    <TargetReading
                      reading={targetView.reading}
                      year={target.targetYear}
                    />
                  </>
                ) : (
                  <p className="mt-6 font-serif text-[16px] leading-6 text-muted">
                    {targetView.projection.reason}
                  </p>
                )}
                <GapCaveat count={evidence.uncalculatedRecords} />
                <Link
                  className="mt-6 inline-block font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  href="/targets"
                >
                  Review target evidence
                </Link>
              </>
            )}
          </article>
        </section>

        <section className="mt-20" aria-labelledby="emissions-trend-heading">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="font-mono text-[11px] leading-4 text-muted uppercase">
                Track
              </p>
              <h2
                id="emissions-trend-heading"
                className="mt-2 font-sans text-[28px] leading-8 font-bold"
              >
                Emissions trend
              </h2>
            </div>
            <p className="font-mono text-caption text-muted">
              tCO2e · complete months
            </p>
          </div>
          <TrendChart months={trend} />
          <GapCaveat count={evidence.uncalculatedRecords} />
        </section>

        <section className="mt-20" aria-labelledby="evidence-loop-heading">
          <p className="font-mono text-[11px] leading-4 text-muted uppercase">
            Track · Model · Report · Act
          </p>
          <h2
            id="evidence-loop-heading"
            className="mt-2 font-sans text-[28px] leading-8 font-bold"
          >
            Evidence and next actions
          </h2>
          <div className="mt-8 grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
            <EvidenceBlock title="Track">
              {evidence.activityRecords.toLocaleString("en-GB")} committed
              activity {evidence.activityRecords === 1 ? "record" : "records"};{" "}
              {evidence.emissions.length.toLocaleString("en-GB")} calculated.
            </EvidenceBlock>
            <EvidenceBlock title="Model">
              {target
                ? `${target.name}, ${TARGET_COVERAGE_LABELS[target.coverage]}, ${target.targetYear}.`
                : "No active future target."}
            </EvidenceBlock>
            <EvidenceBlock title="Report">
              {evidence.uncalculatedRecords === 0
                ? "Every committed record has a stored calculation."
                : `${evidence.uncalculatedRecords.toLocaleString("en-GB")} committed ${evidence.uncalculatedRecords === 1 ? "record has" : "records have"} no stored calculation.`}
            </EvidenceBlock>
            <EvidenceBlock title="Act">
              <ul className="space-y-3">
                {actions.map((action) => (
                  <li key={action.key}>
                    <Link
                      className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      href={action.href}
                    >
                      {action.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </EvidenceBlock>
          </div>
          {evidence.factorSets.length > 0 ? (
            <div className="mt-8 space-y-2 font-mono text-[11px] leading-[18px] text-muted">
              {evidence.factorSets.map((set) => (
                <p key={set.id}>
                  Emission factors: {set.source} {set.datasetVersion} ·{" "}
                  {set.licenceUrl ? (
                    <a
                      className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      href={set.licenceUrl}
                    >
                      {set.licence}
                    </a>
                  ) : (
                    set.licence
                  )}
                  {set.sourceReference ? ` · ${set.sourceReference}` : ""}
                  .
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function MiniFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] leading-4 text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-serif text-[18px] leading-6 tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function EmptyCard({
  text,
  href,
}: {
  text: string;
  href: "/activity" | "/targets";
}) {
  return (
    <div className="mt-5">
      <p className="font-serif text-[20px] leading-6 text-muted">{text}</p>
      <Link
        href={href}
        className="mt-6 inline-block font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Open the evidence workspace
      </Link>
    </div>
  );
}

function GapCaveat({ count }: { count: number }) {
  return count > 0 ? (
    <p className="mt-5 border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
      Incomplete: {count.toLocaleString("en-GB")} committed{" "}
      {count === 1 ? "record has" : "records have"} no calculated emission and
      contribute nothing to this figure.
    </p>
  ) : null;
}

function TargetReading({
  reading,
  year,
}: {
  reading: ReturnType<typeof readingAgainstTarget> | null;
  year: number;
}) {
  if (!reading) return null;
  if (!reading.ok)
    return (
      <p className="mt-4 font-serif text-[16px] leading-6 text-muted">
        {reading.reason}
      </p>
    );
  const direction = compare(reading.percent, ZERO);
  const magnitude = {
    units:
      reading.percent.units < 0n
        ? -reading.percent.units
        : reading.percent.units,
    scale: reading.percent.scale,
  };
  return (
    <p className="mt-4 font-sans text-[18px] leading-6 font-bold">
      {direction > 0
        ? `${toFixed(magnitude, 1, "half-even")}% off the ${year} goal.`
        : direction < 0
          ? `${toFixed(magnitude, 1, "half-even")}% ahead of the ${year} goal.`
          : `On the ${year} goal.`}
    </p>
  );
}

function TrendChart({ months }: { months: TrendMonth[] }) {
  const values = months.map(trendTotal);
  let max = ZERO;
  for (const value of values) if (value && compare(value, max) > 0) max = value;
  const height = (value: Decimal | null) => {
    if (!value || compare(max, ZERO) === 0) return value ? 4 : 0;
    const ratio = divide(
      { units: value.units * 100n, scale: value.scale },
      max,
      1,
      "half-even",
    );
    return ratio.ok
      ? Math.max(4, Number(toFixed(ratio.value, 1, "half-even")))
      : 0;
  };
  return (
    <div className="mt-8 border-y border-border py-6 md:py-8">
      <div
        className="grid h-[220px] grid-cols-12 items-end gap-1 md:h-[280px] md:gap-2"
        aria-hidden="true"
      >
        {months.map((month, index) => {
          const value = values[index];
          return (
            <div
              key={month.month}
              className="flex h-full items-end border-b border-border"
            >
              <span
                className={`w-full ${value ? "bg-accent" : "border-t border-dashed border-muted"}`}
                style={{ height: `${height(value)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left">
          <caption className="sr-only">
            Monthly emissions values and missing-data gaps for the latest 12
            complete months.
          </caption>
          <thead>
            <tr>
              {months.map((month) => (
                <th
                  key={month.month}
                  scope="col"
                  className="border-r border-border px-2 pb-2 font-mono text-[10px] leading-4 text-muted last:border-r-0"
                >
                  {monthName(month.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {months.map((month, index) => (
                <td
                  key={month.month}
                  className="border-r border-border px-2 pt-2 font-mono text-[11px] leading-4 tabular-nums last:border-r-0"
                >
                  {values[index]
                    ? `${tonnes(values[index]!, 1)} tCO2e`
                    : "No calculated record"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="min-w-0 bg-white p-6">
      <h3 className="font-sans text-[20px] leading-6 font-bold">{title}</h3>
      <div className="mt-4 font-serif text-[16px] leading-6 text-muted">
        {children}
      </div>
    </article>
  );
}

import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../_components/chrome";
import {
  EvidenceSummary,
  type TargetView,
} from "../_components/dashboard/evidence-summary";
import { EvidenceLoop } from "../_components/dashboard/evidence-loop";
import { monthName } from "../_components/dashboard/format";
import { GapCaveat } from "../_components/dashboard/gap-caveat";
import { TrendChart } from "../_components/dashboard/trend-chart";
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
} from "../../lib/domain/dashboard";
import { ZERO, compare, parseDecimal } from "../../lib/domain/decimal";
import {
  monthOf,
  totalsByPeriod,
  type RecordEmission,
} from "../../lib/domain/emissions";
import {
  projectTargetYear,
  readingAgainstTarget,
  targetFigure,
  totalsForCoverage,
} from "../../lib/domain/targets";

/**
 * `/dashboard` — build step 12's authenticated read, and the four-verb loop made
 * real for one organisation.
 *
 * **The composition root.** Prompt 120 moved the three summary cards, the trend
 * chart, the evidence loop, the incompleteness caveat and the figure formatting
 * into `app/_components/dashboard/`. What stays here is the tenant resolution,
 * the single evidence read, the derivation that turns stored decimal strings into
 * figures, and the layout that arranges the sections.
 *
 * **No query moved with the JSX** (AGENTS.md 6.2). `readDashboardEvidence` is
 * called once, here, and every figure below it is derived by the pure functions
 * in `lib/domain/` — so no section can fetch a number the rest of the page
 * disagrees with, and no section added a client boundary.
 *
 * **`requireOrganization` is the first thing this page does**, above everything
 * it renders. It resolves the membership row per request and every read below is
 * predicated on the organisation id it returns, never on anything from the
 * request (AGENTS.md 9.2 rule 6, 11.2 rule 1).
 */

export const metadata: Metadata = {
  title: "Dashboard — Aetherfield",
  description:
    "Review current sustainability evidence, targets and next actions.",
};

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
  let targetView: TargetView | null = null;
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

        <EvidenceSummary
          emissionsInWindow={currentEmissions.length}
          totals={totals}
          energy={energy}
          target={target}
          targetView={targetView}
          uncalculatedRecords={evidence.uncalculatedRecords}
        />

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

        <EvidenceLoop
          activityRecords={evidence.activityRecords}
          calculatedEmissions={evidence.emissions.length}
          uncalculatedRecords={evidence.uncalculatedRecords}
          target={target}
          actions={actions}
          factorSets={evidence.factorSets}
        />
      </main>
      <SiteFooter />
    </>
  );
}

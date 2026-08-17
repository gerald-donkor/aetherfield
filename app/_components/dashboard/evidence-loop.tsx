import Link from "next/link";

import type { readDashboardEvidence } from "../../../lib/db/dashboard-queries";
import type { DashboardAction } from "../../../lib/domain/dashboard";
import { TARGET_COVERAGE_LABELS } from "../../../lib/validation/targets";

/**
 * Track · Model · Report · Act — the four-verb loop from `home/capabilities.tsx`,
 * read against this organisation's own evidence, with the next actions it
 * suggests. Moved out of `app/dashboard/page.tsx` by prompt 120.
 *
 * **A Server Component, and it fetches nothing.** The four counts and the action
 * list arrive computed; `dashboardActions` in `lib/domain/dashboard.ts` decides
 * what to suggest, and it is a pure function so the suggestion is testable
 * without a database (AGENTS.md 6.2).
 *
 * **The attribution line is rendered from the factor sets, never hard-coded.**
 * The Open Government Licence requires it wherever the factors are surfaced, and
 * reading the licence and its URL off the set means a second dataset cannot make
 * a fixed line wrong.
 */

type DashboardEvidence = Awaited<ReturnType<typeof readDashboardEvidence>>;

export function EvidenceLoop({
  activityRecords,
  calculatedEmissions,
  uncalculatedRecords,
  target,
  actions,
  factorSets,
}: {
  activityRecords: number;
  calculatedEmissions: number;
  uncalculatedRecords: number;
  target: DashboardEvidence["targets"][number] | null;
  actions: DashboardAction[];
  factorSets: DashboardEvidence["factorSets"];
}) {
  return (
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
          {activityRecords.toLocaleString("en-GB")} committed
          activity {activityRecords === 1 ? "record" : "records"};{" "}
          {calculatedEmissions.toLocaleString("en-GB")} calculated.
        </EvidenceBlock>
        <EvidenceBlock title="Model">
          {target
            ? `${target.name}, ${TARGET_COVERAGE_LABELS[target.coverage]}, ${target.targetYear}.`
            : "No active future target."}
        </EvidenceBlock>
        <EvidenceBlock title="Report">
          {uncalculatedRecords === 0
            ? "Every committed record has a stored calculation."
            : `${uncalculatedRecords.toLocaleString("en-GB")} committed ${uncalculatedRecords === 1 ? "record has" : "records have"} no stored calculation.`}
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
      {factorSets.length > 0 ? (
        <div className="mt-8 space-y-2 font-mono text-[11px] leading-[18px] text-muted">
          {factorSets.map((set) => (
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

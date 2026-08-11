import type { Metadata } from "next";
import Link from "next/link";

import { CreateReportForm } from "../_components/reports/create-report-form";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { WorkspaceNav } from "../_components/workspace-nav";
import { requireOrganization } from "../../lib/auth/organization";
import { listReports } from "../../lib/db/report-queries";
import { reportPeriod } from "../../lib/domain/reports";
import { REPORT_NARRATIVE_STATUS_LABELS } from "../../lib/validation/reports";

export const metadata: Metadata = {
  title: "Reports — Aetherfield",
  description:
    "Build ESG report snapshots from stored emissions evidence and export them.",
};

export default async function ReportsPage() {
  const membership = await requireOrganization("/reports");
  const reports = await listReports(membership.organization.id);
  const period = reportPeriod(new Date().toISOString().slice(0, 10));

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="reports" />
        <p className="font-mono text-caption text-muted">REPORTS</p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          Fix the figures, then write about them.
        </h1>
        <p className="mt-7 max-w-[760px] font-serif text-p2 text-muted">
          A report is a snapshot. Every figure in it is read from your stored
          calculations at the moment you build it, and nothing recalculates it
          afterwards. A narrative can be drafted over those figures; it is a
          draft, it is checked against them, and nothing here is filed,
          published or sent.
        </p>

        <section className="mt-16" aria-labelledby="create-report-heading">
          <h2
            id="create-report-heading"
            className="font-sans text-[28px] leading-8 font-bold"
          >
            Build a report
          </h2>
          <p className="mt-4 max-w-[700px] font-serif text-p2 text-muted">
            The period is the latest 12 complete calendar months —{" "}
            {period.startDate} to {period.endDate}. The current partial month is
            excluded. Records with no calculated emission are counted and named
            in the report rather than treated as zero.
          </p>
          <div className="mt-10 border-y border-border py-8">
            <CreateReportForm />
          </div>
        </section>

        <section className="mt-20" aria-labelledby="reports-list-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
            <h2
              id="reports-list-heading"
              className="font-sans text-[28px] leading-8 font-bold"
            >
              Snapshots
            </h2>
            <p className="font-mono text-caption text-muted">Newest first</p>
          </div>
          {reports.length === 0 ? (
            <div className="border-y border-border py-14">
              <h3 className="font-sans text-[24px] leading-7 font-bold">
                No report has been built.
              </h3>
              <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
                The first snapshot will appear here with its period, its scope
                totals and the factor sets behind them.
              </p>
            </div>
          ) : (
            <ul aria-label="Report snapshots" className="border-t border-border">
              {reports.map((entry) => (
                <li key={entry.id} className="border-b border-border py-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                    <h3 className="font-sans text-[24px] leading-7 font-bold">
                      <Link
                        href={`/reports/${entry.id}`}
                        className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {entry.title}
                      </Link>
                    </h3>
                    <p className="font-mono text-[11px] leading-4 text-muted">
                      {entry.periodStart} to {entry.periodEnd}
                    </p>
                  </div>
                  <p className="mt-3 font-serif text-[16px] leading-6 text-muted">
                    Generated {entry.generatedAsOf} ·{" "}
                    {REPORT_NARRATIVE_STATUS_LABELS[entry.narrativeStatus]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

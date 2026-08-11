import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter, SiteNav } from "../../_components/chrome";
import {
  DeleteReportControl,
  GenerateNarrativeControl,
} from "../../_components/reports/report-controls";
import { WorkspaceNav } from "../../_components/workspace-nav";
import { requireOrganization } from "../../../lib/auth/organization";
import { getReport } from "../../../lib/db/report-queries";
import { reportSections } from "../../../lib/domain/reports";
import {
  parseReportEvidence,
  reportIdSchema,
  REPORT_NARRATIVE_STATUS_LABELS,
} from "../../../lib/validation/reports";

export const metadata: Metadata = {
  title: "Report — Aetherfield",
  description: "Review a report snapshot, its provenance and its caveats.",
};

/**
 * One report snapshot — build step 13.
 *
 * **It renders the stored snapshot and recalculates nothing.** Every figure
 * comes from `evidence`, parsed by the schema-owned parser; no emission is
 * re-summed, no factor re-selected and no target re-projected on this path.
 *
 * A snapshot that fails to parse is a 404 rather than a partial disclosure.
 */
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const membership = await requireOrganization("/reports");

  const parsedId = reportIdSchema.safeParse(reportId);
  if (!parsedId.success) notFound();

  const report = await getReport(parsedId.data, membership.organization.id);
  if (!report) notFound();

  const evidence = parseReportEvidence(report.evidence);
  const sections = evidence ? reportSections(evidence) : null;

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="reports" />
        <p className="font-mono text-caption text-muted">REPORT</p>
        <h1 className="mt-6 max-w-[900px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          {report.title}
        </h1>
        <p className="mt-7 max-w-[760px] font-serif text-p2 text-muted">
          {report.periodStart} to {report.periodEnd}. Generated{" "}
          {report.generatedAsOf} against calculation engine{" "}
          {report.engineVersion}. These figures are fixed; a later import or
          recalculation does not move them.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/reports"
            className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            All reports
          </Link>
          {sections ? (
            <a
              href={`/reports/${report.id}/export`}
              className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Export as HTML
            </a>
          ) : null}
        </div>

        {!sections ? (
          <div className="mt-16 border-y border-border py-14">
            <h2 className="font-sans text-[24px] leading-7 font-bold">
              This report&apos;s stored figures could not be read.
            </h2>
            <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
              Nothing is shown rather than part of a disclosure. Build a new
              report from the current evidence.
            </p>
          </div>
        ) : (
          <>
            {sections.map((section) => (
              <section
                key={section.key}
                className="mt-16"
                aria-labelledby={`section-${section.key}`}
              >
                <h2
                  id={`section-${section.key}`}
                  className="font-sans text-[28px] leading-8 font-bold"
                >
                  {section.title}
                </h2>
                {section.rows.length > 0 ? (
                  <dl className="mt-6 border-t border-border">
                    {section.rows.map((row) => (
                      <div
                        key={row.label}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3"
                      >
                        <dt className="font-serif text-[16px] leading-6 text-muted">
                          {row.label}
                        </dt>
                        <dd className="font-sans text-[18px] leading-6 font-bold tabular-nums">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {section.notes.length > 0 ? (
                  <ul className="mt-6 space-y-3">
                    {section.notes.map((note) => (
                      <li
                        key={note}
                        className="max-w-[46rem] border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]"
                      >
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <section className="mt-20" aria-labelledby="narrative-heading">
              <h2
                id="narrative-heading"
                className="font-sans text-[28px] leading-8 font-bold"
              >
                Narrative
              </h2>
              <p className="mt-4 max-w-[700px] font-serif text-p2 text-muted">
                {REPORT_NARRATIVE_STATUS_LABELS[report.narrativeStatus]}.
              </p>
              {report.narrativeError ? (
                <p className="mt-5 max-w-[46rem] border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
                  {report.narrativeError}
                </p>
              ) : null}

              {report.narrative ? (
                <article className="mt-8 border-y border-border py-8">
                  <p className="font-mono text-[11px] leading-4 text-muted uppercase">
                    Draft · generated by {report.narrativeModel} · review every
                    sentence
                  </p>
                  <div className="mt-6 max-w-[46rem] space-y-5 font-serif text-p2">
                    {report.narrative
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.trim())
                      .filter(Boolean)
                      .map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                  </div>
                  <p className="mt-7 max-w-[46rem] border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
                    Every figure in this draft was checked against the report
                    above; a draft containing any other number is discarded and
                    never stored. It remains a draft, and nothing publishes it.
                  </p>
                </article>
              ) : null}

              <GenerateNarrativeControl
                className="mt-8"
                reportId={report.id}
                hasNarrative={Boolean(report.narrative)}
              />
            </section>
          </>
        )}

        <section className="mt-20 border-t border-border pt-8">
          <h2 className="font-sans text-[20px] leading-6 font-bold">
            Remove this report
          </h2>
          <p className="mt-3 max-w-[34rem] font-serif text-[16px] leading-6 text-muted">
            The snapshot is retained with a removal timestamp and stops appearing
            in this workspace.
          </p>
          <DeleteReportControl className="mt-6" reportId={report.id} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

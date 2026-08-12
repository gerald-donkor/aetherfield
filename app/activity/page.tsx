import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmissionsSummary } from "../_components/activity/emissions-summary";
import { ActivityUploadForm } from "../_components/activity/upload-form";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { WorkspaceNav } from "../_components/workspace-nav";
import { requireOrganization } from "../../lib/auth/organization";
import {
  ACTIVITY_PAGE_SIZE,
  countActivityRecords,
  countImports,
  listImports,
  type ListedImport,
} from "../../lib/db/activity-queries";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_FIELDS,
  ACTIVITY_UNITS,
} from "../../lib/validation/activity";

/**
 * The activity workspace — build step 9's index.
 *
 * Gated by `requireOrganization("/activity")`, which is the database-backed
 * check; `proxy.ts`'s redirect is optimistic and is not enforcement
 * (AGENTS.md 7.3, 11.2 rule 1).
 *
 * **Only a Server Component fetches this page's data** (AGENTS.md 6.2), and
 * every query it calls is scoped to the organisation the membership row
 * resolved. Being Aetherfield `staff` grants nothing here (11.1).
 *
 * The read idiom — `Detail`, the bordered record list, `Intl.DateTimeFormat` on
 * UTC, the `aria-label`led list, the empty state and the paging helpers — is
 * `/submissions`', deliberately, so the two authenticated views read alike.
 */

export const metadata: Metadata = {
  title: "Activity data — Aetherfield",
  description: "Import and review your organisation's activity data.",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const STATUS_LABELS: Record<ListedImport["status"], string> = {
  staged: "Staged for review",
  committed: "Committed",
  discarded: "Discarded",
  failed: "Failed",
};

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const membership = await requireOrganization("/activity");
  const query = await searchParams;
  const page = parsePage(query.page);

  const [imports, total, recordCount] = await Promise.all([
    listImports(membership.organization.id, page),
    countImports(membership.organization.id),
    countActivityRecords(membership.organization.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  if (page > totalPages) redirect(`/activity?page=${totalPages}`);

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="activity" />
        <p className="font-mono text-caption text-muted">ACTIVITY DATA</p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          Bring your activity data in, one file at a time.
        </h1>
        <p className="mt-7 max-w-[700px] font-serif text-p2 text-muted">
          Upload a CSV of what was measured — energy, fuel, waste, water,
          travel. Every file is staged first, so you see what will be recorded
          before anything is. {membership.organization.name} currently holds{" "}
          {recordCount.toLocaleString("en-GB")}{" "}
          {recordCount === 1 ? "activity record" : "activity records"}.
        </p>
        <p className="mt-5">
          <Link
            href="/activity/factors"
            className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Add customer-supplied factors
          </Link>
        </p>
        <section className="mt-16" aria-labelledby="activity-upload-heading">
          <h2
            id="activity-upload-heading"
            className="font-sans text-[28px] leading-8 font-bold"
          >
            Upload a file
          </h2>
          <dl className="mt-6 grid max-w-[860px] gap-6 border-y border-border py-6 md:grid-cols-3">
            <div>
              <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
                Columns
              </dt>
              <dd className="mt-1 font-serif text-[16px] leading-6 text-ink">
                {ACTIVITY_FIELDS.join(", ")}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
                Categories
              </dt>
              <dd className="mt-1 font-serif text-[16px] leading-6 text-ink">
                {ACTIVITY_CATEGORIES.join(", ")}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
                Units
              </dt>
              <dd className="mt-1 font-serif text-[16px] leading-6 text-ink">
                {ACTIVITY_UNITS.join(", ")}
              </dd>
            </div>
          </dl>
          <p className="mt-6 max-w-[700px] font-serif text-p2 text-muted">
            Headers are matched automatically where they are recognised, and
            anything unmatched is left for you to map on the next screen. Dates
            are read as ISO, for example 2026-03-31.
          </p>
          <ActivityUploadForm className="mt-10" />
        </section>

        {/* Step 10's visible outcome, across the whole organisation. It reads
            the stored figures rather than recalculating on render: a disclosure
            figure is something that was computed at a moment, by a named engine
            version, against a named factor row. */}
        <EmissionsSummary
          organizationId={membership.organization.id}
          headingId="activity-emissions-heading"
        />

        <section className="mt-20" aria-labelledby="activity-imports-heading">
          <div className="mb-6 flex items-end justify-between gap-5">
            <h2
              id="activity-imports-heading"
              className="font-sans text-[28px] leading-8 font-bold"
            >
              Imports
            </h2>
            <p className="font-mono text-caption text-muted">Newest first</p>
          </div>

          {imports.length === 0 ? (
            <div className="border-y border-border py-14">
              <h3 className="font-sans text-[24px] leading-7 font-bold">
                Nothing imported yet.
              </h3>
              <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
                Your first file will appear here, staged for review.
              </p>
            </div>
          ) : (
            <ul aria-label="Activity data imports">
              {imports.map((row) => (
                <li
                  key={row.id}
                  className="border-b border-border py-6 first:border-t lg:py-5"
                >
                  <div className="grid min-w-0 gap-5 lg:grid-cols-[1.4fr_0.8fr_1fr_1fr_auto] lg:items-start">
                    <dl className="contents">
                      <Detail label="File">
                        <span className="font-sans font-bold">
                          {row.filename}
                        </span>
                        <br />
                        {row.uploadedByName}
                      </Detail>
                      <Detail label="Status">{STATUS_LABELS[row.status]}</Detail>
                      <Detail label="Rows">
                        {row.rowCount.toLocaleString("en-GB")} total
                        <br />
                        {row.validRowCount.toLocaleString("en-GB")} ready ·{" "}
                        {row.invalidRowCount.toLocaleString("en-GB")} need
                        attention
                      </Detail>
                      <Detail label="Uploaded">
                        {DATE_FORMAT.format(row.createdAt)} UTC
                        {row.committedAt ? (
                          <>
                            <br />
                            Committed {DATE_FORMAT.format(row.committedAt)} UTC
                          </>
                        ) : null}
                        {row.discardedAt ? (
                          <>
                            <br />
                            Discarded {DATE_FORMAT.format(row.discardedAt)} UTC
                          </>
                        ) : null}
                      </Detail>
                    </dl>
                    <Link
                      href={`/activity/${row.id}`}
                      className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Review
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <nav
            aria-label="Imports pagination"
            className="mt-8 flex items-center justify-between gap-5"
          >
            {page > 1 ? (
              <Link
                href={`/activity?page=${page - 1}`}
                className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <p className="font-mono text-caption text-muted">
              Page {page} of {totalPages} · {total} total
            </p>
            {page < totalPages ? (
              <Link
                href={`/activity?page=${page + 1}`}
                className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 wrap-anywhere font-serif text-[16px] leading-6 text-ink">
        {children}
      </dd>
    </div>
  );
}

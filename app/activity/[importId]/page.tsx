import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { EmissionsSummary } from "../../_components/activity/emissions-summary";
import { ActivityImportControls } from "../../_components/activity/import-controls";
import { ActivityMappingForm } from "../../_components/activity/mapping-form";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { requireOrganization } from "../../../lib/auth/organization";
import {
  ACTIVITY_PAGE_SIZE,
  getImport,
  listImportRows,
} from "../../../lib/db/activity-queries";
import {
  ACTIVITY_FIELD_LABELS,
  ACTIVITY_FIELDS,
  type ActivityImportStatus,
  importIdSchema,
} from "../../../lib/validation/activity";

/**
 * The staged import's review view — **the visible outcome AGENTS.md 5.2's
 * step 9 requires explicitly**, and its shape is fixed by 8.2 rules 4 and 5.
 *
 * It shows the file and who uploaded it, the import's status, the resolved
 * column mapping with each canonical field naming the source header it came
 * from, the three counts, the rows that need attention with their row number
 * and reason, and the commit and discard controls.
 *
 * **Register is measured and operational** (AGENTS.md 5): "3 of 412 rows need
 * attention", never "Oops" and never "Success".
 *
 * **The controls render only while the import is `staged`, and the actions
 * authorise regardless** — hiding a control is presentation, never enforcement
 * (6.2, 11.2 rule 2).
 *
 * **An import belonging to another organisation is a 404, exactly as a
 * non-existent id is.** `getImport()` filters on the resolved tenant, so there
 * is nothing here to tell the two apart and no existence oracle to read.
 */

export const metadata: Metadata = {
  title: "Import review — Aetherfield",
  description: "Review a staged activity data import before committing it.",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const STATUS_LABELS: Record<ActivityImportStatus, string> = {
  staged: "Staged for review",
  committed: "Committed",
  discarded: "Discarded",
  failed: "Failed",
};

const STATUS_NOTES: Record<ActivityImportStatus, string> = {
  staged:
    "Nothing has been recorded yet. Check the mapping and the rows below, then commit.",
  committed:
    "The rows below are part of your activity records. The mapping is fixed.",
  discarded:
    "This import was discarded and the uploaded file was deleted. Nothing was recorded.",
  failed: "This file could not be read, so nothing was staged from it.",
};

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ActivityImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { importId } = await params;
  const membership = await requireOrganization(`/activity/${importId}`);
  const query = await searchParams;
  const page = parsePage(query.page);

  /* A non-uuid never reaches the database: it cannot name a row, and parsing
     it here keeps the 404 identical to the one a valid-but-foreign id gets. */
  const id = importIdSchema.safeParse(importId);
  if (!id.success) notFound();

  const record = await getImport(id.data, membership.organization.id);
  if (!record) notFound();

  const invalidRows = await listImportRows(
    id.data,
    membership.organization.id,
    "invalid",
    page,
  );

  const invalidPages = Math.max(
    1,
    Math.ceil(record.invalidRowCount / ACTIVITY_PAGE_SIZE),
  );
  if (page > invalidPages) {
    redirect(`/activity/${id.data}?page=${invalidPages}`);
  }

  const staged = record.status === "staged";

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <p className="font-mono text-caption text-muted">
          <Link
            href="/activity"
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ACTIVITY DATA
          </Link>{" "}
          / IMPORT
        </p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] wrap-anywhere text-balance md:text-[56px]">
          {record.filename}
        </h1>
        <p className="mt-7 max-w-[700px] font-serif text-p2 text-muted">
          {STATUS_NOTES[record.status]}
        </p>

        <dl className="mt-12 grid max-w-[980px] gap-6 border-y border-border py-6 md:grid-cols-4">
          <Detail label="Status">{STATUS_LABELS[record.status]}</Detail>
          <Detail label="Uploaded by">
            {record.uploadedByName}
            <br />
            {DATE_FORMAT.format(record.createdAt)} UTC
          </Detail>
          <Detail label="Rows">
            {record.rowCount.toLocaleString("en-GB")} in the file
          </Detail>
          <Detail label="Ready / need attention">
            {record.validRowCount.toLocaleString("en-GB")} ready
            <br />
            {record.invalidRowCount.toLocaleString("en-GB")} need attention
          </Detail>
        </dl>

        {record.error ? (
          <p className="mt-8 max-w-[700px] border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px]">
            {record.error}
          </p>
        ) : null}

        <section className="mt-16" aria-labelledby="activity-mapping-heading">
          <h2
            id="activity-mapping-heading"
            className="font-sans text-[28px] leading-8 font-bold"
          >
            Column mapping
          </h2>
          <p className="mt-3 max-w-[700px] font-serif text-p2 text-muted">
            {mappingSummary(record.columnMapping, record.headerRow)}
          </p>

          <dl className="mt-8 grid max-w-[980px] gap-5 border-y border-border py-6 md:grid-cols-3">
            {ACTIVITY_FIELDS.map((field) => {
              const index = record.columnMapping[field];
              const header = index === null ? null : record.headerRow[index];
              return (
                <Detail key={field} label={ACTIVITY_FIELD_LABELS[field]}>
                  {index === null ? (
                    <span className="font-mono text-[12px]">Not mapped</span>
                  ) : (
                    <>
                      Column {index + 1}
                      <br />
                      {header && header.trim() !== "" ? header : "(no header)"}
                    </>
                  )}
                </Detail>
              );
            })}
          </dl>

          {staged ? (
            <ActivityMappingForm
              importId={record.id}
              headerRow={record.headerRow}
              mapping={record.columnMapping}
              className="mt-10"
            />
          ) : null}
        </section>

        {staged ? (
          <section className="mt-16" aria-labelledby="activity-commit-heading">
            <h2
              id="activity-commit-heading"
              className="font-sans text-[28px] leading-8 font-bold"
            >
              Commit or discard
            </h2>
            <p className="mt-3 max-w-[700px] font-serif text-p2 text-muted">
              Committing records the {record.validRowCount.toLocaleString("en-GB")}{" "}
              ready {record.validRowCount === 1 ? "row" : "rows"}. Rows that need
              attention are never recorded and are never dropped — correct the
              file and upload it again.
            </p>
            <ActivityImportControls
              importId={record.id}
              validRowCount={record.validRowCount}
              className="mt-8"
            />
          </section>
        ) : null}

        {/* Step 10, scoped to this import. It renders only once the rows are
            committed: a staged import has no `activity_record` to calculate
            over, and showing an empty total beside rows a person has not
            accepted yet would read as a figure rather than as nothing. */}
        {record.status === "committed" ? (
          <EmissionsSummary
            organizationId={membership.organization.id}
            importId={record.id}
            headingId="activity-import-emissions-heading"
          />
        ) : null}

        <section className="mt-16" aria-labelledby="activity-invalid-heading">
          <div className="mb-6 flex items-end justify-between gap-5">
            <h2
              id="activity-invalid-heading"
              className="font-sans text-[28px] leading-8 font-bold"
            >
              Rows that need attention
            </h2>
            <p className="font-mono text-caption text-muted">
              {record.invalidRowCount.toLocaleString("en-GB")} of{" "}
              {record.rowCount.toLocaleString("en-GB")}
            </p>
          </div>

          {invalidRows.length === 0 ? (
            <div className="border-y border-border py-14">
              <h3 className="font-sans text-[24px] leading-7 font-bold">
                Every row reads cleanly.
              </h3>
              <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
                Nothing in this file needs correcting.
              </p>
            </div>
          ) : (
            <ul aria-label="Rows that need attention">
              {invalidRows.map((row) => (
                <li
                  key={row.id}
                  className="border-b border-border py-6 first:border-t lg:py-5"
                >
                  <div className="grid min-w-0 gap-5 lg:grid-cols-[auto_1.2fr_1.4fr] lg:items-start">
                    <dl className="contents">
                      <Detail label="Line">{row.rowNumber}</Detail>
                      <Detail label="As uploaded">
                        {row.raw.length === 0
                          ? "(empty row)"
                          : row.raw.join(" | ")}
                      </Detail>
                      <Detail label="What to fix">
                        {row.error ?? "No reason recorded."}
                      </Detail>
                    </dl>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {record.invalidRowCount > ACTIVITY_PAGE_SIZE ? (
            <nav
              aria-label="Rows pagination"
              className="mt-8 flex items-center justify-between gap-5"
            >
              {page > 1 ? (
                <Link
                  href={`/activity/${record.id}?page=${page - 1}`}
                  className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <p className="font-mono text-caption text-muted">
                Page {page} of {invalidPages}
              </p>
              {page < invalidPages ? (
                <Link
                  href={`/activity/${record.id}?page=${page + 1}`}
                  className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/** "5 of 6 columns are mapped." — a count, not an adjective. */
function mappingSummary(
  mapping: Record<string, number | null>,
  headerRow: string[],
): string {
  const mapped = ACTIVITY_FIELDS.filter(
    (field) => mapping[field] !== null,
  ).length;
  return `${mapped} of ${ACTIVITY_FIELDS.length} fields are mapped, from a file with ${headerRow.length} ${headerRow.length === 1 ? "column" : "columns"}.`;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
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

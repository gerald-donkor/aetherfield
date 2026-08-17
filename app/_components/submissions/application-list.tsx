import type { ListedApplication } from "../../../lib/db/application-queries";
import { RemoveSubmissionControl } from "../../submissions/action-controls";
import { ButtonLink } from "../primitives";
import { DATE_FORMAT, Detail, EmptyState, RecordCard } from "./record";

/**
 * Job applications, as a list. Moved out of `app/submissions/page.tsx` by
 * prompt 120.
 *
 * **The CV link is a route, not a URL.** It points at
 * `/submissions/applications/<id>/cv`, which mints a short-lived signed URL per
 * request for an authorised session (AGENTS.md 8.3 rule 4, 11.2 rule 4). No blob
 * URL is embedded here, and moving this list did not change that.
 *
 * **A Server Component**, on `LeadList`'s terms.
 */

export function ApplicationList({
  rows,
  admin,
}: {
  rows: ListedApplication[];
  admin: boolean;
}) {
  if (rows.length === 0) return <EmptyState label="job applications" />;
  return (
    <ul aria-label="Job applications">
      {rows.map((row) => (
        <RecordCard key={row.id}>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.1fr_1fr_1.2fr_0.8fr_auto] lg:items-start">
            <dl className="contents">
              <Detail label="Applicant">
                <span className="font-sans font-bold">{row.name}</span>
                <br />
                {row.email}
              </Detail>
              <Detail label="Role">{row.jobSlug.replaceAll("-", " ")}</Detail>
              <Detail label="Message">{row.message ?? "No message supplied."}</Detail>
              <Detail label="Received">{DATE_FORMAT.format(row.createdAt)} UTC</Detail>
            </dl>
            <div className="flex min-w-0 flex-col items-start gap-5">
              <ButtonLink
                href={`/submissions/applications/${row.id}/cv`}
                size="compact"
                bullet={false}
                className="max-w-full wrap-anywhere"
              >
                {row.cvFilename}
              </ButtonLink>
              {admin ? (
                <RemoveSubmissionControl
                  kind="application"
                  id={row.id}
                  label="Application"
                />
              ) : null}
            </div>
          </div>
        </RecordCard>
      ))}
    </ul>
  );
}

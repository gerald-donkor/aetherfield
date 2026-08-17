import type { ListedLead } from "../../../lib/db/lead-queries";
import { RemoveSubmissionControl } from "../../submissions/action-controls";
import { DATE_FORMAT, Detail, EmptyState, RecordCard } from "./record";

/**
 * Demo requests, as a list. One of four entity lists prompt 120 moved out of
 * `app/submissions/page.tsx`: each has its own columns, its own grid ratios and
 * its own admin control, and holding all four in the page was the divergent
 * change the split exists to end.
 *
 * **A Server Component.** The rows are read by the page (AGENTS.md 6.2) and
 * arrive as a prop; the only client code is the removal control, which is a leaf
 * and stays where it was, colocated with its action.
 */

export function LeadList({ rows, admin }: { rows: ListedLead[]; admin: boolean }) {
  if (rows.length === 0) return <EmptyState label="demo requests" />;
  return (
    <ul aria-label="Demo requests">
      {rows.map((row) => (
        <RecordCard key={row.id}>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.1fr_1.3fr_1fr_0.8fr_auto] lg:items-start">
            <dl className="contents">
              <Detail label="Contact">
                <span className="font-sans font-bold">{row.name}</span>
                <br />
                {row.email}
              </Detail>
              <Detail label="Company / message">
                <span className="font-sans font-bold">{row.company}</span>
                {row.message ? <><br />{row.message}</> : null}
              </Detail>
              <Detail label="Source">{row.source.replace("_", " ")}</Detail>
              <Detail label="Received">{DATE_FORMAT.format(row.createdAt)} UTC</Detail>
            </dl>
            {admin ? (
              <RemoveSubmissionControl kind="lead" id={row.id} label="Lead" />
            ) : null}
          </div>
        </RecordCard>
      ))}
    </ul>
  );
}

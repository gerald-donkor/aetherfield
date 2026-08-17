import type { ListedSubscriber } from "../../../lib/db/subscriber-queries";
import { RemoveSubmissionControl } from "../../submissions/action-controls";
import { DATE_FORMAT, Detail, EmptyState, RecordCard } from "./record";

/**
 * Newsletter subscribers, as a list — the state machine's four timestamps read
 * as one lifecycle line. Moved out of `app/submissions/page.tsx` by prompt 120.
 *
 * **A Server Component**, on `LeadList`'s terms: the rows are the page's read
 * and the removal control is the only client leaf.
 */

export function SubscriberList({
  rows,
  admin,
}: {
  rows: ListedSubscriber[];
  admin: boolean;
}) {
  if (rows.length === 0) return <EmptyState label="newsletter subscribers" />;
  return (
    <ul aria-label="Newsletter subscribers">
      {rows.map((row) => (
        <RecordCard key={row.id}>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.4fr_0.7fr_1fr_1fr_auto] lg:items-start">
            <dl className="contents">
              <Detail label="Email">{row.email}</Detail>
              <Detail label="Status">{row.status}</Detail>
              <Detail label="Created">{DATE_FORMAT.format(row.createdAt)} UTC</Detail>
              <Detail label="Lifecycle">
                {row.confirmationTokenSentAt ? (
                  <>Confirmation sent {DATE_FORMAT.format(row.confirmationTokenSentAt)} UTC</>
                ) : (
                  <>No confirmation send recorded</>
                )}
                {row.confirmedAt ? (
                  <><br />Confirmed {DATE_FORMAT.format(row.confirmedAt)} UTC</>
                ) : null}
                {row.unsubscribedAt ? (
                  <><br />Unsubscribed {DATE_FORMAT.format(row.unsubscribedAt)} UTC</>
                ) : null}
              </Detail>
            </dl>
            {admin ? (
              <RemoveSubmissionControl
                kind="subscriber"
                id={row.id}
                label="Subscriber"
              />
            ) : null}
          </div>
        </RecordCard>
      ))}
    </ul>
  );
}

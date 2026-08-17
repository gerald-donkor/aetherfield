import type { ReactNode } from "react";

/**
 * The read idiom every submissions list shares — a bordered record row, a
 * labelled detail inside it, the empty state that stands in for a list with
 * nothing in it, and the one date format all four lists print.
 *
 * **Server Components.** Nothing here holds state, and the date format is
 * applied on the server with a fixed locale and UTC so the markup a browser
 * receives is the markup the server rendered.
 *
 * Moved out of `app/submissions/page.tsx` by prompt 120, unchanged. The same
 * idiom is used by `/activity`'s summary, deliberately — see
 * `app/_components/activity/emissions-summary.tsx`.
 */

export const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function Detail({ label, children }: { label: string; children: ReactNode }) {
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

export function RecordCard({ children }: { children: ReactNode }) {
  return (
    <li className="border-b border-border py-6 first:border-t lg:py-5">
      {children}
    </li>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="border-y border-border py-14">
      <h2 className="font-sans text-[24px] leading-7 font-bold">Nothing here yet.</h2>
      <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
        No live {label} match this view.
      </p>
    </div>
  );
}

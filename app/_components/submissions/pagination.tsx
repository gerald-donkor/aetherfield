import Link from "next/link";

import { SUBMISSIONS_PAGE_SIZE } from "../../../lib/db/lead-queries";
import type { SubmissionView } from "../../../lib/validation/submissions";
import { VIEW_LABELS, viewHref } from "./views";

/**
 * The submissions workspace's pager. Moved out of `app/submissions/page.tsx` by
 * prompt 120 — it is the one concern in that file that was neither the page's
 * data path nor one entity's row shape.
 *
 * **A Server Component.** Both controls are links, so paging is a navigation and
 * the page re-reads its rows server-side; there is no client state to hold.
 *
 * The `<span />` in each empty branch is deliberate: it keeps `justify-between`
 * putting the count in the middle when only one direction is available.
 */

export function Pagination({
  view,
  page,
  total,
}: {
  view: SubmissionView;
  page: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE));
  return (
    <nav
      aria-label={`${VIEW_LABELS[view]} pagination`}
      className="mt-8 flex items-center justify-between gap-5"
    >
      {page > 1 ? (
        <Link
          href={viewHref(view, page - 1)}
          className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Previous
        </Link>
      ) : <span />}
      <p className="font-mono text-caption text-muted">
        Page {page} of {totalPages} · {total} total
      </p>
      {page < totalPages ? (
        <Link
          href={viewHref(view, page + 1)}
          className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Next
        </Link>
      ) : <span />}
    </nav>
  );
}

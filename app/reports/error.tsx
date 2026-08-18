"use client";

import { Button } from "../_components/primitives";
import { WorkspaceBoundary } from "../_components/workspace-boundary";

/**
 * The unexpected-error state for the whole `/reports` subtree.
 *
 * **It reveals no partial figure.** A report is a disclosure; showing half of
 * one because a read failed would be worse than showing none, so this state
 * says what did not happen and offers the request again.
 */
export default function ReportsError({ reset }: { reset: () => void }) {
  return (
    <WorkspaceBoundary
      eyebrow="REPORTS"
      heading="This view isn't available just now."
      headingClassName="max-w-[760px]"
      current="reports"
    >
      <p className="mt-7 max-w-[640px] font-serif text-p2 text-muted">
        No report, figure or narrative was displayed, and nothing was changed.
        Try the request again.
      </p>
      <Button className="mt-10" onClick={reset}>
        Try again
      </Button>
    </WorkspaceBoundary>
  );
}

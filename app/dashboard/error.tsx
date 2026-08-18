"use client";

import { Button } from "../_components/primitives";
import { WorkspaceBoundary } from "../_components/workspace-boundary";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <WorkspaceBoundary
      eyebrow="OVERVIEW"
      heading="This view isn't available just now."
      headingClassName="max-w-[760px]"
      current="dashboard"
    >
      <p className="mt-7 max-w-[640px] font-serif text-p2 text-muted">
        No activity, emissions, energy or target figures were displayed. Try
        the request again.
      </p>
      <Button className="mt-10" onClick={reset}>
        Try again
      </Button>
    </WorkspaceBoundary>
  );
}

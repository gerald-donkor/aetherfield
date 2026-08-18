"use client";

import { Button } from "../_components/primitives";
import { WorkspaceBoundary } from "../_components/workspace-boundary";

export default function TargetsError({ reset }: { reset: () => void }) {
  return (
    <WorkspaceBoundary
      eyebrow="TARGETS"
      heading="This view isn't available just now."
      headingClassName="max-w-[760px]"
      current="targets"
    >
      <p className="mt-7 max-w-[640px] font-serif text-p2 text-muted">
        No target or emissions figures were displayed. Try the request again.
      </p>
      <Button className="mt-10" onClick={reset}>
        Try again
      </Button>
    </WorkspaceBoundary>
  );
}

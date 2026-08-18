import { WorkspaceBoundary } from "../_components/workspace-boundary";

export default function TargetsLoading() {
  return (
    <WorkspaceBoundary
      eyebrow="TARGETS"
      heading="Loading targets."
      current="targets"
      status="Checking access and reading the current commitments..."
    />
  );
}

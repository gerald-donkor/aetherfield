import { WorkspaceBoundary } from "../_components/workspace-boundary";

export default function SubmissionsLoading() {
  return (
    <WorkspaceBoundary
      eyebrow="OPERATIONS"
      heading="Loading submissions."
      status="Checking access and reading the current view..."
    />
  );
}

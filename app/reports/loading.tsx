import { WorkspaceBoundary } from "../_components/workspace-boundary";

export default function ReportsLoading() {
  return (
    <WorkspaceBoundary
      eyebrow="REPORTS"
      heading="Loading reports."
      current="reports"
      status="Checking access and reading the stored snapshots..."
    />
  );
}

import { WorkspaceBoundary } from "../_components/workspace-boundary";

export default function DashboardLoading() {
  return (
    <WorkspaceBoundary
      eyebrow="OVERVIEW"
      heading="Loading current evidence."
      current="dashboard"
      status="Checking access and reading the reporting window..."
    />
  );
}

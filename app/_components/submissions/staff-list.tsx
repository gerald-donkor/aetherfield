import type { ListedAccount } from "../../../lib/db/auth-queries";
import { StaffRoleControl } from "../../submissions/action-controls";
import { DATE_FORMAT, Detail, EmptyState, RecordCard } from "./record";

/**
 * Verified accounts and their **staff** role, as a list — the admin-only view.
 * Moved out of `app/submissions/page.tsx` by prompt 120.
 *
 * **The role map here is the staff one and is not the organisation one.**
 * `admin` / `staff` / `null` read as Admin / Staff / Customer; `/account` maps a
 * tenant-side role through `ORGANIZATION_ROLE_LABELS`. AGENTS.md 11.1 makes the
 * two role systems orthogonal, so the two maps stay two maps — prompt 120's
 * review proposed merging them and that was refused.
 *
 * **Hiding a control is presentation, never enforcement** (AGENTS.md 11.2
 * rule 2). `controllable` decides what is rendered; `changeStaffRole` re-reads
 * the acting role from Postgres regardless.
 */

export function StaffList({
  rows,
  actingAdminId,
}: {
  rows: ListedAccount[];
  actingAdminId: string;
}) {
  if (rows.length === 0) return <EmptyState label="verified accounts" />;
  return (
    <ul aria-label="Verified accounts">
      {rows.map((row) => {
        const roleLabel =
          row.role === "admin"
            ? "Admin"
            : row.role === "staff"
              ? "Staff"
              : row.role === null
                ? "Customer"
                : "Other";
        const controllable =
          row.id !== actingAdminId &&
          (row.role === null || row.role === "staff");
        return (
          <RecordCard key={row.id}>
            <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_1.3fr_0.7fr_0.8fr_auto] lg:items-start">
              <dl className="contents">
                <Detail label="Name">{row.name}</Detail>
                <Detail label="Email">{row.email}</Detail>
                <Detail label="Verified">{row.emailVerified ? "Yes" : "No"}</Detail>
                <Detail label="Role / created">
                  {roleLabel}
                  <br />
                  {DATE_FORMAT.format(row.createdAt)} UTC
                </Detail>
              </dl>
              {controllable ? (
                <StaffRoleControl
                  userId={row.id}
                  displayName={row.name}
                  isStaff={row.role === "staff"}
                />
              ) : null}
            </div>
          </RecordCard>
        );
      })}
    </ul>
  );
}

import "server-only";

import { eq } from "drizzle-orm";

import { user } from "./auth-schema";
import { getDb } from "./client";

export type StaffRole = "staff" | "admin";

/**
 * Roles are authorization data, so they are read from Postgres on every
 * protected request rather than trusted from Better Auth's session payload.
 */
export async function getStaffRole(
  userId: string,
): Promise<StaffRole | null> {
  const [record] = await getDb()
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return record?.role === "staff" || record?.role === "admin"
    ? record.role
    : null;
}

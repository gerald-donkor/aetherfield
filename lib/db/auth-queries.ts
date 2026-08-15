import "server-only";

import { and, count, desc, eq, isNull, ne, or } from "drizzle-orm";

import { user } from "./auth-schema";
import { getDb } from "./client";
import { SUBMISSIONS_PAGE_SIZE } from "./lead-queries";
import { withSafeQueryErrors } from "./query-error";

export type StaffRole = "staff" | "admin";

/**
 * Roles are authorization data, so they are read from Postgres on every
 * protected request rather than trusted from Better Auth's session payload.
 */
export const getStaffRole = withSafeQueryErrors(
  "auth-queries.getStaffRole",
  getStaffRoleImpl,
);

async function getStaffRoleImpl(
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

export type ListedAccount = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  createdAt: Date;
};

export const listVerifiedAccounts = withSafeQueryErrors(
  "auth-queries.listVerifiedAccounts",
  listVerifiedAccountsImpl,
);

async function listVerifiedAccountsImpl(
  page: number,
): Promise<ListedAccount[]> {
  return getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.emailVerified, true))
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(SUBMISSIONS_PAGE_SIZE)
    .offset((page - 1) * SUBMISSIONS_PAGE_SIZE);
}

export const countVerifiedAccounts = withSafeQueryErrors(
  "auth-queries.countVerifiedAccounts",
  countVerifiedAccountsImpl,
);

async function countVerifiedAccountsImpl(): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(user)
    .where(eq(user.emailVerified, true));
  return row.count;
}

/**
 * Grants or revokes staff only. The WHERE is the authority for every guard:
 * no self-change, no admin/unknown-role target, and no unverified target.
 */
export const setStaffRole = withSafeQueryErrors(
  "auth-queries.setStaffRole",
  setStaffRoleImpl,
);

async function setStaffRoleImpl({
  actorId,
  targetId,
  role,
}: {
  actorId: string;
  targetId: string;
  role: "staff" | null;
}): Promise<boolean> {
  const [row] = await getDb()
    .update(user)
    .set({ role })
    .where(
      and(
        eq(user.id, targetId),
        ne(user.id, actorId),
        eq(user.emailVerified, true),
        or(isNull(user.role), eq(user.role, "staff")),
      ),
    )
    .returning({ id: user.id });
  return Boolean(row);
}

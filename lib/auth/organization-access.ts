import "server-only";

import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

import type { OrganizationRole } from "../validation/organization";

/**
 * The tenant-side role set — **`owner` and `member`, and deliberately not
 * `admin`** (AGENTS.md 11.1).
 *
 * Better Auth ships three default organisation roles: `owner`, `admin` and
 * `member`. This module registers only two, for two reasons:
 *
 * 1. §11.1 names exactly `owner` and `member` for the tenant side. A third role
 *    with no defined powers is dead surface, and the first phase-two feature to
 *    ask "what can an org admin do?" would have to invent the answer.
 * 2. **`admin` already means something else here.** `user.role` carries
 *    Aetherfield's own staff roles, `staff` and `admin` (step 7,
 *    `lib/db/auth-queries.ts`). An organisation-level `admin` sharing that word
 *    would make every authorisation read ambiguous at a glance, which is what
 *    §11's orthogonality rule exists to prevent.
 *
 * **This is not a security boundary on its own.** Leaving `admin` out of the
 * roles map means the plugin will not accept it as a role value; it authorises
 * nothing by itself. Tenant authorisation is `lib/auth/organization.ts`, which
 * re-reads the membership row from Postgres on every request (§11.2 rule 5).
 *
 * `defaultStatements` is Better Auth's own resource/action map for this plugin
 * and `ownerAc` / `memberAc` are its own role definitions over that map — both
 * imported rather than restated, so a library upgrade that adds a resource does
 * not silently leave these two roles behind.
 */
export const organizationAccessControl = createAccessControl(defaultStatements);

/**
 * The roles the plugin accepts, keyed by the union declared in
 * `lib/validation/organization.ts` so the names exist exactly once
 * (AGENTS.md 9.2 rule 2). `creatorRole` in `lib/auth/server.ts` names `owner`,
 * so the first member of every organisation lands there.
 */
export const organizationRoles: Record<
  OrganizationRole,
  typeof ownerAc | typeof memberAc
> = {
  owner: ownerAc,
  member: memberAc,
};

import * as z from "zod";

import { workEmailSchema } from "./lead";

/**
 * The organisation's input contract and its role vocabulary — the one set of
 * rules, shared verbatim by the client leaf and the Server Action (AGENTS.md
 * 6.2, 10 rule 1).
 *
 * **Not server-only, like every module beside it, and for the same reason.**
 * It reads no secret and touches no connection; being importable from the
 * browser is the whole point. The client copy is a courtesy to the person
 * filling the form, the server copy inside the action is the check.
 *
 * **It imports nothing from `lib/db/` and nothing from `better-auth`.**
 * `lib/db/schema.ts` calls `pgEnum` at module scope, so importing it here would
 * put `drizzle-orm/pg-core` in a browser bundle (AGENTS.md 6.3); the role names
 * live here rather than next to the access-control definition for the same
 * reason, and `lib/auth/organization-access.ts` imports them from this module
 * so the union is still declared exactly once (AGENTS.md 9.2 rule 2).
 */

/** The tenant-side roles (AGENTS.md 11.1). Orthogonal to `user.role`, which
    carries Aetherfield's own `staff` / `admin`. */
export const ORGANIZATION_ROLES = ["owner", "member"] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/**
 * The word a person reads for each role.
 *
 * Declared beside the union rather than in the page that first rendered it, so
 * `/account`, the members panel, the invitation page and the invitation email
 * cannot drift into four spellings of the same two roles (AGENTS.md 9.2 rule 2
 * applied to the label as well as the value).
 */
export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Owner",
  member: "Member",
};

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    typeof value === "string" &&
    (ORGANIZATION_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Route segments an organisation slug may never take.
 *
 * The slug is not currently in a URL — step 8 ships no `/[org]` route — but it
 * is the identifier phase two will reach for when one is needed, and a slug
 * already in the table is far more expensive to reject later than at the point
 * it is created. Every top-level segment that exists today is listed, plus the
 * handful phase two is already committed to by §5.2.
 */
const RESERVED_SLUGS = new Set([
  "about",
  "account",
  "activity",
  "api",
  "article",
  "careers",
  "dashboard",
  "design-system",
  "forgot-password",
  /* Added by prompt 63, which introduces `/invitation/[id]`. The plural is
     reserved alongside it for the same reason every other pair here is: the
     segment that exists and the one a later session would reach for. */
  "invitation",
  "invitations",
  "job-listing",
  "journal",
  "new",
  "organisation",
  "organization",
  "reports",
  "reset-password",
  "settings",
  "sign-in",
  "sign-up",
  "submissions",
  "verify-email",
]);

/**
 * Lowercased and trimmed *before* the shape check, so a pasted slug with a
 * stray capital is corrected rather than rejected — the same courtesy
 * `lib/validation/lead.ts` extends to an email address.
 */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(2, { error: "Use at least 2 characters." })
      .max(48, { error: "Use 48 characters or fewer." })
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        error:
          "Use lowercase letters, numbers and single hyphens between them.",
      })
      .refine((value) => !RESERVED_SLUGS.has(value), {
        error: "That name is reserved. Choose another.",
      }),
  );

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter an organisation name." })
    .max(160, { error: "Use 160 characters or fewer." }),
  slug,
});

/** The two fields the form renders. */
export type CreateOrganizationField = "name" | "slug";

export type CreateOrganizationFieldErrors = Record<
  CreateOrganizationField,
  string
>;

export const NO_ORGANIZATION_FIELD_ERRORS: CreateOrganizationFieldErrors = {
  name: "",
  slug: "",
};

/* -------------------------------------------------------------------------- */
/*  Invitations and membership — prompt 63, closing what step 8 deferred        */
/* -------------------------------------------------------------------------- */

/**
 * The ids Better Auth generates for `member` and `invitation` rows.
 *
 * **Verified, not recalled** (AGENTS.md 12 rule 2). Better Auth 1.6.26's
 * `generateId` is `createRandomStringGenerator("a-z", "A-Z", "0-9")(size || 32)`
 * (`node_modules/@better-auth/core/dist/utils/id.mjs`), and this project sets no
 * `advanced.database.generateId` override, so every row of both tables carries
 * 32 characters from that alphabet. That is the same contract step 7 recorded
 * for `user.id` in `lib/validation/submissions.ts`; it is restated here rather
 * than imported because that module is the submissions view's vocabulary and
 * this one is the organisation's, and neither should depend on the other.
 *
 * The regex is a **shape** check, not an authorisation: a well-formed id still
 * has to survive the tenant predicate in the action.
 */
const authGeneratedId = z.string().regex(/^[A-Za-z0-9]{32}$/, {
  error: "That reference is not valid.",
});

export const invitationIdSchema = authGeneratedId;
export const memberIdSchema = authGeneratedId;

/** What a member may be invited as. The union is `ORGANIZATION_ROLES`, never a
    re-declared copy of it (AGENTS.md 9.2 rule 2). */
export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES, {
  error: "Choose a role.",
});

/**
 * The invite form's contract.
 *
 * The address is trimmed and lowercased by `workEmailSchema` before the format
 * check, so `invitation.email` is written lowercased and compared lowercased
 * without any caller having to remember to (AGENTS.md 9.2 rule 4). Better Auth's
 * endpoint lowercases again on its own side; that is belt and braces, not a
 * reason to skip it here.
 */
export const inviteMemberSchema = z.object({
  email: workEmailSchema,
  role: organizationRoleSchema,
});

/** The two fields the invite form renders. */
export type InviteMemberField = "email" | "role";

export type InviteMemberFieldErrors = Record<InviteMemberField, string>;

export const NO_INVITE_FIELD_ERRORS: InviteMemberFieldErrors = {
  email: "",
  role: "",
};

export const cancelInvitationSchema = z.object({
  invitationId: invitationIdSchema,
});

export const removeMemberSchema = z.object({ memberId: memberIdSchema });

export const invitationResponseSchema = z.object({
  invitationId: invitationIdSchema,
  decision: z.enum(["accept", "decline"]),
});

/**
 * The membership path's shared copy.
 *
 * Declared once here, next to the schema, for the reason every other `NO_*` and
 * message constant in this folder is: a client leaf and a Server Action must
 * say the same thing, and a `"use server"` module can export nothing but async
 * functions at runtime.
 */
export const MEMBERSHIP_ERRORS = {
  GENERIC:
    "We couldn't complete that just now. Please try again in a moment.",
  SIGNED_OUT: "Your session has expired. Sign in again to continue.",
  NO_ORGANIZATION:
    "This account belongs to no organisation, so there is nothing to manage.",
  NOT_OWNER: "Only an owner can manage this organisation's members.",
  INVALID: "Check the marked fields and try again.",
  ALREADY_MEMBER: "That person is already a member of this organisation.",
  ALREADY_INVITED:
    "That address already has a pending invitation. Cancel it first to send a new one.",
  INVITATION_LIMIT:
    "This organisation has reached its limit of pending invitations. Cancel one to send another.",
  MEMBERSHIP_LIMIT:
    "This organisation has reached its limit of members. Contact us to raise it.",
  INVITATION_NOT_FOUND: "That invitation is no longer open.",
  MEMBER_NOT_FOUND: "That person is no longer a member of this organisation.",
  LAST_OWNER:
    "You are the only owner. Invite another owner before leaving, so the organisation keeps one.",
  NOT_RECIPIENT: "This invitation was sent to a different address.",
  /* Second person, unlike `ALREADY_MEMBER` above: that one is shown to an owner
     inviting someone else, this one to the invitee reading their own link. */
  ALREADY_JOINED: "You are already a member of this organisation.",
  VERIFY_EMAIL: "Verify your email address before responding to an invitation.",
} as const;

/**
 * Derive a candidate slug from a name, for the form's convenience only.
 *
 * **Never trusted.** The action re-parses whatever arrives with
 * `createOrganizationSchema`, so a derived slug is worth exactly as much as a
 * typed one (AGENTS.md 6.2: client validation is a courtesy, not a check).
 */
export function slugifyOrganizationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    /* The escape rather than a literal curly apostrophe, so the source stays
       free of curly quotes (AGENTS.md content conventions) while still
       stripping one a person pastes in from a word processor. */
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

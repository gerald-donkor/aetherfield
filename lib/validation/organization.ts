import * as z from "zod";

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
  "api",
  "article",
  "careers",
  "dashboard",
  "design-system",
  "forgot-password",
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

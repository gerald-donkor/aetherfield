import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { waitUntil } from "@vercel/functions";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getStaffRole } from "../db/auth-queries";
import { getDb } from "../db/client";
import { databaseSchema } from "../db/database-schema";
import {
  sendAccountVerificationEmail,
  sendPasswordResetEmail,
} from "../email/auth";
import {
  organizationAccessControl,
  organizationRoles,
} from "./organization-access";

/**
 * Better Auth is constructed lazily for the same reason the database pool is:
 * Next evaluates route modules during `next build`, when local secrets may be
 * absent. The first real auth request creates both and later requests reuse
 * the same instances.
 */
function createAuth() {
  return betterAuth({
    appName: "Aetherfield",
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: databaseSchema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await sendPasswordResetEmail({ user, url, token });
      },
    },
    emailVerification: {
      expiresIn: 60 * 60,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        await sendAccountVerificationEmail({ user, url, token });
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        // Google is reachable from two pages now, and the two mean different
        // things. Without this, an unrecognised Google account signing in from
        // /sign-in would silently be *registered*, which the page does not say
        // and the user did not ask for. With it, only /sign-up sends
        // `requestSignUp`, so only /sign-up can create a user; /sign-in reports
        // that no account exists. Enforced server-side at the OAuth callback,
        // not by the two labels.
        disableImplicitSignUp: true,
      },
    },
    account: {
      encryptOAuthTokens: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      backgroundTasks: {
        handler: waitUntil,
      },
    },
    plugins: [
      /**
       * Build step 8 — the tenant boundary every phase-two query carries
       * (AGENTS.md 9.2 rule 6).
       *
       * **What this plugin is not.** It stores organisations, members and the
       * session's active organisation; it does not authorise a tenant read.
       * That is `lib/auth/organization.ts`, which re-reads the membership row
       * per request rather than trusting the session payload (§11.2 rule 5).
       */
      organization({
        ac: organizationAccessControl,
        roles: organizationRoles,
        /* The creator is the owner, and `owner` is one of the two roles above.
           §11.1's tenant side has no third role. */
        creatorRole: "owner",
        /**
         * Verified accounts only. Sign-in already requires verification
         * (`requireEmailVerification` above), so this is not the thing keeping
         * unverified users out — it makes the rule explicit at the creation
         * boundary instead of leaving it as a consequence of another setting.
         */
        allowUserToCreateOrganization: async (user) =>
          user.emailVerified === true,
        /**
         * **Both limits are judgements, not measurements** (AGENTS.md 12
         * rule 4). Nothing has shipped, so there is no traffic to fit against.
         * They are bounds against runaway creation on a free Neon plan, not
         * product requirements, and are to be revisited against real usage
         * rather than treated as fitted — the same footing as every window in
         * `lib/rate-limit/`.
         */
        organizationLimit: 3,
        membershipLimit: 100,
        /**
         * Deletion is out of scope for step 8, and off rather than merely
         * unbuilt: the plugin's delete cascades members and invitations, while
         * §9.2 rule 5 wants a soft-delete with an audit trail so an erasure
         * request is one reversible operation. Design the two together, later.
         */
        disableOrganizationDeletion: true,
        /* Teams and dynamic access control stay off. Neither is in §5.2
           step 8, and §5.2's "do not overbuild" covers the temptation. */
      }),
      // Must stay last: it applies Better Auth's Set-Cookie headers through
      // Next.js after the rest of the auth pipeline has completed.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}

export async function getCurrentAccount() {
  // `headers()` is intentionally first: it marks the protected route dynamic
  // before auth/database construction, preserving env-less production builds.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  return {
    session: session.session,
    user: session.user,
    role: await getStaffRole(session.user.id),
  };
}

export async function requireSubmissionsAccount(callbackURL: string) {
  const account = await getCurrentAccount();
  if (!account) {
    const query = new URLSearchParams({ callbackURL });
    redirect(`/sign-in?${query.toString()}`);
  }
  if (account.role !== "staff" && account.role !== "admin") {
    redirect("/account");
  }
  return account;
}

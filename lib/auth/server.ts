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
import { sendOrganizationInvitation } from "../email/organization";
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
        /**
         * **48 hours, the plugin's own default, kept rather than changed.**
         * Stated explicitly instead of left implicit, because a link's lifetime
         * is a security decision and an unwritten default is not a decision.
         * The judgement (AGENTS.md 12 rule 4 — there is no traffic to fit
         * against) is that two days spans a weekday and a weekend for a person
         * who read the mail on a phone and acted on a laptop, while keeping a
         * forwarded or leaked link short-lived. `/account` shows every pending
         * invitation with its expiry and an owner can cancel and re-send, so a
         * missed window costs one click rather than a support conversation.
         */
        invitationExpiresIn: 60 * 60 * 48,
        /**
         * **A bound against runaway pending invitations on a free Neon plan,
         * not a product requirement** — the same footing as `organizationLimit`
         * and `membershipLimit` above, and equally a judgement. It counts
         * *pending* invitations only, so it is not a cap on how many people an
         * organisation may ever have; that is `membershipLimit`. 50 against a
         * membership limit of 100 leaves an organisation able to invite its
         * whole roster in two passes.
         */
        invitationLimit: 50,
        /**
         * **On, and the alternative is worse.** Off, the endpoint answers a
         * second invitation to an address that already has a pending one with
         * `USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION`
         * (`crud-invites.mjs:132`) — and re-inviting is exactly what an owner
         * does when the first message did not arrive, which is the case they
         * cannot see and we cannot diagnose for them. On, the stale row is
         * moved to `canceled` and a fresh invitation with a fresh id and a fresh
         * expiry is created, so the old link stops working the moment a new one
         * is issued. That is the safer of the two: one live link per address at
         * a time.
         */
        cancelPendingInvitationsOnReInvite: true,
        /**
         * The invitation email — the option this plugin block was configured
         * without at step 8, and the reason invitations existed as a table and
         * nothing else. Delegated whole to `lib/email/`, like every other send
         * on this site; the sender returns rather than throws, and the plugin
         * runs it as a background task, so a failed message can never fail the
         * write (AGENTS.md 10 rule 4 — see that module for the verification).
         */
        sendInvitationEmail: async (data) => {
          await sendOrganizationInvitation({
            invitationId: data.id,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            role: data.role,
            expiresAt: data.invitation.expiresAt,
            to: data.email,
          });
        },
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

import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";

import { getStaffRole } from "../db/auth-queries";
import { getDb } from "../db/client";
import { databaseSchema } from "../db/database-schema";

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
      // Deliberately false until step 3 can send verification email.
      requireEmailVerification: false,
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
    // Must stay last: it applies Better Auth's Set-Cookie headers through
    // Next.js after the rest of the auth pipeline has completed.
    plugins: [nextCookies()],
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

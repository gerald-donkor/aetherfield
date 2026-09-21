"use client";

import { createAuthClient } from "better-auth/react";

/**
 * The one browser-side Better Auth client.
 *
 * Every auth leaf and the site navbar must share this instance so a successful
 * mutation invalidates the same session atom that all mounted subscribers read.
 * Authorisation remains server-side in `lib/auth/server.ts`.
 *
 * Email sign-in still sends `callbackURL` so an unverified account receives a
 * verification link with the settled `/verify-email?verified=1` destination.
 * Better Auth also marks a successful sign-in response as a redirect to that
 * same URL. Suppress only that client redirect here: the form owns the single
 * successful navigation to `/account`, while social sign-in and every other
 * Better Auth redirect retain the library's default behavior.
 */
export const authClient = createAuthClient({
  fetchOptions: {
    plugins: [
      {
        id: "email-sign-in-navigation",
        name: "Email sign-in navigation",
        hooks: {
          onSuccess(context) {
            const path = new URL(
              context.request.url.toString(),
              window.location.origin,
            ).pathname;
            if (
              path.endsWith("/sign-in/email") &&
              context.data &&
              typeof context.data === "object" &&
              "redirect" in context.data
            ) {
              context.data.redirect = false;
            }
          },
        },
      },
    ],
  },
});

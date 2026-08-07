"use client";

import { createAuthClient } from "better-auth/react";
import { useEffect } from "react";

const authClient = createAuthClient();

const GENERIC_FAILURE =
  "We couldn't connect your Google account. Please try again.";
const NO_ACCOUNT_FAILURE =
  "There's no Aetherfield account for that Google address. Create one first, then sign in.";

/* Better Auth's own code when a callback would have created a user but the
   provider carries `disableImplicitSignUp` and the request did not ask to sign
   up (`api/routes/callback.mjs`, `oauth2/link-account.mjs`, v1.6.26). It is
   read only to choose which of the two messages above to show, and is stripped
   from the URL with everything else the provider sent back — neither it nor
   `error_description` is ever rendered. */
const SIGNUP_DISABLED = "signup_disabled";

/** The official multi-colour Google "G", inlined as four paths so the auth card
    makes no network request it does not make today. Google's guidelines forbid
    recolouring or a monochrome cut, so the fills are literal brand hex and are
    deliberately the only colours in this component that are not `@theme`
    tokens. Decorative beside a text label, so it is hidden from assistive
    technology and the button keeps its accessible name from its text. */
function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * The one Google control, rendered by both `/sign-in` and `/sign-up`.
 *
 * It owns the provider call and the `?error=` cleanup, and nothing else: the
 * parent form still owns the single pending state, so a Google attempt and an
 * email attempt can never run at once. `action` decides the label and whether
 * the request is allowed to create a user; the provider carries
 * `disableImplicitSignUp`, so only `/sign-up` sends `requestSignUp`.
 *
 * `window.location`, never `useSearchParams` — reading search params through
 * the hook would opt both pages out of static rendering.
 */
export function GoogleSignInButton({
  action,
  errorPath,
  disabled,
  pending,
  onMessage,
  onPendingChange,
}: {
  action: "sign-in" | "sign-up";
  errorPath: string;
  disabled: boolean;
  pending: boolean;
  onMessage: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return;

    const code = url.searchParams.get("error");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    const message =
      action === "sign-in" && code === SIGNUP_DISABLED
        ? NO_ACCOUNT_FAILURE
        : GENERIC_FAILURE;
    const statusTask = window.setTimeout(() => onMessage(message), 0);
    return () => window.clearTimeout(statusTask);
  }, [action, onMessage]);

  async function onClick() {
    onMessage("");
    onPendingChange(true);

    try {
      const origin = window.location.origin;
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL("/account", origin).toString(),
        errorCallbackURL: new URL(errorPath, origin).toString(),
        ...(action === "sign-up" ? { requestSignUp: true } : {}),
      });
      if (error) onMessage(GENERIC_FAILURE);
    } catch {
      onMessage(GENERIC_FAILURE);
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center justify-center gap-[10px] border border-border bg-white px-4 font-mono text-button font-medium text-ink outline-none transition-[background-color,border-color,box-shadow] hover:border-ink hover:bg-surface focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:underline"
    >
      <GoogleMark />
      {pending
        ? "Connecting to Google..."
        : action === "sign-in"
          ? "Sign in with Google"
          : "Sign up with Google"}
    </button>
  );
}

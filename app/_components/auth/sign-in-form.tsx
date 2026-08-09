"use client";

import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button, Field } from "../primitives";
import { GoogleSignInButton } from "./google-sign-in-button";

const authClient = createAuthClient();

/* The same discriminated path `/sign-up` uses. A bare boolean would let a
   Google attempt and an email attempt run at once and report over each other. */
type PendingPath = "email" | "google" | null;

export function SignInForm() {
  const router = useRouter();
  const statusRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingPath>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  const onGooglePendingChange = useCallback(
    (googlePending: boolean) => setPending(googlePending ? "google" : null),
    [],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");
    const nextErrors = {
      email: email && email.includes("@") ? "" : "Enter a valid email address.",
      password:
        password.length < 8 || password.length > 128
          ? "Use between 8 and 128 characters."
          : "",
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      setMessage("Check the marked fields and try again.");
      return;
    }

    setPending("email");
    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
        /* Better Auth reuses this callback when a valid-password sign-in is
           blocked for an unverified address and `sendOnSignIn` issues a new
           link. A verified sign-in still takes the explicit `/account`
           navigation below; only the verification link lands here. */
        callbackURL: new URL(
          "/verify-email?verified=1",
          window.location.origin,
        ).toString(),
      });
      if (error) {
        setMessage(
          error.code === "EMAIL_NOT_VERIFIED"
            ? "Your email isn't verified. A new verification link may have been sent, so check your inbox before trying again."
            : "We couldn't sign you in. Check your details and try again.",
        );
        return;
      }

      router.replace("/account");
      router.refresh();
    } catch {
      setMessage("We couldn't sign you in. Check your details and try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`mb-6 border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "block" : "hidden"
        }`}
      >
        {message}
      </div>
      <GoogleSignInButton
        action="sign-in"
        errorPath="/sign-in"
        disabled={pending !== null}
        pending={pending === "google"}
        onMessage={setMessage}
        onPendingChange={onGooglePendingChange}
      />
      <div className="my-6 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] leading-none text-muted">
          OR SIGN IN WITH EMAIL
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Field
        id="sign-in-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@company.com"
        error={errors.email || undefined}
        disabled={pending !== null}
        required
      />
      <Field
        id="sign-in-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        minLength={8}
        maxLength={128}
        error={errors.password || undefined}
        disabled={pending !== null}
        required
        className="mt-6"
      />
      <p className="mt-3 text-right font-serif text-[16px] text-muted">
        <Link
          href="/forgot-password"
          className="font-sans font-bold text-ink underline decoration-border underline-offset-4 hover:decoration-ink"
        >
          Forgot password?
        </Link>
      </p>
      <Button type="submit" className="mt-8 w-full" disabled={pending !== null}>
        {pending === "email" ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

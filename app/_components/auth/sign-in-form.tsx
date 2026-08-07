"use client";

import { createAuthClient } from "better-auth/react";
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
        callbackURL: new URL("/account", window.location.origin).toString(),
      });
      if (error) {
        setMessage("We couldn't sign you in. Check your details and try again.");
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
      <Button type="submit" className="mt-8 w-full" disabled={pending !== null}>
        {pending === "email" ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

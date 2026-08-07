"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button, Field } from "../primitives";

const authClient = createAuthClient();
const GOOGLE_ERROR_MESSAGE =
  "We couldn't connect your Google account. Please try again.";

type PendingPath = "email" | "google" | null;

export function SignUpForm() {
  const router = useRouter();
  const statusRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingPath>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({
    name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return;

    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    const statusTask = window.setTimeout(
      () => setMessage(GOOGLE_ERROR_MESSAGE),
      0,
    );
    return () => window.clearTimeout(statusTask);
  }, []);

  async function onGoogleSignIn() {
    setMessage("");
    setPending("google");

    try {
      const origin = window.location.origin;
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL("/account", origin).toString(),
        errorCallbackURL: new URL("/sign-up", origin).toString(),
      });
      if (error) setMessage(GOOGLE_ERROR_MESSAGE);
    } catch {
      setMessage(GOOGLE_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");
    const nextErrors = {
      name: name ? "" : "Enter your name.",
      email: email && email.includes("@") ? "" : "Enter a valid email address.",
      password:
        password.length < 8 || password.length > 128
          ? "Use between 8 and 128 characters."
          : "",
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.password) {
      setMessage("Check the marked fields and try again.");
      return;
    }

    setPending("email");
    try {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: new URL("/account", window.location.origin).toString(),
      });
      if (error) {
        setMessage(
          "We couldn't create the account. Check your details or sign in instead.",
        );
        return;
      }

      router.replace("/account");
      router.refresh();
    } catch {
      setMessage(
        "We couldn't create the account. Check your details or sign in instead.",
      );
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
      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={pending !== null}
        className="h-[52px] w-full border border-border bg-white px-4 font-mono text-button font-medium text-ink outline-none transition-[background-color,border-color,box-shadow] hover:border-ink hover:bg-surface focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:underline"
      >
        {pending === "google"
          ? "Connecting to Google..."
          : "Continue with Google"}
      </button>
      <div className="my-6 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] leading-none text-muted">
          OR CREATE WITH EMAIL
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Field
        id="sign-up-name"
        name="name"
        label="Name"
        autoComplete="name"
        error={errors.name || undefined}
        disabled={pending !== null}
        required
      />
      <Field
        id="sign-up-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@company.com"
        error={errors.email || undefined}
        disabled={pending !== null}
        required
        className="mt-6"
      />
      <Field
        id="sign-up-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="8–128 characters."
        minLength={8}
        maxLength={128}
        error={errors.password || undefined}
        disabled={pending !== null}
        required
        className="mt-6"
      />
      <Button
        type="submit"
        className="mt-8 w-full"
        disabled={pending !== null}
      >
        {pending === "email" ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}

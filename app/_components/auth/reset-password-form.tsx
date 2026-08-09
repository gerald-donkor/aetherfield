"use client";

import { createAuthClient } from "better-auth/react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button, ButtonLink, Field } from "../primitives";

const authClient = createAuthClient();

type ResetState = "ready" | "invalid" | "complete";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.has("error")
    ? null
    : searchParams.get("token");
  const tokenRef = useRef<string | null>(initialToken);
  const statusRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ResetState>(
    initialToken ? "ready" : "invalid",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({ password: "", confirmation: "" });

  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    const nextErrors = {
      password:
        password.length < 8 || password.length > 128
          ? "Use between 8 and 128 characters."
          : "",
      confirmation:
        password === confirmation ? "" : "Enter the same password again.",
    };
    setErrors(nextErrors);
    if (nextErrors.password || nextErrors.confirmation) {
      setMessage("Check the marked fields and try again.");
      return;
    }

    const token = tokenRef.current;
    if (!token) {
      setState("invalid");
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (error) {
        tokenRef.current = null;
        setState("invalid");
        setMessage("");
        return;
      }

      tokenRef.current = null;
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
      setState("complete");
      setMessage("Your password has been reset. You can now sign in.");
    } catch {
      tokenRef.current = null;
      setState("invalid");
      setMessage("");
    } finally {
      setPending(false);
    }
  }

  if (state === "invalid") {
    return (
      <div>
        <p className="font-serif text-p2 text-muted">
          This reset link is invalid or has expired. Request a fresh link to
          continue.
        </p>
        <ButtonLink href="/forgot-password" className="mt-8 w-full">
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  if (state === "complete") {
    return (
      <div>
        <div
          ref={statusRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none"
        >
          {message}
        </div>
        <ButtonLink href="/sign-in" className="mt-8 w-full">
          Sign in
        </ButtonLink>
      </div>
    );
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
      <Field
        id="reset-password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="8–128 characters."
        minLength={8}
        maxLength={128}
        error={errors.password || undefined}
        disabled={pending}
        required
      />
      <Field
        id="reset-password-confirmation"
        name="confirmation"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        error={errors.confirmation || undefined}
        disabled={pending}
        required
        className="mt-6"
      />
      <Button type="submit" className="mt-8 w-full" disabled={pending}>
        {pending ? "Resetting password..." : "Reset password"}
      </Button>
    </form>
  );
}

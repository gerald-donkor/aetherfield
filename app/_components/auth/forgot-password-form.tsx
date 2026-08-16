"use client";

import { createAuthClient } from "better-auth/react";
import { type FormEvent, useState } from "react";

import { Button, Field } from "../primitives";
import { FormStatus } from "../form-status";

const authClient = createAuthClient();

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "")
      .trim()
      .toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    setEmailError(validEmail ? "" : "Enter a valid email address.");
    if (!validEmail) {
      setMessage("Check the marked field and try again.");
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: new URL(
          "/reset-password",
          window.location.origin,
        ).toString(),
      });

      if (error) {
        setMessage("We couldn't request a reset link. Please try again.");
        return;
      }

      setComplete(true);
      setMessage("If an account matches that address, we sent a reset link.");
    } catch {
      setMessage("We couldn't request a reset link. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormStatus message={message} as="div" className="mb-6" />
      {complete ? null : (
        <>
          <Field
            id="forgot-password-email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="name@company.com"
            error={emailError || undefined}
            disabled={pending}
            required
          />
          <Button type="submit" className="mt-8 w-full" disabled={pending}>
            {pending ? "Requesting link..." : "Send reset link"}
          </Button>
        </>
      )}
    </form>
  );
}

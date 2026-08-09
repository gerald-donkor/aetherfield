"use client";

import { createAuthClient } from "better-auth/react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button, ButtonLink, Field } from "../primitives";

const authClient = createAuthClient();

export function VerifyEmailResult() {
  const searchParams = useSearchParams();
  const statusRef = useRef<HTMLDivElement>(null);
  const [verified] = useState(
    () => searchParams.get("verified") === "1" && !searchParams.has("error"),
  );
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState("");

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
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    setEmailError(validEmail ? "" : "Enter a valid email address.");
    if (!validEmail) {
      setMessage("Check the marked field and try again.");
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: new URL(
          "/verify-email?verified=1",
          window.location.origin,
        ).toString(),
      });
      if (error) {
        setMessage("We couldn't request a verification link. Please try again.");
        return;
      }

      setComplete(true);
      setMessage(
        "If an account matches that address, we sent a verification link.",
      );
    } catch {
      setMessage("We couldn't request a verification link. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (verified) {
    return (
      <div>
        <p className="font-serif text-p2 text-muted">
          Your email address is verified. Continue to your account.
        </p>
        <ButtonLink href="/account" className="mt-8 w-full">
          Continue to account
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="mb-6 font-serif text-p2 text-muted">
        This verification link is invalid or has expired. Request a fresh link
        to continue.
      </p>
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
      {complete ? null : (
        <>
          <Field
            id="verification-email"
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
            {pending ? "Requesting link..." : "Send verification link"}
          </Button>
        </>
      )}
    </form>
  );
}

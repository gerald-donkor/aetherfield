"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authClient } from "../../../lib/auth/client";
import { Button } from "../primitives";

export function SignOutButton() {
  const router = useRouter();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <div>
      {error ? (
        <p
          ref={errorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="mb-4 font-mono text-[12px] text-ink outline-none"
        >
          {error}
        </p>
      ) : null}
      <Button
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const { error: authError } = await authClient.signOut();
            if (authError) {
              setError("We couldn't sign you out. Try again.");
              return;
            }
            /* The shared client clears every mounted session subscriber after
               sign-out. The destination is public, so one navigation is the
               complete client transition; protected routes still re-check the
               database-backed session on the server. */
            router.replace("/sign-in");
          } catch {
            setError("We couldn't sign you out. Try again.");
          } finally {
            setPending(false);
          }
        }}
        disabled={pending}
      >
        {pending ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
}

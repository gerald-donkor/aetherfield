"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "../primitives";

const authClient = createAuthClient();

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 font-mono text-[12px] text-ink">
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
            router.replace("/sign-in");
            router.refresh();
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

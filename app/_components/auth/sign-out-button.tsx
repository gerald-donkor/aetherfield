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
            /* `router.refresh()` is **not** redundant here, and prompt 109
               kept it deliberately while removing ten others. Better Auth's
               client is not a Server Action: nothing calls `revalidatePath`,
               so nothing invalidates the router cache. The session cookie has
               just changed, and this is what makes the destination render
               against the new one instead of the entry the client already
               holds. */
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

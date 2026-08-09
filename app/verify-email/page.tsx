import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "../_components/auth/auth-shell";
import { VerifyEmailResult } from "../_components/auth/verify-email-result";

export const metadata: Metadata = {
  title: "Verify email — Aetherfield",
  description: "Confirm the email address for your Aetherfield account.",
};

export default function VerifyEmailPage() {
  return (
    <AuthShell
      eyebrow="EMAIL VERIFICATION"
      title="Confirm your email"
      introduction="Verification keeps account access tied to an address you control."
      alternateLabel="Already verified?"
      alternateAction="Sign in"
      alternateHref="/sign-in"
    >
      <Suspense
        fallback={
          <p className="font-serif text-p2 text-muted">Checking your link...</p>
        }
      >
        <VerifyEmailResult />
      </Suspense>
    </AuthShell>
  );
}

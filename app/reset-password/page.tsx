import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "../_components/auth/auth-shell";
import { ResetPasswordForm } from "../_components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password — Aetherfield",
  description: "Choose a new password for your Aetherfield account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      title="Choose a new password"
      introduction="Use a secure password you don't use elsewhere. A reset link can only be used once."
      alternateLabel="Already reset your password?"
      alternateAction="Sign in"
      alternateHref="/sign-in"
    >
      <Suspense
        fallback={
          <p className="font-serif text-p2 text-muted">Checking your link...</p>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}

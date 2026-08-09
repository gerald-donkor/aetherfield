import type { Metadata } from "next";

import { AuthShell } from "../_components/auth/auth-shell";
import { ForgotPasswordForm } from "../_components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password — Aetherfield",
  description: "Request a password reset link for your Aetherfield account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your password"
      introduction="Enter your account email and we'll send instructions if it matches an account."
      alternateLabel="Remember your password?"
      alternateAction="Sign in"
      alternateHref="/sign-in"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

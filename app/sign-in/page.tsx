import type { Metadata } from "next";

import { AuthShell } from "../_components/auth/auth-shell";
import { SignInForm } from "../_components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Aetherfield",
  description: "Sign in to your Aetherfield account.",
};

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="ACCOUNT ACCESS"
      title="Continue to Aetherfield"
      introduction="Sign in to access your account. Product data and organisation workspaces arrive in the platform phase; this account is the secure foundation."
      alternateLabel="New to Aetherfield?"
      alternateAction="Create an account"
      alternateHref="/sign-up"
    >
      <SignInForm />
    </AuthShell>
  );
}

import type { Metadata } from "next";

import { AuthShell } from "../_components/auth/auth-shell";
import { SignUpForm } from "../_components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create an account — Aetherfield",
  description: "Create an Aetherfield customer account.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="CUSTOMER ACCOUNT"
      title="Start with a secure account"
      introduction="Create your customer account now. Staff access is granted separately and can never be requested through this form."
      alternateLabel="Already have an account?"
      alternateAction="Sign in"
      alternateHref="/sign-in"
    >
      <SignUpForm />
    </AuthShell>
  );
}

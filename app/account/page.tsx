import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "../_components/auth/sign-out-button";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { MetaPair } from "../_components/primitives";
import { getCurrentAccount } from "../../lib/auth/server";

export const metadata: Metadata = {
  title: "Account — Aetherfield",
  description: "Your Aetherfield account details.",
};

export default async function AccountPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[680px] w-full max-w-page px-5 py-20 md:py-28 lg:px-6">
        <p className="font-mono text-caption text-muted">ACCOUNT</p>
        <h1 className="mt-6 max-w-[780px] font-serif text-[48px] leading-[0.98] md:text-[64px]">
          Your account foundation is ready.
        </h1>
        <p className="mt-7 max-w-[680px] font-serif text-p2 text-muted">
          Product dashboards and organisation workspaces are not active yet.
          This page confirms the account that will secure them.
        </p>

        <dl className="mt-14 grid max-w-[760px] gap-8 border-y border-border py-8 md:grid-cols-2">
          <MetaPair label="Name" value={account.user.name} />
          <MetaPair label="Email" value={account.user.email} />
        </dl>
        <div className="mt-10">
          <SignOutButton />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

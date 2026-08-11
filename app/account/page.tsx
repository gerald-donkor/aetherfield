import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AlertPreferenceControl } from "../_components/alerts/alert-preference-control";
import { SignOutButton } from "../_components/auth/sign-out-button";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { CreateOrganizationForm } from "../_components/organization/create-organization-form";
import { ButtonLink, MetaPair } from "../_components/primitives";
import { getCurrentMembership } from "../../lib/auth/organization";
import { getAlertPreference } from "../../lib/db/alert-queries";
import { getCurrentAccount } from "../../lib/auth/server";

const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  member: "Member",
};

export const metadata: Metadata = {
  title: "Account — Aetherfield",
  description: "Your Aetherfield account details.",
};

export default async function AccountPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  const membership = await getCurrentMembership();

  /* Only a member of an organisation has an alert preference to read, and only
     Server Components fetch initial page data (AGENTS.md 6.2). */
  const emailAlerts = membership
    ? await getAlertPreference(membership.organization.id, account.user.id)
    : true;

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[680px] w-full max-w-page px-5 py-20 md:py-28 lg:px-6">
        <p className="font-mono text-caption text-muted">ACCOUNT</p>
        <h1 className="mt-6 max-w-[780px] font-serif text-[48px] leading-[0.98] md:text-[64px]">
          Your account foundation is ready.
        </h1>
        <p className="mt-7 max-w-[680px] font-serif text-p2 text-muted">
          This page confirms the account that secures your product workspace,
          and the organisation its evidence belongs to.
        </p>

        <dl className="mt-14 grid max-w-[760px] gap-8 border-y border-border py-8 md:grid-cols-2">
          <MetaPair label="Name" value={account.user.name} />
          <MetaPair label="Email" value={account.user.email} />
        </dl>
        {account.role === "staff" || account.role === "admin" ? (
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/submissions">View submissions</ButtonLink>
            <SignOutButton />
          </div>
        ) : (
          <div className="mt-10">
            <SignOutButton />
          </div>
        )}

        <section className="mt-20 md:mt-24">
          <p className="font-mono text-caption text-muted">ORGANISATION</p>
          {membership ? (
            <>
              <p className="mt-7 max-w-[680px] font-serif text-p2 text-muted">
                This account belongs to one organisation. Emissions, energy and
                waste data is recorded against it.
              </p>
              <dl className="mt-14 grid max-w-[760px] gap-8 border-y border-border py-8 md:grid-cols-2">
                <MetaPair label="Organisation" value={membership.organization.name} />
                <MetaPair label="Identifier" value={membership.organization.slug} />
                <MetaPair
                  label="Your role"
                  value={
                    ORGANIZATION_ROLE_LABELS[membership.role] ?? membership.role
                  }
                />
              </dl>
              <div className="mt-10">
                <ButtonLink href="/dashboard">Open overview</ButtonLink>
              </div>

              {/* Build step 14's off switch. The preference is read
                  server-side, per organisation; a missing row means on. */}
              <div className="mt-20 md:mt-24">
                <p className="font-mono text-caption text-muted">
                  TARGET ALERTS
                </p>
                <AlertPreferenceControl
                  className="mt-7"
                  emailAlerts={emailAlerts}
                />
              </div>
            </>
          ) : (
            <>
              <p className="mt-7 max-w-[680px] font-serif text-p2 text-muted">
                This account belongs to no organisation yet. Create one to hold
                the data your reporting will be built on.
              </p>
              <CreateOrganizationForm className="mt-10 block max-w-[560px]" />
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

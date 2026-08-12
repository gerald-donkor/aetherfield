import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AlertPreferenceControl } from "../_components/alerts/alert-preference-control";
import { SignOutButton } from "../_components/auth/sign-out-button";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { CreateOrganizationForm } from "../_components/organization/create-organization-form";
import { MembersPanel } from "../_components/organization/members-panel";
import { ButtonLink, MetaPair } from "../_components/primitives";
import { getCurrentMembership } from "../../lib/auth/organization";
import { getAlertPreference } from "../../lib/db/alert-queries";
import {
  listMembersForOrganization,
  listPendingInvitations,
} from "../../lib/db/organization-queries";
import { getCurrentAccount } from "../../lib/auth/server";
import {
  isOrganizationRole,
  ORGANIZATION_ROLE_LABELS,
} from "../../lib/validation/organization";

/** The invitation expiry, in the site's date register. Formatted here rather
    than in the client leaf: a fixed locale and UTC keep the server's markup and
    the browser's identical, and a leaf that formats dates hydrates differently
    depending on where it runs. */
const EXPIRY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A stored role string to the word a person reads. An unrecognised value is
    shown verbatim rather than guessed at — the same defensive narrowing
    `lib/auth/organization.ts` applies to the role it authorises on. */
function roleLabel(role: string | null): string {
  return isOrganizationRole(role) ? ORGANIZATION_ROLE_LABELS[role] : "Member";
}

export const metadata: Metadata = {
  title: "Account — Aetherfield",
  description: "Your Aetherfield account details.",
};

export default async function AccountPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  const membership = await getCurrentMembership();

  /* Only a member of an organisation has any of this to read, and only Server
     Components fetch initial page data (AGENTS.md 6.2). The three reads are
     independent and are issued together rather than as serial awaits.

     **Every one is predicated on the resolved organisation id** — the tenant
     comes from the membership row this request just resolved, never from the
     request itself (AGENTS.md 9.2 rule 6). */
  const [emailAlerts, members, invitations] = membership
    ? await Promise.all([
        getAlertPreference(membership.organization.id, account.user.id),
        listMembersForOrganization(membership.organization.id),
        listPendingInvitations(membership.organization.id),
      ])
    : [true, [], []];

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
                  value={ORGANIZATION_ROLE_LABELS[membership.role]}
                />
              </dl>
              <div className="mt-10">
                <ButtonLink href="/dashboard">Open overview</ButtonLink>
              </div>

              {/* Prompt 63's members surface. The roster and the pending
                  invitations are read above, tenant-predicated; the panel is a
                  client leaf that renders them and calls the four actions. */}
              <div className="mt-20 md:mt-24">
                <p className="font-mono text-caption text-muted">MEMBERS</p>
                <MembersPanel
                  className="mt-7"
                  organizationName={membership.organization.name}
                  viewerIsOwner={membership.role === "owner"}
                  members={members.map((entry) => ({
                    id: entry.id,
                    name: entry.name,
                    email: entry.email,
                    roleLabel: roleLabel(entry.role),
                    isSelf: entry.userId === account.user.id,
                  }))}
                  invitations={invitations.map((entry) => ({
                    id: entry.id,
                    email: entry.email,
                    roleLabel: roleLabel(entry.role),
                    expiresLabel: EXPIRY_FORMAT.format(entry.expiresAt),
                  }))}
                />
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

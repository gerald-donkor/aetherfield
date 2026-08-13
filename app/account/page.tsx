import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AlertPreferenceControl } from "../_components/alerts/alert-preference-control";
import { SignOutButton } from "../_components/auth/sign-out-button";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { CreateOrganizationForm } from "../_components/organization/create-organization-form";
import { DeleteOrganizationPanel } from "../_components/organization/delete-organization-panel";
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

/** A date in the site's register. Formatted here rather than in the client
    leaf: a fixed locale and UTC keep the server's markup and the browser's
    identical, and a leaf that formats dates hydrates differently depending on
    where it runs. Used for an invitation's expiry and, since prompt 73, for a
    scheduled purge date. */
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
  /* **A locked organisation reads nothing** — prompt 73. Its roster, its
     invitations and its alert preference are not rendered while a deletion is
     pending, so fetching them would be a tenant read this page does not use. */
  const locked = Boolean(membership?.pendingDeletion);

  const [emailAlerts, members, invitations] =
    membership && !locked
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
              {membership.pendingDeletion ? null : (
                <p className="mt-7 max-w-[680px] font-serif text-p2 text-muted">
                  This account belongs to one organisation. Emissions, energy
                  and waste data is recorded against it.
                </p>
              )}
              <dl className="mt-14 grid max-w-[760px] gap-8 border-y border-border py-8 md:grid-cols-2">
                <MetaPair label="Organisation" value={membership.organization.name} />
                <MetaPair label="Identifier" value={membership.organization.slug} />
                <MetaPair
                  label="Your role"
                  value={ORGANIZATION_ROLE_LABELS[membership.role]}
                />
              </dl>

              {/* Prompt 73's locked state. When a deletion is pending the
                  workspace has nothing to open and nothing to manage — every
                  page behind `requireOrganization` redirects back here — so the
                  overview link, the members panel and the alert switch are all
                  replaced by the notice and the restore control. */}
              {membership.pendingDeletion ? (
                <DeleteOrganizationPanel
                  className="mt-10"
                  organizationName={membership.organization.name}
                  organizationSlug={membership.organization.slug}
                  viewerIsOwner={membership.role === "owner"}
                  purgeLabel={EXPIRY_FORMAT.format(
                    membership.pendingDeletion.scheduledPurgeAt,
                  )}
                />
              ) : (
                <>
                  <div className="mt-10">
                    <ButtonLink href="/dashboard">Open overview</ButtonLink>
                  </div>

                  {/* Prompt 63's members surface. The roster and the pending
                      invitations are read above, tenant-predicated; the panel is
                      a client leaf that renders them and calls the four
                      actions. */}
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

                  {/* Prompt 73's deletion surface, last on the page because it
                      is the last thing an owner should reach for. Owner-only —
                      the panel renders nothing for a member, and both actions
                      re-read the role from Postgres regardless. */}
                  <div className="mt-20 md:mt-24">
                    <p className="font-mono text-caption text-muted">
                      DELETE ORGANISATION
                    </p>
                    <DeleteOrganizationPanel
                      organizationName={membership.organization.name}
                      organizationSlug={membership.organization.slug}
                      viewerIsOwner={membership.role === "owner"}
                      purgeLabel={null}
                    />
                  </div>
                </>
              )}
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

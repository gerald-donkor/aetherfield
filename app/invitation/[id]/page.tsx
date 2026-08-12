import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AuthShell } from "../../_components/auth/auth-shell";
import { InvitationResponse } from "../../_components/organization/invitation-response";
import { getCurrentAccount } from "../../../lib/auth/server";
import { getInvitationForLink } from "../../../lib/db/organization-queries";
import {
  invitationIdSchema,
  isOrganizationRole,
  ORGANIZATION_ROLE_LABELS,
} from "../../../lib/validation/organization";

/**
 * The page an invitation link lands on — prompt 63, closing what build step 8
 * deferred.
 *
 * **A page, not an API route.** AGENTS.md 6.2 keeps route handlers for callers
 * that are not this application, and a browser following a link in an email is
 * not one of those. Modelled on `app/newsletter/confirm/page.tsx`, which is the
 * other route on this site reached by a link from a message.
 *
 * **`AuthShell` rather than a new shell** (AGENTS.md 7.5 forbids a second design
 * system). This page needs exactly what `/sign-in` needs: the sky band, the nav,
 * a titled column beside a white card, and the footer.
 *
 * **`proxy.ts`'s matcher is deliberately not widened for this route.** That
 * redirect is optimistic convenience and is not enforcement (AGENTS.md 7.3); the
 * page performs its own database-backed check below and redirects a signed-out
 * visitor itself, so a matcher entry would buy nothing while adding a segment to
 * a list whose whole purpose is to stay narrow (AGENTS.md 8.1).
 *
 * **Dynamic by construction** — it reads the session and a row keyed by the
 * route's own parameter. No prerendered route's HTML or render mode changes.
 *
 * `noindex`: a page whose entire content is a capability in its URL has no
 * business in a search index.
 */

export const metadata: Metadata = {
  title: "Organisation invitation — Aetherfield",
  description: "Respond to an invitation to join an organisation.",
  robots: { index: false, follow: false },
};

/** The shell, filled once. Every state below is the same page with different
    words in it, rather than four pages that drifted apart. */
function InvitationShell({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  return (
    <AuthShell
      eyebrow="ORGANISATION INVITATION"
      title={title}
      introduction={introduction}
      alternateLabel="Nothing to respond to?"
      alternateAction="Go to your account"
      alternateHref="/account"
    >
      {children}
    </AuthShell>
  );
}

function Closed({ heading, body }: { heading: string; body: string }) {
  return (
    <InvitationShell
      title="This invitation is closed."
      introduction="An invitation is a single link to a single workspace, and it stops working once it is used, withdrawn or out of date. Ask whoever invited you to send a new one."
    >
      <h2 className="font-sans text-[28px] leading-[32px] font-bold text-balance">
        {heading}
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[26px] text-muted">
        {body}
      </p>
    </InvitationShell>
  );
}

export default async function InvitationPage({
  params,
}: {
  // Async since Next 15, and this is Next 16.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /* **Signed out first, before anything is read**, so an anonymous visitor is
     answered identically for every id and this page cannot be used to discover
     which invitations exist.

     **`callbackURL` does not currently come back here, and that is a known gap
     rather than an assumption.** `app/_components/auth/sign-in-form.tsx`
     navigates to `/account` on success and does not read the parameter — which
     has been true for every route `proxy.ts` protects since step 6, so it is a
     site-wide gap and not this route's. The parameter is sent anyway, because
     it is the convention the rest of the site already uses and it carries the
     intent a fix will need; the emailed link is durable in the meantime.
     `docs/backend.md` records it. */
  const account = await getCurrentAccount();
  if (!account) {
    const query = new URLSearchParams({ callbackURL: `/invitation/${id}` });
    redirect(`/sign-in?${query.toString()}`);
  }

  /* The shape check before the lookup: a malformed id is not a database
     question. `invitationIdSchema` is the same contract the actions parse. */
  const parsedId = invitationIdSchema.safeParse(id);
  const invitation = parsedId.success
    ? await getInvitationForLink(parsedId.data)
    : null;

  if (!invitation) {
    return (
      <Closed
        heading="We could not find this invitation"
        body="The link may have been altered in transit, or the invitation may have been removed. Nothing was shared, and no account of yours was changed."
      />
    );
  }

  /* Four distinct handled states with honest copy, not one error page. The
     statuses are Better Auth's own: `accepted`, `rejected`, `canceled`. */
  if (invitation.status === "accepted") {
    return (
      <Closed
        heading="This invitation has already been accepted"
        body="It can only be used once. If you accepted it, the organisation is on your account page; if you did not, ask whoever invited you to send another."
      />
    );
  }
  if (invitation.status === "canceled") {
    return (
      <Closed
        heading="This invitation was withdrawn"
        body="An owner of the organisation cancelled it, which can also happen automatically when they send a newer invitation to the same address. Check your inbox for a later message before asking for another."
      />
    );
  }
  if (invitation.status === "rejected") {
    return (
      <Closed
        heading="This invitation was declined"
        body="Nothing was shared and no membership was created. If that was a mistake, ask whoever invited you to send a new invitation."
      />
    );
  }
  if (invitation.expired) {
    return (
      <Closed
        heading="This invitation has expired"
        body="Invitations last 48 hours, so a link that has been sitting in an inbox over a long weekend will have lapsed. Ask whoever invited you to send a new one; it takes them a moment."
      />
    );
  }

  /**
   * **The invited address is the only address that may accept**, and the page
   * says so rather than presenting a button the write would refuse.
   *
   * It names the address the invitation was sent to and **nothing else** — not
   * the organisation, not who sent it. Whoever holds this link already received
   * it at that address, so the address is not a disclosure to them; the
   * organisation's name would be.
   */
  const invitedAddress = invitation.email.toLowerCase();
  if (invitedAddress !== account.user.email.toLowerCase()) {
    return (
      <InvitationShell
        title="This invitation is for another address."
        introduction="An invitation can only be accepted by the address it was sent to. That is what keeps a forwarded link from moving access to someone it was never meant for."
      >
        <h2 className="font-sans text-[28px] leading-[32px] font-bold text-balance">
          Signed in as a different address
        </h2>
        <p className="mt-4 font-serif text-[18px] leading-[26px] text-muted">
          This invitation was sent to {invitedAddress}, and you are signed in as{" "}
          {account.user.email}. Sign in with the invited address, or create an
          account for it, and open the link again.
        </p>
      </InvitationShell>
    );
  }

  const roleLabel = isOrganizationRole(invitation.role)
    ? ORGANIZATION_ROLE_LABELS[invitation.role]
    : "Member";

  return (
    <InvitationShell
      title={`Join ${invitation.organizationName}.`}
      introduction="An organisation is the workspace its emissions, energy and waste data is recorded against. Accepting adds your account to it; declining leaves everything as it is."
    >
      <h2 className="font-sans text-[28px] leading-[32px] font-bold text-balance">
        {invitation.inviterName} invited you
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[26px] text-muted">
        You have been invited to {invitation.organizationName} as a{" "}
        {roleLabel.toLowerCase()}, at {invitedAddress}. Accepting gives you
        access to the data that organisation holds; nothing is shared with you
        until you do.
      </p>
      <InvitationResponse
        className="mt-8"
        invitationId={invitation.id}
        organizationName={invitation.organizationName}
      />
    </InvitationShell>
  );
}

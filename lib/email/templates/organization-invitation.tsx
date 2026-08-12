import { Heading, Link, Text } from "react-email";

import { Shell, heading, label, paragraph, value } from "./shared";

/**
 * Sent when an owner invites someone into their organisation — prompt 63,
 * closing the invitation half of build step 8.
 *
 * **Transactional, not marketing, so no `List-Unsubscribe`** — the same
 * reasoning `target-alert.tsx` records, and for a stronger case: this message is
 * one person naming one other person, sent once, and it expires. Nobody is on a
 * list to come off. `lib/email/send.ts`'s `headers` passthrough stays unused
 * here, as it does for every message that is not the newsletter's.
 *
 * **It may be the recipient's first contact with Aetherfield**, and that shapes
 * the copy rather than the design: one line saying what the product is, so the
 * link is not the only context, and nothing campaigning about it. Register per
 * AGENTS.md 5 — measured and operational, evidence-first, never startup-cheerful.
 *
 * **The inviter is named, the organisation is named, and nothing else about
 * either is disclosed.** The recipient already knows they were invited by the
 * time they read this; what they need is who, where, and by when.
 */

export const INVITATION_SUBJECT_PREFIX = "You are invited to join";

/** The same underline reasoning every template here records: the muted footer
    prose and its link share a colour, so the underline is the only cue that the
    words are a link. Longhand as well as shorthand, for Outlook's Word engine. */
const footerLink = {
  color: "#6c6c6c",
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

const bodyLink = {
  color: "#000000",
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

export type OrganizationInvitationProps = {
  organizationName: string;
  /** The inviter's display name. Their address is deliberately not carried:
      the reply-to on the message is Aetherfield's monitored address, and a
      colleague's inbox is not ours to publish. */
  inviterName: string;
  /** "owner" or "member", already turned into the word a person reads. */
  roleLabel: string;
  /** The invitation's expiry, already formatted by the sender — a template does
      no date arithmetic and no locale guessing. */
  expiresLabel: string;
  acceptUrl: string;
};

export function OrganizationInvitation({
  organizationName,
  inviterName,
  roleLabel,
  expiresLabel,
  acceptUrl,
}: OrganizationInvitationProps) {
  return (
    <Shell
      preview={`${inviterName} invited you to ${organizationName} on Aetherfield.`}
      footerText={
        <>
          You are receiving this because {inviterName} entered your address when
          inviting you to {organizationName}. If you were not expecting it, no
          account is created and no data is shared until you accept — you can
          ignore this message and the invitation will expire on its own. Reply to
          this email if something looks wrong, or{" "}
          <Link href={acceptUrl} style={footerLink}>
            open the invitation
          </Link>{" "}
          to decline it explicitly.
        </>
      }
    >
      <Heading as="h1" style={heading}>
        Join {organizationName} on Aetherfield
      </Heading>
      <Text style={paragraph}>
        {inviterName} invited you into {organizationName}, the workspace their
        emissions, energy and waste data is recorded against. Aetherfield tracks
        that data, models it against targets and turns it into ESG disclosures.
      </Text>

      <Text style={label}>YOUR ROLE</Text>
      <Text style={value}>{roleLabel}</Text>

      <Text style={label}>THE LINK EXPIRES</Text>
      <Text style={value}>{expiresLabel}</Text>

      <Text style={paragraph}>
        <Link href={acceptUrl} style={bodyLink}>
          Open the invitation
        </Link>{" "}
        to accept or decline it. You will be asked to sign in, or to create an
        account, with this address — an invitation can only be accepted by the
        address it was sent to.
      </Text>
    </Shell>
  );
}

OrganizationInvitation.PreviewProps = {
  organizationName: "Northwind Materials",
  inviterName: "Ada Okafor",
  roleLabel: "Member",
  expiresLabel: "14 August 2026",
  acceptUrl: "https://example.com/invitation/abc",
} satisfies OrganizationInvitationProps;

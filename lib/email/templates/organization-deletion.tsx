import { Heading, Link, Text } from "react-email";

import { Shell, heading, label, paragraph, value } from "./shared";

/**
 * Sent to every owner when an organisation is scheduled for deletion —
 * prompt 73.
 *
 * **Transactional, not marketing, so no `List-Unsubscribe`** — the same
 * reasoning `organization-invitation.tsx` and `target-alert.tsx` record, and
 * here it is stronger still: this message tells an owner that their workspace
 * and everything in it is going to be erased on a stated date. There is no
 * list to come off, and it is not something an alert preference may suppress.
 *
 * **One message, on the request only.** Nothing is sent when the purge itself
 * runs: by then there is no workspace to link to, and the address was already
 * told the date. AGENTS.md 8.3 rule 1 — collect and send only what the flow
 * needs.
 *
 * **What it deliberately does not say.** Not who requested it beyond "an
 * owner": every recipient of this message is an owner, the requester is one of
 * them, and naming a colleague inside an automated notice about a destructive
 * act is a disclosure the flow does not need. The audit row records the user id
 * for us.
 *
 * Register per AGENTS.md 5 — measured and operational. A serious state, stated
 * plainly, with the reversal named first rather than buried.
 */

export const DELETION_SUBJECT_PREFIX = "Scheduled for deletion:";

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

export type OrganizationDeletionProps = {
  organizationName: string;
  /** The purge date, already formatted by the sender — a template does no date
      arithmetic and no locale guessing. */
  purgeLabel: string;
  /** The grace window in days, so the prose and the stored date agree. */
  windowDays: number;
  /** `/account`, where the restore control is. */
  accountUrl: string;
};

export function OrganizationDeletion({
  organizationName,
  purgeLabel,
  windowDays,
  accountUrl,
}: OrganizationDeletionProps) {
  return (
    <Shell
      preview={`${organizationName} is scheduled for deletion on ${purgeLabel}.`}
      footerText={
        <>
          You are receiving this because you are an owner of {organizationName}{" "}
          on Aetherfield. If this was not intended, an owner can reverse it from{" "}
          <Link href={accountUrl} style={footerLink}>
            your account page
          </Link>{" "}
          at any point before the date above. Reply to this email if something
          looks wrong.
        </>
      }
    >
      <Heading as="h1" style={heading}>
        {organizationName} is scheduled for deletion
      </Heading>
      <Text style={paragraph}>
        An owner asked for {organizationName} to be deleted. The workspace is
        locked from now on — its data can be neither read nor changed — and it
        stays restorable for {windowDays} days.
      </Text>

      <Text style={label}>DATA IS ERASED ON</Text>
      <Text style={value}>{purgeLabel}</Text>

      <Text style={paragraph}>
        On that date the organisation and everything recorded against it is
        permanently removed: its members and invitations, its sites, its
        imported files, its activity records and calculated emissions, its
        targets, its reports and any emission factors it supplied itself. That
        step cannot be undone.
      </Text>

      <Text style={paragraph}>
        <Link href={accountUrl} style={bodyLink}>
          Open your account page
        </Link>{" "}
        to restore {organizationName} before then. Restoring unlocks the
        workspace immediately and nothing is lost.
      </Text>
    </Shell>
  );
}

OrganizationDeletion.PreviewProps = {
  organizationName: "Northwind Materials",
  purgeLabel: "12 September 2026",
  windowDays: 30,
  accountUrl: "https://example.com/account",
} satisfies OrganizationDeletionProps;

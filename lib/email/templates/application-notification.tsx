import { Heading, Text } from "react-email";

import { Shell, heading, label, paragraph, value } from "./shared";

/**
 * To Aetherfield. Carries the whole application **except the CV**, and that
 * exception is the point of this file.
 *
 * **The CV is neither attached nor linked** (AGENTS.md 8.3 rule 4). It lives in
 * private blob storage and is reachable only through a short-lived signed URL
 * minted per request for an authorised session — which is step 7's submissions
 * view. An attachment would put personal data in a mailbox and in every
 * forward of it, with no retention story and no way to honour an erasure
 * request; an emailed link would be neither short-lived nor authorised, and a
 * link in a mail is exactly the artefact that outlives the session that was
 * allowed to see it. **The filename is named and nothing else** — no URL, no
 * blob pathname, no token.
 *
 * The reply-to is set to the applicant's own address by the caller, so replying
 * in the inbox reaches the person rather than the team.
 */

export function notificationSubject(role: string): string {
  return `Application — ${role}`;
}

export function ApplicationNotification({
  role,
  name,
  email,
  message,
  cvFilename,
}: {
  role: string;
  name: string;
  email: string;
  message: string | null;
  cvFilename: string;
}) {
  return (
    <Shell
      preview={`${name} applied for ${role}.`}
      footerText="Sent by the Aetherfield website when an application is captured. The row is already in the application table, and the CV is in private blob storage — open it from the submissions view, which is the only place it can be read."
    >
      <Heading as="h1" style={heading}>
        New application
      </Heading>
      <Text style={paragraph}>Reply to this message to reach {name}.</Text>

      <Text style={label}>Role</Text>
      <Text style={value}>{role}</Text>

      <Text style={label}>Name</Text>
      <Text style={value}>{name}</Text>

      <Text style={label}>Email</Text>
      <Text style={value}>{email}</Text>

      <Text style={label}>Message</Text>
      <Text style={value}>{message ?? "No message"}</Text>

      {/* The name only. See the docblock: no attachment, no link, no
          pathname. */}
      <Text style={label}>CV</Text>
      <Text style={value}>{cvFilename}</Text>
    </Shell>
  );
}

ApplicationNotification.PreviewProps = {
  role: "Senior Climate Data Scientist",
  name: "Ada Whitfield",
  email: "ada@example.com",
  message:
    "I have spent four years building scope 3 reporting for a manufacturer and would like to work on the measurement side of it.",
  cvFilename: "ada-whitfield-cv.pdf",
};

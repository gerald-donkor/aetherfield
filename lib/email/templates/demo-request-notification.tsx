import { Heading, Text } from "react-email";

import type { LeadSource } from "../../db/schema";
import { Shell, heading, label, paragraph, value } from "./shared";

/**
 * To Aetherfield. Carries the whole lead, **including `source`** — the reason
 * `lead_source` exists at all is that three CTAs write to one table and "which
 * one converts" is otherwise unanswerable (AGENTS.md 9.1).
 *
 * The reply-to is set to the requester's own address by the caller, so
 * replying in the inbox reaches the person rather than the team.
 */

/** The enum's three values in the register a person reads, derived from
    `leadSource` rather than re-declared as a union (AGENTS.md 9.2 rule 2). */
const SOURCE_LABEL: Record<LeadSource, string> = {
  hero: "Homepage hero",
  nav: "Navigation",
  cta_band: "Homepage CTA band",
};

export function notificationSubject(company: string): string {
  return `Demo request — ${company}`;
}

export function DemoRequestNotification({
  name,
  email,
  company,
  message,
  source,
}: {
  name: string;
  email: string;
  company: string;
  message: string | null;
  source: LeadSource;
}) {
  return (
    <Shell
      preview={`${company} requested a demo.`}
      footerText="Sent by the Aetherfield website when a demo request is captured. The row is already in the lead table."
    >
      <Heading as="h1" style={heading}>
        New demo request
      </Heading>
      <Text style={paragraph}>Reply to this message to reach {name}.</Text>

      <Text style={label}>Name</Text>
      <Text style={value}>{name}</Text>

      <Text style={label}>Work email</Text>
      <Text style={value}>{email}</Text>

      <Text style={label}>Company</Text>
      <Text style={value}>{company}</Text>

      <Text style={label}>Source</Text>
      <Text style={value}>{SOURCE_LABEL[source]}</Text>

      <Text style={label}>Message</Text>
      <Text style={value}>{message ?? "No message"}</Text>
    </Shell>
  );
}

DemoRequestNotification.PreviewProps = {
  name: "Ada Whitfield",
  email: "ada@example.com",
  company: "Northwind Materials",
  message: "We report under CSRD from next year and our scope 3 data is spread across four systems.",
  source: "hero" as LeadSource,
};

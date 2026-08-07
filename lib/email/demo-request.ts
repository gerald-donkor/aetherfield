import "server-only";

import type { LeadSource } from "../db/schema";
import { internalRecipient } from "./config";
import { sendEmail } from "./send";
import {
  CONFIRMATION_SUBJECT,
  DemoRequestConfirmation,
} from "./templates/demo-request-confirmation";
import {
  DemoRequestNotification,
  notificationSubject,
} from "./templates/demo-request-notification";

/**
 * Stage f for a demo request — the two sends, behind one call, so the action
 * stays the shape steps 4 and 5 copy.
 *
 * **AGENTS.md 10 rule 4 is the whole specification: a failed email never fails
 * the write.** This function therefore returns nothing and throws nothing. The
 * lead is already committed by the time it runs, and the person who filled the
 * form sees the success state regardless of what happens in here.
 *
 * **The two sends are independent.** Either failing must not prevent the
 * other, which is why they are settled together rather than awaited in
 * sequence.
 *
 * **Nothing personal is logged** (AGENTS.md 8.3 rule 2): the outcome carries
 * an error class and a template name, and `lead.id` is a random uuid that
 * identifies a row rather than a person.
 */

export type DemoRequestEmailInput = {
  leadId: string;
  name: string;
  email: string;
  company: string;
  message: string | null;
  source: LeadSource;
};

export async function sendDemoRequestEmails(
  input: DemoRequestEmailInput,
): Promise<void> {
  const internal = internalRecipient();

  const sends = [
    sendEmail({
      to: input.email,
      subject: CONFIRMATION_SUBJECT,
      body: DemoRequestConfirmation({ name: input.name }),
      /* `<event-type>/<entity-id>`, the format the `resend` skill documents.
         `lead.id` is the entity, so a retry of the same request can never
         send a second copy inside Resend's 24-hour key window — and two
         genuine requests are two rows, so they key differently and both
         send. That is the whole reason the key is the lead's id and not a
         hash of the address. */
      idempotencyKey: `demo-request-confirmation/${input.leadId}`,
      template: "demo-request-confirmation",
    }),
    internal
      ? sendEmail({
          to: internal,
          subject: notificationSubject(input.company),
          body: DemoRequestNotification({
            name: input.name,
            email: input.email,
            company: input.company,
            message: input.message,
            source: input.source,
          }),
          idempotencyKey: `demo-request-notification/${input.leadId}`,
          template: "demo-request-notification",
          /* So a reply in the inbox reaches the requester. */
          replyTo: input.email,
        })
      : Promise.resolve({
          sent: false as const,
          reason: "demo-request-notification:no-recipient-configured",
        }),
  ];

  /* Belt and braces. `sendEmail` is written not to throw, but this promise is
     handed to `waitUntil` rather than awaited, so an escaping rejection would
     be unhandled rather than caught by a caller. */
  try {
    const outcomes = await Promise.all(sends);
    for (const outcome of outcomes) {
      if (!outcome.sent) {
        console.warn(
          `[email] send failed for lead ${input.leadId}: ${outcome.reason}`,
        );
      }
    }
  } catch {
    console.warn(`[email] send threw for lead ${input.leadId}`);
  }
}

import "server-only";

import { sendEmail } from "./send";
import {
  ApplicationConfirmation,
  confirmationSubject,
} from "./templates/application-confirmation";
import {
  ApplicationNotification,
  notificationSubject,
} from "./templates/application-notification";

/**
 * Stage f for a job application — the two sends, behind one call, in
 * `lib/email/demo-request.ts`'s shape. **Not a second pattern**: step 3 set the
 * pattern every later email copies (AGENTS.md 5.2), and this is a copy of it
 * with two deliberate differences, both noted below.
 *
 * **AGENTS.md 10 rule 4 is the whole specification: a failed email never fails
 * the write.** This function therefore returns nothing and throws nothing. The
 * application row and the CV are already committed by the time it runs, and the
 * person who filled the form sees the success state regardless of what happens
 * in here.
 *
 * **The two sends are independent.** Either failing must not prevent the other,
 * which is why they are settled together rather than awaited in sequence.
 *
 * **Nothing personal is logged** (AGENTS.md 8.3 rule 2): the outcome carries an
 * error class and a template name, and `applicationId` is a random uuid that
 * identifies a row rather than a person. Never an address, never a name, never
 * the filename, and never the blob pathname — the pathname is not even a
 * parameter of this module, so it cannot leak from here.
 */

export type ApplicationEmailInput = {
  applicationId: string;
  /** Carried by the contract and **deliberately not rendered in either
      message.** A slug is a routing detail and reads as one; both emails show
      `role` instead. It stays on the input because the caller has it and a
      later change here (a link into the submissions view, filtered by slug)
      would otherwise be a change to the caller too. */
  jobSlug: string;
  /** The human-readable role name, resolved from `JOBS` by the caller — never
      the slug. */
  role: string;
  name: string;
  email: string;
  message: string | null;
  /** Already sanitised by the caller. */
  cvFilename: string;
};

/**
 * **A second variable, not a reuse of `LEAD_NOTIFICATION_EMAIL`.**
 *
 * An application goes to whoever is hiring and a demo request goes to whoever
 * sells; collapsing the two into one inbox is a decision nobody made, and the
 * cost of separating them is one line in `.env.example`. It is read here rather
 * than added to `lib/email/config.ts` because that module's
 * `internalRecipient()` is specifically the *lead* recipient and doubles as the
 * default reply-to; widening it would make the two flows share a fallback,
 * which is exactly what this variable exists to prevent.
 *
 * Server-only and deliberately **not** `NEXT_PUBLIC_*` — phase one has no
 * public variable at all (AGENTS.md 8.4), and an internal address in a browser
 * bundle is a harvestable spam target.
 *
 * **Unset is a supported state**, exactly as `LEAD_NOTIFICATION_EMAIL`'s
 * contract has it: the notification is skipped and the skip is reported with a
 * fixed string naming no address. There is **no fallback** to the lead inbox —
 * a silent redirection of applications into the sales inbox is worse than a
 * notification that plainly did not go.
 */
function applicationRecipient(): string | undefined {
  const value = process.env.APPLICATION_NOTIFICATION_EMAIL?.trim();
  return value ? value : undefined;
}

export async function sendApplicationEmails(
  input: ApplicationEmailInput,
): Promise<void> {
  const internal = applicationRecipient();

  const sends = [
    sendEmail({
      to: input.email,
      subject: confirmationSubject(input.role),
      body: ApplicationConfirmation({
        role: input.role,
        name: input.name,
        cvFilename: input.cvFilename,
      }),
      /* `<event-type>/<entity-id>`, the format the `resend` skill documents.
         The application row is the entity, so a retry of the same submission
         can never send a second copy inside Resend's 24-hour key window — and
         two genuine applications are two rows, including the same person
         applying to two roles, so they key differently and both send. That is
         the whole reason the key is the row's id and not a hash of the address
         or of the slug. */
      idempotencyKey: `application-confirmation/${input.applicationId}`,
      template: "application-confirmation",
    }),
    internal
      ? sendEmail({
          to: internal,
          subject: notificationSubject(input.role),
          body: ApplicationNotification({
            role: input.role,
            name: input.name,
            email: input.email,
            message: input.message,
            cvFilename: input.cvFilename,
          }),
          idempotencyKey: `application-notification/${input.applicationId}`,
          template: "application-notification",
          /* So a reply in the inbox reaches the applicant. */
          replyTo: input.email,
        })
      : Promise.resolve({
          sent: false as const,
          reason: "application-notification:no-recipient-configured",
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
          `[email] send failed for application ${input.applicationId}: ${outcome.reason}`,
        );
      }
    }
  } catch {
    console.warn(
      `[email] send threw for application ${input.applicationId}`,
    );
  }
}

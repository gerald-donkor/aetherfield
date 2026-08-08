import "server-only";

import { CONFIRMATION_TTL_WORDS } from "../db/subscriber-queries";
import { appBaseUrl } from "./config";
import { sendEmail } from "./send";
import {
  NEWSLETTER_CONFIRMATION_SUBJECT,
  NewsletterConfirmation,
} from "./templates/newsletter-confirmation";
import {
  NEWSLETTER_WELCOME_SUBJECT,
  NewsletterWelcome,
} from "./templates/newsletter-welcome";

/**
 * The newsletter's sends, behind one call each — `lib/email/demo-request.ts`'s
 * shape, for the reason step 3 gave: **a failed email never fails the write**
 * (AGENTS.md 10 rule 4). Both functions return nothing and throw nothing, and
 * both are handed to `waitUntil` rather than awaited.
 *
 * **Nothing personal is logged** (AGENTS.md 8.3 rule 2). A failure line carries
 * the template name, the provider's error class and the subscriber row's uuid —
 * never the address, and never a token, which is a live capability.
 */

/** The page the confirmation link points at (step 4's route). */
function confirmUrl(token: string): string {
  return `${appBaseUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

/** The visible unsubscribe link in a marketing footer — a page with a button,
    not a bare GET that acts, for the same reason confirmation is not a GET. */
function unsubscribePageUrl(token: string): string {
  return `${appBaseUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** The machine endpoint named in `List-Unsubscribe`. Its caller is Gmail's or
    Yahoo's infrastructure, which is why it is a Route Handler at all. */
function oneClickUrl(token: string): string {
  return `${appBaseUrl()}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function sendNewsletterConfirmation(input: {
  subscriberId: string;
  email: string;
  confirmationToken: string;
}): Promise<void> {
  try {
    const outcome = await sendEmail({
      to: input.email,
      subject: NEWSLETTER_CONFIRMATION_SUBJECT,
      body: NewsletterConfirmation({
        confirmUrl: confirmUrl(input.confirmationToken),
        expiresIn: CONFIRMATION_TTL_WORDS,
      }),
      /* **Keyed on the token, not the row id**, and that is the one deviation
         from step 3's `<event-type>/<entity-id>`.

         A resend rotates the confirmation token without creating a row, so a
         key built from `subscriber.id` would be identical across the first send
         and every resend — and Resend's idempotency window is 24 hours, so the
         second message would be swallowed and the person would wait forever for
         a link that was never sent. The token changes on exactly the occasions
         a new message must go out, which makes it the correct entity here: it
         still suppresses a genuine retry of one send (same token, same
         payload), which is the whole point of the key. 43 base64url characters,
         far inside the 256-character limit. */
      idempotencyKey: `newsletter-confirmation/${input.confirmationToken}`,
      template: "newsletter-confirmation",
    });

    if (!outcome.sent) {
      console.warn(
        `[email] send failed for subscriber ${input.subscriberId}: ${outcome.reason}`,
      );
    }
  } catch {
    /* `appBaseUrl()` throws when `BETTER_AUTH_URL` is unset, and this promise is
       handed to `waitUntil` rather than awaited — an escaping rejection would
       be unhandled rather than caught by a caller. */
    console.warn(
      `[email] newsletter-confirmation threw for subscriber ${input.subscriberId}`,
    );
  }
}

export async function sendNewsletterWelcome(input: {
  subscriberId: string;
  email: string;
  unsubscribeToken: string;
}): Promise<void> {
  try {
    const outcome = await sendEmail({
      to: input.email,
      subject: NEWSLETTER_WELCOME_SUBJECT,
      body: NewsletterWelcome({
        unsubscribeUrl: unsubscribePageUrl(input.unsubscribeToken),
      }),
      /* Back to `<event-type>/<entity-id>`: confirmation is single-use, so a
         second welcome inside 24 hours can only be a retry or a
         resubscribe-and-reconfirm cycle, and suppressing it is right in both
         cases. */
      idempotencyKey: `newsletter-welcome/${input.subscriberId}`,
      template: "newsletter-welcome",
      /* **The bulk-sender pair** (`email-best-practices`, `compliance.md`).
         `List-Unsubscribe` names the one-click endpoint rather than the page,
         because `List-Unsubscribe-Post` promises the receiver it may POST to
         it; the visible link in the footer is the page, for a human. */
      headers: {
        "List-Unsubscribe": `<${oneClickUrl(input.unsubscribeToken)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (!outcome.sent) {
      console.warn(
        `[email] send failed for subscriber ${input.subscriberId}: ${outcome.reason}`,
      );
    }
  } catch {
    console.warn(
      `[email] newsletter-welcome threw for subscriber ${input.subscriberId}`,
    );
  }
}

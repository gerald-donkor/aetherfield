import "server-only";

/**
 * The one place the sender, the reply-to and the internal recipient are
 * decided. Templates never carry an address, and neither does an action —
 * steps 4 and 5 read from here rather than restating any of it.
 */

/**
 * **A development sender, and this is the step's one unclosed prerequisite.**
 *
 * Resend can only send `from` a domain it has verified, and Aetherfield has no
 * deployment and no assigned production domain (recorded at prompt 38, and
 * still true at prompt 43). `onboarding@resend.dev` is Resend's sandbox
 * sender: it is accepted without a domain, and it **delivers only to the
 * Resend account's own address**. Every other recipient is refused with a 403.
 *
 * So the internal notification below works end to end today, and the
 * requester's confirmation does not reach a requester until a domain is
 * verified with SPF, DKIM and DMARC published. That is a prerequisite for
 * deploying, not a bug in this file — see `docs/backend.md`, step 3.
 *
 * When the domain lands this becomes `Aetherfield <hello@<domain>>` and
 * nothing else in `lib/email/` changes.
 */
export const FROM = "Aetherfield <onboarding@resend.dev>";

/**
 * Where a demo request's internal notification goes. Server-only and
 * deliberately **not** `NEXT_PUBLIC_*` — phase one has no public variable at
 * all (AGENTS.md 8.4), and an internal address in a browser bundle is a
 * harvestable spam target.
 *
 * Unset is a supported state: the notification is skipped with a log line
 * naming no address, rather than crashed or sent to a guessed fallback.
 */
export function internalRecipient(): string | undefined {
  const value = process.env.LEAD_NOTIFICATION_EMAIL?.trim();
  return value ? value : undefined;
}

/**
 * The reply-to on mail we send to a person. The same monitored address as the
 * notification, never a `noreply@` — a transactional confirmation is
 * something people reply to, and a reply that bounces is a worse outcome than
 * no header at all. Omitted entirely when no internal address is configured.
 */
export function replyTo(): string | undefined {
  return internalRecipient();
}

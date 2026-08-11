import "server-only";

/**
 * The one place the sender, the reply-to and the internal recipient are
 * decided. Templates never carry an address, and neither does an action —
 * steps 4 and 5 read from here rather than restating any of it.
 */

/**
 * **A development sender, and this is the step's one unclosed prerequisite.**
 *
 * Resend can only send `from` a domain it has verified, and **Aetherfield owns
 * no domain Resend can verify.**
 *
 * That sentence is narrower than the one this docblock carried at prompts 38
 * and 43, which said Aetherfield had "no deployment and no assigned production
 * domain". **The deployment half is no longer true and is corrected here rather
 * than left standing** (AGENTS.md 12 rule 8): `vercel project ls` reports
 * `aetherfield` with the production URL `https://aetherfield-rho.vercel.app`.
 * The domain half remains true and remains the actual blocker — a `*.vercel.app`
 * URL is not a domain SPF, DKIM and DMARC can be published on.
 *
 * `onboarding@resend.dev` is Resend's sandbox sender: it is accepted without a
 * domain, and it **delivers only to the Resend account's own address**. Every
 * other recipient is refused with a 403. Build step 14's target alert is the
 * first customer-facing message this bites rather than an internal one.
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

/**
 * The base a link in an email resolves against, without a trailing slash.
 *
 * **`BETTER_AUTH_URL`, and no new variable** (AGENTS.md 8.4: do not invent a
 * name). It is already the application's base URL, already in `.env.example`,
 * and already required in every environment that runs auth — a second variable
 * naming the same value is one more thing to set and one more way for two parts
 * of the app to disagree about where they live. Server-only, like everything
 * else here; phase one still has no `NEXT_PUBLIC_*` at all.
 *
 * **Throws when unset**, in `getResend()`'s register. An email carrying
 * `undefined/newsletter/confirm` is worse than an email that was never sent:
 * the send would be reported as a success and the person would be stuck. The
 * throw is caught by `lib/email/newsletter.ts`, which is best-effort by
 * construction (AGENTS.md 10 rule 4), so it can never fail a write.
 */
export function appBaseUrl(): string {
  const value = process.env.BETTER_AUTH_URL?.trim();
  if (!value) {
    throw new Error(
      "BETTER_AUTH_URL is not set. Pull it with `vercel env pull .env.local`.",
    );
  }
  return value.replace(/\/+$/, "");
}

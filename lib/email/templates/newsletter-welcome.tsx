import { Heading, Link, Text } from "react-email";

import { RETENTION_WINDOW_TEXT } from "../../domain/retention";
import { Shell, heading, paragraph } from "./shared";

/**
 * Sent when the confirmation link is used. **This is the first marketing email
 * in this repository**, and it is the reason `send.ts` grew a `headers`
 * passthrough: it carries a visible unsubscribe link in its footer *and* the
 * `List-Unsubscribe` / `List-Unsubscribe-Post` pair that Gmail, Yahoo and
 * Microsoft require of bulk senders (`email-best-practices`'s `compliance.md`).
 *
 * **It carries no physical postal address, and CAN-SPAM requires one.**
 * Aetherfield has none — the same class of unclosed prerequisite as the sending
 * domain, and inventing a placeholder address would put a fabricated fact in
 * front of a real person. It is recorded in `docs/backend.md` as a blocker for
 * sending marketing mail in production rather than papered over here.
 *
 * The footer text replaces the `Shell`'s usual one-liner, so the unsubscribe
 * link sits where a reader looks for it, in the rule-separated block. It also
 * carries the retention sentence, and this is the one of the four confirmations
 * whose subject has **no** age-based expiry to state: consent is live while the
 * subscription stands, so what is stated instead is that unsubscribing is what
 * starts the clock. The window comes from
 * `RETENTION_WINDOW_TEXT.unsubscribedSubscriber` rather than being restated.
 */

export const NEWSLETTER_WELCOME_SUBJECT = "You're subscribed to Aetherfield Journal";

/**
 * **The underline is load-bearing, not decoration.**
 *
 * `#6c6c6c` is 5.25:1 on white and passes AA on its own, but the footer
 * sentence this link sits inside is *also* `#6c6c6c` — so without a second cue
 * the word "unsubscribe" is indistinguishable from the prose around it: same
 * colour, no weight change, nothing. That is worse than a WCAG 1.4.1
 * colour-only failure, which at least leaves a colour to notice.
 *
 * It matters more here than for an ordinary link, because this is the
 * opt-out a bulk-mail recipient is expected to be able to find, and a reader
 * who cannot find it reaches for the spam button instead — which costs sender
 * reputation as well as being the worse outcome for them.
 */
const footerLink = {
  color: "#6c6c6c",
  /* Longhand as well as shorthand — see the same note in
     `newsletter-confirmation.tsx`. `Link` defaults to
     `text-decoration-line:none` and Outlook's Word engine is not to be trusted
     to resolve that against a later shorthand. */
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

export function NewsletterWelcome({
  unsubscribeUrl,
}: {
  unsubscribeUrl: string;
}) {
  return (
    <Shell
      preview="Your subscription to Aetherfield Journal is confirmed."
      footerText={
        <>
          You are receiving this because this address was confirmed on the
          Aetherfield website. To stop receiving the journal,{" "}
          <Link href={unsubscribeUrl} style={footerLink}>
            unsubscribe
          </Link>
          . A confirmed address is kept for as long as the subscription stands;
          once you unsubscribe, the record is erased automatically{" "}
          {RETENTION_WINDOW_TEXT.unsubscribedSubscriber} later.
        </>
      }
    >
      <Heading as="h1" style={heading}>
        Your subscription is confirmed
      </Heading>
      <Text style={paragraph}>
        Thank you for confirming. Aetherfield Journal arrives when there is
        something measured worth reading — field notes on climate data,
        sustainability strategy, and the tools that turn measurement into
        action.
      </Text>
      <Text style={paragraph}>
        No issue is sent to an address that has not confirmed it, and every one
        carries a link to stop.
      </Text>
    </Shell>
  );
}

NewsletterWelcome.PreviewProps = {
  unsubscribeUrl:
    "https://example.com/newsletter/unsubscribe?token=preview-token",
};

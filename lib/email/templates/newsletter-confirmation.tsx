import { Button, Heading, Link, Text } from "react-email";

import { RETENTION_WINDOW_TEXT } from "../../domain/retention";
import { Shell, heading, paragraph } from "./shared";

/**
 * The double opt-in request — the message that makes the subscription real.
 *
 * **Transactional, and it carries no unsubscribe.** There is nothing to
 * unsubscribe *from* yet: the address is `pending`, no marketing has been sent,
 * and an opt-out link on a message asking for opt-in is incoherent. It is also
 * the hybrid `email-best-practices`'s `email-types.md` warns against, and the
 * demo-request confirmation's own docblock already argued the point.
 *
 * Content follows `email-capture.md`'s verification-email checklist: a clear
 * purpose, a prominent button, the expiry stated, and an "if this wasn't you"
 * line. The link is also written out as text below the button, because a mail
 * client that strips the anchor styling still has to leave a usable link.
 *
 * Accessibility, per the skill: one `<h1>`, link text that names its
 * destination rather than saying "click here", and every colour past 4.5:1 on
 * white — including the fallback link, which needs an explicit style because
 * `Link`'s unstyled default is `#067df7` and that measures **3.97:1**, under
 * the floor for 13px text.
 *
 * (The `react-email` skill's advice to put `box-border` on a `Button` is for
 * its Tailwind mode. This template is inline styles, and the rendered HTML
 * carries no `box-sizing` at all: v6's `Button` protects its padding with
 * `mso-padding-alt` plus split `padding-*` and `max-width:100%` instead.
 * Verified by rendering it, not assumed.)
 */

export const NEWSLETTER_CONFIRMATION_SUBJECT =
  "Confirm your Aetherfield Journal subscription";

const button = {
  backgroundColor: "#000000",
  color: "#ffffff",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: "13px",
  letterSpacing: "0.04em",
  lineHeight: "46px",
  height: "46px",
  padding: "0 20px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "24px",
} as const;

const fallback = {
  fontFamily:
    'Archivo, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6c6c6c",
  margin: "16px 0 0",
  wordBreak: "break-all",
} as const;

/** **Explicit, because `Link`'s default is not accessible here.** Unstyled,
    react-email emits `color:#067df7`, which measures 3.97:1 on white — under
    WCAG AA's 4.5:1 for 13px normal text (the 3:1 large-text exemption does not
    apply). Ink at 21:1 with the underline kept, so the link is distinguishable
    by more than colour. */
const fallbackLink = {
  color: "#000000",
  /* **Both, and the longhand is the one that matters.** `Link`'s own default is
     `text-decoration-line:none`, and the shorthand alone leaves the emitted CSS
     as `text-decoration-line:none;text-decoration:underline` — correct by
     cascade order, but Outlook's Word engine resolves shorthand-versus-longhand
     conflicts badly enough not to bet an accessibility cue on it. */
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

export function NewsletterConfirmation({
  confirmUrl,
  expiresIn,
}: {
  confirmUrl: string;
  /** The words, from `CONFIRMATION_TTL_WORDS`, so the copy and the guard that
      enforces it cannot drift apart. */
  expiresIn: string;
}) {
  return (
    <Shell
      preview="Confirm your subscription to Aetherfield Journal."
      /* The retention sentence covers the *unconfirmed* state, which is the
         only state this message's recipient is in. Its window is read from
         `RETENTION_WINDOW_TEXT.pendingSubscriber` rather than restated, exactly
         as `expiresIn` is threaded in rather than written here. */
      footerText={
        <>
          You are receiving this because this address was entered on the
          Aetherfield website. Nothing is sent to it until the link above is
          used, and if that was not you, no action is needed. An address that is
          not confirmed is erased automatically after{" "}
          {RETENTION_WINDOW_TEXT.pendingSubscriber}.
        </>
      }
    >
      <Heading as="h1" style={heading}>
        Confirm your subscription
      </Heading>
      <Text style={paragraph}>
        Aetherfield Journal is field notes on climate data, sustainability
        strategy, and the tools that turn measurement into action. Confirm the
        address to start receiving it.
      </Text>
      <Button href={confirmUrl} style={button}>
        Confirm subscription
      </Button>
      <Text style={paragraph}>
        This link works for {expiresIn}. After that, subscribe again from the
        journal and a new one will be sent.
      </Text>
      <Text style={fallback}>
        If the button does not work, open this address:{" "}
        <Link href={confirmUrl} style={fallbackLink}>
          {confirmUrl}
        </Link>
      </Text>
    </Shell>
  );
}

NewsletterConfirmation.PreviewProps = {
  confirmUrl: "https://example.com/newsletter/confirm?token=preview-token",
  expiresIn: "48 hours",
};

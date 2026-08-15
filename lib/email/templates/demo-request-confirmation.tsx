import { Heading, Text } from "react-email";

import { RETENTION_WINDOW_TEXT } from "../../domain/retention";
import { Shell, heading, paragraph } from "./shared";

/**
 * To the person who asked. **Transactional, not marketing** — it confirms an
 * action they just took, so it carries no offer and no unsubscribe, which the
 * `email-best-practices` skill's `email-types.md` settles: an unsubscribe on a
 * transactional confirmation is the hybrid it warns against. Step 4's
 * newsletter is the marketing path and carries List-Unsubscribe.
 *
 * The register is the site's (AGENTS.md 5): measured, evidence-first. The
 * second paragraph is the dialog's own success copy, verbatim, so the screen
 * and the inbox do not say two different things.
 */

export const CONFIRMATION_SUBJECT = "Your Aetherfield demo request";

export function DemoRequestConfirmation({ name }: { name: string }) {
  return (
    <Shell
      preview="We have your demo request and will be in touch."
      /* No domain is named: Aetherfield has none assigned, and inventing one
         here would put a fabricated address in front of a real person.

         The retention sentence reads its window from
         `RETENTION_WINDOW_TEXT.lead` rather than restating it, so the copy and
         the sweep that enforces it cannot drift apart — the same argument
         `newsletter-confirmation.tsx` makes for `expiresIn`. It is a fragment
         rather than a string only because of that interpolation. */
      footerText={
        <>
          You are receiving this because you requested a demo on the Aetherfield
          website. It is a one-off confirmation, not a subscription. We keep a
          demo request for {RETENTION_WINDOW_TEXT.lead} from the day it is made,
          and it is then erased automatically.
        </>
      }
    >
      <Heading as="h1" style={heading}>
        We have your demo request
      </Heading>
      <Text style={paragraph}>{name}, thank you for the request.</Text>
      <Text style={paragraph}>
        Someone from the team will be in touch to arrange a walkthrough of how
        Aetherfield fits your reporting. You can reply to this message directly
        if there is anything you would like us to cover.
      </Text>
    </Shell>
  );
}

DemoRequestConfirmation.PreviewProps = {
  name: "Ada Whitfield",
};

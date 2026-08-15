import { Heading, Text } from "react-email";

import { RETENTION_WINDOW_TEXT } from "../../domain/retention";
import { Shell, heading, label, paragraph, value } from "./shared";

/**
 * To the person who applied. **Transactional, not marketing** — it confirms an
 * action they just took, so it carries no offer and no unsubscribe, which the
 * `email-best-practices` skill's `email-types.md` settles (the same argument
 * `demo-request-confirmation.tsx` makes, and it is unchanged here).
 *
 * The register is the site's (AGENTS.md 5): measured, evidence-first. Three
 * things are deliberately absent from the copy:
 *
 * - **No timeline.** "We will be in touch within five days" is a promise
 *   Aetherfield has not made, and an email that quietly breaks it is worse than
 *   one that never made it. The copy says what is true — the application is
 *   recorded, the team reviews applications, and they will be in touch if there
 *   is a fit.
 * - **No exclamation marks and no enthusiasm.** Not "we're excited to see your
 *   application"; the site's voice is clarity and confidence, not a greeting.
 * - **No prediction of the outcome**, in either direction.
 *
 * **The filename is echoed back, and that is the useful part of the message.**
 * The single most common anxiety after uploading a CV is whether the right file
 * went, so the message the applicant gets names it. It is the sanitised name
 * stored on `application.cv_filename`, never a link to the file and never the
 * blob pathname (AGENTS.md 8.3 rule 4) — the bytes live in private storage and
 * are read only through a short-lived signed URL by an authorised session in
 * step 7.
 */

/**
 * **A function, not a constant, unlike `CONFIRMATION_SUBJECT` in
 * `demo-request-confirmation.tsx`.**
 *
 * A demo request has one shape, so its subject is fixed. An application is
 * always *to a role*, and a person may apply to two — so the role is what makes
 * the two messages distinguishable in a threaded inbox, and a subject that
 * omitted it would collapse them. The em dash and the "Aetherfield" prefix
 * match the internal notification's subject shape.
 */
export function confirmationSubject(role: string): string {
  return `Your Aetherfield application — ${role}`;
}

export function ApplicationConfirmation({
  role,
  name,
  cvFilename,
}: {
  /** The human-readable role name, resolved from `JOBS` by the caller — never
      the slug, which is a routing detail and reads as one. */
  role: string;
  name: string;
  /** Already sanitised by the caller, and stored on the row for exactly this. */
  cvFilename: string;
}) {
  return (
    <Shell
      preview={`We have your application. Role: ${role}.`}
      /* No domain is named: Aetherfield has none assigned, and inventing one
         here would put a fabricated address in front of a real person.

         The retention sentence names the CV explicitly, because the file is the
         part of this submission a person most wants an end date on, and the
         window is read from `RETENTION_WINDOW_TEXT.application` rather than
         restated so the copy and the sweep cannot drift apart. */
      footerText={
        <>
          You are receiving this because you applied for a role on the
          Aetherfield website. It is a one-off confirmation, not a subscription.
          We keep an application and the CV file it carries for{" "}
          {RETENTION_WINDOW_TEXT.application} from the day it is sent, and both
          are then erased automatically.
        </>
      }
    >
      <Heading as="h1" style={heading}>
        We have your application
      </Heading>
      <Text style={paragraph}>{name}, thank you for applying.</Text>
      {/* The role is carried by the labelled row below and by the subject, and
          deliberately *not* interpolated into this sentence. `JOBS` includes the
          open-application card, whose role reads "Open application" — "your
          application for Open application is recorded" is the sentence that
          produces, and a template that only reads well for three of the four
          slugs is a template that is wrong for one of them. */}
      <Text style={paragraph}>
        Your application is recorded. The team reviews applications as they
        arrive and will be in touch if there is a fit. You can reply to this
        message directly if there is anything you would like to add.
      </Text>

      <Text style={label}>Role</Text>
      <Text style={value}>{role}</Text>

      <Text style={label}>CV received</Text>
      <Text style={value}>{cvFilename}</Text>
    </Shell>
  );
}

/* A real role from `app/_content/jobs.ts`, not an invented one — a preview that
   shows a role the site does not list is a preview of something that cannot
   happen. */
ApplicationConfirmation.PreviewProps = {
  role: "Data Scientist",
  name: "Ada Whitfield",
  cvFilename: "ada-whitfield-cv.pdf",
};

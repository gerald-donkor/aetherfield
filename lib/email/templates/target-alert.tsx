import { Heading, Link, Text } from "react-email";

import { Shell, heading, label, paragraph, value } from "./shared";

/**
 * Sent when a nightly sweep finds an organisation's run-rate projection past its
 * target by more than the threshold — build step 14.
 *
 * **Transactional, not marketing, and that has a consequence.** Per the
 * `email-best-practices` skill's `references/email-types.md`, it reports on the
 * service the recipient's organisation contracted for, is non-promotional, and
 * is sent under contract fulfilment rather than consent. So it carries **no
 * `List-Unsubscribe` header** — `lib/email/send.ts`'s `headers` passthrough
 * exists for the newsletter's bulk message, and the same skill warns against the
 * transactional/marketing hybrid. The off switch is the in-app preference on
 * `/account`, and this message links to it in plain words.
 *
 * **No figure here is generated and no model is involved.** Every one is
 * computed by `lib/domain/` from stored emissions and passed in as an
 * already-rounded string (AGENTS.md 5.3's hard rule, which binds this step even
 * though step 14 has no sanctioned AI surface at all).
 *
 * **The basis and the complete-month count are rendered, not omitted.** A flat
 * projection and a trending one are different claims about the future, and
 * showing them identically would present the weaker one as the stronger —
 * `ProjectionBasis`'s own docblock states it, and this template is one of the
 * surfaces that rule is about.
 *
 * Register per AGENTS.md 5: measured and operational, evidence-first. It states
 * the gap and what the workspace shows. It is never alarmist about climate, and
 * it never congratulates.
 */

export const TARGET_ALERT_SUBJECT_PREFIX = "Emissions projection past target:";

/** The same underline reasoning `newsletter-welcome.tsx` records: the muted
    footer prose and the link share a colour, so the underline is the only cue
    that the words are a link. Longhand as well as shorthand, for Outlook's Word
    engine. */
const footerLink = {
  color: "#6c6c6c",
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

const bodyLink = {
  color: "#000000",
  textDecorationLine: "underline",
  textDecoration: "underline",
} as const;

export type TargetAlertProps = {
  organizationName: string;
  targetName: string;
  targetYear: number;
  /** tCO2e, already rounded once by `lib/domain/`. */
  targetTonnes: string;
  projectedTonnes: string;
  /** The signed reading, already rounded to one place. Positive here by
      construction — only a projection above the target raises an alert. */
  readingPercent: string;
  /** The threshold in force when the alert was raised. */
  thresholdPercent: string;
  basisLabel: string;
  completeMonths: number;
  /** The last complete month behind the projection, `"YYYY-MM"`. */
  windowEnd: string;
  targetsUrl: string;
  accountUrl: string;
};

export function TargetAlert({
  organizationName,
  targetName,
  targetYear,
  targetTonnes,
  projectedTonnes,
  readingPercent,
  thresholdPercent,
  basisLabel,
  completeMonths,
  windowEnd,
  targetsUrl,
  accountUrl,
}: TargetAlertProps) {
  return (
    <Shell
      preview={`${organizationName} is projected ${readingPercent}% above ${targetName}.`}
      footerText={
        <>
          You are receiving this because you are an owner of {organizationName}{" "}
          in Aetherfield. To stop receiving these,{" "}
          <Link href={accountUrl} style={footerLink}>
            turn off alert email in your account
          </Link>
          .
        </>
      }
    >
      <Heading as="h1" style={heading}>
        {targetName} is off track
      </Heading>
      <Text style={paragraph}>
        {organizationName}&apos;s current run rate projects {projectedTonnes}{" "}
        tCO2e for {targetYear}, against a target of {targetTonnes} tCO2e. That
        is {readingPercent}% above the target, past the {thresholdPercent}%
        threshold this alert is set at.
      </Text>

      <Text style={label}>PROJECTION BASIS</Text>
      <Text style={value}>{basisLabel}</Text>

      <Text style={label}>EVIDENCE BEHIND IT</Text>
      <Text style={value}>
        {completeMonths} complete months of activity data, ending {windowEnd}.
      </Text>

      <Text style={paragraph}>
        The projection is a linear run rate over committed activity data, not a
        forecast of what the year will hold. It moves when data is imported or
        recalculated.{" "}
        <Link href={targetsUrl} style={bodyLink}>
          Open targets
        </Link>{" "}
        to see the trajectory and what has been recorded against it.
      </Text>
    </Shell>
  );
}

TargetAlert.PreviewProps = {
  organizationName: "Northwind Materials",
  targetName: "Operational 2030",
  targetYear: 2030,
  targetTonnes: "600.00",
  projectedTonnes: "840.00",
  readingPercent: "40.0",
  thresholdPercent: "10.000",
  basisLabel: "Latest 12 months carried forward flat",
  completeMonths: 12,
  windowEnd: "2026-07",
  targetsUrl: "https://example.com/targets",
  accountUrl: "https://example.com/account",
} satisfies TargetAlertProps;

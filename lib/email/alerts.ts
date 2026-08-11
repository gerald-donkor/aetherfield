import "server-only";

import { createHash } from "node:crypto";

import { parseDecimal, toFixed } from "../domain/decimal";
import { toTonnes } from "../domain/emissions";
import { PROJECTION_BASIS_LABELS } from "../validation/targets";
import { REPORT_TONNES_DECIMALS } from "../validation/reports";
import type { ProjectionBasis } from "../domain/targets";
import { appBaseUrl } from "./config";
import { sendEmail } from "./send";
import { TARGET_ALERT_SUBJECT_PREFIX, TargetAlert } from "./templates/target-alert";

/**
 * The threshold alert's send, behind one call — `lib/email/newsletter.ts`'s
 * shape, for the reason step 3 gave: **a failed email never fails the write**
 * (AGENTS.md 10 rule 4). The alert row is written first; this is best-effort,
 * and its failure leaves the row at `raised` so the next nightly sweep tries
 * again.
 *
 * **Nothing personal or commercial is logged** (AGENTS.md 8.3 rule 2, extended
 * to a customer's data by 5.3). A failure line carries the template name, the
 * provider's error class and the alert row's uuid — never an address, never an
 * organisation name, never a target name, never a figure.
 *
 * **Every figure arrives already computed and already rounded once.** This
 * module converts stored kgCO2e to tCO2e for presentation and does no other
 * arithmetic; no model is involved anywhere on this path.
 */

/** Presentation only: `10.000` reads as `10`. Trailing zeros after the point
    carry no information in a threshold sentence, and the stored column keeps
    every digit regardless. Never applied to a disclosure figure. */
function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

/** kgCO2e to tCO2e, rounded once at the same place count a report uses, so a
    company never sees the same quantity to two different precisions. Returns
    `null` when the stored value cannot be read as a decimal — the message is
    then not sent at all, rather than sent with a figure nobody can stand
    behind. */
function tonnes(storedKgCo2e: string): string | null {
  const parsed = parseDecimal(storedKgCo2e);
  if (!parsed.ok) return null;
  return toFixed(toTonnes(parsed.value), REPORT_TONNES_DECIMALS, "half-even");
}

export type AlertEmailInput = {
  alertId: string;
  organizationName: string;
  targetName: string;
  targetYear: number;
  /** The stored columns, as the strings Postgres reads back. */
  projectedKgCo2e: string;
  targetKgCo2e: string;
  readingPercent: string;
  thresholdPercent: string;
  basis: ProjectionBasis;
  completeMonths: number;
  windowEnd: string;
  to: string;
};

/**
 * Sends one alert to one owner.
 *
 * **Returns whether the message left**, because the caller uses that to decide
 * whether the row moves to `notified` — a state, not a boolean, precisely so a
 * failure is distinguishable from a delivery. It throws nothing.
 *
 * The idempotency key is `<event-type>/<entity-id>` per step 3's documented
 * format, keyed on the alert row's id: one crossing is one message, and a retry
 * inside Resend's 24-hour window is suppressed rather than duplicated.
 *
 * **The recipient is part of the entity, and it has to be.** An organisation
 * with two owners sends two messages for one crossing, with the same key but
 * different payloads — which Resend answers with a 409, so the second owner
 * would never be told. The recipient is folded in as a **sha256 prefix, not the
 * address**: the key is a value we construct and log around, and AGENTS.md 8.3
 * rule 2 keeps addresses out of everything that is not the table that owns them.
 */
export async function sendTargetAlert(
  input: AlertEmailInput,
): Promise<boolean> {
  try {
    const projectedTonnes = tonnes(input.projectedKgCo2e);
    const targetTonnes = tonnes(input.targetKgCo2e);
    if (!projectedTonnes || !targetTonnes) {
      console.warn(`[email] target-alert unreadable figure for ${input.alertId}`);
      return false;
    }

    const base = appBaseUrl();

    const outcome = await sendEmail({
      to: input.to,
      subject: `${TARGET_ALERT_SUBJECT_PREFIX} ${input.targetName}`,
      body: TargetAlert({
        organizationName: input.organizationName,
        targetName: input.targetName,
        targetYear: input.targetYear,
        targetTonnes,
        projectedTonnes,
        readingPercent: trimZeros(input.readingPercent),
        thresholdPercent: trimZeros(input.thresholdPercent),
        basisLabel: PROJECTION_BASIS_LABELS[input.basis],
        completeMonths: input.completeMonths,
        windowEnd: input.windowEnd,
        targetsUrl: `${base}/targets`,
        accountUrl: `${base}/account`,
      }),
      idempotencyKey: `target-alert/${input.alertId}-${createHash("sha256")
        .update(input.to)
        .digest("hex")
        .slice(0, 16)}`,
      template: "target-alert",
    });

    if (!outcome.sent) {
      console.warn(
        `[email] send failed for alert ${input.alertId}: ${outcome.reason}`,
      );
      return false;
    }
    return true;
  } catch {
    /* `appBaseUrl()` throws when `BETTER_AUTH_URL` is unset. Caught here so the
       sweep can never be failed by a missing link base. */
    console.warn(`[email] target-alert threw for alert ${input.alertId}`);
    return false;
  }
}

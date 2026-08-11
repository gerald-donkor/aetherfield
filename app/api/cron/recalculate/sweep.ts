import "server-only";

import {
  getOrganizationName,
  listAlertRecipients,
  listOpenAlerts,
  listTargetsForAlerts,
  markAlertNotified,
  raiseAlerts,
  resolveAlerts,
} from "../../../../lib/db/alert-queries";
import { recalculateOrganization } from "../../../../lib/db/emission-queries";
import { listAllOrganizationIds } from "../../../../lib/db/organization-queries";
import { readTargetEvidence } from "../../../../lib/db/target-queries";
import { sendTargetAlert } from "../../../../lib/email/alerts";
import { evaluateAlerts, type AlertTargetInput } from "../../../../lib/domain/alerts";
import { parseDecimal } from "../../../../lib/domain/decimal";

/**
 * The sweep the cron handler calls — build step 14.
 *
 * It is a separate module so the handler stays what AGENTS.md 6.2 requires of
 * one: authenticate, call, answer. Nothing here is reachable from a browser and
 * nothing here reads a request.
 *
 * ---
 *
 * ## What it does, per organisation
 *
 * 1. Recalculate, through `recalculateOrganization` — **the same seam
 *    `app/activity/actions.ts` calls**, so a tenant's totals are not stale until
 *    somebody remembers to press the button.
 * 2. Read its targets and its calculated emissions through the existing
 *    tenant-predicated reads.
 * 3. Evaluate with `lib/domain/alerts.ts`, which is pure and takes the clock as
 *    a parameter.
 * 4. Raise and resolve rows through `lib/db/alert-queries.ts`.
 * 5. Email each newly raised alert to the organisation's owners who have not
 *    opted out. **A send failure marks nothing as notified and never fails the
 *    sweep** (AGENTS.md 10 rule 4).
 *
 * **One clock value for the whole sweep.** `asOf` is captured once, so two
 * organisations evaluated a second apart cannot land on different months.
 *
 * **One organisation's failure must not end the sweep.** Each is wrapped, the
 * error is counted, and the loop continues — a single tenant with bad data
 * cannot be allowed to stop every other tenant's recalculation. Nothing is
 * logged beyond a count.
 *
 * **Scale boundary, stated rather than pre-optimised.** The sweep is sequential
 * and reads each organisation's full calculated set into memory, which is the
 * same boundary `readTargetEvidence` and `readDashboardEvidence` already
 * document. `vercel.json` gives this path the plan's maximum duration.
 * Revisiting sequencing and pagination is a future judgement against real tenant
 * volume, not something to guess at now.
 *
 * **Nothing here logs an identifier, a name, an address or a figure**
 * (AGENTS.md 8.3 rule 2, extended to a customer's commercial data by 5.3).
 */

export type SweepSummary = {
  organizations: number;
  recalculated: number;
  alertsRaised: number;
  alertsResolved: number;
  alertsNotified: number;
  failures: number;
};

export async function sweep(): Promise<SweepSummary> {
  /* One `YYYY-MM-DD` UTC clock value for the whole run. The domain layer reads
     no clock; this is the only place one is read on this path. */
  const asOf = new Date().toISOString().slice(0, 10);

  const organizationIds = await listAllOrganizationIds();

  const summary: SweepSummary = {
    organizations: organizationIds.length,
    recalculated: 0,
    alertsRaised: 0,
    alertsResolved: 0,
    alertsNotified: 0,
    failures: 0,
  };

  for (const organizationId of organizationIds) {
    try {
      await sweepOrganization(organizationId, asOf, summary);
    } catch {
      /* Counted, not logged and not rethrown. The next organisation still runs.
         Nothing about which tenant failed reaches the response or the console. */
      summary.failures += 1;
    }
  }

  return summary;
}

async function sweepOrganization(
  organizationId: string,
  asOf: string,
  summary: SweepSummary,
): Promise<void> {
  const outcome = await recalculateOrganization(organizationId, null);
  /* An organisation with no committed records is skipped, not failed: having no
     data yet is an ordinary state. */
  if (outcome.records === 0) return;
  summary.recalculated += 1;

  const [targetRows, openAlerts, evidence] = await Promise.all([
    listTargetsForAlerts(organizationId),
    listOpenAlerts(organizationId),
    readTargetEvidence(organizationId),
  ]);

  const targets: AlertTargetInput[] = [];
  const namesById = new Map<string, { name: string; targetYear: number }>();

  for (const row of targetRows) {
    const baseline = parseDecimal(row.baselineKgCo2e);
    const reduction = parseDecimal(row.reductionPercent);
    /* A stored `numeric` that cannot be read is skipped rather than guessed at —
       the same stance `readTargetEvidence` takes on a stored emission, applied
       where refusing one target is better than failing the whole tenant. */
    if (!baseline.ok || !reduction.ok) continue;

    targets.push({
      id: row.id,
      name: row.name,
      coverage: row.coverage,
      targetYear: row.targetYear,
      baselineKgCo2e: baseline.value,
      reductionPercent: reduction.value,
      status: row.status,
    });
    namesById.set(row.id, { name: row.name, targetYear: row.targetYear });
  }

  const evaluation = evaluateAlerts({
    targets,
    emissions: evidence.emissions,
    openAlerts,
    asOf,
  });

  const { resolved } = await resolveAlerts(organizationId, evaluation.resolve);
  summary.alertsResolved += resolved;

  /* `raiseAlerts` returns only the rows actually written — the partial unique
     index rejects a duplicate from a concurrent sweep — so exactly one set of
     emails is sent per crossing. */
  const written = await raiseAlerts(organizationId, evaluation.raise);
  summary.alertsRaised += written.length;
  if (written.length === 0) return;

  const [recipients, organizationName] = await Promise.all([
    listAlertRecipients(organizationId),
    getOrganizationName(organizationId),
  ]);
  if (recipients.length === 0 || !organizationName) return;

  for (const alert of written) {
    const target = namesById.get(alert.targetId);
    if (!target) continue;

    let anySent = false;
    for (const recipient of recipients) {
      const sent = await sendTargetAlert({
        alertId: alert.id,
        organizationName,
        targetName: target.name,
        targetYear: target.targetYear,
        projectedKgCo2e: alert.projectedKgCo2e,
        targetKgCo2e: alert.targetKgCo2e,
        readingPercent: alert.readingPercent,
        thresholdPercent: alert.thresholdPercent,
        basis: alert.basis,
        completeMonths: alert.completeMonths,
        windowEnd: alert.windowEnd,
        to: recipient.email,
      });
      if (sent) anySent = true;
    }

    /* **`notified` only when a message actually left.** A total failure leaves
       the row at `raised`, so tomorrow's sweep tries again rather than treating
       an unsent alert as delivered. */
    if (anySent) {
      summary.alertsNotified += 1;
      await markAlertNotified(organizationId, alert.id);
    }
  }
}

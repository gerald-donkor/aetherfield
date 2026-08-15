import "server-only";

import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { member, organization, user } from "./auth-schema";
import { getDb } from "./client";
import { alertPreference, emissionTarget, targetAlert } from "./schema";
import { toDecimalString, toFixed } from "../domain/decimal";
import type { RaisedAlert } from "../domain/alerts";
import type { ProjectionBasis } from "../domain/targets";
import type { TargetCoverage, TargetStatus } from "../validation/targets";
import { withSafeQueryErrors } from "./query-error";

/**
 * Every read and write of `target_alert` and `alert_preference` — build
 * step 14.
 *
 * **Nothing outside `lib/db/` writes SQL or builds a query** (AGENTS.md 6.2,
 * 7.5), so the cron sweep and `app/account/actions.ts` go through here and
 * nowhere else.
 *
 * ---
 *
 * **Every function takes `organizationId` and predicates on it.** An alert and a
 * preference are a customer's own data, so §9.2 rule 6 applies unchanged and the
 * reference-data exception that `emission-queries.ts` records does *not* reach
 * these tables: there is no `IS NULL OR` anywhere below. The predicate is
 * written once, in {@link visible}, so no query can be added that filters on
 * half of it.
 *
 * **The sweep derives every organisation id server-side.** No function here is
 * ever handed a tenant id that came from a request — the cron endpoint accepts
 * no body, no query parameter and no organisation identifier at all.
 *
 * **Nothing here logs.** Not an organisation, not a target name, not an address,
 * not a figure — on no path and in no catch (AGENTS.md 8.3 rule 2, extended to a
 * customer's commercial data by 5.3).
 */

/** The tenant predicate every alert read below shares. */
function visible(organizationId: string) {
  return and(
    eq(targetAlert.organizationId, organizationId),
    isNull(targetAlert.deletedAt),
  );
}

/** An alert is open until it resolves. `raised` and `notified` are both open —
    the difference between them is whether the email left, not whether the gap
    is still there. The database's partial unique index carries the identical
    predicate. */
function open() {
  return ne(targetAlert.status, "resolved");
}

/* -------------------------------------------------------------------------- */
/*  What the sweep evaluates                                                   */
/* -------------------------------------------------------------------------- */

export type AlertTargetRow = {
  id: string;
  name: string;
  coverage: TargetCoverage;
  targetYear: number;
  baselineKgCo2e: string;
  reductionPercent: string;
  status: TargetStatus;
};

/**
 * The organisation's targets, as the evaluator needs them.
 *
 * **Retired targets are returned too**, and the evaluator skips them — the
 * decision about what a non-active target means belongs to `lib/domain/`, not to
 * a `WHERE` clause. Reading them is also what lets the sweep see an open alert
 * whose target was retired since.
 */
export const listTargetsForAlerts = withSafeQueryErrors(
  "alert-queries.listTargetsForAlerts",
  listTargetsForAlertsImpl,
);

async function listTargetsForAlertsImpl(
  organizationId: string,
): Promise<AlertTargetRow[]> {
  return getDb()
    .select({
      id: emissionTarget.id,
      name: emissionTarget.name,
      coverage: emissionTarget.coverage,
      targetYear: emissionTarget.targetYear,
      baselineKgCo2e: emissionTarget.baselineKgCo2e,
      reductionPercent: emissionTarget.reductionPercent,
      status: emissionTarget.status,
    })
    .from(emissionTarget)
    .where(
      and(
        eq(emissionTarget.organizationId, organizationId),
        isNull(emissionTarget.deletedAt),
      ),
    );
}

export type OpenAlertRow = { id: string; targetId: string };

/** Every alert still open for this organisation. */
export const listOpenAlerts = withSafeQueryErrors(
  "alert-queries.listOpenAlerts",
  listOpenAlertsImpl,
);

async function listOpenAlertsImpl(
  organizationId: string,
): Promise<OpenAlertRow[]> {
  return getDb()
    .select({ id: targetAlert.id, targetId: targetAlert.targetId })
    .from(targetAlert)
    .where(and(visible(organizationId), open()));
}

/* -------------------------------------------------------------------------- */
/*  Writing crossings                                                          */
/* -------------------------------------------------------------------------- */

export type WrittenAlert = {
  id: string;
  targetId: string;
  readingPercent: string;
  projectedKgCo2e: string;
  targetKgCo2e: string;
  thresholdPercent: string;
  basis: ProjectionBasis;
  completeMonths: number;
  windowEnd: string;
};

/**
 * Writes the crossings the evaluator produced.
 *
 * **`onConflictDoNothing` against the partial unique index, not a read-then-
 * write.** Two sweeps running at once would both see no open alert and both
 * insert; the index rejects the second, and this returns only the rows that were
 * actually written — so exactly one email is sent per crossing. The evaluator's
 * own open-alert check is the ordinary path; this is the guarantee.
 *
 * **Each figure is rounded once, here, and the rounding is declared** rather
 * than left to the column: `target_kg_co2e` is `numeric(20, 3)` and an exact
 * target figure can carry more places than that, so it is rounded `half-even` to
 * three on the way in — the same treatment and the same reasoning
 * `emission_target.computed_baseline_kg_co2e` records. The reading and the
 * projection are already at their declared scales when they arrive.
 */
export const raiseAlerts = withSafeQueryErrors(
  "alert-queries.raiseAlerts",
  raiseAlertsImpl,
);

async function raiseAlertsImpl(
  organizationId: string,
  alerts: readonly RaisedAlert[],
): Promise<WrittenAlert[]> {
  if (alerts.length === 0) return [];

  const rows = await getDb()
    .insert(targetAlert)
    .values(
      alerts.map((alert) => ({
        organizationId,
        targetId: alert.targetId,
        readingPercent: toDecimalString(alert.readingPercent),
        projectedKgCo2e: toDecimalString(alert.projectedKgCo2e),
        targetKgCo2e: toFixed(alert.targetKgCo2e, 3, "half-even"),
        thresholdPercent: toFixed(alert.thresholdPercent, 3, "half-even"),
        basis: alert.basis,
        completeMonths: alert.completeMonths,
        windowEnd: alert.windowEnd,
      })),
    )
    .onConflictDoNothing()
    .returning({
      id: targetAlert.id,
      targetId: targetAlert.targetId,
      readingPercent: targetAlert.readingPercent,
      projectedKgCo2e: targetAlert.projectedKgCo2e,
      targetKgCo2e: targetAlert.targetKgCo2e,
      thresholdPercent: targetAlert.thresholdPercent,
      basis: targetAlert.basis,
      completeMonths: targetAlert.completeMonths,
      windowEnd: targetAlert.windowEnd,
    });

  return rows;
}

/**
 * Moves open alerts to `resolved`, stamping the transition.
 *
 * **The status predicate is in the `WHERE`**, so two concurrent sweeps cannot
 * both stamp `resolved_at`: the second matches no row. The same arrangement
 * `retireTarget` uses, for the same reason.
 */
export const resolveAlerts = withSafeQueryErrors(
  "alert-queries.resolveAlerts",
  resolveAlertsImpl,
);

async function resolveAlertsImpl(
  organizationId: string,
  ids: readonly string[],
): Promise<{ resolved: number }> {
  if (ids.length === 0) return { resolved: 0 };

  const updated = await getDb()
    .update(targetAlert)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(
      and(visible(organizationId), open(), inArray(targetAlert.id, [...ids])),
    )
    .returning({ id: targetAlert.id });

  return { resolved: updated.length };
}

/**
 * Marks one alert as notified, once its email has actually left.
 *
 * **Only from `raised`.** A send failure leaves the row where it is, so the next
 * sweep tries again — which is why the status is a state rather than a boolean
 * (§9.2 rule 2), and why a failed email cannot be mistaken for a delivered one.
 */
export const markAlertNotified = withSafeQueryErrors(
  "alert-queries.markAlertNotified",
  markAlertNotifiedImpl,
);

async function markAlertNotifiedImpl(
  organizationId: string,
  alertId: string,
): Promise<void> {
  await getDb()
    .update(targetAlert)
    .set({ status: "notified", notifiedAt: new Date() })
    .where(
      and(
        visible(organizationId),
        eq(targetAlert.id, alertId),
        eq(targetAlert.status, "raised"),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/*  Who is emailed                                                             */
/* -------------------------------------------------------------------------- */

export type AlertRecipient = {
  userId: string;
  email: string;
  name: string;
};

/**
 * The organisation's **owners** who have not opted out.
 *
 * **Owners only** (settled with the user before the prompt was written): an
 * alert says a company is drifting from a commitment it filed, which is the
 * owner's business. Emailing every member turns a governance signal into
 * background noise.
 *
 * **The opt-out is honoured server-side**, in this predicate, and never by the
 * caller filtering afterwards. A missing `alert_preference` row means opted in,
 * which is why this is a `LEFT JOIN` with an `is null or is true` test rather
 * than an inner join — an organisation whose members have never touched the
 * setting must still be reachable.
 *
 * **Aetherfield's `staff` and `admin` roles grant nothing here** (§11.1). The
 * only thing that puts an address on this list is a `member` row with
 * `role = 'owner'`.
 */
export const listAlertRecipients = withSafeQueryErrors(
  "alert-queries.listAlertRecipients",
  listAlertRecipientsImpl,
);

async function listAlertRecipientsImpl(
  organizationId: string,
): Promise<AlertRecipient[]> {
  return getDb()
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(
      alertPreference,
      and(
        eq(alertPreference.organizationId, member.organizationId),
        eq(alertPreference.userId, member.userId),
      ),
    )
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.role, "owner"),
        or(
          isNull(alertPreference.emailAlerts),
          eq(alertPreference.emailAlerts, true),
        ),
      ),
    );
}

/** The organisation's name, for the email's subject line. Tenant-predicated
    like everything else, so a caller cannot read another organisation's name by
    holding its id. */
export const getOrganizationName = withSafeQueryErrors(
  "alert-queries.getOrganizationName",
  getOrganizationNameImpl,
);

async function getOrganizationNameImpl(
  organizationId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.name ?? null;
}

/* -------------------------------------------------------------------------- */
/*  The preference                                                             */
/* -------------------------------------------------------------------------- */

/** Whether this account currently wants alert email for this organisation.
    **A missing row means opted in**, so the default is `true` here and nothing
    needs backfilling. */
export const getAlertPreference = withSafeQueryErrors(
  "alert-queries.getAlertPreference",
  getAlertPreferenceImpl,
);

async function getAlertPreferenceImpl(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ emailAlerts: alertPreference.emailAlerts })
    .from(alertPreference)
    .where(
      and(
        eq(alertPreference.organizationId, organizationId),
        eq(alertPreference.userId, userId),
      ),
    )
    .limit(1);
  return row?.emailAlerts ?? true;
}

/**
 * Sets it, creating the row on first use.
 *
 * An upsert on the `(organization_id, user_id)` unique index, so two tabs
 * toggling at once end at one row rather than a constraint violation the action
 * would have to translate.
 */
export const setAlertPreference = withSafeQueryErrors(
  "alert-queries.setAlertPreference",
  setAlertPreferenceImpl,
);

async function setAlertPreferenceImpl(
  organizationId: string,
  userId: string,
  emailAlerts: boolean,
): Promise<void> {
  await getDb()
    .insert(alertPreference)
    .values({ organizationId, userId, emailAlerts })
    .onConflictDoUpdate({
      target: [alertPreference.organizationId, alertPreference.userId],
      set: { emailAlerts, updatedAt: new Date() },
    });
}


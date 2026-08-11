import * as z from "zod";

import type { SubmitResult } from "./result";

/**
 * Threshold alerts' vocabularies and the one input the browser sends — build
 * step 14.
 *
 * **Not `server-only`, and it must stay that way** (AGENTS.md 6.3), on exactly
 * the footing `lib/validation/targets.ts` records: the `/account` preference
 * leaf and the Server Action in `app/account/actions.ts` both import
 * {@link alertPreferenceSchema}, so the rules exist once and run twice
 * (AGENTS.md 10 rule 1).
 *
 * **It imports nothing from `lib/db/`.** `lib/db/schema.ts` calls `pgEnum` at
 * module scope, so an import in that direction would put `drizzle-orm/pg-core`
 * into a browser bundle. The enum *members* live here and `schema.ts` builds its
 * `pgEnum` from this constant, so the union is declared exactly once
 * (AGENTS.md 9.2 rule 2).
 *
 * The **threshold itself is not here.** It is a figure the alert evaluator
 * compares against, so it lives with the arithmetic in
 * `lib/domain/alerts.ts` — this module bounds inputs, it does not hold
 * judgements about emissions.
 */

/* -------------------------------------------------------------------------- */
/*  The alert lifecycle                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One crossing's states, in the order they occur.
 *
 * `raised` — the sweep found the projection past the threshold and wrote the
 * row. `notified` — an owner's email left successfully; a send failure leaves
 * the row at `raised` so the next sweep tries again, which is why this is a
 * state and not a boolean (AGENTS.md 9.2 rule 2). `resolved` — a later sweep
 * found the reading back at or below the threshold.
 *
 * **Every transition carries its own timestamp** on the row rather than only a
 * current-state column (AGENTS.md 9.2 rule 3).
 */
export const TARGET_ALERT_STATUSES = ["raised", "notified", "resolved"] as const;

export type TargetAlertStatus = (typeof TARGET_ALERT_STATUSES)[number];

export const TARGET_ALERT_STATUS_LABELS: Record<TargetAlertStatus, string> = {
  raised: "Raised",
  notified: "Notified",
  resolved: "Resolved",
};

/* -------------------------------------------------------------------------- */
/*  The preference                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The only thing the browser sends on this step's write path: whether this
 * account wants alert email for its current organisation.
 *
 * **No user id and no organisation id.** Both are resolved server-side from the
 * session and the membership row; a tenant identifier accepted from a request is
 * the whole multi-tenancy failure in one line, and `app/activity/actions.ts`
 * states that at length.
 */
export const alertPreferenceSchema = z.object({
  emailAlerts: z.boolean(),
});

export type AlertPreferenceInput = z.infer<typeof alertPreferenceSchema>;

export type AlertPreferenceResult = SubmitResult;

export const ALERT_PREFERENCE_ERRORS = {
  SIGNED_OUT:
    "Your session has expired. Sign in again to change this preference.",
  NO_ORGANIZATION:
    "This account belongs to no organisation, so there is nothing to alert on.",
  GENERIC:
    "We couldn't save that preference just now. Please try again in a moment.",
  INVALID: "That preference wasn't understood. Please try again.",
} as const;

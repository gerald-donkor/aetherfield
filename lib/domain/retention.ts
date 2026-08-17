/**
 * Phase-one retention — the cut-off arithmetic, and nothing else (prompt 81).
 *
 * **Pure, and that is what puts it here** (AGENTS.md 6.2): no database handle,
 * no `fetch`, and no implicit clock. Every function below takes `now` as a
 * parameter, so the boundaries are testable to the second and `npm test` — which
 * is scoped to this folder — can pin both sides of each of them.
 *
 * The windows themselves are **product decisions recorded as decisions, not
 * measurements** (AGENTS.md 12 rule 4). There is no traffic behind them and no
 * legal advice; they were taken with the user before prompt 81 was written, on
 * the same footing as prompt 73's 30-day organisation window. They live here so
 * one set of numbers reaches the SQL predicates in `lib/db/retention-queries.ts`,
 * the sentence each confirmation email states to the data subject, and these
 * tests — never a hand-typed duplicate in any of the three.
 */

/** The windows, in the units the policy states them in. */
export const RETENTION_WINDOWS = {
  /** A demo request, from `created_at`. */
  leadMonths: 24,
  /** A job application and its private CV blob, from `created_at`. */
  applicationMonths: 12,
  /** An unconfirmed newsletter address, from `created_at`. A double opt-in that
      was never completed is not consent, so it is the shortest window here. */
  pendingSubscriberDays: 30,
  /** An unsubscribed address, from `unsubscribed_at`. */
  unsubscribedSubscriberMonths: 12,
  /** The grace between an admin's removal in `/submissions` and the hard
      delete, for any of the three. Mirrors prompt 73's grace-then-purge rather
      than inventing a second shape. */
  softDeleteGraceDays: 30,
} as const;

/**
 * The same windows as the words a person reads, **derived from
 * {@link RETENTION_WINDOWS} rather than restated** — a hand-typed "24 months"
 * here could drift from the number that actually feeds the SQL predicate,
 * which is exactly the duplication this module exists to prevent (see the
 * module docblock).
 *
 * **The single source the emails and the docs quote**, so the sentence in an
 * inbox and the row in `docs/backend.md` cannot drift from the predicate that
 * actually deletes.
 */
export const RETENTION_WINDOW_TEXT = {
  lead: `${RETENTION_WINDOWS.leadMonths} months`,
  application: `${RETENTION_WINDOWS.applicationMonths} months`,
  pendingSubscriber: `${RETENTION_WINDOWS.pendingSubscriberDays} days`,
  unsubscribedSubscriber: `${RETENTION_WINDOWS.unsubscribedSubscriberMonths} months`,
} as const;

/**
 * One timestamp per window: the instant at or before which a record's dating
 * column makes it due.
 */
export type RetentionCutoffs = {
  lead: Date;
  application: Date;
  pendingSubscriber: Date;
  unsubscribedSubscriber: Date;
  softDelete: Date;
};

/**
 * Subtract whole **calendar** months in UTC, clamping a short target month.
 *
 * 31 March minus one month is 28 February (29 in a leap year), not 3 March —
 * the roll-over JavaScript's own `setUTCMonth` produces, which would make a
 * record due a few days *early* in exactly the months a person is least likely
 * to check. The day-of-month is set to 1 before the month arithmetic so the
 * intermediate value cannot overflow, then clamped to the target month's length.
 *
 * UTC throughout: the database column is `timestamptz` and the sweep runs on a
 * scheduler with no local time to speak of, so introducing a zone here would
 * only add a way for two runs to disagree.
 */
function subtractUtcMonths(now: Date, months: number): Date {
  const dayOfMonth = now.getUTCDate();
  const cutoff = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - months,
      1,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
  /* Day 0 of the following month is the last day of this one. */
  const daysInTargetMonth = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(dayOfMonth, daysInTargetMonth));
  return cutoff;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Subtract exact 24-hour days. Day windows are durations, not calendar
    arithmetic, so no clamping applies and none is wanted. */
function subtractUtcDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Every cut-off for one instant.
 *
 * **Computed once per sweep and threaded through**, never recomputed per
 * statement and never `now()` inside the SQL: two records written a second
 * apart must not be able to land on opposite sides of the same boundary.
 */
export function retentionCutoffs(now: Date): RetentionCutoffs {
  return {
    lead: subtractUtcMonths(now, RETENTION_WINDOWS.leadMonths),
    application: subtractUtcMonths(now, RETENTION_WINDOWS.applicationMonths),
    pendingSubscriber: subtractUtcDays(
      now,
      RETENTION_WINDOWS.pendingSubscriberDays,
    ),
    unsubscribedSubscriber: subtractUtcMonths(
      now,
      RETENTION_WINDOWS.unsubscribedSubscriberMonths,
    ),
    softDelete: subtractUtcDays(now, RETENTION_WINDOWS.softDeleteGraceDays),
  };
}

/**
 * The one comparison every predicate below is built from.
 *
 * **A record is due when its age has *reached* the window** — due iff
 * `timestamp <= now - window`. Exactly on the boundary is due; one second short
 * is not. Stated once here so the SQL in `lib/db/retention-queries.ts` can use
 * `lte` and mean the same thing.
 */
function reached(timestamp: Date, cutoff: Date): boolean {
  return timestamp.getTime() <= cutoff.getTime();
}

/**
 * A soft-deleted record is due at `deleted_at` + the grace, **whichever comes
 * first** with its own age window — so the two predicates are `or`-ed, never
 * substituted. An admin's removal shortens a record's life; it can never
 * lengthen it.
 */
function softDeleteDue(deletedAt: Date | null, cutoffs: RetentionCutoffs) {
  return deletedAt !== null && reached(deletedAt, cutoffs.softDelete);
}

/** A demo request: 24 months from `created_at`, or the soft-delete grace. */
export function isLeadDue(
  row: { createdAt: Date; deletedAt: Date | null },
  now: Date,
): boolean {
  const cutoffs = retentionCutoffs(now);
  return reached(row.createdAt, cutoffs.lead) || softDeleteDue(row.deletedAt, cutoffs);
}

/** A job application: 12 months from `created_at`, or the soft-delete grace.
    The CV blob goes with the row — in the sweep, strictly before it. */
export function isApplicationDue(
  row: { createdAt: Date; deletedAt: Date | null },
  now: Date,
): boolean {
  const cutoffs = retentionCutoffs(now);
  return (
    reached(row.createdAt, cutoffs.application) ||
    softDeleteDue(row.deletedAt, cutoffs)
  );
}

/**
 * A newsletter address, dated by its state.
 *
 * - `pending` — 30 days from `created_at`. An opt-in never completed is not
 *   consent, and holding the address indefinitely on the strength of one
 *   unanswered email is the archive AGENTS.md 8.3 rule 5 forbids.
 * - `unsubscribed` — 12 months from `unsubscribed_at`, falling back to
 *   `created_at` when the column is null (a row that never carried the stamp
 *   should not thereby become immortal).
 * - `confirmed` — **never by age.** The consent is live and the person holds a
 *   working one-click unsubscribe; only the soft-delete window can make this
 *   row due. Unsubscribing starts the 12-month clock above.
 */
export function isSubscriberDue(
  row: {
    status: "pending" | "confirmed" | "unsubscribed";
    createdAt: Date;
    unsubscribedAt: Date | null;
    deletedAt: Date | null;
  },
  now: Date,
): boolean {
  const cutoffs = retentionCutoffs(now);
  if (softDeleteDue(row.deletedAt, cutoffs)) return true;

  switch (row.status) {
    case "pending":
      return reached(row.createdAt, cutoffs.pendingSubscriber);
    case "unsubscribed":
      return reached(
        row.unsubscribedAt ?? row.createdAt,
        cutoffs.unsubscribedSubscriber,
      );
    case "confirmed":
      return false;
  }
}

import "server-only";

import { DrizzleQueryError } from "drizzle-orm";

/**
 * The data layer's error boundary — prompt 80.
 *
 * **The finding this closes.** `DrizzleQueryError`'s constructor
 * (`node_modules/drizzle-orm/errors.js`) builds its message as
 * `Failed query: <sql>` followed by `params: <bound parameters>` and keeps
 * `query`, `params` and `cause` as own properties. Prompt 79 narrowed Better
 * Auth's own log sink, and its total-outage measurement against that
 * implementation still recorded 60 framework error blocks carrying `query` and
 * `params` — there, the database-backed rate limiter's key, which embeds the
 * client IP address. An IP address is personal data and AGENTS.md 8.3 rule 2
 * admits no exception for it. The same parameter arrays carry work addresses,
 * names, session tokens, organisation ids and blob references.
 *
 * **Why the data layer and not the printer.** Six throw sites in
 * `drizzle-orm/pg-core/session.js` wrap every branch of `queryWithCache`, so no
 * configuration avoids the wrapping, and Next prints an escaping error through
 * two different printers (`_log.error` in production,
 * `bundlerService.logErrorWithOriginalStack` in dev). AGENTS.md 6.2 already
 * draws the line this module enforces — nothing outside `lib/db/` talks to the
 * database — so sanitizing at that boundary makes the guarantee hold for a
 * consumer written later that knows nothing about this file.
 *
 * A `util.inspect.custom` hook on `DrizzleQueryError.prototype` was considered
 * and rejected: `message` and `stack` are own properties set in the
 * constructor, so a prototype hook cannot neutralise either, and anything
 * reading `err.message` still sees the parameters.
 */

/**
 * What a caller sees instead of a `DrizzleQueryError`.
 *
 * Two own properties, and both are ours or the server's, never a row's:
 *
 * - `operation` — the caller-supplied label, e.g. `lead-queries.insertLead`.
 *   Without it a failure is undiagnosable, which would trade one defect for
 *   another.
 * - `sqlState` — the driver's five-character SQLSTATE, accepted only when it
 *   matches the standard's own shape. `23505` says "unique violation" and says
 *   nothing about which value collided.
 *
 * **`cause` is deliberately dropped, not forwarded.** `pg`'s `DatabaseError`
 * (`node_modules/pg-protocol/dist/messages.d.ts:34-53`) carries `detail`, and
 * on a unique violation `detail` quotes the conflicting key **value** — an
 * email address, on `subscriber` and on `user`. Attaching the cause would
 * reintroduce the disclosure one property further down.
 */
export class DatabaseQueryError extends Error {
  /** The `<module>.<function>` label the wrapped data-layer export supplied. */
  readonly operation: string;
  /** The driver's SQLSTATE, when it supplied one of the expected shape. */
  readonly sqlState: string | undefined;

  constructor(operation: string, sqlState: string | undefined) {
    super("Database query failed");
    this.name = "DatabaseQueryError";
    this.operation = operation;
    this.sqlState = sqlState;
  }
}

/** SQLSTATE is five characters from `[0-9A-Z]` (Postgres Appendix A). Anything
    else is not a code and is dropped rather than reproduced. */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/**
 * Reads the driver's SQLSTATE off the cause, or returns `undefined`.
 *
 * Every property read is inside the `try`, including the read of `cause`
 * itself: the error object is provider-controlled, and a getter that throws
 * must not turn a sanitized failure into a second, worse one.
 */
function readSqlState(error: DrizzleQueryError): string | undefined {
  try {
    const cause: unknown = error.cause;
    if (typeof cause !== "object" || cause === null) return undefined;
    const code: unknown = (cause as { code?: unknown }).code;
    if (typeof code !== "string") return undefined;
    return SQLSTATE_PATTERN.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A `DatabaseQueryError` for a Drizzle query failure; **everything else is
 * returned unchanged, by identity**.
 *
 * The pass-through is not laziness, it is required. `redirect()` and
 * `notFound()` are implemented as thrown values, and `lib/auth/` throws them
 * through calls that sit under wrapped data-layer functions; swallowing or
 * re-typing one would break navigation with no error to read. The same applies
 * to Drizzle's own `TransactionRollbackError`, which is not a
 * `DrizzleQueryError` and must keep reaching the transaction that expects it.
 *
 * An already-sanitized `DatabaseQueryError` is likewise returned unchanged, so
 * a nested data-layer call keeps the innermost — most specific — label.
 */
export function toSafeQueryError(error: unknown, operation: string): unknown {
  if (!(error instanceof DrizzleQueryError)) return error;
  return new DatabaseQueryError(operation, readSqlState(error));
}

/**
 * Wraps a data-layer export so no `DrizzleQueryError` escapes it.
 *
 * The parameter and return types are preserved exactly, including optional and
 * defaulted parameters such as the `db: Db = getDb()` a transaction passes.
 * Every wrapper rethrows; none swallows, and none inspects a result.
 */
export function withSafeQueryErrors<A extends unknown[], R>(
  operation: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw toSafeQueryError(error, operation);
    }
  };
}

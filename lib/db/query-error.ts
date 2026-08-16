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
 *
 * - `driverFault` — prompt 83. A failure that never reached the server carries
 *   no SQLSTATE, so `sqlState: undefined` was the whole of what a connection
 *   failure reported, and the page that surfaced it could not be told apart
 *   from a broken statement. This carries the cause's constructor `name` and,
 *   when it matches a closed allowlist of transport codes, its `code`. Neither
 *   can carry a row: both are matched against a fixed shape and the code
 *   against a fixed list, so an unrecognised value is dropped rather than
 *   reproduced.
 */
export class DatabaseQueryError extends Error {
  /** The `<module>.<function>` label the wrapped data-layer export supplied. */
  readonly operation: string;
  /** The driver's SQLSTATE, when it supplied one of the expected shape. */
  readonly sqlState: string | undefined;
  /** The cause's error class, and its transport code when it is a known one. */
  readonly driverFault: DriverFault | undefined;

  constructor(
    operation: string,
    sqlState: string | undefined,
    driverFault: DriverFault | undefined,
  ) {
    super("Database query failed");
    this.name = "DatabaseQueryError";
    this.operation = operation;
    this.sqlState = sqlState;
    this.driverFault = driverFault;
  }
}

/**
 * What a failure below SQL level is allowed to disclose: two identifiers, both
 * matched against a fixed shape or a fixed list.
 */
export type DriverFault = {
  /** The cause's constructor name — `Error`, `AggregateError`, `DatabaseError`. */
  readonly name: string;
  /** A transport-level code from {@link DRIVER_FAULT_CODES}, when it is one. */
  readonly code: string | undefined;
};

/** SQLSTATE is five characters from `[0-9A-Z]` (Postgres Appendix A). Anything
    else is not a code and is dropped rather than reproduced. */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/**
 * Reads the driver's SQLSTATE off the cause, or returns `undefined`.
 *
 * Every property read is inside the `try`, including the read of `cause`
 * itself: the error object is provider-controlled, and a getter that throws
 * must not turn a sanitized failure into a second, worse one.
 *
 * **It takes `unknown` and is exported, for the reason {@link readDriverFault}
 * is** — prompt 84. A data-layer function that has to tell one *expected*
 * refusal apart from a failure needs the code, and `update` carries no
 * `onConflictDoNothing` to answer a unique violation with, so
 * `updateTenantFactorSet` catches the throw and reads `23505` off it. That is
 * one reader, used twice; a second local copy of this shape inside a query
 * module is what must not happen.
 */
export function readSqlState(error: unknown): string | undefined {
  try {
    const cause: unknown =
      error instanceof DrizzleQueryError ? error.cause : error;
    if (typeof cause !== "object" || cause === null) return undefined;
    const code: unknown = (cause as { code?: unknown }).code;
    if (typeof code !== "string") return undefined;
    return SQLSTATE_PATTERN.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The transport-level codes a failure may name, and nothing else.
 *
 * Node's `libuv` codes plus the two DNS ones, which is the whole set a socket
 * to the pooled Neon host can produce. It is an allowlist rather than a
 * redaction for the reason prompt 80 recorded: a redaction has to be right
 * about every value it lets through, and an allowlist only about the values it
 * names. A code outside it is dropped, so a driver that one day puts something
 * else in `code` discloses nothing.
 */
const DRIVER_FAULT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EPIPE",
  "EADDRNOTAVAIL",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPROTO",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

/** An error class name is an identifier. Anything else is not one, and is
    dropped rather than reproduced — the same discipline as `SQLSTATE_PATTERN`,
    and the reason a cause whose `name` was overwritten with a message cannot
    smuggle one through. */
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Reads the cause's class name and transport code, or returns `undefined`.
 *
 * Every property read is inside the `try`, for the reason `readSqlState` gives:
 * the error object is provider-controlled and a throwing getter must not turn a
 * sanitized failure into a second, worse one.
 */
export function readDriverFault(error: unknown): DriverFault | undefined {
  try {
    const cause: unknown =
      error instanceof DrizzleQueryError ? error.cause : error;
    if (typeof cause !== "object" || cause === null) return undefined;

    const rawName: unknown = (cause as { name?: unknown }).name;
    const name =
      typeof rawName === "string" && ERROR_NAME_PATTERN.test(rawName)
        ? rawName
        : "Error";

    const rawCode: unknown = (cause as { code?: unknown }).code;
    const code =
      typeof rawCode === "string" && DRIVER_FAULT_CODES.has(rawCode)
        ? rawCode
        : undefined;

    return { name, code };
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
  return new DatabaseQueryError(
    operation,
    readSqlState(error),
    readDriverFault(error),
  );
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

/**
 * {@link withSafeQueryErrors} with the module half of the label bound once —
 * prompt 101.
 *
 * ```ts
 * const safe = queryErrorScope("report-queries");
 * export const createReport = safe("createReport", createReportImpl);
 * ```
 *
 * **The problem it solves is a silent desync.** The label is the only handle an
 * operator has on which query failed, and it was hand-written at 98 call sites
 * as a free string tied to nothing. A module rename, an export rename, or a
 * query copy-pasted as the basis for a new one left the label pointing at the
 * wrong function with nothing to catch it. Ninety-seven of the ninety-eight
 * module-name repetitions are now written once per file, and the remaining
 * function name sits on the same line as the `const` it labels — close enough
 * that a rename missing it shows up in the same line of diff.
 *
 * ---
 *
 * **Why the function half is still written by hand, and it is not for want of
 * trying.** Every one of the 98 call sites passes a named `<name>Impl`
 * declaration, so `fn.name.replace(/Impl$/, "")` derives the label exactly — in
 * development. It was rejected on evidence: after `npm run build`,
 * `listReportsImpl`, `insertLeadImpl` and `readDashboardEvidenceImpl` appear in
 * `.next/server/**` only inside `.map` files and **never in an emitted `.js`**,
 * because the production build mangles local function names. Deriving from
 * `fn.name` would therefore produce correct labels in dev and mangled ones in
 * production — the same defect this change exists to remove, hidden in the one
 * environment where it matters. The hand-written function name is an accepted,
 * recorded limitation.
 *
 * **`operation` carries no personal data and cannot.** It is a compile-time
 * constant built from a module name and a function name; no argument, row,
 * address or id reaches it. It is not logged by anything in this repository —
 * nothing reads `DatabaseQueryError.operation` — but it does travel on the error
 * object, which a platform error printer may serialise. That is the point of it,
 * and AGENTS.md 8.3 rule 2 is satisfied by construction rather than by care.
 */
export function queryErrorScope(moduleName: string) {
  return function safe<A extends unknown[], R>(
    name: string,
    fn: (...args: A) => Promise<R>,
  ): (...args: A) => Promise<R> {
    return withSafeQueryErrors(`${moduleName}.${name}`, fn);
  };
}

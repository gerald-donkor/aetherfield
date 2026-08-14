import "server-only";

import type { BetterAuthOptions } from "better-auth/types";

/**
 * Better Auth's log sink, narrowed so a provider error can never reach a
 * console.
 *
 * **The finding this closes.** Prompt 78's failing parallel runs put a database
 * transport error into Better Auth's default logger. That logger forwards every
 * argument it is handed straight to `console`
 * (`@better-auth/core/dist/env/logger.mjs`, `LogFunc`), and the installed
 * `get-session` catch hands it the caught error itself
 * (`better-auth/dist/api/routes/session.mjs:258`,
 * `ctx.context.logger.error("INTERNAL_SERVER_ERROR", error)`). The installed
 * `DrizzleQueryError` builds its message as `Failed query: <query>` followed by
 * `params: <params>` and keeps both as own properties
 * (`drizzle-orm/errors.js`), so the printed line carried the session token the
 * lookup was made with.
 *
 * **Why an allowlist and not a redaction pass.** Matching a token-shaped
 * substring would be the narrower change and the wrong one: the same parameter
 * array reaches names, work addresses, organisation rows, application fields
 * and blob references, all of which AGENTS.md 8.3 governs. So nothing
 * provider-controlled is inspected at all. The handler's signature stops at
 * `message`, which is why a rest argument is not merely unused here but
 * unreachable — a hostile getter on an argument object cannot be evaluated by
 * code that never receives it.
 *
 * The provider logger is narrowed rather than disabled, because a silent auth
 * pipeline is its own defect: one fixed event still reaches the log for every
 * call the provider makes.
 */

type SafeLogger = NonNullable<BetterAuthOptions["logger"]>;
type LogHandler = NonNullable<SafeLogger["log"]>;
type LogLevel = Parameters<LogHandler>[0];

/** Prefixes every line, so the source of a safe event is never ambiguous. */
const SOURCE_LABEL = "[Aetherfield][Better Auth]";

/**
 * Exact provider messages, mapped to Aetherfield event codes.
 *
 * A `Map` rather than an object literal so that a provider message which
 * happens to name an `Object.prototype` member cannot resolve to an entry that
 * was never written here.
 *
 * Only messages verified as static string literals in the installed provider
 * source belong here. `"INTERNAL_SERVER_ERROR"` has exactly one call site in
 * `node_modules/better-auth/dist/`, the `get-session` catch cited above, which
 * is the failure prompt 78 observed.
 */
const EVENT_CODES = new Map<string, string>([
  ["INTERNAL_SERVER_ERROR", "auth.internal_error"],
]);

/**
 * Everything else, including any provider message that interpolates a value.
 * One fixed code, so an unrecognised call is still counted and levelled without
 * any part of its text being reproduced.
 */
const UNCLASSIFIED_EVENT = "auth.unclassified_event";

function eventCodeFor(message: unknown): string {
  if (typeof message !== "string") return UNCLASSIFIED_EVENT;
  return EVENT_CODES.get(message) ?? UNCLASSIFIED_EVENT;
}

/**
 * Passed to `betterAuth({ logger })`.
 *
 * `level` is deliberately absent: the installed `createLogger` applies its own
 * `"warn"` threshold before calling this handler, and the custom-handler branch
 * does not require the option to be stated. Setting it here would change the
 * shipped threshold under cover of a logging fix.
 */
export const safeAuthLogger: SafeLogger = {
  log(level: LogLevel, message: string) {
    const code = eventCodeFor(message);

    // The level word is written out per branch rather than derived from the
    // argument, so no method is ever called on a provider-supplied value. The
    // trailing line is unreachable under the installed contract and exists so
    // an unrecognised level still emits exactly one safe line instead of
    // throwing inside a catch clause.
    if (level === "error") {
      console.error(`${SOURCE_LABEL} ERROR ${code}`);
      return;
    }
    if (level === "warn") {
      console.warn(`${SOURCE_LABEL} WARN ${code}`);
      return;
    }
    if (level === "info") {
      console.log(`${SOURCE_LABEL} INFO ${code}`);
      return;
    }
    if (level === "debug") {
      console.log(`${SOURCE_LABEL} DEBUG ${code}`);
      return;
    }
    console.log(`${SOURCE_LABEL} LOG ${code}`);
  },
};

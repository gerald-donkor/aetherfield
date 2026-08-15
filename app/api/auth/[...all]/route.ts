import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "../../../../lib/auth/server";
import { toSafeQueryError } from "../../../../lib/db/query-error";

/**
 * Better Auth's own mount point — the one sanctioned Route Handler that serves
 * this application rather than an external caller (AGENTS.md 7.3). No business
 * logic of ours goes in it, and none has been added here.
 *
 * **Why the wrapper exists — prompt 80.** Better Auth's adapter queries do not
 * go through `lib/db/`, so the data layer's own boundary cannot cover them. The
 * database-backed rate limiter's `consume` path is exactly such a query, and
 * prompt 79 measured its `DrizzleQueryError` escaping to Next's error printer
 * with the query and its bound parameters — there, the limiter's key, which
 * embeds the client IP address (AGENTS.md 8.3 rule 2).
 *
 * **The error still propagates.** `toSafeQueryError` returns everything that is
 * not a `DrizzleQueryError` by identity and rethrows what it replaces, so the
 * status, body and cookie behaviour of every auth response are unchanged;
 * only what reaches the log changes. Nothing is swallowed and no fallback
 * response is invented — an auth failure that answered 500 still answers 500.
 */
const handlers = toNextJsHandler((request) => getAuth().handler(request));

function sanitized(
  method: "GET" | "POST",
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      throw toSafeQueryError(error, `auth-handler.${method}`);
    }
  };
}

export const GET = sanitized("GET", handlers.GET);
export const POST = sanitized("POST", handlers.POST);

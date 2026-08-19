import "server-only";

import { checkLimit, formatRetry, type RateLimitPolicy } from "./index";

/**
 * The single spend point for every rate-limited write in this codebase —
 * architecture candidate 1, deepened (`docs/architecture.md`, prompt 130).
 *
 * `checkLimit` in `./index` returns a two-state outcome — allowed or
 * throttled — and says nothing about the limiter itself failing to answer.
 * Twelve sites outside `lib/auth/tenant.ts` each wrapped it in their own
 * `try`/`catch`, and the posture that `catch` took — fail open or fail
 * closed — lived in a comment above it rather than in anything a caller was
 * obliged to state. This module folds the `try`/`catch` in here, once, and
 * turns the posture into a third value every caller must handle.
 *
 * **`unavailable` is what a caught limiter error becomes.** Nothing is
 * logged on that path — a caught limiter failure can carry connection detail
 * (AGENTS.md 8.3 rule 2) — and nothing is swallowed either: the caller gets a
 * value it must branch on, so a site that forgets `unavailable` is a compile
 * error rather than a silent fail-open.
 */

export type SpendOutcome =
  | { status: "allowed" }
  /** `retryAfterSeconds` is the raw wait, for a caller building its own
      response (a route's `429` body). `retry` is the same wait already run
      through `formatRetry`, in the site's measured register, so no caller
      calls `formatRetry` itself any more. */
  | { status: "throttled"; retryAfterSeconds: number; retry: string }
  | { status: "unavailable" };

/**
 * Every policy but `"cron-sweep"` takes the caller's identifier, exactly as
 * `checkLimit` does — this module is a thin posture wrapper around it, not a
 * second policy surface.
 *
 * @param identifier the caller's IP or the signed-in account's user id,
 * resolved server-side. Never a value the browser supplied as such.
 */
export function spendLimit(
  policy: Exclude<RateLimitPolicy, "cron-sweep">,
  identifier: string,
): Promise<SpendOutcome>;
export function spendLimit(policy: "cron-sweep"): Promise<SpendOutcome>;
export async function spendLimit(
  policy: RateLimitPolicy,
  identifier?: string,
): Promise<SpendOutcome> {
  try {
    const outcome =
      policy === "cron-sweep"
        ? await checkLimit(policy)
        : await checkLimit(policy, identifier!);

    if (outcome.allowed) return { status: "allowed" };
    return {
      status: "throttled",
      retryAfterSeconds: outcome.retryAfterSeconds,
      retry: formatRetry(outcome.retryAfterSeconds),
    };
  } catch {
    return { status: "unavailable" };
  }
}

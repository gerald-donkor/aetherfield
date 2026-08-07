import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * The limiter every public write path shares (AGENTS.md 8.2 rule 2).
 *
 * **Lazy, for the same reason `lib/db/client.ts` is lazy.** `next build`
 * evaluates top-level module code, so a client constructed at import time
 * against unset Upstash variables fails the build before any route renders.
 *
 * **The window is a judgement, not a measurement.** There is nothing to measure
 * here — the form has never shipped, so there is no traffic to fit against.
 * The reasoning is recorded in `docs/backend.md`: a demo request is a
 * considered act a person performs once, so a handful per hour per address is
 * far above any honest use and far below what makes the table worth spamming.
 * Revisit it against real traffic rather than treating it as fitted.
 */

/** Five demo requests per IP per hour. Sliding, so the hour boundary is not a
    free refill for a client that times its burst. */
const DEMO_REQUEST_LIMIT = 5;
const DEMO_REQUEST_WINDOW = "1 h" as const;

let demoRequestLimiter: Ratelimit | undefined;

function getDemoRequestLimiter(): Ratelimit {
  if (demoRequestLimiter) return demoRequestLimiter;

  /* `KV_REST_API_*`, **not** `UPSTASH_REDIS_REST_*`. The Vercel Marketplace
     integration sets the KV-prefixed names — read back from `vercel env ls`
     after provisioning, not guessed, and AGENTS.md 8.4 was corrected to match.
     `Redis.fromEnv()` looks for the UPSTASH names and would find nothing, which
     is why the client is constructed explicitly.

     The write token, not `KV_REST_API_READ_ONLY_TOKEN`: a limiter counts. */
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV_REST_API_URL / KV_REST_API_TOKEN are not set. Pull them with `vercel env pull .env.local`.",
    );
  }

  demoRequestLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(DEMO_REQUEST_LIMIT, DEMO_REQUEST_WINDOW),
    prefix: "aetherfield:demo-request",
    analytics: false,
  });

  return demoRequestLimiter;
}

export type RateLimitOutcome =
  | { allowed: true }
  /** `retryAfterSeconds` is what stage b owes the user — a rejection that does
      not say when to come back is an unhelpful rejection (AGENTS.md 10). */
  | { allowed: false; retryAfterSeconds: number };

/**
 * @param identifier the caller's IP, never anything personal — the key lands in
 * Redis and AGENTS.md 8.3 rule 2 keeps addresses and names out of every store
 * that is not `lead` itself.
 */
export async function checkDemoRequestLimit(
  identifier: string,
): Promise<RateLimitOutcome> {
  const { success, reset } = await getDemoRequestLimiter().limit(identifier);
  if (success) return { allowed: true };

  // `reset` is a unix timestamp in ms at which the window frees up.
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((reset - Date.now()) / 1000),
  );
  return { allowed: false, retryAfterSeconds };
}

import "server-only";

import { createHash } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { POLICIES, type RateLimitPolicy } from "./policies";

export type { RateLimitPolicy } from "./policies";

/**
 * The limiters every public write path shares (AGENTS.md 8.2 rule 2).
 *
 * **Lazy, for the same reason `lib/db/client.ts` is lazy.** `next build`
 * evaluates top-level module code, so a client constructed at import time
 * against unset Upstash variables fails the build before any route renders.
 * One Redis client, one `Ratelimit` per prefix, both built on first use.
 *
 * The policy table itself — every window, its judgement and its key
 * treatment — lives in `./policies` as a pure record with no I/O. This module
 * is the Redis-touching half: it walks a policy's stages against `consume()`.
 */

let redis: Redis | undefined;

function getRedis(): Redis {
  if (redis) return redis;

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

  redis = new Redis({ url, token });
  return redis;
}

/** One lazily built limiter per prefix, so a module-scope `new Ratelimit` never
    reaches `next build` (the guarantee `lib/db/client.ts` also holds). */
const limiters = new Map<string, Ratelimit>();

function getLimiter(
  prefix: string,
  limit: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Ratelimit {
  const existing = limiters.get(prefix);
  if (existing) return existing;

  const created = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `aetherfield:${prefix}`,
    analytics: false,
  });
  limiters.set(prefix, created);
  return created;
}

export type RateLimitOutcome =
  | { allowed: true }
  /** `retryAfterSeconds` is what stage b owes the user — a rejection that does
      not say when to come back is an unhelpful rejection (AGENTS.md 10). */
  | { allowed: false; retryAfterSeconds: number };

async function consume(
  prefix: string,
  limit: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
  identifier: string,
): Promise<RateLimitOutcome> {
  const { success, reset } = await getLimiter(prefix, limit, window).limit(
    identifier,
  );
  if (success) return { allowed: true };

  // `reset` is a unix timestamp in ms at which the window frees up.
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

/**
 * What an unkeyed call to a keyed policy is told to wait. **A judgement, not a
 * measurement** (AGENTS.md 12 rule 4): the branch it serves is unreachable
 * through the exported overloads below, so no window was fitted to it. One
 * minute is long enough that a caller looping on the bug backs off, short
 * enough that a real person caught by it is not locked out.
 */
const UNKEYED_REFUSAL_SECONDS = 60;

/**
 * Every policy but `"cron-sweep"` takes the caller's identifier — an IP or a
 * user id, never anything personal (AGENTS.md 8.3 rule 2 keeps addresses and
 * tokens out of every store that is not the table that owns them, which is why
 * `"newsletter-address"` and `"newsletter-one-click"` hash before the key
 * reaches Redis).
 *
 * @param identifier the caller's IP or the signed-in account's user id,
 * resolved server-side. Never a value the browser supplied as such.
 */
export function checkLimit(
  policy: Exclude<RateLimitPolicy, "cron-sweep">,
  identifier: string,
): Promise<RateLimitOutcome>;
/**
 * `"cron-sweep"` takes no caller identifier — it keys on the constant
 * `"sweep"` (`./policies`), and this overload is what makes passing one a
 * compile error rather than a runtime surprise (prompt 122's `throttled`
 * technique, applied to arity instead of to a required field).
 */
export function checkLimit(policy: "cron-sweep"): Promise<RateLimitOutcome>;
export async function checkLimit(
  policy: RateLimitPolicy,
  identifier?: string,
): Promise<RateLimitOutcome> {
  const definition = POLICIES[policy];

  /* **Fails closed, and the cast it replaces failed open.** The overloads above
     make an unkeyed call to a keyed policy a compile error, so this is
     unreachable from TypeScript — but the previous `identifier as string` meant
     that anything reaching it anyway (a JS caller, a future overload widened
     without thinking) keyed Redis with the literal string `"undefined"`, i.e.
     one shared bucket for every caller of that policy. That is a limiter
     silently going fail-open on an AGENTS.md 8.2 rule 2 path. A refusal is the
     safe direction for a limiter whose key it cannot establish. */
  let key: string;
  if (typeof definition.key === "object") {
    key = definition.key.constant;
  } else {
    if (identifier === undefined) {
      return { allowed: false, retryAfterSeconds: UNKEYED_REFUSAL_SECONDS };
    }
    key =
      definition.key === "hash"
        ? createHash("sha256").update(identifier).digest("hex")
        : identifier;
  }

  for (const stage of definition.stages) {
    const outcome = await consume(stage.prefix, stage.limit, stage.window, key);
    if (!outcome.allowed) return outcome;
  }
  return { allowed: true };
}

/**
 * Retry timing in the site's measured register — "4 minutes", not "241s".
 *
 * **Lives here rather than in an action** because step 4 needs the identical
 * sentence and `app/_actions/*.ts` are `"use server"` modules, whose every
 * runtime export must be an async function. It sits next to the limiter that
 * produces the number it formats.
 */
export function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

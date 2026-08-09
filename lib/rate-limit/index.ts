import "server-only";

import { createHash } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * The limiters every public write path shares (AGENTS.md 8.2 rule 2).
 *
 * **Lazy, for the same reason `lib/db/client.ts` is lazy.** `next build`
 * evaluates top-level module code, so a client constructed at import time
 * against unset Upstash variables fails the build before any route renders.
 * One Redis client, one `Ratelimit` per prefix, both built on first use.
 *
 * **Every window below is a judgement, not a measurement.** There is nothing to
 * measure — neither form has shipped, so there is no traffic to fit against.
 * The reasoning is recorded per constant and in `docs/backend.md`; revisit them
 * against real traffic rather than treating them as fitted.
 *
 * **No identifier here is personal.** Keys are an IP, or a sha256 of an address
 * or a token — never the address itself (AGENTS.md 8.3 rule 2 keeps personal
 * data out of every store that is not the table that owns it, and Redis is such
 * a store).
 */

/** Five demo requests per IP per hour. Sliding, so the hour boundary is not a
    free refill for a client that times its burst. */
const DEMO_REQUEST_LIMIT = 5;
const DEMO_REQUEST_WINDOW = "1 h" as const;

/**
 * Newsletter signup, per IP. The same shape and the same reasoning as the demo
 * request's limiter, and **the same judgement**: nothing here is fitted, because
 * the form has never shipped. Subscribing is a once-ever act for a person, so
 * five in an hour from one address block is far above honest use.
 */
const NEWSLETTER_IP_LIMIT = 5;
const NEWSLETTER_IP_WINDOW = "1 h" as const;

/**
 * Confirmation sends, **per address** — and this one is the limit that matters.
 *
 * Without it, one IP inside a limit of five can still be pointed at five
 * different strangers' inboxes, which turns a subscribe form into a small mail
 * cannon. The numbers come from `email-best-practices`'s `email-capture.md`
 * ("limit verification emails (3/hour per email)", "allow resend after 60
 * seconds"), which is a published recommendation rather than a measurement of
 * this site — record it as the judgement it is.
 *
 * Two windows, checked burst-first so a rejected double-click does not consume
 * one of the three hourly sends.
 */
const NEWSLETTER_ADDRESS_BURST_LIMIT = 1;
const NEWSLETTER_ADDRESS_BURST_WINDOW = "60 s" as const;
const NEWSLETTER_ADDRESS_LIMIT = 3;
const NEWSLETTER_ADDRESS_WINDOW = "1 h" as const;

/**
 * The confirm and unsubscribe pages' actions, per IP. Deliberately looser: they
 * write no new row, send no mail to a third party, and the thing they act on is
 * a 32-byte token that guessing does not reach. The limit exists so a broken
 * client cannot hammer the database, not because the path is dangerous.
 */
const NEWSLETTER_TOKEN_LIMIT = 20;
const NEWSLETTER_TOKEN_WINDOW = "1 h" as const;

/**
 * The one-click `List-Unsubscribe` endpoint, **keyed by the token rather than
 * the IP** — and that is deliberate, not an oversight.
 *
 * Gmail's and Yahoo's infrastructure POST to this endpoint on behalf of many
 * different people from a small pool of addresses, so an IP key would throttle
 * a mail provider honouring real unsubscribes. A token key bounds abuse of any
 * one subscriber's link, which is the thing that can actually be abused.
 */
const NEWSLETTER_ONE_CLICK_LIMIT = 10;
const NEWSLETTER_ONE_CLICK_WINDOW = "1 h" as const;

/**
 * Job applications, per IP. **Five per hour is a judgement, not a
 * measurement** — the apply form has never shipped, so there is no traffic to
 * fit against, and this number is to be revisited against real traffic rather
 * than treated as fitted.
 *
 * It matches the demo request's limiter deliberately: a person may genuinely
 * apply to two roles in one sitting, and three roles plus a mistyped retry is
 * still honest use, while five uploads an hour is nowhere near worth abusing an
 * endpoint that writes a blob per request.
 *
 * **There is deliberately no per-address limiter here**, and the asymmetry with
 * the newsletter is the point: the newsletter's exists because a confirmation
 * email is a *capability* sent to a stranger's inbox, so an unlimited form is a
 * mail cannon pointed at anyone. Nothing on this path is — the applicant's
 * confirmation goes to the address that just submitted a CV, and the internal
 * notification goes to Aetherfield's own inbox.
 */
const APPLICATION_LIMIT = 5;
const APPLICATION_WINDOW = "1 h" as const;

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

/**
 * @param identifier the caller's IP, never anything personal — the key lands in
 * Redis and AGENTS.md 8.3 rule 2 keeps addresses and names out of every store
 * that is not `lead` itself.
 */
export async function checkDemoRequestLimit(
  identifier: string,
): Promise<RateLimitOutcome> {
  return consume("demo-request", DEMO_REQUEST_LIMIT, DEMO_REQUEST_WINDOW, identifier);
}

/** Newsletter signup, keyed by IP. Stage b of AGENTS.md 10. */
export async function checkNewsletterIpLimit(
  identifier: string,
): Promise<RateLimitOutcome> {
  return consume(
    "newsletter-ip",
    NEWSLETTER_IP_LIMIT,
    NEWSLETTER_IP_WINDOW,
    identifier,
  );
}

/**
 * Confirmation sends, keyed by the **hash** of the address.
 *
 * **The address is never a Redis key.** AGENTS.md 8.3 rule 2 keeps personal
 * data out of every store that is not `subscriber` itself, and an unhashed key
 * would put every submitted address in Upstash's console, readable by anyone
 * with dashboard access and retained for the window's lifetime. sha256 over the
 * already-lowercased address gives a stable key with none of that.
 *
 * Runs **after** the parse rather than at stage b, because it needs the
 * canonical lowercased address that the schema produces. Still before the
 * write, so a limited address costs nothing but the parse.
 */
export async function checkNewsletterAddressLimit(
  email: string,
): Promise<RateLimitOutcome> {
  const key = createHash("sha256").update(email).digest("hex");

  const burst = await consume(
    "newsletter-address-burst",
    NEWSLETTER_ADDRESS_BURST_LIMIT,
    NEWSLETTER_ADDRESS_BURST_WINDOW,
    key,
  );
  if (!burst.allowed) return burst;

  return consume(
    "newsletter-address",
    NEWSLETTER_ADDRESS_LIMIT,
    NEWSLETTER_ADDRESS_WINDOW,
    key,
  );
}

/** The confirm and unsubscribe pages' actions, keyed by IP. */
export async function checkNewsletterTokenLimit(
  identifier: string,
): Promise<RateLimitOutcome> {
  return consume(
    "newsletter-token",
    NEWSLETTER_TOKEN_LIMIT,
    NEWSLETTER_TOKEN_WINDOW,
    identifier,
  );
}

/** The one-click endpoint, keyed by the hash of the unsubscribe token. See the
    constant's docblock for why this one is not keyed by IP. */
export async function checkNewsletterOneClickLimit(
  token: string,
): Promise<RateLimitOutcome> {
  return consume(
    "newsletter-one-click",
    NEWSLETTER_ONE_CLICK_LIMIT,
    NEWSLETTER_ONE_CLICK_WINDOW,
    createHash("sha256").update(token).digest("hex"),
  );
}

/** Job applications, keyed by IP. Stage b of AGENTS.md 10, and the only
    limiter on that path — see the constant's docblock for why there is no
    per-address one. */
export async function checkApplicationLimit(
  identifier: string,
): Promise<RateLimitOutcome> {
  return consume(
    "application",
    APPLICATION_LIMIT,
    APPLICATION_WINDOW,
    identifier,
  );
}

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

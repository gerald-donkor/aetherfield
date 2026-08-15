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

/**
 * Organisation creation, **keyed by user id rather than IP** — build step 8.
 *
 * **The number is a judgement, not a measurement** (AGENTS.md 12 rule 4), on
 * exactly the same footing as every window above it. Nothing here is fitted:
 * the flow has never shipped, so there is no traffic to fit against, and it is
 * to be revisited against real usage rather than treated as measured.
 *
 * **Keyed by user id because the path is authenticated.** An IP key would
 * throttle a whole office behind one NAT for something only a signed-in,
 * verified account can do, and it would leave the actual abusable surface — one
 * account probing the slug namespace — unbounded.
 *
 * **The real cap is not this limiter.** `organizationLimit` in
 * `lib/auth/server.ts` bounds how many organisations an account may own; this
 * bounds how often it may *ask*. Ten an hour is deliberately loose against that
 * cap: a person creating one organisation may reasonably retry several times
 * around a rejected slug, and each rejection consumes a slot without creating a
 * row. What it stops is a script walking the slug space through the duplicate
 * error, and a broken client hammering Postgres.
 *
 * **A user id is not personal data.** It is the opaque database identifier of
 * the session's own subject — not a name and not an address — so unlike the
 * newsletter's address key it needs no hash to stay inside AGENTS.md 8.3
 * rule 2.
 */
const ORGANIZATION_CREATE_LIMIT = 10;
const ORGANIZATION_CREATE_WINDOW = "1 h" as const;

/**
 * Activity-file uploads, **keyed by user id** — build step 9.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
 * as every window above it. Nothing here is fitted: the flow has never shipped,
 * so there is no traffic to fit against, and it is to be revisited against real
 * usage rather than treated as measured.
 *
 * **Keyed by user id for the reason the organisation limiter records.** The
 * path is authenticated and tenant-scoped, so an IP key would throttle a whole
 * office behind one NAT while leaving the abusable surface — one account
 * uploading files in a loop — unbounded. A user id is not personal data: it is
 * the opaque database identifier of the session's own subject, so unlike the
 * newsletter's address key it needs no hash.
 *
 * **20 an hour is deliberately loose**, because a person correcting a mapping
 * often re-exports and re-uploads several times in one sitting, and each of
 * those is honest use. What it bounds is the cost of the path: every accepted
 * upload writes a private blob and up to `CSV_MAX_ROWS` staged rows, which is
 * by far the most expensive write in this codebase.
 */
const ACTIVITY_IMPORT_LIMIT = 20;
const ACTIVITY_IMPORT_WINDOW = "1 h" as const;

/**
 * Commits, discards and mapping overrides, **keyed by user id**. Also a
 * judgement and also unfitted.
 *
 * Looser than the upload's because these write no blob and read no file: the
 * work is one transaction over rows that are already staged. The limit exists
 * so a broken client cannot hammer Postgres, not because the path is dangerous
 * — every one of the three re-resolves the tenant and re-reads the import
 * scoped to it before writing anything.
 */
const ACTIVITY_COMMIT_LIMIT = 60;
const ACTIVITY_COMMIT_WINDOW = "1 h" as const;

/**
 * Choosing the emission factor for a `(category, unit)` pair, **keyed by user
 * id** — prompt 65.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
 * as every window above it: the flow has never shipped, so there is nothing to
 * fit against.
 *
 * **A named limiter rather than a reuse of `checkActivityCommitLimit`**, for the
 * reason the target and report limiters each record, and here the asymmetry is
 * larger than either. That limiter's 60 an hour is sized for "one transaction
 * over rows that are already staged"; this write recalculates the **whole
 * organisation** afterwards — every committed record, through the engine — which
 * is the heaviest operation a person can trigger from a form in this codebase.
 * Sharing a bucket would also let an afternoon of import work exhaust the
 * allowance for closing a coverage gap, which is the thing a reporter is trying
 * to do before filing.
 *
 * 30 an hour is deliberately loose against honest use: an owner working through
 * a list of unmapped pairs sets one factor per attempt, and a tenant has at most
 * 64 pairs in total.
 */
const FACTOR_MAPPING_LIMIT = 30;
const FACTOR_MAPPING_WINDOW = "1 h" as const;

/**
 * Bulk factor-set CSV import, **keyed by user id** — prompt 82.
 *
 * **Both numbers are judgements, not measurements** (AGENTS.md 12 rule 4), on
 * the same footing as every window above: the flow has never shipped, so there
 * is nothing to fit against.
 *
 * **Tighter than `FACTOR_MAPPING_LIMIT`, and tighter than the activity
 * upload's 20**, because one accepted call writes up to `CSV_MAX_ROWS` factor
 * rows in a single transaction — the largest write one form submission can
 * cause in this codebase. Against that, honest use is small and deliberate: a
 * customer imports a supplied set once, and re-imports after correcting a file.
 * Six an hour leaves room for several correction rounds in a sitting while
 * bounding what one compromised owner session can push into Postgres.
 *
 * **Keyed by user id for the reason the upload limiter records**: the path is
 * authenticated and tenant-scoped, so an IP key would throttle a whole office
 * behind one NAT while leaving the abusable surface — one account importing in
 * a loop — unbounded. A user id is the opaque identifier of the session's own
 * subject, so unlike the newsletter's address key it needs no hash.
 */
const FACTOR_IMPORT_LIMIT = 6;
const FACTOR_IMPORT_WINDOW = "1 h" as const;

/**
 * Setting and retiring a target, **keyed by user id** — build step 11.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
 * as every window above it. Nothing here is fitted: the flow has never shipped,
 * so there is no traffic to fit against, and it is to be revisited against real
 * usage rather than treated as measured.
 *
 * **Keyed by user id for the reason the organisation limiter records.** The path
 * is authenticated and tenant-scoped, so an IP key would throttle a whole office
 * behind one NAT while leaving the abusable surface — one account writing rows
 * in a loop — unbounded. A user id is not personal data.
 *
 * **A named limiter rather than a reuse of `checkActivityCommitLimit`**, because
 * the two bound different things: that one bounds work over rows already staged
 * in an import, and its 60 an hour is sized for a person iterating on a column
 * mapping. Setting a target is a deliberate, occasional act — a company files a
 * handful of commitments, not sixty an hour — and sharing a bucket would let a
 * busy import session exhaust the allowance for an unrelated flow. 30 is
 * deliberately loose against honest use: a reporter correcting a mistyped
 * baseline consumes one slot per attempt.
 */
const TARGET_WRITE_LIMIT = 30;
const TARGET_WRITE_WINDOW = "1 h" as const;

/**
 * Building and removing a report snapshot, **keyed by user id** — build
 * step 13.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
 * as every window above it. Nothing here is fitted: the flow has never shipped,
 * so there is no traffic to fit against.
 *
 * **Keyed by user id for the reason the organisation limiter records** — the
 * path is authenticated and tenant-scoped, so an IP key would throttle a whole
 * office behind one NAT while leaving the abusable surface unbounded.
 *
 * **A named limiter rather than a reuse of `checkTargetWriteLimit`**, because
 * the two bound different work. Building a report reads every stored emission
 * the organisation holds, aggregates it and writes a JSON snapshot; that is a
 * materially heavier read than writing a target row, and sharing a bucket would
 * let an afternoon of target edits exhaust the allowance for a disclosure a
 * reporter is trying to file. 20 an hour is deliberately loose against honest
 * use: a reporter iterating on a title, or rebuilding after committing a late
 * import, consumes one slot per attempt.
 */
const REPORT_WRITE_LIMIT = 20;
const REPORT_WRITE_WINDOW = "1 h" as const;

/**
 * AI narrative generations, **keyed by user id** — build step 13, and the only
 * limiter in this file guarding a **paid third-party call**.
 *
 * **A judgement, not a measurement**, like every window above it — but unlike
 * them it is deliberately *tighter* than the write limiter it sits beside, and
 * the asymmetry is the point. Building a snapshot costs a database read; asking
 * for a draft costs a model invocation, and a rejected draft (a figure not in
 * the report) is a state a reporter will reasonably retry from. Ten an hour
 * leaves room for several retries per report while bounding what one account can
 * spend, which is the thing that can actually be abused here.
 *
 * It is consumed **before** the model is called and after the report has been
 * read, so a rejected request costs one tenant-predicated select and nothing at
 * the provider.
 */
const REPORT_NARRATIVE_LIMIT = 10;
const REPORT_NARRATIVE_WINDOW = "1 h" as const;

/**
 * The `/account` alert-email preference, **keyed by user id** — build step 14.
 *
 * **A judgement, not a measurement**, like every window above it. The flow has
 * never shipped, so there is nothing to fit against.
 *
 * **A named limiter rather than a reuse**, for the reason the target and report
 * limiters each record: this bounds a one-row upsert a person toggles, and
 * sharing a bucket with a heavier flow would let an afternoon's work exhaust the
 * allowance for turning off an email. 30 an hour is deliberately loose — a
 * person flipping a switch back and forth while deciding consumes one slot per
 * flip, and that is honest use.
 */
const ALERT_PREFERENCE_LIMIT = 30;
const ALERT_PREFERENCE_WINDOW = "1 h" as const;

/**
 * Inviting, cancelling an invitation and removing a member, **keyed by user
 * id** — prompt 63, closing what build step 8 deferred.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
 * as every window above it: the flow has never shipped, so there is nothing to
 * fit against.
 *
 * **A named limiter rather than a reuse**, for the reason each one above records
 * — but this one has a cost the others do not: an invite **sends mail to an
 * address the caller typed**, and that is the abusable surface. Nobody but an
 * owner of an existing organisation can reach it, and the address goes into a
 * row we own, so this is not an open relay; 20 an hour still bounds what one
 * compromised owner account can put into other people's inboxes, while leaving
 * an owner onboarding a team comfortable room — the three writes share the
 * bucket, and inviting a ten-person department costs ten of the twenty.
 */
/**
 * Requesting and reversing an organisation's deletion, **keyed by user id** —
 * prompt 73.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), like every window
 * above it: the flow has never shipped, so there is nothing to fit against.
 *
 * **Deliberately tight, and the asymmetry with every limiter above is the
 * point.** Deleting an organisation is the single most consequential act a
 * customer can perform here, and there is no honest use that repeats it: an
 * owner requests once, or restores once, and mistyping the confirmation slug is
 * the only reason to try twice in a sitting. Ten an hour leaves ample room for
 * that while bounding what one compromised owner session can do to a
 * workspace — the *rate*, not the act, since the grace window is what actually
 * makes the act reversible.
 *
 * **The request and the restore share one bucket**, so an attacker who
 * exhausts it cannot thereby stop the owner restoring: an exhausted bucket
 * refuses both, and the purge is still 30 days away.
 */
const ORGANIZATION_DELETION_LIMIT = 10;
const ORGANIZATION_DELETION_WINDOW = "1 h" as const;

const INVITATION_WRITE_LIMIT = 20;
const INVITATION_WRITE_WINDOW = "1 h" as const;

/**
 * Accepting and declining an invitation, **keyed by user id** — prompt 63.
 *
 * **A judgement, like every window above it.** Separate from the write limiter
 * because the two are reached by different people: the write limiter bounds an
 * owner, this bounds the person who was invited, and an invitee throttled by an
 * owner's morning of invitations would be locked out of the one action they came
 * to perform. It sends no mail and writes one `member` row, so it is deliberately
 * loose — 30 an hour is far past honest use, where the whole flow is one click,
 * and it exists to bound retries against a link that is being probed rather than
 * to shape traffic.
 */
const INVITATION_RESPONSE_LIMIT = 30;
const INVITATION_RESPONSE_WINDOW = "1 h" as const;

/**
 * The nightly recalculation sweep, **keyed on a constant rather than an
 * identifier** — build step 14.
 *
 * **A judgement, not a measurement** (AGENTS.md 12 rule 4), like every window
 * above it. There is nothing to fit against: the endpoint has one legitimate
 * caller and it calls once a day.
 *
 * **Not keyed by IP.** Vercel's scheduler calls from its own infrastructure and
 * there is exactly one job, so an IP key would bound nothing an id key does not.
 * The constant key bounds the *endpoint*, which is the thing that can be abused:
 * a leaked `CRON_SECRET` driving repeated full-tenant sweeps.
 *
 * **Six an hour against a once-daily schedule** is deliberately loose: the Hobby
 * plan's scheduling precision is ±59 minutes, a deploy can retrigger the job,
 * and the sweep is idempotent, so refusing a legitimate second run would cost
 * more than allowing it. This limiter is not traffic shaping.
 */
const CRON_SWEEP_LIMIT = 6;
const CRON_SWEEP_WINDOW = "1 h" as const;

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

/**
 * Organisation creation, keyed by the **user id**. Stage b of AGENTS.md 10, and
 * the only limiter on that path — see the constant's docblock for why it is not
 * keyed by IP, and why the number is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkOrganizationCreateLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "organization-create",
    ORGANIZATION_CREATE_LIMIT,
    ORGANIZATION_CREATE_WINDOW,
    userId,
  );
}

/**
 * Activity-file uploads, keyed by the **user id**. Stage b of AGENTS.md 10 —
 * see the constant's docblock for why it is not keyed by IP, and why the number
 * is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkActivityImportLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "activity-import",
    ACTIVITY_IMPORT_LIMIT,
    ACTIVITY_IMPORT_WINDOW,
    userId,
  );
}

/** The commit, discard and mapping-override actions, keyed by the user id.
    Also a judgement, also unfitted — see the constant's docblock. */
export async function checkActivityCommitLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "activity-commit",
    ACTIVITY_COMMIT_LIMIT,
    ACTIVITY_COMMIT_WINDOW,
    userId,
  );
}

/**
 * Choosing the emission factor for a `(category, unit)` pair, keyed by the
 * **user id**. Stage b of AGENTS.md 10 — see the constant's docblock for why it
 * is not `checkActivityCommitLimit`, and why the number is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkFactorMappingLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "factor-mapping",
    FACTOR_MAPPING_LIMIT,
    FACTOR_MAPPING_WINDOW,
    userId,
  );
}

/**
 * Bulk factor-set CSV import, keyed by the **user id**. Stage b of AGENTS.md
 * 10 — see the constant's docblock for why it is tighter than every limiter
 * beside it, and why both numbers are judgements.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkFactorImportLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "factor-import",
    FACTOR_IMPORT_LIMIT,
    FACTOR_IMPORT_WINDOW,
    userId,
  );
}

/**
 * Setting and retiring a target, keyed by the **user id**. Stage b of
 * AGENTS.md 10 — see the constant's docblock for why it is not keyed by IP, why
 * it is not `checkActivityCommitLimit`, and why the number is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkTargetWriteLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "target-write",
    TARGET_WRITE_LIMIT,
    TARGET_WRITE_WINDOW,
    userId,
  );
}

/**
 * Building and removing a report snapshot, keyed by the **user id**. Stage b of
 * AGENTS.md 10 — see the constant's docblock for why it is not keyed by IP, why
 * it is not `checkTargetWriteLimit`, and why the number is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkReportWriteLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "report-write",
    REPORT_WRITE_LIMIT,
    REPORT_WRITE_WINDOW,
    userId,
  );
}

/** AI narrative generations, keyed by the **user id** — the only limiter here
    guarding a paid third-party call. See the constant's docblock for why it is
    tighter than the report write limiter beside it, and why it is a judgement. */
export async function checkReportNarrativeLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "report-narrative",
    REPORT_NARRATIVE_LIMIT,
    REPORT_NARRATIVE_WINDOW,
    userId,
  );
}

/**
 * The alert-email preference, keyed by the **user id**. Stage b of AGENTS.md 10.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkAlertPreferenceLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "alert-preference",
    ALERT_PREFERENCE_LIMIT,
    ALERT_PREFERENCE_WINDOW,
    userId,
  );
}

/**
 * Requesting and reversing an organisation's deletion, keyed by the **user
 * id** — prompt 73. See the constant's docblock for why it is the tightest
 * window in this file, and why the number is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkOrganizationDeletionLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "organization-deletion",
    ORGANIZATION_DELETION_LIMIT,
    ORGANIZATION_DELETION_WINDOW,
    userId,
  );
}

/**
 * Inviting, cancelling an invitation and removing a member, keyed by the **user
 * id**. Stage b of AGENTS.md 10 — see the constant's docblock for why the three
 * writes share one bucket, and why the number is a judgement.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied.
 */
export async function checkInvitationWriteLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "invitation-write",
    INVITATION_WRITE_LIMIT,
    INVITATION_WRITE_WINDOW,
    userId,
  );
}

/**
 * Accepting or declining an invitation, keyed by the **user id** of the person
 * responding. See the constant's docblock for why it is not the write limiter.
 *
 * @param userId the signed-in account's id, resolved server-side from the
 * session. Never a value the browser supplied, and never the invitation's id —
 * that is a capability in a link, and keying on it would let one probed link
 * exhaust a limit for the person who legitimately holds it.
 */
export async function checkInvitationResponseLimit(
  userId: string,
): Promise<RateLimitOutcome> {
  return consume(
    "invitation-response",
    INVITATION_RESPONSE_LIMIT,
    INVITATION_RESPONSE_WINDOW,
    userId,
  );
}

/**
 * The nightly sweep, keyed on a constant. See the constant's docblock for why it
 * is not keyed by IP, and why the number is a judgement.
 *
 * **Its caller fails open**, which is the opposite of every authenticated
 * action's stance and the same inversion `app/api/newsletter/unsubscribe`
 * documents: refusing the nightly job because Redis is unreachable is worse than
 * letting an idempotent sweep run unmetered during an outage. That decision
 * belongs to the caller, so this function still just reports the outcome.
 */
export async function checkCronSweepLimit(): Promise<RateLimitOutcome> {
  return consume("cron-sweep", CRON_SWEEP_LIMIT, CRON_SWEEP_WINDOW, "sweep");
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

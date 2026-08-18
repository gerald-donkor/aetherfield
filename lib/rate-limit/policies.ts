/**
 * The rate-limit policy table every public write path shares (AGENTS.md 8.2
 * rule 2), as a pure record — **no I/O, no Redis import**. This is the
 * "testable as a pure table" architecture candidate 5 names as the win
 * (`docs/architecture.md`).
 *
 * `lib/rate-limit/index.ts` is the other half: `getRedis()`, `getLimiter()`,
 * `consume()` and the exported `checkLimit()` that walks a policy's `stages`
 * against Redis. Nothing here touches a secret or a network call.
 *
 * **Every window below is a judgement, not a measurement.** There is nothing to
 * measure — neither form has shipped, so there is no traffic to fit against.
 * The reasoning is recorded per policy and in `docs/backend.md`; revisit them
 * against real traffic rather than treating them as fitted.
 *
 * **No identifier here is personal.** Keys are an IP, a user id, or a sha256 of
 * an address or a token — never the address or token itself (AGENTS.md 8.3
 * rule 2 keeps personal data out of every store that is not the table that owns
 * it, and Redis is such a store). Which treatment applies is declared on each
 * policy's `key` field rather than hidden in a function body — the property
 * §8.3 rule 2 depends on is now greppable.
 */

import type { Duration } from "@upstash/ratelimit";

type Stage = { prefix: string; limit: number; window: Duration };

type Policy = {
  /** `"plain"` — the identifier reaches Redis as given (an IP, or a user id,
      neither of which is personal data under §8.3 rule 2).
      `"hash"` — sha256 first; the value itself must never be a Redis key.
      `{ constant }` — the caller supplies nothing and the key is fixed. */
  key: "plain" | "hash" | { constant: string };
  /** One stage for nineteen policies; two for `newsletter-address`, checked in
      order with the first rejection returned without touching the second. */
  stages: readonly [Stage, ...Stage[]];
};

export type RateLimitPolicy =
  | "demo-request"
  | "newsletter-ip"
  | "newsletter-address"
  | "newsletter-token"
  | "newsletter-one-click"
  | "application"
  | "organization-create"
  | "activity-import"
  | "activity-commit"
  | "factor-mapping"
  | "factor-import"
  | "target-write"
  | "report-write"
  | "report-narrative"
  | "alert-preference"
  | "organization-deletion"
  | "invitation-write"
  | "invitation-response"
  | "cron-sweep"
  | "submission-write";

export const POLICIES: Record<RateLimitPolicy, Policy> = {
  /** Five demo requests per IP per hour. Sliding, so the hour boundary is not a
      free refill for a client that times its burst. */
  "demo-request": {
    key: "plain",
    stages: [{ prefix: "demo-request", limit: 5, window: "1 h" }],
  },

  /**
   * Newsletter signup, per IP. The same shape and the same reasoning as the demo
   * request's limiter, and **the same judgement**: nothing here is fitted, because
   * the form has never shipped. Subscribing is a once-ever act for a person, so
   * five in an hour from one address block is far above honest use.
   */
  "newsletter-ip": {
    key: "plain",
    stages: [{ prefix: "newsletter-ip", limit: 5, window: "1 h" }],
  },

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
   * Two stages, checked burst-first so a rejected double-click does not consume
   * one of the three hourly sends. **The address is never a Redis key** —
   * AGENTS.md 8.3 rule 2 keeps personal data out of every store that is not
   * `subscriber` itself, so `checkLimit` hashes it before either stage runs.
   */
  "newsletter-address": {
    key: "hash",
    stages: [
      { prefix: "newsletter-address-burst", limit: 1, window: "60 s" },
      { prefix: "newsletter-address", limit: 3, window: "1 h" },
    ],
  },

  /**
   * The confirm and unsubscribe pages' actions, per IP. Deliberately looser: they
   * write no new row, send no mail to a third party, and the thing they act on is
   * a 32-byte token that guessing does not reach. The limit exists so a broken
   * client cannot hammer the database, not because the path is dangerous.
   */
  "newsletter-token": {
    key: "plain",
    stages: [{ prefix: "newsletter-token", limit: 20, window: "1 h" }],
  },

  /**
   * The one-click `List-Unsubscribe` endpoint, **keyed by the hash of the token
   * rather than the IP** — and that is deliberate, not an oversight.
   *
   * Gmail's and Yahoo's infrastructure POST to this endpoint on behalf of many
   * different people from a small pool of addresses, so an IP key would throttle
   * a mail provider honouring real unsubscribes. A token key bounds abuse of any
   * one subscriber's link, which is the thing that can actually be abused. The
   * token itself is never a Redis key, for the same §8.3 rule 2 reason as the
   * newsletter address.
   */
  "newsletter-one-click": {
    key: "hash",
    stages: [{ prefix: "newsletter-one-click", limit: 10, window: "1 h" }],
  },

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
  application: {
    key: "plain",
    stages: [{ prefix: "application", limit: 5, window: "1 h" }],
  },

  /**
   * Organisation creation, **keyed by user id rather than IP** — build step 8.
   *
   * **The number is a judgement, not a measurement** (AGENTS.md 12 rule 4), on
   * exactly the same footing as every policy above it. Nothing here is fitted:
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
  "organization-create": {
    key: "plain",
    stages: [{ prefix: "organization-create", limit: 10, window: "1 h" }],
  },

  /**
   * Activity-file uploads, **keyed by user id** — build step 9.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
   * as every policy above it. Nothing here is fitted: the flow has never shipped,
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
  "activity-import": {
    key: "plain",
    stages: [{ prefix: "activity-import", limit: 20, window: "1 h" }],
  },

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
  "activity-commit": {
    key: "plain",
    stages: [{ prefix: "activity-commit", limit: 60, window: "1 h" }],
  },

  /**
   * Choosing the emission factor for a `(category, unit)` pair, **keyed by user
   * id** — prompt 65.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
   * as every policy above it: the flow has never shipped, so there is nothing to
   * fit against.
   *
   * **A named policy rather than a reuse of `activity-commit`**, for the
   * reason the target and report policies each record, and here the asymmetry is
   * larger than either. That policy's 60 an hour is sized for "one transaction
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
  "factor-mapping": {
    key: "plain",
    stages: [{ prefix: "factor-mapping", limit: 30, window: "1 h" }],
  },

  /**
   * Bulk factor-set CSV import, **keyed by user id** — prompt 82.
   *
   * **Both numbers are judgements, not measurements** (AGENTS.md 12 rule 4), on
   * the same footing as every policy above: the flow has never shipped, so there
   * is nothing to fit against.
   *
   * **Tighter than `factor-mapping`, and tighter than the activity
   * upload's 20**, because one accepted call writes up to `CSV_MAX_ROWS` factor
   * rows in a single transaction — the largest write one form submission can
   * cause in this codebase. Against that, honest use is small and deliberate: a
   * customer imports a supplied set once, and re-imports after correcting a file.
   * Six an hour leaves room for several correction rounds in a sitting while
   * bounding what one compromised owner session can push into Postgres.
   *
   * **Keyed by user id for the reason the upload policy records**: the path is
   * authenticated and tenant-scoped, so an IP key would throttle a whole office
   * behind one NAT while leaving the abusable surface — one account importing in
   * a loop — unbounded. A user id is the opaque identifier of the session's own
   * subject, so unlike the newsletter's address key it needs no hash.
   */
  "factor-import": {
    key: "plain",
    stages: [{ prefix: "factor-import", limit: 6, window: "1 h" }],
  },

  /**
   * Setting and retiring a target, **keyed by user id** — build step 11.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
   * as every policy above it. Nothing here is fitted: the flow has never shipped,
   * so there is no traffic to fit against, and it is to be revisited against real
   * usage rather than treated as measured.
   *
   * **Keyed by user id for the reason the organisation limiter records.** The path
   * is authenticated and tenant-scoped, so an IP key would throttle a whole office
   * behind one NAT while leaving the abusable surface — one account writing rows
   * in a loop — unbounded. A user id is not personal data.
   *
   * **A named policy rather than a reuse of `activity-commit`**, because
   * the two bound different things: that one bounds work over rows already staged
   * in an import, and its 60 an hour is sized for a person iterating on a column
   * mapping. Setting a target is a deliberate, occasional act — a company files a
   * handful of commitments, not sixty an hour — and sharing a bucket would let a
   * busy import session exhaust the allowance for an unrelated flow. 30 is
   * deliberately loose against honest use: a reporter correcting a mistyped
   * baseline consumes one slot per attempt.
   */
  "target-write": {
    key: "plain",
    stages: [{ prefix: "target-write", limit: 30, window: "1 h" }],
  },

  /**
   * Building and removing a report snapshot, **keyed by user id** — build
   * step 13.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
   * as every policy above it. Nothing here is fitted: the flow has never shipped,
   * so there is no traffic to fit against.
   *
   * **Keyed by user id for the reason the organisation limiter records** — the
   * path is authenticated and tenant-scoped, so an IP key would throttle a whole
   * office behind one NAT while leaving the abusable surface unbounded.
   *
   * **A named policy rather than a reuse of `target-write`**, because
   * the two bound different work. Building a report reads every stored emission
   * the organisation holds, aggregates it and writes a JSON snapshot; that is a
   * materially heavier read than writing a target row, and sharing a bucket would
   * let an afternoon of target edits exhaust the allowance for a disclosure a
   * reporter is trying to file. 20 an hour is deliberately loose against honest
   * use: a reporter iterating on a title, or rebuilding after committing a late
   * import, consumes one slot per attempt.
   */
  "report-write": {
    key: "plain",
    stages: [{ prefix: "report-write", limit: 20, window: "1 h" }],
  },

  /**
   * AI narrative generations, **keyed by user id** — build step 13, and the only
   * policy in this file guarding a **paid third-party call**.
   *
   * **A judgement, not a measurement**, like every policy above it — but unlike
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
  "report-narrative": {
    key: "plain",
    stages: [{ prefix: "report-narrative", limit: 10, window: "1 h" }],
  },

  /**
   * The `/account` alert-email preference, **keyed by user id** — build step 14.
   *
   * **A judgement, not a measurement**, like every policy above it. The flow has
   * never shipped, so there is nothing to fit against.
   *
   * **A named policy rather than a reuse**, for the reason the target and report
   * policies each record: this bounds a one-row upsert a person toggles, and
   * sharing a bucket with a heavier flow would let an afternoon's work exhaust the
   * allowance for turning off an email. 30 an hour is deliberately loose — a
   * person flipping a switch back and forth while deciding consumes one slot per
   * flip, and that is honest use.
   */
  "alert-preference": {
    key: "plain",
    stages: [{ prefix: "alert-preference", limit: 30, window: "1 h" }],
  },

  /**
   * Requesting and reversing an organisation's deletion, **keyed by user id** —
   * prompt 73.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), like every policy
   * above it: the flow has never shipped, so there is nothing to fit against.
   *
   * **Deliberately tight, and the asymmetry with every policy above is the
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
  "organization-deletion": {
    key: "plain",
    stages: [{ prefix: "organization-deletion", limit: 10, window: "1 h" }],
  },

  /**
   * Inviting, cancelling an invitation and removing a member, **keyed by user
   * id** — prompt 63, closing what build step 8 deferred.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), on the same footing
   * as every policy above it: the flow has never shipped, so there is nothing to
   * fit against.
   *
   * **A named policy rather than a reuse**, for the reason each one above records
   * — but this one has a cost the others do not: an invite **sends mail to an
   * address the caller typed**, and that is the abusable surface. Nobody but an
   * owner of an existing organisation can reach it, and the address goes into a
   * row we own, so this is not an open relay; 20 an hour still bounds what one
   * compromised owner account can put into other people's inboxes, while leaving
   * an owner onboarding a team comfortable room — the three writes share the
   * bucket, and inviting a ten-person department costs ten of the twenty.
   */
  "invitation-write": {
    key: "plain",
    stages: [{ prefix: "invitation-write", limit: 20, window: "1 h" }],
  },

  /**
   * Accepting and declining an invitation, **keyed by user id** — prompt 63.
   *
   * **A judgement, like every policy above it.** Separate from the write policy
   * because the two are reached by different people: the write policy bounds an
   * owner, this bounds the person who was invited, and an invitee throttled by an
   * owner's morning of invitations would be locked out of the one action they came
   * to perform. It sends no mail and writes one `member` row, so it is deliberately
   * loose — 30 an hour is far past honest use, where the whole flow is one click,
   * and it exists to bound retries against a link that is being probed rather than
   * to shape traffic.
   */
  "invitation-response": {
    key: "plain",
    stages: [{ prefix: "invitation-response", limit: 30, window: "1 h" }],
  },

  /**
   * The nightly sweeps, **keyed on a constant rather than an identifier** — build
   * step 14, and shared since.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), like every policy
   * above it. There is nothing to fit against: each endpoint has one legitimate
   * caller and it calls once a day.
   *
   * **Three jobs share this one bucket, on purpose** — `/api/cron/recalculate`,
   * `/api/cron/purge-organizations` and `/api/cron/purge-submissions`, and two of
   * the three say so at their own call site. This docblock used to claim "there
   * is exactly one job"; the repository disagreed, so the repository is the fact
   * (12 rule 8).
   *
   * **Not keyed by IP**, and the sharing makes that conclusion stronger rather
   * than weaker: Vercel's scheduler calls from its own infrastructure, so an IP
   * key would bound nothing an id key does not, and a constant key is precisely
   * what makes one bucket cover all three. What is bounded is the *endpoint
   * class*, which is the thing that can be abused: a leaked `CRON_SECRET` driving
   * repeated full-tenant sweeps.
   *
   * **Six an hour across three daily jobs is two runs per job per hour** —
   * arithmetic on the two constants below, not a new measurement — and that is
   * still deliberately loose. The Hobby plan's scheduling precision is per-hour,
   * ±59 minutes (read from
   * `https://vercel.com/docs/cron-jobs/usage-and-pricing`, not recalled), a
   * deploy can retrigger a job, and **every one of the three sweeps is
   * idempotent**: the recalculation replaces a bounded figure set and raises
   * alerts through `onConflictDoNothing` against a partial unique index, and each
   * purge selects by a due-date predicate that a completed run no longer
   * satisfies. So a second run in the same hour costs work and changes nothing,
   * and refusing a legitimate one would cost more than allowing it. This policy
   * is not traffic shaping.
   *
   * **Takes no caller identifier** — the key is the constant `"sweep"`, enforced
   * at the `checkLimit` call site by an overloaded signature (§4c of prompt 126)
   * rather than by convention.
   */
  "cron-sweep": {
    key: { constant: "sweep" },
    stages: [{ prefix: "cron-sweep", limit: 6, window: "1 h" }],
  },

  /**
   * The submissions workspace's two admin writes — changing a staff role and
   * removing a lead, a subscriber or an application — **keyed by user id**,
   * prompt 97.
   *
   * **A judgement, not a measurement** (AGENTS.md 12 rule 4), like every policy
   * above it, and with less to fit against than most: build step 7's view has
   * never been in front of a real admin, so there is no traffic at all.
   *
   * **A named policy rather than a reuse**, for the reason each one above
   * records, plus one this file has no other instance of: **the callers are
   * Aetherfield's own admins**, a different population from every tenant-side
   * policy here. Sharing a bucket with a tenant flow would let a customer's
   * afternoon of imports throttle the person removing that customer's data on
   * request.
   *
   * **Both actions share one bucket.** They are reached by the same person from
   * the same page, in the same sitting, and neither has an honest high-frequency
   * use.
   *
   * **Thirty an hour, and the tension is stated rather than smoothed over.** It
   * sits at `alert-preference`'s looseness rather than
   * `organization-deletion`'s ten, because unlike deleting an organisation
   * there *is* honest repetition here: clearing a morning's spam leads is one
   * call per row. Against that, `removeSubmission`'s application branch deletes a
   * CV blob per call and that erasure does not come back, so the number also has
   * to bound what one compromised admin session can destroy — thirty is the
   * balance struck, and if a real spam wave ever exceeds it the right answer is a
   * bulk action with its own limit, not a looser window.
   */
  "submission-write": {
    key: "plain",
    stages: [{ prefix: "submission-write", limit: 30, window: "1 h" }],
  },
};

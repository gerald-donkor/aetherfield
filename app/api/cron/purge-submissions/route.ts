import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { sweep } from "./sweep";
import { spendLimit } from "../../../../lib/rate-limit/spend";

/**
 * The nightly phase-one retention sweep — prompt 81.
 *
 * **A copy of `app/api/cron/purge-organizations/route.ts`'s shape,
 * deliberately, and not an abstraction over it.** Each of these handlers is
 * eleven lines of gate; a shared wrapper would put the `CRON_SECRET` check one
 * indirection away from the endpoint it protects, and this is the endpoint that
 * *erases people's personal data* — names, work addresses, employers, free-text
 * messages and CV files. The reasoning below is restated where it is
 * load-bearing rather than cross-referenced, for the same reason.
 *
 * **A Route Handler here is correct and is not an AGENTS.md 6.2 violation.**
 * 6.2 names cron endpoints among the external callers handlers exist for, and
 * the caller is Vercel's scheduler — not this application's own UI, which is
 * what Server Actions are the only mutation path for. Nothing in this file is
 * business logic: it authenticates, calls the sweep, and answers.
 *
 * **`GET` only** — Vercel makes an HTTP `GET` to the production deployment URL
 * at the configured path. No other method is exported, so anything else is a
 * framework 405 before this file runs.
 *
 * **The user agent and `x-vercel-cron-schedule` are not authentication.** Both
 * are attacker-supplied on any direct request. The bearer check below is the
 * only thing that authorises this endpoint, and nothing may be added that gates
 * on a header the caller controls.
 *
 * **No BotID**: the caller is not a browser at all, and AGENTS.md 7.3 records
 * that a path missing from `instrumentation-client.ts`'s list makes the server
 * call **fail** rather than pass — so adding it here would break the job, not
 * harden it.
 *
 * **`proxy.ts` does not match this path and must not be widened to.** Its
 * matcher is enumerated deliberately (AGENTS.md 8.1) so the nine prerendered
 * marketing routes do not pay for auth per request; matching all and excluding
 * would trade that away, and an optimistic cookie redirect is not enforcement
 * in any case (AGENTS.md 7.3, 11.2 rule 1). The bearer check is the whole gate.
 *
 * **Scheduled at 04:00** (`vercel.json`), an hour clear of the 03:00
 * organisation purge, which is itself an hour clear of the 02:00 recalculation,
 * so no two sweeps overlap. That separation is a judgement derived from a
 * constraint — each job's `maxDuration` is 300s — not a measurement
 * (AGENTS.md 12 rule 4). On the Hobby plan the scheduler's precision is
 * per-hour (±59 min), which is the reason the jobs are an hour apart rather
 * than a few minutes.
 */

export const dynamic = "force-dynamic";

/** `401` with no body and no detail, for every rejected caller. A
    distinguishable failure would say whether a presented secret was the right
    length, the right shape, or simply absent. */
function unauthorized(): NextResponse {
  // A fresh instance per call: a `Response` is not safe to reuse across
  // requests, even one with no body.
  return new NextResponse(null, { status: 401 });
}

/**
 * Constant-time bearer comparison.
 *
 * `timingSafeEqual` throws on unequal lengths, so the length is checked first
 * and a mismatch answers exactly as a wrong value does. **An unset
 * `CRON_SECRET` fails closed**, and on this endpoint that is not a nicety: an
 * open path here is an unauthenticated button that erases every lead,
 * subscriber and job application past its window, plus the CV files behind
 * them. There is no restore.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const presented = request.headers.get("authorization");
  if (!presented) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(presented);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function GET(request: NextRequest) {
  // -- a. BotID: deliberately absent. See the module docblock. -------------

  // -- b. Authenticate the caller ------------------------------------------
  if (!authorized(request)) return unauthorized();

  /* -- b2. Rate limit, and here it **fails closed** -------------------------
     The same stance the organisation purge takes and the opposite of the
     recalculation sweep's, and the asymmetry is the point. That one is
     idempotent and refusing it during a Redis outage costs a night of stale
     figures; this one deletes personal data irreversibly, so a limiter that
     cannot be consulted is a reason to wait a night rather than to proceed
     unmetered. Nothing is lost by deferring: every row past its window is past
     it again tomorrow, and the sweep is due again in 24 hours.

     It shares the `"cron-sweep"` policy's bucket deliberately — the three jobs are
     one scheduler making one call each per night, comfortably inside that
     limiter's six per hour, and a leaked `CRON_SECRET` driving repeated sweeps
     is the single thing all three limits exist to bound. */
  const spend = await spendLimit("cron-sweep");
  if (spend.status === "throttled") {
    return NextResponse.json({ skipped: "rate-limited" }, { status: 429 });
  }
  if (spend.status === "unavailable") {
    return NextResponse.json({ skipped: "limiter-unavailable" }, { status: 503 });
  }

  // -- c-f. The sweep ------------------------------------------------------
  const summary = await sweep();

  /* Counts only. **No id, no name, no address, no employer and no blob
     pathname** (AGENTS.md 8.3 rule 2) — this body lands in Vercel's function
     logs, which is exactly the kind of place personal data must never reach. */
  return NextResponse.json(summary);
}

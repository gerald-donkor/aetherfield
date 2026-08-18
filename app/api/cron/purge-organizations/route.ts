import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { sweep } from "./sweep";
import { checkLimit } from "../../../../lib/rate-limit";

/**
 * The nightly organisation-erasure sweep — prompt 73.
 *
 * **A copy of `app/api/cron/recalculate/route.ts`'s shape, deliberately, and
 * not an abstraction over it.** The two handlers are eleven lines of gate each;
 * a shared wrapper would put the `CRON_SECRET` check one indirection away from
 * the endpoint it protects, and this is the endpoint that *deletes tenant data*.
 * The reasoning below is that file's, restated where it is load-bearing rather
 * than cross-referenced.
 *
 * **A Route Handler here is correct and is not an AGENTS.md 6.2 violation.**
 * 6.2 names cron endpoints among the external callers handlers exist for, and
 * the caller is Vercel's scheduler. Nothing in this file is business logic: it
 * authenticates, calls the sweep, and answers.
 *
 * **`GET` only** — Vercel makes an HTTP `GET` to the production deployment URL
 * at the configured path.
 *
 * **The user agent and `x-vercel-cron-schedule` are not authentication.** Both
 * are attacker-supplied on any direct request. The bearer check below is the
 * only thing that authorises this endpoint, and nothing may be added that gates
 * on a header the caller controls.
 *
 * **No BotID**: the caller is not a browser at all, and AGENTS.md 7.3 records
 * that a path missing from `instrumentation-client.ts`'s list makes the server
 * call **fail** rather than pass.
 *
 * **`proxy.ts` does not match this path and must not be widened to** — its
 * matcher is enumerated deliberately (AGENTS.md 8.1).
 *
 * **Scheduled an hour after the recalculation sweep** (`vercel.json`), so a
 * purge never races a recalculation of the same tenant. That separation is a
 * judgement derived from a constraint — the 02:00 sweep's `maxDuration` is
 * 300s — not a measurement (AGENTS.md 12 rule 4).
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
 * open path here erases customers' workspaces.
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
     The opposite stance to the recalculation sweep's, and the asymmetry is the
     point. That one is idempotent and refusing it during a Redis outage costs
     a night of stale figures; this one deletes tenant data irreversibly, so a
     limiter that cannot be consulted is a reason to wait a night rather than to
     proceed unmetered. Nothing is lost by deferring: every due row stays
     `pending` and is due again tomorrow.

     It shares the `"cron-sweep"` policy's bucket deliberately — the two jobs are
     one scheduler making one call each per night, and a leaked `CRON_SECRET`
     driving repeated sweeps is the single thing both limits exist to bound. */
  try {
    const limit = await checkLimit("cron-sweep");
    if (!limit.allowed) {
      return NextResponse.json({ skipped: "rate-limited" }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ skipped: "limiter-unavailable" }, { status: 503 });
  }

  // -- c-f. The sweep ------------------------------------------------------
  const summary = await sweep();

  /* Counts only. **No tenant identifier, no organisation name, no slug and no
     blob pathname** (AGENTS.md 8.3 rule 2, extended to commercial data by 5.3)
     — this body lands in Vercel's function logs. */
  return NextResponse.json(summary);
}

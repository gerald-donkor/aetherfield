import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { sweep } from "./sweep";
import { checkLimit } from "../../../../lib/rate-limit";

/**
 * The nightly recalculation and alert sweep — build step 14.
 *
 * **A Route Handler here is correct and is not an AGENTS.md 6.2 violation.**
 * 6.2 names "cron endpoints" among the external callers handlers exist for, and
 * the caller is Vercel's scheduler, not this application. Nothing in this file
 * is business logic: it authenticates, calls the sweep, and answers.
 *
 * **`GET` only.** Vercel makes an HTTP `GET` to the production deployment URL at
 * the configured path — read from `https://vercel.com/docs/cron-jobs.md`, not
 * recalled — so there is no other method to export.
 *
 * **The user agent and `x-vercel-cron-schedule` are not authentication.** Both
 * are attacker-supplied on any direct request. The bearer check below is the
 * only thing that authorises this endpoint, and nothing may be added that gates
 * on a header the caller controls.
 *
 * **No BotID, and for a stronger reason than the authenticated-path one
 * `stageImport` records**: the caller is not a browser at all,
 * `instrumentation-client.ts` protects page paths rather than API routes, and
 * AGENTS.md 7.3 records that a path missing from that list makes the server call
 * **fail** rather than pass.
 *
 * **`proxy.ts` does not match this path and must not be widened to** — its
 * matcher is enumerated deliberately (AGENTS.md 8.1), and an auth redirect in
 * front of the cron path would break the scheduler.
 */

export const dynamic = "force-dynamic";

/** `401` with no body and no detail, for every rejected caller. A distinguishable
    failure would say whether a presented secret was the right length, the right
    shape, or simply absent. */
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
 * `CRON_SECRET` fails closed** — an endpoint that sweeps every tenant must never
 * be open because a variable was forgotten.
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

  /* -- b2. Rate limit, and it **fails open** -------------------------------
     The inverted stance `app/api/newsletter/unsubscribe/route.ts` documents,
     for the same class of reason: refusing the nightly job because Redis is
     unreachable is worse than letting an idempotent sweep run unmetered during
     an outage. It exists so a leaked secret cannot drive repeated full-tenant
     sweeps, not to shape normal traffic. */
  try {
    const limit = await checkLimit("cron-sweep");
    if (!limit.allowed) {
      return NextResponse.json({ skipped: "rate-limited" }, { status: 429 });
    }
  } catch {
    // Deliberately continues.
  }

  // -- c–f. The sweep ------------------------------------------------------
  const summary = await sweep();

  /* Counts only. **No tenant identifier, no organisation name, no address and
     no figure** (AGENTS.md 8.3 rule 2, extended to commercial data by 5.3) —
     this body lands in Vercel's function logs. */
  return NextResponse.json(summary);
}

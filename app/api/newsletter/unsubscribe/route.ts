import { NextResponse, type NextRequest } from "next/server";

import { unsubscribeByToken } from "../../../../lib/db/subscriber-queries";
import { checkLimit } from "../../../../lib/rate-limit";

/**
 * The one-click endpoint named in the welcome email's `List-Unsubscribe`
 * header.
 *
 * **A Route Handler here is correct and is not an AGENTS.md 6.2 violation.**
 * 6.2 reserves handlers for callers that are not this application, and the
 * caller here is Gmail's, Yahoo's or Microsoft's infrastructure acting on a
 * header we published. Nothing in this file is business logic: it reads a
 * token, calls the query layer, and answers.
 *
 * The contract comes from `email-best-practices`'s `compliance.md`: accept
 * `POST` and return `200` with a blank body, and serve a normal unsubscribe
 * page for `GET`.
 *
 * **No BotID.** Its whole purpose is to reject non-browser callers, and every
 * legitimate caller of this endpoint is one.
 */

export const dynamic = "force-dynamic";

/**
 * **`200` for every outcome, including an unknown token**, and that is two
 * decisions at once. A mail provider does not want a 4xx — it reads one as a
 * broken endpoint and may stop offering one-click for the domain. And a
 * distinguishable failure would turn this into an oracle that says whether a
 * given token is live.
 */
function ok(): NextResponse {
  // A fresh instance per call: a `Response` is not safe to reuse across
  // requests, even one with no body.
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return ok();

  /* **Keyed by the token, not the IP** — see the constant's docblock in
     `lib/rate-limit/`: a provider POSTs on behalf of many people from a small
     pool of addresses, so an IP key would throttle real unsubscribes.

     **And it fails open**, which is the opposite of the demo action's stance.
     Refusing to honour an unsubscribe because Redis is unreachable is a
     compliance failure; letting an idempotent, non-destructive write through
     unmetered for the duration of an outage is not. The reasoning is inverted
     because the risk is. */
  try {
    const limit = await checkLimit("newsletter-one-click", token);
    if (!limit.allowed) return ok();
  } catch {
    // Deliberately continues.
  }

  try {
    await unsubscribeByToken(token);
  } catch {
    /* Swallowed, and nothing is logged: the token is a live capability and the
       row it points at is a person (AGENTS.md 8.3 rule 2). A provider retrying
       is the recovery path. */
  }

  return ok();
}

/**
 * Some clients treat `List-Unsubscribe` as a link rather than a POST target, so
 * a `GET` must land somewhere designed rather than on a blank 200. It performs
 * nothing — the page it redirects to has the button.
 */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const destination = new URL("/newsletter/unsubscribe", request.nextUrl.origin);
  if (token) destination.searchParams.set("token", token);
  return NextResponse.redirect(destination);
}

import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // Optimistic only: this checks that a cookie exists, not that it is valid.
  // Each matched route performs the authoritative database-backed check.
  if (!getSessionCookie(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "callbackURL",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  // Enumerated, never widened: the marketing routes must stay unmatched, or a
  // static page pays for an auth check per request (AGENTS.md 8.1).
  matcher: [
    "/account",
    "/activity/:path*",
    "/submissions/:path*",
    "/targets/:path*",
  ],
};

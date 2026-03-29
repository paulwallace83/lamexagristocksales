import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF origin validation for all state-changing API routes.
 *
 * For non-GET requests to /api/*, we verify that the Origin header (when present)
 * matches the server's own host. Browsers always send Origin on cross-origin
 * POST/PUT/PATCH/DELETE requests, so a mismatch indicates a CSRF attempt.
 *
 * Requests with no Origin header (e.g. server-to-server, curl) are allowed through
 * since they can't carry session cookies set with SameSite=Lax.
 */
export function middleware(req: NextRequest) {
  const { pathname, method } = req.nextUrl;

  // Only apply to API routes with state-changing methods
  if (
    pathname.startsWith("/api/") &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS"
  ) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");

    if (origin && host) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return new NextResponse(JSON.stringify({ error: "Invalid origin" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (originHost !== host) {
        console.warn(`[csrf] Origin mismatch on ${pathname}: origin=${origin} host=${host}`);
        return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

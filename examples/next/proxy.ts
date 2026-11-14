import { type NextRequest, NextResponse } from "next/server";

/**
 * The Content Security Policy, with a fresh nonce for Next.js's own scripts
 * on every request, as Next.js documents. The player makes no requests and
 * loads nothing from elsewhere, so nothing is allowed from anywhere but this
 * origin.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self'",
    "style-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Pages only, not Next.js's own static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

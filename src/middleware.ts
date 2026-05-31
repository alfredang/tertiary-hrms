import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDevAuthSkipped } from "@/lib/dev-auth";

// Middleware only checks for the *presence* of a session cookie, not its
// validity. Validating the JWT in middleware required a second NextAuth
// instance whose derived encryption key drifted from the main one's after
// session refreshes — causing valid sessions to look invalid here and
// bouncing users to /login mid-action. Real auth + role checks happen in
// the layout and pages, which use the full NextAuth config from auth.ts.

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function hasSessionCookie(req: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    if (req.cookies.get(name)) return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  if (isDevAuthSkipped()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  const publicRoutes = [
    "/login",
    "/register",
    "/api/auth",
    "/api/uploadthing",
    "/api/public",
    "/api/webhooks",
    "/privacy-policy",
    "/myinfo",
    "/api/myinfo/auth",
    "/api/myinfo/callback",
  ];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  const isLoggedIn = hasSessionCookie(req);

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

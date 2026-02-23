import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  // Development mode: Skip authentication checks if SKIP_AUTH is enabled
  if (process.env.SKIP_AUTH === "true") {
    return NextResponse.next();
  }

  // Determine if secure cookies are used based on AUTH_URL protocol.
  // NextAuth sets __Secure- prefixed cookies when AUTH_URL is https://,
  // but getToken() defaults to looking for unprefixed cookies — causing a
  // mismatch behind reverse proxies like Coolify/Traefik.
  const secureCookie =
    process.env.AUTH_URL?.startsWith("https://") ??
    process.env.NEXTAUTH_URL?.startsWith("https://") ??
    false;
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
  const isLoggedIn = !!token;
  const { pathname } = req.nextUrl;

  // Public routes
  const publicRoutes = ["/login", "/register", "/api/auth"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Redirect to login if not authenticated and trying to access protected route
  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Redirect users without employee records to pending-setup page
  if (
    isLoggedIn &&
    (token as any)?.needsSetup === true &&
    !pathname.startsWith("/pending-setup") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/login")
  ) {
    return NextResponse.redirect(new URL("/pending-setup", req.nextUrl));
  }

  // Redirect to dashboard if authenticated and trying to access auth pages
  if (isLoggedIn && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Admin-only routes
  const adminRoutes = ["/admin"];
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  if (isAdminRoute && token?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // HR management routes (admin, HR, manager only)
  const hrManagementRoutes = ["/payroll/generate", "/settings"];
  const isHRRoute = hrManagementRoutes.some((route) => pathname.startsWith(route));
  const hrAllowedRoles = ["ADMIN", "HR", "MANAGER"];

  if (isHRRoute && !hrAllowedRoles.includes(token?.role as string)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

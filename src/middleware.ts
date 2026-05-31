import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const VALID_ROLES = ["ADMIN", "HR", "MANAGER", "STAFF", "INTERN", "ACCOUNTANT"] as const;

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (isDevAuthSkipped()) return NextResponse.next();

  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const { pathname } = req.nextUrl;

  const role = session?.user?.role;
  const tokenRole =
    typeof role === "string" && (VALID_ROLES as readonly string[]).includes(role) ? role : null;
  const needsSetup = (session?.user as { needsSetup?: boolean } | undefined)?.needsSetup === true;

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

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (
    isLoggedIn &&
    needsSetup &&
    !pathname.startsWith("/pending-setup") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/login")
  ) {
    return NextResponse.redirect(new URL("/pending-setup", req.nextUrl));
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  const hrManagementRoutes = ["/employees", "/payroll/generate", "/settings"];
  const isHRRoute = hrManagementRoutes.some((route) => pathname.startsWith(route));
  const hrAllowedRoles = ["ADMIN", "HR", "MANAGER"];

  if (isHRRoute && (!tokenRole || !hrAllowedRoles.includes(tokenRole))) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

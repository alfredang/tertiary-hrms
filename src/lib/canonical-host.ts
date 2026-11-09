import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Page visits on a host other than AUTH_URL's (e.g. the hrms.tertiaryinfo.tech alias) go to the
 * canonical host. NextAuth sends Google back to AUTH_URL, so a sign-in started on the alias left
 * its PKCE cookie behind and failed with "InvalidCheck: pkceCodeVerifier". API routes are never
 * redirected (the native apps call /api/* on either host with a Bearer/session header).
 */
export function canonicalRedirect(req: NextRequest, authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || ""): NextResponse | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  if (req.nextUrl.pathname.startsWith("/api/")) return null;
  let canonical: URL;
  try {
    canonical = new URL(authUrl);
  } catch {
    return null;
  }
  if (canonical.protocol !== "https:") return null; // local dev / http deploys: leave alone
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  // Only public hostnames: never the container's internal host, localhost or an IP.
  if (!host || host.includes(":") || /^\d+(\.\d+){3}$/.test(host) || host === "localhost") return null;
  if (host === canonical.host.toLowerCase()) return null;
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, canonical.origin);
  return NextResponse.redirect(target, 308);
}

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import {
  GOOGLE_CONNECT_SCOPES,
  GOOGLE_CONNECT_STATE_COOKIE,
  loadGoogleConnectConfig,
} from "@/lib/google-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

/**
 * Kicks off the in-app Google consent flow that renews the company refresh
 * token (Gmail + Drive). The admin is sent to Google, signs in as the
 * workspace account, and lands back on /api/settings/google-oauth/callback,
 * which stores the new token in CompanyCredential.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await loadGoogleConnectConfig(req);
  if (!cfg) {
    return NextResponse.redirect(
      `${new URL(req.url).origin}/settings/credentials?google_error=${encodeURIComponent(
        "Client ID and Client Secret must be saved first",
      )}`,
    );
  }

  const state = randomBytes(16).toString("hex");
  const oauth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const consentUrl = oauth.generateAuthUrl({
    access_type: "offline",
    // Force the consent screen so Google always returns a refresh token,
    // even when the account granted these scopes before.
    prompt: "consent",
    scope: GOOGLE_CONNECT_SCOPES,
    state,
    login_hint: cfg.loginHint,
  });

  const res = NextResponse.redirect(consentUrl);
  res.cookies.set(GOOGLE_CONNECT_STATE_COOKIE, state, {
    httpOnly: true,
    secure: cfg.origin.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

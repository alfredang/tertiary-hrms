import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * In-app Google OAuth connect flow for the company workspace account
 * (Settings → Credentials → Google OAuth → "Sign in with Google").
 *
 * Re-mints the refresh token that powers Gmail sending AND Drive uploads, so
 * the consent must always request both scopes. `openid email` is included so
 * the callback can record which account was actually connected.
 */

export const GOOGLE_CONNECT_STATE_COOKIE = "google_connect_state";

export const GOOGLE_CONNECT_SCOPES = [
  "openid",
  "email",
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/drive",
];

/** Strip the noise a pasted credential commonly carries — quotes and whitespace. */
function sanitize(raw: string | undefined | null): string | undefined {
  const cleaned = raw?.trim().replace(/^["']+|["']+$/g, "");
  return cleaned || undefined;
}

/**
 * Canonical public origin of the app. Behind Coolify/Traefik the request URL
 * is the internal one, so AUTH_URL/NEXTAUTH_URL win when set.
 */
export function resolveOrigin(req: NextRequest): string {
  const envUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  try {
    if (envUrl) return new URL(envUrl).origin;
  } catch {
    // fall through to the request origin
  }
  return new URL(req.url).origin;
}

export interface GoogleConnectConfig {
  clientId: string;
  clientSecret: string;
  loginHint: string | undefined;
  origin: string;
  redirectUri: string;
}

export async function loadGoogleConnectConfig(
  req: NextRequest,
): Promise<GoogleConnectConfig | null> {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_EMAIL_USER"] } },
  });
  const creds = Object.fromEntries(rows.map((r) => [r.keyName, r.keyValue]));
  const clientId = sanitize(creds.GMAIL_CLIENT_ID) ?? sanitize(process.env.GMAIL_CLIENT_ID);
  const clientSecret =
    sanitize(creds.GMAIL_CLIENT_SECRET) ?? sanitize(process.env.GMAIL_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;

  const origin = resolveOrigin(req);
  return {
    clientId,
    clientSecret,
    loginHint: sanitize(creds.GMAIL_EMAIL_USER) ?? sanitize(process.env.GMAIL_EMAIL_USER),
    origin,
    redirectUri: `${origin}/api/settings/google-oauth/callback`,
  };
}

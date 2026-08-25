import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import {
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

async function upsertCredential(keyName: string, keyValue: string) {
  await prisma.companyCredential.upsert({
    where: { keyName },
    update: { keyValue },
    create: { keyName, keyValue },
  });
}

/**
 * Lands the admin back from Google's consent screen, exchanges the code for
 * tokens, and stores the new refresh token (and the connected account email)
 * in CompanyCredential — the same credentials Gmail sending and every Drive
 * upload read.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (query: string) => {
    const res = NextResponse.redirect(`${origin}/settings/credentials?${query}`);
    res.cookies.set(GOOGLE_CONNECT_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  };
  const fail = (message: string) => done(`google_error=${encodeURIComponent(message)}`);

  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const googleError = url.searchParams.get("error");
  if (googleError) return fail(`Google returned: ${googleError}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get(GOOGLE_CONNECT_STATE_COOKIE)?.value;
  if (!code) return fail("No authorisation code returned by Google");
  if (!state || !cookieState || state !== cookieState) {
    return fail("State mismatch — start the sign-in again from Settings → Credentials");
  }

  const cfg = await loadGoogleConnectConfig(req);
  if (!cfg) return fail("Client ID and Client Secret must be saved first");

  try {
    const oauth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
    const { tokens } = await oauth.getToken(code);

    if (!tokens.refresh_token) {
      return fail(
        "Google did not return a refresh token — retry the sign-in (the consent screen must be shown)",
      );
    }

    let email: string | undefined;
    if (tokens.id_token) {
      try {
        const ticket = await oauth.verifyIdToken({
          idToken: tokens.id_token,
          audience: cfg.clientId,
        });
        email = ticket.getPayload()?.email ?? undefined;
      } catch {
        // Non-fatal: the refresh token is still valid without the email.
      }
    }

    await upsertCredential("GMAIL_REFRESH_TOKEN", tokens.refresh_token);
    // The token can only act as the account that signed in, so keep the
    // sender address in step with it.
    if (email) await upsertCredential("GMAIL_EMAIL_USER", email);

    return done(`google=connected${email ? `&email=${encodeURIComponent(email)}` : ""}`);
  } catch (err) {
    console.error("Google connect token exchange failed:", err);
    const message = err instanceof Error ? err.message : "Token exchange failed";
    return fail(message);
  }
}

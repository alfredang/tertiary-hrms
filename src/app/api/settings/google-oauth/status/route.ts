import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

/**
 * Health check for the company Google refresh token.
 *
 * Unlike /api/settings/test-gmail this sends nothing — it only asks Google for
 * a fresh access token, which is the exact call that fails with `invalid_grant`
 * once the refresh token expires or is revoked. That failure is what surfaces
 * to employees as "Gmail refresh token is expired" on the login screen, so
 * checking it here lets an admin see the problem before anyone is locked out.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.companyCredential.findMany({
    where: {
      keyName: {
        in: ["GMAIL_EMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      },
    },
  });
  const creds: Record<string, string> = {};
  for (const r of rows) creds[r.keyName] = r.keyValue;

  const clientId = creds.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "";
  const clientSecret = creds.GMAIL_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "";
  const refreshToken = creds.GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN || "";
  const emailUser = creds.GMAIL_EMAIL_USER || process.env.GMAIL_EMAIL_USER || "";

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      status: "unconfigured",
      email: emailUser || null,
      message: "Client ID and Client Secret are not set yet.",
    });
  }
  if (!refreshToken) {
    return NextResponse.json({
      status: "unconfigured",
      email: emailUser || null,
      message: "No refresh token stored — sign in with Google to create one.",
    });
  }

  const oauth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground",
  );
  oauth.setCredentials({ refresh_token: refreshToken });

  try {
    const { token } = await oauth.getAccessToken();
    if (!token) {
      return NextResponse.json({
        status: "expired",
        email: emailUser || null,
        message: "Google returned an empty access token — the refresh token is no longer usable.",
      });
    }

    // Confirm the Drive scope is on the token too. The same credential powers
    // CPF/payslip archiving, and a Gmail-only consent silently breaks uploads.
    let hasDrive = false;
    try {
      const info = await oauth.getTokenInfo(token);
      hasDrive = (info.scopes ?? []).some((s) => s.includes("/auth/drive"));
    } catch {
      // Scope introspection is best-effort — the token itself is already proven good.
    }

    return NextResponse.json({
      status: "ok",
      email: emailUser || null,
      hasDrive,
      message: hasDrive
        ? "Refresh token is valid for Gmail and Drive."
        : "Refresh token is valid, but the Drive scope is missing — renew to restore file uploads.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const expired = message.includes("invalid_grant") || message.includes("Token has been expired");
    return NextResponse.json({
      status: expired ? "expired" : "error",
      email: emailUser || null,
      message: expired
        ? "Refresh token is expired or revoked — employees cannot receive one-time codes until it is renewed."
        : message,
    });
  }
}

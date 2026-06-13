import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import { isDevAuthSkipped } from "@/lib/dev-auth";

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to } = await req.json();
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Provide a valid 'to' email address" }, { status: 400 });
  }

  const credRows = await prisma.companyCredential.findMany({
    where: {
      keyName: { in: ["GMAIL_EMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] },
    },
  });
  const creds: Record<string, string> = {};
  for (const r of credRows) creds[r.keyName] = r.keyValue;

  const GMAIL_EMAIL_USER    = creds["GMAIL_EMAIL_USER"]    || process.env.GMAIL_EMAIL_USER    || "";
  const GMAIL_CLIENT_ID     = creds["GMAIL_CLIENT_ID"]     || process.env.GMAIL_CLIENT_ID     || "";
  const GMAIL_CLIENT_SECRET = creds["GMAIL_CLIENT_SECRET"] || process.env.GMAIL_CLIENT_SECRET || "";
  const GMAIL_REFRESH_TOKEN = creds["GMAIL_REFRESH_TOKEN"] || process.env.GMAIL_REFRESH_TOKEN || "";

  if (!GMAIL_EMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    return NextResponse.json({
      ok: false,
      step: "credentials",
      error: "Gmail credentials not configured. Add GMAIL_* env vars in Coolify or go to Settings → Credentials.",
    });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    const tokenRes = await oauth2Client.getAccessToken();
    if (!tokenRes.token) {
      return NextResponse.json({ ok: false, step: "token", error: "Got empty access token — refresh token may be revoked or expired." });
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const branding = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
    const companyName = branding?.name || "HR Portal";

    const rawEmail = [
      `From: ${companyName} <${GMAIL_EMAIL_USER}>`,
      `To: ${to}`,
      `Subject: Gmail test — ${new Date().toISOString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "This is a test email sent from the HRMS Gmail credentials test.",
    ].join("\r\n");

    const encoded = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

    return NextResponse.json({ ok: true, message: `Test email sent to ${to} from ${GMAIL_EMAIL_USER}` });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    const isExpired = message.includes("invalid_grant") || message.includes("Token has been expired");
    return NextResponse.json({
      ok: false,
      step: "send",
      error: message,
      hint: isExpired
        ? "Refresh token is expired or revoked. Go to https://developers.google.com/oauthplayground, re-authorise Gmail (https://mail.google.com/), get a new refresh token, and update it in Settings → Credentials."
        : "Check Coolify logs for more detail.",
    });
  }
}

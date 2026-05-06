import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return html("Authorization Failed", `QuickBooks returned an error: ${oauthError}`, false);
  }

  if (!code || !realmId) {
    return html("Missing Parameters", "Missing authorization code or realmId.", false);
  }

  const [clientIdRow, clientSecretRow] = await Promise.all([
    prisma.companyCredential.findUnique({ where: { keyName: "QUICKBOOKS_CLIENT_ID" } }),
    prisma.companyCredential.findUnique({ where: { keyName: "QUICKBOOKS_CLIENT_SECRET" } }),
  ]);

  const clientId = clientIdRow?.keyValue;
  const clientSecret = clientSecretRow?.keyValue;

  if (!clientId || !clientSecret) {
    return html("Configuration Error", "QuickBooks Client ID or Client Secret not found. Please save your credentials first.", false);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/quickbooks/oauth/callback`;

  try {
    const tokenRes = await fetch(QBO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return html("Token Exchange Failed", `Intuit returned ${tokenRes.status}: ${errText}`, false);
    }

    const tokenData = await tokenRes.json();
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      return html("No Refresh Token", "Token response did not include a refresh token.", false);
    }

    // Save refresh token and realm ID to DB
    await Promise.all([
      prisma.companyCredential.upsert({
        where: { keyName: "QUICKBOOKS_REFRESH_TOKEN" },
        update: { keyValue: refreshToken },
        create: { keyName: "QUICKBOOKS_REFRESH_TOKEN", keyValue: refreshToken },
      }),
      prisma.companyCredential.upsert({
        where: { keyName: "QUICKBOOKS_REALM_ID" },
        update: { keyValue: realmId },
        create: { keyName: "QUICKBOOKS_REALM_ID", keyValue: realmId },
      }),
    ]);

    return html(
      "QuickBooks Connected!",
      `Authorization successful. Realm ID: ${realmId}. You can close this window.`,
      true
    );
  } catch (err: any) {
    return html("Error", err.message || "Unexpected error during token exchange.", false);
  }
}

function html(title: string, message: string, success: boolean): NextResponse {
  const color = success ? "#22c55e" : "#ef4444";
  const icon = success ? "&#10004;" : "&#10008;";
  const body = `<!DOCTYPE html>
<html><head><title>${title}</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f172a;color:white;margin:0">
  <div style="text-align:center;max-width:500px;padding:40px">
    <div style="font-size:64px;color:${color};margin-bottom:16px">${icon}</div>
    <h1 style="margin:0 0 12px">${title}</h1>
    <p style="color:#94a3b8;line-height:1.6">${message}</p>
    <button onclick="window.close()" style="margin-top:24px;padding:10px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Close Window</button>
  </div>
</body></html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const SCOPES = "com.intuit.quickbooks.accounting";

export async function GET(req: NextRequest) {
  const [clientIdRow, redirectUriRow] = await Promise.all([
    prisma.companyCredential.findUnique({ where: { keyName: "QUICKBOOKS_CLIENT_ID" } }),
    prisma.companyCredential.findUnique({ where: { keyName: "QUICKBOOKS_REDIRECT_URI" } }),
  ]);

  const clientId = clientIdRow?.keyValue;
  if (!clientId) {
    return new NextResponse(
      htmlPage("Configuration Error", "QuickBooks Client ID is not configured. Please save your credentials first.", false),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const redirectUri = redirectUriRow?.keyValue?.trim() || `${appUrl}/api/quickbooks/oauth/callback`;
  const state = `hrms_${Date.now()}`;

  const authUrl =
    `${QBO_AUTH_URL}` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(authUrl);
}

function htmlPage(title: string, message: string, success: boolean): string {
  const color = success ? "#22c55e" : "#ef4444";
  const icon = success ? "&#10004;" : "&#10008;";
  return `<!DOCTYPE html>
<html><head><title>${title}</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f172a;color:white;margin:0">
  <div style="text-align:center;max-width:500px;padding:40px">
    <div style="font-size:64px;color:${color};margin-bottom:16px">${icon}</div>
    <h1 style="margin:0 0 12px">${title}</h1>
    <p style="color:#94a3b8;line-height:1.6">${message}</p>
    <button onclick="window.close()" style="margin-top:24px;padding:10px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Close Window</button>
  </div>
</body></html>`;
}

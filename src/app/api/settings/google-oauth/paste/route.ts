import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { GOOGLE_CONNECT_SCOPES, PLAYGROUND_REDIRECT } from "@/lib/google-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === "ADMIN";
}

async function loadClient() {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET"] } },
  });
  const creds: Record<string, string> = {};
  for (const r of rows) creds[r.keyName] = r.keyValue;
  const clientId = (creds.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "").trim();
  const clientSecret =
    (creds.GMAIL_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * GET — hand the admin a ready-made consent URL.
 *
 * This uses Google's OAuth Playground as the redirect rather than a route of our
 * own. That redirect is already registered on the company's OAuth client, so
 * renewing needs no Google Cloud Console access — which matters because the
 * client lives in a project the HRMS admins cannot administer.
 */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = await loadClient();
  if (!client) {
    return NextResponse.json({ error: "Client ID and Client Secret must be saved first" }, { status: 400 });
  }

  const oauth = new google.auth.OAuth2(client.clientId, client.clientSecret, PLAYGROUND_REDIRECT);
  const consentUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CONNECT_SCOPES,
  });
  return NextResponse.json({ consentUrl });
}

/**
 * POST — exchange the pasted authorization code for a refresh token and store it.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await req.json();
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "Paste the code from Google first." }, { status: 400 });
  }

  const client = await loadClient();
  if (!client) {
    return NextResponse.json({ error: "Client ID and Client Secret must be saved first" }, { status: 400 });
  }

  try {
    const oauth = new google.auth.OAuth2(client.clientId, client.clientSecret, PLAYGROUND_REDIRECT);
    const { tokens } = await oauth.getToken(trimmed);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error:
            "Google did not return a refresh token. Start again from the link — the consent screen must be shown each time.",
        },
        { status: 400 },
      );
    }

    let email: string | undefined;
    if (tokens.id_token) {
      try {
        const ticket = await oauth.verifyIdToken({
          idToken: tokens.id_token,
          audience: client.clientId,
        });
        email = ticket.getPayload()?.email ?? undefined;
      } catch {
        // Non-fatal — the refresh token is valid regardless.
      }
    }

    await prisma.companyCredential.upsert({
      where: { keyName: "GMAIL_REFRESH_TOKEN" },
      update: { keyValue: tokens.refresh_token },
      create: { keyName: "GMAIL_REFRESH_TOKEN", keyValue: tokens.refresh_token },
    });
    // The token can only act as the account that signed in, so keep the sender
    // address in step with it.
    if (email) {
      await prisma.companyCredential.upsert({
        where: { keyName: "GMAIL_EMAIL_USER" },
        update: { keyValue: email },
        create: { keyName: "GMAIL_EMAIL_USER", keyValue: email },
      });
    }

    return NextResponse.json({ ok: true, email: email ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    const used = message.includes("invalid_grant");
    return NextResponse.json(
      {
        error: used
          ? "That code was already used or has expired. Open the link again to get a fresh one."
          : message,
      },
      { status: 400 },
    );
  }
}

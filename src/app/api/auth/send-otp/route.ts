import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

let cachedOAuth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let cachedOAuth2Key = "";

function getOrCreateOAuth2Client(clientId: string, clientSecret: string, refreshToken: string) {
  const key = `${clientId}:${refreshToken}`;
  if (cachedOAuth2Client && cachedOAuth2Key === key) return cachedOAuth2Client;
  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground"
  );
  client.setCredentials({ refresh_token: refreshToken });
  cachedOAuth2Client = client;
  cachedOAuth2Key = key;
  return client;
}

async function sendOtpEmail(
  to: string,
  code: string,
  creds: { GMAIL_EMAIL_USER: string; GMAIL_CLIENT_ID: string; GMAIL_CLIENT_SECRET: string; GMAIL_REFRESH_TOKEN: string }
) {
  const { GMAIL_EMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = creds;

  let oauth2Client = getOrCreateOAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN);

  // Warm up access token with retry
  let tokenReady = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await oauth2Client.getAccessToken();
      tokenReady = true;
      break;
    } catch (err: any) {
      cachedOAuth2Client = null;
      cachedOAuth2Key = "";
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 500));
        oauth2Client = getOrCreateOAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN);
      } else {
        const msg = err?.message ?? String(err);
        const isExpired = msg.includes("invalid_grant") || msg.includes("Token has been expired");
        throw new Error(
          isExpired
            ? "Gmail refresh token is expired or revoked. Go to Settings → Credentials and generate a new refresh token from OAuth Playground."
            : `Gmail auth failed: ${msg}`
        );
      }
    }
  }
  if (!tokenReady) throw new Error("Could not obtain Gmail access token");

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const { renderEmail, plainTextToHtml } = await import("@/lib/email-templates/render");
  const { subject, body } = await renderEmail("OTP", {
    OTP: code,
    EXPIRY_MINUTES: 30,
    USER_EMAIL: to,
  });

  const htmlBody = plainTextToHtml(body).replace(
    new RegExp(code, "g"),
    `<strong style="font-size:20px;letter-spacing:3px;color:#1d4ed8;">${code}</strong>`,
  );

  const branding = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = branding?.name || "HR Portal";

  const rawEmail = [
    `From: ${companyName} <${GMAIL_EMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });
      console.log(`[send-otp] Email sent to ${to}`);
      return;
    } catch (err: any) {
      lastErr = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        if (err?.code === 401 || err?.message?.includes("invalid_grant")) {
          try {
            oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
            await oauth2Client.getAccessToken();
          } catch {
            cachedOAuth2Client = null;
            cachedOAuth2Key = "";
          }
        }
      }
    }
  }
  throw new Error(`Gmail send failed: ${lastErr?.message ?? lastErr}`);
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Valid email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // HRMS is a closed system — only existing users can receive OTP
    const userExists = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (!userExists) {
      return NextResponse.json(
        { success: false, error: "No account found for this email. Please contact HR." },
        { status: 404 }
      );
    }

    // Invalidate any existing unused OTPs for this email
    await prisma.otpCode.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.otpCode.create({
      data: { email: normalizedEmail, code, expiresAt },
    });

    // Read Gmail OAuth credentials — DB first, fall back to environment variables
    const credRows = await prisma.companyCredential.findMany({
      where: {
        keyName: {
          in: ["GMAIL_EMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
        },
      },
    });
    const creds: Record<string, string> = {};
    for (const r of credRows) creds[r.keyName] = r.keyValue;

    const GMAIL_EMAIL_USER    = creds["GMAIL_EMAIL_USER"]    || process.env.GMAIL_EMAIL_USER    || "";
    const GMAIL_CLIENT_ID     = creds["GMAIL_CLIENT_ID"]     || process.env.GMAIL_CLIENT_ID     || "";
    const GMAIL_CLIENT_SECRET = creds["GMAIL_CLIENT_SECRET"] || process.env.GMAIL_CLIENT_SECRET || "";
    const GMAIL_REFRESH_TOKEN = creds["GMAIL_REFRESH_TOKEN"] || process.env.GMAIL_REFRESH_TOKEN || "";

    if (!GMAIL_EMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      console.error("[send-otp] Gmail credentials not configured in CompanyCredential table");
      return NextResponse.json({
        success: false,
        error: "Email is not configured on this server. Please contact the administrator.",
      }, { status: 503 });
    }

    await sendOtpEmail(normalizedEmail, code, {
      GMAIL_EMAIL_USER,
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN,
    });

    return NextResponse.json({
      success: true,
      message: "OTP has been sent to your email address",
    });
  } catch (err: any) {
    const message = err?.message || "Failed to send OTP";
    console.error("[send-otp] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

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

    // Read Gmail OAuth credentials from CompanyCredential table
    const credRows = await prisma.companyCredential.findMany({
      where: {
        keyName: {
          in: ["GMAIL_EMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
        },
      },
    });
    const creds: Record<string, string> = {};
    for (const r of credRows) creds[r.keyName] = r.keyValue;

    const { GMAIL_EMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = creds;

    if (!GMAIL_EMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      // OTP stored but email not configured — admin needs to set up Gmail credentials
      return NextResponse.json({
        success: true,
        message: "OTP generated. Email delivery requires Gmail credentials to be configured in Settings → Credentials.",
        emailConfigured: false,
      });
    }

    // Return 200 immediately — email sent in background (avoids OAuth cold-start delay)
    const response = NextResponse.json({
      success: true,
      message: "OTP has been sent to your email address",
      emailConfigured: true,
    });

    // Fire-and-forget: send OTP email asynchronously
    (async () => {
      try {
        let oauth2Client = getOrCreateOAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN);

        // Warm up access token with retry (avoids first-attempt failure after cold start)
        let tokenReady = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await oauth2Client.getAccessToken();
            tokenReady = true;
            break;
          } catch {
            cachedOAuth2Client = null;
            cachedOAuth2Key = "";
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 500));
              oauth2Client = getOrCreateOAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN);
            }
          }
        }
        if (!tokenReady) return;

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
        const companyName = settings?.name || "Tertiary Infotech";

        const subject = `${companyName} HR Portal - Verification Code`;
        const bodyLines = [
          "Hi,",
          "",
          `Your OTP is ${code}.`,
          "",
          `Please use this to log in to the ${companyName} HR Portal within 30 minutes.`,
          "",
          "If you did not request this OTP, please ignore this email. Do not share this OTP with anyone.",
          "",
          `Warm regards`,
          companyName,
        ];

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
            ${bodyLines
              .map((line) => {
                if (!line.trim()) return '<br style="line-height:0.5;">';
                const highlighted = line.replace(
                  new RegExp(code, "g"),
                  `<strong style="font-size:20px;letter-spacing:3px;color:#1d4ed8;">${code}</strong>`
                );
                return `<p style="margin:0 0 4px 0;">${highlighted}</p>`;
              })
              .join("\n")}
          </div>
        `;

        const rawEmail = [
          `From: ${companyName} <${GMAIL_EMAIL_USER}>`,
          `To: ${email}`,
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

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await gmail.users.messages.send({
              userId: "me",
              requestBody: { raw: encodedMessage },
            });
            break;
          } catch (err: any) {
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
      } catch {
        // Background email errors are non-fatal
      }
    })();

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to send OTP" },
      { status: 500 }
    );
  }
}

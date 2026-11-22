import { COMPANY_EMAIL_REQUIRED_MESSAGE, isLoginEmailAllowed } from "@/lib/login-policy";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { removeSenderInboxCopy } from "@/lib/send-email";
import { OTP_FROM_EMAIL, orderOtpSenders, sendsAs } from "@/lib/otp-sender";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function buildOtpHtml(code: string, to: string) {
  const { renderEmail, plainTextToHtml } = await import("@/lib/email-templates/render");
  const { subject, body } = await renderEmail("OTP", { OTP: code, EXPIRY_MINUTES: 30, USER_EMAIL: to });
  const htmlBody = plainTextToHtml(body).replace(
    new RegExp(code, "g"),
    `<strong style="font-size:20px;letter-spacing:3px;color:#1d4ed8;">${code}</strong>`,
  );
  return { subject, htmlBody };
}

// ── SMTP send (nodemailer) ───────────────────────────────────────────────────

type SmtpLogin = { host: string; user: string; pass: string; port?: string; from?: string; secure?: string };

/**
 * Every complete SMTP login the HRMS holds: the one saved in Settings (which
 * fills any gap from the server environment), then the environment's own when
 * it is a different mailbox.
 */
async function getSmtpLogins(): Promise<SmtpLogin[]> {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "SMTP_FROM", "SMTP_SECURE"] } },
  });
  const db: Record<string, string> = {};
  for (const r of rows) db[r.keyName] = r.keyValue;
  const env = process.env;

  const saved = {
    host: db["SMTP_HOST"] || env.SMTP_HOST,
    user: db["SMTP_USER"] || env.SMTP_USER,
    pass: db["SMTP_PASS"] || env.SMTP_PASS,
    port: db["SMTP_PORT"] || env.SMTP_PORT,
    from: db["SMTP_FROM"] || env.SMTP_FROM,
    secure: db["SMTP_SECURE"] || env.SMTP_SECURE,
  };
  const fromEnv = {
    host: env.SMTP_HOST,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    port: env.SMTP_PORT,
    from: env.SMTP_FROM,
    secure: env.SMTP_SECURE,
  };

  const logins: SmtpLogin[] = [];
  for (const l of [saved, fromEnv]) {
    if (!l.host || !l.user || !l.pass) continue;
    if (logins.some((x) => x.user.toLowerCase() === l.user!.toLowerCase())) continue;
    logins.push(l as SmtpLogin);
  }
  return logins;
}

async function sendViaSmtp(login: SmtpLogin, to: string, code: string) {
  const { host, user, pass, port, from, secure } = login;
  const transport = nodemailer.createTransport({
    host,
    port: Number(port ?? 587),
    secure: secure === "true",
    auth: { user, pass },
  });

  const branding = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = branding?.name || "TIA HRMS";
  const { subject, htmlBody } = await buildOtpHtml(code, to);

  // To the requester only: never Cc or Bcc admins on an OTP.
  const info = await transport.sendMail({ from: `${companyName} <${from || user}>`, to, subject, html: htmlBody });
  console.log(`[send-otp] SMTP email sent to ${to} from ${from || user}`);
  // Keep the sending mailbox's copy out of its inbox (runs in the background).
  if (info?.messageId) void removeSenderInboxCopy({ rfc822MessageId: info.messageId, to });
}

// ── Gmail OAuth send ─────────────────────────────────────────────────────────

let cachedOAuth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let cachedOAuth2Key = "";

function getOrCreateOAuth2Client(clientId: string, clientSecret: string, refreshToken: string) {
  const key = `${clientId}:${refreshToken}`;
  if (cachedOAuth2Client && cachedOAuth2Key === key) return cachedOAuth2Client;
  const client = new google.auth.OAuth2(clientId, clientSecret, "https://developers.google.com/oauthplayground");
  client.setCredentials({ refresh_token: refreshToken });
  cachedOAuth2Client = client;
  cachedOAuth2Key = key;
  return client;
}

type GmailCreds = { GMAIL_EMAIL_USER: string; GMAIL_CLIENT_ID: string; GMAIL_CLIENT_SECRET: string; GMAIL_REFRESH_TOKEN: string };

let cachedSendAs: { key: string; addresses: string[] } | null = null;

/**
 * The addresses the connected Gmail account can really send as: its own, plus
 * its verified "Send mail as" aliases. Gmail rewrites any other From address to
 * the account's own, so the saved GMAIL_EMAIL_USER label is not proof. Returns
 * [] when Gmail cannot be asked (the send itself then reports the fault).
 */
async function gmailSendAsAddresses(creds: GmailCreds): Promise<string[]> {
  const key = `${creds.GMAIL_CLIENT_ID}:${creds.GMAIL_REFRESH_TOKEN}`;
  if (cachedSendAs?.key === key) return cachedSendAs.addresses;
  try {
    const auth = getOrCreateOAuth2Client(creds.GMAIL_CLIENT_ID, creds.GMAIL_CLIENT_SECRET, creds.GMAIL_REFRESH_TOKEN);
    const res = await google.gmail({ version: "v1", auth }).users.settings.sendAs.list({ userId: "me" });
    const addresses = (res.data.sendAs ?? [])
      .filter((a) => a.sendAsEmail && (a.isPrimary || a.verificationStatus === "accepted"))
      .map((a) => a.sendAsEmail as string);
    cachedSendAs = { key, addresses };
    return addresses;
  } catch (err: any) {
    console.warn("[send-otp] could not read the Gmail account's send-as addresses:", err?.message ?? err);
    return [];
  }
}

async function sendViaGmailOAuth(to: string, code: string, creds: GmailCreds, fromAddress: string) {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = creds;
  let oauth2Client = getOrCreateOAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await oauth2Client.getAccessToken();
      break;
    } catch (err: any) {
      cachedOAuth2Client = null;
      cachedOAuth2Key = "";
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 500));
        oauth2Client = getOrCreateOAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN);
      } else {
        const msg = err?.message ?? String(err);
        throw new Error(
          msg.includes("invalid_grant") || msg.includes("Token has been expired")
            ? "Gmail sign-in has expired. An admin can fix this in Settings → Credentials by clicking \"Sign in with Google to renew token\". Meanwhile, sign in with your password or with Google."
            : `Gmail auth failed: ${msg}`
        );
      }
    }
  }

  const branding = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = branding?.name || "TIA HRMS";
  const { subject, htmlBody } = await buildOtpHtml(code, to);

  const raw = [
    `From: ${companyName} <${fromAddress}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\r\n");

  const encoded = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sent = await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
      console.log(`[send-otp] Gmail OAuth email sent to ${to} from ${fromAddress}`);
      // Gmail files the sender's copy under SENT + INBOX; keep it out of the inbox.
      if (sent.data.id) void removeSenderInboxCopy({ gmailId: sent.data.id, to });
      return;
    } catch (err: any) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error(`Gmail send failed: ${lastErr?.message ?? lastErr}`);
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Valid email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const userExists = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, employee: { select: { employmentType: true } } },
    });
    if (!userExists) {
      return NextResponse.json(
        { success: false, error: "No account found for this email. Please contact HR." },
        { status: 404 }
      );
    }

    // Company email only, except part-time staff and interns: no code is sent to a refused address.
    if (!isLoginEmailAllowed(normalizedEmail, userExists.employee?.employmentType)) {
      return NextResponse.json({ success: false, error: COMPANY_EMAIL_REQUIRED_MESSAGE }, { status: 403 });
    }

    await prisma.otpCode.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    const code = generateOtp();
    await prisma.otpCode.create({
      data: { email: normalizedEmail, code, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });

    // Every mail login the HRMS holds, in the usual order (SMTP, then Gmail).
    type OtpSender = { label: string; addresses: string[]; send: () => Promise<void> };
    const senders: OtpSender[] = [];

    for (const login of await getSmtpLogins()) {
      senders.push({
        label: `SMTP ${login.user}`,
        addresses: [login.user],
        send: () => sendViaSmtp(login, normalizedEmail, code),
      });
    }

    const credRows = await prisma.companyCredential.findMany({
      where: { keyName: { in: ["GMAIL_EMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] } },
    });
    const creds: Record<string, string> = {};
    for (const r of credRows) creds[r.keyName] = r.keyValue;
    const gmailCreds: GmailCreds = {
      GMAIL_EMAIL_USER: creds["GMAIL_EMAIL_USER"] || process.env.GMAIL_EMAIL_USER || "",
      GMAIL_CLIENT_ID: creds["GMAIL_CLIENT_ID"] || process.env.GMAIL_CLIENT_ID || "",
      GMAIL_CLIENT_SECRET: creds["GMAIL_CLIENT_SECRET"] || process.env.GMAIL_CLIENT_SECRET || "",
      GMAIL_REFRESH_TOKEN: creds["GMAIL_REFRESH_TOKEN"] || process.env.GMAIL_REFRESH_TOKEN || "",
    };
    if (gmailCreds.GMAIL_EMAIL_USER && gmailCreds.GMAIL_CLIENT_ID && gmailCreds.GMAIL_CLIENT_SECRET && gmailCreds.GMAIL_REFRESH_TOKEN) {
      const addresses = await gmailSendAsAddresses(gmailCreds);
      // Send as the OTP address when the account can; otherwise as itself.
      const fromAddress = sendsAs(addresses) ? OTP_FROM_EMAIL : addresses[0] || gmailCreds.GMAIL_EMAIL_USER;
      senders.push({
        label: `Gmail ${fromAddress}`,
        addresses,
        send: () => sendViaGmailOAuth(normalizedEmail, code, gmailCreds, fromAddress),
      });
    }

    if (senders.length === 0) {
      console.error("[send-otp] No email credentials configured (neither SMTP nor Gmail OAuth)");
      return NextResponse.json({
        success: false,
        error: "Email is not configured. Add SMTP_HOST/SMTP_USER/SMTP_PASS to Coolify environment variables.",
      }, { status: 503 });
    }

    // The logins that send as OTP_FROM_EMAIL go first; the rest are the fallback
    // so the code still arrives when that mailbox's login is broken.
    let sent = false;
    let lastErr: any;
    for (const sender of orderOtpSenders(senders)) {
      try {
        await sender.send();
        sent = true;
        if (!sendsAs(sender.addresses)) {
          console.warn(`[send-otp] OTP went out via ${sender.label}: no working mail login sends as ${OTP_FROM_EMAIL}`);
        }
        break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[send-otp] ${sender.label} failed, trying the next mail login:`, err?.message ?? err);
      }
    }
    if (!sent) throw lastErr ?? new Error("Failed to send OTP");

    return NextResponse.json({ success: true, message: "OTP has been sent to your email address" });
  } catch (err: any) {
    const message = err?.message || "Failed to send OTP";
    console.error("[send-otp] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

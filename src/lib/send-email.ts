import { google } from "googleapis";
import { prisma } from "./prisma";
import nodemailer from "nodemailer";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

// ── SMTP transport (nodemailer) ──────────────────────────────────────────────

function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

// ── Gmail OAuth transport ────────────────────────────────────────────────────

let cachedClient: InstanceType<typeof google.auth.OAuth2> | null = null;
let cachedKey = "";

async function getGmailClient() {
  const rows = await prisma.companyCredential.findMany({
    where: {
      keyName: { in: ["GMAIL_EMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] },
    },
  });
  const creds: Record<string, string> = {};
  for (const r of rows) creds[r.keyName] = r.keyValue;

  // DB-stored credentials take priority; fall back to environment variables
  const GMAIL_EMAIL_USER    = creds["GMAIL_EMAIL_USER"]    || process.env.GMAIL_EMAIL_USER    || "";
  const GMAIL_CLIENT_ID     = creds["GMAIL_CLIENT_ID"]     || process.env.GMAIL_CLIENT_ID     || "";
  const GMAIL_CLIENT_SECRET = creds["GMAIL_CLIENT_SECRET"] || process.env.GMAIL_CLIENT_SECRET || "";
  const GMAIL_REFRESH_TOKEN = creds["GMAIL_REFRESH_TOKEN"] || process.env.GMAIL_REFRESH_TOKEN || "";

  if (!GMAIL_EMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    return null;
  }

  const key = `${GMAIL_CLIENT_ID}:${GMAIL_REFRESH_TOKEN}`;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    cachedClient.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
    cachedKey = key;
  }

  await cachedClient.getAccessToken();
  return { client: cachedClient, senderEmail: GMAIL_EMAIL_USER };
}

// RFC 2047-encode a header value so non-ASCII characters survive transit.
// Nodemailer handles this automatically; the manual Gmail raw-message path needs it.
function encodeHeader(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

// ── Public sendEmail ─────────────────────────────────────────────────────────

export async function sendEmail({
  to,
  subject,
  html,
  cc,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  cc?: string | string[];
  attachments?: EmailAttachment[];
}) {
  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = settings?.name || "HR Portal";
  const ccList = Array.isArray(cc) ? cc : cc ? [cc] : [];

  // ── Try SMTP first (if configured); fall back to Gmail OAuth on failure ──
  const smtpTransport = getSmtpTransport();
  if (smtpTransport) {
    try {
      const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || "";
      await smtpTransport.sendMail({
        from: `${companyName} <${fromAddr}>`,
        to,
        cc: ccList.length ? ccList.join(", ") : undefined,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return;
    } catch (smtpErr: any) {
      console.warn("[send-email] SMTP failed, trying Gmail OAuth:", smtpErr?.message);
    }
  }

  // ── Fall back to Gmail OAuth ─────────────────────────────────────────────
  const gmailAuth = await getGmailClient();
  if (!gmailAuth) {
    throw new Error(
      "Email not configured. Add SMTP_HOST/SMTP_USER/SMTP_PASS env vars in Coolify, or configure Gmail OAuth in Settings → Credentials."
    );
  }

  const { client, senderEmail } = gmailAuth;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  let raw: string;
  if (!hasAttachments) {
    raw = [
      `From: ${companyName} <${senderEmail}>`,
      `To: ${to}`,
      ...(ccList.length ? [`Cc: ${ccList.join(", ")}`] : []),
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
    ].join("\r\n");
  } else {
    const boundary = `=_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const lines: string[] = [
      `From: ${companyName} <${senderEmail}>`,
      `To: ${to}`,
      ...(ccList.length ? [`Cc: ${ccList.join(", ")}`] : []),
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      html,
    ];
    for (const att of attachments!) {
      const b64 = att.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
      lines.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${att.filename}"`,
        "",
        b64,
      );
    }
    lines.push(`--${boundary}--`, "");
    raw = lines.join("\r\n");
  }

  const encoded = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}

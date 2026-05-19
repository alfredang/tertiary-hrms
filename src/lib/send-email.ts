import { google } from "googleapis";
import { prisma } from "./prisma";

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

  const { GMAIL_EMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = creds;
  if (!GMAIL_EMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail credentials not configured. Go to Settings → Credentials to set them up.");
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

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

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

  const { client, senderEmail } = await getGmailClient();

  const ccList = Array.isArray(cc) ? cc : cc ? [cc] : [];
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  let raw: string;
  if (!hasAttachments) {
    const headers = [
      `From: ${companyName} <${senderEmail}>`,
      `To: ${to}`,
      ...(ccList.length ? [`Cc: ${ccList.join(", ")}`] : []),
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
    ];
    raw = headers.join("\r\n");
  } else {
    const boundary = `=_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const lines: string[] = [
      `From: ${companyName} <${senderEmail}>`,
      `To: ${to}`,
      ...(ccList.length ? [`Cc: ${ccList.join(", ")}`] : []),
      `Subject: ${subject}`,
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

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}

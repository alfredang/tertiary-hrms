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

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = settings?.name || "Tertiary Infotech";

  const { client, senderEmail } = await getGmailClient();

  const raw = [
    `From: ${companyName} <${senderEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}

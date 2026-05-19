import { google, drive_v3 } from "googleapis";
import { prisma } from "../src/lib/prisma";

const PARENT_FOLDER_ID = "15EMi7S_HE9t_2en-C3csjRSoE_GOc-FN";
const ADMIN_EMAILS = [
  "feminajasminismail@gmail.com",
  "tansc@tertiaryinfotech.com",
  "angch@tertiaryinfotech.com",
];

async function getDriveClient(): Promise<drive_v3.Drive> {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] } },
  });
  const creds = Object.fromEntries(rows.map((r) => [r.keyName, r.keyValue]));
  const oauth = new google.auth.OAuth2(creds.GMAIL_CLIENT_ID, creds.GMAIL_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: creds.GMAIL_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth: oauth });
}

async function findUserFolder(drive: drive_v3.Drive, name: string): Promise<string | null> {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and '${PARENT_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function listEmailPermissions(drive: drive_v3.Drive, fileId: string): Promise<Set<string>> {
  const emails = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res: any = await drive.permissions.list({
      fileId,
      fields: "nextPageToken, permissions(emailAddress, role, type)",
      supportsAllDrives: true,
      pageToken,
    });
    for (const p of res.data.permissions ?? []) {
      if (p.emailAddress) emails.add(p.emailAddress.toLowerCase());
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return emails;
}

async function grant(drive: drive_v3.Drive, fileId: string, email: string) {
  await drive.permissions.create({
    fileId,
    requestBody: { type: "user", role: "writer", emailAddress: email },
    sendNotificationEmail: false,
    supportsAllDrives: true,
  });
}

async function main() {
  const drive = await getDriveClient();
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });

  let folderMissing = 0, granted = 0, alreadyHad = 0, errors = 0;
  for (const emp of employees) {
    const folderId = await findUserFolder(drive, emp.name.trim());
    if (!folderId) {
      console.log(`! No folder for ${emp.name}`);
      folderMissing++;
      continue;
    }
    const existing = await listEmailPermissions(drive, folderId);
    const targets = Array.from(new Set([emp.email, ...ADMIN_EMAILS].map((e) => e.toLowerCase()))).filter(Boolean);
    const fresh: string[] = [];
    const skipped: string[] = [];
    for (const t of targets) {
      if (existing.has(t)) skipped.push(t);
      else fresh.push(t);
    }
    for (const t of fresh) {
      try {
        await grant(drive, folderId, t);
        granted++;
      } catch (err: any) {
        console.log(`  ! Failed to grant ${t} on ${emp.name}: ${err?.message ?? err}`);
        errors++;
      }
    }
    alreadyHad += skipped.length;
    console.log(`${emp.name}: +${fresh.length} new${fresh.length ? ` (${fresh.join(", ")})` : ""}, ${skipped.length} existing`);
  }

  console.log(`\nDone. Granted: ${granted}, already had access: ${alreadyHad}, folders missing: ${folderMissing}, errors: ${errors}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

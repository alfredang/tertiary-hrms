import { google, drive_v3 } from "googleapis";
import { prisma } from "../src/lib/prisma";

const PARENT_FOLDER_ID = "15EMi7S_HE9t_2en-C3csjRSoE_GOc-FN";
const SUBFOLDERS = ["Payroll", "Expense Claims", "Medical Certificates", "CV", "Other Documents"];

async function getDriveClient(): Promise<drive_v3.Drive> {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] } },
  });
  const creds = Object.fromEntries(rows.map((r) => [r.keyName, r.keyValue]));
  const clientId = creds.GMAIL_CLIENT_ID;
  const clientSecret = creds.GMAIL_CLIENT_SECRET;
  const refreshToken = creds.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Missing Google OAuth credentials");

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth });
}

async function findOrCreateFolder(drive: drive_v3.Drive, name: string, parentId: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id, name)", pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true });
  const existing = list.data.files?.[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Failed to create folder: ${name}`);
  return created.data.id;
}

async function main() {
  const drive = await getDriveClient();
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${employees.length} active employees`);

  let createdUser = 0, existingUser = 0, createdSub = 0, existingSub = 0;
  for (const emp of employees) {
    const folderName = emp.name.trim();
    if (!folderName) {
      console.log(`  ! Skipping employee ${emp.id} (no name)`);
      continue;
    }
    const before = await drive.files.list({
      q: `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${PARENT_FOLDER_ID}' in parents and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const wasExisting = !!before.data.files?.[0];
    const userFolderId = await findOrCreateFolder(drive, folderName, PARENT_FOLDER_ID);
    if (wasExisting) existingUser++; else createdUser++;
    console.log(`${wasExisting ? "·" : "+"} ${folderName} (${userFolderId})`);

    for (const sub of SUBFOLDERS) {
      const subBefore = await drive.files.list({
        q: `name = '${sub.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${userFolderId}' in parents and trashed = false`,
        fields: "files(id)",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const subExisted = !!subBefore.data.files?.[0];
      await findOrCreateFolder(drive, sub, userFolderId);
      if (subExisted) existingSub++; else createdSub++;
    }
  }

  console.log(`\nDone. User folders: ${createdUser} created, ${existingUser} existed. Subfolders: ${createdSub} created, ${existingSub} existed.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

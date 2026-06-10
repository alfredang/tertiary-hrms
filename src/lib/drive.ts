import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";

export const EMPLOYEES_PARENT_FOLDER_ID = "15EMi7S_HE9t_2en-C3csjRSoE_GOc-FN";

let cachedClient: drive_v3.Drive | null = null;
let cachedKey = "";

export async function getDriveClient(): Promise<drive_v3.Drive> {
  const rows = await prisma.companyCredential.findMany({
    where: { keyName: { in: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] } },
  });
  const creds = Object.fromEntries(rows.map((r) => [r.keyName, r.keyValue]));
  const clientId = creds.GMAIL_CLIENT_ID;
  const clientSecret = creds.GMAIL_CLIENT_SECRET;
  const refreshToken = creds.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials are not configured");
  }
  const key = `${clientId}:${refreshToken}`;
  if (cachedClient && cachedKey === key) return cachedClient;

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  cachedClient = google.drive({ version: "v3", auth: oauth });
  cachedKey = key;
  return cachedClient;
}

function escape(s: string) {
  return s.replace(/'/g, "\\'");
}

export async function findFolderByName(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string | null> {
  const res = await drive.files.list({
    q: `name = '${escape(name)}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

export async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string> {
  const existing = await findFolderByName(drive, name, parentId);
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Failed to create folder ${name}`);
  return created.data.id;
}

export async function getOrAssignEmployeeFolderId(employeeId: string): Promise<string | null> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, driveFolderId: true },
  });
  if (!emp) return null;
  if (emp.driveFolderId) return emp.driveFolderId;
  const drive = await getDriveClient();
  const folderId = await findFolderByName(drive, emp.name.trim(), EMPLOYEES_PARENT_FOLDER_ID);
  if (!folderId) return null;
  await prisma.employee.update({ where: { id: employeeId }, data: { driveFolderId: folderId } });
  return folderId;
}

export async function getEmployeeSubfolderId(
  employeeId: string,
  subfolderName: string,
): Promise<string | null> {
  const folderId = await getOrAssignEmployeeFolderId(employeeId);
  if (!folderId) return null;
  const drive = await getDriveClient();
  return findFolderByName(drive, subfolderName, folderId);
}

export async function uploadPdfToFolder(
  folderId: string,
  fileName: string,
  buffer: Buffer,
  opts: { replaceByName?: boolean } = {},
): Promise<{ id: string; webViewLink: string | null }> {
  const drive = await getDriveClient();

  if (opts.replaceByName) {
    const existing = await drive.files.list({
      q: `name = '${escape(fileName)}' and '${folderId}' in parents and trashed = false`,
      fields: "files(id)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of existing.data.files ?? []) {
      if (f.id) {
        await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {});
      }
    }
  }

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Failed to upload ${fileName}`);
  return { id: created.data.id, webViewLink: created.data.webViewLink ?? null };
}

export async function downloadFileBuffer(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export function buildFolderWebUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export const EMPLOYEE_SUBFOLDERS = [
  "Payroll",
  "Expense Claims",
  "Medical Certificates",
  "CV",
  "Other Documents",
];

export const EMPLOYEE_FOLDER_ADMIN_EMAILS = [
  "feminajasminismail@gmail.com",
  "tansc@tertiaryinfotech.com",
  "angch@tertiaryinfotech.com",
];

async function listGranteeEmails(drive: drive_v3.Drive, fileId: string): Promise<Set<string>> {
  const emails = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res: any = await drive.permissions.list({
      fileId,
      fields: "nextPageToken, permissions(emailAddress)",
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

export async function provisionEmployeeFolder(args: {
  employeeId: string;
  name: string;
  email?: string;
}): Promise<{ folderId: string; webViewLink: string }> {
  const drive = await getDriveClient();
  const folderId = await findOrCreateFolder(drive, args.name.trim(), EMPLOYEES_PARENT_FOLDER_ID);

  await Promise.all(EMPLOYEE_SUBFOLDERS.map((sub) => findOrCreateFolder(drive, sub, folderId)));

  await prisma.employee.update({
    where: { id: args.employeeId },
    data: { driveFolderId: folderId },
  });

  const existing = await listGranteeEmails(drive, folderId);
  const targets = new Set<string>();
  if (args.email) targets.add(args.email.toLowerCase());
  for (const a of EMPLOYEE_FOLDER_ADMIN_EMAILS) targets.add(a.toLowerCase());

  await Promise.all(
    Array.from(targets)
      .filter((email) => email && !existing.has(email))
      .map((email) =>
        drive.permissions.create({
          fileId: folderId,
          requestBody: { type: "user", role: "writer", emailAddress: email },
          sendNotificationEmail: false,
          supportsAllDrives: true,
        }).catch((err) => console.error(`Failed to grant ${email} on ${args.name} folder:`, err))
      )
  );

  return { folderId, webViewLink: buildFolderWebUrl(folderId) };
}

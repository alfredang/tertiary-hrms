import { getDriveClient, isDriveAuthRevoked, DRIVE_REAUTH_HINT } from "@/lib/drive";
import { CPF_SUBMISSION_FOLDER_ID } from "@/lib/cpf-submission";

/**
 * Past CPF EZPay statements, read straight from Drive: every PDF in the shared
 * CPF folder (`CPF_SUBMISSION_FOLDER_ID`, where /api/payroll/cpf-submission/parse
 * archives each upload; a PDF dropped in by hand is listed too), plus every
 * `CPF-Submission-MM-YYYY__…` archive the HRMS Drive login owns, so a statement
 * still shows when the login loses sight of the folder (26 Nov 2026: Drive
 * answered "File not found" for the folder while its Aug/Oct archives were
 * still there with no visible parent). Admins and accountants only.
 */

export interface CpfSubmissionFile {
  id: string;
  name: string;
  /** Pay period from the archive name `CPF-Submission-MM-YYYY__…`; null for a file named otherwise. */
  month: number | null;
  year: number | null;
  /** "November 2026", or null when the name carries no period. */
  periodLabel: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  webViewLink: string | null;
}

const ARCHIVE_PREFIX = "CPF-Submission-";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Admin / HR / Manager, or anyone holding ACCOUNTANT (the house finance gate). */
export function canViewCpfSubmissions(role: string | null | undefined, roles: string[] = []): boolean {
  const all = [role ?? "", ...roles].map((r) => r.toUpperCase());
  return all.some((r) => r === "ADMIN" || r === "HR" || r === "MANAGER" || r === "ACCOUNTANT");
}

export function parseCpfFilePeriod(name: string): { month: number; year: number } | null {
  const m = /^CPF-Submission-(\d{2})-(\d{4})__/i.exec(name);
  if (!m) return null;
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
}

/** Latest first: by pay period, then by upload time. Files without a period go last. */
export function sortCpfFiles(files: CpfSubmissionFile[]): CpfSubmissionFile[] {
  const periodKey = (f: CpfSubmissionFile) =>
    f.year != null && f.month != null ? f.year * 100 + f.month : -1;
  const time = (f: CpfSubmissionFile) => (f.uploadedAt ? Date.parse(f.uploadedAt) : 0);
  return [...files].sort((a, b) => periodKey(b) - periodKey(a) || time(b) - time(a));
}

export function toCpfSubmissionFile(raw: {
  id?: string | null;
  name?: string | null;
  size?: string | null;
  createdTime?: string | null;
  webViewLink?: string | null;
}): CpfSubmissionFile | null {
  if (!raw.id || !raw.name) return null;
  const period = parseCpfFilePeriod(raw.name);
  return {
    id: raw.id,
    name: raw.name,
    month: period?.month ?? null,
    year: period?.year ?? null,
    periodLabel: period ? `${MONTHS[period.month - 1]} ${period.year}` : null,
    sizeBytes: raw.size ? Number(raw.size) : null,
    uploadedAt: raw.createdTime ?? null,
    webViewLink: raw.webViewLink ?? null,
  };
}

function rethrow(err: unknown): never {
  if (isDriveAuthRevoked(err)) throw new Error(DRIVE_REAUTH_HINT);
  throw err;
}

export async function listCpfSubmissionFiles(): Promise<CpfSubmissionFile[]> {
  try {
    const drive = await getDriveClient();
    const byId = new Map<string, CpfSubmissionFile>();
    const collect = async (q: string, keep: (name: string) => boolean) => {
      let pageToken: string | undefined;
      do {
        const res = await drive.files.list({
          q,
          fields: "nextPageToken, files(id, name, size, createdTime, webViewLink)",
          pageSize: 200,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        for (const f of res.data.files ?? []) {
          const file = toCpfSubmissionFile(f);
          if (file && keep(file.name)) byId.set(file.id, file);
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    };
    await Promise.all([
      collect(
        `'${CPF_SUBMISSION_FOLDER_ID}' in parents and mimeType = 'application/pdf' and trashed = false`,
        () => true,
      ).catch(() => {
        // The folder itself may be invisible to the login; the archives below still list.
      }),
      collect(
        `name contains '${ARCHIVE_PREFIX}' and mimeType = 'application/pdf' and 'me' in owners and trashed = false`,
        (name) => isCpfArchiveName(name),
      ),
    ]);
    return sortCpfFiles(Array.from(byId.values()));
  } catch (err) {
    rethrow(err);
  }
}

/** A name the parse route gives an archived statement (`CPF-Submission-MM-YYYY__…`). */
export function isCpfArchiveName(name: string): boolean {
  return parseCpfFilePeriod(name) !== null;
}

/**
 * Download one statement. Only a PDF in the CPF folder, or a `CPF-Submission-…`
 * archive the HRMS login owns, is served — never any other file the login can read.
 */
export async function downloadCpfSubmissionFile(
  fileId: string,
): Promise<{ name: string; buffer: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return null;
  try {
    const drive = await getDriveClient();
    const meta = await drive.files
      .get({ fileId, fields: "id, name, parents, mimeType, trashed, ownedByMe", supportsAllDrives: true })
      .catch(() => null);
    const data = meta?.data;
    if (
      !data ||
      data.trashed ||
      data.mimeType !== "application/pdf" ||
      !(
        (data.parents ?? []).includes(CPF_SUBMISSION_FOLDER_ID) ||
        (data.ownedByMe === true && isCpfArchiveName(data.name ?? ""))
      )
    ) {
      return null;
    }
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return { name: data.name ?? "cpf-submission.pdf", buffer: Buffer.from(res.data as ArrayBuffer) };
  } catch (err) {
    rethrow(err);
  }
}

/** RFC 6266 attachment header with an ASCII fallback and the UTF-8 name. */
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * The CPF statement behind each payslip: the one recorded at generation
 * (`Payslip.cpfSubmissionFileId`) while it is still in the folder, else — for
 * payslips made before that was recorded — the latest statement filed for the
 * same month. `files` must be sorted latest first (`listCpfSubmissionFiles`).
 */
export function cpfFileForPayslip(
  payslip: { cpfSubmissionFileId?: string | null; payPeriodStart: Date },
  files: CpfSubmissionFile[],
): CpfSubmissionFile | null {
  if (payslip.cpfSubmissionFileId) {
    const recorded = files.find((f) => f.id === payslip.cpfSubmissionFileId);
    if (recorded) return recorded;
  }
  const month = payslip.payPeriodStart.getMonth() + 1;
  const year = payslip.payPeriodStart.getFullYear();
  return files.find((f) => f.month === month && f.year === year) ?? null;
}

export function cpfDownloadPath(fileId: string): string {
  return `/api/payroll/cpf-submission/files/${fileId}`;
}

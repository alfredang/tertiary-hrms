import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/drive", () => ({
  getDriveClient: vi.fn(),
  isDriveAuthRevoked: () => false,
  DRIVE_REAUTH_HINT: "reauth",
}));
vi.mock("@/lib/cpf-submission", () => ({ CPF_SUBMISSION_FOLDER_ID: "folder" }));

import {
  attachmentHeader,
  canViewCpfSubmissions,
  cpfFileForPayslip,
  parseCpfFilePeriod,
  sortCpfFiles,
  toCpfSubmissionFile,
} from "@/lib/cpf-submission-files";

const file = (id: string, name: string, createdTime: string) =>
  toCpfSubmissionFile({ id, name, createdTime, size: "1000" })!;

describe("parseCpfFilePeriod", () => {
  it("reads the month and year from the archive name", () => {
    expect(parseCpfFilePeriod("CPF-Submission-11-2026__modex.pdf")).toEqual({ month: 11, year: 2026 });
  });
  it("returns null for other names and bad months", () => {
    expect(parseCpfFilePeriod("statement.pdf")).toBeNull();
    expect(parseCpfFilePeriod("CPF-Submission-13-2026__x.pdf")).toBeNull();
  });
});

describe("sortCpfFiles", () => {
  it("puts the latest pay period first, then the latest upload, then unnamed files", () => {
    const sorted = sortCpfFiles([
      file("a", "CPF-Submission-09-2026__a.pdf", "2026-10-02T00:00:00Z"),
      file("b", "manual.pdf", "2026-11-30T00:00:00Z"),
      file("c", "CPF-Submission-11-2026__c.pdf", "2026-11-20T00:00:00Z"),
      file("d", "CPF-Submission-11-2026__d.pdf", "2026-11-25T00:00:00Z"),
      file("e", "CPF-Submission-12-2025__e.pdf", "2026-01-05T00:00:00Z"),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["d", "c", "a", "e", "b"]);
  });
  it("labels the period", () => {
    expect(file("x", "CPF-Submission-11-2026__x.pdf", "").periodLabel).toBe("November 2026");
  });
});

describe("canViewCpfSubmissions", () => {
  it("allows admins, HR, managers and accountants only", () => {
    expect(canViewCpfSubmissions("ADMIN")).toBe(true);
    expect(canViewCpfSubmissions("HR")).toBe(true);
    expect(canViewCpfSubmissions("MANAGER")).toBe(true);
    expect(canViewCpfSubmissions("ACCOUNTANT", ["ACCOUNTANT"])).toBe(true);
    expect(canViewCpfSubmissions("STAFF", ["STAFF", "ACCOUNTANT"])).toBe(true);
    expect(canViewCpfSubmissions("STAFF", ["STAFF", "TRAINER_ADMIN"])).toBe(false);
    expect(canViewCpfSubmissions("INTERN", ["INTERN"])).toBe(false);
    expect(canViewCpfSubmissions(undefined)).toBe(false);
  });
});

describe("cpfFileForPayslip", () => {
  const files = sortCpfFiles([
    file("old", "CPF-Submission-11-2026__first.pdf", "2026-11-20T00:00:00Z"),
    file("new", "CPF-Submission-11-2026__second.pdf", "2026-11-25T00:00:00Z"),
    file("oct", "CPF-Submission-10-2026__oct.pdf", "2026-10-25T00:00:00Z"),
  ]);
  const nov = new Date(2026, 10, 1);

  it("uses the statement recorded on the payslip", () => {
    expect(cpfFileForPayslip({ cpfSubmissionFileId: "old", payPeriodStart: nov }, files)?.id).toBe("old");
  });
  it("falls back to the latest statement for the same month", () => {
    expect(cpfFileForPayslip({ cpfSubmissionFileId: null, payPeriodStart: nov }, files)?.id).toBe("new");
    expect(cpfFileForPayslip({ cpfSubmissionFileId: "gone", payPeriodStart: nov }, files)?.id).toBe("new");
  });
  it("returns null when no statement covers the month", () => {
    expect(cpfFileForPayslip({ payPeriodStart: new Date(2026, 5, 1) }, files)).toBeNull();
  });
});

describe("attachmentHeader", () => {
  it("keeps an ASCII fallback and the UTF-8 name", () => {
    expect(attachmentHeader('a"b é.pdf')).toBe(
      `attachment; filename="a_b _.pdf"; filename*=UTF-8''a%22b%20%C3%A9.pdf`,
    );
  });
});

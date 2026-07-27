import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { uploadPdfToFolder } from "@/lib/drive";
import {
  CPF_SUBMISSION_FOLDER_ID,
  getClaudeApiKey,
  matchEmployee,
  parseCpfSubmissionPdf,
} from "@/lib/cpf-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAuthorized(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  const role = session.user.role;
  return role === "ADMIN" || role === "HR" || hasAdminAccess(role);
}

function driveFileName(month: number, year: number, original: string): string {
  const mm = String(month).padStart(2, "0");
  const safe = original.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `CPF-Submission-${mm}-${year}__${safe}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
      return NextResponse.json(
        { error: "Unsupported file. Upload the CPF EZPay PDF statement." },
        { status: 400 },
      );
    }

    const apiKey = await getClaudeApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Claude API key is not configured. Add CLAUDE_API_KEY under Settings → Credentials.",
        },
        { status: 400 },
      );
    }

    const submission = await parseCpfSubmissionPdf({
      pdfBuffer: buffer,
      filename: file.name,
      apiKey,
    });

    // Archive the statement to the shared CPF Drive folder BEFORE any payroll
    // is written — the filed statement must be on record, so a failed archive
    // stops the run.
    let driveWebViewLink: string | null = null;
    try {
      const uploaded = await uploadPdfToFolder(
        CPF_SUBMISSION_FOLDER_ID,
        driveFileName(submission.month, submission.year, file.name),
        buffer,
        { replaceByName: true },
      );
      driveWebViewLink = uploaded.webViewLink;
    } catch (err) {
      console.error("CPF statement Drive upload failed:", err);
      return NextResponse.json(
        {
          error:
            "Could not archive the PDF to the CPF Drive folder — payroll was not processed. " +
            (err instanceof Error ? err.message : "Drive upload failed"),
        },
        { status: 502 },
      );
    }

    const candidates = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, nric: true },
    });

    const payPeriodStart = new Date(submission.year, submission.month - 1, 1);
    const payPeriodEnd = new Date(submission.year, submission.month, 0);

    const existing = await prisma.payslip.findMany({
      where: { payPeriodStart, payPeriodEnd },
      select: { employeeId: true },
    });
    const existingIds = new Set(existing.map((p) => p.employeeId));

    const rows = submission.employees.map((row) => {
      const match = matchEmployee(row, candidates);
      const grossSalary = row.ordinaryWages + row.additionalWages;
      return {
        ...row,
        grossSalary,
        netSalary: grossSalary - row.employeeCpf,
        employeeId: match.employeeId,
        matchedName: match.employeeName,
        matchMethod: match.method,
        ambiguous: match.ambiguous,
        alreadyHasPayslip: match.employeeId ? existingIds.has(match.employeeId) : false,
      };
    });

    return NextResponse.json({
      cpfSubmissionNo: submission.cpfSubmissionNo,
      companyName: submission.companyName,
      month: submission.month,
      year: submission.year,
      totals: {
        totalCpfContributions: submission.totalCpfContributions,
        totalSdl: submission.totalSdl,
        grandTotal: submission.grandTotal,
        ordinaryWages: rows.reduce((s, r) => s + r.ordinaryWages, 0),
        employeeCpf: rows.reduce((s, r) => s + r.employeeCpf, 0),
        employerCpf: rows.reduce((s, r) => s + r.employerCpf, 0),
      },
      counts: {
        total: rows.length,
        matched: rows.filter((r) => r.employeeId).length,
        unmatched: rows.filter((r) => !r.employeeId).length,
        existing: rows.filter((r) => r.alreadyHasPayslip).length,
      },
      rows,
      driveWebViewLink,
    });
  } catch (error) {
    console.error("Error parsing CPF submission:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to parse the CPF statement",
      },
      { status: 500 },
    );
  }
}

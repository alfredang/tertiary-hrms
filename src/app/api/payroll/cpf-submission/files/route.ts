import { NextResponse } from "next/server";
import { cpfDownloadPath, listCpfSubmissionFiles } from "@/lib/cpf-submission-files";
import { sessionCanViewCpfSubmissions } from "@/lib/cpf-submission-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/payroll/cpf-submission/files — past CPF EZPay statements, latest first.
export async function GET() {
  if (!(await sessionCanViewCpfSubmissions())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const files = await listCpfSubmissionFiles();
    return NextResponse.json({
      files: files.map((f) => ({ ...f, downloadPath: cpfDownloadPath(f.id) })),
    });
  } catch (err) {
    console.error("Listing CPF statements failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the CPF Drive folder" },
      { status: 502 },
    );
  }
}

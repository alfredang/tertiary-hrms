import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { canViewCpfSubmissions, cpfDownloadPath, listCpfSubmissionFiles } from "@/lib/cpf-submission-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mobile/cpf-submissions — past CPF EZPay statements, latest first.
// Admins and accountants only (403 otherwise). Each PDF downloads from
// `downloadPath` with the same session, like a payslip's `pdfPath`.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!canViewCpfSubmissions(ctx.role, ctx.roles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const files = await listCpfSubmissionFiles();
    return NextResponse.json({
      cpfSubmissions: files.map((f) => ({
        id: f.id,
        name: f.name,
        month: f.month,
        year: f.year,
        periodLabel: f.periodLabel,
        sizeBytes: f.sizeBytes,
        uploadedAt: f.uploadedAt,
        downloadPath: cpfDownloadPath(f.id),
      })),
    });
  } catch (err) {
    console.error("Mobile CPF statement list failed:", err);
    return NextResponse.json({ error: "Could not read the CPF Drive folder" }, { status: 502 });
  }
}

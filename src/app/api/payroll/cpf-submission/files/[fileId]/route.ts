import { NextRequest, NextResponse } from "next/server";
import { attachmentHeader, downloadCpfSubmissionFile } from "@/lib/cpf-submission-files";
import { sessionCanViewCpfSubmissions } from "@/lib/cpf-submission-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/payroll/cpf-submission/files/[fileId] — download one statement (web and both apps).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  if (!(await sessionCanViewCpfSubmissions())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { fileId } = await params;
  try {
    const file = await downloadCpfSubmissionFile(fileId);
    if (!file) return NextResponse.json({ error: "CPF statement not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentHeader(file.name),
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("CPF statement download failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadPayslipToDrive } from "@/lib/payslip-drive";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["ADMIN", "HR"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { id } = await params;
  const payslip = await prisma.payslip.findUnique({ where: { id } });
  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
  }

  try {
    const result = await uploadPayslipToDrive(id);
    return NextResponse.json({ ok: true, driveFileId: result?.id ?? null });
  } catch (err) {
    console.error(`Regenerate failed for payslip ${id}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regenerate failed" },
      { status: 500 },
    );
  }
}

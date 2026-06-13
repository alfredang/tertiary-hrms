import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { emailPayslipToEmployee } from "@/lib/payslip-email";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = session.user.role;
    if (role !== "ADMIN" && role !== "HR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { id } = await params;
  try {
    await emailPayslipToEmployee(id);
    return NextResponse.json({ ok: true, message: "Payslip emailed successfully." });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[payslip-email] ${id}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

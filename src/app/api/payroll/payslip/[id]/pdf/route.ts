import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPayslipPdfBuffer, payslipFileName } from "@/lib/payslip-drive";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        payPeriodStart: true,
        employee: { select: { employeeId: true, name: true } },
      },
    });
    if (!payslip) {
      return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
    }

    const isHR = session.user.role === "HR" || session.user.role === "ADMIN";
    const isOwner = session.user.employeeId === payslip.employeeId;
    if (!isHR && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fileName = payslipFileName(payslip.employee.employeeId, payslip.payPeriodStart, payslip.employee.name);

    // Built from the payslip record on every download, so it is always current. Payslips are
    // only ever viewed and downloaded here, by a signed-in user (Alfred, 26 Nov 2026).
    const pdfBuffer = await buildPayslipPdfBuffer(payslip.id);

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPayslipPdfBuffer, uploadPayslipToDrive, payslipFileName } from "@/lib/payslip-drive";
import { downloadFileBuffer } from "@/lib/drive";

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
        driveFileId: true,
        employee: { select: { employeeId: true } },
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

    const fileName = payslipFileName(payslip.employee.employeeId, payslip.payPeriodStart);

    // Prefer Drive copy if available
    if (payslip.driveFileId) {
      try {
        const buf = await downloadFileBuffer(payslip.driveFileId);
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${fileName}"`,
          },
        });
      } catch (err) {
        console.error(`Drive download failed for payslip ${payslip.id}, regenerating:`, err);
      }
    }

    // Fallback: generate locally and opportunistically upload to Drive
    const pdfBuffer = await buildPayslipPdfBuffer(payslip.id);
    uploadPayslipToDrive(payslip.id).catch((err) =>
      console.error(`Background Drive upload failed for payslip ${payslip.id}:`, err),
    );

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

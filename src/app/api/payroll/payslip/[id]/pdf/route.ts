import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePayslipPDF } from "@/lib/pdf-generator";

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
      include: {
        employee: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!payslip) {
      return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
    }

    // Check authorization - user can only view their own payslip unless HR/Admin
    const isHR = session.user.role === "HR" || session.user.role === "ADMIN";
    const isOwner = session.user.employeeId === payslip.employeeId;

    if (!isHR && !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pdfData = generatePayslipPDF({
      employee: {
        name: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        id: payslip.employee.employeeId,
        department: payslip.employee.department.name,
        position: payslip.employee.position,
      },
      payPeriod: {
        start: payslip.payPeriodStart,
        end: payslip.payPeriodEnd,
      },
      paymentDate: payslip.paymentDate,
      earnings: {
        basicSalary: Number(payslip.basicSalary),
        allowances: Number(payslip.allowances),
        overtime: Number(payslip.overtime),
        bonus: Number(payslip.bonus),
        gross: Number(payslip.grossSalary),
      },
      deductions: {
        cpfEmployee: Number(payslip.cpfEmployee),
        incomeTax: Number(payslip.incomeTax),
        other: Number(payslip.otherDeductions),
        total: Number(payslip.totalDeductions),
      },
      cpf: {
        employee: Number(payslip.cpfEmployee),
        employer: Number(payslip.cpfEmployer),
        total: Number(payslip.cpfEmployee) + Number(payslip.cpfEmployer),
      },
      netSalary: Number(payslip.netSalary),
    });

    return new Response(pdfData, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${payslip.employee.employeeId}-${payslip.payPeriodStart.toISOString().slice(0, 7)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

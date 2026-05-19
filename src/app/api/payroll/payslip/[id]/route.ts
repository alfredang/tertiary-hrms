import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePayroll } from "@/lib/cpf-calculator";
import { uploadPayslipToDrive } from "@/lib/payslip-drive";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import * as z from "zod";

const patchSchema = z.object({
  grossSalary: z.number().min(0),
  basicSalary: z.number().min(0).optional(),
  allowances: z.number().min(0).optional(),
  remarks: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 400 });
    }

    const payslip = await prisma.payslip.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!payslip) {
      return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
    }
    if (!payslip.employee.dateOfBirth) {
      return NextResponse.json({ error: "Employee has no date of birth on record" }, { status: 400 });
    }

    const isIntern = payslip.employee.employmentType === "INTERN";
    const recalc = calculatePayroll(
      parsed.data.basicSalary ?? parsed.data.grossSalary,
      parsed.data.allowances ?? 0,
      payslip.employee.dateOfBirth,
      0,
      0,
      0,
      0,
      { cpfApplicable: !isIntern },
    );

    const updated = await prisma.payslip.update({
      where: { id },
      data: {
        basicSalary: parsed.data.basicSalary ?? parsed.data.grossSalary,
        allowances: parsed.data.allowances ?? 0,
        grossSalary: parsed.data.grossSalary,
        cpfEmployee: recalc.cpfEmployee,
        cpfEmployer: recalc.cpfEmployer,
        incomeTax: 0,
        otherDeductions: 0,
        totalDeductions: recalc.cpfEmployee,
        netSalary: parsed.data.grossSalary - recalc.cpfEmployee,
      },
    });

    // Regenerate PDF and replace in Drive
    try {
      await uploadPayslipToDrive(updated.id);
    } catch (err) {
      console.error(`Drive replace failed for payslip ${updated.id}:`, err);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating payslip:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

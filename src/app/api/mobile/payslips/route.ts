import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/payslips — the signed-in employee's own payslips.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ payslips: [] });

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: ctx.employeeId },
    orderBy: { payPeriodStart: "desc" },
    take: 60,
  });

  return NextResponse.json({
    payslips: payslips.map((p) => ({
      id: p.id,
      payPeriodStart: iso(p.payPeriodStart),
      payPeriodEnd: iso(p.payPeriodEnd),
      paymentDate: iso(p.paymentDate),
      basicSalary: num(p.basicSalary),
      allowances: num(p.allowances),
      overtime: num(p.overtime),
      bonus: num(p.bonus),
      grossSalary: num(p.grossSalary),
      cpfEmployee: num(p.cpfEmployee),
      totalDeductions: num(p.totalDeductions),
      netSalary: num(p.netSalary),
      status: p.status,
      // PDF is served (auth-gated) by the existing /api/payroll/payslip/[id]/pdf route.
      pdfPath: `/api/payroll/payslip/${p.id}/pdf`,
    })),
  });
}

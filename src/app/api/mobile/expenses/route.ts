import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/expenses — the signed-in employee's own expense claims + categories.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ claims: [], categories: [], approvedTotal: 0 });

  const employeeId = ctx.employeeId;

  const [claims, categories, approved] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { employeeId },
      include: {
        category: { select: { name: true, code: true } },
        approver: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.expenseClaim.aggregate({ where: { employeeId, status: "APPROVED" }, _sum: { amount: true } }),
  ]);

  return NextResponse.json({
    approvedTotal: num(approved._sum.amount),
    categories: categories.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    claims: claims.map((c) => ({
      id: c.id,
      description: c.description,
      amount: num(c.amount),
      currency: c.currency,
      category: c.category?.name ?? null,
      expenseDate: iso(c.expenseDate),
      status: c.status,
      receiptUrl: c.receiptUrl,
      approver: c.approver?.name ?? null,
      approvedAt: iso(c.approvedAt),
      rejectionReason: c.rejectionReason,
      createdAt: iso(c.createdAt),
    })),
  });
}

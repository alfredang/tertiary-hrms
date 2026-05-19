import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";

async function requireAdmin() {
  if (isDevAuthSkipped()) return null;
  const session = await auth();
  if (!session?.user) return "unauthorized";
  if (session.user.role !== "ADMIN") return "forbidden";
  return null;
}

export async function GET() {
  const err = await requireAdmin();
  if (err) return NextResponse.json({ error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  return NextResponse.json({ payslipRemarks: settings?.payslipRemarks ?? "" });
}

export async function PUT(req: NextRequest) {
  const err = await requireAdmin();
  if (err) return NextResponse.json({ error: err }, { status: err === "unauthorized" ? 401 : 403 });
  const body = await req.json();
  const payslipRemarks: string | null = typeof body.payslipRemarks === "string" ? body.payslipRemarks : null;
  await prisma.companySettings.upsert({
    where: { id: "company_settings" },
    create: { id: "company_settings", payslipRemarks },
    update: { payslipRemarks },
  });
  return NextResponse.json({ ok: true });
}

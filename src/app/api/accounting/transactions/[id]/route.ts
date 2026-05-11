import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function authorize() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  const role = (session.user as any).role as string | undefined;
  const roles = ((session.user as any).roles as string[] | undefined) ?? [];
  return hasAdminAccess(role) || roles.includes("ACCOUNTANT");
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await authorize())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") data.title = body.title.slice(0, 250);
  if (typeof body.paymentDate === "string") data.paymentDate = new Date(body.paymentDate);
  if (typeof body.amount === "number" || typeof body.amount === "string") {
    const n = Number(body.amount);
    if (!isNaN(n)) data.amount = n;
  }
  if (typeof body.paymentType === "string") data.paymentType = body.paymentType.slice(0, 40);
  if (typeof body.paymentRef === "string") data.paymentRef = body.paymentRef.slice(0, 120) || null;
  if (typeof body.invoiceNo === "string") data.invoiceNo = body.invoiceNo.slice(0, 80) || null;
  if (typeof body.status === "string") data.status = body.status.slice(0, 30);
  if (typeof body.gstIncluded === "boolean") data.gstIncluded = body.gstIncluded;
  if (typeof body.remarks === "string") data.remarks = body.remarks.slice(0, 500) || null;
  if (typeof body.type === "string") data.type = body.type.slice(0, 60);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ transaction: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await authorize())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.bankTransaction.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

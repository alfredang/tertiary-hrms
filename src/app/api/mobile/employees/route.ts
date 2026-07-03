import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/employees — company directory.
// Basic colleague fields for everyone; richer fields for admins/HR/managers.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    isAdmin: ctx.isAdmin,
    employees: employees.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      name: e.name,
      position: e.position,
      department: e.department?.name ?? null,
      avatarUrl: e.avatarUrl,
      // Contact + employment details are only exposed to supervisory roles.
      email: ctx.isAdmin ? e.email : null,
      phone: ctx.isAdmin ? e.phone : null,
      employmentType: ctx.isAdmin ? e.employmentType : null,
      startDate: ctx.isAdmin ? iso(e.startDate) : null,
    })),
  });
}

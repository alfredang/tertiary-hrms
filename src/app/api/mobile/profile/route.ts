import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso, num } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/mobile/profile — the signed-in employee's own profile.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId) return NextResponse.json({ employee: null });

  const employee = await prisma.employee.findUnique({
    where: { id: ctx.employeeId },
    include: { department: { select: { name: true } }, user: { select: { email: true, roles: true } } },
  });
  if (!employee) return NextResponse.json({ employee: null });

  return NextResponse.json({
    employee: {
      id: employee.id,
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      position: employee.position,
      department: employee.department?.name ?? null,
      employmentType: employee.employmentType,
      nationality: employee.nationality,
      nric: employee.nric,
      gender: employee.gender,
      educationLevel: employee.educationLevel,
      dateOfBirth: iso(employee.dateOfBirth),
      address: employee.address,
      startDate: iso(employee.startDate),
      endDate: iso(employee.endDate),
      status: employee.status,
      avatarUrl: employee.avatarUrl,
      monthlyLeaveRate: employee.monthlyLeaveRate != null ? num(employee.monthlyLeaveRate) : null,
      roles: employee.user?.roles ?? [],
      role: ctx.role,
    },
  });
}

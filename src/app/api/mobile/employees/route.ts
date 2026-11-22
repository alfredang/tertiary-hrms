import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, iso } from "@/lib/mobile-api";
import { isInternRoles } from "@/lib/leave-policy";

export const dynamic = "force-dynamic";

// GET /api/mobile/employees — company directory, admins (ADMIN / HR / MANAGER) only.
// Only admins see the full team (Alfred, 22 Nov 2026), as on the web where Staff / Interns are
// admin-only; the apps give everyone else an SOP tab instead of Team. Old apps are force-updated.
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Only admins can see the staff list." }, { status: 403 });

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { department: { select: { name: true } }, user: { select: { roles: true } } },
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
      // Approvers see staff and interns as two lists (web: Staff Management / Intern Management).
      intern: ctx.isAdmin ? isInternRoles(e.user?.roles) : null,
    })),
  });
}

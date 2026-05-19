import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Bulk-reject multiple PENDING leave requests in one shot.
// Mirrors the per-id reject logic: refunds AL + OT pending, notifies the employee.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["MANAGER", "HR", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const reason: string | null = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();
  const alOtType = await prisma.leaveType.findUnique({ where: { code: "AL_OT" } });

  const results: { rejected: string[]; skipped: { id: string; reason: string }[] } = {
    rejected: [],
    skipped: [],
  };

  for (const id of ids) {
    try {
      const leaveRequest = await prisma.leaveRequest.findUnique({
        where: { id },
        include: { employee: { include: { user: true } }, leaveType: true },
      });
      if (!leaveRequest) {
        results.skipped.push({ id, reason: "not found" });
        continue;
      }
      if (leaveRequest.status !== "PENDING") {
        results.skipped.push({ id, reason: `status is ${leaveRequest.status}` });
        continue;
      }

      const otDaysUsed = Number(leaveRequest.otDaysUsed);

      await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          approverId: session.user.employeeId,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });

      await prisma.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: leaveRequest.employeeId,
            leaveTypeId: leaveRequest.leaveTypeId,
            year: currentYear,
          },
        },
        data: { pending: { decrement: Number(leaveRequest.days) } },
      });

      if (otDaysUsed > 0 && alOtType) {
        await prisma.leaveBalance.updateMany({
          where: {
            employeeId: leaveRequest.employeeId,
            leaveTypeId: alOtType.id,
            year: currentYear,
          },
          data: { pending: { decrement: otDaysUsed } },
        });
      }

      try {
        if (leaveRequest.employee?.user) {
          await prisma.notification.create({
            data: {
              userId: leaveRequest.employee.user.id,
              title: "Leave Request Rejected",
              message: `Your ${leaveRequest.leaveType?.name ?? "leave"} request was rejected.${reason ? ` Reason: ${reason}` : ""}`,
              type: "LEAVE_REJECTED",
              link: "/leave",
            },
          });
        }
      } catch {
        // Non-critical
      }

      results.rejected.push(id);
    } catch (err) {
      console.error(`Bulk-reject failed for leave ${id}:`, err);
      results.skipped.push({ id, reason: err instanceof Error ? err.message : "error" });
    }
  }

  return NextResponse.json(results);
}

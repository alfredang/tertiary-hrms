import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeaveList } from "@/components/leave/leave-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = 'force-dynamic';

async function getLeaveStats(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const [pending, approved, rejected] = await Promise.all([
    prisma.leaveRequest.count({ where: { ...where, status: "PENDING" } }),
    prisma.leaveRequest.count({ where: { ...where, status: "APPROVED" } }),
    prisma.leaveRequest.count({ where: { ...where, status: "REJECTED" } }),
  ]);

  return { pending, approved, rejected };
}

async function getLeaveRequests(employeeId?: string) {
  const where = employeeId ? { employeeId } : {};

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      },
      leaveType: { select: { name: true, code: true } },
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests;
}

export default async function LeavePage() {
  const session = await auth();

  // Staff can only see their own leave requests
  const employeeId =
    session?.user?.role === "STAFF" ? session.user.employeeId : undefined;

  const [stats, requests] = await Promise.all([
    getLeaveStats(employeeId),
    getLeaveRequests(employeeId),
  ]);

  const isManager =
    session?.user?.role === "MANAGER" ||
    session?.user?.role === "HR" ||
    session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Leave Management</h1>
          <p className="text-gray-400 mt-1">Manage time off requests</p>
        </div>
        <Link href="/leave/request">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Request Leave
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-950/50">
              <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.pending}</p>
              <p className="text-sm text-gray-400">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-950/50">
              <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.approved}</p>
              <p className="text-sm text-gray-400">Approved</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-950/50">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.rejected}</p>
              <p className="text-sm text-gray-400">Rejected</p>
            </div>
          </div>
        </div>
      </div>

      <LeaveList requests={requests} isManager={isManager} />
    </div>
  );
}

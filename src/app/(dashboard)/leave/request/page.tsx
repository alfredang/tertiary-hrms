import { prisma } from "@/lib/prisma";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";

export const dynamic = "force-dynamic";

async function getLeaveTypes() {
  return prisma.leaveType.findMany({ orderBy: { name: "asc" } });
}

export default async function LeaveRequestPage() {
  const leaveTypes = await getLeaveTypes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Request Leave</h1>
        <p className="text-gray-400 mt-1">Submit a new leave application</p>
      </div>

      <LeaveRequestForm leaveTypes={leaveTypes} />
    </div>
  );
}

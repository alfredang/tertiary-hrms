import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { LeaveEditForm } from "@/components/leave/leave-edit-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

export default async function LeaveEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();

  if (!isDevAuthSkipped() && !session?.user) {
    redirect("/login");
  }

  const currentEmployeeId = session?.user?.employeeId ?? null;

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: { select: { name: true, code: true } },
    },
  });

  if (!leaveRequest) {
    return (
      <div className="space-y-6">
        <Link href="/leave">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Leave
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">Leave request not found.</p>
        </div>
      </div>
    );
  }

  // Ownership check
  if (
    !isDevAuthSkipped() &&
    leaveRequest.employeeId !== currentEmployeeId
  ) {
    return (
      <div className="space-y-6">
        <Link href="/leave">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Leave
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">You do not have permission to edit this leave request.</p>
        </div>
      </div>
    );
  }

  // Status check — only PENDING can be edited
  if (leaveRequest.status !== "PENDING") {
    return (
      <div className="space-y-6">
        <Link href="/leave">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Leave
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">
            This leave request can no longer be edited (status: {leaveRequest.status}).
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Only pending leave requests can be edited. Please contact HR if you need changes.
          </p>
        </div>
      </div>
    );
  }

  const startDate = leaveRequest.startDate.toISOString().split("T")[0];
  const endDate = leaveRequest.endDate.toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Edit Leave Request</h1>
        <p className="text-gray-400 mt-1">Update your pending leave request</p>
      </div>
      <LeaveEditForm
        leaveId={id}
        leaveTypeName={leaveRequest.leaveType.name}
        leaveTypeCode={leaveRequest.leaveType.code}
        initialData={{
          startDate,
          endDate,
          reason: leaveRequest.reason ?? "",
          documentUrl: leaveRequest.documentUrl,
          documentFileName: leaveRequest.documentFileName,
          dayType: leaveRequest.dayType,
          halfDayPosition: leaveRequest.halfDayPosition,
        }}
      />
    </div>
  );
}

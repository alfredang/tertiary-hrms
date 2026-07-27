import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { TimeOffList } from "@/components/time-off/time-off-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

async function getTimeOffRequests(employeeId?: string) {
  return prisma.timeOffRequest.findMany({
    where: employeeId ? { employeeId } : {},
    include: {
      employee: { select: { id: true, name: true, department: { select: { name: true } } } },
      approver: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export default async function TimeOffPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  let role = "STAFF";
  let currentEmployeeId: string | undefined;

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    currentEmployeeId = adminUser?.employee?.id;
  } else {
    if (!session?.user) return null;
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
  }

  const isAdmin = hasAdminAccess(role);
  const viewAs = isAdmin ? viewMode : "staff";

  // Safety: never fall through to "all requests" when a staff view has no
  // employee record — that would leak everyone's data.
  if (viewAs !== "admin" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Time Off</h1>
        <p className="text-sm sm:text-base text-gray-400">
          Your employee profile has not been set up yet. Please contact HR.
        </p>
      </div>
    );
  }

  const requests = await getTimeOffRequests(
    viewAs !== "admin" ? currentEmployeeId : undefined
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Time Off</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {viewAs === "admin"
              ? "Review and approve employee time off requests"
              : "Request a few hours off — sent to your manager for approval"}
          </p>
        </div>
        {viewAs !== "admin" && (
          <Link href="/time-off/request" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Request Time Off
            </Button>
          </Link>
        )}
      </div>

      <TimeOffList requests={requests} isManager={viewAs === "admin"} />
    </div>
  );
}

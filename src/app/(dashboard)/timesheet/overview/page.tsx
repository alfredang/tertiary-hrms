import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/utils";
import { AdminTimesheetOverview } from "@/components/timesheet/admin-timesheet-overview";

export const dynamic = "force-dynamic";

export default async function TimesheetOverviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasAdminAccess(session.user.role)) redirect("/timesheet");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Timesheet Overview</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Weekly submission compliance across all active employees.
        </p>
      </div>
      <AdminTimesheetOverview />
    </div>
  );
}

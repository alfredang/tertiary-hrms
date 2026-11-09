import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/utils";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { AdminTimesheetOverview } from "@/components/timesheet/admin-timesheet-overview";
import { AdminAttendanceOverview } from "@/components/timesheet/admin-attendance-overview";
import { CorrectionApprovals } from "@/components/attendance/punch-corrections";

export const dynamic = "force-dynamic";

/** Admin Timesheet (interns): missing-punch approvals, Off In Lieu approvals, monthly clock-in days and hours. */
export default async function TimesheetOverviewPage() {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) redirect("/login");
    if (!hasAdminAccess(session.user.role)) redirect("/timesheet");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Timesheet</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Interns&apos; clock-in / clock-out days and hours by month. Select an intern to see each day.
        </p>
      </div>
      <CorrectionApprovals />
      <AdminTimesheetOverview showWeekly={false} />
      <AdminAttendanceOverview />
    </div>
  );
}

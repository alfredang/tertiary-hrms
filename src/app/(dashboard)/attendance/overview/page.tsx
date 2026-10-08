import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/utils";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { AdminAttendanceOverview } from "@/components/timesheet/admin-attendance-overview";

export const dynamic = "force-dynamic";

export default async function AttendanceOverviewPage() {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) redirect("/login");
    if (!hasAdminAccess(session.user.role)) redirect("/attendance");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Intern Attendance</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Daily check-in / check-out history and total hours for each intern. Select a row to see their days.
        </p>
      </div>
      <AdminAttendanceOverview />
    </div>
  );
}

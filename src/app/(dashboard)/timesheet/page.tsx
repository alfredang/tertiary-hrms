import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import { WeeklyTimesheet } from "@/components/timesheet/weekly-timesheet";

export const dynamic = "force-dynamic";

export default async function TimesheetPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = hasAdminAccess(session.user.role);
  const viewMode = await getViewMode();

  // Only staff/intern view — redirect admin and accountant views
  if (isAdmin && viewMode === "admin") redirect("/dashboard");
  if (isAdmin && viewMode === "accountant") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Weekly Timesheet</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Log your daily working hours. Hours on weekends and public holidays earn OT leave.
        </p>
      </div>
      <WeeklyTimesheet />
    </div>
  );
}

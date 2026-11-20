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

  // Staff, intern and accountant views (accountants clock in like interns, Alfred, 20 Nov 2026).
  // Admin view uses /timesheet/overview instead.
  if (isAdmin && viewMode === "admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Weekly Timesheet</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          If you work on a weekend or public holiday, log your hours here. Off In Lieu days are credited after admin approval.
        </p>
      </div>
      <WeeklyTimesheet />
    </div>
  );
}

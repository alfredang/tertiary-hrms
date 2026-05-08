import { auth } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/utils";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { AttendanceLog } from "@/components/attendance/attendance-log";
import { OtApprovalPanel } from "@/components/attendance/ot-approval-panel";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getViewMode } from "@/lib/view-mode";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  let role = "STAFF";

  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) return null;
    role = session.user.role;
  } else {
    role = "ADMIN";
  }

  const isAdmin = hasAdminAccess(role);
  const viewMode = await getViewMode();
  const isAdminView = isAdmin && viewMode === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Time Attendance</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          {isAdminView
            ? "View and manage employee attendance records"
            : "Track your daily work hours and overtime leave"}
        </p>
      </div>

      {isAdminView ? (
        <AttendanceLog isAdmin={true} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ClockWidget />
          </div>
          <div className="lg:col-span-2">
            <AttendanceLog isAdmin={false} />
          </div>
        </div>
      )}

      {isAdminView && <OtApprovalPanel />}
    </div>
  );
}

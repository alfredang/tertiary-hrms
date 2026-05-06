import { auth } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/utils";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { AttendanceLog } from "@/components/attendance/attendance-log";
import { OtApprovalPanel } from "@/components/attendance/ot-approval-panel";
import { isDevAuthSkipped } from "@/lib/dev-auth";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Time Attendance</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Track your daily work hours and overtime leave
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Clock widget takes 1/3 on large screens */}
        <div className="lg:col-span-1">
          <ClockWidget />
        </div>

        {/* Attendance log takes 2/3 */}
        <div className="lg:col-span-2">
          <AttendanceLog isAdmin={isAdmin} />
        </div>
      </div>

      {/* Admin-only: OT approval panel */}
      {isAdmin && (
        <OtApprovalPanel />
      )}
    </div>
  );
}

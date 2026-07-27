import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { ClockWidget } from "@/components/timesheet/clock-widget";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Clock In / Out</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Tap the button when you start and end work. Your hours are recorded automatically.
        </p>
      </div>
      <ClockWidget />
    </div>
  );
}

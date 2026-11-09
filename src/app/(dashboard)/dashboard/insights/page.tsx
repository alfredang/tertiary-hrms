import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getInternAttendance, getLeaveOverview, getPendingApprovals } from "@/lib/hr-insights";
import { buildFindings, type Finding } from "@/lib/hr-compliance";
import { AdminHrOverview } from "@/components/dashboard/admin-hr-overview";

export const dynamic = "force-dynamic";

const LABEL: Record<Finding["category"], string> = {
  AL_EXCESS: "Annual leave over entitlement",
  MC_EXCESS: "MC above entitlement",
  MC_PATTERN: "MC patterns to review",
  NPL: "No Pay Leave near / over cap",
  ATTENDANCE: "Intern missed clock-in / out",
};

/** HR Insights: the detail behind the dashboard tiles (alerts, approvals, leave per person, intern hours). */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) redirect("/login");
    if (!hasAdminAccess(session.user.role)) redirect("/dashboard");
  }
  const { cat } = await searchParams;
  const now = new Date();
  const [people, interns, pending] = await Promise.all([getLeaveOverview(now), getInternAttendance(14, now), getPendingApprovals()]);
  const all = buildFindings(people, interns);
  const focus = cat && cat in LABEL ? (cat as Finding["category"]) : undefined;
  const findings = focus ? all.filter((f) => f.category === focus) : all;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-white">HR Insights</h1>
          <p className="text-sm text-gray-400">Alerts, approvals, leave per person and intern hours.</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs">
          {focus && <Link href="/dashboard/insights#alerts" className="rounded-full border border-primary/60 px-3 py-1 text-primary">Show all alerts</Link>}
          {(["alerts", "leave", "interns"] as const).map((a) => (
            <a key={a} href={`#${a}`} className="rounded-full border border-gray-800 px-3 py-1 capitalize text-gray-300 hover:border-primary/60">{a === "interns" ? "Intern hours" : a}</a>
          ))}
        </nav>
      </div>
      <AdminHrOverview
        people={people}
        interns={interns}
        pending={pending}
        findings={findings}
        monthLabel={now.toLocaleDateString("en-SG", { month: "short", timeZone: "Asia/Singapore" })}
        year={now.getFullYear()}
        focusLabel={focus ? LABEL[focus] : undefined}
      />
    </div>
  );
}

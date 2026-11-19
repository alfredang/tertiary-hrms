import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getAnalyticsData } from "@/lib/analytics";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";

export const dynamic = "force-dynamic";

/** Analytics: 12 months of revenue and expenses, leave and MC per person, and headcount, with filters. */
export default async function AnalyticsPage() {
  // Same gate as /accounting: the page shows bank totals.
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) redirect("/login");
    const role = (session.user as { role?: string }).role ?? "STAFF";
    if (!hasAdminAccess(role)) redirect("/dashboard");
  }
  const data = await getAnalyticsData(new Date(), { finance: true });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400">The last 12 months: revenue and expenses, leave and MC, and headcount.</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs">
          {([["finance", "Revenue and expenses"], ["leave", "Leave and MC"], ["headcount", "Number of staff"]] as const).map(([a, label]) => (
            <a key={a} href={`#${a}`} className="rounded-full border border-gray-800 px-3 py-1 text-gray-300 hover:border-primary/60">{label}</a>
          ))}
        </nav>
      </div>
      <AnalyticsDashboard data={data} />
    </div>
  );
}

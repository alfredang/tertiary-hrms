import { NextRequest, NextResponse } from "next/server";
import { cronAuthError, notifyAdmins } from "@/lib/admin-alerts";
import { withCronRun } from "@/lib/cron-runs";
import { getInternAttendance, getLeaveOverview } from "@/lib/hr-insights";
import { buildFindings, findingsEmailHtml } from "@/lib/hr-compliance";

export const dynamic = "force-dynamic";

// HR compliance agent — weekly, Monday 08:30 SGT (Coolify "30 0 * * 1").
// Checks every active staff member and intern for: No Pay Leave nearing/over the
// prorated 21-day cap, MC above the prorated entitlement (or any paid MC by an
// intern), patterned MC (Mondays/Fridays, many single-day MCs), annual leave beyond
// entitlement, and interns with repeated missed clock-ins/outs (last 14 days).
// The summary goes to the admins (Alfred Ang, Tan Soik Ching) as an in-app
// notification and an email. ?dryRun=1 returns the findings without alerting.
//
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const authErr = cronAuthError(req);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  try {
    const result = await withCronRun("hr-compliance", async () => {
      const [people, interns] = await Promise.all([getLeaveOverview(), getInternAttendance(14)]);
      const findings = buildFindings(people, interns);
      const counts = {
        high: findings.filter((f) => f.severity === "high").length,
        medium: findings.filter((f) => f.severity === "medium").length,
        low: findings.filter((f) => f.severity === "low").length,
      };
      const heading = `Weekly HR compliance check: ${findings.length} finding(s) across ${people.length} staff and ${interns.length} intern(s) — ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;

      let alert: Awaited<ReturnType<typeof notifyAdmins>> | null = null;
      if (!dryRun) {
        alert = await notifyAdmins({
          title: "Weekly HR compliance check",
          message: findings.length === 0 ? "No compliance issues found this week." : heading,
          type: "HR_COMPLIANCE",
          link: "/dashboard",
          subject: findings.length === 0 ? "HR compliance: no issues this week" : `HR compliance: ${counts.high} high, ${counts.medium} medium, ${counts.low} low`,
          html: findingsEmailHtml(findings, heading, process.env.NEXT_PUBLIC_APP_URL || ""),
        });
      }
      return { ok: true, dryRun, checked: { staff: people.length, interns: interns.length }, counts, findings, ...(alert ?? {}) };
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[hr-compliance] failed:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

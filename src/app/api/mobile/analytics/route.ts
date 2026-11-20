import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { getAnalyticsData } from "@/lib/analytics";
import { getWorkforceBreakdown } from "@/lib/workforce-breakdown";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/analytics — the data behind the web /dashboard/analytics page, for the apps:
 * the last 12 months of bank revenue and expenses, approved leave per person and headcount,
 * plus the workforce breakdown (gender, age group, ethnic group) from the admin dashboard.
 * Approvers only (ADMIN / HR / MANAGER), the same gate as the web page. The apps filter and
 * slice it on the device, exactly as the web page does in the browser.
 */
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const now = new Date();
    // `breakdown`: one row per active person (intern, gender, ageGroup, ethnicGroup) for the
    // workforce donuts; null if it could not be loaded, so the rest still renders.
    const [data, breakdown] = await Promise.all([
      getAnalyticsData(now, { finance: true }),
      getWorkforceBreakdown(now).catch(() => null),
    ]);
    return NextResponse.json({ ...data, breakdown });
  } catch (err) {
    console.error("[mobile/analytics]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not load analytics" }, { status: 500 });
  }
}

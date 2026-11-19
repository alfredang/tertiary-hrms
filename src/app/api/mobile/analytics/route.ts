import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { getAnalyticsData } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/analytics — the data behind the web /dashboard/analytics page, for the apps:
 * the last 12 months of bank revenue and expenses, approved leave per person and headcount.
 * Approvers only (ADMIN / HR / MANAGER), the same gate as the web page. The apps filter and
 * slice it on the device, exactly as the web page does in the browser.
 */
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await getAnalyticsData(new Date(), { finance: true }));
  } catch (err) {
    console.error("[mobile/analytics]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not load analytics" }, { status: 500 });
  }
}

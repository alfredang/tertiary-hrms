import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { getAttendanceSummary } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// GET /api/attendance/summary?month=YYYY-MM — admin only.
// Per-intern days worked + total hours for the month.
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const month = new URL(req.url).searchParams.get("month");
  return NextResponse.json(await getAttendanceSummary(month));
}

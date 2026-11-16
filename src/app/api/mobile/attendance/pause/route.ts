import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { pauseClock } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// POST /api/mobile/attendance/pause
export async function POST() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId)
    return NextResponse.json({ error: "No employee profile linked" }, { status: 400 });

  try {
    const punch = await pauseClock(ctx.employeeId);
    return NextResponse.json({ id: punch.id, pausedAt: punch.pausedAt?.toISOString() ?? null, breakSeconds: punch.breakSeconds });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not pause" },
      { status: 400 },
    );
  }
}

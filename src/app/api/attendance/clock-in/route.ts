import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { clockIn, toPunchDto } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// POST /api/attendance/clock-in
export async function POST() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  if (!ctx.employeeId)
    return NextResponse.json({ error: "No employee profile linked" }, { status: 400 });

  try {
    const punch = await clockIn(ctx.employeeId);
    return NextResponse.json(toPunchDto(punch));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not clock in" },
      { status: 400 },
    );
  }
}

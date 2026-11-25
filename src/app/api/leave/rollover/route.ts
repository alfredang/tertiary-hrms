import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { rollOverAnnualLeave } from "@/lib/al-rollover";

/**
 * Manual AL year-end rollover (the same code also runs automatically every day in January from
 * the 08:30 SGT roll-up cron). Body: { fromYear, dryRun? }. Carry forward is one year only.
 */
export async function POST(request: Request) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { fromYear?: number; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const fromYear = body.fromYear;
  if (!fromYear || typeof fromYear !== "number" || fromYear < 2020 || fromYear > 2100) {
    return NextResponse.json({ error: "Invalid fromYear" }, { status: 400 });
  }

  try {
    const r = await rollOverAnnualLeave(fromYear, { apply: !body.dryRun });
    return NextResponse.json({
      success: true,
      fromYear: r.fromYear,
      targetYear: r.toYear,
      applied: r.apply,
      totalCarried: r.rows.reduce((t, x) => t + x.carried, 0),
      employeesProcessed: r.rows.length,
      summary: r.rows,
    });
  } catch (error) {
    console.error("Rollover error:", error);
    return NextResponse.json({ error: "Rollover failed" }, { status: 500 });
  }
}

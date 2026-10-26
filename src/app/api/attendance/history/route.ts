import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { getAttendanceHistory, monthRange } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// GET /api/attendance/history?month=YYYY-MM[&employeeId=…]
// Daily clock-in/out history + monthly total. Anyone can read their own;
// reading another employee's history needs admin access.
export async function GET(req: Request) {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();

  const params = new URL(req.url).searchParams;
  const month = params.get("month");
  const requested = params.get("employeeId");
  const employeeId = requested || ctx.employeeId;

  if (requested && requested !== ctx.employeeId && !ctx.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!employeeId) {
    return NextResponse.json({
      month: monthRange(month).month,
      employee: null,
      days: [],
      totalHours: 0,
      daysWorked: 0,
    });
  }

  const history = await getAttendanceHistory(employeeId, month);
  if (!history) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  return NextResponse.json(history);
}

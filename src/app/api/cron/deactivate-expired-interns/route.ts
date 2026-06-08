import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Deactivates intern accounts whose employment end date has passed.
// An INACTIVE employee is blocked from every login path (see src/lib/auth.ts).
// Gated by the `autoDeactivateInterns` flag in CompanySettings — toggle it in
// Settings → Cron Jobs.
//
// Schedule in Coolify (daily, 00:30 SGT = 16:30 UTC): 30 16 * * *
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
    select: { autoDeactivateInterns: true },
  });
  if (!settings?.autoDeactivateInterns) {
    return NextResponse.json({ ok: true, skipped: "feature disabled", deactivated: 0 });
  }

  // Today at 00:00 SGT, expressed as the matching UTC midnight (mirrors the
  // timesheet-reminder cron). Comparing endDate < this keeps an intern active
  // through their final day and deactivates them the day after endDate.
  const sgtDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const todayKey = sgtDate.toISOString().slice(0, 10); // YYYY-MM-DD in SGT
  const todayStart = new Date(
    Date.UTC(
      Number(todayKey.slice(0, 4)),
      Number(todayKey.slice(5, 7)) - 1,
      Number(todayKey.slice(8, 10)),
    ),
  );

  const expired = await prisma.employee.findMany({
    where: {
      employmentType: "INTERN",
      status: "ACTIVE",
      endDate: { not: null, lt: todayStart },
    },
    select: { id: true, name: true, email: true, employeeId: true, endDate: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ ok: true, date: todayKey, deactivated: 0 });
  }

  const result = await prisma.employee.updateMany({
    where: { id: { in: expired.map((e) => e.id) } },
    data: { status: "INACTIVE" },
  });

  const deactivated = expired.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    email: e.email,
    endDate: e.endDate?.toISOString().slice(0, 10) ?? null,
  }));

  console.log(
    `[deactivate-expired-interns] ${todayKey}: deactivated ${result.count} intern(s): ` +
      deactivated.map((d) => `${d.employeeId} (${d.name}, ended ${d.endDate})`).join(", "),
  );

  return NextResponse.json({ ok: true, date: todayKey, deactivated: result.count, interns: deactivated });
}

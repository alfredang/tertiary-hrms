import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";

// Runs at 09:30 UTC = 5:30 PM SGT, every day
// Schedule in Coolify: 30 9 * * *
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Derive today's date in SGT (UTC+8)
  const nowUTC = Date.now();
  const sgtMs = nowUTC + 8 * 60 * 60 * 1000;
  const sgtDate = new Date(sgtMs);
  const todayKey = sgtDate.toISOString().slice(0, 10); // YYYY-MM-DD in SGT

  const todayDate = new Date(Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
  ));

  // Only send reminders on weekends or public holidays
  const dayOfWeek = sgtDate.getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const holiday = await prisma.publicHoliday.findFirst({
    where: { date: todayDate, countryCode: "SG" },
  });
  const isNonWorkDay = isWeekend || !!holiday;

  if (!isNonWorkDay) {
    return NextResponse.json({ ok: true, skipped: "weekday — no reminder needed" });
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = settings?.name || "HR Portal";
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const dayLabel = holiday ? `Public Holiday (${holiday.name})` : "Weekend";

  // Fetch all active employees who haven't submitted hours for today
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      email: true,
      user: { select: { email: true } },
      leaveRequests: {
        where: {
          status: "APPROVED",
          startDate: { lte: todayDate },
          endDate: { gte: todayDate },
        },
        select: { id: true },
        take: 1,
      },
      timesheetEntries: {
        where: { date: todayDate, hours: { gt: 0 } },
        select: { hours: true },
        take: 1,
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let noEmail = 0;
  const emailErrors: string[] = [];

  for (const emp of employees) {
    // Skip employees on approved leave today
    if (emp.leaveRequests.length > 0) { skipped++; continue; }
    // Skip if they've already submitted hours
    if (emp.timesheetEntries.length > 0) { skipped++; continue; }

    const toEmail = emp.email || emp.user?.email;
    if (!toEmail) { noEmail++; continue; }

    try {
      await sendEmail({
        to: toEmail,
        subject: `Are you working today? Log your hours for Off In Lieu - ${companyName}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">
<p>Hi ${emp.name},</p>
<p>Today (<strong>${todayKey}</strong>) is a <strong>${dayLabel}</strong>. If you are working today, please log your hours in the HR Portal before <strong>11:30 PM SGT</strong> to earn Off In Lieu days.</p>
<p style="margin:20px 0;">
  <a href="${siteUrl}/timesheet"
     style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;">
    Log Hours
  </a>
</p>
<p style="color:#6b7280;font-size:12px;">If you are not working today, please ignore this reminder. Off In Lieu days are credited after admin approval.</p>
<p>- ${companyName}</p>
</div>`,
      });
      sent++;
    } catch (err: any) {
      const msg = `${emp.name}: ${err?.message ?? "unknown error"}`;
      emailErrors.push(msg);
      console.error(`[timesheet-reminder] Failed to send to ${toEmail}:`, err);
    }
  }

  console.log(`[timesheet-reminder] ${todayKey}: sent=${sent}, skipped=${skipped}, noEmail=${noEmail}, errors=${emailErrors.length}`);
  return NextResponse.json({
    ok: true,
    date: todayKey,
    dayLabel,
    sent,
    skipped,
    noEmail,
    ...(emailErrors.length > 0 ? { emailErrors } : {}),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";

// Runs at 10:00 UTC = 6:00 PM SGT, Mon–Fri
// Schedule in Coolify: 0 10 * * 1-5
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

  // Skip weekends (0=Sun, 6=Sat in SGT)
  const sgtDay = sgtDate.getUTCDay();
  if (sgtDay === 0 || sgtDay === 6) {
    return NextResponse.json({ ok: true, skipped: "weekend" });
  }

  const todayDate = new Date(Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
  ));

  // Skip public holidays
  const holiday = await prisma.publicHoliday.findFirst({
    where: { date: todayDate, countryCode: "SG" },
  });
  if (holiday) {
    return NextResponse.json({ ok: true, skipped: `public holiday: ${holiday.name}` });
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" } });
  const companyName = settings?.name || "HR Portal";
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  // Fetch all active employees with leave and timesheet status for today
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
        where: { date: todayDate },
        select: { hours: true },
        take: 1,
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const emp of employees) {
    // Skip employees on approved leave today (auto-zero, no entry needed)
    if (emp.leaveRequests.length > 0) { skipped++; continue; }

    // Skip if they've already saved an entry for today
    if (emp.timesheetEntries.length > 0) { skipped++; continue; }

    const toEmail = emp.email || emp.user?.email;
    if (!toEmail) { skipped++; continue; }

    try {
      await sendEmail({
        to: toEmail,
        subject: `Reminder: Log your work hours for today — ${companyName}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">
<p>Hi ${emp.name},</p>
<p>This is a reminder that your work hours for today (<strong>${todayKey}</strong>) have not been logged in the HR Portal yet.</p>
<p>Please enter your hours before <strong>10:00 PM SGT</strong> tonight — the timesheet locks after that and cannot be edited.</p>
<p style="margin:20px 0;">
  <a href="${siteUrl}/timesheet"
     style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;">
    Go to Timesheet
  </a>
</p>
<p style="color:#6b7280;font-size:12px;">If you are on leave today, you can ignore this email — your hours will be recorded as 0 automatically.</p>
<p>— ${companyName}</p>
</div>`,
      });
      sent++;
    } catch (err) {
      console.error(`[timesheet-reminder] Failed to send to ${toEmail}:`, err);
    }
  }

  console.log(`[timesheet-reminder] ${todayKey}: sent=${sent}, skipped=${skipped}`);
  return NextResponse.json({ ok: true, date: todayKey, sent, skipped });
}

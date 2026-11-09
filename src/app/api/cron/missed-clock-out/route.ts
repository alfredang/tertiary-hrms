import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/send-email";
import { cronAuthError, escapeHtml, notifyAdmins, sgtToday } from "@/lib/admin-alerts";
import { withCronRun } from "@/lib/cron-runs";
import { getActiveInterns, getMissedPunches } from "@/lib/hr-insights";
import { addDays } from "@/lib/attendance-policy";

export const dynamic = "force-dynamic";

// Interns must clock in and out every workday (AttendancePunch).
//
// mode=reminder (default) — 21:00 SGT daily (Coolify "0 13 * * *"): every intern who
//   clocked in today but not out, or did not clock in on a scheduled workday (not on
//   leave, not a public holiday), gets an in-app notification + email asking them to
//   clock out now or submit a missing-punch correction on /attendance.
// mode=rollup — 08:30 SGT daily (Coolify "30 0 * * *"): admins (Alfred Ang, Tan Soik
//   Ching) get one summary of every uncorrected missed punch in the last 7 days.
//
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const authErr = cronAuthError(req);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const mode = new URL(req.url).searchParams.get("mode") === "rollup" ? "rollup" : "reminder";
  try {
    const result = await withCronRun<Record<string, unknown>>(
      mode === "rollup" ? "missed-clock-out-rollup" : "missed-clock-out-reminder",
      () => (mode === "rollup" ? runRollup() : runReminder()),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[missed-clock-out] ${mode} failed:`, err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

const siteUrl = () => process.env.NEXT_PUBLIC_APP_URL || "";

async function runReminder() {
  const today = sgtToday();
  const date = today.toISOString().slice(0, 10);
  const interns = await getActiveInterns();
  const missed = await getMissedPunches(interns, today, addDays(today, 1));
  const byId = new Map(interns.map((i) => [i.id, i]));
  const settings = await prisma.companySettings.findUnique({ where: { id: "company_settings" }, select: { name: true } });
  const company = settings?.name || "TIA HRMS";

  let notified = 0;
  let emailed = 0;
  const errors: string[] = [];

  for (const m of missed) {
    const intern = byId.get(m.employeeId);
    if (!intern) continue;
    const noOut = m.kind === "NO_CLOCK_OUT";
    const title = noOut ? "You forgot to clock out" : "You haven't clocked in today";
    const message = noOut
      ? `You clocked in on ${date} but haven't clocked out. Clock out now, or submit a missing clock-out on the Clock In/Out page.`
      : `There is no clock-in for ${date}. If you worked today, submit a missing clock-in on the Clock In/Out page.`;
    try {
      await prisma.notification.create({
        data: { userId: intern.userId, title, message, type: "ATTENDANCE_MISSED", link: "/attendance" },
      });
      notified++;
    } catch (err) {
      errors.push(`notify ${intern.employeeCode}: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await sendEmail({
        to: intern.email,
        subject: `${title} (${date}) - ${company}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;">
<p>Hi ${escapeHtml(intern.name)},</p>
<p>${escapeHtml(message)}</p>
<p style="margin:20px 0;"><a href="${siteUrl()}/attendance" style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Open Clock In/Out</a></p>
<p style="color:#6b7280;font-size:12px;">All interns must clock in and clock out every workday. A missing punch is reviewed by an admin.</p>
<p>- ${escapeHtml(company)}</p>
</div>`,
      });
      emailed++;
    } catch (err) {
      errors.push(`email ${intern.employeeCode}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[missed-clock-out] reminder ${date}: missed=${missed.length} notified=${notified} emailed=${emailed} errors=${errors.length}`);
  return {
    ok: true,
    mode: "reminder",
    date,
    interns: interns.length,
    missedClockOut: missed.filter((m) => m.kind === "NO_CLOCK_OUT").length,
    missedClockIn: missed.filter((m) => m.kind === "NO_CLOCK_IN").length,
    notified,
    emailed,
    ...(errors.length ? { errors } : {}),
  };
}

async function runRollup() {
  const today = sgtToday();
  const interns = await getActiveInterns();
  const missed = await getMissedPunches(interns, addDays(today, -7), today);
  const byId = new Map(interns.map((i) => [i.id, i]));

  if (missed.length === 0) {
    return { ok: true, mode: "rollup", date: today.toISOString().slice(0, 10), missed: 0, notified: 0, emailed: 0 };
  }

  const lines = missed
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => {
      const i = byId.get(m.employeeId);
      return { who: `${i?.name ?? m.employeeId} (${i?.employeeCode ?? "?"})`, date: m.date, what: m.kind === "NO_CLOCK_OUT" ? "No clock-out" : "No clock-in" };
    });
  const noOut = missed.filter((m) => m.kind === "NO_CLOCK_OUT").length;
  const noIn = missed.length - noOut;
  const message = `${noOut} missing clock-out(s) and ${noIn} missing clock-in(s) by interns in the last 7 days, with no correction filed.`;

  const sent = await notifyAdmins({
    title: "Intern missed punches",
    message,
    type: "ATTENDANCE_ROLLUP",
    link: "/attendance/overview",
    subject: `Intern missed punches: ${noOut} clock-out, ${noIn} clock-in (last 7 days)`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px;">
<p>${escapeHtml(message)}</p>
<table style="border-collapse:collapse;font-size:13px">${lines
      .map((l) => `<tr><td style="padding:3px 8px">${escapeHtml(l.date)}</td><td style="padding:3px 8px">${escapeHtml(l.who)}</td><td style="padding:3px 8px;color:#b45309">${l.what}</td></tr>`)
      .join("")}</table>
<p style="margin-top:16px"><a href="${siteUrl()}/attendance/overview" style="color:#2563eb">Review intern attendance and corrections</a></p>
</div>`,
  });

  return { ok: true, mode: "rollup", date: today.toISOString().slice(0, 10), missed: missed.length, noClockOut: noOut, noClockIn: noIn, ...sent };
}

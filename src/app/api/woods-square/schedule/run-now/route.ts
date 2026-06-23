import { NextResponse } from "next/server";
import { getCurrentUser, isAdminUser } from "@/lib/woods-square-auth";
import { getScheduleConfig } from "@/lib/woods-square-schedule";
import { runScheduledSend } from "@/lib/woods-square-scheduler";

// Drives a real browser (one session per 7-day window), so needs the Node runtime + headroom.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Manual "Run now" for the monthly scheduler. Fires the SAME upcoming-month logic the timer/
 * cron would run, immediately, using the currently-saved config — so it respects Test mode:
 * test mode targets only the configured recipient, production targets the whole roster.
 *
 * Admin-only. It bypasses ONLY the timing gates; every safety in the send-core still applies
 * (roster guard, left-staff filter, dedup, and the single-flight lock that prevents it from
 * overlapping with the timer or a second click). So it can't double-send, mass-fan, or overload.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getScheduleConfig();
  if (config.testMode && config.testRecipientIds.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one test recipient before running a test." },
      { status: 400 },
    );
  }

  try {
    const result = await runScheduledSend({
      mode: config.testMode ? "test" : "production",
      testRecipientIds: config.testRecipientIds,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[woods-square-run-now] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

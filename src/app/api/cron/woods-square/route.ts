import { NextRequest, NextResponse } from "next/server";
import { maybeRunSchedule } from "@/lib/woods-square-scheduler";

// Drives a real browser, so needs the Node runtime + a generous duration.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Woods Square monthly auto-invite trigger (HTTP). The app ALSO runs a built-in minute
 * timer (see instrumentation.ts → startScheduleTimer), so this endpoint is optional —
 * it's here for an external scheduler or manual trigger. Both share the same self-guard
 * (`maybeRunSchedule`): test mode fires once `testFireAt` passes; production fires on the
 * last Monday at/after noon SGT, once per day.
 *
 * Optional Coolify schedule (header: Authorization: Bearer <CRON_SECRET>): e.g. "*\/10 * * * *".
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await maybeRunSchedule();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // A failed scheduled run (DB hiccup, Habitap automation throw, etc.) returns a clean
    // error here instead of an unhandled rejection / messy 500.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[woods-square-cron] run failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

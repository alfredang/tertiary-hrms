import { NextResponse } from "next/server";
import { getCurrentUser, isAdminUser } from "@/lib/woods-square-auth";
import { getLockStatus } from "@/lib/process-lock";
import { SEND_LOCK_KEY } from "@/lib/woods-square-send";

export const dynamic = "force-dynamic";

/**
 * Lightweight poll for whether a Woods Square send is in flight right now — reads the
 * shared single-flight lock so the admin UI can show a "send in progress" indicator and
 * disable its triggers BEFORE a click hits the 409. Read-only; never touches the lock.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { running, since } = await getLockStatus(SEND_LOCK_KEY);
  return NextResponse.json({ running, since: since?.toISOString() ?? null });
}

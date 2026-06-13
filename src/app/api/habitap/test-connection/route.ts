import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { getHabitapCredentials, testHabitapLogin } from "@/lib/habitap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function requireAdmin() {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  return hasAdminAccess(session?.user?.role);
}

// Verifies the stored Woods Square login works — logs in and closes, sends nothing.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await getHabitapCredentials();
  if (!creds) {
    return NextResponse.json(
      { ok: false, error: "No credentials set. Add HABITAP_USERNAME / HABITAP_PASSWORD in Settings → Credentials." },
      { status: 400 },
    );
  }

  try {
    await testHabitapLogin(creds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

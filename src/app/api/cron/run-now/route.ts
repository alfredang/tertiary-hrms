import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    if (!session?.user || !hasAdminAccess(role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { path, method = "GET" } = await req.json();
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${appUrl}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to reach cron endpoint: ${err?.message ?? err}`, url }, { status: 502 });
  }

  const rawText = await res.text().catch(() => "");
  let body: any = {};
  try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = { rawResponse: rawText.slice(0, 200) }; }

  return NextResponse.json(body, { status: res.status });
}

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

  // Always call localhost in dev so local Run Now doesn't hit the live site
  const appUrl = process.env.NODE_ENV === "production"
    ? (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    : "http://localhost:3000";
  const url = `${appUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}

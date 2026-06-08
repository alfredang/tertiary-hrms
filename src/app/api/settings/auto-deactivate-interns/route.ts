import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import * as z from "zod";

const schema = z.object({ enabled: z.boolean() });

// Toggles the "auto-deactivate expired interns" feature flag on CompanySettings.
// The daily cron at /api/cron/deactivate-expired-interns reads this flag.
export async function PATCH(req: NextRequest) {
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["ADMIN", "HR"].includes((session.user as any).role)) {
      return NextResponse.json({ error: "Forbidden - insufficient permissions" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 400 });
  }

  const settings = await prisma.companySettings.upsert({
    where: { id: "company_settings" },
    update: { autoDeactivateInterns: parsed.data.enabled, updatedAt: new Date() },
    create: { id: "company_settings", autoDeactivateInterns: parsed.data.enabled },
  });

  return NextResponse.json({ ok: true, autoDeactivateInterns: settings.autoDeactivateInterns });
}

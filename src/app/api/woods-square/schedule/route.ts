import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdminUser } from "@/lib/woods-square-auth";
import { getScheduleConfig, saveScheduleConfig } from "@/lib/woods-square-schedule";

export const dynamic = "force-dynamic";

// Admin-editable fields only — the watermarks (lastProdFiredAt / lastTestFiredAt /
// lastAttemptAt / failureNotifiedAt) are internal (set by the scheduler), never via the API.
const scheduleSchema = z.object({
  enabled: z.boolean().optional(),
  testMode: z.boolean().optional(),
  testRecipientIds: z.array(z.string()).optional(),
  testFireAt: z
    .union([z.string().datetime({ offset: true }), z.string().min(1), z.literal(""), z.null()])
    .transform((v) => (v ? v : null))
    .optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ config: await getScheduleConfig() });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = scheduleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const config = await saveScheduleConfig(parsed.data);
  return NextResponse.json({ ok: true, config });
}

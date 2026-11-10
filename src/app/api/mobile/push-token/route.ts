import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  token: z.string().min(16).max(4096),
  platform: z.enum(["ios", "android"]),
  environment: z.enum(["production", "sandbox"]).optional(),
});

// POST /api/mobile/push-token — register (or move) this phone's push token to the signed-in user.
export async function POST(req: NextRequest) {
  const ctx = await getMobileContext();
  if (!ctx?.userId) return unauthorized();
  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const { token, platform, environment } = parsed.data;
  await prisma.deviceToken.upsert({
    where: { token },
    // A phone that changes hands (sign out, sign in as someone else) follows the new user.
    update: { userId: ctx.userId, platform, environment: environment ?? "production" },
    create: { userId: ctx.userId, token, platform, environment: environment ?? "production" },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/mobile/push-token — stop pushing to this phone (called on sign-out).
export async function DELETE(req: NextRequest) {
  const ctx = await getMobileContext();
  if (!ctx?.userId) return unauthorized();
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return NextResponse.json({ error: "token required" }, { status: 400 });
  await prisma.deviceToken.deleteMany({ where: { token: body.token, userId: ctx.userId } });
  return NextResponse.json({ ok: true });
}

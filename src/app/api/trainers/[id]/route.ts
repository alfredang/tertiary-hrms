import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainerAccess } from "@/lib/trainer-access";
import { trainerInputSchema } from "@/lib/trainers";

export const dynamic = "force-dynamic";

/** GET /api/trainers/[id] — full profile incl. NRIC. Trainer Admin only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getTrainerAccess();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, { status: access.status });
  const { id } = await params;
  const trainer = await prisma.trainer.findUnique({ where: { id } });
  if (!trainer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ trainer });
}

/**
 * PATCH /api/trainers/[id] — edit a profile. Sets editedAt so the next import keeps
 * these edits (the importer still refreshes classes taught and TMS status).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getTrainerAccess();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, { status: access.status });
  const { id } = await params;

  const parsed = trainerInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.trainer.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = parsed.data;
  const changed = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k])),
  );
  if (Object.keys(changed).length === 0) return NextResponse.json({ ok: true, changed: [] });

  await prisma.trainer.update({
    where: { id },
    data: {
      ...changed,
      ...(data.trainingCerts ? { isActaTrainer: before.isActaTrainer || data.trainingCerts.length > 0 } : {}),
      editedAt: new Date(),
      editedBy: access.email,
    },
  });
  // Record which fields changed, never the NRIC/phone values themselves.
  await prisma.auditLog.create({
    data: { userId: access.userId, action: "UPDATE", entity: "Trainer", entityId: id, newValue: { fields: Object.keys(changed) } },
  });
  return NextResponse.json({ ok: true, changed: Object.keys(changed) });
}

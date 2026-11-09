import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { mergeTrainerSources, upsertTrainers, type TrainerSources } from "@/lib/trainer-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/agent/trainers/import[?dryRun=1]
//
// The Mac-side Trainer agent (runs on Alfred's MacBook under the local Claude login) builds the
// trainer list from the LOCAL DRIVE — the ACTA Trainers folder, the LMS/TMS snapshot, CVs and
// email applications — and pushes it here. The local drive is the source of truth; Trainer Admin
// edits made in the HRMS are kept (see src/lib/trainer-import.ts).
// Body: { export: {trainers: TrainerRecord[]}, email?: {trainers: EmailTrainer[]}, cv?: {profiles: {...}},
//         renames?: {"folder:<old>": "folder:<NEW>"} }
// Header: Authorization: Bearer <AGENT_API_KEY>  (CompanyCredential, Settings → Credentials)

function authorized(req: NextRequest, key: string): boolean {
  const expected = Buffer.from(`Bearer ${key}`);
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(req: NextRequest) {
  const credential = await prisma.companyCredential.findUnique({ where: { keyName: "AGENT_API_KEY" } });
  const apiKey = credential?.keyValue.trim();
  if (!apiKey) return NextResponse.json({ error: "AGENT_API_KEY not configured in Settings → Credentials" }, { status: 500 });
  if (!authorized(req, apiKey)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as TrainerSources | null;
  if (!body?.export?.trainers || !Array.isArray(body.export.trainers)) {
    return NextResponse.json({ error: "Body must include export.trainers[]" }, { status: 400 });
  }
  if (body.export.trainers.length === 0) {
    // Guard: an empty export (e.g. the ACTA folder failed to mount) must never look like "all trainers left".
    return NextResponse.json({ error: "export.trainers is empty — refusing to import" }, { status: 400 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const { records, report } = mergeTrainerSources(body);
  const result = await upsertTrainers(records, { dryRun, renames: body.renames });
  await prisma.auditLog.create({
    data: {
      action: dryRun ? "IMPORT_DRY_RUN" : "IMPORT",
      entity: "Trainer",
      entityId: "agent",
      newValue: { ...result, total: report.total, added: report.added.length, merged: report.merged.length, cvFilled: report.cvFilled },
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    },
  });
  return NextResponse.json({ dryRun, ...report, ...result });
}

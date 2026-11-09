import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainerAccess } from "@/lib/trainer-access";
import { trainerInputSchema, filterTrainers, type TrainerListItem } from "@/lib/trainers";

export const dynamic = "force-dynamic";

const LIST_SELECT = {
  id: true, name: true, nickname: true, phone: true, email: true, trainerType: true, status: true, inTms: true,
  trainingCerts: true, certifications: true, skills: true, education: true, summary: true, financeBackground: true,
  ibfFitDeclaration: true, classesCount: true, lastClassDate: true, courses: true,
} as const;

/** GET /api/trainers?q=&cert=ACLP&cert=ACTA&tag=PMP&finance=1&ibfFit=1&status=trainers — Trainer Admin only. No NRIC. */
export async function GET(req: NextRequest) {
  const access = await getTrainerAccess();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, { status: access.status });

  const sp = req.nextUrl.searchParams;
  const rows = await prisma.trainer.findMany({ select: LIST_SELECT, orderBy: { name: "asc" } });
  const list: TrainerListItem[] = rows.map(({ courses, ...t }) => ({ ...t, courseTitles: courseTitles(courses) }));
  const status = sp.get("status");
  const trainers = filterTrainers(list, {
    q: sp.get("q") ?? undefined,
    certs: sp.getAll("cert"),
    tags: sp.getAll("tag"),
    finance: sp.get("finance") === "1",
    ibfFit: sp.get("ibfFit") === "1",
    status: status === "trainers" || status === "applicants" ? status : "all",
  });
  return NextResponse.json({ count: trainers.length, trainers });
}

/** POST /api/trainers — add a trainer by hand (e.g. a new ACLP trainer from email). */
export async function POST(req: NextRequest) {
  const access = await getTrainerAccess();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, { status: access.status });

  const parsed = trainerInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (!data.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const sourceKey = data.email ? `email:${data.email}` : `manual:${data.name.toLowerCase()}:${Date.now()}`;
  const existing = await prisma.trainer.findFirst({ where: data.email ? { email: data.email } : { name: { equals: data.name, mode: "insensitive" } } });
  if (existing) return NextResponse.json({ error: `A trainer with this ${data.email ? "email" : "name"} already exists`, id: existing.id }, { status: 409 });

  const trainer = await prisma.trainer.create({
    data: {
      ...data,
      name: data.name,
      sourceKey,
      isActaTrainer: (data.trainingCerts ?? []).length > 0,
      editedAt: new Date(),
      editedBy: access.email,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { userId: access.userId, action: "CREATE", entity: "Trainer", entityId: trainer.id, newValue: { name: data.name } },
  });
  return NextResponse.json({ id: trainer.id }, { status: 201 });
}

function courseTitles(courses: unknown): string[] {
  return Array.isArray(courses) ? courses.map((c) => String((c as { title?: string })?.title ?? "")).filter(Boolean) : [];
}

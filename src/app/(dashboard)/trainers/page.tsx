import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTrainerAccess } from "@/lib/trainer-access";
import { TrainerDirectory } from "@/components/trainers/trainer-directory";
import type { TrainerListItem } from "@/lib/trainers";

export const dynamic = "force-dynamic";

export default async function TrainersPage() {
  const access = await getTrainerAccess();
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");

  const rows = await prisma.trainer.findMany({
    select: {
      id: true, name: true, nickname: true, phone: true, email: true, trainerType: true, status: true, inTms: true,
      trainingCerts: true, certifications: true, skills: true, education: true, summary: true, financeBackground: true,
      ibfFitDeclaration: true, classesCount: true, lastClassDate: true, courses: true, importedAt: true,
    },
    orderBy: { name: "asc" },
  });

  const trainers: TrainerListItem[] = rows.map(({ courses, importedAt: _i, ...t }) => ({
    ...t,
    courseTitles: Array.isArray(courses)
      ? courses.map((c) => String((c as { title?: string })?.title ?? "")).filter(Boolean)
      : [],
  }));
  const lastImport = rows.reduce<Date | null>((m, r) => (r.importedAt && (!m || r.importedAt > m) ? r.importedAt : m), null);

  return <TrainerDirectory trainers={trainers} lastImport={lastImport?.toISOString() ?? null} />;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { isDemoEmail } from "@/lib/demo-guard";
import { filterTrainers, lastClassTitleOf, canonicalTrainingCerts, type TrainerListItem } from "@/lib/trainers";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/trainers/contacts?q= — the trainer CONTACT list for every signed-in staff
 * member and intern (Alfred, 11 Nov 2026: staff and interns must be able to reach trainers).
 * Contact fields only: name, email, phone, training certs, skills and courses taught. No NRIC,
 * no notes, no CV, no finance / IBF declarations; applicants are excluded. The full directory
 * stays at /api/mobile/trainers behind TRAINER_ADMIN. Demo / App Review accounts get an empty list.
 */
export async function GET(req: NextRequest) {
  const ctx = await getMobileContext();
  if (!ctx?.userId) return unauthorized();
  if (isDemoEmail(ctx.email)) return NextResponse.json({ count: 0, trainers: [] });

  const rows = await prisma.trainer.findMany({
    select: {
      id: true, name: true, nickname: true, phone: true, email: true, trainerType: true, status: true, inTms: true,
      trainingCerts: true, certifications: true, skills: true, education: true, summary: true, financeBackground: true,
      ibfFitDeclaration: true, classesCount: true, lastClassDate: true, courses: true, recentClasses: true, calendarClasses: true,
    },
    orderBy: { name: "asc" },
  });
  const list: TrainerListItem[] = rows.map(({ courses, recentClasses, calendarClasses, ...t }) => ({
    ...t,
    trainingCerts: canonicalTrainingCerts(t.trainingCerts),
    lastClassTitle: lastClassTitleOf(recentClasses, t.lastClassDate),
    courseTitles: Array.from(
      new Set(
        [courses, calendarClasses].flatMap((v) =>
          Array.isArray(v) ? v.map((c) => String((c as { title?: string })?.title ?? "")).filter(Boolean) : [],
        ),
      ),
    ),
  }));
  const trainers = filterTrainers(list, { q: req.nextUrl.searchParams.get("q") ?? undefined, status: "trainers" }).map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone,
    trainingCerts: t.trainingCerts,
    skills: t.skills,
    courseTitles: t.courseTitles.slice(0, 10),
    lastClassDate: t.lastClassDate,
  }));
  return NextResponse.json({ count: trainers.length, trainers });
}

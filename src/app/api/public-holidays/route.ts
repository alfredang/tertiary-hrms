import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SG_PUBLIC_HOLIDAYS } from "@/lib/sg-public-holidays";

// GET /api/public-holidays?year=2025&country=SG
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const country = searchParams.get("country") ?? "SG";

  // Fetch from DB
  const dbHolidays = await prisma.publicHoliday.findMany({
    where: { year, countryCode: country },
    orderBy: { date: "asc" },
  });

  // Merge with static SG list as fallback
  const staticList = SG_PUBLIC_HOLIDAYS[year] ?? [];
  const dbDates = new Set(dbHolidays.map((h) => h.date.toISOString().slice(0, 10)));
  const merged = [
    ...dbHolidays.map((h) => ({ date: h.date.toISOString().slice(0, 10), name: h.name, source: "db" })),
    ...staticList
      .filter((h) => !dbDates.has(h.date))
      .map((h) => ({ date: h.date, name: h.name, source: "static" })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const dates = merged.map((h) => h.date);
  return NextResponse.json({ holidays: merged, dates });
}

// POST /api/public-holidays — admin only, add a custom holiday
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "HR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { date, name, countryCode = "SG" } = body;
  if (!date || !name) {
    return NextResponse.json({ error: "date and name are required" }, { status: 400 });
  }

  const parsed = new Date(date);
  const year = parsed.getFullYear();

  const holiday = await prisma.publicHoliday.upsert({
    where: { date_countryCode: { date: parsed, countryCode } },
    update: { name },
    create: { date: parsed, name, countryCode, year },
  });

  return NextResponse.json(holiday, { status: 201 });
}

// Singapore public holidays — used as fallback when DB returns no records.
// Dates are "YYYY-MM-DD" strings in SGT (UTC+8).

export const SG_PUBLIC_HOLIDAYS: Record<number, { date: string; name: string }[]> = {
  2025: [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-01-29", name: "Chinese New Year (Day 1)" },
    { date: "2025-01-30", name: "Chinese New Year (Day 2)" },
    { date: "2025-03-31", name: "Hari Raya Puasa" },
    { date: "2025-04-18", name: "Good Friday" },
    { date: "2025-05-01", name: "Labour Day" },
    { date: "2025-05-12", name: "Vesak Day" },
    { date: "2025-06-06", name: "Hari Raya Haji" },
    { date: "2025-08-09", name: "National Day" },
    { date: "2025-10-20", name: "Deepavali" },
    { date: "2025-12-25", name: "Christmas Day" },
  ],
  2026: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-17", name: "Chinese New Year (Day 1)" },
    { date: "2026-02-18", name: "Chinese New Year (Day 2)" },
    { date: "2026-03-20", name: "Hari Raya Puasa" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-31", name: "Vesak Day" },
    { date: "2026-05-27", name: "Hari Raya Haji" },
    { date: "2026-08-10", name: "National Day (In Lieu)" },
    { date: "2026-11-09", name: "Deepavali" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],
};

export function getSgHolidaysForYear(year: number): string[] {
  return (SG_PUBLIC_HOLIDAYS[year] ?? []).map((h) => h.date);
}

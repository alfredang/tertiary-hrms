// Singapore public holidays — used as fallback when DB returns no records.
// Dates are "YYYY-MM-DD" strings in SGT (UTC+8).
// 2025–2026: official MOM dates. 2027–2030: estimated (Islamic & lunar holidays
// shift ~11 days/year; verify against mom.gov.sg when MOM announces officially).

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
    { date: "2026-05-27", name: "Hari Raya Haji" },
    { date: "2026-05-31", name: "Vesak Day" },
    { date: "2026-08-10", name: "National Day (In Lieu)" },
    { date: "2026-11-09", name: "Deepavali" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],
  2027: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-02-06", name: "Chinese New Year (Day 1)" },
    { date: "2027-02-07", name: "Chinese New Year (Day 2)" },
    { date: "2027-03-09", name: "Hari Raya Puasa" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-05-01", name: "Labour Day" },
    { date: "2027-05-17", name: "Hari Raya Haji" },
    { date: "2027-05-21", name: "Vesak Day" },
    { date: "2027-08-09", name: "National Day" },
    { date: "2027-11-08", name: "Deepavali" },
    { date: "2027-12-25", name: "Christmas Day" },
  ],
  2028: [
    { date: "2028-01-01", name: "New Year's Day" },
    { date: "2028-01-26", name: "Chinese New Year (Day 1)" },
    { date: "2028-01-27", name: "Chinese New Year (Day 2)" },
    { date: "2028-02-26", name: "Hari Raya Puasa" },
    { date: "2028-04-14", name: "Good Friday" },
    { date: "2028-05-01", name: "Labour Day" },
    { date: "2028-05-05", name: "Hari Raya Haji" },
    { date: "2028-05-10", name: "Vesak Day" },
    { date: "2028-08-09", name: "National Day" },
    { date: "2028-10-27", name: "Deepavali" },
    { date: "2028-12-25", name: "Christmas Day" },
  ],
  2029: [
    { date: "2029-01-01", name: "New Year's Day" },
    { date: "2029-02-13", name: "Chinese New Year (Day 1)" },
    { date: "2029-02-14", name: "Chinese New Year (Day 2)" },
    { date: "2029-02-15", name: "Hari Raya Puasa" },
    { date: "2029-03-30", name: "Good Friday" },
    { date: "2029-04-24", name: "Hari Raya Haji" },
    { date: "2029-05-01", name: "Labour Day" },
    { date: "2029-05-29", name: "Vesak Day" },
    { date: "2029-08-09", name: "National Day" },
    { date: "2029-11-14", name: "Deepavali" },
    { date: "2029-12-25", name: "Christmas Day" },
  ],
  2030: [
    { date: "2030-01-01", name: "New Year's Day" },
    { date: "2030-02-03", name: "Chinese New Year (Day 1)" },
    { date: "2030-02-04", name: "Chinese New Year (Day 2)" },
    { date: "2030-02-04", name: "Hari Raya Puasa" },
    { date: "2030-04-03", name: "Hari Raya Haji" },
    { date: "2030-04-19", name: "Good Friday" },
    { date: "2030-05-01", name: "Labour Day" },
    { date: "2030-05-18", name: "Vesak Day" },
    { date: "2030-08-09", name: "National Day" },
    { date: "2030-11-03", name: "Deepavali" },
    { date: "2030-12-25", name: "Christmas Day" },
  ],
};

export function getSgHolidaysForYear(year: number): string[] {
  return (SG_PUBLIC_HOLIDAYS[year] ?? []).map((h) => h.date);
}

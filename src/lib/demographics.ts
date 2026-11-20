/**
 * Workforce breakdown for the admin dashboard: gender, age group and ethnic group of active
 * people. Pure helpers only (safe to import from client components); the loader that reads the
 * database is in src/lib/workforce-breakdown.ts.
 */

/** Singapore CMIO groups, as on the staff form. Null on an employee means "not recorded". */
export const ETHNIC_GROUPS = ["Chinese", "Malay", "Indian", "Eurasian", "Others"] as const;
export const NOT_RECORDED = "Not recorded";

export const AGE_GROUPS = ["Under 25", "25–34", "35–44", "45–54", "55 and over"] as const;

/** Age in whole years on `now`, from a date of birth. */
export function ageOn(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function ageGroup(dob: Date | null | undefined, now: Date): string {
  if (!dob) return NOT_RECORDED;
  const age = ageOn(dob, now);
  if (age < 0 || age > 110) return NOT_RECORDED;
  if (age < 25) return AGE_GROUPS[0];
  if (age < 35) return AGE_GROUPS[1];
  if (age < 45) return AGE_GROUPS[2];
  if (age < 55) return AGE_GROUPS[3];
  return AGE_GROUPS[4];
}

export const GENDER_LABEL: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

/** One active person, reduced to the three attributes the charts need (no name, no date of birth). */
export interface BreakdownPerson {
  intern: boolean;
  gender: string; // "Male" | "Female" | "Other"
  ageGroup: string;
  ethnicGroup: string;
}

export function ethnicLabel(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return (ETHNIC_GROUPS as readonly string[]).includes(t) ? t : t ? "Others" : NOT_RECORDED;
}

/** Count people per label, in the given order, dropping empty slices. */
export function countBy(people: BreakdownPerson[], key: "gender" | "ageGroup" | "ethnicGroup", order: readonly string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of people) counts.set(p[key], (counts.get(p[key]) ?? 0) + 1);
  return [...order, NOT_RECORDED].filter((l, i, a) => a.indexOf(l) === i).map((label) => ({ label, count: counts.get(label) ?? 0 })).filter((s) => s.count > 0);
}

/**
 * Whole-number percentages that always add up to 100 (largest-remainder rounding). Rounding each
 * slice on its own drifts: six interns split 1/1/1/1/1/1 would read 17% six times, 102% in all.
 */
export function wholePercents(counts: number[]): number[] {
  const total = counts.reduce((t, n) => t + n, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((n) => (n / total) * 100);
  const out = exact.map(Math.floor);
  const left = 100 - out.reduce((t, n) => t + n, 0);
  // Hand the leftover points to the largest fractions; ties go to the bigger slice, then the earlier one.
  exact.map((v, i) => ({ i, frac: v - out[i] }))
    .sort((a, b) => b.frac - a.frac || counts[b.i] - counts[a.i] || a.i - b.i)
    .slice(0, left)
    .forEach(({ i }) => { out[i] += 1; });
  return out;
}

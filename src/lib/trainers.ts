import { z } from "zod";
import { skillMatches } from "@/lib/trainer-skills";

/** Training / adult-education accreditations shown as flags on every trainer. */
export const TRAINING_CERTS = [
  { code: "ACLP", label: "ACLP", full: "Advanced Certificate in Learning and Performance" },
  { code: "ACTA", label: "ACTA", full: "Advanced Certificate in Training and Assessment" },
  { code: "DACE", label: "DACE", full: "Diploma in Adult and Continuing Education" },
  { code: "DDDLP", label: "DDDLP", full: "Diploma in Design and Delivery of Learning and Performance (also written DDDPL)" },
] as const;

/** Extra accreditations the importer may detect; shown as badges but not as filter flags. */
export const OTHER_TRAINING_CERTS = ["ACTAS", "AE Registry"] as const;

export const TRAINER_STATUSES = ["Active", "Inactive", "Applicant", "Contacted"] as const;

/** Fields the directory list needs (no NRIC — that stays on the detail page). */
export type TrainerListItem = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  trainerType: string | null;
  status: string;
  inTms: boolean;
  trainingCerts: string[];
  certifications: string[];
  skills: string[];
  education: string | null;
  summary: string | null;
  financeBackground: boolean;
  ibfFitDeclaration: boolean;
  classesCount: number;
  lastClassDate: string | null;
  lastClassTitle?: string | null;
  courseTitles: string[];
};

export type TrainerFilters = {
  q?: string;
  certs?: string[]; // trainer must hold ALL of these training certs
  tags?: string[]; // skills or professional certs; trainer must match ALL
  finance?: boolean;
  ibfFit?: boolean;
  status?: "all" | "trainers" | "applicants";
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Common alternative spellings people search for. */
const ALIASES: Record<string, string> = {
  dddpl: "dddlp",
  alcp: "aclp",
  "ccar f": "ccar-f",
  ccarf: "ccar-f",
};

export function haystack(t: TrainerListItem): string {
  return norm(
    [
      t.name,
      t.nickname ?? "",
      t.email ?? "",
      t.phone ?? "",
      t.trainerType ?? "",
      t.education ?? "",
      t.summary ?? "",
      ...t.trainingCerts,
      ...t.certifications,
      ...t.skills,
      ...t.courseTitles,
      t.financeBackground ? "finance" : "",
      t.ibfFitDeclaration ? "ibf fit" : "",
    ].join(" | "),
  );
}

/** Every whitespace-separated term must appear somewhere in the trainer's profile. */
export function matchesQuery(hay: string, q: string | undefined): boolean {
  if (!q || !q.trim()) return true;
  return norm(q)
    .split(" ")
    .filter(Boolean)
    .every((term) => hay.includes(ALIASES[term] ?? term));
}

/** Skill / cert tag filter: exact value, a synonym ("Articulate 360" ↔ "Articulate Storyline") or a course taught. */
const hasTag = (t: TrainerListItem, tag: string) =>
  skillMatches(tag, [...t.skills, ...t.certifications, ...t.trainingCerts], t.courseTitles);

export function isApplicant(t: Pick<TrainerListItem, "status">): boolean {
  return t.status === "Applicant" || t.status === "Contacted";
}

export function filterTrainers(list: TrainerListItem[], f: TrainerFilters): TrainerListItem[] {
  return list.filter((t) => {
    if (f.status === "trainers" && isApplicant(t)) return false;
    if (f.status === "applicants" && !isApplicant(t)) return false;
    if (f.finance && !t.financeBackground) return false;
    if (f.ibfFit && !t.ibfFitDeclaration) return false;
    if (f.certs?.length && !f.certs.every((c) => t.trainingCerts.includes(c))) return false;
    if (f.tags?.length && !f.tags.every((tag) => hasTag(t, tag))) return false;
    return matchesQuery(haystack(t), f.q);
  });
}

/** Most common skills / professional certs across the list, for the quick-filter chips. */
export function topTags(list: TrainerListItem[], field: "skills" | "certifications", limit = 24): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const t of list) {
    const seen = new Set<string>();
    for (const raw of t[field]) {
      const key = norm(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = counts.get(key);
      if (cur) cur.count++;
      else counts.set(key, { tag: raw, count: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Trim, drop blanks and case-insensitive duplicates. */
export function cleanList(values: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values ?? []) {
    const s = String(v).replace(/\s+/g, " ").trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

const KNOWN_TRAINING = [...TRAINING_CERTS.map((c) => c.code), ...OTHER_TRAINING_CERTS] as string[];

/** Full programme titles that mean one of the four IAL training certs. */
const TRAINING_CERT_TITLES: Array<[RegExp, string]> = [
  [/advanced certificate in learning and performance/i, "ACLP"],
  [/advanced certificate in training and assessment/i, "ACTA"],
  [/diploma in adult and continuing education/i, "DACE"],
  [/diploma in design(ing)? and development of learning/i, "DDDLP"],
];

/**
 * "aclp" -> "ACLP", "DDDPL" -> "DDDLP", "ae registry" -> "AE Registry", and a long form such as
 * "Advanced Certificate in Learning and Performance (ACLP, 2023)" -> "ACLP" (long strings broke the
 * app list rows, 11 Nov 2026). Unknown values are kept as typed.
 */
export function canonicalTrainingCert(v: string): string {
  const s = v.trim();
  const key = s.toUpperCase() === "DDDPL" ? "DDDLP" : s.toUpperCase() === "ALCP" ? "ACLP" : s;
  const exact = KNOWN_TRAINING.find((k) => k.toLowerCase() === key.toLowerCase());
  if (exact) return exact;
  const code = s.toUpperCase().match(/\b(ACLP|ACTA|DACE|DDDLP|DDDPL|ALCP)\b/)?.[1];
  if (code) return code === "DDDPL" ? "DDDLP" : code === "ALCP" ? "ACLP" : code;
  return TRAINING_CERT_TITLES.find(([re]) => re.test(s))?.[1] ?? s;
}

/** Canonical, de-duplicated training certs for display and filtering. */
export function canonicalTrainingCerts(values: readonly string[] | null | undefined): string[] {
  return cleanList((values ?? []).map(canonicalTrainingCert));
}

const DOCTORATE = /\b(ph\.?\s?d|d\.?phil|doctor of|doctorate|doctoral|dba\b|ed\.?d\b|d\.?eng)/i;
const TITLE_PREFIX = /^\s*(dr|prof|professor|mr|mrs|ms|mdm|miss)\.?\s+/i;

/** A doctorate in the name ("Dr …"), education or CV text. */
export function hasDoctorate(name: string, ...texts: (string | null | undefined)[]): boolean {
  return /^\s*(dr|prof)\.?\s/i.test(name) || /\(DR\)\s*$/i.test(name) || texts.some((t) => !!t && DOCTORATE.test(t));
}

/**
 * House naming rule for trainers (matches the ACTA Trainers folder names):
 * full name in capitals, no honorifics, "(DR)" appended for a doctorate.
 * "Dr. Alfred Ang Chew Hoe" -> "ALFRED ANG CHEW HOE (DR)".
 */
export function canonicalTrainerName(name: string, isDoctor = false): string {
  let n = name.replace(/\(DR\)\s*$/i, "");
  while (TITLE_PREFIX.test(n)) n = n.replace(TITLE_PREFIX, "");
  n = n.replace(/\(.*?\)/g, " ").replace(/[_\][]+/g, " ").replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "").toUpperCase();
  return isDoctor ? `${n} (DR)` : n;
}

export function maskNric(nric: string | null | undefined): string {
  if (!nric) return "";
  return nric.length >= 6 ? `${nric[0]}****${nric.slice(-4)}` : "****";
}

const optStr = z
  .string()
  .trim()
  .max(4000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const strList = z.array(z.string().max(300)).max(200).transform((v) => cleanList(v)).optional();

/** Body for POST /api/trainers and PATCH /api/trainers/[id]. */
export const trainerInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  nickname: optStr,
  nric: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  phone: optStr,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || z.string().email().safeParse(v).success, "Invalid email"),
  nationality: optStr,
  linkedinUrl: optStr,
  status: z.enum(TRAINER_STATUSES).optional(),
  trainingCerts: z
    .array(z.string())
    .transform((v) => cleanList(v.map(canonicalTrainingCert)))
    .optional(),
  certifications: strList,
  skills: strList,
  experience: strList,
  education: optStr,
  summary: optStr,
  financeBackground: z.boolean().optional(),
  ibfFitDeclaration: z.boolean().optional(),
  adminNotes: optStr,
});

export type TrainerInput = z.infer<typeof trainerInputSchema>;

/** Title of the class taught on `lastClassDate` (else the latest past class), from the TMS recent-classes list. */
export function lastClassTitleOf(recentClasses: unknown, lastClassDate: string | null): string | null {
  if (!Array.isArray(recentClasses)) return null;
  const rows = recentClasses
    .map((r) => ({ start: String((r as { start?: unknown })?.start ?? "").slice(0, 10), title: String((r as { title?: unknown })?.title ?? "").trim() }))
    .filter((r) => r.start && r.title);
  const exact = lastClassDate ? rows.find((r) => r.start === lastClassDate.slice(0, 10)) : undefined;
  if (exact) return exact.title;
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((r) => r.start <= today).sort((a, b) => b.start.localeCompare(a.start))[0]?.title ?? null;
}

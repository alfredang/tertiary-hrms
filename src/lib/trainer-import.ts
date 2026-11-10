/**
 * Trainer import: merge the Mac-side sources (LMS/TMS snapshot + ACTA Trainers folder export,
 * CV profiles, email applications) and upsert them into the Trainer table.
 * Used by scripts/trainers/import-trainers.ts and POST /api/agent/trainers/import.
 *
 * Merge rules: CV / email details only FILL blanks and ADD to lists; they never overwrite TMS values.
 * Records a Trainer Admin has edited (editedAt set) keep their profile; only activity fields refresh.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalTrainerName, canonicalTrainingCert, cleanList, hasDoctorate } from "@/lib/trainers";
import { mergeCalendarClasses, skillsFromTitles, titlesTaughtSince, twoYearsAgo, unionSkills } from "@/lib/trainer-skills";

export type TrainerRecord = {
  sourceKey: string; tmsId: string | null; name: string; nickname: string | null; nric: string | null; phone: string | null;
  email: string | null; secondaryEmail: string | null; nationality: string | null; gender: string | null; linkedinUrl: string | null;
  cvUrl: string | null; cvFolderUrl: string | null; trainerType: string | null; status: string; inTms: boolean; isActaTrainer: boolean;
  trainingCerts: string[]; certifications: string[]; skills: string[]; education: string | null; experience: string[];
  summary: string | null; financeBackground: boolean; financeEvidence: string[]; ibfFitDeclaration: boolean; ibfFitFiles: string[];
  actaFolder: string | null; moreFolders: string[]; evidenceFiles: string[]; courses: unknown; recentClasses: unknown;
  calendarClasses: unknown; classesCount: number; lastClassDate: string | null; profileSource: string | null;
  isDoctor?: boolean; // transient: from the CV, feeds the "(DR)" naming rule
};

export type EmailTrainer = {
  fullName: string; nickname?: string | null; email?: string | null; altEmails?: string[]; phone?: string | null; nric?: string | null;
  nationality?: string | null; education?: string | null; experience?: string[]; skills?: string[]; certifications?: string[];
  trainingCerts?: string[]; financeBackground?: { value?: boolean; evidence?: string } | boolean;
  ibfFitDeclaration?: { value?: boolean; evidence?: string } | boolean; status?: string; summary?: string | null;
  source?: { sender?: string; subject?: string; date?: string } | string; notes?: string;
};

export type CvProfile = Partial<{
  fullName: string; isDoctor: boolean;
  education: string; experience: string[]; skills: string[]; certifications: string[]; trainingCerts: string[]; summary: string;
  nric: string; phone: string; email: string; nationality: string; financeBackground: boolean; source: string;
}>;

const tokens = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/\b(s\/o|d\/o|bin|binte|dr|mr|ms)\b\.?/g, " ").split(/[^a-z]+/).filter((t) => t.length > 1);
const flag = (v: EmailTrainer["financeBackground"]) => (typeof v === "boolean" ? v : !!v?.value);
const sourceText = (s: EmailTrainer["source"]) =>
  typeof s === "string" ? s : s ? `Email: ${s.sender ?? ""}, "${s.subject ?? ""}", ${s.date ?? ""}` : "Email";
const certList = (v: readonly string[] | undefined) => cleanList((v ?? []).map(canonicalTrainingCert));
const blank = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Fill blanks + union lists. Never overwrites a value already present. */
function fillFrom(r: TrainerRecord, x: CvProfile & { nickname?: string | null }, source: string) {
  const before = JSON.stringify(r);
  if (blank(r.nric) && x.nric) r.nric = x.nric.toUpperCase();
  if (blank(r.phone) && x.phone) r.phone = x.phone;
  if (blank(r.email) && x.email) r.email = x.email.toLowerCase();
  if (blank(r.nationality) && x.nationality) r.nationality = x.nationality;
  if (blank(r.nickname) && x.nickname) r.nickname = x.nickname;
  if (blank(r.education) && x.education) r.education = x.education;
  if (blank(r.summary) && x.summary) r.summary = x.summary;
  if (blank(r.experience) && x.experience?.length) r.experience = cleanList(x.experience);
  r.skills = cleanList([...r.skills, ...(x.skills ?? [])]);
  r.certifications = cleanList([...r.certifications, ...(x.certifications ?? [])]);
  r.trainingCerts = certList([...r.trainingCerts, ...(x.trainingCerts ?? [])]);
  if (x.financeBackground) r.financeBackground = true;
  if (r.trainingCerts.length) r.isActaTrainer = true;
  if (JSON.stringify(r) !== before) r.profileSource = cleanList([...(r.profileSource ? r.profileSource.split(" · ") : []), source]).join(" · ");
}

/**
 * Name to keep when a CV gives the full legal name. Same rule as rename_acta_folders.py:
 *  - folder-only record: the CV name;
 *  - TMS record: the CV name when it contains every TMS name word ("Malcolm Soo" -> "Malcolm Soo Chee Kong"),
 *    the English name + CV name when only the English first name is missing ("Amanda Liaw" + "Liaw Yit Lan"
 *    -> "Amanda Liaw Yit Lan"), otherwise the TMS name (the documents may belong to someone else).
 */
export function preferredName(current: string, cvName: string, inTms: boolean): string {
  // Already the house-rule name (comes from a renamed ACTA folder): the local drive wins.
  if (current === current.toUpperCase() && /[A-Z]/.test(current)) return current;
  if (!inTms) return cvName;
  const tt = tokens(current);
  const ct = tokens(cvName);
  if (tt.every((t) => ct.includes(t))) return cvName;
  const missing = tt.filter((t) => !ct.includes(t));
  if (missing.length === 1 && missing[0] === tt[0] && tt.some((t) => ct.includes(t))) {
    const first = current.replace(/^\s*(dr|prof)\.?\s+/i, "").split(/\s+/)[0];
    return `${first} ${cvName}`;
  }
  return current;
}

function matchEmail(recs: TrainerRecord[], e: EmailTrainer): TrainerRecord | undefined {
  const emails = [e.email, ...(e.altEmails ?? [])].filter(Boolean).map((x) => x!.toLowerCase());
  const byEmail = recs.find((r) => emails.includes(r.email ?? "") || emails.includes(r.secondaryEmail ?? ""));
  if (byEmail) return byEmail;
  const et = tokens(e.fullName);
  const nick = (e.nickname ?? "").toLowerCase();
  const scored = recs
    .map((r) => {
      const rt = tokens(r.name);
      const hit = rt.filter((t) => et.includes(t)).length;
      // every word of the shorter name appears in the longer one, at least 2 words…
      if (hit >= 2 && (hit === rt.length || hit === et.length)) return { r, s: hit };
      // …or a one-word ACTA folder ("Don") matching the first name / nickname of a folder-only record
      if (rt.length === 1 && !r.inTms && (rt[0] === et[0] || rt[0] === nick)) return { r, s: 1 };
      return { r, s: 0 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) return scored[0].r;
  return undefined; // ambiguous or none: create a new record rather than guess
}

function emailStatus(s: string | undefined): string {
  if (s === "Onboarded") return "Active";
  if (s === "Contacted") return "Contacted";
  return "Applicant";
}


export type TrainerSources = {
  export: { trainers: TrainerRecord[] };
  /** ACTA folder renames (rename_acta_folders.py manifests): old sourceKey -> new sourceKey. */
  renames?: Record<string, string> | null;
  email?: { trainers: EmailTrainer[] } | null;
  cv?: { profiles: Record<string, CvProfile> } | null;
};

export type MergeReport = { total: number; fromExport: number; merged: string[]; added: string[]; cvFilled: number };

export function mergeTrainerSources(src: TrainerSources): { records: TrainerRecord[]; report: MergeReport } {
  const recs: TrainerRecord[] = src.export.trainers.map((t) => ({ ...t, trainingCerts: certList(t.trainingCerts) }));
  let cvFilled = 0;
  for (const r of recs) {
    const p = src.cv?.profiles?.[r.sourceKey];
    if (p) {
      // Full name from the trainer's own documents: always for folder-only records; for TMS records only
      // when it is the more complete form of the TMS name (all TMS name words present).
      if (p.fullName) r.name = preferredName(r.name, p.fullName, r.inTms);
      if (p.isDoctor) r.isDoctor = true;
      fillFrom(r, p, p.source ? `CV: ${p.source}` : "CV");
      cvFilled++;
    }
  }
  const merged: string[] = [];
  const added: string[] = [];
  for (const e of src.email?.trainers ?? []) {
    const hit = matchEmail(recs, e);
    const x = {
      nickname: e.nickname, email: e.email ?? undefined, phone: e.phone ?? undefined, nric: e.nric ?? undefined,
      nationality: e.nationality ?? undefined, education: e.education ?? undefined, experience: e.experience, skills: e.skills,
      certifications: e.certifications, trainingCerts: e.trainingCerts, summary: e.summary ?? undefined, financeBackground: flag(e.financeBackground),
    };
    if (hit) {
      // An ACTA folder named "Don" or "Anitha" gets the trainer's full name from their email/CV.
      if (!hit.inTms && hit.name !== hit.name.toUpperCase() && tokens(e.fullName).length > tokens(hit.name).length) hit.name = e.fullName;
      fillFrom(hit, x, sourceText(e.source));
      if (flag(e.ibfFitDeclaration)) hit.ibfFitDeclaration = true;
      merged.push(`${e.fullName} -> ${hit.sourceKey}`);
      continue;
    }
    const r: TrainerRecord = {
      sourceKey: `email:${(e.email ?? e.fullName).toLowerCase()}`, tmsId: null, name: e.fullName, nickname: null, nric: null, phone: null,
      email: null, secondaryEmail: (e.altEmails ?? [])[0]?.toLowerCase() ?? null, nationality: null, gender: null, linkedinUrl: null, cvUrl: null,
      cvFolderUrl: null, trainerType: e.status === "Onboarded" ? "Not in TMS" : "Applicant", status: emailStatus(e.status), inTms: false,
      isActaTrainer: false, trainingCerts: [], certifications: [], skills: [], education: null, experience: [], summary: null,
      financeBackground: false, financeEvidence: [], ibfFitDeclaration: flag(e.ibfFitDeclaration), ibfFitFiles: [], actaFolder: null,
      moreFolders: [], evidenceFiles: [], courses: [], recentClasses: [], calendarClasses: [], classesCount: 0, lastClassDate: null,
      profileSource: null,
    };
    fillFrom(r, x, sourceText(e.source));
    if (!r.summary && e.notes) r.summary = e.notes;
    recs.push(r);
    added.push(`${r.name} (${r.status})`);
  }
  // House naming rule: FULL NAME IN CAPITALS, "(DR)" for a doctorate — same as the ACTA folder names.
  for (const r of recs) {
    r.name = canonicalTrainerName(r.name, !!r.isDoctor || hasDoctorate(r.name, r.education, ...r.certifications));
    delete r.isDoctor;
  }
  return { records: recs, report: { total: recs.length, fromExport: src.export.trainers.length, merged, added, cvFilled } };
}

export type UpsertReport = { created: number; updated: number; keptEdits: number; notInSources: number };

export async function upsertTrainers(
  recs: TrainerRecord[],
  opts: { dryRun?: boolean; renames?: Record<string, string> | null } = {},
): Promise<UpsertReport & { rekeyed: number; pruned: number }> {
  // Carry records across ACTA folder renames so a renamed folder updates its trainer instead of duplicating it.
  let rekeyed = 0;
  for (const [from, to] of Object.entries(opts.renames ?? {})) {
    if (from === to) continue;
    const [old, cur] = await Promise.all([
      prisma.trainer.findUnique({ where: { sourceKey: from }, select: { id: true, editedAt: true } }),
      prisma.trainer.findUnique({ where: { sourceKey: to }, select: { id: true } }),
    ]);
    if (!old) continue;
    rekeyed++;
    if (opts.dryRun) continue;
    if (!cur) await prisma.trainer.update({ where: { id: old.id }, data: { sourceKey: to } });
    else if (!old.editedAt) await prisma.trainer.delete({ where: { id: old.id } }); // merged folder: the target record survives
  }
  const existing = new Map(
    (await prisma.trainer.findMany({ select: { id: true, sourceKey: true, editedAt: true, skills: true, calendarClasses: true } })).map((t) => [t.sourceKey, t]),
  );
  const since = twoYearsAgo();
  let created = 0, updated = 0, keptEdits = 0;
  const now = new Date();
  for (const r of recs) {
    const cur = existing.get(r.sourceKey);
    // Keep classes found in sales@ invitations (scanned outside this export) across re-imports.
    const calendarClasses = mergeCalendarClasses(r.calendarClasses, cur?.calendarClasses);
    // Skills = the source's skills + any already on record + skills implied by classes taught in the
    // last 2 years (union only, never removed or renamed).
    const derived = skillsFromTitles(titlesTaughtSince({ courses: r.courses, recentClasses: r.recentClasses, calendarClasses }, since));
    r.skills = unionSkills(unionSkills(r.skills, cur?.skills ?? []), derived);
    const activity = {
      trainerType: r.trainerType, inTms: r.inTms, tmsId: r.tmsId, actaFolder: r.actaFolder, moreFolders: r.moreFolders,
      evidenceFiles: r.evidenceFiles, ibfFitFiles: r.ibfFitFiles, courses: (r.courses ?? []) as Prisma.InputJsonValue,
      recentClasses: (r.recentClasses ?? []) as Prisma.InputJsonValue, calendarClasses: calendarClasses as unknown as Prisma.InputJsonValue,
      classesCount: r.classesCount, lastClassDate: r.lastClassDate, importedAt: now,
    };
    const profile = {
      name: r.name, nickname: r.nickname, nric: r.nric, phone: r.phone, email: r.email, secondaryEmail: r.secondaryEmail,
      nationality: r.nationality, gender: r.gender, linkedinUrl: r.linkedinUrl, cvUrl: r.cvUrl, cvFolderUrl: r.cvFolderUrl, status: r.status,
      isActaTrainer: r.isActaTrainer, trainingCerts: r.trainingCerts, certifications: r.certifications, skills: r.skills,
      education: r.education, experience: r.experience, summary: r.summary, financeBackground: r.financeBackground,
      financeEvidence: r.financeEvidence, ibfFitDeclaration: r.ibfFitDeclaration || r.ibfFitFiles.length > 0, profileSource: r.profileSource,
    };
    if (opts.dryRun) {
      if (!cur) created++;
      else if (cur.editedAt) keptEdits++;
      else updated++;
      continue;
    }
    if (!cur) {
      await prisma.trainer.create({ data: { sourceKey: r.sourceKey, ...profile, ...activity } });
      created++;
    } else if (cur.editedAt) {
      // Keep the Trainer Admin's profile edits; still union in skills implied by classes taught.
      await prisma.trainer.update({ where: { id: cur.id }, data: { ...activity, skills: unionSkills(cur.skills, derived) } });
      keptEdits++;
    } else {
      await prisma.trainer.update({ where: { id: cur.id }, data: { ...profile, ...activity } });
      updated++;
    }
  }
  const keys = new Set(recs.map((r) => r.sourceKey));
  const stale = Array.from(existing.values()).filter((t) => !keys.has(t.sourceKey) && !t.sourceKey.startsWith("manual:"));
  // A folder-only record whose ACTA folder no longer exists (renamed/merged into a TMS trainer's folder) is an
  // import artefact: remove it unless a Trainer Admin has edited it. TMS/email records are never pruned.
  const prunable = stale.filter((t) => t.sourceKey.startsWith("folder:") && !t.editedAt);
  if (!opts.dryRun && prunable.length) await prisma.trainer.deleteMany({ where: { id: { in: prunable.map((t) => t.id) } } });
  return { created, updated, keptEdits, notInSources: stale.length - prunable.length, pruned: prunable.length, rekeyed };
}

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { filterTrainers, canonicalTrainerName, hasDoctorate, canonicalTrainingCert, maskNric, topTags, trainerInputSchema, type TrainerListItem } from "@/lib/trainers";
import { hasTrainerAdminAccess } from "@/lib/trainer-access-client";
import { mergeTrainerSources, preferredName, type TrainerRecord } from "@/lib/trainer-import";

const t = (over: Partial<TrainerListItem>): TrainerListItem => ({
  id: "x", name: "X", nickname: null, phone: null, email: null, trainerType: "ACLP", status: "Active", inTms: true,
  trainingCerts: [], certifications: [], skills: [], education: null, summary: null, financeBackground: false,
  ibfFitDeclaration: false, classesCount: 0, lastClassDate: null, courseTitles: [], ...over,
});

const list = [
  t({ id: "1", name: "MAK WAI KEONG (DR)", trainingCerts: ["ACLP"], skills: ["Articulate Storyline", "Soft Skill"] }),
  t({ id: "2", name: "MALCOLM SOO CHEE KONG", trainingCerts: ["ACLP", "ACTA"], certifications: ["CA (Singapore)"], financeBackground: true, ibfFitDeclaration: true }),
  t({ id: "3", name: "JYOTI CHOPRA", trainingCerts: ["ACLP", "DDDLP"], certifications: ["Autodesk"] }),
  t({ id: "4", name: "IGOR JOVANOVIC", status: "Applicant", certifications: ["Lean Six Sigma Black Belt"] }),
  t({ id: "5", name: "PM PERSON", certifications: ["PMP", "CCAR-F"], courseTitles: ["Python for Finance"] }),
];

describe("trainer directory filters", () => {
  it("finds trainers by skill, case-insensitive (articulate)", () => {
    expect(filterTrainers(list, { q: "articulate" }).map((x) => x.id)).toEqual(["1"]);
  });
  it("requires every training cert selected", () => {
    expect(filterTrainers(list, { certs: ["ACLP", "ACTA"] }).map((x) => x.id)).toEqual(["2"]);
  });
  it("accepts the DDDPL spelling for DDDLP", () => {
    expect(filterTrainers(list, { q: "dddpl" }).map((x) => x.id)).toEqual(["3"]);
  });
  it("filters finance background and IBF Fit declaration", () => {
    expect(filterTrainers(list, { finance: true, ibfFit: true }).map((x) => x.id)).toEqual(["2"]);
  });
  it("separates applicants from trainers", () => {
    expect(filterTrainers(list, { status: "trainers" }).map((x) => x.id)).not.toContain("4");
    expect(filterTrainers(list, { status: "applicants" }).map((x) => x.id)).toEqual(["4"]);
  });
  it("matches professional certs as tags and multi-word queries across fields", () => {
    expect(filterTrainers(list, { tags: ["ccar-f"] }).map((x) => x.id)).toEqual(["5"]);
    expect(filterTrainers(list, { q: "pmp python" }).map((x) => x.id)).toEqual(["5"]);
  });
  it("counts top tags once per trainer", () => {
    expect(topTags([...list, t({ certifications: ["PMP", "pmp"] })], "certifications")[0]).toEqual({ tag: "PMP", count: 2 });
  });
});

describe("trainer naming rule", () => {
  it("uppercases the full name and marks doctorates with (DR)", () => {
    expect(canonicalTrainerName("Dr. Alfred Ang Chew Hoe", true)).toBe("ALFRED ANG CHEW HOE (DR)");
    expect(canonicalTrainerName("Malcolm Soo Chee Kong")).toBe("MALCOLM SOO CHEE KONG");
    expect(canonicalTrainerName("Koh Lian Chong (ROS)")).toBe("KOH LIAN CHONG");
    expect(canonicalTrainerName("ALFRED ANG CHEW HOE (DR)", true)).toBe("ALFRED ANG CHEW HOE (DR)");
  });
  it("detects a doctorate from the name or education", () => {
    expect(hasDoctorate("Dr Mak Wai Keong")).toBe(true);
    expect(hasDoctorate("Lee Ming", "PhD in Computer Science, NUS")).toBe(true);
    expect(hasDoctorate("Lee Ming", "Doctor of Business Administration")).toBe(true);
    expect(hasDoctorate("Lee Ming", "Bachelor of Engineering")).toBe(false);
  });
});

describe("preferred name from CV", () => {
  it("combines the English name with the legal name (Singapore style)", () => {
    expect(preferredName("Amanda Liaw", "Liaw Yit Lan", true)).toBe("Amanda Liaw Yit Lan");
    expect(preferredName("Malcolm Soo", "Malcolm Soo Chee Kong", true)).toBe("Malcolm Soo Chee Kong");
  });
  it("keeps the TMS name when the documents name someone else", () => {
    expect(preferredName("Ajay Kumar Ravindran", "Bidari Ajay Babu", true)).toBe("Ajay Kumar Ravindran");
  });
  it("uses the CV name for folder-only records", () => {
    expect(preferredName("Jane Tan", "Tan Cheng Hui", false)).toBe("Tan Cheng Hui");
  });
});

describe("trainer helpers", () => {
  it("canonicalises training cert spellings", () => {
    expect(canonicalTrainingCert("dddpl")).toBe("DDDLP");
    expect(canonicalTrainingCert("ALCP")).toBe("ACLP");
    expect(canonicalTrainingCert("ae registry")).toBe("AE Registry");
  });
  it("masks NRIC to first letter + last 4", () => {
    expect(maskNric("S1234567A")).toBe("S****567A");
    expect(maskNric(null)).toBe("");
  });
  it("gates Trainer Management on the TRAINER_ADMIN role only", () => {
    expect(hasTrainerAdminAccess(["STAFF", "TRAINER_ADMIN"])).toBe(true);
    expect(hasTrainerAdminAccess(["ADMIN"])).toBe(false);
    expect(hasTrainerAdminAccess(undefined)).toBe(false);
  });
  it("validates input: uppercases NRIC, cleans lists, rejects bad email", () => {
    const ok = trainerInputSchema.parse({ nric: "s1234567a", skills: [" Python ", "python", ""], trainingCerts: ["dddpl"] });
    expect(ok.nric).toBe("S1234567A");
    expect(ok.skills).toEqual(["Python"]);
    expect(ok.trainingCerts).toEqual(["DDDLP"]);
    expect(trainerInputSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

const rec = (over: Partial<TrainerRecord>): TrainerRecord => ({
  sourceKey: "folder:X", tmsId: null, name: "X", nickname: null, nric: null, phone: null, email: null, secondaryEmail: null,
  nationality: null, gender: null, linkedinUrl: null, cvUrl: null, cvFolderUrl: null, trainerType: "Not in TMS", status: "Active",
  inTms: false, isActaTrainer: true, trainingCerts: [], certifications: [], skills: [], education: null, experience: [], summary: null,
  financeBackground: false, financeEvidence: [], ibfFitDeclaration: false, ibfFitFiles: [], actaFolder: "X", moreFolders: [],
  evidenceFiles: [], courses: [], recentClasses: [], calendarClasses: [], classesCount: 0, lastClassDate: null, profileSource: null, ...over,
});

describe("trainer import merge", () => {
  it("merges an email application into a one-word ACTA folder and takes the full name", () => {
    const { records, report } = mergeTrainerSources({
      export: { trainers: [rec({ sourceKey: "folder:Don", name: "Don", actaFolder: "Don", trainingCerts: ["ACLP"] })] },
      email: { trainers: [{ fullName: "Don Chan", email: "don@x.sg", skills: ["DaVinci Resolve"], status: "Onboarded" }] },
    });
    expect(report.added).toEqual([]);
    expect(records[0].name).toBe("DON CHAN");
    expect(records[0].email).toBe("don@x.sg");
    expect(records[0].skills).toContain("DaVinci Resolve");
  });
  it("never overwrites TMS values, only fills blanks", () => {
    const { records } = mergeTrainerSources({
      export: { trainers: [rec({ sourceKey: "tms:1", inTms: true, name: "Janrius Rogers", email: "j@tms.sg", education: "Diploma" })] },
      email: { trainers: [{ fullName: "Janrius Y Rogers", email: "other@x.sg", education: "Master", phone: "9123" }] },
    });
    expect(records[0].email).toBe("j@tms.sg");
    expect(records[0].education).toBe("Diploma");
    expect(records[0].name).toBe("JANRIUS ROGERS");
  });
  it("adds unmatched email applicants with Applicant status", () => {
    const { records, report } = mergeTrainerSources({
      export: { trainers: [rec({})] },
      email: { trainers: [{ fullName: "New Person", email: "new@x.sg", status: "New", trainingCerts: ["aclp"] }] },
    });
    expect(report.added).toEqual(["New Person (Applicant)"]);
    const added = records.find((r) => r.sourceKey === "email:new@x.sg")!;
    expect(added.status).toBe("Applicant");
    expect(added.trainingCerts).toEqual(["ACLP"]);
  });
});

import { describe, expect, it } from "vitest";
import { skillMatches, skillsFromTitle, skillsFromTitles, unionSkills } from "@/lib/trainer-skills";
import { filterTrainers, type TrainerListItem } from "@/lib/trainers";

const trainer = (o: Partial<TrainerListItem>): TrainerListItem => ({
  id: "t", name: "X", nickname: null, phone: null, email: null, trainerType: null, status: "Active", inTms: true,
  trainingCerts: [], certifications: [], skills: [], education: null, summary: null, financeBackground: false,
  ibfFitDeclaration: false, classesCount: 0, lastClassDate: null, courseTitles: [], ...o,
});

describe("skillsFromTitle", () => {
  it("maps Articulate Storyline 360 to Articulate 360", () => {
    expect(skillsFromTitle("Mastering Articulate Storyline 360 for e-Learning Content Creation")).toContain("Articulate 360");
  });
  it("derives several skills from one title", () => {
    const s = skillsFromTitle("Business Process Automation with Power Automate and Copilot Studio Agents");
    expect(s).toEqual(expect.arrayContaining(["Power Automate", "Power Platform", "Microsoft Copilot", "Agentic AI", "Business process automation"]));
  });
  it("ignores test and expired prefixes", () => {
    expect(skillsFromTitle("TEST - Training Course (LMS Only)")).toEqual([]);
    expect(skillsFromTitle("(Expired) Certified Lean Six Sigma Green Belt (CLSSGB) Training")).toContain("Lean Six Sigma");
  });
  it("does not read a stray R or AI inside words", () => {
    expect(skillsFromTitle("Strategic Mergers and Acquisitions")).not.toContain("R");
    expect(skillsFromTitle("Retail Training")).not.toContain("AI");
    expect(skillsFromTitle("Data Analytics and Visualization with R")).toContain("R");
  });
});

describe("skillsFromTitles / unionSkills", () => {
  it("dedupes across titles", () => {
    expect(skillsFromTitles(["Python Fundamental Course for Beginners", "AI Vibe Coding with Python"]).filter((s) => s === "Python")).toHaveLength(1);
  });
  it("never removes or renames existing skills", () => {
    expect(unionSkills(["python", "Soft Skill"], ["Python", "Articulate 360"])).toEqual(["python", "Soft Skill", "Articulate 360"]);
  });
});

describe("skillMatches", () => {
  it("matches a synonym skill", () => {
    expect(skillMatches("Articulate 360", ["Articulate Storyline"])).toBe(true);
    expect(skillMatches("articulate 360", ["Articulate Rise"])).toBe(true);
  });
  it("matches a course taught", () => {
    expect(skillMatches("Articulate 360", ["Soft Skill"], ["Mastering Articulate Storyline 360 for e-Learning"])).toBe(true);
  });
  it("keeps exact matching for tags without a rule", () => {
    expect(skillMatches("Soft Skill", ["Soft Skill"])).toBe(true);
    expect(skillMatches("Soft Skill", ["Python"])).toBe(false);
  });
  it("does not match unrelated trainers", () => {
    expect(skillMatches("Articulate 360", ["Python"], ["Python Fundamental Course for Beginners"])).toBe(false);
  });
});

describe("filterTrainers tag filter", () => {
  it("finds Dr Mak for Articulate 360", () => {
    const mak = trainer({ name: "MAK WAI KEONG (DR)", skills: ["Articulate Storyline", "Articulate Rise"] });
    const other = trainer({ name: "OTHER", skills: ["Python"] });
    expect(filterTrainers([mak, other], { tags: ["Articulate 360"] }).map((t) => t.name)).toEqual(["MAK WAI KEONG (DR)"]);
  });
});

/**
 * Course title → skill tags for trainers (Alfred, 11 Nov 2026: a skill search such as
 * "Articulate 360" must find everyone who has taught it, e.g. Dr Mak via "Mastering Articulate
 * Storyline 360 …"). One rule per skill; `skill` uses the spelling already most common in the
 * Trainer.skills data. The same rules drive:
 *   - skillsFromTitles(): skills derived from the classes a trainer taught (TMS courses, Google
 *     Calendar / sales@ invitations), unioned into Trainer.skills by the importer;
 *   - skillMatches(): the directory's skill filter, so a tag also matches its synonyms
 *     ("Articulate 360" ↔ "Articulate Storyline") and the titles of courses taught.
 */

export interface SkillRule {
  skill: string;
  /** Matches a course title or another skill spelling that implies this skill. */
  match: RegExp;
}

export const SKILL_RULES: SkillRule[] = [
  // e-learning
  { skill: "Articulate 360", match: /\barticulate\b|\bstoryline\b|\barticulate rise\b|\brise 360\b/i },
  { skill: "Instructional design", match: /instructional design|e-?learning (content|development|design)/i },
  // AI
  { skill: "AI", match: /\bai\b|artificial intelligence/i },
  { skill: "Generative AI", match: /generative ai|\bgen ?ai\b/i },
  { skill: "Agentic AI", match: /agentic|\bai agents?\b|multi[- ]?(ai )?agents?|\bautogen\b|\bcrewai\b|\badk\b|\blangflow\b|\bn8n\b|copilot studio/i },
  { skill: "ChatGPT", match: /chatgpt|\bopenai\b|\bcodex\b/i },
  { skill: "Claude", match: /\bclaude\b/i },
  { skill: "Microsoft Copilot", match: /\bcopilot\b/i },
  { skill: "AI Vibe Coding", match: /vibe coding|ai[- ]assisted (python )?programming/i },
  { skill: "AI ethics", match: /ai ethics|responsible ai/i },
  { skill: "Machine learning", match: /machine learning/i },
  { skill: "Deep learning", match: /deep learning|pytorch/i },
  { skill: "Computer vision", match: /computer vision/i },
  { skill: "NLP", match: /\bnlp\b|natural language processing/i },
  // data
  { skill: "Python", match: /\bpython\b/i },
  { skill: "R", match: /\bwith r\b|\br fundamental|\br programming\b/i },
  { skill: "SQL", match: /\bsql\b/i },
  { skill: "Power BI", match: /power ?bi\b|\bpl-300\b/i },
  { skill: "Tableau", match: /\btableau\b/i },
  { skill: "Microsoft Excel", match: /\bexcel\b|power (query|pivot)/i },
  { skill: "Excel VBA", match: /\bvba\b/i },
  { skill: "Data analytics", match: /data analytic|data analysis|data mining|data insights/i },
  { skill: "Data visualisation", match: /visuali[sz]ation|data storytelling|dashboard/i },
  { skill: "Statistics", match: /statistic/i },
  { skill: "Neo4j", match: /neo4j|graph database/i },
  // Microsoft / Power Platform
  { skill: "Power Platform", match: /power platform|\bpl-(900|400)\b|power apps|power automate/i },
  { skill: "Power Automate", match: /power automate/i },
  { skill: "Power Apps", match: /power apps/i },
  { skill: "RPA", match: /\brpa\b|robotic(s)? process automation/i },
  { skill: "Microsoft 365", match: /microsoft 365|\bm365\b|sharepoint/i },
  { skill: "SharePoint", match: /sharepoint/i },
  // cloud / devops
  { skill: "AWS", match: /\baws\b|amazon web services/i },
  { skill: "Azure", match: /\bazure\b|\baz-\d{3}\b/i },
  { skill: "Google Cloud", match: /google (associate )?cloud|\bgcp\b/i },
  { skill: "DevOps", match: /devops/i },
  { skill: "Docker", match: /\bdocker\b/i },
  { skill: "Kubernetes", match: /kubernetes|\bckad?\b/i },
  { skill: "Linux", match: /\blinux\b|shell scripting/i },
  { skill: "GitHub", match: /\bgithub\b/i },
  { skill: "ITIL", match: /\bitil\b/i },
  { skill: "CompTIA", match: /comptia/i },
  { skill: "Networking", match: /networking|\bccnp?a?\b|\bcisco\b|network\+/i },
  { skill: "Cybersecurity", match: /cyber ?security|security\+|\bcysa\b|pentest|network securit|security operations|ai security|cyber frauds|quantum computing and cryptography/i },
  { skill: "Ethical hacking", match: /pentest|ethical hacking|penetration testing/i },
  { skill: "Quantum computing", match: /quantum/i },
  { skill: "Blockchain", match: /blockchain|\bweb3\b|\bnft\b/i },
  // software / web
  { skill: "Web development", match: /web app|web design|full stack|wordpress|\bwix\b|asp\.net|rest(ful)? api|\breact\b|website/i },
  { skill: "WordPress", match: /wordpress/i },
  { skill: "C#", match: /\bc#/i },
  { skill: "Rust", match: /\brust\b/i },
  { skill: "iOS development", match: /\bios\b.*(app|development)/i },
  { skill: "UI/UX", match: /\bui\/ux\b|\bux\b/i },
  { skill: "Figma", match: /\bfigma\b/i },
  { skill: "Google Workspace", match: /google workspace|google sheets|looker studio|google apps script/i },
  { skill: "Google Classroom", match: /google classroom/i },
  { skill: "Notion", match: /\bnotion\b/i },
  { skill: "Canva", match: /\bcanva\b/i },
  // design / media
  { skill: "Video creation", match: /\bvideo\b/i },
  { skill: "Adobe Premiere Pro", match: /premiere pro/i },
  { skill: "Adobe After Effects", match: /after effects/i },
  { skill: "Adobe Photoshop", match: /photoshop/i },
  { skill: "Adobe Illustrator", match: /\billustrator\b/i },
  { skill: "Adobe InDesign", match: /indesign/i },
  { skill: "Adobe Lightroom", match: /lightroom/i },
  { skill: "Photography", match: /photograph|photo editing/i },
  { skill: "Blender", match: /\bblender\b/i },
  { skill: "3ds Max", match: /3ds max/i },
  { skill: "AutoCAD", match: /autocad|civil 3d/i },
  { skill: "Revit", match: /\brevit\b/i },
  { skill: "BIM", match: /\bbim\b/i },
  { skill: "SketchUp", match: /sketchup/i },
  { skill: "Autodesk Inventor", match: /autodesk inventor/i },
  { skill: "Fusion 360", match: /fusion 360/i },
  { skill: "3D printing", match: /3d printing|additive manufacturing/i },
  { skill: "Unity", match: /\bunity\b/i },
  { skill: "Game development", match: /game development/i },
  // hardware / engineering
  { skill: "IoT", match: /internet[- ]of[- ]things|\biot\b/i },
  { skill: "Arduino", match: /arduino/i },
  { skill: "Raspberry Pi", match: /raspberry pi/i },
  { skill: "Robotics", match: /\brobot/i },
  { skill: "Semiconductor", match: /semiconductor|\bcmos\b/i },
  { skill: "Lean Six Sigma", match: /six sigma|\bclss[a-z]{2}\b/i },
  { skill: "Lean manufacturing", match: /lean manufacturing/i },
  { skill: "FMEA", match: /\bfmea\b/i },
  { skill: "Design of Experiments", match: /design of experiment|\bdoe\b/i },
  { skill: "Statistical process control", match: /statistical process control|\bspc\b/i },
  { skill: "ISO 9001", match: /iso ?9001/i },
  { skill: "ISO 14001", match: /iso ?14001/i },
  { skill: "ISO 14064", match: /iso ?14064/i },
  { skill: "Sustainability", match: /sustainab|carbon footprint|greenhouse|\bghg\b|environmental management/i },
  { skill: "Urban farming", match: /hydroponic|urban (farming|agriculture)|plant health/i },
  // business
  { skill: "Digital marketing", match: /digital marketing|marketing on meta|paid search|inbound marketing|email marketing|social media marketing/i },
  { skill: "Social media marketing", match: /social media marketing|\bmeta platforms\b/i },
  { skill: "Email marketing", match: /email marketing/i },
  { skill: "SEO", match: /\bseo\b|search engine optimi[sz]ation/i },
  { skill: "eCommerce", match: /e-?commerce|shopify/i },
  { skill: "Shopify", match: /shopify/i },
  { skill: "Branding", match: /branding/i },
  { skill: "Content creation", match: /content creation|script development|storytelling/i },
  { skill: "Project Management", match: /project management|\bpmp\b|microsoft project/i },
  { skill: "Agile", match: /\bagile\b/i },
  { skill: "Scrum", match: /\bscrum\b/i },
  { skill: "Design thinking", match: /design thinking/i },
  { skill: "Business process automation", match: /process automation|workflow automation/i },
  { skill: "Accounting", match: /accounting|quickbooks|\bxero\b|tax computation/i },
  { skill: "Xero", match: /\bxero\b/i },
  { skill: "QuickBooks", match: /quickbooks/i },
  { skill: "Finance", match: /financ|budgeting|tax computation|mergers|valuation|financial trading|ratio analysis/i },
  { skill: "HR", match: /\bhr\b|human resource|recruitment/i },
  { skill: "Leadership", match: /leadership/i },
  { skill: "Communication skills", match: /communicat|commuincation/i },
  { skill: "Customer service", match: /customer service|customer satisfaction|customer-centric/i },
  { skill: "Sales", match: /\bselling\b|\bsales\b/i },
  { skill: "Negotiation", match: /negotiation/i },
  { skill: "Conflict resolution", match: /conflict resolution/i },
  { skill: "PDPA", match: /personal data protection|\bpdpa\b/i },
  { skill: "Business continuity", match: /business continuity|business disruptions/i },
  { skill: "Corporate law", match: /corporate law/i },
  { skill: "Healthcare", match: /healthcare/i },
  { skill: "Workplace wellness", match: /health and wellness/i },
  { skill: "DISC", match: /\bdisc\b/i },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Titles that are not real classes. */
function cleanTitle(title: string): string | null {
  const t = title
    .replace(/^\s*\(expired\)\s*/i, "")
    .replace(/^\s*(re:|fwd:)\s*/gi, "")
    .trim();
  if (!t || /^test\b/i.test(t)) return null;
  return t;
}

/** Skill tags implied by one course title. */
export function skillsFromTitle(title: string): string[] {
  const t = cleanTitle(title);
  if (!t) return [];
  return SKILL_RULES.filter((r) => r.match.test(t)).map((r) => r.skill);
}

/** Skill tags implied by a list of course titles, de-duplicated, in rule order. */
export function skillsFromTitles(titles: readonly string[]): string[] {
  const hit = new Set<string>();
  for (const title of titles) for (const s of skillsFromTitle(title)) hit.add(s);
  return SKILL_RULES.map((r) => r.skill).filter((s) => hit.has(s));
}

/** Union `add` into `existing`, never removing or renaming; case-insensitive duplicates skipped. */
export function unionSkills(existing: readonly string[], add: readonly string[]): string[] {
  const seen = new Set(existing.map(norm));
  const out = [...existing];
  for (const s of add) {
    if (!seen.has(norm(s))) {
      seen.add(norm(s));
      out.push(s);
    }
  }
  return out;
}

/**
 * True when a trainer with these skill/cert values and course titles matches the skill `tag`:
 * an exact (case-insensitive) value, or any rule the tag names (by its skill or by its pattern)
 * matching one of the values or course titles — so "Articulate 360" also finds "Articulate
 * Storyline" and "Mastering Articulate Storyline 360 for e-Learning".
 */
export function skillMatches(tag: string, values: readonly string[], courseTitles: readonly string[] = []): boolean {
  const n = norm(tag);
  if (!n) return true;
  if (values.some((v) => norm(v) === n)) return true;
  const rules = SKILL_RULES.filter((r) => norm(r.skill) === n || r.match.test(tag));
  if (rules.length === 0) return false;
  const pool = [...values, ...courseTitles];
  return rules.some((r) => pool.some((v) => norm(v) === norm(r.skill) || r.match.test(v)));
}

export type CalendarClass = { date: string; title: string; calendar?: string };

/** Merge class lists, de-duplicated by date + title (first one wins). */
export function mergeCalendarClasses(...lists: unknown[]): CalendarClass[] {
  const out: CalendarClass[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const c = raw as Partial<CalendarClass>;
      if (!c?.title) continue;
      const key = `${String(c.date ?? "").slice(0, 10)}|${norm(String(c.title))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date: String(c.date ?? "").slice(0, 10), title: String(c.title), ...(c.calendar ? { calendar: String(c.calendar) } : {}) });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Titles of the classes a trainer taught on or after `since` (YYYY-MM-DD): TMS `courses` (by their
 * last run), TMS `recentClasses` and Google Calendar / sales@ invitation `calendarClasses`.
 */
export function titlesTaughtSince(src: { courses?: unknown; recentClasses?: unknown; calendarClasses?: unknown }, since: string): string[] {
  const titles: string[] = [];
  const each = (v: unknown, dateKey: string) => {
    if (!Array.isArray(v)) return;
    for (const raw of v) {
      const c = raw as Record<string, unknown>;
      const title = String(c?.title ?? "");
      const date = String(c?.[dateKey] ?? "").slice(0, 10);
      if (title && date >= since) titles.push(title);
    }
  };
  each(src.courses, "last");
  each(src.recentClasses, "start");
  each(src.calendarClasses, "date");
  return titles;
}

/** YYYY-MM-DD two years before `now`. */
export function twoYearsAgo(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

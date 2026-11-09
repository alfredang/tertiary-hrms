/**
 * Import trainers into the HRMS Trainer table straight from the Mac (needs DATABASE_URL).
 * The Mac agent normally does this over HTTPS instead: POST /api/agent/trainers/import.
 *
 *   python3 scripts/trainers/export_planner_trainers.py      # TMS + ACTA folder + Vesta notes -> .trainers/trainers-export.json
 *   npx tsx scripts/trainers/import-trainers.ts --dry-run     # show what would change
 *   npx tsx scripts/trainers/import-trainers.ts               # write
 *
 * Optional extra inputs in .trainers/ (git-ignored, they hold NRIC/phone):
 *   email-trainers.json  {"trainers":[EmailTrainer]}           trainer applications found in Gmail
 *   cv-profiles.json     {"profiles":{"<sourceKey>":CvProfile}} CVs read from the ACTA Trainers folders
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { mergeTrainerSources, upsertTrainers, type TrainerSources } from "../../src/lib/trainer-import";

const DIR = path.join(process.cwd(), ".trainers");
const DRY = process.argv.includes("--dry-run");
const readJson = <T,>(file: string): T | null => {
  const p = path.join(DIR, file);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null;
};

async function main() {
  const exp = readJson<TrainerSources["export"]>("trainers-export.json");
  if (!exp) throw new Error("Missing .trainers/trainers-export.json — run scripts/trainers/export_planner_trainers.py first");
  // Folder renames from rename_acta_folders.py: "folder:<old>" -> "folder:<NEW NAME>".
  const renames: Record<string, string> = {};
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((x) => x.startsWith("acta-rename-manifest-")).sort() : []) {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as { renames: { old: string; new: string }[]; merges: { old: string; into: string }[] };
    for (const r of m.renames) renames[`folder:${r.old}`] = `folder:${r.new}`;
    for (const r of m.merges) renames[`folder:${r.old}`] = `folder:${r.into}`;
  }
  const cv = readJson<NonNullable<TrainerSources["cv"]>>("cv-profiles.json");
  if (cv) {
    // CV profiles read before a rename are keyed by the old folder name: follow the renames (chains too).
    const follow = (k: string) => { let x = k; for (let i = 0; i < 5 && renames[x]; i++) x = renames[x]; return x; };
    cv.profiles = Object.fromEntries(Object.entries(cv.profiles).map(([k, v]) => [follow(k), v]));
  }
  const { records, report } = mergeTrainerSources({ export: exp, email: readJson("email-trainers.json"), cv });
  console.log(`${report.total} trainers (${report.fromExport} from TMS/ACTA folder, ${report.added.length} new from email, ${report.merged.length} email profiles merged, ${report.cvFilled} CV profiles)`);
  if (report.merged.length) console.log("  merged:", report.merged.join("; "));
  if (report.added.length) console.log("  new from email:", report.added.join("; "));
  const res = await upsertTrainers(records, { dryRun: DRY, renames });
  console.log(`${DRY ? "[dry-run] " : ""}re-keyed ${res.rekeyed} renamed folders, created ${res.created}, updated ${res.updated}, kept Trainer Admin edits on ${res.keptEdits}, pruned ${res.pruned} stale folder-only records; ${res.notInSources} HRMS trainers not in any source (left untouched)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

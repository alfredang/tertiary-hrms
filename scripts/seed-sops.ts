/**
 * Seed / refresh the `Sop` table from src/lib/sop-data.ts (upsert by slug). Idempotent.
 *
 *   npx tsx scripts/seed-sops.ts                       # dry-run (default): show what would be created / updated
 *   npx tsx scripts/seed-sops.ts --apply               # write
 *   npx tsx scripts/seed-sops.ts --apply --deactivate-missing
 *                                                      # also set active=false on DB SOPs no longer in the file
 *
 * Needs the schema pushed first (`npm run db:push`). DATABASE_URL is PRODUCTION — always dry-run first.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { SOPS } from "../src/lib/sop-data";
import { sopToRowData } from "../src/lib/sop-utils";

const APPLY = process.argv.includes("--apply");
const DEACTIVATE = process.argv.includes("--deactivate-missing");

// Json? columns need Prisma.DbNull rather than a bare null.
const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));
// Postgres jsonb reorders object keys, so compare with keys sorted at every level.
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object" && !(v instanceof Date)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const comparable = (v: unknown) => JSON.stringify(canonical(v ?? null));

async function main() {
  const slugs = new Set<string>();
  for (const s of SOPS) {
    if (slugs.has(s.slug)) throw new Error(`Duplicate SOP slug in sop-data.ts: ${s.slug}`);
    slugs.add(s.slug);
    if (!s.steps.length) throw new Error(`SOP ${s.slug} has no steps`);
  }

  let existing: Awaited<ReturnType<typeof prisma.sop.findMany>> = [];
  try {
    existing = await prisma.sop.findMany();
  } catch (e) {
    if (APPLY) throw e;
    console.warn(`Could not read the Sop table (${e instanceof Error ? e.message.split("\n")[0] : e}). Has the schema been pushed? Treating it as empty.`);
  }
  const bySlug = new Map(existing.map((r) => [r.slug, r]));

  const created: string[] = [];
  const updated: { slug: string; fields: string[] }[] = [];
  let unchanged = 0;

  for (const sop of SOPS) {
    const data = sopToRowData(sop);
    const row = bySlug.get(sop.slug);
    if (!row) {
      created.push(sop.slug);
    } else {
      const fields = (Object.keys(data) as (keyof typeof data)[]).filter(
        (k) => comparable(data[k]) !== comparable(row[k as keyof typeof row]),
      );
      if (!fields.length) {
        unchanged++;
        continue;
      }
      updated.push({ slug: sop.slug, fields });
    }
    if (APPLY) {
      const write = {
        ...data,
        triggers: json(data.triggers),
        steps: data.steps as Prisma.InputJsonValue,
        references: json(data.references),
      };
      await prisma.sop.upsert({ where: { slug: sop.slug }, create: { slug: sop.slug, ...write }, update: write });
    }
  }

  const missing = existing.filter((r) => !slugs.has(r.slug) && r.active).map((r) => r.slug);
  if (APPLY && DEACTIVATE && missing.length) {
    await prisma.sop.updateMany({ where: { slug: { in: missing } }, data: { active: false } });
  }

  const tag = APPLY ? "" : "[dry-run] would have ";
  console.log(`${SOPS.length} SOPs in src/lib/sop-data.ts; ${existing.length} rows in the Sop table.`);
  console.log(`${tag}created ${created.length}, updated ${updated.length}, ${unchanged} unchanged.`);
  for (const s of created) console.log(`  + ${s}`);
  for (const u of updated) console.log(`  ~ ${u.slug} (${u.fields.join(", ")})`);
  if (missing.length) {
    console.log(
      `${missing.length} active DB SOPs are not in the file${DEACTIVATE ? (APPLY ? " — deactivated" : " — would be deactivated") : " (pass --deactivate-missing to hide them)"}:`,
    );
    for (const s of missing) console.log(`  - ${s}`);
  }
  if (!APPLY) console.log("Nothing written. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

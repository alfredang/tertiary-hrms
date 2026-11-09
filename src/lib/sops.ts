// Server-side SOP reads. The `Sop` table is the source of truth once seeded
// (scripts/seed-sops.ts); until then — or if the table is missing because the schema has not been
// pushed — we serve the static list in src/lib/sop-data.ts so /sop never breaks.
import { prisma } from "@/lib/prisma";
import { SOPS, type Sop } from "@/lib/sop-data";
import { sopFromRow } from "@/lib/sop-utils";

export type SopSource = "database" | "static";

export async function getSops(): Promise<{ sops: Sop[]; source: SopSource }> {
  try {
    const rows = await prisma.sop.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    if (rows.length > 0) return { sops: rows.map(sopFromRow), source: "database" };
    // Table exists but has no active rows: only fall back when it is truly empty.
    if ((await prisma.sop.count()) > 0) return { sops: [], source: "database" };
  } catch (e) {
    console.warn("[sop] falling back to static SOP list:", e instanceof Error ? e.message : e);
  }
  return { sops: SOPS, source: "static" };
}

export async function getSopBySlug(slug: string): Promise<Sop | undefined> {
  try {
    const row = await prisma.sop.findUnique({ where: { slug } });
    if (row) return row.active ? sopFromRow(row) : undefined;
    if ((await prisma.sop.count()) > 0) return undefined;
  } catch (e) {
    console.warn("[sop] falling back to static SOP list:", e instanceof Error ? e.message : e);
  }
  return SOPS.find((s) => s.slug === slug);
}

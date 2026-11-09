// Pure SOP helpers: shared by the server read path (src/lib/sops.ts), the client-side
// directory (search + grouping) and the seed script. No Prisma import here.
import { SOP_CATEGORIES, type Sop, type SopCategory, type SopReference, type SopStep } from "./sop-data";

/** What the /sop index needs per SOP; `searchText` is pre-lowered so the client filter stays cheap. */
export type SopListItem = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  owner?: string;
  stepCount: number;
  sortOrder: number;
  searchText: string;
};

export type SopGroup<T> = { category: string; description?: string; items: T[] };

export function toSopListItem(sop: Sop): SopListItem {
  const parts = [
    sop.title,
    sop.summary,
    sop.category,
    sop.owner,
    sop.purpose,
    sop.scope,
    ...(sop.triggers ?? []),
    ...sop.steps.flatMap((s) => [s.title, s.detail, s.owner, s.timing, s.note, ...(s.items ?? [])]),
  ];
  return {
    slug: sop.slug,
    title: sop.title,
    category: sop.category,
    summary: sop.summary,
    owner: sop.owner,
    stepCount: sop.steps.length,
    sortOrder: sop.sortOrder,
    searchText: parts.filter(Boolean).join(" • ").toLowerCase(),
  };
}

/** Every whitespace-separated term must appear somewhere in the SOP (AND search, case-insensitive). */
export function filterSops<T extends { searchText: string }>(items: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((i) => terms.every((t) => i.searchText.includes(t)));
}

const CATEGORY_INDEX = new Map<string, number>(SOP_CATEGORIES.map((c, i) => [c.name, i]));
const CATEGORY_DESCRIPTION = new Map<string, string>(SOP_CATEGORIES.map((c) => [c.name, c.description]));

/**
 * Group SOPs under their category, in the fixed SOP_CATEGORIES order (unknown categories go last,
 * alphabetically). Empty groups are omitted; items keep sortOrder, then title.
 */
export function groupSopsByCategory<T extends { category: string; sortOrder: number; title: string }>(items: T[]): SopGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const list = map.get(it.category);
    if (list) list.push(it);
    else map.set(it.category, [it]);
  }
  const rank = (c: string) => CATEGORY_INDEX.get(c) ?? Number.MAX_SAFE_INTEGER;
  return Array.from(map.entries())
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      description: CATEGORY_DESCRIPTION.get(category),
      items: [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    }));
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const strList = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length ? out : undefined;
};

function toSteps(v: unknown): SopStep[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw): SopStep[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const title = str(r.title);
    if (!title) return [];
    const links = Array.isArray(r.links)
      ? r.links.flatMap((l) => {
          const o = (l ?? {}) as Record<string, unknown>;
          const label = str(o.label);
          const href = str(o.href);
          return label && href ? [{ label, href }] : [];
        })
      : [];
    return [
      {
        title,
        detail: str(r.detail) ?? str(r.summary) ?? "",
        items: strList(r.items) ?? strList(r.details),
        owner: str(r.owner),
        timing: str(r.timing),
        note: str(r.note),
        links: links.length ? links : undefined,
      },
    ];
  });
}

function toReferences(v: unknown): SopReference[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.flatMap((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const label = str(o.label);
    const value = str(o.value);
    return label && value ? [{ label, value, href: str(o.href) }] : [];
  });
  return out.length ? out : undefined;
}

/** Shape of a `Sop` row as Prisma returns it (Json columns are `unknown` to us). */
export type SopRow = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  purpose: string | null;
  scope: string | null;
  owner: string | null;
  triggers: unknown;
  steps: unknown;
  references: unknown;
  source: string | null;
  sortOrder: number;
  updatedAt: Date;
};

/** Turn a DB row into a Sop, tolerating hand-edited or partial JSON. */
export function sopFromRow(row: SopRow): Sop {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category as SopCategory,
    summary: row.summary,
    purpose: row.purpose ?? undefined,
    scope: row.scope ?? undefined,
    owner: row.owner ?? undefined,
    triggers: strList(row.triggers),
    steps: toSteps(row.steps),
    references: toReferences(row.references),
    source: row.source ?? undefined,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The columns the seed script writes for one SOP (undefined optional fields become null). */
export function sopToRowData(sop: Sop) {
  return {
    title: sop.title,
    category: sop.category,
    summary: sop.summary,
    purpose: sop.purpose ?? null,
    scope: sop.scope ?? null,
    owner: sop.owner ?? null,
    triggers: sop.triggers ?? null,
    steps: JSON.parse(JSON.stringify(sop.steps)) as unknown,
    references: sop.references ? (JSON.parse(JSON.stringify(sop.references)) as unknown) : null,
    source: sop.source ?? null,
    sortOrder: sop.sortOrder,
    active: true,
  };
}

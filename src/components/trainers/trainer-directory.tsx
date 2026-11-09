"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, X, BadgeCheck, Landmark, FileCheck2, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TRAINING_CERTS,
  filterTrainers,
  isApplicant,
  topTags,
  type TrainerFilters,
  type TrainerListItem,
} from "@/lib/trainers";

const PAGE = 60;
type Sort = "recent" | "name" | "classes";

export function TrainerDirectory({ trainers, lastImport }: { trainers: TrainerListItem[]; lastImport: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Filters live in the URL so a search can be bookmarked/shared and survives Back from a profile.
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [certs, setCerts] = useState<string[]>(sp.getAll("cert"));
  const [tags, setTags] = useState<string[]>(sp.getAll("tag"));
  const [finance, setFinance] = useState(sp.get("finance") === "1");
  const [ibfFit, setIbfFit] = useState(sp.get("ibfFit") === "1");
  const [status, setStatus] = useState<NonNullable<TrainerFilters["status"]>>(
    (sp.get("status") as TrainerFilters["status"]) || "trainers",
  );
  const [sort, setSort] = useState<Sort>((sp.get("sort") as Sort) || "recent");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    certs.forEach((c) => p.append("cert", c));
    tags.forEach((t) => p.append("tag", t));
    if (finance) p.set("finance", "1");
    if (ibfFit) p.set("ibfFit", "1");
    if (status !== "trainers") p.set("status", status);
    if (sort !== "recent") p.set("sort", sort);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setLimit(PAGE);
  }, [q, certs, tags, finance, ibfFit, status, sort, pathname, router]);

  const results = useMemo(() => {
    const list = filterTrainers(trainers, { q, certs, tags, finance, ibfFit, status });
    const byName = (a: TrainerListItem, b: TrainerListItem) => a.name.localeCompare(b.name);
    if (sort === "name") return [...list].sort(byName);
    if (sort === "classes") return [...list].sort((a, b) => b.classesCount - a.classesCount || byName(a, b));
    return [...list].sort((a, b) => (b.lastClassDate ?? "").localeCompare(a.lastClassDate ?? "") || b.classesCount - a.classesCount || byName(a, b));
  }, [trainers, q, certs, tags, finance, ibfFit, status, sort]);

  const pool = useMemo(() => trainers.filter((t) => !isApplicant(t)), [trainers]);
  const stats = useMemo(
    () => ({
      total: pool.length,
      applicants: trainers.length - pool.length,
      finance: pool.filter((t) => t.financeBackground).length,
      ibf: pool.filter((t) => t.ibfFitDeclaration).length,
      byCert: Object.fromEntries(TRAINING_CERTS.map((c) => [c.code, pool.filter((t) => t.trainingCerts.includes(c.code)).length])),
    }),
    [pool, trainers.length],
  );
  // Chips come from the current results, so they narrow as you filter.
  const certChips = useMemo(() => topTags(results, "certifications", 18), [results]);
  const skillChips = useMemo(() => topTags(results, "skills", 30), [results]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const anyFilter = q || certs.length || tags.length || finance || ibfFit || status !== "trainers";
  const clearAll = () => {
    setQ("");
    setCerts([]);
    setTags([]);
    setFinance(false);
    setIbfFit(false);
    setStatus("trainers");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trainer Management</h1>
          <p className="text-sm text-muted-foreground">
            ACTA trainers from the LMS/TMS, the ACTA Trainers folder and trainer applications by email.
            {lastImport && <> Last import {new Date(lastImport).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}.</>}
          </p>
        </div>
        <Button asChild>
          <Link href="/trainers/new">
            <Plus className="h-4 w-4 mr-1" /> Add trainer
          </Link>
        </Button>
      </div>

      {/* Headline counts double as one-click filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatTile label="Trainers" value={stats.total} active={!anyFilter} onClick={clearAll} />
        {TRAINING_CERTS.map((c) => (
          <StatTile key={c.code} label={c.label} title={c.full} value={stats.byCert[c.code] ?? 0}
            active={certs.length === 1 && certs[0] === c.code} onClick={() => setCerts(certs.length === 1 && certs[0] === c.code ? [] : [c.code])} />
        ))}
        <StatTile label="Finance background" value={stats.finance} active={finance} onClick={() => setFinance(!finance)} />
        <StatTile label="IBF Fit declaration" value={stats.ibf} active={ibfFit} onClick={() => setIbfFit(!ibfFit)} />
        <StatTile label="Applicants" value={stats.applicants} active={status === "applicants"}
          onClick={() => setStatus(status === "applicants" ? "trainers" : "applicants")} />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, skill, certification, course, education… e.g. articulate, PMP, CCAR-F, python finance"
              className="pl-9"
              aria-label="Search trainers"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Status">
              <option value="trainers">Trainers</option>
              <option value="applicants">Applicants (from email)</option>
              <option value="all">All</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
              className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Sort">
              <option value="recent">Most recent class</option>
              <option value="classes">Most classes</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">Accreditation</span>
          {TRAINING_CERTS.map((c) => (
            <Chip key={c.code} on={certs.includes(c.code)} onClick={() => toggle(certs, setCerts, c.code)} title={c.full} tone="acta">
              <GraduationCap className="h-3 w-3" /> {c.label}
            </Chip>
          ))}
          <Chip on={finance} onClick={() => setFinance(!finance)} tone="fin"><Landmark className="h-3 w-3" /> Finance background</Chip>
          <Chip on={ibfFit} onClick={() => setIbfFit(!ibfFit)} tone="ibf"><FileCheck2 className="h-3 w-3" /> IBF Fit declaration</Chip>
        </div>
        {certChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">Certifications</span>
            {certChips.map((c) => (
              <Chip key={c.tag} on={tags.includes(c.tag)} onClick={() => toggle(tags, setTags, c.tag)}>
                <BadgeCheck className="h-3 w-3" /> {c.tag} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </div>
        )}
        {skillChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">Skills</span>
            {skillChips.map((c) => (
              <Chip key={c.tag} on={tags.includes(c.tag)} onClick={() => toggle(tags, setTags, c.tag)} tone="skill">
                {c.tag} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {results.length} of {trainers.length} shown
            {tags.length > 0 && <> · tags: {tags.join(", ")}</>}
          </span>
          {anyFilter ? (
            <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-primary hover:underline">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3">Trainer</th>
              <th className="px-4 py-3">Accreditation</th>
              <th className="px-4 py-3">Certifications · skills</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Last class</th>
              <th className="px-4 py-3 text-right">Classes</th>
            </tr>
          </thead>
          <tbody>
            {results.slice(0, limit).map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40 align-top">
                <td className="px-4 py-3 min-w-[200px]">
                  <Link href={`/trainers/${t.id}`} className="font-medium text-primary hover:underline">{t.name}</Link>
                  {t.nickname && t.nickname !== t.name && <div className="text-xs text-muted-foreground">“{t.nickname}”</div>}
                  <div className="text-xs text-muted-foreground">
                    {isApplicant(t) ? `Applicant · ${t.status}` : t.inTms ? `TMS · ${t.trainerType ?? ""}` : "ACTA folder · not in TMS"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.trainingCerts.map((c) => <Tag key={c} tone="acta">{c}</Tag>)}
                    {t.financeBackground && <Tag tone="fin">Finance</Tag>}
                    {t.ibfFitDeclaration && <Tag tone="ibf">IBF Fit</Tag>}
                    {!t.trainingCerts.length && !t.financeBackground && !t.ibfFitDeclaration && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[420px]">
                  <div className="flex flex-wrap gap-1">
                    {t.certifications.slice(0, 6).map((c) => <Tag key={c}>{c}</Tag>)}
                    {t.certifications.length > 6 && <span className="text-xs text-muted-foreground">+{t.certifications.length - 6}</span>}
                    {t.skills.slice(0, 5).map((s) => <Tag key={s} tone="skill">{s}</Tag>)}
                    {t.skills.length > 5 && <span className="text-xs text-muted-foreground">+{t.skills.length - 5}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">
                  {t.phone && <div><a href={`tel:${t.phone}`} className="hover:underline">{t.phone}</a></div>}
                  {t.email && <div><a href={`mailto:${t.email}`} className="hover:underline">{t.email}</a></div>}
                  {!t.phone && !t.email && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{t.lastClassDate ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.classesCount || <span className="text-muted-foreground">0</span>}</td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No trainers match. Try fewer filters, or search a broader term.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {results.length > limit && (
          <div className="p-3 text-center border-t">
            <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
              Show more ({results.length - limit} more)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

const TONES = {
  default: "border-border bg-muted/50 text-foreground",
  acta: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300",
  fin: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ibf: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  skill: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
} as const;
type Tone = keyof typeof TONES;

export function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", TONES[tone])}>{children}</span>;
}

function Chip({ children, on, onClick, title, tone = "default" }: { children: React.ReactNode; on: boolean; onClick: () => void; title?: string; tone?: Tone }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        on ? "bg-primary text-primary-foreground border-primary" : cn(TONES[tone], "hover:border-primary/60"),
      )}>
      {children}
    </button>
  );
}

function StatTile({ label, value, active, onClick, title }: { label: string; value: number; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
      className={cn("rounded-xl border p-3 text-left transition-colors", active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50")}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

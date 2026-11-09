"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, X, Copy, Check, MessageCircle } from "lucide-react";
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
  // Skills + professional certifications with counts, for the search box's suggestion list.
  const vocab = useMemo(() => {
    const certs = topTags(pool, "certifications", 400).map((t) => ({ ...t, kind: "Certification" as const }));
    const skills = topTags(pool, "skills", 600).map((t) => ({ ...t, kind: "Skill" as const }));
    const seen = new Set<string>();
    return [...certs, ...skills].filter((t) => {
      const k = t.tag.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [pool]);

  // One "Accreditation" dropdown drives the cert / finance / IBF flags. A multi-flag
  // combination can only come from an old bookmarked link; it shows as "Custom".
  const accValue =
    !certs.length && !finance && !ibfFit ? ""
    : certs.length === 1 && !finance && !ibfFit ? certs[0]
    : !certs.length && finance && !ibfFit ? "finance"
    : !certs.length && !finance && ibfFit ? "ibf"
    : "custom";
  const setAcc = (v: string) => {
    if (v === "custom") return;
    setCerts(TRAINING_CERTS.some((c) => c.code === v) ? [v] : []);
    setFinance(v === "finance");
    setIbfFit(v === "ibf");
  };

  const anyFilter = q || certs.length || tags.length || finance || ibfFit || status !== "trainers";
  const clearAll = () => {
    setQ("");
    setCerts([]);
    setTags([]);
    setFinance(false);
    setIbfFit(false);
    setStatus("trainers");
  };
  const selectCls = "h-10 rounded-md border bg-background px-3 text-sm min-w-0";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Trainer Management</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total} trainers · {stats.applicants} applicants
            {lastImport && <> · last import {new Date(lastImport).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}</>}
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/trainers/new">
            <Plus className="h-4 w-4 mr-1" /> Add trainer
          </Link>
        </Button>
      </div>

      <Card className="p-3 space-y-2">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <SkillSearch
            q={q}
            setQ={setQ}
            vocab={vocab}
            selected={tags}
            onPick={(tag) => { if (!tags.includes(tag)) setTags([...tags, tag]); setQ(""); }}
          />
          <div className="grid grid-cols-3 gap-2 lg:contents">
            <select value={accValue} onChange={(e) => setAcc(e.target.value)} className={selectCls} aria-label="Accreditation">
              <option value="">All accreditations</option>
              {TRAINING_CERTS.map((c) => (
                <option key={c.code} value={c.code} title={c.full}>{c.label} ({stats.byCert[c.code] ?? 0})</option>
              ))}
              <option value="finance">Finance background ({stats.finance})</option>
              <option value="ibf">IBF Fit declaration ({stats.ibf})</option>
              {accValue === "custom" && <option value="custom">Custom (from link)</option>}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectCls} aria-label="Status">
              <option value="trainers">Trainers ({stats.total})</option>
              <option value="applicants">Applicants ({stats.applicants})</option>
              <option value="all">All ({trainers.length})</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls} aria-label="Sort">
              <option value="recent">Most recent class</option>
              <option value="classes">Most classes</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
          <span className="text-muted-foreground">
            {results.length} {results.length === 1 ? "trainer" : "trainers"}
          </span>
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:border-primary/60">
              {t} <X className="h-3 w-3" />
            </button>
          ))}
          {anyFilter ? (
            <button type="button" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b whitespace-nowrap">
            <tr>
              <th className="px-2.5 py-3 font-semibold">Trainer</th>
              <th className="px-2.5 py-3 font-semibold">Certifications · Skills</th>
              <th className="px-2.5 py-3 font-semibold">Tel</th>
              <th className="px-2.5 py-3 font-semibold">Email</th>
              <th className="px-2.5 py-3 font-semibold">Last class taught</th>
              <th className="px-2.5 py-3 font-semibold text-right">Classes</th>
            </tr>
          </thead>
          <tbody>
            {results.slice(0, limit).map((t) => {
              const expertise = orderByMatch([...t.certifications, ...t.skills], [...tags, q]);
              const badges = [...t.trainingCerts];
              const shown = expertise.slice(0, Math.max(1, 3 - badges.length));
              const more = expertise.length - shown.length;
              return (
                <tr key={t.id} className="group/row border-b last:border-0 hover:bg-muted/40">
                  <td className="px-2.5 py-2.5">
                    <div className="flex max-w-[190px] items-center gap-1.5">
                      <Link href={`/trainers/${t.id}`} className="truncate font-medium text-primary hover:underline" title={t.name}>{t.name}</Link>
                      {t.financeBackground && <span title="Finance background" className="shrink-0 text-[11px]">💰</span>}
                      {t.ibfFitDeclaration && <span title="IBF Fit and Proper declaration on file" className="shrink-0 rounded border border-emerald-500/40 px-1 text-[10px] font-semibold text-emerald-700">IBF</span>}
                      {isApplicant(t) && <span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">{t.status}</span>}
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex max-w-[230px] items-center gap-1" title={[...badges, ...expertise].join(", ")}>
                      {badges.map((c) => <Tag key={c} tone="acta">{c}</Tag>)}
                      {shown.map((e) => (
                        <span key={e} className="min-w-0 max-w-[96px] truncate"><Tag tone={t.certifications.includes(e) ? "default" : "skill"}>{e}</Tag></span>
                      ))}
                      {more > 0 && <span className="shrink-0 text-xs text-muted-foreground">+{more}</span>}
                      {!badges.length && !expertise.length && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 tabular-nums"><PhoneCell phone={t.phone} /></td>
                  <td className="px-2.5 py-2.5"><EmailCell email={t.email} /></td>
                  <td className="px-2.5 py-2.5">
                    {t.lastClassDate ? (
                      <div className="max-w-[160px] truncate" title={t.lastClassTitle ? `${formatDay(t.lastClassDate)} · ${t.lastClassTitle}` : undefined}>
                        <span className="tabular-nums">{formatDay(t.lastClassDate)}</span>
                        {t.lastClassTitle && <span className="text-muted-foreground"> · {t.lastClassTitle}</span>}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums">{t.classesCount || <span className="text-muted-foreground">0</span>}</td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No trainers match. Try a broader search or clear the filters.
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

/** Expertise with the items matching the active search / filters first, so the reason a trainer matched is visible. */
function orderByMatch(items: string[], needles: string[]): string[] {
  const ns = needles.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 1);
  if (!ns.length) return items;
  const hit = (s: string) => ns.some((n) => s.toLowerCase().includes(n));
  return [...items.filter(hit), ...items.filter((s) => !hit(s))];
}

function formatDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

type VocabItem = { tag: string; count: number; kind: "Skill" | "Certification" };

/** Search box with a suggestion list of skills and certifications (with trainer counts). Picking one adds it as a filter. */
function SkillSearch({ q, setQ, vocab, selected, onPick }: {
  q: string; setQ: (v: string) => void; vocab: VocabItem[]; selected: string[]; onPick: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    const pool = vocab.filter((v) => !selected.includes(v.tag));
    if (!needle) return pool.slice(0, 8); // popular picks when the box is empty
    const starts = pool.filter((v) => v.tag.toLowerCase().startsWith(needle));
    const contains = pool.filter((v) => !v.tag.toLowerCase().startsWith(needle) && v.tag.toLowerCase().includes(needle));
    return [...starts, ...contains].slice(0, 8);
  }, [vocab, selected, needle]);

  useEffect(() => setActive(0), [needle]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={box}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
          else if (e.key === "Enter" && needle) { e.preventDefault(); onPick(items[active].tag); setOpen(false); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search by name, skill, certification or course — e.g. Articulate, PMP, Python"
        className="pl-9 pr-9"
        aria-label="Search trainers"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls="trainer-suggest"
        autoComplete="off"
      />
      {q && (
        <button type="button" onClick={() => setQ("")} aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
      {open && items.length > 0 && (
        <ul id="trainer-suggest" role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-lg">
          <li className="px-2 pb-1 pt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {needle ? "Filter by skill or certification" : "Popular skills and certifications"}
          </li>
          {items.map((v, i) => (
            <li key={v.tag} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => { onPick(v.tag); setOpen(false); }}
                className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left", i === active ? "bg-muted" : "")}>
                <span className="min-w-0 flex-1 truncate">{v.tag}</span>
                <span className="text-[11px] text-muted-foreground">{v.kind}</span>
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{v.count}</span>
              </button>
            </li>
          ))}
          {needle && (
            <li className="border-t px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">Press Enter to filter by the highlighted item, or keep typing to search all text.</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Phone: call link plus WhatsApp (revealed on row hover). */
function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-muted-foreground">—</span>;
  const digits = phone.replace(/[^\d]/g, "");
  const wa = digits.length === 8 ? `65${digits}` : digits; // SG numbers are stored without the country code
  return (
    <div className="group flex items-center gap-1">
      <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp"
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-emerald-600 group-hover/row:opacity-100 focus:opacity-100">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

/** Email: mail link and copy. */
function EmailCell({ email }: { email: string | null }) {
  if (!email) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      <a href={`mailto:${email}`} className="max-w-[170px] truncate hover:underline" title={email}>{email}</a>
      <CopyButton value={email} label="email" />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Copy ${label}`} title={`Copy ${label}`}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100 focus:opacity-100">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

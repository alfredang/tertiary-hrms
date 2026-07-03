"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Check, Loader2, Users, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export interface ManageStaff {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  /** Whether they're currently on the Woods Square invite list. */
  onList: boolean;
  /** Per-person "send PIN to" override, or null/empty to use the account email. */
  deliveryEmail?: string | null;
}

interface RowEdit {
  onList: boolean;
  deliveryEmail: string;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const AVATAR_COLORS = [
  "bg-indigo-500/20 text-indigo-300",
  "bg-blue-500/20 text-blue-300",
  "bg-violet-500/20 text-violet-300",
  "bg-sky-500/20 text-sky-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-fuchsia-500/20 text-fuchsia-300",
  "bg-rose-500/20 text-rose-300",
  "bg-amber-500/20 text-amber-300",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Small on/off switch (no Switch primitive in the project). */
export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
        on ? "bg-indigo-500" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

type Filter = "all" | "on" | "off";

/**
 * PREVIEW-ONLY UI for managing the Woods Square invite list + per-person PIN delivery.
 * State is local — toggles, overrides and bulk actions are NOT persisted (no DB wiring).
 */
export function WoodsSquareManageList({ staff }: { staff: ManageStaff[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState<{ matched: number; notFound: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, RowEdit>>(() =>
    Object.fromEntries(staff.map((s) => [s.id, { onList: s.onList, deliveryEmail: s.deliveryEmail ?? "" }])),
  );

  const onListCount = Object.values(edits).filter((e) => e.onList).length;

  // Rows whose on-list flag or delivery email differs from the saved (server) value.
  const pendingUpdates = useMemo(
    () =>
      staff
        .filter((s) => {
          const e = edits[s.id];
          return e.onList !== s.onList || (e.deliveryEmail.trim() || "") !== (s.deliveryEmail ?? "");
        })
        .map((s) => ({
          employeeId: s.id,
          woodsSquareInvite: edits[s.id].onList,
          woodsSquareEmail: edits[s.id].deliveryEmail.trim() || null,
        })),
    [staff, edits],
  );

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter((s) => {
      if (!s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
      if (filter === "on") return edits[s.id]?.onList;
      if (filter === "off") return !edits[s.id]?.onList;
      return true;
    });
  }, [staff, search, filter, edits]);

  const toggle = (id: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], onList: !prev[id].onList } }));
  const setEmail = (id: string, deliveryEmail: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], deliveryEmail } }));
  const setAll = (on: boolean) =>
    setEdits((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, e]) => [id, { ...e, onList: on }])),
    );

  // Auto-save: persist only the changed rows. Quiet on success (the status line shows it);
  // only errors surface as a toast.
  async function save() {
    if (pendingUpdates.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/woods-square/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: pendingUpdates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Couldn’t save", description: data.error, variant: "destructive" });
        return;
      }
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn’t save",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Debounced auto-save — fires ~1s after the last change, so there's no Save button to click.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (pendingUpdates.length === 0) return;
    const t = setTimeout(() => {
      void save();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpdates]);

  // Paste a list of emails → tick everyone matched, report who wasn't found.
  function applyPaste() {
    const emails = pasteText
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const idByEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s.id]));
    const matchedIds: string[] = [];
    const notFound: string[] = [];
    for (const email of emails) {
      const id = idByEmail.get(email);
      if (id) matchedIds.push(id);
      else notFound.push(email);
    }
    setEdits((prev) => {
      const next = { ...prev };
      matchedIds.forEach((id) => (next[id] = { ...next[id], onList: true }));
      return next;
    });
    setPasteResult({ matched: new Set(matchedIds).size, notFound });
  }

  const filterBtn = (key: Filter, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`text-xs rounded-full px-2.5 py-1 transition-colors ${
        filter === key ? "bg-indigo-500/20 text-indigo-300" : "text-gray-400 hover:text-white hover:bg-gray-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card className="bg-gray-950 border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-800">
        <Users className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-white">Invite list</h2>
        <span className="text-xs text-indigo-300 bg-indigo-500/15 rounded-full px-2 py-0.5">
          {onListCount} on list
        </span>
        <span className="text-xs text-gray-500">· {staff.length} staff</span>
      </div>

      {/* Toolbar: filter + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-800">
        <div className="flex items-center gap-1">
          {filterBtn("all", "All")}
          {filterBtn("on", "On list")}
          {filterBtn("off", "Off list")}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAll(true)} className="text-xs text-gray-400 hover:text-white transition-colors">
            Add all
          </button>
          <span className="text-gray-700">·</span>
          <button onClick={() => setAll(false)} className="text-xs text-gray-400 hover:text-white transition-colors">
            Clear all
          </button>
          <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            Paste emails
          </Button>
        </div>
      </div>

      {/* Paste panel */}
      {pasteOpen && (
        <div className="space-y-2 border-b border-gray-800 bg-gray-900/30 px-4 py-3">
          <p className="text-xs text-gray-400">
            Paste a list of emails (any separator) — everyone matched will be ticked on.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={3}
            placeholder="amanda@example.com, marcus@example.com …"
            className="w-full resize-none rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>
              Match &amp; tick
            </Button>
            {pasteResult && (
              <span className="text-xs text-gray-400">
                ✓ {pasteResult.matched} matched
                {pasteResult.notFound.length > 0 && (
                  <span className="text-amber-400"> · {pasteResult.notFound.length} not found</span>
                )}
              </span>
            )}
          </div>
          {pasteResult && pasteResult.notFound.length > 0 && (
            <p className="text-xs text-amber-300/80">Not found: {pasteResult.notFound.join(", ")}</p>
          )}
        </div>
      )}

      {/* Status safeguard — always on, enforced when sending (not a toggle). */}
      <div className="border-b border-gray-800 px-4 py-2 text-xs text-gray-500">
        Resigned, terminated &amp; inactive staff are never sent an invite — even if listed here.
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search staff by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Column hint */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900/40 text-[11px] uppercase tracking-wide text-gray-500">
        <span className="flex-1">Staff</span>
        <span className="w-16 text-center">On list</span>
        <span className="w-56">Send PIN to (optional)</span>
      </div>

      {/* Rows */}
      <div className="max-h-[30rem] overflow-y-auto divide-y divide-gray-900">
        {visible.map((s) => {
          const e = edits[s.id];
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(
                  s.name,
                )}`}
              >
                {initials(s.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${e.onList ? "text-white" : "text-gray-400"}`}>
                  {s.name}
                </p>
                <p className="truncate text-xs text-gray-500">{s.email}</p>
              </div>
              <div className="w-16 flex justify-center">
                <Toggle on={e.onList} onClick={() => toggle(s.id)} label={`Toggle ${s.name}`} />
              </div>
              <div className="w-full sm:w-56">
                <Input
                  value={e.deliveryEmail}
                  onChange={(ev) => setEmail(s.id, ev.target.value)}
                  disabled={!e.onList}
                  placeholder={e.onList ? s.email : "—"}
                  className="h-8 text-xs disabled:opacity-40"
                />
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-10">No staff found</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-800 px-4 py-3">
        <p className="text-xs text-gray-500">
          Toggle who appears in the Send picker; set a delivery email to send a person&rsquo;s PIN to
          a different address than their account email.
        </p>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          {saving ? (
            <span className="flex items-center gap-1.5 text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          ) : pendingUpdates.length > 0 ? (
            <span className="text-amber-400">Saving shortly…</span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Check className="h-3.5 w-3.5" /> All changes saved
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}

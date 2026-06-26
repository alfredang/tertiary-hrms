"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  getDate,
  getDay,
  isValid,
  max as maxDate,
  min as minDate,
  parse,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface OverviewStaff {
  id: string;
  name: string;
  email: string;
  employeeId: string;
}

export interface OverviewLog {
  employeeId: string | null;
  email: string;
  fromDate: string; // "dd MMM yyyy"
  toDate: string;
  status: string;
}

function parseHabitap(d: string): Date {
  return startOfDay(parse(d, "dd MMM yyyy", new Date()));
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

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Day-by-day coverage calendar: roster staff (rows) × every day of the selected month
 * (columns). A day is filled when the person has a SENT invite covering it, so each
 * person's access reads as a bar across the month. Read-only; built from the invite log.
 */
export function WoodsSquareOverview({
  staff,
  logs,
}: {
  staff: OverviewStaff[];
  logs: OverviewLog[];
}) {
  // Open on next month — the one you're planning invites for (the nav still reaches others).
  const [offset, setOffset] = useState(1);

  const month = useMemo(() => addMonths(startOfMonth(new Date()), offset), [offset]);
  const monthLabel = format(month, "MMMM yyyy");
  const isCurrentMonth = offset === 0;
  const todayDay = getDate(new Date());

  const days = useMemo(() => {
    const n = getDate(endOfMonth(month));
    const y = month.getFullYear();
    const mi = month.getMonth();
    return Array.from({ length: n }, (_, i) => {
      const day = i + 1;
      const dow = getDay(new Date(y, mi, day));
      return { day, dow, weekend: dow === 0 || dow === 6 };
    });
  }, [month]);

  // staff id → set of covered day-numbers in the selected month.
  const coveredDays = useMemo(() => {
    const sent = logs.filter((l) => l.status === "SENT");
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const map = new Map<string, Set<number>>();
    for (const s of staff) {
      const set = new Set<number>();
      // Match coverage by the DELIVERY email (s.email is the invite-list address), not by
      // employee id — the delivery address is the source of truth, so changing a person's
      // email resets their coverage to the new address (which has no passes yet), matching
      // how the send-core's dedup is keyed on email.
      const mine = sent.filter((l) => l.email.toLowerCase() === s.email.toLowerCase());
      for (const l of mine) {
        const from = parseHabitap(l.fromDate);
        const to = parseHabitap(l.toDate);
        if (!isValid(from) || !isValid(to) || from > mEnd || to < mStart) continue;
        const start = getDate(maxDate([from, mStart]));
        const end = getDate(minDate([to, mEnd]));
        for (let d = start; d <= end; d++) set.add(d);
      }
      map.set(s.id, set);
    }
    return map;
  }, [staff, logs, month]);

  const withCoverage = staff.filter((s) => (coveredDays.get(s.id)?.size ?? 0) > 0).length;

  return (
    <Card className="bg-gray-950 border-gray-800 overflow-hidden">
      {/* Header: month nav + summary */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 px-4 py-3">
        <CalendarRange className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-white">Coverage calendar</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            <span className="text-white tabular-nums">{withCoverage}</span>/{staff.length} with a pass
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-gray-800 bg-gray-900/60 p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[7.5rem] text-center text-sm font-medium text-white">{monthLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o + 1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {staff.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">No one on the invite list.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: "100%" }}>
            <thead>
              <tr className="border-b border-gray-800">
                <th className="sticky left-0 z-10 bg-gray-950 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Staff
                </th>
                {days.map((d) => {
                  const isToday = isCurrentMonth && d.day === todayDay;
                  return (
                    <th
                      key={d.day}
                      className={`px-0 py-1.5 text-center font-normal ${d.weekend ? "bg-gray-900/40" : ""}`}
                    >
                      <div className="text-[9px] uppercase text-gray-600">{WEEKDAY[d.dow]}</div>
                      <div
                        className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] tabular-nums ${
                          isToday ? "bg-indigo-500 font-semibold text-white" : "text-gray-400"
                        }`}
                      >
                        {d.day}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900">
              {staff.map((s) => {
                const set = coveredDays.get(s.id) ?? new Set<number>();
                const none = set.size === 0;
                return (
                  <tr key={s.id} className="group hover:bg-gray-900/30 transition-colors">
                    <td className="sticky left-0 z-10 bg-gray-950 px-4 py-1.5 whitespace-nowrap group-hover:bg-gray-900/30">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColor(
                            s.name,
                          )}`}
                        >
                          {initials(s.name)}
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate text-sm ${none ? "text-gray-500" : "text-white"}`}>{s.name}</p>
                          <p className="truncate text-xs text-gray-600">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const on = set.has(d.day);
                      const prev = set.has(d.day - 1);
                      const next = set.has(d.day + 1);
                      // Round only the ends of a covered run so consecutive days read as one bar.
                      const rounded = on
                        ? `${prev ? "" : "rounded-l-md"} ${next ? "" : "rounded-r-md"}`.trim() || "rounded-md"
                        : "";
                      return (
                        <td key={d.day} className={`px-0 py-1.5 ${d.weekend ? "bg-gray-900/40" : ""}`}>
                          <div
                            title={on ? `${s.name} · ${d.day} ${format(month, "MMM yyyy")}` : undefined}
                            className={`mx-auto h-5 w-5 ${
                              on ? `bg-emerald-500/80 ${rounded}` : "rounded-md bg-gray-800/40"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  type: string;
  color: string;
  description?: string | null;
}

interface CalendarViewProps {
  events: CalendarEvent[];
}

const eventTypeLabels: Record<string, { label: string; color: string }> = {
  HOLIDAY: { label: "Holiday", color: "bg-red-500" },
  MEETING: { label: "Meeting", color: "bg-blue-500" },
  TRAINING: { label: "Training", color: "bg-purple-500" },
  COMPANY_EVENT: { label: "Company Event", color: "bg-green-500" },
  LEAVE: { label: "Leave", color: "bg-amber-500" },
};

/** Monday-first, single-letter headers — the Planner app calendar layout (Alfred, 11 Nov 2026). */
const WEEKDAYS = [
  { short: "M", long: "Mon" },
  { short: "T", long: "Tue" },
  { short: "W", long: "Wed" },
  { short: "T", long: "Thu" },
  { short: "F", long: "Fri" },
  { short: "S", long: "Sat" },
  { short: "S", long: "Sun" },
];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

export function CalendarView({ events }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const today = new Date();

  const { cells, monthName, year } = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Mon = 0 … Sun = 6
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const total = Math.ceil((lead + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: total }, (_, i) => {
      const date = new Date(y, m, 1 - lead + i);
      return { date, inMonth: date.getMonth() === m };
    });
    return { cells, monthName: first.toLocaleString("default", { month: "long" }), year: y };
  }, [currentDate]);

  const eventsOn = (date: Date) => {
    const noon = new Date(date);
    noon.setHours(12, 0, 0, 0);
    return events
      .filter((event) => {
        const s = new Date(event.start);
        const e = new Date(event.end);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        return noon >= s && noon <= e;
      })
      .sort((a, b) => (a.type === "HOLIDAY" ? -1 : 0) - (b.type === "HOLIDAY" ? -1 : 0));
  };

  const shiftMonth = (delta: number) => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelected(new Date());
  };

  const selectedEvents = eventsOn(selected);
  const selectedLabel = selected.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {/* Header: month title + chevrons, Today */}
          <div className="flex items-center justify-between px-4 pb-3 pt-4 sm:px-6">
            <h2 className="text-xl font-bold text-white sm:text-2xl">
              {monthName} {year}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={goToToday} className="text-blue-600">
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="text-blue-600">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month" className="text-blue-600">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 border-y border-gray-800">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="py-2 text-center text-xs font-semibold text-gray-500">
                <span className="sm:hidden">{d.short}</span>
                <span className="hidden sm:inline">{d.long}</span>
              </div>
            ))}
          </div>

          {/* Edge-to-edge month grid with adjacent-month days greyed */}
          <div className="grid grid-cols-7">
            {cells.map(({ date, inMonth }, i) => {
              const dayEvents = eventsOn(date);
              const holidays = dayEvents.filter((e) => e.type === "HOLIDAY");
              const isToday = sameDay(date, today);
              const isSelected = sameDay(date, selected);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelected(date);
                    if (!inMonth) setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
                  }}
                  title={holidays.map((h) => h.title).join(", ") || undefined}
                  className={cn(
                    "flex h-[84px] flex-col items-stretch overflow-hidden border-b border-r border-gray-800 p-1 text-left transition-colors sm:h-[112px] sm:p-1.5",
                    (i + 1) % 7 === 0 && "border-r-0",
                    !inMonth && "bg-gray-900/60",
                    inMonth && holidays.length > 0 && "bg-[#ECEFF4] dark:bg-gray-800",
                    isToday && "bg-blue-950/40",
                    isSelected && !isToday && "ring-2 ring-inset ring-blue-500/50",
                    "hover:bg-gray-900"
                  )}
                >
                  <span
                    className={cn(
                      "mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      isToday ? "bg-blue-600 text-on-color" : inMonth ? "text-gray-200" : "text-gray-500"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className={cn("space-y-0.5", !inMonth && "opacity-50")}>
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="calendar-event-chip truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight sm:text-xs"
                        style={chipStyle(event.color)}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="px-1 text-center text-[10px] font-medium text-gray-400 sm:text-xs">
                        +{dayEvents.length - 2}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
            {Object.entries(eventTypeLabels).map(([type, { label, color }]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={cn("h-2.5 w-2.5 rounded-sm", color)} />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agenda for the selected day */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400">
            {sameDay(selected, today) ? "Today · " : ""}
            {selectedLabel}
          </h3>
          <div className="flex items-center gap-2">
            <Link href={`/calendar/day/${dayKey(selected)}`} className="text-sm font-medium text-blue-600 hover:underline">
              Open day
            </Link>
            <Link href={`/calendar/new?date=${dayKey(selected)}`}>
              <Button size="sm" variant="outline">
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </Link>
          </div>
        </div>
        <Card>
          <CardContent className="divide-y divide-gray-800 p-0">
            {selectedEvents.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Nothing scheduled</p>
            ) : (
              selectedEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: safeHex(event.color) }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-white allow-wrap">{event.title}</p>
                    <p className="text-xs text-gray-400">
                      {eventTypeLabels[event.type]?.label ?? event.type}
                      {event.allDay
                        ? " · All day"
                        : ` · ${new Date(event.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                    {event.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 allow-wrap">{event.description}</p>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function safeHex(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2F5BE6";
}

/** Tinted fill with the event colour as text — the Planner app chip style. */
function chipStyle(color: string): React.CSSProperties {
  const hex = safeHex(color);
  return { backgroundColor: `${hex}26`, "--event-ink-light": darken(hex, 0.45), "--event-ink-dark": hex } as React.CSSProperties;
}

/** Darker shade of a #RRGGBB colour so chip text stays readable on its own tint. */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

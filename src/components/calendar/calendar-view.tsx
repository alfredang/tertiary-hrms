"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

export function CalendarView({ events }: CalendarViewProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());

  const { daysInMonth, firstDayOfMonth, monthName, year } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    return {
      daysInMonth: lastDay.getDate(),
      firstDayOfMonth: firstDay.getDay(),
      monthName: firstDay.toLocaleString("default", { month: "long" }),
      year,
    };
  }, [currentDate]);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getEventsForDay = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return events.filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      eventStart.setHours(0, 0, 0, 0);
      eventEnd.setHours(23, 59, 59, 999);
      date.setHours(12, 0, 0, 0);
      return date >= eventStart && date <= eventEnd;
    });
  };

  const handleDayClick = (day: number) => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    router.push(`/calendar/day/${y}-${m}-${d}`);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const blanks = Array(firstDayOfMonth).fill(null);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Event Type Legend */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4">
            {Object.entries(eventTypeLabels).map(([type, { label, color }]) => (
              <div key={type} className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", color)} />
                <span className="text-sm text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {monthName} {year}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={previousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {days.map((day) => (
              <div
                key={day}
                className="text-center text-xs sm:text-sm font-medium text-gray-500 py-2"
              >
                <span className="sm:hidden">{day[0]}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-px bg-gray-700 border border-gray-700 rounded-lg overflow-hidden">
            {/* Blank days */}
            {blanks.map((_, index) => (
              <div
                key={`blank-${index}`}
                className="bg-gray-900 min-h-[60px] sm:min-h-[100px] p-1 sm:p-2"
              />
            ))}

            {/* Days */}
            {daysArray.map((day) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={day}
                  onClick={() => handleDayClick(day)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") handleDayClick(day); }}
                  className={cn(
                    "bg-gray-950 min-h-[60px] sm:min-h-[100px] p-1 sm:p-2 cursor-pointer transition-colors",
                    isCurrentDay ? "bg-blue-950/50 hover:bg-blue-950/70" : "hover:bg-gray-900"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium mb-1",
                      isCurrentDay
                        ? "text-white bg-blue-600 w-7 h-7 rounded-full flex items-center justify-center"
                        : "text-gray-200"
                    )}
                  >
                    {day}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded truncate text-white"
                        style={{ backgroundColor: event.color }}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] sm:text-xs text-gray-400 px-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

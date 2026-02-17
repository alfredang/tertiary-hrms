import { prisma } from "@/lib/prisma";
import { CalendarView } from "@/components/calendar/calendar-view";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

async function getCalendarEvents() {
  const events = await prisma.calendarEvent.findMany({
    orderBy: { startDate: "asc" },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.startDate,
    end: event.endDate,
    allDay: event.allDay,
    type: event.type,
    color: event.color || getDefaultColor(event.type),
    description: event.description,
  }));
}

function getDefaultColor(type: string): string {
  const colors: Record<string, string> = {
    HOLIDAY: "#ef4444",
    MEETING: "#3b82f6",
    TRAINING: "#a855f7",
    COMPANY_EVENT: "#22c55e",
    LEAVE: "#f59e0b",
  };
  return colors[type] || "#6b7280";
}

export default async function CalendarPage() {
  const session = await auth();
  const events = await getCalendarEvents();

  const isHR =
    session?.user?.role === "HR" || session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-500 mt-1">
            Events, holidays & leave schedule
          </p>
        </div>
        {isHR && (
          <Link href="/calendar/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Event
            </Button>
          </Link>
        )}
      </div>

      <CalendarView events={events} />
    </div>
  );
}

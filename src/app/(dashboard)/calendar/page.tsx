import { prisma } from "@/lib/prisma";
import { CalendarView } from "@/components/calendar/calendar-view";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

async function getCalendarEvents(employeeId?: string) {
  // Public events (holidays, meetings, training, company events) - visible to everyone
  const publicEvents = await prisma.calendarEvent.findMany({
    where: {
      type: { in: ["HOLIDAY", "MEETING", "TRAINING", "COMPANY_EVENT"] },
    },
    orderBy: { startDate: "asc" },
  });

  // Leave events - filtered by employee for staff, all for admin
  const leaveEvents = await prisma.calendarEvent.findMany({
    where: {
      type: "LEAVE",
      ...(employeeId
        ? {
            leaveRequestId: {
              not: null,
            },
          }
        : {}),
    },
    orderBy: { startDate: "asc" },
  });

  // If staff user, we need to filter leave events by their employeeId
  let filteredLeaveEvents = leaveEvents;
  if (employeeId) {
    // Fetch leave request IDs for this employee
    const userLeaveRequests = await prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED" },
      select: { id: true },
    });
    const userLeaveRequestIds = new Set(userLeaveRequests.map((lr) => lr.id));

    filteredLeaveEvents = leaveEvents.filter(
      (event) => event.leaveRequestId && userLeaveRequestIds.has(event.leaveRequestId)
    );
  }

  const allEvents = [...publicEvents, ...filteredLeaveEvents];

  return allEvents.map((event) => ({
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

  // Development mode: Skip authentication if SKIP_AUTH is enabled (act as admin)
  // Staff can only see their own leave events
  const isStaff = process.env.SKIP_AUTH !== "true" && session?.user?.role === "STAFF";
  const employeeId = isStaff ? session?.user?.employeeId : undefined;

  // Safety: prevent data leak if staff but no employeeId
  if (isStaff && !employeeId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-white">Calendar</h1>
        <p className="text-gray-400">Your employee profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const events = await getCalendarEvents(employeeId);

  const isHR =
    process.env.SKIP_AUTH === "true" || // Act as HR when auth is skipped
    session?.user?.role === "HR" ||
    session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Calendar</h1>
          <p className="text-gray-400 mt-1">
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

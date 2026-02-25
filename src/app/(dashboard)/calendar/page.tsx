import { prisma } from "@/lib/prisma";
import { CalendarView } from "@/components/calendar/calendar-view";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import type { Role } from "@prisma/client";

export const dynamic = 'force-dynamic';

async function getCalendarEvents(userId: string, employeeId?: string, showAllLeaves = false) {
  // 1. Personal events — only events created by this user (fully private)
  const ownEvents = await prisma.calendarEvent.findMany({
    where: {
      createdById: userId,
      type: { in: ["HOLIDAY", "MEETING", "TRAINING", "COMPANY_EVENT"] },
    },
    orderBy: { startDate: "asc" },
  });

  // 2. Leave events — admin view: all employees; staff view: own only
  let leaveEvents: typeof ownEvents = [];
  if (showAllLeaves) {
    leaveEvents = await prisma.calendarEvent.findMany({
      where: { type: "LEAVE", leaveRequestId: { not: null } },
      orderBy: { startDate: "asc" },
    });
  } else if (employeeId) {
    const userLeaveRequests = await prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED" },
      select: { id: true },
    });
    const userLeaveRequestIds = new Set(userLeaveRequests.map((lr) => lr.id));

    const allLeaveEvents = await prisma.calendarEvent.findMany({
      where: { type: "LEAVE", leaveRequestId: { not: null } },
      orderBy: { startDate: "asc" },
    });

    leaveEvents = allLeaveEvents.filter(
      (event) => event.leaveRequestId && userLeaveRequestIds.has(event.leaveRequestId)
    );
  }

  // Deduplicate in case a leave event was also created by this user
  const eventMap = new Map<string, (typeof ownEvents)[0]>();
  for (const event of [...ownEvents, ...leaveEvents]) {
    eventMap.set(event.id, event);
  }

  return Array.from(eventMap.values()).map((event) => ({
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
  const viewMode = await getViewMode();

  let role: Role = "STAFF";
  let currentUserId: string | undefined;
  let currentEmployeeId: string | undefined;

  if (process.env.SKIP_AUTH === "true") {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    currentUserId = adminUser?.id;
    currentEmployeeId = adminUser?.employee?.id;
  } else if (session?.user) {
    role = session.user.role;
    currentUserId = session.user.id;
    currentEmployeeId = session.user.employeeId;
  }

  if (!currentUserId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Calendar</h1>
        <p className="text-sm sm:text-base text-gray-400">Your profile has not been set up yet. Please contact HR.</p>
      </div>
    );
  }

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewAs = isAdmin ? viewMode : "staff";

  // Admin view: see all employees' leaves; Staff view: see only own leaves
  const showAllLeaves = viewAs === "admin";
  const events = await getCalendarEvents(currentUserId, currentEmployeeId, showAllLeaves);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Calendar</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            Events, holidays & leave schedule
          </p>
        </div>
        <Link href="/calendar/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        </Link>
      </div>

      <CalendarView events={events} />
    </div>
  );
}

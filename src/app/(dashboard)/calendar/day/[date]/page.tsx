import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Plus, Users } from "lucide-react";
import { CalendarEventCard } from "@/components/calendar/calendar-event-card";
import { isDevAuthSkipped } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr + "T12:00:00");
  return !isNaN(date.getTime());
}

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function getLeaveForDate(dateStr: string, staffEmployeeId?: string) {
  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59.999");

  return prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: dayEnd },
      endDate: { gte: dayStart },
      ...(staffEmployeeId ? { employeeId: staffEmployeeId } : {}),
    },
    include: {
      employee: { select: { name: true, department: { select: { name: true } } } },
      leaveType: { select: { name: true, code: true } },
    },
    orderBy: { employee: { name: "asc" } },
  });
}

async function getEventsForDate(dateStr: string, userId: string) {
  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59.999");

  // Events are fully personal — only show events created by this user
  return prisma.calendarEvent.findMany({
    where: {
      type: { in: ["HOLIDAY", "MEETING", "TRAINING", "COMPANY_EVENT"] },
      createdById: userId,
      startDate: { lte: dayEnd },
      endDate: { gte: dayStart },
    },
    orderBy: { startDate: "asc" },
  });
}

export default async function CalendarDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  // Validate date parameter
  if (!isValidDate(date)) {
    return (
      <div className="space-y-6">
        <Link href="/calendar">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Calendar
          </Button>
        </Link>
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white">Invalid Date</h1>
          <p className="text-gray-400 mt-2">
            The date &ldquo;{date}&rdquo; is not valid. Please use the format YYYY-MM-DD.
          </p>
        </div>
      </div>
    );
  }

  // Auth + RBAC
  const session = await auth();
  let role = "STAFF";
  let currentEmployeeId: string | undefined;
  let currentUserId: string | null = null;

  if (isDevAuthSkipped()) {
    role = "ADMIN";
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    currentUserId = adminUser?.id ?? null;
    currentEmployeeId = adminUser?.employee?.id;
  } else {
    if (!session?.user) {
      return null;
    }
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
    currentUserId = session.user.id;
  }

  const isAdmin = role === "ADMIN" || role === "HR" || role === "MANAGER";
  const viewMode = await getViewMode();
  const viewAs = isAdmin ? viewMode : "staff";

  // Staff without employee record
  if (viewAs === "staff" && !currentEmployeeId) {
    return (
      <div className="space-y-6">
        <Link href="/calendar">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Calendar
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-white">{formatDayHeader(date)}</h1>
        <p className="text-gray-400">
          Your employee profile has not been set up yet. Please contact HR.
        </p>
      </div>
    );
  }

  if (!currentUserId) {
    return null;
  }

  // Determine who can see leave: admin sees all, staff sees own
  const staffFilter = viewAs === "staff" ? currentEmployeeId : undefined;

  // Fetch data in parallel
  const [leaveRequests, rawEvents] = await Promise.all([
    getLeaveForDate(date, staffFilter),
    getEventsForDate(date, currentUserId),
  ]);

  // Sort meetings first, then by start date
  const events = rawEvents.sort((a, b) => {
    if (a.type === "MEETING" && b.type !== "MEETING") return -1;
    if (a.type !== "MEETING" && b.type === "MEETING") return 1;
    return a.startDate.getTime() - b.startDate.getTime();
  });

  const hasLeave = leaveRequests.length > 0;
  const hasEvents = events.length > 0;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/calendar">
        <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Calendar
        </Button>
      </Link>

      {/* Date header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {formatDayHeader(date)}
          </h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {hasLeave || hasEvents
              ? `${events.length} event${events.length !== 1 ? "s" : ""}, ${leaveRequests.length} leave${leaveRequests.length !== 1 ? "s" : ""}`
              : "Nothing scheduled"}
          </p>
        </div>
        <Link href={`/calendar/new?date=${date}`} className="w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        </Link>
      </div>

      {/* Events */}
      <Card className="bg-gray-950 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Calendar className="h-5 w-5 text-blue-500" />
            Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasEvents ? (
            <div className="space-y-3">
              {events.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">
              No events scheduled
            </p>
          )}
        </CardContent>
      </Card>

      {/* Leave */}
      <Card className="bg-gray-950 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5 text-amber-500" />
            {viewAs === "staff" ? "My Leaves" : "People on Leave"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasLeave ? (
            <div className="space-y-3">
              {leaveRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">
                      {request.employee.name}
                    </span>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      {request.leaveType.name}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                    <span>
                      {formatDate(request.startDate)} — {formatDate(request.endDate)}
                    </span>
                    <span>
                      {Number(request.days)} day{Number(request.days) !== 1 ? "s" : ""}
                      {request.dayType === "AM_HALF" && <span className="text-amber-400"> (AM)</span>}
                      {request.dayType === "PM_HALF" && <span className="text-amber-400"> (PM)</span>}
                      {request.halfDayPosition && Number(request.days) % 1 !== 0 && (
                        <span className="text-amber-400"> (half on {request.halfDayPosition} day)</span>
                      )}
                    </span>
                    {request.employee.department && (
                      <span className="text-gray-500">
                        {request.employee.department.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">
              {viewAs === "staff" ? "You have no leave on this day" : "No one is on leave"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

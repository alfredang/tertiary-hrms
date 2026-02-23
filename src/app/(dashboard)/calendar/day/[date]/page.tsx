import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn, formatDate } from "@/lib/utils";
import { getViewMode } from "@/lib/view-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const eventTypeLabels: Record<string, { label: string; dotColor: string; badgeClass: string }> = {
  HOLIDAY: { label: "Holiday", dotColor: "bg-red-500", badgeClass: "bg-red-500/20 text-red-400 border-red-500/30" },
  MEETING: { label: "Meeting", dotColor: "bg-blue-500", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  TRAINING: { label: "Training", dotColor: "bg-purple-500", badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  COMPANY_EVENT: { label: "Company Event", dotColor: "bg-green-500", badgeClass: "bg-green-500/20 text-green-400 border-green-500/30" },
};

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

async function getEventsForDate(dateStr: string) {
  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59.999");

  return prisma.calendarEvent.findMany({
    where: {
      type: { in: ["HOLIDAY", "MEETING", "TRAINING", "COMPANY_EVENT"] },
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

  if (process.env.SKIP_AUTH === "true") {
    role = "ADMIN";
  } else {
    if (!session?.user) {
      return null;
    }
    role = session.user.role;
    currentEmployeeId = session.user.employeeId;
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

  // Determine who can see leave: admin sees all, staff sees own
  const staffFilter = viewAs === "staff" ? currentEmployeeId : undefined;

  // Fetch data in parallel
  const [leaveRequests, events] = await Promise.all([
    getLeaveForDate(date, staffFilter),
    getEventsForDate(date),
  ]);

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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          {formatDayHeader(date)}
        </h1>
        <p className="text-gray-400 mt-1">
          {hasLeave || hasEvents
            ? `${leaveRequests.length} leave${leaveRequests.length !== 1 ? "s" : ""}, ${events.length} event${events.length !== 1 ? "s" : ""}`
            : "Nothing scheduled"}
        </p>
      </div>

      {/* People on Leave */}
      <Card className="bg-gray-950 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5 text-amber-500" />
            People on Leave
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
                    <span>{Number(request.days)} day{Number(request.days) !== 1 ? "s" : ""}</span>
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
              No one is on leave
            </p>
          )}
        </CardContent>
      </Card>

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
              {events.map((event) => {
                const typeInfo = eventTypeLabels[event.type] || {
                  label: event.type,
                  dotColor: "bg-gray-500",
                  badgeClass: "bg-gray-500/20 text-gray-400 border-gray-500/30",
                };
                return (
                  <div
                    key={event.id}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-full", typeInfo.dotColor)} />
                        <span className="font-medium text-white">{event.title}</span>
                      </div>
                      <Badge className={typeInfo.badgeClass}>
                        {typeInfo.label}
                      </Badge>
                    </div>
                    {event.description && (
                      <p className="text-sm text-gray-400 pl-5">{event.description}</p>
                    )}
                    <div className="text-sm text-gray-400 pl-5">
                      {formatDate(event.startDate)} — {formatDate(event.endDate)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">
              No events scheduled
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

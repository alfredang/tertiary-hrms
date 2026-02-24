import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CalendarEventForm } from "@/components/calendar/calendar-event-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CalendarEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();

  if (process.env.SKIP_AUTH !== "true" && !session?.user) {
    redirect("/login");
  }

  const event = await prisma.calendarEvent.findUnique({ where: { id } });

  if (!event) {
    return (
      <div className="space-y-6">
        <Link href="/calendar">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Calendar
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">Event not found.</p>
        </div>
      </div>
    );
  }

  const currentUserId = session?.user?.id ?? null;
  const currentUserRole = session?.user?.role;
  const isAdmin = currentUserRole === "ADMIN" || currentUserRole === "HR" || currentUserRole === "MANAGER";

  // Ownership check: only the creator OR admin can edit their event
  if (process.env.SKIP_AUTH !== "true" && !isAdmin && event.createdById !== currentUserId) {
    return (
      <div className="space-y-6">
        <Link href="/calendar">
          <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Calendar
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-gray-400">You do not have permission to edit this event.</p>
        </div>
      </div>
    );
  }

  // Format dates for the form inputs (YYYY-MM-DD)
  const startDate = event.startDate.toISOString().split("T")[0];
  const endDate = event.endDate.toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Edit Event</h1>
        <p className="text-gray-400 mt-1">Update your calendar event</p>
      </div>
      <CalendarEventForm
        initialData={{
          title: event.title,
          description: event.description ?? "",
          startDate,
          endDate,
          allDay: event.allDay,
          type: event.type,
        }}
        eventId={id}
      />
    </div>
  );
}

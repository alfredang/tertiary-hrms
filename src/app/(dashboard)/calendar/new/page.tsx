import { CalendarEventForm } from "@/components/calendar/calendar-event-form";

export const dynamic = "force-dynamic";

export default function CalendarNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Add Event</h1>
        <p className="text-gray-400 mt-1">Create a new calendar event</p>
      </div>
      <CalendarEventForm />
    </div>
  );
}

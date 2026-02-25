import { CalendarEventForm } from "@/components/calendar/calendar-event-form";

export const dynamic = "force-dynamic";

export default async function CalendarNewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const defaultDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Add Event</h1>
        <p className="text-gray-400 mt-1">Create a new calendar event</p>
      </div>
      <CalendarEventForm
        initialData={
          defaultDate
            ? {
                title: "",
                description: "",
                startDate: defaultDate,
                endDate: defaultDate,
                allDay: true,
                type: "",
              }
            : undefined
        }
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarEventForm } from "./calendar-event-form";

/**
 * "Add Event" button that opens the event form in a popup dialog (Alfred, 21 Nov 2026), so the
 * person stays on the calendar. `date` ("YYYY-MM-DD") pre-fills the start and end date.
 * /calendar/new still exists as a full page for direct links.
 */
export function AddEventButton({ date, size, compact }: { date?: string; size?: "sm"; /** Small outline "Add" button (day agenda). */ compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        {compact ? (
          <Button size="sm" variant="outline">
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        ) : (
          <Button size={size} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[92vw] max-w-xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-xl border border-gray-800 bg-gray-950 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-white">Add Event</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-sm text-gray-400">Create a new calendar event</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-sm text-gray-400 transition-colors hover:text-white">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="px-5 py-5">
            {/* Mounted only while open, so each opening starts with an empty form. */}
            {open && (
              <CalendarEventForm
                initialData={date ? { title: "", description: "", startDate: date, endDate: date, allDay: true, type: "" } : undefined}
                onSaved={() => { setOpen(false); router.refresh(); }}
                onCancel={() => setOpen(false)}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

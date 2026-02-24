"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Send } from "lucide-react";

const EVENT_TYPES = [
  { value: "HOLIDAY", label: "Holiday" },
  { value: "MEETING", label: "Meeting" },
  { value: "TRAINING", label: "Training" },
  { value: "COMPANY_EVENT", label: "Company Event" },
];

interface CalendarEventFormProps {
  initialData?: {
    title: string;
    description: string;
    startDate: string; // "YYYY-MM-DD"
    endDate: string;   // "YYYY-MM-DD"
    allDay: boolean;
    type: string;
  };
  eventId?: string; // If provided → PATCH (edit) mode
}

export function CalendarEventForm({ initialData, eventId }: CalendarEventFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isEditMode = !!eventId;

  const [isLoading, setIsLoading] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [startDate, setStartDate] = useState(initialData?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialData?.endDate ?? "");
  const [allDay, setAllDay] = useState(initialData?.allDay ?? true);
  const [eventType, setEventType] = useState(initialData?.type ?? "");

  const doSave = async () => {
    setIsLoading(true);
    try {
      const url = isEditMode ? `/api/calendar/${eventId}` : "/api/calendar";
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          startDate,
          endDate: endDate || startDate,
          allDay,
          type: eventType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || (isEditMode ? "Failed to update event" : "Failed to create event"));
      }

      toast({
        title: isEditMode ? "Event updated" : "Event created",
        description: isEditMode
          ? "The calendar event has been updated successfully."
          : "The calendar event has been created successfully.",
      });

      if (isEditMode) {
        router.push(`/calendar/day/${startDate}`);
      } else {
        router.push("/calendar");
      }
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : (isEditMode ? "Failed to update event" : "Failed to create event"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode) {
      // In edit mode, never save from form submit — only show confirmation
      setConfirmSave(true);
      return;
    }
    doSave();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-gray-950 border-gray-800 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">
              {isEditMode ? "Edit Calendar Event" : "New Calendar Event"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="eventType" className="text-white">
              Event Type *
            </Label>
            <Select value={eventType} onValueChange={setEventType} required>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select event type" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-white">
              Title *
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white"
              placeholder="Enter event title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-white">
              Description (optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white min-h-[80px]"
              placeholder="Enter event description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-white">
                Start Date *
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-white">
                End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white"
                min={startDate}
              />
              <p className="text-xs text-gray-500">
                Defaults to start date if not set.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="allDay"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-700 bg-gray-900"
            />
            <Label htmlFor="allDay" className="text-white">
              All day event
            </Label>
          </div>

          <div className="flex justify-end gap-3">
            {isEditMode && confirmSave ? (
              <>
                <span className="text-sm text-amber-400 self-center">Save changes?</span>
                <Button
                  type="button"
                  onClick={doSave}
                  disabled={isLoading}
                  className="h-8 px-3 text-sm"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isLoading ? "Saving..." : "Confirm"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmSave(false)}
                  disabled={isLoading}
                  className="border-gray-700 hover:bg-gray-800 h-8 px-3 text-sm"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className="border-gray-700 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  type={isEditMode ? "button" : "submit"}
                  onClick={isEditMode ? () => setConfirmSave(true) : undefined}
                  disabled={isLoading || !title || !startDate || !eventType}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isLoading
                    ? (isEditMode ? "Saving..." : "Creating...")
                    : (isEditMode ? "Save Changes" : "Create Event")}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

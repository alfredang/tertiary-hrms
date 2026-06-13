"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  /** ISO yyyy-MM-dd (same as native date inputs). */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

const toIso = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");
const parseIso = (s: string) => (s ? parse(s, "yyyy-MM-dd", new Date()) : undefined);
const display = (s: string) => {
  const d = parseIso(s);
  return d && isValid(d) ? format(d, "dd/MM/yyyy") : "";
};

export function DateRangePicker({
  from,
  to,
  onChange,
  min,
  max,
  disabled,
  className,
  placeholder = "Pick a date range",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected: DateRange | undefined = from
    ? { from: parseIso(from), to: parseIso(to) }
    : undefined;
  const minDate = parseIso(min ?? "");
  const maxDate = parseIso(max ?? "");

  const label = from ? `${display(from)} – ${to ? display(to) : "…"}` : "";

  // Drive the two-click range off the clicked day so the calendar stays open
  // after the first pick (react-day-picker can report a 1-day range on click 1).
  const handleSelect = (_range: DateRange | undefined, day: Date) => {
    if (!from || to) {
      // First click (or starting a new range): set the start, keep open.
      onChange(toIso(day), "");
    } else {
      // Second click: complete the range (ordered), then close.
      const start = parseIso(from)!;
      const earlier = start <= day ? start : day;
      const later = start <= day ? day : start;
      onChange(toIso(earlier), toIso(later));
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-sm text-left disabled:opacity-60"
          >
            <span className={label ? "text-white" : "text-gray-500 text-xs"}>
              {label || placeholder}
            </span>
            <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0 ml-2" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected?.from}
            numberOfMonths={1}
            disabled={(date) => {
              if (minDate && date < minDate) return true;
              if (maxDate && date > maxDate) return true;
              return false;
            }}
            classNames={{
              // Target the day button so the colour is actually visible.
              selected:
                "[&>button]:bg-blue-600 [&>button]:text-white [&>button]:hover:bg-blue-600 [&>button]:hover:text-white",
              range_start: "[&>button]:rounded-l-md [&>button]:rounded-r-none",
              range_end: "[&>button]:rounded-r-md [&>button]:rounded-l-none",
              range_middle:
                "[&>button]:!bg-blue-600/30 [&>button]:!text-white [&>button]:!rounded-none [&>button]:hover:!bg-blue-600/40",
            }}
          />
        </PopoverContent>
      </div>
    </Popover>
  );
}

"use client"

import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DatePickerProps {
  value: string           // YYYY-MM-DD format (same as native type="date")
  onChange: (value: string) => void
  placeholder?: string
  min?: string            // YYYY-MM-DD — disables dates before this
  max?: string            // YYYY-MM-DD — disables dates after this
  disabled?: boolean
  className?: string
  id?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  min,
  max,
  disabled,
  className,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [textValue, setTextValue] = React.useState(value || "")

  // Sync text value when external value changes
  React.useEffect(() => {
    setTextValue(value || "")
  }, [value])

  const selectedDate = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined
  const minDate = min ? parse(min, "yyyy-MM-dd", new Date()) : undefined
  const maxDate = max ? parse(max, "yyyy-MM-dd", new Date()) : undefined

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const formatted = format(date, "yyyy-MM-dd")
      onChange(formatted)
      setTextValue(formatted)
    }
    setOpen(false)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTextValue(val)

    // Live-parse YYYY-MM-DD as user types
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parsed = parse(val, "yyyy-MM-dd", new Date())
      if (isValid(parsed)) {
        onChange(val)
      }
    } else if (val === "") {
      onChange("")
    }
  }

  const handleTextBlur = () => {
    // On blur, try to parse various date formats
    if (!textValue) {
      onChange("")
      return
    }

    // Try YYYY-MM-DD first
    let parsed = parse(textValue, "yyyy-MM-dd", new Date())
    if (isValid(parsed)) {
      const formatted = format(parsed, "yyyy-MM-dd")
      onChange(formatted)
      setTextValue(formatted)
      return
    }

    // Try DD/MM/YYYY (Singapore common format)
    parsed = parse(textValue, "dd/MM/yyyy", new Date())
    if (isValid(parsed)) {
      const formatted = format(parsed, "yyyy-MM-dd")
      onChange(formatted)
      setTextValue(formatted)
      return
    }

    // Try D/M/YYYY (short Singapore format)
    parsed = parse(textValue, "d/M/yyyy", new Date())
    if (isValid(parsed)) {
      const formatted = format(parsed, "yyyy-MM-dd")
      onChange(formatted)
      setTextValue(formatted)
      return
    }

    // Invalid input -- revert to previous valid value
    setTextValue(value || "")
  }

  return (
    <div className={cn("flex gap-1", className)}>
      <Input
        id={id}
        type="text"
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-gray-900 border-gray-800 text-white flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className="border-gray-800 bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 shrink-0"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            defaultMonth={selectedDate}
            disabled={(date) => {
              if (minDate && date < minDate) return true
              if (maxDate && date > maxDate) return true
              return false
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

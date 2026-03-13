"use client"

import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
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
  placeholder = "DD/MM/YYYY",
  min,
  max,
  disabled,
  className,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const pickerId = React.useId()
  // Display format: DD/MM/YYYY for Singapore users
  const toDisplay = (isoValue: string) => {
    if (!isoValue) return ""
    const parsed = parse(isoValue, "yyyy-MM-dd", new Date())
    return isValid(parsed) ? format(parsed, "dd/MM/yyyy") : isoValue
  }

  const [textValue, setTextValue] = React.useState(toDisplay(value))

  // Sync text value when external value changes
  React.useEffect(() => {
    setTextValue(toDisplay(value))
  }, [value])

  const selectedDate = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined
  const minDate = min ? parse(min, "yyyy-MM-dd", new Date()) : undefined
  const maxDate = max ? parse(max, "yyyy-MM-dd", new Date()) : undefined

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const iso = format(date, "yyyy-MM-dd")
      onChange(iso)
      setTextValue(format(date, "dd/MM/yyyy"))
    }
    setOpen(false)
  }

  const isInRange = (date: Date) => {
    if (minDate && date < minDate) return false
    if (maxDate && date > maxDate) return false
    return true
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTextValue(val)

    // Live-parse DD/MM/YYYY as user types
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const parsed = parse(val, "dd/MM/yyyy", new Date())
      if (isValid(parsed) && isInRange(parsed)) {
        onChange(format(parsed, "yyyy-MM-dd"))
      }
    // Also accept YYYY-MM-DD
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parsed = parse(val, "yyyy-MM-dd", new Date())
      if (isValid(parsed) && isInRange(parsed)) {
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

    // Try DD/MM/YYYY (Singapore common format) first
    let parsed = parse(textValue, "dd/MM/yyyy", new Date())
    if (isValid(parsed)) {
      const iso = format(parsed, "yyyy-MM-dd")
      onChange(iso)
      setTextValue(format(parsed, "dd/MM/yyyy"))
      return
    }

    // Try D/M/YYYY (short Singapore format)
    parsed = parse(textValue, "d/M/yyyy", new Date())
    if (isValid(parsed)) {
      const iso = format(parsed, "yyyy-MM-dd")
      onChange(iso)
      setTextValue(format(parsed, "dd/MM/yyyy"))
      return
    }

    // Try YYYY-MM-DD
    parsed = parse(textValue, "yyyy-MM-dd", new Date())
    if (isValid(parsed)) {
      const iso = format(parsed, "yyyy-MM-dd")
      onChange(iso)
      setTextValue(format(parsed, "dd/MM/yyyy"))
      return
    }

    // Invalid input -- revert to previous valid value
    setTextValue(toDisplay(value))
  }

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      // Only close if not clicking back into the input
      if (!isOpen) {
        // Small delay to check if input got focus
        setTimeout(() => {
          const active = document.activeElement
          if (active?.closest(`[data-datepicker-id="${pickerId}"]`)) return
          setOpen(false)
        }, 0)
      } else {
        setOpen(true)
      }
    }}>
      <div className={cn("relative", className)} data-datepicker-id={pickerId}>
        <Input
          id={id}
          type="text"
          value={textValue}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="bg-gray-900 border-gray-800 text-white w-full text-sm placeholder:text-xs pr-8"
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Calendar
            mode="single"
            fixedWeeks
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
      </div>
    </Popover>
  )
}

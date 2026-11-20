import { Briefcase, Building2, CalendarCheck, CalendarOff, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OFFICE_HOURS_LABEL, splitWorkWeek } from "@/lib/attendance-policy";

interface Props {
  position: string | null;
  department: string | null;
  workdays: number[] | null;
}

/** My Profile: title, department, working hours, working days and off days at a glance (Alfred, 20 Nov 2026). */
export function WorkScheduleCard({ position, department, workdays }: Props) {
  const { working, off } = splitWorkWeek(workdays);
  const rows = [
    { label: "Title", value: position || "—", icon: Briefcase },
    { label: "Department", value: department || "—", icon: Building2 },
    { label: "Working hours", value: OFFICE_HOURS_LABEL, icon: Clock },
    { label: "Working days", value: working.join(", ") || "None", icon: CalendarCheck },
    { label: "Off days", value: off.join(", ") || "None", icon: CalendarOff },
  ];
  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader><CardTitle>Work Schedule</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {rows.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="font-medium text-white allow-wrap">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

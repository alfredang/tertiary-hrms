import { redirect } from "next/navigation";

/** Intern Attendance was merged into the admin Timesheet page. */
export default function AttendanceOverviewPage() {
  redirect("/timesheet/overview");
}

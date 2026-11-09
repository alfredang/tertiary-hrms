import type { BuiltInCronJob } from "@/lib/cron-jobs";

// HR attendance + compliance jobs. Kept apart from BUILT_IN_CRON_JOBS so other
// job lists can grow without merge conflicts; Settings → Cron Jobs shows both.
// Like the others, these are HTTP endpoints for an external scheduler (Coolify),
// called with "Authorization: Bearer <CRON_SECRET>".
export const HR_CRON_JOBS: BuiltInCronJob[] = [
  {
    id: "missed-clock-out-reminder",
    name: "Intern Missed Clock-Out Reminder",
    description:
      "Every evening, reminds each intern who clocked in but did not clock out today — or did not clock in on a scheduled workday (not on leave, not a public holiday) — by in-app notification and email, with a link to clock out or submit a missing-punch correction.",
    schedule: "Daily at 21:00 SGT",
    cron: "0 13 * * *",
    method: "GET",
    path: "/api/cron/missed-clock-out",
    status: "active",
  },
  {
    id: "missed-clock-out-rollup",
    name: "Intern Missed Punch Roll-up (Admins)",
    description:
      "Every morning, sends Alfred Ang and Tan Soik Ching one summary of every intern missed clock-in/clock-out in the last 7 days that has no correction filed (in-app notification + email). Silent when there are none.",
    schedule: "Daily at 08:30 SGT",
    cron: "30 0 * * *",
    method: "GET",
    path: "/api/cron/missed-clock-out?mode=rollup",
    status: "active",
  },
  {
    id: "hr-compliance",
    name: "HR Compliance Agent (Weekly)",
    description:
      "Weekly check of every active staff member and intern: No Pay Leave nearing/over the prorated 21-day cap, MC above the prorated entitlement or paid MC by interns, MC patterns (Mondays/Fridays, frequent single-day MCs), annual leave beyond entitlement, and interns with repeated missed punches. Emails and notifies Alfred Ang and Tan Soik Ching with the findings.",
    schedule: "Mondays at 08:30 SGT",
    cron: "30 0 * * 1",
    method: "GET",
    path: "/api/cron/hr-compliance",
    status: "active",
  },
];

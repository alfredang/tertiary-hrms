// Built-in cron jobs (hardcoded UI cards, no DB table).
// These are HTTP endpoints meant to be triggered by an external scheduler
// (Coolify cron, GitHub Action, etc.). The app does not run them itself.

export interface BuiltInCronJob {
  id: string;
  name: string;
  description: string;
  schedule: string; // human-readable, plus cron expression
  cron: string;
  method: "GET" | "POST";
  path: string;
  status: "active" | "planned";
}

export const BUILT_IN_CRON_JOBS: BuiltInCronJob[] = [
  {
    id: "monthly-payroll",
    name: "Monthly Payroll Generation",
    description:
      "Generates payslips for all active employees with salary info on the 28th of each month. Pro-rates basic + allowances if the employee started mid-month (MOM working-day standard). Skips CPF for interns. Uploads each payslip PDF to the employee's Payroll folder in Drive.",
    schedule: "28th of every month, 09:00 SGT",
    cron: "0 1 28 * *",
    method: "GET",
    path: "/api/cron/payroll",
    status: "active",
  },
  {
    id: "timesheet-reminder",
    name: "Timesheet Reminder",
    description:
      "Sends a 5:30 PM reminder on weekends and public holidays to employees who haven't submitted their hours yet. Only non-official workdays require timesheet submission. Off In Lieu days are credited after admin approval.",
    schedule: "Daily at 17:30 SGT",
    cron: "30 9 * * *",
    method: "GET",
    path: "/api/cron/timesheet-reminder",
    status: "active",
  },
];

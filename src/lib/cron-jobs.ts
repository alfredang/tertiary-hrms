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
];

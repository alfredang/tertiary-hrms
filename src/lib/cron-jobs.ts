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
  /** Job records each run in CronJobRun (src/lib/cron-run-log.ts); the panel then shows its last run. */
  logsRuns?: boolean;
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
  {
    id: "deactivate-expired-interns",
    name: "Deactivate Expired Interns",
    description:
      "Sets interns to INACTIVE once their employment end date has passed (they keep access through their final day). An inactive account is blocked from every login method. Only runs while the \"Auto-deactivate expired interns\" toggle above is enabled.",
    schedule: "Daily at 00:30 SGT",
    cron: "30 16 * * *",
    method: "GET",
    path: "/api/cron/deactivate-expired-interns",
    status: "active",
  },
  // ── Finance agents (log every run to CronJobRun; see src/lib/cron-run-log.ts) ──
  {
    id: "quickbooks-health",
    name: "QuickBooks Liveness Monitor",
    description:
      "Read-only health check of the QuickBooks connection: refreshes the OAuth token, makes a CompanyInfo call, records latency and the refresh-token expiry horizon. Alerts Alfred Ang and Tan Soik Ching (in-app + email) when it fails or the refresh token has 14 days or less left.",
    schedule: "Daily at 07:00 SGT",
    cron: "0 23 * * *",
    method: "GET",
    path: "/api/cron/quickbooks-health",
    status: "active",
    logsRuns: true,
  },
  {
    id: "weekly-bank-reconciliation",
    name: "Weekly Bank Reconciliation",
    description:
      "Matches the latest period of imported DBS statement rows against QuickBooks bank activity (read-only), stores the run under Accounting → Bank Reconciliation and emails the finance admins the match rate, unmatched items and differences. Append ?month=YYYY-MM to reconcile a whole month.",
    schedule: "Mondays at 08:00 SGT",
    cron: "0 0 * * 1",
    method: "GET",
    path: "/api/cron/bank-reconciliation",
    status: "active",
    logsRuns: true,
  },
];

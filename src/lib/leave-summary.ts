// Pure helpers for the monthly leave/MC summary consumed by the external AI
// agent (GET /api/agent/leave-summary). Kept free of Prisma so it can be unit
// tested. All dates are handled as UTC calendar days: leave dates are stored as
// UTC midnight of the SGT calendar date (new Date("YYYY-MM-DD")).

export interface ReportMonth {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  start: Date; // first day, UTC midnight
  end: Date; // last day, UTC midnight
}

/** Parse "YYYY-MM" into a month window. Returns null when malformed. */
export function parseReportMonth(value: string): ReportMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return {
    key: `${m[1]}-${m[2]}`,
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
  };
}

/** The month before `now` in Singapore time — the natural target for a run on the 1st. */
export function defaultReportMonthKey(now: Date = new Date()): string {
  const sgt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const prev = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth() - 1, 1));
  return prev.toISOString().slice(0, 7);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Mon–Fri days in [start, end] (UTC) that are not public holidays. */
export function countWorkingDaysUtc(start: Date, end: Date, holidays: Set<string>): number {
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(dayKey(cursor))) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export interface LeaveSpan {
  startDate: Date;
  endDate: Date;
  days: number; // the request's stored total
  halfDayPosition: string | null; // "first" | "last" for multi-day AL with a half day
}

/**
 * Days of a leave request that fall inside the month. A request wholly inside
 * the month returns its stored `days` (authoritative — it may be an admin
 * override). A request crossing a month boundary is split by working days,
 * deducting the half day on whichever side holds it.
 */
export function leaveDaysInMonth(req: LeaveSpan, month: ReportMonth, holidays: Set<string>): number {
  const startKey = dayKey(req.startDate);
  const endKey = dayKey(req.endDate);
  const monthStartKey = dayKey(month.start);
  const monthEndKey = dayKey(month.end);
  if (endKey < monthStartKey || startKey > monthEndKey) return 0;
  if (startKey >= monthStartKey && endKey <= monthEndKey) return req.days;

  const clipStart = startKey < monthStartKey ? month.start : req.startDate;
  const clipEnd = endKey > monthEndKey ? month.end : req.endDate;
  let days = countWorkingDaysUtc(clipStart, clipEnd, holidays);
  if (req.halfDayPosition === "first" && startKey >= monthStartKey) days -= 0.5;
  if (req.halfDayPosition === "last" && endKey <= monthEndKey) days -= 0.5;
  return Math.max(0, days);
}

/** Round to 2 dp for clean JSON. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Markdown rendering ──────────────────────────────────────────────────────

export interface SummaryEmployeeRow {
  employeeId: string;
  name: string;
  category: "STAFF" | "INTERN";
  leaveTaken: Record<string, { approved: number; pending: number }>;
  timeOff: { approvedHours: number; pendingHours: number } | null;
  balances: { code: string; available: number }[];
}

export interface SummaryForMarkdown {
  companyName: string;
  month: string;
  generatedAt: string;
  totals: {
    headcount: { staff: number; interns: number; total: number };
    byLeaveType: { code: string; name: string; approvedDays: number; pendingDays: number; employeesOnLeave: number }[];
    mc: { approvedDays: number; pendingDays: number; employeesOnMc: number };
    timeOff: { approvedHours: number; pendingHours: number };
  };
  employees: SummaryEmployeeRow[];
}

function fmt(n: number): string {
  return n === 0 ? "-" : String(round2(n));
}

/** Render the summary as a Markdown report an agent can paste into email/chat as-is. */
export function renderSummaryMarkdown(s: SummaryForMarkdown): string {
  const codes = s.totals.byLeaveType.map((t) => t.code);
  const lines: string[] = [];
  lines.push(`# ${s.companyName} — Leave & MC Summary for ${s.month}`);
  lines.push("");
  lines.push(
    `Headcount: ${s.totals.headcount.total} (${s.totals.headcount.staff} staff, ${s.totals.headcount.interns} interns) · ` +
      `MC: ${round2(s.totals.mc.approvedDays)} day(s) approved across ${s.totals.mc.employeesOnMc} employee(s)` +
      (s.totals.mc.pendingDays ? `, ${round2(s.totals.mc.pendingDays)} pending` : ""),
  );
  lines.push("");
  lines.push("## Totals by leave type");
  lines.push("");
  lines.push("| Type | Approved days | Pending days | Employees |");
  lines.push("|---|---:|---:|---:|");
  for (const t of s.totals.byLeaveType) {
    lines.push(`| ${t.name} (${t.code}) | ${round2(t.approvedDays)} | ${round2(t.pendingDays)} | ${t.employeesOnLeave} |`);
  }
  if (s.totals.timeOff.approvedHours || s.totals.timeOff.pendingHours) {
    lines.push(`| Intern time-off (hours) | ${round2(s.totals.timeOff.approvedHours)} h | ${round2(s.totals.timeOff.pendingHours)} h | - |`);
  }

  for (const category of ["STAFF", "INTERN"] as const) {
    const rows = s.employees.filter((e) => e.category === category);
    if (rows.length === 0) continue;
    lines.push("");
    lines.push(`## ${category === "STAFF" ? "Staff" : "Interns"} (${rows.length})`);
    lines.push("");
    const header = ["Employee", "ID", ...codes, ...(category === "INTERN" ? ["Time-off h"] : []), "AL left", "MC left"];
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`|${header.map((_, i) => (i < 2 ? "---" : "---:")).join("|")}|`);
    for (const e of rows) {
      const cells = codes.map((c) => {
        const t = e.leaveTaken[c];
        if (!t) return "-";
        return t.pending ? `${fmt(t.approved)} (+${round2(t.pending)} pend.)` : fmt(t.approved);
      });
      if (category === "INTERN") {
        const t = e.timeOff;
        cells.push(!t ? "-" : t.pendingHours ? `${fmt(t.approvedHours)} (+${round2(t.pendingHours)} pend.)` : fmt(t.approvedHours));
      }
      const bal = (code: string) => {
        const b = e.balances.find((x) => x.code === code);
        return b ? String(round2(b.available)) : "-";
      };
      lines.push(`| ${[e.name, e.employeeId, ...cells, bal("AL"), bal("MC")].join(" | ")} |`);
    }
  }

  lines.push("");
  lines.push(`_Generated ${s.generatedAt}. Days are working days within ${s.month}; "-" means none. Pending = awaiting approval._`);
  return lines.join("\n");
}

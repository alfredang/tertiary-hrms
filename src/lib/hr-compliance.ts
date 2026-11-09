/**
 * HR compliance rules — pure functions turning per-person leave and attendance
 * figures into findings. Used by the weekly HR compliance agent
 * (/api/cron/hr-compliance) and the admin dashboard alerts panel.
 */
import { countSingleDayMcs, countWeekendAdjacentMcs, NPL_WARN_RATIO, type SimpleLeave } from "@/lib/leave-policy";

export type Severity = "high" | "medium" | "low";

export interface PersonLeaveRow {
  id: string;
  name: string;
  employeeCode: string;
  isIntern: boolean;
  al: { earned: number; full: number; carried: number; used: number; pending: number; allowed: number };
  mc: { earned: number; used: number; pending: number };
  npl: { cap: number; used: number; pending: number };
  /** Approved MCs this year (start/end dates + days). */
  mcLeaves: SimpleLeave[];
  /** Approved/pending AL requests this year recorded with a deficit (pre-policy). */
  deficitDays: number;
}

export interface InternAttendanceRow {
  id: string;
  name: string;
  employeeCode: string;
  /** Open punches (clocked in, never out) in the lookback window, no correction filed. */
  missingClockOuts: string[];
  /** Scheduled workdays with no clock-in, no leave and no correction, in the window. */
  missingClockIns: string[];
}

export interface Finding {
  severity: Severity;
  category: "NPL" | "MC_PATTERN" | "MC_EXCESS" | "AL_EXCESS" | "ATTENDANCE";
  employeeId: string;
  name: string;
  employeeCode: string;
  message: string;
}

export interface ComplianceThresholds {
  nplWarnRatio: number;
  /** Weekend-adjacent (Mon start / Fri end) MCs this year that make a pattern. */
  weekendMcCount: number;
  /** Share of a person's MCs that are weekend-adjacent for the pattern to count. */
  weekendMcShare: number;
  /** Single-day MCs this year that count as frequent. */
  singleDayMcCount: number;
  /** Missing punches in the lookback window that count as repeated. */
  missedPunchCount: number;
}

export const DEFAULT_THRESHOLDS: ComplianceThresholds = {
  nplWarnRatio: NPL_WARN_RATIO,
  weekendMcCount: 3,
  weekendMcShare: 0.5,
  singleDayMcCount: 4,
  missedPunchCount: 2,
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function buildFindings(
  people: PersonLeaveRow[],
  interns: InternAttendanceRow[],
  t: ComplianceThresholds = DEFAULT_THRESHOLDS,
): Finding[] {
  const out: Finding[] = [];
  const who = (p: { id: string; name: string; employeeCode: string }) => ({
    employeeId: p.id,
    name: p.name,
    employeeCode: p.employeeCode,
  });

  for (const p of people) {
    // No Pay Leave against the prorated 21-day cap
    const nplTotal = p.npl.used + p.npl.pending;
    if (nplTotal > 0) {
      if (nplTotal > p.npl.cap) {
        out.push({ ...who(p), severity: "high", category: "NPL",
          message: `No Pay Leave ${nplTotal} day(s) (taken + pending) is over the prorated cap of ${p.npl.cap}.` });
      } else if (p.npl.cap > 0 && nplTotal >= p.npl.cap * t.nplWarnRatio) {
        out.push({ ...who(p), severity: "medium", category: "NPL",
          message: `No Pay Leave ${nplTotal} of ${p.npl.cap} prorated day(s) used — nearing the cap.` });
      }
    }

    // MC above the prorated entitlement (staff), or any paid MC by an intern
    const mcTotal = p.mc.used + p.mc.pending;
    if (p.isIntern && mcTotal > 0) {
      out.push({ ...who(p), severity: "medium", category: "MC_EXCESS",
        message: `Intern has ${mcTotal} day(s) of paid MC recorded; interns' sick leave should be No Pay Leave.` });
    } else if (!p.isIntern && mcTotal > p.mc.earned) {
      out.push({ ...who(p), severity: "medium", category: "MC_EXCESS",
        message: `MC ${mcTotal} day(s) is above the prorated entitlement of ${p.mc.earned}.` });
    }

    // MC patterns
    const weekendAdj = countWeekendAdjacentMcs(p.mcLeaves);
    if (weekendAdj >= t.weekendMcCount && weekendAdj >= p.mcLeaves.length * t.weekendMcShare) {
      out.push({ ...who(p), severity: "low", category: "MC_PATTERN",
        message: `${weekendAdj} of ${p.mcLeaves.length} MCs this year fall on a Monday or Friday.` });
    }
    const singles = countSingleDayMcs(p.mcLeaves);
    if (singles >= t.singleDayMcCount) {
      out.push({ ...who(p), severity: "low", category: "MC_PATTERN",
        message: `${singles} single-day MCs this year.` });
    }

    // AL beyond entitlement
    const alTotal = p.al.used + p.al.pending;
    if (alTotal > p.al.allowed + p.al.carried) {
      out.push({ ...who(p), severity: "high", category: "AL_EXCESS",
        message: `Annual leave ${alTotal} day(s) (taken + pending) exceeds the ${p.al.allowed + p.al.carried} day(s) available; the excess should be No Pay Leave.` });
    } else if (p.deficitDays > 0) {
      out.push({ ...who(p), severity: "medium", category: "AL_EXCESS",
        message: `${p.deficitDays} day(s) of annual leave were recorded as a deficit before the No Pay Leave rule.` });
    }
  }

  for (const i of interns) {
    const missed = i.missingClockOuts.length + i.missingClockIns.length;
    if (missed >= t.missedPunchCount) {
      const parts = [
        i.missingClockOuts.length ? `${i.missingClockOuts.length} missing clock-out(s) (${i.missingClockOuts.join(", ")})` : "",
        i.missingClockIns.length ? `${i.missingClockIns.length} missing clock-in(s) (${i.missingClockIns.join(", ")})` : "",
      ].filter(Boolean);
      out.push({ ...who(i), severity: i.missingClockOuts.length >= t.missedPunchCount ? "high" : "medium", category: "ATTENDANCE",
        message: `Repeated missed punches: ${parts.join("; ")}.` });
    }
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.name.localeCompare(b.name));
}

export function findingsEmailHtml(findings: Finding[], heading: string, siteUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const color: Record<Severity, string> = { high: "#b91c1c", medium: "#b45309", low: "#1d4ed8" };
  const rows = findings
    .map((f) => `<tr><td style="padding:4px 8px;color:${color[f.severity]};font-weight:600;text-transform:uppercase;font-size:11px">${f.severity}</td>` +
      `<td style="padding:4px 8px">${esc(f.name)} <span style="color:#6b7280">(${esc(f.employeeCode)})</span></td>` +
      `<td style="padding:4px 8px">${esc(f.message)}</td></tr>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:720px">
<p>${esc(heading)}</p>
${findings.length === 0 ? "<p>No issues found.</p>" : `<table style="border-collapse:collapse;font-size:13px">${rows}</table>`}
<p style="margin-top:16px"><a href="${siteUrl}/dashboard" style="color:#2563eb">Open the HR dashboard</a></p>
</div>`;
}

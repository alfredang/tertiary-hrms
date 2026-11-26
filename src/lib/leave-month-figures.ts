// Leave days of one month by kind, for the payslip and the person page (one rule for both).
// Interns: an MC request, or the No Pay Leave the API files for an intern's MC ("Sick leave (MC) — …"),
// is MC; any other No Pay Leave is No Pay Leave. Staff: MC is paid (counted, not deducted).
// Days: Mon–Fri, public holidays excluded, split across months (`nplDaysOfRequest`).

import Decimal from "decimal.js";
import { isMedicalLeaveCode, NPL_CODE } from "@/lib/leave-policy";
import { nplDaysOfRequest } from "@/lib/npl-payback";

export const AL_CODE = "AL";
/** Reason prefix of the No Pay Leave the API files for an intern's MC. */
export const INTERN_MC_REASON_PREFIX = "Sick leave (MC)";

export interface PayMonthRequest {
  code: string;
  reason: string | null;
  startDate: Date;
  endDate: Date;
  days: number;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Pure: the leave figures of the month from the person's approved requests. */
export function payMonthLeaveFigures(
  requests: PayMonthRequest[],
  intern: boolean,
  month: number,
  year: number,
  holidays: ReadonlySet<string> = new Set(),
): { annualLeaveDays: number; noPayLeaveDays: number; mcDays: number } {
  const prefix = `${monthKey(year, month)}-`;
  const inMonth = (r: PayMonthRequest) =>
    nplDaysOfRequest(r, holidays)
      .filter((d) => d.date.startsWith(prefix))
      .reduce((s, d) => s.plus(d.days), new Decimal(0));
  let al = new Decimal(0);
  let npl = new Decimal(0);
  let mc = new Decimal(0);
  for (const r of requests) {
    const code = r.code.toUpperCase();
    if (code === AL_CODE) al = al.plus(inMonth(r));
    else if (code === NPL_CODE) {
      if (intern && (r.reason ?? "").startsWith(INTERN_MC_REASON_PREFIX)) mc = mc.plus(inMonth(r));
      else npl = npl.plus(inMonth(r));
    } else if (isMedicalLeaveCode(code)) mc = mc.plus(inMonth(r));
  }
  return { annualLeaveDays: al.toNumber(), noPayLeaveDays: npl.toNumber(), mcDays: mc.toNumber() };
}

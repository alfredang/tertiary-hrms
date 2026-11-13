import { prorateLeave } from "@/lib/utils";
import { isMedicalLeaveCode, mcAnnualEntitlement, NPL_CODE, type NplStatus } from "@/lib/leave-policy";
import type { LeaveProfile } from "@/lib/leave-allowance";
import { annualLeaveAmounts } from "@/lib/annual-leave-policy";

type Dec = { toString(): string } | number | null | undefined;
const n = (v: Dec): number => (v == null ? 0 : Number(v));

export interface BalanceRowInput {
  entitlement: Dec;
  carriedOver: Dec;
  used: Dec;
  pending: Dec;
  earned: Dec;
  autoDeducted: Dec;
  /** Contract-period AL pool (internships); null/absent = calendar-year row. */
  periodStart?: Date | null;
  periodEnd?: Date | null;
  leaveType: { code: string; defaultDays: number };
}

/**
 * Days still available on one LeaveBalance row, the same rule the apps show:
 * AL via annualLeaveAmounts() (calendar-year proration, or the contract period's
 * pool for internships), MC prorated (interns have none),
 * OT-earned AL from `earned`, NPL from the prorated 21-day cap (not the row).
 */
export function leaveBalanceAvailable(
  b: BalanceRowInput,
  profile: LeaveProfile | null,
  npl: NplStatus | null,
  asOf: Date = new Date(),
): { available: number; proRated: number | null } {
  const code = b.leaveType.code;
  const entitlement = n(b.entitlement);
  const carriedOver = n(b.carriedOver);
  const used = n(b.used);
  const pending = n(b.pending);

  let available: number;
  let proRated: number | null = null;
  if (code === "AL_OT") {
    available = n(b.earned) - used - n(b.autoDeducted) - pending;
  } else if (code === "AL") {
    const amounts = annualLeaveAmounts(
      { entitlement: entitlement || b.leaveType.defaultDays, carriedOver, used, pending,
        recordedEarned: n(b.earned), periodStart: b.periodStart, periodEnd: b.periodEnd },
      profile,
      asOf,
    );
    proRated = amounts.earned;
    available = amounts.remaining;
  } else if (isMedicalLeaveCode(code)) {
    proRated = prorateLeave(mcAnnualEntitlement(entitlement, !!profile?.isIntern), profile?.startDate, null, false, asOf, profile?.endDate);
    available = proRated + carriedOver - used - pending;
  } else if (code === NPL_CODE && npl) {
    proRated = npl.cap;
    available = npl.remaining;
  } else {
    available = entitlement + carriedOver - used - pending;
  }
  return { available: Math.round(available * 100) / 100, proRated };
}

import { prisma } from "./prisma";
import { leaveDate } from "./annual-leave-policy";

/** Contract AL continues to use its original ledger when the calendar year changes. */
export async function getAnnualLeaveBalance(employeeId: string, leaveTypeId: string, asOf: Date = new Date()) {
  const today = leaveDate(asOf);
  const contract = await prisma.leaveBalance.findFirst({
    where: { employeeId, leaveTypeId, periodStart: { lte: today }, periodEnd: { gte: today } },
    orderBy: { periodStart: "desc" },
  });
  if (contract) return contract;
  return prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: asOf.getFullYear() } },
  });
}

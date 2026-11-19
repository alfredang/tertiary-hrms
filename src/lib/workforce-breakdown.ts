import { prisma } from "@/lib/prisma";
import { isInternRoles } from "@/lib/leave-policy";
import { ageGroup, ethnicLabel, GENDER_LABEL, type BreakdownPerson } from "@/lib/demographics";

/** Active staff and interns, reduced to gender, age group and ethnic group for the dashboard charts. */
export async function getWorkforceBreakdown(now: Date = new Date()): Promise<BreakdownPerson[]> {
  const employees = await prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { gender: true, dateOfBirth: true, ethnicGroup: true, user: { select: { roles: true } } },
  });
  return employees.map((e) => ({
    intern: isInternRoles(e.user?.roles),
    gender: GENDER_LABEL[e.gender] ?? "Other",
    ageGroup: ageGroup(e.dateOfBirth, now),
    ethnicGroup: ethnicLabel(e.ethnicGroup),
  }));
}

import { prisma } from "./prisma";
import { DEMO_EMPLOYEE_CODES } from "./demo-accounts";

/** Demo / App Review logins (by email). Their actions must never email or notify real people. */
const DEMO_EMAIL = /^appreview(\.[a-z0-9]+)?@tertiaryinfotech\.com$/i;

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_EMAIL.test(email.trim());
}

/** True when the Employee (by database id) is a demo / App Review account. */
export async function isDemoEmployee(employeeDbId: string | null | undefined): Promise<boolean> {
  if (!employeeDbId) return false;
  const e = await prisma.employee.findUnique({ where: { id: employeeDbId }, select: { employeeId: true, email: true } });
  return !!e && (DEMO_EMPLOYEE_CODES.includes(e.employeeId) || isDemoEmail(e.email));
}

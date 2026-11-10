/**
 * Demo / App Review accounts. They exist only so Apple and Google reviewers can sign in to the
 * native apps; they must never appear in staff lists, counts, payroll, timesheets or reports.
 * `src/lib/prisma.ts` drops them from every `employee.findMany` / `employee.count` that is not a
 * lookup of one specific person (so the demo user can still load their own profile).
 */
export const DEMO_EMPLOYEE_CODES = ["E9999", "E9998"];

type Where = Record<string, unknown> | undefined;

/** True when the filter already pins one specific employee (by id, user, email or code). */
function targetsOnePerson(where: Where): boolean {
  if (!where) return false;
  return ["id", "userId", "email", "employeeId"].some((k) => typeof where[k] === "string");
}

/** Add "not a demo account" to an employee filter unless it already targets one person. */
export function withoutDemoEmployees<W extends Where>(where: W): W {
  if (targetsOnePerson(where)) return where;
  const notDemo = { employeeId: { notIn: DEMO_EMPLOYEE_CODES } };
  return (where ? { AND: [where, notDemo] } : notDemo) as unknown as W;
}

/**
 * Add "not filed by a demo account" to a request-type filter (leave, claims, time off, timesheet,
 * OT, payslips, punches) unless it already targets one employee or one record — so admins never
 * see App Review activity, while the demo user still sees their own.
 */
export function withoutDemoRequests<W extends Where>(where: W): W {
  if (where && (typeof where.employeeId === "string" || typeof where.id === "string")) return where;
  const notDemo = { employee: { employeeId: { notIn: DEMO_EMPLOYEE_CODES } } };
  return (where ? { AND: [where, notDemo] } : notDemo) as unknown as W;
}

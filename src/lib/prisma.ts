import { PrismaClient } from "@prisma/client";
import { withoutDemoEmployees, withoutDemoRequests } from "./demo-accounts";

type Q = { args: { where?: unknown }; query: (args: never) => Promise<unknown> };
/** findMany / count on request-type models drop demo-account rows (see withoutDemoRequests). */
const hideDemoRows = {
  findMany({ args, query }: Q) {
    args.where = withoutDemoRequests(args.where as Record<string, unknown> | undefined);
    return query(args as never);
  },
  count({ args, query }: Q) {
    args.where = withoutDemoRequests(args.where as Record<string, unknown> | undefined);
    return query(args as never);
  },
};

function createClient() {
  return new PrismaClient({ log: ["error"] }).$extends({
    name: "hide-demo-employees",
    query: {
      employee: {
        findMany({ args, query }) {
          args.where = withoutDemoEmployees(args.where as Record<string, unknown> | undefined) as typeof args.where;
          return query(args);
        },
        count({ args, query }) {
          args.where = withoutDemoEmployees(args.where as Record<string, unknown> | undefined) as typeof args.where;
          return query(args);
        },
      },
      leaveRequest: hideDemoRows,
      expenseClaim: hideDemoRows,
      timeOffRequest: hideDemoRows,
      timesheetEntry: hideDemoRows,
      otWorkLog: hideDemoRows,
      payslip: hideDemoRows,
      attendancePunch: hideDemoRows,
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma: ExtendedClient | undefined };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

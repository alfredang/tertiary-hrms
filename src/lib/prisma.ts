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

type NoteRow = { userId?: string; title?: string; message?: string; link?: string | null; type?: string };

/**
 * Every Notification row is also pushed to the recipient's phones (src/lib/push.ts). Fire and
 * forget, after the insert succeeds; imported lazily because push.ts itself uses this client.
 */
function queuePush(rows: NoteRow[]) {
  const items = rows
    .filter((r) => r.userId && r.title)
    .map((r) => ({ userId: r.userId as string, title: r.title as string, body: r.message ?? "", link: r.link ?? null, type: r.type }));
  if (items.length === 0 || process.env.NODE_ENV === "test") return;
  import("./push")
    .then((m) => m.sendPush(items))
    .catch((err) => console.error("[push] queue failed:", err));
}

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
      notification: {
        async create({ args, query }) {
          const row = await query(args);
          queuePush([row as NoteRow]);
          return row;
        },
        async createMany({ args, query }) {
          const res = await query(args);
          const data = args.data;
          queuePush((Array.isArray(data) ? data : [data]) as NoteRow[]);
          return res;
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

import { PrismaClient } from "@prisma/client";
import { withoutDemoEmployees } from "./demo-accounts";

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
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma: ExtendedClient | undefined };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

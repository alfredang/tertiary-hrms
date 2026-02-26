import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find orphan test leaves
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      OR: [
        { reason: { contains: "E2E-" } },
        { reason: { contains: "approve-reset" } },
        { reason: { contains: "reject-reset" } },
        { reason: { contains: "cancel test" } },
      ],
    },
    select: { id: true, reason: true, status: true, startDate: true },
  });
  console.log("Test leaves found:", leaves.length);
  for (const l of leaves) {
    console.log("  ", l.id, l.status, l.reason?.substring(0, 60));
  }

  // Find orphan test expenses
  const expenses = await prisma.expenseClaim.findMany({
    where: {
      OR: [
        { description: { contains: "E2E-" } },
        { description: { contains: "approve-reset" } },
        { description: { contains: "reject-reset" } },
        { description: { contains: "cancel test" } },
      ],
    },
    select: { id: true, description: true, status: true },
  });
  console.log("Test expenses found:", expenses.length);
  for (const e of expenses) {
    console.log("  ", e.id, e.status, e.description?.substring(0, 60));
  }

  // Find orphan test calendar events
  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { title: { contains: "E2E-" } },
        { title: { contains: "Test Event" } },
      ],
    },
    select: { id: true, title: true },
  });
  console.log("Test calendar events found:", events.length);
  for (const ev of events) {
    console.log("  ", ev.id, ev.title);
  }

  // Delete them
  if (leaves.length > 0) {
    const d = await prisma.leaveRequest.deleteMany({
      where: { id: { in: leaves.map((l) => l.id) } },
    });
    console.log("Deleted leaves:", d.count);
  }
  if (expenses.length > 0) {
    const d = await prisma.expenseClaim.deleteMany({
      where: { id: { in: expenses.map((e) => e.id) } },
    });
    console.log("Deleted expenses:", d.count);
  }
  if (events.length > 0) {
    const d = await prisma.calendarEvent.deleteMany({
      where: { id: { in: events.map((ev) => ev.id) } },
    });
    console.log("Deleted calendar events:", d.count);
  }

  console.log("Done!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

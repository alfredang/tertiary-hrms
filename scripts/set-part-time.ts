import { prisma } from "../src/lib/prisma";

const PART_TIME_KEYWORDS = [
  ["Ang", "Ming", "Liang"],
  ["Tan", "Eng", "Swee"],
  ["Jasmine", "Sho"],
];

async function main() {
  for (const parts of PART_TIME_KEYWORDS) {
    const matches = await prisma.employee.findMany({
      where: {
        AND: parts.map((p) => ({ name: { contains: p, mode: "insensitive" as const } })),
      },
      select: { id: true, name: true, employmentType: true },
    });
    if (matches.length === 0) {
      console.log(`No match for ${parts.join(" ")}`);
      continue;
    }
    for (const m of matches) {
      await prisma.employee.update({
        where: { id: m.id },
        data: { employmentType: "PART_TIME" },
      });
      console.log(`Updated ${m.name} (${m.id}): ${m.employmentType} -> PART_TIME`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

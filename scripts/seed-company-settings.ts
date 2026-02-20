import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedCompanySettings() {
  try {
    console.log("Seeding company settings...\n");

    const settings = await prisma.companySettings.upsert({
      where: { id: "company_settings" },
      update: {},
      create: {
        id: "company_settings",
        name: "Tertiary Infotech",
        uen: "",
        address: "",
        phone: "",
        email: "info@tertiaryinfotech.com",
        website: "",
      },
    });

    console.log("✓ Company settings created/updated:");
    console.log(`  - Name: ${settings.name}`);
    console.log(`  - Email: ${settings.email}`);

    console.log("\n✅ Company settings seeded successfully!");
  } catch (error) {
    console.error("Error seeding company settings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedCompanySettings();

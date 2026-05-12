import { prisma } from "@/lib/prisma";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";

export const dynamic = "force-dynamic";

async function getCompanySettings() {
  let settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
  });
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: { id: "company_settings" },
    });
  }
  return settings;
}

export default async function CompanySettingsPage() {
  const settings = await getCompanySettings();
  return <CompanySettingsForm settings={settings} />;
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

async function getCompanySettings() {
  let settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: {
        id: "company_settings",
        name: "Tertiary Infotech",
        uen: "",
        address: "",
        phone: "",
        email: "",
        website: "",
      },
    });
  }

  return settings;
}

export default async function SettingsPage() {
  const session = await auth();

  const role = process.env.SKIP_AUTH === "true" ? "ADMIN" : (session?.user?.role || "STAFF");
  const canEdit = ["ADMIN", "HR"].includes(role);

  const settings = await getCompanySettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Company Settings</h1>
        <p className="text-gray-400 mt-1">
          {canEdit ? "Manage your company information" : "View company information"}
        </p>
      </div>

      <CompanySettingsForm settings={settings} readOnly={!canEdit} />
    </div>
  );
}

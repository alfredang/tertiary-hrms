import { prisma } from "./prisma";

export interface CompanyBranding {
  name: string;
  shortName: string | null;
  address: string;
  uen: string;
  phone: string;
  email: string;
  website: string;
  logo: string | null;
}

const FALLBACK_NAME = "HR Portal";

export async function getCompanyBranding(): Promise<CompanyBranding> {
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
  });

  return {
    name: settings?.name || FALLBACK_NAME,
    shortName: settings?.shortName || null,
    address: settings?.address || "",
    uen: settings?.uen || "",
    phone: settings?.phone || "",
    email: settings?.email || "",
    website: settings?.website || "",
    logo: settings?.logo || null,
  };
}

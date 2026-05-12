import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";
import { QuickBooksCredentialsCard } from "@/components/settings/quickbooks-credentials-card";
import { GmailCredentialsCard } from "@/components/settings/gmail-credentials-card";
import { ClaudeCredentialsCard } from "@/components/settings/claude-credentials-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { redirect } from "next/navigation";
import { getViewMode } from "@/lib/view-mode";
import { isDevAuthSkipped } from "@/lib/dev-auth";

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

async function getCredentials() {
  const rows = await prisma.companyCredential.findMany({
    where: {
      keyName: {
        in: [
          "QUICKBOOKS_CLIENT_ID",
          "QUICKBOOKS_CLIENT_SECRET",
          "QUICKBOOKS_REFRESH_TOKEN",
          "QUICKBOOKS_REALM_ID",
          "GMAIL_EMAIL_USER",
          "GMAIL_CLIENT_ID",
          "GMAIL_CLIENT_SECRET",
          "GMAIL_REFRESH_TOKEN",
          "CLAUDE_API_KEY",
        ],
      },
    },
  });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.keyName] = row.keyValue;
  return map;
}

export default async function SettingsPage() {
  const session = await auth();
  const viewMode = await getViewMode();

  const role = isDevAuthSkipped() ? "ADMIN" : session?.user?.role || "STAFF";
  const isAdmin = role === "ADMIN";

  if (!isAdmin || viewMode === "staff") redirect("/dashboard");

  const [settings, credentials] = await Promise.all([getCompanySettings(), getCredentials()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">Manage company information and integrations</p>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="company" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">
            Company
          </TabsTrigger>
          <TabsTrigger value="credentials" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">
            Credentials
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-6">
          <CompanySettingsForm settings={settings} />
        </TabsContent>

        <TabsContent value="credentials" className="mt-6">
          <div className="space-y-4">
            <GmailCredentialsCard
              emailUser={credentials["GMAIL_EMAIL_USER"] ?? ""}
              clientId={credentials["GMAIL_CLIENT_ID"] ?? ""}
              clientSecret={credentials["GMAIL_CLIENT_SECRET"] ?? ""}
              refreshToken={credentials["GMAIL_REFRESH_TOKEN"] ?? ""}
            />
            <QuickBooksCredentialsCard
              clientId={credentials["QUICKBOOKS_CLIENT_ID"] ?? ""}
              clientSecret={credentials["QUICKBOOKS_CLIENT_SECRET"] ?? ""}
              refreshToken={credentials["QUICKBOOKS_REFRESH_TOKEN"] ?? ""}
              realmId={credentials["QUICKBOOKS_REALM_ID"] ?? ""}
            />
            <ClaudeCredentialsCard apiKey={credentials["CLAUDE_API_KEY"] ?? ""} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

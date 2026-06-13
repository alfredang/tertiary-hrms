import { prisma } from "@/lib/prisma";
import { QuickBooksCredentialsCard } from "@/components/settings/quickbooks-credentials-card";
import { GmailCredentialsCard } from "@/components/settings/gmail-credentials-card";
import { ClaudeCredentialsCard } from "@/components/settings/claude-credentials-card";
import { WoodsSquareCredentialsCard } from "@/components/settings/woods-square-credentials-card";

export const dynamic = "force-dynamic";

async function getCredentials() {
  const rows = await prisma.companyCredential.findMany({
    where: {
      keyName: {
        in: [
          "QUICKBOOKS_CLIENT_ID",
          "QUICKBOOKS_CLIENT_SECRET",
          "QUICKBOOKS_REFRESH_TOKEN",
          "QUICKBOOKS_REALM_ID",
          "QUICKBOOKS_REDIRECT_URI",
          "QUICKBOOKS_PROXY_URL",
          "GMAIL_EMAIL_USER",
          "GMAIL_CLIENT_ID",
          "GMAIL_CLIENT_SECRET",
          "GMAIL_REFRESH_TOKEN",
          "CLAUDE_API_KEY",
          "HABITAP_USERNAME",
          "HABITAP_PASSWORD",
        ],
      },
    },
  });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.keyName] = row.keyValue;
  return map;
}

export default async function CredentialsPage() {
  const credentials = await getCredentials();
  return (
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
        redirectUri={credentials["QUICKBOOKS_REDIRECT_URI"] ?? ""}
        proxyUrl={credentials["QUICKBOOKS_PROXY_URL"] ?? ""}
      />
      <ClaudeCredentialsCard apiKey={credentials["CLAUDE_API_KEY"] ?? ""} />
      <WoodsSquareCredentialsCard
        username={credentials["HABITAP_USERNAME"] ?? ""}
        password={credentials["HABITAP_PASSWORD"] ?? ""}
      />
    </div>
  );
}

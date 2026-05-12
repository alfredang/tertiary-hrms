import { prisma } from "@/lib/prisma";
import { BUILT_IN_WEBHOOKS, getBaseUrl } from "@/lib/webhooks";
import { WebhooksPanel } from "@/components/settings/webhooks-panel";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const baseUrl = getBaseUrl();
  const custom = await prisma.webhook.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      httpMethod: true,
      endpointToken: true,
      authToken: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const builtIns = BUILT_IN_WEBHOOKS.map((w) => ({
    ...w,
    fullUrl: `${baseUrl}${w.pathTemplate}`,
  }));

  return <WebhooksPanel builtIns={builtIns} custom={custom} baseUrl={baseUrl} />;
}

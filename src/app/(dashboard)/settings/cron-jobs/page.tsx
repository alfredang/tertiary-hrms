import { BUILT_IN_CRON_JOBS } from "@/lib/cron-jobs";
import { getBaseUrl } from "@/lib/webhooks";
import { prisma } from "@/lib/prisma";
import { CronJobsPanel } from "@/components/settings/cron-jobs-panel";

export const dynamic = "force-dynamic";

export default async function CronJobsPage() {
  const baseUrl = getBaseUrl();
  const jobs = BUILT_IN_CRON_JOBS.map((j) => ({ ...j, fullUrl: `${baseUrl}${j.path}` }));
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
    select: { autoDeactivateInterns: true },
  });
  return <CronJobsPanel jobs={jobs} autoDeactivateInterns={settings?.autoDeactivateInterns ?? false} />;
}

import { BUILT_IN_CRON_JOBS } from "@/lib/cron-jobs";
import { HR_CRON_JOBS } from "@/lib/hr-cron-jobs";
import { getLatestCronRuns } from "@/lib/cron-runs";
import { getBaseUrl } from "@/lib/webhooks";
import { prisma } from "@/lib/prisma";
import { CronJobsPanel } from "@/components/settings/cron-jobs-panel";

export const dynamic = "force-dynamic";

export default async function CronJobsPage() {
  const baseUrl = getBaseUrl();
  const allJobs = [...BUILT_IN_CRON_JOBS, ...HR_CRON_JOBS];
  // Only jobs that record their runs (withCronRun) get a "Last run" line.
  const tracked = new Set(HR_CRON_JOBS.map((j) => j.id));
  const lastRuns = await getLatestCronRuns(Array.from(tracked));
  const jobs = allJobs.map((j) => ({
    ...j,
    fullUrl: `${baseUrl}${j.path}`,
    lastRun: tracked.has(j.id) ? lastRuns[j.id] ?? null : undefined,
  }));
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company_settings" },
    select: { autoDeactivateInterns: true },
  });
  return <CronJobsPanel jobs={jobs} autoDeactivateInterns={settings?.autoDeactivateInterns ?? false} />;
}

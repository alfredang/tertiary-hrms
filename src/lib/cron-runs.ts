import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Record a cron execution so Settings → Cron Jobs can show the last run.
 * Uses the shared CronJobRun table (see src/lib/cron-run-log.ts); one run-history
 * table for every scheduled job. Best effort: if the table is missing (schema not
 * pushed yet) the job still runs and returns its result.
 */
export async function withCronRun<T extends Record<string, unknown>>(
  jobId: string,
  fn: () => Promise<T>,
  trigger: "SCHEDULED" | "MANUAL" = "SCHEDULED",
): Promise<T> {
  const started = Date.now();
  let runId: string | null = null;
  try {
    runId = (await prisma.cronJobRun.create({ data: { jobId, trigger } })).id;
  } catch (err) {
    console.warn(`[cron-runs] could not record start of ${jobId}:`, err instanceof Error ? err.message : err);
  }
  const finish = (data: Prisma.CronJobRunUpdateInput) =>
    runId
      ? prisma.cronJobRun
          .update({ where: { id: runId }, data: { finishedAt: new Date(), durationMs: Date.now() - started, ...data } })
          .catch(() => {})
      : Promise.resolve();
  try {
    const result = await fn();
    const ok = result.ok !== false;
    const summary = typeof result.summary === "string" ? result.summary : null;
    await finish({
      status: ok ? "SUCCESS" : "FAILED",
      summary,
      details: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      error: ok ? null : typeof result.error === "string" ? result.error : null,
    });
    return result;
  } catch (err) {
    await finish({ status: "FAILED", summary: "Run failed", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

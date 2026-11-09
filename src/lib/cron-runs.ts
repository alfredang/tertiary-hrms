import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Record a cron execution in CronRun so Settings → Cron Jobs can show the last
 * run and its status. Recording is best effort: if the table is missing (schema
 * not pushed yet) the job still runs and returns its result.
 */
export async function withCronRun<T extends Record<string, unknown>>(
  jobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  let runId: string | null = null;
  try {
    runId = (await prisma.cronRun.create({ data: { jobId } })).id;
  } catch (err) {
    console.warn(`[cron-runs] could not record start of ${jobId}:`, err instanceof Error ? err.message : err);
  }

  try {
    const result = await fn();
    if (runId) {
      await prisma.cronRun
        .update({
          where: { id: runId },
          data: { finishedAt: new Date(), ok: result.ok !== false, summary: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue },
        })
        .catch(() => {});
    }
    return result;
  } catch (err) {
    if (runId) {
      await prisma.cronRun
        .update({
          where: { id: runId },
          data: { finishedAt: new Date(), ok: false, error: err instanceof Error ? err.message : String(err) },
        })
        .catch(() => {});
    }
    throw err;
  }
}

export interface CronRunView {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  error: string | null;
}

/** Latest run per job id. Empty when the CronRun table doesn't exist yet. */
export async function getLatestCronRuns(jobIds: string[]): Promise<Record<string, CronRunView>> {
  const out: Record<string, CronRunView> = {};
  try {
    const rows = await Promise.all(
      jobIds.map((jobId) => prisma.cronRun.findFirst({ where: { jobId }, orderBy: { startedAt: "desc" } })),
    );
    for (const r of rows) {
      if (!r) continue;
      out[r.jobId] = {
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        ok: r.ok,
        error: r.error,
      };
    }
  } catch {
    // table not created yet
  }
  return out;
}

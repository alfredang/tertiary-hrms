/**
 * Run log for the built-in scheduled jobs (CronJobRun). Settings → Cron Jobs shows the
 * latest run of each job. Logging is best-effort: if the table is missing (schema not
 * pushed yet) or the DB hiccups, the job itself still runs.
 *
 * To log a new job: wrap its body in `runLoggedCronJob("<BuiltInCronJob.id>", req, async () => ...)`.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type CronTrigger = "SCHEDULED" | "MANUAL";
export type CronRunStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export interface CronJobOutcome {
  status?: CronRunStatus;
  summary: string;
  details?: Record<string, unknown>;
  /** HTTP status for the endpoint response; defaults to 200 (500 when status is FAILED). */
  httpStatus?: number;
}

/** Header /api/cron/run-now adds so a "Run Now" click is logged as MANUAL. */
export const CRON_TRIGGER_HEADER = "x-cron-trigger";

export function cronTriggerOf(req: NextRequest): CronTrigger {
  return req.headers.get(CRON_TRIGGER_HEADER)?.toLowerCase() === "manual" ? "MANUAL" : "SCHEDULED";
}

/** Same Bearer CRON_SECRET check every /api/cron/* route uses. Returns a response when refused. */
export function checkCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function start(jobId: string, trigger: CronTrigger): Promise<string | null> {
  try {
    const row = await prisma.cronJobRun.create({ data: { jobId, trigger, status: "RUNNING" }, select: { id: true } });
    return row.id;
  } catch (err) {
    console.warn(`[cron-run-log] could not record start of ${jobId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function finish(id: string | null, startedAt: number, data: { status: string; summary?: string; details?: unknown; error?: string }) {
  if (!id) return;
  try {
    await prisma.cronJobRun.update({
      where: { id },
      data: {
        status: data.status,
        summary: data.summary?.slice(0, 1000) ?? null,
        details: (data.details ?? undefined) as any,
        error: data.error?.slice(0, 2000) ?? null,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    console.warn(`[cron-run-log] could not record finish of run ${id}:`, err instanceof Error ? err.message : err);
  }
}

/** Run a job body with a CronJobRun row around it and turn the outcome into a JSON response. */
export async function runLoggedCronJob(
  jobId: string,
  req: NextRequest,
  body: (trigger: CronTrigger) => Promise<CronJobOutcome>,
): Promise<NextResponse> {
  const trigger = cronTriggerOf(req);
  const startedAt = Date.now();
  const runId = await start(jobId, trigger);
  try {
    const out = await body(trigger);
    const status = out.status ?? "SUCCESS";
    await finish(runId, startedAt, { status, summary: out.summary, details: out.details });
    return NextResponse.json(
      { ok: status !== "FAILED", status, summary: out.summary, ...(out.details ?? {}) },
      { status: out.httpStatus ?? (status === "FAILED" ? 500 : 200) },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${jobId}] failed:`, message);
    await finish(runId, startedAt, { status: "FAILED", summary: "Run failed", error: message });
    return NextResponse.json({ ok: false, status: "FAILED", error: message }, { status: 500 });
  }
}

export interface LastCronRun {
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  error: string | null;
}

/** Latest run per job id; {} when the table does not exist yet. */
export async function getLastCronRuns(jobIds: string[]): Promise<Record<string, LastCronRun>> {
  const out: Record<string, LastCronRun> = {};
  try {
    const rows = await Promise.all(
      jobIds.map((jobId) => prisma.cronJobRun.findFirst({ where: { jobId }, orderBy: { startedAt: "desc" } })),
    );
    for (const r of rows) {
      if (!r) continue;
      out[r.jobId] = {
        status: r.status,
        trigger: r.trigger,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        durationMs: r.durationMs,
        summary: r.summary,
        error: r.error,
      };
    }
  } catch {
    // CronJobRun not pushed yet — show "no runs recorded".
  }
  return out;
}

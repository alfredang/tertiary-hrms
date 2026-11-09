/**
 * QuickBooks liveness monitor. Runs daily from /api/cron/quickbooks-health and on demand
 * from the reconciliation page. Checks:
 *   1. the refresh token still exchanges for an access token (DIRECT mode; forces a refresh,
 *      which also keeps the 100-day refresh-token window rolling);
 *   2. a cheap authenticated call (CompanyInfo) and its latency;
 *   3. how many days are left on the refresh token.
 * Every check is stored in QuickBooksHealthCheck; admins are alerted on FAIL or when the
 * refresh token is close to expiry (at most once per status per ALERT_COOLDOWN_HOURS).
 */
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/webhooks";
import { escapeHtml, financeEmailShell, sendFinanceAlert } from "@/lib/finance-alerts";
import { QboAuthError, QboError, QuickBooksClient, redactSecrets, refreshTokenHorizon, type QboMode } from "./client";
import { createQuickBooksClient } from "./store";

export const REFRESH_EXPIRY_WARN_DAYS = 14;
export const SLOW_LATENCY_MS = 5_000;
export const ALERT_COOLDOWN_HOURS = 20;

export type HealthStatus = "OK" | "WARN" | "FAIL";

export interface HealthResult {
  status: HealthStatus;
  mode: QboMode | "UNCONFIGURED";
  tokenOk: boolean;
  apiOk: boolean;
  latencyMs: number | null;
  companyName: string | null;
  refreshTokenExpiresAt: string | null;
  daysToRefreshExpiry: number | null;
  refreshExpiryEstimated: boolean;
  message: string;
}

/** Pure part of the check, so it can be unit-tested with a fake client. */
export async function probeQuickBooks(client: QuickBooksClient, now: () => number = Date.now): Promise<HealthResult> {
  const result: HealthResult = {
    status: "FAIL",
    mode: "UNCONFIGURED",
    tokenOk: false,
    apiOk: false,
    latencyMs: null,
    companyName: null,
    refreshTokenExpiresAt: null,
    daysToRefreshExpiry: null,
    refreshExpiryEstimated: false,
    message: "",
  };
  const notes: string[] = [];

  let creds;
  try {
    creds = await client.getCreds();
  } catch (err) {
    result.message = err instanceof Error ? err.message : String(err);
    return result;
  }
  result.mode = creds.mode;

  if (creds.mode === "DIRECT") {
    try {
      await client.getAccessToken({ forceRefresh: true });
      result.tokenOk = true;
    } catch (err) {
      result.message = err instanceof QboAuthError ? err.message : `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`;
      return result;
    }
  } else if (!creds.proxyApiKey) {
    notes.push("QBO_PROXY_API_KEY is not set; the proxy may refuse machine calls.");
  }

  const t0 = now();
  try {
    const info = await client.companyInfo();
    result.apiOk = true;
    result.companyName = info.companyName;
    if (creds.mode === "PROXY") result.tokenOk = true; // the proxy authenticated on our behalf
  } catch (err) {
    result.latencyMs = now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    result.message = `CompanyInfo call failed: ${msg}`;
    if (err instanceof QboAuthError && creds.mode === "PROXY") result.tokenOk = false;
    return result;
  }
  result.latencyMs = now() - t0;

  // Refresh-token horizon (re-read creds: a forced refresh may have rotated it).
  if (creds.mode === "DIRECT") {
    const h = refreshTokenHorizon(creds, now());
    result.refreshTokenExpiresAt = h.expiresAt?.toISOString() ?? null;
    result.daysToRefreshExpiry = h.days;
    result.refreshExpiryEstimated = h.estimated;
  } else {
    notes.push("Token lifecycle is managed by the QuickBooks proxy (QUICKBOOKS_PROXY_URL).");
  }

  result.status = "OK";
  if (result.daysToRefreshExpiry !== null && result.daysToRefreshExpiry <= REFRESH_EXPIRY_WARN_DAYS) {
    result.status = "WARN";
    notes.unshift(
      result.daysToRefreshExpiry < 0
        ? "Refresh token has expired. Reconnect QuickBooks."
        : `Refresh token expires in ${result.daysToRefreshExpiry} day(s). Reconnect QuickBooks before then.`,
    );
  }
  if (result.latencyMs !== null && result.latencyMs > SLOW_LATENCY_MS) {
    if (result.status === "OK") result.status = "WARN";
    notes.push(`Slow response: ${result.latencyMs} ms.`);
  }
  result.message = notes.join(" ") || "QuickBooks reachable.";
  return result;
}

export interface StoredHealthCheck extends HealthResult {
  id: string | null;
  checkedAt: string;
  trigger: string;
  alerted: boolean;
}

/** Run the check, store it, alert if needed. Never throws. */
export async function runQuickBooksHealthCheck(opts: { trigger: "SCHEDULED" | "MANUAL" }): Promise<StoredHealthCheck> {
  let result: HealthResult;
  try {
    result = await probeQuickBooks(createQuickBooksClient());
  } catch (err) {
    result = {
      status: "FAIL",
      mode: "UNCONFIGURED",
      tokenOk: false,
      apiOk: false,
      latencyMs: null,
      companyName: null,
      refreshTokenExpiresAt: null,
      daysToRefreshExpiry: null,
      refreshExpiryEstimated: false,
      message: err instanceof QboError ? err.message : redactSecrets(String((err as Error)?.message ?? err)),
    };
  }
  result.message = redactSecrets(result.message);

  let alerted = false;
  if (result.status !== "OK" && (await shouldAlert(result.status))) {
    const link = `${getBaseUrl()}/accounting/reconciliation`;
    const title = result.status === "FAIL" ? "QuickBooks connection FAILED" : "QuickBooks needs attention";
    const rows = [
      ["Status", result.status],
      ["Mode", result.mode],
      ["Token", result.tokenOk ? "valid" : "not valid"],
      ["API (CompanyInfo)", result.apiOk ? `ok${result.companyName ? ` (${result.companyName})` : ""}` : "failed"],
      ["Latency", result.latencyMs !== null ? `${result.latencyMs} ms` : "—"],
      [
        "Refresh token expiry",
        result.refreshTokenExpiresAt
          ? `${result.refreshTokenExpiresAt.slice(0, 10)} (${result.daysToRefreshExpiry} days${result.refreshExpiryEstimated ? ", estimated" : ""})`
          : "unknown",
      ],
    ];
    const html = financeEmailShell(
      title,
      `<p>${escapeHtml(result.message)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
        .join("")}</table>
<p style="font-size:13px;color:#374151">To reconnect: Settings → Credentials → QuickBooks → Connect.</p>`,
      link,
    );
    const sent = await sendFinanceAlert({
      title,
      message: result.message,
      type: "QUICKBOOKS_HEALTH",
      link: "/accounting/reconciliation",
      emailSubject: `[HRMS] ${title}`,
      emailHtml: html,
    });
    alerted = sent.notified > 0 || sent.emailed;
  }

  const checkedAt = new Date();
  let id: string | null = null;
  try {
    const row = await prisma.quickBooksHealthCheck.create({
      data: {
        checkedAt,
        status: result.status,
        mode: result.mode,
        trigger: opts.trigger,
        tokenOk: result.tokenOk,
        apiOk: result.apiOk,
        latencyMs: result.latencyMs,
        companyName: result.companyName,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt ? new Date(result.refreshTokenExpiresAt) : null,
        daysToRefreshExpiry: result.daysToRefreshExpiry,
        message: result.message.slice(0, 1000),
        alerted,
      },
      select: { id: true },
    });
    id = row.id;
  } catch (err) {
    console.warn("[qbo-health] could not store health check:", err instanceof Error ? err.message : err);
  }

  return { ...result, id, checkedAt: checkedAt.toISOString(), trigger: opts.trigger, alerted };
}

async function shouldAlert(status: HealthStatus): Promise<boolean> {
  try {
    const recent = await prisma.quickBooksHealthCheck.findFirst({
      where: { alerted: true, status, checkedAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_HOURS * 3_600_000) } },
      select: { id: true },
    });
    return !recent;
  } catch {
    return true;
  }
}

export async function getHealthHistory(limit = 30) {
  try {
    const rows = await prisma.quickBooksHealthCheck.findMany({ orderBy: { checkedAt: "desc" }, take: limit });
    return rows.map((r) => ({
      id: r.id,
      checkedAt: r.checkedAt.toISOString(),
      status: r.status,
      mode: r.mode,
      trigger: r.trigger,
      tokenOk: r.tokenOk,
      apiOk: r.apiOk,
      latencyMs: r.latencyMs,
      companyName: r.companyName,
      refreshTokenExpiresAt: r.refreshTokenExpiresAt?.toISOString() ?? null,
      daysToRefreshExpiry: r.daysToRefreshExpiry,
      message: r.message,
      alerted: r.alerted,
    }));
  } catch {
    return [];
  }
}

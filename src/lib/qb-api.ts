import { prisma } from "@/lib/prisma";

const QBO_BASE_URL = process.env.QBO_BASE_URL || "https://quickbooks.api.intuit.com";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_MINOR_VERSION = "75";

export interface QBCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fallbackRefreshToken?: string;
  realmId: string;
}

// Module-level token cache — shared across all callers in the same server process
let cachedToken: { token: string; expiresAt: number } | null = null;
let inflightRefresh: Promise<string> | null = null;

// Proxy URL cache — read from DB (QUICKBOOKS_PROXY_URL), fall back to REFERENCE_PROJECT_URL env var
let cachedProxyUrl: { url: string | null; expiresAt: number } | null = null;

async function getProxyUrl(): Promise<string | null> {
  if (cachedProxyUrl && Date.now() < cachedProxyUrl.expiresAt) return cachedProxyUrl.url;
  try {
    const row = await prisma.companyCredential.findUnique({ where: { keyName: "QUICKBOOKS_PROXY_URL" } });
    const url = row?.keyValue?.trim() || process.env.REFERENCE_PROJECT_URL || null;
    cachedProxyUrl = { url, expiresAt: Date.now() + 5 * 60 * 1000 };
    return url;
  } catch {
    return process.env.REFERENCE_PROJECT_URL || null;
  }
}

export async function getQBCreds(): Promise<QBCreds | null> {
  // When reference project proxy is configured, only need realmId (used for qboBase fallback)
  // so return a stub that passes the null-check in callers
  if (await getProxyUrl()) {
    try {
      const rows = await prisma.companyCredential.findMany({
        where: { keyName: { in: ["QUICKBOOKS_REALM_ID", "QUICKBOOKS_REFRESH_TOKEN", "QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"] } },
      });
      const map: Record<string, string> = {};
      for (const r of rows) map[r.keyName] = r.keyValue;
      const realmId = map["QUICKBOOKS_REALM_ID"] || process.env.QBO_REALM_ID || "proxy";
      // Return minimal creds — token will not be used, proxy handles auth
      return {
        clientId: map["QUICKBOOKS_CLIENT_ID"] || "proxy",
        clientSecret: map["QUICKBOOKS_CLIENT_SECRET"] || "proxy",
        refreshToken: map["QUICKBOOKS_REFRESH_TOKEN"] || "proxy",
        realmId,
      };
    } catch {
      return { clientId: "proxy", clientSecret: "proxy", refreshToken: "proxy", realmId: "proxy" };
    }
  }

  // Direct QB mode: read full credentials from DB
  try {
    const rows = await prisma.companyCredential.findMany({
      where: {
        keyName: {
          in: [
            "QUICKBOOKS_CLIENT_ID",
            "QUICKBOOKS_CLIENT_SECRET",
            "QUICKBOOKS_REFRESH_TOKEN",
            "QUICKBOOKS_REALM_ID",
          ],
        },
      },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.keyName] = r.keyValue;

    const clientId = map["QUICKBOOKS_CLIENT_ID"];
    const clientSecret = map["QUICKBOOKS_CLIENT_SECRET"];
    const refreshToken = map["QUICKBOOKS_REFRESH_TOKEN"]?.trim();
    const realmId = map["QUICKBOOKS_REALM_ID"];

    if (clientId && clientSecret && refreshToken && realmId) {
      return { clientId, clientSecret, refreshToken, realmId };
    }
  } catch {
    // fall through to env vars
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const refreshToken = process.env.QBO_REFRESH_TOKEN;
  const realmId = process.env.QBO_REALM_ID;

  if (clientId && clientSecret && refreshToken && realmId) {
    return { clientId, clientSecret, refreshToken, realmId };
  }

  return null;
}

export async function getQBAccessToken(creds: QBCreds): Promise<string> {
  // When reference project proxy is configured, skip local token management entirely —
  // the proxy handles auth using the reference project's always-valid credentials.
  if (await getProxyUrl()) return "proxy";

  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

    const refreshOnce = async (refreshToken: string) => {
      const res = await fetch(QBO_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return { ok: res.ok, status: res.status, data, rawText: text };
    };

    let usedRefreshToken = creds.refreshToken;
    let r = await refreshOnce(usedRefreshToken);

    if (!r.ok && String(r.data?.error ?? "").toLowerCase() === "invalid_grant" && creds.fallbackRefreshToken) {
      usedRefreshToken = creds.fallbackRefreshToken;
      r = await refreshOnce(usedRefreshToken);
    }

    if (!r.ok) {
      throw new Error(`QB token refresh failed: ${r.status} — ${r.rawText.slice(0, 200)}`);
    }

    if (r.data.refresh_token && r.data.refresh_token !== usedRefreshToken) {
      const newToken: string = r.data.refresh_token;
      try {
        await prisma.companyCredential.upsert({
          where: { keyName: "QUICKBOOKS_REFRESH_TOKEN" },
          update: { keyValue: newToken },
          create: { keyName: "QUICKBOOKS_REFRESH_TOKEN", keyValue: newToken },
        });
      } catch {
        // ignore
      }
      pushTokenToReferenceProject(newToken);
    }

    cachedToken = {
      token: r.data.access_token,
      expiresAt: Date.now() + (r.data.expires_in ? r.data.expires_in * 1000 - 60_000 : 3_300_000),
    };
    return cachedToken.token;
  })();

  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

// Fire-and-forget: push the rotated token to the reference project's sync endpoint.
function pushTokenToReferenceProject(newToken: string): void {
  const secret = process.env.TOKEN_SYNC_SECRET;
  if (!secret) return;
  getProxyUrl().then((syncUrl) => {
    if (!syncUrl) return;
    fetch(`${syncUrl}/api/internal/sync-qb-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ refreshToken: newToken }),
    }).catch(() => {/* best-effort, never throw */});
  }).catch(() => {});
}

export function qboBase(realmId: string): string {
  return `${QBO_BASE_URL}/v3/company/${realmId}`;
}

/**
 * QBO often returns Message: "A business validation error has occurred..."
 * while the real reason is in Error[].Detail — surface both.
 */
export function formatQboFaultMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "QuickBooks returned an error with no details";
  const d = data as Record<string, unknown>;
  const fault = d.Fault as { Error?: Array<{ Message?: string; Detail?: string; code?: string }> } | undefined;
  const errors = fault?.Error;
  if (!Array.isArray(errors) || errors.length === 0) {
    return (d as { message?: string }).message || JSON.stringify(data).slice(0, 800);
  }
  return errors
    .map((e) => {
      const parts = [e.Message, e.Detail].filter(Boolean);
      if (e.code) parts.push(`(code ${e.code})`);
      return parts.join(" — ");
    })
    .join(" | ");
}

// Direct QB fetch — used when REFERENCE_PROJECT_URL is not configured
async function qboFetchJson(opts: {
  token: string;
  url: string;
  method?: string;
  body?: object;
}): Promise<any> {
  const res = await fetch(opts.url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(formatQboFaultMessage(data) || `QB error ${res.status}`);
  }
  if (data?.Fault?.Error?.length) {
    throw new Error(formatQboFaultMessage(data));
  }
  return data;
}

export async function qbQuery(base: string, token: string, query: string): Promise<any> {
  const refUrl = await getProxyUrl();
  if (refUrl) {
    // Extract entity name from "SELECT * FROM EntityName WHERE..." for the proxy
    const entity = (query.match(/FROM\s+(\w+)/i)?.[1] ?? "invoice").toLowerCase();
    const res = await fetch(`${refUrl}/api/quickbooks/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "query", entity, query }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.error ?? `QB proxy error ${res.status}`);
    }
    return json.data;
  }
  const url = `${base}/query?query=${encodeURIComponent(query)}&minorversion=${QBO_MINOR_VERSION}`;
  return qboFetchJson({ token, url });
}

export async function qbCreate(base: string, token: string, entity: string, body: object): Promise<any> {
  const refUrl = await getProxyUrl();
  if (refUrl) {
    const res = await fetch(`${refUrl}/api/quickbooks/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", entity, body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      const details = json?.details;
      const errMsg = details ? formatQboFaultMessage(details) : (json?.error ?? `QB proxy error ${res.status}`);
      throw new Error(errMsg);
    }
    return json.data;
  }
  const url = `${base}/${entity}?minorversion=${QBO_MINOR_VERSION}`;
  return qboFetchJson({ token, url, method: "POST", body });
}

export const PAYMENT_METHOD_KEYWORDS: Record<string, string[]> = {
  CC:                        ["Credit Card", "Visa", "Master", "Amex", "AMEX"],
  "Credit Card":             ["Credit Card", "Visa", "Master", "Amex", "AMEX"],
  PayNow:                    ["PayNow", "Pay Now", "Bank Transfer", "FAST"],
  GIRO:                      ["GIRO", "Bank Transfer", "EFT"],
  "Bank Transfer":           ["Bank Transfer", "FAST", "EFT", "Electronic"],
  Cash:                      ["Cash"],
  Cheque:                    ["Cheque", "Check", "POSB"],
  Check:                     ["Cheque", "Check", "POSB"],
  "DBS Business Debit Card": ["DBS Business", "DBS Debit", "Debit Card", "DBS"],
  Stripe:                    ["Stripe", "Online", "Credit Card"],
};

export function findPaymentMethod(methods: any[], hrmsType: string): any | null {
  const keywords = PAYMENT_METHOD_KEYWORDS[hrmsType] ?? [hrmsType];
  for (const kw of keywords) {
    const found = methods.find((m: any) =>
      String(m.Name ?? "").toLowerCase().includes(kw.toLowerCase()),
    );
    if (found) return found;
  }
  return null;
}

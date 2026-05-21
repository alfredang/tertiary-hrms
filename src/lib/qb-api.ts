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

export async function getQBCreds(): Promise<QBCreds | null> {
  // Try DB first (HRMS CompanyCredential table)
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
    // ignore, fall through to env vars
  }

  // Fall back to environment variables (same names as reference project)
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

    // On invalid_grant, retry with fallback token (matches reference project behaviour)
    if (!r.ok && String(r.data?.error ?? "").toLowerCase() === "invalid_grant" && creds.fallbackRefreshToken) {
      usedRefreshToken = creds.fallbackRefreshToken;
      r = await refreshOnce(usedRefreshToken);
    }

    if (!r.ok) {
      throw new Error(`QB token refresh failed: ${r.status} — ${r.rawText.slice(0, 200)}`);
    }

    // Persist rotated refresh token back to DB (best-effort)
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
      // Push the new token to the reference project so both apps stay in sync
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
// Requires TOKEN_SYNC_SECRET and REFERENCE_PROJECT_URL env vars on the HRMS server.
function pushTokenToReferenceProject(newToken: string): void {
  const syncUrl = process.env.REFERENCE_PROJECT_URL;
  const secret = process.env.TOKEN_SYNC_SECRET;
  if (!syncUrl || !secret) return;
  fetch(`${syncUrl}/api/internal/sync-qb-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ refreshToken: newToken }),
  }).catch(() => {/* best-effort, never throw */});
}

export function qboBase(realmId: string): string {
  return `${QBO_BASE_URL}/v3/company/${realmId}`;
}

export async function qbQuery(base: string, token: string, query: string): Promise<any> {
  const url = `${base}/query?query=${encodeURIComponent(query)}&minorversion=${QBO_MINOR_VERSION}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`QB query failed ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function qbCreate(base: string, token: string, entity: string, body: object): Promise<any> {
  const url = `${base}/${entity}?minorversion=${QBO_MINOR_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `QB error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      msg = parsed?.Fault?.Error?.[0]?.Message ?? msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
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

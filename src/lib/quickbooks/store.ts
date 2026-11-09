import { prisma } from "@/lib/prisma";
import {
  QuickBooksClient,
  type QboClientOptions,
  type QboCredentialStore,
  type QboEnvironment,
  type QboStoredCreds,
} from "./client";

/** Credential keys (CompanyCredential.keyName) the QuickBooks integration reads. */
export const QB_KEYS = {
  clientId: "QUICKBOOKS_CLIENT_ID",
  clientSecret: "QUICKBOOKS_CLIENT_SECRET",
  refreshToken: "QUICKBOOKS_REFRESH_TOKEN",
  realmId: "QUICKBOOKS_REALM_ID",
  proxyUrl: "QUICKBOOKS_PROXY_URL",
  environment: "QUICKBOOKS_ENVIRONMENT",
  refreshTokenExpiresAt: "QUICKBOOKS_REFRESH_TOKEN_EXPIRES_AT",
} as const;

function parseEnvironment(v: string | undefined | null): QboEnvironment {
  return String(v ?? "").trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

/**
 * Loads QuickBooks credentials from CompanyCredential (env vars as fallback), same
 * precedence as src/lib/qb-api.ts so both paths always talk to the same company.
 */
export const prismaQboStore: QboCredentialStore = {
  async load(): Promise<QboStoredCreds | null> {
    const rows = await prisma.companyCredential.findMany({
      where: { keyName: { in: Object.values(QB_KEYS) } },
      select: { keyName: true, keyValue: true, updatedAt: true },
    });
    const map = new Map(rows.map((r) => [r.keyName, r]));
    const val = (k: string) => map.get(k)?.keyValue?.trim() || undefined;

    const proxyUrl = val(QB_KEYS.proxyUrl) || process.env.REFERENCE_PROJECT_URL || null;
    const environment = parseEnvironment(val(QB_KEYS.environment) ?? process.env.QBO_ENVIRONMENT);
    const baseUrlOverride = process.env.QBO_BASE_URL || null;
    const expiresRaw = val(QB_KEYS.refreshTokenExpiresAt);
    const refreshTokenExpiresAt = expiresRaw && !isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw) : null;

    if (proxyUrl) {
      return {
        mode: "PROXY",
        environment,
        realmId: val(QB_KEYS.realmId) || process.env.QBO_REALM_ID || "proxy",
        proxyUrl,
        proxyApiKey: process.env.QBO_PROXY_API_KEY || null,
        baseUrlOverride,
        refreshTokenExpiresAt,
        refreshTokenUpdatedAt: map.get(QB_KEYS.refreshToken)?.updatedAt ?? null,
      };
    }

    const clientId = val(QB_KEYS.clientId) || process.env.QBO_CLIENT_ID;
    const clientSecret = val(QB_KEYS.clientSecret) || process.env.QBO_CLIENT_SECRET;
    const refreshToken = val(QB_KEYS.refreshToken) || process.env.QBO_REFRESH_TOKEN;
    const realmId = val(QB_KEYS.realmId) || process.env.QBO_REALM_ID;
    if (!clientId || !clientSecret || !refreshToken || !realmId) return null;

    return {
      mode: "DIRECT",
      environment,
      realmId,
      clientId,
      clientSecret,
      refreshToken,
      refreshTokenExpiresAt,
      refreshTokenUpdatedAt: map.get(QB_KEYS.refreshToken)?.updatedAt ?? null,
      baseUrlOverride,
    };
  },

  async saveRefreshToken(refreshToken: string, expiresAt: Date | null): Promise<void> {
    await prisma.companyCredential.upsert({
      where: { keyName: QB_KEYS.refreshToken },
      update: { keyValue: refreshToken },
      create: { keyName: QB_KEYS.refreshToken, keyValue: refreshToken },
    });
    if (expiresAt) await prismaQboStore.saveRefreshTokenExpiry(expiresAt);
  },

  async saveRefreshTokenExpiry(expiresAt: Date): Promise<void> {
    await prisma.companyCredential.upsert({
      where: { keyName: QB_KEYS.refreshTokenExpiresAt },
      update: { keyValue: expiresAt.toISOString() },
      create: { keyName: QB_KEYS.refreshTokenExpiresAt, keyValue: expiresAt.toISOString() },
    });
  },
};

/** A read-only QuickBooks client bound to the company's stored credentials. */
export function createQuickBooksClient(opts: Partial<QboClientOptions> = {}): QuickBooksClient {
  return new QuickBooksClient({ store: prismaQboStore, ...opts });
}

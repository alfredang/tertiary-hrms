/**
 * Read-only QuickBooks Online (QBO) API client.
 *
 * - OAuth2: access tokens come from the refresh token stored in CompanyCredential
 *   (QUICKBOOKS_REFRESH_TOKEN). A rotated refresh token is persisted straight away,
 *   together with its expiry (QUICKBOOKS_REFRESH_TOKEN_EXPIRES_AT) so the liveness
 *   monitor can warn before the ~100-day refresh-token lifetime runs out.
 * - Two transport modes, mirroring src/lib/qb-api.ts:
 *     DIRECT: talk to Intuit with our own client id/secret + refresh token.
 *     PROXY:  QUICKBOOKS_PROXY_URL is set; queries go through the reference project's
 *             /api/quickbooks/proxy, which owns the token. Only `query`/`read` are sent.
 * - Sandbox vs production base URL via QUICKBOOKS_ENVIRONMENT (credential) or
 *   QBO_ENVIRONMENT (env); QBO_BASE_URL still overrides both.
 * - Retries 429 / 5xx / network errors with exponential backoff (honours Retry-After).
 *   A 401 drops the cached access token and refreshes once.
 * - READ-ONLY by construction: the only HTTP verb sent to the accounting API is GET,
 *   and the proxy is only ever asked for `query` or `read`. There is no create/update/
 *   delete/void/send method on this client. The one POST is the OAuth token exchange.
 * - Tokens are never logged and are scrubbed from every error message.
 */
/** Keep in step with QBO_MINOR_VERSION in src/lib/qb-api.ts (75 is the current floor). */
export const QBO_MINOR_VERSION = "75";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_PRODUCTION_BASE = "https://quickbooks.api.intuit.com";
export const QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com";
/** Intuit's documented refresh-token lifetime, used when the expiry was never recorded. */
export const REFRESH_TOKEN_LIFETIME_DAYS = 100;
/** QBO caps MAXRESULTS at 1000. */
export const QBO_PAGE_SIZE = 1000;

export type QboMode = "DIRECT" | "PROXY";
export type QboEnvironment = "production" | "sandbox";

export interface QboStoredCreds {
  mode: QboMode;
  environment: QboEnvironment;
  realmId: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** When the stored refresh token expires (recorded at refresh time), if known. */
  refreshTokenExpiresAt?: Date | null;
  /** When the stored refresh token row was last written (fallback for the expiry estimate). */
  refreshTokenUpdatedAt?: Date | null;
  proxyUrl?: string | null;
  proxyApiKey?: string | null;
  /** Explicit base URL override (QBO_BASE_URL). */
  baseUrlOverride?: string | null;
}

export interface QboCredentialStore {
  load(): Promise<QboStoredCreds | null>;
  saveRefreshToken(refreshToken: string, expiresAt: Date | null): Promise<void>;
  saveRefreshTokenExpiry(expiresAt: Date): Promise<void>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface QboClientOptions {
  store: QboCredentialStore;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxRetries?: number;
  baseBackoffMs?: number;
  minorVersion?: string;
  timeoutMs?: number;
}

export class QboError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(redactSecrets(message));
    this.name = "QboError";
  }
}

/** Refresh token rejected (expired / revoked): an admin must reconnect QuickBooks. */
export class QboAuthError extends QboError {
  constructor(message: string, status?: number, code?: string) {
    super(message, status, code);
    this.name = "QboAuthError";
  }
}

/**
 * Remove anything that looks like a credential from text that may end up in logs,
 * the DB or an email. OAuth tokens, bearer headers and basic-auth blobs are long
 * opaque strings; plain words, ids and amounts are left alone.
 */
export function redactSecrets(text: string): string {
  return String(text ?? "")
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/("?(?:access_token|refresh_token|id_token|client_secret)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, "$1[redacted]")
    .replace(/\b(?:eyJ|AB11|RT1-)[A-Za-z0-9._~+/=-]{12,}/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted]");
}

export function resolveBaseUrl(creds: Pick<QboStoredCreds, "environment" | "baseUrlOverride">): string {
  if (creds.baseUrlOverride) return creds.baseUrlOverride.replace(/\/$/, "");
  return creds.environment === "sandbox" ? QBO_SANDBOX_BASE : QBO_PRODUCTION_BASE;
}

/** Days until the refresh token expires (negative once expired), or null if unknowable. */
export function refreshTokenHorizon(
  creds: Pick<QboStoredCreds, "refreshTokenExpiresAt" | "refreshTokenUpdatedAt">,
  nowMs: number,
): { expiresAt: Date | null; days: number | null; estimated: boolean } {
  let expiresAt = creds.refreshTokenExpiresAt ?? null;
  let estimated = false;
  if (!expiresAt && creds.refreshTokenUpdatedAt) {
    expiresAt = new Date(creds.refreshTokenUpdatedAt.getTime() + REFRESH_TOKEN_LIFETIME_DAYS * 86_400_000);
    estimated = true;
  }
  if (!expiresAt) return { expiresAt: null, days: null, estimated };
  return { expiresAt, days: Math.floor((expiresAt.getTime() - nowMs) / 86_400_000), estimated };
}

interface CachedToken {
  token: string;
  expiresAt: number;
  key: string;
}

// Module-level cache so every caller in this server process shares one access token.
let sharedToken: CachedToken | null = null;
let sharedInflight: Promise<string> | null = null;

/** Test hook: forget the shared access token. */
export function __resetQboTokenCache(): void {
  sharedToken = null;
  sharedInflight = null;
}

export class QuickBooksClient {
  private readonly store: QboCredentialStore;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly minorVersion: string;
  private readonly timeoutMs: number;
  private credsPromise: Promise<QboStoredCreds | null> | null = null;

  constructor(opts: QboClientOptions) {
    this.store = opts.store;
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.minorVersion = opts.minorVersion ?? QBO_MINOR_VERSION;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async getCreds(): Promise<QboStoredCreds> {
    if (!this.credsPromise) this.credsPromise = this.store.load();
    const creds = await this.credsPromise;
    if (!creds) {
      this.credsPromise = null;
      throw new QboError("QuickBooks is not configured. Add the credentials in Settings → Credentials.", undefined, "not_configured");
    }
    return creds;
  }

  async getMode(): Promise<QboMode> {
    return (await this.getCreds()).mode;
  }

  /**
   * Returns a valid access token (DIRECT mode only), refreshing when needed.
   * `forceRefresh` exchanges the refresh token even if a cached token is still valid;
   * the liveness monitor uses it to prove the refresh token itself still works.
   */
  async getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
    const creds = await this.getCreds();
    if (creds.mode !== "DIRECT") throw new QboError("Access tokens are managed by the QuickBooks proxy in PROXY mode");
    const key = `${creds.realmId}:${creds.clientId}`;
    if (!opts.forceRefresh && sharedToken && sharedToken.key === key && this.now() < sharedToken.expiresAt) {
      return sharedToken.token;
    }
    if (sharedInflight) return sharedInflight;
    sharedInflight = this.refresh(creds, key);
    try {
      return await sharedInflight;
    } finally {
      sharedInflight = null;
    }
  }

  private async refresh(creds: QboStoredCreds, key: string): Promise<string> {
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
      throw new QboAuthError("QuickBooks client id, client secret or refresh token is missing", undefined, "not_configured");
    }
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    let res: Response;
    try {
      res = await this.fetchImpl(QBO_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(creds.refreshToken)}`,
      });
    } catch (err) {
      throw new QboError(`QuickBooks token endpoint unreachable: ${errMessage(err)}`, undefined, "network");
    }
    const text = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok || !data?.access_token) {
      const code = String(data?.error ?? "").toLowerCase() || undefined;
      const desc = data?.error_description ? ` (${data.error_description})` : "";
      if (code === "invalid_grant" || res.status === 400 || res.status === 401) {
        throw new QboAuthError(
          `QuickBooks refresh token rejected: ${code ?? res.status}${desc}. Reconnect QuickBooks in Settings → Credentials.`,
          res.status,
          code ?? "invalid_grant",
        );
      }
      throw new QboError(`QuickBooks token refresh failed with HTTP ${res.status}${desc}`, res.status, code);
    }

    const refreshExpiresAt =
      typeof data.x_refresh_token_expires_in === "number"
        ? new Date(this.now() + data.x_refresh_token_expires_in * 1000)
        : null;
    const newRefresh: string | undefined = data.refresh_token;
    try {
      if (newRefresh && newRefresh !== creds.refreshToken) {
        await this.store.saveRefreshToken(newRefresh, refreshExpiresAt);
        creds.refreshToken = newRefresh;
        creds.refreshTokenUpdatedAt = new Date(this.now());
      } else if (refreshExpiresAt) {
        await this.store.saveRefreshTokenExpiry(refreshExpiresAt);
      }
      if (refreshExpiresAt) creds.refreshTokenExpiresAt = refreshExpiresAt;
    } catch (err) {
      // Persisting must never leak the token; surface a generic message.
      console.error("[qbo-client] failed to persist rotated refresh token:", redactSecrets(errMessage(err)));
    }

    const ttlMs = typeof data.expires_in === "number" ? data.expires_in * 1000 : 3_600_000;
    sharedToken = { token: data.access_token, expiresAt: this.now() + ttlMs - 60_000, key };
    return data.access_token;
  }

  /** GET a path under /v3/company/{realmId}. DIRECT mode only. */
  private async directGet(path: string, params: Record<string, string> = {}): Promise<any> {
    const creds = await this.getCreds();
    const base = `${resolveBaseUrl(creds)}/v3/company/${encodeURIComponent(creds.realmId)}`;
    const qs = new URLSearchParams({ ...params, minorversion: this.minorVersion });
    const url = `${base}${path}?${qs.toString()}`;
    let reauthed = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.getAccessToken();
      let res: Response | null = null;
      let networkErr: unknown = null;
      try {
        res = await this.withTimeout(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
      } catch (err) {
        networkErr = err;
      }

      if (res && res.status === 401 && !reauthed) {
        // Access token revoked/expired early: drop it and refresh once.
        sharedToken = null;
        reauthed = true;
        continue;
      }
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.Fault?.Error?.length) throw new QboError(formatFault(data), res.status, "fault");
        return data;
      }
      const retryable = networkErr !== null || (res !== null && (res.status === 429 || res.status >= 500));
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.backoffMs(attempt, res));
        continue;
      }
      if (networkErr) throw new QboError(`QuickBooks API unreachable: ${errMessage(networkErr)}`, undefined, "network");
      const body = await res!.json().catch(() => null);
      if (res!.status === 401) throw new QboAuthError(`QuickBooks rejected the access token (401). ${formatFault(body)}`, 401, "unauthorized");
      throw new QboError(`QuickBooks API error ${res!.status}: ${formatFault(body)}`, res!.status, res!.status === 429 ? "rate_limited" : undefined);
    }
  }

  /** Read-only proxy call. Only `query` and `read` actions are ever sent. */
  private async proxyCall(payload: { action: "query" | "read"; entity: string; query?: string; id?: string }): Promise<any> {
    const creds = await this.getCreds();
    const url = `${String(creds.proxyUrl).replace(/\/$/, "")}/api/quickbooks/proxy`;
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (creds.proxyApiKey) headers["x-api-key"] = creds.proxyApiKey;

    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      let networkErr: unknown = null;
      try {
        res = await this.withTimeout(url, { method: "POST", headers, body: JSON.stringify(payload) });
      } catch (err) {
        networkErr = err;
      }
      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        if (!json?.success) throw new QboError(`QuickBooks proxy error: ${json?.error ?? "unknown"}`, res.status, "proxy");
        return json.data;
      }
      const retryable = networkErr !== null || (res !== null && (res.status === 429 || res.status >= 500));
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.backoffMs(attempt, res));
        continue;
      }
      if (networkErr) throw new QboError(`QuickBooks proxy unreachable: ${errMessage(networkErr)}`, undefined, "network");
      const json = await res!.json().catch(() => null);
      const msg = json?.error ?? `HTTP ${res!.status}`;
      if (res!.status === 401 || res!.status === 403) {
        throw new QboAuthError(`QuickBooks proxy refused the request (${res!.status}): ${msg}. Check QBO_PROXY_API_KEY.`, res!.status, "proxy_auth");
      }
      throw new QboError(`QuickBooks proxy error ${res!.status}: ${msg}`, res!.status, "proxy");
    }
  }

  private async withTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      return await this.fetchImpl(url, { ...init, signal: controller?.signal });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private backoffMs(attempt: number, res: Response | null): number {
    const retryAfter = res?.headers?.get?.("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 60_000);
    }
    return Math.min(this.baseBackoffMs * 2 ** attempt, 15_000);
  }

  // ── Public read-only API ────────────────────────────────────────────────

  /** Run one QBO SQL-like query and return the raw QueryResponse. */
  async query(sql: string): Promise<any> {
    assertSelect(sql);
    const creds = await this.getCreds();
    if (creds.mode === "PROXY") {
      const entity = (sql.match(/FROM\s+(\w+)/i)?.[1] ?? "").toLowerCase();
      const data = await this.proxyCall({ action: "query", entity, query: sql });
      return data?.QueryResponse ?? {};
    }
    const data = await this.directGet("/query", { query: sql });
    return data?.QueryResponse ?? {};
  }

  /**
   * Query every row of `entity` matching `where`, paging with STARTPOSITION.
   * `where` is the clause body without the WHERE keyword (or empty).
   */
  async queryAll<T = any>(entity: string, where = "", opts: { maxRows?: number } = {}): Promise<T[]> {
    if (!/^[A-Za-z]+$/.test(entity)) throw new QboError(`Invalid QBO entity name: ${entity}`);
    const maxRows = opts.maxRows ?? 20_000;
    const out: T[] = [];
    for (let start = 1; out.length < maxRows; start += QBO_PAGE_SIZE) {
      const sql = `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ""} STARTPOSITION ${start} MAXRESULTS ${QBO_PAGE_SIZE}`;
      const resp = await this.query(sql);
      const rows: T[] = resp?.[entity] ?? [];
      out.push(...rows);
      if (rows.length < QBO_PAGE_SIZE) break;
    }
    return out;
  }

  /** Read one entity by id. */
  async read(entity: string, id: string): Promise<any> {
    if (!/^[A-Za-z]+$/.test(entity)) throw new QboError(`Invalid QBO entity name: ${entity}`);
    const creds = await this.getCreds();
    if (creds.mode === "PROXY") return this.proxyCall({ action: "read", entity: entity.toLowerCase(), id });
    return this.directGet(`/${entity.toLowerCase()}/${encodeURIComponent(id)}`);
  }

  /** Cheapest authenticated call: the company's own CompanyInfo record. */
  async companyInfo(): Promise<{ companyName: string | null; raw: any }> {
    const creds = await this.getCreds();
    if (creds.mode === "PROXY") {
      const resp = await this.query("SELECT * FROM CompanyInfo");
      const info = resp?.CompanyInfo?.[0] ?? null;
      return { companyName: info?.CompanyName ?? info?.LegalName ?? null, raw: info };
    }
    const data = await this.directGet(`/companyinfo/${encodeURIComponent(creds.realmId)}`);
    const info = data?.CompanyInfo ?? null;
    return { companyName: info?.CompanyName ?? info?.LegalName ?? null, raw: info };
  }
}

function assertSelect(sql: string): void {
  if (!/^\s*SELECT\s/i.test(sql)) throw new QboError("Only SELECT queries are allowed on the read-only QuickBooks client");
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "request timed out" : err.message;
  return String(err);
}

export function formatFault(data: unknown): string {
  const errors = (data as any)?.Fault?.Error;
  if (!Array.isArray(errors) || errors.length === 0) {
    const s = data ? JSON.stringify(data).slice(0, 300) : "no details";
    return redactSecrets(s);
  }
  return redactSecrets(
    errors
      .map((e: any) => [e.Message, e.Detail, e.code ? `(code ${e.code})` : ""].filter(Boolean).join(" — "))
      .join(" | "),
  );
}

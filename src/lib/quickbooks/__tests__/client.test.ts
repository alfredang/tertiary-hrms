import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  QuickBooksClient,
  QboAuthError,
  QBO_PRODUCTION_BASE,
  QBO_SANDBOX_BASE,
  QBO_TOKEN_URL,
  __resetQboTokenCache,
  redactSecrets,
  refreshTokenHorizon,
  resolveBaseUrl,
  type QboCredentialStore,
  type QboStoredCreds,
} from "@/lib/quickbooks/client";
import { probeQuickBooks } from "@/lib/quickbooks/health";

// health.ts pulls these in for the stored/alerting path; the probe under test does not use them.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/send-email", () => ({ sendEmail: vi.fn() }));

const NOW = Date.UTC(2026, 10, 9, 0, 0, 0);

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function memoryStore(init: Partial<QboStoredCreds> = {}) {
  const saved: { refreshToken?: string; expiresAt?: Date | null; expiryOnly?: Date } = {};
  const creds: QboStoredCreds = {
    mode: "DIRECT",
    environment: "production",
    realmId: "9130000000000000",
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "RT-old",
    refreshTokenUpdatedAt: new Date(NOW - 10 * 86_400_000),
    ...init,
  };
  const store: QboCredentialStore = {
    load: vi.fn(async () => ({ ...creds })),
    saveRefreshToken: vi.fn(async (t, e) => {
      saved.refreshToken = t;
      saved.expiresAt = e;
    }),
    saveRefreshTokenExpiry: vi.fn(async (e) => {
      saved.expiryOnly = e;
    }),
  };
  return { store, saved };
}

type Call = { url: string; init?: RequestInit };
function fakeFetch(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return handler(call, calls.length);
  });
  return { fn, calls };
}

const tokenOk = (o: Record<string, unknown> = {}) =>
  json(200, { access_token: "AT-1", expires_in: 3600, refresh_token: "RT-old", x_refresh_token_expires_in: 8_640_000, token_type: "bearer", ...o });

function client(store: QboCredentialStore, fetchFn: any, extra: Record<string, unknown> = {}) {
  return new QuickBooksClient({ store, fetch: fetchFn, sleep: async () => {}, now: () => NOW, ...extra });
}

beforeEach(() => __resetQboTokenCache());

describe("token refresh", () => {
  it("exchanges the refresh token with Basic auth and caches the access token", async () => {
    const { store } = memoryStore();
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk() : json(200, { QueryResponse: { Account: [] } })));
    const c = client(store, f.fn);
    expect(await c.getAccessToken()).toBe("AT-1");
    expect(await c.getAccessToken()).toBe("AT-1");
    const tokenCalls = f.calls.filter((x) => x.url === QBO_TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);
    const h = tokenCalls[0].init!.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    expect(String(tokenCalls[0].init!.body)).toBe("grant_type=refresh_token&refresh_token=RT-old");
  });

  it("persists a rotated refresh token together with its expiry", async () => {
    const { store, saved } = memoryStore();
    const f = fakeFetch(() => tokenOk({ refresh_token: "RT-new" }));
    await client(store, f.fn).getAccessToken();
    expect(saved.refreshToken).toBe("RT-new");
    expect(saved.expiresAt!.toISOString()).toBe(new Date(NOW + 8_640_000_000).toISOString()); // 100 days
  });

  it("records the expiry even when the refresh token did not rotate", async () => {
    const { store, saved } = memoryStore();
    await client(store, fakeFetch(() => tokenOk()).fn).getAccessToken();
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
    expect(saved.expiryOnly!.getTime()).toBe(NOW + 8_640_000_000);
  });

  it("deduplicates concurrent refreshes", async () => {
    const { store } = memoryStore();
    const f = fakeFetch(() => tokenOk());
    const c = client(store, f.fn);
    const [a, b] = await Promise.all([c.getAccessToken(), c.getAccessToken({ forceRefresh: true })]);
    expect(a).toBe("AT-1");
    expect(b).toBe("AT-1");
    expect(f.calls.filter((x) => x.url === QBO_TOKEN_URL)).toHaveLength(1);
  });

  it("forceRefresh exchanges again even with a cached token", async () => {
    const { store } = memoryStore();
    const f = fakeFetch(() => tokenOk());
    const c = client(store, f.fn);
    await c.getAccessToken();
    await c.getAccessToken({ forceRefresh: true });
    expect(f.calls.filter((x) => x.url === QBO_TOKEN_URL)).toHaveLength(2);
  });

  it("throws QboAuthError on invalid_grant without leaking the token", async () => {
    const { store } = memoryStore({ refreshToken: "AB11supersecretrefreshtokenvalue1234567890" });
    const f = fakeFetch(() => json(400, { error: "invalid_grant", error_description: "Incorrect Token type or clientID" }));
    const err = await client(store, f.fn).getAccessToken().catch((e) => e);
    expect(err).toBeInstanceOf(QboAuthError);
    expect(err.code).toBe("invalid_grant");
    expect(err.message).not.toContain("supersecret");
    expect(err.message).toMatch(/Reconnect QuickBooks/);
  });
});

describe("API calls", () => {
  it("sends GET with bearer token, minorversion and the production base URL", async () => {
    const { store } = memoryStore();
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk() : json(200, { QueryResponse: { Purchase: [{ Id: "1" }] } })));
    const rows = await client(store, f.fn).queryAll("Purchase", "TxnDate >= '2026-11-01'");
    expect(rows).toEqual([{ Id: "1" }]);
    const api = f.calls.find((x) => x.url !== QBO_TOKEN_URL)!;
    expect(api.url.startsWith(`${QBO_PRODUCTION_BASE}/v3/company/9130000000000000/query?`)).toBe(true);
    expect(api.url).toContain("minorversion=75");
    expect(decodeURIComponent(api.url.replace(/\+/g, " "))).toContain("SELECT * FROM Purchase WHERE TxnDate >= '2026-11-01' STARTPOSITION 1 MAXRESULTS 1000");
    expect(api.init!.method).toBe("GET");
    expect((api.init!.headers as Record<string, string>).Authorization).toBe("Bearer AT-1");
  });

  it("uses the sandbox base URL when configured", async () => {
    expect(resolveBaseUrl({ environment: "sandbox" })).toBe(QBO_SANDBOX_BASE);
    expect(resolveBaseUrl({ environment: "production", baseUrlOverride: "https://x.test/" })).toBe("https://x.test");
    const { store } = memoryStore({ environment: "sandbox" });
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk() : json(200, { CompanyInfo: { CompanyName: "Sandbox Co" } })));
    const info = await client(store, f.fn).companyInfo();
    expect(info.companyName).toBe("Sandbox Co");
    expect(f.calls[1].url.startsWith(`${QBO_SANDBOX_BASE}/v3/company/9130000000000000/companyinfo/9130000000000000?`)).toBe(true);
  });

  it("pages through results with STARTPOSITION", async () => {
    const { store } = memoryStore();
    const page = (n: number, start: number) => Array.from({ length: n }, (_, i) => ({ Id: String(start + i) }));
    const f = fakeFetch((c) => {
      if (c.url === QBO_TOKEN_URL) return tokenOk();
      const q = decodeURIComponent(c.url.replace(/\+/g, " "));
      return json(200, { QueryResponse: { Deposit: q.includes("STARTPOSITION 1 ") ? page(1000, 1) : page(3, 1001) } });
    });
    const rows = await client(store, f.fn).queryAll("Deposit");
    expect(rows).toHaveLength(1003);
    expect(f.calls.filter((x) => x.url !== QBO_TOKEN_URL)).toHaveLength(2);
  });

  it("retries 429 honouring Retry-After, then succeeds", async () => {
    const { store } = memoryStore();
    const sleeps: number[] = [];
    let apiCalls = 0;
    const f = fakeFetch((c) => {
      if (c.url === QBO_TOKEN_URL) return tokenOk();
      apiCalls++;
      return apiCalls < 3 ? json(429, { Fault: { Error: [{ Message: "Throttled" }] } }, { "retry-after": "2" }) : json(200, { QueryResponse: {} });
    });
    const c = new QuickBooksClient({ store, fetch: f.fn as any, now: () => NOW, sleep: async (ms) => void sleeps.push(ms) });
    await c.query("SELECT * FROM Account");
    expect(apiCalls).toBe(3);
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("backs off exponentially on 5xx and gives up after maxRetries", async () => {
    const { store } = memoryStore();
    const sleeps: number[] = [];
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk() : json(503, {})));
    const c = new QuickBooksClient({ store, fetch: f.fn as any, now: () => NOW, maxRetries: 3, baseBackoffMs: 100, sleep: async (ms) => void sleeps.push(ms) });
    await expect(c.query("SELECT * FROM Account")).rejects.toThrow(/503/);
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    const { store } = memoryStore();
    let tokens = 0;
    const f = fakeFetch((c) => {
      if (c.url === QBO_TOKEN_URL) return tokenOk({ access_token: `AT-${++tokens}` });
      const auth = (c.init!.headers as Record<string, string>).Authorization;
      return auth === "Bearer AT-1" ? json(401, { fault: "AuthenticationFailed" }) : json(200, { QueryResponse: { Account: [] } });
    });
    await client(store, f.fn).query("SELECT * FROM Account");
    expect(tokens).toBe(2);
  });

  it("is read-only: refuses non-SELECT queries and only ever sends GET to the API", async () => {
    const { store } = memoryStore();
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk() : json(200, { QueryResponse: {} })));
    const c = client(store, f.fn);
    await expect(c.query("DELETE FROM Purchase")).rejects.toThrow(/Only SELECT/);
    await c.query("SELECT * FROM Account");
    await c.read("Purchase", "5");
    await c.companyInfo();
    for (const call of f.calls) {
      if (call.url === QBO_TOKEN_URL) expect(call.init!.method).toBe("POST");
      else expect(call.init!.method).toBe("GET");
    }
    const proto = Object.getOwnPropertyNames(QuickBooksClient.prototype);
    for (const m of ["create", "update", "delete", "void", "send"]) expect(proto).not.toContain(m);
  });
});

describe("proxy mode", () => {
  it("routes queries through the proxy with only query/read actions and the api key", async () => {
    const { store } = memoryStore({ mode: "PROXY", proxyUrl: "https://ref.example/", proxyApiKey: "k-123" });
    const f = fakeFetch(() => json(200, { success: true, data: { QueryResponse: { CompanyInfo: [{ CompanyName: "Tertiary" }] } } }));
    const info = await client(store, f.fn).companyInfo();
    expect(info.companyName).toBe("Tertiary");
    expect(f.calls[0].url).toBe("https://ref.example/api/quickbooks/proxy");
    expect(JSON.parse(String(f.calls[0].init!.body))).toEqual({ action: "query", entity: "companyinfo", query: "SELECT * FROM CompanyInfo" });
    expect((f.calls[0].init!.headers as Record<string, string>)["x-api-key"]).toBe("k-123");
    expect(f.calls.some((x) => x.url === QBO_TOKEN_URL)).toBe(false);
  });

  it("maps a proxy 401 to QboAuthError", async () => {
    const { store } = memoryStore({ mode: "PROXY", proxyUrl: "https://ref.example" });
    const f = fakeFetch(() => json(401, { error: "Unauthorized" }));
    await expect(client(store, f.fn).query("SELECT * FROM Account")).rejects.toBeInstanceOf(QboAuthError);
  });
});

describe("helpers", () => {
  it("redacts tokens from messages", () => {
    const msg = redactSecrets(
      'Authorization: Bearer eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..abc refresh_token=AB11abcdefghijklmnopqrstuv {"access_token":"xyz123"}',
    );
    expect(msg).not.toMatch(/eyJhbGci|AB11abcdef|xyz123/);
    expect(redactSecrets("Purchase 123 failed: amount 45.60")).toBe("Purchase 123 failed: amount 45.60");
  });

  it("computes the refresh-token horizon, estimating 100 days from the last write when unknown", () => {
    expect(refreshTokenHorizon({ refreshTokenExpiresAt: new Date(NOW + 5 * 86_400_000) }, NOW)).toMatchObject({ days: 5, estimated: false });
    expect(refreshTokenHorizon({ refreshTokenUpdatedAt: new Date(NOW - 90 * 86_400_000) }, NOW)).toMatchObject({ days: 10, estimated: true });
    expect(refreshTokenHorizon({}, NOW)).toEqual({ expiresAt: null, days: null, estimated: false });
  });
});

describe("liveness probe", () => {
  it("OK when refresh + CompanyInfo succeed", async () => {
    const { store } = memoryStore();
    let t = NOW;
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk() : json(200, { CompanyInfo: { CompanyName: "Tertiary Infotech" } })));
    const r = await probeQuickBooks(client(store, f.fn), () => (t += 120));
    expect(r).toMatchObject({ status: "OK", mode: "DIRECT", tokenOk: true, apiOk: true, companyName: "Tertiary Infotech", latencyMs: 120 });
    // Expiry recorded at NOW + 100d; the probe's clock has moved on a few ms, so floor → 99.
    expect(r.daysToRefreshExpiry).toBe(99);
    expect(r.refreshTokenExpiresAt).toBe(new Date(NOW + 8_640_000_000).toISOString());
  });

  it("WARN when the refresh token is close to expiry", async () => {
    const { store } = memoryStore();
    const f = fakeFetch((c) => (c.url === QBO_TOKEN_URL ? tokenOk({ x_refresh_token_expires_in: 7 * 86_400 }) : json(200, { CompanyInfo: {} })));
    const r = await probeQuickBooks(client(store, f.fn), () => NOW);
    expect(r.status).toBe("WARN");
    expect(r.daysToRefreshExpiry).toBe(7);
    expect(r.message).toMatch(/expires in 7 day/);
  });

  it("FAIL when the refresh token is rejected", async () => {
    const { store } = memoryStore();
    const f = fakeFetch(() => json(400, { error: "invalid_grant" }));
    const r = await probeQuickBooks(client(store, f.fn), () => NOW);
    expect(r).toMatchObject({ status: "FAIL", tokenOk: false, apiOk: false });
  });

  it("FAIL when not configured", async () => {
    const store: QboCredentialStore = { load: async () => null, saveRefreshToken: async () => {}, saveRefreshTokenExpiry: async () => {} };
    const r = await probeQuickBooks(new QuickBooksClient({ store }), () => NOW);
    expect(r).toMatchObject({ status: "FAIL", mode: "UNCONFIGURED" });
  });
});

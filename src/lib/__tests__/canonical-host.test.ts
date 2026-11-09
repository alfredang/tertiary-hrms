import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { canonicalRedirect } from "../canonical-host";

const AUTH = "https://hrms.tertiaryinfotech.com";
const req = (url: string, host: string, method = "GET") =>
  new NextRequest(url, { method, headers: { host } });

describe("canonicalRedirect", () => {
  it("sends page visits on the alias host to the AUTH_URL host, keeping path and query", () => {
    const r = canonicalRedirect(req("http://0.0.0.0:3000/login?x=1", "hrms.tertiaryinfo.tech"), AUTH);
    expect(r?.status).toBe(308);
    expect(r?.headers.get("location")).toBe("https://hrms.tertiaryinfotech.com/login?x=1");
  });
  it("prefers x-forwarded-host", () => {
    const r = canonicalRedirect(new NextRequest("http://0.0.0.0:3000/dashboard", { headers: { host: "0.0.0.0:3000", "x-forwarded-host": "hrms.tertiaryinfo.tech" } }), AUTH);
    expect(r?.headers.get("location")).toBe("https://hrms.tertiaryinfotech.com/dashboard");
  });
  it("leaves the canonical host, API routes, non-GET, internal hosts and http AUTH_URL alone", () => {
    expect(canonicalRedirect(req("http://x/login", "hrms.tertiaryinfotech.com"), AUTH)).toBeNull();
    expect(canonicalRedirect(req("http://x/api/mobile/summary", "hrms.tertiaryinfo.tech"), AUTH)).toBeNull();
    expect(canonicalRedirect(req("http://x/login", "hrms.tertiaryinfo.tech", "POST"), AUTH)).toBeNull();
    expect(canonicalRedirect(req("http://x/login", "localhost:3080"), AUTH)).toBeNull();
    expect(canonicalRedirect(req("http://x/login", "10.0.1.5"), AUTH)).toBeNull();
    expect(canonicalRedirect(req("http://x/login", "hrms.tertiaryinfo.tech"), "http://localhost:3080")).toBeNull();
    expect(canonicalRedirect(req("http://x/login", "hrms.tertiaryinfo.tech"), "")).toBeNull();
  });
});

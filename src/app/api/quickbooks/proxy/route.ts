import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const QBO_BASE_URL = "https://quickbooks.api.intuit.com";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

interface QBOCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
}

// In-memory access token cache (per process)
let cachedAccessToken: string | null = null;
let cacheExpiry = 0;
let inflightRefresh: Promise<string> | null = null;

async function getQBOCreds(): Promise<QBOCreds | null> {
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

  const { QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REFRESH_TOKEN, QUICKBOOKS_REALM_ID } = map;
  if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET || !QUICKBOOKS_REFRESH_TOKEN || !QUICKBOOKS_REALM_ID) {
    return null;
  }
  return {
    clientId: QUICKBOOKS_CLIENT_ID,
    clientSecret: QUICKBOOKS_CLIENT_SECRET,
    refreshToken: QUICKBOOKS_REFRESH_TOKEN,
    realmId: QUICKBOOKS_REALM_ID,
  };
}

async function getAccessToken(creds: QBOCreds): Promise<string> {
  if (cachedAccessToken && Date.now() < cacheExpiry) return cachedAccessToken;
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    const res = await fetch(QBO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(creds.refreshToken)}`,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`QBO token refresh failed: ${res.status} ${text}`);
    }

    const data = await res.json();

    // Save rotated refresh token back to DB so it never goes stale
    if (data.refresh_token && data.refresh_token !== creds.refreshToken) {
      await prisma.companyCredential.upsert({
        where: { keyName: "QUICKBOOKS_REFRESH_TOKEN" },
        update: { keyValue: data.refresh_token },
        create: { keyName: "QUICKBOOKS_REFRESH_TOKEN", keyValue: data.refresh_token },
      });
    }

    cachedAccessToken = data.access_token;
    cacheExpiry = Date.now() + (data.expires_in ? data.expires_in * 1000 - 60_000 : 3_300_000);
    return cachedAccessToken as string;
  })();

  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

export async function POST(req: NextRequest) {
  // Auth check — only authenticated users can proxy QB calls
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { action, entity, id, query, body: reqBody, sendTo } = await req.json();

  if (!action || !entity) {
    return NextResponse.json({ success: false, error: "action and entity are required" }, { status: 400 });
  }

  const creds = await getQBOCreds();
  if (!creds) {
    return NextResponse.json(
      { success: false, error: "QuickBooks credentials not configured. Go to Settings → Credentials to set them up." },
      { status: 503 }
    );
  }

  try {
    const token = await getAccessToken(creds);
    const base = `${QBO_BASE_URL}/v3/company/${creds.realmId}`;

    let url: string;
    let method = "GET";
    let headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    let body: string | undefined;

    switch (action) {
      case "query": {
        const q = query || `SELECT * FROM ${cap(entity)} MAXRESULTS 100`;
        url = `${base}/query?query=${encodeURIComponent(q)}&minorversion=${MINOR_VERSION}`;
        break;
      }
      case "read": {
        if (!id) return NextResponse.json({ success: false, error: "id required for read" }, { status: 400 });
        url = `${base}/${entity}/${id}?minorversion=${MINOR_VERSION}`;
        break;
      }
      case "create": {
        url = `${base}/${entity}?minorversion=${MINOR_VERSION}`;
        method = "POST";
        body = JSON.stringify(reqBody);
        break;
      }
      case "update": {
        url = `${base}/${entity}?minorversion=${MINOR_VERSION}`;
        method = "POST";
        body = JSON.stringify(reqBody);
        break;
      }
      case "delete": {
        url = `${base}/${entity}?operation=delete&minorversion=${MINOR_VERSION}`;
        method = "POST";
        body = JSON.stringify(reqBody);
        break;
      }
      case "void": {
        url = `${base}/${entity}?operation=void&minorversion=${MINOR_VERSION}`;
        method = "POST";
        body = JSON.stringify(reqBody);
        break;
      }
      case "send": {
        if (!id) return NextResponse.json({ success: false, error: "id required for send" }, { status: 400 });
        const sendQuery = sendTo ? `?sendTo=${encodeURIComponent(sendTo)}&minorversion=${MINOR_VERSION}` : `?minorversion=${MINOR_VERSION}`;
        url = `${base}/${entity}/${id}/send${sendQuery}`;
        method = "POST";
        headers["Content-Type"] = "application/octet-stream";
        body = "";
        break;
      }
      case "pdf": {
        if (!id) return NextResponse.json({ success: false, error: "id required for pdf" }, { status: 400 });
        url = `${base}/${entity}/${id}/pdf?minorversion=${MINOR_VERSION}`;
        headers["Accept"] = "application/pdf";
        const pdfRes = await fetch(url, { method: "GET", headers });
        if (!pdfRes.ok) {
          const errText = await pdfRes.text();
          return NextResponse.json({ success: false, error: `QBO error ${pdfRes.status}`, details: errText }, { status: pdfRes.status });
        }
        const pdfBuf = await pdfRes.arrayBuffer();
        return new NextResponse(pdfBuf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${entity}-${id}.pdf"`,
          },
        });
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    const apiRes = await fetch(url, { method, headers, body: method === "POST" ? body : undefined });
    const data = await apiRes.json().catch(() => null);

    if (!apiRes.ok) {
      return NextResponse.json(
        { success: false, error: data?.Fault?.Error?.[0]?.Message || `QBO error ${apiRes.status}`, details: data },
        { status: apiRes.status }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

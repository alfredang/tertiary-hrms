import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, params: Promise<{ token: string }>) {
  const { token } = await params;
  const webhook = await prisma.webhook.findUnique({ where: { endpointToken: token } });

  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }
  if (!webhook.enabled) {
    return NextResponse.json({ error: "Webhook disabled" }, { status: 403 });
  }
  if (req.method !== webhook.httpMethod) {
    return NextResponse.json(
      { error: `Method not allowed; this webhook accepts ${webhook.httpMethod}` },
      { status: 405 },
    );
  }

  // Capture request context for logging
  const url = new URL(req.url);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (queryParams[k] = v));

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  let body: unknown = null;
  try {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  } catch {
    body = null;
  }

  const sourceIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  // Auth check
  if (webhook.authToken) {
    const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== webhook.authToken) {
      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          httpMethod: req.method,
          headers,
          queryParams,
          body: body as never,
          sourceIp,
          statusCode: 401,
          errorMessage: "Invalid or missing Bearer token",
        },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await prisma.webhookLog.create({
    data: {
      webhookId: webhook.id,
      httpMethod: req.method,
      headers,
      queryParams,
      body: body as never,
      sourceIp,
      statusCode: 200,
      responseBody: { success: true, webhook: webhook.name } as never,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Webhook received",
    webhook: webhook.name,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, params);
}

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { defaultReportMonthKey, parseReportMonth, renderSummaryMarkdown } from "@/lib/leave-summary";
import { buildLeaveSummary } from "@/lib/leave-summary-report";

export const dynamic = "force-dynamic";

// GET /api/agent/leave-summary?month=YYYY-MM[&format=json|markdown]
//
// Monthly leave + MC summary of every active staff member and intern, for an
// external AI agent to pull on a schedule. Read-only.
// Header: Authorization: Bearer <AGENT_API_KEY>  (CompanyCredential, set in
// Settings → Credentials → AI Agent API Key)
// `month` defaults to the previous month in SGT.

function authorized(req: NextRequest, key: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${key}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(req: NextRequest) {
  const credential = await prisma.companyCredential.findUnique({ where: { keyName: "AGENT_API_KEY" } });
  const apiKey = credential?.keyValue.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AGENT_API_KEY not configured in Settings → Credentials" }, { status: 500 });
  }
  if (!authorized(req, apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const month = parseReportMonth(params.get("month") ?? defaultReportMonthKey());
  if (!month) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "markdown") {
    return NextResponse.json({ error: "format must be json or markdown" }, { status: 400 });
  }

  const summary = await buildLeaveSummary(month);

  if (format === "markdown") {
    const markdown = renderSummaryMarkdown({ ...summary, companyName: summary.company });
    return new NextResponse(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  }
  return NextResponse.json(summary);
}

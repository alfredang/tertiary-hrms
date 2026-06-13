import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { parseDbsStatement } from "@/lib/parse-dbs-statement";
import { parseExcelStatement } from "@/lib/parse-excel-statement";
import {
  parseStatementWithClaude,
  enrichTransactionsWithAgent,
} from "@/lib/claude-parse-statement";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive } from "@/lib/google-drive";

async function archiveStatement(buffer: Buffer, originalName: string): Promise<void> {
  try {
    const dir = path.join(process.cwd(), ".bank_statements");
    await fs.mkdir(dir, { recursive: true });
    const safeName = originalName.replace(/[^\w.\-]+/g, "_");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(dir, `${stamp}__${safeName}`), buffer);
  } catch (err) {
    console.error("Failed to archive bank statement locally:", err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAuthorized(): Promise<boolean> {
  if (isDevAuthSkipped()) return true;
  const session = await auth();
  if (!session?.user) return false;
  const role = (session.user as any).role as string | undefined;
  const roles = ((session.user as any).roles as string[] | undefined) ?? [];
  return hasAdminAccess(role) || roles.includes("ACCOUNTANT");
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  // Archive locally (non-blocking).
  await archiveStatement(buffer, file.name);

  // Upload to Google Drive — run in parallel with parse, capture result for response.
  const driveUploadPromise = uploadFileToDrive(buffer, file.name).catch((err: any) => {
    console.error("Google Drive upload failed:", err);
    return { error: err?.message ?? String(err) };
  });
  // XLSX magic: ZIP "PK\x03\x04". Old .xls (CFB/OLE2) magic: D0 CF 11 E0 A1 B1 1A E1.
  const isXlsxMagic =
    buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  const isXlsMagic =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1;
  const isExcel =
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    isXlsxMagic ||
    isXlsMagic;

  try {
    if (isExcel) {
      // 1. Deterministic local parse — instant, exact numeric/date fidelity.
      const rows = await parseExcelStatement(buffer);
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "No transactions found in the workbook." },
          { status: 400 },
        );
      }
      const credits = rows.filter((t) => t.direction === "CREDIT").length;
      const debits = rows.length - credits;
      const driveResult = await driveUploadPromise;
      const driveWarning = "error" in driveResult ? driveResult.error : undefined;
      return NextResponse.json({
        transactions: rows,
        count: rows.length,
        credits,
        debits,
        engine: "xls-rules",
        driveFileId: "fileId" in driveResult ? driveResult.fileId : undefined,
        driveWebViewLink: "webViewLink" in driveResult ? driveResult.webViewLink : undefined,
        driveWarning,
      });
    }
    return NextResponse.json(
      {
        error:
          "Unsupported file. Upload an Excel statement (.xlsx or .xls) exported from DBS.",
      },
      { status: 400 },
    );
  } catch (err) {
    console.error("Statement parse failed", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to read statement: ${msg}` }, { status: 400 });
  }
}

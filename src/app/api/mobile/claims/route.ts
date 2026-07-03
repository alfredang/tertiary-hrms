import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getMobileContext, unauthorized, num, iso } from "@/lib/mobile-api";
import { getOrCreateEmployeeSubfolderId, getDriveClient } from "@/lib/drive";
import { sendExpenseApprovalEmail } from "@/lib/approval-email";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/claims — single-shot claim submission from the native app:
 * multipart form with the receipt photo + claim fields. Stores the receipt in
 * the same local uploads volume the web app uses, creates the ExpenseClaim,
 * then (in the background) mirrors the photo to the employee's own Google
 * Drive folder — "Expense Claims" or "Medical Claims" depending on the type.
 *
 * Fields: claimType (EXPENSE|MEDICAL), categoryId (optional for MEDICAL),
 *         description, amount, expenseDate (YYYY-MM-DD), receipt (file).
 */

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const MAGIC = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  gif: Buffer.from([0x47, 0x49, 0x46, 0x38]),
  riff: Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 4).equals(MAGIC.pdf)) return "application/pdf";
  if (buffer.subarray(0, 3).equals(MAGIC.jpeg)) return "image/jpeg";
  if (buffer.subarray(0, 4).equals(MAGIC.png)) return "image/png";
  if (buffer.subarray(0, 4).equals(MAGIC.gif)) return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).equals(MAGIC.riff) &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

const MEDICAL_CATEGORY = { code: "MEDICAL", name: "Medical Claim" };

async function resolveCategory(claimType: string, categoryId: string | null) {
  if (categoryId) {
    return prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  }
  if (claimType !== "MEDICAL") return null;
  return prisma.expenseCategory.upsert({
    where: { code: MEDICAL_CATEGORY.code },
    update: {},
    create: {
      code: MEDICAL_CATEGORY.code,
      name: MEDICAL_CATEGORY.name,
      description: "Medical expenses claimed via the mobile app",
      requiresReceipt: true,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileContext();
    if (!ctx) return unauthorized();
    if (!ctx.employeeId) {
      return NextResponse.json({ error: "No employee record found for this user" }, { status: 400 });
    }
    const employeeId = ctx.employeeId;

    const form = await req.formData();
    const claimType = String(form.get("claimType") || "EXPENSE").toUpperCase();
    const categoryId = form.get("categoryId") ? String(form.get("categoryId")) : null;
    const description = String(form.get("description") || "").trim();
    const amount = Number(form.get("amount"));
    const expenseDate = String(form.get("expenseDate") || "");
    const receipt = form.get("receipt") as File | null;

    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return NextResponse.json({ error: "Expense date is required (YYYY-MM-DD)" }, { status: 400 });
    }
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (new Date(expenseDate) > todayEnd) {
      return NextResponse.json({ error: "Expense date cannot be in the future" }, { status: 400 });
    }

    const category = await resolveCategory(claimType, categoryId);
    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }
    if (category.maxAmount && amount > Number(category.maxAmount)) {
      return NextResponse.json(
        { error: `Amount exceeds category limit of $${Number(category.maxAmount).toFixed(2)}` },
        { status: 400 },
      );
    }

    // Receipt photo — validated by magic bytes, stored in the shared uploads volume.
    let receiptUrl: string | null = null;
    let receiptFileName: string | null = null;
    if (receipt && receipt.size > 0) {
      if (receipt.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "Receipt must be less than 10MB" }, { status: 400 });
      }
      const buffer = Buffer.from(await receipt.arrayBuffer());
      const detectedMime = detectMimeFromBuffer(buffer);
      if (!detectedMime) {
        return NextResponse.json(
          { error: "Receipt must be a JPEG, PNG, GIF, WebP image or a PDF" },
          { status: 400 },
        );
      }
      const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
      await mkdir(uploadsDir, { recursive: true });
      const ext = MIME_TO_EXT[detectedMime] || ".bin";
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      await writeFile(path.join(uploadsDir, uniqueName), buffer);
      receiptUrl = `/api/uploads/${uniqueName}`;
      receiptFileName = receipt.name || `receipt${ext}`;
    } else if (category.requiresReceipt) {
      return NextResponse.json({ error: "A receipt photo is required for this claim" }, { status: 400 });
    }

    const claim = await prisma.expenseClaim.create({
      data: {
        id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        employeeId,
        categoryId: category.id,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        receiptUrl,
        receiptFileName,
        status: "PENDING",
      },
      include: { category: true, employee: { select: { name: true } } },
    });

    // Respond immediately — Drive mirror and approval email run in the background.
    const driveSubfolder = claimType === "MEDICAL" ? "Medical Claims" : "Expense Claims";
    if (receiptUrl) {
      mirrorReceiptToDrive({
        employeeId, receiptUrl, receiptFileName, subfolder: driveSubfolder,
        expenseId: claim.id, expenseDate,
      })
        .then(async (driveResult) => {
          if (driveResult) {
            await prisma.expenseClaim.update({
              where: { id: claim.id },
              data: { driveFileId: driveResult.id, driveWebViewLink: driveResult.webViewLink ?? undefined },
            });
          }
        })
        .catch((err) => console.error(`Drive mirror failed for mobile claim ${claim.id}:`, err));
    }

    sendExpenseApprovalEmail({
      expenseClaimId: claim.id,
      employeeId: claim.employeeId,
      employeeName: claim.employee.name,
      category: claim.category.name,
      amount: Number(claim.amount).toFixed(2),
      expenseDate: claim.expenseDate.toISOString().slice(0, 10),
      description: claim.description,
      receiptUrl: claim.receiptUrl,
      receiptFileName: claim.receiptFileName,
    }).catch((err) => console.error(`Failed to send approval email for mobile claim ${claim.id}:`, err));

    return NextResponse.json(
      {
        id: claim.id,
        description: claim.description,
        amount: num(claim.amount),
        currency: claim.currency,
        category: claim.category.name,
        categoryCode: claim.category.code,
        expenseDate: iso(claim.expenseDate),
        status: claim.status,
        receiptUrl: claim.receiptUrl,
        createdAt: iso(claim.createdAt),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating mobile claim:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function mirrorReceiptToDrive(args: {
  employeeId: string;
  receiptUrl: string;
  receiptFileName: string | null;
  subfolder: string;
  expenseId: string;
  expenseDate: string;
}): Promise<{ id: string; webViewLink: string | null } | null> {
  const localPrefix = "/api/uploads/";
  if (!args.receiptUrl.startsWith(localPrefix)) return null;
  const uniqueName = args.receiptUrl.slice(localPrefix.length);
  const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const buffer = await readFile(path.join(uploadsDir, uniqueName));
  const ext = path.extname(uniqueName).toLowerCase();
  const mime = Object.entries(MIME_TO_EXT).find(([, e]) => e === ext)?.[0] || "application/octet-stream";

  const folderId = await getOrCreateEmployeeSubfolderId(args.employeeId, args.subfolder);
  if (!folderId) return null;

  const driveName = `${args.expenseDate.slice(0, 10)}_${args.expenseId}${args.receiptFileName ? `_${args.receiptFileName}` : ext}`;
  const drive = await getDriveClient();
  const created = await drive.files.create({
    requestBody: { name: driveName, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!created.data.id) return null;
  return { id: created.data.id, webViewLink: created.data.webViewLink ?? null };
}

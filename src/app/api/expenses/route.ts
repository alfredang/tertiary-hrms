import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as z from "zod";
import path from "path";
import { readFile } from "fs/promises";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { getEmployeeSubfolderId, getDriveClient } from "@/lib/drive";
import { Readable } from "stream";
import { sendExpenseApprovalEmail } from "@/lib/approval-email";

const expenseSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  expenseDate: z.string().min(1, "Expense date is required"),
  receiptUrl: z.string().optional(),
  receiptFileName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    let employeeId: string | undefined;

    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      employeeId = session.user.employeeId;
    } else {
      const adminUser = await prisma.user.findUnique({
        where: { email: "admin@tertiaryinfotech.com" },
        include: { employee: true },
      });
      employeeId = adminUser?.employee?.id;
    }

    if (!employeeId) {
      return NextResponse.json(
        { error: "No employee record found for this user" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validation = expenseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { categoryId, description, amount, expenseDate, receiptUrl, receiptFileName } =
      validation.data;

    // Reject future dates
    const expenseDateObj = new Date(expenseDate);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (expenseDateObj > todayEnd) {
      return NextResponse.json(
        { error: "Expense date cannot be in the future" },
        { status: 400 }
      );
    }

    // Check category maxAmount
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    });

    if (category?.maxAmount && amount > Number(category.maxAmount)) {
      return NextResponse.json(
        {
          error: `Amount exceeds category limit of $${Number(category.maxAmount).toFixed(2)}`,
          maxAmount: Number(category.maxAmount),
        },
        { status: 400 }
      );
    }

    const expenseClaim = await prisma.expenseClaim.create({
      data: {
        id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        employeeId,
        categoryId,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        receiptUrl: receiptUrl || null,
        receiptFileName: receiptFileName || null,
        status: "PENDING",
      },
      include: {
        category: true,
        employee: {
          select: { name: true },
        },
      },
    });

    // Respond immediately — Drive mirror and approval email run in the background
    const claimId = expenseClaim.id;

    if (receiptUrl) {
      mirrorReceiptToDrive({ employeeId, receiptUrl, receiptFileName, expenseId: claimId, expenseDate })
        .then(async (driveResult) => {
          if (driveResult) {
            await prisma.expenseClaim.update({
              where: { id: claimId },
              data: { driveFileId: driveResult.id, driveWebViewLink: driveResult.webViewLink ?? undefined },
            });
          }
        })
        .catch((err) => console.error(`Drive mirror failed for expense ${claimId}:`, err));
    }

    sendExpenseApprovalEmail({
      expenseClaimId: claimId,
      employeeId: expenseClaim.employeeId,
      employeeName: expenseClaim.employee.name,
      category: expenseClaim.category.name,
      amount: Number(expenseClaim.amount).toFixed(2),
      expenseDate: expenseClaim.expenseDate.toISOString().slice(0, 10),
      description: expenseClaim.description,
      receiptUrl: expenseClaim.receiptUrl ?? receiptUrl ?? null,
      receiptFileName: expenseClaim.receiptFileName ?? receiptFileName ?? null,
    }).catch((err) => console.error(`Failed to send expense approval email for ${claimId}:`, err));

    return NextResponse.json(expenseClaim, { status: 201 });
  } catch (error) {
    console.error("Error creating expense claim:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function mirrorReceiptToDrive(args: {
  employeeId: string;
  receiptUrl: string;
  receiptFileName?: string;
  expenseId: string;
  expenseDate: string;
}): Promise<{ id: string; webViewLink: string | null } | null> {
  const localPrefix = "/api/uploads/";
  if (!args.receiptUrl.startsWith(localPrefix)) return null;
  const uniqueName = args.receiptUrl.slice(localPrefix.length);
  const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const filePath = path.join(uploadsDir, uniqueName);
  const buffer = await readFile(filePath);
  const ext = path.extname(uniqueName).toLowerCase();
  const mime = EXTENSION_TO_MIME[ext] || "application/octet-stream";

  const folderId = await getEmployeeSubfolderId(args.employeeId, "Expense Claims");
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

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const ALLOWED_MIMES = new Set(Object.keys(MIME_TO_EXT));

// PDF magic bytes: %PDF (hex 25 50 44 46)
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

async function detectMimeFromBuffer(buffer: Buffer): Promise<string | null> {
  // Use file-type for binary detection (ESM dynamic import)
  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(buffer);
  if (detected && ALLOWED_MIMES.has(detected.mime)) {
    return detected.mime;
  }

  // Fallback: check PDF magic bytes manually (file-type may miss PDFs with BOM)
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    return "application/pdf";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!isDevAuthSkipped()) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    // First-pass: reject obviously wrong MIME types (fast, client-supplied)
    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: "Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Second-pass: validate actual file content via magic bytes
    const detectedMime = await detectMimeFromBuffer(buffer);
    if (!detectedMime) {
      return NextResponse.json(
        { error: "File content does not match an allowed type" },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Use detected MIME (not client-supplied) for extension
    const ext = MIME_TO_EXT[detectedMime] || ".bin";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    await writeFile(filePath, buffer);

    return NextResponse.json({
      url: `/uploads/${uniqueName}`,
      fileName: file.name,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

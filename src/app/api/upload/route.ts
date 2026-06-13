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

const MAGIC = {
  pdf:  Buffer.from([0x25, 0x50, 0x44, 0x46]),       // %PDF
  jpeg: Buffer.from([0xff, 0xd8, 0xff]),              // JPEG SOI
  png:  Buffer.from([0x89, 0x50, 0x4e, 0x47]),        // \x89PNG
  gif:  Buffer.from([0x47, 0x49, 0x46, 0x38]),        // GIF8
  riff: Buffer.from([0x52, 0x49, 0x46, 0x46]),        // RIFF (WebP container)
};

function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 4).equals(MAGIC.pdf))  return "application/pdf";
  if (buffer.subarray(0, 3).equals(MAGIC.jpeg)) return "image/jpeg";
  if (buffer.subarray(0, 4).equals(MAGIC.png))  return "image/png";
  if (buffer.subarray(0, 4).equals(MAGIC.gif))  return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).equals(MAGIC.riff) &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
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
    const detectedMime = detectMimeFromBuffer(buffer);
    if (!detectedMime) {
      return NextResponse.json(
        { error: "File content does not match an allowed type" },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist (outside public/ for standalone mode)
    const uploadsDir =
      process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Use detected MIME (not client-supplied) for extension
    const ext = MIME_TO_EXT[detectedMime] || ".bin";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    await writeFile(filePath, buffer);

    return NextResponse.json({
      url: `/api/uploads/${uniqueName}`,
      fileName: file.name,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    console.error("[upload] Error:", msg, "| uploadsDir:", uploadsDir, "| cwd:", process.cwd());
    return NextResponse.json(
      { error: `Upload failed: ${msg}` },
      { status: 500 }
    );
  }
}

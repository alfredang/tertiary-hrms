import { NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    const fileName = segments.join("/");

    // Block path traversal — normalize separators for cross-platform safety
    const normalized = fileName.replace(/\\/g, "/");
    if (normalized.includes("..") || normalized !== fileName) {
      return new Response("Invalid path", { status: 400 });
    }

    const filePath = path.join(UPLOAD_DIR, fileName);

    // Ensure resolved path is still within UPLOAD_DIR (defense in depth)
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedUploadDir + path.sep) && resolvedFile !== resolvedUploadDir) {
      return new Response("Invalid path", { status: 400 });
    }

    // Check file exists
    try {
      await stat(filePath);
    } catch {
      return new Response("File not found", { status: 404 });
    }

    const buffer = await readFile(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const contentType = EXT_TO_MIME[ext] || "application/octet-stream";

    // Escape filename for Content-Disposition header (RFC 5987)
    const safeName = path.basename(fileName).replace(/"/g, '\\"');

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error serving upload:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

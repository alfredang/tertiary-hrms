/**
 * UploadThing File Router — Infrastructure is ready, forms need migration.
 *
 * SETUP:
 * 1. Get UPLOADTHING_TOKEN from https://uploadthing.com/dashboard → API Keys → v7 tab
 * 2. Add to .env.local:  UPLOADTHING_TOKEN=your-token-here
 * 3. Add same token in Coolify dashboard → Environment Variables
 *
 * MIGRATION (4 forms still use the old /api/upload local-disk route):
 * Each form has a block like:
 *   const formData = new FormData();
 *   formData.append("file", documentFile);
 *   const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
 *
 * Replace with:
 *   import { useUploadThing } from "@/lib/uploadthing";
 *   const { startUpload } = useUploadThing("documentUploader"); // or "receiptUploader"
 *   const result = await startUpload([documentFile]);
 *   documentUrl = result?.[0]?.serverData.url;
 *   documentFileName = result?.[0]?.serverData.fileName;
 *
 * Forms to migrate:
 *   - src/components/leave/leave-request-form.tsx    (endpoint: "documentUploader")
 *   - src/components/leave/leave-edit-form.tsx        (endpoint: "documentUploader")
 *   - src/components/expenses/expense-submit-form.tsx (endpoint: "receiptUploader")
 *   - src/components/expenses/expense-edit-form.tsx   (endpoint: "receiptUploader")
 *
 * After all 4 forms are migrated, delete src/app/api/upload/route.ts (old local-disk upload).
 *
 * Related files:
 *   - src/app/api/uploadthing/route.ts  — API route handler (GET + POST)
 *   - src/lib/uploadthing.ts            — typed useUploadThing hook
 *   - src/middleware.ts                  — /api/uploadthing in publicRoutes
 */
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth } from "@/lib/auth";
import { isDevAuthSkipped } from "@/lib/dev-auth";

const f = createUploadthing();

export const ourFileRouter = {
  // Leave MC documents (medical certificates, supporting evidence)
  documentUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    pdf: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      if (isDevAuthSkipped()) {
        return { userId: "dev-user" };
      }
      const session = await auth();
      if (!session?.user) throw new Error("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, fileName: file.name };
    }),

  // Expense receipts
  receiptUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    pdf: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      if (isDevAuthSkipped()) {
        return { userId: "dev-user" };
      }
      const session = await auth();
      if (!session?.user) throw new Error("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, fileName: file.name };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

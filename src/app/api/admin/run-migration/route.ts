import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { auth } from "@/lib/auth";

export async function POST() {
  // Admin-only guard
  if (!isDevAuthSkipped()) {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "OtpCode" (
        "id"        TEXT        NOT NULL,
        "email"     TEXT        NOT NULL,
        "code"      TEXT        NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "used"      BOOLEAN     NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
      )
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "OtpCode_email_idx" ON "OtpCode"("email")
    `;

    return NextResponse.json({ success: true, message: "OtpCode table created (or already existed)." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

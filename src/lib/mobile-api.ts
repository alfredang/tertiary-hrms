import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDevAuthSkipped } from "@/lib/dev-auth";
import { hasAdminAccess } from "@/lib/utils";
import { Prisma } from "@prisma/client";

/**
 * Shared helpers for the read-only mobile JSON API (`/api/mobile/*`).
 *
 * These endpoints exist purely to feed the native iOS app — the web app renders
 * its data via server components and is unaffected. Everything here is additive
 * and authenticated with the same NextAuth session the web app issues.
 */

export interface MobileContext {
  role: string;
  employeeId: string | undefined;
  userId: string | undefined;
  email: string | undefined;
  isAdmin: boolean;
}

/** Resolve the signed-in employee, mirroring the dev-auth fallback the pages use. */
export async function getMobileContext(): Promise<MobileContext | null> {
  if (isDevAuthSkipped()) {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@tertiaryinfotech.com" },
      include: { employee: { select: { id: true } } },
    });
    return {
      role: "ADMIN",
      employeeId: adminUser?.employee?.id,
      userId: adminUser?.id,
      email: adminUser?.email,
      isAdmin: true,
    };
  }

  const session = await auth();
  if (!session?.user) return null;
  return {
    role: session.user.role,
    employeeId: session.user.employeeId,
    userId: session.user.id,
    email: session.user.email,
    isAdmin: hasAdminAccess(session.user.role),
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Coerce a Prisma Decimal (or null) to a JS number for clean typed decoding on iOS. */
export function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** ISO string or null. */
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

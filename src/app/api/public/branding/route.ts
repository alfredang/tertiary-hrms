import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await prisma.companySettings.findUnique({
      where: { id: "company_settings" },
      select: { name: true, shortName: true, logo: true },
    });

    return NextResponse.json({
      name: settings?.name || "",
      shortName: settings?.shortName || null,
      logo: settings?.logo || null,
    });
  } catch {
    return NextResponse.json({ name: "", shortName: null, logo: null });
  }
}

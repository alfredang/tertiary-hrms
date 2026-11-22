import { NextResponse } from "next/server";
import { getMobileContext, unauthorized } from "@/lib/mobile-api";
import { getSops } from "@/lib/sops";

export const dynamic = "force-dynamic";

// GET /api/mobile/sops — every signed-in employee (the web /sop is open to all roles).
// The full Standard Operating Procedures, in the web order, so the apps show them natively instead
// of opening /sop in a browser that is not signed in (22 Nov 2026).
export async function GET() {
  const ctx = await getMobileContext();
  if (!ctx) return unauthorized();
  const { sops } = await getSops();
  return NextResponse.json({ sops });
}

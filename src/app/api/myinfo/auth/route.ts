import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { buildAuthUrl } from "@/lib/myinfo";

// Initiated when the employee clicks "Connect via Singpass" on the authorize page.
// Verifies their invite token then redirects to MyInfo.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/myinfo/error?reason=missing_token", req.nextUrl));
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    await jwtVerify(token, secret); // validates expiry + signature

    const { url } = await buildAuthUrl(token); // embed the whole invite token as employeeId reference
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/myinfo/error?reason=expired_link", req.nextUrl));
  }
}
